use anyhow::{anyhow, Result};
use base64::Engine;
use regex::Regex;
use serde_json::Value;
use std::path::Path;
use tokio::process::Command;

use crate::models::{TrackInfo, TrackSource};

pub fn find_binary(name: &str) -> Option<String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = [
        format!("/opt/homebrew/bin/{}", name),
        format!("/usr/local/bin/{}", name),
        format!("/opt/anaconda3/bin/{}", name),
        format!("{}/.local/bin/{}", home, name),
        format!("{}/.cargo/bin/{}", home, name),
        format!("/usr/bin/{}", name),
        format!("/bin/{}", name),
    ];
    for p in &candidates {
        if Path::new(p).exists() {
            return Some(p.clone());
        }
    }
    if let Ok(path_var) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_var) {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(candidate.to_string_lossy().to_string());
            }
        }
    }
    None
}

/// Resolves or instantiates cookies for yt-dlp.
/// Checks YOUTUBE_COOKIES_FILE, cookies.txt, or populates cookies.txt from environment variables
/// (e.g. YOUTUBE_COOKIES or COOKIES_CONTENT or COOKIES_BASE64).
pub async fn resolve_cookies_file() -> Option<String> {
    // 1. Explicit file path from env
    if let Ok(path) = std::env::var("YOUTUBE_COOKIES_FILE") {
        if Path::new(&path).exists() {
            return Some(path);
        }
    }

    // 2. Existing cookies.txt file on disk
    if Path::new("cookies.txt").exists() {
        return Some("cookies.txt".to_string());
    }

    // 3. Raw cookies content or base64 from environment variables (e.g. Railway, Render, Docker)
    let env_cookies = std::env::var("YOUTUBE_COOKIES")
        .or_else(|_| std::env::var("COOKIES_CONTENT"))
        .or_else(|_| std::env::var("COOKIES_TXT"))
        .or_else(|_| std::env::var("COOKIES_BASE64"))
        .ok();

    if let Some(content) = env_cookies {
        let trimmed = content.trim();
        if !trimmed.is_empty() {
            let target_path = "cookies.txt";
            let decoded_content = if trimmed.starts_with("# Netscape")
                || trimmed.contains('\t')
                || trimmed.contains("\\n")
            {
                trimmed.replace("\\n", "\n")
            } else if let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(trimmed) {
                String::from_utf8(decoded).unwrap_or_else(|_| trimmed.replace("\\n", "\n"))
            } else {
                trimmed.replace("\\n", "\n")
            };

            if let Err(e) = tokio::fs::write(target_path, decoded_content).await {
                tracing::warn!("Failed to write cookies from env to {}: {}", target_path, e);
            } else {
                tracing::info!("Populated cookies.txt from environment variable successfully.");
                return Some(target_path.to_string());
            }
        }
    }

    None
}

/// Resolves custom proxy configuration if set.
pub fn resolve_proxy() -> Option<String> {
    std::env::var("YTDLP_PROXY")
        .or_else(|_| std::env::var("YOUTUBE_PROXY"))
        .or_else(|_| std::env::var("HTTPS_PROXY"))
        .or_else(|_| std::env::var("HTTP_PROXY"))
        .or_else(|_| std::env::var("ALL_PROXY"))
        .ok()
        .filter(|p| !p.trim().is_empty())
}

/// Helper to configure common yt-dlp arguments across single track and playlist extraction.
fn apply_common_args(cmd: &mut Command, cookies_path: Option<&str>) {
    // Optional proxy support (e.g. residential proxy to bypass datacenter IP bans)
    if let Some(proxy) = resolve_proxy() {
        tracing::info!("Using proxy for yt-dlp: {}", proxy);
        cmd.arg("--proxy").arg(proxy);
    }

    // JavaScript runtime for YouTube BotGuard / PO token deciphering
    if let Some(node_bin) = find_binary("node") {
        cmd.arg("--js-runtimes").arg(format!("node:{}", node_bin));
    }

    // Cookies support
    if let Some(cookies) = cookies_path {
        tracing::info!("Using cookies for yt-dlp: {}", cookies);
        cmd.arg("--cookies").arg(cookies);
    }

    // Extractor arguments & player clients
    if let Ok(custom_args) = std::env::var("YTDLP_EXTRACTOR_ARGS") {
        cmd.arg("--extractor-args").arg(custom_args);
    } else if let Ok(client) = std::env::var("YTDLP_PLAYER_CLIENT") {
        cmd.arg("--extractor-args").arg(format!("youtube:player_client={}", client));
    }

    cmd.arg("--geo-bypass");
}

/// Formats yt-dlp error output into actionable messages.
fn format_ytdlp_error(stderr: &str) -> anyhow::Error {
    tracing::error!("yt-dlp failed: {}", stderr);

    if stderr.contains("Sign in to confirm you're not a bot") {
        return anyhow!(
            "YouTube blocked cloud server IP: 'Sign in to confirm you're not a bot'. \
            To fix this on Railway: export your YouTube cookies into a cookies.txt file using a browser extension (like 'Get cookies.txt LOCALLY'), then add a 'YOUTUBE_COOKIES' environment variable in your Railway dashboard with the file contents."
        );
    }

    if stderr.contains("Requested format is not available") {
        return anyhow!(
            "Requested audio format not available from YouTube. To resolve, ensure YOUTUBE_COOKIES is configured in Railway Variables or leave player client to default."
        );
    }

    let first_error_line = stderr
        .lines()
        .find(|line| line.contains("ERROR:"))
        .unwrap_or("Failed to process YouTube audio.");

    anyhow!("{}", first_error_line)
}

pub fn extract_video_id(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if trimmed.len() == 11 && trimmed.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Some(trimmed.to_string());
    }
    let re = Regex::new(r"(?:v=|\/|be\/|shorts\/)([a-zA-Z0-9_-]{11})").ok()?;
    re.captures(trimmed).and_then(|cap| cap.get(1).map(|m| m.as_str().to_string()))
}

pub async fn extract_youtube_audio(
    room_id: &str,
    url: &str,
    upload_dir: &str,
) -> Result<TrackInfo> {
    let ytdlp = find_binary("yt-dlp").ok_or_else(|| {
        anyhow!("'yt-dlp' executable was not found. Please ensure yt-dlp is installed on the host system.")
    })?;
    let ffmpeg = find_binary("ffmpeg").ok_or_else(|| {
        anyhow!("'ffmpeg' executable was not found. Please ensure ffmpeg is installed on the host system.")
    })?;

    let room_audio_dir = Path::new(upload_dir).join(room_id);
    tokio::fs::create_dir_all(&room_audio_dir).await?;

    let parsed_id = extract_video_id(url);
    if let Some(ref vid_id) = parsed_id {
        let cached_file = room_audio_dir.join(format!("{}.mp3", vid_id));
        if cached_file.exists() {
            tracing::info!("Track {} already exists in cache. Reusing file.", vid_id);
            return Ok(TrackInfo {
                id: vid_id.clone(),
                title: format!("YouTube Track ({})", vid_id),
                source: TrackSource::YouTube,
                stream_url: format!("/media/{}/{}.mp3", room_id, vid_id),
                duration_seconds: None,
            });
        }
    }

    let target_url = if let Some(ref vid_id) = parsed_id {
        if !url.starts_with("http://") && !url.starts_with("https://") {
            format!("https://www.youtube.com/watch?v={}", vid_id)
        } else {
            url.to_string()
        }
    } else {
        url.to_string()
    };

    let output_template = format!("{}/%(id)s.%(ext)s", room_audio_dir.display());
    let cookies_file = resolve_cookies_file().await;

    tracing::info!("Executing one-pass yt-dlp audio extraction for: {}", target_url);
    let mut cmd = Command::new(&ytdlp);
    cmd.arg("--ffmpeg-location").arg(&ffmpeg);
    apply_common_args(&mut cmd, cookies_file.as_deref());
    cmd.arg("--no-playlist");
    cmd.arg("-f").arg("ba/b");
    cmd.arg("--print-json");
    cmd.arg("-x");
    cmd.arg("--audio-format").arg("mp3");
    cmd.arg("--audio-quality").arg("0");
    cmd.arg("-o").arg(&output_template);
    cmd.arg(&target_url);

    let output = cmd.output().await.map_err(|e| {
        anyhow!("Failed to start yt-dlp ('{}'): {}", ytdlp, e)
    })?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format_ytdlp_error(&err_msg));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let meta_json: Value = stdout_str
        .lines()
        .find_map(|line| serde_json::from_str::<Value>(line).ok())
        .ok_or_else(|| anyhow!("Failed to parse metadata from yt-dlp output"))?;

    let video_id = meta_json["id"]
        .as_str()
        .or(parsed_id.as_deref())
        .ok_or_else(|| anyhow!("Missing video id in metadata"))?;

    let title = meta_json["title"]
        .as_str()
        .unwrap_or("YouTube Audio")
        .to_string();

    let duration = meta_json["duration"].as_f64();
    let output_file_name = format!("{}.mp3", video_id);

    Ok(TrackInfo {
        id: video_id.to_string(),
        title,
        source: TrackSource::YouTube,
        stream_url: format!("/media/{}/{}", room_id, output_file_name),
        duration_seconds: duration,
    })
}

pub async fn extract_youtube_playlist_info(
    url: &str,
    room_id: &str,
) -> Result<(String, Vec<TrackInfo>)> {
    let ytdlp = find_binary("yt-dlp").ok_or_else(|| {
        anyhow!("'yt-dlp' executable was not found. Please ensure yt-dlp is installed on the host system.")
    })?;

    let cookies_file = resolve_cookies_file().await;

    let mut cmd = Command::new(&ytdlp);
    cmd.arg("--flat-playlist");
    cmd.arg("--dump-single-json");
    cmd.arg("--yes-playlist");
    cmd.arg("--playlist-end").arg("50");
    apply_common_args(&mut cmd, cookies_file.as_deref());
    cmd.arg(url);

    let output = cmd.output().await.map_err(|e| {
        anyhow!("Failed to start yt-dlp ('{}'): {}", ytdlp, e)
    })?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format_ytdlp_error(&err_msg));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let meta_json: Value = serde_json::from_str(&stdout_str)
        .map_err(|e| anyhow!("Failed to parse playlist JSON from yt-dlp: {}", e))?;

    let playlist_title = meta_json["title"]
        .as_str()
        .unwrap_or("YouTube Playlist")
        .to_string();

    let mut tracks = Vec::new();

    if let Some(entries) = meta_json["entries"].as_array() {
        for entry in entries {
            if let Some(id) = entry["id"].as_str() {
                let title = entry["title"]
                    .as_str()
                    .unwrap_or("Unknown Track")
                    .to_string();
                if title == "[Private video]" || title == "[Deleted video]" {
                    continue;
                }
                let duration = entry["duration"].as_f64();
                tracks.push(TrackInfo {
                    id: id.to_string(),
                    title,
                    source: TrackSource::YouTube,
                    stream_url: format!("/media/{}/{}.mp3", room_id, id),
                    duration_seconds: duration,
                });
            }
        }
    } else if let Some(id) = meta_json["id"].as_str() {
        // Single video fallback
        let title = meta_json["title"]
            .as_str()
            .unwrap_or("YouTube Audio")
            .to_string();
        let duration = meta_json["duration"].as_f64();
        tracks.push(TrackInfo {
            id: id.to_string(),
            title,
            source: TrackSource::YouTube,
            stream_url: format!("/media/{}/{}.mp3", room_id, id),
            duration_seconds: duration,
        });
    }

    if tracks.is_empty() {
        return Err(anyhow!("No playable tracks found in playlist."));
    }

    Ok((playlist_title, tracks))
}
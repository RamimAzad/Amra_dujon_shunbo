use anyhow::{anyhow, Result};
use regex::Regex;
use serde_json::Value;
use std::path::Path;
use tokio::process::Command;

use crate::models::{TrackInfo, TrackSource};

pub fn find_binary(name: &str) -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = [
        format!("/opt/homebrew/bin/{}", name),
        format!("/usr/local/bin/{}", name),
        format!("/opt/anaconda3/bin/{}", name),
        format!("{}/.local/bin/{}", home, name),
        format!("/usr/bin/{}", name),
    ];
    for p in &candidates {
        if Path::new(p).exists() {
            return p.clone();
        }
    }
    name.to_string()
}

pub fn extract_video_id(url: &str) -> Option<String> {
    let re = Regex::new(r"(?:v=|\/|be\/|shorts\/)([a-zA-Z0-9_-]{11})").ok()?;
    re.captures(url).and_then(|cap| cap.get(1).map(|m| m.as_str().to_string()))
}

pub async fn extract_youtube_audio(
    room_id: &str,
    url: &str,
    upload_dir: &str,
) -> Result<TrackInfo> {
    let ytdlp = find_binary("yt-dlp");
    let ffmpeg = find_binary("ffmpeg");

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

    let output_template = format!("{}/%(id)s.%(ext)s", room_audio_dir.display());

    tracing::info!("Executing one-pass yt-dlp audio extraction for: {}", url);
    let mut cmd = Command::new(&ytdlp);
    cmd.arg("--ffmpeg-location").arg(&ffmpeg);
    // Crucial: bypasses YouTube 429 and "Sign in to confirm you're not a bot" checks
    cmd.arg("--extractor-args").arg("youtube:player_client=android,ios");
    cmd.arg("--geo-bypass");
    cmd.arg("--no-playlist");
    cmd.arg("--print-json");
    cmd.arg("-x");
    cmd.arg("--audio-format").arg("mp3");
    cmd.arg("--audio-quality").arg("0");
    cmd.arg("-o").arg(&output_template);

    // Optional cookies file support
    if Path::new("cookies.txt").exists() {
        cmd.arg("--cookies").arg("cookies.txt");
    }

    let node_bin = find_binary("node");
    if Path::new(&node_bin).exists() {
        cmd.arg("--js-runtimes").arg(format!("node:{}", node_bin));
    }

    cmd.arg(url);

    let output = cmd.output().await?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        tracing::error!("yt-dlp failed: {}", err_msg);
        // Extract clean error message
        let first_error_line = err_msg
            .lines()
            .find(|line| line.contains("ERROR:"))
            .unwrap_or("Failed to process YouTube audio.");
        return Err(anyhow!("{}", first_error_line));
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

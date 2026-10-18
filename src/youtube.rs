use anyhow::{anyhow, Result};
use serde_json::Value;
use std::path::Path;
use tokio::process::Command;

use crate::models::{TrackInfo, TrackSource};

pub fn find_binary(name: &str) -> String {
    let candidates = [
        format!("/opt/homebrew/bin/{}", name),
        format!("/usr/local/bin/{}", name),
        format!("/opt/anaconda3/bin/{}", name),
        format!("/usr/bin/{}", name),
    ];
    for p in &candidates {
        if Path::new(p).exists() {
            return p.clone();
        }
    }
    name.to_string()
}

pub async fn extract_youtube_audio(
    room_id: &str,
    url: &str,
    upload_dir: &str,
) -> Result<TrackInfo> {
    let ytdlp = find_binary("yt-dlp");
    let ffmpeg = find_binary("ffmpeg");

    // Ensure room upload dir exists
    let room_audio_dir = Path::new(upload_dir).join(room_id);
    tokio::fs::create_dir_all(&room_audio_dir).await?;

    // Step 1: Extract metadata
    tracing::info!("Fetching YouTube metadata for: {}", url);
    let meta_output = Command::new(&ytdlp)
        .arg("-j")
        .arg("--no-playlist")
        .arg("--skip-download")
        .arg(url)
        .output()
        .await?;

    if !meta_output.status.success() {
        let err_msg = String::from_utf8_lossy(&meta_output.stderr);
        return Err(anyhow!("Failed to fetch YouTube metadata: {}", err_msg));
    }

    let meta_json: Value = serde_json::from_slice(&meta_output.stdout)
        .map_err(|e| anyhow!("Failed to parse metadata JSON: {}", e))?;

    let video_id = meta_json["id"]
        .as_str()
        .ok_or_else(|| anyhow!("Missing video id in metadata"))?;
    let title = meta_json["title"]
        .as_str()
        .unwrap_or("YouTube Audio")
        .to_string();
    let duration = meta_json["duration"].as_f64();

    let output_file_name = format!("{}.mp3", video_id);
    let output_path = room_audio_dir.join(&output_file_name);

    // If file already downloaded, skip redownload
    if !output_path.exists() {
        tracing::info!("Downloading YouTube audio to: {:?}", output_path);
        let output_template = format!("{}/%(id)s.%(ext)s", room_audio_dir.display());

        let download_status = Command::new(&ytdlp)
            .arg("--ffmpeg-location")
            .arg(&ffmpeg)
            .arg("-x")
            .arg("--audio-format")
            .arg("mp3")
            .arg("--audio-quality")
            .arg("0")
            .arg("--no-playlist")
            .arg("-o")
            .arg(&output_template)
            .arg(url)
            .status()
            .await?;

        if !download_status.success() {
            return Err(anyhow!("yt-dlp audio download failed"));
        }
    }

    Ok(TrackInfo {
        id: video_id.to_string(),
        title,
        source: TrackSource::YouTube,
        stream_url: format!("/api/rooms/{}/audio/{}", room_id, output_file_name),
        duration_seconds: duration,
    })
}

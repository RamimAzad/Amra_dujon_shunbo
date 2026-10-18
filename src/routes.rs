use axum::{
    extract::{Multipart, Path, State},
    http::StatusCode,
    response::Json,
};
use rand::{distributions::Alphanumeric, Rng};
use std::path::Path as StdPath;
use uuid::Uuid;

use crate::{
    models::{
        CreateRoomRequest, CreateRoomResponse, ServerMessage, TrackInfo, TrackSource,
        VerifyRoomRequest, VerifyRoomResponse, YouTubeRequest, YouTubeResponse,
    },
    state::{AppState, Room},
    youtube::extract_youtube_audio,
};

pub async fn create_room(
    State(state): State<AppState>,
    Json(payload): Json<CreateRoomRequest>,
) -> Json<CreateRoomResponse> {
    // Generate 6-char alphanumeric room code
    let room_id: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(6)
        .map(char::from)
        .collect::<String>()
        .to_uppercase();

    // Generate 4-digit PIN if not provided
    let passcode = match payload.passcode {
        Some(code) if !code.trim().is_empty() => code.trim().to_string(),
        _ => {
            let pin: u32 = rand::thread_rng().gen_range(1000..=9999);
            pin.to_string()
        }
    };

    let mut rooms = state.rooms.write().await;
    rooms.insert(room_id.clone(), Room::new(room_id.clone(), passcode.clone()));

    // Ensure upload dir exists for this room
    let room_dir = StdPath::new(&state.upload_dir).join(&room_id);
    let _ = tokio::fs::create_dir_all(&room_dir).await;

    Json(CreateRoomResponse { room_id, passcode })
}

pub async fn verify_room(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
    Json(payload): Json<VerifyRoomRequest>,
) -> Result<Json<VerifyRoomResponse>, (StatusCode, &'static str)> {
    let rooms = state.rooms.read().await;
    match rooms.get(&room_id) {
        Some(room) => {
            let valid = room.passcode == payload.passcode.trim();
            Ok(Json(VerifyRoomResponse { valid, room_id }))
        }
        None => Err((StatusCode::NOT_FOUND, "Room not found")),
    }
}

pub async fn upload_audio(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
    mut multipart: Multipart,
) -> Result<Json<TrackInfo>, (StatusCode, String)> {
    // Check if room exists
    {
        let rooms = state.rooms.read().await;
        if !rooms.contains_key(&room_id) {
            return Err((StatusCode::NOT_FOUND, "Room not found".to_string()));
        }
    }

    let room_dir = StdPath::new(&state.upload_dir).join(&room_id);
    tokio::fs::create_dir_all(&room_dir)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut original_filename = "audio.mp3".to_string();
    let file_id = Uuid::new_v4().to_string();
    let mut file_extension = "mp3".to_string();
    let mut saved_file_name = String::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
    {
        if let Some(name) = field.name() {
            if name == "audio" {
                if let Some(file_name) = field.file_name() {
                    original_filename = sanitize_filename::sanitize(file_name);
                    if let Some(ext) = StdPath::new(&original_filename)
                        .extension()
                        .and_then(|s| s.to_str())
                    {
                        file_extension = ext.to_lowercase();
                    }
                }

                saved_file_name = format!("{}.{}", file_id, file_extension);
                let dest_path = room_dir.join(&saved_file_name);

                let data = field
                    .bytes()
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

                tokio::fs::write(&dest_path, data)
                    .await
                    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
                break;
            }
        }
    }

    if saved_file_name.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "No audio file provided".to_string()));
    }

    let track = TrackInfo {
        id: file_id,
        title: original_filename,
        source: TrackSource::Upload,
        stream_url: format!("/media/{}/{}", room_id, saved_file_name),
        duration_seconds: None,
    };

    // Update room track and broadcast
    let mut rooms = state.rooms.write().await;
    if let Some(room) = rooms.get_mut(&room_id) {
        room.set_track(track.clone());
        let sys_msg = room.add_message(
            "System".to_string(),
            format!("Uploaded: {}", track.title),
            true,
        );
        room.broadcast(ServerMessage::Chat(sys_msg));
        room.broadcast(ServerMessage::Sync(room.get_sync_state()));
    }

    Ok(Json(track))
}

pub async fn queue_youtube(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
    Json(payload): Json<YouTubeRequest>,
) -> Result<Json<YouTubeResponse>, (StatusCode, String)> {
    // Check if room exists
    {
        let rooms = state.rooms.read().await;
        let room = rooms
            .get(&room_id)
            .ok_or((StatusCode::NOT_FOUND, "Room not found".to_string()))?;

        // Broadcast progress
        room.broadcast(ServerMessage::DownloadProgress {
            status: "Fetching YouTube track...".to_string(),
            percent: Some(10.0),
        });
    }

    let track = extract_youtube_audio(&room_id, &payload.url, &state.upload_dir)
        .await
        .map_err(|e| {
            tracing::error!("YouTube extraction error: {:?}", e);
            (StatusCode::BAD_REQUEST, format!("YouTube error: {}", e))
        })?;

    let adjusted_track = TrackInfo {
        id: track.id.clone(),
        title: track.title.clone(),
        source: TrackSource::YouTube,
        stream_url: format!("/media/{}/{}.mp3", room_id, track.id),
        duration_seconds: track.duration_seconds,
    };

    // Update room track and broadcast
    let mut rooms = state.rooms.write().await;
    if let Some(room) = rooms.get_mut(&room_id) {
        room.set_track(adjusted_track.clone());
        let sys_msg = room.add_message(
            "System".to_string(),
            format!("Loaded YouTube: {}", adjusted_track.title),
            true,
        );
        room.broadcast(ServerMessage::Chat(sys_msg));
        room.broadcast(ServerMessage::Sync(room.get_sync_state()));
    }

    Ok(Json(YouTubeResponse {
        track: adjusted_track,
    }))
}

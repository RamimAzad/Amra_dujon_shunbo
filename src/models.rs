use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TrackSource {
    Upload,
    YouTube,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackInfo {
    pub id: String,
    pub title: String,
    pub source: TrackSource,
    pub stream_url: String,
    pub duration_seconds: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub sender: String,
    pub content: String,
    pub timestamp_ms: i64,
    pub is_system: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomSyncState {
    pub room_id: String,
    pub current_track: Option<TrackInfo>,
    pub is_playing: bool,
    pub position: f64,
    pub server_time_ms: i64,
    pub listeners_count: usize,
    pub listeners: Vec<String>,
}

// Inbound WebSocket Messages (from Client)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum ClientMessage {
    #[serde(rename = "AUTH")]
    Auth {
        room_id: String,
        passcode: String,
        nickname: String,
    },
    #[serde(rename = "PLAY")]
    Play { position: f64 },
    #[serde(rename = "PAUSE")]
    Pause { position: f64 },
    #[serde(rename = "SEEK")]
    Seek { position: f64 },
    #[serde(rename = "CHAT")]
    Chat { content: String },
    #[serde(rename = "REQUEST_SYNC")]
    RequestSync,
}

// Outbound WebSocket Messages (to Client)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum ServerMessage {
    #[serde(rename = "AUTH_SUCCESS")]
    AuthSuccess {
        room_id: String,
        nickname: String,
        state: RoomSyncState,
        recent_messages: Vec<ChatMessage>,
    },
    #[serde(rename = "AUTH_ERROR")]
    AuthError { message: String },
    #[serde(rename = "SYNC")]
    Sync(RoomSyncState),
    #[serde(rename = "CHAT")]
    Chat(ChatMessage),
    #[serde(rename = "NOTIFICATION")]
    Notification { message: String, level: String },
    #[serde(rename = "DOWNLOAD_PROGRESS")]
    DownloadProgress {
        status: String,
        percent: Option<f32>,
    },
}

// API DTOs
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateRoomRequest {
    pub passcode: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateRoomResponse {
    pub room_id: String,
    pub passcode: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VerifyRoomRequest {
    pub passcode: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VerifyRoomResponse {
    pub valid: bool,
    pub room_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct YouTubeRequest {
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct YouTubeResponse {
    pub track: TrackInfo,
}

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::{broadcast, RwLock};
use uuid::Uuid;

use crate::models::{ChatMessage, RoomSyncState, ServerMessage, TrackInfo};

pub fn current_time_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub struct Room {
    pub id: String,
    pub passcode: String,
    pub current_track: Option<TrackInfo>,
    pub is_playing: bool,
    pub position: f64,
    pub last_updated_at_ms: i64,
    pub listeners: HashMap<String, String>, // session_id -> nickname
    pub messages: Vec<ChatMessage>,
    pub tx: broadcast::Sender<ServerMessage>,
    pub queue: Vec<TrackInfo>,
    pub current_track_index: usize,
    pub playlist_title: Option<String>,
}

impl Room {
    pub fn new(id: String, passcode: String) -> Self {
        let (tx, _) = broadcast::channel(100);
        Self {
            id,
            passcode,
            current_track: None,
            is_playing: false,
            position: 0.0,
            last_updated_at_ms: current_time_ms(),
            listeners: HashMap::new(),
            messages: Vec::new(),
            tx,
            queue: Vec::new(),
            current_track_index: 0,
            playlist_title: None,
        }
    }

    pub fn current_interpolated_position(&self) -> f64 {
        if self.is_playing {
            let elapsed_sec = (current_time_ms() - self.last_updated_at_ms).max(0) as f64 / 1000.0;
            let mut pos = self.position + elapsed_sec;
            if let Some(track) = &self.current_track {
                if let Some(dur) = track.duration_seconds {
                    if pos > dur {
                        pos = dur;
                    }
                }
            }
            pos
        } else {
            self.position
        }
    }

    pub fn get_sync_state(&self) -> RoomSyncState {
        RoomSyncState {
            room_id: self.id.clone(),
            current_track: self.current_track.clone(),
            is_playing: self.is_playing,
            position: self.current_interpolated_position(),
            server_time_ms: current_time_ms(),
            listeners_count: self.listeners.len(),
            listeners: self.listeners.values().cloned().collect(),
            queue: self.queue.clone(),
            current_track_index: self.current_track_index,
            playlist_title: self.playlist_title.clone(),
        }
    }

    pub fn set_play(&mut self, at_position: f64) {
        self.is_playing = true;
        self.position = at_position.max(0.0);
        self.last_updated_at_ms = current_time_ms();
    }

    pub fn set_pause(&mut self, at_position: f64) {
        self.is_playing = false;
        self.position = at_position.max(0.0);
        self.last_updated_at_ms = current_time_ms();
    }

    pub fn set_seek(&mut self, at_position: f64) {
        self.position = at_position.max(0.0);
        self.last_updated_at_ms = current_time_ms();
    }

    pub fn set_track(&mut self, track: TrackInfo) {
        self.queue = vec![track.clone()];
        self.current_track_index = 0;
        self.playlist_title = None;
        self.current_track = Some(track);
        self.position = 0.0;
        self.is_playing = true;
        self.last_updated_at_ms = current_time_ms();
    }

    pub fn set_playlist(&mut self, title: String, queue: Vec<TrackInfo>, active_index: usize) {
        if !queue.is_empty() {
            let idx = active_index.min(queue.len() - 1);
            self.current_track = Some(queue[idx].clone());
            self.current_track_index = idx;
        }
        self.queue = queue;
        self.playlist_title = Some(title);
        self.position = 0.0;
        self.is_playing = true;
        self.last_updated_at_ms = current_time_ms();
    }

    pub fn select_track_index(&mut self, index: usize) -> Option<TrackInfo> {
        if index < self.queue.len() {
            self.current_track_index = index;
            let track = self.queue[index].clone();
            self.current_track = Some(track.clone());
            self.position = 0.0;
            self.is_playing = true;
            self.last_updated_at_ms = current_time_ms();
            Some(track)
        } else {
            None
        }
    }

    pub fn next_track_index(&self) -> Option<usize> {
        if self.queue.is_empty() {
            None
        } else {
            Some((self.current_track_index + 1) % self.queue.len())
        }
    }

    pub fn prev_track_index(&self) -> Option<usize> {
        if self.queue.is_empty() {
            None
        } else {
            let prev_idx = if self.current_track_index == 0 {
                self.queue.len() - 1
            } else {
                self.current_track_index - 1
            };
            Some(prev_idx)
        }
    }

    pub fn add_message(&mut self, sender: String, content: String, is_system: bool) -> ChatMessage {
        let msg = ChatMessage {
            id: Uuid::new_v4().to_string(),
            sender,
            content,
            timestamp_ms: current_time_ms(),
            is_system,
        };
        self.messages.push(msg.clone());
        if self.messages.len() > 100 {
            self.messages.remove(0);
        }
        msg
    }

    pub fn broadcast(&self, message: ServerMessage) {
        let _ = self.tx.send(message);
    }
}

#[derive(Clone)]
pub struct AppState {
    pub rooms: Arc<RwLock<HashMap<String, Room>>>,
    pub upload_dir: String,
}

impl AppState {
    pub fn new(upload_dir: String) -> Self {
        Self {
            rooms: Arc::new(RwLock::new(HashMap::new())),
            upload_dir,
        }
    }
}

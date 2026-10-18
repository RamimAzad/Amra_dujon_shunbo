use axum::{
    extract::{
        ws::{Message, WebSocket},
        Path, State, WebSocketUpgrade,
    },
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::{
    models::{ClientMessage, ServerMessage},
    state::AppState,
};

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Path(room_id): Path<String>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state, room_id))
}

async fn handle_socket(socket: WebSocket, state: AppState, room_id: String) {
    let (mut sender, mut receiver) = socket.split();
    let session_id = Uuid::new_v4().to_string();

    // Step 1: Wait for Auth message
    let (nickname, mut broadcast_rx) = match receiver.next().await {
        Some(Ok(Message::Text(text))) => {
            match serde_json::from_str::<ClientMessage>(&text) {
                Ok(ClientMessage::Auth {
                    room_id: req_room_id,
                    passcode,
                    nickname,
                }) => {
                    let mut rooms = state.rooms.write().await;
                    if let Some(room) = rooms.get_mut(&req_room_id) {
                        if room.passcode != passcode {
                            let _ = sender
                                .send(Message::Text(
                                    serde_json::to_string(&ServerMessage::AuthError {
                                        message: "Incorrect passcode".to_string(),
                                    })
                                    .unwrap(),
                                ))
                                .await;
                            return;
                        }

                        // Authenticated successfully
                        let clean_nickname = if nickname.trim().is_empty() {
                            format!("Guest-{}", &session_id[..4])
                        } else {
                            nickname.trim().to_string()
                        };

                        room.listeners
                            .insert(session_id.clone(), clean_nickname.clone());
                        let sync_state = room.get_sync_state();
                        let recent_messages = room.messages.clone();
                        let rx = room.tx.subscribe();

                        // Notify room that user joined
                        let join_msg = room.add_message(
                            "System".to_string(),
                            format!("{} joined the room.", clean_nickname),
                            true,
                        );
                        let _ = room.tx.send(ServerMessage::Chat(join_msg));
                        let _ = room.tx.send(ServerMessage::Sync(room.get_sync_state()));

                        // Send auth success to this client
                        let auth_resp = ServerMessage::AuthSuccess {
                            room_id: req_room_id,
                            nickname: clean_nickname.clone(),
                            state: sync_state,
                            recent_messages,
                        };
                        let _ = sender
                            .send(Message::Text(serde_json::to_string(&auth_resp).unwrap()))
                            .await;

                        (clean_nickname, rx)
                    } else {
                        let _ = sender
                            .send(Message::Text(
                                serde_json::to_string(&ServerMessage::AuthError {
                                    message: "Room not found".to_string(),
                                })
                                .unwrap(),
                            ))
                            .await;
                        return;
                    }
                }
                _ => {
                    let _ = sender
                        .send(Message::Text(
                            serde_json::to_string(&ServerMessage::AuthError {
                                message: "Authentication required as first message".to_string(),
                            })
                            .unwrap(),
                        ))
                        .await;
                    return;
                }
            }
        }
        _ => return,
    };

    // Step 2: Main full-duplex loop
    loop {
        tokio::select! {
            // Inbound messages from this client
            client_msg = receiver.next() => {
                match client_msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(msg) = serde_json::from_str::<ClientMessage>(&text) {
                            let mut rooms = state.rooms.write().await;
                            if let Some(room) = rooms.get_mut(&room_id) {
                                match msg {
                                    ClientMessage::Play { position } => {
                                        room.set_play(position);
                                        let sync = room.get_sync_state();
                                        room.broadcast(ServerMessage::Sync(sync));
                                    }
                                    ClientMessage::Pause { position } => {
                                        room.set_pause(position);
                                        let sync = room.get_sync_state();
                                        room.broadcast(ServerMessage::Sync(sync));
                                    }
                                    ClientMessage::Seek { position } => {
                                        room.set_seek(position);
                                        let sync = room.get_sync_state();
                                        room.broadcast(ServerMessage::Sync(sync));
                                    }
                                    ClientMessage::Chat { content } => {
                                        let trimmed = content.trim();
                                        if !trimmed.is_empty() {
                                            let chat_msg = room.add_message(nickname.clone(), trimmed.to_string(), false);
                                            room.broadcast(ServerMessage::Chat(chat_msg));
                                        }
                                    }
                                    ClientMessage::RequestSync => {
                                        let sync = room.get_sync_state();
                                        let _ = sender.send(Message::Text(
                                            serde_json::to_string(&ServerMessage::Sync(sync)).unwrap()
                                        )).await;
                                    }
                                    ClientMessage::Auth { .. } => {}
                                }
                            }
                        }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        let _ = sender.send(Message::Pong(payload)).await;
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }

            // Outbound broadcasts from room to this client
            broadcast_msg = broadcast_rx.recv() => {
                match broadcast_msg {
                    Ok(msg) => {
                        if let Ok(serialized) = serde_json::to_string(&msg) {
                            if sender.send(Message::Text(serialized)).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }

    // Step 3: Handle disconnect / cleanup
    let mut rooms = state.rooms.write().await;
    if let Some(room) = rooms.get_mut(&room_id) {
        room.listeners.remove(&session_id);
        let leave_msg = room.add_message(
            "System".to_string(),
            format!("{} left the room.", nickname),
            true,
        );
        let _ = room.tx.send(ServerMessage::Chat(leave_msg));
        let _ = room.tx.send(ServerMessage::Sync(room.get_sync_state()));
    }
}

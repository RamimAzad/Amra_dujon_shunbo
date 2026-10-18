mod models;
mod routes;
mod state;
mod ws;
mod youtube;

use axum::{
    extract::DefaultBodyLimit,
    response::Html,
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use tower_http::{
    cors::{Any, CorsLayer},
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};

use crate::state::AppState;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "sync_music=info,tower_http=info".into()),
        )
        .init();

    let upload_dir = "uploads".to_string();
    tokio::fs::create_dir_all(&upload_dir).await?;
    tokio::fs::create_dir_all("static").await?;

    let state = AppState::new(upload_dir.clone());

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        // API routes
        .route("/api/rooms", post(routes::create_room))
        .route("/api/rooms/:room_id/verify", post(routes::verify_room))
        .route("/api/rooms/:room_id/upload", post(routes::upload_audio))
        .route("/api/rooms/:room_id/youtube", post(routes::queue_youtube))
        .route("/api/rooms/:room_id/ws", get(ws::ws_handler))
        // Direct room link page
        .route(
            "/room/:id",
            get(|| async {
                match tokio::fs::read_to_string("static/index.html").await {
                    Ok(content) => Html(content),
                    Err(_) => Html("<h1>Music Sync Platform</h1><p>Loading UI...</p>".to_string()),
                }
            }),
        )
        // Media files
        .nest_service("/media", ServeDir::new(&upload_dir))
        // Static assets under /static prefix
        .nest_service("/static", ServeDir::new("static"))
        // Static assets with index fallback
        .fallback_service(
            ServeDir::new("static").fallback(ServeFile::new("static/index.html")),
        )
        // 50MB audio upload limit
        .layer(DefaultBodyLimit::max(50 * 1024 * 1024))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let port = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("🎵 Synchronized Music Server running at http://localhost:{}", port);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

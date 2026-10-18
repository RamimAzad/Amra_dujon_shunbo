# Harmonix - Real-Time Synchronized Music Room

A high-performance web platform built in **Rust** (Axum + Tokio + WebSockets) where two (or more) people can listen to music synchronously—either by uploading audio files from a local PC or pasting YouTube links—featuring room code & PIN authentication and live chat.

---

## 🌟 Key Features

1. **⚡ Ultra-Fast Rust Backend:** Powered by `Axum` and `Tokio` async runtime with sub-millisecond event broadcasting and tiny memory footprint.
2. **🔐 Room Link & Code Access Gate:**
   - Create private rooms with custom or auto-generated 4-digit PINs.
   - One-click shareable invite link (`/room/:id?pin=...`).
   - Listeners must provide the room PIN to unlock audio playback and join the room.
3. **📁 Local PC Uploads:**
   - Drag-and-drop or select MP3, WAV, FLAC, OGG, or AAC audio files.
   - Direct streaming uploads with instant multi-user synchronization.
4. **▶️ YouTube Link Extraction:**
   - Paste any YouTube link.
   - Server extracts high-fidelity audio in the background (`yt-dlp` + `ffmpeg`).
   - Streams unified audio to all listeners without mismatched ads or video buffering desync.
5. **🎛️ Sub-Millisecond Audio Sync & Drift Compensation:**
   - Authoritative server timestamping for Play, Pause, and Seeking.
   - Client-side latency compensation with soft catch-up to eliminate audible stutter.
   - HTTP 206 Range requests for instantaneous scrubbing.
6. **💬 Real-Time Chat & Activity Feed:**
   - Instant messaging between participants.
   - System activity logs ("Alice uploaded a track", "Bob skipped to 01:30").
7. **🌊 Live Audio Visualizer:**
   - Real-time frequency spectrum visualizer driven by HTML5 Web Audio API.

---

## 🚀 Getting Started

### Prerequisites
- **Rust toolchain:** `rustc` and `cargo` (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- **FFmpeg:** Installed on your system (e.g. `brew install ffmpeg`)
- **yt-dlp:** For YouTube audio extraction (`pip install yt-dlp` or `brew install yt-dlp`)

### Running the Server
```bash
# Clone or navigate to the directory
cd "playing music"

# Run with Cargo (default port: 3000)
cargo run
```

To run on a custom port:
```bash
PORT=8080 cargo run
```

Open your browser at:
```
http://localhost:3000
```

---

## 🎧 User Flow

1. **Host:** Clicks **"Create Room"**, sets a PIN (or accepts the auto-generated one), and enters a nickname.
2. **Invite:** Clicks **"📋 Copy Invite Link"** and shares the link + PIN with their friend.
3. **Friend (Peer):** Opens the link, enters the PIN, and clicks **"Unlock & Join Music Room"**.
4. **Listen:** Either user drags an audio file onto the upload zone or pastes a YouTube link. Playback starts in sync on both browsers!
5. **Chat:** Both users can chat and coordinate playback in real time.

# Build stage with official Rust image
FROM rust:1-slim-bookworm AS builder

WORKDIR /app

# Copy Cargo configuration
COPY Cargo.toml Cargo.lock ./

# Cache dependencies by creating dummy main
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Copy actual source code
COPY src ./src
COPY static ./static

# Touch main.rs to invalidate dummy build and compile release binary
RUN touch src/main.rs && cargo build --release

# Final runtime image
FROM debian:bookworm-slim

WORKDIR /app

# Install ffmpeg, python3, pip, and yt-dlp
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp via pip (break-system-packages is standard in container environments)
RUN pip3 install --no-cache-dir --break-system-packages yt-dlp

# Copy compiled binary and static assets
COPY --from=builder /app/target/release/sync_music /app/sync_music
COPY static /app/static

# Create uploads directory
RUN mkdir -p /app/uploads

ENV PORT=3000
EXPOSE 3000

CMD ["/app/sync_music"]

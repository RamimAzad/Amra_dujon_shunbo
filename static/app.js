// amra-shunbo - Synchronized Real-time Player
(function () {
  'use strict';

  // Global State
  let currentRoomId = null;
  let currentPasscode = null;
  let myNickname = null;
  let ws = null;
  let isSeeking = false;
  let audioCtx = null;
  let analyser = null;
  let audioSourceNode = null;
  let animationFrameId = null;

  // DOM Elements
  const authModal = document.getElementById('authModal');
  const tabJoinBtn = document.getElementById('tabJoinBtn');
  const tabCreateBtn = document.getElementById('tabCreateBtn');
  const joinForm = document.getElementById('joinForm');
  const createForm = document.getElementById('createForm');
  const joinRoomIdInput = document.getElementById('joinRoomId');
  const joinPasscodeInput = document.getElementById('joinPasscode');
  const joinNicknameInput = document.getElementById('joinNickname');
  const createPasscodeInput = document.getElementById('createPasscode');
  const createNicknameInput = document.getElementById('createNickname');

  const headerRoomCode = document.getElementById('headerRoomCode');
  const headerPasscode = document.getElementById('headerPasscode');
  const copyInviteBtn = document.getElementById('copyInviteBtn');
  const listenerCount = document.getElementById('listenerCount');

  const audio = document.getElementById('audioPlayer');
  const playBtn = document.getElementById('playBtn');
  const playIconSvg = document.getElementById('playIconSvg');
  const syncBtn = document.getElementById('syncBtn');
  const timelineSlider = document.getElementById('timelineSlider');
  const currentTimeLabel = document.getElementById('currentTimeLabel');
  const durationLabel = document.getElementById('durationLabel');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeIconBtn = document.getElementById('volumeIconBtn');
  const volIconSvg = document.getElementById('volIconSvg');

  const albumArtImg = document.getElementById('albumArtImg');
  const albumArtPlaceholder = document.getElementById('albumArtPlaceholder');
  const vinylDisc = document.getElementById('vinylDisc');

  const trackTitle = document.getElementById('trackTitle');
  const trackArtist = document.getElementById('trackArtist');
  const trackSourceBadge = document.getElementById('trackSourceBadge');
  const trackSourceIcon = document.getElementById('trackSourceIcon');
  const trackSourceName = document.getElementById('trackSourceName');

  const tabUploadBtn = document.getElementById('tabUploadBtn');
  const tabYtBtn = document.getElementById('tabYtBtn');
  const uploadTabContent = document.getElementById('uploadTabContent');
  const ytTabContent = document.getElementById('ytTabContent');
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const ytForm = document.getElementById('ytForm');
  const ytUrlInput = document.getElementById('ytUrlInput');
  const statusPill = document.getElementById('statusPill');
  const statusMessage = document.getElementById('statusMessage');

  const chatMessages = document.getElementById('chatMessages');
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const myNicknameLabel = document.getElementById('myNicknameLabel');
  const canvas = document.getElementById('visualizerCanvas');
  const canvasCtx = canvas.getContext('2d');

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Format seconds to mm:ss
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  // Toast notification
  function showToast(message, icon = 'ℹ️') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(16px)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3000);
  }

  // 360° Circular Radial Visualizer Engine with Staged Beat Dancing & Peak-Hold
  const RADIAL_BAR_COUNT = 96;
  let radialHeights = new Float32Array(RADIAL_BAR_COUNT);
  let radialPeaks = new Float32Array(RADIAL_BAR_COUNT);
  let radialPeakSpeeds = new Float32Array(RADIAL_BAR_COUNT);
  let radialPeakHolds = new Int16Array(RADIAL_BAR_COUNT);
  let smoothBassEnergy = 0;
  let shockwaveRadius = 0;
  let shockwaveAlpha = 0;

  function initVisualizer() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    if (!audioSourceNode) {
      try {
        audioSourceNode = audioCtx.createMediaElementSource(audio);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256; // 128 frequency bins
        analyser.smoothingTimeConstant = 0.85; // Smooth, composed, less twitchy/sensitive
        audioSourceNode.connect(analyser);
        analyser.connect(audioCtx.destination);
      } catch (err) {
        console.warn('AudioContext already connected:', err);
      }
    }
    renderVisualizer();
  }

  function renderVisualizer() {
    function draw() {
      animationFrameId = requestAnimationFrame(draw);
      const width = canvas.width = canvas.parentElement.clientWidth;
      const height = canvas.height = canvas.parentElement.clientHeight;

      canvasCtx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const albumBox = document.getElementById('albumArtworkBox');
      const boxRadius = albumBox ? (albumBox.offsetWidth / 2) : 70;
      const innerRadius = boxRadius + 6;
      const maxExtension = Math.max(15, Math.min(cx, cy) - innerRadius - 8);

      if (!analyser || audio.paused) {
        // Idle Radial Breathing Halo
        const t = Date.now() / 700;
        for (let i = 0; i < RADIAL_BAR_COUNT; i++) {
          const angle = (i / RADIAL_BAR_COUNT) * Math.PI * 2 - Math.PI / 2;
          const w1 = Math.sin(t * 1.4 + angle * 4);
          const w2 = Math.cos(t * 2.0 - angle * 2);
          const idleLen = Math.max(5, ((w1 + w2) * 0.5 * 0.5 + 0.5) * 22 + 6);

          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);

          const x1 = cx + cosA * innerRadius;
          const y1 = cy + sinA * innerRadius;
          const x2 = cx + cosA * (innerRadius + idleLen);
          const y2 = cy + sinA * (innerRadius + idleLen);

          canvasCtx.beginPath();
          canvasCtx.moveTo(x1, y1);
          canvasCtx.lineTo(x2, y2);
          canvasCtx.strokeStyle = 'rgba(255, 0, 0, 0.35)';
          canvasCtx.lineWidth = 2.2;
          canvasCtx.lineCap = 'round';
          canvasCtx.stroke();
        }

        if (albumBox) {
          albumBox.style.transform = 'scale(1)';
          albumBox.style.boxShadow = '0 0 35px rgba(0, 0, 0, 0.95)';
        }
        return;
      }

      // Audio playing - extract frequency spectrum
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      // Measure Bass & Spectral Energy for Beat Stages with higher stability
      const bassRaw = (dataArray[1] + dataArray[2] + dataArray[3] + dataArray[4] + dataArray[5]) / (5 * 255);
      smoothBassEnergy += (bassRaw - smoothBassEnergy) * 0.22;

      let sumEnergy = 0;
      for (let j = 0; j < 48; j++) sumEnergy += dataArray[j];
      const avgEnergy = sumEnergy / (48 * 255);

      // Tuned multi-stage beat detection (higher thresholds to prevent hyper-sensitivity):
      let beatStage = 1;
      let stageLengthMult = 0.55;
      let peakHoldDuration = 0;

      if (avgEnergy >= 0.55 || smoothBassEnergy >= 0.65) {
        beatStage = 3;
        stageLengthMult = 1.05; // Controlled energetic expansion on heavy drops
        peakHoldDuration = 14;  // Peak hold on genuine heavy drops
      } else if (avgEnergy >= 0.28 || smoothBassEnergy >= 0.36) {
        beatStage = 2;
        stageLengthMult = 0.78; // Gentle groove
        peakHoldDuration = 6;
      }

      // Controlled Beat Scaling on Center Artwork (less sensitive)
      if (albumBox) {
        let pulseScale = 1.0;
        let glowSpread = 25;
        let glowAlpha = 0.2;

        if (beatStage === 1) {
          pulseScale = 1.0 + Math.max(0, smoothBassEnergy - 0.2) * 0.03;
          glowSpread = 25 + smoothBassEnergy * 15;
          glowAlpha = 0.2 + smoothBassEnergy * 0.2;
        } else if (beatStage === 2) {
          pulseScale = 1.0 + smoothBassEnergy * 0.05;
          glowSpread = 30 + smoothBassEnergy * 25;
          glowAlpha = 0.3 + smoothBassEnergy * 0.35;
        } else {
          pulseScale = 1.0 + smoothBassEnergy * 0.08;
          glowSpread = 40 + smoothBassEnergy * 45;
          glowAlpha = 0.45 + smoothBassEnergy * 0.5;

          // Shockwave only triggers on distinct loud kick drops
          if (smoothBassEnergy > 0.75 && shockwaveAlpha <= 0.1) {
            shockwaveRadius = innerRadius;
            shockwaveAlpha = 0.7;
          }
        }

        albumBox.style.transform = `scale(${pulseScale})`;
        albumBox.style.boxShadow = `0 0 ${glowSpread}px rgba(255, 0, 0, ${glowAlpha})`;
      }

      // Draw expanding beat shockwave ring if active
      if (shockwaveAlpha > 0.02) {
        canvasCtx.beginPath();
        canvasCtx.arc(cx, cy, shockwaveRadius, 0, Math.PI * 2);
        canvasCtx.strokeStyle = `rgba(255, 60, 0, ${shockwaveAlpha})`;
        canvasCtx.lineWidth = 2.5;
        canvasCtx.stroke();
        shockwaveRadius += 4.0;
        shockwaveAlpha *= 0.90;
      }

      // Map 48 logarithmic bands mirrored symmetrically around 96 radial lines
      const halfCount = RADIAL_BAR_COUNT / 2;
      for (let i = 0; i < RADIAL_BAR_COUNT; i++) {
        // Symmetrical mirroring: left and right halves mirror from bottom to top
        const symIdx = i < halfCount ? (halfCount - 1 - i) : (i - halfCount);
        const norm = symIdx / (halfCount - 1);
        const binIdx = Math.pow(norm, 2.0) * (bufferLength - 4) + 1;
        const low = Math.floor(binIdx);
        const high = Math.min(low + 1, bufferLength - 1);
        const frac = binIdx - low;
        let val = dataArray[low] * (1 - frac) + dataArray[high] * frac;

        // Controlled treble curve (less aggressive boost)
        const boost = (1.0 + Math.pow(norm, 0.6) * 0.5) * stageLengthMult;
        val = Math.min(255, val * boost);

        // Gamma power curve (1.35) filters out low-level noise and micro-jitter
        const normalizedPower = Math.pow(val / 255, 1.35);
        const targetLen = Math.max(5, normalizedPower * maxExtension);

        // Smooth attack and decay (prevents jittery twitching)
        if (targetLen >= radialHeights[i]) {
          radialHeights[i] += (targetLen - radialHeights[i]) * 0.42;
          // Peak hold activates only on prominent beats
          if (targetLen > maxExtension * 0.65 && beatStage >= 2) {
            radialPeakHolds[i] = peakHoldDuration;
          }
        } else {
          if (radialPeakHolds[i] > 0) {
            radialPeakHolds[i]--;
            radialHeights[i] = Math.max(targetLen, radialHeights[i] * 0.985);
          } else {
            radialHeights[i] += (targetLen - radialHeights[i]) * 0.16;
          }
        }

        // Peak dots physics
        if (radialHeights[i] >= radialPeaks[i]) {
          radialPeaks[i] = radialHeights[i];
          radialPeakSpeeds[i] = 0;
        } else {
          radialPeakSpeeds[i] += 0.32;
          radialPeaks[i] = Math.max(0, radialPeaks[i] - radialPeakSpeeds[i]);
        }

        // Calculate radial coordinates
        const angle = (i / RADIAL_BAR_COUNT) * Math.PI * 2 - Math.PI / 2;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        const x1 = cx + cosA * innerRadius;
        const y1 = cy + sinA * innerRadius;
        const x2 = cx + cosA * (innerRadius + radialHeights[i]);
        const y2 = cy + sinA * (innerRadius + radialHeights[i]);

        // Dynamic Line Gradient (shifts brighter & hotter with beat stage)
        const lineGrad = canvasCtx.createLinearGradient(x1, y1, x2, y2);
        lineGrad.addColorStop(0, '#cc0000');
        lineGrad.addColorStop(0.5, '#ff0000');
        if (beatStage === 3) {
          lineGrad.addColorStop(0.85, '#ff4400');
          lineGrad.addColorStop(1.0, '#ffcc00'); // Hot gold at drop
        } else {
          lineGrad.addColorStop(1.0, '#ff5500');
        }

        // Render Radial Ray
        canvasCtx.beginPath();
        canvasCtx.moveTo(x1, y1);
        canvasCtx.lineTo(x2, y2);
        canvasCtx.strokeStyle = lineGrad;
        canvasCtx.lineWidth = 2.8;
        canvasCtx.lineCap = 'round';
        canvasCtx.stroke();

        // Render Floating Glowing Peak Orb
        if (radialPeaks[i] > 8) {
          const peakDist = innerRadius + radialPeaks[i] + 3.5;
          const px = cx + cosA * peakDist;
          const py = cy + sinA * peakDist;

          canvasCtx.beginPath();
          canvasCtx.arc(px, py, beatStage === 3 ? 2.4 : 1.8, 0, Math.PI * 2);
          canvasCtx.fillStyle = beatStage === 3 ? '#fff5cc' : '#ffeedd';
          canvasCtx.shadowColor = '#ff2200';
          canvasCtx.shadowBlur = beatStage === 3 ? 8 : 4;
          canvasCtx.fill();
          canvasCtx.shadowBlur = 0;
        }
      }
    }

    if (!animationFrameId) {
      draw();
    }
  }

  // Update YouTube style Play/Pause button
  function updatePlayButtonIcon(isPlaying) {
    if (!playIconSvg) return;
    if (isPlaying) {
      // Pause icon (two vertical bars)
      playIconSvg.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
    } else {
      // Play icon (triangle)
      playIconSvg.innerHTML = '<path d="M8 5v14l11-7z"/>';
    }
  }

  // Status helper
  function setStatus(text, show = true) {
    if (show) {
      statusMessage.textContent = text;
      statusPill.classList.add('active');
    } else {
      statusPill.classList.remove('active');
    }
  }

  // Tab switching (Join / Create)
  tabJoinBtn.addEventListener('click', () => {
    tabJoinBtn.classList.add('active');
    tabCreateBtn.classList.remove('active');
    joinForm.style.display = 'block';
    createForm.style.display = 'none';
  });

  tabCreateBtn.addEventListener('click', () => {
    tabCreateBtn.classList.add('active');
    tabJoinBtn.classList.remove('active');
    createForm.style.display = 'block';
    joinForm.style.display = 'none';
  });

  // Media Tab switching (Upload / YouTube)
  tabUploadBtn.addEventListener('click', () => {
    tabUploadBtn.classList.add('active');
    tabYtBtn.classList.remove('active');
    uploadTabContent.style.display = 'block';
    ytTabContent.style.display = 'none';
  });

  tabYtBtn.addEventListener('click', () => {
    tabYtBtn.classList.add('active');
    tabUploadBtn.classList.remove('active');
    ytTabContent.style.display = 'block';
    uploadTabContent.style.display = 'none';
  });

  // Parse path for /room/:id or ?room=...
  function checkUrlForRoom() {
    const path = window.location.pathname;
    const match = path.match(/\/room\/([A-Za-z0-9_-]+)/);
    if (match) {
      joinRoomIdInput.value = match[1].toUpperCase();
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('room')) {
      joinRoomIdInput.value = params.get('room').toUpperCase();
    }
    if (params.get('pin')) {
      joinPasscodeInput.value = params.get('pin');
    }
  }
  checkUrlForRoom();

  // Create Room Form Submit
  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = createPasscodeInput.value.trim();
    myNickname = createNicknameInput.value.trim() || 'Host';

    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: pin || null }),
      });
      const data = await res.json();
      currentRoomId = data.room_id;
      currentPasscode = data.passcode;

      connectWebSocket(currentRoomId, currentPasscode, myNickname);
    } catch (err) {
      showToast('Error creating room: ' + err.message, '❌');
    }
  });

  // Join Room Form Submit
  joinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    currentRoomId = joinRoomIdInput.value.trim().toUpperCase();
    currentPasscode = joinPasscodeInput.value.trim();
    myNickname = joinNicknameInput.value.trim() || 'Guest';

    if (!currentRoomId || !currentPasscode) {
      showToast('Please enter both Room Code and Passcode', '⚠️');
      return;
    }

    connectWebSocket(currentRoomId, currentPasscode, myNickname);
  });

  // Connect WebSocket and authenticate
  function connectWebSocket(roomId, passcode, nickname) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/api/rooms/${roomId}/ws`;

    if (ws) {
      ws.close();
    }

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'AUTH',
        payload: {
          room_id: roomId,
          passcode: passcode,
          nickname: nickname
        }
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (err) {
        console.error('Failed to parse WS message:', err);
      }
    };

    ws.onclose = () => {
      console.warn('WebSocket connection closed.');
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      showToast('Connection error', '❌');
    };
  }

  // Handle incoming server messages
  function handleServerMessage(msg) {
    switch (msg.type) {
      case 'AUTH_SUCCESS': {
        const { room_id, nickname, state, recent_messages } = msg.payload;
        currentRoomId = room_id;
        myNickname = nickname;
        authModal.style.display = 'none';

        headerRoomCode.textContent = room_id;
        headerPasscode.textContent = currentPasscode;
        myNicknameLabel.textContent = `You: ${nickname}`;

        window.history.pushState({}, '', `/room/${room_id}`);

        chatMessages.innerHTML = '';
        if (recent_messages) {
          recent_messages.forEach(renderChatMessage);
        }

        applySyncState(state);
        initVisualizer();
        showToast(`Connected to amra-shunbo room ${room_id}!`, '✨');
        break;
      }

      case 'AUTH_ERROR': {
        showToast(msg.payload.message, '🔒');
        break;
      }

      case 'SYNC': {
        applySyncState(msg.payload);
        break;
      }

      case 'CHAT': {
        renderChatMessage(msg.payload);
        break;
      }

      case 'DOWNLOAD_PROGRESS': {
        setStatus(msg.payload.status, true);
        break;
      }

      case 'NOTIFICATION': {
        showToast(msg.payload.message);
        break;
      }
    }
  }

  // Apply synchronized room state
  function applySyncState(state) {
    if (!state) return;

    listenerCount.textContent = state.listeners_count || 1;

    // Track metadata & Artwork
    if (state.current_track) {
      trackTitle.textContent = state.current_track.title;
      trackSourceBadge.style.display = 'inline-flex';

      if (state.current_track.source === 'youtube') {
        trackSourceIcon.textContent = '▶️';
        trackSourceName.textContent = 'YouTube';
        trackArtist.textContent = 'YouTube Audio';

        // Load YouTube HQ Thumbnail
        albumArtImg.src = `https://img.youtube.com/vi/${state.current_track.id}/hqdefault.jpg`;
        albumArtImg.style.display = 'block';
        albumArtPlaceholder.style.display = 'none';
      } else {
        trackSourceIcon.textContent = '📁';
        trackSourceName.textContent = 'Local File';
        trackArtist.textContent = 'Local Audio Track';

        albumArtImg.style.display = 'none';
        albumArtPlaceholder.style.display = 'flex';
      }

      // Check if audio src needs updating
      const currentSrcPath = new URL(audio.src || 'http://dummy.com', window.location.origin).pathname;
      const targetSrcPath = new URL(state.current_track.stream_url, window.location.origin).pathname;

      if (currentSrcPath !== targetSrcPath) {
        audio.src = state.current_track.stream_url;
        audio.load();
      }
    } else {
      trackTitle.textContent = 'No track loaded yet';
      trackArtist.textContent = 'Select an audio file or paste YouTube link below';
      trackSourceBadge.style.display = 'none';
      albumArtImg.style.display = 'none';
      albumArtPlaceholder.style.display = 'flex';
      updatePlayButtonIcon(false);
      vinylDisc.classList.remove('spinning');
      return;
    }

    // Audio timeline calculation with latency compensation
    const now = Date.now();
    let expectedPosition = state.position;
    if (state.is_playing) {
      const elapsedSeconds = (now - state.server_time_ms) / 1000;
      expectedPosition += Math.max(0, elapsedSeconds);
      vinylDisc.classList.add('spinning');
    } else {
      vinylDisc.classList.remove('spinning');
    }

    updatePlayButtonIcon(state.is_playing);

    // Apply audio sync
    if (state.is_playing) {
      if (audio.paused) {
        audio.currentTime = expectedPosition;
        audio.play().catch(e => console.log('Autoplay restriction caught:', e));
      } else {
        const drift = Math.abs(audio.currentTime - expectedPosition);
        if (drift > 0.25) {
          audio.currentTime = expectedPosition;
        } else if (drift > 0.05) {
          audio.playbackRate = audio.currentTime < expectedPosition ? 1.05 : 0.95;
        } else {
          audio.playbackRate = 1.0;
        }
      }
    } else {
      if (!audio.paused) {
        audio.pause();
      }
      const drift = Math.abs(audio.currentTime - expectedPosition);
      if (drift > 0.1) {
        audio.currentTime = expectedPosition;
      }
    }

    if (!isSeeking) {
      updateTimelineUI(expectedPosition, audio.duration || state.current_track.duration_seconds || 0);
    }
  }

  function updateTimelineUI(current, duration) {
    currentTimeLabel.textContent = formatTime(current);
    if (duration > 0) {
      durationLabel.textContent = formatTime(duration);
      timelineSlider.max = duration;
      timelineSlider.value = current;

      // Update YouTube Red scrubber progress fill
      const pct = (current / duration) * 100;
      timelineSlider.style.background = `linear-gradient(to right, #ff0000 0%, #ff0000 ${pct}%, rgba(255,255,255,0.2) ${pct}%, rgba(255,255,255,0.2) 100%)`;
    }
  }

  // Audio timeupdate loop for smooth UI scrub
  audio.addEventListener('timeupdate', () => {
    if (!isSeeking && audio.duration) {
      updateTimelineUI(audio.currentTime, audio.duration);
    }
  });

  // Play / Pause Synchronized Toggle
  playBtn.addEventListener('click', () => {
    initVisualizer();
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    if (audio.paused) {
      ws.send(JSON.stringify({
        type: 'PLAY',
        payload: { position: audio.currentTime }
      }));
    } else {
      ws.send(JSON.stringify({
        type: 'PAUSE',
        payload: { position: audio.currentTime }
      }));
    }
  });

  // Seekbar Controls
  timelineSlider.addEventListener('input', () => {
    isSeeking = true;
    const val = parseFloat(timelineSlider.value);
    currentTimeLabel.textContent = formatTime(val);
    const max = parseFloat(timelineSlider.max) || 1;
    const pct = (val / max) * 100;
    timelineSlider.style.background = `linear-gradient(to right, #ff0000 0%, #ff0000 ${pct}%, rgba(255,255,255,0.2) ${pct}%, rgba(255,255,255,0.2) 100%)`;
  });

  timelineSlider.addEventListener('change', () => {
    isSeeking = false;
    const seekTime = parseFloat(timelineSlider.value);
    audio.currentTime = seekTime;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'SEEK',
        payload: { position: seekTime }
      }));
    }
  });

  // Force Resync Button
  syncBtn.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'REQUEST_SYNC', payload: null }));
      showToast('Syncing with room clock...', '🔄');
    }
  });

  // Volume Controls
  function updateVolumeUI(vol) {
    audio.volume = vol;
    const pct = vol * 100;
    volumeSlider.style.background = `linear-gradient(to right, #ffffff 0%, #ffffff ${pct}%, rgba(255,255,255,0.25) ${pct}%, rgba(255,255,255,0.25) 100%)`;

    if (vol === 0) {
      volIconSvg.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
    } else {
      volIconSvg.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
    }
  }

  volumeSlider.addEventListener('input', () => {
    updateVolumeUI(parseFloat(volumeSlider.value));
  });

  volumeIconBtn.addEventListener('click', () => {
    if (audio.volume > 0) {
      volumeIconBtn.dataset.prevVolume = audio.volume;
      updateVolumeUI(0);
      volumeSlider.value = 0;
    } else {
      const restored = parseFloat(volumeIconBtn.dataset.prevVolume || 0.8);
      updateVolumeUI(restored);
      volumeSlider.value = restored;
    }
  });

  // Local File Upload
  function triggerFileBrowser(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!currentRoomId) {
      showToast('Please join or create a room first to upload music!', '⚠️');
      authModal.style.display = 'flex';
      return;
    }
    fileInput.click();
  }

  const browseBtn = document.getElementById('browseBtn');
  if (browseBtn) {
    browseBtn.addEventListener('click', triggerFileBrowser);
  }

  dropZone.addEventListener('click', (e) => {
    if (e.target === fileInput || e.target === browseBtn) return;
    triggerFileBrowser(e);
  });

  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      triggerFileBrowser(e);
    }
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      handleFileUpload(fileInput.files[0]);
    }
    fileInput.value = '';
  });

  async function handleFileUpload(file) {
    if (!currentRoomId) {
      showToast('Please join or create a room first to upload music!', '⚠️');
      authModal.style.display = 'flex';
      return;
    }
    setStatus(`Uploading "${file.name}"...`, true);

    const formData = new FormData();
    formData.append('audio', file);

    try {
      const res = await fetch(`/api/rooms/${currentRoomId}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      setStatus('', false);
      showToast(`Track "${file.name}" loaded!`, '🎶');
      initVisualizer();
    } catch (err) {
      setStatus('', false);
      showToast('Upload failed: ' + err.message, '❌');
    }
  }

  // YouTube Ingestion
  ytForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = ytUrlInput.value.trim();
    if (!url || !currentRoomId) return;

    setStatus('Extracting & converting YouTube audio...', true);
    ytUrlInput.value = '';

    try {
      const res = await fetch(`/api/rooms/${currentRoomId}/youtube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
      }

      const data = await res.json();
      setStatus('', false);
      showToast(`Loaded YouTube track: ${data.track.title}`, '▶️');
      initVisualizer();
    } catch (err) {
      setStatus('', false);
      showToast('YouTube extraction failed: ' + err.message, '❌');
    }
  });

  // YouTube Live Chat Avatars & Rendering
  const AVATAR_COLORS = [
    '#e53935', '#d81b60', '#8e24aa', '#3949ab',
    '#1e88e5', '#00acc1', '#00897b', '#43a047',
    '#fb8c00', '#f4511e'
  ];

  function getAvatarColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  function renderChatMessage(msg) {
    if (msg.is_system) {
      const notice = document.createElement('div');
      notice.className = 'ytm-system-notice';
      notice.textContent = msg.content;
      chatMessages.appendChild(notice);
    } else {
      const isMine = msg.sender === myNickname;
      const row = document.createElement('div');
      row.className = 'ytm-chat-row';

      const initial = (msg.sender || '?')[0].toUpperCase();
      const color = getAvatarColor(msg.sender || '');
      const time = new Date(msg.timestamp_ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      row.innerHTML = `
        <div class="ytm-avatar" style="background: ${color}">${initial}</div>
        <div class="ytm-msg-body">
          <div class="ytm-author-line">
            <span class="ytm-author-name ${isMine ? 'is-me' : ''}">${isMine ? 'You' : escapeHtml(msg.sender)}</span>
            <span class="ytm-msg-time">${time}</span>
          </div>
          <div class="ytm-msg-content">${escapeHtml(msg.content)}</div>
        </div>
      `;
      chatMessages.appendChild(row);
    }
    requestAnimationFrame(() => {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });
  }

  // Send Chat Message
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const content = chatInput.value.trim();
    if (!content || !ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
      type: 'CHAT',
      payload: { content }
    }));
    chatInput.value = '';
    requestAnimationFrame(() => {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });
  });

  // Copy Invite Link
  copyInviteBtn.addEventListener('click', () => {
    if (!currentRoomId) return;
    const inviteUrl = `${window.location.origin}/room/${currentRoomId}?pin=${encodeURIComponent(currentPasscode || '')}`;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      showToast('Copied room link with PIN to clipboard!', '📋');
    }).catch(() => {
      prompt('Copy invite link:', inviteUrl);
    });
  });

  // Header Chat Button
  const headerChatBtn = document.getElementById('headerChatBtn');
  if (headerChatBtn) {
    headerChatBtn.addEventListener('click', () => {
      const chatInput = document.getElementById('chatInput');
      const chatDrawer = document.querySelector('.ytm-chat-drawer');
      if (chatDrawer) {
        chatDrawer.scrollIntoView({ behavior: 'smooth' });
      }
      if (chatInput) {
        setTimeout(() => chatInput.focus(), 150);
      }
    });
  }

  /* =========================================================
     SPOKENGUIDE-STYLE AMBIENT CANVAS & CURSOR MOVEMENT EFFECT
     ========================================================= */
  function initAmbientCanvas() {
    const ambientCanvas = document.getElementById('ambientCanvas');
    if (!ambientCanvas) return;
    const ctx = ambientCanvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;

    function resize() {
      width = ambientCanvas.width = window.innerWidth;
      height = ambientCanvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    // Mouse / Pointer Tracking
    let targetX = width / 2;
    let targetY = height / 2;
    let lerpX = width / 2;
    let lerpY = height / 2;
    let prevX = width / 2;
    let prevY = height / 2;
    let lastSpawnX = width / 2;
    let lastSpawnY = height / 2;
    let mouseSpeed = 0;
    let lastMoveTime = Date.now();

    const orbs = {
      orb1: document.querySelector('.orb-1'),
      orb2: document.querySelector('.orb-2'),
      orb3: document.querySelector('.orb-3'),
      orb4: document.querySelector('.orb-4'),
    };

    // Color palettes inspired by spokenguide & tailored to amra-shunbo
    const PALETTES = [
      { r: 255, g: 51, b: 75, name: 'crimson' },   // amra-shunbo red
      { r: 99, g: 102, b: 241, name: 'indigo' },   // spokenguide indigo
      { r: 6, g: 182, b: 212, name: 'cyan' },      // cyber cyan
      { r: 244, g: 63, b: 94, name: 'rose' },      // lotus rose
      { r: 168, g: 85, b: 247, name: 'violet' },   // cosmic violet
      { r: 251, g: 191, b: 36, name: 'gold' }      // starlight gold
    ];

    const ripples = [];
    const stars = [];
    const MAX_RIPPLES = 45;
    const MAX_STARS = 70;

    function getRandomColor() {
      return PALETTES[Math.floor(Math.random() * PALETTES.length)];
    }

    function spawnRipple(x, y, vx, vy, isClick = false) {
      if (ripples.length >= MAX_RIPPLES) {
        ripples.shift();
      }
      const color = getRandomColor();
      const styles = ['organic', 'bloom', 'star', 'fluid'];
      const style = isClick ? 'bloom' : styles[Math.floor(Math.random() * styles.length)];
      const maxRadius = isClick ? (Math.random() * 60 + 170) : (Math.random() * 50 + 95);
      const speed = isClick ? 2.6 : (Math.random() * 0.8 + 1.2);
      const initialAlpha = isClick ? 0.65 : (Math.random() * 0.15 + 0.35);

      ripples.push({
        x,
        y,
        radius: isClick ? 12 : 5,
        maxRadius,
        speed,
        alpha: initialAlpha,
        color,
        style,
        seed: Math.random() * 200,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.02,
        vx: vx * 0.25 + (Math.random() - 0.5) * 0.3,
        vy: vy * 0.25 + (Math.random() - 0.5) * 0.3,
        isClick
      });
    }

    function spawnStar(x, y, vx, vy, isClick = false) {
      if (stars.length >= MAX_STARS) {
        stars.shift();
      }
      const count = isClick ? 8 : 1;
      for (let k = 0; k < count; k++) {
        const angle = isClick ? ((k / count) * Math.PI * 2 + Math.random() * 0.2) : (Math.random() * Math.PI * 2);
        const force = isClick ? (Math.random() * 3 + 1.5) : (Math.random() * 0.8 + 0.2);
        const color = getRandomColor();
        stars.push({
          x: x + (Math.random() - 0.5) * 6,
          y: y + (Math.random() - 0.5) * 6,
          vx: Math.cos(angle) * force + vx * 0.15,
          vy: Math.sin(angle) * force + vy * 0.15,
          size: Math.random() * 2 + 1.2,
          alpha: Math.random() * 0.4 + 0.5,
          maxLife: Math.random() * 40 + 35,
          life: 0,
          color,
          seed: Math.random() * 100
        });
      }
    }

    // Pointer movement tracking
    function onPointerMove(e) {
      lastMoveTime = Date.now();
      targetX = e.clientX;
      targetY = e.clientY;

      const dx = targetX - lastSpawnX;
      const dy = targetY - lastSpawnY;
      const dist = Math.hypot(dx, dy);

      if (dist > 7) {
        const vx = (targetX - prevX);
        const vy = (targetY - prevY);
        spawnRipple(targetX, targetY, vx, vy, false);
        if (Math.random() < 0.45) {
          spawnStar(targetX, targetY, vx, vy, false);
        }
        lastSpawnX = targetX;
        lastSpawnY = targetY;
      }
      prevX = targetX;
      prevY = targetY;
    }

    function onPointerDown(e) {
      targetX = e.clientX;
      targetY = e.clientY;
      spawnRipple(targetX, targetY, 0, 0, true);
      spawnStar(targetX, targetY, 0, 0, true);
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches[0]) {
        onPointerMove(e.touches[0]);
      }
    }, { passive: true });
    window.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) {
        onPointerDown(e.touches[0]);
      }
    }, { passive: true });

    let t = 0;

    function renderAmbient() {
      requestAnimationFrame(renderAmbient);

      if (document.hidden) return;

      t += 0.02;

      // Smooth lerp for cursor coordinates
      lerpX += (targetX - lerpX) * 0.14;
      lerpY += (targetY - lerpY) * 0.14;

      const curSpeed = Math.hypot(targetX - lerpX, targetY - lerpY);
      mouseSpeed += (curSpeed - mouseSpeed) * 0.1;

      ctx.clearRect(0, 0, width, height);

      // Music reactive audio energy factor
      const musicBoost = (typeof smoothBassEnergy !== 'undefined' ? smoothBassEnergy : 0);

      // 1. Dynamic Cursor Spotlight Glow
      const isRecent = (Date.now() - lastMoveTime) < 4000;
      const spotlightAlpha = isRecent ? (0.85 + musicBoost * 0.35) : Math.max(0.2, 0.85 - (Date.now() - lastMoveTime - 4000) / 3000);
      const baseRadius = 220 + Math.min(mouseSpeed * 3, 100) + (musicBoost * 70);

      const spot = ctx.createRadialGradient(lerpX, lerpY, 0, lerpX, lerpY, baseRadius);
      spot.addColorStop(0, `rgba(255, 255, 255, ${0.08 * spotlightAlpha})`);
      spot.addColorStop(0.22, `rgba(255, 51, 75, ${0.11 * spotlightAlpha})`);
      spot.addColorStop(0.5, `rgba(99, 102, 241, ${0.09 * spotlightAlpha})`);
      spot.addColorStop(0.78, `rgba(6, 182, 212, ${0.04 * spotlightAlpha})`);
      spot.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.beginPath();
      ctx.arc(lerpX, lerpY, baseRadius, 0, Math.PI * 2);
      ctx.fillStyle = spot;
      ctx.fill();

      // 2. 3D Parallax on ambient floating orbs
      const tiltX = (lerpX / width) * 2 - 1;
      const tiltY = (lerpY / height) * 2 - 1;
      if (orbs.orb1) orbs.orb1.style.transform = `translate3d(${tiltX * -35}px, ${tiltY * -30}px, 0)`;
      if (orbs.orb2) orbs.orb2.style.transform = `translate3d(${tiltX * 40}px, ${tiltY * 35}px, 0)`;
      if (orbs.orb3) orbs.orb3.style.transform = `translate3d(${tiltX * -25}px, ${tiltY * 30}px, 0)`;
      if (orbs.orb4) orbs.orb4.style.transform = `translate3d(${tiltX * 30}px, ${tiltY * -25}px, 0)`;

      // 3. Render Ripples (spokenguide style)
      for (let i = ripples.length - 1; i >= 0; i--) {
        const p = ripples[i];
        p.radius += p.speed;
        p.rotation += p.rotationSpeed;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.98;
        p.vy *= 0.98;

        const progress = p.radius / p.maxRadius;
        const currentAlpha = Math.max(0, (1 - progress) * p.alpha * (1 + musicBoost * 0.4));

        if (progress >= 1 || currentAlpha <= 0.005) {
          ripples.splice(i, 1);
          continue;
        }

        const col = p.color;

        if (p.style === 'organic') {
          ctx.beginPath();
          const segments = 36;
          for (let s = 0; s <= segments; s++) {
            const angle = (s / segments) * Math.PI * 2 + p.rotation;
            const wave = Math.sin(angle * 3 + p.seed + t * 2) * (p.radius * 0.12)
                       + Math.cos(angle * 5 - p.seed) * (p.radius * 0.06);
            const r = Math.max(2, p.radius + wave);
            const px = p.x + Math.cos(angle) * r;
            const py = p.y + Math.sin(angle) * r;
            if (s === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();

          const grad = ctx.createRadialGradient(p.x, p.y, p.radius * 0.1, p.x, p.y, p.radius);
          grad.addColorStop(0, `rgba(${col.r}, ${col.g}, ${col.b}, ${currentAlpha * 0.25})`);
          grad.addColorStop(0.6, `rgba(${col.r}, ${col.g}, ${col.b}, ${currentAlpha * 0.08})`);
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = grad;
          ctx.fill();

          ctx.strokeStyle = `rgba(${col.r}, ${col.g}, ${col.b}, ${currentAlpha * 0.45})`;
          ctx.lineWidth = p.isClick ? 1.8 : 1.1;
          ctx.stroke();

        } else if (p.style === 'bloom') {
          // Petal/Bloom shape
          const petalCount = 6;
          const petalLen = p.radius * 0.48;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          for (let k = 0; k < petalCount; k++) {
            ctx.rotate((Math.PI * 2) / petalCount);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(-petalLen * 0.5, petalLen * 0.5, 0, petalLen);
            ctx.quadraticCurveTo(petalLen * 0.5, petalLen * 0.5, 0, 0);
            ctx.closePath();
            ctx.fillStyle = `rgba(${col.r}, ${col.g}, ${col.b}, ${currentAlpha * 0.16})`;
            ctx.fill();
            ctx.strokeStyle = `rgba(${col.r}, ${col.g}, ${col.b}, ${currentAlpha * 0.42})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
          ctx.restore();

        } else if (p.style === 'star') {
          // Twinkling core star
          const grad = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, p.radius * 0.45);
          grad.addColorStop(0, `rgba(255, 255, 255, ${currentAlpha * 0.85})`);
          grad.addColorStop(0.35, `rgba(${col.r}, ${col.g}, ${col.b}, ${currentAlpha * 0.5})`);
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius * 0.45, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();

        } else {
          // Fluid expanding ring
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${col.r}, ${col.g}, ${col.b}, ${currentAlpha * 0.45})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();

          if (p.radius > 20) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius - 14, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${col.r}, ${col.g}, ${col.b}, ${currentAlpha * 0.2})`;
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
        }
      }

      // 4. Render Stars / Sparks
      for (let j = stars.length - 1; j >= 0; j--) {
        const star = stars[j];
        star.life++;
        star.x += star.vx;
        star.y += star.vy;
        star.vx *= 0.96;
        star.vy *= 0.96;

        const progress = star.life / star.maxLife;
        const currentAlpha = Math.max(0, (1 - progress) * star.alpha);

        if (progress >= 1 || currentAlpha <= 0.01) {
          stars.splice(j, 1);
          continue;
        }

        const twinkle = 0.7 + 0.3 * Math.sin(t * 8 + star.seed);
        const col = star.color;

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size * (1 - progress * 0.3), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${col.r}, ${col.g}, ${col.b}, ${currentAlpha * twinkle})`;
        ctx.shadowColor = `rgba(${col.r}, ${col.g}, ${col.b}, 0.8)`;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    renderAmbient();
  }

  // Initialize interactive ambient background
  initAmbientCanvas();

})();

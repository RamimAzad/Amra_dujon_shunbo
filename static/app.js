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
  let smoothMidEnergy = 0;
  let smoothTrebleEnergy = 0;
  let lastBassRaw = 0;
  let lastBeatKickTime = 0;
  let shockwaveRadius = 0;
  let shockwaveAlpha = 0;
  let flowPhase = 0;
  let rhythmicSwell = 0;
  let lastFrameTime = performance.now();

  // Global Musical Synchronization State shared across visualizer & ambient engines
  const musicalState = {
    isPlaying: false,
    bass: 0,
    mids: 0,
    treble: 0,
    avg: 0,
    beatStage: 1,
    beatKick: false,
    kickIntensity: 0,
    time: 0
  };

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
        analyser.smoothingTimeConstant = 0.88; // Composed, silky, less twitchy/sensitive
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
      const boxRadius = albumBox ? (albumBox.offsetWidth / 2) : 90;
      const innerRadius = boxRadius + 8;
      // Maintain the generous ~110px space between circle and border on all 4 sides (left, right, top, bottom)
      const targetOuterRadius = Math.min(cx, cy) * 0.65;
      const maxExtension = Math.max(30, targetOuterRadius - innerRadius);

      const now = performance.now();
      const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
      lastFrameTime = now;

      if (!analyser || audio.paused) {
        // Decay musical state gracefully when paused
        smoothBassEnergy += (0 - smoothBassEnergy) * 0.08;
        smoothMidEnergy += (0 - smoothMidEnergy) * 0.08;
        smoothTrebleEnergy += (0 - smoothTrebleEnergy) * 0.08;
        rhythmicSwell *= 0.88;
        flowPhase += 0.8 * dt; // gentle idle drift

        musicalState.isPlaying = false;
        musicalState.bass = smoothBassEnergy;
        musicalState.mids = smoothMidEnergy;
        musicalState.treble = smoothTrebleEnergy;
        musicalState.avg = 0;
        musicalState.beatStage = 1;
        musicalState.beatKick = false;
        musicalState.kickIntensity = 0;

        // Idle Radial Breathing Halo
        const t = Date.now() / 700;
        for (let i = 0; i < RADIAL_BAR_COUNT; i++) {
          const angle = (i / RADIAL_BAR_COUNT) * Math.PI * 2 - Math.PI / 2;
          const w1 = Math.sin(t * 1.4 + angle * 4);
          const w2 = Math.cos(t * 2.0 - angle * 2);
          const idleLen = Math.max(6, ((w1 + w2) * 0.5 * 0.5 + 0.5) * 24 + 8);

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
          canvasCtx.lineWidth = 2.4;
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

      // Measure Bass (bins 1-5), Mids (bins 6-24), Treble (bins 25-64) with gentle smoothing
      const bassRaw = (dataArray[1] + dataArray[2] + dataArray[3] + dataArray[4] + dataArray[5]) / (5 * 255);
      smoothBassEnergy += (bassRaw - smoothBassEnergy) * 0.16;

      let midSum = 0;
      for (let m = 6; m <= 24; m++) midSum += dataArray[m];
      const midRaw = midSum / (19 * 255);
      smoothMidEnergy += (midRaw - smoothMidEnergy) * 0.15;

      let trebleSum = 0;
      for (let tr = 25; tr <= 64; tr++) trebleSum += dataArray[tr];
      const trebleRaw = trebleSum / (40 * 255);
      smoothTrebleEnergy += (trebleRaw - smoothTrebleEnergy) * 0.18;

      let sumEnergy = 0;
      for (let j = 0; j < 48; j++) sumEnergy += dataArray[j];
      const avgEnergy = sumEnergy / (48 * 255);

      // Controlled multi-stage beat detection with stable thresholds
      let beatStage = 1;
      let stageLengthMult = 0.76; // Graceful, composed baseline
      let peakHoldDuration = 0;

      if (avgEnergy >= 0.46 || smoothBassEnergy >= 0.56) {
        beatStage = 3;
        stageLengthMult = 1.28; // Controlled soaring peaks on heavy drops
        peakHoldDuration = 14;  // Peak hold on heavy drops
      } else if (avgEnergy >= 0.24 || smoothBassEnergy >= 0.32) {
        beatStage = 2;
        stageLengthMult = 1.02; // Elegant groove
        peakHoldDuration = 6;
      }

      // Rhythmic Beat Kick Detection (requires genuine rising edge & composed cooldown)
      const bassDelta = bassRaw - lastBassRaw;
      lastBassRaw = bassRaw;

      let isBeatKick = false;
      let kickIntensity = 0;
      if (bassDelta > 0.14 && (now - lastBeatKickTime) > 280) {
        isBeatKick = true;
        kickIntensity = Math.min(1.0, bassDelta * 3.0);
        lastBeatKickTime = now;
      }

      // Composed Rhythmic Flow Dynamics
      const flowSpeed = 1.8 + smoothBassEnergy * 3.6 + smoothMidEnergy * 2.4;
      flowPhase += flowSpeed * dt;

      if (isBeatKick) {
        rhythmicSwell = Math.min(0.75, rhythmicSwell + 0.40 + kickIntensity * 0.35);
      } else {
        rhythmicSwell *= 0.92;
      }

      // Sync into shared musical state
      musicalState.isPlaying = true;
      musicalState.bass = smoothBassEnergy;
      musicalState.mids = smoothMidEnergy;
      musicalState.treble = smoothTrebleEnergy;
      musicalState.avg = avgEnergy;
      musicalState.beatStage = beatStage;
      musicalState.beatKick = isBeatKick;
      musicalState.kickIntensity = kickIntensity;
      musicalState.time = now;

      const baseInner = innerRadius;

      // Controlled Beat Scaling & Glow on Center Album Artwork (composed, gentle bounce)
      if (albumBox) {
        const discScale = 1.0 + smoothBassEnergy * 0.055 + rhythmicSwell * 0.045;
        const glowSpread = 28 + smoothBassEnergy * 35 + rhythmicSwell * 25;
        const glowAlpha = 0.30 + smoothBassEnergy * 0.35 + rhythmicSwell * 0.20;

        albumBox.style.transform = `scale(${discScale})`;
        albumBox.style.boxShadow = `0 0 ${glowSpread}px rgba(255, 20, 60, ${glowAlpha}), 0 0 ${glowSpread * 1.8}px rgba(99, 102, 241, ${glowAlpha * 0.50})`;

        if (beatStage === 3 && smoothBassEnergy > 0.65 && shockwaveAlpha <= 0.1) {
          shockwaveRadius = baseInner;
          shockwaveAlpha = 0.85;
        }
      }

      // Draw expanding beat shockwave ring inside showcase if active
      if (shockwaveAlpha > 0.02) {
        canvasCtx.beginPath();
        canvasCtx.arc(cx, cy, shockwaveRadius, 0, Math.PI * 2);
        canvasCtx.strokeStyle = `rgba(255, 50, 75, ${shockwaveAlpha})`;
        canvasCtx.lineWidth = 2.4;
        canvasCtx.stroke();
        shockwaveRadius += 4.0 + smoothBassEnergy * 2.0;
        shockwaveAlpha *= 0.91;
      }

      // 1. Draw Audio-Reactive Glowing Base Track Ring
      const currentInnerCenter = baseInner + (smoothBassEnergy * 5) + (rhythmicSwell * 3.5);
      canvasCtx.beginPath();
      canvasCtx.arc(cx, cy, currentInnerCenter, 0, Math.PI * 2);
      canvasCtx.strokeStyle = `rgba(255, 30, 60, ${0.25 + smoothBassEnergy * 0.35})`;
      canvasCtx.lineWidth = 1.8 + smoothBassEnergy * 1.2;
      canvasCtx.stroke();

      // 2. Draw Rotating Outer Celestial Orbit Ring
      const orbitRadius = baseInner + maxExtension * (0.68 + smoothBassEnergy * 0.22);
      canvasCtx.beginPath();
      canvasCtx.arc(cx, cy, orbitRadius, 0, Math.PI * 2);
      canvasCtx.strokeStyle = `rgba(99, 102, 241, ${0.10 + smoothMidEnergy * 0.20})`;
      canvasCtx.lineWidth = 1.2;
      canvasCtx.lineDashOffset = -flowPhase * 14;
      canvasCtx.setLineDash([7, 11]);
      canvasCtx.stroke();
      canvasCtx.setLineDash([]);

      // Map 48 logarithmic bands mirrored symmetrically around 96 radial lines
      const halfCount = RADIAL_BAR_COUNT / 2;
      const beatDancePulse = 1.0 + smoothBassEnergy * 0.28 + (isBeatKick ? kickIntensity * 0.24 : 0);
      const tips = new Array(RADIAL_BAR_COUNT);

      for (let i = 0; i < RADIAL_BAR_COUNT; i++) {
        // Symmetrical mirroring: left and right halves mirror from bottom to top
        const symIdx = i < halfCount ? (halfCount - 1 - i) : (i - halfCount);
        const norm = symIdx / (halfCount - 1);
        const binIdx = Math.pow(norm, 2.0) * (bufferLength - 4) + 1;
        const low = Math.floor(binIdx);
        const high = Math.min(low + 1, bufferLength - 1);
        const frac = binIdx - low;
        let val = dataArray[low] * (1 - frac) + dataArray[high] * frac;

        // Controlled treble curve with lively stage multiplier
        const boost = (1.0 + Math.pow(norm, 0.6) * 0.5) * stageLengthMult;
        val = Math.min(255, val * boost);

        // Power curve (1.20) for rich, stable dynamic range
        const normalizedPower = Math.pow(val / 255, 1.20);

        // Continuous Rhythmic Flowing Harmonics (composed amplitude)
        const angle = (i / RADIAL_BAR_COUNT) * Math.PI * 2 - Math.PI / 2;
        const wave1 = Math.sin(angle * 3 + flowPhase * 1.2) * (smoothBassEnergy * 10 + smoothMidEnergy * 6);
        const wave2 = Math.cos(angle * 6 - flowPhase * 1.5) * (smoothBassEnergy * 6 + smoothTrebleEnergy * 5);
        const wave3 = Math.sin(angle * 9 + flowPhase * 2.2) * (smoothMidEnergy * 4);
        const rhythmicFlow = wave1 + wave2 + wave3;

        const beatSurge = 1.0 + smoothBassEnergy * 0.28 + rhythmicSwell * 0.24;
        const targetLen = Math.max(6, (normalizedPower * maxExtension * beatSurge) + rhythmicFlow);

        // Composed, silky attack & smooth decay
        if (targetLen >= radialHeights[i]) {
          radialHeights[i] += (targetLen - radialHeights[i]) * 0.38;
          if (targetLen > maxExtension * 0.55 && beatStage >= 2) {
            radialPeakHolds[i] = peakHoldDuration;
          }
        } else {
          if (radialPeakHolds[i] > 0) {
            radialPeakHolds[i]--;
            radialHeights[i] = Math.max(targetLen, radialHeights[i] * 0.988);
          } else {
            radialHeights[i] += (targetLen - radialHeights[i]) * 0.14;
          }
        }

        // Peak dots physics with kick bounce
        if (radialHeights[i] >= radialPeaks[i]) {
          radialPeaks[i] = radialHeights[i];
          radialPeakSpeeds[i] = 0;
        } else {
          radialPeakSpeeds[i] += 0.28;
          radialPeaks[i] = Math.max(0, radialPeaks[i] - radialPeakSpeeds[i]);
        }
        if (isBeatKick) {
          radialPeaks[i] = Math.max(radialPeaks[i], radialHeights[i] + kickIntensity * 3.5);
        }

        // Base circle ripples harmonically with the rhythmic flow
        const baseWave = Math.sin(angle * 6 + flowPhase * 1.0) * (smoothBassEnergy * 3.5 + rhythmicSwell * 2.0);
        const currentInner = baseInner + (smoothBassEnergy * 5) + (rhythmicSwell * 3.5) + baseWave;

        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        const x1 = cx + cosA * currentInner;
        const y1 = cy + sinA * currentInner;
        const x2 = cx + cosA * (currentInner + radialHeights[i]);
        const y2 = cy + sinA * (currentInner + radialHeights[i]);

        tips[i] = { x: x2, y: y2 };

        // Dynamic Line Gradient (shifts hotter & more vivid on beats)
        const lineGrad = canvasCtx.createLinearGradient(x1, y1, x2, y2);
        if (beatStage === 3) {
          lineGrad.addColorStop(0, '#e11d48');   // rose
          lineGrad.addColorStop(0.35, '#ff0033'); // amra crimson
          lineGrad.addColorStop(0.75, '#ff3366'); // neon magenta
          lineGrad.addColorStop(1.0, '#ffcc00');  // hot starlight gold
        } else if (beatStage === 2) {
          lineGrad.addColorStop(0, '#cc0022');
          lineGrad.addColorStop(0.4, '#ff0033');
          lineGrad.addColorStop(0.8, '#ff5533');
          lineGrad.addColorStop(1.0, '#ffaa22');  // bright warm amber
        } else {
          lineGrad.addColorStop(0, '#990018');
          lineGrad.addColorStop(0.5, '#ee002e');
          lineGrad.addColorStop(1.0, '#ff4422');
        }

        // Render Radial Ray with audio-reactive width
        canvasCtx.beginPath();
        canvasCtx.moveTo(x1, y1);
        canvasCtx.lineTo(x2, y2);
        canvasCtx.strokeStyle = lineGrad;
        canvasCtx.lineWidth = (beatStage === 3 ? 3.0 : 2.6) + smoothBassEnergy * 0.6;
        canvasCtx.lineCap = 'round';
        canvasCtx.stroke();

        // Render Floating Glowing Peak Orb
        if (radialPeaks[i] > 7) {
          const peakDist = currentInner + radialPeaks[i] + 3.8;
          const px = cx + cosA * peakDist;
          const py = cy + sinA * peakDist;

          canvasCtx.beginPath();
          canvasCtx.arc(px, py, beatStage === 3 ? (2.6 + smoothBassEnergy * 0.8) : 1.9, 0, Math.PI * 2);
          canvasCtx.fillStyle = beatStage === 3 ? '#fff5cc' : (beatStage === 2 ? '#ffeedd' : '#ffe0cc');
          canvasCtx.shadowColor = beatStage === 3 ? '#ffaa00' : '#ff2200';
          canvasCtx.shadowBlur = beatStage === 3 ? 10 : (beatStage === 2 ? 6 : 4);
          canvasCtx.fill();
          canvasCtx.shadowBlur = 0;
        }
      }

      // 3. Draw Fluid Rhythmic Contour Ribbon connecting the line tips in a glowing wave
      canvasCtx.beginPath();
      for (let k = 0; k <= RADIAL_BAR_COUNT; k++) {
        const idx = k % RADIAL_BAR_COUNT;
        const pt = tips[idx];
        if (k === 0) {
          canvasCtx.moveTo(pt.x, pt.y);
        } else {
          const prevIdx = (k - 1) % RADIAL_BAR_COUNT;
          const prevPt = tips[prevIdx];
          const midX = (prevPt.x + pt.x) / 2;
          const midY = (prevPt.y + pt.y) / 2;
          canvasCtx.quadraticCurveTo(prevPt.x, prevPt.y, midX, midY);
        }
      }
      canvasCtx.closePath();

      const ribbonAlpha = 0.24 + smoothBassEnergy * 0.28 + rhythmicSwell * 0.20;
      canvasCtx.strokeStyle = beatStage === 3 
        ? `rgba(255, 204, 0, ${ribbonAlpha})` 
        : (beatStage === 2 ? `rgba(255, 68, 102, ${ribbonAlpha})` : `rgba(255, 51, 75, ${ribbonAlpha * 0.70})`);
      canvasCtx.lineWidth = 1.6 + smoothBassEnergy * 1.0;
      canvasCtx.shadowColor = beatStage === 3 ? '#ffaa00' : '#ff0033';
      canvasCtx.shadowBlur = beatStage === 3 ? 11 : 6;
      canvasCtx.stroke();
      canvasCtx.shadowBlur = 0;
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
     WITH CONTROLLED AUDIO RHYTHM SYNCHRONIZATION
     ========================================================= */
  function initAmbientCanvas() {
    const ambientCanvas = document.getElementById('ambientCanvas');
    if (!ambientCanvas) return;
    const ctx = ambientCanvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;

    const ambientOrbsEl = document.getElementById('ambientOrbs');

    // Color palettes inspired by spokenguide & tailored to amra-shunbo
    const PALETTES = [
      { r: 255, g: 51, b: 75, name: 'crimson' },   // amra-shunbo red
      { r: 99, g: 102, b: 241, name: 'indigo' },   // spokenguide indigo
      { r: 6, g: 182, b: 212, name: 'cyan' },      // cyber cyan
      { r: 244, g: 63, b: 94, name: 'rose' },      // lotus rose
      { r: 168, g: 85, b: 247, name: 'violet' },   // cosmic violet
      { r: 251, g: 191, b: 36, name: 'gold' }      // starlight gold
    ];

    function getRandomColor() {
      return PALETTES[Math.floor(Math.random() * PALETTES.length)];
    }

    // Persistent Dancing Celestial Embers
    const CELESTIAL_COUNT = 48;
    const celestialEmbers = [];

    function initCelestialEmbers() {
      celestialEmbers.length = 0;
      const w = width || window.innerWidth;
      const h = height || window.innerHeight;
      for (let i = 0; i < CELESTIAL_COUNT; i++) {
        celestialEmbers.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.25 - 0.08, // subtle natural upward cosmic drift
          radius: Math.random() * 1.8 + 1.1,
          color: getRandomColor(),
          alpha: Math.random() * 0.4 + 0.32,
          phase: Math.random() * Math.PI * 2,
          danceFreq: Math.random() * 0.9 + 0.8,
          lift: 0
        });
      }
    }

    function resize() {
      width = ambientCanvas.width = window.innerWidth;
      height = ambientCanvas.height = window.innerHeight;
      if (celestialEmbers.length === 0) {
        initCelestialEmbers();
      }
    }
    window.addEventListener('resize', resize);
    resize();
    initCelestialEmbers();

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
    let lastProcessedBeatTime = 0;

    const ripples = [];
    const stars = [];
    const MAX_RIPPLES = 50;
    const MAX_STARS = 75;

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
        isClick,
        isMusicBeat: false
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

    // Helper: Screen position of Center Album Disc
    function getAlbumCenter() {
      const albumBox = document.getElementById('albumArtworkBox');
      if (albumBox) {
        const rect = albumBox.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
      }
      return { x: width / 2, y: height / 2 };
    }

    // Music Beat Wave Emission from Album Center
    function spawnMusicBeatWave(stage, intensity) {
      if (ripples.length >= MAX_RIPPLES) ripples.shift();
      const center = getAlbumCenter();

      let color;
      let style = 'fluid';
      let maxRadius = Math.max(width, height) * 0.45;
      let speed = 2.4 + intensity * 1.6;
      let alpha = 0.28 + intensity * 0.2;

      if (stage === 3) {
        // Drop / Heavy Kick: dramatic blooming lotus or organic shockwave
        color = Math.random() < 0.5 ? PALETTES[5] : PALETTES[0]; // gold or crimson
        style = Math.random() < 0.6 ? 'bloom' : 'organic';
        maxRadius = Math.max(width, height) * 0.65;
        speed = 3.6 + intensity * 2.0;
        alpha = 0.42;

        // Radiate 6-8 outward sparks from disc rim
        for (let k = 0; k < 6; k++) {
          const angle = (k / 6) * Math.PI * 2 + Math.random() * 0.3;
          const force = 2.0 + Math.random() * 2.5;
          if (stars.length < MAX_STARS) {
            stars.push({
              x: center.x + Math.cos(angle) * 75,
              y: center.y + Math.sin(angle) * 75,
              vx: Math.cos(angle) * force,
              vy: Math.sin(angle) * force,
              size: Math.random() * 2.2 + 1.2,
              alpha: 0.8,
              maxLife: Math.random() * 35 + 25,
              life: 0,
              color,
              seed: Math.random() * 100
            });
          }
        }
      } else if (stage === 2) {
        // Melodic groove: cyber cyan or lotus rose
        color = Math.random() < 0.5 ? PALETTES[2] : PALETTES[3]; // cyan or rose
        style = 'organic';
        maxRadius = Math.max(width, height) * 0.48;
        speed = 2.6 + intensity * 1.2;
        alpha = 0.30;
      } else {
        // Gentle groove: spokenguide indigo or cosmic violet
        color = Math.random() < 0.5 ? PALETTES[1] : PALETTES[4]; // indigo or violet
        style = 'fluid';
        maxRadius = Math.max(width, height) * 0.35;
        speed = 2.0;
        alpha = 0.22;
      }

      ripples.push({
        x: center.x,
        y: center.y,
        radius: 75,
        maxRadius,
        speed,
        alpha,
        color,
        style,
        seed: Math.random() * 200,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.015,
        vx: 0,
        vy: 0,
        isClick: false,
        isMusicBeat: true
      });
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

    // Render Controlled Rhythmic Auroras (Silk Wave Ribbons)
    function drawRhythmicRibbon(yRatio, col1, col2, freq, speed, ampScale) {
      const baseY = height * yRatio;
      const amp = (10 + musicalState.bass * 22 + musicalState.mids * 14) * ampScale;

      ctx.beginPath();
      const step = 24;
      for (let x = 0; x <= width + step; x += step) {
        const wave = Math.sin(x * freq + t * speed) * amp 
                   + Math.cos(x * (freq * 1.5) - t * (speed * 0.7)) * (amp * 0.42);
        const y = baseY + wave;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      const grad = ctx.createLinearGradient(0, baseY - amp, width, baseY + amp);
      const alpha = 0.04 + musicalState.bass * 0.06;
      grad.addColorStop(0, `rgba(${col1.r}, ${col1.g}, ${col1.b}, ${alpha * 0.2})`);
      grad.addColorStop(0.5, `rgba(${col2.r}, ${col2.g}, ${col2.b}, ${alpha})`);
      grad.addColorStop(1, `rgba(${col1.r}, ${col1.g}, ${col1.b}, ${alpha * 0.1})`);

      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.0 + musicalState.bass * 1.5;
      ctx.stroke();
    }

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

      const isPlaying = musicalState.isPlaying;
      const musicBoost = musicalState.bass;

      // Trigger Beat Wave on fresh musical beat kick
      if (isPlaying && musicalState.beatKick && musicalState.time !== lastProcessedBeatTime) {
        lastProcessedBeatTime = musicalState.time;
        spawnMusicBeatWave(musicalState.beatStage, musicalState.kickIntensity);
        // Gentle buoyant lift on dancing embers
        for (let i = 0; i < celestialEmbers.length; i++) {
          celestialEmbers[i].lift = Math.min(14, celestialEmbers[i].lift + (3.5 + Math.random() * 4.5) * musicalState.kickIntensity);
        }
      }

      // 1. Dynamic Cursor Spotlight Glow (composed breathing)
      const isRecent = (Date.now() - lastMoveTime) < 4000;
      const spotlightAlpha = isRecent ? (0.85 + musicBoost * 0.25) : Math.max(0.2, 0.85 - (Date.now() - lastMoveTime - 4000) / 3000);
      const baseRadius = 220 + Math.min(mouseSpeed * 3, 100) + (musicBoost * 55);

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

      // 2. Parallax and Audio Modulation on Ambient Glow Orbs
      const tiltX = (lerpX / width) * 2 - 1;
      const tiltY = (lerpY / height) * 2 - 1;
      if (ambientOrbsEl) {
        ambientOrbsEl.style.setProperty('--music-bass', musicalState.bass.toFixed(3));
        ambientOrbsEl.style.setProperty('--music-mids', musicalState.mids.toFixed(3));
        ambientOrbsEl.style.setProperty('--music-treble', musicalState.treble.toFixed(3));
        ambientOrbsEl.style.setProperty('--tilt-x', (tiltX * 28).toFixed(1) + 'px');
        ambientOrbsEl.style.setProperty('--tilt-y', (tiltY * 22).toFixed(1) + 'px');
      }

      // 3. Render Controlled Rhythmic Auroras (Silk Wave Ribbons)
      drawRhythmicRibbon(0.72, PALETTES[2], PALETTES[1], 0.0025, 1.1, 1.0); // Cyan & Indigo
      drawRhythmicRibbon(0.85, PALETTES[0], PALETTES[3], 0.0032, -0.9, 0.85); // Crimson & Rose

      // 4. Render Dancing Celestial Embers (composed, gentle rhythmic sway)
      for (let i = 0; i < celestialEmbers.length; i++) {
        const ember = celestialEmbers[i];
        ember.x += ember.vx;
        ember.y += ember.vy;

        if (ember.x < -20) ember.x = width + 20;
        if (ember.x > width + 20) ember.x = -20;
        if (ember.y < -20) ember.y = height + 20;
        if (ember.y > height + 20) ember.y = -20;

        // Controlled rhythmic dancing math
        const bob = isPlaying
          ? (Math.sin(t * ember.danceFreq * 2.4 + ember.phase) * (1.2 + musicalState.mids * 3.8) - ember.lift)
          : Math.sin(t * 0.8 + ember.phase) * 1.5;

        const sway = isPlaying
          ? (Math.cos(t * ember.danceFreq * 1.8 + ember.phase) * (0.9 + musicalState.treble * 2.6))
          : Math.cos(t * 0.6 + ember.phase) * 1.2;

        ember.lift *= 0.91;

        const twinkle = Math.sin(t * 5 + ember.phase) * 0.25 + 0.75;
        const audioGlow = isPlaying ? (1 + musicalState.bass * 0.7 + musicalState.treble * 0.5) : 1;
        const currentAlpha = Math.min(1.0, ember.alpha * twinkle * audioGlow);
        const col = ember.color;

        const drawX = ember.x + sway;
        const drawY = ember.y + bob;
        const currentRadius = ember.radius * (isPlaying ? (1 + musicalState.bass * 0.35) : 1);

        ctx.beginPath();
        ctx.arc(drawX, drawY, currentRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${col.r}, ${col.g}, ${col.b}, ${currentAlpha})`;
        ctx.shadowColor = `rgba(${col.r}, ${col.g}, ${col.b}, 0.75)`;
        ctx.shadowBlur = isPlaying ? (6 + musicalState.bass * 8) : 4;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // 5. Render Ripples (SpokenGuide cursor waves + Album beat waves)
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
          const segments = 40;
          for (let s = 0; s <= segments; s++) {
            const angle = (s / segments) * Math.PI * 2 + p.rotation;
            const wave = Math.sin(angle * 3 + p.seed + t * 2.2) * (p.radius * 0.12)
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
          ctx.lineWidth = (p.isClick || p.isMusicBeat) ? 1.8 : 1.1;
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

      // 6. Render Stars / Sparks
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

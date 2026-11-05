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
  const prevTrackBtn = document.getElementById('prevTrackBtn');
  const nextTrackBtn = document.getElementById('nextTrackBtn');
  const queueToggleBtn = document.getElementById('queueToggleBtn');
  const queueBadge = document.getElementById('queueBadge');
  const queueShelf = document.getElementById('queueShelf');
  const queueCloseBtn = document.getElementById('queueCloseBtn');
  const queueTitleText = document.getElementById('queueTitleText');
  const queueCountPill = document.getElementById('queueCountPill');
  const queueTracklist = document.getElementById('queueTracklist');
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
  const tabYtPlaylistBtn = document.getElementById('tabYtPlaylistBtn');
  const uploadTabContent = document.getElementById('uploadTabContent');
  const ytTabContent = document.getElementById('ytTabContent');
  const ytPlaylistTabContent = document.getElementById('ytPlaylistTabContent');
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const ytForm = document.getElementById('ytForm');
  const ytUrlInput = document.getElementById('ytUrlInput');
  const ytPlaylistForm = document.getElementById('ytPlaylistForm');
  const ytPlaylistUrlInput = document.getElementById('ytPlaylistUrlInput');
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

  // ========================================================
  // SNOWBALLSH/YUE AUDIO VISUALIZER ENGINE
  // Faithful 1:1 port of SnowballSH/yue (NCS-style Rust visualizer)
  // Matching core_ring.rs, spectrum.rs, fft.rs, and main.rs
  // ========================================================

  // Constants from SnowballSH/yue core_ring.rs & spectrum.rs
  const BASE_RADIUS_RATIO = 0.19;
  const MAX_BASS_PULSE_RATIO = 0.28;
  const GLOW_THICKNESS_RATIO = 0.12;
  const EDGE_THICKNESS_RATIO = 0.12;
  const FLOAT_AMPLITUDE_RATIO = 0.045;
  const FLOAT_BASS_BOOST_RATIO = 0.03;
  const FLOAT_SPEED_BASE = 0.3;
  const FLOAT_SPEED_BASS_SCALE = 0.08;

  const NUM_POINTS = 120;
  const MAX_BAR_HEIGHT = 180.0;
  const BASE_RING_RADIUS = 720.0 * 0.19; // 136.8
  const SPECTRUM_RADIUS_OFFSET_RATIO = 0.075;

  // The 6 official themes from SnowballSH/yue main.rs
  const YUE_THEMES = [
    { name: 'Cyan', r: 0, g: 255, b: 255, hex: '#00FFFF' },
    { name: 'Magenta', r: 255, g: 0, b: 255, hex: '#FF00FF' },
    { name: 'Yellow', r: 255, g: 255, b: 0, hex: '#FFFF00' },
    { name: 'Lime', r: 50, g: 255, b: 50, hex: '#32FF32' },
    { name: 'Pinkish Red', r: 255, g: 100, b: 100, hex: '#FF6464' },
    { name: 'White', r: 255, g: 255, b: 255, hex: '#FFFFFF' }
  ];
  let currentThemeIdx = 0;

  // Yue Top Header UI Elements
  const yueCycleThemeBtn = document.getElementById('yueCycleThemeBtn');
  const yueThemeSwatch = document.getElementById('yueThemeSwatch');
  const yueThemeLabel = document.getElementById('yueThemeLabel');
  const yueTrackDot = document.getElementById('yueTrackDot');
  const yueTrackName = document.getElementById('yueTrackName');

  function applyYueTheme(idx) {
    currentThemeIdx = (idx + YUE_THEMES.length) % YUE_THEMES.length;
    const theme = YUE_THEMES[currentThemeIdx];
    if (yueThemeSwatch) {
      yueThemeSwatch.style.background = theme.hex;
      yueThemeSwatch.style.boxShadow = `0 0 10px ${theme.hex}`;
    }
    if (yueTrackDot) {
      yueTrackDot.style.background = theme.hex;
      yueTrackDot.style.boxShadow = `0 0 10px ${theme.hex}`;
    }
    if (yueThemeLabel) {
      yueThemeLabel.textContent = `Theme: ${theme.name}`;
    }
  }

  if (yueCycleThemeBtn) {
    yueCycleThemeBtn.addEventListener('click', () => {
      applyYueTheme(currentThemeIdx + 1);
    });
  }
  applyYueTheme(0);

  // CoreRing Engine (exact math from core_ring.rs)
  class YueCoreRing {
    constructor() {
      this.baseRadius = 720.0 * BASE_RADIUS_RATIO;
      this.radius = this.baseRadius;
      this.offset = { x: 0, y: 0 };
      this.smoothedBass = 0;
      this.kickPulse = 0;
      this.time = 0;
    }

    update(dt, spectrum, screenW, screenH, externalKick = 0, bassEnergy = 0, fluxEnergy = 0, rhythmicPhase = 0) {
      this.time += dt;
      this.baseRadius = Math.min(screenW, screenH) * BASE_RADIUS_RATIO;
      const maxBassPulse = this.baseRadius * MAX_BASS_PULSE_RATIO;

      // Extract bass (low frequencies). Focus on punchy kick band (bins 1-6)
      const bassBins = Math.min(6, spectrum.length);
      let bass = 0;
      if (bassBins > 1) {
        let sum = 0;
        for (let i = 1; i < bassBins; i++) sum += spectrum[i];
        bass = sum / (bassBins - 1);
      }

      // Smooth the bass reaction for general floating (faster reaction for snappy dancing)
      const bassInput = bass * 12.0;
      this.smoothedBass = this.smoothedBass * 0.88 + bassInput * 0.12;

      // Kick detection: If bass spikes suddenly above smoothed average or external kick impulse hits
      let kickAmount = 0.0;
      if (bassInput > this.smoothedBass + 0.75 || externalKick > 0.08) {
        const rawDelta = Math.max(bassInput - this.smoothedBass, externalKick * 2.2);
        kickAmount = rawDelta * this.baseRadius * 0.055;
      }
      this.kickPulse = Math.min(maxBassPulse, this.kickPulse + kickAmount);
      // Snappy spring recoil (0.80) makes it bounce energetically
      this.kickPulse *= 0.80;

      // The exact radius is base + general floating + sharp kick + transient flux boost
      this.radius = this.baseRadius + Math.min(this.smoothedBass * 1.5, this.baseRadius * 0.16) + this.kickPulse * 1.35 + (fluxEnergy || 0) * (this.baseRadius * 0.08);

      // Fixed centered position without horizontal sway or drifting
      this.offset.x = 0;
      this.offset.y = 0;
    }

    draw(ctx, center, theme, logoImg, drawScale, kickBoost = 0, fluxBoost = 0, rhythmicPhase = 0) {
      const radius = this.radius * drawScale;
      const edgeThickness = Math.max(16.0 * drawScale, this.baseRadius * drawScale * EDGE_THICKNESS_RATIO);
      const glowThickness = Math.max(18.0 * drawScale, this.baseRadius * drawScale * GLOW_THICKNESS_RATIO);

      // 1. Draw outer pulsing glow (core_ring.rs: glow_color.a = 50 translucent glow + kick boost + flux boost)
      const glowInner = radius - edgeThickness * 0.2;
      const glowOuter = radius + glowThickness * (1.0 + kickBoost * 0.45 + (fluxBoost || 0) * 0.25);
      const glowMid = (glowInner + glowOuter) / 2.0;
      const glowWidth = Math.max(1, glowOuter - glowInner);

      ctx.save();
      ctx.beginPath();
      ctx.arc(center.x, center.y, glowMid, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${theme.r}, ${theme.g}, ${theme.b}, ${(0.20 + kickBoost * 0.32 + (fluxBoost || 0) * 0.18).toFixed(3)})`;
      ctx.lineWidth = glowWidth;
      ctx.stroke();

      // 2. Draw the core circle edge smoothly (core_ring.rs)
      const coreInner = radius - edgeThickness;
      const coreOuter = radius;
      const coreMid = (coreInner + coreOuter) / 2.0;
      const coreWidth = Math.max(1, coreOuter - coreInner);

      ctx.beginPath();
      ctx.arc(center.x, center.y, coreMid, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${theme.r}, ${theme.g}, ${theme.b}, 1.0)`;
      ctx.lineWidth = coreWidth;
      ctx.stroke();

      // 3. Center disc: If logo provided & loaded, fit inside ring with turntable micro-tilt; otherwise solid dark core
      const fitRadius = Math.max(0, radius - edgeThickness * 1.15);
      const isImgUsable = Boolean(logoImg && logoImg.complete && logoImg.naturalWidth > 0 && logoImg.getAttribute('src'));

      if (isImgUsable) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(center.x, center.y, fitRadius, 0, Math.PI * 2);
        ctx.clip();

        // Dark background behind artwork
        ctx.fillStyle = '#141414';
        ctx.fillRect(center.x - fitRadius, center.y - fitRadius, fitRadius * 2, fitRadius * 2);

        // Subtle kick scaling on the album artwork centered inside ring (fixed position, no rotational wobble)
        const discScale = 1.0 + kickBoost * 0.04 + (fluxBoost || 0) * 0.025;

        ctx.translate(center.x, center.y);
        ctx.scale(discScale, discScale);

        // Aspect fit centered
        const iw = logoImg.naturalWidth;
        const ih = logoImg.naturalHeight;
        const scale = (fitRadius * 2.0) / Math.max(iw, ih);
        const dw = iw * scale;
        const dh = ih * scale;
        ctx.drawImage(logoImg, -dw / 2.0, -dh / 2.0, dw, dh);
        ctx.restore();
      } else {
        // Otherwise draw a solid dark center core (Color::new(20, 20, 20, 255) from core_ring.rs)
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius - edgeThickness, 0, Math.PI * 2);
        ctx.fillStyle = 'rgb(20, 20, 20)';
        ctx.fill();

        // Sleek subtle music glyph in center core that dances with the beat
        const emblemRad = fitRadius * 0.45;
        if (emblemRad > 5) {
          ctx.beginPath();
          ctx.arc(center.x, center.y, emblemRad * (1.0 + kickBoost * 0.1), 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${theme.r}, ${theme.g}, ${theme.b}, ${(0.25 + kickBoost * 0.25).toFixed(3)})`;
          ctx.lineWidth = Math.max(1.5, 2.5 * drawScale);
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(center.x, center.y, emblemRad * 0.35 * (1.0 + kickBoost * 0.15), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${theme.r}, ${theme.g}, ${theme.b}, ${(0.25 + kickBoost * 0.35).toFixed(3)})`;
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  // Spectrum Engine (exact math from spectrum.rs with explosive transient attack and orbital rotation)
  class YueSpectrum {
    constructor() {
      this.points = new Float32Array(NUM_POINTS);
      this.rotation = 0;
    }

    update(dt, spectrum, bassEnergy = 0, kickBoost = 0, fluxBoost = 0) {
      // Dynamic orbital momentum: particles orbit around core ring and speed up on beats & onsets!
      const rotSpeed = 0.06 + bassEnergy * 0.16 + kickBoost * 0.30 + fluxBoost * 0.15;
      this.rotation = (this.rotation + rotSpeed * dt) % (Math.PI * 2);

      if (!spectrum || spectrum.length === 0) {
        for (let i = 0; i < NUM_POINTS; i++) {
          this.points[i] *= 0.82;
        }
        return;
      }

      // Logarithmic scale, capturing up to bin 300 (spectrum.rs)
      const maxBin = Math.min(300, spectrum.length);
      const minFreqLog = Math.log(1.0);
      const maxFreqLog = Math.log(Math.max(2, maxBin));
      const logRange = maxFreqLog - minFreqLog;

      for (let i = 0; i < NUM_POINTS; i++) {
        const ratioStart = i / NUM_POINTS;
        const ratioEnd = (i + 1) / NUM_POINTS;

        const logStart = minFreqLog + ratioStart * logRange;
        const logEnd = minFreqLog + ratioEnd * logRange;

        const binStart = Math.floor(Math.exp(logStart));
        const binEnd = Math.ceil(Math.exp(logEnd));

        const start = Math.max(0, Math.min(spectrum.length - 1, binStart));
        const end = Math.max(start + 1, Math.min(spectrum.length, binEnd));

        let sum = 0;
        for (let b = start; b < end; b++) {
          sum += spectrum[b];
        }
        const avg = sum / (end - start);

        // Apply a dynamic EQ curve to boost highs visually (spectrum.rs: 1.0 + (i / 120.0) * 2.0)
        const eqBoost = 1.0 + (i / NUM_POINTS) * 2.2;
        // In Web Audio [0..1] range, avg * 270.0 * eqBoost scales cleanly up to MAX_BAR_HEIGHT (180.0)
        // Add transient flux boost for instant note onsets & melodic changes
        const fluxHeightBoost = 1.0 + (fluxBoost || 0) * 0.32;
        const height = avg * 270.0 * eqBoost * fluxHeightBoost;
        const finalHeight = Math.min(MAX_BAR_HEIGHT, height);

        // Asymmetric Peak Tracking: Instant explosive attack (0.12/0.88) and fluid musical release (0.75/0.25)
        if (finalHeight > this.points[i]) {
          this.points[i] = this.points[i] * 0.12 + finalHeight * 0.88;
        } else {
          this.points[i] = this.points[i] * 0.75 + finalHeight * 0.25;
        }
      }

      // Cross-fade the last few points into the first few points (spectrum.rs blend_width = 15)
      const blendWidth = 15;
      for (let i = 0; i < blendWidth; i++) {
        const startI = i;
        const endI = NUM_POINTS - 1 - i;

        const startVal = this.points[startI];
        const endVal = this.points[endI];

        const blendFactor = (blendWidth - i) / blendWidth;
        const avg = (startVal + endVal) * 0.5;

        this.points[startI] = startVal * (1.0 - blendFactor) + avg * blendFactor;
        this.points[endI] = endVal * (1.0 - blendFactor) + avg * blendFactor;
      }
    }

    draw(ctx, center, coreRadius, theme, drawScale, kickBoost = 0, fluxBoost = 0) {
      const scale = Math.max(1.0, coreRadius / BASE_RING_RADIUS);
      const renderCoreRadius = coreRadius * drawScale;
      const radius = renderCoreRadius + renderCoreRadius * SPECTRUM_RADIUS_OFFSET_RATIO;
      const heightScale = 1.0 + (scale - 1.0) * 0.7;
      const angleStep = (2.0 * Math.PI) / NUM_POINTS;
      const kickScale = 1.0 + (kickBoost || 0) * 0.40 + (fluxBoost || 0) * 0.20;

      ctx.save();
      for (let i = 0; i < NUM_POINTS; i++) {
        // Incorporate orbital rotation into each point's angle
        const angle = i * angleStep - Math.PI / 2.0 + this.rotation;
        const h = this.points[i];
        const renderedHeight = h * heightScale;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        // Draw filler trail dots below the main peak to make it look dense (up to 6 dots from spectrum.rs)
        const trailCount = Math.floor(Math.min(6.0, Math.max(0.0, renderedHeight / 15.0)));
        for (let t = 1; t <= trailCount; t++) {
          const proportion = t / (trailCount + 1.0);
          const trailRadius = radius + (renderedHeight * proportion) * drawScale;
          const tx = center.x + cosA * trailRadius;
          const ty = center.y + sinA * trailRadius;

          const trailSize = Math.max(0.6, (1.0 + (h / MAX_BAR_HEIGHT) * 1.5) * drawScale * (1.0 + (kickBoost || 0) * 0.25 + (fluxBoost || 0) * 0.15));
          const trailAlpha = Math.min(1.0, (100 + (h / MAX_BAR_HEIGHT) * 80.0 + (kickBoost || 0) * 40.0 + (fluxBoost || 0) * 25.0) / 255.0).toFixed(3);

          ctx.fillStyle = `rgba(${theme.r}, ${theme.g}, ${theme.b}, ${trailAlpha})`;
          ctx.beginPath();
          ctx.arc(tx, ty, trailSize, 0, Math.PI * 2);
          ctx.fill();
        }

        // Main floating peak particle dot (scales & intensifies with the beat and flux)
        const pointRadius = radius + renderedHeight * drawScale;
        const px = center.x + cosA * pointRadius;
        const py = center.y + sinA * pointRadius;

        const dotSize = Math.max(1.0, (2.0 + (h / MAX_BAR_HEIGHT) * 4.4) * drawScale * kickScale);
        const peakAlpha = Math.min(1.0, (160 + (h / MAX_BAR_HEIGHT) * 95.0 + (kickBoost || 0) * 55.0 + (fluxBoost || 0) * 35.0) / 255.0).toFixed(3);

        ctx.fillStyle = `rgba(${theme.r}, ${theme.g}, ${theme.b}, ${peakAlpha})`;
        ctx.beginPath();
        ctx.arc(px, py, dotSize, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // Combined Visualizer Pipeline (matching visuals/mod.rs)
  class YueVisualizer {
    constructor() {
      this.coreRing = new YueCoreRing();
      this.spectrum = new YueSpectrum();
    }

    update(dt, spectrumData, layoutW, layoutH, kickBoost = 0, bassEnergy = 0, fluxEnergy = 0, rhythmicPhase = 0) {
      this.coreRing.update(dt, spectrumData, layoutW, layoutH, kickBoost, bassEnergy, fluxEnergy, rhythmicPhase);
      this.spectrum.update(dt, spectrumData, bassEnergy, kickBoost, fluxEnergy);
    }

    draw(ctx, theme, logoImg, renderW, renderH, layoutW = 1280.0, layoutH = 720.0, kickBoost = 0, fluxBoost = 0, rhythmicPhase = 0) {
      const drawScale = Math.min(renderW / layoutW, renderH / layoutH);
      const center = {
        x: renderW / 2.0 + this.coreRing.offset.x * drawScale,
        y: renderH / 2.0 + this.coreRing.offset.y * drawScale
      };

      // Draw background (Color::new(10, 10, 15, 255) from main.rs)
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, renderW, renderH);

      // Draw spectrum first (trails radiate outward from ring)
      this.spectrum.draw(ctx, center, this.coreRing.radius, theme, drawScale, kickBoost, fluxBoost);
      // Draw core ring over spectrum base
      this.coreRing.draw(ctx, center, theme, logoImg, drawScale, kickBoost, fluxBoost, rhythmicPhase);
    }
  }

  const yueEngine = new YueVisualizer();
  let lastFrameTime = performance.now();

  // Full-System Beat & Rhythmic Transient Tracking
  let systemBeatKick = 0;
  let systemBeatSnare = 0;
  let systemBeatHihat = 0;
  let smoothFluxEnergy = 0;
  let rhythmicPhase = 0;

  let lastBassVal = 0;
  let lastMidVal = 0;
  let lastTrebleVal = 0;
  let bassHistoryAvg = 0;
  let midHistoryAvg = 0;
  let trebleHistoryAvg = 0;

  let lastKickTriggerTime = 0;
  let lastSnareTriggerTime = 0;
  let lastHihatTriggerTime = 0;
  let prevSpectrumNormalized = null;

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

  let smoothBassEnergy = 0;
  let smoothMidEnergy = 0;
  let smoothTrebleEnergy = 0;

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
        analyser.fftSize = 1024; // 512 frequency bins
        analyser.smoothingTimeConstant = 0.68; // Fast, punchy transient response for instant beat dancing
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
      if (!canvas || !canvas.parentElement) return;

      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const displayW = Math.max(10, Math.round(rect.width));
      const displayH = Math.max(10, Math.round(rect.height));

      if (canvas.width !== displayW * dpr || canvas.height !== displayH * dpr) {
        canvas.width = displayW * dpr;
        canvas.height = displayH * dpr;
      }
      canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const now = performance.now();
      const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
      lastFrameTime = now;

      const isAudioActive = analyser && !audio.paused && audio.currentTime > 0;
      let spectrumNormalized = null;

      if (isAudioActive) {
        const bufferLength = analyser.frequencyBinCount;
        const rawBytes = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(rawBytes);

        spectrumNormalized = new Float32Array(bufferLength);
        for (let i = 0; i < bufferLength; i++) {
          spectrumNormalized[i] = rawBytes[i] / 255.0;
        }

        // Sub-Bass & Kick (bins 1-6, ~20-140Hz)
        let bassSum = 0;
        for (let b = 1; b <= 6; b++) bassSum += spectrumNormalized[b];
        const bassVal = bassSum / 6;

        // Snare & Low Mids (bins 7-35, ~160-800Hz)
        let midSum = 0;
        for (let m = 7; m <= 35; m++) midSum += spectrumNormalized[m];
        const midVal = midSum / 29;

        // Treble & Shimmer (bins 36-140, ~850-3200Hz)
        let trebleSum = 0;
        for (let tr = 36; tr <= 140; tr++) trebleSum += spectrumNormalized[tr];
        const trebleVal = trebleSum / 105;

        let totalSum = 0;
        for (let j = 0; j < 64; j++) totalSum += spectrumNormalized[j];
        const avgVal = totalSum / 64;

        // 1. Spectral Flux Tracker: Moment-to-moment novelty across all frequencies (chords, vocal onsets, synths)
        let fluxSum = 0;
        const fluxMaxBin = Math.min(180, bufferLength);
        if (prevSpectrumNormalized && prevSpectrumNormalized.length === bufferLength) {
          for (let b = 1; b < fluxMaxBin; b++) {
            const diff = spectrumNormalized[b] - prevSpectrumNormalized[b];
            if (diff > 0) fluxSum += diff;
          }
        }
        if (!prevSpectrumNormalized || prevSpectrumNormalized.length !== bufferLength) {
          prevSpectrumNormalized = new Float32Array(bufferLength);
        }
        prevSpectrumNormalized.set(spectrumNormalized);

        const rawFlux = fluxSum / 14.0;
        const instantFlux = Math.min(1.0, rawFlux);
        smoothFluxEnergy += (instantFlux - smoothFluxEnergy) * 0.45;

        // 2. Dynamic Kick Detection (Sub-bass transient spikes)
        bassHistoryAvg = bassHistoryAvg * 0.91 + bassVal * 0.09;
        const bassDelta = bassVal - lastBassVal;
        lastBassVal = bassVal;

        let isBeatKick = false;
        let kickForce = 0;
        if ((bassDelta > 0.052 || bassVal > bassHistoryAvg * 1.28 + 0.09) && (now - lastKickTriggerTime > 140)) {
          isBeatKick = true;
          lastKickTriggerTime = now;
          kickForce = Math.min(1.0, Math.max(0.5, (bassDelta * 4.2) + (bassVal * 0.75)));
          systemBeatKick = Math.min(1.0, systemBeatKick + kickForce);
        } else {
          systemBeatKick *= 0.82;
          if (systemBeatKick < 0.005) systemBeatKick = 0;
        }

        // 3. Snare & Clap Detection (Mid-frequency transient bursts)
        midHistoryAvg = midHistoryAvg * 0.90 + midVal * 0.10;
        const midDelta = midVal - lastMidVal;
        lastMidVal = midVal;

        let isBeatSnare = false;
        let snareForce = 0;
        if ((midDelta > 0.048 || midVal > midHistoryAvg * 1.32 + 0.07) && (now - lastSnareTriggerTime > 150)) {
          isBeatSnare = true;
          lastSnareTriggerTime = now;
          snareForce = Math.min(1.0, Math.max(0.4, (midDelta * 4.0) + (midVal * 0.6)));
          systemBeatSnare = Math.min(1.0, systemBeatSnare + snareForce);
        } else {
          systemBeatSnare *= 0.78;
          if (systemBeatSnare < 0.005) systemBeatSnare = 0;
        }

        // 4. Hi-Hat / High Percussion Detection (Treble clicks & ticks)
        trebleHistoryAvg = trebleHistoryAvg * 0.90 + trebleVal * 0.10;
        const trebleDelta = trebleVal - lastTrebleVal;
        lastTrebleVal = trebleVal;

        let isBeatHihat = false;
        let hihatForce = 0;
        if ((trebleDelta > 0.032 || trebleVal > trebleHistoryAvg * 1.28 + 0.05) && (now - lastHihatTriggerTime > 90)) {
          isBeatHihat = true;
          lastHihatTriggerTime = now;
          hihatForce = Math.min(1.0, Math.max(0.3, (trebleDelta * 4.5) + (trebleVal * 0.5)));
          systemBeatHihat = Math.min(1.0, systemBeatHihat + hihatForce);
        } else {
          systemBeatHihat *= 0.74;
          if (systemBeatHihat < 0.005) systemBeatHihat = 0;
        }

        smoothBassEnergy += (bassVal - smoothBassEnergy) * 0.35;
        smoothMidEnergy += (midVal - smoothMidEnergy) * 0.28;
        smoothTrebleEnergy += (trebleVal - smoothTrebleEnergy) * 0.30;

        // 5. Continuous Rhythmic Groove Phase (sway, bob, tilt linked to song tempo)
        rhythmicPhase += (2.4 + smoothBassEnergy * 5.5 + smoothFluxEnergy * 3.5) * dt;

        musicalState.isPlaying = true;
        musicalState.bass = smoothBassEnergy;
        musicalState.mids = smoothMidEnergy;
        musicalState.treble = smoothTrebleEnergy;
        musicalState.avg = avgVal;
        musicalState.beatStage = (smoothBassEnergy > 0.55 || avgVal > 0.45) ? 3 : ((smoothBassEnergy > 0.28 || avgVal > 0.22) ? 2 : 1);
        musicalState.beatKick = isBeatKick;
        musicalState.kickIntensity = kickForce || systemBeatKick;
        musicalState.time = now;
      } else {
        systemBeatKick *= 0.80;
        systemBeatSnare *= 0.78;
        systemBeatHihat *= 0.74;
        smoothFluxEnergy *= 0.80;
        smoothBassEnergy *= 0.80;
        smoothMidEnergy *= 0.80;
        smoothTrebleEnergy *= 0.80;

        musicalState.isPlaying = false;
        musicalState.bass = smoothBassEnergy;
        musicalState.mids = smoothMidEnergy;
        musicalState.treble = smoothTrebleEnergy;
        musicalState.avg = 0;
        musicalState.beatStage = 1;
        musicalState.beatKick = false;
        musicalState.kickIntensity = 0;

        spectrumNormalized = new Float32Array(0);
      }

      // Propagate live CSS custom properties to document root for full lighting reactivity (no position shifting)
      const rootStyle = document.documentElement.style;
      const currentTheme = YUE_THEMES[currentThemeIdx];

      rootStyle.setProperty('--beat-kick', systemBeatKick.toFixed(3));
      rootStyle.setProperty('--beat-snare', systemBeatSnare.toFixed(3));
      rootStyle.setProperty('--beat-hihat', systemBeatHihat.toFixed(3));
      rootStyle.setProperty('--beat-flux', smoothFluxEnergy.toFixed(3));
      rootStyle.setProperty('--beat-bass', smoothBassEnergy.toFixed(3));
      rootStyle.setProperty('--beat-mids', smoothMidEnergy.toFixed(3));
      rootStyle.setProperty('--beat-treble', smoothTrebleEnergy.toFixed(3));
      rootStyle.setProperty('--beat-sway', '0');
      rootStyle.setProperty('--beat-bob', '0');
      rootStyle.setProperty('--beat-tilt', '0');
      rootStyle.setProperty('--theme-rgb', `${currentTheme.r}, ${currentTheme.g}, ${currentTheme.b}`);
      rootStyle.setProperty('--theme-color', currentTheme.hex);

      // Update Yue Engine with external kick force, bass, flux, and rhythmic groove
      yueEngine.update(dt, spectrumNormalized, 1280.0, 720.0, systemBeatKick, smoothBassEnergy, smoothFluxEnergy, rhythmicPhase);

      // Render Yue Engine
      yueEngine.draw(canvasCtx, currentTheme, albumArtImg, displayW, displayH, 1280.0, 720.0, systemBeatKick, smoothFluxEnergy, rhythmicPhase);
    }

    if (!animationFrameId) {
      draw();
    }
  }

  // Auto-start visualizer immediately so idle state is visible on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      renderVisualizer();
    });
  } else {
    renderVisualizer();
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

  // Media Tab switching (Upload / YouTube / YouTube Playlist)
  function switchMediaTab(tab) {
    tabUploadBtn.classList.toggle('active', tab === 'upload');
    tabYtBtn.classList.toggle('active', tab === 'yt');
    tabYtPlaylistBtn.classList.toggle('active', tab === 'playlist');

    uploadTabContent.style.display = tab === 'upload' ? 'block' : 'none';
    ytTabContent.style.display = tab === 'yt' ? 'block' : 'none';
    ytPlaylistTabContent.style.display = tab === 'playlist' ? 'block' : 'none';
  }

  tabUploadBtn.addEventListener('click', () => switchMediaTab('upload'));
  tabYtBtn.addEventListener('click', () => switchMediaTab('yt'));
  tabYtPlaylistBtn.addEventListener('click', () => switchMediaTab('playlist'));

  // Queue drawer visibility toggle
  function toggleQueue(forceOpen) {
    if (typeof forceOpen === 'boolean') {
      queueShelf.style.display = forceOpen ? 'flex' : 'none';
    } else {
      queueShelf.style.display = queueShelf.style.display === 'none' ? 'flex' : 'none';
    }
  }

  if (queueToggleBtn) {
    queueToggleBtn.addEventListener('click', () => toggleQueue());
  }
  if (queueCloseBtn) {
    queueCloseBtn.addEventListener('click', () => toggleQueue(false));
  }

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
    if (params.get('nick')) {
      joinNicknameInput.value = params.get('nick');
    }
    if (params.get('auto') === '1' && joinRoomIdInput.value && joinPasscodeInput.value) {
      if (!joinNicknameInput.value) joinNicknameInput.value = 'Listener';
      setTimeout(() => {
        if (joinForm && typeof joinForm.requestSubmit === 'function') {
          joinForm.requestSubmit();
        } else if (joinSubmitBtn) {
          joinSubmitBtn.click();
        }
      }, 150);
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

  // Render Queue Drawer
  function renderQueue(queue, currentIndex, playlistTitle) {
    if (!queueTracklist) return;

    const trackCount = queue ? queue.length : 0;
    if (trackCount === 0) {
      if (queueBadge) queueBadge.style.display = 'none';
      if (prevTrackBtn) prevTrackBtn.disabled = true;
      if (nextTrackBtn) nextTrackBtn.disabled = true;
      queueTracklist.innerHTML = '<div style="padding: 12px; color: var(--ytm-text-secondary); font-size: 12px; text-align: center;">No tracks in queue.</div>';
      return;
    }

    if (queueBadge) {
      queueBadge.textContent = trackCount;
      queueBadge.style.display = trackCount > 1 ? 'inline-block' : 'none';
    }
    if (prevTrackBtn) prevTrackBtn.disabled = trackCount <= 1;
    if (nextTrackBtn) nextTrackBtn.disabled = trackCount <= 1;

    if (queueTitleText) {
      queueTitleText.textContent = playlistTitle || (trackCount > 1 ? 'Playlist Queue' : 'Current Track');
    }
    if (queueCountPill) {
      queueCountPill.textContent = `${trackCount} track${trackCount === 1 ? '' : 's'}`;
    }

    queueTracklist.innerHTML = '';
    queue.forEach((track, i) => {
      const item = document.createElement('div');
      const isActive = i === currentIndex;
      item.className = `queue-item ${isActive ? 'active' : ''}`;

      const thumbUrl = track.source === 'youtube'
        ? `https://img.youtube.com/vi/${track.id}/default.jpg`
        : '';

      const thumbHtml = thumbUrl
        ? `<img class="queue-item-thumb" src="${thumbUrl}" alt="art" onerror="this.style.display='none'">`
        : `<div class="queue-item-thumb" style="display:flex;align-items:center;justify-content:center;font-size:13px;color:#aaa;">📁</div>`;

      const waveHtml = isActive && musicalState.isPlaying
        ? `<div class="queue-playing-wave"><span></span><span></span><span></span></div>`
        : '';

      const durText = track.duration_seconds ? formatTime(track.duration_seconds) : '';

      item.innerHTML = `
        <span class="queue-item-idx">${isActive ? '▶' : (i + 1)}</span>
        ${thumbHtml}
        <div class="queue-item-info">
          <div class="queue-item-title">${waveHtml}${escapeHtml(track.title)}</div>
        </div>
        ${durText ? `<span class="queue-item-duration">${durText}</span>` : ''}
      `;

      item.addEventListener('click', () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'SELECT_TRACK',
            payload: { index: i }
          }));
        }
      });

      queueTracklist.appendChild(item);
    });
  }

  // Apply synchronized room state
  function applySyncState(state) {
    if (!state) return;

    listenerCount.textContent = state.listeners_count || 1;

    // Render Synchronized Queue
    renderQueue(state.queue || [], state.current_track_index || 0, state.playlist_title);

    // Track metadata & Artwork
    if (state.current_track) {
      trackTitle.textContent = state.current_track.title;
      trackSourceBadge.style.display = 'inline-flex';

      if (yueTrackName) {
        yueTrackName.textContent = state.current_track.title;
      }

      if (state.current_track.source === 'youtube') {
        trackSourceIcon.textContent = '▶️';
        trackSourceName.textContent = 'YouTube';
        trackArtist.textContent = 'YouTube Audio';

        // Load YouTube HQ Thumbnail for center circle
        albumArtImg.src = `https://img.youtube.com/vi/${state.current_track.id}/hqdefault.jpg`;
        albumArtImg.style.display = 'block';
        if (albumArtPlaceholder) albumArtPlaceholder.style.display = 'none';
      } else {
        trackSourceIcon.textContent = '📁';
        trackSourceName.textContent = 'Local File';
        trackArtist.textContent = 'Local Audio Track';

        albumArtImg.removeAttribute('src');
        if (albumArtPlaceholder) albumArtPlaceholder.style.display = 'flex';
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
      if (yueTrackName) {
        yueTrackName.textContent = 'No track selected';
      }
      albumArtImg.removeAttribute('src');
      if (albumArtPlaceholder) albumArtPlaceholder.style.display = 'flex';
      updatePlayButtonIcon(false);
      if (vinylDisc) vinylDisc.classList.remove('spinning');
      renderQueue([], 0, null);
      return;
    }

    // Audio timeline calculation with latency compensation
    const now = Date.now();
    let expectedPosition = state.position;
    if (state.is_playing) {
      const elapsedSeconds = (now - state.server_time_ms) / 1000;
      expectedPosition += Math.max(0, elapsedSeconds);
      if (vinylDisc) vinylDisc.classList.add('spinning');
    } else {
      if (vinylDisc) vinylDisc.classList.remove('spinning');
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

  // Track navigation (Previous / Next)
  if (prevTrackBtn) {
    prevTrackBtn.addEventListener('click', () => {
      initVisualizer();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'PREV_TRACK', payload: null }));
      }
    });
  }

  if (nextTrackBtn) {
    nextTrackBtn.addEventListener('click', () => {
      initVisualizer();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'NEXT_TRACK', payload: null }));
      }
    });
  }

  // Auto-play next track when current finishes
  audio.addEventListener('ended', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'NEXT_TRACK', payload: null }));
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

  // YouTube Playlist Ingestion
  if (ytPlaylistForm) {
    ytPlaylistForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = ytPlaylistUrlInput.value.trim();
      if (!url || !currentRoomId) return;

      setStatus('Extracting YouTube playlist & preparing first track...', true);
      ytPlaylistUrlInput.value = '';

      try {
        const res = await fetch(`/api/rooms/${currentRoomId}/youtube-playlist`, {
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
        showToast(`Loaded playlist: "${data.playlist_title}" (${data.total_tracks} tracks)`, '📑');
        toggleQueue(true); // Open the queue drawer to show all tracks
        initVisualizer();
      } catch (err) {
        setStatus('', false);
        showToast('Playlist failed: ' + err.message, '❌');
      }
    });
  }

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

    // Helper: Screen position of Center Visualizer Stage
    function getAlbumCenter() {
      const stage = document.getElementById('albumShowcase');
      if (stage) {
        const rect = stage.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
      }
      return { x: width / 2, y: height / 2 };
    }

    // Music Beat Wave Emission from Visualizer Stage Center
    function spawnMusicBeatWave(stage, intensity) {
      if (ripples.length >= MAX_RIPPLES) ripples.shift();
      const center = getAlbumCenter();

      const currentTheme = YUE_THEMES[currentThemeIdx];
      const color = { r: currentTheme.r, g: currentTheme.g, b: currentTheme.b };
      const maxRadius = Math.max(width, height) * (0.50 + intensity * 0.40);
      const speed = 3.4 + intensity * 3.0;
      const alpha = 0.35 + intensity * 0.35;

      ripples.push({
        x: center.x,
        y: center.y,
        radius: 65,
        maxRadius,
        speed,
        alpha,
        color,
        style: 'organic',
        seed: Math.random() * 200,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.02,
        vx: 0,
        vy: 0,
        isClick: false,
        isMusicBeat: true
      });

      // Radiate outward sparks from stage on heavy kicks
      if (intensity > 0.35) {
        const sparkCount = Math.min(10, Math.floor(4 + intensity * 6));
        for (let k = 0; k < sparkCount; k++) {
          const angle = (k / sparkCount) * Math.PI * 2 + Math.random() * 0.3;
          const force = 2.4 + Math.random() * 3.6;
          if (stars.length < MAX_STARS) {
            stars.push({
              x: center.x + Math.cos(angle) * 75,
              y: center.y + Math.sin(angle) * 75,
              vx: Math.cos(angle) * force,
              vy: Math.sin(angle) * force,
              size: Math.random() * 2.2 + 1.2,
              alpha: 0.85,
              maxLife: Math.random() * 35 + 25,
              life: 0,
              color,
              seed: Math.random() * 100
            });
          }
        }
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

    // Render Controlled Rhythmic Auroras (Silk Wave Ribbons)
    function drawRhythmicRibbon(yRatio, col1, col2, freq, speed, ampScale) {
      const baseY = height * yRatio;
      const amp = (8 + musicalState.bass * 14 + musicalState.mids * 8) * ampScale;

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
      const alpha = 0.035 + musicalState.bass * 0.04;
      grad.addColorStop(0, `rgba(${col1.r}, ${col1.g}, ${col1.b}, ${alpha * 0.2})`);
      grad.addColorStop(0.5, `rgba(${col2.r}, ${col2.g}, ${col2.b}, ${alpha})`);
      grad.addColorStop(1, `rgba(${col1.r}, ${col1.g}, ${col1.b}, ${alpha * 0.1})`);

      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.8 + musicalState.bass * 1.0;
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

      // Trigger Beat Wave on fresh musical beat kick (energetic drops & punches)
      if (isPlaying && musicalState.beatKick && musicalState.time !== lastProcessedBeatTime) {
        lastProcessedBeatTime = musicalState.time;
        spawnMusicBeatWave(musicalState.beatStage, musicalState.kickIntensity);
        // Buoyant energetic lift on dancing embers
        for (let i = 0; i < celestialEmbers.length; i++) {
          celestialEmbers[i].lift = Math.min(18, celestialEmbers[i].lift + (3.0 + Math.random() * 4.5) * musicalState.kickIntensity);
        }
      }

      // 1. Dynamic Cursor Spotlight Glow (composed breathing)
      const isRecent = (Date.now() - lastMoveTime) < 4000;
      const spotlightAlpha = isRecent ? (0.85 + musicBoost * 0.18) : Math.max(0.2, 0.85 - (Date.now() - lastMoveTime - 4000) / 3000);
      const baseRadius = 220 + Math.min(mouseSpeed * 3, 100) + (musicBoost * 35);

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
        ambientOrbsEl.style.setProperty('--tilt-x', '0px');
        ambientOrbsEl.style.setProperty('--tilt-y', '0px');
      }

      // 3. Render Controlled Rhythmic Auroras (Silk Wave Ribbons)
      drawRhythmicRibbon(0.72, PALETTES[2], PALETTES[1], 0.0025, 0.8, 1.0); // Cyan & Indigo
      drawRhythmicRibbon(0.85, PALETTES[0], PALETTES[3], 0.0032, -0.7, 0.85); // Crimson & Rose

      // 4. Render Dancing Celestial Embers (vivid rhythmic dancing with bass & mids)
      for (let i = 0; i < celestialEmbers.length; i++) {
        const ember = celestialEmbers[i];
        ember.x += ember.vx;
        ember.y += ember.vy;

        if (ember.x < -20) ember.x = width + 20;
        if (ember.x > width + 20) ember.x = -20;
        if (ember.y < -20) ember.y = height + 20;
        if (ember.y > height + 20) ember.y = -20;

        // Vivid rhythmic dancing math
        const bob = isPlaying
          ? (Math.sin(t * ember.danceFreq * 2.5 + ember.phase) * (2.0 + musicalState.bass * 8.0 + musicalState.mids * 5.0) - ember.lift)
          : Math.sin(t * 0.8 + ember.phase) * 1.5;

        const sway = isPlaying
          ? (Math.cos(t * ember.danceFreq * 1.8 + ember.phase) * (1.5 + musicalState.treble * 5.0))
          : Math.cos(t * 0.6 + ember.phase) * 1.2;

        ember.lift *= 0.89;

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

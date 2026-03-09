export function createEngineerAudioFeature(deps) {
  const {
    state,
    license,
    radio,
    gptRealtime,
    tts,
    TTS_PRIMARY_WINDOW,
    el,
    navigate,
    appendRadioCard,
    getBatteryDelta,
    getPlayerLap,
    isPlayerRaceFinished,
  } = deps;

  function ttsSpeak(text) {
    if (!tts.enabled || !TTS_PRIMARY_WINDOW) return;
    const clipped = text.length > 220 ? text.slice(0, 220) + '.' : text;
    const now = Date.now();
    if (clipped && tts.lastQueuedText === clipped && (now - tts.lastQueuedAt) < 4000) return;
    if (tts.queue.length > 0 && tts.queue[tts.queue.length - 1] === clipped) return;
    tts.lastQueuedText = clipped;
    tts.lastQueuedAt = now;
    tts.queue.push(clipped);
    ttsFlush();
  }

  async function ttsFlush() {
    if (tts.speaking || tts.queue.length === 0) return;
    const text = tts.queue.shift();
    tts.speaking = true;
    try {
      const base64 = await window.raceEngineer.ttsSpeak({ text, voice: tts.voice });
      if (isPlayerRaceFinished()) {
        tts.speaking = false;
        return;
      }
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'audio/mpeg' });
      const blobUrl = URL.createObjectURL(blob);
      const audio = new Audio(blobUrl);
      tts.currentAudio = audio;
      audio.playbackRate = tts.rate;
      audio.onended = () => {
        URL.revokeObjectURL(blobUrl);
        tts.speaking = false;
        tts.currentAudio = null;
        ttsFlush();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        tts.speaking = false;
        tts.currentAudio = null;
        ttsFlush();
      };
      await audio.play();
    } catch (error) {
      console.warn('[TTS] edge-tts error:', error.message);
      tts.speaking = false;
      ttsFlush();
    }
  }

  function gptInitAudio() {
    if (!gptRealtime.audioContext) {
      gptRealtime.audioContext = new AudioContext({ sampleRate: gptRealtime.sampleRate });
    }
    if (gptRealtime.audioContext.state === 'suspended') {
      gptRealtime.audioContext.resume().catch(() => {});
    }
  }

  function gptPlayChunk(base64Chunk) {
    if (!TTS_PRIMARY_WINDOW) return;
    if (isPlayerRaceFinished()) return;
    gptInitAudio();
    const binary = atob(base64Chunk);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768;
    const buffer = gptRealtime.audioContext.createBuffer(1, float32.length, gptRealtime.sampleRate);
    buffer.getChannelData(0).set(float32);
    gptRealtime.audioQueue.push(buffer);
    if (!gptRealtime.audioPlaying) gptDrainAudio();
  }

  function gptDrainAudio() {
    if (gptRealtime.audioQueue.length === 0) {
      gptRealtime.audioPlaying = false;
      return;
    }
    gptRealtime.audioPlaying = true;
    const ctx = gptRealtime.audioContext;
    const buffer = gptRealtime.audioQueue.shift();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    gptRealtime.currentSource = source;
    source.onended = () => {
      if (gptRealtime.currentSource === source) gptRealtime.currentSource = null;
      gptDrainAudio();
    };
    source.start();
  }

  function clearEngineerPlayback() {
    tts.queue = [];
    tts.lastQueuedText = '';
    tts.lastQueuedAt = 0;
    if (tts.currentAudio) {
      try {
        tts.currentAudio.pause();
        tts.currentAudio.currentTime = 0;
      } catch {}
      tts.currentAudio = null;
    }
    tts.speaking = false;
    gptRealtime.audioQueue = [];
    if (gptRealtime.currentSource) {
      try {
        gptRealtime.currentSource.onended = null;
        gptRealtime.currentSource.stop();
      } catch {}
      gptRealtime.currentSource = null;
    }
    gptRealtime.audioPlaying = false;
  }

  function handleFinishedRaceRadioState() {
    const finished = isPlayerRaceFinished();
    if (finished) {
      if (!radio.prev.sessionFinished) clearEngineerPlayback();
      radio.prev.sessionFinished = true;
      radio.prev.scenario = null;
      radio.awaiting = false;
      radio.prev.restartAwaitingLeaderThrottle = false;
      return true;
    }
    if (radio.prev.sessionFinished) radio.prev.sessionFinished = false;
    return false;
  }

  function getCurrentSessionType() {
    const session = state.session;
    if (!session) return 'race';
    return [5, 6, 7, 8, 9].includes(session.sessionType) ? 'qualifying' : 'race';
  }

  function gptAllowedForSession() {
    if (license.devMode) return { allowed: true, reason: 'dev' };
    if (license.byokMode) return { allowed: true, reason: 'byok' };
    if (!license.licenseKey) {
      return {
        allowed: false,
        reason: 'No active license key. Activate a key in Settings or buy a pack first.',
      };
    }
    const exhausted = license.licenseStatus === 'exhausted'
      || ((license.creditsRemaining || 0) <= 0 && !!license.licenseKey);
    if ((license.creditsRemaining || 0) > 0) return { allowed: true, reason: 'credit' };
    return {
      allowed: false,
      reason: exhausted
        ? 'Your current license key is exhausted. Activate a new key or buy another pack.'
        : 'No AI Engineer credits. Buy a credit pack or use BYOK mode.',
    };
  }

  async function gptConnect() {
    if (license.byokMode && !gptRealtime.openaiApiKey) {
      appendRadioCard('system', 'high', 'BYOK mode: enter your OpenAI key in Settings -> AI Engineer.', true);
      return;
    }

    const check = gptAllowedForSession();
    if (!check.allowed) {
      appendRadioCard('system', 'high', `GPT AI: ${check.reason}`, true);
      updateGptStatusUI();
      if (String(check.reason || '').toLowerCase().includes('exhausted')) {
        navigate('settings');
      }
      return;
    }

    gptRealtime.sessionType = getCurrentSessionType();
    gptRealtime.status = 'connecting';
    updateGptStatusUI();
    const result = await window.raceEngineer.gptRealtimeConnect({
      userApiKey: license.byokMode ? gptRealtime.openaiApiKey : '',
      voice: gptRealtime.voice,
      sessionType: gptRealtime.sessionType,
    });

    if (result.error) {
      gptRealtime.status = 'error';
      gptRealtime.connected = false;
      updateGptStatusUI();
      appendRadioCard('system', 'high', `AI Engineer (GPT): ${result.error}`, true);
      if (result.code === 'LICENSE_EXHAUSTED' || result.needsNewKey || result.code === 'NO_LICENSE_KEY') {
        navigate('settings');
        const statusEl = el('activate-key-result');
        if (statusEl) {
          statusEl.style.color = 'var(--danger)';
          statusEl.textContent = result.code === 'NO_LICENSE_KEY'
            ? 'No active license key. Activate a key or buy a pack first.'
            : 'Current key is exhausted. Activate a new key or buy a new pack.';
        }
      }
      if (result.code === 'LICENSE_SERVER_UNREACHABLE' || result.code === 'LICENSE_SERVER_UNAVAILABLE') {
        navigate('settings');
        const statusEl = el('activate-key-result');
        if (statusEl) {
          statusEl.style.color = 'var(--danger)';
          statusEl.textContent = 'License server is unreachable. AI Engineer is blocked until it is reachable again.';
        }
      }
      return;
    }

    gptRealtime.connected = true;
    gptRealtime.status = 'connected';
    updateGptStatusUI();
    const modeLabel = result.mode === 'byok'
      ? 'BYOK (your key)'
      : `Subscription - ${result.creditsRemaining} credit${result.creditsRemaining !== 1 ? 's' : ''} left`;
    appendRadioCard('system', 'medium', `AI Engineer (GPT) connected. ${modeLabel}.`, true);
  }

  async function gptDisconnect() {
    await window.raceEngineer.gptRealtimeDisconnect();
    gptRealtime.connected = false;
    gptRealtime.status = 'disconnected';
    updateGptStatusUI();
  }

  function updateGptStatusUI() {
    const badge = el('gpt-status-badge');
    if (!badge) return;
    const labels = {
      disconnected: { text: 'GPT: Off', cls: 'badge-off' },
      connecting: { text: 'GPT: Connecting...', cls: 'badge-warn' },
      connected: { text: 'GPT: Live', cls: 'badge-live' },
      error: { text: 'GPT: Error', cls: 'badge-err' },
    };
    const current = labels[gptRealtime.status] || labels.disconnected;
    badge.textContent = current.text;
    badge.className = `gpt-status-badge ${current.cls}`;
  }

  function gptPushTelemetry() {
    if (!gptRealtime.connected) return;
    if (!state.connected) return;
    const now = Date.now();
    if (now - gptRealtime.lastPushAt < gptRealtime.pushIntervalMs) return;
    gptRealtime.lastPushAt = now;

    const lap = getPlayerLap();
    const status = state.status;
    const damage = state.damage;
    const session = state.session;
    const telemetry = state.telemetry;
    if (!lap || !status || !session) return;

    const wear = damage?.tyresWear || [0, 0, 0, 0];
    const surfTemps = telemetry?.tyreSurfaceTemperature || [0, 0, 0, 0];
    const batteryDelta = getBatteryDelta();
    const tyreNames = { 16: 'soft', 17: 'medium', 18: 'hard', 7: 'inter', 8: 'wet' };
    const compound = tyreNames[status.visualTyreCompound] || 'unknown';
    const gapAheadMs = lap.deltaToCarAheadMs || 0;
    const gapBehindMs = lap.deltaToCarBehindMs || 0;
    const gapBehindTrend = gapBehindMs > 0 && gapBehindMs < radio.prev.gapBehindPrev
      ? 'closing'
      : gapBehindMs > radio.prev.gapBehindPrev * 1.05 ? 'extending' : 'stable';
    const lapTimeTrend = radio.prev.lapTimeAvg > 0 && radio.prev.lastLapTime > radio.prev.lapTimeAvg * 1.02
      ? 'degrading'
      : radio.prev.lastLapTime < radio.prev.lapTimeAvg * 0.99 ? 'improving' : 'stable';

    const payload = {
      lap: lap.currentLapNum,
      lapsRemaining: (session.totalLaps || 0) - (lap.currentLapNum || 0),
      position: lap.carPosition,
      tireAgeLaps: status.tyresAgeLaps,
      tireCompound: compound,
      tireWearFL: Math.round(wear[2]),
      tireWearFR: Math.round(wear[3]),
      tireWearRL: Math.round(wear[0]),
      tireWearRR: Math.round(wear[1]),
      tireTempFL: Math.round(surfTemps[2]),
      tireTempFR: Math.round(surfTemps[3]),
      fuelRemaining: parseFloat((status.fuelInTank || 0).toFixed(2)),
      fuelRemainingLaps: parseFloat((status.fuelRemainingLaps || 0).toFixed(1)),
      ersStore: Math.round((status.ersStoreEnergy / 4000000) * 100),
      ersDeploy: status.ersDeployMode || 0,
      gapAhead: gapAheadMs > 0 ? parseFloat((gapAheadMs / 1000).toFixed(2)) : -1,
      gapBehind: gapBehindMs > 0 ? parseFloat((gapBehindMs / 1000).toFixed(2)) : -1,
      gapBehindTrend,
      lapTimeTrend,
      batteryVsAhead: batteryDelta ? parseFloat(batteryDelta.ahead?.deltaPct?.toFixed(1) || '0') : 0,
      batteryVsBehind: batteryDelta ? parseFloat(batteryDelta.behind?.deltaPct?.toFixed(1) || '0') : 0,
      safetyCarStatus: session.safetyCarStatus || 0,
      weather: ['Clear', 'Light Cloud', 'Overcast', 'Light Rain', 'Heavy Rain', 'Storm'][session.weather] || 'Clear',
      trackTemp: session.trackTemperature || 0,
      frontWingDamage: Math.round(damage?.frontLeftWingDamage || 0),
      rearWingDamage: Math.round(damage?.rearWingDamage || 0),
    };
    window.raceEngineer.gptRealtimePush(payload).catch(() => {});
  }

  return {
    ttsSpeak,
    gptPlayChunk,
    clearEngineerPlayback,
    handleFinishedRaceRadioState,
    getCurrentSessionType,
    gptAllowedForSession,
    gptConnect,
    gptDisconnect,
    updateGptStatusUI,
    gptPushTelemetry,
  };
}

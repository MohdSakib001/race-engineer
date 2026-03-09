import './index.css';
import CIRCUITS from './circuits.js';
import { RADIO_CATEGORIES, getDefaultRadioConfig, RADIO_MESSAGES, countAiEnabledSituations } from './radio-situations.js';
import f1CarSvg from './assets/f1-car.svg?raw';
//  Lookups (loaded from main) 
let TEAM_COLORS = {};
let TYRE_COMPOUNDS = {};
let ACTUAL_COMPOUNDS = {};
let TRACK_NAMES = {};
let savedApiKey = '';  // persisted across settings page rebuilds
//  Detached window mode 
const urlParams = new URLSearchParams(window.location.search);
const DETACH_PAGE = (urlParams.get('detach') || '').trim().toLowerCase(); // e.g. 'trackmap', 'dashboard', etc.
const DETACH_TITLE = (urlParams.get('title') || '').trim();
const TTS_PRIMARY_WINDOW = !DETACH_PAGE;
const DETACH_TITLES = {
  dashboard: 'Dashboard',
  timing: 'Timing Tower',
  trackmap: 'Track Map',
  vehicle: 'Vehicle Status',
  session: 'Session',
  engineer: 'AI Engineer',
  radio: 'Radio Config',
  settings: 'Settings',
};
function setDetachedWindowTitle(pageKey = DETACH_PAGE) {
  const desired = DETACH_TITLE || DETACH_TITLES[pageKey] || 'Race Engineer';
  document.title = desired;
  if (window.raceEngineer?.setWindowTitle) {
    window.raceEngineer.setWindowTitle(desired);
  }
}
if (DETACH_PAGE) {
  setDetachedWindowTitle();
}
//  App state 
const state = {
  connected: false,
  session: null,
  participants: null,
  lapData: null,
  telemetry: null,
  status: null,
  damage: null,
  allCarStatus: null,     // all 22 cars' status (for rivals' tyres/ERS)
  allCarTelemetry: null,  // all 22 cars' telemetry (for track map)
  playerCarIndex: 0,
  bestLapTimes: {},       // carIdx  best lap ms (from session history packet)
  fastestLapCar: -1,      // car index holding the overall fastest lap
  fastestLapMs: 0,        // fastest lap time in ms
};
const DEFAULT_LISTEN_PORT = 20777;
let listenPort = DEFAULT_LISTEN_PORT;
function normalizeListenPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : DEFAULT_LISTEN_PORT;
}
//  License & AI Engineer state
const license = {
  racesRemaining: 0,
  qualifyingRemaining: 0,
  devMode: false,
  byokMode: false,
  licenseKey: null,
  lastIssuedLicenseKey: null,
  licenseStatus: 'no-key',
  licenseExhaustedAt: null,
  paymentEvents: [],
  purchases: [],
};
const gptRealtime = {
  connected: false,
  status: 'disconnected',   // connecting | connected | disconnected | error
  transcript: '',           // live transcript from GPT
  audioContext: null,
  audioQueue: [],           // ArrayBuffer chunks queued for playback
  audioPlaying: false,
  sampleRate: 24000,        // PCM16 24kHz from Realtime API
  // Settings
  voice: 'echo',            // alloy | echo | shimmer | fable | onyx | nova
  openaiApiKey: '',
  aiMode: 'classic',        // 'classic' (edge-tts) | 'gpt' (GPT Realtime)
  sessionType: 'race',      // 'race' | 'qualifying'
  // Telemetry push interval
  lastPushAt: 0,
  pushIntervalMs: 12000,    // push telemetry every 12s
};
const paypalCheckout = {
  pendingOrder: null,
  verifying: false,
  pollTimer: null,
};
//  Auto-radio state
const radio = {
  enabled: true,
  awaiting: false,  // only for API calls (attack/defense)
  // Per-category cooldowns (ms) and last trigger timestamps
  cooldowns: {
    // API scenarios (attack/defense proximity)
    attack:    90000,   // 90s  reduce repeated tactical chatter
    defense:   90000,
    mixed:     90000,
    // Category cooldowns (much longer to reduce spam)
    start:     90000,
    overtake:  30000,
    defend:    45000,
    tyres:     90000,
    ers:       90000,
    pit:       90000,
    weather:   60000,
    incident:  30000,
    flags:     15000,
    restart:   30000,
    normal:    60000,
    endrace:   45000,
    penalty:   30000,
    racecraft: 60000,
  },
  lastTrigger: {},
  // Per-category config (loaded from radio-situations.js)
  config: getDefaultRadioConfig(),
  // State tracking for change detection
  prev: {
    scenario: null,
    weather: null,
    safetyCarStatus: null,
    lap: 0,
    position: 0,
    gridPosition: 0,
    pitStatus: 0,
    tyreCompound: null,
    fiaFlag: 0,
    maxTyreWearReported: 0,
    damageSnapshot: null,
    fuelWarned: false,
    ersLowWarned: false,
    penalties: 0,
    // Battle tracking
    battleAheadStart: 0,     // timestamp when we first got within 1.5s
    battleBehindStart: 0,    // timestamp when car behind got within 1.5s
    battleAheadIdx: -1,      // index of car we're fighting ahead
    battleBehindIdx: -1,     // index of car fighting us behind
    lastBattleBatteryMsg: 0, // cooldown for battery delta during battle
    lastBattleDamageMsg: 0,  // cooldown for damage comparison
    lastDirtyAirMsg: 0,      // cooldown for dirty air warning
    lastClosingMsg: 0,       // cooldown for closing gap warning
    lastBeingCaughtMsg: 0,   // cooldown for being caught warning
    gapAheadPrev: 0,         // previous gap to car ahead (for trend)
    gapBehindPrev: 0,        // previous gap to car behind
    lastLapTime: 0,          // for detecting pace drop (tyre cliff)
    prevLastLapTime: 0,
    endRaceWarned: false,
    cleanAirMsgTime: 0,
    lockupDetected: 0,
    lastBrakeTemp: [0,0,0,0],
    // Pit strategy pace tracking
    lapTimeAvg: 0,
    lapTimeAvgLap: 0,
    // Anti-spam / cadence controls
    lastTyreTempReportLap: 0,
    lastTyreAgeReportLap: 0,
    lastBattleBatteryDeltaAhead: null,
    lastBattleBatteryDeltaBehind: null,
    lastBattleBatteryRivalAhead: -1,
    lastBattleBatteryRivalBehind: -1,
    lastRadioText: '',
    lastRadioTextAt: 0,
  },
};
//  TTS  edge-tts-universal (Microsoft Edge neural voices, via main process) 
const TTS_VOICES = [
  { id: 'en-GB-RyanNeural',    label: 'Ryan (British Male) ' },
  { id: 'en-GB-SoniaNeural',   label: 'Sonia (British Female)' },
  { id: 'en-GB-ThomasNeural',  label: 'Thomas (British Male)' },
  { id: 'en-US-GuyNeural',     label: 'Guy (US Male)' },
  { id: 'en-US-AriaNeural',    label: 'Aria (US Female)' },
  { id: 'en-AU-WilliamNeural', label: 'William (Australian Male)' },
  { id: 'en-AU-NatashaNeural', label: 'Natasha (Australian Female)' },
  { id: 'en-IE-ConnorNeural',  label: 'Connor (Irish Male)' },
  { id: 'en-IN-PrabhatNeural', label: 'Prabhat (Indian Male)' },
];
const tts = {
  enabled: false,
  queue:   [],
  speaking: false,
  voice:   'en-GB-RyanNeural',
  rate:    1.1,
  currentAudio: null,
  lastQueuedText: '',
  lastQueuedAt: 0,
};
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
  } catch (e) {
    console.warn('[TTS] edge-tts error:', e.message);
    tts.speaking = false;
    ttsFlush();
  }
}
//  GPT Realtime Audio Playback (PCM16 24kHz → Web Audio API)
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
  gptInitAudio();
  const binary = atob(base64Chunk);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  // Convert PCM16 LE to Float32
  const pcm16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768;
  const buffer = gptRealtime.audioContext.createBuffer(1, float32.length, gptRealtime.sampleRate);
  buffer.getChannelData(0).set(float32);
  gptRealtime.audioQueue.push(buffer);
  if (!gptRealtime.audioPlaying) gptDrainAudio();
}
function gptDrainAudio() {
  if (gptRealtime.audioQueue.length === 0) { gptRealtime.audioPlaying = false; return; }
  gptRealtime.audioPlaying = true;
  const ctx = gptRealtime.audioContext;
  const buf = gptRealtime.audioQueue.shift();
  const source = ctx.createBufferSource();
  source.buffer = buf;
  source.connect(ctx.destination);
  source.onended = () => gptDrainAudio();
  source.start();
}
// Detect current session type from telemetry state
function getCurrentSessionType() {
  const ses = state.session;
  if (!ses) return 'race';
  return [5, 6, 7, 8, 9].includes(ses.sessionType) ? 'qualifying' : 'race';
}
// Check if GPT AI is allowed for the current session type
// Returns { allowed: bool, reason: string }
function gptAllowedForSession() {
  const sType = getCurrentSessionType();
  if (license.devMode) return { allowed: true, reason: 'dev' };
  if (license.byokMode) return { allowed: true, reason: 'byok' };
  if (!license.licenseKey) {
    return {
      allowed: false,
      reason: 'No active license key. Activate a key in Settings or buy a pack first.',
    };
  }
  const exhausted = license.licenseStatus === 'exhausted'
    || ((license.racesRemaining || 0) <= 0 && (license.qualifyingRemaining || 0) <= 0 && !!license.licenseKey);
  if (sType === 'qualifying') {
    if (license.qualifyingRemaining > 0) return { allowed: true, reason: 'credit' };
    return {
      allowed: false,
      reason: exhausted
        ? 'Your current license key is exhausted. Activate a new key or buy another pack.'
        : `No qualifying credits. ${license.racesRemaining > 0 ? 'You have race credits — buy qualifying credits separately.' : 'Buy a race pack or qualifying pack.'}`,
    };
  }
  if (license.racesRemaining > 0) return { allowed: true, reason: 'credit' };
  return {
    allowed: false,
    reason: exhausted
      ? 'Your current license key is exhausted. Activate a new key or buy another pack.'
      : 'No race credits. Buy a race pack or use BYOK mode.',
  };
}
//  GPT Realtime connection helpers
async function gptConnect() {
  // BYOK: need user's key. Subscription: main process uses its own key.
  if (license.byokMode && !gptRealtime.openaiApiKey) {
    appendRadioCard('system', 'high', 'BYOK mode: enter your OpenAI key in Settings → AI Engineer.', true);
    return;
  }
  // Session type guard — check credits before connecting
  const check = gptAllowedForSession();
  if (!check.allowed) {
    appendRadioCard('system', 'high', `GPT AI: ${check.reason}`, true);
    updateGptStatusUI();
    if (String(check.reason || '').toLowerCase().includes('exhausted')) {
      navigate('settings');
    }
    return;
  }
  // Auto-detect session type for credit consumption
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
  const modeLabel = result.mode === 'byok' ? 'BYOK (your key)' : `Subscription — ${result.creditsRemaining} credit${result.creditsRemaining !== 1 ? 's' : ''} left`;
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
    connecting:   { text: 'GPT: Connecting…', cls: 'badge-warn' },
    connected:    { text: 'GPT: Live', cls: 'badge-live' },
    error:        { text: 'GPT: Error', cls: 'badge-err' },
  };
  const s = labels[gptRealtime.status] || labels.disconnected;
  badge.textContent = s.text;
  badge.className = `gpt-status-badge ${s.cls}`;
}
//  GPT Realtime telemetry push (called from RAF tick when connected + AI enabled)
function gptPushTelemetry() {
  if (!gptRealtime.connected) return;
  if (!state.connected) return;
  // Live session-type check: if session switched to qualifying with no credits, disconnect
  if (!license.byokMode && !license.devMode) {
    const sType = getCurrentSessionType();
    if (sType === 'qualifying' && license.qualifyingRemaining <= 0) {
      gptDisconnect();
      appendRadioCard('system', 'medium', 'Qualifying session detected — no qualifying credits. GPT AI paused. Classic radio active.', true);
      return;
    }
  }
  const now = Date.now();
  if (now - gptRealtime.lastPushAt < gptRealtime.pushIntervalMs) return;
  gptRealtime.lastPushAt = now;
  const lap = state.lapData?.[state.playerCarIndex];
  const sts = state.status;
  const dmg = state.damage;
  const ses = state.session;
  const tel = state.telemetry;
  if (!lap || !sts || !ses) return;
  // Tyre wear order: RL=0, RR=1, FL=2, FR=3
  const wear = dmg?.tyresWear || [0, 0, 0, 0];
  const surfT = tel?.tyresSurfaceTemperature || [0, 0, 0, 0];
  const bd = getBatteryDelta();
  const TYRE_NAMES = { 16: 'soft', 17: 'medium', 18: 'hard', 7: 'inter', 8: 'wet' };
  const compound = TYRE_NAMES[sts.visualTyreCompound] || 'unknown';
  // Gap trends
  const gapAheadMs = lap.deltaToCarAheadMs || 0;
  const gapBehindMs = lap.deltaToCarBehindMs || 0;
  const gapBehindTrend = gapBehindMs > 0 && gapBehindMs < radio.prev.gapBehindPrev ? 'closing' :
    gapBehindMs > radio.prev.gapBehindPrev * 1.05 ? 'extending' : 'stable';
  const lapTimeTrend = radio.prev.lapTimeAvg > 0 && radio.prev.lastLapTime > radio.prev.lapTimeAvg * 1.02 ? 'degrading' :
    radio.prev.lastLapTime < radio.prev.lapTimeAvg * 0.99 ? 'improving' : 'stable';
  const payload = {
    lap: lap.currentLapNum,
    lapsRemaining: (ses.totalLaps || 0) - (lap.currentLapNum || 0),
    position: lap.carPosition,
    tireAgeLaps: sts.tyresAgeLaps,
    tireCompound: compound,
    tireWearFL: Math.round(wear[2]),
    tireWearFR: Math.round(wear[3]),
    tireWearRL: Math.round(wear[0]),
    tireWearRR: Math.round(wear[1]),
    tireTempFL: Math.round(surfT[2]),
    tireTempFR: Math.round(surfT[3]),
    fuelRemaining: parseFloat((sts.fuelInTank || 0).toFixed(2)),
    fuelRemainingLaps: parseFloat((sts.fuelRemainingLaps || 0).toFixed(1)),
    ersStore: Math.round((sts.ersStoreEnergy / 4000000) * 100),
    ersDeploy: sts.ersDeployMode || 0,
    gapAhead: gapAheadMs > 0 ? parseFloat((gapAheadMs / 1000).toFixed(2)) : -1,
    gapBehind: gapBehindMs > 0 ? parseFloat((gapBehindMs / 1000).toFixed(2)) : -1,
    gapBehindTrend,
    lapTimeTrend,
    batteryVsAhead: bd ? parseFloat(bd.ahead?.deltaPct?.toFixed(1) || '0') : 0,
    batteryVsBehind: bd ? parseFloat(bd.behind?.deltaPct?.toFixed(1) || '0') : 0,
    safetyCarStatus: ses.safetyCarStatus || 0,
    weather: ['Clear','Light Cloud','Overcast','Light Rain','Heavy Rain','Storm'][ses.weather] || 'Clear',
    trackTemp: ses.trackTemperature || 0,
    frontWingDamage: Math.round(dmg?.frontLeftWingDamage || 0),
    rearWingDamage: Math.round(dmg?.rearWingDamage || 0),
  };
  window.raceEngineer.gptRealtimePush(payload).catch(() => {});
}
function setPurchaseStatus(message) {
  const statusEl = el('modal-stripe-status');
  if (statusEl) statusEl.textContent = message;
}
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function formatPaymentEventTime(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}
function getLicenseStatusLabel() {
  if (license.devMode) return 'Developer (unlimited)';
  if (license.byokMode) return 'BYOK (own OpenAI key)';
  if (license.licenseStatus === 'exhausted') return 'Exhausted - activate a new key or buy more credits';
  if (license.licenseStatus === 'active') return 'Active';
  if (license.licenseStatus === 'no-key') return 'No key active';
  return 'Subscription';
}
function getLicenseModeLabel() {
  if (license.byokMode) return 'BYOK (your key)';
  if (license.devMode) return 'Developer (free)';
  return 'Subscription';
}
function getPaymentProviderLabel(providerId) {
  const id = String(providerId || '').trim().toLowerCase();
  if (id === 'razorpay') return 'Razorpay';
  return 'PayPal';
}
function renderPaymentEvents(targetId, emptyId, limit = 10) {
  const listEl = el(targetId);
  if (!listEl) return;
  const emptyEl = emptyId ? el(emptyId) : null;
  const events = Array.isArray(license.paymentEvents)
    ? [...license.paymentEvents].slice(-limit).reverse()
    : [];

  if (events.length === 0) {
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.textContent = 'No payment events yet.';
    return;
  }
  if (emptyEl) emptyEl.textContent = '';

  listEl.innerHTML = events.map((evt) => {
    const level = String(evt?.level || 'info').toLowerCase();
    const safeLevel = ['success', 'warn', 'error'].includes(level) ? level : 'info';
    const status = evt?.status ? `<span class="payment-log-tag">${escapeHtml(evt.status)}</span>` : '';
    const provider = evt?.provider ? `<span class="payment-log-tag">${escapeHtml(getPaymentProviderLabel(evt.provider))}</span>` : '';
    const order = evt?.orderId ? `<span class="payment-log-tag">Order ${escapeHtml(evt.orderId)}</span>` : '';
    const tx = evt?.txId ? `<span class="payment-log-tag">Tx ${escapeHtml(evt.txId)}</span>` : '';
    const key = evt?.licenseKey ? `<span class="payment-log-tag">Key ${escapeHtml(evt.licenseKey)}</span>` : '';
    return `
      <div class="payment-log-item payment-log-${safeLevel}">
        <div class="payment-log-head">
          <span class="payment-log-stage">${escapeHtml(evt?.stage || 'event')}</span>
          <span class="payment-log-time">${escapeHtml(formatPaymentEventTime(evt?.at))}</span>
        </div>
        <div class="payment-log-message">${escapeHtml(evt?.message || '')}</div>
        <div class="payment-log-meta">${provider}${status}${order}${tx}${key}</div>
      </div>
    `;
  }).join('');
}
function refreshLicenseBadges() {
  if (!Array.isArray(license.paymentEvents)) license.paymentEvents = [];
  if (!license.licenseStatus) {
    if (license.devMode) license.licenseStatus = 'dev';
    else if (license.byokMode) license.licenseStatus = 'byok';
    else if (!license.licenseKey) license.licenseStatus = 'no-key';
    else if ((license.racesRemaining || 0) <= 0 && (license.qualifyingRemaining || 0) <= 0) license.licenseStatus = 'exhausted';
    else license.licenseStatus = 'active';
  }

  const racesText = license.devMode ? '∞' : String(license.racesRemaining ?? 0);
  const qualsText = license.devMode ? '∞' : String(license.qualifyingRemaining ?? 0);

  const racesEl = el('mc-races');
  const qualsEl = el('mc-quals');
  if (racesEl) racesEl.textContent = racesText;
  if (qualsEl) qualsEl.textContent = qualsText;

  const setRacesEl = el('set-race-credits');
  const setQualsEl = el('set-qual-credits');
  if (setRacesEl) setRacesEl.textContent = racesText;
  if (setQualsEl) setQualsEl.textContent = qualsText;

  const modeEl = el('set-license-mode');
  if (modeEl) modeEl.textContent = getLicenseModeLabel();

  const statusEl = el('set-license-status');
  if (statusEl) statusEl.textContent = getLicenseStatusLabel();

  const exhaustedEl = el('set-license-exhausted-at');
  if (exhaustedEl) {
    exhaustedEl.textContent = license.licenseExhaustedAt
      ? formatPaymentEventTime(license.licenseExhaustedAt)
      : '-';
  }

  const key = license.lastIssuedLicenseKey || license.licenseKey || '-';
  const keyEl = el('set-last-license-key');
  if (keyEl) keyEl.textContent = key;
  const modalKeyEl = el('modal-issued-key');
  if (modalKeyEl) modalKeyEl.textContent = key;

  renderPaymentEvents('set-payment-log-list', 'set-payment-log-empty', 12);
  renderPaymentEvents('modal-payment-log-list', 'modal-payment-log-empty', 6);
}
function refreshPurchaseCredits() {
  refreshLicenseBadges();
}
function stopPayPalPolling() {
  if (paypalCheckout.pollTimer) {
    clearInterval(paypalCheckout.pollTimer);
    paypalCheckout.pollTimer = null;
  }
}
function startPayPalPolling() {
  stopPayPalPolling();
  paypalCheckout.pollTimer = setInterval(() => {
    verifyPendingPayPalOrder({ silentPending: true }).catch(() => {});
  }, 4000);
}
async function verifyPendingPayPalOrder({ silentPending = false } = {}) {
  if (!paypalCheckout.pendingOrder || paypalCheckout.verifying) return;
  paypalCheckout.verifying = true;
  try {
    const pending = paypalCheckout.pendingOrder;
    const providerLabel = getPaymentProviderLabel(pending.provider);
    const maxPendingMs = 15 * 60 * 1000;
    if (pending.startedAt && (Date.now() - pending.startedAt) > maxPendingMs) {
      setPurchaseStatus('Payment verification timed out. Click "I completed payment" to retry.');
      stopPayPalPolling();
      return;
    }
    const result = await window.raceEngineer.stripeVerifySession({
      sessionId: pending.orderId,
      packId: pending.packId,
      raceLaps: pending.raceLaps,
      racePercent: pending.racePercent,
      activeSituations: pending.activeSituations,
      currencyCode: pending.currencyCode,
      provider: pending.provider,
    });
    if (result.pending) {
      if (!silentPending) {
        setPurchaseStatus(`Waiting for ${providerLabel} confirmation (${result.status || 'PENDING'})...`);
      }
      return;
    }
    if (result.error) {
      setPurchaseStatus(`${providerLabel} payment verification failed: ${result.error}`);
      stopPayPalPolling();
      return;
    }
    Object.assign(license, result.license);
    refreshPurchaseCredits();
    if (result.needsActivation) {
      const keyText = result.licenseKey ? ` Key: ${result.licenseKey}` : '';
      const warningText = result.warning ? ` (${result.warning})` : '';
      setPurchaseStatus(`${providerLabel} payment captured. Activate your key in Settings.${keyText}`);
      appendRadioCard(
        'system',
        'high',
        `${providerLabel} payment captured but auto-activation failed. Activate key manually from Settings.${keyText}${warningText}`,
        true
      );
    } else {
      const keyText = result.licenseKey ? ` Key: ${result.licenseKey}` : '';
      setPurchaseStatus(`${providerLabel} payment confirmed. Credits updated.${keyText}`);
    }
    appendRadioCard(
      'system',
      'medium',
      result.needsActivation
        ? `${providerLabel} purchase captured. Activate key ${result.licenseKey || '(see Settings)'} to use credits on this machine.`
        : `${providerLabel} purchase complete. Race credits: ${license.racesRemaining}, Qualifying: ${license.qualifyingRemaining}.`,
      true
    );
    paypalCheckout.pendingOrder = null;
    stopPayPalPolling();
  } finally {
    paypalCheckout.verifying = false;
  }
}
//  Purchase modal — Stripe Checkout
function showPurchaseModal() {
  const existing = el('purchase-modal-overlay');
  if (existing) { existing.remove(); }
  const raceLaps = state.session?.totalLaps || 58;
  const racePercent = 100;
  const activeSits = countAiEnabledSituations(radio.config);
  const overlay = document.createElement('div');
  overlay.id = 'purchase-modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-icon">🏎</span>
        <h2>AI Engineer — Race Packs</h2>
        <button class="modal-close" id="modal-close-btn">✕</button>
      </div>
      <div class="modal-tabs">
        <button class="modal-tab active" id="tab-subscription">Buy Credits</button>
        <button class="modal-tab" id="tab-byok">Use My Own Key (Free)</button>
      </div>
      <!-- Subscription tab -->
      <div id="tab-content-subscription">
        <p class="modal-sub">Credits let you use GPT AI voice with our OpenAI key — no setup needed.
          Pricing is based on race length and AI situations enabled.</p>
        <div class="modal-info-row">
          <span>AI situations active: <strong>${activeSits}</strong></span>
          <span>~${raceLaps} laps detected</span>
        </div>
        <div class="settings-field" style="margin-bottom:10px">
          <label>Payment Provider</label>
          <div class="modal-provider-cards" id="modal-provider-cards" role="radiogroup" aria-label="Payment Provider"></div>
        </div>
        <div class="settings-field" style="margin-bottom:10px">
          <label>Checkout Currency</label>
          <select class="settings-input" id="modal-currency-select"></select>
        </div>
        <div id="modal-packs-loading" style="text-align:center;padding:20px;color:var(--text3)">Loading pricing…</div>
        <div id="modal-packs" class="modal-packs hidden"></div>
        <div class="modal-credits">
          <span>Race credits: <strong id="mc-races">${license.devMode ? '∞' : license.racesRemaining}</strong></span>
          <span>Qualifying credits: <strong id="mc-quals">${license.devMode ? '∞' : license.qualifyingRemaining}</strong></span>
          ${license.devMode ? '<span class="dev-badge">DEV MODE — Free</span>' : ''}
        </div>
        <div id="modal-stripe-status" style="margin-top:8px;font-size:12px;color:var(--text3);min-height:18px"></div>
        <button class="settings-save-btn" id="modal-verify-btn" style="display:none;margin-top:8px;width:100%">
          I completed payment
        </button>
        <div class="stat-row" style="margin-top:10px">
          <span class="stat-label">Last Issued Key</span>
          <span class="stat-value mono" id="modal-issued-key">${license.lastIssuedLicenseKey || license.licenseKey || '-'}</span>
        </div>
        <div style="margin-top:10px">
          <div class="stat-row"><span class="stat-label">Recent Payment Events</span><span class="stat-value" id="modal-payment-log-empty">No payment events yet.</span></div>
          <div id="modal-payment-log-list" class="payment-log-list"></div>
        </div>
      </div>
      <!-- BYOK tab -->
      <div id="tab-content-byok" class="hidden">
        <p class="modal-sub">Enter your own OpenAI API key. You pay OpenAI directly at their standard rates.
          No credits needed — free to use in the app.</p>
        <div class="settings-field" style="margin-top:10px">
          <label>Your OpenAI API Key</label>
          <input type="password" class="settings-input" id="byok-key-input" placeholder="sk-..." value="${gptRealtime.openaiApiKey || ''}">
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="settings-save-btn" id="byok-save-btn" style="background:var(--accent);flex:1">Save Key &amp; Enable BYOK</button>
          ${license.byokMode ? '<button class="settings-save-btn" id="byok-disable-btn" style="flex:1">Disable BYOK</button>' : ''}
        </div>
        <p class="settings-note" style="margin-top:8px">
          Get a key at <strong>platform.openai.com/api-keys</strong>.
          BYOK uses <em>gpt-4o-realtime-preview</em> — you will be billed by OpenAI (~$0.06/min audio).
        </p>
        ${license.byokMode ? '<div class="byok-active-badge">BYOK Active — using your own key</div>' : ''}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  el('modal-close-btn').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  // Tab switching
  el('tab-subscription').addEventListener('click', () => {
    el('tab-subscription').classList.add('active');
    el('tab-byok').classList.remove('active');
    el('tab-content-subscription').classList.remove('hidden');
    el('tab-content-byok').classList.add('hidden');
  });
  el('tab-byok').addEventListener('click', () => {
    el('tab-byok').classList.add('active');
    el('tab-subscription').classList.remove('active');
    el('tab-content-byok').classList.remove('hidden');
    el('tab-content-subscription').classList.add('hidden');
  });
  // If BYOK is currently active, show that tab first
  if (license.byokMode) {
    el('tab-byok').click();
  }
  // BYOK save
  el('byok-save-btn')?.addEventListener('click', async () => {
    const key = el('byok-key-input')?.value.trim();
    if (!key || !key.startsWith('sk-')) {
      el('modal-stripe-status').textContent = 'Enter a valid OpenAI key (starts with sk-)';
      return;
    }
    gptRealtime.openaiApiKey = key;
    const result = await window.raceEngineer.setBYOKMode({ enabled: true });
    if (result.success) {
      Object.assign(license, result.license);
      overlay.remove();
      appendRadioCard('system', 'medium', 'BYOK mode enabled. Using your own OpenAI key.', true);
    }
  });
  el('byok-disable-btn')?.addEventListener('click', async () => {
    const result = await window.raceEngineer.setBYOKMode({ enabled: false });
    if (result.success) {
      Object.assign(license, result.license);
      overlay.remove();
      appendRadioCard('system', 'low', 'BYOK disabled. Using subscription credits.', true);
    }
  });
  el('modal-verify-btn')?.addEventListener('click', async () => {
    const verifyBtn = el('modal-verify-btn');
    if (!paypalCheckout.pendingOrder) {
      setPurchaseStatus('No pending payment found. Start checkout again.');
      return;
    }
    if (verifyBtn) {
      verifyBtn.disabled = true;
      verifyBtn.textContent = 'Verifying...';
    }
    setPurchaseStatus(`Verifying ${getPaymentProviderLabel(paypalCheckout.pendingOrder.provider)} payment...`);
    await verifyPendingPayPalOrder({ silentPending: false });
    if (verifyBtn) {
      verifyBtn.disabled = false;
      verifyBtn.textContent = 'I completed payment';
    }
  });
  refreshLicenseBadges();
  // Load subscription packs and currency options
  const stripeStatusEl = el('modal-stripe-status');
  const providerCardsEl = el('modal-provider-cards');
  const currencySelectEl = el('modal-currency-select');
  const loadingEl = el('modal-packs-loading');
  const packsEl = el('modal-packs');
  let paymentProviders = [{ id: 'paypal', label: 'PayPal', configured: true, defaultCurrency: 'USD', supportedCurrencies: ['USD'] }];
  let selectedProviderId = paymentProviders[0].id;

  const getSelectedProvider = () => {
    const providerId = selectedProviderId
      || paymentProviders.find((provider) => provider.configured)?.id
      || paymentProviders[0]?.id
      || 'paypal';
    return paymentProviders.find((provider) => provider.id === providerId) || paymentProviders[0];
  };

  const getPaymentProviderSummary = (provider) => {
    if (!provider) return '';
    if (provider.id === 'razorpay') return 'UPI, cards, netbanking, wallets';
    return 'PayPal balance, cards, international checkout';
  };

  const getPaymentProviderBadge = (provider) => {
    if (!provider) return '';
    if (provider.id === 'razorpay') return 'India checkout';
    return 'Global checkout';
  };

  const renderProviderCards = () => {
    if (!providerCardsEl) return;
    providerCardsEl.innerHTML = paymentProviders.map((provider) => {
      const isActive = provider.id === getSelectedProvider()?.id;
      const stateClass = provider.configured
        ? (isActive ? ' payment-provider-card-active' : '')
        : ' payment-provider-card-disabled';
      const markClass = provider.id === 'razorpay'
        ? ' payment-provider-mark-razorpay'
        : ' payment-provider-mark-paypal';
      const currencyList = Array.from(new Set((provider.supportedCurrencies || [provider.defaultCurrency || 'USD'])
        .map((code) => String(code || '').trim().toUpperCase())
        .filter(Boolean)));
      const currencyText = currencyList.join(', ');

      return `
        <button
          type="button"
          class="payment-provider-card${stateClass}"
          data-provider-id="${escapeHtml(provider.id)}"
          role="radio"
          aria-checked="${isActive ? 'true' : 'false'}"
          ${provider.configured ? '' : 'disabled'}
        >
          <div class="payment-provider-card-head">
            <div class="payment-provider-mark${markClass}">${escapeHtml(provider.label)}</div>
            <span class="payment-provider-pill">${escapeHtml(getPaymentProviderBadge(provider))}</span>
          </div>
          <div class="payment-provider-title-row">
            <span class="payment-provider-title">${escapeHtml(provider.label)}</span>
            <span class="payment-provider-radio" aria-hidden="true"></span>
          </div>
          <div class="payment-provider-summary">${escapeHtml(getPaymentProviderSummary(provider))}</div>
          <div class="payment-provider-meta">
            <span>Default ${escapeHtml(provider.defaultCurrency || 'USD')}</span>
            <span>${escapeHtml(currencyText || provider.defaultCurrency || 'USD')}</span>
          </div>
          ${provider.configured ? '' : '<div class="payment-provider-note">Setup required in .env</div>'}
        </button>
      `;
    }).join('');

    providerCardsEl.querySelectorAll('.payment-provider-card').forEach((card) => {
      card.addEventListener('click', async () => {
        const nextProviderId = card.dataset.providerId;
        if (!nextProviderId || nextProviderId === selectedProviderId) return;
        selectedProviderId = nextProviderId;
        renderProviderCards();
        const nextCurrency = renderCurrencyOptions(getSelectedProvider(), currencySelectEl?.value);
        await renderPacksForCurrency(nextCurrency, nextProviderId);
      });
    });
  };

  const renderCurrencyOptions = (provider, preferredCurrency = currencySelectEl?.value) => {
    if (!currencySelectEl || !provider) return provider?.defaultCurrency || 'USD';
    const currencies = Array.from(new Set((provider.supportedCurrencies || [provider.defaultCurrency || 'USD'])
      .map((code) => String(code || '').trim().toUpperCase())
      .filter(Boolean)));
    const resolved = currencies.includes(preferredCurrency)
      ? preferredCurrency
      : (currencies.includes(provider.defaultCurrency) ? provider.defaultCurrency : currencies[0]);
    currencySelectEl.innerHTML = currencies.map((code) => `<option value="${code}">${code}</option>`).join('');
    currencySelectEl.value = resolved;
    currencySelectEl.disabled = provider.configured === false;
    return resolved;
  };

  const renderPacksForCurrency = async (selectedCurrency, providerId = getSelectedProvider()?.id || 'paypal') => {
    if (!packsEl) return;
    const provider = paymentProviders.find((item) => item.id === providerId) || paymentProviders[0];
    const providerLabel = getPaymentProviderLabel(provider?.id);
    if (!provider?.configured) {
      if (loadingEl) loadingEl.style.display = 'none';
      packsEl.classList.remove('hidden');
      packsEl.innerHTML = `<div class="settings-note">${providerLabel} is not configured yet. Add its keys in .env to enable checkout.</div>`;
      return;
    }
    if (loadingEl) {
      loadingEl.style.display = 'block';
      loadingEl.textContent = 'Loading pricing…';
    }
    packsEl.classList.add('hidden');

    const packs = await window.raceEngineer.getPricingPacks({
      raceLaps,
      racePercent,
      activeSituations: activeSits,
      currencyCode: selectedCurrency,
    });

    if (loadingEl) loadingEl.style.display = 'none';
    packsEl.classList.remove('hidden');
    if (!Array.isArray(packs) || packs.length === 0) {
      packsEl.innerHTML = '<div class="settings-note">No packs available right now.</div>';
      return;
    }

    packsEl.innerHTML = packs.map(p => `
      <div class="modal-pack-card">
        <div class="pack-label">${p.label}</div>
        <div class="pack-price">${p.priceDisplay}</div>
        ${p.perRaceDisplay ? `<div class="pack-per-race">${p.perRaceDisplay}</div>` : ''}
        <div class="pack-details">${p.type === 'qualifying' ? `~${Math.round(p.minutes)} min` : `${p.count} race${p.count > 1 ? 's' : ''}`}</div>
        <button class="settings-save-btn pack-buy-btn" data-pack-id="${p.id}" style="margin-top:8px;width:100%">
          Pay with ${providerLabel}
        </button>
      </div>
    `).join('');

    packsEl.querySelectorAll('.pack-buy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const activeProvider = getSelectedProvider();
        const activeProviderLabel = getPaymentProviderLabel(activeProvider?.id);
        const selected = currencySelectEl?.value || selectedCurrency || activeProvider?.defaultCurrency || 'USD';
        btn.disabled = true;
        btn.textContent = 'Opening…';
        if (stripeStatusEl) stripeStatusEl.textContent = `Opening ${activeProviderLabel} Checkout (${selected})…`;
        const result = await window.raceEngineer.stripeCheckout({
          packId: btn.dataset.packId,
          raceLaps,
          racePercent,
          activeSituations: activeSits,
          currencyCode: selected,
          provider: activeProvider?.id,
        });
        btn.disabled = false;
        btn.textContent = `Pay with ${activeProviderLabel}`;
        if (result.error) {
          if (stripeStatusEl) stripeStatusEl.textContent = `Error: ${result.error}`;
          return;
        }

        const opened = await window.raceEngineer.openExternal(result.url);
        if (opened?.error) {
          if (stripeStatusEl) stripeStatusEl.textContent = `Error: ${opened.error}`;
          return;
        }
        paypalCheckout.pendingOrder = {
          orderId: result.orderId,
          provider: result.provider || activeProvider?.id || providerId,
          packId: btn.dataset.packId,
          raceLaps,
          racePercent,
          activeSituations: activeSits,
          currencyCode: result.currencyCode || selected,
          startedAt: Date.now(),
        };
        const verifyBtn = el('modal-verify-btn');
        if (verifyBtn) verifyBtn.style.display = 'block';
        startPayPalPolling();
        if (stripeStatusEl) {
          const amountText = result.amountValue ? `${result.currencyCode || selected} ${result.amountValue}` : (result.currencyCode || selected);
          stripeStatusEl.textContent = opened?.mode === 'deep-link'
            ? `${activeProviderLabel} callback received (${amountText}). Verifying purchase...`
            : `Complete payment in your browser with ${activeProviderLabel} (${amountText}), then click "I completed payment". Auto-check is also running.`;
        }
      });
    });
  };

  const initPaymentOptions = async () => {
    let defaultProviderId = 'paypal';
    try {
      const paymentOptions = await window.raceEngineer.getPaymentOptions();
      if (Array.isArray(paymentOptions?.providers) && paymentOptions.providers.length > 0) {
        paymentProviders = paymentOptions.providers
          .map((provider) => ({
            id: String(provider.id || '').trim().toLowerCase(),
            label: getPaymentProviderLabel(provider.id),
            configured: provider.configured !== false,
            defaultCurrency: String(provider.defaultCurrency || 'USD').trim().toUpperCase(),
            supportedCurrencies: Array.isArray(provider.supportedCurrencies) && provider.supportedCurrencies.length > 0
              ? provider.supportedCurrencies.map((code) => String(code || '').trim().toUpperCase()).filter(Boolean)
              : [String(provider.defaultCurrency || 'USD').trim().toUpperCase()],
          }))
          .filter((provider) => provider.id);
      }
      if (paymentOptions?.defaultProvider) {
        defaultProviderId = String(paymentOptions.defaultProvider).trim().toLowerCase();
      }
    } catch {
      // Keep fallback payment options.
    }

    if (!Array.isArray(paymentProviders) || paymentProviders.length === 0) {
      paymentProviders = [{ id: 'paypal', label: 'PayPal', configured: true, defaultCurrency: 'USD', supportedCurrencies: ['USD'] }];
    }

    const initialProvider = paymentProviders.find((provider) => provider.id === defaultProviderId && provider.configured)
      || paymentProviders.find((provider) => provider.configured)
      || paymentProviders.find((provider) => provider.id === defaultProviderId)
      || paymentProviders[0];
    selectedProviderId = initialProvider.id;
    const initialCurrency = renderCurrencyOptions(initialProvider);

    if (providerCardsEl) {
      renderProviderCards();
    }

    if (currencySelectEl) {
      currencySelectEl.addEventListener('change', async () => {
        const selectedProvider = getSelectedProvider();
        await renderPacksForCurrency(currencySelectEl.value || selectedProvider.defaultCurrency, selectedProvider.id);
      });
    }

    await renderPacksForCurrency(initialCurrency, initialProvider.id);
  };

  initPaymentOptions().catch((err) => {
    if (stripeStatusEl) stripeStatusEl.textContent = `Failed to load payment options: ${err.message}`;
  });
}
//  Router
function navigate(page) {
  const pageKey = (page || '').toLowerCase();
  document.querySelectorAll('.nav-item').forEach(a => {
    a.classList.toggle('active', a.dataset.page === pageKey);
  });
  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('active', p.id === `page-${pageKey}`);
  });
  if (DETACH_PAGE) {
    setDetachedWindowTitle(pageKey);
  }
}
//  Helpers 
function fmt(ms) {
  if (!ms || ms === 0) return '-:--.---';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const ms3 = ms % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(ms3).padStart(3, '0')}`;
}
function fmtSector(ms) {
  if (!ms || ms === 0) return '--.---';
  const s = Math.floor(ms / 1000);
  const ms3 = ms % 1000;
  return `${s}.${String(ms3).padStart(3, '0')}`;
}
function fmtCountdown(sec) {
  if (!sec || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function tyreClass(tempC) {
  if (tempC < 50)  return 'temp-cold';
  if (tempC < 70)  return 'temp-cool';
  if (tempC < 90)  return 'temp-opt';
  if (tempC < 110) return 'temp-warm';
  if (tempC < 130) return 'temp-hot';
  return 'temp-vhot';
}
function dmgClass(pct) {
  if (pct < 25)  return 'dmg-low';
  if (pct < 50)  return 'dmg-mid';
  if (pct < 75)  return 'dmg-high';
  return 'dmg-crit';
}
function tyreBadge(compound) {
  const c = TYRE_COMPOUNDS[compound] || { label: '?', color: '#888' };
  return `<span class="tyre-badge" style="background:${c.color}22;color:${c.color};border:1px solid ${c.color}55">${c.label}</span>`;
}
function teamColor(teamId) {
  return TEAM_COLORS[teamId] || '#888888';
}
function weatherIcon(w) {
  const icons = { 0: 'SUN', 1: 'CLEAR', 2: 'CLOUD', 3: 'RAIN', 4: 'HEAVY', 5: 'STORM' };
  return icons[w] || 'N/A';
}
function safetyCarLabel(sc) {
  const labels = { 0: '', 1: 'SC', 2: 'VSC', 3: 'SC Ending' };
  return labels[sc] || '';
}
function el(id) { return document.getElementById(id); }
//  Pop-out helper 
function popoutBtn(page, title, width, height) {
  return `<button class="popout-btn" onclick="window.raceEngineer.openWindow({page:'${page}',title:'${title}',width:${width || 1000},height:${height || 700}})">Pop Out</button>`;
}
//  Battery delta helper 
function getBatteryDelta() {
  const sts = state.status;
  const lap = state.lapData?.[state.playerCarIndex];
  if (!sts || !lap || !state.allCarStatus) return null;
  const myErsMJ = sts.ersStoreEnergy / 1e6;
  const myErsPct = (sts.ersStoreEnergy / 4000000) * 100;
  const myPos = lap.carPosition;
  const carAheadLap = state.lapData?.find(l => l?.carPosition === myPos - 1);
  const carBehindLap = state.lapData?.find(l => l?.carPosition === myPos + 1);
  const aheadIdx = carAheadLap ? state.lapData.indexOf(carAheadLap) : -1;
  const behindIdx = carBehindLap ? state.lapData.indexOf(carBehindLap) : -1;
  const aheadSts = aheadIdx >= 0 ? state.allCarStatus[aheadIdx] : null;
  const behindSts = behindIdx >= 0 ? state.allCarStatus[behindIdx] : null;
  const aheadName = state.participants?.participants?.[aheadIdx]?.name || null;
  const behindName = state.participants?.participants?.[behindIdx]?.name || null;
  let aheadDelta = null;
  if (aheadSts) {
    const theirMJ = aheadSts.ersStoreEnergy / 1e6;
    const theirPct = (aheadSts.ersStoreEnergy / 4000000) * 100;
    aheadDelta = {
      name: aheadName || `P${myPos - 1}`,
      myMJ: myErsMJ, theirMJ,
      deltaMJ: +(myErsMJ - theirMJ).toFixed(2),
      deltaPct: +(myErsPct - theirPct).toFixed(1),
    };
  }
  let behindDelta = null;
  if (behindSts) {
    const theirMJ = behindSts.ersStoreEnergy / 1e6;
    const theirPct = (behindSts.ersStoreEnergy / 4000000) * 100;
    behindDelta = {
      name: behindName || `P${myPos + 1}`,
      myMJ: myErsMJ, theirMJ,
      deltaMJ: +(myErsMJ - theirMJ).toFixed(2),
      deltaPct: +(myErsPct - theirPct).toFixed(1),
    };
  }
  return { myMJ: +myErsMJ.toFixed(2), myPct: +myErsPct.toFixed(1), ahead: aheadDelta, behind: behindDelta };
}
function batteryDeltaHTML(delta) {
  if (!delta) return '';
  let html = '';
  if (delta.ahead) {
    const cls = delta.ahead.deltaMJ > 0 ? 'advantage' : delta.ahead.deltaMJ < 0 ? 'disadvantage' : 'neutral';
    const sign = delta.ahead.deltaMJ > 0 ? '+' : '';
    html += `<div class="battery-delta">
      <span class="battery-delta-label">vs ${delta.ahead.name} (ahead):</span>
      <span class="battery-delta-value ${cls}">${sign}${delta.ahead.deltaMJ.toFixed(2)} MJ (${sign}${delta.ahead.deltaPct.toFixed(1)}%)</span>
    </div>`;
  }
  if (delta.behind) {
    const cls = delta.behind.deltaMJ > 0 ? 'advantage' : delta.behind.deltaMJ < 0 ? 'disadvantage' : 'neutral';
    const sign = delta.behind.deltaMJ > 0 ? '+' : '';
    html += `<div class="battery-delta">
      <span class="battery-delta-label">vs ${delta.behind.name} (behind):</span>
      <span class="battery-delta-value ${cls}">${sign}${delta.behind.deltaMJ.toFixed(2)} MJ (${sign}${delta.behind.deltaPct.toFixed(1)}%)</span>
    </div>`;
  }
  return html;
}
//  Top bar updater 
function updateTopBar() {
  const lap = state.lapData?.[state.playerCarIndex];
  const ses = state.session;
  const tel = state.telemetry;
  if (ses) {
    const sc = ses.safetyCarStatus ? `  ${safetyCarLabel(ses.safetyCarStatus)}` : '';
    el('topbar-session').textContent =
      `${ses.trackName || ''}  ${ses.sessionTypeName || ''}${sc}`;
  }
  if (lap) {
    el('tb-pos').innerHTML = `P<strong>${lap.carPosition || ''}</strong>`;
    el('tb-lap').innerHTML = `Lap <strong>${lap.currentLapNum || ''}/${ses?.totalLaps || ''}</strong>`;
    el('tb-time').innerHTML = `<strong>${fmt(lap.currentLapTimeMs)}</strong>`;
  }
}
//  Dashboard page 
function buildDashboard() {
  const p = el('page-dashboard');
  p.innerHTML = `
    <div class="dash-main">
      <!-- Hero: speed / gear / rpm -->
      <div class="hero-panel">
        <div class="speed-display">
          <div class="speed-value" id="d-speed">0</div>
          <div class="speed-unit">km/h</div>
        </div>
        <div class="gear-display">
          <div class="gear-value" id="d-gear">N</div>
          <div class="gear-label">Gear</div>
        </div>
        <div class="rpm-section">
          <div class="rpm-label">Engine RPM</div>
          <div class="rpm-value" id="d-rpm">0</div>
          <div class="rpm-bar-track">
            <div class="rpm-bar-fill" id="d-rpm-bar" style="width:0%"></div>
          </div>
          <div class="rev-lights" id="d-revlights">
            ${Array.from({length: 15}, (_, i) => `<div class="rev-light" id="rl-${i}"></div>`).join('')}
          </div>
        </div>
        <div style="margin-left:auto">
          <div class="drs-badge inactive" id="d-drs">DRS</div>
        </div>
      </div>
      <!-- Pedals -->
      <div class="pedals-panel">
        <div class="section-title">Inputs</div>
        <div class="pedals-row">
          <div class="pedal-block">
            <div class="pedal-label"><span>Throttle</span><span id="d-throttle-val">0%</span></div>
            <div class="pedal-track"><div class="pedal-fill throttle" id="d-throttle" style="width:0%"></div></div>
          </div>
          <div class="pedal-block">
            <div class="pedal-label"><span>Brake</span><span id="d-brake-val">0%</span></div>
            <div class="pedal-track"><div class="pedal-fill brake" id="d-brake" style="width:0%"></div></div>
          </div>
          <div class="pedal-block" style="max-width:100px">
            <div class="pedal-label"><span>Clutch</span><span id="d-clutch-val">0%</span></div>
            <div class="pedal-track"><div class="pedal-fill clutch" id="d-clutch" style="width:0%"></div></div>
          </div>
        </div>
      </div>
      <!-- Fuel & ERS quick -->
      <div class="grid-2">
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="panel">
            <div class="panel-header">Fuel</div>
            <div class="panel-body">
              <div class="stat-row"><span class="stat-label">In tank</span><span class="stat-value" id="d-fuel"> kg</span></div>
              <div class="stat-row"><span class="stat-label">Laps remaining</span><span class="stat-value" id="d-fuel-laps"></span></div>
              <div class="prog-bar" style="margin-top:10px"><div class="prog-fill fuel" id="d-fuel-bar" style="width:0%"></div></div>
            </div>
          </div>
          <div class="panel">
            <div class="panel-header">Gap Analysis</div>
            <div class="panel-body">
              <div class="stat-row"><span class="stat-label">Gap to car ahead</span><span class="stat-value mono" id="d-gap-ahead"></span></div>
              <div class="stat-row"><span class="stat-label">Gap to leader</span><span class="stat-value mono" id="d-gap-leader"></span></div>
              <div class="stat-row"><span class="stat-label">DRS</span><span class="stat-value" id="d-drs-status"></span></div>
              <div id="d-gap-indicator" class="gap-indicator" style="margin-top:8px"></div>
            </div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="panel">
            <div class="panel-header">ERS</div>
            <div class="panel-body">
              <div class="stat-row"><span class="stat-label">Store</span><span class="stat-value" id="d-ers"> MJ</span></div>
              <div class="stat-row"><span class="stat-label">Battery %</span><span class="stat-value" id="d-ers-pct"></span></div>
              <div class="stat-row"><span class="stat-label">Deploy mode</span><span class="stat-value" id="d-ers-mode"></span></div>
              <div class="prog-bar" style="margin-top:10px"><div class="prog-fill ers" id="d-ers-bar" style="width:0%"></div></div>
              <div id="d-battery-delta" style="margin-top:8px"></div>
            </div>
          </div>
          <div class="panel">
            <div class="panel-header">Weather Forecast</div>
            <div class="panel-body">
              <div class="stat-row"><span class="stat-label">Current</span><span class="stat-value" id="d-wx-current"></span></div>
              <div class="stat-row"><span class="stat-label">Track C</span><span class="stat-value mono" id="d-wx-track"></span></div>
              <div class="stat-row"><span class="stat-label">Air C</span><span class="stat-value mono" id="d-wx-air"></span></div>
              <div id="d-wx-forecast" style="margin-top:8px"></div>
              <div id="d-wx-rain-eta" style="margin-top:6px;font-size:11px;color:var(--text2)"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- Side: tyres + lap info + race progress -->
    <div class="dash-side">
      <div class="panel">
        <div class="panel-header">Tyres <span id="d-tyre-compound" style="font-weight:400;font-size:11px;color:var(--text2)"></span></div>
        <div class="panel-body">
          <div class="tyres-grid" id="d-tyres">
            ${['FL','FR','RL','RR'].map(pos => `
              <div class="tyre-cell">
                <div class="tyre-circle temp-cool" id="tc-${pos}">
                  <span class="tyre-temp" id="tt-${pos}"></span>
                  <span class="tyre-unit">C</span>
                </div>
                <div class="tyre-label">${pos}</div>
                <div class="tyre-wear" id="tw-${pos}">wear: %</div>
              </div>`).join('')}
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header">Race Progress</div>
        <div class="panel-body">
          <div class="stat-row"><span class="stat-label">Position</span><span class="stat-value" id="d-pos"></span></div>
          <div class="stat-row"><span class="stat-label">Current lap</span><span class="stat-value mono" id="d-cur-lap"></span></div>
          <div class="stat-row"><span class="stat-label">Last lap</span><span class="stat-value mono" id="d-last-lap"></span></div>
          <div class="stat-row"><span class="stat-label">Sector 1</span><span class="stat-value mono" id="d-s1"></span></div>
          <div class="stat-row"><span class="stat-label">Sector 2</span><span class="stat-value mono" id="d-s2"></span></div>
          <div class="stat-row"><span class="stat-label">Pit stops</span><span class="stat-value" id="d-pits"></span></div>
          <div class="stat-row"><span class="stat-label">Tyre age</span><span class="stat-value" id="d-tyre-age"> laps</span></div>
          <div style="margin-top:8px">
            <div class="section-title">Race %</div>
            <div class="prog-bar"><div class="prog-fill race-prog" id="d-race-prog" style="width:0%"></div></div>
            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-top:3px">
              <span id="d-race-lap-info"></span>
              <span id="d-race-pct">0%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
function updateDashboard() {
  const tel = state.telemetry;
  const sts = state.status;
  const dmg = state.damage;
  const lap = state.lapData?.[state.playerCarIndex];
  if (!tel) return;
  // Speed / gear
  el('d-speed').textContent = tel.speed;
  el('d-gear').textContent = tel.gear <= 0 ? (tel.gear === 0 ? 'N' : 'R') : tel.gear;
  // RPM
  const maxRPM = sts?.maxRPM || 15000;
  const rpmPct = clamp((tel.engineRPM / maxRPM) * 100, 0, 100);
  el('d-rpm').textContent = tel.engineRPM.toLocaleString();
  el('d-rpm-bar').style.width = rpmPct + '%';
  // Rev lights (15 lights: 0-4 green, 5-9 yellow, 10-14 red)
  const litCount = Math.round((tel.revLightsPercent / 100) * 15);
  for (let i = 0; i < 15; i++) {
    const light = el(`rl-${i}`);
    if (!light) continue;
    if (i < litCount) {
      light.className = 'rev-light ' + (i < 5 ? 'on-green' : i < 10 ? 'on-yellow' : 'on-red');
    } else {
      light.className = 'rev-light';
    }
  }
  // DRS
  const drsEl = el('d-drs');
  if (tel.drs) {
    drsEl.className = 'drs-badge active';
    drsEl.textContent = 'DRS ON';
  } else {
    drsEl.className = 'drs-badge inactive';
    drsEl.textContent = 'DRS';
  }
  // Pedals
  const throttlePct = Math.round(tel.throttle * 100);
  const brakePct = Math.round(tel.brake * 100);
  const clutchPct = clamp(tel.clutch, 0, 100);
  el('d-throttle').style.width = throttlePct + '%';
  el('d-throttle-val').textContent = throttlePct + '%';
  el('d-brake').style.width = brakePct + '%';
  el('d-brake-val').textContent = brakePct + '%';
  el('d-clutch').style.width = clutchPct + '%';
  el('d-clutch-val').textContent = clutchPct + '%';
  // Tyres  order in packet: RL=0, RR=1, FL=2, FR=3
  const tyreOrder = { RL: 0, RR: 1, FL: 2, FR: 3 };
  for (const [pos, idx] of Object.entries(tyreOrder)) {
    const temp = tel.tyreSurfaceTemp[idx];
    const circle = el(`tc-${pos}`);
    if (circle) {
      circle.className = `tyre-circle ${tyreClass(temp)}`;
      el(`tt-${pos}`).textContent = temp;
    }
    if (dmg) {
      const wear = Math.round(dmg.tyresWear[idx]);
      el(`tw-${pos}`).textContent = `wear: ${wear}%`;
    }
  }
  if (sts) {
    // Fuel
    const fuelPct = clamp((sts.fuelInTank / sts.fuelCapacity) * 100, 0, 100);
    el('d-fuel').textContent = sts.fuelInTank.toFixed(2) + ' kg';
    el('d-fuel-laps').textContent = sts.fuelRemainingLaps.toFixed(1);
    el('d-fuel-bar').style.width = fuelPct + '%';
    // ERS
    const ersPct = clamp((sts.ersStoreEnergy / 4000000) * 100, 0, 100);
    el('d-ers').textContent = (sts.ersStoreEnergy / 1000000).toFixed(2) + ' MJ';
    el('d-ers-pct').textContent = ersPct.toFixed(1) + '%';
    const ersModes = ['None', 'Medium', 'Overtake', 'Hotlap'];
    el('d-ers-mode').textContent = ersModes[sts.ersDeployMode] || 'None';
    el('d-ers-bar').style.width = ersPct + '%';
    // Battery delta vs rivals
    const deltaEl = el('d-battery-delta');
    if (deltaEl) {
      const delta = getBatteryDelta();
      deltaEl.innerHTML = batteryDeltaHTML(delta);
    }
    // Tyre compound
    const cmp = TYRE_COMPOUNDS[sts.visualTyreCompound] || { name: 'Unknown', color: '#888' };
    el('d-tyre-compound').innerHTML = `<span style="color:${cmp.color}">${cmp.name}</span>`;
    el('d-tyre-age').textContent = sts.tyresAgeLaps + ' laps';
  }
  if (lap) {
    el('d-pos').textContent = `P${lap.carPosition}`;
    el('d-cur-lap').textContent = fmt(lap.currentLapTimeMs);
    el('d-last-lap').textContent = fmt(lap.lastLapTimeMs);
    el('d-s1').textContent = fmtSector(lap.sector1TimeMs);
    el('d-s2').textContent = fmtSector(lap.sector2TimeMs);
    el('d-pits').textContent = lap.numPitStops;
    // Race progress
    const ses = state.session;
    if (ses && ses.totalLaps > 0) {
      const pct = clamp((lap.currentLapNum / ses.totalLaps) * 100, 0, 100);
      const progBar = el('d-race-prog');
      if (progBar) progBar.style.width = pct + '%';
      const lapInfo = el('d-race-lap-info');
      if (lapInfo) lapInfo.textContent = `Lap ${lap.currentLapNum}/${ses.totalLaps}`;
      const pctEl = el('d-race-pct');
      if (pctEl) pctEl.textContent = pct.toFixed(0) + '%';
    }
    // Gap analysis
    const gapAheadEl = el('d-gap-ahead');
    if (gapAheadEl) {
      const gapMs = lap.deltaToCarAheadMs;
      if (gapMs > 0) {
        const gapS = (gapMs / 1000).toFixed(2);
        gapAheadEl.textContent = `+${gapS}s`;
        gapAheadEl.className = `stat-value mono ${gapMs < 1200 ? 'gap-close' : ''}`;
      } else {
        gapAheadEl.textContent = 'Leader';
        gapAheadEl.className = 'stat-value mono';
      }
    }
    const gapLeaderEl = el('d-gap-leader');
    if (gapLeaderEl) {
      if (lap.carPosition === 1) gapLeaderEl.textContent = 'P1';
      else if (lap.deltaToLeaderMs > 0) gapLeaderEl.textContent = `+${(lap.deltaToLeaderMs / 1000).toFixed(1)}s`;
      else gapLeaderEl.textContent = '';
    }
    // DRS status
    const drsStatusEl = el('d-drs-status');
    if (drsStatusEl && sts) {
      if (tel.drs) drsStatusEl.innerHTML = '<span style="color:var(--green);font-weight:700">ACTIVE</span>';
      else if (sts.drsAllowed) drsStatusEl.innerHTML = '<span style="color:var(--yellow)">Available</span>';
      else drsStatusEl.textContent = 'Not available';
    }
    // Gap indicator bar (visual proximity meter)
    const gapIndicator = el('d-gap-indicator');
    if (gapIndicator) {
      const gapMs = lap.deltaToCarAheadMs;
      if (gapMs > 0 && gapMs < 3000) {
        const closeness = clamp((1 - gapMs / 3000) * 100, 0, 100);
        const color = gapMs < 1000 ? 'var(--green)' : gapMs < 1500 ? 'var(--yellow)' : 'var(--text3)';
        gapIndicator.innerHTML = `
          <div style="font-size:10px;color:var(--text3);margin-bottom:3px">Proximity to car ahead</div>
          <div class="prog-bar"><div class="prog-fill" style="width:${closeness}%;background:${color}"></div></div>`;
      } else {
        gapIndicator.innerHTML = '';
      }
    }
  }
  //  Weather forecast 
  const ses = state.session;
  if (ses) {
    const wxNames  = ['Clear', 'Light Cloud', 'Overcast', 'Light Rain', 'Heavy Rain', 'Storm'];
    const wxIcons  = ['&#9728;', '&#9925;', '&#9729;', '&#127783;', '&#127783;&#127783;', '&#9889;'];
    const wxCurEl  = el('d-wx-current');
    if (wxCurEl) wxCurEl.innerHTML = `${wxIcons[ses.weather] || ''} ${wxNames[ses.weather] || ''}`;
    const wxTrack = el('d-wx-track');
    if (wxTrack) wxTrack.textContent = ses.trackTemperature + 'C';
    const wxAir = el('d-wx-air');
    if (wxAir) wxAir.textContent = ses.airTemperature + 'C';
    // Forecast timeline
    const fcEl = el('d-wx-forecast');
    if (fcEl && ses.weatherForecast?.length) {
      const samples = ses.weatherForecast.slice(0, 8);
      fcEl.innerHTML = `<div style="display:flex;gap:6px;flex-wrap:wrap">${samples.map(s => {
        const isRain = s.weather >= 3;
        const bg = isRain ? 'rgba(0,120,255,0.15)' : 'rgba(255,255,255,0.04)';
        const border = isRain ? '1px solid rgba(0,120,255,0.3)' : '1px solid var(--border)';
        return `<div style="text-align:center;font-size:10px;padding:4px 6px;border-radius:4px;background:${bg};border:${border};min-width:42px">
          <div style="font-size:14px">${wxIcons[s.weather] || '?'}</div>
          <div style="color:var(--text3)">+${s.timeOffset}m</div>
          <div>${s.trackTemp}C</div>
          ${s.rainPercentage > 0 ? `<div style="color:#4da6ff;font-weight:600">${s.rainPercentage}%</div>` : ''}
        </div>`;
      }).join('')}</div>`;
    }
    // Rain ETA  estimate which lap rain arrives
    const rainEta = el('d-wx-rain-eta');
    if (rainEta && ses.weatherForecast?.length && lap) {
      const firstRain = ses.weatherForecast.find(s => s.weather >= 3);
      if (firstRain && ses.weather < 3) {
        // Estimate laps: timeOffset is in minutes, estimate lap time from session data
        const avgLapSec = ses.trackLength ? (ses.trackLength / 1000) * 3.6 / (tel?.speed > 50 ? tel.speed : 200) * 60 : 90;
        const minsToRain = firstRain.timeOffset;
        const lapsToRain = Math.max(1, Math.round((minsToRain * 60) / avgLapSec));
        rainEta.innerHTML = `<span style="color:#4da6ff;font-weight:600">&#127783; Rain expected in ~${lapsToRain} lap${lapsToRain > 1 ? 's' : ''} (${minsToRain}min)</span>`;
      } else if (ses.weather >= 3) {
        // Currently raining  check when it dries
        const firstDry = ses.weatherForecast.find(s => s.weather < 3);
        if (firstDry) {
          rainEta.innerHTML = `<span style="color:#ffa500">&#9728; Drying expected in ~${firstDry.timeOffset}min</span>`;
        } else {
          rainEta.innerHTML = '<span style="color:#4da6ff">Rain continues for the foreseeable future</span>';
        }
      } else {
        rainEta.textContent = 'No rain forecast';
      }
    }
  }
}
//  Timing Tower 
function buildTiming() {
  el('page-timing').innerHTML = `
    <div style="padding:8px 16px 0;display:flex;justify-content:flex-end">${popoutBtn('timing', 'Timing Tower', 900, 800)}</div>
    <div style="padding:0 0 0; overflow-x:auto; height:calc(100% - 40px)">
      <table class="timing-table">
        <thead>
          <tr>
            <th style="width:36px">P</th>
            <th>Driver</th>
            <th class="right">Gap</th>
            <th class="right">Interval</th>
            <th class="right">Last Lap</th>
            <th class="right">Best Lap</th>
            <th class="right">S1</th>
            <th class="right">S2</th>
            <th class="right">S3</th>
            <th class="center">Tyre</th>
            <th class="center">Age</th>
            <th class="center">Pits</th>
            <th class="center">Status</th>
          </tr>
        </thead>
        <tbody id="timing-body">
          <tr><td colspan="13"><div class="empty-state"><div class="empty-icon"></div><div class="empty-text">Waiting for telemetry</div></div></td></tr>
        </tbody>
      </table>
    </div>
  `;
}
function updateTiming() {
  const lapData = state.lapData;
  const parts = state.participants;
  if (!lapData) return;
  // Build sorted car list by position
  const cars = lapData
    .map((l, i) => ({ ...l, idx: i }))
    .filter(c => c && c.resultStatus >= 2 && c.carPosition > 0)
    .sort((a, b) => a.carPosition - b.carPosition);
  if (cars.length === 0) return;
  const rows = cars.map((car, rank) => {
    const p = parts?.participants?.[car.idx];
    const teamId = p?.teamId ?? -1;
    const color = teamColor(teamId);
    const name = p?.name || `Car ${car.idx + 1}`;
    const isPlayer = car.idx === state.playerCarIndex;
    const isFastest = car.idx === state.fastestLapCar && state.fastestLapMs > 0;
    const sts = state.allCarStatus?.[car.idx];
    const compound = sts?.visualTyreCompound;
    const tyreAge = sts?.tyresAgeLaps ?? '';
    // Gap to leader  use actual deltaToRaceLeaderMs from lap data (already parsed)
    let gapStr = '';
    if (rank === 0) {
      gapStr = 'Leader';
    } else {
      const gapMs = car.deltaToLeaderMs;
      gapStr = gapMs > 0 ? `+${(gapMs / 1000).toFixed(3)}` : '';
    }
    // Interval to car directly ahead  use deltaToCarAheadMs
    let intervalStr = '';
    if (rank > 0) {
      const intMs = car.deltaToCarAheadMs;
      intervalStr = intMs > 0 ? `+${(intMs / 1000).toFixed(3)}` : '';
    }
    // Best lap from session history packet
    const bestMs = state.bestLapTimes[car.idx];
    const bestStr = bestMs > 0 ? fmt(bestMs) : '';
    const bestClass = isFastest ? 'lap-fastest' : '';
    // Pit status
    let pitCell = '';
    if (car.pitStatus === 1)      pitCell = '<span class="pit-badge in-lane">PIT LANE</span>';
    else if (car.pitStatus === 2) pitCell = '<span class="pit-badge in-pit">IN PIT</span>';
    else                          pitCell = `<span class="pit-badge">${car.numPitStops}</span>`;
    // Result / driver status
    let statusCell = '';
    if (car.resultStatus === 3)      statusCell = '<span class="status-badge dnf">DNF</span>';
    else if (car.resultStatus === 4) statusCell = '<span class="status-badge dnf">DSQ</span>';
    else if (car.resultStatus === 5) statusCell = '<span class="status-badge out">NC</span>';
    else if (car.driverStatus === 0) statusCell = '<span class="status-badge out">Garage</span>';
    return `
      <tr class="${isPlayer ? 'player-row' : ''}${isFastest ? ' fastest-row' : ''}">
        <td class="pos-cell">${car.carPosition}</td>
        <td class="driver-cell">
          <span class="team-bar" style="background:${color}"></span>
          <span class="driver-name">${name}</span>
          ${isPlayer ? '<span style="font-size:10px;color:var(--accent);margin-left:4px">YOU</span>' : ''}
        </td>
        <td class="right gap-time">${gapStr}</td>
        <td class="right gap-time">${intervalStr}</td>
        <td class="right lap-time ${car.currentLapInvalid ? 'lap-invalid' : ''}">${fmt(car.lastLapTimeMs)}</td>
        <td class="right lap-time ${bestClass}">${bestStr}</td>
        <td class="right sector-time">${fmtSector(car.sector1TimeMs)}</td>
        <td class="right sector-time">${fmtSector(car.sector2TimeMs)}</td>
        <td class="right sector-time">${fmtSector(car.lastLapTimeMs > 0 && car.sector1TimeMs > 0 && car.sector2TimeMs > 0 ? car.lastLapTimeMs - car.sector1TimeMs - car.sector2TimeMs : 0)}</td>
        <td class="center">${compound ? tyreBadge(compound) : ''}</td>
        <td class="center text-dim">${tyreAge}</td>
        <td class="center">${pitCell}</td>
        <td class="center">${statusCell}</td>
      </tr>`;
  }).join('');
  el('timing-body').innerHTML = rows;
}
//  Track Map 
function buildTrackMap() {
  el('page-trackmap').innerHTML = `
    <div class="trackmap-main">
      <div class="panel" style="padding:8px 12px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
        <span class="section-title" style="margin:0" id="trackmap-title">Track Map</span>
        ${popoutBtn('trackmap', 'Track Map', 1200, 800)}
      </div>
      <div class="trackmap-svg-wrap" id="trackmap-svg-wrap">
        <div class="trackmap-no-data">Waiting for session data</div>
      </div>
    </div>
    <div class="trackmap-sidebar">
      <div class="ers-comparison">
        <div class="ers-comparison-title">Your Battery</div>
        <div class="stat-row"><span class="stat-label">ERS Store</span><span class="stat-value mono" id="tm-ers-mj"></span></div>
        <div class="stat-row"><span class="stat-label">Battery %</span><span class="stat-value mono" id="tm-ers-pct"></span></div>
        <div class="battery-pct-bar" style="margin-top:6px"><div class="battery-pct-fill" id="tm-ers-bar" style="width:0%"></div></div>
        <div id="tm-battery-delta" style="margin-top:8px"></div>
      </div>
      <div class="panel" style="padding:8px 0">
        <div class="panel-header">Cars on Track</div>
        <div id="trackmap-car-list" class="trackmap-car-list" style="max-height:400px;overflow-y:auto"></div>
      </div>
    </div>
  `;
}
function updateTrackMap() {
  const ses = state.session;
  const lapData = state.lapData;
  const parts = state.participants;
  if (!ses || !lapData) return;
  const trackId = ses.trackId;
  const circuit = CIRCUITS[trackId];
  const titleEl = el('trackmap-title');
  if (titleEl) titleEl.textContent = `Track Map  ${ses.trackName || 'Unknown'}`;
  // ERS sidebar
  if (state.status) {
    const ersMJ = (state.status.ersStoreEnergy / 1e6).toFixed(2);
    const ersPct = clamp((state.status.ersStoreEnergy / 4000000) * 100, 0, 100);
    const tmMJ = el('tm-ers-mj');
    if (tmMJ) tmMJ.textContent = ersMJ + ' MJ';
    const tmPct = el('tm-ers-pct');
    if (tmPct) tmPct.textContent = ersPct.toFixed(1) + '%';
    const tmBar = el('tm-ers-bar');
    if (tmBar) tmBar.style.width = ersPct + '%';
    const tmDelta = el('tm-battery-delta');
    if (tmDelta) tmDelta.innerHTML = batteryDeltaHTML(getBatteryDelta());
  }
  const wrap = el('trackmap-svg-wrap');
  if (!wrap) return;
  if (!circuit) {
    wrap.innerHTML = '<div class="trackmap-no-data">No track map available for this circuit</div>';
    updateTrackMapCarList(lapData, parts);
    return;
  }
  // Build active cars list sorted by position
  const cars = lapData
    .map((l, i) => ({ ...l, idx: i }))
    .filter(c => c && c.resultStatus >= 2 && c.carPosition > 0);
  // Create or update SVG
  let svg = wrap.querySelector('svg');
  if (!svg || svg.dataset.trackId !== String(trackId)) {
    wrap.innerHTML = '';
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', circuit.viewBox);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.dataset.trackId = String(trackId);
    // Track outline (thick)
    const trackBg = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    trackBg.setAttribute('d', circuit.path);
    trackBg.setAttribute('class', 'track-path');
    svg.appendChild(trackBg);
    // Track center line (thin)
    const trackLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    trackLine.setAttribute('d', circuit.path);
    trackLine.setAttribute('class', 'track-path-overlay');
    trackLine.id = 'track-path-ref';
    svg.appendChild(trackLine);
    wrap.appendChild(svg);
  }
  // Get reference path for positioning cars
  const pathEl = svg.querySelector('#track-path-ref');
  if (!pathEl) return;
  const totalLen = pathEl.getTotalLength();
  const trackLen = ses.trackLength || 1;
  // Remove old car elements
  svg.querySelectorAll('.car-dot, .car-label').forEach(e => e.remove());
  // Place car dots
  cars.forEach(car => {
    const progress = clamp(car.lapDistance / trackLen, 0, 1);
    const pt = pathEl.getPointAtLength(progress * totalLen);
    const p = parts?.participants?.[car.idx];
    const teamId = p?.teamId ?? -1;
    const color = teamColor(teamId);
    const isPlayer = car.idx === state.playerCarIndex;
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', pt.x);
    dot.setAttribute('cy', pt.y);
    dot.setAttribute('fill', color);
    dot.setAttribute('stroke', '#fff');
    dot.setAttribute('class', `car-dot${isPlayer ? ' player-dot' : ''}`);
    svg.appendChild(dot);
    // Position number label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', pt.x);
    label.setAttribute('y', pt.y);
    label.setAttribute('class', 'car-label');
    label.textContent = car.carPosition;
    svg.appendChild(label);
  });
  updateTrackMapCarList(lapData, parts);
}
function updateTrackMapCarList(lapData, parts) {
  const listEl = el('trackmap-car-list');
  if (!listEl) return;
  const cars = lapData
    .map((l, i) => ({ ...l, idx: i }))
    .filter(c => c && c.resultStatus >= 2 && c.carPosition > 0)
    .sort((a, b) => a.carPosition - b.carPosition);
  if (cars.length === 0) {
    listEl.innerHTML = '<div style="padding:12px;color:var(--text3);font-size:12px">No cars on track</div>';
    return;
  }
  listEl.innerHTML = cars.map(car => {
    const p = parts?.participants?.[car.idx];
    const teamId = p?.teamId ?? -1;
    const color = teamColor(teamId);
    const name = p?.name || `Car ${car.idx + 1}`;
    const isPlayer = car.idx === state.playerCarIndex;
    const sts = state.allCarStatus?.[car.idx];
    const ersMJ = sts ? (sts.ersStoreEnergy / 1e6).toFixed(2) : '';
    let gapStr = '';
    if (car.carPosition === 1) gapStr = 'Leader';
    else {
      const gapMs = car.deltaToLeaderMs;
      gapStr = gapMs > 0 ? `+${(gapMs / 1000).toFixed(1)}s` : '';
    }
    return `<div class="trackmap-car-item ${isPlayer ? 'player' : ''}">
      <span class="trackmap-car-pos">${car.carPosition}</span>
      <span class="trackmap-car-dot-legend" style="background:${color}"></span>
      <span class="trackmap-car-name">${name}${isPlayer ? ' <span style="color:var(--accent);font-size:10px">YOU</span>' : ''}</span>
      <span style="font-size:10px;color:var(--accent2);font-family:Consolas,monospace">${ersMJ} MJ</span>
      <span class="trackmap-car-gap">${gapStr}</span>
    </div>`;
  }).join('');
}
//  Vehicle Status 
function buildVehicle() {
  el('page-vehicle').innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:4px">${popoutBtn('vehicle', 'Vehicle Status', 1200, 860)}</div>
    <div class="tabs">
      <button class="tab-btn active" data-tab="overview">Overview</button>
      <button class="tab-btn" data-tab="setup">Car Setup</button>
    </div>
    <!--  Tab 1: Overview  -->
    <div class="tab-content active" id="tab-overview">
      <div class="vehicle-overview-columns">
        <div class="vehicle-overview-col vehicle-overview-col-motion">
          <div class="panel vehicle-car-panel">
            <div class="panel-header" style="display:flex;justify-content:space-between;align-items:center">
              Car Damage & Tyres
              <span style="display:flex;gap:10px">
                <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text2)"><span style="width:9px;height:9px;background:#1a5c2e;display:inline-block;border-radius:2px"></span>Good</span>
                <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text2)"><span style="width:9px;height:9px;background:#7a5800;display:inline-block;border-radius:2px"></span>Wear</span>
                <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text2)"><span style="width:9px;height:9px;background:#8a2a00;display:inline-block;border-radius:2px"></span>Damage</span>
                <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text2)"><span style="width:9px;height:9px;background:#cc0000;display:inline-block;border-radius:2px"></span>Critical</span>
              </span>
            </div>
            <div class="panel-body" style="padding:8px">
              <div class="veh-car-stage">
                <div class="f1-car-wrap compact">
                  ${f1CarSvg}
                  <div class="zone-pill zone-fw" id="ov-fw">FW -%</div>
                  <div class="zone-pill zone-rw" id="ov-rw">RW -%</div>
                  <div class="zone-pill zone-fl" id="ov-FL">FL -</div>
                  <div class="zone-pill zone-fr" id="ov-FR">FR -</div>
                  <div class="zone-pill zone-rl" id="ov-RL">RL -</div>
                  <div class="zone-pill zone-rr" id="ov-RR">RR -</div>
                </div>
              </div>
            </div>
          </div>
          <div class="panel">
            <div class="panel-header">Motion</div>
            <div class="panel-body">
              <div class="veh-stat"><span class="veh-stat-label">Speed</span><span class="veh-stat-value" id="v-speed">-</span></div>
              <div class="veh-stat"><span class="veh-stat-label">Gear</span><span class="veh-stat-value" id="v-gear">-</span></div>
              <div class="veh-stat"><span class="veh-stat-label">RPM</span><span class="veh-stat-value" id="v-rpm">-</span></div>
              <div class="veh-stat"><span class="veh-stat-label">Engine C</span><span class="veh-stat-value" id="v-etemp">-</span></div>
              <div class="veh-stat"><span class="veh-stat-label">Throttle</span><span class="veh-stat-value" id="v-thr">-</span></div>
              <div class="veh-stat"><span class="veh-stat-label">Brake</span><span class="veh-stat-value" id="v-brk">-</span></div>
              <div class="veh-stat"><span class="veh-stat-label">Steer</span><span class="veh-stat-value" id="v-steer">-</span></div>
              <div class="veh-stat"><span class="veh-stat-label">DRS</span><span class="veh-stat-value" id="v-drs">-</span></div>
            </div>
          </div>
        </div>
        <div class="vehicle-overview-col vehicle-overview-col-mid">
          <div class="vehicle-tyre-stack">
            <div class="panel">
              <div class="panel-header">Tyre Surface C</div>
              <div class="panel-body">
                <div class="tyres-grid" id="v-tyres">
                  ${['FL','FR','RL','RR'].map(pos => `
                    <div class="tyre-cell">
                      <div class="tyre-circle temp-cool" id="vtc-${pos}">
                        <span class="tyre-temp" id="vtt-${pos}">-</span>
                        <span class="tyre-unit">C</span>
                      </div>
                      <div class="tyre-label">${pos}</div>
                    </div>`).join('')}
                </div>
              </div>
            </div>
            <div class="panel">
              <div class="panel-header">Tyre Detail</div>
              <div class="panel-body">
                <div class="tyre-mini-grid">
                  ${['FL','FR','RL','RR'].map(pos => `
                    <div class="tyre-mini-cell">
                      <div class="tyre-mini-ring" id="tmr-${pos}">
                        <span id="tmw-${pos}">-</span>
                      </div>
                      <div class="tyre-mini-label">${pos}</div>
                      <div style="font-size:10px;color:var(--text2)" id="tmi-${pos}">-C inner</div>
                      <div style="font-size:10px;color:var(--text2)" id="tmp-${pos}">- PSI</div>
                      <div style="font-size:10px;color:var(--text3)" id="tmbl-${pos}">blister -%</div>
                    </div>`).join('')}
                </div>
              </div>
            </div>
          </div>
          <div class="panel">
            <div class="panel-header">Fuel</div>
            <div class="panel-body">
              <div class="ers-bar-wrap" style="margin:0 0 10px">
                <div class="ers-bar-label"><span>Fuel Load</span><span id="v-fuel-pct">-%</span></div>
                <div class="ers-bar-track"><div class="prog-fill fuel" id="v-fuel-bar" style="width:0%;height:100%"></div></div>
              </div>
              <div class="veh-stat"><span class="veh-stat-label">In tank</span><span class="veh-stat-value" id="v-fuel">-</span></div>
              <div class="veh-stat"><span class="veh-stat-label">Capacity</span><span class="veh-stat-value" id="v-fuel-cap">-</span></div>
              <div class="veh-stat"><span class="veh-stat-label">Laps left</span><span class="veh-stat-value" id="v-fuel-laps">-</span></div>
            </div>
          </div>
        </div>
        <div class="vehicle-overview-col vehicle-overview-col-power">
          <div class="panel vehicle-panel-ers">
            <div class="panel-header">ERS</div>
            <div class="panel-body">
              <div class="badge-row" id="v-ers-badges"></div>
              <div class="ers-bar-wrap" style="margin:6px 0 10px">
                <div class="ers-bar-label"><span>Battery</span><span id="v-ers-store">-</span></div>
                <div class="ers-bar-track"><div class="ers-bar-fill" id="v-ers-bar" style="width:0%"></div></div>
              </div>
              <div class="veh-stat"><span class="veh-stat-label">Mode</span><span class="veh-stat-value" id="v-ers-mode">-</span></div>
              <div class="veh-stat"><span class="veh-stat-label">Deployed</span><span class="veh-stat-value" id="v-ers-dep">-</span></div>
              <div class="veh-stat"><span class="veh-stat-label">MGU-K Harv</span><span class="veh-stat-value" id="v-ers-hk">-</span></div>
              <div class="veh-stat"><span class="veh-stat-label">MGU-H Harv</span><span class="veh-stat-value" id="v-ers-hh">-</span></div>
              <div class="veh-stat"><span class="veh-stat-label">ICE Power</span><span class="veh-stat-value" id="v-ice-pwr">-</span></div>
              <div class="veh-stat"><span class="veh-stat-label">MGU-K Pwr</span><span class="veh-stat-value" id="v-mguk-pwr">-</span></div>
              <div class="veh-stat"><span class="veh-stat-label">Store %</span><span class="veh-stat-value" id="v-ers-pct">-</span></div>
              <div style="margin-top:8px;border-top:1px solid var(--border);padding-top:6px">
                <div class="section-title" style="margin-bottom:4px">Battery vs Rivals</div>
                <div id="v-battery-delta"></div>
              </div>
            </div>
          </div>
          <div class="panel vehicle-panel-power">
            <div class="panel-header">Power Unit Wear</div>
            <div class="panel-body"><div id="dmg-engine"></div></div>
          </div>
          <div class="panel vehicle-panel-bodywork">
            <div class="panel-header">Bodywork Damage</div>
            <div class="panel-body"><div id="dmg-bodywork"></div></div>
          </div>
        </div>
      </div>
    </div>
    <!-- Tab 2: Setup -->
    <div class="tab-content" id="tab-setup">
      <div class="vehicle-setup-grid">
        <div class="panel">
          <div class="panel-header">Driver Aids</div>
          <div class="panel-body">
            <div class="veh-stat"><span class="veh-stat-label">Fuel Mix</span><span class="veh-stat-value" id="v-fuel-mix"></span></div>
            <div class="veh-stat"><span class="veh-stat-label">Front Brake Bias</span><span class="veh-stat-value" id="v-brake-bias"></span></div>
            <div class="veh-stat"><span class="veh-stat-label">Traction Control</span><span class="veh-stat-value" id="v-tc"></span></div>
            <div class="veh-stat"><span class="veh-stat-label">ABS</span><span class="veh-stat-value" id="v-abs"></span></div>
            <div class="veh-stat"><span class="veh-stat-label">Pit Limiter</span><span class="veh-stat-value" id="v-pit-limiter"></span></div>
            <div class="veh-stat"><span class="veh-stat-label">ERS Deploy Mode</span><span class="veh-stat-value" id="v-setup-ers-mode"></span></div>
            <div class="veh-stat"><span class="veh-stat-label">DRS Allowed</span><span class="veh-stat-value" id="v-setup-drs"></span></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-header">Tyre Compound</div>
          <div class="panel-body">
            <div class="veh-stat"><span class="veh-stat-label">Visual</span><span class="veh-stat-value" id="v-setup-tyre-visual"></span></div>
            <div class="veh-stat"><span class="veh-stat-label">Actual</span><span class="veh-stat-value" id="v-setup-tyre-actual"></span></div>
            <div class="veh-stat"><span class="veh-stat-label">Tyre Age (laps)</span><span class="veh-stat-value" id="v-setup-tyre-age"></span></div>
            <div class="veh-stat"><span class="veh-stat-label">Fitted Tyre Age</span><span class="veh-stat-value" id="v-setup-fitted-age"></span></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-header">Tyre Pressures & Inner Temps</div>
          <div class="panel-body">
            <div class="section-title" style="margin-bottom:6px">Surface Pressure</div>
            ${['FL','FR','RL','RR'].map(pos => `
              <div class="veh-stat"><span class="veh-stat-label">${pos}</span><span class="veh-stat-value" id="vtp-${pos}"></span></div>`).join('')}
            <div style="margin-top:10px">
              <div class="section-title" style="margin-bottom:6px">Inner Temperature</div>
              ${['FL','FR','RL','RR'].map(pos => `
                <div class="veh-stat"><span class="veh-stat-label">${pos}</span><span class="veh-stat-value" id="vti-${pos}"></span></div>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  // Tab switching
  el('page-vehicle').querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      el('page-vehicle').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      el('page-vehicle').querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      el(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}
function dmgColor(pct) {
  if (pct < 10)  return '#1a5c2e';  // green  good
  if (pct < 30)  return '#7a5800';  // amber  light wear
  if (pct < 60)  return '#8a2a00';  // orange  damage
  return '#cc0000';                  // red  critical
}
function damageBar(label, pct) {
  const cls = dmgClass(pct);
  return `
    <div class="damage-item" style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;margin-bottom:3px">
        <span class="damage-item-label">${label}</span>
        <span class="damage-pct">${Math.round(pct)}%</span>
      </div>
      <div class="damage-item-bar"><div class="damage-fill ${cls}" style="width:${clamp(pct,0,100)}%"></div></div>
    </div>`;
}
function updateVehicle() {
  const tel = state.telemetry;
  const sts = state.status;
  const dmg = state.damage;
  if (!tel) return;
  //  Motion 
  el('v-speed').textContent  = tel.speed + ' km/h';
  el('v-gear').textContent   = tel.gear <= 0 ? (tel.gear === 0 ? 'N' : 'R') : tel.gear;
  el('v-rpm').textContent    = tel.engineRPM.toLocaleString() + ' RPM';
  el('v-etemp').textContent  = tel.engineTemp + ' C';
  el('v-thr').textContent    = (tel.throttle * 100).toFixed(1) + '%';
  el('v-brk').textContent    = (tel.brake * 100).toFixed(1) + '%';
  el('v-steer').textContent  = (tel.steer * 100).toFixed(1) + '%';
  el('v-drs').innerHTML = tel.drs
    ? '<span class="badge active">ON</span>'
    : '<span class="badge inactive">OFF</span>';
  //  Tyre surface temp circles 
  const tyreOrder = { RL: 0, RR: 1, FL: 2, FR: 3 };
  for (const [pos, idx] of Object.entries(tyreOrder)) {
    const surf = tel.tyreSurfaceTemp[idx];
    const circle = el(`vtc-${pos}`);
    if (circle) { circle.className = `tyre-circle ${tyreClass(surf)}`; el(`vtt-${pos}`).textContent = surf; }
  }
  //  ERS 
  if (sts) {
    const ersPct    = clamp((sts.ersStoreEnergy / 4000000) * 100, 0, 100);
    const ersModes  = ['None', 'Medium', 'Overtake', 'Hotlap'];
    el('v-ers-store').textContent  = (sts.ersStoreEnergy / 1000000).toFixed(2) + ' MJ';
    el('v-ers-bar').style.width    = ersPct + '%';
    if (ersPct > 90) el('v-ers-bar').classList.add('full'); else el('v-ers-bar').classList.remove('full');
    el('v-ers-mode').textContent   = ersModes[sts.ersDeployMode] || 'None';
    el('v-ers-dep').textContent    = (sts.ersDeployedThisLap / 1000000).toFixed(2) + ' MJ';
    el('v-ers-hk').textContent     = (sts.ersHarvestedMGUK / 1000000).toFixed(2) + ' MJ';
    el('v-ers-hh').textContent     = (sts.ersHarvestedMGUH / 1000000).toFixed(2) + ' MJ';
    el('v-ice-pwr').textContent    = (sts.enginePowerICE / 1000).toFixed(0) + ' kW';
    el('v-mguk-pwr').textContent   = (sts.enginePowerMGUK / 1000).toFixed(0) + ' kW';
    el('v-ers-pct').textContent    = ersPct.toFixed(1) + '%';
    const ersBadges = el('v-ers-badges');
    if (ersBadges) ersBadges.innerHTML = `
      <span class="badge ${sts.drsAllowed ? 'active' : 'inactive'}">DRS ${sts.drsAllowed ? 'ON' : 'OFF'}</span>
      <span class="badge ${sts.pitLimiterStatus ? 'warning' : 'inactive'}">PIT LIM ${sts.pitLimiterStatus ? 'ON' : 'OFF'}</span>
      <span class="badge info">${ersModes[sts.ersDeployMode] || 'ERS'}</span>`;
    const vBattDelta = el('v-battery-delta');
    if (vBattDelta) {
      const delta = getBatteryDelta();
      vBattDelta.innerHTML = batteryDeltaHTML(delta) || '<span class="text-dim" style="font-size:11px">No rival data</span>';
    }
    //  Fuel 
    const fuelPct = clamp((sts.fuelInTank / sts.fuelCapacity) * 100, 0, 100);
    el('v-fuel-pct').textContent  = fuelPct.toFixed(1) + '%';
    el('v-fuel-bar').style.width  = fuelPct + '%';
    el('v-fuel').textContent      = sts.fuelInTank.toFixed(2) + ' kg';
    el('v-fuel-cap').textContent  = sts.fuelCapacity.toFixed(1) + ' kg';
    el('v-fuel-laps').textContent = sts.fuelRemainingLaps.toFixed(2);
    //  Setup tab 
    const fuelMixes = ['Lean', 'Standard', 'Rich', 'Max'];
    el('v-fuel-mix').textContent        = fuelMixes[sts.fuelMix] || '';
    el('v-brake-bias').textContent      = sts.frontBrakeBias + '%';
    el('v-tc').textContent              = ['Off', 'Medium', 'Full'][sts.tractionControl] || '';
    el('v-abs').textContent             = sts.antiLockBrakes ? 'On' : 'Off';
    el('v-pit-limiter').textContent     = sts.pitLimiterStatus ? 'Active' : 'Off';
    const setupErs = el('v-setup-ers-mode');
    if (setupErs) setupErs.textContent  = ersModes[sts.ersDeployMode] || 'None';
    const setupDrs = el('v-setup-drs');
    if (setupDrs) setupDrs.innerHTML    = sts.drsAllowed
      ? '<span class="badge active">Allowed</span>'
      : '<span class="badge inactive">Not allowed</span>';
    const visual = el('v-setup-tyre-visual');
    if (visual) visual.innerHTML = tyreBadge(sts.visualTyreCompound);
    const actual = el('v-setup-tyre-actual');
    if (actual) actual.innerHTML = tyreBadge(sts.actualTyreCompound);
    const tyreAge = el('v-setup-tyre-age');
    if (tyreAge) tyreAge.textContent = sts.tyresAgeLaps != null ? sts.tyresAgeLaps + ' laps' : '';
    const fittedAge = el('v-setup-fitted-age');
    if (fittedAge) fittedAge.textContent = sts.tyresFitted != null ? (sts.tyresFitted ? 'Fitted' : 'Not fitted') : '';
  }
  //  Tyre mini detail cards (col 3) 
  const posKeys = ['RL','RR','FL','FR'];
  const tyreIdxMap = { RL:0, RR:1, FL:2, FR:3 };
  for (const pos of posKeys) {
    const idx  = tyreIdxMap[pos];
    const wear = dmg ? Math.round(dmg.tyresWear[idx]) : null;
    const inner= tel.tyreInnerTemp[idx];
    const psi  = tel.tyrePressure[idx].toFixed(1);
    const ring = el(`tmr-${pos}`);
    if (ring) {
      const col = dmg ? dmgColor(wear) : '#555';
      ring.style.borderColor = col;
      el(`tmw-${pos}`).textContent = dmg ? wear + '%' : '';
    }
    const iEl = el(`tmi-${pos}`); if (iEl) iEl.textContent = inner + 'C inner';
    const pEl = el(`tmp-${pos}`); if (pEl) pEl.textContent = psi + ' PSI';
    const blisterEl = el(`tmbl-${pos}`);
    if (blisterEl && dmg?.tyreBlisters) {
      const bl = dmg.tyreBlisters[idx];
      const blCls = bl > 60 ? 'color:#dc0000' : bl > 30 ? 'color:#ff8700' : bl > 10 ? 'color:#ffd700' : '';
      blisterEl.innerHTML = `<span style="${blCls}">blister ${bl}%</span>`;
    }
    // Also update inner/pressure in setup tab
    const viEl = el(`vti-${pos}`); if (viEl) viEl.textContent = inner + ' C';
    const vpEl = el(`vtp-${pos}`); if (vpEl) vpEl.textContent = psi + ' PSI';
    const surf = tel.tyreSurfaceTemp[idx];
    const ovTyre = el(`ov-${pos}`);
    if (ovTyre) ovTyre.textContent = wear != null ? `${pos} ${wear}%  ${surf}C` : `${pos} `;
  }
  if (dmg) {
    //  Bodywork damage bars 
    const bodyEl = el('dmg-bodywork');
    if (bodyEl) bodyEl.innerHTML =
      damageBar('FW Left',    dmg.frontLeftWingDamage)  +
      damageBar('FW Right',   dmg.frontRightWingDamage) +
      damageBar('Rear Wing',  dmg.rearWingDamage)       +
      damageBar('Floor',      dmg.floorDamage)          +
      damageBar('Diffuser',   dmg.diffuserDamage)       +
      damageBar('Sidepod',    dmg.sidepodDamage)        +
      damageBar('Gearbox',    dmg.gearBoxDamage)        +
      (dmg.drsFault  ? '<div class="fault-badge"> DRS FAULT</div>'  : '') +
      (dmg.ersFault  ? '<div class="fault-badge"> ERS FAULT</div>'  : '') +
      (dmg.engineBlown  ? '<div class="fault-badge crit"> ENGINE BLOWN</div>'  : '') +
      (dmg.engineSeized ? '<div class="fault-badge crit"> ENGINE SEIZED</div>' : '');
    //  PU wear bars 
    const engEl = el('dmg-engine');
    if (engEl) engEl.innerHTML =
      damageBar('ICE',   dmg.engineICEWear)  +
      damageBar('MGU-H', dmg.engineMGUHWear) +
      damageBar('MGU-K', dmg.engineMGUKWear) +
      damageBar('ES',    dmg.engineESWear)   +
      damageBar('CE',    dmg.engineCEWear)   +
      damageBar('TC',    dmg.engineTCWear)   +
      damageBar('Engine', dmg.engineDamage);
    //  SVG zone colors 
    const zoneMap = {
      'fw-l':    dmg.frontLeftWingDamage,
      'fw-r':    dmg.frontRightWingDamage,
      'rw':      dmg.rearWingDamage,
      'floor':   dmg.floorDamage,
      'diffuser':dmg.diffuserDamage,
      'sp-l':    dmg.sidepodDamage,
      'sp-r':    dmg.sidepodDamage,
      'tyre-fl': dmg.tyresWear[2],
      'tyre-fr': dmg.tyresWear[3],
      'tyre-rl': dmg.tyresWear[0],
      'tyre-rr': dmg.tyresWear[1],
    };
    for (const [id, pct] of Object.entries(zoneMap)) {
      const zEl = el(`zone-${id}`);
      if (zEl) zEl.setAttribute('fill', dmgColor(pct));
    }
    const fwEl = el('ov-fw');
    if (fwEl) {
      const fwPct = Math.round((dmg.frontLeftWingDamage + dmg.frontRightWingDamage) / 2);
      fwEl.textContent = `FW ${fwPct}%`;
    }
    const rwEl = el('ov-rw');
    if (rwEl) rwEl.textContent = `RW ${Math.round(dmg.rearWingDamage)}%`;
  } else {
    const fwEl = el('ov-fw');
    if (fwEl) fwEl.textContent = 'FW %';
    const rwEl = el('ov-rw');
    if (rwEl) rwEl.textContent = 'RW %';
  }
}
//  Session page 
function buildSession() {
  el('page-session').innerHTML = `
    <div class="session-hero">
      <div class="session-track" id="s-track"></div>
      <div class="session-type" id="s-type"></div>
      <div class="session-time" id="s-timeleft">:</div>
      <div class="session-laps" id="s-laps"></div>
    </div>
    <div class="grid-2" style="gap:16px">
      <div class="panel">
        <div class="panel-header">Conditions</div>
        <div class="panel-body">
          <div class="stat-row"><span class="stat-label">Weather</span><span class="stat-value" id="s-weather"></span></div>
          <div class="stat-row"><span class="stat-label">Track Temp</span><span class="stat-value mono" id="s-ttemp"></span></div>
          <div class="stat-row"><span class="stat-label">Air Temp</span><span class="stat-value mono" id="s-atemp"></span></div>
          <div class="stat-row"><span class="stat-label">Pit speed limit</span><span class="stat-value mono" id="s-pit-limit"></span></div>
          <div class="stat-row"><span class="stat-label">Safety car</span><span class="stat-value" id="s-sc"></span></div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header">Session Info</div>
        <div class="panel-body">
          <div class="stat-row"><span class="stat-label">Track length</span><span class="stat-value mono" id="s-length"></span></div>
          <div class="stat-row"><span class="stat-label">Total laps</span><span class="stat-value" id="s-total-laps"></span></div>
          <div class="stat-row"><span class="stat-label">Duration</span><span class="stat-value mono" id="s-duration"></span></div>
          <div class="stat-row"><span class="stat-label">Formula</span><span class="stat-value" id="s-formula"></span></div>
        </div>
      </div>
    </div>
  `;
}
function updateSession() {
  const ses = state.session;
  if (!ses) return;
  el('s-track').textContent = ses.trackName || '';
  el('s-type').textContent = ses.sessionTypeName || '';
  el('s-timeleft').textContent = fmtCountdown(ses.sessionTimeLeft);
  el('s-laps').textContent = `Total Laps: ${ses.totalLaps}`;
  el('s-weather').innerHTML = `${weatherIcon(ses.weather)} ${ses.weatherName}`;
  el('s-ttemp').textContent = ses.trackTemperature + ' C';
  el('s-atemp').textContent = ses.airTemperature + ' C';
  el('s-pit-limit').textContent = ses.pitSpeedLimit + ' km/h';
  el('s-sc').textContent = safetyCarLabel(ses.safetyCarStatus) || 'None';
  el('s-length').textContent = (ses.trackLength / 1000).toFixed(3) + ' km';
  el('s-total-laps').textContent = ses.totalLaps;
  el('s-duration').textContent = fmtCountdown(ses.sessionDuration);
  const formulas = ['F1', 'F2', 'F3', 'F1 Classic', 'F2 2021', 'F1 (New)'];
  el('s-formula').textContent = formulas[ses.formula] || 'F1';
}
//  AI Engineer 
// Build a concise telemetry snapshot for the API context
function buildRaceContext(includeRivals = true) {
  const tel = state.telemetry;
  const sts = state.status;
  const dmg = state.damage;
  const lap = state.lapData?.[state.playerCarIndex];
  const ses = state.session;
  const ersModes = ['None', 'Medium', 'Overtake', 'Hotlap'];
  const ctx = {};
  if (ses) {
    ctx.track = ses.trackName;
    ctx.session = ses.sessionTypeName;
    ctx.weather = ses.weatherName;
    ctx.totalLaps = ses.totalLaps;
    ctx.timeLeftSec = ses.sessionTimeLeft;
  }
  if (lap) {
    ctx.myPosition = lap.carPosition;
    ctx.currentLap = lap.currentLapNum;
    ctx.lastLapMs = lap.lastLapTimeMs;
    ctx.currentLapMs = lap.currentLapTimeMs;
    ctx.pitStops = lap.numPitStops;
    ctx.gapToCarAheadMs = lap.deltaToCarAheadMs;
    ctx.gapToLeaderMs = lap.deltaToLeaderMs;
    ctx.lapInvalid = !!lap.currentLapInvalid;
    ctx.sector = lap.sector;
  }
  if (tel) {
    ctx.speedKph = tel.speed;
    ctx.gear = tel.gear;
    ctx.throttlePct = Math.round(tel.throttle * 100);
    ctx.brakePct = Math.round(tel.brake * 100);
    ctx.engineRPM = tel.engineRPM;
    ctx.drsActive = !!tel.drs;
    ctx.tyreSurfaceTemp = { RL: tel.tyreSurfaceTemp[0], RR: tel.tyreSurfaceTemp[1], FL: tel.tyreSurfaceTemp[2], FR: tel.tyreSurfaceTemp[3] };
    ctx.tyreInnerTemp = { RL: tel.tyreInnerTemp[0], RR: tel.tyreInnerTemp[1], FL: tel.tyreInnerTemp[2], FR: tel.tyreInnerTemp[3] };
    ctx.engineTempC = tel.engineTemp;
  }
  if (sts) {
    const cmp = TYRE_COMPOUNDS[sts.visualTyreCompound];
    ctx.tyreCompound = cmp?.name || 'Unknown';
    ctx.tyreAgeLaps = sts.tyresAgeLaps;
    ctx.fuelKg = +sts.fuelInTank.toFixed(2);
    ctx.fuelLapsLeft = +sts.fuelRemainingLaps.toFixed(1);
    ctx.ersStoreMJ = +(sts.ersStoreEnergy / 1e6).toFixed(2);
    ctx.ersMode = ersModes[sts.ersDeployMode] || 'None';
    ctx.ersBatteryPct = +((sts.ersStoreEnergy / 4000000) * 100).toFixed(1);
    ctx.drsAllowed = !!sts.drsAllowed;
    ctx.pitLimiter = !!sts.pitLimiterStatus;
  }
  // Battery advantage/disadvantage for AI analysis
  const battDelta = getBatteryDelta();
  if (battDelta) {
    ctx.batteryPct = battDelta.myPct;
    if (battDelta.ahead) {
      ctx.batteryVsAhead = {
        name: battDelta.ahead.name,
        deltaMJ: battDelta.ahead.deltaMJ,
        deltaPct: battDelta.ahead.deltaPct,
        advantage: battDelta.ahead.deltaMJ > 0,
      };
    }
    if (battDelta.behind) {
      ctx.batteryVsBehind = {
        name: battDelta.behind.name,
        deltaMJ: battDelta.behind.deltaMJ,
        deltaPct: battDelta.behind.deltaPct,
        advantage: battDelta.behind.deltaMJ > 0,
      };
    }
  }
  if (dmg) {
    ctx.tyreWearPct = { RL: Math.round(dmg.tyresWear[0]), RR: Math.round(dmg.tyresWear[1]), FL: Math.round(dmg.tyresWear[2]), FR: Math.round(dmg.tyresWear[3]) };
    ctx.frontWingDmg = { L: dmg.frontLeftWingDamage, R: dmg.frontRightWingDamage };
    ctx.rearWingDmg = dmg.rearWingDamage;
    ctx.floorDmg = dmg.floorDamage;
    ctx.engineWearPct = { ICE: dmg.engineICEWear, MGUH: dmg.engineMGUHWear, MGUK: dmg.engineMGUKWear, ES: dmg.engineESWear, TC: dmg.engineTCWear };
  }
  // Rivals  car directly ahead and directly behind
  if (includeRivals && state.lapData && lap) {
    const myPos = lap.carPosition;
    const carAheadLap = state.lapData.find(l => l?.carPosition === myPos - 1);
    const carBehindLap = state.lapData.find(l => l?.carPosition === myPos + 1);
    const carAheadIdx = carAheadLap ? state.lapData.indexOf(carAheadLap) : -1;
    const carBehindIdx = carBehindLap ? state.lapData.indexOf(carBehindLap) : -1;
    function rivalInfo(lapEntry, idx) {
      if (!lapEntry || idx < 0) return null;
      const rSts = state.allCarStatus?.[idx];
      const rPart = state.participants?.participants?.[idx];
      const rCmp = rSts ? (TYRE_COMPOUNDS[rSts.visualTyreCompound]?.name || 'Unknown') : null;
      return {
        name: rPart?.name || `Car ${idx + 1}`,
        position: lapEntry.carPosition,
        gapToThemMs: lapEntry.deltaToCarAheadMs,   // their gap to the car in front of them
        lastLapMs: lapEntry.lastLapTimeMs,
        tyreCompound: rCmp,
        tyreAgeLaps: rSts?.tyresAgeLaps ?? null,
        ersStoreMJ: rSts ? +(rSts.ersStoreEnergy / 1e6).toFixed(2) : null,
        ersMode: rSts ? (ersModes[rSts.ersDeployMode] || 'None') : null,
        pitStops: lapEntry.numPitStops,
        pitStatus: lapEntry.pitStatus,
      };
    }
    const ahead = rivalInfo(carAheadLap, carAheadIdx);
    const behind = rivalInfo(carBehindLap, carBehindIdx);
    if (ahead)  ctx.carAhead  = ahead;
    if (behind) ctx.carBehind = behind;
  }
  return ctx;
}
//  Auto-radio helpers 
function canTrigger(category) {
  const now = Date.now();
  const cooldown = radio.cooldowns[category] || 30000;
  const last = radio.lastTrigger[category] || 0;
  return (now - last) >= cooldown;
}
function markTriggered(category) {
  radio.lastTrigger[category] = Date.now();
}
function isFiveLapTyreCheckpoint(lapNum) {
  return Number.isFinite(lapNum) && lapNum > 0 && lapNum % 5 === 0;
}
function formatBattleBatteryInfo(rivalName, relativePos, deltaPct) {
  const sign = deltaPct >= 0 ? '+' : '-';
  const trend = deltaPct >= 0 ? 'advantage' : 'disadvantage';
  return `Battery vs ${rivalName} ${relativePos}: ${sign}${Math.abs(deltaPct).toFixed(0)}% ${trend}.`;
}
function shouldEmitBattleBattery(side, rivalIdx, deltaPct) {
  if (Math.abs(deltaPct) < 8) return false;
  const deltaKey = side === 'ahead' ? 'lastBattleBatteryDeltaAhead' : 'lastBattleBatteryDeltaBehind';
  const rivalKey = side === 'ahead' ? 'lastBattleBatteryRivalAhead' : 'lastBattleBatteryRivalBehind';
  const lastDelta = radio.prev[deltaKey];
  const lastRival = radio.prev[rivalKey];
  if (lastRival !== rivalIdx || lastDelta == null) return true;
  return Math.abs(Math.abs(deltaPct) - Math.abs(lastDelta)) >= 5;
}
function markBattleBattery(side, rivalIdx, deltaPct) {
  if (side === 'ahead') {
    radio.prev.lastBattleBatteryRivalAhead = rivalIdx;
    radio.prev.lastBattleBatteryDeltaAhead = deltaPct;
  } else {
    radio.prev.lastBattleBatteryRivalBehind = rivalIdx;
    radio.prev.lastBattleBatteryDeltaBehind = deltaPct;
  }
}
function toInfoOnlyRadioText(text) {
  const raw = (text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const adviceRe = /\b(consider|focus|stay|keep|watch|manage|push|attack|defend|harvest|deploy|protect|cover|prepare|use|save|brake|lift|commit|hold|give|let|return|try|box(?:\s+now|\s+this lap|\s+immediately)?|should|must|need to|do not|don't)\b/i;
  const leadingAdviceRe = /^(consider|focus|stay|keep|watch|manage|push|attack|defend|harvest|deploy|protect|cover|prepare|use|save|brake|lift|commit|hold|give|let|return|try|box|do not|don't|be)\b/i;
  const parts = raw.match(/[^.!?]+[.!?]?/g) || [raw];
  const cleaned = [];
  for (const part of parts) {
    let sentence = part.trim();
    if (!sentence) continue;
    if (/\bdrs\b/i.test(sentence)) continue;
    if (leadingAdviceRe.test(sentence)) continue;
    // Keep factual lead when sentence transitions into advice after dash.
    const dashSplit = sentence.split(/\s[-]\s/);
    if (dashSplit.length > 1 && dashSplit[0].trim()) {
      sentence = dashSplit[0].trim();
    }
    const m = sentence.match(adviceRe);
    if (m && m.index != null) {
      const factualPrefix = sentence.slice(0, m.index).replace(/[,:;-\s]+$/, '').trim();
      if (!factualPrefix) continue;
      sentence = factualPrefix;
    }
    sentence = sentence.replace(/\b(if possible|when possible|if you can)\b/ig, '').replace(/\s{2,}/g, ' ').trim();
    sentence = sentence.replace(/[.!?]+$/, '').trim();
    if (sentence) cleaned.push(sentence);
  }
  const joined = cleaned.join('. ').trim();
  if (joined) return joined.endsWith('.') ? joined : joined + '.';
  if (/\bdrs\b/i.test(raw)) return '';
  const fallback = (raw.split(/[.!?]/)[0] || raw).trim();
  return fallback ? (fallback.endsWith('.') ? fallback : fallback + '.') : '';
}
function appendRadioCard(category, urgency, text, isError) {
  const feedEl = el('radio-feed');
  if (!feedEl) return;
  const renderedText = isError ? text : toInfoOnlyRadioText(text);
  if (!isError && !renderedText) return;
  const now = Date.now();
  const normalizedText = (renderedText || '').trim().toLowerCase();
  if (!isError && normalizedText && radio.prev.lastRadioText === normalizedText && (now - radio.prev.lastRadioTextAt) < 90000) {
    return;
  }
  if (!isError && normalizedText) {
    radio.prev.lastRadioText = normalizedText;
    radio.prev.lastRadioTextAt = now;
  }
  // Remove "no messages" placeholder
  const empty = feedEl.querySelector('.radio-feed-empty');
  if (empty) empty.remove();
  const time = new Date(now).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const card = document.createElement('div');
  card.className = `radio-card ${isError ? 'radio-error' : ''} urgency-${urgency}`;
  card.innerHTML = `
    <div class="radio-card-header">
      <span class="radio-tag tag-${category}">${category.toUpperCase().replace('_', ' ')}</span>
      <span class="radio-urgency urgency-${urgency}">${urgency.toUpperCase()}</span>
      <span class="radio-time">${time}</span>
    </div>
    <div class="radio-text">${renderedText}</div>
  `;
  // In GPT mode: skip edge-tts for categories that use AI voice (GPT Realtime handles audio)
  const catKey = getCategoryForRadio(category);
  const isAiCategory = gptRealtime.aiMode === 'gpt' && catKey && radio.config[catKey]?.aiEnabled;
  if (!isError && !isAiCategory) ttsSpeak(renderedText);
  feedEl.prepend(card);
  // Keep max 30 messages
  while (feedEl.children.length > 30) feedEl.removeChild(feedEl.lastChild);
}
// Emit a local (no API) radio message  checks category config
function emitLocalRadio(category, urgency, text) {
  // Check if category is enabled in config
  const catKey = getCategoryForRadio(category);
  if (catKey && radio.config[catKey] && !radio.config[catKey].enabled) return;
  if (!canTrigger(category)) return;
  markTriggered(category);
  appendRadioCard(category, urgency, text, false);
}
// Map radio categories to config keys
function getCategoryForRadio(cat) {
  const map = {
    start:    'start',
    overtake: 'overtake',
    defend:   'defend',
    tyres:    'tyres',
    ers:      'ers',
    pit:      'pit',
    weather:  'weather',
    incident: 'incident',
    flags:    'flags',
    restart:  'restart',
    penalty:  'penalty',
    racecraft:'racecraft',
    normal:   'normal',
    endrace:  'endrace',
    // internal scenario names  config keys
    attack:  'overtake',
    defense: 'defend',
    mixed:   'overtake',
    // legacy aliases
    tyre_wear: 'tyres',
    tyre_crit: 'tyres',
    damage:    'incident',
    flag:      'flags',
    fuel:      'normal',
    position:  'normal',
    battle:    'racecraft',
  };
  return map[cat] || null;
}
//  Helper: get rival info for battle context 
function getRivalBattleInfo(rivalIdx) {
  if (rivalIdx < 0) return null;
  const rSts = state.allCarStatus?.[rivalIdx];
  const rDmg = state.damage; // we only have our own damage from main  but allCarStatus has ERS
  const rPart = state.participants?.participants?.[rivalIdx];
  const rLap = state.lapData?.[rivalIdx];
  if (!rSts || !rLap) return null;
  const ersPct = (rSts.ersStoreEnergy / 4000000) * 100;
  const cmp = TYRE_COMPOUNDS[rSts.visualTyreCompound];
  return {
    name: rPart?.name || `Car ${rivalIdx + 1}`,
    position: rLap.carPosition,
    ersPct,
    ersMJ: +(rSts.ersStoreEnergy / 1e6).toFixed(2),
    tyreCompound: cmp?.name || 'Unknown',
    tyreAge: rSts.tyresAgeLaps,
    drsAllowed: !!rSts.drsAllowed,
    ersMode: rSts.ersDeployMode,
    pitStops: rLap.numPitStops,
    lastLapMs: rLap.lastLapTimeMs,
  };
}
//  Situation detection: ALL categories (no API calls) 
function detectRaceStart() {
  if (!radio.config.start?.enabled) return;
  const lap = state.lapData?.[state.playerCarIndex];
  const ses = state.session;
  if (!lap || !ses) return;
  const isRace = ses.sessionType >= 10 && ses.sessionType <= 12;
  if (!isRace) return;
  // Lap 1 start trigger
  if (lap.currentLapNum === 1 && radio.prev.lap === 0) {
    const pos = lap.carPosition;
    const grid = lap.gridPosition || pos;
    radio.prev.gridPosition = grid;
    if (pos < grid) {
      const gained = grid - pos;
      emitLocalRadio('start', 'high',
        RADIO_MESSAGES.start_gained_places({ position: pos, grid, placesGained: gained }).text);
    } else if (pos > grid) {
      const lost = pos - grid;
      emitLocalRadio('start', 'high',
        RADIO_MESSAGES.start_lost_places({ position: pos, grid: grid, placesLost: lost }).text);
    } else {
      emitLocalRadio('start', 'high',
        `Lights out! P${grid}. Held position. Stay clean, manage the tyres.`);
    }
    // Cold tyres warning on lap 1
    const tel = state.telemetry;
    if (tel) {
      const avgTemp = Math.round((tel.tyreSurfaceTemp[0] + tel.tyreSurfaceTemp[1] + tel.tyreSurfaceTemp[2] + tel.tyreSurfaceTemp[3]) / 4);
      if (avgTemp < 70) {
        setTimeout(() => {
          emitLocalRadio('start', 'medium',
            RADIO_MESSAGES.start_cold_tyres({ avgTemp }).text);
        }, 8000);
      }
    }
  }
  // Detect position changes during lap 1 (T1 chaos)
  if (lap.currentLapNum === 1 && radio.prev.lap === 1 && lap.sector >= 1) {
    const grid = radio.prev.gridPosition || lap.carPosition;
    const pos = lap.carPosition;
    if (pos < grid - 2 && canTrigger('start')) {
      emitLocalRadio('start', 'high',
        `Brilliant start! Through to P${pos} from P${grid}. ${grid - pos} places gained into Turn 1!`);
    }
  }
  radio.prev.lap = lap.currentLapNum;
}
function detectPositionChange() {
  if (!radio.config.normal?.enabled && !radio.config.overtake?.enabled) return;
  const lap = state.lapData?.[state.playerCarIndex];
  if (!lap) return;
  const pos = lap.carPosition;
  const prevPos = radio.prev.position;
  if (prevPos > 0 && pos !== prevPos) {
    if (pos < prevPos) {
      const gained = prevPos - pos;
      emitLocalRadio('overtake', 'medium',
        `Good move! P${pos} now. Gained ${gained} position${gained > 1 ? 's' : ''}. Keep pushing.`);
    } else {
      const lost = pos - prevPos;
      emitLocalRadio('normal', 'high',
        `Lost ${lost} position${lost > 1 ? 's' : ''}. P${pos} now. Stay focused.`);
    }
  }
  radio.prev.position = pos;
}
function detectTyreWear() {
  if (!radio.config.tyres?.enabled) return;
  const dmg = state.damage;
  if (!dmg) return;
  const lap = state.lapData?.[state.playerCarIndex];
  const currentLapNum = lap?.currentLapNum || 0;
  const maxWear = Math.max(...dmg.tyresWear.map(w => Math.round(w)));
  const posLabel = ['RL', 'RR', 'FL', 'FR'];
  const worstIdx = dmg.tyresWear.indexOf(Math.max(...dmg.tyresWear));
  const worstTyre = posLabel[worstIdx];
  // Tiered warnings: 30%, 50%, 70%, 85%, 95%
  const thresholds = [
    { pct: 95, urgency: 'critical', msg: `CRITICAL tyre wear! ${worstTyre} at ${maxWear}%. Box box box!` },
    { pct: 85, urgency: 'high',     msg: `Tyre wear dangerous. ${worstTyre} at ${maxWear}%. Tyre cliff imminent.` },
    { pct: 70, urgency: 'high',     msg: `High tyre wear. ${worstTyre} at ${maxWear}%. Start thinking about the stop.` },
    { pct: 50, urgency: 'medium',   msg: `Tyre wear update: ${worstTyre} at ${maxWear}%. Managing the rubber.` },
    { pct: 30, urgency: 'low',      msg: `Tyre check: ${worstTyre} at ${maxWear}%. Still in the operating window.` },
  ];
  for (const t of thresholds) {
    if (maxWear >= t.pct && radio.prev.maxTyreWearReported < t.pct) {
      radio.prev.maxTyreWearReported = t.pct;
      emitLocalRadio('tyres', t.urgency, t.msg);
      break;
    }
  }
  // Detect tyre cliff: lap time increased significantly
  if (lap && lap.lastLapTimeMs > 0 && radio.prev.prevLastLapTime > 0) {
    const delta = lap.lastLapTimeMs - radio.prev.prevLastLapTime;
    if (delta > 2000 && maxWear > 60) { // 2s+ slower
      emitLocalRadio('tyres', 'critical',
        RADIO_MESSAGES.tyre_cliff({ tyre: worstTyre, wear: maxWear }).text);
    }
  }
  if (lap) {
    radio.prev.prevLastLapTime = radio.prev.lastLapTime;
    radio.prev.lastLapTime = lap.lastLapTimeMs;
  }
  // Reset wear tracking on tyre change
  if (maxWear < 10 && radio.prev.maxTyreWearReported > 30) {
    radio.prev.maxTyreWearReported = 0;
    const sts = state.status;
    const cmp = sts ? (TYRE_COMPOUNDS[sts.visualTyreCompound]?.name || 'new tyres') : 'new tyres';
    emitLocalRadio('pit', 'medium', `New ${cmp} fitted. Bring them up to temperature carefully.`);
  }
  // Tyre overheating detection
  const tel = state.telemetry;
  const shouldCheckTyreTemp = isFiveLapTyreCheckpoint(currentLapNum) && radio.prev.lastTyreTempReportLap !== currentLapNum;
  if (tel && shouldCheckTyreTemp) {
    radio.prev.lastTyreTempReportLap = currentLapNum;
    for (let i = 0; i < 4; i++) {
      if (tel.tyreSurfaceTemp[i] > 120 && canTrigger('tyres')) {
        emitLocalRadio('tyres', 'medium',
          RADIO_MESSAGES.normal_tyre_overheating({ hotTyre: posLabel[i], temp: tel.tyreSurfaceTemp[i] }).text);
        break;
      }
    }
  }
}
function detectERSAndDRS() {
  // Intentionally disabled: DRS radio callouts removed.
}
function detectFuel() {
  if (!radio.config.normal?.enabled) return;
  const sts = state.status;
  if (!sts) return;
  const fuelLaps = sts.fuelRemainingLaps;
  const ses = state.session;
  const lap = state.lapData?.[state.playerCarIndex];
  if (!ses || !lap) return;
  const lapsLeft = ses.totalLaps - lap.currentLapNum;
  if (fuelLaps > 0 && lapsLeft > 0 && fuelLaps < lapsLeft && fuelLaps < lapsLeft - 1) {
    if (!radio.prev.fuelWarned) {
      radio.prev.fuelWarned = true;
      emitLocalRadio('normal', 'high',
        `Fuel critical. ${fuelLaps.toFixed(1)} laps of fuel remaining, ${lapsLeft} laps to go. Lean mix now.`);
    }
  }
  if (fuelLaps >= lapsLeft && radio.prev.fuelWarned) {
    radio.prev.fuelWarned = false;
    emitLocalRadio('normal', 'low', 'Fuel is fine now. You\'ll make it to the end.');
  }
}
function detectWeatherChange() {
  if (!radio.config.weather?.enabled) return;
  const ses = state.session;
  if (!ses) return;
  const w = ses.weather;
  if (radio.prev.weather !== null && w !== radio.prev.weather) {
    const names = { 0: 'Clear', 1: 'Light Cloud', 2: 'Overcast', 3: 'Light Rain', 4: 'Heavy Rain', 5: 'Storm' };
    const name = names[w] || 'Unknown';
    const wasWet = radio.prev.weather >= 3;
    const isWet = w >= 3;
    if (isWet && !wasWet) {
      emitLocalRadio('weather', 'critical',
        RADIO_MESSAGES.weather_rain_starting().text);
    } else if (!isWet && wasWet) {
      emitLocalRadio('weather', 'high',
        RADIO_MESSAGES.weather_drying().text);
    } else if (w > radio.prev.weather) {
      emitLocalRadio('weather', 'high', `Weather worsening: ${name}. Adjust your approach.`);
    } else {
      emitLocalRadio('weather', 'medium', `Weather update: ${name}. Conditions changing.`);
    }
  }
  radio.prev.weather = w;
}
function detectDamage() {
  if (!radio.config.incident?.enabled) return;
  const dmg = state.damage;
  if (!dmg) return;
  const snapshot = {
    flw: dmg.frontLeftWingDamage, frw: dmg.frontRightWingDamage,
    rw: dmg.rearWingDamage, fl: dmg.floorDamage,
    diff: dmg.diffuserDamage, sp: dmg.sidepodDamage,
    gb: dmg.gearBoxDamage, drs: dmg.drsFault, ers: dmg.ersFault,
  };
  const prev = radio.prev.damageSnapshot;
  if (!prev) { radio.prev.damageSnapshot = snapshot; return; }
  const parts = [
    { key: 'flw', label: 'Front left wing', side: 'left' },
    { key: 'frw', label: 'Front right wing', side: 'right' },
    { key: 'rw',  label: 'Rear wing' },
    { key: 'fl',  label: 'Floor' },
    { key: 'diff', label: 'Diffuser' },
    { key: 'sp',  label: 'Sidepod' },
    { key: 'gb',  label: 'Gearbox' },
  ];
  const newDamage = [];
  for (const p of parts) {
    if (snapshot[p.key] - (prev[p.key] || 0) >= 8) {
      newDamage.push({ ...p, pct: snapshot[p.key] });
    }
  }
  if (snapshot.drs && !prev.drs) newDamage.push({ label: 'DRS fault', key: 'drs', pct: 100 });
  if (snapshot.ers && !prev.ers) newDamage.push({ label: 'ERS fault', key: 'ers', pct: 100 });
  if (newDamage.length > 0) {
    const hasFault = newDamage.some(d => d.key === 'drs' || d.key === 'ers');
    const urgency = hasFault || newDamage.length > 2 ? 'critical' : 'high';
    // Specific messages for wing damage (affects balance)
    const wingDmg = newDamage.find(d => d.key === 'flw' || d.key === 'frw');
    if (wingDmg && newDamage.length === 1) {
      emitLocalRadio('incident', urgency,
        RADIO_MESSAGES.incident_wing_damage({ side: wingDmg.side || 'front', pct: wingDmg.pct }).text);
    } else if (newDamage.find(d => d.key === 'fl') && newDamage.length === 1) {
      emitLocalRadio('incident', urgency,
        RADIO_MESSAGES.incident_floor_damage({ pct: newDamage[0].pct }).text);
    } else {
      const list = newDamage.map(d => `${d.label} ${d.pct}%`).join(', ');
      emitLocalRadio('incident', urgency, `Damage detected! ${list}. Assess the car.`);
    }
  }
  radio.prev.damageSnapshot = snapshot;
}
function detectFlagChanges() {
  if (!radio.config.flags?.enabled) return;
  const ses = state.session;
  if (!ses) return;
  const sc = ses.safetyCarStatus;
  const prevSC = radio.prev.safetyCarStatus;
  if (prevSC !== null && sc !== prevSC) {
    if (sc === 1) emitLocalRadio('flags', 'critical', RADIO_MESSAGES.flag_sc().text);
    else if (sc === 2) emitLocalRadio('flags', 'critical', RADIO_MESSAGES.flag_vsc().text);
    else if (sc === 3 && prevSC >= 1) emitLocalRadio('restart', 'high', RADIO_MESSAGES.restart_sc().text);
    else if (sc === 0 && prevSC >= 1) emitLocalRadio('restart', 'high', RADIO_MESSAGES.restart_go().text);
    // Free pit stop opportunity under SC/VSC
    if ((sc === 1 || sc === 2) && radio.config.pit?.enabled) {
      const lap = state.lapData?.[state.playerCarIndex];
      const dmg = state.damage;
      if (lap && dmg) {
        const maxWear = Math.max(...dmg.tyresWear);
        if (maxWear > 30) {
          setTimeout(() => {
            emitLocalRadio('pit', 'critical', RADIO_MESSAGES.pit_free_stop_sc().text);
          }, 5000);
        }
      }
    }
  }
  radio.prev.safetyCarStatus = sc;
  // FIA flags per car
  const sts = state.status;
  if (sts) {
    const flag = sts.vehicleFiaFlags;
    if (flag !== radio.prev.fiaFlag) {
      if (flag === -1) emitLocalRadio('flags', 'critical', RADIO_MESSAGES.flag_yellow().text);
      else if (flag === 1) emitLocalRadio('flags', 'high', RADIO_MESSAGES.flag_green().text);
      else if (flag === 2) emitLocalRadio('flags', 'high', 'Blue flag! Let the faster car through cleanly.');
      else if (flag === 3) emitLocalRadio('flags', 'critical', RADIO_MESSAGES.flag_red().text);
      radio.prev.fiaFlag = flag;
    }
  }
}
function detectPitStatus() {
  if (!radio.config.pit?.enabled) return;
  const lap = state.lapData?.[state.playerCarIndex];
  if (!lap) return;
  const ps = lap.pitStatus;
  const prevPS = radio.prev.pitStatus;
  if (prevPS !== undefined && ps !== prevPS) {
    if (ps === 1 && prevPS === 0) {
      emitLocalRadio('pit', 'medium', 'Box box box. Pit entry  stick to the speed limit.');
    } else if (ps === 0 && prevPS >= 1) {
      const sts = state.status;
      const cmp = sts ? (TYRE_COMPOUNDS[sts.visualTyreCompound]?.name || '') : '';
      emitLocalRadio('pit', 'medium', `Good stop. Out on ${cmp || 'new tyres'}. Push hard on the out-lap.`);
    }
  }
  radio.prev.pitStatus = ps;
}
function detectPenalty() {
  if (!radio.config.penalty?.enabled) return;
  const lap = state.lapData?.[state.playerCarIndex];
  if (!lap) return;
  if (lap.penalties > 0 && lap.penalties !== radio.prev.penalties) {
    emitLocalRadio('penalty', 'high',
      RADIO_MESSAGES.penalty_time({ seconds: lap.penalties }).text);
  }
  radio.prev.penalties = lap.penalties;
}
function detectPitWindow() {
  if (!radio.config.pit?.enabled) return;
  const ses = state.session;
  const lap = state.lapData?.[state.playerCarIndex];
  const sts = state.status;
  const dmg = state.damage;
  if (!ses || !lap || !sts || !dmg) return;
  const isRace = ses.sessionType >= 10 && ses.sessionType <= 12;
  if (!isRace) return;
  if (lap.pitStatus >= 1) return; // already in pits
  const lapsLeft = ses.totalLaps - lap.currentLapNum;
  const maxWear = Math.max(...dmg.tyresWear.map(w => Math.round(w)));
  const posLabel = ['RL', 'RR', 'FL', 'FR'];
  const worstIdx = dmg.tyresWear.indexOf(Math.max(...dmg.tyresWear));
  const worstTyre = posLabel[worstIdx];
  //  Pace loss detection (compare last lap to rolling average) 
  let paceLoss = 0;
  if (lap.lastLapTimeMs > 0 && radio.prev.lapTimeAvg > 0) {
    paceLoss = (lap.lastLapTimeMs - radio.prev.lapTimeAvg) / 1000;
  }
  // Update rolling average (exponential moving average)
  if (lap.lastLapTimeMs > 0 && lap.lastLapTimeMs < 300000) {
    if (!radio.prev.lapTimeAvg || radio.prev.lapTimeAvg <= 0) {
      radio.prev.lapTimeAvg = lap.lastLapTimeMs;
    } else if (lap.currentLapNum > radio.prev.lapTimeAvgLap) {
      // Only update if pace loss < 3s (exclude pit laps, incidents)
      const delta = lap.lastLapTimeMs - radio.prev.lapTimeAvg;
      if (Math.abs(delta) < 3000) {
        radio.prev.lapTimeAvg = radio.prev.lapTimeAvg * 0.85 + lap.lastLapTimeMs * 0.15;
      }
    }
    radio.prev.lapTimeAvgLap = lap.currentLapNum;
  }
  //  Safety car status 
  const sc = ses.safetyCarStatus; // 0=none, 1=full SC, 2=VSC, 3=forming
  //  Severe damage  pit immediately 
  const wingDmg = Math.max(dmg.frontLeftWingDamage, dmg.frontRightWingDamage);
  const hasEngineFail = dmg.engineBlown || dmg.engineSeized;
  if ((wingDmg > 50 || dmg.floorDamage > 50 || hasEngineFail) && lapsLeft > 2 && canTrigger('pit')) {
    emitLocalRadio('pit', 'critical',
      hasEngineFail ? 'Engine failure! Box immediately!'
      : `Severe damage  ${wingDmg > 50 ? 'front wing' : 'floor'} at ${Math.max(wingDmg, dmg.floorDamage)}%. Box immediately.`);
    return;
  }
  //  Puncture risk zone (75%+)  box now 
  if (maxWear >= 75 && lapsLeft > 1 && canTrigger('pit')) {
    emitLocalRadio('pit', 'critical',
      `BOX NOW! ${worstTyre} at ${maxWear}%. Puncture risk territory. Do not stay out.`);
    return;
  }
  //  Safety Car / VSC pit opportunity 
  if ((sc === 1 || sc === 2) && canTrigger('pit')) {
    if (maxWear >= 35 && lapsLeft > 3) {
      emitLocalRadio('pit', 'critical',
        sc === 1
          ? `Safety car! Tyre wear at ${maxWear}%. Free stop opportunity  box box box!`
          : `VSC! Tyre wear at ${maxWear}%. Reduced time loss  consider boxing now.`);
      return;
    }
    // Even low wear  if we were planning to stop in next 5 laps
    if (ses.pitStopWindowIdealLap > 0 && lap.currentLapNum >= ses.pitStopWindowIdealLap - 3) {
      emitLocalRadio('pit', 'high',
        `${sc === 1 ? 'Safety car' : 'VSC'}! Near our pit window. Strong opportunity to stop now.`);
      return;
    }
  }
  //  Danger zone (65-74%)  almost always pit 
  if (maxWear >= 65 && lapsLeft > 2 && canTrigger('pit')) {
    emitLocalRadio('pit', 'high',
      `${worstTyre} at ${maxWear}%. You're in the danger zone. Box this lap or next.`);
    return;
  }
  //  Performance cliff zone (50-64%)  pit if pace drops 
  if (maxWear >= 50 && lapsLeft > 3 && canTrigger('pit')) {
    if (paceLoss >= 0.8) {
      emitLocalRadio('pit', 'high',
        `Losing ${paceLoss.toFixed(1)}s per lap. Tyres at ${maxWear}%. Performance cliff  box now.`);
    } else if (paceLoss >= 0.5) {
      emitLocalRadio('pit', 'medium',
        `Pace dropping  ${paceLoss.toFixed(1)}s off baseline. ${worstTyre} at ${maxWear}%. Pit window open.`);
    } else {
      emitLocalRadio('pit', 'low',
        `${worstTyre} at ${maxWear}%. Real pit window. Monitor pace  box if lap times drop.`);
    }
    return;
  }
  //  Early degradation (35-49%)  stay out unless pace drops or undercut 
  if (maxWear >= 35 && paceLoss >= 0.6 && lapsLeft > 5 && canTrigger('pit')) {
    emitLocalRadio('pit', 'medium',
      `Pace loss ${paceLoss.toFixed(1)}s at ${maxWear}% wear. Consider early stop for the undercut.`);
    return;
  }
  //  Moderate wing damage  pit if pace suffers 
  if (wingDmg > 25 && wingDmg <= 50 && paceLoss >= 0.8 && lapsLeft > 3 && canTrigger('pit')) {
    emitLocalRadio('pit', 'medium',
      `Wing damage at ${wingDmg}%, costing ${paceLoss.toFixed(1)}s/lap. Consider boxing for repairs.`);
    return;
  }
  //  Weather crossover pit 
  if (ses.weatherForecast?.length && canTrigger('pit')) {
    const currentWet = ses.weather >= 3;
    const firstOpposite = ses.weatherForecast.find(f =>
      currentWet ? f.weather < 3 : f.weather >= 3
    );
    if (firstOpposite && firstOpposite.timeOffset <= 5) {
      emitLocalRadio('pit', 'high',
        currentWet
          ? `Track drying in ~${firstOpposite.timeOffset}min. Prefer inters  dry lines will form. Be ready to box.`
          : `Rain in ~${firstOpposite.timeOffset}min. Prefer inters for better flexibility. Prepare to box.`);
      return;
    }
  }
  //  Pack pitting detection (5+ cars ahead pit) 
  if (state.lapData && canTrigger('pit')) {
    const myPos = lap.carPosition;
    // Count cars ahead that are currently in pits
    const carsAheadPitting = state.lapData.filter(l =>
      l && l.carPosition < myPos && l.carPosition > 0 && l.pitStatus >= 1
    ).length;
    if (carsAheadPitting >= 5) {
      if (maxWear >= 35 || paceLoss >= 0.5) {
        emitLocalRadio('pit', 'high',
          `${carsAheadPitting} cars ahead pitting! Tyres at ${maxWear}%. Cover them  box now before you're undercut.`);
      } else {
        emitLocalRadio('pit', 'medium',
          `${carsAheadPitting} cars ahead pitting. Tyres still OK at ${maxWear}%. Stay out  use the clean track for an overcut.`);
      }
      return;
    }
  }
  //  Late SC/VSC  pit for softs with 3-5 laps left 
  if ((sc === 1 || sc === 2) && lapsLeft >= 3 && lapsLeft <= 6 && canTrigger('pit')) {
    if (maxWear >= 25) {
      emitLocalRadio('pit', 'critical',
        `Late ${sc === 1 ? 'Safety Car' : 'VSC'} with ${lapsLeft} laps left! Box for softs  reduced pit loss, fresh rubber for the restart.`);
      return;
    }
  }
  //  End-race decisions (5 laps or fewer, green flag) 
  if (lapsLeft <= 5 && lapsLeft >= 1 && sc === 0 && canTrigger('pit')) {
    if (lapsLeft <= 2) {
      // 1-2 laps: almost never pit
      if (maxWear >= 90 || wingDmg > 60) {
        emitLocalRadio('pit', 'high',
          `${lapsLeft} lap${lapsLeft > 1 ? 's' : ''} left. ${maxWear >= 90 ? 'Tyres critical' : 'Severe damage'}. Pit only if you can\'t finish safely.`);
      }
      // Otherwise stay out, no message needed
      return;
    }
    if (lapsLeft <= 5 && lapsLeft >= 3) {
      // 3-5 laps: pit only if pace is terrible or damage
      if (paceLoss >= 1.5 && maxWear >= 50) {
        emitLocalRadio('pit', 'medium',
          `${lapsLeft} laps to go, losing ${paceLoss.toFixed(1)}s/lap. Tyres at ${maxWear}%. Late stop could recover  but only if you rejoin in clean air.`);
      } else if (wingDmg > 35 && paceLoss >= 0.8) {
        emitLocalRadio('pit', 'medium',
          `Wing damage at ${wingDmg}% with ${lapsLeft} to go. Costing ${paceLoss.toFixed(1)}s/lap. Stay out unless it gets worse.`);
      }
      return;
    }
  }
  //  Free stop check (gap analysis for position-neutral pit) 
  if (maxWear >= 40 && lapsLeft > 5 && canTrigger('pit')) {
    const myPos = lap.carPosition;
    // Find gap to car behind  if large enough, we can pit without losing position
    const carBehindLap = state.lapData?.find(l => l?.carPosition === myPos + 1);
    if (carBehindLap) {
      const gapBehindMs = carBehindLap.deltaToCarAheadMs;
      // Typical pit stop costs ~22-25s. If gap behind > 25s, it's a free stop
      if (gapBehindMs > 25000) {
        emitLocalRadio('pit', 'high',
          `Free stop! ${(gapBehindMs / 1000).toFixed(1)}s gap behind. Box now and rejoin without losing position.`);
        return;
      }
      // If gap behind is 18-25s, marginal  might lose 1 position
      if (gapBehindMs > 18000 && maxWear >= 50) {
        emitLocalRadio('pit', 'medium',
          `Near-free stop. ${(gapBehindMs / 1000).toFixed(1)}s to car behind. May lose one spot but tyre advantage will recover it.`);
        return;
      }
    }
  }
  //  Undercut/overcut detection (rival pitted) 
  if (state.lapData && state.participants && canTrigger('pit')) {
    const myPos = lap.carPosition;
    const carAheadLap = state.lapData.find(l => l?.carPosition === myPos - 1);
    if (carAheadLap?.pitStatus >= 1) {
      const aheadIdx = state.lapData.indexOf(carAheadLap);
      const aheadName = state.participants?.participants?.[aheadIdx]?.name || 'Car ahead';
      // Check if we'd rejoin in traffic (bad) or clean air (good)
      const gapBehind = state.lapData.find(l => l?.carPosition === myPos + 1)?.deltaToCarAheadMs || 0;
      if (gapBehind > 15000) {
        emitLocalRadio('pit', 'high',
          `${aheadName} has pitted! Undercut threat. Good gap behind  cover them, box now.`);
      } else {
        emitLocalRadio('pit', 'medium',
          `${aheadName} has pitted. Undercut possible but you'd rejoin in traffic. Consider staying out for the overcut.`);
      }
    }
  }
}
//  Battle-aware detection (battery, damage, prolonged following) 
function detectBattleSituations() {
  if (!radio.config.racecraft?.enabled && !radio.config.overtake?.enabled && !radio.config.defend?.enabled) return;
  const lap = state.lapData?.[state.playerCarIndex];
  const sts = state.status;
  if (!lap || !sts || !state.allCarStatus) return;
  const now = Date.now();
  const myPos = lap.carPosition;
  const myErsPct = (sts.ersStoreEnergy / 4000000) * 100;
  // Find car ahead and behind
  const carAheadLap = state.lapData?.find(l => l?.carPosition === myPos - 1);
  const carBehindLap = state.lapData?.find(l => l?.carPosition === myPos + 1);
  const aheadIdx = carAheadLap ? state.lapData.indexOf(carAheadLap) : -1;
  const behindIdx = carBehindLap ? state.lapData.indexOf(carBehindLap) : -1;
  const gapAheadMs = lap.deltaToCarAheadMs;
  const gapBehindMs = carBehindLap?.deltaToCarAheadMs;
  const currentLapNum = lap.currentLapNum || 0;
  //  Track battle duration 
  if (gapAheadMs > 0 && gapAheadMs < 1500 && aheadIdx >= 0) {
    if (radio.prev.battleAheadIdx !== aheadIdx || radio.prev.battleAheadStart === 0) {
      radio.prev.battleAheadStart = now;
      radio.prev.battleAheadIdx = aheadIdx;
    }
  } else {
    radio.prev.battleAheadStart = 0;
    radio.prev.battleAheadIdx = -1;
    radio.prev.lastBattleBatteryRivalAhead = -1;
    radio.prev.lastBattleBatteryDeltaAhead = null;
  }
  if (gapBehindMs > 0 && gapBehindMs < 1500 && behindIdx >= 0) {
    if (radio.prev.battleBehindIdx !== behindIdx || radio.prev.battleBehindStart === 0) {
      radio.prev.battleBehindStart = now;
      radio.prev.battleBehindIdx = behindIdx;
    }
  } else {
    radio.prev.battleBehindStart = 0;
    radio.prev.battleBehindIdx = -1;
    radio.prev.lastBattleBatteryRivalBehind = -1;
    radio.prev.lastBattleBatteryDeltaBehind = null;
  }
  //  Battery delta during battle (no API) 
  const batteryInfoCooldownMs = 45000;
  if (aheadIdx >= 0 && gapAheadMs > 0 && gapAheadMs < 1500 && now - radio.prev.lastBattleBatteryMsg > batteryInfoCooldownMs) {
    const rivalInfo = getRivalBattleInfo(aheadIdx);
    if (rivalInfo) {
      const deltaPct = myErsPct - rivalInfo.ersPct;
      if (shouldEmitBattleBattery('ahead', aheadIdx, deltaPct)) {
        radio.prev.lastBattleBatteryMsg = now;
        markBattleBattery('ahead', aheadIdx, deltaPct);
        emitLocalRadio('racecraft', 'low',
          formatBattleBatteryInfo(rivalInfo.name, 'ahead', deltaPct));
      }
    }
  }
  // Battery delta for car behind
  if (behindIdx >= 0 && gapBehindMs > 0 && gapBehindMs < 1500 && now - radio.prev.lastBattleBatteryMsg > batteryInfoCooldownMs) {
    const rivalInfo = getRivalBattleInfo(behindIdx);
    if (rivalInfo) {
      const deltaPct = myErsPct - rivalInfo.ersPct;
      if (shouldEmitBattleBattery('behind', behindIdx, deltaPct)) {
        radio.prev.lastBattleBatteryMsg = now;
        markBattleBattery('behind', behindIdx, deltaPct);
        emitLocalRadio('racecraft', 'low',
          formatBattleBatteryInfo(rivalInfo.name, 'behind', deltaPct));
      }
    }
  }
  //  Damage comparison during battle 
  const allowTyreAgeInfo = isFiveLapTyreCheckpoint(currentLapNum)
    && radio.prev.lastTyreAgeReportLap !== currentLapNum
    && now - radio.prev.lastBattleDamageMsg > 45000;
  if (allowTyreAgeInfo) {
    let tyreAgeInfoSent = false;
    // Car ahead damage (exploit their weakness)
    if (aheadIdx >= 0 && gapAheadMs > 0 && gapAheadMs < 1500) {
      const aheadSts = state.allCarStatus?.[aheadIdx];
      if (aheadSts) {
        const rivalName = state.participants?.participants?.[aheadIdx]?.name || 'Car ahead';
        // We can infer damage from their pace and ERS  for actual damage we'd need allCarDamage
        // Use tyre age difference as a proxy for vulnerability
        const myTyreAge = sts.tyresAgeLaps;
        const theirTyreAge = aheadSts.tyresAgeLaps;
        const tyreDelta = theirTyreAge - myTyreAge;
        if (tyreDelta > 5) {
          tyreAgeInfoSent = true;
          radio.prev.lastBattleDamageMsg = now;
          radio.prev.lastTyreAgeReportLap = currentLapNum;
          emitLocalRadio('racecraft', 'medium',
            RADIO_MESSAGES.overtake_tyre_advantage({ rivalName, tyreDeltaLaps: tyreDelta }).text);
        }
      }
    }
    // Car behind with fresher tyres
    if (!tyreAgeInfoSent && behindIdx >= 0 && gapBehindMs > 0 && gapBehindMs < 1500) {
      const behindSts = state.allCarStatus?.[behindIdx];
      if (behindSts) {
        const rivalName = state.participants?.participants?.[behindIdx]?.name || 'Car behind';
        const tyreDelta = sts.tyresAgeLaps - behindSts.tyresAgeLaps;
        if (tyreDelta > 5) {
          tyreAgeInfoSent = true;
          radio.prev.lastBattleDamageMsg = now;
          radio.prev.lastTyreAgeReportLap = currentLapNum;
          emitLocalRadio('racecraft', 'high',
            RADIO_MESSAGES.defend_rival_fresher_tyres({ rivalName, tyreDeltaLaps: tyreDelta }).text);
        }
      }
    }
  }
  //  Prolonged following: different message after 30s+ of battle 
  if (radio.prev.battleAheadStart > 0) {
    const battleDuration = now - radio.prev.battleAheadStart;
    const rivalInfo = aheadIdx >= 0 ? getRivalBattleInfo(aheadIdx) : null;
    // After 45s of following, warn about dirty air
    if (battleDuration > 45000 && battleDuration < 50000 && now - radio.prev.lastDirtyAirMsg > 60000) {
      radio.prev.lastDirtyAirMsg = now;
      if (rivalInfo) {
        emitLocalRadio('normal', 'medium',
          `Following ${rivalInfo.name} for a while now. Front tyres heating in dirty air. Commit or back off.`);
      }
    }
    // After 90s, suggest backing off or trying different approach
    if (battleDuration > 90000 && battleDuration < 95000 && canTrigger('racecraft')) {
      if (rivalInfo) {
        emitLocalRadio('racecraft', 'medium',
          `Long battle with ${rivalInfo.name}. Destroying the tyres. Consider the undercut if you can't pass.`);
      }
    }
  }
  //  Closing gap / being caught detection 
  if (gapAheadMs > 0 && radio.prev.gapAheadPrev > 0) {
    const gapChange = radio.prev.gapAheadPrev - gapAheadMs; // positive = closing
    if (gapChange > 200 && gapAheadMs < 3000 && gapAheadMs > 1200 && now - radio.prev.lastClosingMsg > 30000) {
      radio.prev.lastClosingMsg = now;
      const aheadName = state.participants?.participants?.[aheadIdx]?.name || 'car ahead';
      emitLocalRadio('normal', 'low',
        RADIO_MESSAGES.normal_closing({ aheadName, gapMs: gapAheadMs }).text);
    }
  }
  radio.prev.gapAheadPrev = gapAheadMs;
  if (gapBehindMs > 0 && radio.prev.gapBehindPrev > 0) {
    const gapChange = radio.prev.gapBehindPrev - gapBehindMs; // positive = they're closing
    if (gapChange > 200 && gapBehindMs < 2500 && gapBehindMs > 1000 && now - radio.prev.lastBeingCaughtMsg > 30000) {
      radio.prev.lastBeingCaughtMsg = now;
      const behindName = state.participants?.participants?.[behindIdx]?.name || 'car behind';
      emitLocalRadio('normal', 'medium',
        RADIO_MESSAGES.normal_being_caught({ behindName, gapMs: gapBehindMs }).text);
    }
  }
  radio.prev.gapBehindPrev = gapBehindMs || 0;
}
//  Driving events (lockup / track limits) 
function detectDrivingEvents() {
  if (!radio.config.normal?.enabled) return;
  const tel = state.telemetry;
  if (!tel) return;
  // Lock-up detection: brake > 80% and speed dropping fast
  if (tel.brake > 0.8 && tel.speed < 150 && tel.speed > 30) {
    const now = Date.now();
    if (now - radio.prev.lockupDetected > 30000) {
      // Approximate: if high brake + low speed + lap invalid could indicate lockup
      const lap = state.lapData?.[state.playerCarIndex];
      if (lap?.currentLapInvalid && canTrigger('normal')) {
        radio.prev.lockupDetected = now;
        emitLocalRadio('normal', 'medium', RADIO_MESSAGES.normal_lockup().text);
      }
    }
  }
  // Track limits (lap invalid)
  const lap = state.lapData?.[state.playerCarIndex];
  if (lap?.currentLapInvalid && canTrigger('normal')) {
    emitLocalRadio('normal', 'medium', RADIO_MESSAGES.normal_track_limits().text);
  }
}
//  End of race detection 
function detectEndRace() {
  if (!radio.config.endrace?.enabled) return;
  const ses = state.session;
  const lap = state.lapData?.[state.playerCarIndex];
  const sts = state.status;
  if (!ses || !lap || !sts) return;
  const isRace = ses.sessionType >= 10 && ses.sessionType <= 12;
  if (!isRace) return;
  const lapsLeft = ses.totalLaps - lap.currentLapNum;
  // Final lap
  if (lapsLeft === 0 && !radio.prev.endRaceWarned) {
    radio.prev.endRaceWarned = true;
    emitLocalRadio('endrace', 'high',
      RADIO_MESSAGES.endrace_final_lap({ position: lap.carPosition, gapAheadMs: lap.deltaToCarAheadMs }).text);
  }
  // Last 3 laps  full send message
  if (lapsLeft === 3 && canTrigger('endrace')) {
    emitLocalRadio('endrace', 'medium', RADIO_MESSAGES.endrace_push_no_saving().text);
  }
  // Reset for next race
  if (lapsLeft > 5) radio.prev.endRaceWarned = false;
}
//  Clean air notification 
function detectCleanAir() {
  if (!radio.config.normal?.enabled) return;
  const lap = state.lapData?.[state.playerCarIndex];
  if (!lap) return;
  const now = Date.now();
  const gapAheadMs = lap.deltaToCarAheadMs;
  // Clean air: gap > 3s to car ahead, and we haven't said this recently
  if (gapAheadMs > 3000 && now - radio.prev.cleanAirMsgTime > 120000) {
    radio.prev.cleanAirMsgTime = now;
    emitLocalRadio('normal', 'low', RADIO_MESSAGES.normal_clean_air().text);
  }
}
//  Proximity-based scenarios (use API for tactical advice) 
function getProximityScenario() {
  const lap = state.lapData?.[state.playerCarIndex];
  if (!lap) return null;
  const myPos = lap.carPosition;
  const carAheadLap = state.lapData?.find(l => l?.carPosition === myPos - 1);
  const carBehindLap = state.lapData?.find(l => l?.carPosition === myPos + 1);
  const gapAheadMs = lap.deltaToCarAheadMs;
  const gapBehindMs = carBehindLap?.deltaToCarAheadMs;
  const isAttacking = gapAheadMs > 0 && gapAheadMs < 1200 && carAheadLap != null;
  const isDefending = gapBehindMs != null && gapBehindMs > 0 && gapBehindMs < 1000;
  if (isAttacking && isDefending) return 'mixed';
  if (isAttacking) return 'attack';
  if (isDefending) return 'defense';
  return null;
}
async function triggerAPIRadio(scenario) {
  if (radio.awaiting) return;
  // Check if category is enabled
  const catKey = getCategoryForRadio(scenario);
  if (catKey && radio.config[catKey] && !radio.config[catKey].enabled) return;
  radio.awaiting = true;
  markTriggered(scenario);
  const ctx = buildRaceContext(true);
  const lap = state.lapData?.[state.playerCarIndex];
  let prompt = '';
  if (scenario === 'attack' || scenario === 'mixed') {
    const gapMs = lap?.deltaToCarAheadMs ?? 0;
    prompt += `ATTACK SITUATION: Car ahead is ${(gapMs / 1000).toFixed(2)}s in front. Evaluate overtake opportunity.\n`;
  }
  if (scenario === 'defense' || scenario === 'mixed') {
    const myPos = lap?.carPosition;
    const carBehindLap = state.lapData?.find(l => l?.carPosition === myPos + 1);
    const gapMs = carBehindLap?.deltaToCarAheadMs ?? 0;
    prompt += `DEFENSE SITUATION: Car behind is ${(gapMs / 1000).toFixed(2)}s behind. Evaluate defense requirements.\n`;
  }
  prompt += 'Provide ENGINEER_DECISION output. Radio line must be info-only: factual status/metrics/deltas only, with no suggestions, instructions, or advice.';
  const feedEl = el('radio-feed');
  const thinkingCard = document.createElement('div');
  thinkingCard.className = 'radio-card thinking';
  thinkingCard.innerHTML = `<span class="radio-tag tag-${scenario}"> ${scenario.toUpperCase()}</span> <span class="radio-thinking">Engineer analysing</span>`;
  if (feedEl) feedEl.prepend(thinkingCard);
  const result = await window.raceEngineer.askEngineer({
    question: prompt, context: ctx, mode: 'ENGINEER_DECISION',
  });
  thinkingCard.remove();
  radio.awaiting = false;
  if (result.error || !result.response) {
    // Don't spam the feed with "No API key" errors
    if (result.error?.includes('API key')) return;
    appendRadioCard(scenario, 'medium', result.error || 'No response.', true);
    return;
  }
  const text = result.response;
  const speakMatch   = text.match(/speak:\s*(yes|no)/i);
  const urgencyMatch = text.match(/urgency:\s*(\w+)/i);
  const radioMatch   = text.match(/radio:\s*(.+)/is);
  const shouldSpeak = speakMatch ? speakMatch[1].toLowerCase() === 'yes' : true;
  const urgency = urgencyMatch?.[1]?.toLowerCase() || 'medium';
  const radioText = radioMatch
    ? radioMatch[1].trim().replace(/\n.*/s, '')
    : text.split('\n').find(l => l.trim().length > 10) || text;
  if (shouldSpeak) appendRadioCard(scenario, urgency, radioText, false);
}
//  Qualifying radio 
function detectQualifyingRadio() {
  const ses = state.session;
  const lap = state.lapData?.[state.playerCarIndex];
  if (!ses || !lap) return;
  const pitStatus = lap.pitStatus; // 0=none, 1=pitting, 2=in pit
  const lastLapMs  = lap.lastLapTimeInMS;
  const allLaps    = state.lapData || [];
  // Detect outlap (just exited pits, driverStatus=5 is out-lap in F1)
  // pitStatus transitions from 1/2  0 means just left pits
  const wasInPit = radio.prev.pitStatus >= 1;
  const nowOutOfPit = pitStatus === 0;
  const justExited = wasInPit && nowOutOfPit;
  if (justExited) {
    // Check car behind gap
    const myPos = lap.carPosition;
    const behind = allLaps.find(c => c && c.carPosition === myPos + 1);
    if (behind) {
      const gapBehind = behind.deltaToCarInFrontInMS / 1000;
      if (gapBehind < 8 && gapBehind > 0) {
        emitLocalRadio('flags', 'medium',
          `Car behind on your outlap, ${gapBehind.toFixed(1)}s back. Give them room if needed.`);
      } else {
        emitLocalRadio('normal', 'low', 'Outlap. Track is clear behind you. Build your tyres.');
      }
    } else {
      emitLocalRadio('normal', 'low', 'Outlap. Track is clear. Focus on tyre prep.');
    }
  }
  radio.prev.pitStatus = pitStatus;
  // After a push lap: detect when we set a timed lap and are now on inlap/cooldown
  // pitStatus === 1 means entering pits = cooldown/inlap after push
  if (pitStatus === 1 && lastLapMs > 0 && lastLapMs !== radio.prev.lastLapTime) {
    radio.prev.lastLapTime = lastLapMs;
    // Find our position in the session
    const myLapStr = fmt(lastLapMs);
    // P1 time  use session history best laps, fall back to min of last laps
    const historyBests = Object.values(state.bestLapTimes).filter(t => t > 0);
    const bestLap = historyBests.length > 0
      ? Math.min(...historyBests)
      : Math.min(...allLaps.filter(c => c && c.lastLapTimeMs > 0).map(c => c.lastLapTimeMs));
    const p1LapStr = bestLap < Infinity ? fmt(bestLap) : '';
    const deltaMs  = lastLapMs - bestLap;
    const deltaStr = bestLap < Infinity && bestLap > 0
      ? (deltaMs >= 0 ? `+${(deltaMs/1000).toFixed(3)}` : (deltaMs/1000).toFixed(3)) + 's'
      : '';
    const myCarPos = lap.carPosition;
    const sessionTypeLabel = { 5:'Q1', 6:'Q2', 7:'Q3', 8:'SQ', 9:'OSQ' }[ses.sessionType] || 'Q';
    let msg = `${sessionTypeLabel} lap complete. P${myCarPos}. Your lap: ${myLapStr}`;
    if (deltaStr) msg += `. P1: ${p1LapStr} (${deltaStr})`;
    msg += '. Coming in.';
    emitLocalRadio('normal', 'medium', msg);
  }
}
//  Master auto-radio check (called from RAF tick) 
let lastAutoRadioCheck = 0;
function checkAutoRadio() {
  if (!radio.enabled || !state.connected) return;
  const now = Date.now();
  if (now - lastAutoRadioCheck < 3000) return;
  lastAutoRadioCheck = now;
  const ses = state.session;
  const isQualifying = ses && [5,6,7,8,9].includes(ses.sessionType);
  if (isQualifying) {
    detectQualifyingRadio();
    return;  // skip all race-mode checks
  }
  // All informational/logic-based triggers (no API)
  detectRaceStart();
  detectPositionChange();
  detectTyreWear();
  detectFuel();
  detectWeatherChange();
  detectDamage();
  detectFlagChanges();
  detectPitStatus();
  detectPenalty();
  detectPitWindow();
  detectBattleSituations();
  detectDrivingEvents();
  detectEndRace();
  detectCleanAir();
  // Proximity-based (API calls for tactical advice)
  const scenario = getProximityScenario();
  if (!scenario) { radio.prev.scenario = null; return; }
  const scenarioChanged = scenario !== radio.prev.scenario;
  if (scenarioChanged || canTrigger(scenario)) {
    radio.prev.scenario = scenario;
    triggerAPIRadio(scenario);
  }
}
//  Engineer page UI
function buildEngineer() {
  el('page-engineer').innerHTML = `
    <div class="engineer-header">
      <span class="engineer-icon"></span>
      <h2>AI Race Engineer</h2>
      <span class="model-badge" id="engineer-model-badge">claude-opus-4-6</span>
      <span class="gpt-status-badge badge-off" id="gpt-status-badge">GPT: Off</span>
      <div style="margin-left:auto;display:flex;align-items:center;gap:10px">
        <label class="context-toggle" style="margin:0">
          <input type="checkbox" id="radio-enabled" checked>
          Auto Radio
        </label>
        ${popoutBtn('engineer', 'AI Engineer', 800, 900)}
        <button id="clear-radio" style="font-size:11px;padding:3px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:3px;color:var(--text2);cursor:pointer">Clear</button>
      </div>
    </div>
    <!-- AI Mode strip -->
    <div class="ai-mode-strip">
      <div class="ai-mode-group">
        <label class="ai-mode-label">Voice Mode:</label>
        <select id="ai-mode-select" class="settings-input" style="width:180px">
          <option value="classic">Classic TTS (edge-tts)</option>
          <option value="gpt">GPT Realtime AI Voice</option>
        </select>
      </div>
      <div class="ai-mode-group" id="gpt-controls" style="display:none">
        <select id="gpt-voice-select" class="settings-input" style="width:130px">
          <option value="echo">Echo (male)</option>
          <option value="alloy">Alloy (neutral)</option>
          <option value="shimmer">Shimmer (female)</option>
          <option value="fable">Fable (british)</option>
          <option value="onyx">Onyx (deep)</option>
          <option value="nova">Nova (warm)</option>
        </select>
        <select id="gpt-session-type" class="settings-input" style="width:140px">
          <option value="race">Race</option>
          <option value="qualifying">Qualifying</option>
        </select>
        <button id="gpt-connect-btn" class="settings-save-btn" style="background:var(--accent)">Connect AI</button>
        <button id="gpt-buy-btn" class="settings-save-btn" style="background:#2a2a4a">Buy Credits</button>
        <span id="gpt-credits-label" style="font-size:11px;color:var(--text3)"></span>
      </div>
    </div>
    <!-- Status strip: live race info -->
    <div class="radio-status-strip" id="radio-status-strip">
      <div class="radio-status-item"><span class="radio-status-label">Position</span><span class="radio-status-value" id="rs-pos"></span></div>
      <div class="radio-status-item"><span class="radio-status-label">Lap</span><span class="radio-status-value" id="rs-lap"></span></div>
      <div class="radio-status-item"><span class="radio-status-label">Tyre</span><span class="radio-status-value" id="rs-tyre"></span></div>
      <div class="radio-status-item"><span class="radio-status-label">Wear</span><span class="radio-status-value" id="rs-wear"></span></div>
      <div class="radio-status-item"><span class="radio-status-label">ERS</span><span class="radio-status-value" id="rs-ers"></span></div>
      <div class="radio-status-item"><span class="radio-status-label">Fuel</span><span class="radio-status-value" id="rs-fuel"></span></div>
      <div class="radio-status-item"><span class="radio-status-label">Gap Ahead</span><span class="radio-status-value" id="rs-gap"></span></div>
      <div class="radio-status-item"><span class="radio-status-label">Flags</span><span class="radio-status-value" id="rs-flags"></span></div>
    </div>
    <!-- Proximity indicator -->
    <div id="proximity-bar" class="proximity-bar hidden">
      <span id="prox-ahead"></span>
      <span id="prox-me">YOU</span>
      <span id="prox-behind"></span>
    </div>
    <!-- Radio feed (all auto-triggered messages) -->
    <div class="radio-feed-wrap">
      <div class="section-title" style="padding:10px 16px 4px;border-bottom:1px solid var(--border)">
        Team Radio <span style="font-weight:400;color:var(--text3);font-size:10px">(all situations  auto-triggered)</span>
      </div>
      <div id="radio-feed" class="radio-feed">
        <div class="radio-feed-empty">No radio messages yet. Auto-triggers for all race situations.</div>
      </div>
    </div>
    <!-- Manual query -->
    <div class="chat-input-area" style="border-top:2px solid var(--border)">
      <div style="flex:1;display:flex;flex-direction:column;gap:6px">
        <span style="font-size:11px;color:var(--text3)">Manual query  ask any tactical question</span>
        <textarea class="chat-input" id="chat-input" placeholder="e.g. Should I box this lap? (Enter to send)" rows="2"></textarea>
      </div>
      <button class="chat-send-btn" id="chat-send">Ask</button>
    </div>
    <!-- Manual response area -->
    <div id="manual-response" class="manual-response hidden">
      <div class="radio-card urgency-medium" id="manual-card">
        <div class="radio-text" id="manual-text"></div>
      </div>
    </div>
  `;
  // Toggle auto-radio
  el('radio-enabled').addEventListener('change', (e) => {
    radio.enabled = e.target.checked;
  });
  // Clear feed
  el('clear-radio').addEventListener('click', () => {
    const feedEl = el('radio-feed');
    feedEl.innerHTML = '<div class="radio-feed-empty">Feed cleared.</div>';
    radio.prev.scenario = null;
    radio.lastTrigger = {};
    radio.prev.lastRadioText = '';
    radio.prev.lastRadioTextAt = 0;
  });
  // Manual query
  const input = el('chat-input');
  const sendBtn = el('chat-send');
  const manualResp = el('manual-response');
  const manualText = el('manual-text');
  async function sendManual() {
    const q = input.value.trim();
    if (!q || sendBtn.disabled) return;
    input.value = '';
    sendBtn.disabled = true;
    sendBtn.textContent = '';
    manualResp.classList.remove('hidden');
    manualText.textContent = 'Thinking';
    const ctx = buildRaceContext(true);
    const result = await window.raceEngineer.askEngineer({ question: q, context: ctx, mode: 'DRIVER_RADIO' });
    manualText.textContent = result.error ? ' ' + result.error : toInfoOnlyRadioText(result.response);
    sendBtn.disabled = false;
    sendBtn.textContent = 'Ask';
  }
  sendBtn.addEventListener('click', sendManual);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendManual(); }
  });
  // ── AI Mode controls ────────────────────────────────────────────────────────
  const aiModeSelect = el('ai-mode-select');
  const gptControls = el('gpt-controls');
  const gptConnectBtn = el('gpt-connect-btn');
  const gptBuyBtn = el('gpt-buy-btn');
  const gptVoiceSelect = el('gpt-voice-select');
  const gptSessionType = el('gpt-session-type');
  const gptCreditsLabel = el('gpt-credits-label');
  const modelBadge = el('engineer-model-badge');
  function updateGptCreditsLabel() {
    if (!gptCreditsLabel) return;
    if (license.devMode) {
      gptCreditsLabel.textContent = 'DEV MODE — unlimited';
    } else {
      const s = gptRealtime.sessionType === 'qualifying';
      const n = s ? license.qualifyingRemaining : license.racesRemaining;
      gptCreditsLabel.textContent = `${n} credit${n !== 1 ? 's' : ''} remaining`;
    }
  }
  if (aiModeSelect) {
    aiModeSelect.value = gptRealtime.aiMode;
    aiModeSelect.addEventListener('change', () => {
      gptRealtime.aiMode = aiModeSelect.value;
      const isGpt = gptRealtime.aiMode === 'gpt';
      if (gptControls) gptControls.style.display = isGpt ? 'flex' : 'none';
      if (modelBadge) modelBadge.textContent = isGpt ? 'gpt-4o-realtime' : 'claude-opus-4-6';
      if (!isGpt && gptRealtime.connected) gptDisconnect();
    });
  }
  if (gptControls) gptControls.style.display = gptRealtime.aiMode === 'gpt' ? 'flex' : 'none';
  if (gptVoiceSelect) {
    gptVoiceSelect.value = gptRealtime.voice;
    gptVoiceSelect.addEventListener('change', () => { gptRealtime.voice = gptVoiceSelect.value; });
  }
  if (gptSessionType) {
    gptSessionType.value = gptRealtime.sessionType;
    gptSessionType.addEventListener('change', () => {
      gptRealtime.sessionType = gptSessionType.value;
      updateGptCreditsLabel();
    });
  }
  if (gptConnectBtn) {
    gptConnectBtn.addEventListener('click', async () => {
      if (gptRealtime.connected) {
        gptConnectBtn.textContent = 'Connect AI';
        await gptDisconnect();
      } else {
        gptConnectBtn.textContent = 'Connecting…';
        gptConnectBtn.disabled = true;
        await gptConnect();
        gptConnectBtn.disabled = false;
        gptConnectBtn.textContent = gptRealtime.connected ? 'Disconnect AI' : 'Connect AI';
        updateGptCreditsLabel();
      }
    });
  }
  if (gptBuyBtn) {
    gptBuyBtn.addEventListener('click', () => showPurchaseModal());
  }
  updateGptCreditsLabel();
  updateGptStatusUI();
}
// Update proximity bar + status strip on the engineer page
function updateEngineerProximity() {
  // Status strip
  const lap = state.lapData?.[state.playerCarIndex];
  const sts = state.status;
  const dmg = state.damage;
  const ses = state.session;
  if (lap) {
    const rsPos = el('rs-pos');
    if (rsPos) rsPos.textContent = `P${lap.carPosition}`;
    const rsLap = el('rs-lap');
    if (rsLap) rsLap.textContent = `${lap.currentLapNum}/${ses?.totalLaps || ''}`;
    const rsGap = el('rs-gap');
    if (rsGap) rsGap.textContent = lap.deltaToCarAheadMs > 0 ? `${(lap.deltaToCarAheadMs / 1000).toFixed(1)}s` : '';
  }
  if (sts) {
    const cmp = TYRE_COMPOUNDS[sts.visualTyreCompound];
    const rsTyre = el('rs-tyre');
    if (rsTyre) rsTyre.innerHTML = cmp ? `<span style="color:${cmp.color}">${cmp.name} (${sts.tyresAgeLaps}L)</span>` : '';
    const rsErs = el('rs-ers');
    if (rsErs) rsErs.textContent = ((sts.ersStoreEnergy / 4000000) * 100).toFixed(0) + '%';
    const rsFuel = el('rs-fuel');
    if (rsFuel) rsFuel.textContent = sts.fuelRemainingLaps.toFixed(1) + ' laps';
  }
  if (dmg) {
    const maxWear = Math.max(...dmg.tyresWear.map(w => Math.round(w)));
    const rsWear = el('rs-wear');
    if (rsWear) {
      rsWear.textContent = maxWear + '%';
      rsWear.className = `radio-status-value ${maxWear > 80 ? 'status-critical' : maxWear > 60 ? 'status-warn' : ''}`;
    }
  }
  if (ses) {
    const rsFlags = el('rs-flags');
    if (rsFlags) {
      const scLabel = safetyCarLabel(ses.safetyCarStatus);
      rsFlags.textContent = scLabel || 'Green';
      rsFlags.className = `radio-status-value ${ses.safetyCarStatus > 0 ? 'status-critical' : ''}`;
    }
  }
  // Proximity bar
  const proxBar = el('proximity-bar');
  if (!proxBar || !lap) { if (proxBar) proxBar.classList.add('hidden'); return; }
  const myPos = lap.carPosition;
  const carAheadLap = state.lapData?.find(l => l?.carPosition === myPos - 1);
  const carBehindLap = state.lapData?.find(l => l?.carPosition === myPos + 1);
  const gapAheadMs = lap.deltaToCarAheadMs;
  const gapBehindMs = carBehindLap?.deltaToCarAheadMs;
  const aheadIdx = carAheadLap ? state.lapData.indexOf(carAheadLap) : -1;
  const behindIdx = carBehindLap ? state.lapData.indexOf(carBehindLap) : -1;
  const aheadName = state.participants?.participants?.[aheadIdx]?.name || (carAheadLap ? `P${myPos - 1}` : null);
  const behindName = state.participants?.participants?.[behindIdx]?.name || (carBehindLap ? `P${myPos + 1}` : null);
  const inRange = (gapAheadMs > 0 && gapAheadMs < 1200) || (gapBehindMs != null && gapBehindMs < 1000);
  if (!inRange) { proxBar.classList.add('hidden'); return; }
  proxBar.classList.remove('hidden');
  const aheadEl = el('prox-ahead');
  const behindEl = el('prox-behind');
  if (aheadEl) {
    if (aheadName && gapAheadMs > 0 && gapAheadMs < 1200) {
      aheadEl.textContent = `${aheadName}  +${(gapAheadMs / 1000).toFixed(2)}s`;
      aheadEl.className = 'prox-rival prox-attack';
    } else {
      aheadEl.textContent = '';
      aheadEl.className = 'prox-rival';
    }
  }
  if (behindEl) {
    if (behindName && gapBehindMs != null && gapBehindMs < 1000) {
      behindEl.textContent = `${behindName}  -${(gapBehindMs / 1000).toFixed(2)}s`;
      behindEl.className = 'prox-rival prox-defend';
    } else {
      behindEl.textContent = '';
      behindEl.className = 'prox-rival';
    }
  }
}
//  Radio Config page
function buildRadioConfig() {
  const cats = Object.entries(RADIO_CATEGORIES);
  const categoriesHTML = cats.map(([key, cat]) => {
    const isEnabled = radio.config[key]?.enabled !== false;
    const isAiEnabled = radio.config[key]?.aiEnabled === true;
    const sitCount = cat.situations.length;
    const situationsHTML = cat.situations.map(sit => {
      const label = sit.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const sitEnabled = radio.config[key]?.situations?.[sit] !== false;
      return `<label class="radio-sit-item">
        <input type="checkbox" class="radio-sit-cb" data-cat="${key}" data-sit="${sit}" ${sitEnabled ? 'checked' : ''}>
        <span class="radio-sit-label">${label}</span>
      </label>`;
    }).join('');
    return `
      <div class="radio-cat-card ${isEnabled ? '' : 'disabled'}" data-cat="${key}">
        <div class="radio-cat-header">
          <label class="radio-cat-toggle">
            <input type="checkbox" class="radio-cat-cb" data-cat="${key}" ${isEnabled ? 'checked' : ''}>
            <span class="radio-cat-icon">${cat.icon}</span>
            <span class="radio-cat-title">${cat.label}</span>
            <span class="radio-cat-count">${sitCount} situations</span>
          </label>
          <label class="radio-ai-toggle" title="Use GPT Realtime AI voice for this category (requires GPT mode + credits)">
            <input type="checkbox" class="radio-ai-cb" data-cat="${key}" ${isAiEnabled ? 'checked' : ''}>
            <span class="radio-ai-label">AI</span>
          </label>
          <button
            type="button"
            class="radio-cat-expand"
            data-cat="${key}"
            aria-expanded="false"
            aria-controls="radio-sits-${key}"
            aria-label="Show situations"
          ></button>
        </div>
        <div class="radio-cat-desc">${cat.description}</div>
        <div class="radio-cat-situations hidden" id="radio-sits-${key}">
          ${situationsHTML}
        </div>
      </div>`;
  }).join('');
  const activeSits = countAiEnabledSituations(radio.config);
  el('page-radio').innerHTML = `
    <div class="radio-config-page">
      <div class="radio-config-header">
        <h2>Radio Configuration</h2>
        <p class="radio-config-subtitle">Select which situations the race engineer will speak about. Toggle categories on/off, or expand to control individual situations.
          Enable <strong>AI</strong> on categories to use GPT Realtime voice (requires GPT mode + race credits).</p>
        <div class="radio-config-actions">
          <button id="radio-enable-all" class="radio-action-btn">Enable All</button>
          <button id="radio-disable-all" class="radio-action-btn secondary">Disable All</button>
          <button id="radio-ai-enable-all" class="radio-action-btn" style="background:rgba(100,120,255,0.15);border-color:#6478ff55;color:#9ab">AI: All</button>
          <button id="radio-ai-disable-all" class="radio-action-btn secondary">AI: None</button>
          <label class="context-toggle" style="margin-left:auto">
            <input type="checkbox" id="radio-master-toggle" ${radio.enabled ? 'checked' : ''}>
            Master Radio On/Off
          </label>
        </div>
        <div class="radio-ai-info" id="radio-ai-info">
          GPT AI enabled on <strong id="radio-ai-count">${activeSits}</strong> situations.
          More situations = higher credit usage per race.
          <a href="#" id="radio-open-purchase" style="color:var(--accent)">Buy credits →</a>
        </div>
      </div>
      <div class="radio-cat-grid">
        ${categoriesHTML}
      </div>
      <div class="radio-config-footer">
        <div class="radio-config-info">
          <strong>How it works:</strong> In <em>Classic</em> mode, all messages use edge-tts voice (free).
          In <em>GPT Realtime</em> mode, categories marked <strong>AI</strong> use GPT-4o voice — realistic, tactical, dynamic.
          Categories without AI still use edge-tts.
        </div>
      </div>
    </div>
  `;
  function updateAiCount() {
    const n = countAiEnabledSituations(radio.config);
    const el2 = el('radio-ai-count');
    if (el2) el2.textContent = n;
  }
  // Master toggle
  el('radio-master-toggle').addEventListener('change', (e) => {
    radio.enabled = e.target.checked;
    const engineerToggle = el('radio-enabled');
    if (engineerToggle) engineerToggle.checked = e.target.checked;
  });
  // Enable/disable all
  el('radio-enable-all').addEventListener('click', () => {
    for (const key of Object.keys(RADIO_CATEGORIES)) {
      radio.config[key].enabled = true;
      for (const sit of RADIO_CATEGORIES[key].situations) {
        radio.config[key].situations[sit] = true;
      }
    }
    buildRadioConfig();
  });
  el('radio-disable-all').addEventListener('click', () => {
    for (const key of Object.keys(RADIO_CATEGORIES)) {
      radio.config[key].enabled = false;
    }
    buildRadioConfig();
  });
  // AI enable/disable all
  el('radio-ai-enable-all').addEventListener('click', () => {
    for (const key of Object.keys(RADIO_CATEGORIES)) {
      radio.config[key].aiEnabled = true;
    }
    buildRadioConfig();
  });
  el('radio-ai-disable-all').addEventListener('click', () => {
    for (const key of Object.keys(RADIO_CATEGORIES)) {
      radio.config[key].aiEnabled = false;
    }
    buildRadioConfig();
  });
  // Open purchase modal
  el('radio-open-purchase')?.addEventListener('click', (e) => {
    e.preventDefault();
    showPurchaseModal();
  });
  // Category toggles
  el('page-radio').querySelectorAll('.radio-cat-cb').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const cat = e.target.dataset.cat;
      radio.config[cat].enabled = e.target.checked;
      const card = e.target.closest('.radio-cat-card');
      card.classList.toggle('disabled', !e.target.checked);
    });
  });
  // AI toggles per category
  el('page-radio').querySelectorAll('.radio-ai-cb').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const cat = e.target.dataset.cat;
      radio.config[cat].aiEnabled = e.target.checked;
      updateAiCount();
    });
  });
  // Situation toggles
  el('page-radio').querySelectorAll('.radio-sit-cb').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const cat = e.target.dataset.cat;
      const sit = e.target.dataset.sit;
      radio.config[cat].situations[sit] = e.target.checked;
    });
  });
  // Expand/collapse
  el('page-radio').querySelectorAll('.radio-cat-expand').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      const sitsEl = el(`radio-sits-${cat}`);
      const isExpanded = sitsEl.classList.toggle('hidden') === false;
      btn.classList.toggle('expanded', isExpanded);
      btn.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
      btn.setAttribute('aria-label', isExpanded ? 'Hide situations' : 'Show situations');
    });
  });
}
//  Settings page 
function buildSettings() {
  el('page-settings').innerHTML = `
    <div style="max-width:540px">
      <div class="settings-section">
        <h3>Telemetry Connection</h3>
        <div class="panel">
          <div class="panel-body">
            <div class="settings-field">
              <label>Listen Port (This Window)</label>
              <input type="number" class="settings-input" id="listen-port-input" min="1" max="65535" value="${listenPort}">
            </div>
            <div class="stat-row"><span class="stat-label">Active port</span><span class="stat-value mono" id="set-listen-port">${listenPort}</span></div>
            <div class="stat-row"><span class="stat-label">Protocol</span><span class="stat-value">UDP</span></div>
            <div class="stat-row"><span class="stat-label">Status</span><span class="stat-value" id="set-conn-status">Offline</span></div>
            <p class="settings-note" style="margin-top:10px">
              Set the game's UDP Port to the same value as this window. Example: main window on <strong>20777</strong>, popped-out window on <strong>20778</strong>.
            </p>
          </div>
        </div>
      </div>
      <div class="settings-section">
        <h3>Voice / Text-to-Speech</h3>
        <div class="panel">
          <div class="panel-body">
            <div class="settings-field">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="tts-enabled"> Enable Engineer Voice (TTS)
              </label>
            </div>
            <div class="settings-field" style="margin-top:10px">
              <label>Voice</label>
              <select class="settings-input" id="tts-voice-select">
                ${TTS_VOICES.map(v => `<option value="${v.id}">${v.label}</option>`).join('')}
              </select>
            </div>
            <div class="settings-field">
              <label>Rate <span id="tts-rate-val">1.0</span>x</label>
              <input type="range" id="tts-rate" min="0.5" max="2" step="0.1" value="1.0" style="width:100%">
            </div>
            <button class="settings-save-btn" id="tts-test" style="margin-top:6px">Test Voice</button>
          </div>
        </div>
      </div>
      <div class="settings-section">
        <h3>Track Override</h3>
        <div class="panel">
          <div class="panel-body">
            <p class="settings-note" style="margin-bottom:10px">If the game sends an unrecognized track ID, you can manually select the circuit here.</p>
            <div class="stat-row"><span class="stat-label">Detected Track ID</span><span class="stat-value mono" id="set-detected-track"></span></div>
            <div class="settings-field" style="margin-top:10px">
              <label>Manual Track</label>
              <select class="settings-input" id="manual-track-select">
                <option value="-1">Auto-detect (use game data)</option>
              </select>
            </div>
          </div>
        </div>
      </div>
      <div class="settings-section">
        <h3>GPT Realtime Voice — Mode</h3>
        <div class="panel"><div class="panel-body">
          <div class="hybrid-mode-cards">
            <div class="hybrid-card ${license.byokMode ? '' : 'hybrid-card-active'}" id="hybrid-sub-card">
              <div class="hybrid-card-title">Subscription</div>
              <div class="hybrid-card-desc">Buy race packs — we handle the OpenAI key. No setup needed.</div>
              <div class="hybrid-card-stats">
                <span>Race credits: <strong id="set-race-credits">${license.devMode ? '∞' : license.racesRemaining}</strong></span>
                <span>Qualifying: <strong id="set-qual-credits">${license.devMode ? '∞' : license.qualifyingRemaining}</strong></span>
                ${license.devMode ? '<span class="dev-badge">DEV</span>' : ''}
              </div>
              <button class="settings-save-btn" id="set-buy-btn" style="background:var(--accent);margin-top:10px;width:100%">Buy Race Packs</button>
            </div>
            <div class="hybrid-card ${license.byokMode ? 'hybrid-card-active' : ''}" id="hybrid-byok-card">
              <div class="hybrid-card-title">BYOK — Use Your Own Key</div>
              <div class="hybrid-card-desc">Enter your own OpenAI key. You pay OpenAI directly. Free to use in the app.</div>
              <div class="settings-field" style="margin-top:8px">
                <input type="password" class="settings-input" id="openai-key-input" placeholder="sk-..." style="font-size:11px"/>
              </div>
              <div style="display:flex;gap:6px;margin-top:8px">
                <button class="settings-save-btn" id="save-openai-key" style="flex:1">Save &amp; Enable BYOK</button>
                ${license.byokMode ? '<button class="settings-save-btn" id="disable-byok-btn" style="flex:1">Disable BYOK</button>' : ''}
              </div>
              ${license.byokMode ? '<div class="byok-active-badge" style="margin-top:8px">BYOK Active</div>' : ''}
            </div>
          </div>
          <div class="stat-row" style="margin-top:10px"><span class="stat-label">Current Mode</span><span class="stat-value mono" id="set-license-mode">${license.byokMode ? 'BYOK (your key)' : license.devMode ? 'Developer (free)' : 'Subscription'}</span></div>
          <div class="stat-row"><span class="stat-label">Key Status</span><span class="stat-value" id="set-license-status">${getLicenseStatusLabel()}</span></div>
          <div class="stat-row"><span class="stat-label">Exhausted At</span><span class="stat-value mono" id="set-license-exhausted-at">${license.licenseExhaustedAt ? formatPaymentEventTime(license.licenseExhaustedAt) : '-'}</span></div>
          <div class="stat-row"><span class="stat-label">Last Issued Key</span><span class="stat-value mono" id="set-last-license-key">${license.lastIssuedLicenseKey || license.licenseKey || '-'}</span></div>
        </div></div>
      </div>
      <div class="settings-section">
        <h3>Classic AI (Claude Opus) — API Key</h3>
        <div class="panel"><div class="panel-body">
          <div class="settings-field">
            <label>Anthropic API Key</label>
            <input type="password" class="settings-input" id="api-key-input" placeholder="sk-ant-..." />
          </div>
          <button class="settings-save-btn" id="save-api-key" style="margin-top:8px">Apply Key</button>
          <p class="settings-note" style="margin-top:6px">Used for Classic AI mode (non-realtime). Get a key at console.anthropic.com.</p>
        </div></div>
      </div>
      <div class="settings-section">
        <h3>Activate License Key</h3>
        <div class="panel"><div class="panel-body">
          <p class="settings-note" style="margin-bottom:10px">If you've purchased a race pack and need to activate it on a new machine or after reinstalling, enter your license key (RE-XXXX-XXXX-XXXX) below.</p>
          ${(license.lastIssuedLicenseKey || license.licenseKey) ? `<div class="stat-row"><span class="stat-label">Last Key</span><span class="stat-value mono" style="font-size:11px;letter-spacing:1px">${license.lastIssuedLicenseKey || license.licenseKey}</span></div>` : ''}
          <div class="settings-field" style="margin-top:8px">
            <label>License Key</label>
            <input type="text" class="settings-input" id="license-key-input" placeholder="RE-XXXX-XXXX-XXXX" maxlength="14" style="letter-spacing:1px;text-transform:uppercase"/>
          </div>
          <div style="display:flex;gap:6px;margin-top:8px">
            <button class="settings-save-btn" id="activate-key-btn" style="flex:1">Activate Key</button>
            ${license.licenseKey ? '<button class="settings-save-btn" id="deactivate-key-btn" style="flex:1;background:#c0392b">Deactivate This Machine</button>' : ''}
          </div>
          <div id="activate-key-result" style="margin-top:8px;font-size:12px"></div>
        </div></div>
      </div>
      <div class="settings-section">
        <h3>Payment Status & Logs</h3>
        <div class="panel"><div class="panel-body">
          <div class="stat-row">
            <span class="stat-label">Recent Events</span>
            <span class="stat-value" id="set-payment-log-empty">${Array.isArray(license.paymentEvents) && license.paymentEvents.length > 0 ? '' : 'No payment events yet.'}</span>
          </div>
          <div id="set-payment-log-list" class="payment-log-list"></div>
        </div></div>
      </div>
      <div class="settings-section">
        <div style="display:flex;gap:8px;align-items:center">
          <button class="settings-save-btn" id="save-all-settings" style="background:var(--accent)">Save All Settings</button>
        </div>
        <p class="settings-note" style="margin-top:6px">Saves API keys, TTS config, radio config and AI mode to disk.</p>
      </div>
    </div>
  `;
  el('save-api-key').addEventListener('click', () => {
    const key = el('api-key-input').value.trim();
    if (key) {
      savedApiKey = key;
      window.raceEngineer.setApiKey(key);
      el('save-api-key').textContent = ' Applied';
      setTimeout(() => { el('save-api-key').textContent = 'Apply Claude Key'; }, 2000);
    }
  });
  el('save-openai-key')?.addEventListener('click', async () => {
    const key = el('openai-key-input')?.value.trim();
    if (!key || !key.startsWith('sk-')) {
      el('save-openai-key').textContent = 'Invalid key';
      setTimeout(() => { el('save-openai-key').textContent = 'Save & Enable BYOK'; }, 2000);
      return;
    }
    gptRealtime.openaiApiKey = key;
    const result = await window.raceEngineer.setBYOKMode({ enabled: true });
    if (result.success) {
      Object.assign(license, result.license);
      el('save-openai-key').textContent = '✓ BYOK Enabled';
      const modeEl = el('set-license-mode');
      if (modeEl) modeEl.textContent = 'BYOK (your key)';
      setTimeout(() => { buildSettings(); }, 1500); // re-render to show BYOK active state
    }
  });
  el('disable-byok-btn')?.addEventListener('click', async () => {
    const result = await window.raceEngineer.setBYOKMode({ enabled: false });
    if (result.success) {
      Object.assign(license, result.license);
      buildSettings();
    }
  });
  el('set-buy-btn')?.addEventListener('click', () => showPurchaseModal());
  el('activate-key-btn')?.addEventListener('click', async () => {
    const keyInput = el('license-key-input');
    const resultEl = el('activate-key-result');
    const key = keyInput?.value.trim().toUpperCase();
    if (!key || !key.startsWith('RE-')) {
      resultEl.style.color = 'var(--danger)';
      resultEl.textContent = 'Enter a valid key (RE-XXXX-XXXX-XXXX)';
      return;
    }
    el('activate-key-btn').textContent = 'Checking...';
    el('activate-key-btn').disabled = true;
    const result = await window.raceEngineer.activateLicenseKey({ licenseKey: key });
    el('activate-key-btn').textContent = 'Activate Key';
    el('activate-key-btn').disabled = false;
    if (result.error) {
      resultEl.style.color = 'var(--danger)';
      resultEl.textContent = result.error;
    } else {
      Object.assign(license, result.license);
      resultEl.style.color = 'var(--green)';
      resultEl.textContent = `✓ Activated! +${result.packCount} ${result.packType} credit${result.packCount !== 1 ? 's' : ''} added.`;
      setTimeout(() => buildSettings(), 2000);
    }
  });
  el('deactivate-key-btn')?.addEventListener('click', async () => {
    const resultEl = el('activate-key-result');
    if (!confirm('Deactivate this machine? Your license slot will be freed so you can activate on another machine. Local credits will be cleared.')) return;
    el('deactivate-key-btn').textContent = 'Deactivating...';
    el('deactivate-key-btn').disabled = true;
    const result = await window.raceEngineer.deactivateLicenseKey();
    if (result.error) {
      resultEl.style.color = 'var(--danger)';
      resultEl.textContent = result.error;
      el('deactivate-key-btn').textContent = 'Deactivate This Machine';
      el('deactivate-key-btn').disabled = false;
    } else {
      Object.assign(license, result.license || { licenseKey: null, machineId: null });
      resultEl.style.color = 'var(--green)';
      resultEl.textContent = '✓ Deactivated. You can now activate on another machine.';
      setTimeout(() => buildSettings(), 2000);
    }
  });
  el('save-all-settings').addEventListener('click', () => {
    const key = el('api-key-input').value.trim();
    if (key) window.raceEngineer.setApiKey(key);
    const openaiKey = el('openai-key-input')?.value.trim();
    if (openaiKey) gptRealtime.openaiApiKey = openaiKey;
    window.raceEngineer.saveSettings({
      apiKey: key || undefined,
      openaiApiKey: openaiKey || undefined,
      tts: { enabled: tts.enabled, voice: tts.voice, rate: tts.rate },
      radioConfig: radio.config,
      telemetryPort: listenPort,
      gptVoice: gptRealtime.voice,
      aiMode: gptRealtime.aiMode,
    });
    el('save-all-settings').textContent = ' Saved';
    setTimeout(() => { el('save-all-settings').textContent = 'Save All Settings'; }, 2000);
  });
  // Populate track selector
  const portInput = el('listen-port-input');
  const activePortEl = el('set-listen-port');
  const setConnEl = el('set-conn-status');
  if (setConnEl) setConnEl.textContent = state.connected ? 'Connected' : 'Offline';
  if (portInput) {
    portInput.value = String(listenPort);
    portInput.addEventListener('change', () => {
      listenPort = normalizeListenPort(portInput.value);
      portInput.value = String(listenPort);
      if (activePortEl) activePortEl.textContent = String(listenPort);
      const label = el('connection-label');
      if (label && !state.connected) label.textContent = `Offline - UDP :${listenPort}`;
    });
  }
  // Populate track selector
  const trackSelect = el('manual-track-select');
  if (trackSelect) {
    const sorted = Object.entries(TRACK_NAMES).sort((a, b) => a[1].localeCompare(b[1]));
    for (const [id, name] of sorted) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = `${name} (ID ${id})`;
      trackSelect.appendChild(opt);
    }
    trackSelect.addEventListener('change', () => {
      window.raceEngineer.setManualTrack(parseInt(trackSelect.value));
    });
  }
  // Pre-populate saved API keys
  const apiInput = el('api-key-input');
  if (apiInput && savedApiKey) apiInput.value = savedApiKey;
  // openai-key-input is in the hybrid card, pre-populate if BYOK key exists
  const openaiInput = el('openai-key-input');
  if (openaiInput && gptRealtime.openaiApiKey) openaiInput.value = gptRealtime.openaiApiKey;
  // TTS controls
  const ttsEnabledEl = el('tts-enabled');
  const ttsVoiceEl   = el('tts-voice-select');
  const ttsRateEl    = el('tts-rate');
  if (ttsEnabledEl) {
    ttsEnabledEl.checked = tts.enabled;
    ttsEnabledEl.addEventListener('change', () => { tts.enabled = ttsEnabledEl.checked; });
  }
  if (ttsVoiceEl) {
    ttsVoiceEl.value = tts.voice;
    ttsVoiceEl.addEventListener('change', () => { tts.voice = ttsVoiceEl.value; });
  }
  if (ttsRateEl) {
    ttsRateEl.value = tts.rate;
    ttsRateEl.addEventListener('input', () => {
      tts.rate = parseFloat(ttsRateEl.value);
      el('tts-rate-val').textContent = tts.rate.toFixed(1);
    });
  }
  el('tts-test')?.addEventListener('click', () => {
    const was = tts.enabled;
    tts.enabled = true;
    ttsSpeak('Box this lap, box this lap. Tyres are ready.');
    tts.enabled = was;
  });
  refreshLicenseBadges();
}
//  Live update loop 
function tick() {
  const activePage = document.querySelector('.page.active')?.id;
  updateTopBar();
  if (activePage === 'page-dashboard') updateDashboard();
  if (activePage === 'page-timing')   updateTiming();
  if (activePage === 'page-trackmap') updateTrackMap();
  if (activePage === 'page-vehicle')  updateVehicle();
  if (activePage === 'page-session')  updateSession();
  if (activePage === 'page-engineer') updateEngineerProximity();
  // Auto-radio proximity check runs regardless of active page
  checkAutoRadio();
  // GPT Realtime: push telemetry periodically when connected + AI mode active + session allowed
  if (gptRealtime.aiMode === 'gpt' && gptRealtime.connected && TTS_PRIMARY_WINDOW && gptAllowedForSession().allowed) {
    gptPushTelemetry();
  }
  requestAnimationFrame(tick);
}
//  Init 
async function init() {
  // Load lookups from main process
  const lookups = await window.raceEngineer.getLookups();
  TEAM_COLORS = lookups.TEAM_COLORS;
  TYRE_COMPOUNDS = lookups.TYRE_COMPOUNDS;
  ACTUAL_COMPOUNDS = lookups.ACTUAL_COMPOUNDS || {};
  TRACK_NAMES = lookups.TRACK_NAMES;
  // Restore persisted settings
  const saved = await window.raceEngineer.loadSettings();
  if (saved.apiKey) { savedApiKey = saved.apiKey; window.raceEngineer.setApiKey(saved.apiKey); }
  if (saved.tts) {
    if (saved.tts.enabled  != null) tts.enabled = saved.tts.enabled;
    if (saved.tts.voice)             tts.voice   = saved.tts.voice;
    if (saved.tts.rate     != null)  tts.rate    = saved.tts.rate;
  }
  if (saved.telemetryPort != null) {
    listenPort = normalizeListenPort(saved.telemetryPort);
  }
  if (saved.radioConfig) {
    // Merge saved config into default (new categories added after save still get defaults)
    for (const [cat, val] of Object.entries(saved.radioConfig)) {
      if (radio.config[cat] != null) radio.config[cat] = val;
    }
  }
  if (saved.openaiApiKey) gptRealtime.openaiApiKey = saved.openaiApiKey;
  if (saved.gptVoice) gptRealtime.voice = saved.gptVoice;
  if (saved.aiMode) gptRealtime.aiMode = saved.aiMode;
  // Load license
  const lic = await window.raceEngineer.getLicense();
  Object.assign(license, lic);
  const connLabel = el('connection-label');
  if (connLabel) connLabel.textContent = `Offline - UDP :${listenPort}`;
  // Detached window mode  hide sidebar, show only one page
  if (DETACH_PAGE) {
    document.body.classList.add('detached');
    // Build only the required page
    const builders = {
      dashboard: buildDashboard,
      timing: buildTiming,
      trackmap: buildTrackMap,
      vehicle: buildVehicle,
      session: buildSession,
      engineer: buildEngineer,
      radio: buildRadioConfig,
      settings: buildSettings,
    };
    if (builders[DETACH_PAGE]) builders[DETACH_PAGE]();
    navigate(DETACH_PAGE);
  } else {
    // Build all pages (main window)
    buildDashboard();
    buildTiming();
    buildTrackMap();
    buildVehicle();
    buildSession();
    buildEngineer();
    buildRadioConfig();
    buildSettings();
  }
  refreshLicenseBadges();
  // Nav routing
  document.querySelectorAll('.nav-item').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(a.dataset.page);
    });
  });
  // Start/Stop button
  const startBtn = el('btn-start');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (state.connected) {
        window.raceEngineer.stopTelemetry();
      } else {
        window.raceEngineer.startTelemetry(listenPort);
      }
    });
  }
  // IPC data listeners
  window.raceEngineer.onTelemetryStarted((data) => {
    state.connected = true;
    listenPort = normalizeListenPort(data?.port ?? listenPort);
    const dot = el('connection-dot');
    if (dot) dot.className = 'conn-dot online';
    const label = el('connection-label');
    if (label) label.textContent = `Live - UDP :${listenPort}`;
    const btn = el('btn-start');
    if (btn) {
      btn.textContent = ' Stop';
      btn.className = 'start-btn listening';
    }
    const setConn = el('set-conn-status');
    if (setConn) setConn.textContent = 'Connected';
    const setPort = el('set-listen-port');
    if (setPort) setPort.textContent = String(listenPort);
    const input = el('listen-port-input');
    if (input) input.value = String(listenPort);
  });
  window.raceEngineer.onTelemetryStopped(() => {
    state.connected = false;
    const dot = el('connection-dot');
    if (dot) dot.className = 'conn-dot offline';
    const label = el('connection-label');
    if (label) label.textContent = `Offline - UDP :${listenPort}`;
    const btn = el('btn-start');
    if (btn) {
      btn.textContent = ' Start Listening';
      btn.className = 'start-btn';
    }
    const setConn = el('set-conn-status');
    if (setConn) setConn.textContent = 'Disconnected';
  });
  window.raceEngineer.onTelemetryError((data) => {
    state.connected = false;
    const dot = el('connection-dot');
    if (dot) dot.className = 'conn-dot offline';
    const label = el('connection-label');
    if (label) label.textContent = `Error - UDP :${listenPort}`;
    const btn = el('btn-start');
    if (btn) {
      btn.textContent = ' Start Listening';
      btn.className = 'start-btn';
    }
    const setConn = el('set-conn-status');
    if (setConn) setConn.textContent = `Error: ${data.message}`;
  });
  window.raceEngineer.onSessionUpdate((d) => {
    state.session = d;
    state.playerCarIndex = d.playerCarIndex ?? 0;
    const dtEl = el('set-detected-track');
    if (dtEl) dtEl.textContent = `${d.trackId}  ${d.trackName || 'Unknown'}`;
  });
  window.raceEngineer.onLapUpdate((d) => { state.lapData = d.lapData; state.playerCarIndex = d.playerCarIndex ?? 0; });
  window.raceEngineer.onTelemetryUpdate((d) => { state.telemetry = d; });
  window.raceEngineer.onStatusUpdate((d) => { state.status = d; });
  window.raceEngineer.onDamageUpdate((d) => { state.damage = d; });
  window.raceEngineer.onParticipantsUpdate((d) => { state.participants = d; });
  window.raceEngineer.onAllStatusUpdate((d) => { state.allCarStatus = d; });
  window.raceEngineer.onAllTelemetryUpdate((d) => { state.allCarTelemetry = d; });
  window.raceEngineer.onBestLapsUpdate((d) => { state.bestLapTimes = d; });
  window.raceEngineer.onFastestLapUpdate((d) => {
    state.fastestLapCar = d.vehicleIdx;
    state.fastestLapMs  = d.lapTimeMs;
  });
  // Restore best laps and fastest lap from state snapshot (for new windows)
  const snap = await window.raceEngineer.getStateSnapshot();
  if (snap.bestLapTimes) state.bestLapTimes = snap.bestLapTimes;
  if (snap.fastestLap) {
    state.fastestLapCar = snap.fastestLap.vehicleIdx;
    state.fastestLapMs  = snap.fastestLap.lapTimeMs;
  }
  // GPT Realtime IPC listeners (audio + transcript + status)
  window.raceEngineer.onGptAudioChunk((d) => {
    if (gptRealtime.aiMode === 'gpt' && TTS_PRIMARY_WINDOW) {
      gptPlayChunk(d.chunk);
    }
  });
  window.raceEngineer.onGptTranscript((d) => {
    if (!d.done) return; // only show completed transcripts
    gptRealtime.transcript = d.text;
    // Add to radio feed as an AI message
    appendRadioCard('ai-gpt', 'medium', d.text, false);
  });
  window.raceEngineer.onGptStatus((d) => {
    gptRealtime.status = d.status;
    gptRealtime.connected = d.status === 'connected';
    updateGptStatusUI();
  });
  // License updates from main process (after purchases / BYOK toggle)
  window.raceEngineer.onLicenseUpdate((lic) => {
    Object.assign(license, lic);
    refreshLicenseBadges();
  });
  // PayPal redirect — user completed (or cancelled) payment in browser
  window.raceEngineer.onStripeReturn(async (data) => {
    if (!data.success) {
      appendRadioCard('system', 'low', `${getPaymentProviderLabel(data.provider || paypalCheckout.pendingOrder?.provider)} payment cancelled.`, true);
      setPurchaseStatus('Payment cancelled.');
      paypalCheckout.pendingOrder = null;
      stopPayPalPolling();
      return;
    }
    const raceLaps = state.session?.totalLaps || 58;
    const activeSits = countAiEnabledSituations(radio.config);
    paypalCheckout.pendingOrder = {
      orderId: data.sessionId,
      provider: data.provider || paypalCheckout.pendingOrder?.provider || 'paypal',
      packId: data.packId || paypalCheckout.pendingOrder?.packId || 'race_1',
      raceLaps,
      racePercent: paypalCheckout.pendingOrder?.racePercent || 100,
      activeSituations: activeSits,
      currencyCode: paypalCheckout.pendingOrder?.currencyCode || 'USD',
      startedAt: paypalCheckout.pendingOrder?.startedAt || Date.now(),
    };
    const verifyBtn = el('modal-verify-btn');
    if (verifyBtn) verifyBtn.style.display = 'block';
    setPurchaseStatus(`${getPaymentProviderLabel(paypalCheckout.pendingOrder.provider)} callback received. Verifying purchase...`);
    await verifyPendingPayPalOrder({ silentPending: false });
  });
  // Start update loop
  requestAnimationFrame(tick);
}
init();

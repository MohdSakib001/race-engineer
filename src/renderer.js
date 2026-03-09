import './index.css';
import CIRCUITS from './circuits.js';
import { RADIO_CATEGORIES, getDefaultRadioConfig, RADIO_MESSAGES, countAiEnabledSituations } from './radio-situations.js';
import f1CarSvg from './assets/f1-car.svg?raw';
import { createDashboardPage } from './renderer/pages/dashboard.js';
import { createTimingPage } from './renderer/pages/timing.js';
import { createTrackMapPage } from './renderer/pages/trackmap.js';
import { createVehiclePage } from './renderer/pages/vehicle.js';
import { createSessionPage } from './renderer/pages/session.js';
import { createEngineerPage } from './renderer/pages/engineer.js';
import { createRadioConfigPage } from './renderer/pages/radio-config.js';
import { createSettingsPage } from './renderer/pages/settings.js';
import { createEngineerAudioFeature } from './renderer/features/engineer-audio/index.js';
import { createPaymentFeature } from './renderer/features/payment/index.js';
import { createTimingExportFeature } from './renderer/features/timing-export/index.js';
import { createAutoRadioFeature } from './renderer/features/auto-radio/index.js';
import { createTelemetryUiFeature } from './renderer/telemetry-ui.js';
import { createDetachContext } from './renderer/detach.js';
import { DEFAULT_LISTEN_PORT, normalizeListenPort, createAppState, createLicenseState, createGptRealtimeState, createPayPalCheckoutState, createRadioState, normalizeRadioConfig, TTS_VOICES, createTtsState } from './renderer/runtime-state.js';
import { escapeHtml as escapeHtmlUtil, fmt as fmtUtil, fmtSector as fmtSectorUtil, computeSector3Time as computeSector3TimeUtil, fmtCountdown as fmtCountdownUtil, clamp as clampUtil, csvEscape as csvEscapeUtil, safeFilePart as safeFilePartUtil } from './renderer/shared/formatting.js';
import { formatGearValue as formatGearValueUtil, tyreClass as tyreClassUtil, dmgClass as dmgClassUtil, weatherIcon as weatherIconUtil, safetyCarLabel as safetyCarLabelUtil } from './renderer/shared/display.js';
import { getRaceStatusMeta as getRaceStatusMetaUtil, renderRaceStatusBadge as renderRaceStatusBadgeUtil, renderControlBadge as renderControlBadgeUtil, getClassificationCars as getClassificationCarsUtil, getTrackMapVisibleCars as getTrackMapVisibleCarsUtil } from './renderer/shared/telemetry-view.js';
import { isRaceSession as isRaceSessionUtil, getPlayerLap as getPlayerLapUtil, isPlayerRaceFinished as isPlayerRaceFinishedUtil, getRemainingRaceDistanceLaps as getRemainingRaceDistanceLapsUtil, getTrackAheadGapMeters as getTrackAheadGapMetersUtil, getTrackProximityMeters as getTrackProximityMetersUtil, isTrackLikeSurface as isTrackLikeSurfaceUtil, isTelemetryOffTrack as isTelemetryOffTrackUtil } from './renderer/shared/race-helpers.js';
//  Lookups (loaded from main) 
let TEAM_COLORS = {};
let TYRE_COMPOUNDS = {};
let ACTUAL_COMPOUNDS = {};
let TRACK_NAMES = {};
let savedApiKey = '';  // persisted across settings page rebuilds
const { DETACH_PAGE, TTS_PRIMARY_WINDOW, setDetachedWindowTitle } = createDetachContext(
  window.location.search,
  window.raceEngineer,
);
//  App state 
const state = createAppState();
let listenPort = DEFAULT_LISTEN_PORT;
//  License & AI Engineer state
const license = createLicenseState();
const gptRealtime = createGptRealtimeState();
const paypalCheckout = createPayPalCheckoutState();
//  Auto-radio state
const radio = createRadioState(getDefaultRadioConfig);
//  TTS  edge-tts-universal (Microsoft Edge neural voices, via main process) 
const tts = createTtsState();
function ttsSpeak(text) { return engineerAudioFeature.ttsSpeak(text); }
function isRaceSession(session = state.session) { return isRaceSessionUtil(session); }
function getPlayerLap() { return getPlayerLapUtil(state); }
function isPlayerRaceFinished(session = state.session, lap = getPlayerLap()) { return isPlayerRaceFinishedUtil(state, session, lap); }
function getRemainingRaceDistanceLaps(session = state.session, lap = getPlayerLap()) { return getRemainingRaceDistanceLapsUtil(session, lap); }
function getTrackAheadGapMeters(fromLap, toLap, session = state.session) { return getTrackAheadGapMetersUtil(fromLap, toLap, session); }
function getTrackProximityMeters(lapA, lapB, session = state.session) { return getTrackProximityMetersUtil(lapA, lapB, session); }
function isTrackLikeSurface(surface) { return isTrackLikeSurfaceUtil(surface); }
function isTelemetryOffTrack(telemetryEntry) { return isTelemetryOffTrackUtil(telemetryEntry); }
function clearEngineerPlayback() { return engineerAudioFeature.clearEngineerPlayback(); }
function handleFinishedRaceRadioState() { return engineerAudioFeature.handleFinishedRaceRadioState(); }
function getCurrentSessionType() { return engineerAudioFeature.getCurrentSessionType(); }
function gptAllowedForSession() { return engineerAudioFeature.gptAllowedForSession(); }
async function gptConnect() { return engineerAudioFeature.gptConnect(); }
async function gptDisconnect() { return engineerAudioFeature.gptDisconnect(); }
function updateGptStatusUI() { return engineerAudioFeature.updateGptStatusUI(); }
function gptPushTelemetry() { return engineerAudioFeature.gptPushTelemetry(); }
function setPurchaseStatus(message) { return paymentFeature.setPurchaseStatus(message); }
function escapeHtml(value) { return escapeHtmlUtil(value); }
function formatPaymentEventTime(iso) { return paymentFeature.formatPaymentEventTime(iso); }
function getLicenseStatusLabel() { return paymentFeature.getLicenseStatusLabel(); }
function getLicenseModeLabel() { return paymentFeature.getLicenseModeLabel(); }
function getPaymentProviderLabel(providerId) { return paymentFeature.getPaymentProviderLabel(providerId); }
function refreshLicenseBadges() { return paymentFeature.refreshLicenseBadges(); }
function refreshPurchaseCredits() { return paymentFeature.refreshPurchaseCredits(); }
function stopPayPalPolling() { return paymentFeature.stopPayPalPolling(); }
function startPayPalPolling() { return paymentFeature.startPayPalPolling(); }
async function verifyPendingPayPalOrder(options = {}) { return paymentFeature.verifyPendingPayPalOrder(options); }
function showPurchaseModal() { return paymentFeature.showPurchaseModal(); }
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
function fmt(ms) { return fmtUtil(ms); }
function fmtSector(ms) { return fmtSectorUtil(ms); }
function computeSector3Time(lap) { return computeSector3TimeUtil(lap); }
function getRaceStatusMeta(car) { return getRaceStatusMetaUtil(car); }
function renderRaceStatusBadge(car) { return renderRaceStatusBadgeUtil(car); }
function renderControlBadge(participant, isPlayer) { return renderControlBadgeUtil(participant, isPlayer); }
function getClassificationCars(lapData) { return getClassificationCarsUtil(lapData); }
function getTrackMapVisibleCars(lapData) { return getTrackMapVisibleCarsUtil(lapData); }
function controlLabel(participant, isPlayer) {
  if (isPlayer) return 'Player';
  if (!participant) return '';
  return participant.aiControlled === 1 ? 'AI' : 'Human';
}
function raceStatusLabel(car) {
  return getRaceStatusMeta(car)?.title || (car?.resultStatus === 2 ? 'Active' : '');
}
function tyreCompoundLabel(statusEntry) {
  if (!statusEntry) return '';
  return TYRE_COMPOUNDS[statusEntry.visualTyreCompound]?.name
    || ACTUAL_COMPOUNDS[statusEntry.actualTyreCompound]?.name
    || '';
}
function formatGearValue(gear) { return formatGearValueUtil(gear); }
function csvEscape(value) { return csvEscapeUtil(value); }
function safeFilePart(value, fallback = 'session') { return safeFilePartUtil(value, fallback); }
const timingExportFeature = createTimingExportFeature({
  state,
  TRACK_NAMES,
  getClassificationCars,
  tyreCompoundLabel,
  raceStatusLabel,
  windowApi: window.raceEngineer,
  getCurrentListenPort: () => listenPort,
  setStatusText: (message) => {
    const statusEl = el('timing-export-status');
    if (statusEl) statusEl.textContent = message;
  },
});
function buildTimingExportRows() { return timingExportFeature.buildTimingExportRows(); }
function buildTimingExportCsv() { return timingExportFeature.buildTimingExportCsv(); }
function buildTimingExportJson() { return timingExportFeature.buildTimingExportJson(); }
async function exportTimingData(format = 'csv') { return timingExportFeature.exportTimingData(format); }
function fmtCountdown(sec) { return fmtCountdownUtil(sec); }
function clamp(v, min, max) { return clampUtil(v, min, max); }
function tyreClass(tempC) { return tyreClassUtil(tempC); }
function dmgClass(pct) { return dmgClassUtil(pct); }
function tyreBadge(compound) {
  const c = TYRE_COMPOUNDS[compound] || { label: '?', color: '#888' };
  return `<span class="tyre-badge" style="background:${c.color}22;color:${c.color};border:1px solid ${c.color}55">${c.label}</span>`;
}
function teamColor(teamId) {
  return TEAM_COLORS[teamId] || '#888888';
}
function weatherIcon(w) { return weatherIconUtil(w); }
function safetyCarLabel(sc) { return safetyCarLabelUtil(sc); }
function el(id) { return document.getElementById(id); }
//  Pop-out helper 
function popoutBtn(page, title, width, height) {
  return `<button class="popout-btn" onclick="window.raceEngineer.openWindow({page:'${page}',title:'${title}',width:${width || 1000},height:${height || 700}})">Pop Out</button>`;
}
function isActiveRunningCar(lapEntry) {
  return !!lapEntry
    && lapEntry.carPosition > 0
    && lapEntry.resultStatus === 2
    && lapEntry.driverStatus !== 0
    && Number.isFinite(lapEntry.lapDistance)
    && lapEntry.lapDistance >= 0;
}
function isDisplayComparableCar(lapEntry) {
  return !!lapEntry
    && lapEntry.carPosition > 0
    && lapEntry.resultStatus >= 2
    && lapEntry.driverStatus !== 0;
}
function hasPlayerTrackContext(session = state.session, lap = state.lapData?.[state.playerCarIndex], telemetry = state.telemetry) {
  if (!session || !lap) return false;
  if (session.gamePaused) return false;
  if (!isActiveRunningCar(lap)) return false;
  if (telemetry && telemetry.speed <= 1 && (lap.currentLapNum || 0) <= 0) return false;
  return true;
}
function hasBatteryDisplayContext(session = state.session, lap = state.lapData?.[state.playerCarIndex]) {
  if (!session || !lap) return false;
  if (session.gamePaused) return false;
  return isDisplayComparableCar(lap);
}
function isPreStraightWindow(telemetryEntry, statusEntry, minSpeed = 130, maxSpeed = 220) {
  if (!telemetryEntry) return false;
  const deployMode = statusEntry?.ersDeployMode ?? 0;
  return (telemetryEntry.speed || 0) >= minSpeed
    && (telemetryEntry.speed || 0) <= maxSpeed
    && (telemetryEntry.throttle || 0) >= 0.72
    && (telemetryEntry.brake || 0) <= 0.05
    && Math.abs(telemetryEntry.steer || 0) <= 0.18
    && deployMode <= 1;
}
function shouldSpeakBattleBattery(gapMs, playerTelemetry, rivalTelemetry, rivalLap, session = state.session, lap = state.lapData?.[state.playerCarIndex]) {
  if (!hasPlayerTrackContext(session, lap, playerTelemetry)) return false;
  if (!isActiveRunningCar(rivalLap)) return false;
  if (!(gapMs > 0 && gapMs <= 1000)) return false;
  if ((lap?.currentLapNum || 0) <= 1) return false;
  if (!isPreStraightWindow(playerTelemetry, state.status, 130, 220)) return false;
  if (rivalTelemetry) {
    if ((rivalTelemetry.speed || 0) < 80) return false;
    if ((rivalTelemetry.brake || 0) > 0.12) return false;
    if (Math.abs(rivalTelemetry.steer || 0) > 0.18) return false;
  }
  return true;
}
function getAdjacentComparableCars() {
  const lap = state.lapData?.[state.playerCarIndex];
  if (!isDisplayComparableCar(lap) || !Array.isArray(state.lapData)) {
    return { lap, carAheadLap: null, carBehindLap: null, aheadIdx: -1, behindIdx: -1 };
  }
  const myPos = lap.carPosition;
  const carAheadLap = state.lapData.find((entry) => entry?.carPosition === myPos - 1 && isDisplayComparableCar(entry));
  const carBehindLap = state.lapData.find((entry) => entry?.carPosition === myPos + 1 && isDisplayComparableCar(entry));
  return {
    lap,
    carAheadLap: carAheadLap || null,
    carBehindLap: carBehindLap || null,
    aheadIdx: carAheadLap ? state.lapData.indexOf(carAheadLap) : -1,
    behindIdx: carBehindLap ? state.lapData.indexOf(carBehindLap) : -1,
  };
}
function getAdjacentRunningCars() {
  const lap = state.lapData?.[state.playerCarIndex];
  if (!isActiveRunningCar(lap) || !Array.isArray(state.lapData)) {
    return { lap, carAheadLap: null, carBehindLap: null, aheadIdx: -1, behindIdx: -1 };
  }
  const myPos = lap.carPosition;
  const carAheadLap = state.lapData.find((entry) => entry?.carPosition === myPos - 1 && isActiveRunningCar(entry));
  const carBehindLap = state.lapData.find((entry) => entry?.carPosition === myPos + 1 && isActiveRunningCar(entry));
  return {
    lap,
    carAheadLap: carAheadLap || null,
    carBehindLap: carBehindLap || null,
    aheadIdx: carAheadLap ? state.lapData.indexOf(carAheadLap) : -1,
    behindIdx: carBehindLap ? state.lapData.indexOf(carBehindLap) : -1,
  };
}
function createBatteryComparison(side, rivalIdx, rivalLap, rivalStatus, myErsMJ, myErsPct, myPos) {
  if (rivalIdx < 0 || !isActiveRunningCar(rivalLap) || !rivalStatus) return null;
  const rivalName = state.participants?.participants?.[rivalIdx]?.name || `P${side === 'ahead' ? myPos - 1 : myPos + 1}`;
  const rivalMJ = rivalStatus.ersStoreEnergy / 1e6;
  const rivalPct = (rivalStatus.ersStoreEnergy / 4000000) * 100;
  const advantageMJ = +(myErsMJ - rivalMJ).toFixed(2);
  const advantagePct = +(myErsPct - rivalPct).toFixed(1);
  return {
    side,
    name: rivalName,
    rivalMJ,
    rivalPct,
    advantageMJ,
    advantagePct,
    relationLabel: side === 'ahead' ? 'car ahead' : 'car behind',
    trend: advantageMJ > 0 ? 'advantage' : advantageMJ < 0 ? 'disadvantage' : 'neutral',
  };
}
//  Battery delta helper 
function getBatteryDelta() {
  const sts = state.status;
  if (!sts || !state.allCarStatus) return null;
  const { lap, carAheadLap, carBehindLap, aheadIdx, behindIdx } = getAdjacentComparableCars();
  if (!hasBatteryDisplayContext(state.session, lap)) return null;
  const myErsMJ = sts.ersStoreEnergy / 1e6;
  const myErsPct = (sts.ersStoreEnergy / 4000000) * 100;
  const myPos = lap.carPosition;
  const aheadSts = aheadIdx >= 0 ? state.allCarStatus[aheadIdx] : null;
  const behindSts = behindIdx >= 0 ? state.allCarStatus[behindIdx] : null;
  const aheadDelta = createBatteryComparison('ahead', aheadIdx, carAheadLap, aheadSts, myErsMJ, myErsPct, myPos);
  const behindDelta = createBatteryComparison('behind', behindIdx, carBehindLap, behindSts, myErsMJ, myErsPct, myPos);
  return {
    myMJ: +myErsMJ.toFixed(2),
    myPct: +myErsPct.toFixed(1),
    ahead: aheadDelta,
    behind: behindDelta,
  };
}
function batteryDeltaHTML(delta) {
  if (!delta) return '';
  const formatComparison = (comparison, title) => {
    if (!comparison) return '';
    const pct = comparison.advantagePct || 0;
    const mj = comparison.advantageMJ || 0;
    const cls = comparison.trend;
    const sign = pct > 0 ? '+' : pct < 0 ? '-' : '';
    const trendText = cls === 'neutral' ? 'level' : cls;
    return `<div class="battery-delta">
      <span class="battery-delta-label">${title}: ${comparison.name}</span>
      <span class="battery-delta-value ${cls}">${sign}${Math.abs(pct).toFixed(1)}% (${sign}${Math.abs(mj).toFixed(2)} MJ) ${trendText}</span>
    </div>`;
  };
  let html = '';
  html += formatComparison(delta.ahead, 'Car ahead');
  html += formatComparison(delta.behind, 'Car behind');
  return html;
}
const dashboardPageModule = createDashboardPage({
  state,
  el,
  clamp,
  tyreClass,
  TYRE_COMPOUNDS,
  fmt,
  fmtSector,
  computeSector3Time,
  getBatteryDelta,
  batteryDeltaHTML,
});
const timingPageModule = createTimingPage({
  state,
  el,
  popoutBtn,
  exportTimingData,
  getClassificationCars,
  teamColor,
  fmt,
  fmtSector,
  computeSector3Time,
  renderRaceStatusBadge,
  renderControlBadge,
  tyreBadge,
});
const trackMapPageModule = createTrackMapPage({
  state,
  el,
  popoutBtn,
  CIRCUITS,
  clamp,
  getBatteryDelta,
  batteryDeltaHTML,
  getTrackMapVisibleCars,
  teamColor,
  getClassificationCars,
  renderRaceStatusBadge,
  renderControlBadge,
});
const vehiclePageModule = createVehiclePage({
  state,
  el,
  popoutBtn,
  f1CarSvg,
  tyreClass,
  clamp,
  getBatteryDelta,
  batteryDeltaHTML,
  tyreBadge,
  dmgClass,
});
const sessionPageModule = createSessionPage({
  state,
  el,
  fmtCountdown,
  weatherIcon,
  safetyCarLabel,
});
const telemetryUiFeature = createTelemetryUiFeature({
  state,
  DETACH_PAGE,
  dashboardPageModule,
  timingPageModule,
  trackMapPageModule,
  vehiclePageModule,
  sessionPageModule,
  el,
  fmt,
  safetyCarLabel,
  clearEngineerPlayback,
});
const {
  clearTelemetryStateCache,
  resetTelemetryPanels,
  updateTopBar,
} = telemetryUiFeature;
//  AI Engineer 
// Build a concise telemetry snapshot for the API context
const autoRadioFeature = createAutoRadioFeature({
  state,
  radio,
  gptRealtime,
  tts,
  TYRE_COMPOUNDS,
  RADIO_MESSAGES,
  el,
  escapeHtml,
  ttsSpeak,
  getBatteryDelta,
  isRaceSession,
  getPlayerLap,
  isPlayerRaceFinished,
  getRemainingRaceDistanceLaps,
  getTrackAheadGapMeters,
  getTrackProximityMeters,
  isTrackLikeSurface,
  isTelemetryOffTrack,
  handleFinishedRaceRadioState,
  fmt,
});
const {
  appendRadioCard,
  buildRaceContext,
  checkAutoRadio,
  toInfoOnlyRadioText,
} = autoRadioFeature;
const paymentFeature = createPaymentFeature({
  state,
  license,
  gptRealtime,
  radio,
  paypalCheckout,
  el,
  countAiEnabledSituations,
  appendRadioCard,
});
const engineerAudioFeature = createEngineerAudioFeature({
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
});
const engineerPageModule = createEngineerPage({
  state,
  radio,
  gptRealtime,
  license,
  el,
  popoutBtn,
  buildRaceContext,
  toInfoOnlyRadioText,
  gptConnect,
  gptDisconnect,
  showPurchaseModal,
  updateGptStatusUI,
  TYRE_COMPOUNDS,
  safetyCarLabel,
});
let radioConfigPageModule;
radioConfigPageModule = createRadioConfigPage({
  radio,
  el,
  RADIO_CATEGORIES,
  countAiEnabledSituations,
  showPurchaseModal,
  rerenderRadioConfig: () => radioConfigPageModule.buildRadioConfig(),
});
let settingsPageModule;
settingsPageModule = createSettingsPage({
  state,
  license,
  gptRealtime,
  radio,
  tts,
  TTS_VOICES,
  TRACK_NAMES,
  el,
  normalizeListenPort,
  showPurchaseModal,
  refreshLicenseBadges,
  getLicenseStatusLabel,
  formatPaymentEventTime,
  ttsSpeak,
  getListenPort: () => listenPort,
  setListenPort: (value) => { listenPort = value; },
  getSavedApiKey: () => savedApiKey,
  setSavedApiKey: (value) => { savedApiKey = value; },
  rerenderSettings: () => settingsPageModule.buildSettings(),
});
//  Live update loop 
function tick() {
  const activePage = document.querySelector('.page.active')?.id;
  updateTopBar();
  if (activePage === 'page-dashboard') dashboardPageModule.updateDashboard();
  if (activePage === 'page-timing')   timingPageModule.updateTiming();
  if (activePage === 'page-trackmap') trackMapPageModule.updateTrackMap();
  if (activePage === 'page-vehicle')  vehiclePageModule.updateVehicle();
  if (activePage === 'page-session')  sessionPageModule.updateSession();
  if (activePage === 'page-engineer') engineerPageModule.updateEngineerProximity();
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
  Object.keys(TEAM_COLORS).forEach((key) => { delete TEAM_COLORS[key]; });
  Object.keys(TYRE_COMPOUNDS).forEach((key) => { delete TYRE_COMPOUNDS[key]; });
  Object.keys(ACTUAL_COMPOUNDS).forEach((key) => { delete ACTUAL_COMPOUNDS[key]; });
  Object.keys(TRACK_NAMES).forEach((key) => { delete TRACK_NAMES[key]; });
  Object.assign(TEAM_COLORS, lookups.TEAM_COLORS || {});
  Object.assign(TYRE_COMPOUNDS, lookups.TYRE_COMPOUNDS || {});
  Object.assign(ACTUAL_COMPOUNDS, lookups.ACTUAL_COMPOUNDS || {});
  Object.assign(TRACK_NAMES, lookups.TRACK_NAMES || {});
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
    radio.config = normalizeRadioConfig(saved.radioConfig, getDefaultRadioConfig);
  } else {
    radio.config = normalizeRadioConfig(radio.config, getDefaultRadioConfig);
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
      dashboard: dashboardPageModule.buildDashboard,
      timing: timingPageModule.buildTiming,
      trackmap: trackMapPageModule.buildTrackMap,
      vehicle: vehiclePageModule.buildVehicle,
      session: sessionPageModule.buildSession,
      engineer: engineerPageModule.buildEngineer,
      radio: radioConfigPageModule.buildRadioConfig,
      settings: settingsPageModule.buildSettings,
    };
    if (builders[DETACH_PAGE]) builders[DETACH_PAGE]();
    navigate(DETACH_PAGE);
  } else {
    // Build all pages (main window)
    dashboardPageModule.buildDashboard();
    timingPageModule.buildTiming();
    trackMapPageModule.buildTrackMap();
    vehiclePageModule.buildVehicle();
    sessionPageModule.buildSession();
    engineerPageModule.buildEngineer();
    radioConfigPageModule.buildRadioConfig();
    settingsPageModule.buildSettings();
  }
  if (!DETACH_PAGE) {
    clearTelemetryStateCache();
    window.raceEngineer.stopTelemetry();
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
    clearTelemetryStateCache();
    resetTelemetryPanels();
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
    clearTelemetryStateCache();
    resetTelemetryPanels();
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
  // Detached child windows inherit an existing telemetry context from the source window.
  if (DETACH_PAGE) {
    const snap = await window.raceEngineer.getStateSnapshot();
    if (snap.bestLapTimes) state.bestLapTimes = snap.bestLapTimes;
    if (snap.fastestLap) {
      state.fastestLapCar = snap.fastestLap.vehicleIdx;
      state.fastestLapMs  = snap.fastestLap.lapTimeMs;
    }
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






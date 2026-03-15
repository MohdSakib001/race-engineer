export const DEFAULT_LISTEN_PORT = 20777;

export function normalizeListenPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : DEFAULT_LISTEN_PORT;
}

export function createRaceAnalysisState(options = {}) {
  return {
    sessionSignature: null,
    sessionLabel: '',
    sessionStartedAt: null,
    lastObservedAt: null,
    startFuelKg: null,
    currentFuelKg: null,
    lastRecordedLapNumber: 0,
    lastRecordedLapKey: null,
    lastRecordedPitStops: 0,
    completedLaps: [],
    lapTraces: {},
    currentLapTrace: null,
    compareLapA: null,
    compareLapB: null,
    pitLossEstimateSec: Number.isFinite(options.pitLossEstimateSec) ? options.pitLossEstimateSec : 22,
    storageConfig: {
      remoteSyncEnabled: options.storageConfig?.remoteSyncEnabled === true,
      supabaseUrl: options.storageConfig?.supabaseUrl || '',
      supabaseKey: options.storageConfig?.supabaseKey || '',
      supabaseTable: options.storageConfig?.supabaseTable || 'race_analysis_snapshots',
    },
    storage: {
      lastDraftSavedAt: null,
      lastSnapshotSavedAt: null,
      lastSaveStatus: '',
      recentSnapshots: [],
    },
  };
}

export function createAppState() {
  return {
    connected: false,
    session: null,
    participants: null,
    lapData: null,
    telemetry: null,
    setup: null,
    status: null,
    damage: null,
    allCarSetup: null,
    allCarStatus: null,
    allCarTelemetry: null,
    playerCarIndex: 0,
    bestLapTimes: {},
    fastestLapCar: -1,
    fastestLapMs: 0,
    analysis: createRaceAnalysisState(),
  };
}

export function createLicenseState() {
  return {
    creditsRemaining: 0,
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
}

export function createGptRealtimeState() {
  return {
    connected: false,
    status: 'disconnected',
    transcript: '',
    audioContext: null,
    audioQueue: [],
    audioPlaying: false,
    currentSource: null,
    sampleRate: 24000,
    voice: 'echo',
    openaiApiKey: '',
    aiMode: 'classic',
    sessionType: 'race',
    lastPushAt: 0,
    pushIntervalMs: 12000,
  };
}

export function createPayPalCheckoutState() {
  return {
    pendingOrder: null,
    verifying: false,
    pollTimer: null,
  };
}

export function createRadioState(getDefaultRadioConfig) {
  return {
    enabled: true,
    awaiting: false,
    cooldowns: {
      attack: 90000,
      defense: 90000,
      mixed: 90000,
      start: 90000,
      overtake: 30000,
      defend: 45000,
      tyres: 90000,
      ers: 90000,
      pit: 90000,
      weather: 60000,
      incident: 30000,
      flags: 15000,
      restart: 30000,
      restart_green_go: 15000,
      normal: 60000,
      slower_car_ahead: 30000,
      car_rejoining_track: 30000,
      endrace: 45000,
      penalty: 30000,
      racecraft: 60000,
    },
    lastTrigger: {},
    config: getDefaultRadioConfig(),
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
      pitLaneActive: 0,
      battleAheadStart: 0,
      battleBehindStart: 0,
      battleAheadIdx: -1,
      battleBehindIdx: -1,
      lastBattleBatteryMsg: 0,
      lastBattleDamageMsg: 0,
      lastDirtyAirMsg: 0,
      lastClosingMsg: 0,
      lastBeingCaughtMsg: 0,
      gapAheadPrev: 0,
      gapBehindPrev: 0,
      lastLapTime: 0,
      prevLastLapTime: 0,
      endRaceWarned: false,
      cleanAirMsgTime: 0,
      lockupDetected: 0,
      lastBrakeTemp: [0, 0, 0, 0],
      lapTimeAvg: 0,
      lapTimeAvgLap: 0,
      lastTyreTempReportLap: 0,
      lastTyreAgeReportLap: 0,
      lastBattleBatteryDeltaAhead: null,
      lastBattleBatteryDeltaBehind: null,
      lastBattleBatteryRivalAhead: -1,
      lastBattleBatteryRivalBehind: -1,
      lastRadioText: '',
      lastRadioTextAt: 0,
      redFlagPeriods: 0,
      sessionFinished: false,
      restartAwaitingLeaderThrottle: false,
      rivalOffTrack: {},
      vscDeltaWarned: false,
      pitThreatArmed: false,
      pitThreatGapBehindMs: 0,
      pitThreatPitLossMs: 0,
      pitThreatReferenceLapMs: 0,
      pitThreatRivalName: '',
    },
  };
}

export function normalizeRadioConfig(config, getDefaultRadioConfig) {
  const defaults = getDefaultRadioConfig();
  if (!config) return defaults;
  const normalized = defaults;
  for (const [cat, def] of Object.entries(defaults)) {
    const savedCat = config[cat];
    if (!savedCat || typeof savedCat !== 'object') continue;
    normalized[cat].enabled = savedCat.enabled !== false;
    normalized[cat].aiEnabled = savedCat.aiEnabled === true;
    for (const sit of Object.keys(def.situations)) {
      if (savedCat.situations && Object.prototype.hasOwnProperty.call(savedCat.situations, sit)) {
        normalized[cat].situations[sit] = savedCat.situations[sit] !== false;
      }
    }
  }
  return normalized;
}

export const TTS_VOICES = [
  { id: 'en-GB-RyanNeural', label: 'Ryan (British Male) ' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia (British Female)' },
  { id: 'en-GB-ThomasNeural', label: 'Thomas (British Male)' },
  { id: 'en-US-GuyNeural', label: 'Guy (US Male)' },
  { id: 'en-US-AriaNeural', label: 'Aria (US Female)' },
  { id: 'en-AU-WilliamNeural', label: 'William (Australian Male)' },
  { id: 'en-AU-NatashaNeural', label: 'Natasha (Australian Female)' },
  { id: 'en-IE-ConnorNeural', label: 'Connor (Irish Male)' },
  { id: 'en-IN-PrabhatNeural', label: 'Prabhat (Indian Male)' },
];

export function createTtsState() {
  return {
    enabled: false,
    queue: [],
    speaking: false,
    voice: 'en-GB-RyanNeural',
    rate: 1.1,
    currentAudio: null,
    lastQueuedText: '',
    lastQueuedAt: 0,
  };
}

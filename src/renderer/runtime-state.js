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

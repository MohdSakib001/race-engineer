import { computeSector3Time } from '../../shared/formatting.js';
import { createRaceAnalysisState } from '../../runtime-state.js';

const TRACE_PROGRESS_STEP = 0.003;
const TRACE_TIME_STEP_MS = 90;
const TRACE_INPUT_DELTA_PCT = 4;
const TRACE_WEAR_DELTA_PCT = 0.08;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function clampPct(value) {
  return Math.min(100, Math.max(0, value));
}

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function createSessionSignature(session) {
  if (!session) return null;
  return [session.trackId, session.sessionType, session.totalLaps || 0].join(':');
}

function createSessionLabel(session) {
  if (!session) return 'Race Analysis';
  const track = session.trackName || `Track ${session.trackId ?? '-'}`;
  const sessionType = session.sessionTypeName || `Session ${session.sessionType ?? '-'}`;
  return `${track} ${sessionType}`;
}

function normalizeTyreWearSample(tyreWearPct) {
  if (!Array.isArray(tyreWearPct)) return [null, null, null, null];
  return tyreWearPct.slice(0, 4).map((value) => (Number.isFinite(value) ? +Number(value).toFixed(3) : null));
}

function normalizeTraceSample(sample = {}) {
  return {
    progress: clamp01(Number(sample.progress) || 0),
    timeMs: Math.max(0, Number(sample.timeMs) || 0),
    throttlePct: Number.isFinite(sample.throttlePct) ? +clampPct(sample.throttlePct).toFixed(1) : null,
    brakePct: Number.isFinite(sample.brakePct) ? +clampPct(sample.brakePct).toFixed(1) : null,
    tyreWearPct: normalizeTyreWearSample(sample.tyreWearPct),
  };
}

function createLapTrace(lapNumber, fuelAtStartKg, initialSample = null) {
  return {
    lapNumber,
    fuelAtStartKg: Number.isFinite(fuelAtStartKg) ? fuelAtStartKg : null,
    invalid: false,
    sawPit: false,
    samples: initialSample ? [normalizeTraceSample(initialSample)] : [],
  };
}

function cloneTrace(trace) {
  if (!trace) return null;
  return {
    lapNumber: trace.lapNumber,
    fuelAtStartKg: trace.fuelAtStartKg,
    invalid: trace.invalid === true,
    sawPit: trace.sawPit === true,
      samples: Array.isArray(trace.samples)
      ? trace.samples.map((sample) => normalizeTraceSample(sample))
      : [],
  };
}

function cloneLapTraces(lapTraces) {
  if (!lapTraces || typeof lapTraces !== 'object') return {};
  return Object.fromEntries(
    Object.entries(lapTraces).map(([lapNumber, trace]) => [lapNumber, cloneTrace(trace)]),
  );
}

function normalizeTraceForLap(trace, lapTimeMs) {
  const normalized = cloneTrace(trace) || createLapTrace(0, null);
  if (!Array.isArray(normalized.samples)) normalized.samples = [];
  const last = normalized.samples[normalized.samples.length - 1];
  const finalSample = normalizeTraceSample({
    ...last,
    progress: 1,
    timeMs: lapTimeMs,
  });
  if (!last || last.progress < 1 || last.timeMs < lapTimeMs) {
    normalized.samples.push(finalSample);
  } else {
    normalized.samples[normalized.samples.length - 1] = finalSample;
  }
  return normalized;
}

function buildPersistableAnalysis(analysis) {
  return {
    sessionSignature: analysis.sessionSignature,
    sessionLabel: analysis.sessionLabel,
    sessionStartedAt: analysis.sessionStartedAt,
    lastObservedAt: analysis.lastObservedAt,
    startFuelKg: analysis.startFuelKg,
    currentFuelKg: analysis.currentFuelKg,
    lastRecordedLapNumber: analysis.lastRecordedLapNumber,
    lastRecordedLapKey: analysis.lastRecordedLapKey,
    lastRecordedPitStops: analysis.lastRecordedPitStops,
    completedLaps: Array.isArray(analysis.completedLaps) ? analysis.completedLaps.map((lap) => ({ ...lap })) : [],
    lapTraces: cloneLapTraces(analysis.lapTraces),
    currentLapTrace: cloneTrace(analysis.currentLapTrace),
    compareLapA: analysis.compareLapA,
    compareLapB: analysis.compareLapB,
    pitLossEstimateSec: analysis.pitLossEstimateSec,
  };
}

export function createRaceAnalysisFeature(deps) {
  const {
    state,
    windowApi,
    isPrimaryWindow,
  } = deps;

  let draftQueue = Promise.resolve();
  let lapClockSync = {
    lapNumber: 0,
    timeMs: 0,
    observedAt: 0,
  };

  function syncLapClock(playerLap) {
    if (!playerLap) return;
    lapClockSync = {
      lapNumber: Number(playerLap.currentLapNum) || 0,
      timeMs: Math.max(0, Number(playerLap.currentLapTimeMs) || 0),
      observedAt: nowMs(),
    };
  }

  function estimateCurrentLapTimeMs(playerLap) {
    const lapTimeMs = Math.max(0, Number(playerLap?.currentLapTimeMs) || 0);
    if (!playerLap) return lapTimeMs;
    if (lapClockSync.lapNumber !== (Number(playerLap.currentLapNum) || 0) || !lapClockSync.observedAt) {
      return lapTimeMs;
    }
    return Math.max(lapTimeMs, lapClockSync.timeMs + (nowMs() - lapClockSync.observedAt));
  }

  function getCurrentTyreWearSample() {
    const tyresWear = state.damage?.tyresWear;
    if (!Array.isArray(tyresWear) || tyresWear.length < 4) return [null, null, null, null];
    return normalizeTyreWearSample([tyresWear[2], tyresWear[3], tyresWear[0], tyresWear[1]]);
  }

  function buildCurrentTraceSample(playerLap) {
    const session = state.session;
    if (!session || !playerLap || !Number.isFinite(session.trackLength) || session.trackLength <= 0) return null;
    if (!Number.isFinite(playerLap.lapDistance)) return null;
    return normalizeTraceSample({
      progress: playerLap.lapDistance / session.trackLength,
      timeMs: estimateCurrentLapTimeMs(playerLap),
      throttlePct: Number.isFinite(state.telemetry?.throttle) ? state.telemetry.throttle * 100 : null,
      brakePct: Number.isFinite(state.telemetry?.brake) ? state.telemetry.brake * 100 : null,
      tyreWearPct: getCurrentTyreWearSample(),
    });
  }

  function shouldAppendTraceSample(lastSample, nextSample, forceSample = false) {
    if (!lastSample || forceSample) return true;
    if ((nextSample.progress - lastSample.progress) >= TRACE_PROGRESS_STEP) return true;
    if ((nextSample.timeMs - lastSample.timeMs) >= TRACE_TIME_STEP_MS) return true;
    if (
      Number.isFinite(nextSample.throttlePct)
      && Number.isFinite(lastSample.throttlePct)
      && Math.abs(nextSample.throttlePct - lastSample.throttlePct) >= TRACE_INPUT_DELTA_PCT
    ) return true;
    if (
      Number.isFinite(nextSample.brakePct)
      && Number.isFinite(lastSample.brakePct)
      && Math.abs(nextSample.brakePct - lastSample.brakePct) >= TRACE_INPUT_DELTA_PCT
    ) return true;
    return nextSample.tyreWearPct.some((value, index) => (
      Number.isFinite(value)
      && Number.isFinite(lastSample.tyreWearPct?.[index])
      && Math.abs(value - lastSample.tyreWearPct[index]) >= TRACE_WEAR_DELTA_PCT
    ));
  }

  function restoreDraft(savedAnalysis) {
    if (!savedAnalysis || typeof savedAnalysis !== 'object') return;
    const preservedPitLoss = state.analysis.pitLossEstimateSec;
    const preservedStorageConfig = { ...state.analysis.storageConfig };
    const preservedSnapshots = Array.isArray(state.analysis.storage?.recentSnapshots)
      ? state.analysis.storage.recentSnapshots.slice(0, 12)
      : [];
    const next = createRaceAnalysisState({
      pitLossEstimateSec: preservedPitLoss,
      storageConfig: preservedStorageConfig,
    });
    Object.assign(next, buildPersistableAnalysis(savedAnalysis));
    next.storage.recentSnapshots = preservedSnapshots;
    Object.assign(state.analysis, next);
    ensureCompareSelection();
  }

  function setRecentSnapshots(snapshots) {
    state.analysis.storage.recentSnapshots = Array.isArray(snapshots)
      ? snapshots.slice(0, 12)
      : [];
  }

  function setPitLossEstimate(value) {
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue)) return;
    state.analysis.pitLossEstimateSec = Math.min(120, Math.max(5, nextValue));
  }

  function setStorageConfig(config = {}) {
    state.analysis.storageConfig = {
      remoteSyncEnabled: config.remoteSyncEnabled === true,
      supabaseUrl: config.supabaseUrl || '',
      supabaseKey: config.supabaseKey || '',
      supabaseTable: config.supabaseTable || 'race_analysis_snapshots',
    };
  }

  function resetAnalysisForSession(session) {
    const preservedSnapshots = Array.isArray(state.analysis.storage?.recentSnapshots)
      ? state.analysis.storage.recentSnapshots.slice(0, 12)
      : [];
    const pitLossEstimateSec = state.analysis.pitLossEstimateSec;
    const storageConfig = { ...state.analysis.storageConfig };
    Object.assign(state.analysis, createRaceAnalysisState({ pitLossEstimateSec, storageConfig }));
    state.analysis.sessionSignature = createSessionSignature(session);
    state.analysis.sessionLabel = createSessionLabel(session);
    state.analysis.sessionStartedAt = new Date().toISOString();
    state.analysis.storage.recentSnapshots = preservedSnapshots;
  }

  function ensureActiveSession(playerLap = state.lapData?.[state.playerCarIndex]) {
    const session = state.session;
    if (!session) return false;
    const nextSignature = createSessionSignature(session);
    const lastLapNumber = state.analysis.lastRecordedLapNumber || 0;
    const currentLapNumber = Number(playerLap?.currentLapNum) || 0;
    const lapReset = lastLapNumber >= 2 && currentLapNumber > 0 && currentLapNumber + 2 < lastLapNumber;

    if (!state.analysis.sessionSignature || state.analysis.sessionSignature !== nextSignature || lapReset) {
      resetAnalysisForSession(session);
    } else if (!state.analysis.sessionLabel) {
      state.analysis.sessionLabel = createSessionLabel(session);
    }

    state.analysis.lastObservedAt = new Date().toISOString();
    return true;
  }

  function queueDraftSave() {
    if (!isPrimaryWindow || !windowApi?.saveRaceAnalysisDraft) return Promise.resolve(null);
    const payload = buildPersistableAnalysis(state.analysis);
    draftQueue = draftQueue
      .catch(() => null)
      .then(async () => {
        const result = await windowApi.saveRaceAnalysisDraft({ analysis: payload });
        if (result?.success) {
          state.analysis.storage.lastDraftSavedAt = result.savedAt || new Date().toISOString();
        }
        return result;
      });
    return draftQueue;
  }

  function ensureCompareSelection() {
    const lapNumbers = state.analysis.completedLaps.map((entry) => entry.lapNumber).sort((a, b) => a - b);
    if (lapNumbers.length === 0) {
      state.analysis.compareLapA = null;
      state.analysis.compareLapB = null;
      return;
    }
    if (!lapNumbers.includes(state.analysis.compareLapA)) {
      state.analysis.compareLapA = lapNumbers[Math.max(0, lapNumbers.length - 2)] || lapNumbers[0];
    }
    if (!lapNumbers.includes(state.analysis.compareLapB)) {
      state.analysis.compareLapB = lapNumbers[lapNumbers.length - 1];
    }
  }

  function handleSetupUpdate(setup) {
    if (!Number.isFinite(state.analysis.startFuelKg) && Number.isFinite(setup?.fuelLoad) && setup.fuelLoad > 0) {
      state.analysis.startFuelKg = setup.fuelLoad;
    }
  }

  function handleStatusUpdate(status) {
    if (Number.isFinite(status?.fuelInTank)) {
      state.analysis.currentFuelKg = status.fuelInTank;
      if (!Number.isFinite(state.analysis.startFuelKg) && status.fuelInTank > 0) {
        state.analysis.startFuelKg = status.fuelInTank;
      }
    }
  }

  function updateCurrentLapTrace(playerLap, forceSample = false) {
    const session = state.session;
    if (!session || !playerLap || !Number.isFinite(playerLap.currentLapNum) || playerLap.currentLapNum <= 0) return;
    const currentSample = buildCurrentTraceSample(playerLap);
    if (!state.analysis.currentLapTrace || state.analysis.currentLapTrace.lapNumber !== playerLap.currentLapNum) {
      state.analysis.currentLapTrace = createLapTrace(playerLap.currentLapNum, state.analysis.currentFuelKg, currentSample);
    }
    const trace = state.analysis.currentLapTrace;
    trace.invalid = trace.invalid || playerLap.currentLapInvalid === 1;
    trace.sawPit = trace.sawPit || playerLap.pitStatus >= 1;
    if (!currentSample) return;

    const samples = trace.samples;
    const lastSample = samples[samples.length - 1];
    const nextSample = normalizeTraceSample({
      ...lastSample,
      ...currentSample,
      progress: lastSample ? Math.max(currentSample.progress, lastSample.progress) : currentSample.progress,
      timeMs: lastSample ? Math.max(currentSample.timeMs, lastSample.timeMs) : currentSample.timeMs,
    });

    if (!lastSample) {
      samples.push(nextSample);
      return;
    }

    if (shouldAppendTraceSample(lastSample, nextSample, forceSample)) {
      samples.push(nextSample);
      return;
    }
    trace.samples[trace.samples.length - 1] = nextSample;
  }

  function finalizeCompletedLap(completedLapNumber, lapSnapshot, trace) {
    const lapTimeMs = Number(lapSnapshot?.lastLapTimeMs) || 0;
    if (!(completedLapNumber > 0) || lapTimeMs <= 0) return;
    const traceSamples = Array.isArray(trace?.samples) ? trace.samples : [];
    const firstWearSample = Array.isArray(traceSamples[0]?.tyreWearPct) ? traceSamples[0].tyreWearPct : null;
    const lastWearSample = Array.isArray(traceSamples[traceSamples.length - 1]?.tyreWearPct)
      ? traceSamples[traceSamples.length - 1].tyreWearPct
      : null;

    const fuelAtEndKg = Number.isFinite(state.analysis.currentFuelKg) ? state.analysis.currentFuelKg : null;
    let fuelUsedKg = null;
    if (Number.isFinite(trace?.fuelAtStartKg) && Number.isFinite(fuelAtEndKg)) {
      fuelUsedKg = +(trace.fuelAtStartKg - fuelAtEndKg).toFixed(3);
    } else {
      const previousLap = state.analysis.completedLaps[state.analysis.completedLaps.length - 1];
      if (Number.isFinite(previousLap?.fuelAtEndKg) && Number.isFinite(fuelAtEndKg)) {
        fuelUsedKg = +(previousLap.fuelAtEndKg - fuelAtEndKg).toFixed(3);
      }
    }
    if (Number.isFinite(fuelUsedKg) && fuelUsedKg < -0.2) fuelUsedKg = null;

    const lapRecord = {
      lapNumber: completedLapNumber,
      lapTimeMs,
      sector1TimeMs: Number(lapSnapshot?.sector1TimeMs) || 0,
      sector2TimeMs: Number(lapSnapshot?.sector2TimeMs) || 0,
      sector3TimeMs: computeSector3Time({ lastLapTimeMs: lapTimeMs, sector1TimeMs: lapSnapshot?.sector1TimeMs, sector2TimeMs: lapSnapshot?.sector2TimeMs }),
      invalid: trace?.invalid === true,
      pitLap: trace?.sawPit === true || (Number(lapSnapshot?.numPitStops) || 0) > state.analysis.lastRecordedPitStops,
      numPitStops: Number(lapSnapshot?.numPitStops) || 0,
      tyreAgeLaps: Number.isFinite(state.status?.tyresAgeLaps) ? state.status.tyresAgeLaps : null,
      tyreCompound: Number.isFinite(state.status?.visualTyreCompound) ? state.status.visualTyreCompound : null,
      tyreWearStartPct: firstWearSample ? firstWearSample.slice(0, 4)
        : null,
      tyreWearEndPct: lastWearSample
        ? lastWearSample.slice(0, 4)
        : getCurrentTyreWearSample(),
      fuelAtEndKg,
      fuelUsedKg,
      completedAt: new Date().toISOString(),
    };

    const existingIndex = state.analysis.completedLaps.findIndex((entry) => entry.lapNumber === completedLapNumber);
    if (existingIndex >= 0) {
      state.analysis.completedLaps.splice(existingIndex, 1, lapRecord);
    } else {
      state.analysis.completedLaps.push(lapRecord);
      state.analysis.completedLaps.sort((a, b) => a.lapNumber - b.lapNumber);
    }

    state.analysis.lapTraces[completedLapNumber] = normalizeTraceForLap(trace, lapTimeMs);
    state.analysis.lastRecordedLapNumber = Math.max(state.analysis.lastRecordedLapNumber, completedLapNumber);
    state.analysis.lastRecordedPitStops = lapRecord.numPitStops;
    ensureCompareSelection();
    queueDraftSave().catch(() => null);
  }

  function handleSessionUpdate() {
    ensureActiveSession();
  }

  function handleLapUpdate(lapData) {
    const playerLap = lapData?.[state.playerCarIndex];
    if (!playerLap) return;
    if (!ensureActiveSession(playerLap)) return;
    syncLapClock(playerLap);

    const completedLapNumber = Math.max(0, (Number(playerLap.currentLapNum) || 0) - 1);
    const completedLapTimeMs = Number(playerLap.lastLapTimeMs) || 0;
    const completedLapKey = completedLapNumber > 0 && completedLapTimeMs > 0
      ? `${completedLapNumber}:${completedLapTimeMs}`
      : null;

    if (completedLapKey && state.analysis.lastRecordedLapKey !== completedLapKey) {
      const trace = state.analysis.currentLapTrace?.lapNumber === completedLapNumber
        ? state.analysis.currentLapTrace
        : null;
      finalizeCompletedLap(completedLapNumber, playerLap, trace);
      state.analysis.lastRecordedLapKey = completedLapKey;
      if (state.analysis.currentLapTrace?.lapNumber === completedLapNumber) {
        state.analysis.currentLapTrace = null;
      }
    }

    updateCurrentLapTrace(playerLap, true);
  }

  function handleTelemetryUpdate() {
    const playerLap = state.lapData?.[state.playerCarIndex];
    if (!playerLap) return;
    if (!ensureActiveSession(playerLap)) return;
    updateCurrentLapTrace(playerLap, false);
  }

  function handleDamageUpdate() {
    const playerLap = state.lapData?.[state.playerCarIndex];
    if (!playerLap) return;
    if (!ensureActiveSession(playerLap)) return;
    updateCurrentLapTrace(playerLap, true);
  }

  async function saveSnapshot() {
    if (!windowApi?.saveRaceAnalysisSnapshot) {
      return { error: 'Snapshot storage is unavailable in this build.' };
    }
    const snapshot = {
      ...buildPersistableAnalysis(state.analysis),
      trackName: state.session?.trackName || '',
      sessionTypeName: state.session?.sessionTypeName || '',
      totalLaps: state.session?.totalLaps || 0,
      playerCarIndex: state.playerCarIndex || 0,
      participants: state.participants?.participants || [],
      savedAt: new Date().toISOString(),
    };
    const result = await windowApi.saveRaceAnalysisSnapshot({
      snapshot,
      storageConfig: state.analysis.storageConfig,
    });

    if (result?.success) {
      state.analysis.storage.lastSnapshotSavedAt = result.savedAt || snapshot.savedAt;
      state.analysis.storage.lastSaveStatus = result.message || 'Snapshot saved.';
      if (Array.isArray(result.snapshots)) setRecentSnapshots(result.snapshots);
      await queueDraftSave().catch(() => null);
    } else if (result?.error) {
      state.analysis.storage.lastSaveStatus = result.error;
    }
    return result;
  }

  return {
    restoreDraft,
    setRecentSnapshots,
    setPitLossEstimate,
    setStorageConfig,
    handleSessionUpdate,
    handleSetupUpdate,
    handleStatusUpdate,
    handleLapUpdate,
    handleTelemetryUpdate,
    handleDamageUpdate,
    saveSnapshot,
    queueDraftSave,
  };
}

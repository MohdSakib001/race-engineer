export function createTelemetryUiFeature(deps) {
  const {
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
  } = deps;

  function updateTopBar() {
    const lap = state.lapData?.[state.playerCarIndex];
    const ses = state.session;
    if (ses) {
      const sc = ses.safetyCarStatus ? `  ${safetyCarLabel(ses.safetyCarStatus)}` : '';
      el('topbar-session').textContent =
        `${ses.trackName || ''}  ${ses.sessionTypeName || ''}${sc}`;
    } else {
      el('topbar-session').textContent = 'Waiting for telemetry';
    }
    if (lap) {
      el('tb-pos').innerHTML = `P<strong>${lap.carPosition || ''}</strong>`;
      el('tb-lap').innerHTML = `Lap <strong>${lap.currentLapNum || ''}/${ses?.totalLaps || ''}</strong>`;
      el('tb-time').innerHTML = `<strong>${fmt(lap.currentLapTimeMs)}</strong>`;
    } else {
      el('tb-pos').innerHTML = 'P<strong>-</strong>';
      el('tb-lap').innerHTML = 'Lap <strong>-/-</strong>';
      el('tb-time').innerHTML = '<strong>-:--.---</strong>';
    }
  }

  function clearTelemetryStateCache() {
    state.session = null;
    state.participants = null;
    state.lapData = null;
    state.telemetry = null;
    state.status = null;
    state.damage = null;
    state.allCarStatus = null;
    state.allCarTelemetry = null;
    state.playerCarIndex = 0;
    state.bestLapTimes = {};
    state.fastestLapCar = -1;
    state.fastestLapMs = 0;
    clearEngineerPlayback();
  }

  function resetTelemetryPanels() {
    const builders = {
      dashboard: dashboardPageModule.buildDashboard,
      timing: timingPageModule.buildTiming,
      trackmap: trackMapPageModule.buildTrackMap,
      vehicle: vehiclePageModule.buildVehicle,
      session: sessionPageModule.buildSession,
    };
    if (DETACH_PAGE) {
      const builder = builders[DETACH_PAGE];
      if (builder) builder();
      updateTopBar();
      return;
    }
    dashboardPageModule.buildDashboard();
    timingPageModule.buildTiming();
    trackMapPageModule.buildTrackMap();
    vehiclePageModule.buildVehicle();
    sessionPageModule.buildSession();
    updateTopBar();
  }

  return {
    clearTelemetryStateCache,
    resetTelemetryPanels,
    updateTopBar,
  };
}


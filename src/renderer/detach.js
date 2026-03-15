const DETACH_TITLES = {
  dashboard: 'Dashboard',
  timing: 'Timing Tower',
  laphistory: 'Player Lap History',
  analysis: 'Race Analysis',
  trackmap: 'Track Map',
  vehicle: 'Vehicle Status',
  session: 'Session',
  engineer: 'AI Engineer',
  radio: 'Radio Config',
  settings: 'Settings',
};

export function createDetachContext(locationSearch, raceEngineerApi) {
  const urlParams = new URLSearchParams(locationSearch);
  const DETACH_PAGE = (urlParams.get('detach') || '').trim().toLowerCase();
  const DETACH_TITLE = (urlParams.get('title') || '').trim();
  const TTS_PRIMARY_WINDOW = !DETACH_PAGE;

  function setDetachedWindowTitle(pageKey = DETACH_PAGE) {
    const desired = DETACH_TITLE || DETACH_TITLES[pageKey] || 'Race Engineer';
    document.title = desired;
    if (raceEngineerApi?.setWindowTitle) {
      raceEngineerApi.setWindowTitle(desired);
    }
  }

  if (DETACH_PAGE) {
    setDetachedWindowTitle();
  }

  return {
    DETACH_PAGE,
    TTS_PRIMARY_WINDOW,
    setDetachedWindowTitle,
  };
}

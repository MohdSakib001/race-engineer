export function createSessionPage(deps) {
  const {
    state,
    el,
    fmtCountdown,
    weatherIcon,
    safetyCarLabel,
  } = deps;

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

  return { buildSession, updateSession };
}

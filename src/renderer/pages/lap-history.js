function fmtSignedDelta(ms) {
  if (!Number.isFinite(ms)) return '-';
  const seconds = ms / 1000;
  return `${seconds >= 0 ? '+' : '-'}${Math.abs(seconds).toFixed(3)}s`;
}

export function createLapHistoryPage(deps) {
  const {
    state,
    el,
    fmt,
    fmtSector,
    tyreCompoundLabel,
  } = deps;

  let lastRenderKey = '';

  function buildLapHistory() {
    const page = el('page-laphistory');
    if (!page) return;
    page.innerHTML = `
      <div class="lap-history-page">
        <div class="page-toolbar">
          <span class="page-toolbar-status" id="lap-history-status"></span>
          <div class="page-toolbar-actions">
            <span class="lap-history-hint">Opened from the player row in Timing Tower</span>
          </div>
        </div>
        <div class="lap-history-layout">
          <div class="panel">
            <div class="panel-header">Session Summary</div>
            <div class="panel-body">
              <div class="lap-history-summary" id="lap-history-summary"></div>
            </div>
          </div>
          <div class="panel lap-history-table-panel">
            <div class="panel-header">Player Lap Times</div>
            <div class="lap-history-table-wrap">
              <table class="timing-table lap-history-table">
                <thead>
                  <tr>
                    <th>Lap</th>
                    <th class="right">Time</th>
                    <th class="right">Delta</th>
                    <th class="right">S1</th>
                    <th class="right">S2</th>
                    <th class="right">S3</th>
                    <th>Tyre</th>
                    <th class="center">Age</th>
                    <th class="center">Pit</th>
                    <th class="center">Invalid</th>
                    <th class="right">Completed</th>
                  </tr>
                </thead>
                <tbody id="lap-history-body">
                  <tr><td colspan="11"><div class="empty-state"><div class="empty-icon"></div><div class="empty-text">Waiting for completed laps</div></div></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function buildSummaryHtml(playerName, liveLap, completedLaps, bestLapMs) {
    const validLaps = completedLaps.filter((lap) => !lap.invalid && !lap.pitLap && lap.lapTimeMs > 0);
    const averageMs = validLaps.length
      ? Math.round(validLaps.reduce((sum, lap) => sum + lap.lapTimeMs, 0) / validLaps.length)
      : null;
    const totalMs = completedLaps.reduce((sum, lap) => sum + (lap.lapTimeMs || 0), 0);
    const sessionLabel = state.analysis?.sessionLabel || state.session?.trackName || 'Race';
    const liveStatus = liveLap
      ? `Live lap ${liveLap.currentLapNum}: ${fmt(liveLap.currentLapTimeMs)}`
      : (state.connected ? 'Waiting for live lap data' : 'Saved session data');

    return `
      <div class="lap-history-chip">
        <span class="lap-history-chip-label">Driver</span>
        <span class="lap-history-chip-value">${playerName}</span>
      </div>
      <div class="lap-history-chip">
        <span class="lap-history-chip-label">Session</span>
        <span class="lap-history-chip-value">${sessionLabel}</span>
      </div>
      <div class="lap-history-chip">
        <span class="lap-history-chip-label">Status</span>
        <span class="lap-history-chip-value">${liveStatus}</span>
      </div>
      <div class="lap-history-chip">
        <span class="lap-history-chip-label">Completed</span>
        <span class="lap-history-chip-value">${completedLaps.length}</span>
      </div>
      <div class="lap-history-chip">
        <span class="lap-history-chip-label">Best lap</span>
        <span class="lap-history-chip-value">${bestLapMs ? fmt(bestLapMs) : '-'}</span>
      </div>
      <div class="lap-history-chip">
        <span class="lap-history-chip-label">Average</span>
        <span class="lap-history-chip-value">${averageMs ? fmt(averageMs) : '-'}</span>
      </div>
      <div class="lap-history-chip">
        <span class="lap-history-chip-label">Total time</span>
        <span class="lap-history-chip-value">${totalMs > 0 ? fmt(totalMs) : '-'}</span>
      </div>
    `;
  }

  function updateLapHistory(force = false) {
    const body = el('lap-history-body');
    const summary = el('lap-history-summary');
    const status = el('lap-history-status');
    if (!body || !summary) return;

    const completedLaps = Array.isArray(state.analysis?.completedLaps) ? state.analysis.completedLaps : [];
    const playerName = state.participants?.participants?.[state.playerCarIndex]?.name || 'Player';
    const liveLap = state.lapData?.[state.playerCarIndex] || null;
    const bestLapMs = completedLaps
      .filter((lap) => !lap.invalid && !lap.pitLap && lap.lapTimeMs > 0)
      .reduce((best, lap) => (best == null || lap.lapTimeMs < best ? lap.lapTimeMs : best), null);
    const renderKey = `${state.connected ? 1 : 0}|${state.analysis?.sessionLabel || ''}|${completedLaps.length}|${completedLaps[completedLaps.length - 1]?.lapNumber || 0}|${liveLap?.currentLapNum || 0}|${liveLap?.currentLapTimeMs || 0}`;
    if (!force && renderKey === lastRenderKey) return;
    lastRenderKey = renderKey;

    summary.innerHTML = buildSummaryHtml(playerName, liveLap, completedLaps, bestLapMs);
    if (status) {
      status.textContent = state.connected ? 'Live lap history' : 'Showing last recorded session';
    }

    if (completedLaps.length === 0) {
      body.innerHTML = '<tr><td colspan="11"><div class="empty-state"><div class="empty-icon"></div><div class="empty-text">Waiting for completed laps</div></div></td></tr>';
      return;
    }

    body.innerHTML = completedLaps.map((lap) => {
      const deltaMs = Number.isFinite(bestLapMs) ? lap.lapTimeMs - bestLapMs : null;
      const tyreLabel = lap.tyreCompound != null ? tyreCompoundLabel({ visualTyreCompound: lap.tyreCompound }) : '';
      const completedAt = lap.completedAt ? new Date(lap.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
      return `
        <tr>
          <td class="pos-cell">${lap.lapNumber}</td>
          <td class="right lap-time">${fmt(lap.lapTimeMs)}</td>
          <td class="right gap-time ${deltaMs != null && deltaMs <= 0 ? 'text-good' : ''}">${deltaMs != null ? fmtSignedDelta(deltaMs) : '-'}</td>
          <td class="right sector-time">${fmtSector(lap.sector1TimeMs)}</td>
          <td class="right sector-time">${fmtSector(lap.sector2TimeMs)}</td>
          <td class="right sector-time">${fmtSector(lap.sector3TimeMs)}</td>
          <td>${tyreLabel || '-'}</td>
          <td class="center">${lap.tyreAgeLaps ?? '-'}</td>
          <td class="center">${lap.pitLap ? '<span class="pit-badge in-lane">YES</span>' : '<span class="pit-badge">NO</span>'}</td>
          <td class="center">${lap.invalid ? '<span class="status-badge dnf">YES</span>' : '<span class="status-badge finished">NO</span>'}</td>
          <td class="right gap-time">${completedAt}</td>
        </tr>
      `;
    }).join('');
  }

  return { buildLapHistory, updateLapHistory };
}

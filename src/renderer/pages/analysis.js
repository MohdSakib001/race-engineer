function fmtSignedSeconds(ms) {
  if (!Number.isFinite(ms)) return '-';
  const seconds = ms / 1000;
  return `${seconds >= 0 ? '+' : '-'}${Math.abs(seconds).toFixed(3)}s`;
}

function formatFuel(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)} kg` : '-';
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '-';
}

const TYRE_WEAR_LABELS = ['FL', 'FR', 'RL', 'RR'];

function formatWearSummary(values) {
  if (!Array.isArray(values) || values.every((value) => !Number.isFinite(value))) return '-';
  return values.map((value, index) => `${TYRE_WEAR_LABELS[index]} ${Number.isFinite(value) ? value.toFixed(1) : '-'}`).join(' | ');
}

function buildPolyline(trace, xForProgress, yForTime) {
  const samples = Array.isArray(trace?.samples) ? trace.samples : [];
  if (samples.length === 0) return '';
  return samples.map((sample, index) => {
    const x = xForProgress(sample.progress);
    const y = yForTime(sample.timeMs);
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function clampPercent(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function buildMetricPolyline(trace, xForProgress, yForValue, accessor) {
  const samples = Array.isArray(trace?.samples) ? trace.samples : [];
  let pointCount = 0;
  return samples.map((sample) => {
    const value = accessor(sample);
    if (!Number.isFinite(value)) return '';
    const x = xForProgress(sample.progress);
    const y = yForValue(value);
    const command = `${pointCount === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    pointCount += 1;
    return command;
  }).filter(Boolean).join(' ');
}

function getTraceWearSnapshot(trace, side = 'end') {
  const samples = Array.isArray(trace?.samples) ? trace.samples : [];
  const iterable = side === 'start' ? samples : [...samples].reverse();
  for (const sample of iterable) {
    const wear = Array.isArray(sample?.tyreWearPct) ? sample.tyreWearPct : null;
    if (wear?.some((value) => Number.isFinite(value))) return wear;
  }
  return null;
}

function formatWearSnapshot(values) {
  if (!Array.isArray(values) || values.every((value) => !Number.isFinite(value))) return '-';
  return values.map((value, index) => `${TYRE_WEAR_LABELS[index]} ${Number.isFinite(value) ? value.toFixed(1) : '-'}`).join(' · ');
}

function getWearScale(trace, fallbackWear = null) {
  const values = [];
  for (const sample of Array.isArray(trace?.samples) ? trace.samples : []) {
    for (const wear of Array.isArray(sample?.tyreWearPct) ? sample.tyreWearPct : []) {
      if (Number.isFinite(wear)) values.push(wear);
    }
  }
  for (const wear of Array.isArray(fallbackWear) ? fallbackWear : []) {
    if (Number.isFinite(wear)) values.push(wear);
  }
  if (values.length === 0) return { min: 0, max: 100 };
  const minWear = Math.min(...values);
  const maxWear = Math.max(...values);
  const padding = Math.max(0.35, (maxWear - minWear) * 0.35);
  let min = Math.max(0, +(minWear - padding).toFixed(2));
  let max = Math.min(100, +(maxWear + padding).toFixed(2));
  if ((max - min) < 1.2) {
    const center = (maxWear + minWear) / 2;
    min = Math.max(0, +(center - 0.7).toFixed(2));
    max = Math.min(100, +(center + 0.7).toFixed(2));
  }
  return { min, max };
}

function buildProgressAxis(width, height, paddingLeft, paddingTop, plotWidth, plotHeight, tickCount = 5) {
  return Array.from({ length: tickCount }, (_, index) => {
    const progress = index / (tickCount - 1);
    const x = paddingLeft + (plotWidth * progress);
    return `<line x1="${x}" y1="${paddingTop}" x2="${x}" y2="${paddingTop + plotHeight}" class="analysis-grid-line" />
      <text x="${x}" y="${height - 8}" class="analysis-axis-label">${Math.round(progress * 100)}%</text>`;
  }).join('');
}

function buildValueAxis(minValue, maxValue, tickCount, width, paddingLeft, paddingTop, plotWidth, plotHeight, formatter) {
  return Array.from({ length: tickCount }, (_, index) => {
    const factor = index / (tickCount - 1);
    const value = maxValue - ((maxValue - minValue) * factor);
    const y = paddingTop + (plotHeight * factor);
    return `<line x1="${paddingLeft}" y1="${y}" x2="${paddingLeft + plotWidth}" y2="${y}" class="analysis-grid-line" />
      <text x="6" y="${y + 4}" class="analysis-axis-label">${formatter(value)}</text>`;
  }).join('');
}

function renderTelemetryCard(fmt, lap, trace, themeClass) {
  const width = 360;
  const height = 182;
  const paddingLeft = 34;
  const paddingRight = 14;
  const paddingTop = 14;
  const paddingBottom = 24;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;
  const xForProgress = (progress) => paddingLeft + (plotWidth * progress);
  const progressAxis = buildProgressAxis(width, height, paddingLeft, paddingTop, plotWidth, plotHeight);
  const yForInput = (value) => paddingTop + plotHeight - ((clampPercent(value) / 100) * plotHeight);
  const throttlePath = buildMetricPolyline(trace, xForProgress, yForInput, (sample) => sample.throttlePct);
  const brakePath = buildMetricPolyline(trace, xForProgress, yForInput, (sample) => sample.brakePct);
  const hasInputData = Boolean(throttlePath || brakePath);
  const inputAxis = buildValueAxis(0, 100, 3, width, paddingLeft, paddingTop, plotWidth, plotHeight, (value) => `${Math.round(value)}%`);
  const wearStart = getTraceWearSnapshot(trace, 'start') || lap?.tyreWearStartPct || null;
  const wearEnd = getTraceWearSnapshot(trace, 'end') || lap?.tyreWearEndPct || null;
  const wearScale = getWearScale(trace, wearEnd);
  const wearRange = Math.max(0.5, wearScale.max - wearScale.min);
  const yForWear = (value) => paddingTop + plotHeight - (((value - wearScale.min) / wearRange) * plotHeight);
  const wearPaths = TYRE_WEAR_LABELS.map((_, index) => buildMetricPolyline(trace, xForProgress, yForWear, (sample) => sample.tyreWearPct?.[index]));
  const hasWearData = wearPaths.some(Boolean);
  const wearAxis = buildValueAxis(wearScale.min, wearScale.max, 3, width, paddingLeft, paddingTop, plotWidth, plotHeight, (value) => `${value.toFixed(1)}%`);

  return `
    <div class="analysis-trace-card ${themeClass}">
      <div class="analysis-trace-head">
        <span class="analysis-trace-title">Lap ${lap.lapNumber} Full-Lap Telemetry</span>
        <span class="analysis-trace-meta">${fmt(lap.lapTimeMs)}</span>
      </div>
      <div class="analysis-mini-chart">
        <div class="analysis-mini-chart-title">Throttle / Brake Inputs</div>
        ${hasInputData ? `
          <svg class="analysis-graph" viewBox="0 0 ${width} ${height}" role="img" aria-label="Lap ${lap.lapNumber} throttle and brake graph">
            ${progressAxis}
            ${inputAxis}
            ${throttlePath ? `<path d="${throttlePath}" class="analysis-line metric-throttle" />` : ''}
            ${brakePath ? `<path d="${brakePath}" class="analysis-line metric-brake" />` : ''}
          </svg>
        ` : '<div class="analysis-mini-empty">No pedal trace captured.</div>'}
        <div class="analysis-trace-legend">
          <span class="analysis-legend-item"><span class="analysis-legend-swatch throttle"></span>Throttle</span>
          <span class="analysis-legend-item"><span class="analysis-legend-swatch brake"></span>Brake</span>
        </div>
      </div>
      <div class="analysis-mini-chart">
        <div class="analysis-mini-chart-title">Tyre Wear Across Lap</div>
        ${hasWearData ? `
          <svg class="analysis-graph" viewBox="0 0 ${width} ${height}" role="img" aria-label="Lap ${lap.lapNumber} tyre wear graph">
            ${progressAxis}
            ${wearAxis}
            ${wearPaths.map((path, index) => path ? `<path d="${path}" class="analysis-line wear-${index}" />` : '').join('')}
          </svg>
        ` : '<div class="analysis-mini-empty">No tyre wear trace captured.</div>'}
        <div class="analysis-trace-legend">
          ${TYRE_WEAR_LABELS.map((label, index) => `<span class="analysis-legend-item"><span class="analysis-legend-swatch wear-${index}"></span>${label}</span>`).join('')}
        </div>
        <div class="analysis-wear-summary">
          <span class="analysis-wear-pill">Start: ${formatWearSummary(wearStart)}</span>
          <span class="analysis-wear-pill">End: ${formatWearSummary(wearEnd)}</span>
        </div>
      </div>
    </div>
  `;
}

function ensureSelectOptions(selectEl, lapNumbers, selectedValue) {
  if (!selectEl) return;
  const optionKey = `${lapNumbers.join(',')}|${selectedValue ?? ''}`;
  if (selectEl.dataset.optionKey === optionKey) return;
  selectEl.dataset.optionKey = optionKey;
  selectEl.innerHTML = lapNumbers.map((lapNumber) => `
    <option value="${lapNumber}" ${lapNumber === selectedValue ? 'selected' : ''}>Lap ${lapNumber}</option>
  `).join('');
}

export function createAnalysisPage(deps) {
  const {
    state,
    el,
    fmt,
    fmtSector,
    getClassificationCars,
    getRemainingRaceDistanceLaps,
    tyreCompoundLabel,
    saveSnapshot,
    setPitLossEstimate,
  } = deps;

  let lastLapListKey = '';
  let lastTableKey = '';
  let lastSnapshotKey = '';

  function buildAnalysis() {
    const page = el('page-analysis');
    if (!page) return;
    page.innerHTML = `
      <div class="analysis-page">
        <div class="page-toolbar">
          <span class="page-toolbar-status" id="analysis-save-status"></span>
          <div class="page-toolbar-actions">
            <button class="popout-btn" id="analysis-save-btn">Save Snapshot</button>
          </div>
        </div>
        <div class="analysis-layout">
          <div class="analysis-main">
            <div class="grid-4 analysis-summary-grid">
              <div class="panel">
                <div class="panel-header">Fuel Window</div>
                <div class="panel-body analysis-summary-card">
                  <div class="stat-row"><span class="stat-label">Start fuel</span><span class="stat-value mono" id="analysis-start-fuel">-</span></div>
                  <div class="stat-row"><span class="stat-label">Current fuel</span><span class="stat-value mono" id="analysis-current-fuel">-</span></div>
                  <div class="stat-row"><span class="stat-label">Projected finish</span><span class="stat-value mono" id="analysis-finish-fuel">-</span></div>
                  <div class="stat-row"><span class="stat-label">Fuel delta</span><span class="stat-value mono" id="analysis-fuel-delta">-</span></div>
                </div>
              </div>
              <div class="panel">
                <div class="panel-header">Pit Loss Estimate</div>
                <div class="panel-body analysis-summary-card">
                  <div class="settings-field">
                    <label>Time loss (seconds)</label>
                    <input type="number" class="settings-input" id="analysis-pit-loss-input" min="5" max="120" step="0.5">
                  </div>
                  <div class="stat-row"><span class="stat-label">Gap behind</span><span class="stat-value mono" id="analysis-gap-behind">-</span></div>
                  <div class="stat-row"><span class="stat-label">Projected rejoin</span><span class="stat-value mono" id="analysis-rejoin-pos">-</span></div>
                  <div class="analysis-inline-note" id="analysis-pit-note">Waiting for race gaps.</div>
                </div>
              </div>
              <div class="panel">
                <div class="panel-header">Lap Summary</div>
                <div class="panel-body analysis-summary-card">
                  <div class="stat-row"><span class="stat-label">Completed laps</span><span class="stat-value mono" id="analysis-lap-count">0</span></div>
                  <div class="stat-row"><span class="stat-label">Best lap</span><span class="stat-value mono" id="analysis-best-lap">-</span></div>
                  <div class="stat-row"><span class="stat-label">Average lap</span><span class="stat-value mono" id="analysis-avg-lap">-</span></div>
                  <div class="stat-row"><span class="stat-label">Total lap time</span><span class="stat-value mono" id="analysis-total-time">-</span></div>
                </div>
              </div>
              <div class="panel">
                <div class="panel-header">Storage</div>
                <div class="panel-body analysis-summary-card">
                  <div class="stat-row"><span class="stat-label">Draft saved</span><span class="stat-value mono" id="analysis-last-draft">-</span></div>
                  <div class="stat-row"><span class="stat-label">Snapshot saved</span><span class="stat-value mono" id="analysis-last-snapshot">-</span></div>
                  <div class="stat-row"><span class="stat-label">Remote sync</span><span class="stat-value mono" id="analysis-remote-mode">Off</span></div>
                  <div class="analysis-inline-note" id="analysis-storage-note">Local draft active.</div>
                </div>
              </div>
            </div>

            <div class="panel">
              <div class="panel-header">2 Lap Comparison</div>
              <div class="panel-body">
                <div class="analysis-compare-toolbar">
                  <div class="settings-field">
                    <label>Lap A</label>
                    <select class="settings-input" id="analysis-compare-a"></select>
                  </div>
                  <div class="settings-field">
                    <label>Lap B</label>
                    <select class="settings-input" id="analysis-compare-b"></select>
                  </div>
                  <button class="settings-save-btn" id="analysis-swap-laps">Swap</button>
                </div>
                <div class="analysis-compare-summary" id="analysis-compare-summary"></div>
                <div class="analysis-graph-shell" id="analysis-graph-shell">
                  <div class="empty-state">
                    <div class="empty-icon"></div>
                    <div class="empty-text">Complete at least two laps to compare traces.</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="panel analysis-table-panel">
              <div class="panel-header">Whole Race Lap Table</div>
              <div class="analysis-table-wrap">
                <table class="timing-table analysis-table">
                  <thead>
                    <tr>
                      <th>Lap</th>
                      <th class="right">Time</th>
                      <th class="right">Delta</th>
                      <th class="right">S1</th>
                      <th class="right">S2</th>
                      <th class="right">S3</th>
                      <th class="right">Fuel End</th>
                      <th class="right">Fuel Used</th>
                      <th>Tyre</th>
                      <th class="center">Wear End</th>
                      <th class="center">Age</th>
                      <th class="center">Pit</th>
                      <th class="center">Invalid</th>
                    </tr>
                  </thead>
                  <tbody id="analysis-lap-table-body">
                    <tr><td colspan="13"><div class="empty-state"><div class="empty-icon"></div><div class="empty-text">Waiting for completed laps</div></div></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="analysis-side">
            <div class="panel">
              <div class="panel-header">Recent Snapshots</div>
              <div class="panel-body" id="analysis-snapshot-list">
                <div class="empty-state">
                  <div class="empty-icon"></div>
                  <div class="empty-text">No saved snapshots yet.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    el('analysis-save-btn')?.addEventListener('click', async () => {
      const button = el('analysis-save-btn');
      if (button) {
        button.disabled = true;
        button.textContent = 'Saving...';
      }
      const result = await saveSnapshot();
      const statusEl = el('analysis-save-status');
      if (statusEl) {
        statusEl.textContent = result?.error || result?.message || 'Snapshot saved.';
      }
      if (button) {
        button.disabled = false;
        button.textContent = 'Save Snapshot';
      }
      updateAnalysis(true);
    });

    el('analysis-pit-loss-input')?.addEventListener('change', () => {
      const input = el('analysis-pit-loss-input');
      setPitLossEstimate(input?.value);
      updateAnalysis(true);
    });

    el('analysis-compare-a')?.addEventListener('change', () => {
      const nextValue = Number(el('analysis-compare-a')?.value);
      state.analysis.compareLapA = Number.isFinite(nextValue) ? nextValue : null;
      updateAnalysis(true);
    });

    el('analysis-compare-b')?.addEventListener('change', () => {
      const nextValue = Number(el('analysis-compare-b')?.value);
      state.analysis.compareLapB = Number.isFinite(nextValue) ? nextValue : null;
      updateAnalysis(true);
    });

    el('analysis-swap-laps')?.addEventListener('click', () => {
      const currentA = state.analysis.compareLapA;
      state.analysis.compareLapA = state.analysis.compareLapB;
      state.analysis.compareLapB = currentA;
      updateAnalysis(true);
    });
  }

  function updateSummary() {
    const completedLaps = state.analysis.completedLaps;
    const playerLap = state.lapData?.[state.playerCarIndex];
    const currentFuel = state.analysis.currentFuelKg;
    const cleanLaps = completedLaps.filter((lap) => !lap.pitLap && !lap.invalid && lap.lapTimeMs > 0);
    const averageFuelBurn = completedLaps
      .map((lap) => lap.fuelUsedKg)
      .filter((value) => Number.isFinite(value) && value > 0 && value < 10);
    const avgFuelPerLap = averageFuelBurn.length
      ? averageFuelBurn.reduce((sum, value) => sum + value, 0) / averageFuelBurn.length
      : null;
    const remainingRaceLaps = getRemainingRaceDistanceLaps(state.session, playerLap);
    let projectedFinishFuel = null;
    if (Number.isFinite(currentFuel) && Number.isFinite(avgFuelPerLap)) {
      projectedFinishFuel = currentFuel - (avgFuelPerLap * remainingRaceLaps);
    } else if (Number.isFinite(currentFuel) && Number.isFinite(state.status?.fuelRemainingLaps) && state.status.fuelRemainingLaps > 0) {
      const derivedBurn = currentFuel / state.status.fuelRemainingLaps;
      projectedFinishFuel = currentFuel - (derivedBurn * remainingRaceLaps);
    }

    const bestLapMs = cleanLaps.length ? Math.min(...cleanLaps.map((lap) => lap.lapTimeMs)) : null;
    const avgLapMs = cleanLaps.length
      ? cleanLaps.reduce((sum, lap) => sum + lap.lapTimeMs, 0) / cleanLaps.length
      : null;
    const totalLapMs = completedLaps.reduce((sum, lap) => sum + (lap.lapTimeMs || 0), 0);

    el('analysis-start-fuel').textContent = formatFuel(state.analysis.startFuelKg);
    el('analysis-current-fuel').textContent = formatFuel(currentFuel);
    el('analysis-finish-fuel').textContent = formatFuel(projectedFinishFuel);

    const fuelDeltaEl = el('analysis-fuel-delta');
    const fuelDelta = Number.isFinite(projectedFinishFuel) ? projectedFinishFuel : null;
    if (fuelDeltaEl) {
      fuelDeltaEl.textContent = Number.isFinite(fuelDelta) ? `${fuelDelta >= 0 ? '+' : ''}${fuelDelta.toFixed(2)} kg` : '-';
      fuelDeltaEl.className = `stat-value mono ${Number.isFinite(fuelDelta) ? (fuelDelta >= 0 ? 'text-good' : 'text-bad') : ''}`;
    }

    el('analysis-lap-count').textContent = String(completedLaps.length);
    el('analysis-best-lap').textContent = bestLapMs ? fmt(bestLapMs) : '-';
    el('analysis-avg-lap').textContent = avgLapMs ? fmt(Math.round(avgLapMs)) : '-';
    el('analysis-total-time').textContent = totalLapMs > 0 ? fmt(totalLapMs) : '-';

    el('analysis-last-draft').textContent = state.analysis.storage.lastDraftSavedAt || '-';
    el('analysis-last-snapshot').textContent = state.analysis.storage.lastSnapshotSavedAt || '-';
    el('analysis-remote-mode').textContent = state.analysis.storageConfig.remoteSyncEnabled ? 'Supabase' : 'Off';
    el('analysis-storage-note').textContent = state.analysis.storage.lastSaveStatus || 'Local draft active.';
    el('analysis-save-status').textContent = state.analysis.storage.lastSaveStatus || '';

    const pitLossInput = el('analysis-pit-loss-input');
    if (pitLossInput && pitLossInput.value !== String(state.analysis.pitLossEstimateSec)) {
      pitLossInput.value = String(state.analysis.pitLossEstimateSec);
    }
  }

  function updatePitEstimate() {
    const playerLap = state.lapData?.[state.playerCarIndex];
    const gapBehindEl = el('analysis-gap-behind');
    const rejoinEl = el('analysis-rejoin-pos');
    const noteEl = el('analysis-pit-note');

    if (!playerLap || !Array.isArray(state.lapData) || !state.session) {
      if (gapBehindEl) gapBehindEl.textContent = '-';
      if (rejoinEl) rejoinEl.textContent = '-';
      if (noteEl) noteEl.textContent = 'Waiting for race gaps.';
      return;
    }

    const cars = getClassificationCars(state.lapData);
    const carBehind = cars.find((car) => car.carPosition === playerLap.carPosition + 1);
    const gapBehindMs = Number(carBehind?.deltaToCarAheadMs) || 0;
    const playerLeaderGap = playerLap.carPosition === 1 ? 0 : (Number(playerLap.deltaToLeaderMs) || 0);
    const pitLossMs = state.analysis.pitLossEstimateSec * 1000;

    const projectedLosses = cars.filter((car) => car.carPosition > playerLap.carPosition).filter((car) => {
      const carGapMs = playerLap.carPosition === 1
        ? (Number(car.deltaToLeaderMs) || 0)
        : (Number(car.deltaToLeaderMs) || 0) - playerLeaderGap;
      return carGapMs > 0 && carGapMs < pitLossMs;
    }).length;

    const projectedPos = Math.min(cars.length, playerLap.carPosition + projectedLosses);
    const gapDeltaSec = (gapBehindMs - pitLossMs) / 1000;

    if (gapBehindEl) gapBehindEl.textContent = gapBehindMs > 0 ? `${(gapBehindMs / 1000).toFixed(2)}s` : 'Leader';
    if (rejoinEl) rejoinEl.textContent = `P${projectedPos}`;
    if (noteEl) {
      if (gapBehindMs <= 0) {
        noteEl.textContent = 'No direct gap behind available yet.';
      } else if (gapDeltaSec >= 0) {
        noteEl.textContent = `Free stop margin: ${gapDeltaSec.toFixed(2)}s.`;
        noteEl.className = 'analysis-inline-note text-good';
      } else {
        noteEl.textContent = `Pit loss is ${Math.abs(gapDeltaSec).toFixed(2)}s larger than the gap behind.`;
        noteEl.className = 'analysis-inline-note text-bad';
      }
    }
  }

  function updateComparison(force = false) {
    const lapNumbers = state.analysis.completedLaps.map((entry) => entry.lapNumber).sort((a, b) => a - b);
    const listKey = `${lapNumbers.join(',')}|${state.analysis.compareLapA}|${state.analysis.compareLapB}`;
    if (force || listKey !== lastLapListKey) {
      ensureSelectOptions(el('analysis-compare-a'), lapNumbers, state.analysis.compareLapA);
      ensureSelectOptions(el('analysis-compare-b'), lapNumbers, state.analysis.compareLapB);
      lastLapListKey = listKey;
    }

    const lapA = state.analysis.completedLaps.find((lap) => lap.lapNumber === state.analysis.compareLapA) || null;
    const lapB = state.analysis.completedLaps.find((lap) => lap.lapNumber === state.analysis.compareLapB) || null;
    const traceA = lapA ? state.analysis.lapTraces[lapA.lapNumber] : null;
    const traceB = lapB ? state.analysis.lapTraces[lapB.lapNumber] : null;
    const graphShell = el('analysis-graph-shell');
    const summaryEl = el('analysis-compare-summary');

    if (!lapA || !lapB || !traceA || !traceB || !graphShell || !summaryEl) {
      if (summaryEl) summaryEl.innerHTML = '';
      if (graphShell) {
        graphShell.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon"></div>
            <div class="empty-text">Complete at least two laps to compare traces.</div>
          </div>
        `;
      }
      return;
    }

    const compareKey = `${lapA.lapNumber}:${lapB.lapNumber}:${traceA.samples?.length || 0}:${traceB.samples?.length || 0}`;
    if (!force && graphShell.dataset.graphKey === compareKey) return;
    graphShell.dataset.graphKey = compareKey;

    const width = 760;
    const height = 272;
    const paddingLeft = 46;
    const paddingRight = 20;
    const paddingTop = 18;
    const paddingBottom = 30;
    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;
    const maxTimeMs = Math.max(lapA.lapTimeMs, lapB.lapTimeMs);
    const xForProgress = (progress) => paddingLeft + (plotWidth * progress);
    const yForTime = (timeMs) => paddingTop + plotHeight - ((timeMs / maxTimeMs) * plotHeight);
    const pathA = buildPolyline(traceA, xForProgress, yForTime);
    const pathB = buildPolyline(traceB, xForProgress, yForTime);
    const lapDeltaMs = lapB.lapTimeMs - lapA.lapTimeMs;

    summaryEl.innerHTML = `
      <div class="analysis-compare-pill lap-a">Lap ${lapA.lapNumber}: ${fmt(lapA.lapTimeMs)}</div>
      <div class="analysis-compare-pill lap-b">Lap ${lapB.lapNumber}: ${fmt(lapB.lapTimeMs)}</div>
      <div class="analysis-compare-pill delta ${lapDeltaMs <= 0 ? 'text-good' : 'text-bad'}">Delta: ${fmtSignedSeconds(lapDeltaMs)}</div>
      <div class="analysis-compare-pill">S1: ${fmtSector(lapA.sector1TimeMs)} / ${fmtSector(lapB.sector1TimeMs)}</div>
      <div class="analysis-compare-pill">Wear A: ${formatWearSummary(lapA.tyreWearEndPct)}</div>
      <div class="analysis-compare-pill">Wear B: ${formatWearSummary(lapB.tyreWearEndPct)}</div>
    `;

    const gridLines = Array.from({ length: 5 }, (_, index) => {
      const progress = index / 4;
      const x = xForProgress(progress);
      return `<line x1="${x}" y1="${paddingTop}" x2="${x}" y2="${paddingTop + plotHeight}" class="analysis-grid-line" />
        <text x="${x}" y="${height - 8}" class="analysis-axis-label">${Math.round(progress * 100)}%</text>`;
    }).join('');

    const timeTicks = Array.from({ length: 5 }, (_, index) => {
      const factor = index / 4;
      const timeMs = Math.round(maxTimeMs * (1 - factor));
      const y = paddingTop + (plotHeight * factor);
      return `<line x1="${paddingLeft}" y1="${y}" x2="${paddingLeft + plotWidth}" y2="${y}" class="analysis-grid-line" />
        <text x="8" y="${y + 4}" class="analysis-axis-label">${fmt(timeMs)}</text>`;
    }).join('');

    graphShell.innerHTML = `
      <div class="analysis-graph-stack">
        <div class="analysis-chart-card">
          <div class="analysis-mini-chart-title">Lap Time Trace</div>
          <svg class="analysis-graph" viewBox="0 0 ${width} ${height}" role="img" aria-label="Lap comparison graph">
            ${gridLines}
            ${timeTicks}
            <path d="${pathA}" class="analysis-line lap-a" />
            <path d="${pathB}" class="analysis-line lap-b" />
          </svg>
        </div>
        <div class="analysis-detail-grid">
          ${renderTelemetryCard(fmt, lapA, traceA, 'lap-a')}
          ${renderTelemetryCard(fmt, lapB, traceB, 'lap-b')}
        </div>
      </div>
    `;
  }

  function updateLapTable(force = false) {
    const body = el('analysis-lap-table-body');
    if (!body) return;

    const bestReference = state.analysis.completedLaps
      .filter((lap) => !lap.pitLap && !lap.invalid && lap.lapTimeMs > 0)
      .reduce((best, lap) => (best == null || lap.lapTimeMs < best ? lap.lapTimeMs : best), null);
    const tableKey = `${state.analysis.completedLaps.length}|${bestReference || 0}|${state.analysis.completedLaps[state.analysis.completedLaps.length - 1]?.lapNumber || 0}`;
    if (!force && tableKey === lastTableKey) return;
    lastTableKey = tableKey;

    if (state.analysis.completedLaps.length === 0) {
      body.innerHTML = '<tr><td colspan="13"><div class="empty-state"><div class="empty-icon"></div><div class="empty-text">Waiting for completed laps</div></div></td></tr>';
      return;
    }

    body.innerHTML = state.analysis.completedLaps.map((lap) => {
      const deltaMs = Number.isFinite(bestReference) ? lap.lapTimeMs - bestReference : null;
      const tyreLabel = lap.tyreCompound != null ? tyreCompoundLabel({ visualTyreCompound: lap.tyreCompound }) : '';
      const wearEnd = formatWearSummary(lap.tyreWearEndPct);
      return `
        <tr>
          <td class="pos-cell">${lap.lapNumber}</td>
          <td class="right lap-time">${fmt(lap.lapTimeMs)}</td>
          <td class="right gap-time ${deltaMs != null && deltaMs <= 0 ? 'text-good' : ''}">${deltaMs != null ? fmtSignedSeconds(deltaMs) : '-'}</td>
          <td class="right sector-time">${fmtSector(lap.sector1TimeMs)}</td>
          <td class="right sector-time">${fmtSector(lap.sector2TimeMs)}</td>
          <td class="right sector-time">${fmtSector(lap.sector3TimeMs)}</td>
          <td class="right gap-time">${formatFuel(lap.fuelAtEndKg)}</td>
          <td class="right gap-time">${Number.isFinite(lap.fuelUsedKg) ? `${lap.fuelUsedKg.toFixed(2)} kg` : '-'}</td>
          <td>${tyreLabel || '-'}</td>
          <td class="center">${wearEnd}</td>
          <td class="center">${lap.tyreAgeLaps ?? '-'}</td>
          <td class="center">${lap.pitLap ? '<span class="pit-badge in-lane">YES</span>' : '<span class="pit-badge">NO</span>'}</td>
          <td class="center">${lap.invalid ? '<span class="status-badge dnf">YES</span>' : '<span class="status-badge finished">NO</span>'}</td>
        </tr>
      `;
    }).join('');
  }

  function updateSnapshotList(force = false) {
    const listEl = el('analysis-snapshot-list');
    if (!listEl) return;
    const snapshots = Array.isArray(state.analysis.storage.recentSnapshots)
      ? state.analysis.storage.recentSnapshots
      : [];
    const snapshotKey = snapshots.map((entry) => `${entry.id}:${entry.savedAt}:${entry.remoteSynced ? 1 : 0}`).join('|');
    if (!force && snapshotKey === lastSnapshotKey) return;
    lastSnapshotKey = snapshotKey;

    if (snapshots.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"></div>
          <div class="empty-text">No saved snapshots yet.</div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = snapshots.map((entry) => `
      <div class="analysis-snapshot-card">
        <div class="analysis-snapshot-head">
          <span class="analysis-snapshot-title">${entry.sessionLabel || 'Race Analysis'}</span>
          <span class="analysis-snapshot-time">${entry.savedAt || '-'}</span>
        </div>
        <div class="analysis-snapshot-meta">
          <span>${entry.trackName || '-'}</span>
          <span>${entry.sessionTypeName || '-'}</span>
          <span>${entry.lapCount || 0} laps</span>
        </div>
        <div class="analysis-inline-note ${entry.remoteSynced ? 'text-good' : entry.remoteError ? 'text-warn' : ''}">
          ${entry.remoteSynced ? 'Supabase synced.' : entry.remoteError || 'Local only.'}
        </div>
      </div>
    `).join('');
  }

  function updateAnalysis(force = false) {
    updateSummary();
    updatePitEstimate();
    updateComparison(force);
    updateLapTable(force);
    updateSnapshotList(force);
  }

  return { buildAnalysis, updateAnalysis };
}

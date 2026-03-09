export function createTimingPage(deps) {
  const {
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
  } = deps;

  function buildTiming() {
    el('page-timing').innerHTML = `
      <div class="page-toolbar">
        <span class="page-toolbar-status" id="timing-export-status"></span>
        <div class="page-toolbar-actions">
          <button class="popout-btn" id="timing-export-csv">Export CSV</button>
          <button class="popout-btn" id="timing-export-json">Export JSON</button>
          ${popoutBtn('timing', 'Timing Tower', 900, 800)}
        </div>
      </div>
      <div style="padding:0 0 0; overflow-x:auto; height:calc(100% - 52px)">
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
    el('timing-export-csv')?.addEventListener('click', () => { exportTimingData('csv').catch(() => {}); });
    el('timing-export-json')?.addEventListener('click', () => { exportTimingData('json').catch(() => {}); });
  }

  function updateTiming() {
    const lapData = state.lapData;
    const parts = state.participants;
    const body = el('timing-body');
    if (!body) return;
    if (!lapData) {
      body.innerHTML = '<tr><td colspan="13"><div class="empty-state"><div class="empty-icon"></div><div class="empty-text">Waiting for telemetry</div></div></td></tr>';
      return;
    }

    const cars = getClassificationCars(lapData);
    if (cars.length === 0) {
      body.innerHTML = '<tr><td colspan="13"><div class="empty-state"><div class="empty-icon"></div><div class="empty-text">No classified cars yet</div></div></td></tr>';
      return;
    }

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

      let gapStr = '';
      if (rank === 0) {
        gapStr = 'Leader';
      } else {
        const gapMs = car.deltaToLeaderMs;
        gapStr = gapMs > 0 ? `+${(gapMs / 1000).toFixed(3)}` : '';
      }

      let intervalStr = '';
      if (rank > 0) {
        const intMs = car.deltaToCarAheadMs;
        intervalStr = intMs > 0 ? `+${(intMs / 1000).toFixed(3)}` : '';
      }

      const bestMs = state.bestLapTimes[car.idx];
      const bestStr = bestMs > 0 ? fmt(bestMs) : '';
      const bestClass = isFastest ? 'lap-fastest' : '';

      let pitCell = '';
      if (car.pitStatus === 1) pitCell = '<span class="pit-badge in-lane">PIT LANE</span>';
      else if (car.pitStatus === 2) pitCell = '<span class="pit-badge in-pit">IN PIT</span>';
      else pitCell = `<span class="pit-badge">${car.numPitStops}</span>`;

      const statusCell = renderRaceStatusBadge(car);
      const controlBadge = renderControlBadge(p, isPlayer);
      return `
        <tr class="${isPlayer ? 'player-row' : ''}${isFastest ? ' fastest-row' : ''}">
          <td class="pos-cell">${car.carPosition || '-'}</td>
          <td class="driver-cell">
            <span class="team-bar" style="background:${color}"></span>
            <span class="driver-name">${name}</span>
            ${controlBadge}
          </td>
          <td class="right gap-time">${gapStr}</td>
          <td class="right gap-time">${intervalStr}</td>
          <td class="right lap-time ${car.currentLapInvalid ? 'lap-invalid' : ''}">${fmt(car.lastLapTimeMs)}</td>
          <td class="right lap-time ${bestClass}">${bestStr}</td>
          <td class="right sector-time">${fmtSector(car.sector1TimeMs)}</td>
          <td class="right sector-time">${fmtSector(car.sector2TimeMs)}</td>
          <td class="right sector-time">${fmtSector(computeSector3Time(car))}</td>
          <td class="center">${compound ? tyreBadge(compound) : ''}</td>
          <td class="center text-dim">${tyreAge}</td>
          <td class="center">${pitCell}</td>
          <td class="center">${statusCell}</td>
        </tr>`;
    }).join('');

    body.innerHTML = rows;
  }

  return { buildTiming, updateTiming };
}

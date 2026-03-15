export function createTrackMapPage(deps) {
  const {
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
  } = deps;

  function buildTrackMap() {
    el('page-trackmap').innerHTML = `
      <div class="trackmap-main">
        <div class="panel" style="padding:8px 12px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
          <span class="section-title" style="margin:0" id="trackmap-title">Track Map</span>
          ${popoutBtn('trackmap', 'Track Map', 1200, 800)}
        </div>
        <div class="trackmap-svg-wrap" id="trackmap-svg-wrap">
          <div class="trackmap-no-data">Waiting for session data</div>
        </div>
      </div>
      <div class="trackmap-sidebar">
        <div class="ers-comparison">
          <div class="ers-comparison-title">Your Battery</div>
          <div class="stat-row"><span class="stat-label">ERS Store</span><span class="stat-value mono" id="tm-ers-mj"></span></div>
          <div class="stat-row"><span class="stat-label">Battery %</span><span class="stat-value mono" id="tm-ers-pct"></span></div>
          <div class="battery-pct-bar" style="margin-top:6px"><div class="battery-pct-fill" id="tm-ers-bar" style="width:0%"></div></div>
          <div id="tm-battery-delta" style="margin-top:8px"></div>
        </div>
        <div class="panel trackmap-car-panel" style="padding:8px 0">
          <div class="panel-header">Cars on Track</div>
          <div id="trackmap-car-list" class="trackmap-car-list"></div>
        </div>
      </div>
    `;
  }

  function updateTrackMap() {
    const ses = state.session;
    const lapData = state.lapData;
    const parts = state.participants;
    const wrap = el('trackmap-svg-wrap');
    if (!wrap) return;
    if (!ses || !lapData) {
      const titleEl = el('trackmap-title');
      if (titleEl) titleEl.textContent = 'Track Map';
      wrap.innerHTML = '<div class="trackmap-no-data">Waiting for telemetry</div>';
      updateTrackMapCarList(null, parts);
      return;
    }

    const trackId = ses.trackId;
    const circuit = CIRCUITS[trackId];
    const titleEl = el('trackmap-title');
    if (titleEl) titleEl.textContent = `Track Map  ${ses.trackName || 'Unknown'}`;

    if (state.status) {
      const ersMJ = (state.status.ersStoreEnergy / 1e6).toFixed(2);
      const ersPct = clamp((state.status.ersStoreEnergy / 4000000) * 100, 0, 100);
      const tmMJ = el('tm-ers-mj');
      if (tmMJ) tmMJ.textContent = ersMJ + ' MJ';
      const tmPct = el('tm-ers-pct');
      if (tmPct) tmPct.textContent = ersPct.toFixed(1) + '%';
      const tmBar = el('tm-ers-bar');
      if (tmBar) tmBar.style.width = ersPct + '%';
      const tmDelta = el('tm-battery-delta');
      if (tmDelta) tmDelta.innerHTML = batteryDeltaHTML(getBatteryDelta());
    }

    if (!circuit) {
      wrap.innerHTML = '<div class="trackmap-no-data">No track map available for this circuit</div>';
      updateTrackMapCarList(lapData, parts);
      return;
    }

    const cars = getTrackMapVisibleCars(lapData);
    let svg = wrap.querySelector('svg');
    if (!svg || svg.dataset.trackId !== String(trackId)) {
      wrap.innerHTML = '';
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', circuit.viewBox);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.dataset.trackId = String(trackId);

      const trackBg = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      trackBg.setAttribute('d', circuit.path);
      trackBg.setAttribute('class', 'track-path');
      svg.appendChild(trackBg);

      const trackLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      trackLine.setAttribute('d', circuit.path);
      trackLine.setAttribute('class', 'track-path-overlay');
      trackLine.id = 'track-path-ref';
      svg.appendChild(trackLine);
      wrap.appendChild(svg);
    }

    const pathEl = svg.querySelector('#track-path-ref');
    if (!pathEl) return;
    const totalLen = pathEl.getTotalLength();
    const trackLen = ses.trackLength || 1;

    svg.querySelectorAll('.car-dot, .car-label').forEach((node) => node.remove());
    cars.forEach((car) => {
      const rawLapDistance = Number.isFinite(car.lapDistance) ? car.lapDistance : car.totalDistance;
      let normalizedLapDistance = Number.isFinite(rawLapDistance) ? (rawLapDistance % trackLen) : 0;
      if (normalizedLapDistance < 0) normalizedLapDistance += trackLen;
      const progress = clamp(normalizedLapDistance / trackLen, 0, 1);
      const pt = pathEl.getPointAtLength(progress * totalLen);
      const p = parts?.participants?.[car.idx];
      const teamId = p?.teamId ?? -1;
      const color = teamColor(teamId);
      const isPlayer = car.idx === state.playerCarIndex;

      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', pt.x);
      dot.setAttribute('cy', pt.y);
      dot.setAttribute('fill', color);
      dot.setAttribute('class', `car-dot${isPlayer ? ' player-dot' : ''}`);
      dot.style.color = color;
      svg.appendChild(dot);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', pt.x);
      label.setAttribute('y', pt.y);
      label.setAttribute('class', 'car-label');
      label.textContent = car.carPosition;
      svg.appendChild(label);
    });

    updateTrackMapCarList(lapData, parts);
  }

  function updateTrackMapCarList(lapData, parts) {
    const listEl = el('trackmap-car-list');
    if (!listEl) return;
    const cars = getClassificationCars(lapData);
    if (cars.length === 0) {
      listEl.innerHTML = '<div style="padding:12px;color:var(--text3);font-size:12px">No telemetry available</div>';
      return;
    }

    listEl.innerHTML = cars.map((car) => {
      const p = parts?.participants?.[car.idx];
      const teamId = p?.teamId ?? -1;
      const color = teamColor(teamId);
      const name = p?.name || `Car ${car.idx + 1}`;
      const isPlayer = car.idx === state.playerCarIndex;
      const sts = state.allCarStatus?.[car.idx];
      const ersMJ = sts ? (sts.ersStoreEnergy / 1e6).toFixed(2) : '';
      const statusBadge = renderRaceStatusBadge(car);
      const controlBadge = renderControlBadge(p, isPlayer);
      let gapStr = '';
      if (car.carPosition === 1) gapStr = 'Leader';
      else {
        const gapMs = car.deltaToLeaderMs;
        gapStr = gapMs > 0 ? `+${(gapMs / 1000).toFixed(1)}s` : '';
      }

      return `<div class="trackmap-car-item ${isPlayer ? 'player' : ''}">
        <span class="trackmap-car-pos">${car.carPosition || '-'}</span>
        <span class="trackmap-car-dot-legend" style="background:${color}"></span>
        <div class="trackmap-car-main">
          <div class="trackmap-car-meta">
            <span class="trackmap-car-name">${name}</span>
            ${controlBadge}
            ${statusBadge}
          </div>
          <div class="trackmap-car-sub">
            <span class="trackmap-car-ers">${ersMJ ? `${ersMJ} MJ ERS` : 'ERS --'}</span>
            <span class="trackmap-car-gap">${gapStr}</span>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  return { buildTrackMap, updateTrackMap, updateTrackMapCarList };
}

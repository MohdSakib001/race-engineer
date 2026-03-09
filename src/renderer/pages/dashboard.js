export function createDashboardPage(deps) {
  const {
    state,
    el,
    clamp,
    tyreClass,
    TYRE_COMPOUNDS,
    fmt,
    fmtSector,
    computeSector3Time,
    getBatteryDelta,
    batteryDeltaHTML,
  } = deps;

  function buildDashboard() {
    const p = el('page-dashboard');
    p.innerHTML = `
      <div class="dash-main">
        <div class="hero-panel">
          <div class="speed-display">
            <div class="speed-value" id="d-speed">0</div>
            <div class="speed-unit">km/h</div>
          </div>
          <div class="gear-display">
            <div class="gear-value" id="d-gear">N</div>
            <div class="gear-label">Gear</div>
          </div>
          <div class="rpm-section">
            <div class="rpm-label">Engine RPM</div>
            <div class="rpm-value" id="d-rpm">0</div>
            <div class="rpm-bar-track">
              <div class="rpm-bar-fill" id="d-rpm-bar" style="width:0%"></div>
            </div>
            <div class="rev-lights" id="d-revlights">
              ${Array.from({ length: 15 }, (_, i) => `<div class="rev-light" id="rl-${i}"></div>`).join('')}
            </div>
          </div>
          <div style="margin-left:auto">
            <div class="drs-badge inactive" id="d-drs">DRS</div>
          </div>
        </div>
        <div class="pedals-panel">
          <div class="section-title">Inputs</div>
          <div class="pedals-row">
            <div class="pedal-block">
              <div class="pedal-label"><span>Throttle</span><span id="d-throttle-val">0%</span></div>
              <div class="pedal-track"><div class="pedal-fill throttle" id="d-throttle" style="width:0%"></div></div>
            </div>
            <div class="pedal-block">
              <div class="pedal-label"><span>Brake</span><span id="d-brake-val">0%</span></div>
              <div class="pedal-track"><div class="pedal-fill brake" id="d-brake" style="width:0%"></div></div>
            </div>
            <div class="pedal-block" style="max-width:100px">
              <div class="pedal-label"><span>Clutch</span><span id="d-clutch-val">0%</span></div>
              <div class="pedal-track"><div class="pedal-fill clutch" id="d-clutch" style="width:0%"></div></div>
            </div>
          </div>
        </div>
        <div class="grid-2">
          <div style="display:flex;flex-direction:column;gap:12px">
            <div class="panel">
              <div class="panel-header">Fuel</div>
              <div class="panel-body">
                <div class="stat-row"><span class="stat-label">In tank</span><span class="stat-value" id="d-fuel"> kg</span></div>
                <div class="stat-row"><span class="stat-label">Laps remaining</span><span class="stat-value" id="d-fuel-laps"></span></div>
                <div class="prog-bar" style="margin-top:10px"><div class="prog-fill fuel" id="d-fuel-bar" style="width:0%"></div></div>
              </div>
            </div>
            <div class="panel">
              <div class="panel-header">Gap Analysis</div>
              <div class="panel-body">
                <div class="stat-row"><span class="stat-label">Gap to car ahead</span><span class="stat-value mono" id="d-gap-ahead"></span></div>
                <div class="stat-row"><span class="stat-label">Gap to leader</span><span class="stat-value mono" id="d-gap-leader"></span></div>
                <div class="stat-row"><span class="stat-label">DRS</span><span class="stat-value" id="d-drs-status"></span></div>
                <div id="d-gap-indicator" class="gap-indicator" style="margin-top:8px"></div>
              </div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:12px">
            <div class="panel">
              <div class="panel-header">ERS</div>
              <div class="panel-body">
                <div class="stat-row"><span class="stat-label">Store</span><span class="stat-value" id="d-ers"> MJ</span></div>
                <div class="stat-row"><span class="stat-label">Battery %</span><span class="stat-value" id="d-ers-pct"></span></div>
                <div class="stat-row"><span class="stat-label">Deploy mode</span><span class="stat-value" id="d-ers-mode"></span></div>
                <div class="prog-bar" style="margin-top:10px"><div class="prog-fill ers" id="d-ers-bar" style="width:0%"></div></div>
                <div id="d-battery-delta" style="margin-top:8px"></div>
              </div>
            </div>
            <div class="panel">
              <div class="panel-header">Weather Forecast</div>
              <div class="panel-body">
                <div class="stat-row"><span class="stat-label">Current</span><span class="stat-value" id="d-wx-current"></span></div>
                <div class="stat-row"><span class="stat-label">Track C</span><span class="stat-value mono" id="d-wx-track"></span></div>
                <div class="stat-row"><span class="stat-label">Air C</span><span class="stat-value mono" id="d-wx-air"></span></div>
                <div id="d-wx-forecast" style="margin-top:8px"></div>
                <div id="d-wx-rain-eta" style="margin-top:6px;font-size:11px;color:var(--text2)"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="dash-side">
        <div class="panel">
          <div class="panel-header">Tyres <span id="d-tyre-compound" style="font-weight:400;font-size:11px;color:var(--text2)"></span></div>
          <div class="panel-body">
            <div class="tyres-grid" id="d-tyres">
              ${['FL', 'FR', 'RL', 'RR'].map((pos) => `
                <div class="tyre-cell">
                  <div class="tyre-circle temp-cool" id="tc-${pos}">
                    <span class="tyre-temp" id="tt-${pos}"></span>
                    <span class="tyre-unit">C</span>
                  </div>
                  <div class="tyre-label">${pos}</div>
                  <div class="tyre-wear" id="tw-${pos}">wear: %</div>
                </div>`).join('')}
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-header">Race Progress</div>
          <div class="panel-body">
            <div class="stat-row"><span class="stat-label">Position</span><span class="stat-value" id="d-pos"></span></div>
            <div class="stat-row"><span class="stat-label">Current lap</span><span class="stat-value mono" id="d-cur-lap"></span></div>
            <div class="stat-row"><span class="stat-label">Last lap</span><span class="stat-value mono" id="d-last-lap"></span></div>
            <div class="stat-row"><span class="stat-label">Sector 1</span><span class="stat-value mono" id="d-s1"></span></div>
            <div class="stat-row"><span class="stat-label">Sector 2</span><span class="stat-value mono" id="d-s2"></span></div>
            <div class="stat-row"><span class="stat-label">Sector 3</span><span class="stat-value mono" id="d-s3"></span></div>
            <div class="stat-row"><span class="stat-label">Pit stops</span><span class="stat-value" id="d-pits"></span></div>
            <div class="stat-row"><span class="stat-label">Tyre age</span><span class="stat-value" id="d-tyre-age"> laps</span></div>
            <div style="margin-top:8px">
              <div class="section-title">Race %</div>
              <div class="prog-bar"><div class="prog-fill race-prog" id="d-race-prog" style="width:0%"></div></div>
              <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-top:3px">
                <span id="d-race-lap-info"></span>
                <span id="d-race-pct">0%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function updateDashboard() {
    const tel = state.telemetry;
    const sts = state.status;
    const dmg = state.damage;
    const lap = state.lapData?.[state.playerCarIndex];
    if (!tel) return;

    el('d-speed').textContent = tel.speed;
    el('d-gear').textContent = tel.gear <= 0 ? (tel.gear === 0 ? 'N' : 'R') : tel.gear;

    const maxRPM = sts?.maxRPM || 15000;
    const rpmPct = clamp((tel.engineRPM / maxRPM) * 100, 0, 100);
    el('d-rpm').textContent = tel.engineRPM.toLocaleString();
    el('d-rpm-bar').style.width = rpmPct + '%';

    const litCount = Math.round((tel.revLightsPercent / 100) * 15);
    for (let i = 0; i < 15; i++) {
      const light = el(`rl-${i}`);
      if (!light) continue;
      if (i < litCount) {
        light.className = 'rev-light ' + (i < 5 ? 'on-green' : i < 10 ? 'on-yellow' : 'on-red');
      } else {
        light.className = 'rev-light';
      }
    }

    const drsEl = el('d-drs');
    if (tel.drs) {
      drsEl.className = 'drs-badge active';
      drsEl.textContent = 'DRS ON';
    } else {
      drsEl.className = 'drs-badge inactive';
      drsEl.textContent = 'DRS';
    }

    const throttlePct = Math.round(tel.throttle * 100);
    const brakePct = Math.round(tel.brake * 100);
    const clutchPct = clamp(tel.clutch, 0, 100);
    el('d-throttle').style.width = throttlePct + '%';
    el('d-throttle-val').textContent = throttlePct + '%';
    el('d-brake').style.width = brakePct + '%';
    el('d-brake-val').textContent = brakePct + '%';
    el('d-clutch').style.width = clutchPct + '%';
    el('d-clutch-val').textContent = clutchPct + '%';

    const tyreOrder = { RL: 0, RR: 1, FL: 2, FR: 3 };
    for (const [pos, idx] of Object.entries(tyreOrder)) {
      const temp = tel.tyreSurfaceTemp[idx];
      const circle = el(`tc-${pos}`);
      if (circle) {
        circle.className = `tyre-circle ${tyreClass(temp)}`;
        el(`tt-${pos}`).textContent = temp;
      }
      if (dmg) {
        const wear = Math.round(dmg.tyresWear[idx]);
        el(`tw-${pos}`).textContent = `wear: ${wear}%`;
      }
    }

    if (sts) {
      const fuelPct = clamp((sts.fuelInTank / sts.fuelCapacity) * 100, 0, 100);
      el('d-fuel').textContent = sts.fuelInTank.toFixed(2) + ' kg';
      el('d-fuel-laps').textContent = sts.fuelRemainingLaps.toFixed(1);
      el('d-fuel-bar').style.width = fuelPct + '%';

      const ersPct = clamp((sts.ersStoreEnergy / 4000000) * 100, 0, 100);
      el('d-ers').textContent = (sts.ersStoreEnergy / 1000000).toFixed(2) + ' MJ';
      el('d-ers-pct').textContent = ersPct.toFixed(1) + '%';
      const ersModes = ['None', 'Medium', 'Overtake', 'Hotlap'];
      el('d-ers-mode').textContent = ersModes[sts.ersDeployMode] || 'None';
      el('d-ers-bar').style.width = ersPct + '%';

      const deltaEl = el('d-battery-delta');
      if (deltaEl) {
        const delta = getBatteryDelta();
        deltaEl.innerHTML = batteryDeltaHTML(delta);
      }

      const cmp = TYRE_COMPOUNDS[sts.visualTyreCompound] || { name: 'Unknown', color: '#888' };
      el('d-tyre-compound').innerHTML = `<span style="color:${cmp.color}">${cmp.name}</span>`;
      el('d-tyre-age').textContent = sts.tyresAgeLaps + ' laps';
    }

    if (lap) {
      el('d-pos').textContent = `P${lap.carPosition}`;
      el('d-cur-lap').textContent = fmt(lap.currentLapTimeMs);
      el('d-last-lap').textContent = fmt(lap.lastLapTimeMs);
      el('d-s1').textContent = fmtSector(lap.sector1TimeMs);
      el('d-s2').textContent = fmtSector(lap.sector2TimeMs);
      el('d-s3').textContent = fmtSector(computeSector3Time(lap));
      el('d-pits').textContent = lap.numPitStops;

      const ses = state.session;
      if (ses && ses.totalLaps > 0) {
        const pct = clamp((lap.currentLapNum / ses.totalLaps) * 100, 0, 100);
        const progBar = el('d-race-prog');
        if (progBar) progBar.style.width = pct + '%';
        const lapInfo = el('d-race-lap-info');
        if (lapInfo) lapInfo.textContent = `Lap ${lap.currentLapNum}/${ses.totalLaps}`;
        const pctEl = el('d-race-pct');
        if (pctEl) pctEl.textContent = pct.toFixed(0) + '%';
      }

      const gapAheadEl = el('d-gap-ahead');
      if (gapAheadEl) {
        const gapMs = lap.deltaToCarAheadMs;
        if (gapMs > 0) {
          const gapS = (gapMs / 1000).toFixed(2);
          gapAheadEl.textContent = `+${gapS}s`;
          gapAheadEl.className = `stat-value mono ${gapMs < 1200 ? 'gap-close' : ''}`;
        } else {
          gapAheadEl.textContent = 'Leader';
          gapAheadEl.className = 'stat-value mono';
        }
      }

      const gapLeaderEl = el('d-gap-leader');
      if (gapLeaderEl) {
        if (lap.carPosition === 1) gapLeaderEl.textContent = 'P1';
        else if (lap.deltaToLeaderMs > 0) gapLeaderEl.textContent = `+${(lap.deltaToLeaderMs / 1000).toFixed(1)}s`;
        else gapLeaderEl.textContent = '';
      }

      const drsStatusEl = el('d-drs-status');
      if (drsStatusEl && sts) {
        if (tel.drs) drsStatusEl.innerHTML = '<span style="color:var(--green);font-weight:700">ACTIVE</span>';
        else if (sts.drsAllowed) drsStatusEl.innerHTML = '<span style="color:var(--yellow)">Available</span>';
        else drsStatusEl.textContent = 'Not available';
      }

      const gapIndicator = el('d-gap-indicator');
      if (gapIndicator) {
        const gapMs = lap.deltaToCarAheadMs;
        if (gapMs > 0 && gapMs < 3000) {
          const closeness = clamp((1 - gapMs / 3000) * 100, 0, 100);
          const color = gapMs < 1000 ? 'var(--green)' : gapMs < 1500 ? 'var(--yellow)' : 'var(--text3)';
          gapIndicator.innerHTML = `
            <div style="font-size:10px;color:var(--text3);margin-bottom:3px">Proximity to car ahead</div>
            <div class="prog-bar"><div class="prog-fill" style="width:${closeness}%;background:${color}"></div></div>`;
        } else {
          gapIndicator.innerHTML = '';
        }
      }
    }

    const ses = state.session;
    if (ses) {
      const wxNames = ['Clear', 'Light Cloud', 'Overcast', 'Light Rain', 'Heavy Rain', 'Storm'];
      const wxIcons = ['&#9728;', '&#9925;', '&#9729;', '&#127783;', '&#127783;&#127783;', '&#9889;'];
      const wxCurEl = el('d-wx-current');
      if (wxCurEl) wxCurEl.innerHTML = `${wxIcons[ses.weather] || ''} ${wxNames[ses.weather] || ''}`;
      const wxTrack = el('d-wx-track');
      if (wxTrack) wxTrack.textContent = ses.trackTemperature + 'C';
      const wxAir = el('d-wx-air');
      if (wxAir) wxAir.textContent = ses.airTemperature + 'C';

      const fcEl = el('d-wx-forecast');
      if (fcEl && ses.weatherForecast?.length) {
        const samples = ses.weatherForecast.slice(0, 8);
        fcEl.innerHTML = `<div style="display:flex;gap:6px;flex-wrap:wrap">${samples.map((s) => {
          const isRain = s.weather >= 3;
          const bg = isRain ? 'rgba(0,120,255,0.15)' : 'rgba(255,255,255,0.04)';
          const border = isRain ? '1px solid rgba(0,120,255,0.3)' : '1px solid var(--border)';
          return `<div style="text-align:center;font-size:10px;padding:4px 6px;border-radius:4px;background:${bg};border:${border};min-width:42px">
            <div style="font-size:14px">${wxIcons[s.weather] || '?'}</div>
            <div style="color:var(--text3)">+${s.timeOffset}m</div>
            <div>${s.trackTemp}C</div>
            ${s.rainPercentage > 0 ? `<div style="color:#4da6ff;font-weight:600">${s.rainPercentage}%</div>` : ''}
          </div>`;
        }).join('')}</div>`;
      }

      const rainEta = el('d-wx-rain-eta');
      if (rainEta && ses.weatherForecast?.length && lap) {
        const firstRain = ses.weatherForecast.find((s) => s.weather >= 3);
        if (firstRain && ses.weather < 3) {
          const avgLapSec = ses.trackLength
            ? (ses.trackLength / 1000) * 3.6 / (tel?.speed > 50 ? tel.speed : 200) * 60
            : 90;
          const minsToRain = firstRain.timeOffset;
          const lapsToRain = Math.max(1, Math.round((minsToRain * 60) / avgLapSec));
          rainEta.innerHTML = `<span style="color:#4da6ff;font-weight:600">&#127783; Rain expected in ~${lapsToRain} lap${lapsToRain > 1 ? 's' : ''} (${minsToRain}min)</span>`;
        } else if (ses.weather >= 3) {
          const firstDry = ses.weatherForecast.find((s) => s.weather < 3);
          if (firstDry) {
            rainEta.innerHTML = `<span style="color:#ffa500">&#9728; Drying expected in ~${firstDry.timeOffset}min</span>`;
          } else {
            rainEta.innerHTML = '<span style="color:#4da6ff">Rain continues for the foreseeable future</span>';
          }
        } else {
          rainEta.textContent = 'No rain forecast';
        }
      }
    }
  }

  return { buildDashboard, updateDashboard };
}

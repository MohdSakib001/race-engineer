import './index.css';

// ─── Lookups (loaded from main) ───────────────────────────────────────────────
let TEAM_COLORS = {};
let TYRE_COMPOUNDS = {};

// ─── App state ────────────────────────────────────────────────────────────────
const state = {
  connected: false,
  session: null,
  participants: null,
  lapData: null,
  telemetry: null,
  status: null,
  damage: null,
  allCarStatus: null,   // all 22 cars' status (for rivals' tyres/ERS)
  playerCarIndex: 0,
};

// ─── Auto-radio state ─────────────────────────────────────────────────────────
const radio = {
  enabled: true,
  awaiting: false,
  lastTrigger: { attack: 0, defense: 0 },
  COOLDOWN_MS: 25000,
  // track the previous scenario to avoid re-triggering same state
  prevScenario: null,
};

// ─── Router ───────────────────────────────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.nav-item').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });
  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('active', p.id === `page-${page}`);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(ms) {
  if (!ms || ms === 0) return '─:──.───';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const ms3 = ms % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(ms3).padStart(3, '0')}`;
}

function fmtSector(ms) {
  if (!ms || ms === 0) return '──.───';
  const s = Math.floor(ms / 1000);
  const ms3 = ms % 1000;
  return `${s}.${String(ms3).padStart(3, '0')}`;
}

function fmtCountdown(sec) {
  if (!sec || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

function tyreClass(tempC) {
  if (tempC < 50)  return 'temp-cold';
  if (tempC < 70)  return 'temp-cool';
  if (tempC < 90)  return 'temp-opt';
  if (tempC < 110) return 'temp-warm';
  if (tempC < 130) return 'temp-hot';
  return 'temp-vhot';
}

function dmgClass(pct) {
  if (pct < 25)  return 'dmg-low';
  if (pct < 50)  return 'dmg-mid';
  if (pct < 75)  return 'dmg-high';
  return 'dmg-crit';
}

function tyreBadge(compound) {
  const c = TYRE_COMPOUNDS[compound] || { label: '?', color: '#888' };
  return `<span class="tyre-badge" style="background:${c.color}22;color:${c.color};border:1px solid ${c.color}55">${c.label}</span>`;
}

function teamColor(teamId) {
  return TEAM_COLORS[teamId] || '#888888';
}

function weatherIcon(w) {
  const icons = { 0: '☀️', 1: '⛅', 2: '☁️', 3: '🌧️', 4: '⛈️', 5: '⛈️' };
  return icons[w] || '☀️';
}

function safetyCarLabel(sc) {
  const labels = { 0: '', 1: 'SC', 2: 'VSC', 3: 'SC Ending' };
  return labels[sc] || '';
}

function el(id) { return document.getElementById(id); }

// ─── Top bar updater ──────────────────────────────────────────────────────────
function updateTopBar() {
  const lap = state.lapData?.[state.playerCarIndex];
  const ses = state.session;
  const tel = state.telemetry;

  if (ses) {
    const sc = ses.safetyCarStatus ? ` · ${safetyCarLabel(ses.safetyCarStatus)}` : '';
    el('topbar-session').textContent =
      `${ses.trackName || '─'} · ${ses.sessionTypeName || '─'}${sc}`;
  }

  if (lap) {
    el('tb-pos').innerHTML = `P<strong>${lap.carPosition || '─'}</strong>`;
    el('tb-lap').innerHTML = `Lap <strong>${lap.currentLapNum || '─'}/${ses?.totalLaps || '─'}</strong>`;
    el('tb-time').innerHTML = `<strong>${fmt(lap.currentLapTimeMs)}</strong>`;
  }
}

// ─── Dashboard page ───────────────────────────────────────────────────────────
function buildDashboard() {
  const p = el('page-dashboard');
  p.innerHTML = `
    <div class="dash-main">
      <!-- Hero: speed / gear / rpm -->
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
            ${Array.from({length: 15}, (_, i) => `<div class="rev-light" id="rl-${i}"></div>`).join('')}
          </div>
        </div>
        <div style="margin-left:auto">
          <div class="drs-badge inactive" id="d-drs">DRS</div>
        </div>
      </div>

      <!-- Pedals -->
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

      <!-- Fuel & ERS quick -->
      <div class="grid-2">
        <div class="panel">
          <div class="panel-header">Fuel</div>
          <div class="panel-body">
            <div class="stat-row"><span class="stat-label">In tank</span><span class="stat-value" id="d-fuel">─ kg</span></div>
            <div class="stat-row"><span class="stat-label">Laps remaining</span><span class="stat-value" id="d-fuel-laps">─</span></div>
            <div class="prog-bar" style="margin-top:10px"><div class="prog-fill fuel" id="d-fuel-bar" style="width:0%"></div></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-header">ERS</div>
          <div class="panel-body">
            <div class="stat-row"><span class="stat-label">Store</span><span class="stat-value" id="d-ers">─ MJ</span></div>
            <div class="stat-row"><span class="stat-label">Deploy mode</span><span class="stat-value" id="d-ers-mode">─</span></div>
            <div class="prog-bar" style="margin-top:10px"><div class="prog-fill ers" id="d-ers-bar" style="width:0%"></div></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Side: tyres + lap info -->
    <div class="dash-side">
      <div class="panel">
        <div class="panel-header">Tyres <span id="d-tyre-compound" style="font-weight:400;font-size:11px;color:var(--text2)"></span></div>
        <div class="panel-body">
          <div class="tyres-grid" id="d-tyres">
            ${['FL','FR','RL','RR'].map(pos => `
              <div class="tyre-cell">
                <div class="tyre-circle temp-cool" id="tc-${pos}">
                  <span class="tyre-temp" id="tt-${pos}">─</span>
                  <span class="tyre-unit">°C</span>
                </div>
                <div class="tyre-label">${pos}</div>
                <div class="tyre-wear" id="tw-${pos}">wear: ─%</div>
              </div>`).join('')}
          </div>
          <div style="margin-top:12px">
            <div class="section-title">Brake Temps</div>
            <div class="grid-2" style="gap:8px">
              ${['FL','FR','RL','RR'].map(pos => `
                <div class="stat-row">
                  <span class="stat-label">${pos}</span>
                  <span class="stat-value mono" id="bt-${pos}">─°C</span>
                </div>`).join('')}
            </div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">Lap Info</div>
        <div class="panel-body">
          <div class="stat-row"><span class="stat-label">Position</span><span class="stat-value" id="d-pos">─</span></div>
          <div class="stat-row"><span class="stat-label">Current lap</span><span class="stat-value mono" id="d-cur-lap">─</span></div>
          <div class="stat-row"><span class="stat-label">Last lap</span><span class="stat-value mono" id="d-last-lap">─</span></div>
          <div class="stat-row"><span class="stat-label">Sector 1</span><span class="stat-value mono" id="d-s1">─</span></div>
          <div class="stat-row"><span class="stat-label">Sector 2</span><span class="stat-value mono" id="d-s2">─</span></div>
          <div class="stat-row"><span class="stat-label">Pit stops</span><span class="stat-value" id="d-pits">─</span></div>
          <div class="stat-row"><span class="stat-label">Tyre age</span><span class="stat-value" id="d-tyre-age">─ laps</span></div>
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

  // Speed / gear
  el('d-speed').textContent = tel.speed;
  el('d-gear').textContent = tel.gear <= 0 ? (tel.gear === 0 ? 'N' : 'R') : tel.gear;

  // RPM
  const maxRPM = sts?.maxRPM || 15000;
  const rpmPct = clamp((tel.engineRPM / maxRPM) * 100, 0, 100);
  el('d-rpm').textContent = tel.engineRPM.toLocaleString();
  el('d-rpm-bar').style.width = rpmPct + '%';

  // Rev lights (15 lights: 0-4 green, 5-9 yellow, 10-14 red)
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

  // DRS
  const drsEl = el('d-drs');
  if (tel.drs) {
    drsEl.className = 'drs-badge active';
    drsEl.textContent = 'DRS ON';
  } else {
    drsEl.className = 'drs-badge inactive';
    drsEl.textContent = 'DRS';
  }

  // Pedals
  const throttlePct = Math.round(tel.throttle * 100);
  const brakePct = Math.round(tel.brake * 100);
  const clutchPct = clamp(tel.clutch, 0, 100);
  el('d-throttle').style.width = throttlePct + '%';
  el('d-throttle-val').textContent = throttlePct + '%';
  el('d-brake').style.width = brakePct + '%';
  el('d-brake-val').textContent = brakePct + '%';
  el('d-clutch').style.width = clutchPct + '%';
  el('d-clutch-val').textContent = clutchPct + '%';

  // Tyres — order in packet: RL=0, RR=1, FL=2, FR=3
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
    // Brake temps
    const brakeEl = el(`bt-${pos}`);
    if (brakeEl) brakeEl.textContent = tel.brakesTemp[idx] + '°C';
  }

  if (sts) {
    // Fuel
    const fuelPct = clamp((sts.fuelInTank / sts.fuelCapacity) * 100, 0, 100);
    el('d-fuel').textContent = sts.fuelInTank.toFixed(2) + ' kg';
    el('d-fuel-laps').textContent = sts.fuelRemainingLaps.toFixed(1);
    el('d-fuel-bar').style.width = fuelPct + '%';

    // ERS
    const ersPct = clamp((sts.ersStoreEnergy / 4000000) * 100, 0, 100);
    el('d-ers').textContent = (sts.ersStoreEnergy / 1000000).toFixed(2) + ' MJ';
    const ersModes = ['None', 'Medium', 'Overtake', 'Hotlap'];
    el('d-ers-mode').textContent = ersModes[sts.ersDeployMode] || 'None';
    el('d-ers-bar').style.width = ersPct + '%';

    // Tyre compound
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
    el('d-pits').textContent = lap.numPitStops;
  }
}

// ─── Timing Tower ─────────────────────────────────────────────────────────────
function buildTiming() {
  el('page-timing').innerHTML = `
    <div style="padding:16px 0 0; overflow-x:auto; height:100%">
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
            <th class="center">Tyre</th>
            <th class="center">Age</th>
            <th class="center">Pits</th>
            <th class="center">Status</th>
          </tr>
        </thead>
        <tbody id="timing-body">
          <tr><td colspan="12"><div class="empty-state"><div class="empty-icon">≡</div><div class="empty-text">Waiting for telemetry…</div></div></td></tr>
        </tbody>
      </table>
    </div>
  `;
}

function updateTiming() {
  const lapData = state.lapData;
  const parts = state.participants;
  if (!lapData) return;

  // Build sorted car list by position
  const cars = lapData
    .map((l, i) => ({ ...l, idx: i }))
    .filter(c => c && c.resultStatus >= 2 && c.carPosition > 0)
    .sort((a, b) => a.carPosition - b.carPosition);

  if (cars.length === 0) return;

  // Find leader's last lap for gap calc
  const leaderLap = cars[0];

  const rows = cars.map((car, rank) => {
    const p = parts?.participants?.[car.idx];
    const teamId = p?.teamId ?? -1;
    const color = teamColor(teamId);
    const name = p?.name || `Car ${car.idx + 1}`;
    const isPlayer = car.idx === state.playerCarIndex;

    const sts = state.allCarStatus?.[car.idx];
    const compound = sts?.visualTyreCompound;
    const tyreAge = sts?.tyresAgeLaps ?? '─';

    let gapStr = '─';
    if (rank === 0) { gapStr = 'Leader'; }
    else {
      const gapMs = car.totalDistance > 0
        ? Math.round((leaderLap.totalDistance - car.totalDistance) * 10)
        : 0;
      gapStr = gapMs > 0 ? `+${(gapMs / 10).toFixed(1)}s` : '─';
    }

    let intervalStr = '─';
    if (rank > 0) {
      const prev = cars[rank - 1];
      const intMs = prev.totalDistance > 0
        ? Math.round((prev.totalDistance - car.totalDistance) * 10)
        : 0;
      intervalStr = intMs > 0 ? `+${(intMs / 10).toFixed(1)}s` : '─';
    }

    // Pit status
    let pitCell = '';
    if (car.pitStatus === 1) pitCell = '<span class="pit-badge in-lane">PIT LANE</span>';
    else if (car.pitStatus === 2) pitCell = '<span class="pit-badge in-pit">IN PIT</span>';
    else pitCell = `<span class="pit-badge">${car.numPitStops}</span>`;

    // Result status
    let statusCell = '';
    if (car.resultStatus === 3) statusCell = '<span class="status-badge dnf">DNF</span>';
    else if (car.resultStatus === 4) statusCell = '<span class="status-badge dnf">DSQ</span>';
    else if (car.resultStatus === 5) statusCell = '<span class="status-badge out">NC</span>';
    else if (car.driverStatus === 0) statusCell = '<span class="status-badge out">Pits</span>';

    return `
      <tr class="${isPlayer ? 'player-row' : ''}">
        <td class="pos-cell">${car.carPosition}</td>
        <td class="driver-cell">
          <span class="team-bar" style="background:${color}"></span>
          <span class="driver-name">${name}</span>
          ${isPlayer ? '<span style="font-size:10px;color:var(--accent);margin-left:4px">YOU</span>' : ''}
        </td>
        <td class="right gap-time">${gapStr}</td>
        <td class="right gap-time">${intervalStr}</td>
        <td class="right lap-time ${car.currentLapInvalid ? 'lap-invalid' : ''}">${fmt(car.lastLapTimeMs)}</td>
        <td class="right lap-time">─</td>
        <td class="right sector-time">${fmtSector(car.sector1TimeMs)}</td>
        <td class="right sector-time">${fmtSector(car.sector2TimeMs)}</td>
        <td class="center">${compound ? tyreBadge(compound) : '─'}</td>
        <td class="center text-dim">${tyreAge}</td>
        <td class="center">${pitCell}</td>
        <td class="center">${statusCell}</td>
      </tr>`;
  }).join('');

  el('timing-body').innerHTML = rows;
}

// ─── Vehicle Status ───────────────────────────────────────────────────────────
function buildVehicle() {
  el('page-vehicle').innerHTML = `
    <div class="tabs">
      <button class="tab-btn active" data-tab="general">General</button>
      <button class="tab-btn" data-tab="ers">ERS &amp; Fuel</button>
      <button class="tab-btn" data-tab="damage">Damage</button>
      <button class="tab-btn" data-tab="tyres">Tyre Detail</button>
    </div>

    <!-- General -->
    <div class="tab-content active" id="tab-general">
      <div class="grid-2" style="gap:16px">
        <div>
          <div class="panel">
            <div class="panel-header">Motion</div>
            <div class="panel-body">
              <div class="stat-row"><span class="stat-label">Speed</span><span class="stat-value mono" id="v-speed">─</span></div>
              <div class="stat-row"><span class="stat-label">Gear</span><span class="stat-value" id="v-gear">─</span></div>
              <div class="stat-row"><span class="stat-label">RPM</span><span class="stat-value mono" id="v-rpm">─</span></div>
              <div class="stat-row"><span class="stat-label">Engine Temp</span><span class="stat-value mono" id="v-etemp">─</span></div>
              <div class="stat-row"><span class="stat-label">Throttle</span><span class="stat-value mono" id="v-thr">─</span></div>
              <div class="stat-row"><span class="stat-label">Brake</span><span class="stat-value mono" id="v-brk">─</span></div>
              <div class="stat-row"><span class="stat-label">Steer</span><span class="stat-value mono" id="v-steer">─</span></div>
              <div class="stat-row"><span class="stat-label">DRS</span><span class="stat-value" id="v-drs">─</span></div>
            </div>
          </div>
        </div>
        <div>
          <div class="panel">
            <div class="panel-header">Tyre Temperatures (Surface)</div>
            <div class="panel-body">
              <div class="tyres-grid" id="v-tyres">
                ${['FL','FR','RL','RR'].map(pos => `
                  <div class="tyre-cell">
                    <div class="tyre-circle temp-cool" id="vtc-${pos}">
                      <span class="tyre-temp" id="vtt-${pos}">─</span>
                      <span class="tyre-unit">°C</span>
                    </div>
                    <div class="tyre-label">${pos}</div>
                  </div>`).join('')}
              </div>
              <div style="margin-top:12px">
                <div class="section-title">Inner Temps</div>
                <div class="grid-2" style="gap:4px">
                  ${['FL','FR','RL','RR'].map(pos => `
                    <div class="stat-row"><span class="stat-label">${pos}</span><span class="stat-value mono" id="vti-${pos}">─</span></div>`).join('')}
                </div>
              </div>
              <div style="margin-top:10px">
                <div class="section-title">Pressures (PSI)</div>
                <div class="grid-2" style="gap:4px">
                  ${['FL','FR','RL','RR'].map(pos => `
                    <div class="stat-row"><span class="stat-label">${pos}</span><span class="stat-value mono" id="vtp-${pos}">─</span></div>`).join('')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ERS & Fuel -->
    <div class="tab-content" id="tab-ers">
      <div class="grid-2" style="gap:16px">
        <div class="panel">
          <div class="panel-header">Energy Recovery System</div>
          <div class="panel-body">
            <div class="badge-row" id="v-ers-badges"></div>
            <div class="ers-bar-wrap">
              <div class="ers-bar-label"><span>ERS Store</span><span id="v-ers-store">─</span></div>
              <div class="ers-bar-track"><div class="ers-bar-fill" id="v-ers-bar" style="width:0%"></div></div>
            </div>
            <div class="stat-row"><span class="stat-label">Deploy mode</span><span class="stat-value" id="v-ers-mode">─</span></div>
            <div class="stat-row"><span class="stat-label">Deployed this lap</span><span class="stat-value mono" id="v-ers-dep">─</span></div>
            <div class="stat-row"><span class="stat-label">Harvested MGU-K</span><span class="stat-value mono" id="v-ers-hk">─</span></div>
            <div class="stat-row"><span class="stat-label">Harvested MGU-H</span><span class="stat-value mono" id="v-ers-hh">─</span></div>
            <div class="stat-row"><span class="stat-label">ICE Power</span><span class="stat-value mono" id="v-ice-pwr">─</span></div>
            <div class="stat-row"><span class="stat-label">MGU-K Power</span><span class="stat-value mono" id="v-mguk-pwr">─</span></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-header">Fuel</div>
          <div class="panel-body">
            <div style="margin-bottom:12px">
              <div class="ers-bar-label"><span>Fuel Load</span><span id="v-fuel-pct">─%</span></div>
              <div class="ers-bar-track"><div class="prog-fill fuel" id="v-fuel-bar" style="width:0%;height:100%"></div></div>
            </div>
            <div class="stat-row"><span class="stat-label">In tank</span><span class="stat-value mono" id="v-fuel">─</span></div>
            <div class="stat-row"><span class="stat-label">Capacity</span><span class="stat-value mono" id="v-fuel-cap">─</span></div>
            <div class="stat-row"><span class="stat-label">Laps remaining</span><span class="stat-value mono" id="v-fuel-laps">─</span></div>
            <div class="stat-row"><span class="stat-label">Fuel mix</span><span class="stat-value" id="v-fuel-mix">─</span></div>
            <div class="stat-row"><span class="stat-label">Pit limiter</span><span class="stat-value" id="v-pit-limiter">─</span></div>
            <div class="stat-row"><span class="stat-label">Front brake bias</span><span class="stat-value mono" id="v-brake-bias">─</span></div>
            <div class="stat-row"><span class="stat-label">TC</span><span class="stat-value" id="v-tc">─</span></div>
            <div class="stat-row"><span class="stat-label">ABS</span><span class="stat-value" id="v-abs">─</span></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Damage -->
    <div class="tab-content" id="tab-damage">
      <div class="grid-2" style="gap:16px">
        <div class="panel">
          <div class="panel-header">Bodywork</div>
          <div class="panel-body">
            <div id="dmg-bodywork"></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-header">Power Unit Wear</div>
          <div class="panel-body">
            <div id="dmg-engine"></div>
          </div>
        </div>
      </div>
      <div class="panel" style="margin-top:16px">
        <div class="panel-header">Tyre Wear</div>
        <div class="panel-body">
          <div class="grid-4" id="dmg-tyres"></div>
        </div>
      </div>
    </div>

    <!-- Tyre detail -->
    <div class="tab-content" id="tab-tyres">
      <div class="grid-2" style="gap:16px">
        <div class="panel">
          <div class="panel-header">Tyre Info</div>
          <div class="panel-body" id="tyre-info-body"></div>
        </div>
        <div class="panel">
          <div class="panel-header">Brake Temperatures</div>
          <div class="panel-body" id="brake-temp-body"></div>
        </div>
      </div>
    </div>
  `;

  // Tab switching
  el('page-vehicle').querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      el('page-vehicle').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      el('page-vehicle').querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      el(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

function damageBar(label, pct) {
  const cls = dmgClass(pct);
  return `
    <div class="damage-item" style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;margin-bottom:3px">
        <span class="damage-item-label">${label}</span>
        <span class="damage-pct">${Math.round(pct)}%</span>
      </div>
      <div class="damage-item-bar"><div class="damage-fill ${cls}" style="width:${clamp(pct,0,100)}%"></div></div>
    </div>`;
}

function updateVehicle() {
  const tel = state.telemetry;
  const sts = state.status;
  const dmg = state.damage;
  if (!tel) return;

  // General tab
  el('v-speed').textContent = tel.speed + ' km/h';
  el('v-gear').textContent = tel.gear <= 0 ? (tel.gear === 0 ? 'N' : 'R') : tel.gear;
  el('v-rpm').textContent = tel.engineRPM.toLocaleString() + ' RPM';
  el('v-etemp').textContent = tel.engineTemp + ' °C';
  el('v-thr').textContent = (tel.throttle * 100).toFixed(1) + '%';
  el('v-brk').textContent = (tel.brake * 100).toFixed(1) + '%';
  el('v-steer').textContent = (tel.steer * 100).toFixed(1) + '%';
  el('v-drs').innerHTML = tel.drs
    ? '<span class="badge active">ON</span>'
    : '<span class="badge inactive">OFF</span>';

  const tyreOrder = { RL: 0, RR: 1, FL: 2, FR: 3 };
  for (const [pos, idx] of Object.entries(tyreOrder)) {
    const surf = tel.tyreSurfaceTemp[idx];
    const inner = tel.tyreInnerTemp[idx];
    const psi = tel.tyrePressure[idx].toFixed(1);
    const circle = el(`vtc-${pos}`);
    if (circle) {
      circle.className = `tyre-circle ${tyreClass(surf)}`;
      el(`vtt-${pos}`).textContent = surf;
    }
    const innerEl = el(`vti-${pos}`);
    if (innerEl) innerEl.textContent = inner + ' °C';
    const presEl = el(`vtp-${pos}`);
    if (presEl) presEl.textContent = psi;
  }

  if (sts) {
    // ERS tab
    const ersPct = clamp((sts.ersStoreEnergy / 4000000) * 100, 0, 100);
    el('v-ers-store').textContent = (sts.ersStoreEnergy / 1000000).toFixed(2) + ' MJ';
    el('v-ers-bar').style.width = ersPct + '%';
    if (ersPct > 90) el('v-ers-bar').classList.add('full'); else el('v-ers-bar').classList.remove('full');

    const ersModes = ['None', 'Medium', 'Overtake', 'Hotlap'];
    el('v-ers-mode').textContent = ersModes[sts.ersDeployMode] || 'None';
    el('v-ers-dep').textContent = (sts.ersDeployedThisLap / 1000000).toFixed(2) + ' MJ';
    el('v-ers-hk').textContent = (sts.ersHarvestedMGUK / 1000000).toFixed(2) + ' MJ';
    el('v-ers-hh').textContent = (sts.ersHarvestedMGUH / 1000000).toFixed(2) + ' MJ';
    el('v-ice-pwr').textContent = (sts.enginePowerICE / 1000).toFixed(0) + ' kW';
    el('v-mguk-pwr').textContent = (sts.enginePowerMGUK / 1000).toFixed(0) + ' kW';

    const ersBadges = el('v-ers-badges');
    if (ersBadges) {
      ersBadges.innerHTML = `
        <span class="badge ${sts.drsAllowed ? 'active' : 'inactive'}">DRS ${sts.drsAllowed ? 'ON' : 'OFF'}</span>
        <span class="badge ${sts.pitLimiterStatus ? 'warning' : 'inactive'}">PIT LIM ${sts.pitLimiterStatus ? 'ON' : 'OFF'}</span>
        <span class="badge info">${ersModes[sts.ersDeployMode] || 'ERS'}</span>
      `;
    }

    // Fuel tab
    const fuelPct = clamp((sts.fuelInTank / sts.fuelCapacity) * 100, 0, 100);
    el('v-fuel-pct').textContent = fuelPct.toFixed(1) + '%';
    el('v-fuel-bar').style.width = fuelPct + '%';
    el('v-fuel').textContent = sts.fuelInTank.toFixed(2) + ' kg';
    el('v-fuel-cap').textContent = sts.fuelCapacity.toFixed(1) + ' kg';
    el('v-fuel-laps').textContent = sts.fuelRemainingLaps.toFixed(2);
    const fuelMixes = ['Lean', 'Standard', 'Rich', 'Max'];
    el('v-fuel-mix').textContent = fuelMixes[sts.fuelMix] || '─';
    el('v-pit-limiter').textContent = sts.pitLimiterStatus ? 'Active' : 'Off';
    el('v-brake-bias').textContent = sts.frontBrakeBias + '%';
    el('v-tc').textContent = ['Off', 'Medium', 'Full'][sts.tractionControl] || '─';
    el('v-abs').textContent = sts.antiLockBrakes ? 'On' : 'Off';
  }

  if (dmg) {
    // Bodywork damage
    const bodyEl = el('dmg-bodywork');
    if (bodyEl) {
      bodyEl.innerHTML =
        damageBar('Front Left Wing', dmg.frontLeftWingDamage) +
        damageBar('Front Right Wing', dmg.frontRightWingDamage) +
        damageBar('Rear Wing', dmg.rearWingDamage) +
        damageBar('Floor', dmg.floorDamage) +
        damageBar('Diffuser', dmg.diffuserDamage) +
        damageBar('Sidepod', dmg.sidepodDamage) +
        damageBar('Gearbox', dmg.gearBoxDamage);
    }

    // Engine wear
    const engEl = el('dmg-engine');
    if (engEl) {
      engEl.innerHTML =
        damageBar('ICE', dmg.engineICEWear) +
        damageBar('MGU-H', dmg.engineMGUHWear) +
        damageBar('MGU-K', dmg.engineMGUKWear) +
        damageBar('ES', dmg.engineESWear) +
        damageBar('CE', dmg.engineCEWear) +
        damageBar('TC', dmg.engineTCWear);
    }

    // Tyre wear
    const tyresEl = el('dmg-tyres');
    if (tyresEl) {
      const posLabel = ['RL', 'RR', 'FL', 'FR'];
      tyresEl.innerHTML = dmg.tyresWear.map((w, i) => {
        const wear = Math.round(w);
        const cls = dmgClass(wear);
        return `
          <div style="text-align:center">
            <div class="tyre-circle ${cls === 'dmg-low' ? 'temp-opt' : cls === 'dmg-mid' ? 'temp-warm' : cls === 'dmg-high' ? 'temp-hot' : 'temp-vhot'}" style="margin:0 auto 6px">
              <span class="tyre-temp">${wear}%</span>
            </div>
            <div class="tyre-label">${posLabel[i]}</div>
          </div>`;
      }).join('');
    }

    // Tyre detail tab
    const tyreInfoEl = el('tyre-info-body');
    if (tyreInfoEl && tel) {
      const posLabel = ['RL', 'RR', 'FL', 'FR'];
      tyreInfoEl.innerHTML = posLabel.map((pos, i) => `
        <div class="stat-row">
          <span class="stat-label">${pos} Surface</span>
          <span class="stat-value mono ${tyreClass(tel.tyreSurfaceTemp[i])}">${tel.tyreSurfaceTemp[i]} °C</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">${pos} Inner</span>
          <span class="stat-value mono ${tyreClass(tel.tyreInnerTemp[i])}">${tel.tyreInnerTemp[i]} °C</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">${pos} Wear</span>
          <span class="stat-value mono">${Math.round(dmg.tyresWear[i])}%</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">${pos} Pressure</span>
          <span class="stat-value mono">${tel.tyrePressure[i].toFixed(1)} PSI</span>
        </div>
        <hr style="border:none;border-top:1px solid var(--border);margin:4px 0">`
      ).join('');
    }

    const brakeEl = el('brake-temp-body');
    if (brakeEl && tel) {
      const posLabel = ['RL', 'RR', 'FL', 'FR'];
      brakeEl.innerHTML = posLabel.map((pos, i) => {
        const temp = tel.brakesTemp[i];
        const cls = temp > 900 ? 'bad' : temp > 700 ? 'warn' : temp > 300 ? 'good' : '';
        return `<div class="stat-row">
          <span class="stat-label">${pos}</span>
          <span class="stat-value mono ${cls}">${temp} °C</span>
        </div>`;
      }).join('');
    }
  }
}

// ─── Session page ─────────────────────────────────────────────────────────────
function buildSession() {
  el('page-session').innerHTML = `
    <div class="session-hero">
      <div class="session-track" id="s-track">─</div>
      <div class="session-type" id="s-type">─</div>
      <div class="session-time" id="s-timeleft">─:──</div>
      <div class="session-laps" id="s-laps">─</div>
    </div>
    <div class="grid-2" style="gap:16px">
      <div class="panel">
        <div class="panel-header">Conditions</div>
        <div class="panel-body">
          <div class="stat-row"><span class="stat-label">Weather</span><span class="stat-value" id="s-weather">─</span></div>
          <div class="stat-row"><span class="stat-label">Track Temp</span><span class="stat-value mono" id="s-ttemp">─</span></div>
          <div class="stat-row"><span class="stat-label">Air Temp</span><span class="stat-value mono" id="s-atemp">─</span></div>
          <div class="stat-row"><span class="stat-label">Pit speed limit</span><span class="stat-value mono" id="s-pit-limit">─</span></div>
          <div class="stat-row"><span class="stat-label">Safety car</span><span class="stat-value" id="s-sc">─</span></div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header">Session Info</div>
        <div class="panel-body">
          <div class="stat-row"><span class="stat-label">Track length</span><span class="stat-value mono" id="s-length">─</span></div>
          <div class="stat-row"><span class="stat-label">Total laps</span><span class="stat-value" id="s-total-laps">─</span></div>
          <div class="stat-row"><span class="stat-label">Duration</span><span class="stat-value mono" id="s-duration">─</span></div>
          <div class="stat-row"><span class="stat-label">Formula</span><span class="stat-value" id="s-formula">─</span></div>
        </div>
      </div>
    </div>
  `;
}

function updateSession() {
  const ses = state.session;
  if (!ses) return;
  el('s-track').textContent = ses.trackName || '─';
  el('s-type').textContent = ses.sessionTypeName || '─';
  el('s-timeleft').textContent = fmtCountdown(ses.sessionTimeLeft);
  el('s-laps').textContent = `Total Laps: ${ses.totalLaps}`;
  el('s-weather').innerHTML = `${weatherIcon(ses.weather)} ${ses.weatherName}`;
  el('s-ttemp').textContent = ses.trackTemperature + ' °C';
  el('s-atemp').textContent = ses.airTemperature + ' °C';
  el('s-pit-limit').textContent = ses.pitSpeedLimit + ' km/h';
  el('s-sc').textContent = safetyCarLabel(ses.safetyCarStatus) || 'None';
  el('s-length').textContent = (ses.trackLength / 1000).toFixed(3) + ' km';
  el('s-total-laps').textContent = ses.totalLaps;
  el('s-duration').textContent = fmtCountdown(ses.sessionDuration);
  const formulas = ['F1', 'F2', 'F3', 'F1 Classic', 'F2 2021', 'F1 (New)'];
  el('s-formula').textContent = formulas[ses.formula] || 'F1';
}

// ─── AI Engineer ──────────────────────────────────────────────────────────────

// Build a concise telemetry snapshot for the API context
function buildRaceContext(includeRivals = true) {
  const tel = state.telemetry;
  const sts = state.status;
  const dmg = state.damage;
  const lap = state.lapData?.[state.playerCarIndex];
  const ses = state.session;
  const ersModes = ['None', 'Medium', 'Overtake', 'Hotlap'];
  const ctx = {};

  if (ses) {
    ctx.track = ses.trackName;
    ctx.session = ses.sessionTypeName;
    ctx.weather = ses.weatherName;
    ctx.totalLaps = ses.totalLaps;
    ctx.timeLeftSec = ses.sessionTimeLeft;
  }
  if (lap) {
    ctx.myPosition = lap.carPosition;
    ctx.currentLap = lap.currentLapNum;
    ctx.lastLapMs = lap.lastLapTimeMs;
    ctx.currentLapMs = lap.currentLapTimeMs;
    ctx.pitStops = lap.numPitStops;
    ctx.gapToCarAheadMs = lap.deltaToCarAheadMs;
    ctx.gapToLeaderMs = lap.deltaToLeaderMs;
    ctx.lapInvalid = !!lap.currentLapInvalid;
    ctx.sector = lap.sector;
  }
  if (tel) {
    ctx.speedKph = tel.speed;
    ctx.gear = tel.gear;
    ctx.throttlePct = Math.round(tel.throttle * 100);
    ctx.brakePct = Math.round(tel.brake * 100);
    ctx.engineRPM = tel.engineRPM;
    ctx.drsActive = !!tel.drs;
    ctx.tyreSurfaceTemp = { RL: tel.tyreSurfaceTemp[0], RR: tel.tyreSurfaceTemp[1], FL: tel.tyreSurfaceTemp[2], FR: tel.tyreSurfaceTemp[3] };
    ctx.tyreInnerTemp = { RL: tel.tyreInnerTemp[0], RR: tel.tyreInnerTemp[1], FL: tel.tyreInnerTemp[2], FR: tel.tyreInnerTemp[3] };
    ctx.brakesTemp = { RL: tel.brakesTemp[0], RR: tel.brakesTemp[1], FL: tel.brakesTemp[2], FR: tel.brakesTemp[3] };
    ctx.engineTempC = tel.engineTemp;
  }
  if (sts) {
    const cmp = TYRE_COMPOUNDS[sts.visualTyreCompound];
    ctx.tyreCompound = cmp?.name || 'Unknown';
    ctx.tyreAgeLaps = sts.tyresAgeLaps;
    ctx.fuelKg = +sts.fuelInTank.toFixed(2);
    ctx.fuelLapsLeft = +sts.fuelRemainingLaps.toFixed(1);
    ctx.ersStoreMJ = +(sts.ersStoreEnergy / 1e6).toFixed(2);
    ctx.ersMode = ersModes[sts.ersDeployMode] || 'None';
    ctx.drsAllowed = !!sts.drsAllowed;
    ctx.pitLimiter = !!sts.pitLimiterStatus;
  }
  if (dmg) {
    ctx.tyreWearPct = { RL: Math.round(dmg.tyresWear[0]), RR: Math.round(dmg.tyresWear[1]), FL: Math.round(dmg.tyresWear[2]), FR: Math.round(dmg.tyresWear[3]) };
    ctx.frontWingDmg = { L: dmg.frontLeftWingDamage, R: dmg.frontRightWingDamage };
    ctx.rearWingDmg = dmg.rearWingDamage;
    ctx.floorDmg = dmg.floorDamage;
    ctx.engineWearPct = { ICE: dmg.engineICEWear, MGUH: dmg.engineMGUHWear, MGUK: dmg.engineMGUKWear, ES: dmg.engineESWear, TC: dmg.engineTCWear };
  }

  // Rivals — car directly ahead and directly behind
  if (includeRivals && state.lapData && lap) {
    const myPos = lap.carPosition;

    const carAheadLap = state.lapData.find(l => l?.carPosition === myPos - 1);
    const carBehindLap = state.lapData.find(l => l?.carPosition === myPos + 1);
    const carAheadIdx = carAheadLap ? state.lapData.indexOf(carAheadLap) : -1;
    const carBehindIdx = carBehindLap ? state.lapData.indexOf(carBehindLap) : -1;

    function rivalInfo(lapEntry, idx) {
      if (!lapEntry || idx < 0) return null;
      const rSts = state.allCarStatus?.[idx];
      const rPart = state.participants?.participants?.[idx];
      const rCmp = rSts ? (TYRE_COMPOUNDS[rSts.visualTyreCompound]?.name || 'Unknown') : null;
      return {
        name: rPart?.name || `Car ${idx + 1}`,
        position: lapEntry.carPosition,
        gapToThemMs: lapEntry.deltaToCarAheadMs,   // their gap to the car in front of them
        lastLapMs: lapEntry.lastLapTimeMs,
        tyreCompound: rCmp,
        tyreAgeLaps: rSts?.tyresAgeLaps ?? null,
        ersStoreMJ: rSts ? +(rSts.ersStoreEnergy / 1e6).toFixed(2) : null,
        ersMode: rSts ? (ersModes[rSts.ersDeployMode] || 'None') : null,
        pitStops: lapEntry.numPitStops,
        pitStatus: lapEntry.pitStatus,
      };
    }

    const ahead = rivalInfo(carAheadLap, carAheadIdx);
    const behind = rivalInfo(carBehindLap, carBehindIdx);
    if (ahead)  ctx.carAhead  = ahead;
    if (behind) ctx.carBehind = behind;
  }

  return ctx;
}

// ── Proximity monitoring (auto-radio trigger) ─────────────────────────────────
function getProximityScenario() {
  const lap = state.lapData?.[state.playerCarIndex];
  if (!lap) return null;

  const myPos = lap.carPosition;
  const carAheadLap = state.lapData?.find(l => l?.carPosition === myPos - 1);
  const carBehindLap = state.lapData?.find(l => l?.carPosition === myPos + 1);

  // gapAhead: my own deltaToCarAhead
  const gapAheadMs = lap.deltaToCarAheadMs;
  // gapBehind: the car behind's deltaToCarAhead (= their gap to us)
  const gapBehindMs = carBehindLap?.deltaToCarAheadMs;

  const isAttacking = gapAheadMs > 0 && gapAheadMs < 1200 && carAheadLap != null;
  const isDefending = gapBehindMs != null && gapBehindMs > 0 && gapBehindMs < 1000;

  if (isAttacking && isDefending) return 'mixed';
  if (isAttacking) return 'attack';
  if (isDefending) return 'defense';
  return null;
}

async function triggerAutoRadio(scenario) {
  if (radio.awaiting) return;
  radio.awaiting = true;

  const now = Date.now();
  radio.lastTrigger[scenario === 'mixed' ? 'attack' : scenario] = now;

  const ctx = buildRaceContext(true);
  const lap = state.lapData?.[state.playerCarIndex];

  let prompt = '';
  if (scenario === 'attack' || scenario === 'mixed') {
    const gapMs = lap?.deltaToCarAheadMs ?? 0;
    prompt += `ATTACK SITUATION: Car ahead is ${(gapMs / 1000).toFixed(2)}s in front. Evaluate overtake opportunity.\n`;
  }
  if (scenario === 'defense' || scenario === 'mixed') {
    const myPos = lap?.carPosition;
    const carBehindLap = state.lapData?.find(l => l?.carPosition === myPos + 1);
    const gapMs = carBehindLap?.deltaToCarAheadMs ?? 0;
    prompt += `DEFENSE SITUATION: Car behind is ${(gapMs / 1000).toFixed(2)}s behind. Evaluate defense requirements.\n`;
  }
  prompt += 'Provide ENGINEER_DECISION output.';

  // Show "thinking" card in radio feed
  const feedEl = el('radio-feed');
  const thinkingCard = document.createElement('div');
  thinkingCard.className = 'radio-card thinking';
  thinkingCard.innerHTML = `<span class="radio-tag tag-${scenario}">● ${scenario.toUpperCase()}</span> <span class="radio-thinking">Engineer thinking…</span>`;
  if (feedEl) { feedEl.prepend(thinkingCard); }

  const result = await window.raceEngineer.askEngineer({
    question: prompt,
    context: ctx,
    mode: 'ENGINEER_DECISION',
  });

  thinkingCard.remove();
  radio.awaiting = false;

  if (result.error || !result.response) {
    appendRadioCard(scenario, 'medium', result.error || 'No response.', true);
    return;
  }

  // Parse ENGINEER_DECISION format
  const text = result.response;
  const speakMatch   = text.match(/speak:\s*(yes|no)/i);
  const urgencyMatch = text.match(/urgency:\s*(\w+)/i);
  const radioMatch   = text.match(/radio:\s*(.+)/is);

  const shouldSpeak = speakMatch ? speakMatch[1].toLowerCase() === 'yes' : true;
  const urgency = urgencyMatch?.[1]?.toLowerCase() || 'medium';
  const radioText = radioMatch
    ? radioMatch[1].trim().replace(/\n.*/s, '') // first line only
    : text.split('\n').find(l => l.trim().length > 10) || text;

  if (shouldSpeak) {
    appendRadioCard(scenario, urgency, radioText, false);
  }
}

function appendRadioCard(scenario, urgency, text, isError) {
  const feedEl = el('radio-feed');
  if (!feedEl) return;

  const time = new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const card = document.createElement('div');
  card.className = `radio-card ${isError ? 'radio-error' : ''} urgency-${urgency}`;
  card.innerHTML = `
    <div class="radio-card-header">
      <span class="radio-tag tag-${scenario}">${scenario.toUpperCase()}</span>
      <span class="radio-urgency urgency-${urgency}">${urgency.toUpperCase()}</span>
      <span class="radio-time">${time}</span>
    </div>
    <div class="radio-text">${text}</div>
  `;
  feedEl.prepend(card);

  // Keep max 20 messages
  while (feedEl.children.length > 20) feedEl.removeChild(feedEl.lastChild);
}

// Called from the RAF tick — check proximity every ~5s
let lastProximityCheck = 0;
function checkAutoRadio() {
  if (!radio.enabled || !state.connected) return;
  const now = Date.now();
  if (now - lastProximityCheck < 5000) return;
  lastProximityCheck = now;

  const scenario = getProximityScenario();
  if (!scenario) { radio.prevScenario = null; return; }

  // Only re-trigger if scenario changed or cooldown elapsed
  const cooldownKey = scenario === 'mixed' ? 'attack' : scenario;
  const elapsed = now - (radio.lastTrigger[cooldownKey] || 0);
  const scenarioChanged = scenario !== radio.prevScenario;

  if (scenarioChanged || elapsed >= radio.COOLDOWN_MS) {
    radio.prevScenario = scenario;
    triggerAutoRadio(scenario);
  }
}

// ── Engineer page UI ──────────────────────────────────────────────────────────
function buildEngineer() {
  el('page-engineer').innerHTML = `
    <div class="engineer-header">
      <span>🔧</span>
      <h2>AI Race Engineer</h2>
      <span class="model-badge">claude-opus-4-6</span>
      <div style="margin-left:auto;display:flex;align-items:center;gap:10px">
        <label class="context-toggle" style="margin:0">
          <input type="checkbox" id="radio-enabled" checked>
          Auto Radio
        </label>
        <button id="clear-radio" style="font-size:11px;padding:3px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:3px;color:var(--text2);cursor:pointer">Clear</button>
      </div>
    </div>

    <!-- Proximity indicator -->
    <div id="proximity-bar" class="proximity-bar hidden">
      <span id="prox-ahead"></span>
      <span id="prox-me">YOU</span>
      <span id="prox-behind"></span>
    </div>

    <!-- Radio feed (auto-triggered messages) -->
    <div class="radio-feed-wrap">
      <div class="section-title" style="padding:10px 16px 4px;border-bottom:1px solid var(--border)">
        Radio Feed <span style="font-weight:400;color:var(--text3);font-size:10px">(attack / defense only)</span>
      </div>
      <div id="radio-feed" class="radio-feed">
        <div class="radio-feed-empty">No radio messages yet. Triggers when within 1.2s of a rival.</div>
      </div>
    </div>

    <!-- Manual query -->
    <div class="chat-input-area" style="border-top:2px solid var(--border)">
      <div style="flex:1;display:flex;flex-direction:column;gap:6px">
        <span style="font-size:11px;color:var(--text3)">Manual query — ask any tactical question</span>
        <textarea class="chat-input" id="chat-input" placeholder="e.g. Should I box this lap? (Enter to send)" rows="2"></textarea>
      </div>
      <button class="chat-send-btn" id="chat-send">Ask</button>
    </div>

    <!-- Manual response area -->
    <div id="manual-response" class="manual-response hidden">
      <div class="radio-card urgency-medium" id="manual-card">
        <div class="radio-text" id="manual-text"></div>
      </div>
    </div>
  `;

  // Toggle auto-radio
  el('radio-enabled').addEventListener('change', (e) => {
    radio.enabled = e.target.checked;
  });

  // Clear feed
  el('clear-radio').addEventListener('click', () => {
    const feedEl = el('radio-feed');
    feedEl.innerHTML = '<div class="radio-feed-empty">Feed cleared.</div>';
    radio.prevScenario = null;
    radio.lastTrigger = { attack: 0, defense: 0 };
  });

  // Manual query
  const input = el('chat-input');
  const sendBtn = el('chat-send');
  const manualResp = el('manual-response');
  const manualText = el('manual-text');

  async function sendManual() {
    const q = input.value.trim();
    if (!q || sendBtn.disabled) return;
    input.value = '';
    sendBtn.disabled = true;
    sendBtn.textContent = '…';

    manualResp.classList.remove('hidden');
    manualText.textContent = 'Thinking…';

    const ctx = buildRaceContext(true);
    const result = await window.raceEngineer.askEngineer({ question: q, context: ctx, mode: 'DRIVER_RADIO' });

    manualText.textContent = result.error ? '⚠ ' + result.error : result.response;
    sendBtn.disabled = false;
    sendBtn.textContent = 'Ask';
  }

  sendBtn.addEventListener('click', sendManual);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendManual(); }
  });
}

// Update proximity bar on the engineer page
function updateEngineerProximity() {
  const proxBar = el('proximity-bar');
  if (!proxBar) return;

  const lap = state.lapData?.[state.playerCarIndex];
  if (!lap) { proxBar.classList.add('hidden'); return; }

  const myPos = lap.carPosition;
  const carAheadLap = state.lapData?.find(l => l?.carPosition === myPos - 1);
  const carBehindLap = state.lapData?.find(l => l?.carPosition === myPos + 1);

  const gapAheadMs = lap.deltaToCarAheadMs;
  const gapBehindMs = carBehindLap?.deltaToCarAheadMs;

  const aheadIdx = carAheadLap ? state.lapData.indexOf(carAheadLap) : -1;
  const behindIdx = carBehindLap ? state.lapData.indexOf(carBehindLap) : -1;
  const aheadName = state.participants?.participants?.[aheadIdx]?.name || (carAheadLap ? `P${myPos - 1}` : null);
  const behindName = state.participants?.participants?.[behindIdx]?.name || (carBehindLap ? `P${myPos + 1}` : null);

  const inRange = (gapAheadMs > 0 && gapAheadMs < 1200) || (gapBehindMs != null && gapBehindMs < 1000);
  if (!inRange) { proxBar.classList.add('hidden'); return; }

  proxBar.classList.remove('hidden');

  const aheadEl = el('prox-ahead');
  const behindEl = el('prox-behind');

  if (aheadEl) {
    if (aheadName && gapAheadMs > 0 && gapAheadMs < 1200) {
      aheadEl.textContent = `${aheadName}  +${(gapAheadMs / 1000).toFixed(2)}s`;
      aheadEl.className = 'prox-rival prox-attack';
    } else {
      aheadEl.textContent = '';
      aheadEl.className = 'prox-rival';
    }
  }
  if (behindEl) {
    if (behindName && gapBehindMs != null && gapBehindMs < 1000) {
      behindEl.textContent = `${behindName}  -${(gapBehindMs / 1000).toFixed(2)}s`;
      behindEl.className = 'prox-rival prox-defend';
    } else {
      behindEl.textContent = '';
      behindEl.className = 'prox-rival';
    }
  }
}

// ─── Settings page ────────────────────────────────────────────────────────────
function buildSettings() {
  el('page-settings').innerHTML = `
    <div style="max-width:540px">
      <div class="settings-section">
        <h3>Telemetry Connection</h3>
        <div class="panel">
          <div class="panel-body">
            <div class="stat-row"><span class="stat-label">Listen port</span><span class="stat-value mono">20777</span></div>
            <div class="stat-row"><span class="stat-label">Protocol</span><span class="stat-value">UDP</span></div>
            <div class="stat-row"><span class="stat-label">Status</span><span class="stat-value" id="set-conn-status">Offline</span></div>
            <p class="settings-note" style="margin-top:10px">
              In your game: Settings → Telemetry → UDP Telemetry: On, IP = <strong>your PC's local IP</strong>, Port = <strong>20777</strong>, Format = F1 25, Send Rate = 60Hz.
            </p>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3>AI Race Engineer (Claude API)</h3>
        <div class="settings-field">
          <label>Anthropic API Key</label>
          <input type="password" class="settings-input" id="api-key-input" placeholder="sk-ant-..." />
        </div>
        <button class="settings-save-btn" id="save-api-key">Save Key</button>
        <p class="settings-note">Your API key is only stored in memory for this session. Get a key at console.anthropic.com. The AI Engineer uses <strong>claude-opus-4-6</strong>.</p>
      </div>
    </div>
  `;

  el('save-api-key').addEventListener('click', () => {
    const key = el('api-key-input').value.trim();
    if (key) {
      window.raceEngineer.setApiKey(key);
      el('save-api-key').textContent = '✓ Saved';
      setTimeout(() => { el('save-api-key').textContent = 'Save Key'; }, 2000);
    }
  });
}

// ─── Live update loop ─────────────────────────────────────────────────────────
function tick() {
  const activePage = document.querySelector('.page.active')?.id;
  updateTopBar();
  if (activePage === 'page-dashboard') updateDashboard();
  if (activePage === 'page-timing')   updateTiming();
  if (activePage === 'page-vehicle')  updateVehicle();
  if (activePage === 'page-session')  updateSession();
  if (activePage === 'page-engineer') updateEngineerProximity();
  // Auto-radio proximity check runs regardless of active page
  checkAutoRadio();
  requestAnimationFrame(tick);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  // Load lookups from main process
  const lookups = await window.raceEngineer.getLookups();
  TEAM_COLORS = lookups.TEAM_COLORS;
  TYRE_COMPOUNDS = lookups.TYRE_COMPOUNDS;

  // Build all pages
  buildDashboard();
  buildTiming();
  buildVehicle();
  buildSession();
  buildEngineer();
  buildSettings();

  // Nav routing
  document.querySelectorAll('.nav-item').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(a.dataset.page);
    });
  });

  // Start button
  el('btn-start').addEventListener('click', () => {
    window.raceEngineer.startTelemetry();
  });

  // IPC data listeners
  window.raceEngineer.onTelemetryStarted((data) => {
    state.connected = true;
    el('connection-dot').className = 'conn-dot online';
    el('connection-label').textContent = `Live · UDP :${data.port}`;
    el('btn-start').textContent = '● Listening';
    el('btn-start').className = 'start-btn listening';
    const setConn = el('set-conn-status');
    if (setConn) setConn.textContent = 'Connected';
  });

  window.raceEngineer.onSessionUpdate((d) => { state.session = d; state.playerCarIndex = d.playerCarIndex ?? 0; });
  window.raceEngineer.onLapUpdate((d) => { state.lapData = d.lapData; state.playerCarIndex = d.playerCarIndex ?? 0; });
  window.raceEngineer.onTelemetryUpdate((d) => { state.telemetry = d; });
  window.raceEngineer.onStatusUpdate((d) => { state.status = d; });
  window.raceEngineer.onDamageUpdate((d) => { state.damage = d; });
  window.raceEngineer.onParticipantsUpdate((d) => { state.participants = d; });
  window.raceEngineer.onAllStatusUpdate((d) => { state.allCarStatus = d; });

  // Start update loop
  requestAnimationFrame(tick);
}

init();

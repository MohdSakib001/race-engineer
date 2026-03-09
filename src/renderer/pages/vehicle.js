export function createVehiclePage(deps) {
  const {
    state,
    el,
    popoutBtn,
    f1CarSvg,
    tyreClass,
    clamp,
    getBatteryDelta,
    batteryDeltaHTML,
    tyreBadge,
    dmgClass,
  } = deps;

  function dmgColor(pct) {
    if (pct < 10) return '#1a5c2e';
    if (pct < 30) return '#7a5800';
    if (pct < 60) return '#8a2a00';
    return '#cc0000';
  }

  function damageBar(label, pct) {
    const cls = dmgClass(pct);
    return `
      <div class="damage-item" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span class="damage-item-label">${label}</span>
          <span class="damage-pct">${Math.round(pct)}%</span>
        </div>
        <div class="damage-item-bar"><div class="damage-fill ${cls}" style="width:${clamp(pct, 0, 100)}%"></div></div>
      </div>`;
  }

  function buildVehicle() {
    el('page-vehicle').innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:4px">${popoutBtn('vehicle', 'Vehicle Status', 1200, 860)}</div>
      <div class="tabs">
        <button class="tab-btn active" data-tab="overview">Overview</button>
        <button class="tab-btn" data-tab="setup">Car Setup</button>
      </div>
      <div class="tab-content active" id="tab-overview">
        <div class="vehicle-overview-columns">
          <div class="vehicle-overview-col vehicle-overview-col-motion">
            <div class="panel vehicle-car-panel">
              <div class="panel-header" style="display:flex;justify-content:space-between;align-items:center">
                Car Damage & Tyres
                <span style="display:flex;gap:10px">
                  <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text2)"><span style="width:9px;height:9px;background:#1a5c2e;display:inline-block;border-radius:2px"></span>Good</span>
                  <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text2)"><span style="width:9px;height:9px;background:#7a5800;display:inline-block;border-radius:2px"></span>Wear</span>
                  <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text2)"><span style="width:9px;height:9px;background:#8a2a00;display:inline-block;border-radius:2px"></span>Damage</span>
                  <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text2)"><span style="width:9px;height:9px;background:#cc0000;display:inline-block;border-radius:2px"></span>Critical</span>
                </span>
              </div>
              <div class="panel-body" style="padding:8px">
                <div class="veh-car-stage">
                  <div class="f1-car-wrap compact">
                    ${f1CarSvg}
                    <div class="zone-pill zone-fw" id="ov-fw">FW -%</div>
                    <div class="zone-pill zone-rw" id="ov-rw">RW -%</div>
                    <div class="zone-pill zone-fl" id="ov-FL">FL -</div>
                    <div class="zone-pill zone-fr" id="ov-FR">FR -</div>
                    <div class="zone-pill zone-rl" id="ov-RL">RL -</div>
                    <div class="zone-pill zone-rr" id="ov-RR">RR -</div>
                  </div>
                </div>
              </div>
            </div>
            <div class="panel">
              <div class="panel-header">Motion</div>
              <div class="panel-body">
                <div class="veh-stat"><span class="veh-stat-label">Speed</span><span class="veh-stat-value" id="v-speed">-</span></div>
                <div class="veh-stat"><span class="veh-stat-label">Gear</span><span class="veh-stat-value" id="v-gear">-</span></div>
                <div class="veh-stat"><span class="veh-stat-label">RPM</span><span class="veh-stat-value" id="v-rpm">-</span></div>
                <div class="veh-stat"><span class="veh-stat-label">Engine C</span><span class="veh-stat-value" id="v-etemp">-</span></div>
                <div class="veh-stat"><span class="veh-stat-label">Throttle</span><span class="veh-stat-value" id="v-thr">-</span></div>
                <div class="veh-stat"><span class="veh-stat-label">Brake</span><span class="veh-stat-value" id="v-brk">-</span></div>
                <div class="veh-stat"><span class="veh-stat-label">Steer</span><span class="veh-stat-value" id="v-steer">-</span></div>
                <div class="veh-stat"><span class="veh-stat-label">DRS</span><span class="veh-stat-value" id="v-drs">-</span></div>
              </div>
            </div>
          </div>
          <div class="vehicle-overview-col vehicle-overview-col-mid">
            <div class="vehicle-tyre-stack">
              <div class="panel">
                <div class="panel-header">Tyre Surface C</div>
                <div class="panel-body">
                  <div class="tyres-grid" id="v-tyres">
                    ${['FL', 'FR', 'RL', 'RR'].map((pos) => `
                      <div class="tyre-cell">
                        <div class="tyre-circle temp-cool" id="vtc-${pos}">
                          <span class="tyre-temp" id="vtt-${pos}">-</span>
                          <span class="tyre-unit">C</span>
                        </div>
                        <div class="tyre-label">${pos}</div>
                      </div>`).join('')}
                  </div>
                </div>
              </div>
              <div class="panel">
                <div class="panel-header">Tyre Detail</div>
                <div class="panel-body">
                  <div class="tyre-mini-grid">
                    ${['FL', 'FR', 'RL', 'RR'].map((pos) => `
                      <div class="tyre-mini-cell">
                        <div class="tyre-mini-ring" id="tmr-${pos}">
                          <span id="tmw-${pos}">-</span>
                        </div>
                        <div class="tyre-mini-label">${pos}</div>
                        <div style="font-size:10px;color:var(--text2)" id="tmi-${pos}">-C inner</div>
                        <div style="font-size:10px;color:var(--text2)" id="tmp-${pos}">- PSI</div>
                        <div style="font-size:10px;color:var(--text3)" id="tmbl-${pos}">blister -%</div>
                      </div>`).join('')}
                  </div>
                </div>
              </div>
            </div>
            <div class="panel">
              <div class="panel-header">Fuel</div>
              <div class="panel-body">
                <div class="ers-bar-wrap" style="margin:0 0 10px">
                  <div class="ers-bar-label"><span>Fuel Load</span><span id="v-fuel-pct">-%</span></div>
                  <div class="ers-bar-track"><div class="prog-fill fuel" id="v-fuel-bar" style="width:0%;height:100%"></div></div>
                </div>
                <div class="veh-stat"><span class="veh-stat-label">In tank</span><span class="veh-stat-value" id="v-fuel">-</span></div>
                <div class="veh-stat"><span class="veh-stat-label">Capacity</span><span class="veh-stat-value" id="v-fuel-cap">-</span></div>
                <div class="veh-stat"><span class="veh-stat-label">Laps left</span><span class="veh-stat-value" id="v-fuel-laps">-</span></div>
              </div>
            </div>
          </div>
          <div class="vehicle-overview-col vehicle-overview-col-power">
            <div class="panel vehicle-panel-ers">
              <div class="panel-header">ERS</div>
              <div class="panel-body">
                <div class="badge-row" id="v-ers-badges"></div>
                <div class="ers-bar-wrap" style="margin:6px 0 10px">
                  <div class="ers-bar-label"><span>Battery</span><span id="v-ers-store">-</span></div>
                  <div class="ers-bar-track"><div class="ers-bar-fill" id="v-ers-bar" style="width:0%"></div></div>
                </div>
                <div class="veh-stat"><span class="veh-stat-label">Mode</span><span class="veh-stat-value" id="v-ers-mode">-</span></div>
                <div class="veh-stat"><span class="veh-stat-label">Deployed</span><span class="veh-stat-value" id="v-ers-dep">-</span></div>
                <div class="veh-stat"><span class="veh-stat-label">MGU-K Harv</span><span class="veh-stat-value" id="v-ers-hk">-</span></div>
                <div class="veh-stat"><span class="veh-stat-label">MGU-H Harv</span><span class="veh-stat-value" id="v-ers-hh">-</span></div>
                <div class="veh-stat"><span class="veh-stat-label">ICE Power</span><span class="veh-stat-value" id="v-ice-pwr">-</span></div>
                <div class="veh-stat"><span class="veh-stat-label">MGU-K Pwr</span><span class="veh-stat-value" id="v-mguk-pwr">-</span></div>
                <div class="veh-stat"><span class="veh-stat-label">Store %</span><span class="veh-stat-value" id="v-ers-pct">-</span></div>
                <div style="margin-top:8px;border-top:1px solid var(--border);padding-top:6px">
                  <div class="section-title" style="margin-bottom:4px">Battery vs Rivals</div>
                  <div id="v-battery-delta"></div>
                </div>
              </div>
            </div>
            <div class="panel vehicle-panel-power">
              <div class="panel-header">Power Unit Wear</div>
              <div class="panel-body"><div id="dmg-engine"></div></div>
            </div>
            <div class="panel vehicle-panel-bodywork">
              <div class="panel-header">Bodywork Damage</div>
              <div class="panel-body"><div id="dmg-bodywork"></div></div>
            </div>
          </div>
        </div>
      </div>
      <div class="tab-content" id="tab-setup">
        <div class="vehicle-setup-grid">
          <div class="panel">
            <div class="panel-header">Driver Aids</div>
            <div class="panel-body">
              <div class="veh-stat"><span class="veh-stat-label">Fuel Mix</span><span class="veh-stat-value" id="v-fuel-mix"></span></div>
              <div class="veh-stat"><span class="veh-stat-label">Front Brake Bias</span><span class="veh-stat-value" id="v-brake-bias"></span></div>
              <div class="veh-stat"><span class="veh-stat-label">Traction Control</span><span class="veh-stat-value" id="v-tc"></span></div>
              <div class="veh-stat"><span class="veh-stat-label">ABS</span><span class="veh-stat-value" id="v-abs"></span></div>
              <div class="veh-stat"><span class="veh-stat-label">Pit Limiter</span><span class="veh-stat-value" id="v-pit-limiter"></span></div>
              <div class="veh-stat"><span class="veh-stat-label">ERS Deploy Mode</span><span class="veh-stat-value" id="v-setup-ers-mode"></span></div>
              <div class="veh-stat"><span class="veh-stat-label">DRS Allowed</span><span class="veh-stat-value" id="v-setup-drs"></span></div>
            </div>
          </div>
          <div class="panel">
            <div class="panel-header">Tyre Compound</div>
            <div class="panel-body">
              <div class="veh-stat"><span class="veh-stat-label">Visual</span><span class="veh-stat-value" id="v-setup-tyre-visual"></span></div>
              <div class="veh-stat"><span class="veh-stat-label">Actual</span><span class="veh-stat-value" id="v-setup-tyre-actual"></span></div>
              <div class="veh-stat"><span class="veh-stat-label">Tyre Age (laps)</span><span class="veh-stat-value" id="v-setup-tyre-age"></span></div>
              <div class="veh-stat"><span class="veh-stat-label">Fitted Tyre Age</span><span class="veh-stat-value" id="v-setup-fitted-age"></span></div>
            </div>
          </div>
          <div class="panel">
            <div class="panel-header">Tyre Pressures & Inner Temps</div>
            <div class="panel-body">
              <div class="section-title" style="margin-bottom:6px">Surface Pressure</div>
              ${['FL', 'FR', 'RL', 'RR'].map((pos) => `
                <div class="veh-stat"><span class="veh-stat-label">${pos}</span><span class="veh-stat-value" id="vtp-${pos}"></span></div>`).join('')}
              <div style="margin-top:10px">
                <div class="section-title" style="margin-bottom:6px">Inner Temperature</div>
                ${['FL', 'FR', 'RL', 'RR'].map((pos) => `
                  <div class="veh-stat"><span class="veh-stat-label">${pos}</span><span class="veh-stat-value" id="vti-${pos}"></span></div>`).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    el('page-vehicle').querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        el('page-vehicle').querySelectorAll('.tab-btn').forEach((node) => node.classList.remove('active'));
        el('page-vehicle').querySelectorAll('.tab-content').forEach((node) => node.classList.remove('active'));
        btn.classList.add('active');
        el(`tab-${btn.dataset.tab}`).classList.add('active');
      });
    });
  }

  function updateVehicle() {
    const tel = state.telemetry;
    const sts = state.status;
    const dmg = state.damage;
    if (!tel) return;

    el('v-speed').textContent = tel.speed + ' km/h';
    el('v-gear').textContent = tel.gear <= 0 ? (tel.gear === 0 ? 'N' : 'R') : tel.gear;
    el('v-rpm').textContent = tel.engineRPM.toLocaleString() + ' RPM';
    el('v-etemp').textContent = tel.engineTemp + ' C';
    el('v-thr').textContent = (tel.throttle * 100).toFixed(1) + '%';
    el('v-brk').textContent = (tel.brake * 100).toFixed(1) + '%';
    el('v-steer').textContent = (tel.steer * 100).toFixed(1) + '%';
    el('v-drs').innerHTML = tel.drs
      ? '<span class="badge active">ON</span>'
      : '<span class="badge inactive">OFF</span>';

    const tyreOrder = { RL: 0, RR: 1, FL: 2, FR: 3 };
    for (const [pos, idx] of Object.entries(tyreOrder)) {
      const surf = tel.tyreSurfaceTemp[idx];
      const circle = el(`vtc-${pos}`);
      if (circle) {
        circle.className = `tyre-circle ${tyreClass(surf)}`;
        el(`vtt-${pos}`).textContent = surf;
      }
    }

    if (sts) {
      const ersPct = clamp((sts.ersStoreEnergy / 4000000) * 100, 0, 100);
      const ersModes = ['None', 'Medium', 'Overtake', 'Hotlap'];
      el('v-ers-store').textContent = (sts.ersStoreEnergy / 1000000).toFixed(2) + ' MJ';
      el('v-ers-bar').style.width = ersPct + '%';
      if (ersPct > 90) el('v-ers-bar').classList.add('full');
      else el('v-ers-bar').classList.remove('full');
      el('v-ers-mode').textContent = ersModes[sts.ersDeployMode] || 'None';
      el('v-ers-dep').textContent = (sts.ersDeployedThisLap / 1000000).toFixed(2) + ' MJ';
      el('v-ers-hk').textContent = (sts.ersHarvestedMGUK / 1000000).toFixed(2) + ' MJ';
      el('v-ers-hh').textContent = (sts.ersHarvestedMGUH / 1000000).toFixed(2) + ' MJ';
      el('v-ice-pwr').textContent = (sts.enginePowerICE / 1000).toFixed(0) + ' kW';
      el('v-mguk-pwr').textContent = (sts.enginePowerMGUK / 1000).toFixed(0) + ' kW';
      el('v-ers-pct').textContent = ersPct.toFixed(1) + '%';

      const ersBadges = el('v-ers-badges');
      if (ersBadges) {
        ersBadges.innerHTML = `
          <span class="badge ${sts.drsAllowed ? 'active' : 'inactive'}">DRS ${sts.drsAllowed ? 'ON' : 'OFF'}</span>
          <span class="badge ${sts.pitLimiterStatus ? 'warning' : 'inactive'}">PIT LIM ${sts.pitLimiterStatus ? 'ON' : 'OFF'}</span>
          <span class="badge info">${ersModes[sts.ersDeployMode] || 'ERS'}</span>`;
      }

      const vBattDelta = el('v-battery-delta');
      if (vBattDelta) {
        const delta = getBatteryDelta();
        vBattDelta.innerHTML = batteryDeltaHTML(delta) || '<span class="text-dim" style="font-size:11px">No rival data</span>';
      }

      const fuelPct = clamp((sts.fuelInTank / sts.fuelCapacity) * 100, 0, 100);
      el('v-fuel-pct').textContent = fuelPct.toFixed(1) + '%';
      el('v-fuel-bar').style.width = fuelPct + '%';
      el('v-fuel').textContent = sts.fuelInTank.toFixed(2) + ' kg';
      el('v-fuel-cap').textContent = sts.fuelCapacity.toFixed(1) + ' kg';
      el('v-fuel-laps').textContent = sts.fuelRemainingLaps.toFixed(2);

      const fuelMixes = ['Lean', 'Standard', 'Rich', 'Max'];
      el('v-fuel-mix').textContent = fuelMixes[sts.fuelMix] || '';
      el('v-brake-bias').textContent = sts.frontBrakeBias + '%';
      el('v-tc').textContent = ['Off', 'Medium', 'Full'][sts.tractionControl] || '';
      el('v-abs').textContent = sts.antiLockBrakes ? 'On' : 'Off';
      el('v-pit-limiter').textContent = sts.pitLimiterStatus ? 'Active' : 'Off';
      const setupErs = el('v-setup-ers-mode');
      if (setupErs) setupErs.textContent = ersModes[sts.ersDeployMode] || 'None';
      const setupDrs = el('v-setup-drs');
      if (setupDrs) {
        setupDrs.innerHTML = sts.drsAllowed
          ? '<span class="badge active">Allowed</span>'
          : '<span class="badge inactive">Not allowed</span>';
      }
      const visual = el('v-setup-tyre-visual');
      if (visual) visual.innerHTML = tyreBadge(sts.visualTyreCompound);
      const actual = el('v-setup-tyre-actual');
      if (actual) actual.innerHTML = tyreBadge(sts.actualTyreCompound);
      const tyreAge = el('v-setup-tyre-age');
      if (tyreAge) tyreAge.textContent = sts.tyresAgeLaps != null ? sts.tyresAgeLaps + ' laps' : '';
      const fittedAge = el('v-setup-fitted-age');
      if (fittedAge) fittedAge.textContent = sts.tyresFitted != null ? (sts.tyresFitted ? 'Fitted' : 'Not fitted') : '';
    }

    const posKeys = ['RL', 'RR', 'FL', 'FR'];
    const tyreIdxMap = { RL: 0, RR: 1, FL: 2, FR: 3 };
    for (const pos of posKeys) {
      const idx = tyreIdxMap[pos];
      const wear = dmg ? Math.round(dmg.tyresWear[idx]) : null;
      const inner = tel.tyreInnerTemp[idx];
      const psi = tel.tyrePressure[idx].toFixed(1);
      const ring = el(`tmr-${pos}`);
      if (ring) {
        const col = dmg ? dmgColor(wear) : '#555';
        ring.style.borderColor = col;
        el(`tmw-${pos}`).textContent = dmg ? wear + '%' : '';
      }
      const iEl = el(`tmi-${pos}`);
      if (iEl) iEl.textContent = inner + 'C inner';
      const pEl = el(`tmp-${pos}`);
      if (pEl) pEl.textContent = psi + ' PSI';
      const blisterEl = el(`tmbl-${pos}`);
      if (blisterEl && dmg?.tyreBlisters) {
        const bl = dmg.tyreBlisters[idx];
        const blCls = bl > 60 ? 'color:#dc0000' : bl > 30 ? 'color:#ff8700' : bl > 10 ? 'color:#ffd700' : '';
        blisterEl.innerHTML = `<span style="${blCls}">blister ${bl}%</span>`;
      }
      const viEl = el(`vti-${pos}`);
      if (viEl) viEl.textContent = inner + ' C';
      const vpEl = el(`vtp-${pos}`);
      if (vpEl) vpEl.textContent = psi + ' PSI';
      const surf = tel.tyreSurfaceTemp[idx];
      const ovTyre = el(`ov-${pos}`);
      if (ovTyre) ovTyre.textContent = wear != null ? `${pos} ${wear}%  ${surf}C` : `${pos} `;
    }

    if (dmg) {
      const bodyEl = el('dmg-bodywork');
      if (bodyEl) {
        bodyEl.innerHTML =
          damageBar('FW Left', dmg.frontLeftWingDamage) +
          damageBar('FW Right', dmg.frontRightWingDamage) +
          damageBar('Rear Wing', dmg.rearWingDamage) +
          damageBar('Floor', dmg.floorDamage) +
          damageBar('Diffuser', dmg.diffuserDamage) +
          damageBar('Sidepod', dmg.sidepodDamage) +
          damageBar('Gearbox', dmg.gearBoxDamage) +
          (dmg.drsFault ? '<div class="fault-badge"> DRS FAULT</div>' : '') +
          (dmg.ersFault ? '<div class="fault-badge"> ERS FAULT</div>' : '') +
          (dmg.engineBlown ? '<div class="fault-badge crit"> ENGINE BLOWN</div>' : '') +
          (dmg.engineSeized ? '<div class="fault-badge crit"> ENGINE SEIZED</div>' : '');
      }

      const engEl = el('dmg-engine');
      if (engEl) {
        engEl.innerHTML =
          damageBar('ICE', dmg.engineICEWear) +
          damageBar('MGU-H', dmg.engineMGUHWear) +
          damageBar('MGU-K', dmg.engineMGUKWear) +
          damageBar('ES', dmg.engineESWear) +
          damageBar('CE', dmg.engineCEWear) +
          damageBar('TC', dmg.engineTCWear) +
          damageBar('Engine', dmg.engineDamage);
      }

      const zoneMap = {
        'fw-l': dmg.frontLeftWingDamage,
        'fw-r': dmg.frontRightWingDamage,
        rw: dmg.rearWingDamage,
        floor: dmg.floorDamage,
        diffuser: dmg.diffuserDamage,
        'sp-l': dmg.sidepodDamage,
        'sp-r': dmg.sidepodDamage,
        'tyre-fl': dmg.tyresWear[2],
        'tyre-fr': dmg.tyresWear[3],
        'tyre-rl': dmg.tyresWear[0],
        'tyre-rr': dmg.tyresWear[1],
      };
      for (const [id, pct] of Object.entries(zoneMap)) {
        const zoneEl = el(`zone-${id}`);
        if (zoneEl) zoneEl.setAttribute('fill', dmgColor(pct));
      }
      const fwEl = el('ov-fw');
      if (fwEl) {
        const fwPct = Math.round((dmg.frontLeftWingDamage + dmg.frontRightWingDamage) / 2);
        fwEl.textContent = `FW ${fwPct}%`;
      }
      const rwEl = el('ov-rw');
      if (rwEl) rwEl.textContent = `RW ${Math.round(dmg.rearWingDamage)}%`;
    } else {
      const fwEl = el('ov-fw');
      if (fwEl) fwEl.textContent = 'FW %';
      const rwEl = el('ov-rw');
      if (rwEl) rwEl.textContent = 'RW %';
    }
  }

  return { buildVehicle, updateVehicle };
}

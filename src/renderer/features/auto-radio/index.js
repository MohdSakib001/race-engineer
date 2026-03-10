export function createAutoRadioFeature(deps) {
  const {
    state,
    radio,
    gptRealtime,
    tts,
    TYRE_COMPOUNDS,
    RADIO_MESSAGES,
    el,
    escapeHtml,
    ttsSpeak,
    getBatteryDelta,
    isRaceSession,
    getPlayerLap,
    isPlayerRaceFinished,
    getRemainingRaceDistanceLaps,
    getTrackAheadGapMeters,
    getTrackProximityMeters,
    isTrackLikeSurface,
    isTelemetryOffTrack,
    isActiveRunningCar,
    hasPlayerTrackContext,
    shouldSpeakBattleBattery,
    getAdjacentRunningCars,
    handleFinishedRaceRadioState,
    fmt,
  } = deps;

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
      ctx.ersBatteryPct = +((sts.ersStoreEnergy / 4000000) * 100).toFixed(1);
      ctx.drsAllowed = !!sts.drsAllowed;
      ctx.pitLimiter = !!sts.pitLimiterStatus;
    }
    // Battery advantage/disadvantage for AI analysis
    const battDelta = getBatteryDelta();
    if (battDelta) {
      ctx.batteryPct = battDelta.myPct;
      if (battDelta.ahead) {
        ctx.batteryVsAhead = {
          name: battDelta.ahead.name,
          deltaMJ: battDelta.ahead.advantageMJ,
          deltaPct: battDelta.ahead.advantagePct,
          advantage: battDelta.ahead.advantageMJ > 0,
        };
      }
      if (battDelta.behind) {
        ctx.batteryVsBehind = {
          name: battDelta.behind.name,
          deltaMJ: battDelta.behind.advantageMJ,
          deltaPct: battDelta.behind.advantagePct,
          advantage: battDelta.behind.advantageMJ > 0,
        };
      }
    }
    if (dmg) {
      ctx.tyreWearPct = { RL: Math.round(dmg.tyresWear[0]), RR: Math.round(dmg.tyresWear[1]), FL: Math.round(dmg.tyresWear[2]), FR: Math.round(dmg.tyresWear[3]) };
      ctx.frontWingDmg = { L: dmg.frontLeftWingDamage, R: dmg.frontRightWingDamage };
      ctx.rearWingDmg = dmg.rearWingDamage;
      ctx.floorDmg = dmg.floorDamage;
      ctx.engineWearPct = { ICE: dmg.engineICEWear, MGUH: dmg.engineMGUHWear, MGUK: dmg.engineMGUKWear, ES: dmg.engineESWear, TC: dmg.engineTCWear };
    }
    // Rivals  car directly ahead and directly behind
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
  //  Auto-radio helpers 
  function canTrigger(category) {
    const now = Date.now();
    const cooldown = radio.cooldowns[category] || 30000;
    const last = radio.lastTrigger[category] || 0;
    return (now - last) >= cooldown;
  }
  function markTriggered(category) {
    radio.lastTrigger[category] = Date.now();
  }
  function isFiveLapTyreCheckpoint(lapNum) {
    return Number.isFinite(lapNum) && lapNum > 0 && lapNum % 5 === 0;
  }
  function formatBattleBatteryInfo(rivalName, relativePos, deltaPct) {
    const trend = deltaPct > 0 ? 'advantage' : deltaPct < 0 ? 'disadvantage' : 'neutral';
    const relation = relativePos === 'ahead' ? 'car ahead' : 'car behind';
    const label = rivalName ? `${rivalName} (${relation})` : relation;
    return trend === 'neutral'
      ? `Battery level equal to ${label}.`
      : `Battery ${trend} to ${label}: ${Math.abs(deltaPct).toFixed(0)}%.`;
  }
  function shouldEmitBattleBattery(side, rivalIdx, deltaPct) {
    if (Math.abs(deltaPct) < 8) return false;
    const deltaKey = side === 'ahead' ? 'lastBattleBatteryDeltaAhead' : 'lastBattleBatteryDeltaBehind';
    const rivalKey = side === 'ahead' ? 'lastBattleBatteryRivalAhead' : 'lastBattleBatteryRivalBehind';
    const lastDelta = radio.prev[deltaKey];
    const lastRival = radio.prev[rivalKey];
    if (lastRival !== rivalIdx || lastDelta == null) return true;
    return Math.abs(Math.abs(deltaPct) - Math.abs(lastDelta)) >= 5;
  }
  function markBattleBattery(side, rivalIdx, deltaPct) {
    if (side === 'ahead') {
      radio.prev.lastBattleBatteryRivalAhead = rivalIdx;
      radio.prev.lastBattleBatteryDeltaAhead = deltaPct;
    } else {
      radio.prev.lastBattleBatteryRivalBehind = rivalIdx;
      radio.prev.lastBattleBatteryDeltaBehind = deltaPct;
    }
  }
  function toInfoOnlyRadioText(text) {
    const raw = (text || '').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    const adviceRe = /\b(consider|focus|stay|keep|watch|manage|push|attack|defend|harvest|deploy|protect|cover|prepare|use|save|brake|lift|commit|hold|give|let|return|try|box(?:\s+now|\s+this lap|\s+immediately)?|should|must|need to|do not|don't)\b/i;
    const leadingAdviceRe = /^(consider|focus|stay|keep|watch|manage|push|attack|defend|harvest|deploy|protect|cover|prepare|use|save|brake|lift|commit|hold|give|let|return|try|box|do not|don't|be)\b/i;
    const parts = raw.match(/[^.!?]+[.!?]?/g) || [raw];
    const cleaned = [];
    for (const part of parts) {
      let sentence = part.trim();
      if (!sentence) continue;
      if (/\bdrs\b/i.test(sentence)) continue;
      if (leadingAdviceRe.test(sentence)) continue;
      // Keep factual lead when sentence transitions into advice after dash.
      const dashSplit = sentence.split(/\s[-]\s/);
      if (dashSplit.length > 1 && dashSplit[0].trim()) {
        sentence = dashSplit[0].trim();
      }
      const m = sentence.match(adviceRe);
      if (m && m.index != null) {
        const factualPrefix = sentence.slice(0, m.index).replace(/[,:;-\s]+$/, '').trim();
        if (!factualPrefix) continue;
        sentence = factualPrefix;
      }
      sentence = sentence.replace(/\b(if possible|when possible|if you can)\b/ig, '').replace(/\s{2,}/g, ' ').trim();
      sentence = sentence.replace(/[.!?]+$/, '').trim();
      if (sentence) cleaned.push(sentence);
    }
    const joined = cleaned.join('. ').trim();
    if (joined) return joined.endsWith('.') ? joined : joined + '.';
    if (/\bdrs\b/i.test(raw)) return '';
    const fallback = (raw.split(/[.!?]/)[0] || raw).trim();
    return fallback ? (fallback.endsWith('.') ? fallback : fallback + '.') : '';
  }
  function appendRadioCard(category, urgency, text, isError) {
    const feedEl = el('radio-feed');
    if (!feedEl) return;
    const renderedText = isError ? text : toInfoOnlyRadioText(text);
    if (!isError && !renderedText) return;
    const now = Date.now();
    const normalizedText = (renderedText || '').trim().toLowerCase();
    if (!isError && normalizedText && radio.prev.lastRadioText === normalizedText && (now - radio.prev.lastRadioTextAt) < 90000) {
      return;
    }
    if (!isError && normalizedText) {
      radio.prev.lastRadioText = normalizedText;
      radio.prev.lastRadioTextAt = now;
    }
    // Remove "no messages" placeholder
    const empty = feedEl.querySelector('.radio-feed-empty');
    if (empty) empty.remove();
    const time = new Date(now).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const card = document.createElement('div');
    card.className = `radio-card ${isError ? 'radio-error' : ''} urgency-${urgency}`;
    card.innerHTML = `
      <div class="radio-card-header">
        <span class="radio-tag tag-${category}">${category.toUpperCase().replace('_', ' ')}</span>
        <span class="radio-urgency urgency-${urgency}">${urgency.toUpperCase()}</span>
        <span class="radio-time">${time}</span>
      </div>
      <div class="radio-text">${renderedText}</div>
    `;
    // In GPT mode: skip edge-tts for categories that use AI voice (GPT Realtime handles audio)
    const catKey = getCategoryForRadio(category);
    const isAiCategory = gptRealtime.aiMode === 'gpt' && catKey && radio.config[catKey]?.aiEnabled;
    if (!isError && !isAiCategory) ttsSpeak(renderedText);
    feedEl.prepend(card);
    // Keep max 30 messages
    while (feedEl.children.length > 30) feedEl.removeChild(feedEl.lastChild);
  }
  function isRadioSituationEnabled(category, situationKey = null) {
    const catKey = getCategoryForRadio(category);
    if (!catKey) return true;
    const cfg = radio.config[catKey];
    if (cfg && !cfg.enabled) return false;
    if (!situationKey) return false;
    if (!cfg?.situations || !Object.prototype.hasOwnProperty.call(cfg.situations, situationKey)) return false;
    return cfg.situations[situationKey] !== false;
  }
  // Emit a local (no API) radio message  checks category config
  function emitLocalRadio(category, urgency, text, situationKey = null, options = {}) {
    if (isPlayerRaceFinished()) return;
    if (!isRadioSituationEnabled(category, situationKey)) return;
    const cooldownKey = options.cooldownKey || category;
    if (!options.skipCooldown && !canTrigger(cooldownKey)) return;
    if (!options.skipCooldown) markTriggered(cooldownKey);
    appendRadioCard(category, urgency, text, false);
  }
  // Map radio categories to config keys
  function getCategoryForRadio(cat) {
    const map = {
      start:    'start',
      overtake: 'overtake',
      defend:   'defend',
      tyres:    'tyres',
      ers:      'ers',
      pit:      'pit',
      weather:  'weather',
      incident: 'incident',
      flags:    'flags',
      restart:  'restart',
      penalty:  'penalty',
      racecraft:'racecraft',
      normal:   'normal',
      endrace:  'endrace',
      // internal scenario names  config keys
      attack:  'overtake',
      defense: 'defend',
      mixed:   'overtake',
      // legacy aliases
      tyre_wear: 'tyres',
      tyre_crit: 'tyres',
      damage:    'incident',
      flag:      'flags',
      fuel:      'normal',
      position:  'normal',
      battle:    'racecraft',
    };
    return map[cat] || null;
  }
  //  Helper: get rival info for battle context 
  function getRivalBattleInfo(rivalIdx) {
    if (rivalIdx < 0) return null;
    const rSts = state.allCarStatus?.[rivalIdx];
    const rDmg = state.damage; // we only have our own damage from main  but allCarStatus has ERS
    const rPart = state.participants?.participants?.[rivalIdx];
    const rLap = state.lapData?.[rivalIdx];
    if (!rSts || !rLap) return null;
    const ersPct = (rSts.ersStoreEnergy / 4000000) * 100;
    const cmp = TYRE_COMPOUNDS[rSts.visualTyreCompound];
    return {
      name: rPart?.name || `Car ${rivalIdx + 1}`,
      position: rLap.carPosition,
      ersPct,
      ersMJ: +(rSts.ersStoreEnergy / 1e6).toFixed(2),
      tyreCompound: cmp?.name || 'Unknown',
      tyreAge: rSts.tyresAgeLaps,
      drsAllowed: !!rSts.drsAllowed,
      ersMode: rSts.ersDeployMode,
      pitStops: rLap.numPitStops,
      lastLapMs: rLap.lastLapTimeMs,
    };
  }
  //  Situation detection: ALL categories (no API calls) 
  function detectRaceStart() {
    if (!radio.config.start?.enabled) return;
    const lap = state.lapData?.[state.playerCarIndex];
    const ses = state.session;
    if (!lap || !ses) return;
    const isRace = ses.sessionType >= 10 && ses.sessionType <= 12;
    if (!isRace) return;
    // Lap 1 start trigger
    if (lap.currentLapNum === 1 && radio.prev.lap === 0) {
      const pos = lap.carPosition;
      const grid = lap.gridPosition || pos;
      radio.prev.gridPosition = grid;
      if (pos < grid) {
        const gained = grid - pos;
        emitLocalRadio('start', 'high',
          RADIO_MESSAGES.start_gained_places({ position: pos, grid, placesGained: gained }).text,
          'start_gained_places');
      } else if (pos > grid) {
        const lost = pos - grid;
        emitLocalRadio('start', 'high',
          RADIO_MESSAGES.start_lost_places({ position: pos, grid: grid, placesLost: lost }).text,
          'start_lost_places');
      } else {
        emitLocalRadio('start', 'high',
          `Lights out! P${grid}. Held position. Stay clean, manage the tyres.`,
          'start_grid_held');
      }
      // Cold tyres warning on lap 1
      const tel = state.telemetry;
      if (tel) {
        const avgTemp = Math.round((tel.tyreSurfaceTemp[0] + tel.tyreSurfaceTemp[1] + tel.tyreSurfaceTemp[2] + tel.tyreSurfaceTemp[3]) / 4);
        if (avgTemp < 70) {
          setTimeout(() => {
            emitLocalRadio('start', 'medium',
              RADIO_MESSAGES.start_cold_tyres({ avgTemp }).text,
              'start_cold_tyres');
          }, 8000);
        }
      }
    }
    // Detect position changes during lap 1 (T1 chaos)
    if (lap.currentLapNum === 1 && radio.prev.lap === 1 && lap.sector >= 1) {
      const grid = radio.prev.gridPosition || lap.carPosition;
      const pos = lap.carPosition;
      if (pos < grid - 2 && canTrigger('start')) {
        emitLocalRadio('start', 'high',
          `Brilliant start! Through to P${pos} from P${grid}. ${grid - pos} places gained into Turn 1!`,
          'start_t1_jump',
          { skipCooldown: true });
      }
    }
    radio.prev.lap = lap.currentLapNum;
  }
  function detectPositionChange() {
    if (!radio.config.normal?.enabled && !radio.config.overtake?.enabled) return;
    const lap = state.lapData?.[state.playerCarIndex];
    if (!lap) return;
    const pos = lap.carPosition;
    const prevPos = radio.prev.position;
    if (prevPos > 0 && pos !== prevPos) {
      const deltaPositions = Math.abs(pos - prevPos);
      if (deltaPositions > 3 && lap.currentLapNum > 1) {
        radio.prev.position = pos;
        return;
      }
      if (pos < prevPos) {
        const gained = prevPos - pos;
        emitLocalRadio('overtake', 'medium',
          gained === 1
            ? `Good move! P${pos} now. Gained ${gained} position.`
            : `Position gain. P${pos} now, up ${gained} places.`,
          'position_gained');
      } else {
        const lost = pos - prevPos;
        emitLocalRadio('normal', 'high',
          lost === 1
            ? `Lost 1 position. P${pos} now.`
            : `Position loss. P${pos} now, down ${lost} places.`,
          'position_lost');
      }
    }
    radio.prev.position = pos;
  }
  function detectTyreWear() {
    if (!radio.config.tyres?.enabled) return;
    const dmg = state.damage;
    if (!dmg) return;
    const lap = state.lapData?.[state.playerCarIndex];
    const currentLapNum = lap?.currentLapNum || 0;
    const maxWear = Math.max(...dmg.tyresWear.map(w => Math.round(w)));
    const posLabel = ['RL', 'RR', 'FL', 'FR'];
    const worstIdx = dmg.tyresWear.indexOf(Math.max(...dmg.tyresWear));
    const worstTyre = posLabel[worstIdx];
    // Tiered warnings: 30%, 50%, 70%, 85%, 95%
    const thresholds = [
      { pct: 95, urgency: 'critical', msg: `CRITICAL tyre wear! ${worstTyre} at ${maxWear}%.`, situation: 'tyre_wear_critical' },
      { pct: 85, urgency: 'high',     msg: `Tyre wear dangerous. ${worstTyre} at ${maxWear}%. Tyre cliff imminent.`, situation: 'fl_wear_high' },
      { pct: 70, urgency: 'high',     msg: `High tyre wear. ${worstTyre} at ${maxWear}%.`, situation: 'fl_wear_high' },
      { pct: 50, urgency: 'medium',   msg: `Tyre wear update: ${worstTyre} at ${maxWear}%.`, situation: 'extending_stint' },
      { pct: 30, urgency: 'low',      msg: `Tyre check: ${worstTyre} at ${maxWear}%. Still in the operating window.`, situation: 'extending_stint' },
    ];
    for (const t of thresholds) {
      if (maxWear >= t.pct && radio.prev.maxTyreWearReported < t.pct) {
        radio.prev.maxTyreWearReported = t.pct;
        emitLocalRadio('tyres', t.urgency, t.msg, t.situation);
        break;
      }
    }
    // Detect tyre cliff: lap time increased significantly
    if (lap && lap.lastLapTimeMs > 0 && radio.prev.prevLastLapTime > 0) {
      const delta = lap.lastLapTimeMs - radio.prev.prevLastLapTime;
      if (delta > 2000 && maxWear > 60) { // 2s+ slower
        emitLocalRadio('tyres', 'critical',
          RADIO_MESSAGES.tyre_cliff({ tyre: worstTyre, wear: maxWear }).text,
          'tyre_cliff');
      }
    }
    if (lap) {
      radio.prev.prevLastLapTime = radio.prev.lastLapTime;
      radio.prev.lastLapTime = lap.lastLapTimeMs;
    }
    // Reset wear tracking on tyre change
    if (maxWear < 10 && radio.prev.maxTyreWearReported > 30) {
      radio.prev.maxTyreWearReported = 0;
      const sts = state.status;
      const cmp = sts ? (TYRE_COMPOUNDS[sts.visualTyreCompound]?.name || 'new tyres') : 'new tyres';
      emitLocalRadio('pit', 'medium', `New ${cmp} fitted. Bring them up to temperature carefully.`, 'pit_exit_new_tyres');
    }
    // Tyre overheating detection
    const tel = state.telemetry;
    const shouldCheckTyreTemp = isFiveLapTyreCheckpoint(currentLapNum) && radio.prev.lastTyreTempReportLap !== currentLapNum;
    if (tel && shouldCheckTyreTemp) {
      radio.prev.lastTyreTempReportLap = currentLapNum;
      for (let i = 0; i < 4; i++) {
        if (tel.tyreSurfaceTemp[i] > 120 && canTrigger('tyres')) {
          emitLocalRadio('tyres', 'medium',
            RADIO_MESSAGES.normal_tyre_overheating({ hotTyre: posLabel[i], temp: tel.tyreSurfaceTemp[i] }).text,
            'tyres_overheating_dirty');
          break;
        }
      }
    }
  }
  function detectERSAndDRS() {
    // Intentionally disabled: DRS radio callouts removed.
  }
  function detectFuel() {
    if (!radio.config.normal?.enabled) return;
    const sts = state.status;
    if (!sts) return;
    const fuelLaps = sts.fuelRemainingLaps;
    const ses = state.session;
    const lap = state.lapData?.[state.playerCarIndex];
    if (!ses || !lap) return;
    const lapsToFlag = getRemainingRaceDistanceLaps(ses, lap);
    const fuelDeficit = lapsToFlag - fuelLaps;
    if (fuelLaps > 0 && lapsToFlag > 0.25 && fuelDeficit >= 0.35) {
      if (!radio.prev.fuelWarned) {
        radio.prev.fuelWarned = true;
        emitLocalRadio('normal', 'high',
          `Fuel critical. Estimate ${fuelLaps.toFixed(1)} laps remaining, ${lapsToFlag.toFixed(1)} to the flag. Deficit ${fuelDeficit.toFixed(1)} laps.`,
          'fuel_critical');
      }
    }
    if (fuelDeficit <= 0.1 && radio.prev.fuelWarned) {
      radio.prev.fuelWarned = false;
      emitLocalRadio('normal', 'low',
        `Fuel back on target. Estimate ${fuelLaps.toFixed(1)} laps remaining, ${lapsToFlag.toFixed(1)} to the flag.`,
        'fuel_recovered');
    }
  }
  function detectWeatherChange() {
    if (!radio.config.weather?.enabled) return;
    const ses = state.session;
    if (!ses) return;
    const w = ses.weather;
    if (radio.prev.weather !== null && w !== radio.prev.weather) {
      const names = { 0: 'Clear', 1: 'Light Cloud', 2: 'Overcast', 3: 'Light Rain', 4: 'Heavy Rain', 5: 'Storm' };
      const name = names[w] || 'Unknown';
      const wasWet = radio.prev.weather >= 3;
      const isWet = w >= 3;
      if (isWet && !wasWet) {
        emitLocalRadio('weather', 'critical',
          RADIO_MESSAGES.weather_rain_starting().text,
          'light_rain_begins');
      } else if (!isWet && wasWet) {
        emitLocalRadio('weather', 'high',
          RADIO_MESSAGES.weather_drying().text,
          'drying_track');
      } else if (w > radio.prev.weather) {
        emitLocalRadio('weather', 'high', `Weather worsening: ${name}.`, 'rain_heavier');
      } else {
        emitLocalRadio('weather', 'medium', `Weather update: ${name}. Conditions changing.`, 'weather_change');
      }
    }
    radio.prev.weather = w;
  }
  function detectDamage() {
    if (!radio.config.incident?.enabled) return;
    const dmg = state.damage;
    if (!dmg) return;
    const snapshot = {
      flw: dmg.frontLeftWingDamage, frw: dmg.frontRightWingDamage,
      rw: dmg.rearWingDamage, fl: dmg.floorDamage,
      diff: dmg.diffuserDamage, sp: dmg.sidepodDamage,
      gb: dmg.gearBoxDamage, drs: dmg.drsFault, ers: dmg.ersFault,
    };
    const prev = radio.prev.damageSnapshot;
    if (!prev) { radio.prev.damageSnapshot = snapshot; return; }
    const parts = [
      { key: 'flw', label: 'Front left wing', side: 'left' },
      { key: 'frw', label: 'Front right wing', side: 'right' },
      { key: 'rw',  label: 'Rear wing' },
      { key: 'fl',  label: 'Floor' },
      { key: 'diff', label: 'Diffuser' },
      { key: 'sp',  label: 'Sidepod' },
      { key: 'gb',  label: 'Gearbox' },
    ];
    const newDamage = [];
    for (const p of parts) {
      if (snapshot[p.key] - (prev[p.key] || 0) >= 8) {
        newDamage.push({ ...p, pct: snapshot[p.key] });
      }
    }
    if (snapshot.drs && !prev.drs) newDamage.push({ label: 'DRS fault', key: 'drs', pct: 100 });
    if (snapshot.ers && !prev.ers) newDamage.push({ label: 'ERS fault', key: 'ers', pct: 100 });
    if (newDamage.length > 0) {
      const hasFault = newDamage.some(d => d.key === 'drs' || d.key === 'ers');
      const urgency = hasFault || newDamage.length > 2 ? 'critical' : 'high';
      // Specific messages for wing damage (affects balance)
      const wingDmg = newDamage.find(d => d.key === 'flw' || d.key === 'frw');
      if (wingDmg && newDamage.length === 1) {
        emitLocalRadio('incident', urgency,
          RADIO_MESSAGES.incident_wing_damage({ side: wingDmg.side || 'front', pct: wingDmg.pct }).text,
          'front_wing_damage');
      } else if (newDamage.find(d => d.key === 'fl') && newDamage.length === 1) {
        emitLocalRadio('incident', urgency,
          RADIO_MESSAGES.incident_floor_damage({ pct: newDamage[0].pct }).text,
          'sidepod_floor_damage');
      } else {
        const list = newDamage.map(d => `${d.label} ${d.pct}%`).join(', ');
        const situationKey = hasFault ? 'ers_fault' : 'damage_continue';
        emitLocalRadio('incident', urgency, `Damage detected! ${list}.`, situationKey);
      }
    }
    radio.prev.damageSnapshot = snapshot;
  }
  function detectFlagChanges() {
    if (!radio.config.flags?.enabled && !radio.config.restart?.enabled && !radio.config.pit?.enabled) return;
    const ses = state.session;
    if (!ses) return;
    const redFlagPeriods = ses.numRedFlagPeriods || 0;
    if (redFlagPeriods > (radio.prev.redFlagPeriods || 0)) {
      emitLocalRadio('flags', 'critical', RADIO_MESSAGES.flag_red().text, 'red_flag');
    }
    radio.prev.redFlagPeriods = redFlagPeriods;
    const sc = ses.safetyCarStatus;
    const prevSC = radio.prev.safetyCarStatus;
    if (prevSC !== null && sc !== prevSC) {
      if (sc !== 0) radio.prev.restartAwaitingLeaderThrottle = false;
      if (sc === 1) emitLocalRadio('flags', 'critical', RADIO_MESSAGES.flag_sc().text, 'sc_deployed');
      else if (sc === 2) emitLocalRadio('flags', 'critical', RADIO_MESSAGES.flag_vsc().text, 'vsc_deployed');
      else if (sc === 3 && prevSC >= 1) emitLocalRadio('restart', 'high', RADIO_MESSAGES.restart_sc().text, 'sc_restart');
      else if (sc === 0 && prevSC === 2) emitLocalRadio('restart', 'high', RADIO_MESSAGES.restart_vsc_ending().text, 'vsc_ending');
      else if (sc === 0 && prevSC === 1) radio.prev.restartAwaitingLeaderThrottle = true;
      // Free pit stop opportunity under SC/VSC
      if ((sc === 1 || sc === 2) && radio.config.pit?.enabled) {
        const lap = state.lapData?.[state.playerCarIndex];
        const dmg = state.damage;
        if (lap && dmg) {
          const maxWear = Math.max(...dmg.tyresWear);
          if (maxWear > 30) {
            setTimeout(() => {
              emitLocalRadio('pit', 'critical', RADIO_MESSAGES.pit_free_stop_sc().text, 'free_stop_sc');
            }, 5000);
          }
        }
      }
    }
    radio.prev.safetyCarStatus = sc;
    // FIA flags per car
    const sts = state.status;
    if (sts) {
      const flag = sts.vehicleFiaFlags === -1 ? 0 : sts.vehicleFiaFlags;
      if (flag !== radio.prev.fiaFlag) {
        if (flag === 3) emitLocalRadio('flags', 'high', RADIO_MESSAGES.flag_yellow().text, 'yellow_flag');
        else if (flag === 1) emitLocalRadio('flags', 'high', RADIO_MESSAGES.flag_green().text, 'flag_green');
        else if (flag === 2) emitLocalRadio('flags', 'high', 'Blue flag! Faster car approaching.', 'blue_flag');
        radio.prev.fiaFlag = flag;
      }
    }
  }
  function detectRestartRelease() {
    if (!radio.prev.restartAwaitingLeaderThrottle) return;
    const ses = state.session;
    const lap = getPlayerLap();
    if (!isRaceSession(ses) || !lap || ses.safetyCarStatus !== 0) return;
    const leaderLap = state.lapData?.find(entry => entry?.carPosition === 1) || lap;
    const leaderIdx = leaderLap ? state.lapData.indexOf(leaderLap) : state.playerCarIndex;
    const leaderTelemetry = state.allCarTelemetry?.[leaderIdx] || state.telemetry;
    if (!leaderTelemetry) return;
    const leaderThrottle = leaderTelemetry.throttle || 0;
    const leaderSpeed = leaderTelemetry.speed || 0;
    if (leaderThrottle < 0.65 || leaderSpeed < 80) return;
    radio.prev.restartAwaitingLeaderThrottle = false;
    emitLocalRadio('restart', 'high', RADIO_MESSAGES.restart_go().text, 'restart_green_go', { cooldownKey: 'restart_green_go' });
  }
  function detectNearbyTrafficHazards() {
    if ((!radio.config.normal?.enabled && !radio.config.flags?.enabled) || !state.lapData || !state.allCarTelemetry || !state.participants) return;
    const ses = state.session;
    const lap = getPlayerLap();
    const myTelemetry = state.telemetry || state.allCarTelemetry?.[state.playerCarIndex];
    if (!ses || !lap || !myTelemetry || !hasPlayerTrackContext(ses, lap, myTelemetry)) return;
    if (ses.safetyCarStatus && ses.safetyCarStatus !== 0) return;
    const mySpeed = myTelemetry.speed || 0;
    const playerOnStraight = mySpeed >= 180
      && (myTelemetry.throttle || 0) >= 0.92
      && (myTelemetry.brake || 0) <= 0.05
      && Math.abs(myTelemetry.steer || 0) <= 0.12
      && lap.pitStatus === 0;
    let slowCarCall = null;
    let rejoinCall = null;
    for (let idx = 0; idx < state.lapData.length; idx++) {
      if (idx === state.playerCarIndex) continue;
      const rivalLap = state.lapData[idx];
      const rivalTelemetry = state.allCarTelemetry[idx];
      if (!isActiveRunningCar(rivalLap) || !rivalTelemetry || rivalLap.pitStatus >= 1) continue;
      const aheadMeters = getTrackAheadGapMeters(lap, rivalLap, ses);
      const rivalName = state.participants.participants?.[idx]?.name || `Car ${idx + 1}`;
      const rivalSpeed = rivalTelemetry.speed || 0;
      const rivalThrottle = rivalTelemetry.throttle || 0;
      const rivalBrake = rivalTelemetry.brake || 0;
      const rivalSteer = Math.abs(rivalTelemetry.steer || 0);
      const sameLapWindow = Math.abs((rivalLap.currentLapNum || 0) - (lap.currentLapNum || 0)) <= 1;
      const relativeSpeed = mySpeed - rivalSpeed;
      const closingSpeedMps = relativeSpeed > 0 ? relativeSpeed / 3.6 : 0;
      const timeToCatchSec = (aheadMeters != null && closingSpeedMps > 0.1)
        ? (aheadMeters / closingSpeedMps)
        : Number.POSITIVE_INFINITY;
      const rivalHasMajorIssue = rivalSpeed < 90 || rivalThrottle < 0.45 || rivalBrake > 0.18;
      const rivalStableLine = rivalSteer <= 0.2;
      const bigHazardAhead = rivalStableLine && (
        (relativeSpeed >= 60 && aheadMeters != null && aheadMeters <= 350)
        || (relativeSpeed >= 45 && timeToCatchSec <= 5 && rivalHasMajorIssue)
      );
      if (
        slowCarCall == null &&
        playerOnStraight &&
        aheadMeters != null &&
        sameLapWindow &&
        aheadMeters >= 40 &&
        aheadMeters <= 260 &&
        bigHazardAhead
      ) {
        slowCarCall = { distanceMeters: Math.round(aheadMeters / 10) * 10, rivalName };
      }
      const wasOffTrack = !!radio.prev.rivalOffTrack[idx];
      const isOffTrackNow = isTelemetryOffTrack(rivalTelemetry);
      radio.prev.rivalOffTrack[idx] = isOffTrackNow;
      if (
        rejoinCall == null &&
        wasOffTrack &&
        !isOffTrackNow &&
        aheadMeters != null &&
        aheadMeters > 0 &&
        aheadMeters <= 500 &&
        sameLapWindow &&
        rivalSpeed <= Math.max(mySpeed, 140)
      ) {
        rejoinCall = { distanceMeters: Math.round(aheadMeters / 10) * 10, rivalName };
      }
    }
    if (slowCarCall) {
      emitLocalRadio(
        'normal',
        'high',
        RADIO_MESSAGES.normal_slower_car_ahead(slowCarCall).text,
        'slower_car_ahead',
        { cooldownKey: 'slower_car_ahead' },
      );
    }
    if (rejoinCall) {
      emitLocalRadio(
        'flags',
        'high',
        RADIO_MESSAGES.flag_rejoining_track(rejoinCall).text,
        'car_rejoining_track',
        { cooldownKey: 'car_rejoining_track' },
      );
    }
  }
  function detectPitStatus() {
    if (!radio.config.pit?.enabled) return;
    const lap = state.lapData?.[state.playerCarIndex];
    if (!lap) return;
    const sts = state.status;
    const ps = lap.pitStatus;
    const prevPS = radio.prev.pitStatus;
    const inPitLane = lap.pitLaneTimerActive === 1 || ps === 2 || sts?.pitLimiterStatus === 1;
    const prevInPitLane = radio.prev.pitLaneActive === 1;
    if (prevPS !== undefined && ps !== prevPS) {
      if (ps === 1 && prevPS === 0 && !inPitLane) {
        emitLocalRadio('pit', 'medium', 'Pit stop confirmed this lap.', 'planned_stop');
      } else if (ps === 0 && prevPS >= 1) {
        const cmp = sts ? (TYRE_COMPOUNDS[sts.visualTyreCompound]?.name || '') : '';
        emitLocalRadio('pit', 'medium', `Good stop. Out on ${cmp || 'new tyres'}.`, 'pit_exit_new_tyres');
      }
    }
    if (!prevInPitLane && inPitLane) {
      emitLocalRadio('pit', 'medium', 'Pit lane. Speed limit active.', 'pit_limiter');
    }
    radio.prev.pitStatus = ps;
    radio.prev.pitLaneActive = inPitLane ? 1 : 0;
  }
  function detectPenalty() {
    if (!radio.config.penalty?.enabled) return;
    const lap = state.lapData?.[state.playerCarIndex];
    if (!lap) return;
    if (lap.penalties > 0 && lap.penalties !== radio.prev.penalties) {
      emitLocalRadio('penalty', 'high',
        RADIO_MESSAGES.penalty_time({ seconds: lap.penalties }).text,
        'time_penalty');
    }
    radio.prev.penalties = lap.penalties;
  }
  function detectPitWindow() {
    if (!radio.config.pit?.enabled) return;
    const ses = state.session;
    const lap = state.lapData?.[state.playerCarIndex];
    const sts = state.status;
    const dmg = state.damage;
    if (!ses || !lap || !sts || !dmg) return;
    const isRace = ses.sessionType >= 10 && ses.sessionType <= 12;
    if (!isRace) return;
    if (lap.pitStatus >= 1) return; // already in pits
    const lapsLeft = ses.totalLaps - lap.currentLapNum;
    const maxWear = Math.max(...dmg.tyresWear.map(w => Math.round(w)));
    const posLabel = ['RL', 'RR', 'FL', 'FR'];
    const worstIdx = dmg.tyresWear.indexOf(Math.max(...dmg.tyresWear));
    const worstTyre = posLabel[worstIdx];
    const wingDmg = Math.max(dmg.frontLeftWingDamage, dmg.frontRightWingDamage);
    const hasEngineFail = dmg.engineBlown || dmg.engineSeized;
    const severeFinishRisk = maxWear >= 90 || wingDmg > 70 || dmg.floorDamage > 70 || hasEngineFail;
    const isShortRace = ses.totalLaps > 0 && ses.totalLaps <= 8;
    if (lapsLeft <= 0) return;
    if (lapsLeft <= 1) {
      if (severeFinishRisk && canTrigger('pit')) {
        emitLocalRadio('pit', 'medium', 'Late race. Stay out unless the car is unsafe to reach the flag.', 'late_race_hold_track');
      }
      return;
    }
    if (isShortRace && lapsLeft <= 2) {
      if (severeFinishRisk && canTrigger('pit')) {
        emitLocalRadio('pit', 'medium', 'Short race closing phase. Stay out unless the car will not make the finish.', 'short_race_hold_track');
      }
      return;
    }
    //  Pace loss detection (compare last lap to rolling average) 
    let paceLoss = 0;
    if (lap.lastLapTimeMs > 0 && radio.prev.lapTimeAvg > 0) {
      paceLoss = (lap.lastLapTimeMs - radio.prev.lapTimeAvg) / 1000;
    }
    // Update rolling average (exponential moving average)
    if (lap.lastLapTimeMs > 0 && lap.lastLapTimeMs < 300000) {
      if (!radio.prev.lapTimeAvg || radio.prev.lapTimeAvg <= 0) {
        radio.prev.lapTimeAvg = lap.lastLapTimeMs;
      } else if (lap.currentLapNum > radio.prev.lapTimeAvgLap) {
        // Only update if pace loss < 3s (exclude pit laps, incidents)
        const delta = lap.lastLapTimeMs - radio.prev.lapTimeAvg;
        if (Math.abs(delta) < 3000) {
          radio.prev.lapTimeAvg = radio.prev.lapTimeAvg * 0.85 + lap.lastLapTimeMs * 0.15;
        }
      }
      radio.prev.lapTimeAvgLap = lap.currentLapNum;
    }
    //  Safety car status 
    const sc = ses.safetyCarStatus; // 0=none, 1=full SC, 2=VSC, 3=forming
    //  Severe damage  pit immediately 
    if ((wingDmg > 50 || dmg.floorDamage > 50 || hasEngineFail) && lapsLeft > 2 && canTrigger('pit')) {
      emitLocalRadio('pit', 'critical',
        hasEngineFail ? 'Engine failure! Box immediately!'
        : `Severe damage  ${wingDmg > 50 ? 'front wing' : 'floor'} at ${Math.max(wingDmg, dmg.floorDamage)}%. Box immediately.`,
        'emergency_stop');
      return;
    }
    //  Puncture risk zone (75%+)  box now 
    if (maxWear >= 75 && lapsLeft > 1 && canTrigger('pit')) {
      emitLocalRadio('pit', 'critical',
        `BOX NOW! ${worstTyre} at ${maxWear}%. Puncture risk territory.`,
        'emergency_stop');
      return;
    }
    //  Safety Car / VSC pit opportunity 
    if ((sc === 1 || sc === 2) && canTrigger('pit')) {
      if (maxWear >= 35 && lapsLeft > 3) {
        emitLocalRadio('pit', 'critical',
          sc === 1
            ? `Safety car! Tyre wear at ${maxWear}%. Free stop opportunity  box box box!`
            : `VSC! Tyre wear at ${maxWear}%. Reduced time loss.`,
          'free_stop_sc');
        return;
      }
      // Even low wear  if we were planning to stop in next 5 laps
      if (ses.pitStopWindowIdealLap > 0 && lap.currentLapNum >= ses.pitStopWindowIdealLap - 3) {
        emitLocalRadio('pit', 'high',
          `${sc === 1 ? 'Safety car' : 'VSC'}! Near our pit window.`,
          'planned_stop');
        return;
      }
    }
    //  Danger zone (65-74%)  almost always pit 
    if (maxWear >= 65 && lapsLeft > 2 && canTrigger('pit')) {
      emitLocalRadio('pit', 'high',
        `${worstTyre} at ${maxWear}%. You're in the danger zone.`,
        'planned_stop');
      return;
    }
    //  Performance cliff zone (50-64%)  pit if pace drops 
    if (maxWear >= 50 && lapsLeft > 3 && canTrigger('pit')) {
      if (paceLoss >= 0.8) {
        emitLocalRadio('pit', 'high',
          `Losing ${paceLoss.toFixed(1)}s per lap. Tyres at ${maxWear}%. Performance cliff.`,
          'planned_stop');
      } else if (paceLoss >= 0.5) {
        emitLocalRadio('pit', 'medium',
          `Pace dropping  ${paceLoss.toFixed(1)}s off baseline. ${worstTyre} at ${maxWear}%. Pit window open.`,
          'planned_stop');
      } else {
        emitLocalRadio('pit', 'low',
          `${worstTyre} at ${maxWear}%. Real pit window.`,
          'planned_stop');
      }
      return;
    }
    //  Early degradation (35-49%)  stay out unless pace drops or undercut 
    if (maxWear >= 35 && paceLoss >= 0.6 && lapsLeft > 5 && canTrigger('pit')) {
      emitLocalRadio('pit', 'medium',
        `Pace loss ${paceLoss.toFixed(1)}s at ${maxWear}% wear.`,
        'early_stop');
      return;
    }
    //  Moderate wing damage  pit if pace suffers 
    if (wingDmg > 25 && wingDmg <= 50 && paceLoss >= 0.8 && lapsLeft > 3 && canTrigger('pit')) {
      emitLocalRadio('pit', 'medium',
        `Wing damage at ${wingDmg}%, costing ${paceLoss.toFixed(1)}s/lap.`,
        'emergency_stop');
      return;
    }
    //  Weather crossover pit 
    if (ses.weatherForecast?.length && canTrigger('pit')) {
      const currentWet = ses.weather >= 3;
      const firstOpposite = ses.weatherForecast.find(f =>
        currentWet ? f.weather < 3 : f.weather >= 3
      );
      if (firstOpposite && firstOpposite.timeOffset <= 5) {
        emitLocalRadio('pit', 'high',
          currentWet
            ? `Track drying in ~${firstOpposite.timeOffset}min. Pit crossover approaching.`
            : `Rain in ~${firstOpposite.timeOffset}min. Pit crossover approaching.`,
          'weather_crossover_pit');
        return;
      }
    }
    //  Pack pitting detection (5+ cars ahead pit) 
    if (state.lapData && canTrigger('pit')) {
      const myPos = lap.carPosition;
      // Count cars ahead that are currently in pits
      const carsAheadPitting = state.lapData.filter(l =>
        l && l.carPosition < myPos && l.carPosition > 0 && l.pitStatus >= 1
      ).length;
      if (carsAheadPitting >= 5) {
        if (maxWear >= 35 || paceLoss >= 0.5) {
          emitLocalRadio('pit', 'high',
            `${carsAheadPitting} cars ahead pitting! Tyres at ${maxWear}%.`,
            'undercut_attempt');
        } else {
          emitLocalRadio('pit', 'medium',
            `${carsAheadPitting} cars ahead pitting. Tyres still OK at ${maxWear}%.`,
            'overcut_attempt');
        }
        return;
      }
    }
    //  Late SC/VSC  pit for softs with 3-5 laps left 
    if ((sc === 1 || sc === 2) && lapsLeft >= 3 && lapsLeft <= 6 && canTrigger('pit')) {
      if (maxWear >= 25) {
        emitLocalRadio('pit', 'critical',
          `Late ${sc === 1 ? 'Safety Car' : 'VSC'} with ${lapsLeft} laps left! Reduced pit loss window.`,
          'late_stop');
        return;
      }
    }
    //  End-race decisions (5 laps or fewer, green flag) 
    if (lapsLeft <= 5 && lapsLeft >= 1 && sc === 0 && canTrigger('pit')) {
      if (lapsLeft <= 2) {
        // 1-2 laps: almost never pit
        if (maxWear >= 90 || wingDmg > 60) {
          emitLocalRadio('pit', 'high',
            `${lapsLeft} lap${lapsLeft > 1 ? 's' : ''} left. ${maxWear >= 90 ? 'Tyres critical' : 'Severe damage'}. Pit only if you can\'t finish safely.`,
            'late_race_hold_track');
        }
        // Otherwise stay out, no message needed
        return;
      }
      if (lapsLeft <= 5 && lapsLeft >= 3) {
        // 3-5 laps: pit only if pace is terrible or damage
        if (paceLoss >= 1.5 && maxWear >= 50) {
          emitLocalRadio('pit', 'medium',
            `${lapsLeft} laps to go, losing ${paceLoss.toFixed(1)}s/lap. Tyres at ${maxWear}%.`,
            'late_stop');
        } else if (wingDmg > 35 && paceLoss >= 0.8) {
          emitLocalRadio('pit', 'medium',
            `Wing damage at ${wingDmg}% with ${lapsLeft} to go. Costing ${paceLoss.toFixed(1)}s/lap.`,
            'late_stop');
        }
        return;
      }
    }
    //  Free stop check (gap analysis for position-neutral pit) 
    if (maxWear >= 40 && lapsLeft > 5 && canTrigger('pit')) {
      const myPos = lap.carPosition;
      // Find gap to car behind  if large enough, we can pit without losing position
      const carBehindLap = state.lapData?.find(l => l?.carPosition === myPos + 1);
      if (carBehindLap) {
        const gapBehindMs = carBehindLap.deltaToCarAheadMs;
        // Typical pit stop costs ~22-25s. If gap behind > 25s, it's a free stop
        if (gapBehindMs > 25000) {
          emitLocalRadio('pit', 'high',
            `Free stop! ${(gapBehindMs / 1000).toFixed(1)}s gap behind.`,
            'rejoin_clean_air');
          return;
        }
        // If gap behind is 18-25s, marginal  might lose 1 position
        if (gapBehindMs > 18000 && maxWear >= 50) {
          emitLocalRadio('pit', 'medium',
            `Near-free stop. ${(gapBehindMs / 1000).toFixed(1)}s to car behind.`,
            'rejoin_traffic');
          return;
        }
      }
    }
    //  Undercut/overcut detection (rival pitted) 
    if (state.lapData && state.participants && canTrigger('pit')) {
      const myPos = lap.carPosition;
      const carAheadLap = state.lapData.find(l => l?.carPosition === myPos - 1);
      if (carAheadLap?.pitStatus >= 1) {
        const aheadIdx = state.lapData.indexOf(carAheadLap);
        const aheadName = state.participants?.participants?.[aheadIdx]?.name || 'Car ahead';
        // Check if we'd rejoin in traffic (bad) or clean air (good)
        const gapBehind = state.lapData.find(l => l?.carPosition === myPos + 1)?.deltaToCarAheadMs || 0;
        if (gapBehind > 15000) {
          emitLocalRadio('pit', 'high',
            `${aheadName} has pitted! Undercut threat.`,
            'undercut_attempt');
        } else {
          emitLocalRadio('pit', 'medium',
            `${aheadName} has pitted. Rejoin would be in traffic.`,
            'overcut_attempt');
        }
      }
    }
  }
  //  Battle-aware detection (battery, damage, prolonged following) 
  function detectBattleSituations() {
    if (!radio.config.racecraft?.enabled && !radio.config.overtake?.enabled && !radio.config.defend?.enabled && !radio.config.ers?.enabled) return;
    const { lap, carAheadLap, carBehindLap, aheadIdx, behindIdx } = getAdjacentRunningCars();
    const sts = state.status;
    const tel = state.telemetry;
    if (!lap || !sts || !state.allCarStatus || !hasPlayerTrackContext(state.session, lap, tel)) return;
    const now = Date.now();
    const myErsPct = (sts.ersStoreEnergy / 4000000) * 100;
    const gapAheadMs = lap.deltaToCarAheadMs;
    const gapBehindMs = carBehindLap?.deltaToCarAheadMs;
    const currentLapNum = lap.currentLapNum || 0;
    const aheadTelemetry = aheadIdx >= 0 ? state.allCarTelemetry?.[aheadIdx] : null;
    const behindTelemetry = behindIdx >= 0 ? state.allCarTelemetry?.[behindIdx] : null;
    //  Track battle duration 
    if (gapAheadMs > 0 && gapAheadMs < 1500 && aheadIdx >= 0) {
      if (radio.prev.battleAheadIdx !== aheadIdx || radio.prev.battleAheadStart === 0) {
        radio.prev.battleAheadStart = now;
        radio.prev.battleAheadIdx = aheadIdx;
      }
    } else {
      radio.prev.battleAheadStart = 0;
      radio.prev.battleAheadIdx = -1;
      radio.prev.lastBattleBatteryRivalAhead = -1;
      radio.prev.lastBattleBatteryDeltaAhead = null;
    }
    if (gapBehindMs > 0 && gapBehindMs < 1500 && behindIdx >= 0) {
      if (radio.prev.battleBehindIdx !== behindIdx || radio.prev.battleBehindStart === 0) {
        radio.prev.battleBehindStart = now;
        radio.prev.battleBehindIdx = behindIdx;
      }
    } else {
      radio.prev.battleBehindStart = 0;
      radio.prev.battleBehindIdx = -1;
      radio.prev.lastBattleBatteryRivalBehind = -1;
      radio.prev.lastBattleBatteryDeltaBehind = null;
    }
    //  Battery delta during battle (no API) 
    const batteryInfoCooldownMs = 45000;
    if (
      aheadIdx >= 0 &&
      shouldSpeakBattleBattery(gapAheadMs, tel, aheadTelemetry, carAheadLap, state.session, lap) &&
      now - radio.prev.lastBattleBatteryMsg > batteryInfoCooldownMs
    ) {
      const rivalInfo = getRivalBattleInfo(aheadIdx);
      if (rivalInfo) {
        const deltaPct = myErsPct - rivalInfo.ersPct;
        if (shouldEmitBattleBattery('ahead', aheadIdx, deltaPct)) {
          radio.prev.lastBattleBatteryMsg = now;
          markBattleBattery('ahead', aheadIdx, deltaPct);
          emitLocalRadio('ers', 'low',
            formatBattleBatteryInfo(rivalInfo.name, 'ahead', deltaPct),
            'battery_delta_ahead');
        }
      }
    }
    // Battery delta for car behind
    if (
      behindIdx >= 0 &&
      shouldSpeakBattleBattery(gapBehindMs, tel, behindTelemetry, carBehindLap, state.session, lap) &&
      now - radio.prev.lastBattleBatteryMsg > batteryInfoCooldownMs
    ) {
      const rivalInfo = getRivalBattleInfo(behindIdx);
      if (rivalInfo) {
        const deltaPct = myErsPct - rivalInfo.ersPct;
        if (shouldEmitBattleBattery('behind', behindIdx, deltaPct)) {
          radio.prev.lastBattleBatteryMsg = now;
          markBattleBattery('behind', behindIdx, deltaPct);
          emitLocalRadio('ers', 'low',
            formatBattleBatteryInfo(rivalInfo.name, 'behind', deltaPct),
            'battery_delta_behind');
        }
      }
    }
    //  Damage comparison during battle 
    const allowTyreAgeInfo = isFiveLapTyreCheckpoint(currentLapNum)
      && radio.prev.lastTyreAgeReportLap !== currentLapNum
      && now - radio.prev.lastBattleDamageMsg > 45000;
    if (allowTyreAgeInfo) {
      let tyreAgeInfoSent = false;
      // Car ahead damage (exploit their weakness)
      if (aheadIdx >= 0 && gapAheadMs > 0 && gapAheadMs < 1500) {
        const aheadSts = state.allCarStatus?.[aheadIdx];
        if (aheadSts) {
          const rivalName = state.participants?.participants?.[aheadIdx]?.name || 'Car ahead';
          // We can infer damage from their pace and ERS  for actual damage we'd need allCarDamage
          // Use tyre age difference as a proxy for vulnerability
          const myTyreAge = sts.tyresAgeLaps;
          const theirTyreAge = aheadSts.tyresAgeLaps;
          const tyreDelta = theirTyreAge - myTyreAge;
          if (tyreDelta > 5) {
            tyreAgeInfoSent = true;
            radio.prev.lastBattleDamageMsg = now;
            radio.prev.lastTyreAgeReportLap = currentLapNum;
            emitLocalRadio('overtake', 'medium',
              RADIO_MESSAGES.overtake_tyre_advantage({ rivalName, tyreDeltaLaps: tyreDelta }).text,
              'tyre_advantage_pass');
          }
        }
      }
      // Car behind with fresher tyres
      if (!tyreAgeInfoSent && behindIdx >= 0 && gapBehindMs > 0 && gapBehindMs < 1500) {
        const behindSts = state.allCarStatus?.[behindIdx];
        if (behindSts) {
          const rivalName = state.participants?.participants?.[behindIdx]?.name || 'Car behind';
          const tyreDelta = sts.tyresAgeLaps - behindSts.tyresAgeLaps;
          if (tyreDelta > 5) {
            tyreAgeInfoSent = true;
            radio.prev.lastBattleDamageMsg = now;
            radio.prev.lastTyreAgeReportLap = currentLapNum;
            emitLocalRadio('defend', 'high',
              RADIO_MESSAGES.defend_rival_fresher_tyres({ rivalName, tyreDeltaLaps: tyreDelta }).text,
              'defend_worn_tyres');
          }
        }
      }
    }
    //  Prolonged following: different message after 30s+ of battle 
    if (radio.prev.battleAheadStart > 0) {
      const battleDuration = now - radio.prev.battleAheadStart;
      const rivalInfo = aheadIdx >= 0 ? getRivalBattleInfo(aheadIdx) : null;
      // After 45s of following, warn about dirty air
      if (battleDuration > 45000 && battleDuration < 50000 && now - radio.prev.lastDirtyAirMsg > 60000) {
        radio.prev.lastDirtyAirMsg = now;
        if (rivalInfo) {
          emitLocalRadio('normal', 'medium',
            `Following ${rivalInfo.name} for a while now. Front tyres heating in dirty air.`,
            'dirty_air');
        }
      }
      // After 90s, suggest backing off or trying different approach
      if (battleDuration > 90000 && battleDuration < 95000 && canTrigger('racecraft')) {
        if (rivalInfo) {
          emitLocalRadio('racecraft', 'medium',
            `Long battle with ${rivalInfo.name}. Tyre life dropping in the dirty air.`,
            'dont_sit_dirty_air');
        }
      }
    }
    //  Closing gap / being caught detection 
    if (gapAheadMs > 0 && radio.prev.gapAheadPrev > 0) {
      const gapChange = radio.prev.gapAheadPrev - gapAheadMs; // positive = closing
      if (gapChange > 200 && gapAheadMs < 3000 && gapAheadMs > 1200 && now - radio.prev.lastClosingMsg > 30000) {
        radio.prev.lastClosingMsg = now;
        const aheadName = state.participants?.participants?.[aheadIdx]?.name || 'car ahead';
        emitLocalRadio('normal', 'low',
          RADIO_MESSAGES.normal_closing({ aheadName, gapMs: gapAheadMs }).text,
          'closing_slower');
      }
    }
    radio.prev.gapAheadPrev = gapAheadMs;
    if (gapBehindMs > 0 && radio.prev.gapBehindPrev > 0) {
      const gapChange = radio.prev.gapBehindPrev - gapBehindMs; // positive = they're closing
      if (gapChange > 200 && gapBehindMs < 2500 && gapBehindMs > 1000 && now - radio.prev.lastBeingCaughtMsg > 30000) {
        radio.prev.lastBeingCaughtMsg = now;
        const behindName = state.participants?.participants?.[behindIdx]?.name || 'car behind';
        emitLocalRadio('normal', 'medium',
          RADIO_MESSAGES.normal_being_caught({ behindName, gapMs: gapBehindMs }).text,
          'being_caught');
      }
    }
    radio.prev.gapBehindPrev = gapBehindMs || 0;
  }
  //  Driving events (lockup / track limits) 
  function detectDrivingEvents() {
    if (!radio.config.tyres?.enabled && !radio.config.penalty?.enabled) return;
    const tel = state.telemetry;
    if (!tel) return;
    // Lock-up detection: brake > 80% and speed dropping fast
    if (tel.brake > 0.8 && tel.speed < 150 && tel.speed > 30) {
      const now = Date.now();
      if (now - radio.prev.lockupDetected > 30000) {
        // Approximate: if high brake + low speed + lap invalid could indicate lockup
        const lap = state.lapData?.[state.playerCarIndex];
        if (lap?.currentLapInvalid && canTrigger('tyres')) {
          radio.prev.lockupDetected = now;
          emitLocalRadio('tyres', 'medium', RADIO_MESSAGES.normal_lockup().text, 'lockup_flat_spot');
        }
      }
    }
    // Track limits (lap invalid)
    const lap = state.lapData?.[state.playerCarIndex];
    if (lap?.currentLapInvalid && canTrigger('penalty')) {
      emitLocalRadio('penalty', 'medium', RADIO_MESSAGES.normal_track_limits().text, 'track_limits_warn');
    }
  }
  //  End of race detection 
  function detectEndRace() {
    if (!radio.config.endrace?.enabled) return;
    const ses = state.session;
    const lap = state.lapData?.[state.playerCarIndex];
    const sts = state.status;
    if (!ses || !lap || !sts) return;
    const isRace = ses.sessionType >= 10 && ses.sessionType <= 12;
    if (!isRace) return;
    const lapsLeft = ses.totalLaps - lap.currentLapNum;
    // Final lap
    if (lapsLeft === 0 && !radio.prev.endRaceWarned) {
      radio.prev.endRaceWarned = true;
      emitLocalRadio('endrace', 'high',
        RADIO_MESSAGES.endrace_final_lap({ position: lap.carPosition, gapAheadMs: lap.deltaToCarAheadMs }).text,
        'final_lap_overtake');
    }
    // Last 3 laps  full send message
    if (lapsLeft === 3 && canTrigger('endrace')) {
      emitLocalRadio('endrace', 'medium', RADIO_MESSAGES.endrace_push_no_saving().text, 'push_no_saving');
    }
    // Reset for next race
    if (lapsLeft > 5) radio.prev.endRaceWarned = false;
  }
  //  Clean air notification 
  function detectCleanAir() {
    if (!radio.config.normal?.enabled) return;
    const lap = state.lapData?.[state.playerCarIndex];
    if (!lap) return;
    const now = Date.now();
    const gapAheadMs = lap.deltaToCarAheadMs;
    // Clean air: gap > 3s to car ahead, and we haven't said this recently
    if (gapAheadMs > 3000 && now - radio.prev.cleanAirMsgTime > 120000) {
      radio.prev.cleanAirMsgTime = now;
      emitLocalRadio('normal', 'low', RADIO_MESSAGES.normal_clean_air().text, 'clean_air');
    }
  }
  //  Proximity-based scenarios (use API for tactical advice) 
  function getProximityScenario() {
    const lap = state.lapData?.[state.playerCarIndex];
    if (!lap) return null;
    const myPos = lap.carPosition;
    const carAheadLap = state.lapData?.find(l => l?.carPosition === myPos - 1);
    const carBehindLap = state.lapData?.find(l => l?.carPosition === myPos + 1);
    const gapAheadMs = lap.deltaToCarAheadMs;
    const gapBehindMs = carBehindLap?.deltaToCarAheadMs;
    const isAttacking = gapAheadMs > 0 && gapAheadMs < 1200 && carAheadLap != null;
    const isDefending = gapBehindMs != null && gapBehindMs > 0 && gapBehindMs < 1000;
    if (isAttacking && isDefending) return 'mixed';
    if (isAttacking) return 'attack';
    if (isDefending) return 'defense';
    return null;
  }
  async function triggerAPIRadio(scenario) {
    if (radio.awaiting) return;
    if (isPlayerRaceFinished()) return;
    const scenarioSituation = scenario === 'attack'
      ? 'attack_scenario'
      : scenario === 'defense'
        ? 'defense_scenario'
        : 'mixed_scenario';
    if (!isRadioSituationEnabled(scenario, scenarioSituation)) return;
    radio.awaiting = true;
    markTriggered(scenario);
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
    prompt += 'Provide ENGINEER_DECISION output. Radio line must be info-only: factual status/metrics/deltas only, with no suggestions, instructions, or advice.';
    const feedEl = el('radio-feed');
    const thinkingCard = document.createElement('div');
    thinkingCard.className = 'radio-card thinking';
    thinkingCard.innerHTML = `<span class="radio-tag tag-${scenario}"> ${scenario.toUpperCase()}</span> <span class="radio-thinking">Engineer analysing</span>`;
    if (feedEl) feedEl.prepend(thinkingCard);
    const result = await window.raceEngineer.askEngineer({
      question: prompt, context: ctx, mode: 'ENGINEER_DECISION',
    });
    thinkingCard.remove();
    radio.awaiting = false;
    if (isPlayerRaceFinished()) return;
    if (result.error || !result.response) {
      // Don't spam the feed with "No API key" errors
      if (result.error?.includes('API key')) return;
      appendRadioCard(scenario, 'medium', result.error || 'No response.', true);
      return;
    }
    const text = result.response;
    const speakMatch   = text.match(/speak:\s*(yes|no)/i);
    const urgencyMatch = text.match(/urgency:\s*(\w+)/i);
    const radioMatch   = text.match(/radio:\s*(.+)/is);
    const shouldSpeak = speakMatch ? speakMatch[1].toLowerCase() === 'yes' : true;
    const urgency = urgencyMatch?.[1]?.toLowerCase() || 'medium';
    const radioText = radioMatch
      ? radioMatch[1].trim().replace(/\n.*/s, '')
      : text.split('\n').find(l => l.trim().length > 10) || text;
    if (shouldSpeak) appendRadioCard(scenario, urgency, radioText, false);
  }
  //  Qualifying radio 
  function detectQualifyingRadio() {
    if (!radio.config.normal?.enabled) return;
    const ses = state.session;
    const lap = state.lapData?.[state.playerCarIndex];
    if (!ses || !lap) return;
    const pitStatus = lap.pitStatus; // 0=none, 1=pitting, 2=in pit
    const lastLapMs  = lap.lastLapTimeMs;
    const allLaps    = state.lapData || [];
    function isQualifyingRunLap(lapEntry) {
      if (!lapEntry || lapEntry.pitStatus !== 0 || lapEntry.driverStatus === 0) return false;
      // F1 packets: 1=flying lap, 4=on track. Treat both as "on run".
      if (lapEntry.driverStatus === 1) return true;
      return lapEntry.driverStatus === 4 && lapEntry.currentLapTimeMs > 15000 && !lapEntry.currentLapInvalid;
    }
    // Detect outlap: pitStatus transitions from 1/2 to 0.
    const wasInPit = radio.prev.pitStatus >= 1;
    const nowOutOfPit = pitStatus === 0;
    const justExited = wasInPit && nowOutOfPit;
    if (justExited) {
      let closestRunBehind = null;
      for (let idx = 0; idx < allLaps.length; idx++) {
        if (idx === state.playerCarIndex) continue;
        const rivalLap = allLaps[idx];
        if (!isQualifyingRunLap(rivalLap)) continue;
        const behindMeters = getTrackAheadGapMeters(rivalLap, lap, ses);
        if (behindMeters == null || behindMeters <= 0 || behindMeters > 700) continue;
        const rivalSpeed = state.allCarTelemetry?.[idx]?.speed || 0;
        const referenceSpeedMps = Math.max(rivalSpeed, 140) / 3.6;
        const gapSec = behindMeters / referenceSpeedMps;
        if (!(gapSec > 0 && gapSec <= 5)) continue;
        if (!closestRunBehind || gapSec < closestRunBehind.gapSec) {
          closestRunBehind = {
            gapSec,
            rivalName: state.participants?.participants?.[idx]?.name || `Car ${idx + 1}`,
          };
        }
      }
      if (closestRunBehind) {
        emitLocalRadio('normal', 'high',
          `Give way, ${closestRunBehind.rivalName} is on a flying lap ${closestRunBehind.gapSec.toFixed(1)}s behind.`,
          'outlap_traffic');
      } else {
        emitLocalRadio('normal', 'low', 'Outlap. Track is clear.', 'outlap_clear');
      }
    }
    radio.prev.pitStatus = pitStatus;
    // After a push lap: detect when we set a timed lap and are now on inlap/cooldown
    // pitStatus === 1 means entering pits = cooldown/inlap after push
    if (pitStatus === 1 && lastLapMs > 0 && lastLapMs !== radio.prev.lastLapTime) {
      radio.prev.lastLapTime = lastLapMs;
      // Find our position in the session
      const myLapStr = fmt(lastLapMs);
      // P1 time  use session history best laps, fall back to min of last laps
      const historyBests = Object.values(state.bestLapTimes).filter(t => t > 0);
      const bestLap = historyBests.length > 0
        ? Math.min(...historyBests)
        : Math.min(...allLaps.filter(c => c && c.lastLapTimeMs > 0).map(c => c.lastLapTimeMs));
      const p1LapStr = bestLap < Infinity ? fmt(bestLap) : '';
      const deltaMs  = lastLapMs - bestLap;
      const deltaStr = bestLap < Infinity && bestLap > 0
        ? (deltaMs >= 0 ? `+${(deltaMs/1000).toFixed(3)}` : (deltaMs/1000).toFixed(3)) + 's'
        : '';
      const myCarPos = lap.carPosition;
      const sessionTypeLabel = { 5:'Q1', 6:'Q2', 7:'Q3', 8:'SQ', 9:'OSQ' }[ses.sessionType] || 'Q';
      let msg = `${sessionTypeLabel} lap complete. P${myCarPos}. Your lap: ${myLapStr}`;
      if (deltaStr && myCarPos !== 1) msg += `. P1: ${p1LapStr} (${deltaStr})`;
      msg += '. Coming in.';
      emitLocalRadio('normal', 'medium', msg, 'qualifying_lap_complete');
    }
  }
  //  Master auto-radio check (called from RAF tick) 
  let lastAutoRadioCheck = 0;
  function checkAutoRadio() {
    if (!radio.enabled || !state.connected) return;
    const now = Date.now();
    if (now - lastAutoRadioCheck < 3000) return;
    lastAutoRadioCheck = now;
    const ses = state.session;
    const isQualifying = ses && [5,6,7,8,9].includes(ses.sessionType);
    if (isQualifying) {
      detectQualifyingRadio();
      return;  // skip all race-mode checks
    }
    if (handleFinishedRaceRadioState()) return;
    // All informational/logic-based triggers (no API)
    detectRaceStart();
    detectPositionChange();
    detectTyreWear();
    detectFuel();
    detectWeatherChange();
    detectDamage();
    detectFlagChanges();
    detectRestartRelease();
    detectPitStatus();
    detectPenalty();
    detectPitWindow();
    detectBattleSituations();
    detectNearbyTrafficHazards();
    detectDrivingEvents();
    detectEndRace();
    detectCleanAir();
    // Proximity-based (API calls for tactical advice)
    const scenario = getProximityScenario();
    if (!scenario) { radio.prev.scenario = null; return; }
    const scenarioChanged = scenario !== radio.prev.scenario;
    if (scenarioChanged || canTrigger(scenario)) {
      radio.prev.scenario = scenario;
      triggerAPIRadio(scenario);
    }
  }

  return {
    appendRadioCard,
    buildRaceContext,
    checkAutoRadio,
    toInfoOnlyRadioText,
  };
}

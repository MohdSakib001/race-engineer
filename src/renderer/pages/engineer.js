export function createEngineerPage(deps) {
  const {
    state,
    radio,
    gptRealtime,
    license,
    el,
    popoutBtn,
    buildRaceContext,
    toInfoOnlyRadioText,
    gptConnect,
    gptDisconnect,
    showPurchaseModal,
    updateGptStatusUI,
    TYRE_COMPOUNDS,
    safetyCarLabel,
  } = deps;

  function buildEngineer() {
    el('page-engineer').innerHTML = `
      <div class="engineer-header">
        <span class="engineer-icon"></span>
        <h2>AI Race Engineer</h2>
        <span class="model-badge" id="engineer-model-badge">claude-opus-4-6</span>
        <span class="gpt-status-badge badge-off" id="gpt-status-badge">GPT: Off</span>
        <div style="margin-left:auto;display:flex;align-items:center;gap:10px">
          <label class="context-toggle" style="margin:0">
            <input type="checkbox" id="radio-enabled" checked>
            Auto Radio
          </label>
          ${popoutBtn('engineer', 'AI Engineer', 800, 900)}
          <button id="clear-radio" style="font-size:11px;padding:3px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:3px;color:var(--text2);cursor:pointer">Clear</button>
        </div>
      </div>
      <div class="ai-mode-strip">
        <div class="ai-mode-group">
          <label class="ai-mode-label">Voice Mode:</label>
          <select id="ai-mode-select" class="settings-input" style="width:180px">
            <option value="classic">Classic TTS (edge-tts)</option>
            <option value="gpt">GPT Realtime AI Voice</option>
          </select>
        </div>
        <div class="ai-mode-group" id="gpt-controls" style="display:none">
          <select id="gpt-voice-select" class="settings-input" style="width:130px">
            <option value="echo">Echo (male)</option>
            <option value="alloy">Alloy (neutral)</option>
            <option value="shimmer">Shimmer (female)</option>
            <option value="fable">Fable (british)</option>
            <option value="onyx">Onyx (deep)</option>
            <option value="nova">Nova (warm)</option>
          </select>
          <select id="gpt-session-type" class="settings-input" style="width:140px">
            <option value="race">Race</option>
            <option value="qualifying">Qualifying</option>
          </select>
          <button id="gpt-connect-btn" class="settings-save-btn" style="background:var(--accent)">Connect AI</button>
          <button id="gpt-buy-btn" class="settings-save-btn" style="background:#2a2a4a">Buy Credits</button>
          <span id="gpt-credits-label" style="font-size:11px;color:var(--text3)"></span>
        </div>
      </div>
      <div class="radio-status-strip" id="radio-status-strip">
        <div class="radio-status-item"><span class="radio-status-label">Position</span><span class="radio-status-value" id="rs-pos"></span></div>
        <div class="radio-status-item"><span class="radio-status-label">Lap</span><span class="radio-status-value" id="rs-lap"></span></div>
        <div class="radio-status-item"><span class="radio-status-label">Tyre</span><span class="radio-status-value" id="rs-tyre"></span></div>
        <div class="radio-status-item"><span class="radio-status-label">Wear</span><span class="radio-status-value" id="rs-wear"></span></div>
        <div class="radio-status-item"><span class="radio-status-label">ERS</span><span class="radio-status-value" id="rs-ers"></span></div>
        <div class="radio-status-item"><span class="radio-status-label">Fuel</span><span class="radio-status-value" id="rs-fuel"></span></div>
        <div class="radio-status-item"><span class="radio-status-label">Gap Ahead</span><span class="radio-status-value" id="rs-gap"></span></div>
        <div class="radio-status-item"><span class="radio-status-label">Flags</span><span class="radio-status-value" id="rs-flags"></span></div>
      </div>
      <div id="proximity-bar" class="proximity-bar hidden">
        <span id="prox-ahead"></span>
        <span id="prox-me">YOU</span>
        <span id="prox-behind"></span>
      </div>
      <div class="radio-feed-wrap">
        <div class="section-title" style="padding:10px 16px 4px;border-bottom:1px solid var(--border)">
          Team Radio <span style="font-weight:400;color:var(--text3);font-size:10px">(all situations  auto-triggered)</span>
        </div>
        <div id="radio-feed" class="radio-feed">
          <div class="radio-feed-empty">No radio messages yet. Auto-triggers for all race situations.</div>
        </div>
      </div>
      <div class="chat-input-area" style="border-top:2px solid var(--border)">
        <div style="flex:1;display:flex;flex-direction:column;gap:6px">
          <span style="font-size:11px;color:var(--text3)">Manual query  ask any tactical question</span>
          <textarea class="chat-input" id="chat-input" placeholder="e.g. Should I box this lap? (Enter to send)" rows="2"></textarea>
        </div>
        <button class="chat-send-btn" id="chat-send">Ask</button>
      </div>
      <div id="manual-response" class="manual-response hidden">
        <div class="radio-card urgency-medium" id="manual-card">
          <div class="radio-text" id="manual-text"></div>
        </div>
      </div>
    `;

    el('radio-enabled').addEventListener('change', (e) => {
      radio.enabled = e.target.checked;
    });

    el('clear-radio').addEventListener('click', () => {
      const feedEl = el('radio-feed');
      feedEl.innerHTML = '<div class="radio-feed-empty">Feed cleared.</div>';
      radio.prev.scenario = null;
      radio.lastTrigger = {};
      radio.prev.lastRadioText = '';
      radio.prev.lastRadioTextAt = 0;
    });

    const input = el('chat-input');
    const sendBtn = el('chat-send');
    const manualResp = el('manual-response');
    const manualText = el('manual-text');
    async function sendManual() {
      const q = input.value.trim();
      if (!q || sendBtn.disabled) return;
      input.value = '';
      sendBtn.disabled = true;
      sendBtn.textContent = '';
      manualResp.classList.remove('hidden');
      manualText.textContent = 'Thinking';
      const ctx = buildRaceContext(true);
      const result = await window.raceEngineer.askEngineer({ question: q, context: ctx, mode: 'DRIVER_RADIO' });
      manualText.textContent = result.error ? ' ' + result.error : toInfoOnlyRadioText(result.response);
      sendBtn.disabled = false;
      sendBtn.textContent = 'Ask';
    }
    sendBtn.addEventListener('click', sendManual);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendManual();
      }
    });

    const aiModeSelect = el('ai-mode-select');
    const gptControls = el('gpt-controls');
    const gptConnectBtn = el('gpt-connect-btn');
    const gptBuyBtn = el('gpt-buy-btn');
    const gptVoiceSelect = el('gpt-voice-select');
    const gptSessionType = el('gpt-session-type');
    const gptCreditsLabel = el('gpt-credits-label');
    const modelBadge = el('engineer-model-badge');

    function updateGptCreditsLabel() {
      if (!gptCreditsLabel) return;
      if (license.devMode) {
        gptCreditsLabel.textContent = 'DEV MODE - unlimited';
      } else {
        const n = license.creditsRemaining ?? license.racesRemaining ?? 0;
        gptCreditsLabel.textContent = n + ' credit' + (n !== 1 ? 's' : '') + ' remaining';
      }
    }

    if (aiModeSelect) {
      aiModeSelect.value = gptRealtime.aiMode;
      aiModeSelect.addEventListener('change', () => {
        gptRealtime.aiMode = aiModeSelect.value;
        const isGpt = gptRealtime.aiMode === 'gpt';
        if (gptControls) gptControls.style.display = isGpt ? 'flex' : 'none';
        if (modelBadge) modelBadge.textContent = isGpt ? 'gpt-4o-realtime' : 'claude-opus-4-6';
        if (!isGpt && gptRealtime.connected) gptDisconnect();
      });
    }

    if (gptControls) gptControls.style.display = gptRealtime.aiMode === 'gpt' ? 'flex' : 'none';
    if (gptVoiceSelect) {
      gptVoiceSelect.value = gptRealtime.voice;
      gptVoiceSelect.addEventListener('change', () => { gptRealtime.voice = gptVoiceSelect.value; });
    }
    if (gptSessionType) {
      gptSessionType.value = gptRealtime.sessionType;
      gptSessionType.addEventListener('change', () => {
        gptRealtime.sessionType = gptSessionType.value;
        updateGptCreditsLabel();
      });
    }
    if (gptConnectBtn) {
      gptConnectBtn.addEventListener('click', async () => {
        if (gptRealtime.connected) {
          gptConnectBtn.textContent = 'Connect AI';
          await gptDisconnect();
        } else {
          gptConnectBtn.textContent = 'Connecting...';
          gptConnectBtn.disabled = true;
          await gptConnect();
          gptConnectBtn.disabled = false;
          gptConnectBtn.textContent = gptRealtime.connected ? 'Disconnect AI' : 'Connect AI';
          updateGptCreditsLabel();
        }
      });
    }
    if (gptBuyBtn) {
      gptBuyBtn.addEventListener('click', () => showPurchaseModal());
    }

    updateGptCreditsLabel();
    updateGptStatusUI();
  }

  function updateEngineerProximity() {
    const lap = state.lapData?.[state.playerCarIndex];
    const sts = state.status;
    const dmg = state.damage;
    const ses = state.session;

    if (lap) {
      const rsPos = el('rs-pos');
      if (rsPos) rsPos.textContent = `P${lap.carPosition}`;
      const rsLap = el('rs-lap');
      if (rsLap) rsLap.textContent = `${lap.currentLapNum}/${ses?.totalLaps || ''}`;
      const rsGap = el('rs-gap');
      if (rsGap) rsGap.textContent = lap.deltaToCarAheadMs > 0 ? `${(lap.deltaToCarAheadMs / 1000).toFixed(1)}s` : '';
    }
    if (sts) {
      const cmp = TYRE_COMPOUNDS[sts.visualTyreCompound];
      const rsTyre = el('rs-tyre');
      if (rsTyre) rsTyre.innerHTML = cmp ? `<span style="color:${cmp.color}">${cmp.name} (${sts.tyresAgeLaps}L)</span>` : '';
      const rsErs = el('rs-ers');
      if (rsErs) rsErs.textContent = ((sts.ersStoreEnergy / 4000000) * 100).toFixed(0) + '%';
      const rsFuel = el('rs-fuel');
      if (rsFuel) rsFuel.textContent = sts.fuelRemainingLaps.toFixed(1) + ' laps';
    }
    if (dmg) {
      const maxWear = Math.max(...dmg.tyresWear.map((w) => Math.round(w)));
      const rsWear = el('rs-wear');
      if (rsWear) {
        rsWear.textContent = maxWear + '%';
        rsWear.className = `radio-status-value ${maxWear > 80 ? 'status-critical' : maxWear > 60 ? 'status-warn' : ''}`;
      }
    }
    if (ses) {
      const rsFlags = el('rs-flags');
      if (rsFlags) {
        const scLabel = safetyCarLabel(ses.safetyCarStatus);
        rsFlags.textContent = scLabel || 'Green';
        rsFlags.className = `radio-status-value ${ses.safetyCarStatus > 0 ? 'status-critical' : ''}`;
      }
    }

    const proxBar = el('proximity-bar');
    if (!proxBar || !lap) {
      if (proxBar) proxBar.classList.add('hidden');
      return;
    }

    const myPos = lap.carPosition;
    const carAheadLap = state.lapData?.find((entry) => entry?.carPosition === myPos - 1);
    const carBehindLap = state.lapData?.find((entry) => entry?.carPosition === myPos + 1);
    const gapAheadMs = lap.deltaToCarAheadMs;
    const gapBehindMs = carBehindLap?.deltaToCarAheadMs;
    const aheadIdx = carAheadLap ? state.lapData.indexOf(carAheadLap) : -1;
    const behindIdx = carBehindLap ? state.lapData.indexOf(carBehindLap) : -1;
    const aheadName = state.participants?.participants?.[aheadIdx]?.name || (carAheadLap ? `P${myPos - 1}` : null);
    const behindName = state.participants?.participants?.[behindIdx]?.name || (carBehindLap ? `P${myPos + 1}` : null);
    const inRange = (gapAheadMs > 0 && gapAheadMs < 1200) || (gapBehindMs != null && gapBehindMs < 1000);
    if (!inRange) {
      proxBar.classList.add('hidden');
      return;
    }

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

  return { buildEngineer, updateEngineerProximity };
}

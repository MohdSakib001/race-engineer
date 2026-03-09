export function createSettingsPage(deps) {
  const {
    state,
    license,
    gptRealtime,
    radio,
    tts,
    TTS_VOICES,
    TRACK_NAMES,
    el,
    normalizeListenPort,
    showPurchaseModal,
    refreshLicenseBadges,
    getLicenseStatusLabel,
    formatPaymentEventTime,
    ttsSpeak,
    getListenPort,
    setListenPort,
    getSavedApiKey,
    setSavedApiKey,
    rerenderSettings,
  } = deps;

  function buildSettings() {
    const listenPort = getListenPort();
    el('page-settings').innerHTML = `
      <div class="settings-layout">
        <div class="settings-column">
          <div class="settings-section">
            <h3>Telemetry Connection</h3>
            <div class="panel">
              <div class="panel-body">
                <div class="settings-field">
                  <label>Listen Port (This Window)</label>
                  <input type="number" class="settings-input" id="listen-port-input" min="1" max="65535" value="${listenPort}">
                </div>
                <div class="stat-row"><span class="stat-label">Active port</span><span class="stat-value mono" id="set-listen-port">${listenPort}</span></div>
                <div class="stat-row"><span class="stat-label">Protocol</span><span class="stat-value">UDP</span></div>
                <div class="stat-row"><span class="stat-label">Status</span><span class="stat-value" id="set-conn-status">Offline</span></div>
                <p class="settings-note" style="margin-top:10px">
                  Set the game's UDP Port to the same value as this window. Example: main window on <strong>20777</strong>, popped-out window on <strong>20778</strong>.
                </p>
              </div>
            </div>
          </div>
          <div class="settings-section">
            <h3>Voice / Text-to-Speech</h3>
            <div class="panel">
              <div class="panel-body">
                <div class="settings-field">
                  <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                    <input type="checkbox" id="tts-enabled"> Enable Engineer Voice (TTS)
                  </label>
                </div>
                <div class="settings-field" style="margin-top:10px">
                  <label>Voice</label>
                  <select class="settings-input" id="tts-voice-select">
                    ${TTS_VOICES.map((voice) => `<option value="${voice.id}">${voice.label}</option>`).join('')}
                  </select>
                </div>
                <div class="settings-field">
                  <label>Rate <span id="tts-rate-val">1.0</span>x</label>
                  <input type="range" id="tts-rate" min="0.5" max="2" step="0.1" value="1.0" style="width:100%">
                </div>
                <button class="settings-save-btn" id="tts-test" style="margin-top:6px">Test Voice</button>
              </div>
            </div>
          </div>
          <div class="settings-section">
            <h3>Track Override</h3>
            <div class="panel">
              <div class="panel-body">
                <p class="settings-note" style="margin-bottom:10px">If the game sends an unrecognized track ID, you can manually select the circuit here.</p>
                <div class="stat-row"><span class="stat-label">Detected Track ID</span><span class="stat-value mono" id="set-detected-track"></span></div>
                <div class="settings-field" style="margin-top:10px">
                  <label>Manual Track</label>
                  <select class="settings-input" id="manual-track-select">
                    <option value="-1">Auto-detect (use game data)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
          <div class="settings-section">
            <h3>Classic AI (Claude Opus) - API Key</h3>
            <div class="panel"><div class="panel-body">
              <div class="settings-field">
                <label>Anthropic API Key</label>
                <input type="password" class="settings-input" id="api-key-input" placeholder="sk-ant-..." />
              </div>
              <button class="settings-save-btn" id="save-api-key" style="margin-top:8px">Apply Key</button>
              <p class="settings-note" style="margin-top:6px">Used for Classic AI mode (non-realtime). Get a key at console.anthropic.com.</p>
            </div></div>
          </div>
        </div>
        <div class="settings-column">
          <div class="settings-section">
            <h3>GPT Realtime Voice - Mode</h3>
            <div class="panel"><div class="panel-body">
              <div class="hybrid-mode-cards">
                <div class="hybrid-card ${license.byokMode ? '' : 'hybrid-card-active'}" id="hybrid-sub-card">
                  <div class="hybrid-card-title">Subscription</div>
                  <div class="hybrid-card-desc">Buy credits - we handle the OpenAI key. Each credit covers one race or qualifying session.</div>
                  <div class="hybrid-card-stats">
                    <span>Credits: <strong id="set-credits-remaining">${license.devMode ? 'Unlimited' : (license.creditsRemaining ?? license.racesRemaining)}</strong></span>
                    ${license.devMode ? '<span class="dev-badge">DEV</span>' : ''}
                  </div>
                  <button class="settings-save-btn" id="set-buy-btn" style="background:var(--accent);margin-top:10px;width:100%">Buy Credits</button>
                </div>
                <div class="hybrid-card ${license.byokMode ? 'hybrid-card-active' : ''}" id="hybrid-byok-card">
                  <div class="hybrid-card-title">BYOK - Use Your Own Key</div>
                  <div class="hybrid-card-desc">Enter your own OpenAI key. You pay OpenAI directly. Free to use in the app.</div>
                  <div class="settings-field" style="margin-top:8px">
                    <input type="password" class="settings-input" id="openai-key-input" placeholder="sk-..." style="font-size:11px"/>
                  </div>
                  <div style="display:flex;gap:6px;margin-top:8px">
                    <button class="settings-save-btn" id="save-openai-key" style="flex:1">Save &amp; Enable BYOK</button>
                    ${license.byokMode ? '<button class="settings-save-btn" id="disable-byok-btn" style="flex:1">Disable BYOK</button>' : ''}
                  </div>
                  ${license.byokMode ? '<div class="byok-active-badge" style="margin-top:8px">BYOK Active</div>' : ''}
                </div>
              </div>
              <div class="stat-row" style="margin-top:10px"><span class="stat-label">Current Mode</span><span class="stat-value mono" id="set-license-mode">${license.byokMode ? 'BYOK (your key)' : license.devMode ? 'Developer (free)' : 'Subscription'}</span></div>
              <div class="stat-row"><span class="stat-label">Key Status</span><span class="stat-value" id="set-license-status">${getLicenseStatusLabel()}</span></div>
              <div class="stat-row"><span class="stat-label">Exhausted At</span><span class="stat-value mono" id="set-license-exhausted-at">${license.licenseExhaustedAt ? formatPaymentEventTime(license.licenseExhaustedAt) : '-'}</span></div>
              <div class="stat-row"><span class="stat-label">Last Issued Key</span><span class="stat-value mono" id="set-last-license-key">${license.lastIssuedLicenseKey || license.licenseKey || '-'}</span></div>
            </div></div>
          </div>
          <div class="settings-section">
            <h3>Activate License Key</h3>
            <div class="panel"><div class="panel-body">
              <p class="settings-note" style="margin-bottom:10px">If you've purchased a credit pack and need to activate it on a new machine or after reinstalling, enter your license key (RE-XXXX-XXXX-XXXX) below.</p>
              ${(license.lastIssuedLicenseKey || license.licenseKey) ? `<div class="stat-row"><span class="stat-label">Last Key</span><span class="stat-value mono" style="font-size:11px;letter-spacing:1px">${license.lastIssuedLicenseKey || license.licenseKey}</span></div>` : ''}
              <div class="settings-field" style="margin-top:8px">
                <label>License Key</label>
                <input type="text" class="settings-input" id="license-key-input" placeholder="RE-XXXX-XXXX-XXXX" maxlength="14" style="letter-spacing:1px;text-transform:uppercase"/>
              </div>
              <div style="display:flex;gap:6px;margin-top:8px">
                <button class="settings-save-btn" id="activate-key-btn" style="flex:1">Activate Key</button>
                ${license.licenseKey ? '<button class="settings-save-btn" id="deactivate-key-btn" style="flex:1;background:#c0392b">Deactivate This Machine</button>' : ''}
              </div>
              <div id="activate-key-result" style="margin-top:8px;font-size:12px"></div>
            </div></div>
          </div>
          <div class="settings-section">
            <h3>Payment Status & Logs</h3>
            <div class="panel"><div class="panel-body">
              <div class="stat-row">
                <span class="stat-label">Recent Events</span>
                <span class="stat-value" id="set-payment-log-empty">${Array.isArray(license.paymentEvents) && license.paymentEvents.length > 0 ? '' : 'No payment events yet.'}</span>
              </div>
              <div id="set-payment-log-list" class="payment-log-list"></div>
            </div></div>
          </div>
        </div>
        <div class="settings-section settings-section-actions">
          <div style="display:flex;gap:8px;align-items:center">
            <button class="settings-save-btn" id="save-all-settings" style="background:var(--accent)">Save All Settings</button>
          </div>
          <p class="settings-note" style="margin-top:6px">Saves API keys, TTS config, radio config and AI mode to disk.</p>
        </div>
      </div>
    `;

    el('save-api-key').addEventListener('click', () => {
      const key = el('api-key-input').value.trim();
      if (key) {
        setSavedApiKey(key);
        window.raceEngineer.setApiKey(key);
        el('save-api-key').textContent = 'Applied';
        setTimeout(() => { el('save-api-key').textContent = 'Apply Claude Key'; }, 2000);
      }
    });

    el('save-openai-key')?.addEventListener('click', async () => {
      const key = el('openai-key-input')?.value.trim();
      if (!key || !key.startsWith('sk-')) {
        el('save-openai-key').textContent = 'Invalid key';
        setTimeout(() => { el('save-openai-key').textContent = 'Save & Enable BYOK'; }, 2000);
        return;
      }
      gptRealtime.openaiApiKey = key;
      const result = await window.raceEngineer.setBYOKMode({ enabled: true });
      if (result.success) {
        Object.assign(license, result.license);
        el('save-openai-key').textContent = 'BYOK Enabled';
        const modeEl = el('set-license-mode');
        if (modeEl) modeEl.textContent = 'BYOK (your key)';
        setTimeout(() => { rerenderSettings(); }, 1500);
      }
    });

    el('disable-byok-btn')?.addEventListener('click', async () => {
      const result = await window.raceEngineer.setBYOKMode({ enabled: false });
      if (result.success) {
        Object.assign(license, result.license);
        rerenderSettings();
      }
    });

    el('set-buy-btn')?.addEventListener('click', () => showPurchaseModal());

    el('activate-key-btn')?.addEventListener('click', async () => {
      const keyInput = el('license-key-input');
      const resultEl = el('activate-key-result');
      const key = keyInput?.value.trim().toUpperCase();
      if (!key || !key.startsWith('RE-')) {
        resultEl.style.color = 'var(--danger)';
        resultEl.textContent = 'Enter a valid key (RE-XXXX-XXXX-XXXX)';
        return;
      }
      el('activate-key-btn').textContent = 'Checking...';
      el('activate-key-btn').disabled = true;
      const result = await window.raceEngineer.activateLicenseKey({ licenseKey: key });
      el('activate-key-btn').textContent = 'Activate Key';
      el('activate-key-btn').disabled = false;
      if (result.error) {
        resultEl.style.color = 'var(--danger)';
        resultEl.textContent = result.error;
      } else {
        Object.assign(license, result.license);
        resultEl.style.color = 'var(--green)';
        resultEl.textContent = `Activated! ${result.packCount} credit${result.packCount !== 1 ? 's' : ''} synced.`;
        setTimeout(() => rerenderSettings(), 2000);
      }
    });

    el('deactivate-key-btn')?.addEventListener('click', async () => {
      const resultEl = el('activate-key-result');
      if (!confirm('Deactivate this machine? Your license slot will be freed so you can activate on another machine. Local credits will be cleared.')) return;
      el('deactivate-key-btn').textContent = 'Deactivating...';
      el('deactivate-key-btn').disabled = true;
      const result = await window.raceEngineer.deactivateLicenseKey();
      if (result.error) {
        resultEl.style.color = 'var(--danger)';
        resultEl.textContent = result.error;
        el('deactivate-key-btn').textContent = 'Deactivate This Machine';
        el('deactivate-key-btn').disabled = false;
      } else {
        Object.assign(license, result.license || { licenseKey: null, machineId: null });
        resultEl.style.color = 'var(--green)';
        resultEl.textContent = 'Deactivated. You can now activate on another machine.';
        setTimeout(() => rerenderSettings(), 2000);
      }
    });

    el('save-all-settings').addEventListener('click', () => {
      const key = el('api-key-input').value.trim();
      if (key) window.raceEngineer.setApiKey(key);
      const openaiKey = el('openai-key-input')?.value.trim();
      if (openaiKey) gptRealtime.openaiApiKey = openaiKey;
      window.raceEngineer.saveSettings({
        apiKey: key || undefined,
        openaiApiKey: openaiKey || undefined,
        tts: { enabled: tts.enabled, voice: tts.voice, rate: tts.rate },
        radioConfig: radio.config,
        telemetryPort: getListenPort(),
        gptVoice: gptRealtime.voice,
        aiMode: gptRealtime.aiMode,
      });
      el('save-all-settings').textContent = 'Saved';
      setTimeout(() => { el('save-all-settings').textContent = 'Save All Settings'; }, 2000);
    });

    const portInput = el('listen-port-input');
    const activePortEl = el('set-listen-port');
    const setConnEl = el('set-conn-status');
    if (setConnEl) setConnEl.textContent = state.connected ? 'Connected' : 'Offline';
    if (portInput) {
      portInput.value = String(getListenPort());
      portInput.addEventListener('change', () => {
        const nextPort = normalizeListenPort(portInput.value);
        setListenPort(nextPort);
        portInput.value = String(nextPort);
        if (activePortEl) activePortEl.textContent = String(nextPort);
        const label = el('connection-label');
        if (label && !state.connected) label.textContent = `Offline - UDP :${nextPort}`;
      });
    }

    const trackSelect = el('manual-track-select');
    if (trackSelect) {
      const sorted = Object.entries(TRACK_NAMES).sort((a, b) => a[1].localeCompare(b[1]));
      for (const [id, name] of sorted) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = `${name} (ID ${id})`;
        trackSelect.appendChild(opt);
      }
      trackSelect.addEventListener('change', () => {
        window.raceEngineer.setManualTrack(parseInt(trackSelect.value, 10));
      });
    }

    const apiInput = el('api-key-input');
    if (apiInput && getSavedApiKey()) apiInput.value = getSavedApiKey();

    const openaiInput = el('openai-key-input');
    if (openaiInput && gptRealtime.openaiApiKey) openaiInput.value = gptRealtime.openaiApiKey;

    const ttsEnabledEl = el('tts-enabled');
    const ttsVoiceEl = el('tts-voice-select');
    const ttsRateEl = el('tts-rate');
    if (ttsEnabledEl) {
      ttsEnabledEl.checked = tts.enabled;
      ttsEnabledEl.addEventListener('change', () => { tts.enabled = ttsEnabledEl.checked; });
    }
    if (ttsVoiceEl) {
      ttsVoiceEl.value = tts.voice;
      ttsVoiceEl.addEventListener('change', () => { tts.voice = ttsVoiceEl.value; });
    }
    if (ttsRateEl) {
      ttsRateEl.value = tts.rate;
      ttsRateEl.addEventListener('input', () => {
        tts.rate = parseFloat(ttsRateEl.value);
        el('tts-rate-val').textContent = tts.rate.toFixed(1);
      });
    }

    el('tts-test')?.addEventListener('click', () => {
      const wasEnabled = tts.enabled;
      tts.enabled = true;
      ttsSpeak('Box this lap, box this lap. Tyres are ready.');
      tts.enabled = wasEnabled;
    });

    refreshLicenseBadges();
  }

  return { buildSettings };
}

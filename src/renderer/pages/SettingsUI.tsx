import React, { useState, useEffect, useCallback } from 'react';
import { useTelemetryContext } from '../context/TelemetryContext';
import { usePrefs } from '../context/PrefsContext';
import { usePushToTalk } from '../hooks/usePushToTalk';
import { clearCache, getStats as getCacheStats } from '../lib/phrase-cache';

import { api } from '../lib/tauri-api';
import type { DriverNameMask } from '../../shared/types/store';

const TTS_VOICES = [
  { id: 'en-GB-RyanNeural', label: 'Ryan (British Male) — Engineer-like' },
  { id: 'en-GB-ThomasNeural', label: 'Thomas (British Male)' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia (British Female)' },
  { id: 'en-US-GuyNeural', label: 'Guy (US Male)' },
  { id: 'en-US-AriaNeural', label: 'Aria (US Female)' },
  { id: 'en-AU-WilliamNeural', label: 'William (AU Male)' },
  { id: 'en-AU-NatashaNeural', label: 'Natasha (AU Female)' },
  { id: 'en-IE-ConnorNeural', label: 'Connor (Irish Male)' },
];

const TRACK_NAMES: Record<number, string> = {
  0: 'Melbourne', 1: 'Paul Ricard', 2: 'Shanghai', 3: 'Bahrain',
  4: 'Catalunya', 5: 'Monaco', 6: 'Montreal', 7: 'Silverstone',
  8: 'Hockenheim', 9: 'Hungaroring', 10: 'Spa', 11: 'Monza',
  12: 'Singapore', 13: 'Suzuka', 14: 'Abu Dhabi', 15: 'Austin',
  16: 'Interlagos', 17: 'Red Bull Ring', 18: 'Sochi',
  19: 'Mexico City', 20: 'Baku', 21: 'Sakhir Short',
  22: 'Silverstone Short', 23: 'Austin Short', 24: 'Suzuka Short',
  25: 'Hanoi', 26: 'Zandvoort', 27: 'Imola', 28: 'Portimao',
  29: 'Jeddah', 30: 'Miami', 31: 'Las Vegas', 32: 'Losail',
};

export function Settings() {
  const { connected, session } = useTelemetryContext();
  const prefs = usePrefs();

  const [port, setPort] = useState(20777);
  const [apiKey, setApiKey] = useState('');
  const [premium, setPremium] = useState(false);
  const [keyStatus, setKeyStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsVoice, setTtsVoice] = useState('en-GB-RyanNeural');
  const [ttsRate, setTtsRate] = useState(1.0);
  const [manualTrackId, setManualTrackId] = useState(-1);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [usage, setUsage] = useState<any>(null);
  const [cacheStats, setCacheStats] = useState<{ entries: number; totalHits: number } | null>(null);

  const ptt = usePushToTalk({ onQuery: () => { /* Settings doesn't dispatch; learning only */ } });

  // Load saved settings on mount
  useEffect(() => {
    api.loadSettings?.().then((settings: any) => {
      if (!settings) return;
      if (settings.apiKey) {
        setApiKey(settings.apiKey);
        // If we previously saved a valid key, assume it's still good unless re-validated.
        if (settings.keyValidatedAt) setKeyStatus('valid');
      }
      if (typeof settings.premium === 'boolean') setPremium(settings.premium);
      if (settings.tts?.enabled != null) setTtsEnabled(settings.tts.enabled);
      if (settings.tts?.voice) setTtsVoice(settings.tts.voice);
      if (settings.tts?.rate != null) setTtsRate(settings.tts.rate);
      if (settings.telemetryPort) setPort(settings.telemetryPort);
    }).catch(() => {});
    api.getUsage?.().then(setUsage).catch(() => {});
    getCacheStats().then(setCacheStats).catch(() => {});
  }, []);

  /**
   * Connect Premium: validates the key, on success persists it + turns Premium on.
   * This is the only path that flips premium to true — the user no longer toggles it directly.
   */
  const connectPremium = useCallback(async () => {
    const key = apiKey.trim();
    if (!key) { setKeyError('Paste your Anthropic API key first.'); setKeyStatus('invalid'); return; }
    setKeyStatus('validating');
    setKeyError(null);
    try {
      const r = await api.validateApiKey(key);
      if (r.valid) {
        setKeyStatus('valid');
        await api.setApiKey(key);
        await api.setPremium(true);
        setPremium(true);
        const prev: any = (await api.loadSettings?.()) ?? {};
        await api.saveSettings?.({
          ...prev,
          apiKey: key,
          premium: true,
          keyValidatedAt: Date.now(),
        });
        api.getUsage?.().then(setUsage).catch(() => {});
      } else {
        setKeyStatus('invalid');
        setKeyError(r.error || 'Key rejected by Anthropic.');
        await api.setPremium(false);
        setPremium(false);
      }
    } catch (e: any) {
      setKeyStatus('invalid');
      setKeyError(String(e?.message || e));
    }
  }, [apiKey]);

  const disconnectPremium = useCallback(async () => {
    await api.setPremium(false);
    setPremium(false);
    const prev: any = (await api.loadSettings?.()) ?? {};
    await api.saveSettings?.({ ...prev, premium: false });
  }, []);

  const removeKey = useCallback(async () => {
    setApiKey('');
    setKeyStatus('idle');
    setKeyError(null);
    await api.setApiKey('');
    await api.setPremium(false);
    setPremium(false);
    const prev: any = (await api.loadSettings?.()) ?? {};
    delete prev.apiKey;
    delete prev.keyValidatedAt;
    await api.saveSettings?.({ ...prev, premium: false });
  }, []);

  const testVoice = useCallback(() => {
    api.ttsSpeak({ text: 'Box this lap, box this lap. Tyres are ready.', voice: ttsVoice });
  }, [ttsVoice]);

  const handleTrackChange = useCallback((trackId: number) => {
    setManualTrackId(trackId);
    api.setManualTrack(trackId);
  }, []);

  const saveAll = useCallback(async () => {
    const prev: any = (await api.loadSettings?.()) ?? {};
    await api.saveSettings?.({
      ...prev,
      tts: { enabled: ttsEnabled, voice: ttsVoice, rate: ttsRate },
      telemetryPort: port,
      ptt: { ...(prev.ptt ?? {}), binding: ptt.binding },
    });
    setSaveStatus('Saved!');
    setTimeout(() => setSaveStatus(null), 2000);
  }, [ttsEnabled, ttsVoice, ttsRate, port, ptt.binding]);

  const refreshUsage = useCallback(() => {
    api.getUsage?.().then(setUsage).catch(() => {});
  }, []);

  const resetUsage = useCallback(() => {
    api.resetUsage?.().then(refreshUsage).catch(() => {});
  }, [refreshUsage]);

  const clearAudioCache = useCallback(async () => {
    await clearCache();
    const s = await getCacheStats();
    setCacheStats(s);
  }, []);

  const sortedTracks = Object.entries(TRACK_NAMES).sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <div className="settings-page">
      <div className="settings-columns">
        {/* Left Column */}
        <div className="settings-col">
          {/* Telemetry */}
          <div className="panel">
            <h3 className="panel-title">TELEMETRY CONNECTION</h3>
            <div className="settings-field">
              <label>Listen Port</label>
              <input type="number" className="settings-input" min={1} max={65535}
                value={port} onChange={e => setPort(Number(e.target.value))} />
            </div>
            <div className="stat-list">
              <div className="stat-row-item">
                <span className="stat-label-text">Protocol</span>
                <span className="stat-value-text">UDP</span>
              </div>
              <div className="stat-row-item">
                <span className="stat-label-text">Status</span>
                <span className={`stat-value-text ${connected ? 'status-on' : 'status-off'}`}>
                  {connected ? 'Connected' : 'Offline'}
                </span>
              </div>
              {session && (
                <div className="stat-row-item">
                  <span className="stat-label-text">Track</span>
                  <span className="stat-value-text">{session.trackName} (ID {session.trackId})</span>
                </div>
              )}
            </div>
            <p className="settings-note">
              Set the game's UDP Port to the same value. Default: 20777.
            </p>
          </div>

          {/* TTS */}
          <div className="panel">
            <h3 className="panel-title">VOICE / TEXT-TO-SPEECH</h3>
            <div className="settings-field">
              <label className="toggle-label">
                <input type="checkbox" checked={ttsEnabled}
                  onChange={e => setTtsEnabled(e.target.checked)} />
                Enable Engineer Voice (TTS)
              </label>
            </div>
            <div className="settings-field">
              <label>Voice</label>
              <select className="settings-input" value={ttsVoice}
                onChange={e => setTtsVoice(e.target.value)}>
                {TTS_VOICES.map(v => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
            </div>
            <div className="settings-field">
              <label>Rate: {ttsRate.toFixed(1)}x</label>
              <input type="range" className="settings-range" min={0.5} max={2} step={0.1}
                value={ttsRate} onChange={e => setTtsRate(parseFloat(e.target.value))} />
            </div>
            <button className="btn-action" onClick={testVoice}>Test Voice</button>
            {cacheStats && (
              <p className="settings-note" style={{ marginTop: 8 }}>
                Phrase cache: {cacheStats.entries} entries, {cacheStats.totalHits} hits.{' '}
                <button className="btn-link" onClick={clearAudioCache}>Clear</button>
              </p>
            )}
          </div>

          {/* Track Override */}
          <div className="panel">
            <h3 className="panel-title">TRACK OVERRIDE</h3>
            <p className="settings-note">
              If the game sends an unrecognized track ID, manually select the circuit.
            </p>
            <div className="settings-field">
              <label>Manual Track</label>
              <select className="settings-input" value={manualTrackId}
                onChange={e => handleTrackChange(Number(e.target.value))}>
                <option value={-1}>Auto-detect (use game data)</option>
                {sortedTracks.map(([id, name]) => (
                  <option key={id} value={id}>{name} (ID {id})</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="settings-col">
          {/* Subscription (unified: key + premium status) */}
          <div className="panel">
            <h3 className="panel-title">
              SUBSCRIPTION
              <span className={`sub-badge sub-${premium && keyStatus === 'valid' ? 'active' : 'inactive'}`}>
                {premium && keyStatus === 'valid' ? 'PREMIUM ACTIVE' :
                 premium && keyStatus !== 'valid' ? 'NEEDS VALIDATION' : 'FREE'}
              </span>
            </h3>

            <p className="settings-note" style={{ marginTop: 0 }}>
              Free mode runs the full offline rule engine. Premium adds live AI strategy
              calls (pit windows, undercuts, weather) via Claude Haiku 4.5.
              A full race weekend typically costs under <strong>$0.20</strong> in API credits.
            </p>

            <div className="settings-field">
              <label>Anthropic API Key</label>
              <input type="password"
                className={`settings-input key-input key-${keyStatus}`}
                placeholder="sk-ant-..."
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setKeyStatus('idle'); setKeyError(null); }} />
            </div>

            <div className="sub-actions">
              {!premium || keyStatus !== 'valid' ? (
                <button
                  className="btn-save-all"
                  onClick={connectPremium}
                  disabled={keyStatus === 'validating' || apiKey.trim().length < 10}
                >
                  {keyStatus === 'validating' ? 'Validating…' : 'Connect Premium'}
                </button>
              ) : (
                <>
                  <button className="btn-action" onClick={disconnectPremium}>
                    Disconnect (keep key)
                  </button>
                  <button className="btn-action btn-danger" onClick={removeKey}>
                    Remove Key
                  </button>
                </>
              )}
            </div>

            {keyStatus === 'invalid' && keyError && (
              <div className="sub-alert sub-alert-err">✕ {keyError}</div>
            )}
            {keyStatus === 'valid' && (
              <div className="sub-alert sub-alert-ok">
                ✓ Key verified. Model: Haiku 4.5. AI calls will use this key.
              </div>
            )}

            <p className="settings-note" style={{ marginTop: 10 }}>
              Don't have one? Get a key at{' '}
              <code>console.anthropic.com</code>. Typical cost: $5 credits = 25+ weekends.
            </p>

            {usage && (
              <>
                <h4 className="sub-subhead">API USAGE — This session</h4>
                <div className="stat-list">
                  <div className="stat-row-item">
                    <span className="stat-label-text">Cost</span>
                    <span className="stat-value-text">${(usage.costUsd ?? 0).toFixed(4)}</span>
                  </div>
                  <div className="stat-row-item">
                    <span className="stat-label-text">Input tokens</span>
                    <span className="stat-value-text">{usage.inputTokens}</span>
                  </div>
                  <div className="stat-row-item">
                    <span className="stat-label-text">Cached input</span>
                    <span className="stat-value-text">{usage.cachedInputTokens}</span>
                  </div>
                  <div className="stat-row-item">
                    <span className="stat-label-text">Output tokens</span>
                    <span className="stat-value-text">{usage.outputTokens}</span>
                  </div>
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <button className="btn-small" onClick={refreshUsage}>Refresh</button>
                  <button className="btn-small" onClick={resetUsage}>Reset</button>
                </div>
              </>
            )}
          </div>

          {/* Push-to-Talk */}
          <div className="panel">
            <h3 className="panel-title">PUSH-TO-TALK</h3>
            <p className="settings-note">
              Hold a keyboard key or wheel button to ask the engineer something.
              {!ptt.supported && ' Speech recognition is not available on this system.'}
            </p>
            <div className="stat-list">
              <div className="stat-row-item">
                <span className="stat-label-text">Binding</span>
                <span className="stat-value-text">
                  {ptt.binding ? (ptt.binding.label || `${ptt.binding.kind}:${ptt.binding.code}`) : '— not set —'}
                </span>
              </div>
              <div className="stat-row-item">
                <span className="stat-label-text">Status</span>
                <span className={`stat-value-text ${ptt.listening ? 'status-on' : ''}`}>
                  {ptt.isLearning ? 'Press any key / button…' :
                   ptt.listening ? 'Listening' :
                   ptt.lastError ? `Error: ${ptt.lastError}` : 'Idle'}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {!ptt.isLearning ? (
                <>
                  <button className="btn-action" onClick={() => ptt.startLearn('keyboard')}>
                    Bind Keyboard Key
                  </button>
                  <button className="btn-action" onClick={() => ptt.startLearn('gamepad')}>
                    Bind Wheel / Gamepad Button
                  </button>
                  {ptt.binding && (
                    <button className="btn-action" onClick={ptt.clearBinding}>Clear</button>
                  )}
                </>
              ) : (
                <button className="btn-action" onClick={ptt.cancelLearn}>Cancel</button>
              )}
            </div>
            {ptt.lastTranscript && (
              <p className="settings-note" style={{ marginTop: 8 }}>
                Last heard: "<em>{ptt.lastTranscript}</em>"
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Multi-driver Ports */}
      <div className="panel" style={{ margin: '0 12px 14px' }}>
        <h3 className="panel-title">MULTI-DRIVER PORTS</h3>
        <p className="settings-note" style={{ marginTop: 0, marginBottom: 10 }}>
          Engineer multiple drivers at once. Each slot binds one UDP port. Use the
          switcher in the sidebar to choose which driver the main window shows, or
          click ⧉ to pop a driver into their own window.
          The first port here is also used by the main "Start Telemetry" button.
        </p>
        {prefs.telemetryPorts.map((p, i) => (
          <div className="mask-row" key={i}>
            <input type="number" className="settings-input"
              min={1} max={65535}
              value={p}
              onChange={(e) => {
                const next = [...prefs.telemetryPorts];
                next[i] = parseInt(e.target.value) || 0;
                prefs.setPrefs({ telemetryPorts: next });
              }} />
            <span className="dim" style={{ fontSize: 11, alignSelf: 'center' }}>
              Slot: {i === 0 ? 'primary' : `d${i + 1}`}
            </span>
            {prefs.telemetryPorts.length > 1 && (
              <button className="btn-small btn-mask-del"
                onClick={() => {
                  const next = prefs.telemetryPorts.filter((_, idx) => idx !== i);
                  prefs.setPrefs({ telemetryPorts: next.length > 0 ? next : [20777] });
                }}>✕</button>
            )}
          </div>
        ))}
        {prefs.telemetryPorts.length < 4 && (
          <button className="btn-action"
            onClick={() => {
              const last = prefs.telemetryPorts[prefs.telemetryPorts.length - 1] ?? 20777;
              prefs.setPrefs({ telemetryPorts: [...prefs.telemetryPorts, last + 1] });
            }}>+ Add driver port</button>
        )}
      </div>

      {/* Display & HUD */}
      <div className="panel" style={{ margin: '0 12px 14px' }}>
        <h3 className="panel-title">DISPLAY & HUD</h3>
        <div className="settings-field">
          <label className="toggle-label">
            <input type="checkbox" checked={prefs.showSessionTimer}
              onChange={e => prefs.setPrefs({ showSessionTimer: e.target.checked })} />
            Show Session Timer in sidebar
          </label>
        </div>
      </div>

      {/* Stream Overlay */}
      <div className="panel" style={{ margin: '0 12px 14px' }}>
        <h3 className="panel-title">STREAM OVERLAY</h3>
        <p className="settings-note" style={{ marginTop: 0, marginBottom: 10 }}>
          Compact always-on-top window with live timing — capture it in OBS with
          "Window Capture" or "Game Capture". Dark background is chroma-key friendly.
        </p>
        <button className="btn-action" onClick={() => api.openOverlayWindow?.()}>
          Open Overlay Window
        </button>
      </div>

      {/* LAN Relay */}
      <div className="panel" style={{ margin: '0 12px 14px' }}>
        <h3 className="panel-title">LAN TELEMETRY RELAY</h3>
        <p className="settings-note" style={{ marginTop: 0, marginBottom: 10 }}>
          Forward every UDP packet to another machine (e.g. your race engineer on a
          RadminVPN / LAN). Both machines receive the same feed.
        </p>
        <div className="settings-field">
          <label className="toggle-label">
            <input type="checkbox" checked={prefs.lanRelayEnabled}
              onChange={(e) => prefs.setPrefs({ lanRelayEnabled: e.target.checked })} />
            Enable LAN relay
          </label>
        </div>
        <div className="mask-row">
          <input type="text" className="settings-input"
            placeholder="host (e.g. 192.168.0.42)"
            value={prefs.lanRelayHost}
            onChange={(e) => prefs.setPrefs({ lanRelayHost: e.target.value })} />
          <input type="number" className="settings-input"
            min={1} max={65535}
            placeholder="port"
            value={prefs.lanRelayPort}
            onChange={(e) => prefs.setPrefs({ lanRelayPort: parseInt(e.target.value) || 20778 })} />
          <span />
        </div>
      </div>

      {/* Driver Name Masks */}
      <div className="panel" style={{ margin: '0 12px 14px' }}>
        <h3 className="panel-title">DRIVER NAME MASKS</h3>
        <p className="settings-note" style={{ marginTop: 0, marginBottom: 10 }}>
          Clean up messy online usernames. Each row is a case-insensitive regex applied in order.
          Example: pattern <code>^AOR_</code> replace <code></code> turns <code>AOR_VETTEL</code> into <code>VETTEL</code>.
        </p>
        {prefs.driverNameMasks.map((m, i) => (
          <div className="mask-row" key={i}>
            <input className="settings-input"
              placeholder="regex pattern"
              value={m.pattern}
              onChange={(e) => {
                const next = [...prefs.driverNameMasks];
                next[i] = { ...next[i], pattern: e.target.value };
                prefs.setPrefs({ driverNameMasks: next });
              }} />
            <input className="settings-input"
              placeholder="replace with"
              value={m.replace}
              onChange={(e) => {
                const next = [...prefs.driverNameMasks];
                next[i] = { ...next[i], replace: e.target.value };
                prefs.setPrefs({ driverNameMasks: next });
              }} />
            <button className="btn-small btn-mask-del"
              onClick={() => {
                const next = prefs.driverNameMasks.filter((_, idx) => idx !== i);
                prefs.setPrefs({ driverNameMasks: next });
              }}>✕</button>
          </div>
        ))}
        <button className="btn-action"
          onClick={() => {
            const next: DriverNameMask[] = [...prefs.driverNameMasks, { pattern: '', replace: '' }];
            prefs.setPrefs({ driverNameMasks: next });
          }}>+ Add mask</button>
      </div>

      {/* Save All */}
      <div className="settings-save-section">
        <button className="btn-save-all" onClick={saveAll}>
          {saveStatus || 'Save All Settings'}
        </button>
        <p className="settings-note">
          Saves API key, Premium flag, TTS, PTT binding, and telemetry port to disk.
        </p>
      </div>
    </div>
  );
}

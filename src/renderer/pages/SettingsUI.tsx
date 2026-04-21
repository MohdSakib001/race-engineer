import React, { useState, useEffect, useCallback } from 'react';
import { useTelemetryContext } from '../context/TelemetryContext';
import { usePushToTalk } from '../hooks/usePushToTalk';
import { clearCache, getStats as getCacheStats } from '../lib/phrase-cache';

import { api } from '../lib/tauri-api';

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

  const [port, setPort] = useState(20777);
  const [apiKey, setApiKey] = useState('');
  const [premium, setPremium] = useState(false);
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
      if (settings.apiKey) setApiKey(settings.apiKey);
      if (typeof settings.premium === 'boolean') setPremium(settings.premium);
      if (settings.tts?.enabled != null) setTtsEnabled(settings.tts.enabled);
      if (settings.tts?.voice) setTtsVoice(settings.tts.voice);
      if (settings.tts?.rate != null) setTtsRate(settings.tts.rate);
      if (settings.telemetryPort) setPort(settings.telemetryPort);
    }).catch(() => {});
    api.getUsage?.().then(setUsage).catch(() => {});
    getCacheStats().then(setCacheStats).catch(() => {});
  }, []);

  const applyApiKey = useCallback(() => {
    if (apiKey.trim()) api.setApiKey(apiKey.trim());
  }, [apiKey]);

  const testVoice = useCallback(() => {
    api.ttsSpeak({ text: 'Box this lap, box this lap. Tyres are ready.', voice: ttsVoice });
  }, [ttsVoice]);

  const handleTrackChange = useCallback((trackId: number) => {
    setManualTrackId(trackId);
    api.setManualTrack(trackId);
  }, []);

  const togglePremium = useCallback(async (enabled: boolean) => {
    setPremium(enabled);
    try { await api.setPremium(enabled); } catch { /* ignore */ }
  }, []);

  const saveAll = useCallback(async () => {
    if (apiKey.trim()) await api.setApiKey(apiKey.trim());
    await api.setPremium(premium);
    const prev: any = (await api.loadSettings?.()) ?? {};
    await api.saveSettings?.({
      ...prev,
      apiKey: apiKey.trim() || undefined,
      premium,
      tts: { enabled: ttsEnabled, voice: ttsVoice, rate: ttsRate },
      telemetryPort: port,
      ptt: { ...(prev.ptt ?? {}), binding: ptt.binding },
    });
    setSaveStatus('Saved!');
    setTimeout(() => setSaveStatus(null), 2000);
  }, [apiKey, premium, ttsEnabled, ttsVoice, ttsRate, port, ptt.binding]);

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
          {/* Premium */}
          <div className="panel">
            <h3 className="panel-title">SUBSCRIPTION</h3>
            <div className="settings-field">
              <label className="toggle-label">
                <input type="checkbox" checked={premium}
                  onChange={e => togglePremium(e.target.checked)} />
                Premium (AI Strategy Calls via Claude Haiku 4.5)
              </label>
            </div>
            <p className="settings-note">
              Free mode uses the offline rule engine only — no API cost. Premium unlocks
              dynamic strategy calls (pit windows, undercuts, weather). Typical full race
              weekend costs under $0.20 in API credits with prompt caching.
            </p>
            {usage && (
              <div className="stat-list" style={{ marginTop: 10 }}>
                <div className="stat-row-item">
                  <span className="stat-label-text">Session cost</span>
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
            )}
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button className="btn-action" onClick={refreshUsage}>Refresh Usage</button>
              <button className="btn-action" onClick={resetUsage}>Reset Counter</button>
            </div>
          </div>

          {/* API Key */}
          <div className="panel">
            <h3 className="panel-title">ANTHROPIC API KEY</h3>
            <div className="settings-field">
              <label>API Key</label>
              <input type="password" className="settings-input" placeholder="sk-ant-..."
                value={apiKey} onChange={e => setApiKey(e.target.value)} />
            </div>
            <button className="btn-action" onClick={applyApiKey} style={{ marginTop: 8 }}>
              Apply Key
            </button>
            <p className="settings-note" style={{ marginTop: 6 }}>
              Required for Premium. Get a key at console.anthropic.com.
            </p>
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

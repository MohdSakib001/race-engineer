import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useTelemetryContext } from '../context/TelemetryContext';
import { useAutoRadio } from '../hooks/useAutoRadio';

const MAX_ERS = 4_000_000;

const COMPOUND_INFO: Record<number, { name: string; color: string }> = {
  16: { name: 'Soft',   color: '#FF3333' },
  17: { name: 'Medium', color: '#FFD700' },
  18: { name: 'Hard',   color: '#CCCCCC' },
  7:  { name: 'Inter',  color: '#39B54A' },
  8:  { name: 'Wet',    color: '#4477FF' },
};

const SC_LABELS: Record<number, string> = {
  0: 'Green', 1: 'Full SC', 2: 'Virtual SC', 3: 'Formation Lap',
};

import { api } from '../lib/tauri-api';

export function Engineer() {
  const ctx = useTelemetryContext();
  const { lapData, playerCarIndex, status, damage, session, participants } = ctx;

  // Settings for TTS (loaded from saved settings)
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsVoice, setTtsVoice] = useState('en-GB-RyanNeural');

  useEffect(() => {
    api?.loadSettings?.()?.then((s: any) => {
      if (s?.tts?.enabled != null) setTtsEnabled(s.tts.enabled);
      if (s?.tts?.voice) setTtsVoice(s.tts.voice);
    }).catch(() => {});
  }, []);

  // Auto-radio — real situation detection wired to telemetry
  const { messages, clearMessages } = useAutoRadio(ctx, ttsEnabled, ttsVoice);

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const playerLap = lapData?.[playerCarIndex];

  // Auto-scroll feed to top when new messages arrive
  useEffect(() => {
    if (feedRef.current && messages.length > 0) {
      feedRef.current.scrollTop = 0;
    }
  }, [messages.length]);

  const sendQuery = useCallback(async () => {
    if (!query.trim() || loading) return;
    const q = query.trim();
    setQuery('');
    setLoading(true);
    setResponse(null);
    try {
      const result = await api?.askEngineer({ question: q, context: {}, mode: 'DRIVER_RADIO' });
      setResponse(result?.error ? `Error: ${result.error}` : result?.response || 'No response');
    } catch (err: any) {
      setResponse(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [query, loading]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuery(); }
  }, [sendQuery]);

  // Proximity data
  const proximity = useMemo(() => {
    if (!playerLap || !lapData) return null;
    const myPos = playerLap.carPosition;
    const carAheadIdx = lapData.findIndex((l) => l?.carPosition === myPos - 1);
    const carBehindIdx = lapData.findIndex((l) => l?.carPosition === myPos + 1);
    const gapAheadMs = playerLap.deltaToCarAheadMs;
    const gapBehindMs = carBehindIdx >= 0 ? lapData[carBehindIdx]?.deltaToCarAheadMs : 0;
    const aheadName = carAheadIdx >= 0 ? participants?.participants?.[carAheadIdx]?.name || `P${myPos - 1}` : null;
    const behindName = carBehindIdx >= 0 ? participants?.participants?.[carBehindIdx]?.name || `P${myPos + 1}` : null;
    const showAhead = aheadName && gapAheadMs > 0 && gapAheadMs < 1200;
    const showBehind = behindName && gapBehindMs > 0 && gapBehindMs < 1000;
    if (!showAhead && !showBehind) return null;
    return {
      aheadName: showAhead ? aheadName : null,
      aheadGap: showAhead ? (gapAheadMs / 1000).toFixed(2) : null,
      behindName: showBehind ? behindName : null,
      behindGap: showBehind ? (gapBehindMs / 1000).toFixed(2) : null,
    };
  }, [playerLap, lapData, participants]);

  // Status strip values
  const compound = status ? COMPOUND_INFO[status.visualTyreCompound] : null;
  const maxWear = damage ? Math.max(...damage.tyresWear.map((w) => Math.round(w))) : 0;
  const ersPct = status ? ((status.ersStoreEnergy / MAX_ERS) * 100).toFixed(0) : '--';
  const fuelLaps = status ? status.fuelRemainingLaps.toFixed(1) : '--';
  const gapAhead = playerLap && playerLap.deltaToCarAheadMs > 0
    ? `${(playerLap.deltaToCarAheadMs / 1000).toFixed(1)}s` : '--';
  const scLabel = session ? SC_LABELS[session.safetyCarStatus] || 'Green' : '--';

  return (
    <div className="engineer-page">
      {/* Header */}
      <div className="engineer-header">
        <h2 className="engineer-title">AI Race Engineer</h2>
        <span className="model-badge">claude-opus-4-6</span>
        <div className="engineer-actions">
          <label className="toggle-label">
            <input type="checkbox" checked={ttsEnabled} onChange={(e) => setTtsEnabled(e.target.checked)} />
            Voice
          </label>
          <button className="btn-small" onClick={clearMessages}>Clear</button>
        </div>
      </div>

      {/* Status Strip */}
      <div className="radio-status-strip">
        <StatusItem label="Position" value={playerLap ? `P${playerLap.carPosition}` : '--'} />
        <StatusItem label="Lap" value={playerLap ? `${playerLap.currentLapNum}/${session?.totalLaps || ''}` : '--'} />
        <StatusItem label="Tyre"
          value={compound ? `${compound.name} (${status?.tyresAgeLaps}L)` : '--'}
          color={compound?.color} />
        <StatusItem label="Wear" value={damage ? `${maxWear}%` : '--'}
          warn={maxWear > 60} critical={maxWear > 80} />
        <StatusItem label="ERS" value={`${ersPct}%`} />
        <StatusItem label="Fuel" value={`${fuelLaps} laps`} />
        <StatusItem label="Gap Ahead" value={gapAhead} />
        <StatusItem label="Flags" value={scLabel} critical={session ? session.safetyCarStatus > 0 : false} />
      </div>

      {/* Proximity Bar */}
      {proximity && (
        <div className="proximity-bar">
          {proximity.aheadName && (
            <span className="prox-rival prox-attack">{proximity.aheadName} +{proximity.aheadGap}s</span>
          )}
          <span className="prox-me">YOU</span>
          {proximity.behindName && (
            <span className="prox-rival prox-defend">{proximity.behindName} -{proximity.behindGap}s</span>
          )}
        </div>
      )}

      {/* Radio Feed */}
      <div className="radio-feed-section">
        <div className="radio-feed-header">
          Team Radio <span className="dim">auto-triggered every 3s</span>
        </div>
        <div className="radio-feed" ref={feedRef}>
          {messages.length === 0 ? (
            <div className="radio-feed-empty">
              No radio messages yet. Situations auto-trigger during the race.
            </div>
          ) : (
            messages.slice().reverse().map((msg, i) => (
              <div key={i} className={`radio-card urgency-${msg.urgency}`}>
                {msg.category && (
                  <div className="radio-card-header">
                    <span className={`radio-tag tag-${msg.category}`}>
                      {msg.category.toUpperCase().replace('_', ' ')}
                    </span>
                    <span className={`radio-urgency urgency-${msg.urgency}`}>
                      {msg.urgency.toUpperCase()}
                    </span>
                    <span className="radio-time">
                      {new Date(msg.timestamp).toLocaleTimeString('en', {
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                      })}
                    </span>
                  </div>
                )}
                <div className="radio-text">{msg.text}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Manual Query */}
      <div className="chat-input-area">
        <div className="chat-input-col">
          <span className="dim" style={{ fontSize: 11 }}>Manual query — ask any tactical question</span>
          <textarea
            className="chat-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Should I box this lap? (Enter to send)"
            rows={2}
          />
        </div>
        <button className="chat-send-btn" onClick={sendQuery} disabled={loading}>
          {loading ? '...' : 'Ask'}
        </button>
      </div>

      {response && (
        <div className="manual-response">
          <div className="radio-card urgency-medium">
            <div className="radio-text">{response}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusItem({ label, value, color, warn, critical }: {
  label: string; value: string; color?: string; warn?: boolean; critical?: boolean;
}) {
  const cls = critical ? 'status-critical' : warn ? 'status-warn' : '';
  return (
    <div className="radio-status-item">
      <span className="radio-status-label">{label}</span>
      <span className={`radio-status-value ${cls}`} style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

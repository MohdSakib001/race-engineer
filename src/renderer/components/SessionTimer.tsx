import React from 'react';
import { useTelemetryContext } from '../context/TelemetryContext';
import { usePrefs } from '../context/PrefsContext';

function formatSecs(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function SessionTimer() {
  const { session, connected } = useTelemetryContext();
  const { showSessionTimer } = usePrefs();
  if (!showSessionTimer || !session || !connected) return null;

  const timeLeft = session.sessionTimeLeft ?? 0;
  const duration = session.sessionDuration ?? 0;
  const elapsed = Math.max(0, duration - timeLeft);

  const warn = timeLeft > 0 && timeLeft < 60;
  return (
    <div className={`session-timer ${warn ? 'session-timer-warn' : ''}`}>
      <span className="session-timer-label">TIME LEFT</span>
      <span className="session-timer-value">{formatSecs(timeLeft)}</span>
      {duration > 0 && (
        <span className="session-timer-elapsed">· Elapsed {formatSecs(elapsed)}</span>
      )}
    </div>
  );
}

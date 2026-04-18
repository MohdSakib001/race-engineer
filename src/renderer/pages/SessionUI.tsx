import React from 'react';
import { useTelemetryContext } from '../context/TelemetryContext';
import type { WeatherForecastSample } from '../../shared/types/packets';

const WEATHER_ICONS: Record<number, string> = {
  0: '☀️', 1: '⛅', 2: '☁️', 3: '🌧️', 4: '🌧️', 5: '⛈️',
};

const WEATHER_NAMES: Record<number, string> = {
  0: 'Clear', 1: 'Light Cloud', 2: 'Overcast', 3: 'Light Rain', 4: 'Heavy Rain', 5: 'Storm',
};

const SC_LABELS: Record<number, string> = {
  0: 'None', 1: 'Full Safety Car', 2: 'Virtual Safety Car', 3: 'Formation Lap',
};

const FORMULAS = ['F1', 'F2', 'F3', 'F1 Classic', 'F2 2021', 'F1 (New)'];

function formatCountdown(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function Session() {
  const { session } = useTelemetryContext();

  if (!session) {
    return (
      <div className="page-empty">
        <h2>SESSION</h2>
        <p>Waiting for session data...</p>
      </div>
    );
  }

  const forecast = session.weatherForecast?.filter(
    (f: WeatherForecastSample) => f.timeOffset > 0
  ).slice(0, 8) ?? [];

  return (
    <div className="session-page">
      <div className="session-hero-panel">
        <div className="session-track-name">{session.trackName || 'Unknown Track'}</div>
        <div className="session-type-label">{session.sessionTypeName || ''}</div>
        <div className="session-countdown">{formatCountdown(session.sessionTimeLeft)}</div>
        <div className="session-laps-label">Total Laps: {session.totalLaps}</div>
      </div>

      <div className="session-grid">
        <div className="panel">
          <h3 className="panel-title">CONDITIONS</h3>
          <div className="stat-list">
            <StatRow label="Weather" value={`${WEATHER_ICONS[session.weather] || ''} ${session.weatherName || WEATHER_NAMES[session.weather] || ''}`} />
            <StatRow label="Track Temp" value={`${session.trackTemperature}°C`} />
            <StatRow label="Air Temp" value={`${session.airTemperature}°C`} />
            <StatRow label="Pit Speed Limit" value={`${session.pitSpeedLimit} km/h`} />
            <StatRow label="Safety Car" value={SC_LABELS[session.safetyCarStatus] || 'None'}
              valueClass={session.safetyCarStatus > 0 ? 'status-warn' : ''} />
          </div>
        </div>

        <div className="panel">
          <h3 className="panel-title">SESSION INFO</h3>
          <div className="stat-list">
            <StatRow label="Track Length" value={`${(session.trackLength / 1000).toFixed(3)} km`} />
            <StatRow label="Total Laps" value={String(session.totalLaps)} />
            <StatRow label="Duration" value={formatCountdown(session.sessionDuration)} />
            <StatRow label="Formula" value={FORMULAS[session.formula] || 'F1'} />
            <StatRow label="Forecast Accuracy" value={session.forecastAccuracy != null ? `${session.forecastAccuracy}%` : '--'} />
          </div>
        </div>
      </div>

      {forecast.length > 0 && (
        <div className="panel" style={{ marginTop: 'var(--gap)' }}>
          <h3 className="panel-title">WEATHER FORECAST</h3>
          <div className="forecast-grid">
            {forecast.map((f: WeatherForecastSample, i: number) => (
              <div key={i} className="forecast-card">
                <div className="forecast-time">+{f.timeOffset} min</div>
                <div className="forecast-icon">{WEATHER_ICONS[f.weather] || '?'}</div>
                <div className="forecast-weather">{WEATHER_NAMES[f.weather] || ''}</div>
                <div className="forecast-temps">
                  <span>Track: {f.trackTemp}°C</span>
                  <span>Air: {f.airTemp}°C</span>
                </div>
                {f.rainPercentage > 0 && (
                  <div className="forecast-rain" style={{
                    color: f.rainPercentage > 50 ? '#dc0000' : f.rainPercentage > 20 ? '#ff8700' : '#ffd700'
                  }}>
                    Rain: {f.rainPercentage}%
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="stat-row-item">
      <span className="stat-label-text">{label}</span>
      <span className={`stat-value-text ${valueClass || ''}`}>{value}</span>
    </div>
  );
}

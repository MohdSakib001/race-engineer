import React from 'react';
import { useTelemetryContext } from '../context/TelemetryContext';
import { usePrefs } from '../context/PrefsContext';
import { SessionType } from '../../shared/types/packets';

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

/**
 * Shows during race formation/pre-start. Visualizes live RPM vs target band
 * and live throttle vs target %. Uses CarTelemetry.engineRPM and .throttle.
 */
export function LaunchGuide() {
  const { telemetry, status, session, lapData, playerCarIndex } = useTelemetryContext();
  const {
    launchTargetRpmMin, launchTargetRpmMax, launchTargetThrottle, setPrefs,
  } = usePrefs();

  // Only show in Race sessions before the driver has completed lap 1
  const isRace = session?.sessionType === SessionType.Race
              || session?.sessionType === SessionType.Race2
              || session?.sessionType === SessionType.Race3;
  const playerLap = lapData?.[playerCarIndex];
  const inFirstLap = (playerLap?.currentLapNum ?? 0) <= 1;
  if (!isRace || !inFirstLap || !telemetry || !status) return null;

  const maxRpm = status.maxRPM || 13000;
  const rpm = telemetry.engineRPM;
  const throttle = telemetry.throttle;

  const inRpmBand = rpm >= launchTargetRpmMin && rpm <= launchTargetRpmMax;
  const throttleDelta = Math.abs(throttle - launchTargetThrottle);
  const inThrottleBand = throttleDelta < 0.05;

  const rpmPct = clamp((rpm / maxRpm) * 100, 0, 100);
  const rpmMinPct = clamp((launchTargetRpmMin / maxRpm) * 100, 0, 100);
  const rpmMaxPct = clamp((launchTargetRpmMax / maxRpm) * 100, 0, 100);

  return (
    <div className="panel launch-guide">
      <div className="launch-header">
        <h3 className="panel-title">OPTIMAL LAUNCH</h3>
        {inRpmBand && inThrottleBand && (
          <span className="launch-ok">✓ READY</span>
        )}
      </div>

      <div className="launch-row">
        <span className="launch-label">RPM</span>
        <div className="launch-bar">
          <div className="launch-bar-target"
            style={{ left: `${rpmMinPct}%`, width: `${rpmMaxPct - rpmMinPct}%` }} />
          <div className="launch-bar-fill"
            style={{
              width: `${rpmPct}%`,
              background: inRpmBand ? '#39b54a' : rpm < launchTargetRpmMin ? '#ffd700' : '#dc0000',
            }} />
        </div>
        <span className="launch-val">{rpm.toLocaleString()}</span>
      </div>

      <div className="launch-row">
        <span className="launch-label">Throttle</span>
        <div className="launch-bar">
          <div className="launch-bar-target"
            style={{ left: `${(launchTargetThrottle - 0.04) * 100}%`, width: '8%' }} />
          <div className="launch-bar-fill"
            style={{
              width: `${throttle * 100}%`,
              background: inThrottleBand ? '#39b54a' : '#ff8700',
            }} />
        </div>
        <span className="launch-val">{(throttle * 100).toFixed(0)}%</span>
      </div>

      <div className="launch-targets">
        <label>
          RPM band
          <input type="number" className="settings-input launch-input"
            value={launchTargetRpmMin}
            onChange={(e) => setPrefs({ launchTargetRpmMin: parseInt(e.target.value) || 10500 })} />
          –
          <input type="number" className="settings-input launch-input"
            value={launchTargetRpmMax}
            onChange={(e) => setPrefs({ launchTargetRpmMax: parseInt(e.target.value) || 11500 })} />
        </label>
        <label>
          Throttle % target
          <input type="number" className="settings-input launch-input"
            min={10} max={100}
            value={Math.round(launchTargetThrottle * 100)}
            onChange={(e) => setPrefs({ launchTargetThrottle: clamp(parseInt(e.target.value) / 100, 0.1, 1) })} />
        </label>
      </div>
    </div>
  );
}

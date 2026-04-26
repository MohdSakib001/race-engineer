import React, { useMemo } from 'react';
import { useTelemetryContext } from '../context/TelemetryContext';
import { usePrefs } from '../context/PrefsContext';
import { useLapHistory } from '../hooks/useLapHistory';

const TYRE_LABELS = ['RL', 'RR', 'FL', 'FR'] as const;
const DISPLAY_ORDER = [2, 3, 0, 1]; // FL, FR, RL, RR

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

export function TyreLifeEstimator() {
  const ctx = useTelemetryContext();
  const { tyreWearTargetPct, setPrefs } = usePrefs();
  const { completedLaps } = useLapHistory(ctx);

  const { damage, status } = ctx;

  const wearRatesPerLap = useMemo(() => {
    // Use last N full laps on current tyre set to estimate per-tyre wear rate
    const N = 5;
    const valid = completedLaps
      .filter((l) => l.tyreWearEndPct && !l.pitLap && l.lapTimeMs > 0)
      .slice(-N);
    if (valid.length < 2) return null;
    const first = valid[0].tyreWearEndPct!;
    const last  = valid[valid.length - 1].tyreWearEndPct!;
    const laps = valid.length - 1;
    return [0,1,2,3].map((i) => Math.max(0, (last[i] - first[i]) / Math.max(1, laps)));
  }, [completedLaps]);

  const rateFallback = useMemo(() => {
    if (!damage || !status || !status.tyresAgeLaps || status.tyresAgeLaps < 1) return null;
    return [0,1,2,3].map((i) => damage.tyresWear[i] / status.tyresAgeLaps);
  }, [damage, status]);

  const rates = wearRatesPerLap ?? rateFallback;

  return (
    <div className="panel">
      <h3 className="panel-title">TYRE LIFE ESTIMATOR</h3>

      <div className="tyrelife-target-row">
        <label>Target wear: {tyreWearTargetPct}%</label>
        <input type="range" min={20} max={95} step={1}
          value={tyreWearTargetPct}
          onChange={(e) => setPrefs({ tyreWearTargetPct: parseInt(e.target.value) })} />
      </div>

      {!damage || !rates ? (
        <p className="settings-note">Waiting for wear data...</p>
      ) : (
        <div className="tyrelife-grid">
          {DISPLAY_ORDER.map((idx) => {
            const current = damage.tyresWear[idx] ?? 0;
            const rate = rates[idx] ?? 0;
            const lapsLeft = rate > 0 ? (tyreWearTargetPct - current) / rate : null;
            let state: 'safe' | 'watch' | 'crit' = 'safe';
            if (lapsLeft == null || lapsLeft <= 0) state = 'crit';
            else if (lapsLeft < 3) state = 'crit';
            else if (lapsLeft < 8) state = 'watch';
            return (
              <div key={idx} className={`tyrelife-cell tyrelife-${state}`}>
                <div className="tyrelife-label">{TYRE_LABELS[idx]}</div>
                <div className="tyrelife-wear">{current.toFixed(1)}%</div>
                <div className="tyrelife-rate">{rate.toFixed(2)}%/lap</div>
                <div className="tyrelife-laps">
                  {lapsLeft == null
                    ? '—'
                    : lapsLeft <= 0
                    ? 'OVER'
                    : `${Math.floor(lapsLeft)} laps left`}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="settings-note" style={{ marginTop: 8 }}>
        Wear rate uses the last 5 completed laps on this tyre set, falling back to average since fit.
      </p>
    </div>
  );
}

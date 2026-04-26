import React, { useEffect } from 'react';
import { useTelemetryContext } from '../context/TelemetryContext';
import { usePrefs } from '../context/PrefsContext';
import { applyNameMasks } from '../lib/name-mask';

const COMPOUND_BADGE: Record<number, { label: string; color: string }> = {
  16: { label: 'S', color: '#FF3333' },
  17: { label: 'M', color: '#FFD700' },
  18: { label: 'H', color: '#CCCCCC' },
  7:  { label: 'I', color: '#39B54A' },
  8:  { label: 'W', color: '#4477FF' },
};

function fmt(ms: number): string {
  if (!ms || ms <= 0) return '--:--.---';
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${mins}:${secs.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

function sec(ms: number): string {
  if (!ms || ms <= 0) return '--';
  return (ms / 1000).toFixed(3);
}

interface Props {
  carIdx: number;
  onClose: () => void;
}

export function DriverDetailModal({ carIdx, onClose }: Props) {
  const {
    participants, lapData, allCarStatus, allCarDamage,
    bestLapTimes, driverHistories, rivalCarIndex, setRival,
  } = useTelemetryContext();
  const { driverNameMasks } = usePrefs();

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const p = participants?.participants?.[carIdx];
  const lap = lapData?.[carIdx];
  const sts = allCarStatus?.[carIdx];
  const dmg = allCarDamage?.[carIdx];
  const name = applyNameMasks(p?.name || `Car ${carIdx + 1}`, driverNameMasks);
  const laps = driverHistories?.[carIdx] ?? [];
  const bestMs = bestLapTimes[carIdx] ?? 0;
  const compound = sts?.visualTyreCompound;
  const compInfo = compound != null ? COMPOUND_BADGE[compound] : null;
  const isRival = rivalCarIndex === carIdx;

  const penalties = lap?.penalties ?? 0;
  const warnings = lap?.totalWarnings ?? 0;
  const cornerCuts = lap?.cornerCuttingWarnings ?? 0;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">{name}</h2>
            <div className="modal-subtitle">
              P{lap?.carPosition ?? '-'} · {p?.aiControlled ? 'AI' : 'Human'}
              {p?.raceNumber != null && ` · #${p.raceNumber}`}
            </div>
          </div>
          <div className="modal-actions">
            <button
              className={`btn-small ${isRival ? 'btn-rival-active' : ''}`}
              onClick={() => setRival(isRival ? null : carIdx)}
            >
              {isRival ? '★ Rival' : 'Set as Rival'}
            </button>
            <button className="btn-small" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="modal-grid">
          <div className="panel">
            <h3 className="panel-title">SESSION</h3>
            <div className="stat-list">
              <Row label="Best Lap" value={bestMs > 0 ? fmt(bestMs) : '--'} />
              <Row label="Last Lap" value={fmt(lap?.lastLapTimeMs ?? 0)} />
              <Row label="Current" value={fmt(lap?.currentLapTimeMs ?? 0)} />
              <Row label="S1" value={sec(lap?.sector1TimeMs ?? 0)} />
              <Row label="S2" value={sec(lap?.sector2TimeMs ?? 0)} />
              <Row label="Lap #" value={String(lap?.currentLapNum ?? '-')} />
              <Row label="Pit Stops" value={String(lap?.numPitStops ?? 0)} />
            </div>
          </div>

          <div className="panel">
            <h3 className="panel-title">CAR</h3>
            <div className="stat-list">
              <Row label="Tyre" value={compInfo?.label ?? '?'} color={compInfo?.color} />
              <Row label="Tyre Age" value={sts ? `${sts.tyresAgeLaps} laps` : '--'} />
              <Row label="ERS" value={sts ? `${(sts.ersStoreEnergy / 1e6).toFixed(2)} MJ` : '--'} />
              <Row label="Fuel" value={sts ? `${sts.fuelInTank.toFixed(1)} kg` : '--'} />
              <Row label="FW Left" value={dmg ? `${dmg.frontLeftWingDamage}%` : '--'} />
              <Row label="FW Right" value={dmg ? `${dmg.frontRightWingDamage}%` : '--'} />
              <Row label="Rear Wing" value={dmg ? `${dmg.rearWingDamage}%` : '--'} />
            </div>
          </div>

          <div className="panel">
            <h3 className="panel-title">PENALTIES</h3>
            <div className="stat-list">
              <Row label="Pen (s)" value={`${penalties}s`}
                color={penalties > 0 ? '#ff8700' : undefined} />
              <Row label="Warnings" value={String(warnings)}
                color={warnings >= 3 ? '#dc0000' : warnings > 0 ? '#ffd700' : undefined} />
              <Row label="Corner Cuts" value={String(cornerCuts)} />
              <Row label="Unserved DT" value={String(lap?.numUnservedDriveThroughPens ?? 0)} />
              <Row label="Unserved SG" value={String(lap?.numUnservedStopGoPens ?? 0)} />
            </div>
          </div>
        </div>

        <div className="panel modal-laps">
          <h3 className="panel-title">LAP HISTORY ({laps.length})</h3>
          {laps.length === 0 ? (
            <div className="page-empty-inline">No lap history yet for this driver.</div>
          ) : (
            <div className="laphistory-table-wrap">
              <table className="timing-table">
                <thead>
                  <tr>
                    <th>Lap</th>
                    <th className="right">Time</th>
                    <th className="right">S1</th>
                    <th className="right">S2</th>
                    <th className="right">S3</th>
                    <th className="center">Valid</th>
                  </tr>
                </thead>
                <tbody>
                  {[...laps].reverse().map((l) => {
                    const valid = (l.validFlags & 0x01) === 1;
                    return (
                      <tr key={l.lapNumber} className={!valid ? 'invalid-row' : ''}>
                        <td className="pos-cell">{l.lapNumber}</td>
                        <td className="right lap-time">{fmt(l.lapTimeMs)}</td>
                        <td className="right sector-time">{sec(l.sector1TimeMs)}</td>
                        <td className="right sector-time">{sec(l.sector2TimeMs)}</td>
                        <td className="right sector-time">{sec(l.sector3TimeMs)}</td>
                        <td className="center">
                          {valid
                            ? <span className="status-badge finished">OK</span>
                            : <span className="status-badge">INV</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="stat-row-item">
      <span className="stat-label-text">{label}</span>
      <span className="stat-value-text" style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

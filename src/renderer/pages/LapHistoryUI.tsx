import React, { useMemo } from 'react';
import { useTelemetryContext } from '../context/TelemetryContext';
import { useLapHistory } from '../hooks/useLapHistory';

const COMPOUND_LABELS: Record<number, { label: string; color: string }> = {
  16: { label: 'S', color: '#FF3333' },
  17: { label: 'M', color: '#FFD700' },
  18: { label: 'H', color: '#CCCCCC' },
  7:  { label: 'I', color: '#39B54A' },
  8:  { label: 'W', color: '#4477FF' },
};

function formatTime(ms: number): string {
  if (!ms || ms <= 0) return '--:--.---';
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${mins}:${secs.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

function formatSector(ms: number): string {
  if (!ms || ms <= 0) return '--';
  return (ms / 1000).toFixed(3);
}

function formatDelta(ms: number): string {
  const s = ms / 1000;
  return `${s >= 0 ? '+' : ''}${s.toFixed(3)}s`;
}

export function LapHistory() {
  const ctx = useTelemetryContext();
  const { completedLaps, bestLapMs } = useLapHistory(ctx);

  const playerLap = ctx.lapData[ctx.playerCarIndex];
  const playerName = ctx.participants?.participants?.[ctx.playerCarIndex]?.name || 'Player';

  const validLaps = useMemo(
    () => completedLaps.filter((l) => !l.invalid && !l.pitLap && l.lapTimeMs > 0),
    [completedLaps]
  );

  const avgMs = useMemo(
    () => validLaps.length
      ? Math.round(validLaps.reduce((s, l) => s + l.lapTimeMs, 0) / validLaps.length)
      : null,
    [validLaps]
  );

  const totalMs = useMemo(
    () => completedLaps.reduce((s, l) => s + (l.lapTimeMs || 0), 0),
    [completedLaps]
  );

  return (
    <div className="laphistory-page">
      {/* Summary chips */}
      <div className="laphistory-summary">
        <SummaryChip label="Driver" value={playerName} />
        <SummaryChip label="Track" value={ctx.session?.trackName || '--'} />
        <SummaryChip
          label="Status"
          value={ctx.connected
            ? `Live — Lap ${playerLap?.currentLapNum ?? '--'}`
            : 'Offline'}
        />
        <SummaryChip label="Completed" value={String(completedLaps.length)} />
        <SummaryChip label="Best Lap" value={bestLapMs ? formatTime(bestLapMs) : '--'} />
        <SummaryChip label="Average" value={avgMs ? formatTime(avgMs) : '--'} />
        <SummaryChip label="Total Time" value={totalMs > 0 ? formatTime(totalMs) : '--'} />
      </div>

      {/* Lap table */}
      <div className="panel laphistory-table-panel">
        <h3 className="panel-title">LAP TIMES</h3>
        <div className="laphistory-table-wrap">
          <table className="timing-table">
            <thead>
              <tr>
                <th>Lap</th>
                <th className="right">Time</th>
                <th className="right">Delta</th>
                <th className="right">S1</th>
                <th className="right">S2</th>
                <th className="right">S3</th>
                <th className="center">Tyre</th>
                <th className="center">Age</th>
                <th className="center">Pit</th>
                <th className="center">Invalid</th>
                <th className="right">Completed</th>
              </tr>
            </thead>
            <tbody>
              {completedLaps.length === 0 ? (
                <tr>
                  <td colSpan={11}>
                    <div className="page-empty-inline">Waiting for completed laps...</div>
                  </td>
                </tr>
              ) : (
                [...completedLaps].reverse().map((lap) => {
                  const deltaMs = bestLapMs != null ? lap.lapTimeMs - bestLapMs : null;
                  const compound = lap.tyreCompound != null ? COMPOUND_LABELS[lap.tyreCompound] : null;
                  const completedAt = new Date(lap.completedAt).toLocaleTimeString([], {
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                  });
                  const isBest = bestLapMs != null && lap.lapTimeMs === bestLapMs && !lap.invalid && !lap.pitLap;

                  return (
                    <tr key={lap.lapNumber} className={isBest ? 'fastest-row' : lap.invalid ? 'invalid-row' : ''}>
                      <td className="pos-cell">{lap.lapNumber}</td>
                      <td className={`right lap-time ${isBest ? 'lap-fastest' : ''}`}>
                        {formatTime(lap.lapTimeMs)}
                      </td>
                      <td className={`right gap-time ${deltaMs != null && deltaMs <= 0 ? 'lap-fastest' : ''}`}>
                        {deltaMs != null ? formatDelta(deltaMs) : '--'}
                      </td>
                      <td className="right sector-time">{formatSector(lap.sector1TimeMs)}</td>
                      <td className="right sector-time">{formatSector(lap.sector2TimeMs)}</td>
                      <td className="right sector-time">{formatSector(lap.sector3TimeMs)}</td>
                      <td className="center">
                        {compound ? (
                          <span className="tyre-badge" style={{ color: compound.color, borderColor: compound.color }}>
                            {compound.label}
                          </span>
                        ) : '--'}
                      </td>
                      <td className="center dim">{lap.tyreAgeLaps}</td>
                      <td className="center">
                        {lap.pitLap
                          ? <span className="pit-badge in-lane">YES</span>
                          : <span className="pit-badge">NO</span>}
                      </td>
                      <td className="center">
                        {lap.invalid
                          ? <span className="status-badge">INV</span>
                          : <span className="status-badge finished">OK</span>}
                      </td>
                      <td className="right dim">{completedAt}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="laphistory-chip">
      <span className="laphistory-chip-label">{label}</span>
      <span className="laphistory-chip-value">{value}</span>
    </div>
  );
}

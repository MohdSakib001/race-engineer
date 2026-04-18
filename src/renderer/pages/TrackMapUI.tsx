import React, { useRef, useEffect, useMemo } from 'react';
import { useTelemetryContext } from '../context/TelemetryContext';
import CIRCUITS from '../../circuits.js';

const MAX_ERS = 4_000_000;

const TEAM_COLORS: Record<number, string> = {
  0: '#00D2BE', 1: '#DC0000', 2: '#0600EF', 3: '#FF8700', 4: '#006F62',
  5: '#0090FF', 6: '#2B4562', 7: '#B6BABD', 8: '#52E252', 9: '#27F4D2',
  85: '#6692FF', 86: '#FF98A8', 88: '#FF5733', 89: '#C70D3A',
  104: '#FF8700', 143: '#52E252',
};

function teamColor(id: number): string { return TEAM_COLORS[id] || '#888'; }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

export function TrackMap() {
  const {
    session, lapData, participants, allCarStatus, status, playerCarIndex,
  } = useTelemetryContext();

  const svgRef = useRef<HTMLDivElement>(null);

  const sortedCars = useMemo(() => {
    if (!lapData || lapData.length === 0) return [];
    return lapData
      .map((lap, idx) => ({ lap, idx }))
      .filter(c => c.lap && c.lap.resultStatus >= 2)
      .sort((a, b) => (a.lap.carPosition || 999) - (b.lap.carPosition || 999));
  }, [lapData]);

  // Render SVG car dots
  useEffect(() => {
    if (!svgRef.current || !session || !lapData || lapData.length === 0) return;

    const circuit = (CIRCUITS as any)[session.trackId];

    if (!circuit) {
      svgRef.current.innerHTML = '<div class="trackmap-no-data">No circuit map available for this track</div>';
      return;
    }

    let svg = svgRef.current.querySelector('svg');
    if (!svg || svg.dataset.trackId !== String(session.trackId)) {
      svgRef.current.innerHTML = '';
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', circuit.viewBox);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.dataset.trackId = String(session.trackId);

      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      bg.setAttribute('d', circuit.path);
      bg.setAttribute('stroke', '#2a2a4a');
      bg.setAttribute('stroke-width', '12');
      bg.setAttribute('fill', 'none');
      bg.setAttribute('stroke-linecap', 'round');
      bg.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(bg);

      const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      overlay.setAttribute('d', circuit.path);
      overlay.setAttribute('stroke', '#3a3a5a');
      overlay.setAttribute('stroke-width', '8');
      overlay.setAttribute('fill', 'none');
      overlay.setAttribute('stroke-linecap', 'round');
      overlay.setAttribute('stroke-linejoin', 'round');
      overlay.id = 'track-path-ref';
      svg.appendChild(overlay);

      svgRef.current.appendChild(svg);
    }

    const pathEl = svg.querySelector('#track-path-ref') as SVGPathElement | null;
    if (!pathEl) return;
    const totalLen = pathEl.getTotalLength();
    const trackLen = session.trackLength || 1;

    // Remove old dots
    svg.querySelectorAll('.car-dot, .car-label').forEach(n => n.remove());

    // Draw car dots
    const visibleCars = lapData
      .map((lap, idx) => ({ lap, idx }))
      .filter(c => c.lap && c.lap.resultStatus >= 2 && c.lap.driverStatus >= 1);

    visibleCars.forEach(({ lap, idx }) => {
      let dist = Number.isFinite(lap.lapDistance) ? lap.lapDistance : lap.totalDistance;
      if (!Number.isFinite(dist)) dist = 0;
      let norm = dist % trackLen;
      if (norm < 0) norm += trackLen;
      const progress = clamp(norm / trackLen, 0, 1);
      const pt = pathEl.getPointAtLength(progress * totalLen);

      const p = participants?.participants?.[idx];
      const color = teamColor(p?.teamId ?? -1);
      const isPlayer = idx === playerCarIndex;

      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', String(pt.x));
      dot.setAttribute('cy', String(pt.y));
      dot.setAttribute('r', isPlayer ? '6' : '4');
      dot.setAttribute('fill', color);
      dot.setAttribute('stroke', isPlayer ? '#fff' : 'none');
      dot.setAttribute('stroke-width', isPlayer ? '2' : '0');
      dot.classList.add('car-dot');
      svg!.appendChild(dot);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(pt.x));
      label.setAttribute('y', String(pt.y - 10));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', '#e0e0e8');
      label.setAttribute('font-size', '8');
      label.setAttribute('font-weight', '700');
      label.classList.add('car-label');
      label.textContent = String(lap.carPosition);
      svg!.appendChild(label);
    });
  }, [session, lapData, participants, playerCarIndex]);

  if (!session) {
    return (
      <div className="page-empty">
        <h2>TRACK MAP</h2>
        <p>Waiting for session data...</p>
      </div>
    );
  }

  const ersPct = status ? clamp((status.ersStoreEnergy / MAX_ERS) * 100, 0, 100) : 0;
  const ersMJ = status ? (status.ersStoreEnergy / 1e6).toFixed(2) : '--';

  return (
    <div className="trackmap-layout">
      <div className="trackmap-main-area">
        <div className="trackmap-header">
          <h3 className="panel-title">TRACK MAP — {session.trackName || 'Unknown'}</h3>
        </div>
        <div className="trackmap-svg-container" ref={svgRef}>
          <div className="trackmap-no-data">Loading circuit...</div>
        </div>
      </div>

      <div className="trackmap-sidebar">
        <div className="panel">
          <h3 className="panel-title">YOUR BATTERY</h3>
          <div className="stat-list">
            <div className="stat-row-item">
              <span className="stat-label-text">ERS Store</span>
              <span className="stat-value-text">{ersMJ} MJ</span>
            </div>
            <div className="stat-row-item">
              <span className="stat-label-text">Battery %</span>
              <span className="stat-value-text">{ersPct.toFixed(1)}%</span>
            </div>
          </div>
          <div className="ers-bar-outer">
            <div className="ers-bar-inner" style={{ width: `${ersPct}%`, backgroundColor: '#00d2be' }} />
          </div>
        </div>

        <div className="panel">
          <h3 className="panel-title">CARS ON TRACK</h3>
          <div className="trackmap-car-list">
            {sortedCars.map(({ lap, idx }) => {
              const p = participants?.participants?.[idx];
              const color = teamColor(p?.teamId ?? -1);
              const name = p?.name || `Car ${idx + 1}`;
              const isPlayer = idx === playerCarIndex;
              const sts = allCarStatus?.[idx];
              const carErsMJ = sts ? (sts.ersStoreEnergy / 1e6).toFixed(2) : '--';
              const gapStr = lap.carPosition === 1 ? 'Leader'
                : lap.deltaToLeaderMs > 0 ? `+${(lap.deltaToLeaderMs / 1000).toFixed(1)}s` : '';

              return (
                <div key={idx} className={`trackmap-car-item ${isPlayer ? 'player' : ''}`}>
                  <span className="trackmap-car-pos">{lap.carPosition || '-'}</span>
                  <span className="trackmap-car-dot-sm" style={{ background: color }} />
                  <div className="trackmap-car-info">
                    <span className="trackmap-car-name">{name}</span>
                    <div className="trackmap-car-sub-row">
                      <span>{carErsMJ} MJ</span>
                      <span>{gapStr}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

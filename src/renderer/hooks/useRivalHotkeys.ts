import { useEffect } from 'react';
import { useTelemetryContext } from '../context/TelemetryContext';

/**
 * Global rival cycling: `[` previous, `]` next, `\` clear.
 * Skips if typing in input/textarea.
 */
export function useRivalHotkeys() {
  const { lapData, playerCarIndex, rivalCarIndex, setRival } = useTelemetryContext();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement | null)?.isContentEditable) return;
      if (e.key !== '[' && e.key !== ']' && e.key !== '\\') return;

      const ranked = (lapData || [])
        .map((lap, idx) => ({ lap, idx }))
        .filter((c) => c.lap && c.lap.resultStatus >= 2 && c.idx !== playerCarIndex)
        .sort((a, b) => (a.lap.carPosition || 999) - (b.lap.carPosition || 999))
        .map((c) => c.idx);

      if (ranked.length === 0) return;

      if (e.key === '\\') { setRival(null); return; }

      const curPos = rivalCarIndex != null ? ranked.indexOf(rivalCarIndex) : -1;
      let next: number;
      if (e.key === ']') next = curPos < 0 ? 0 : (curPos + 1) % ranked.length;
      else               next = curPos < 0 ? ranked.length - 1 : (curPos - 1 + ranked.length) % ranked.length;
      setRival(ranked[next]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lapData, playerCarIndex, rivalCarIndex, setRival]);
}

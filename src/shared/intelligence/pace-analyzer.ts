/**
 * Pace Analysis Engine
 *
 * Tracks sector times across all cars to identify the session's
 * "ultimate best" (purple) sectors and compares the player's
 * current performance against them.
 *
 * Provides suggestions on where time is being lost.
 */

import type { LapData, CarTelemetry } from '../types/packets';
import type { PurpleSectors, PaceAnalysis, SectorTime } from '../types/store';

const TRACK_SECTORS: Record<number, string[]> = {
  // trackId -> corner names per sector (simplified)
  0:  ['T1-T5', 'T6-T10', 'T11-T14'],    // Melbourne
  3:  ['T1-T4', 'T5-T10', 'T11-T15'],     // Bahrain
  5:  ['Ste Devote-Casino', 'Mirabeau-Piscine', 'Rascasse-Anthony Noghes'], // Monaco
  7:  ['Copse-Maggotts', 'Becketts-Stowe', 'Club-Abbey'],   // Silverstone
  10: ['La Source-Rivage', 'Pouhon-Stavelot', 'Blanchimont-Bus Stop'], // Spa
  11: ['Variante del Rettifilo', 'Lesmos-Ascari', 'Parabolica'], // Monza
  13: ['T1-T6', 'Degner-Spoon', '130R-Casio'],  // Suzuka
  14: ['T1-T3', 'T4-T11', 'T12-T21'],     // Abu Dhabi
};

export class PaceAnalyzer {
  private purpleSectors: PurpleSectors = {
    sector1Ms: Infinity,
    sector2Ms: Infinity,
    sector3Ms: Infinity,
    sector1CarIdx: -1,
    sector2CarIdx: -1,
    sector3CarIdx: -1,
  };

  private personalBestLap: SectorTime | null = null;
  private lastLapSectors: Map<number, SectorTime> = new Map();

  /** Reset for new session */
  reset(): void {
    this.purpleSectors = {
      sector1Ms: Infinity,
      sector2Ms: Infinity,
      sector3Ms: Infinity,
      sector1CarIdx: -1,
      sector2CarIdx: -1,
      sector3CarIdx: -1,
    };
    this.personalBestLap = null;
    this.lastLapSectors.clear();
  }

  /** Process lap data for all cars to update purple sectors */
  processLapData(lapData: LapData[], playerCarIndex: number): void {
    for (let i = 0; i < lapData.length; i++) {
      const car = lapData[i];
      if (!car || car.resultStatus < 2) continue; // Skip inactive

      // Only process completed sectors
      if (car.sector1TimeMs > 0 && car.sector1TimeMs < this.purpleSectors.sector1Ms) {
        this.purpleSectors.sector1Ms = car.sector1TimeMs;
        this.purpleSectors.sector1CarIdx = i;
      }
      if (car.sector2TimeMs > 0 && car.sector2TimeMs < this.purpleSectors.sector2Ms) {
        this.purpleSectors.sector2Ms = car.sector2TimeMs;
        this.purpleSectors.sector2CarIdx = i;
      }

      // Derive sector 3 from last lap time
      if (car.lastLapTimeMs > 0 && car.sector1TimeMs > 0 && car.sector2TimeMs > 0) {
        const s3 = car.lastLapTimeMs - car.sector1TimeMs - car.sector2TimeMs;
        if (s3 > 0) {
          const sectors: SectorTime = {
            sector1Ms: car.sector1TimeMs,
            sector2Ms: car.sector2TimeMs,
            sector3Ms: s3,
          };
          this.lastLapSectors.set(i, sectors);

          if (s3 < this.purpleSectors.sector3Ms) {
            this.purpleSectors.sector3Ms = s3;
            this.purpleSectors.sector3CarIdx = i;
          }

          // Update personal best
          if (i === playerCarIndex) {
            if (!this.personalBestLap || car.lastLapTimeMs < this.getLapTime(this.personalBestLap)) {
              this.personalBestLap = sectors;
            }
          }
        }
      }
    }
  }

  /** Get pace analysis for the player */
  analyze(playerCarIndex: number, trackId: number): PaceAnalysis {
    const playerSectors = this.lastLapSectors.get(playerCarIndex) ?? null;
    const sectorNames = TRACK_SECTORS[trackId] ?? ['S1', 'S2', 'S3'];

    let deltaToUltimate: SectorTime | null = null;
    let suggestion: string | null = null;

    if (playerSectors && this.purpleSectors.sector1Ms < Infinity) {
      deltaToUltimate = {
        sector1Ms: playerSectors.sector1Ms - this.purpleSectors.sector1Ms,
        sector2Ms: playerSectors.sector2Ms - this.purpleSectors.sector2Ms,
        sector3Ms: playerSectors.sector3Ms - this.purpleSectors.sector3Ms,
      };

      // Find worst sector
      const deltas = [deltaToUltimate.sector1Ms, deltaToUltimate.sector2Ms, deltaToUltimate.sector3Ms];
      const worstIdx = deltas.indexOf(Math.max(...deltas));
      const worstDelta = deltas[worstIdx];

      if (worstDelta > 200) {
        suggestion = `Losing ${(worstDelta / 1000).toFixed(2)}s in ${sectorNames[worstIdx]} — check braking points and apex timing`;
      } else if (worstDelta > 100) {
        suggestion = `Minor time loss in ${sectorNames[worstIdx]} (+${(worstDelta / 1000).toFixed(2)}s) — tighten exit speed`;
      }
    }

    return {
      ultimateBest: { ...this.purpleSectors },
      personalBest: this.personalBestLap ? { ...this.personalBestLap } : null,
      currentLap: playerSectors,
      deltaToUltimate,
      suggestion,
    };
  }

  private getLapTime(s: SectorTime): number {
    return s.sector1Ms + s.sector2Ms + s.sector3Ms;
  }
}

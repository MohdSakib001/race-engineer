/**
 * Strategy Engine
 *
 * Handles pit strategy calculations including:
 * - Virtual pit exit position (rejoin ghost)
 * - Stint history tracking
 * - Optimal pit window based on wear + gaps
 */

import type { LapData, CarStatus, SessionData } from '../types/packets';
import type { StintData, PitStrategy } from '../types/store';

const PIT_STOP_TIME_SECONDS = 22; // Average F1 pit stop (in-lane + stationary + out-lane)

export class StrategyEngine {
  private stints: StintData[] = [];
  private currentStintStart: number = 1;
  private currentCompound: number = -1;
  private lapTimes: number[] = [];

  /** Reset for new session */
  reset(): void {
    this.stints = [];
    this.currentStintStart = 1;
    this.currentCompound = -1;
    this.lapTimes = [];
  }

  /** Track stint changes */
  onLapComplete(lap: number, lapTimeMs: number, compound: number, avgWear: number): void {
    if (compound !== this.currentCompound && this.currentCompound !== -1) {
      // Pit stop detected — close current stint
      this.stints.push({
        compound: this.currentCompound,
        startLap: this.currentStintStart,
        endLap: lap - 1,
        avgWear,
        avgPace: this.getAvgPace(),
        laps: lap - 1 - this.currentStintStart + 1,
      });
      this.currentStintStart = lap;
      this.lapTimes = [];
    }

    this.currentCompound = compound;
    if (lapTimeMs > 0 && lapTimeMs < 300_000) { // Sanity check
      this.lapTimes.push(lapTimeMs);
    }
  }

  /**
   * Calculate virtual pit exit position.
   *
   * Simulates: "If I pit right now, where will I rejoin?"
   * Uses current gaps + estimated pit loss time.
   */
  calculatePitRejoin(
    playerLap: LapData,
    allLaps: LapData[],
    playerIdx: number,
    session: SessionData,
  ): PitStrategy {
    const pitLossMs = PIT_STOP_TIME_SECONDS * 1000;
    const playerPos = playerLap.carPosition;

    // Calculate where we'd rejoin
    let rejoinPosition = playerPos;
    let rejoinGap: number | null = null;

    // Accumulate gaps behind us
    let accumulatedGap = 0;
    const sortedByPosition = allLaps
      .map((lap, idx) => ({ lap, idx }))
      .filter((entry) => entry.lap && entry.lap.resultStatus >= 2 && entry.idx !== playerIdx)
      .sort((a, b) => a.lap.carPosition - b.lap.carPosition);

    for (const { lap } of sortedByPosition) {
      if (lap.carPosition > playerPos) {
        // Car behind us — check if pit loss would put us behind them
        accumulatedGap += lap.deltaToCarAheadMs;
        if (accumulatedGap < pitLossMs) {
          rejoinPosition = lap.carPosition;
          rejoinGap = (pitLossMs - accumulatedGap) / 1000;
        } else {
          break;
        }
      }
    }

    return {
      idealLap: session.pitStopWindowIdealLap,
      latestLap: session.pitStopWindowLatestLap,
      rejoinPosition,
      rejoinGap,
      reason: rejoinPosition > playerPos
        ? `Pit now → rejoin P${rejoinPosition} (${rejoinGap?.toFixed(1)}s behind)`
        : 'Pit now → rejoin in same position (clear air)',
    };
  }

  /** Get completed stints */
  getStints(): StintData[] {
    return [...this.stints];
  }

  /** Get current stint data */
  getCurrentStint(currentLap: number, avgWear: number): StintData {
    return {
      compound: this.currentCompound,
      startLap: this.currentStintStart,
      endLap: null,
      avgWear,
      avgPace: this.getAvgPace(),
      laps: currentLap - this.currentStintStart + 1,
    };
  }

  private getAvgPace(): number {
    if (this.lapTimes.length === 0) return 0;
    return this.lapTimes.reduce((a, b) => a + b, 0) / this.lapTimes.length;
  }
}

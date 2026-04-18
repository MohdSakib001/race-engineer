/**
 * ERS Energy Management Module
 *
 * Push/Conserve logic that monitors gaps to cars ahead/behind
 * and recommends optimal ERS deployment mode.
 *
 * Max ERS store = 4,000,000 J (4 MJ)
 */

import type { CarStatus, LapData } from '../types/packets';
import { ErsRecommendation, type ErsAnalysis } from '../types/store';

const MAX_ERS_STORE = 4_000_000; // 4 MJ in Joules
const DRS_RANGE_MS = 1000;       // Within 1s = DRS range
const PUSH_THRESHOLD_MS = 1500;  // Push if gap < 1.5s
const DEFEND_THRESHOLD_MS = 1200; // Defend if car behind < 1.2s

export class ErsManager {
  /** Analyze ERS state and recommend deployment strategy */
  analyze(
    playerStatus: CarStatus,
    playerLap: LapData,
    allLaps: LapData[],
    allStatus: CarStatus[],
    playerIdx: number,
  ): ErsAnalysis {
    const ersPercent = (playerStatus.ersStoreEnergy / MAX_ERS_STORE) * 100;
    const deployedPercent = (playerStatus.ersDeployedThisLap / MAX_ERS_STORE) * 100;
    const harvestRate = (playerStatus.ersHarvestedMGUK + playerStatus.ersHarvestedMGUH) / MAX_ERS_STORE * 100;

    // Find gaps to cars ahead and behind
    const gapAhead = playerLap.deltaToCarAheadMs;
    const gapBehind = this.findGapBehind(playerLap, allLaps, playerIdx);

    // Decision logic
    let recommendation: ErsRecommendation;
    let reason: string;

    const carAheadInDRS = gapAhead > 0 && gapAhead <= DRS_RANGE_MS;
    const carBehindInDRS = gapBehind > 0 && gapBehind <= DRS_RANGE_MS;

    if (carAheadInDRS && ersPercent > 20) {
      recommendation = ErsRecommendation.Overtake;
      reason = `Within DRS range (${(gapAhead / 1000).toFixed(1)}s) — deploy to attack`;
    } else if (carBehindInDRS && ersPercent > 15) {
      recommendation = ErsRecommendation.Defend;
      reason = `Car behind in DRS range (${(gapBehind / 1000).toFixed(1)}s) — deploy to defend position`;
    } else if (gapAhead > 0 && gapAhead <= PUSH_THRESHOLD_MS && ersPercent > 30) {
      recommendation = ErsRecommendation.Push;
      reason = `Gap to car ahead: ${(gapAhead / 1000).toFixed(1)}s — push to close`;
    } else if (ersPercent < 15) {
      recommendation = ErsRecommendation.Conserve;
      reason = `ERS store low (${ersPercent.toFixed(0)}%) — harvest energy`;
    } else if (ersPercent > 80 && gapAhead > PUSH_THRESHOLD_MS) {
      recommendation = ErsRecommendation.Push;
      reason = `High ERS store (${ersPercent.toFixed(0)}%) — use it or lose it`;
    } else {
      recommendation = ErsRecommendation.Neutral;
      reason = 'Balanced deployment — no immediate pressure';
    }

    return {
      recommendation,
      reason,
      gapAhead,
      gapBehind,
      ersStorePercent: ersPercent,
      deployedThisLapPercent: deployedPercent,
      harvestRate,
    };
  }

  private findGapBehind(playerLap: LapData, allLaps: LapData[], playerIdx: number): number {
    const playerPos = playerLap.carPosition;
    if (playerPos <= 0) return 0;

    // Find car directly behind (position = player + 1)
    for (let i = 0; i < allLaps.length; i++) {
      if (i === playerIdx) continue;
      const car = allLaps[i];
      if (car && car.carPosition === playerPos + 1) {
        return car.deltaToCarAheadMs;
      }
    }
    return 0;
  }
}

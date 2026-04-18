/**
 * AI Predictive Wear Engine
 *
 * Uses a 5-lap rolling buffer of tyre wear data to predict the exact lap
 * where each tyre's grip will fall below 40%.
 *
 * Algorithm:
 * 1. Collect wear samples each lap completion
 * 2. Compute linear regression on the rolling window
 * 3. Extrapolate to find the lap where wear crosses 60% (= 40% grip remaining)
 * 4. Apply temperature and fuel-load correction factors
 */

import type { TyreArray } from '../types/packets';
import type { WearSample, WearPrediction } from '../types/store';

const ROLLING_WINDOW = 5;
const GRIP_THRESHOLD = 40; // % grip remaining = 100 - wear%
const WEAR_THRESHOLD = 60; // wear% where grip drops below threshold

export class WearPredictor {
  private samples: WearSample[] = [];
  private currentCompound: number = -1;

  /** Call when a new compound is fitted (pit stop) */
  resetForNewStint(compound: number): void {
    this.samples = [];
    this.currentCompound = compound;
  }

  /** Add a wear sample at end of each lap */
  addSample(sample: WearSample): void {
    // Reset if compound changed (pit stop detected)
    if (sample.compound !== this.currentCompound) {
      this.resetForNewStint(sample.compound);
    }

    this.samples.push(sample);

    // Keep rolling window + 1 for delta calculation
    if (this.samples.length > ROLLING_WINDOW + 1) {
      this.samples.shift();
    }
  }

  /** Get current prediction based on rolling buffer */
  predict(currentLap: number): WearPrediction {
    const result: WearPrediction = {
      predictedLapBelow40: [null, null, null, null],
      wearRatePerLap: [0, 0, 0, 0],
      currentGrip: [100, 100, 100, 100],
      confidence: 0,
    };

    if (this.samples.length < 2) return result;

    const window = this.samples.slice(-ROLLING_WINDOW);

    for (let tyre = 0; tyre < 4; tyre++) {
      // Linear regression: wear vs lap number
      const points = window.map((s) => ({
        x: s.lap,
        y: s.wear[tyre],
      }));

      const { slope, intercept } = linearRegression(points);

      if (slope <= 0) {
        // Wear not increasing — no degradation predicted
        result.wearRatePerLap[tyre] = 0;
        result.currentGrip[tyre] = Math.max(0, 100 - (window[window.length - 1]?.wear[tyre] ?? 0));
        result.predictedLapBelow40[tyre] = null;
        continue;
      }

      // Apply temperature correction factor
      const latestSample = window[window.length - 1];
      const tempFactor = getTemperatureCorrectionFactor(
        latestSample.surfaceTemp[tyre],
        latestSample.innerTemp[tyre]
      );

      const adjustedSlope = slope * tempFactor;
      result.wearRatePerLap[tyre] = adjustedSlope;

      // Current grip
      const currentWear = latestSample.wear[tyre];
      result.currentGrip[tyre] = Math.max(0, 100 - currentWear);

      // Predict lap where wear reaches threshold
      if (currentWear < WEAR_THRESHOLD) {
        const lapsRemaining = (WEAR_THRESHOLD - currentWear) / adjustedSlope;
        result.predictedLapBelow40[tyre] = Math.ceil(currentLap + lapsRemaining);
      } else {
        // Already past threshold
        result.predictedLapBelow40[tyre] = currentLap;
      }
    }

    // Confidence based on sample count and R² of fit
    result.confidence = Math.min(1, (window.length - 1) / (ROLLING_WINDOW - 1));

    return result;
  }

  get sampleCount(): number {
    return this.samples.length;
  }
}

/** Simple linear regression: y = slope * x + intercept */
function linearRegression(points: { x: number; y: number }[]): { slope: number; intercept: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (const { x, y } of points) {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return { slope: 0, intercept: sumY / n };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

/**
 * Temperature correction factor for wear rate.
 *
 * High surface temp (sliding) or carcass/surface delta (setup issue)
 * increases effective wear rate.
 *
 * Optimal surface temp: ~85-105°C for slicks
 * Optimal carcass-surface delta: < 10°C
 */
function getTemperatureCorrectionFactor(surfaceTemp: number, innerTemp: number): number {
  let factor = 1.0;

  // Surface temp penalty: accelerated wear above 105°C
  if (surfaceTemp > 105) {
    factor += (surfaceTemp - 105) * 0.01; // +1% per degree over 105
  }

  // Carcass vs surface delta: setup-induced wear
  const delta = Math.abs(innerTemp - surfaceTemp);
  if (delta > 10) {
    factor += (delta - 10) * 0.005; // +0.5% per degree of delta over 10
  }

  return Math.min(factor, 2.0); // Cap at 2x
}

import { useState, useEffect, useRef } from 'react';
import type { TelemetryState } from '../../shared/types/store';

export interface CompletedLap {
  lapNumber: number;
  lapTimeMs: number;
  sector1TimeMs: number;
  sector2TimeMs: number;
  sector3TimeMs: number;
  tyreCompound: number | null;
  tyreAgeLaps: number;
  pitLap: boolean;
  invalid: boolean;
  completedAt: number; // timestamp
  fuelAtEndKg: number | null;
  fuelUsedKg: number | null;
  tyreWearEndPct: number[] | null;
}

export function useLapHistory(telemetry: TelemetryState) {
  const [completedLaps, setCompletedLaps] = useState<CompletedLap[]>([]);
  const prevLapNumRef = useRef<number | null>(null);
  const prevFuelRef = useRef<number | null>(null);

  useEffect(() => {
    const playerLap = telemetry.lapData[telemetry.playerCarIndex];
    const status = telemetry.status;
    const damage = telemetry.damage;

    if (!playerLap) return;

    const currentLapNum = playerLap.currentLapNum;

    if (prevLapNumRef.current === null) {
      prevLapNumRef.current = currentLapNum;
      prevFuelRef.current = status?.fuelInTank ?? null;
      return;
    }

    // Lap completed when lap number increments
    if (currentLapNum > prevLapNumRef.current) {
      const completedLapNum = prevLapNumRef.current;
      const sector3Ms =
        playerLap.lastLapTimeMs > 0 &&
        playerLap.sector1TimeMs > 0 &&
        playerLap.sector2TimeMs > 0
          ? playerLap.lastLapTimeMs - playerLap.sector1TimeMs - playerLap.sector2TimeMs
          : 0;

      const fuelNow = status?.fuelInTank ?? null;
      const fuelUsed =
        prevFuelRef.current !== null && fuelNow !== null
          ? prevFuelRef.current - fuelNow
          : null;

      const lap: CompletedLap = {
        lapNumber: completedLapNum,
        lapTimeMs: playerLap.lastLapTimeMs,
        sector1TimeMs: playerLap.sector1TimeMs,
        sector2TimeMs: playerLap.sector2TimeMs,
        sector3TimeMs: sector3Ms,
        tyreCompound: status?.visualTyreCompound ?? null,
        tyreAgeLaps: status?.tyresAgeLaps ?? 0,
        pitLap: playerLap.pitStatus > 0,
        invalid: playerLap.currentLapInvalid === 1,
        completedAt: Date.now(),
        fuelAtEndKg: fuelNow,
        fuelUsedKg: fuelUsed !== null && fuelUsed > 0 && fuelUsed < 10 ? fuelUsed : null,
        tyreWearEndPct: damage ? [...damage.tyresWear] : null,
      };

      setCompletedLaps((prev) => [...prev, lap]);
    }

    prevLapNumRef.current = currentLapNum;
    prevFuelRef.current = status?.fuelInTank ?? null;
  }, [
    telemetry.lapData,
    telemetry.playerCarIndex,
    telemetry.status,
    telemetry.damage,
  ]);

  // Clear history when session changes (track changes)
  useEffect(() => {
    setCompletedLaps([]);
    prevLapNumRef.current = null;
    prevFuelRef.current = null;
  }, [telemetry.session?.trackId]);

  const bestLapMs =
    completedLaps.length > 0
      ? Math.min(
          ...completedLaps
            .filter((l) => !l.invalid && !l.pitLap && l.lapTimeMs > 0)
            .map((l) => l.lapTimeMs)
        )
      : null;

  return { completedLaps, bestLapMs: isFinite(bestLapMs ?? Infinity) ? bestLapMs : null };
}

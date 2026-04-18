import { useState, useEffect, useCallback } from 'react';
import type {
  SessionData,
  LapData,
  CarTelemetry,
  CarStatus,
  CarDamage,
  CarSetup,
  Participant,
  EventData,
} from '../../shared/types/packets';
import type { TelemetryState } from '../../shared/types/store';
import {
  api,
  onTelemetryStarted,
  onTelemetryStopped,
  onTelemetryError,
  onSessionUpdate,
  onLapUpdate,
  onTelemetryUpdate,
  onAllTelemetryUpdate,
  onStatusUpdate,
  onAllStatusUpdate,
  onDamageUpdate,
  onSetupUpdate,
  onAllSetupUpdate,
  onParticipantsUpdate,
  onBestLapsUpdate,
  onFastestLapUpdate,
  onEventUpdate,
} from '../lib/tauri-api';

function createInitialState(): TelemetryState {
  return {
    connected: false,
    session: null,
    participants: null,
    lapData: [],
    telemetry: null,
    status: null,
    damage: null,
    setup: null,
    allCarTelemetry: [],
    allCarStatus: [],
    allCarSetup: [],
    allCarDamage: [],
    playerCarIndex: 0,
    bestLapTimes: {},
    fastestLapCar: null,
    fastestLapMs: null,
    events: [],
  };
}

export function useTelemetry() {
  const [state, setState] = useState<TelemetryState>(createInitialState);

  useEffect(() => {
    // Register all Tauri event listeners. Each returns a promise<UnlistenFn>.
    const unlisteners: Array<() => void> = [];
    let active = true;

    const register = async () => {
      const fns = await Promise.all([
        onTelemetryStarted(() =>
          setState((s) => ({ ...s, connected: true }))),

        onTelemetryStopped(() =>
          setState((s) => ({ ...s, connected: false }))),

        onTelemetryError(() =>
          setState((s) => ({ ...s, connected: false }))),

        onSessionUpdate((data: SessionData) =>
          setState((s) => ({ ...s, session: data, playerCarIndex: data.playerCarIndex ?? s.playerCarIndex }))),

        onLapUpdate((data: { lapData: LapData[]; playerCarIndex: number }) =>
          setState((s) => ({ ...s, lapData: data.lapData ?? [], playerCarIndex: data.playerCarIndex ?? s.playerCarIndex }))),

        onTelemetryUpdate((data: CarTelemetry) =>
          setState((s) => ({ ...s, telemetry: data }))),

        onAllTelemetryUpdate((data: CarTelemetry[]) =>
          setState((s) => ({ ...s, allCarTelemetry: data ?? [] }))),

        onStatusUpdate((data: CarStatus) =>
          setState((s) => ({ ...s, status: data }))),

        onAllStatusUpdate((data: CarStatus[]) =>
          setState((s) => ({ ...s, allCarStatus: data ?? [] }))),

        onDamageUpdate((data: CarDamage) =>
          setState((s) => ({ ...s, damage: data }))),

        onSetupUpdate((data: CarSetup) =>
          setState((s) => ({ ...s, setup: data }))),

        onAllSetupUpdate((data: CarSetup[]) =>
          setState((s) => ({ ...s, allCarSetup: data ?? [] }))),

        onParticipantsUpdate((data: { numActiveCars: number; participants: Participant[] }) =>
          setState((s) => ({ ...s, participants: data }))),

        onBestLapsUpdate((data: Record<string, number>) => {
          // Rust emits string keys; convert to number keys
          const numKeyed: Record<number, number> = {};
          for (const [k, v] of Object.entries(data)) numKeyed[Number(k)] = v;
          setState((s) => ({ ...s, bestLapTimes: { ...s.bestLapTimes, ...numKeyed } }));
        }),

        onFastestLapUpdate((data: { vehicleIdx: number; lapTimeMs: number }) =>
          setState((s) => ({ ...s, fastestLapCar: data.vehicleIdx, fastestLapMs: data.lapTimeMs }))),

        onEventUpdate((data: EventData) =>
          setState((s) => ({ ...s, events: [...s.events.slice(-99), data] }))),
      ]);

      if (active) unlisteners.push(...fns);
      else fns.forEach((fn) => fn());
    };

    register().catch(console.error);

    return () => {
      active = false;
      unlisteners.forEach((fn) => fn());
    };
  }, []);

  const startTelemetry = useCallback(async (port: number) => {
    try { await api.startTelemetry(port); } catch (e) { console.error('startTelemetry:', e); }
  }, []);

  const stopTelemetry = useCallback(async () => {
    try { await api.stopTelemetry(); } catch (e) { console.error('stopTelemetry:', e); }
  }, []);

  return { ...state, startTelemetry, stopTelemetry };
}

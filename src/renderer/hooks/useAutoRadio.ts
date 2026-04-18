/**
 * useAutoRadio — React adapter for the existing auto-radio detection engine.
 *
 * The auto-radio module (features/auto-radio/index.js) is a factory function
 * that takes a mutable `state` object and runs situation detection every 3s.
 * This hook bridges it to React by:
 *  1. Keeping a mutable stateProxy synced with TelemetryContext (in-place mutation)
 *  2. Creating a hidden DOM div as the "radio-feed" element
 *  3. Observing MutationObserver events on that div to capture messages into React state
 *  4. Calling the auto-radio's checkAutoRadio() on a 3s interval
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { createAutoRadioFeature } from '../features/auto-radio/index.js';
import { createRadioState } from '../runtime-state.js';
import { getDefaultRadioConfig, RADIO_MESSAGES } from '../../radio-situations.js';
import { api as tauriApi } from '../lib/tauri-api';
import {
  isRaceSession,
  getPlayerLap,
  isPlayerRaceFinished,
  getRemainingRaceDistanceLaps,
  getTrackAheadGapMeters,
  getTrackProximityMeters,
  isTrackLikeSurface,
  isTelemetryOffTrack,
} from '../shared/race-helpers.js';
import type { TelemetryContextValue } from '../context/TelemetryContext';

export interface RadioMessage {
  text: string;
  timestamp: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
}

function fmt(ms: number): string {
  if (!ms || ms <= 0) return '--:--.---';
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${mins}:${secs.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

// Minimal no-op DOM element for non-feed IDs
function fakeEl() {
  return {
    querySelector: () => null,
    querySelectorAll: () => ({ forEach: () => {} }),
    classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
    textContent: '', innerHTML: '', style: {}, dataset: {},
    get children() { return { length: 0 }; },
    prepend: () => {}, appendChild: () => {}, removeChild: () => {},
    remove: () => {}, setAttribute: () => {}, getAttribute: () => null,
    insertBefore: () => {}, scrollTop: 0, scrollHeight: 0,
  };
}

export function useAutoRadio(
  ctx: TelemetryContextValue,
  ttsEnabled: boolean,
  ttsVoice: string,
): { messages: RadioMessage[]; clearMessages: () => void } {
  const [messages, setMessages] = useState<RadioMessage[]>([]);

  // Stable mutable state proxy — the auto-radio closure captures this object reference.
  // We mutate its properties in-place so the closure always sees fresh telemetry.
  const stateProxy = useRef<any>({
    connected: false, session: null, participants: null,
    lapData: [], telemetry: null, status: null, damage: null,
    allCarTelemetry: [], allCarStatus: [], allCarDamage: [],
    playerCarIndex: 0, bestLapTimes: {},
  });

  const ttsRef = useRef({ enabled: ttsEnabled, voice: ttsVoice });
  const radioRef = useRef(createRadioState(getDefaultRadioConfig));

  // Sync proxy in-place on every render (safe: refs are outside React's render model)
  Object.assign(stateProxy.current, {
    connected: ctx.connected,
    session: ctx.session,
    participants: ctx.participants,
    lapData: ctx.lapData,
    telemetry: ctx.telemetry,
    status: ctx.status,
    damage: ctx.damage,
    allCarTelemetry: ctx.allCarTelemetry,
    allCarStatus: ctx.allCarStatus,
    playerCarIndex: ctx.playerCarIndex,
    bestLapTimes: ctx.bestLapTimes,
  });
  ttsRef.current.enabled = ttsEnabled;
  ttsRef.current.voice = ttsVoice;

  useEffect(() => {
    const api = tauriApi;
    const s = stateProxy.current; // stable reference, always up-to-date via in-place mutation

    // ── Hidden radio feed container (auto-radio writes DOM here) ──
    const feedDiv = document.createElement('div');
    feedDiv.style.display = 'none';
    document.body.appendChild(feedDiv);

    // ── MutationObserver: capture cards added by appendRadioCard ──
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          const textEl = node.querySelector('.radio-text');
          const text = (textEl?.textContent ?? '').trim();
          if (!text) continue;
          const urgencyClass = [...node.classList].find((c) => c.startsWith('urgency-'));
          const rawUrgency = urgencyClass ? urgencyClass.replace('urgency-', '') : 'medium';
          const urgency = (['low', 'medium', 'high', 'critical'].includes(rawUrgency)
            ? rawUrgency : 'medium') as RadioMessage['urgency'];
          const tagEl = node.querySelector('.radio-tag');
          const category = tagEl?.textContent?.trim().toLowerCase() || undefined;
          setMessages((prev) => [...prev.slice(-49), { text, timestamp: Date.now(), urgency, category }]);
        }
      }
    });
    observer.observe(feedDiv, { childList: true });

    // ── el() shim: route 'radio-feed' to our hidden div, stub everything else ──
    function el(id: string): any {
      if (id === 'radio-feed') return feedDiv;
      return fakeEl();
    }

    // ── TTS: call IPC + play base64 audio ──
    async function ttsSpeak(text: string): Promise<void> {
      if (!ttsRef.current.enabled || !text) return;
      try {
        const base64 = await api?.ttsSpeak?.({ text, voice: ttsRef.current.voice });
        if (!base64) return;
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'audio/mp3' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        await audio.play().catch(() => {});
      } catch { /* silent — no API key or TTS unavailable */ }
    }

    // ── State-dependent helpers (close over stateProxy.current = s) ──
    function isActiveRunningCar(lap: any) {
      return !!lap && lap.carPosition > 0 && lap.resultStatus === 2
        && lap.driverStatus !== 0 && Number.isFinite(lap.lapDistance) && lap.lapDistance >= 0;
    }

    function isDisplayComparableCar(lap: any) {
      return !!lap && lap.carPosition > 0 && lap.resultStatus >= 2 && lap.driverStatus !== 0;
    }

    function hasPlayerTrackContext(session = s.session, lap = s.lapData?.[s.playerCarIndex], telemetry = s.telemetry) {
      if (!session || !lap) return false;
      if (session.gamePaused) return false;
      if (!isActiveRunningCar(lap)) return false;
      if (telemetry && telemetry.speed <= 1 && (lap.currentLapNum || 0) <= 0) return false;
      return true;
    }

    function isPreStraightWindow(tel: any, sts: any, minSpeed = 130, maxSpeed = 220) {
      if (!tel) return false;
      const deployMode = sts?.ersDeployMode ?? 0;
      return tel.speed >= minSpeed && tel.speed <= maxSpeed
        && tel.throttle >= 0.72 && tel.brake <= 0.05
        && Math.abs(tel.steer) <= 0.18 && deployMode <= 1;
    }

    function shouldSpeakBattleBattery(gapMs: number, playerTel: any, rivalTel: any, rivalLap: any,
      session = s.session, lap = s.lapData?.[s.playerCarIndex]) {
      if (!hasPlayerTrackContext(session, lap, playerTel)) return false;
      if (!isActiveRunningCar(rivalLap)) return false;
      if (!(gapMs > 0 && gapMs <= 1000)) return false;
      if ((lap?.currentLapNum || 0) <= 1) return false;
      if (!isPreStraightWindow(playerTel, s.status, 130, 220)) return false;
      if (rivalTel) {
        if ((rivalTel.speed || 0) < 80) return false;
        if ((rivalTel.brake || 0) > 0.12) return false;
        if (Math.abs(rivalTel.steer || 0) > 0.18) return false;
      }
      return true;
    }

    function getAdjacentRunningCars() {
      const lap = s.lapData?.[s.playerCarIndex];
      if (!isActiveRunningCar(lap) || !Array.isArray(s.lapData)) {
        return { lap, carAheadLap: null, carBehindLap: null, aheadIdx: -1, behindIdx: -1 };
      }
      const myPos = lap.carPosition;
      const carAheadLap = s.lapData.find((e: any) => e?.carPosition === myPos - 1 && isActiveRunningCar(e)) || null;
      const carBehindLap = s.lapData.find((e: any) => e?.carPosition === myPos + 1 && isActiveRunningCar(e)) || null;
      return {
        lap, carAheadLap, carBehindLap,
        aheadIdx: carAheadLap ? s.lapData.indexOf(carAheadLap) : -1,
        behindIdx: carBehindLap ? s.lapData.indexOf(carBehindLap) : -1,
      };
    }

    function getBatteryDelta() {
      const sts = s.status;
      if (!sts || !s.allCarStatus) return null;
      const lap = s.lapData?.[s.playerCarIndex];
      if (!lap || !isDisplayComparableCar(lap) || !s.session || s.session.gamePaused) return null;
      const myPos = lap.carPosition;
      const myMJ = sts.ersStoreEnergy / 1e6;
      const myPct = (sts.ersStoreEnergy / 4_000_000) * 100;
      const carAheadLap = s.lapData.find((e: any) => e?.carPosition === myPos - 1 && isDisplayComparableCar(e)) || null;
      const carBehindLap = s.lapData.find((e: any) => e?.carPosition === myPos + 1 && isDisplayComparableCar(e)) || null;
      const aheadIdx = carAheadLap ? s.lapData.indexOf(carAheadLap) : -1;
      const behindIdx = carBehindLap ? s.lapData.indexOf(carBehindLap) : -1;

      function delta(side: string, idx: number, rivalLap: any) {
        const rivalSts = idx >= 0 ? s.allCarStatus[idx] : null;
        if (idx < 0 || !isActiveRunningCar(rivalLap) || !rivalSts) return null;
        const rivalMJ = rivalSts.ersStoreEnergy / 1e6;
        const rivalPct = (rivalSts.ersStoreEnergy / 4_000_000) * 100;
        const advMJ = +(myMJ - rivalMJ).toFixed(2);
        return {
          side, advantageMJ: advMJ, advantagePct: +(myPct - rivalPct).toFixed(1),
          rivalMJ, rivalPct,
          name: s.participants?.participants?.[idx]?.name || `P${side === 'ahead' ? myPos - 1 : myPos + 1}`,
          relationLabel: side === 'ahead' ? 'car ahead' : 'car behind',
          trend: advMJ > 0 ? 'advantage' : advMJ < 0 ? 'disadvantage' : 'neutral',
        };
      }

      return {
        myMJ: +myMJ.toFixed(2), myPct: +myPct.toFixed(1),
        vsAhead: delta('ahead', aheadIdx, carAheadLap),
        vsBehind: delta('behind', behindIdx, carBehindLap),
      };
    }

    // Load compound lookups from main process (best-effort)
    const TYRE_COMPOUNDS: any = {};
    api?.getLookups?.()
      .then((lookups: any) => { if (lookups?.TYRE_COMPOUNDS) Object.assign(TYRE_COMPOUNDS, lookups.TYRE_COMPOUNDS); })
      .catch(() => {});

    // ── Create the auto-radio feature ──
    const feature = createAutoRadioFeature({
      state: s,
      radio: radioRef.current,
      gptRealtime: { connected: false, aiMode: 'classic', status: 'disconnected' },
      tts: { enabled: false, queue: [] }, // TTS handled by ttsSpeak dep below
      TYRE_COMPOUNDS,
      RADIO_MESSAGES,
      el,
      escapeHtml: (v: string) => v,
      ttsSpeak,
      getBatteryDelta,
      isRaceSession: (ses?: any) => isRaceSession(ses ?? s.session),
      getPlayerLap: () => getPlayerLap(s),
      isPlayerRaceFinished: (ses?: any, lap?: any) =>
        isPlayerRaceFinished(s, ses ?? s.session, lap ?? getPlayerLap(s)),
      getRemainingRaceDistanceLaps: (ses?: any, lap?: any) =>
        getRemainingRaceDistanceLaps(ses ?? s.session, lap ?? getPlayerLap(s)),
      getTrackAheadGapMeters,
      getTrackProximityMeters,
      isTrackLikeSurface,
      isTelemetryOffTrack,
      isActiveRunningCar,
      hasPlayerTrackContext,
      shouldSpeakBattleBattery,
      getAdjacentRunningCars,
      handleFinishedRaceRadioState: () => false,
      fmt,
    });

    // Run situation detection every 3 seconds (same cadence as old renderer RAF loop)
    const intervalId = setInterval(() => {
      feature.checkAutoRadio?.();
    }, 3000);

    return () => {
      clearInterval(intervalId);
      observer.disconnect();
      if (document.body.contains(feedDiv)) document.body.removeChild(feedDiv);
    };
  }, []); // run once — stateProxy.current is updated in-place each render

  const clearMessages = useCallback(() => setMessages([]), []);
  return { messages, clearMessages };
}

/**
 * Tauri API bridge — replaces window.raceEngineer (Electron contextBridge).
 *
 * All methods mirror the old preload.js API exactly so existing hooks/components
 * need minimal changes. Import this module instead of using `window.raceEngineer`.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// ── Commands ──────────────────────────────────────────────────────────────────

export const api = {
  startTelemetry: (port?: number) =>
    invoke<{ success: boolean; port: number }>('start_telemetry', { port }),

  stopTelemetry: () =>
    invoke<{ success: boolean }>('stop_telemetry'),

  setManualTrack: (trackId: number) =>
    invoke<void>('set_manual_track', { trackId }),

  setApiKey: (key: string) =>
    invoke<void>('set_api_key', { key }),

  setPremium: (enabled: boolean) =>
    invoke<void>('set_premium', { enabled }),

  getPremium: () =>
    invoke<{ premium: boolean; hasApiKey: boolean }>('get_premium'),

  getUsage: () =>
    invoke<{
      inputTokens: number;
      cachedInputTokens: number;
      cacheCreationTokens: number;
      outputTokens: number;
      costUsd: number;
    }>('get_usage'),

  resetUsage: () =>
    invoke<void>('reset_usage'),

  loadSettings: () =>
    invoke<any>('load_settings'),

  saveSettings: (settings: any) =>
    invoke<void>('save_settings', { settings }),

  saveExportFile: (payload: { content: string; defaultName?: string; filters?: any[] }) =>
    invoke<{ success?: boolean; cancelled?: boolean; filePath?: string; error?: string }>(
      'save_export_file',
      { payload },
    ),

  getLookups: () =>
    invoke<any>('get_lookups'),

  askEngineer: (payload: { question: string; context?: any; mode?: string }) =>
    invoke<{ response?: string; error?: string; message?: string }>('ask_engineer', { payload }),

  callStrategy: (payload: { snapshot: any; trigger: string; question?: string }) =>
    invoke<{ decision?: StrategyDecision; trigger?: string; error?: string; message?: string }>(
      'call_strategy',
      { payload },
    ),

  ttsSpeak: (payload: { text: string; voice?: string }) =>
    invoke<string>('tts_speak', { payload }),
};

// ── Shared types ─────────────────────────────────────────────────────────────

export type StrategyAction =
  | 'pit_now' | 'pit_next_lap' | 'pit_in_n_laps' | 'stay_out'
  | 'push' | 'save_tyres' | 'save_fuel' | 'manage_ers'
  | 'defend' | 'attack_undercut' | 'attack_overcut' | 'hold_position';

export type StrategyCompound = 'soft' | 'medium' | 'hard' | 'inter' | 'wet' | null;

export interface StrategyDecision {
  action: StrategyAction;
  targetLap?: number | null;
  targetCompound?: StrategyCompound;
  confidence: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  reasoning: string;
  radioMessage: string;
  alternativeAction?: string | null;
  triggerConditions?: string[];
}

// ── Event listeners ───────────────────────────────────────────────────────────
// Each returns an UnlistenFn — call it to remove the listener.

export function onTelemetryStarted(cb: (data: any) => void): Promise<UnlistenFn> {
  return listen('telemetry-started', (e) => cb(e.payload));
}
export function onTelemetryStopped(cb: (data: any) => void): Promise<UnlistenFn> {
  return listen('telemetry-stopped', (e) => cb(e.payload));
}
export function onTelemetryError(cb: (data: any) => void): Promise<UnlistenFn> {
  return listen('telemetry-error', (e) => cb(e.payload));
}
export function onSessionUpdate(cb: (data: any) => void): Promise<UnlistenFn> {
  return listen('session-update', (e) => cb(e.payload));
}
export function onLapUpdate(cb: (data: any) => void): Promise<UnlistenFn> {
  return listen('lap-update', (e) => cb(e.payload));
}
export function onTelemetryUpdate(cb: (data: any) => void): Promise<UnlistenFn> {
  return listen('telemetry-update', (e) => cb(e.payload));
}
export function onAllTelemetryUpdate(cb: (data: any) => void): Promise<UnlistenFn> {
  return listen('alltelemetry-update', (e) => cb(e.payload));
}
export function onStatusUpdate(cb: (data: any) => void): Promise<UnlistenFn> {
  return listen('status-update', (e) => cb(e.payload));
}
export function onAllStatusUpdate(cb: (data: any) => void): Promise<UnlistenFn> {
  return listen('allstatus-update', (e) => cb(e.payload));
}
export function onDamageUpdate(cb: (data: any) => void): Promise<UnlistenFn> {
  return listen('damage-update', (e) => cb(e.payload));
}
export function onSetupUpdate(cb: (data: any) => void): Promise<UnlistenFn> {
  return listen('setup-update', (e) => cb(e.payload));
}
export function onAllSetupUpdate(cb: (data: any) => void): Promise<UnlistenFn> {
  return listen('allsetup-update', (e) => cb(e.payload));
}
export function onParticipantsUpdate(cb: (data: any) => void): Promise<UnlistenFn> {
  return listen('participants-update', (e) => cb(e.payload));
}
export function onBestLapsUpdate(cb: (data: any) => void): Promise<UnlistenFn> {
  return listen('best-laps-update', (e) => cb(e.payload));
}
export function onFastestLapUpdate(cb: (data: any) => void): Promise<UnlistenFn> {
  return listen('fastest-lap-update', (e) => cb(e.payload));
}
export function onEventUpdate(cb: (data: any) => void): Promise<UnlistenFn> {
  return listen('event-update', (e) => cb(e.payload));
}

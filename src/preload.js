import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('raceEngineer', {
  // ── Commands ──────────────────────────────────────────────────────────────
  startTelemetry: () => ipcRenderer.send('start-telemetry'),
  setApiKey: (key) => ipcRenderer.send('set-api-key', key),
  askEngineer: (payload) => ipcRenderer.invoke('ask-engineer', payload),
  getLookups: () => ipcRenderer.invoke('get-lookups'),

  // ── Live data listeners ───────────────────────────────────────────────────
  onTelemetryStarted:  (cb) => ipcRenderer.on('telemetry-started',   (_, d) => cb(d)),
  onSessionUpdate:     (cb) => ipcRenderer.on('session-update',      (_, d) => cb(d)),
  onLapUpdate:         (cb) => ipcRenderer.on('lap-update',          (_, d) => cb(d)),
  onTelemetryUpdate:   (cb) => ipcRenderer.on('telemetry-update',    (_, d) => cb(d)),
  onStatusUpdate:      (cb) => ipcRenderer.on('status-update',       (_, d) => cb(d)),
  onDamageUpdate:      (cb) => ipcRenderer.on('damage-update',       (_, d) => cb(d)),
  onParticipantsUpdate:(cb) => ipcRenderer.on('participants-update', (_, d) => cb(d)),
  onAllStatusUpdate:   (cb) => ipcRenderer.on('allstatus-update',   (_, d) => cb(d)),
});

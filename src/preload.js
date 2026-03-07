import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('raceEngineer', {
  startTelemetry: () => {
    ipcRenderer.send('start-telemetry');
  },
  onTelemetryStarted: (callback) => {
    ipcRenderer.on('telemetry-started', () => {
      if (typeof callback === 'function') {
        callback();
      }
    });
  },
});

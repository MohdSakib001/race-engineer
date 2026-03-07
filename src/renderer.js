/**
 * This file will automatically be loaded by vite and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/process-model
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.js` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */

import "./index.css";

const button = document.getElementById("start-listening");
const statusEl = document.getElementById("status-text");

if (button) {
  button.addEventListener("click", () => {
    if (
      window.raceEngineer &&
      typeof window.raceEngineer.startTelemetry === "function"
    ) {
      window.raceEngineer.startTelemetry();
      if (statusEl) {
        statusEl.textContent = "Starting telemetry...";
      }
    }
  });
}

if (
  window.raceEngineer &&
  typeof window.raceEngineer.onTelemetryStarted === "function"
) {
  window.raceEngineer.onTelemetryStarted(() => {
    if (statusEl) {
      statusEl.textContent = "Telemetry listening on UDP 20777";
    }
  });
}

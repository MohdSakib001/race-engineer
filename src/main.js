import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import dgram from 'node:dgram';
import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let mainWindow;
let telemetrySocket = null;

const TELEMETRY_PORT = 20777;
const PACKET_HEADER_SIZE = 29;

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

const parseTelemetryPacket = (msg) => {
  if (!msg || msg.length <= PACKET_HEADER_SIZE) {
    return;
  }

  const packetId = msg.readUInt8(5);

  const dataStart = PACKET_HEADER_SIZE;

  try {
    switch (packetId) {
      case 6: {
        // Car Telemetry
        if (msg.length < dataStart + 17) {
          return;
        }
        const speed = msg.readUInt16LE(dataStart + 0);
        const throttle = msg.readFloatLE(dataStart + 4);
        const brake = msg.readFloatLE(dataStart + 8);
        const engineRPM = msg.readUInt16LE(dataStart + 14);
        const gear = msg.readInt8(dataStart + 16);

        console.log(
          `[CAR TELEMETRY] speed: ${speed} throttle: ${throttle} brake: ${brake} gear: ${gear} rpm: ${engineRPM}`,
        );
        break;
      }
      case 7: {
        // Car Status
        if (msg.length < dataStart + 39) {
          return;
        }
        const fuelRemaining = msg.readFloatLE(dataStart + 0);
        const fuelCapacity = msg.readFloatLE(dataStart + 4);
        const tyreCompound = msg.readUInt8(dataStart + 38);

        console.log(
          `[CAR STATUS] fuel: ${fuelRemaining} / ${fuelCapacity} compound: ${tyreCompound}`,
        );
        break;
      }
      case 2: {
        // Lap Data
        if (msg.length < dataStart + 25) {
          return;
        }
        const lastLapTimeMs = msg.readUInt32LE(dataStart + 0);
        const currentLapTimeMs = msg.readUInt32LE(dataStart + 4);
        const lapDistance = msg.readFloatLE(dataStart + 8);
        const currentLapNum = msg.readUInt8(dataStart + 23);
        const carPosition = msg.readUInt8(dataStart + 24);

        console.log(
          `[LAP DATA] lap: ${currentLapNum} position: ${carPosition} lastLap: ${lastLapTimeMs}ms distance: ${lapDistance}m`,
        );
        break;
      }
      case 1: {
        // Session
        if (msg.length < dataStart + 8) {
          return;
        }
        const weather = msg.readUInt8(dataStart + 0);
        const trackTemperature = msg.readInt8(dataStart + 1);
        const airTemperature = msg.readInt8(dataStart + 2);
        const totalLaps = msg.readUInt8(dataStart + 3);
        const trackId = msg.readInt8(dataStart + 7);

        console.log(
          `[SESSION] track: ${trackId} weather: ${weather} temp: ${airTemperature}°C laps: ${totalLaps}`,
        );
        break;
      }
      default:
        // Ignore other packet types
        break;
    }
  } catch (err) {
    console.error('Error parsing telemetry packet', err);
  }
};

const startTelemetry = () => {
  if (telemetrySocket) {
    return;
  }

  telemetrySocket = dgram.createSocket('udp4');

  telemetrySocket.on('error', (err) => {
    console.error('Telemetry socket error:', err);
    try {
      telemetrySocket.close();
    } catch {
      // ignore
    }
    telemetrySocket = null;
  });

  telemetrySocket.on('message', (msg) => {
    parseTelemetryPacket(msg);
  });

  telemetrySocket.bind(TELEMETRY_PORT, () => {
    console.log(`Telemetry socket bound on port ${TELEMETRY_PORT}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('telemetry-started');
    }
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  ipcMain.on('start-telemetry', () => {
    startTelemetry();
  });

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

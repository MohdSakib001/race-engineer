import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
// Env vars are injected at build time via vite.main.config.mjs `define`.
// No runtime dotenv needed � process.env.X is replaced with literal values during build.

import dgram from 'node:dgram';
import started from 'electron-squirrel-startup';
import { IsomorphicCommunicate } from 'edge-tts-universal';
import { GptRealtimeEngineer } from './gpt-realtime.js';
import {
  loadLicense,
  saveLicense,
  hasCredits,
  consumeCredit,
  applyPurchase,
  generateRacePacks,
  generateLicenseKeyFromOrder,
  isDevMode,
  getSupportedPayPalCurrencies,
  getDefaultPayPalCurrency,
  getSupportedRazorpayCurrencies,
  getDefaultRazorpayCurrency,
  isPayPalConfigured,
  isRazorpayConfigured,
  createPayPalOrder,
  capturePayPalOrder,
  createRazorpayPaymentLink,
  fetchRazorpayPaymentLink,
  recordPaymentEvent,
  registerLicenseKey,
  activateLicenseKey,
  validateLicenseKey,
  consumeLicenseKeyCredit,
  refundLicenseKeyCredit,
  deactivateLicenseKey,
  getMachineId,
  getResolvedCreditsRemaining,
  applySharedCreditAliases,
  YOUR_APP_OPENAI_KEY,
} from './licensing.js';

if (started) app.quit();

// Single instance lock � required for Windows deep links
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// Avoid noisy Chromium QUIC path-id errors on some networks/proxies.
// Fallback to HTTPS over TCP for all Electron network traffic.
app.commandLine.appendSwitch('disable-quic');

// ─── Multi-window management ────────────────────────────────────────────────
const allWindows = new Set();

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_TELEMETRY_PORT = 20777;
const PACKET_HEADER_SIZE = 29;
const MAX_CARS = 22;

// Bytes per car in each packet type (F1 25 — verified against official spec)
const LAP_DATA_SIZE      = 57;  // 57 bytes/car, unchanged
const CAR_TELEMETRY_SIZE = 60;  // 60 bytes/car, unchanged
const CAR_STATUS_SIZE    = 55;  // 55 bytes/car, unchanged
const CAR_DAMAGE_SIZE    = 46;  // 46 bytes/car (was 40; brakesDamage→[4], +tyreBlisters[4], +engineBlown/Seized)
const PARTICIPANT_SIZE   = 57;  // 57 bytes/car (was 60; name→32 chars, +myTeam, +techLevel, +liveryColours)
const LAP_HISTORY_SIZE   = 14;  // 14 bytes per LapHistoryData entry

// ─── Session / track lookups ──────────────────────────────────────────────────
const TRACK_NAMES = {
  0: 'Melbourne', 1: 'Paul Ricard', 2: 'Shanghai', 3: 'Bahrain',
  4: 'Catalunya', 5: 'Monaco', 6: 'Montreal', 7: 'Silverstone',
  8: 'Hockenheim', 9: 'Hungaroring', 10: 'Spa', 11: 'Monza',
  12: 'Singapore', 13: 'Suzuka', 14: 'Abu Dhabi', 15: 'Texas',
  16: 'Brazil', 17: 'Austria', 18: 'Sochi', 19: 'Mexico',
  20: 'Baku', 21: 'Sakhir Short', 22: 'Silverstone Short',
  23: 'Texas Short', 24: 'Suzuka Short', 25: 'Hanoi',
  26: 'Zandvoort', 27: 'Imola', 28: 'Portimao', 29: 'Jeddah',
  30: 'Miami', 31: 'Las Vegas', 32: 'Losail',
};

const SESSION_TYPES = {
  0: 'Unknown', 1: 'P1', 2: 'P2', 3: 'P3', 4: 'Short Practice',
  5: 'Q1', 6: 'Q2', 7: 'Q3', 8: 'Short Q', 9: 'OSQ',
  10: 'Race', 11: 'Race 2', 12: 'Race 3', 13: 'Time Trial',
};

const WEATHER = {
  0: 'Clear', 1: 'Light Cloud', 2: 'Overcast',
  3: 'Light Rain', 4: 'Heavy Rain', 5: 'Storm',
};

const TEAM_COLORS = {
  0: '#00D2BE',  // Mercedes
  1: '#DC0000',  // Ferrari
  2: '#3671C6',  // Red Bull
  3: '#37BEDD',  // Williams
  4: '#358C75',  // Aston Martin
  5: '#FF87BC',  // Alpine
  6: '#5E8FAA',  // RB (Racing Bulls)
  7: '#B6BABD',  // Haas
  8: '#FF8000',  // McLaren
  9: '#52E252',  // Kick Sauber
  41: '#3671C6', // Red Bull 2
  253: '#FFFFFF', // My Team
};

// Visual tyre compound → badge display (what the game shows on screen)
const TYRE_COMPOUNDS = {
  16: { label: 'S', name: 'Soft',         color: '#FF3333' },
  17: { label: 'M', name: 'Medium',       color: '#FFD700' },
  18: { label: 'H', name: 'Hard',         color: '#CCCCCC' },
  7:  { label: 'I', name: 'Intermediate', color: '#39B54A' },
  8:  { label: 'W', name: 'Wet',          color: '#4477FF' },
};

// Actual tyre compound → C-designation (F1 25 specific)
const ACTUAL_COMPOUNDS = {
  16: 'C5', 17: 'C4', 18: 'C3', 19: 'C2', 20: 'C1', 21: 'C0', 22: 'C6',
  7: 'Inter', 8: 'Wet', 9: 'Dry', 10: 'Wet',
};

// ─── App State ────────────────────────────────────────────────────────────────
const telemetryContexts = new Map(); // port -> context
const windowPortMap = new Map(); // webContents.id -> port
let manualTrackId = null;

function createTelemetryState() {
  return {
    sessionData: null,
    participants: null,
    lapData: null,
    carTelemetry: null,
    carStatus: null,
    carDamage: null,
    playerCarIndex: 0,
    bestLapTimes: {},
    fastestLap: null,
  };
}
// ─── Electron Setup ───────────────────────────────────────────────────────────
let mainWindow;
let checkoutWindow = null;
let anthropic = null;
// eslint-disable-next-line no-undef
const _env = typeof __ENV__ !== 'undefined' ? __ENV__ : {};
let apiKey = _env.ANTHROPIC_API_KEY || null;

function loadWindowURL(win, queryStr = '') {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL + (queryStr ? '?' + queryStr : ''));
  } else {
    const filePath = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
    const search = queryStr ? `?${queryStr}` : '';
    win.loadFile(filePath, search ? { search } : undefined);
  }
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#050509',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const mainWindowId = mainWindow.webContents.id;
  allWindows.add(mainWindow);
  mainWindow.on('closed', () => {
    stopTelemetryForWindow(mainWindowId, false);
    allWindows.delete(mainWindow);
  });

  loadWindowURL(mainWindow);
};

function closeCheckoutWindow() {
  if (checkoutWindow && !checkoutWindow.isDestroyed()) {
    checkoutWindow.close();
  }
  checkoutWindow = null;
}

function isPayPalCheckoutUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    return host.includes('paypal.com') || host.includes('paypalobjects.com');
  } catch {
    return false;
  }
}

function isRazorpayCheckoutUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    return host.includes('razorpay.com');
  } catch {
    return false;
  }
}

async function openPayPalCheckoutWindow(url) {
  // Always use a fresh ephemeral profile for PayPal checkout so sandbox
  // seller cookies from previous attempts do not leak into buyer flow.
  closeCheckoutWindow();
  const checkoutPartition = `nopersist:paypal-checkout-${Date.now()}`;

  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  checkoutWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    title: 'PayPal Checkout',
    backgroundColor: '#050509',
    parent,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: checkoutPartition,
    },
  });

  allWindows.add(checkoutWindow);
  checkoutWindow.on('closed', () => {
    allWindows.delete(checkoutWindow);
    checkoutWindow = null;
  });

  const interceptDeepLink = (event, targetUrl) => {
    if (typeof targetUrl === 'string' && targetUrl.startsWith('race-engineer://')) {
      event.preventDefault();
      handleDeepLink(targetUrl);
      closeCheckoutWindow();
    }
  };

  checkoutWindow.webContents.on('will-redirect', interceptDeepLink);
  checkoutWindow.webContents.on('will-navigate', interceptDeepLink);
  checkoutWindow.webContents.on('did-fail-load', (_event, _code, _desc, failedUrl) => {
    if (typeof failedUrl === 'string' && failedUrl.startsWith('race-engineer://')) {
      handleDeepLink(failedUrl);
      closeCheckoutWindow();
    }
  });

  checkoutWindow.webContents.setWindowOpenHandler(({ url: popupUrl }) => {
    if (typeof popupUrl === 'string' && popupUrl.startsWith('race-engineer://')) {
      handleDeepLink(popupUrl);
      closeCheckoutWindow();
      return { action: 'deny' };
    }
    if (/^https?:\/\//i.test(popupUrl)) {
      checkoutWindow.loadURL(popupUrl).catch(() => {});
    }
    return { action: 'deny' };
  });

  await checkoutWindow.loadURL(url);
  checkoutWindow.focus();
}

// ─── Packet Parsing ───────────────────────────────────────────────────────────
function parseHeader(msg) {
  // F1 25 header: PacketFormat(2) + GameYear(1) + MajorVer(1) + MinorVer(1) + PacketVer(1) + PacketType(1) + ...
  // PacketType is at byte 6, PlayerCarIndex at byte 27
  return {
    packetId: msg.readUInt8(6),
    playerCarIndex: msg.readUInt8(27),
    secondaryPlayerCarIndex: msg.readUInt8(28),
  };
}

function parseSession(msg) {
  const d = PACKET_HEADER_SIZE;
  if (msg.length < d + 20) return null;
  try {
    // d+0..16: basic fields (unchanged from F1 24)
    // d+17: sliProNativeSupport (1)
    // d+18: numMarshalZones (1)
    // d+19: marshalZones[21] = 21 * (float4 + int8) = 21 * 5 = 105 bytes → ends at d+123
    // d+124: safetyCarStatus
    // d+125: networkGame
    // d+126: numWeatherForecastSamples
    // d+127: weatherForecastSamples[64] = 64 * 8 = 512 bytes → ends at d+638
    // d+639: forecastAccuracy, d+640: aiDifficulty
    // d+641: seasonLinkId(4), d+645: weekendLinkId(4), d+649: sessionLinkId(4)
    // d+653: pitStopWindowIdealLap, d+654: pitStopWindowLatestLap, d+655: pitStopRejoinPosition
    const safetyCarStatus = msg.length > d + 124 ? msg.readUInt8(d + 124) : 0;
    const pitIdeal  = msg.length > d + 653 ? msg.readUInt8(d + 653) : 0;
    const pitLatest = msg.length > d + 654 ? msg.readUInt8(d + 654) : 0;

    // Parse weather forecast samples (d+126 = count, d+127 = array of 8-byte samples)
    const weatherForecast = [];
    if (msg.length > d + 127) {
      const numSamples = msg.readUInt8(d + 126);
      for (let i = 0; i < Math.min(numSamples, 64); i++) {
        const fo = d + 127 + i * 8;
        if (fo + 8 > msg.length) break;
        weatherForecast.push({
          sessionType:    msg.readUInt8(fo),
          timeOffset:     msg.readUInt8(fo + 1),   // minutes from now
          weather:        msg.readUInt8(fo + 2),   // 0-5
          trackTemp:      msg.readInt8(fo + 3),
          trackTempChange:msg.readInt8(fo + 4),    // 0=up, 1=down, 2=no change
          airTemp:        msg.readInt8(fo + 5),
          airTempChange:  msg.readInt8(fo + 6),    // 0=up, 1=down, 2=no change
          rainPercentage: msg.readUInt8(fo + 7),   // 0-100
        });
      }
    }
    const forecastAccuracy = msg.length > d + 639 ? msg.readUInt8(d + 639) : 0;

    return {
      weather:            msg.readUInt8(d + 0),
      trackTemperature:   msg.readInt8(d + 1),
      airTemperature:     msg.readInt8(d + 2),
      totalLaps:          msg.readUInt8(d + 3),
      trackLength:        msg.readUInt16LE(d + 4),
      sessionType:        msg.readUInt8(d + 6),
      trackId:            msg.readInt8(d + 7),
      formula:            msg.readUInt8(d + 8),
      sessionTimeLeft:    msg.readUInt16LE(d + 9),
      sessionDuration:    msg.readUInt16LE(d + 11),
      pitSpeedLimit:      msg.readUInt8(d + 13),
      gamePaused:         msg.readUInt8(d + 14),
      isSpectating:       msg.readUInt8(d + 15),
      spectatorCarIndex:  msg.readUInt8(d + 16),
      safetyCarStatus,
      numRedFlagPeriods:  msg.length > d + 678 ? msg.readUInt8(d + 678) : 0,
      pitStopWindowIdealLap:  pitIdeal,
      pitStopWindowLatestLap: pitLatest,
      weatherForecast,
      forecastAccuracy,
    };
  } catch {
    return null;
  }
}

function parseLapData(msg) {
  const d = PACKET_HEADER_SIZE;
  const cars = [];
  for (let i = 0; i < MAX_CARS; i++) {
    const o = d + i * LAP_DATA_SIZE;
    if (o + LAP_DATA_SIZE > msg.length) break;
    try {
      const sector1Ms = msg.readUInt16LE(o + 8) + msg.readUInt8(o + 10) * 60000;
      const sector2Ms = msg.readUInt16LE(o + 11) + msg.readUInt8(o + 13) * 60000;
      cars.push({
        lastLapTimeMs:      msg.readUInt32LE(o + 0),
        currentLapTimeMs:   msg.readUInt32LE(o + 4),
        sector1TimeMs:      sector1Ms,
        sector2TimeMs:      sector2Ms,
        // gap to car directly ahead (ms); minutes field at +16
        deltaToCarAheadMs:  msg.readUInt16LE(o + 14) + msg.readUInt8(o + 16) * 60000,
        deltaToLeaderMs:    msg.readUInt16LE(o + 17) + msg.readUInt8(o + 19) * 60000,
        lapDistance:        msg.readFloatLE(o + 20),
        totalDistance:      msg.readFloatLE(o + 24),
        carPosition:        msg.readUInt8(o + 32),
        currentLapNum:      msg.readUInt8(o + 33),
        pitStatus:          msg.readUInt8(o + 34),
        numPitStops:        msg.readUInt8(o + 35),
        sector:             msg.readUInt8(o + 36),
        currentLapInvalid:  msg.readUInt8(o + 37),
        penalties:          msg.readUInt8(o + 38),
        gridPosition:       msg.readUInt8(o + 43),
        driverStatus:       msg.readUInt8(o + 44),
        resultStatus:       msg.readUInt8(o + 45),
        pitLaneTimerActive: msg.readUInt8(o + 46),
      });
    } catch {
      cars.push(null);
    }
  }
  return cars;
}

function parseParticipants(msg) {
  // F1 25 ParticipantData layout (57 bytes/car):
  // +0  aiControlled (u8)
  // +1  driverId (u8)
  // +2  networkId (u8)
  // +3  teamId (u8)
  // +4  myTeam (u8)          ← NEW in F1 25
  // +5  raceNumber (u8)
  // +6  nationality (u8)
  // +7  name[32] (char)      ← was 48 in F1 24
  // +39 yourTelemetry (u8)
  // +40 showOnlineNames (u8)
  // +41 techLevel (u16)      ← NEW in F1 25
  // +43 platform (u8)
  // +44 numColours (u8)      ← NEW in F1 25
  // +45 liveryColours[4×3]   ← NEW in F1 25 (12 bytes)
  // Total = 57 bytes
  const d = PACKET_HEADER_SIZE;
  if (msg.length < d + 1) return null;
  try {
    const numActiveCars = msg.readUInt8(d + 0);
    const participants = [];
    for (let i = 0; i < Math.min(numActiveCars, MAX_CARS); i++) {
      const o = d + 1 + i * PARTICIPANT_SIZE;
      if (o + PARTICIPANT_SIZE > msg.length) break;
      try {
        const nameSlice = msg.slice(o + 7, o + 7 + 32);
        const nullIdx = nameSlice.indexOf(0);
        const name = nameSlice.slice(0, nullIdx >= 0 ? nullIdx : 32).toString('utf8');
        participants.push({
          aiControlled: msg.readUInt8(o + 0),
          driverId:     msg.readUInt8(o + 1),
          networkId:    msg.readUInt8(o + 2),
          teamId:       msg.readUInt8(o + 3),
          myTeam:       msg.readUInt8(o + 4),
          raceNumber:   msg.readUInt8(o + 5),
          nationality:  msg.readUInt8(o + 6),
          name:         name || `Car ${i + 1}`,
        });
      } catch {
        participants.push(null);
      }
    }
    return { numActiveCars, participants };
  } catch {
    return null;
  }
}

function parseCarTelemetry(msg) {
  const d = PACKET_HEADER_SIZE;
  const cars = [];
  for (let i = 0; i < MAX_CARS; i++) {
    const o = d + i * CAR_TELEMETRY_SIZE;
    if (o + CAR_TELEMETRY_SIZE > msg.length) break;
    try {
      cars.push({
        speed:    msg.readUInt16LE(o + 0),
        throttle: msg.readFloatLE(o + 2),
        steer:    msg.readFloatLE(o + 6),
        brake:    msg.readFloatLE(o + 10),
        clutch:   msg.readUInt8(o + 14),
        gear:     msg.readInt8(o + 15),
        engineRPM: msg.readUInt16LE(o + 16),
        drs:      msg.readUInt8(o + 18),
        revLightsPercent: msg.readUInt8(o + 19),
        // brakes temp: RL RR FL FR
        brakesTemp: [
          msg.readUInt16LE(o + 22),
          msg.readUInt16LE(o + 24),
          msg.readUInt16LE(o + 26),
          msg.readUInt16LE(o + 28),
        ],
        // tyre surface temp: RL RR FL FR
        tyreSurfaceTemp: [
          msg.readUInt8(o + 30),
          msg.readUInt8(o + 31),
          msg.readUInt8(o + 32),
          msg.readUInt8(o + 33),
        ],
        // tyre inner temp: RL RR FL FR
        tyreInnerTemp: [
          msg.readUInt8(o + 34),
          msg.readUInt8(o + 35),
          msg.readUInt8(o + 36),
          msg.readUInt8(o + 37),
        ],
        engineTemp: msg.readUInt16LE(o + 38),
        // tyre pressure: RL RR FL FR
        tyrePressure: [
          msg.readFloatLE(o + 40),
          msg.readFloatLE(o + 44),
          msg.readFloatLE(o + 48),
          msg.readFloatLE(o + 52),
        ],
        surfaceType: [
          msg.readUInt8(o + 56),
          msg.readUInt8(o + 57),
          msg.readUInt8(o + 58),
          msg.readUInt8(o + 59),
        ],
      });
    } catch {
      cars.push(null);
    }
  }
  return cars;
}

function parseCarStatus(msg) {
  const d = PACKET_HEADER_SIZE;
  const cars = [];
  for (let i = 0; i < MAX_CARS; i++) {
    const o = d + i * CAR_STATUS_SIZE;
    if (o + CAR_STATUS_SIZE > msg.length) break;
    try {
      cars.push({
        tractionControl:      msg.readUInt8(o + 0),
        antiLockBrakes:       msg.readUInt8(o + 1),
        fuelMix:              msg.readUInt8(o + 2),
        frontBrakeBias:       msg.readUInt8(o + 3),
        pitLimiterStatus:     msg.readUInt8(o + 4),
        fuelInTank:           msg.readFloatLE(o + 5),
        fuelCapacity:         msg.readFloatLE(o + 9),
        fuelRemainingLaps:    msg.readFloatLE(o + 13),
        maxRPM:               msg.readUInt16LE(o + 17),
        idleRPM:              msg.readUInt16LE(o + 19),
        maxGears:             msg.readUInt8(o + 21),
        drsAllowed:           msg.readUInt8(o + 22),
        drsActivationDist:    msg.readUInt16LE(o + 23),
        actualTyreCompound:   msg.readUInt8(o + 25),
        visualTyreCompound:   msg.readUInt8(o + 26),
        tyresAgeLaps:         msg.readUInt8(o + 27),
        vehicleFiaFlags:      msg.readInt8(o + 28),
        enginePowerICE:       msg.readFloatLE(o + 29),
        enginePowerMGUK:      msg.readFloatLE(o + 33),
        ersStoreEnergy:       msg.readFloatLE(o + 37),
        ersDeployMode:        msg.readUInt8(o + 41),
        ersHarvestedMGUK:     msg.readFloatLE(o + 42),
        ersHarvestedMGUH:     msg.readFloatLE(o + 46),
        ersDeployedThisLap:   msg.readFloatLE(o + 50),
        networkPaused:        msg.readUInt8(o + 54),
      });
    } catch {
      cars.push(null);
    }
  }
  return cars;
}

function parseCarDamage(msg) {
  // F1 25 CarDamageData layout (46 bytes/car):
  // +0  tyresWear[4]       (4×float = 16 bytes) RL RR FL FR
  // +16 tyresDamage[4]     (4×u8 = 4 bytes)     RL RR FL FR
  // +20 brakesDamage[4]    (4×u8 = 4 bytes)     RL RR FL FR  ← was [2] in F1 24
  // +24 tyreBlisters[4]    (4×u8 = 4 bytes)     RL RR FL FR  ← NEW in F1 25
  // +28 frontLeftWingDamage  (u8)   ← was +22
  // +29 frontRightWingDamage (u8)   ← was +23
  // +30 rearWingDamage       (u8)   ← was +24
  // +31 floorDamage          (u8)   ← was +25
  // +32 diffuserDamage       (u8)   ← was +26
  // +33 sidepodDamage        (u8)   ← was +27
  // +34 drsFault             (u8)   ← was +28
  // +35 ersFault             (u8)   ← was +29
  // +36 gearBoxDamage        (u8)   ← was +30
  // +37 engineDamage         (u8)   ← was +31
  // +38 engineMGUHWear       (u8)   ← was +32
  // +39 engineESWear         (u8)   ← was +33
  // +40 engineCEWear         (u8)   ← was +34
  // +41 engineICEWear        (u8)   ← was +35
  // +42 engineMGUKWear       (u8)   ← was +36
  // +43 engineTCWear         (u8)   ← was +37
  // +44 engineBlown          (u8)   ← NEW in F1 25
  // +45 engineSeized         (u8)   ← NEW in F1 25
  const d = PACKET_HEADER_SIZE;
  const cars = [];
  for (let i = 0; i < MAX_CARS; i++) {
    const o = d + i * CAR_DAMAGE_SIZE;
    if (o + CAR_DAMAGE_SIZE > msg.length) break;
    try {
      cars.push({
        tyresWear:   [msg.readFloatLE(o+0), msg.readFloatLE(o+4), msg.readFloatLE(o+8),  msg.readFloatLE(o+12)],
        tyresDamage: [msg.readUInt8(o+16),  msg.readUInt8(o+17),  msg.readUInt8(o+18),   msg.readUInt8(o+19)],
        brakesDamage:[msg.readUInt8(o+20),  msg.readUInt8(o+21),  msg.readUInt8(o+22),   msg.readUInt8(o+23)],
        tyreBlisters:[msg.readUInt8(o+24),  msg.readUInt8(o+25),  msg.readUInt8(o+26),   msg.readUInt8(o+27)],
        frontLeftWingDamage:  msg.readUInt8(o + 28),
        frontRightWingDamage: msg.readUInt8(o + 29),
        rearWingDamage:       msg.readUInt8(o + 30),
        floorDamage:          msg.readUInt8(o + 31),
        diffuserDamage:       msg.readUInt8(o + 32),
        sidepodDamage:        msg.readUInt8(o + 33),
        drsFault:             msg.readUInt8(o + 34),
        ersFault:             msg.readUInt8(o + 35),
        gearBoxDamage:        msg.readUInt8(o + 36),
        engineDamage:         msg.readUInt8(o + 37),
        engineMGUHWear:       msg.readUInt8(o + 38),
        engineESWear:         msg.readUInt8(o + 39),
        engineCEWear:         msg.readUInt8(o + 40),
        engineICEWear:        msg.readUInt8(o + 41),
        engineMGUKWear:       msg.readUInt8(o + 42),
        engineTCWear:         msg.readUInt8(o + 43),
        engineBlown:          msg.readUInt8(o + 44),
        engineSeized:         msg.readUInt8(o + 45),
      });
    } catch {
      cars.push(null);
    }
  }
  return cars;
}

function parseEvent(msg) {
  // PacketEventData: header(29) + eventStringCode[4] + EventDataDetails(union)
  const d = PACKET_HEADER_SIZE;
  if (msg.length < d + 4) return null;
  try {
    const code = msg.slice(d, d + 4).toString('ascii');
    if (code === 'FTLP') {
      // FastestLap: vehicleIdx(u8) + lapTime(float seconds)
      return {
        type: 'FTLP',
        vehicleIdx: msg.readUInt8(d + 4),
        lapTimeMs: Math.round(msg.readFloatLE(d + 5) * 1000),
      };
    }
    if (code === 'SCAR') {
      // SafetyCar: safetyCarType(u8) + eventType(u8)
      return {
        type: 'SCAR',
        safetyCarType: msg.readUInt8(d + 4),
        eventType: msg.readUInt8(d + 5),
      };
    }
    if (code === 'OVTK') {
      return {
        type: 'OVTK',
        overtakingVehicleIdx:   msg.readUInt8(d + 4),
        beingOvertakenVehicleIdx: msg.readUInt8(d + 5),
      };
    }
    return { type: code };
  } catch {
    return null;
  }
}

function parseSessionHistory(msg) {
  // PacketSessionHistoryData layout:
  // header(29) + carIdx(1) + numLaps(1) + numTyreStints(1)
  // + bestLapTimeLapNum(1) + bestS1LapNum(1) + bestS2LapNum(1) + bestS3LapNum(1)
  // + LapHistoryData[100] (14 bytes each) + TyreStintHistoryData[8] (3 bytes each)
  const d = PACKET_HEADER_SIZE;
  if (msg.length < d + 7) return null;
  try {
    const carIdx            = msg.readUInt8(d + 0);
    const numLaps           = msg.readUInt8(d + 1);
    const bestLapTimeLapNum = msg.readUInt8(d + 3); // 1-indexed
    const lapsStart = d + 7;
    let bestLapTimeMs = 0;
    if (bestLapTimeLapNum > 0 && bestLapTimeLapNum <= numLaps) {
      const lapOff = lapsStart + (bestLapTimeLapNum - 1) * LAP_HISTORY_SIZE;
      if (lapOff + 4 <= msg.length) {
        bestLapTimeMs = msg.readUInt32LE(lapOff);
      }
    }
    return { carIdx, numLaps, bestLapTimeMs };
  } catch {
    return null;
  }
}

// IPC Broadcast helpers
function getWindowByWebContentsId(windowId) {
  for (const win of allWindows) {
    if (!win.isDestroyed() && win.webContents && win.webContents.id === windowId) {
      return win;
    }
  }
  return null;
}

function sendToWindow(windowId, channel, data) {
  const win = getWindowByWebContentsId(windowId);
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

function sendToSubscribers(context, channel, data) {
  for (const windowId of [...context.subscribers]) {
    const win = getWindowByWebContentsId(windowId);
    if (!win) {
      context.subscribers.delete(windowId);
      windowPortMap.delete(windowId);
      continue;
    }
    win.webContents.send(channel, data);
  }
}

function broadcastLapData(context) {
  const s = context.state;
  sendToSubscribers(context, 'lap-update', { lapData: s.lapData, playerCarIndex: s.playerCarIndex });
}

function broadcastTelemetry(context) {
  const s = context.state;
  const t = s.carTelemetry?.[s.playerCarIndex];
  if (t) sendToSubscribers(context, 'telemetry-update', t);
  if (s.carTelemetry) sendToSubscribers(context, 'alltelemetry-update', s.carTelemetry);
}

function broadcastStatus(context) {
  const s = context.state;
  const st = s.carStatus?.[s.playerCarIndex];
  if (st) sendToSubscribers(context, 'status-update', st);
  if (s.carStatus) sendToSubscribers(context, 'allstatus-update', s.carStatus);
}

function broadcastDamage(context) {
  const s = context.state;
  const dmg = s.carDamage?.[s.playerCarIndex];
  if (dmg) sendToSubscribers(context, 'damage-update', dmg);
}

function broadcastBestLaps(context) {
  sendToSubscribers(context, 'best-laps-update', context.state.bestLapTimes);
}

function broadcastFastestLap(context) {
  if (context.state.fastestLap) sendToSubscribers(context, 'fastest-lap-update', context.state.fastestLap);
}

function broadcastParticipants(context) {
  sendToSubscribers(context, 'participants-update', context.state.participants);
}

function broadcastSession(context) {
  const s = context.state;
  if (!s.sessionData) return;
  sendToSubscribers(context, 'session-update', {
    ...s.sessionData,
    playerCarIndex: s.playerCarIndex,
    trackName: TRACK_NAMES[s.sessionData.trackId] || `Track ${s.sessionData.trackId}`,
    sessionTypeName: SESSION_TYPES[s.sessionData.sessionType] || 'Unknown',
    weatherName: WEATHER[s.sessionData.weather] || 'Clear',
  });
}

function sendSnapshotToWindow(windowId, context) {
  const s = context.state;
  if (s.sessionData)  sendToWindow(windowId, 'session-update', {
    ...s.sessionData,
    playerCarIndex: s.playerCarIndex,
    trackName: TRACK_NAMES[s.sessionData.trackId] || `Track ${s.sessionData.trackId}`,
    sessionTypeName: SESSION_TYPES[s.sessionData.sessionType] || 'Unknown',
    weatherName: WEATHER[s.sessionData.weather] || 'Clear',
  });
  if (s.participants) sendToWindow(windowId, 'participants-update', s.participants);
  if (s.lapData)      sendToWindow(windowId, 'lap-update', { lapData: s.lapData, playerCarIndex: s.playerCarIndex });
  if (s.carTelemetry) {
    const t = s.carTelemetry[s.playerCarIndex];
    if (t) sendToWindow(windowId, 'telemetry-update', t);
    sendToWindow(windowId, 'alltelemetry-update', s.carTelemetry);
  }
  if (s.carStatus) {
    const st = s.carStatus[s.playerCarIndex];
    if (st) sendToWindow(windowId, 'status-update', st);
    sendToWindow(windowId, 'allstatus-update', s.carStatus);
  }
  if (s.carDamage) {
    const dmg = s.carDamage[s.playerCarIndex];
    if (dmg) sendToWindow(windowId, 'damage-update', dmg);
  }
  if (Object.keys(s.bestLapTimes).length) sendToWindow(windowId, 'best-laps-update', s.bestLapTimes);
  if (s.fastestLap) sendToWindow(windowId, 'fastest-lap-update', s.fastestLap);
}

function normalizePort(value) {
  const p = Number(value);
  return Number.isInteger(p) && p >= 1 && p <= 65535 ? p : DEFAULT_TELEMETRY_PORT;
}

function createTelemetryContext(port) {
  const context = {
    port,
    socket: dgram.createSocket({ type: 'udp4', reuseAddr: true }),
    state: createTelemetryState(),
    subscribers: new Set(),
    bound: false,
  };

  context.socket.on('error', (err) => {
    console.error(`Telemetry socket error on UDP :${port}`, err);
    for (const windowId of [...context.subscribers]) {
      sendToWindow(windowId, 'telemetry-error', { message: err.message });
      windowPortMap.delete(windowId);
    }
    context.subscribers.clear();
    try { context.socket.close(); } catch { /**/ }
    telemetryContexts.delete(port);
  });

  context.socket.on('message', (msg) => {
    try {
      if (msg.length < PACKET_HEADER_SIZE) return;
      const header = parseHeader(msg);
      const s = context.state;
      s.playerCarIndex = header.playerCarIndex < MAX_CARS ? header.playerCarIndex : 0;

      switch (header.packetId) {
        case 1: {
          const session = parseSession(msg);
          if (session) {
            if (!s.sessionData || s.sessionData.trackId !== session.trackId || s.sessionData.sessionType !== session.sessionType) {
              console.log(`[Race Engineer] Session on UDP :${port} -> trackId=${session.trackId}, type=${session.sessionType}, laps=${session.totalLaps}`);
              s.bestLapTimes = {};
              s.fastestLap = null;
            }
            if (manualTrackId !== null && manualTrackId !== undefined) session.trackId = manualTrackId;
            s.sessionData = session;
            broadcastSession(context);
          }
          break;
        }
        case 2: {
          const l = parseLapData(msg);
          if (l) { s.lapData = l; broadcastLapData(context); }
          break;
        }
        case 4: {
          const p = parseParticipants(msg);
          if (p) { s.participants = p; broadcastParticipants(context); }
          break;
        }
        case 6: {
          const t = parseCarTelemetry(msg);
          if (t) { s.carTelemetry = t; broadcastTelemetry(context); }
          break;
        }
        case 7: {
          const cs = parseCarStatus(msg);
          if (cs) { s.carStatus = cs; broadcastStatus(context); }
          break;
        }
        case 3: {
          const ev = parseEvent(msg);
          if (ev) {
            if (ev.type === 'FTLP') {
              s.fastestLap = { vehicleIdx: ev.vehicleIdx, lapTimeMs: ev.lapTimeMs };
              broadcastFastestLap(context);
              console.log(`[Race Engineer] Fastest lap UDP :${port} -> car ${ev.vehicleIdx}, ${(ev.lapTimeMs / 1000).toFixed(3)}s`);
            }
            sendToSubscribers(context, 'event-update', ev);
          }
          break;
        }
        case 10: {
          const dmg = parseCarDamage(msg);
          if (dmg) { s.carDamage = dmg; broadcastDamage(context); }
          break;
        }
        case 11: {
          const hist = parseSessionHistory(msg);
          if (hist && hist.bestLapTimeMs > 0) {
            s.bestLapTimes[hist.carIdx] = hist.bestLapTimeMs;
            broadcastBestLaps(context);
          }
          break;
        }
      }
    } catch { /**/ }
  });

  context.socket.bind(port, () => {
    context.bound = true;
    console.log(`[Race Engineer] Listening on UDP :${port}`);
    for (const windowId of context.subscribers) {
      sendToWindow(windowId, 'telemetry-started', { port });
      sendSnapshotToWindow(windowId, context);
    }
  });

  telemetryContexts.set(port, context);
  return context;
}

function attachWindowToPort(windowId, requestedPort) {
  const port = normalizePort(requestedPort);
  let context = telemetryContexts.get(port);
  if (!context) context = createTelemetryContext(port);

  context.subscribers.add(windowId);
  windowPortMap.set(windowId, port);

  if (context.bound) {
    sendToWindow(windowId, 'telemetry-started', { port });
    sendSnapshotToWindow(windowId, context);
  }
}

function stopTelemetryForWindow(windowId, notify = true) {
  const port = windowPortMap.get(windowId);
  if (port === undefined) {
    if (notify) sendToWindow(windowId, 'telemetry-stopped', {});
    return;
  }

  const context = telemetryContexts.get(port);
  windowPortMap.delete(windowId);

  if (context) {
    context.subscribers.delete(windowId);
    if (context.subscribers.size === 0) {
      try { context.socket.close(); } catch { /**/ }
      telemetryContexts.delete(port);
      console.log(`[Race Engineer] Telemetry stopped on UDP :${port}`);
    }
  }

  if (notify) sendToWindow(windowId, 'telemetry-stopped', {});
}

function startTelemetryForWindow(windowId, requestedPort) {
  const nextPort = normalizePort(requestedPort);
  const currentPort = windowPortMap.get(windowId);

  if (currentPort === nextPort && telemetryContexts.has(nextPort)) {
    const context = telemetryContexts.get(nextPort);
    sendToWindow(windowId, 'telemetry-started', { port: nextPort });
    if (context) sendSnapshotToWindow(windowId, context);
    return;
  }

  stopTelemetryForWindow(windowId, false);
  attachWindowToPort(windowId, nextPort);
}

function getContextForWindow(windowId) {
  const port = windowPortMap.get(windowId);
  if (port === undefined) return null;
  return telemetryContexts.get(port) || null;
}

// Send session every 2s (it changes slowly)
setInterval(() => {
  for (const context of telemetryContexts.values()) {
    broadcastSession(context);
  }
}, 2000);
// ─── Claude AI Engineer ───────────────────────────────────────────────────────
const ENGINEER_SYSTEM_PROMPT = `You are the inbuilt AI Race Engineer inside a professional team telemetry software for F1 25.

Your job is to act like a real race engineer during live sessions: race, qualifying, practice, formation lap, safety car, VSC, in-lap, out-lap, and pit phases.

You are not a generic assistant. You are a high-performance race engineer whose responsibility is to monitor race context, interpret telemetry, identify meaningful developments, compare nearby rivals, adapt to the driver's style, and deliver short, precise, useful instructions at the right time.

Your outputs may be spoken directly to the driver. Every message must therefore be: short, clear, actionable, well timed, relevant to the current moment, free of filler, free of unnecessary explanation.

CORE ROLE: You are the brain of an advanced team telemetry software. Your goal is to improve the race result — not to describe the race.

COMMUNICATION STYLE: Speak like a real F1 race engineer: concise, composed, direct, specific, tactical.
Good: "Car behind has 20% more battery. Defend Turn 1 and protect the exit."
Good: "Front-left is going away. Stop leaning on entry through the long right-handers."
Bad: long paragraphs, motivational speeches, vague commentary, too many numbers at once.

RADIO DISCIPLINE: Maximum 1-2 short sentences. Only speak when it matters for: immediate danger, immediate opportunity, attack/defense situation, tire overheating, critical strategy shift, weather change, major damage.

TACTICAL COMPARISON RULES: When nearby rivals matter, compare in this order: 1) immediate attack/defense threat, 2) battery delta, 3) tire wear delta, 4) damage delta, 5) pace trend. Only mention the top 1-2 differences. Express in relative terms: "Car behind has 20% more battery than you." "You have 12% better front tire life than car ahead."

ATTACK BEHAVIOR: When car ahead is within 1.2s — identify vulnerability (tire wear, overheating, low battery, damage, poor traction), identify best corners, guide battery usage. Avoid impossible moves. Build pressure when pass isn't optimal.

DEFENSE BEHAVIOR: When car behind is within 1.0s — identify if they have DRS, battery advantage, fresher tires. Advise WHERE to defend, not just that threat exists. Consider tire state, damage, straight-line delta.

OUTPUT MODES:
- Default: DRIVER_RADIO — only what should be spoken to driver. Maximum 2 short sentences.
- If asked for ENGINEER_DECISION, return exactly:
  speak: yes/no
  urgency: low/medium/high/critical
  category: incident/strategy/attack/defense/tires/weather/damage/pace/energy/mixed
  reason: <one sentence>
  radio: <max 2 short sentences for the driver>

PRIORITY: 1) Safety/incident, 2) Major damage, 3) Overtake threat or attack opportunity, 4) Pit/weather/tire call, 5) Tire failure risk, 6) ERS tactical, 7) Pace optimization, 8) Technique, 9) Info.

Do NOT invent telemetry not provided. Do NOT force numbers not grounded in input. Do NOT speak for trivial or informational reasons — only speak when it materially affects the race outcome.`;

ipcMain.handle('tts-speak', async (_, { text, voice }) => {
  const communicate = new IsomorphicCommunicate(text, { voice });
  const chunks = [];
  for await (const chunk of communicate.stream()) {
    if (chunk.type === 'audio' && chunk.data) chunks.push(Buffer.from(chunk.data));
  }
  return Buffer.concat(chunks).toString('base64');
});

ipcMain.handle('ask-engineer', async (_, { question, context, mode }) => {
  if (!apiKey) {
    return { error: 'No API key set. Go to Settings and enter your Anthropic API key.' };
  }
  try {
    if (!anthropic) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      anthropic = new Anthropic({ apiKey });
    }

    const contextStr = context
      ? `\nLIVE TELEMETRY CONTEXT:\n${JSON.stringify(context, null, 2)}\n`
      : '';

    const outputMode = mode === 'ENGINEER_DECISION'
      ? '\n\nOUTPUT MODE: ENGINEER_DECISION\nRespond in EXACTLY this format:\nspeak: yes/no\nurgency: low/medium/high/critical\ncategory: <type>\nreason: <one sentence>\nradio: <max 2 short sentences>'
      : '';

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 512,
      system: ENGINEER_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${contextStr}${outputMode}\n\n${question}`,
        },
      ],
    });

    return { response: message.content[0].text };
  } catch (err) {
    return { error: `API error: ${err.message}` };
  }
});

ipcMain.on('set-api-key', (_, key) => {
  apiKey = key.trim();
  anthropic = null; // reset client
});

// --- GPT Realtime AI Engineer -------------------------------------------------
let gptRealtimeEngine = null;
let gptRealtimeSubscriberWindowId = null;

function sendToGptSubscriber(channel, data) {
  if (gptRealtimeSubscriberWindowId == null) return;
  sendToWindow(gptRealtimeSubscriberWindowId, channel, data);
}

function licensePath() {
  return path.join(app.getPath('userData'), 'race-engineer-license.json');
}

function hasCreditPayload(value) {
  return Number.isFinite(Number(value?.creditsRemaining))
    || Number.isFinite(Number(value?.racesRemaining))
    || Number.isFinite(Number(value?.qualifyingRemaining));
}

function getSyncedCredits(value, fallback = 0) {
  return hasCreditPayload(value) ? getResolvedCreditsRemaining(value) : Math.max(0, Number(fallback || 0));
}

function normalizeLicenseMain(license) {
  const normalized = { ...license };
  if (!Array.isArray(normalized.purchases)) normalized.purchases = [];
  if (!Array.isArray(normalized.paymentEvents)) normalized.paymentEvents = [];
  if (!Array.isArray(normalized.processedOrderIds)) normalized.processedOrderIds = [];

  if (!isDevMode()) {
    const hadPersistedDevMode = normalized.devMode === true;
    normalized.devMode = false;
    const activeKey = String(normalized.licenseKey || '').trim().toUpperCase();
    const lastKey = String(normalized.lastIssuedLicenseKey || '').trim().toUpperCase();
    if (hadPersistedDevMode && !activeKey) {
      applySharedCreditAliases(normalized, 0);
      normalized.machineId = null;
    }
    if (activeKey.startsWith('RE-DEV-')) {
      normalized.licenseKey = null;
      normalized.machineId = null;
      applySharedCreditAliases(normalized, 0);
    }
    if (!normalized.licenseKey && lastKey.startsWith('RE-DEV-')) {
      normalized.lastIssuedLicenseKey = null;
    }
  }

  const credits = normalized.devMode || isDevMode()
    ? 999
    : getResolvedCreditsRemaining(normalized);
  applySharedCreditAliases(normalized, credits);

  if (normalized.devMode || isDevMode()) {
    normalized.licenseStatus = 'dev';
    normalized.licenseExhaustedAt = null;
    return normalized;
  }
  if (normalized.byokMode) {
    normalized.licenseStatus = 'byok';
    normalized.licenseExhaustedAt = null;
    return normalized;
  }
  if (!normalized.licenseKey) {
    normalized.licenseStatus = 'no-key';
    normalized.licenseExhaustedAt = null;
    return normalized;
  }

  if ((normalized.creditsRemaining || 0) <= 0) {
    normalized.licenseStatus = 'exhausted';
    normalized.licenseExhaustedAt = normalized.licenseExhaustedAt || new Date().toISOString();
  } else {
    normalized.licenseStatus = 'active';
    normalized.licenseExhaustedAt = null;
  }
  return normalized;
}

function loadLicenseMain() {
  const lic = normalizeLicenseMain(loadLicense(licensePath()));
  if (isDevMode()) {
    lic.devMode = true;
    applySharedCreditAliases(lic, 999);
  }
  return normalizeLicenseMain(lic);
}

/**
 * On startup: validate the stored license key with the Worker.
 * If the Worker says it's not valid on this machine (e.g., admin revoked or
 * machine was deactivated from another device), zero out the credits.
 * Runs silently - if Worker is unreachable, local credits remain.
 */
async function validateLicenseOnStartup() {
  const lic = loadLicenseMain();
  if (!lic.licenseKey || lic.devMode || lic.byokMode) return;
  if (lic.licenseKey.startsWith('RE-DEV-')) return;

  const machineId = getMachineId(app.getPath('userData'));
  try {
    const result = await validateLicenseKey(lic.licenseKey, machineId);
    if (result.valid === false) {
      console.warn('[Race Engineer] License key validation failed:', result.reason);
      const revoked = applySharedCreditAliases({ ...lic, licenseKey: null, machineId: null }, 0);
      const saved = saveLicenseMain(revoked);
      broadcastLicense(saved);
      return;
    }

    if (result.valid === true) {
      const synced = applySharedCreditAliases({
        ...lic,
        machineId,
      }, getSyncedCredits(result, lic.creditsRemaining));
      const saved = saveLicenseMain(synced);
      broadcastLicense(saved);
    }
  } catch {
    // Worker unreachable - keep local credits, try again next startup
  }
}

function saveLicenseMain(license) {
  const normalized = normalizeLicenseMain(license);
  saveLicense(licensePath(), normalized);
  return normalized;
}

function logPaymentEventMain(event) {
  const lic = loadLicenseMain();
  const updated = recordPaymentEvent(lic, event);
  const saved = saveLicenseMain(updated);
  broadcastLicense(saved);
  return saved;
}

function broadcastLicense(license) {
  const normalized = normalizeLicenseMain(license);
  for (const win of allWindows) {
    if (!win.isDestroyed()) win.webContents.send('license-update', normalized);
  }
}

function getPaymentProviders() {
  return [
    {
      id: 'paypal',
      label: 'PayPal',
      configured: isDevMode() || isPayPalConfigured(),
      defaultCurrency: getDefaultPayPalCurrency(),
      supportedCurrencies: getSupportedPayPalCurrencies(),
    },
    {
      id: 'razorpay',
      label: 'Razorpay',
      configured: isDevMode() || isRazorpayConfigured(),
      defaultCurrency: getDefaultRazorpayCurrency(),
      supportedCurrencies: getSupportedRazorpayCurrencies(),
    },
  ];
}

function getPaymentProvider(providerId) {
  const providers = getPaymentProviders();
  const fallback = providers.find((provider) => provider.configured) || providers[0] || {
    id: 'paypal',
    label: 'PayPal',
    configured: isDevMode() || isPayPalConfigured(),
    defaultCurrency: getDefaultPayPalCurrency(),
    supportedCurrencies: getSupportedPayPalCurrencies(),
  };
  return providers.find((provider) => provider.id === providerId) || fallback;
}

ipcMain.handle('get-license', () => loadLicenseMain());
ipcMain.handle('get-pricing-packs', (_, opts) => generateRacePacks(opts));
ipcMain.handle('get-payment-options', () => {
  const providers = getPaymentProviders();
  const defaultProvider = providers.find((provider) => provider.configured) || providers[0] || {
    id: 'paypal',
    label: 'PayPal',
    defaultCurrency: getDefaultPayPalCurrency(),
    supportedCurrencies: getSupportedPayPalCurrencies(),
  };
  return {
    defaultProvider: defaultProvider.id,
    defaultCurrency: defaultProvider.defaultCurrency,
    supportedCurrencies: defaultProvider.supportedCurrencies,
    providers,
  };
});

// Set BYOK mode on/off
ipcMain.handle('set-byok-mode', (_, { enabled }) => {
  const lic = loadLicenseMain();
  const updated = { ...lic, byokMode: !!enabled };
  const saved = saveLicenseMain(updated);
  broadcastLicense(saved);
  return { success: true, license: saved };
});

// -- Hosted checkout providers ------------------------------------------------
const PAYPAL_SUCCESS_URL = 'race-engineer://paypal-success?pack_id={pack_id}';
const PAYPAL_CANCEL_URL  = 'race-engineer://paypal-cancel';
const pendingPaymentOrders = new Map();

ipcMain.handle('stripe-checkout', async (_, { packId, raceLaps, racePercent, activeSituations, currencyCode, provider }) => {
  const paymentProvider = getPaymentProvider(String(provider || '').trim().toLowerCase());
  if (!paymentProvider?.id) return { error: 'No payment provider configured.' };

  const selectedCurrency = String(currencyCode || paymentProvider.defaultCurrency).trim().toUpperCase();
  const packs = generateRacePacks({ raceLaps, racePercent, activeSituations, currencyCode: selectedCurrency });
  const pack = packs.find(p => p.id === packId);
  if (!pack) return { error: `Unknown pack: ${packId}` };

  logPaymentEventMain({
    provider: paymentProvider.id,
    stage: 'checkout_requested',
    level: 'info',
    packId,
    status: `${paymentProvider.label} ${selectedCurrency}`.trim(),
    message: `Checkout requested for ${pack.label} (${pack.priceDisplay}).`,
  });

  let result;
  if (paymentProvider.id === 'razorpay') {
    result = await createRazorpayPaymentLink(pack, { currencyCode: selectedCurrency });
  } else {
    const returnUrl = PAYPAL_SUCCESS_URL.replace('{pack_id}', packId);
    result = await createPayPalOrder(pack, returnUrl, PAYPAL_CANCEL_URL, { currencyCode: selectedCurrency });
  }

  if (result?.error) {
    logPaymentEventMain({
      provider: paymentProvider.id,
      stage: 'order_create_failed',
      level: 'error',
      packId,
      status: `${paymentProvider.label} ${selectedCurrency}`.trim(),
      message: `${paymentProvider.label} checkout creation failed: ${result.error}`,
    });
    return { error: result.error };
  }

  pendingPaymentOrders.set(result.orderId, {
    provider: paymentProvider.id,
    packId,
    raceLaps,
    racePercent,
    activeSituations,
    currencyCode: result.currencyCode || selectedCurrency,
  });

  logPaymentEventMain({
    provider: paymentProvider.id,
    stage: 'order_created',
    level: 'info',
    orderId: result.orderId,
    packId,
    status: `${paymentProvider.label} ${result.currencyCode || selectedCurrency} ${result.amountValue || ''}`.trim(),
    message: `${paymentProvider.label} checkout created.`,
  });

  return {
    url: result.url,
    orderId: result.orderId,
    provider: paymentProvider.id,
    currencyCode: result.currencyCode || selectedCurrency,
    amountValue: result.amountValue || null,
  };
});

ipcMain.handle('stripe-verify-session', async (_, { sessionId: orderId, packId, raceLaps, racePercent, activeSituations, currencyCode, provider }) => {
  const pendingOrder = pendingPaymentOrders.get(orderId);
  const paymentProvider = getPaymentProvider(String(provider || pendingOrder?.provider || '').trim().toLowerCase());
  const requestedPackId = packId || pendingOrder?.packId || null;
  const requestedCurrency = String(currencyCode || pendingOrder?.currencyCode || paymentProvider.defaultCurrency)
    .trim()
    .toUpperCase();

  logPaymentEventMain({
    provider: paymentProvider.id,
    stage: 'verify_requested',
    level: 'info',
    orderId,
    packId: requestedPackId,
    status: `${paymentProvider.label} ${requestedCurrency}`.trim(),
    message: 'Payment verification requested.',
  });

  const existing = loadLicenseMain();
  if (Array.isArray(existing.processedOrderIds) && existing.processedOrderIds.includes(orderId)) {
    return {
      success: true,
      duplicate: true,
      license: existing,
      licenseKey: existing.lastIssuedLicenseKey || existing.licenseKey || null,
    };
  }

  const captured = paymentProvider.id === 'razorpay'
    ? await fetchRazorpayPaymentLink(orderId)
    : await capturePayPalOrder(orderId, requestedPackId);

  if (!captured.success) {
    if (captured.pending) {
      logPaymentEventMain({
        provider: paymentProvider.id,
        stage: 'verify_pending',
        level: 'info',
        orderId,
        packId: requestedPackId,
        status: `${paymentProvider.label} ${captured.status || 'PENDING'} ${requestedCurrency}`.trim(),
        message: captured.error || 'Payment is not completed yet.',
      });
      return {
        pending: true,
        status: captured.status || null,
        error: captured.error || 'Payment not completed yet',
      };
    }
    logPaymentEventMain({
      provider: paymentProvider.id,
      stage: 'verify_failed',
      level: 'error',
      orderId,
      packId: requestedPackId,
      status: `${paymentProvider.label} ${captured.status || 'FAILED'} ${requestedCurrency}`.trim(),
      message: captured.error || 'Payment capture failed',
    });
    return { error: captured.error || 'Payment capture failed' };
  }

  const resolvedPackId = captured.packId || requestedPackId;
  const resolvedCurrency = String(captured.currencyCode || requestedCurrency || paymentProvider.defaultCurrency)
    .trim()
    .toUpperCase();
  const packs = generateRacePacks({ raceLaps, racePercent, activeSituations, currencyCode: resolvedCurrency });
  const pack = packs.find(p => p.id === resolvedPackId || p.id === requestedPackId);
  if (!pack) {
    logPaymentEventMain({
      provider: paymentProvider.id,
      stage: 'verify_failed',
      level: 'error',
      orderId,
      packId: resolvedPackId || requestedPackId,
      status: `${paymentProvider.label} ${captured.paymentStatus || 'COMPLETED'} ${resolvedCurrency}`.trim(),
      message: `Unknown pack after capture: ${resolvedPackId}`,
    });
    return { error: `Unknown pack after capture: ${resolvedPackId}` };
  }
  pendingPaymentOrders.delete(orderId);

  let licenseKey = null;
  let activationResult = null;
  let activationWarning = null;
  if (isDevMode() || String(orderId || '').startsWith('DEV_')) {
    licenseKey = `RE-DEV-SESSION-${pack.count}`;
  } else {
    licenseKey = generateLicenseKeyFromOrder(orderId);
    const registered = await registerLicenseKey(licenseKey, pack, captured.txId);
    const alreadyRegistered = /already registered/i.test(String(registered?.error || ''));
    if (!registered?.success && !alreadyRegistered) {
      logPaymentEventMain({
        provider: paymentProvider.id,
        stage: 'license_register_failed',
        level: 'error',
        orderId,
        packId: pack.id,
        txId: captured.txId,
        licenseKey,
        message: registered?.error || 'Failed to register license key with worker.',
      });
      return { error: registered?.error || 'License registration failed after payment capture.' };
    }
    const machineId = getMachineId(app.getPath('userData'));
    const { hostname } = await import('node:os');
    activationResult = await activateLicenseKey(licenseKey, machineId, hostname());
    if (!activationResult?.success) {
      activationWarning = activationResult?.error || 'Failed to auto-activate license key.';
      logPaymentEventMain({
        provider: paymentProvider.id,
        stage: 'license_activation_pending',
        level: 'warn',
        orderId,
        packId: pack.id,
        txId: captured.txId,
        licenseKey,
        status: `${paymentProvider.label} ${resolvedCurrency}`.trim(),
        message: `${activationWarning} You can still activate this key manually from Settings.`,
      });
    }
  }

  const lic = loadLicenseMain();
  if (Array.isArray(lic.processedOrderIds) && lic.processedOrderIds.includes(orderId)) {
    return {
      success: true,
      duplicate: true,
      license: lic,
      licenseKey: lic.lastIssuedLicenseKey || lic.licenseKey || null,
    };
  }

  const activationSucceeded = isDevMode() || String(orderId || '').startsWith('DEV_') || !!activationResult?.success;
  const statusText = `${paymentProvider.label} ${captured.paymentStatus || 'COMPLETED'} ${captured.currencyCode || resolvedCurrency} ${captured.amountValue || ''}`.trim();
  const updated = activationSucceeded
    ? applyPurchase(lic, pack, captured.txId, {
      provider: paymentProvider.id,
      amount: captured.amountValue ? `${captured.currencyCode || resolvedCurrency} ${captured.amountValue}`.trim() : pack.priceDisplay,
      currencyCode: captured.currencyCode || resolvedCurrency,
    })
    : { ...lic };
  updated.processedOrderIds = [...(updated.processedOrderIds || []), orderId].slice(-300);
  if (activationResult?.success) {
    applySharedCreditAliases(updated, getSyncedCredits(activationResult, updated.creditsRemaining));
  }
  if (licenseKey) {
    const purchases = updated.purchases || [];
    if (activationSucceeded && purchases.length > 0) purchases[purchases.length - 1].licenseKey = licenseKey;
    if (activationSucceeded) updated.licenseKey = licenseKey;
    updated.lastIssuedLicenseKey = licenseKey;
  }
  saveLicenseMain(updated);

  const withEvent = logPaymentEventMain({
    provider: paymentProvider.id,
    stage: activationSucceeded ? 'payment_captured' : 'payment_captured_needs_activation',
    level: activationSucceeded ? 'success' : 'warn',
    orderId,
    packId: pack.id,
    txId: captured.txId,
    status: statusText,
    licenseKey,
    message: activationSucceeded
      ? `Payment captured and credits granted (${pack.label}).`
      : `Payment captured for ${pack.label}. Activate key ${licenseKey} in Settings to use credits on this machine.`,
  });
  return {
    success: true,
    license: withEvent,
    licenseKey,
    provider: paymentProvider.id,
    needsActivation: !activationSucceeded,
    warning: activationWarning,
  };
});

ipcMain.handle('start-dev-session', () => {
  if (!isDevMode()) return { error: 'Dev mode not active' };
  const lic = loadLicenseMain();
  const updated = applySharedCreditAliases({ ...lic, devMode: true }, 999);
  saveLicenseMain(updated);
  broadcastLicense(updated);
  return { success: true, license: updated };
});

ipcMain.handle('activate-license-key', async (_, { licenseKey }) => {
  if (!licenseKey || typeof licenseKey !== 'string') return { error: 'Invalid license key.' };
  const key = licenseKey.trim().toUpperCase();
  if (!key.startsWith('RE-')) return { error: 'License key must start with RE-' };

  const machineId = getMachineId(app.getPath('userData'));
  const { hostname } = await import('node:os');
  const machineLabel = hostname();

  const result = await activateLicenseKey(key, machineId, machineLabel);
  if (!result.success) return { error: result.error || 'Activation failed.' };

  const lic = loadLicenseMain();
  const alreadyRedeemed = (lic.purchases || []).some(p => p.txId === key);
  let updated = { ...lic };

  if (hasCreditPayload(result)) {
    updated = applySharedCreditAliases(updated, getSyncedCredits(result, updated.creditsRemaining));
  } else if (!alreadyRedeemed) {
    const pack = { id: result.packId || key, type: result.packType || 'session', count: result.packCount };
    updated = applyPurchase(updated, pack, key);
  }

  updated.licenseKey = key;
  updated.machineId = machineId;
  updated.lastIssuedLicenseKey = updated.lastIssuedLicenseKey || key;
  const saved = saveLicenseMain(updated);
  const logged = logPaymentEventMain({
    stage: 'license_activated',
    level: 'info',
    packId: result.packId || null,
    licenseKey: key,
    status: result.mode || 'activated',
    message: alreadyRedeemed
      ? 'License activated. Existing remaining credits synced.'
      : 'License activated successfully.',
  });
  const creditsRemaining = getSyncedCredits(result, saved.creditsRemaining);
  return {
    success: true,
    license: logged || saved,
    packType: result.packType || 'session',
    packCount: result.packCount,
    creditsRemaining,
    racesRemaining: creditsRemaining,
    qualifyingRemaining: creditsRemaining,
    exhausted: result.exhausted,
  };
});

ipcMain.handle('deactivate-license-key', async () => {
  const lic = loadLicenseMain();
  if (!lic.licenseKey) return { error: 'No active license key on this machine.' };
  const machineId = getMachineId(app.getPath('userData'));
  const result = await deactivateLicenseKey(lic.licenseKey, machineId);
  if (!result.success) return { error: result.error || 'Deactivation failed.' };
  // Clear license locally
  const updated = { ...lic, licenseKey: null, machineId: null };
  saveLicenseMain(updated);
  const logged = logPaymentEventMain({
    stage: 'license_deactivated',
    level: 'info',
    message: 'License deactivated on this machine.',
  });
  return { success: true, license: logged };
});

ipcMain.handle('gpt-realtime-connect', async (event, { userApiKey, voice, sessionType }) => {
  const lic = loadLicenseMain();
  const sType = sessionType || 'race';

  const isByok = lic.byokMode && userApiKey;
  const keyToUse = isByok ? userApiKey : YOUR_APP_OPENAI_KEY;
  const requiresLiveLicense = !isByok && !lic.devMode && !isDevMode();

  if (requiresLiveLicense && !lic.licenseKey) {
    return {
      error: 'No active license key. Activate a license key in Settings or buy a pack first.',
      code: 'NO_LICENSE_KEY',
      needsNewKey: true,
      creditsRemaining: lic.creditsRemaining || 0,
      racesRemaining: lic.creditsRemaining || 0,
      qualifyingRemaining: lic.creditsRemaining || 0,
    };
  }

  if (!isByok && !hasCredits(lic, sType)) {
    const exhausted = !!lic.licenseKey && (lic.creditsRemaining || 0) <= 0;
    return {
      error: exhausted
        ? 'Your current license key has no credits left. Activate a new key or buy another pack.'
        : 'No AI Engineer credits. Buy a credit pack or use your own OpenAI key (BYOK mode).',
      code: exhausted ? 'LICENSE_EXHAUSTED' : 'NO_CREDITS',
      needsNewKey: exhausted,
      creditsRemaining: lic.creditsRemaining || 0,
      racesRemaining: lic.creditsRemaining || 0,
      qualifyingRemaining: lic.creditsRemaining || 0,
    };
  }
  if (!isByok && !keyToUse) {
    return { error: 'App OpenAI key not configured. Contact support or use your own key.' };
  }
  if (isByok && !userApiKey) {
    return { error: 'Enter your OpenAI API key in Settings to use BYOK mode.' };
  }

  let updated = lic;
  let consumedViaWorker = false;
  let consumedMachineId = null;
  if (!isByok) {
    const requiresWorkerAuthority = requiresLiveLicense && !!lic.licenseKey && !lic.licenseKey.startsWith('RE-DEV-');
    if (requiresWorkerAuthority) {
      const machineId = getMachineId(app.getPath('userData'));
      const consumed = await consumeLicenseKeyCredit(lic.licenseKey, machineId, sType);
      if (consumed?.success) {
        consumedViaWorker = true;
        consumedMachineId = machineId;
        updated = applySharedCreditAliases({ ...lic }, getSyncedCredits(consumed, lic.creditsRemaining));
      } else if (consumed?.code === 'NO_CREDITS' || consumed?.code === 'NO_RACE_CREDITS' || consumed?.code === 'NO_QUALIFYING_CREDITS') {
        updated = applySharedCreditAliases({ ...lic }, getSyncedCredits(consumed, lic.creditsRemaining));
        const saved = saveLicenseMain(updated);
        broadcastLicense(saved);
        const exhausted = (saved.creditsRemaining || 0) <= 0;
        return {
          error: consumed.error || 'No credits remaining on this license key.',
          code: consumed.code || (exhausted ? 'LICENSE_EXHAUSTED' : 'NO_CREDITS'),
          needsNewKey: exhausted,
          creditsRemaining: saved.creditsRemaining || 0,
          racesRemaining: saved.creditsRemaining || 0,
          qualifyingRemaining: saved.creditsRemaining || 0,
        };
      } else {
        const serverUnavailable = consumed?.code === 'LICENSE_SERVER_UNAVAILABLE'
          || consumed?.code === 'LICENSE_SERVER_UNREACHABLE';
        logPaymentEventMain({
          stage: serverUnavailable ? 'license_server_unreachable' : 'license_consume_failed',
          level: 'error',
          licenseKey: lic.licenseKey,
          message: serverUnavailable
            ? ((consumed?.error || 'License server unavailable.') + ' AI Engineer is blocked until the license server is reachable.')
            : (consumed?.error || 'Failed to validate remaining credits for this license key.'),
        });
        return {
          error: serverUnavailable
            ? 'License server is unreachable. AI Engineer is unavailable until the license server connection is restored.'
            : (consumed?.error || 'Failed to validate remaining credits for this license key.'),
          code: consumed?.code || 'LICENSE_CONSUME_FAILED',
          needsNewKey: false,
          creditsRemaining: lic.creditsRemaining || 0,
          racesRemaining: lic.creditsRemaining || 0,
          qualifyingRemaining: lic.creditsRemaining || 0,
        };
      }
    } else {
      updated = consumeCredit(lic, sType);
    }
    const saved = saveLicenseMain(updated);
    broadcastLicense(saved);
    updated = saved;
  }

  if (gptRealtimeEngine) {
    try { gptRealtimeEngine.disconnect(); } catch { /**/ }
    gptRealtimeEngine = null;
  }

  gptRealtimeEngine = new GptRealtimeEngineer();
  gptRealtimeSubscriberWindowId = event.sender.id;

  gptRealtimeEngine.onAudioChunk = (chunk) => {
    sendToGptSubscriber('gpt-audio-chunk', { chunk });
  };
  gptRealtimeEngine.onTranscript = (text, done) => {
    sendToGptSubscriber('gpt-transcript', { text, done });
  };
  gptRealtimeEngine.onStatusChange = (status) => {
    sendToGptSubscriber('gpt-status', { status });
    for (const win of allWindows) {
      if (!win.isDestroyed()) win.webContents.send('gpt-status', { status });
    }
  };

  try {
    await gptRealtimeEngine.connect(keyToUse, voice || 'echo');
    return {
      success: true,
      mode: isByok ? 'byok' : 'subscription',
      creditsRemaining: isByok ? null : (updated.creditsRemaining ?? 0),
    };
  } catch (err) {
    if (!isByok) {
      if (consumedViaWorker && lic.licenseKey && consumedMachineId) {
        const refundedRemote = await refundLicenseKeyCredit(lic.licenseKey, consumedMachineId, sType);
        const refunded = applySharedCreditAliases({ ...updated }, getSyncedCredits(refundedRemote, updated.creditsRemaining));
        const saved = saveLicenseMain(refunded);
        broadcastLicense(saved);
      } else {
        const refunded = applySharedCreditAliases({ ...updated }, (updated.creditsRemaining || 0) + 1);
        const saved = saveLicenseMain(refunded);
        broadcastLicense(saved);
      }
    }
    return { error: 'GPT Realtime connection failed: ' + err.message };
  }
});

ipcMain.handle('gpt-realtime-disconnect', () => {
  if (gptRealtimeEngine) {
    gptRealtimeEngine.disconnect();
    gptRealtimeEngine = null;
  }
  gptRealtimeSubscriberWindowId = null;
  return { success: true };
});

ipcMain.handle('gpt-realtime-push', (_, payload) => {
  if (!gptRealtimeEngine?.connected) return { error: 'Not connected' };
  gptRealtimeEngine.pushTelemetry(payload);
  return { success: true };
});

ipcMain.handle('gpt-realtime-status', () => ({
  connected: gptRealtimeEngine?.connected ?? false,
}));

// ─── Settings persistence ────────────────────────────────────────────────────
function settingsPath() {
  return path.join(app.getPath('userData'), 'race-engineer-settings.json');
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────
// -- Deep link protocol for PayPal redirect -----------------------------------
// PayPal redirects to race-engineer://paypal-success?token=ORDER_ID&pack_id=...
// Electron intercepts this and sends it to the renderer via IPC.
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('race-engineer', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('race-engineer');
}

// macOS / Linux: open-url event
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

function handleDeepLink(url) {
  try {
    const parsed = new URL(url);
    if (parsed.host === 'paypal-success') {
      const provider = parsed.searchParams.get('provider') || 'paypal';
      const orderId = parsed.searchParams.get('token');
      const packId  = parsed.searchParams.get('pack_id');
      logPaymentEventMain({
        provider,
        stage: 'checkout_return_success',
        level: 'info',
        orderId: orderId || undefined,
        packId: packId || undefined,
        status: 'APPROVED',
        message: `${provider === 'razorpay' ? 'Razorpay' : 'PayPal'} returned success callback to app.`,
      });
      for (const win of allWindows) {
        if (!win.isDestroyed()) {
          win.webContents.send('stripe-return', { success: true, sessionId: orderId, packId, provider });
          win.focus();
        }
      }
      closeCheckoutWindow();
    } else if (parsed.host === 'paypal-cancel') {
      const orderId = parsed.searchParams.get('token');
      const packId  = parsed.searchParams.get('pack_id');
      logPaymentEventMain({
        provider: 'paypal',
        stage: 'checkout_cancelled',
        level: 'warn',
        orderId: orderId || undefined,
        packId: packId || undefined,
        status: 'CANCELLED',
        message: 'PayPal checkout was cancelled.',
      });
      for (const win of allWindows) {
        if (!win.isDestroyed()) win.webContents.send('stripe-return', { success: false, cancelled: true, provider: 'paypal' });
      }
      closeCheckoutWindow();
    }
  } catch { /**/ }
}

app.whenReady().then(() => {
  createWindow();
  // Validate license key with backend on startup (non-blocking)
  validateLicenseOnStartup().catch(() => {});

  // Windows: deep link comes via second-instance event
  app.on('second-instance', (_, commandLine) => {
    const url = commandLine.find(a => a.startsWith('race-engineer://'));
    if (url) handleDeepLink(url);
    // Bring main window to front
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  ipcMain.handle('load-settings', () => {
    try {
      const raw = fs.readFileSync(settingsPath(), 'utf8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  });

  ipcMain.on('save-settings', (_, settings) => {
    try {
      fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8');
    } catch (e) {
      console.error('[Race Engineer] Failed to save settings:', e.message);
    }
  });

  ipcMain.on('start-telemetry', (event, port) => {
    startTelemetryForWindow(event.sender.id, port);
  });
  ipcMain.on('stop-telemetry', (event) => {
    stopTelemetryForWindow(event.sender.id);
  });
  ipcMain.on('set-manual-track', (_, trackId) => {
    manualTrackId = trackId === -1 ? null : trackId;
    console.log(`[Race Engineer] Manual track override: ${trackId === -1 ? 'Auto-detect' : TRACK_NAMES[trackId] || trackId}`);
    for (const context of telemetryContexts.values()) {
      if (context.state.sessionData) {
        if (manualTrackId !== null) context.state.sessionData.trackId = manualTrackId;
        broadcastSession(context);
      }
    }
  });

  // Expose lookup tables to renderer
  ipcMain.handle('get-lookups', () => ({ TRACK_NAMES, SESSION_TYPES, WEATHER, TEAM_COLORS, TYRE_COMPOUNDS, ACTUAL_COMPOUNDS }));

  // Open URL in system browser (for Stripe Checkout)
  ipcMain.handle('open-external', async (_, url) => {
    if (typeof url !== 'string' || !url.trim()) return { error: 'Invalid checkout URL.' };
    const checkoutUrl = url.trim();

    if (checkoutUrl.startsWith('race-engineer://')) {
      handleDeepLink(checkoutUrl);
      return { success: true, mode: 'deep-link' };
    }

    try {
      const parsed = new URL(checkoutUrl);
      if (!/^https?:$/.test(parsed.protocol)) return { error: 'Only HTTP(S) checkout URLs are allowed.' };
    } catch {
      return { error: 'Invalid checkout URL.' };
    }

    try {
      if (isPayPalCheckoutUrl(checkoutUrl) || isRazorpayCheckoutUrl(checkoutUrl)) {
        let matchedOrderId = null;
        let provider = 'paypal';
        try {
          const parsed = new URL(checkoutUrl);
          matchedOrderId = parsed.searchParams.get('token');
          const host = parsed.hostname.toLowerCase();
          if (host.includes('razorpay.com')) provider = 'razorpay';
        } catch { /**/ }
        logPaymentEventMain({
          provider,
          stage: 'checkout_opened',
          level: 'info',
          orderId: matchedOrderId || undefined,
          message: `Opened ${provider === 'razorpay' ? 'Razorpay' : 'PayPal'} checkout in external browser.`,
        });
        closeCheckoutWindow();
        const { shell } = await import('electron');
        await shell.openExternal(checkoutUrl, { activate: true });
        return { success: true, mode: 'external' };
      }
      const { shell } = await import('electron');
      await shell.openExternal(checkoutUrl, { activate: true });
      return { success: true, mode: 'external' };
    } catch (e) {
      return { error: `Failed to open checkout: ${e.message}` };
    }
  });

  // Open a detached child window for a specific page
  ipcMain.handle('open-window', (event, { page, title, width, height }) => {
    const fallbackTitles = {
      dashboard: 'Dashboard',
      timing: 'Timing Tower',
      trackmap: 'Track Map',
      vehicle: 'Vehicle Status',
      session: 'Session',
      engineer: 'AI Engineer',
      radio: 'Radio Config',
      settings: 'Settings',
    };
    const pageKey = String(page || '').trim().toLowerCase();
    const safeTitle = typeof title === 'string' ? title.trim() : '';
    const fixedTitle = fallbackTitles[pageKey] || safeTitle || 'Race Engineer';
    const child = new BrowserWindow({
      width: width || 1000,
      height: height || 700,
      minWidth: 600,
      minHeight: 400,
      backgroundColor: '#050509',
      title: fixedTitle,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
      },
    });
    const childWindowId = child.webContents.id;
    child.setTitle(fixedTitle);
    allWindows.add(child);
    child.on('closed', () => {
      stopTelemetryForWindow(childWindowId, false);
      allWindows.delete(child);
    });
    child.on('page-title-updated', (e) => {
      e.preventDefault();
      child.setTitle(fixedTitle);
    });
    child.webContents.on('did-navigate', () => child.setTitle(fixedTitle));
    child.webContents.on('did-navigate-in-page', () => child.setTitle(fixedTitle));
    loadWindowURL(child, `detach=${encodeURIComponent(pageKey)}&title=${encodeURIComponent(fixedTitle)}`);

    // Keep detached window title fixed and inherit source window telemetry context if present.
    child.webContents.once('did-finish-load', () => {
      child.setTitle(fixedTitle);
      const sourceContext = getContextForWindow(event.sender.id);
      if (sourceContext) {
        attachWindowToPort(child.webContents.id, sourceContext.port);
      }
    });
  });

  ipcMain.on('set-window-title', (event, rawTitle) => {
    const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
    if (!title) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.setTitle(title);
    }
  });

  ipcMain.handle('save-export-file', async (_event, payload = {}) => {
    const defaultName = typeof payload.defaultName === 'string' && payload.defaultName.trim()
      ? payload.defaultName.trim()
      : 'race-engineer-export.csv';
    const filters = Array.isArray(payload.filters) && payload.filters.length > 0
      ? payload.filters
      : [{ name: 'CSV', extensions: ['csv'] }];
    const content = typeof payload.content === 'string' ? payload.content : '';
    if (!content) return { error: 'No export content to save.' };

    const suggestedPath = path.join(app.getPath('documents'), defaultName);
    try {
      const result = await dialog.showSaveDialog({
        title: 'Export Race Data',
        defaultPath: suggestedPath,
        filters,
      });
      if (result.canceled || !result.filePath) return { cancelled: true };

      await fs.promises.writeFile(result.filePath, content, 'utf8');
      return { success: true, filePath: result.filePath };
    } catch (error) {
      return { error: error.message || 'Failed to save export file.' };
    }
  });
  // Provide current telemetry state snapshot (for windows that load late)
  ipcMain.handle('get-state-snapshot', (event) => {
    const context = getContextForWindow(event.sender.id);
    if (!context) {
      return {
        sessionData: null,
        participants: null,
        lapData: null,
        playerCarIndex: 0,
        bestLapTimes: {},
        fastestLap: null,
      };
    }
    const s = context.state;
    return {
      sessionData: s.sessionData,
      participants: s.participants,
      lapData: s.lapData,
      playerCarIndex: s.playerCarIndex,
      bestLapTimes: s.bestLapTimes,
      fastestLap: s.fastestLap,
    };
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  for (const context of telemetryContexts.values()) {
    try { context.socket.close(); } catch { /**/ }
  }
  telemetryContexts.clear();
  windowPortMap.clear();
  if (process.platform !== 'darwin') app.quit();
});




import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import dgram from 'node:dgram';
import started from 'electron-squirrel-startup';

if (started) app.quit();

// ─── Constants ────────────────────────────────────────────────────────────────
const TELEMETRY_PORT = 20777;
const PACKET_HEADER_SIZE = 29;
const MAX_CARS = 22;

// Bytes per car in each packet type (F1 24/25)
const LAP_DATA_SIZE = 57;
const CAR_TELEMETRY_SIZE = 60;
const CAR_STATUS_SIZE = 55;
const CAR_DAMAGE_SIZE = 40;
const PARTICIPANT_SIZE = 60;

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

const TYRE_COMPOUNDS = {
  16: { label: 'S', name: 'Soft',         color: '#FF3333' },
  17: { label: 'M', name: 'Medium',       color: '#FFD700' },
  18: { label: 'H', name: 'Hard',         color: '#CCCCCC' },
  7:  { label: 'I', name: 'Intermediate', color: '#39B54A' },
  8:  { label: 'W', name: 'Wet',          color: '#4477FF' },
};

// ─── App State ────────────────────────────────────────────────────────────────
const state = {
  sessionData: null,
  participants: null,
  lapData: null,
  carTelemetry: null,
  carStatus: null,
  carDamage: null,
  playerCarIndex: 0,
};

// ─── Electron Setup ───────────────────────────────────────────────────────────
let mainWindow;
let telemetrySocket = null;
let anthropic = null;
let apiKey = process.env.ANTHROPIC_API_KEY || null;

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

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }
};

// ─── Packet Parsing ───────────────────────────────────────────────────────────
function parseHeader(msg) {
  return {
    packetId: msg.readUInt8(5),
    playerCarIndex: msg.readUInt8(27),
    secondaryPlayerCarIndex: msg.readUInt8(28),
  };
}

function parseSession(msg) {
  const d = PACKET_HEADER_SIZE;
  if (msg.length < d + 20) return null;
  try {
    return {
      weather: msg.readUInt8(d + 0),
      trackTemperature: msg.readInt8(d + 1),
      airTemperature: msg.readInt8(d + 2),
      totalLaps: msg.readUInt8(d + 3),
      trackLength: msg.readUInt16LE(d + 4),
      sessionType: msg.readUInt8(d + 6),
      trackId: msg.readInt8(d + 7),
      formula: msg.readUInt8(d + 8),
      sessionTimeLeft: msg.readUInt16LE(d + 9),
      sessionDuration: msg.readUInt16LE(d + 11),
      pitSpeedLimit: msg.readUInt8(d + 13),
      gamePaused: msg.readUInt8(d + 14),
      isSpectating: msg.readUInt8(d + 15),
      spectatorCarIndex: msg.readUInt8(d + 16),
      // Safety car status sits after marshal zones & weather samples
      // approximate offset ~122 for F1 24
      safetyCarStatus: msg.length > d + 122 ? msg.readUInt8(d + 122) : 0,
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
  const d = PACKET_HEADER_SIZE;
  if (msg.length < d + 1) return null;
  try {
    const numActiveCars = msg.readUInt8(d + 0);
    const participants = [];
    for (let i = 0; i < Math.min(numActiveCars, MAX_CARS); i++) {
      const o = d + 1 + i * PARTICIPANT_SIZE;
      if (o + PARTICIPANT_SIZE > msg.length) break;
      try {
        const nameSlice = msg.slice(o + 7, o + 7 + 48);
        const nullIdx = nameSlice.indexOf(0);
        const name = nameSlice.slice(0, nullIdx >= 0 ? nullIdx : 48).toString('utf8');
        participants.push({
          aiControlled: msg.readUInt8(o + 0),
          driverId:     msg.readUInt8(o + 1),
          networkId:    msg.readUInt8(o + 2),
          teamId:       msg.readUInt8(o + 3),
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
  const d = PACKET_HEADER_SIZE;
  const cars = [];
  for (let i = 0; i < MAX_CARS; i++) {
    const o = d + i * CAR_DAMAGE_SIZE;
    if (o + CAR_DAMAGE_SIZE > msg.length) break;
    try {
      cars.push({
        // tyre wear %: RL RR FL FR
        tyresWear: [
          msg.readFloatLE(o + 0),
          msg.readFloatLE(o + 4),
          msg.readFloatLE(o + 8),
          msg.readFloatLE(o + 12),
        ],
        tyresDamage: [
          msg.readUInt8(o + 16),
          msg.readUInt8(o + 17),
          msg.readUInt8(o + 18),
          msg.readUInt8(o + 19),
        ],
        brakesDamage: [msg.readUInt8(o + 20), msg.readUInt8(o + 21)],
        frontLeftWingDamage:  msg.readUInt8(o + 22),
        frontRightWingDamage: msg.readUInt8(o + 23),
        rearWingDamage:       msg.readUInt8(o + 24),
        floorDamage:          msg.readUInt8(o + 25),
        diffuserDamage:       msg.readUInt8(o + 26),
        sidepodDamage:        msg.readUInt8(o + 27),
        drsFault:             msg.readUInt8(o + 28),
        ersFault:             msg.readUInt8(o + 29),
        gearBoxDamage:        msg.readUInt8(o + 30),
        engineDamage:         msg.readUInt8(o + 31),
        engineMGUHWear:       msg.readUInt8(o + 32),
        engineESWear:         msg.readUInt8(o + 33),
        engineCEWear:         msg.readUInt8(o + 34),
        engineICEWear:        msg.readUInt8(o + 35),
        engineMGUKWear:       msg.readUInt8(o + 36),
        engineTCWear:         msg.readUInt8(o + 37),
      });
    } catch {
      cars.push(null);
    }
  }
  return cars;
}

// ─── IPC Broadcast helpers ────────────────────────────────────────────────────
function send(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function broadcastLapData() {
  send('lap-update', { lapData: state.lapData, playerCarIndex: state.playerCarIndex });
}

function broadcastTelemetry() {
  const t = state.carTelemetry?.[state.playerCarIndex];
  if (t) send('telemetry-update', t);
}

function broadcastStatus() {
  const s = state.carStatus?.[state.playerCarIndex];
  if (s) send('status-update', s);
  // Also broadcast all cars' status so renderer can show rivals' tyres
  if (state.carStatus) send('allstatus-update', state.carStatus);
}

function broadcastDamage() {
  const dmg = state.carDamage?.[state.playerCarIndex];
  if (dmg) send('damage-update', dmg);
}

function broadcastParticipants() {
  send('participants-update', state.participants);
}

function broadcastSession() {
  if (state.sessionData) {
    send('session-update', {
      ...state.sessionData,
      playerCarIndex: state.playerCarIndex,
      trackName: TRACK_NAMES[state.sessionData.trackId] || `Track ${state.sessionData.trackId}`,
      sessionTypeName: SESSION_TYPES[state.sessionData.sessionType] || 'Unknown',
      weatherName: WEATHER[state.sessionData.weather] || 'Clear',
    });
  }
}

// Send session every 2s (it changes slowly)
setInterval(broadcastSession, 2000);

// ─── Telemetry Socket ─────────────────────────────────────────────────────────
const startTelemetry = () => {
  if (telemetrySocket) return;

  telemetrySocket = dgram.createSocket('udp4');

  telemetrySocket.on('error', (err) => {
    console.error('Telemetry socket error:', err);
    try { telemetrySocket.close(); } catch { /**/ }
    telemetrySocket = null;
  });

  telemetrySocket.on('message', (msg) => {
    try {
      if (msg.length < PACKET_HEADER_SIZE) return;
      const header = parseHeader(msg);
      state.playerCarIndex = header.playerCarIndex < MAX_CARS ? header.playerCarIndex : 0;

      switch (header.packetId) {
        case 1: {
          const s = parseSession(msg);
          if (s) { state.sessionData = s; broadcastSession(); }
          break;
        }
        case 2: {
          const l = parseLapData(msg);
          if (l) { state.lapData = l; broadcastLapData(); }
          break;
        }
        case 4: {
          const p = parseParticipants(msg);
          if (p) { state.participants = p; broadcastParticipants(); }
          break;
        }
        case 6: {
          const t = parseCarTelemetry(msg);
          if (t) { state.carTelemetry = t; broadcastTelemetry(); }
          break;
        }
        case 7: {
          const cs = parseCarStatus(msg);
          if (cs) { state.carStatus = cs; broadcastStatus(); }
          break;
        }
        case 10: {
          const dmg = parseCarDamage(msg);
          if (dmg) { state.carDamage = dmg; broadcastDamage(); }
          break;
        }
      }
    } catch { /**/ }
  });

  telemetrySocket.bind(TELEMETRY_PORT, () => {
    console.log(`[Race Engineer] Listening on UDP :${TELEMETRY_PORT}`);
    send('telemetry-started', { port: TELEMETRY_PORT });
  });
};

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

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();

  ipcMain.on('start-telemetry', () => startTelemetry());

  // Expose lookup tables to renderer
  ipcMain.handle('get-lookups', () => ({ TRACK_NAMES, SESSION_TYPES, WEATHER, TEAM_COLORS, TYRE_COMPOUNDS }));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

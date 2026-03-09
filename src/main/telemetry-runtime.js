import dgram from 'node:dgram';
import { TRACK_NAMES, SESSION_TYPES, WEATHER } from './lookups.js';
import {
  DEFAULT_TELEMETRY_PORT,
  PACKET_HEADER_SIZE,
  MAX_CARS,
  parseHeader,
  parseSession,
  parseLapData,
  parseParticipants,
  parseCarTelemetry,
  parseCarStatus,
  parseCarDamage,
  parseEvent,
  parseSessionHistory,
  createTelemetryState,
} from './telemetry-parser.js';

export function createTelemetryRuntime({ allWindows }) {
  const telemetryContexts = new Map();
  const windowPortMap = new Map();
  let manualTrackId = null;

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
    const state = context.state;
    sendToSubscribers(context, 'lap-update', { lapData: state.lapData, playerCarIndex: state.playerCarIndex });
  }

  function broadcastTelemetry(context) {
    const state = context.state;
    const telemetry = state.carTelemetry?.[state.playerCarIndex];
    if (telemetry) sendToSubscribers(context, 'telemetry-update', telemetry);
    if (state.carTelemetry) sendToSubscribers(context, 'alltelemetry-update', state.carTelemetry);
  }

  function broadcastStatus(context) {
    const state = context.state;
    const status = state.carStatus?.[state.playerCarIndex];
    if (status) sendToSubscribers(context, 'status-update', status);
    if (state.carStatus) sendToSubscribers(context, 'allstatus-update', state.carStatus);
  }

  function broadcastDamage(context) {
    const state = context.state;
    const damage = state.carDamage?.[state.playerCarIndex];
    if (damage) sendToSubscribers(context, 'damage-update', damage);
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
    const state = context.state;
    if (!state.sessionData) return;
    sendToSubscribers(context, 'session-update', {
      ...state.sessionData,
      playerCarIndex: state.playerCarIndex,
      trackName: TRACK_NAMES[state.sessionData.trackId] || `Track ${state.sessionData.trackId}`,
      sessionTypeName: SESSION_TYPES[state.sessionData.sessionType] || 'Unknown',
      weatherName: WEATHER[state.sessionData.weather] || 'Clear',
    });
  }

  function sendSnapshotToWindow(windowId, context) {
    const state = context.state;
    if (state.sessionData) {
      sendToWindow(windowId, 'session-update', {
        ...state.sessionData,
        playerCarIndex: state.playerCarIndex,
        trackName: TRACK_NAMES[state.sessionData.trackId] || `Track ${state.sessionData.trackId}`,
        sessionTypeName: SESSION_TYPES[state.sessionData.sessionType] || 'Unknown',
        weatherName: WEATHER[state.sessionData.weather] || 'Clear',
      });
    }
    if (state.participants) sendToWindow(windowId, 'participants-update', state.participants);
    if (state.lapData) sendToWindow(windowId, 'lap-update', { lapData: state.lapData, playerCarIndex: state.playerCarIndex });
    if (state.carTelemetry) {
      const telemetry = state.carTelemetry[state.playerCarIndex];
      if (telemetry) sendToWindow(windowId, 'telemetry-update', telemetry);
      sendToWindow(windowId, 'alltelemetry-update', state.carTelemetry);
    }
    if (state.carStatus) {
      const status = state.carStatus[state.playerCarIndex];
      if (status) sendToWindow(windowId, 'status-update', status);
      sendToWindow(windowId, 'allstatus-update', state.carStatus);
    }
    if (state.carDamage) {
      const damage = state.carDamage[state.playerCarIndex];
      if (damage) sendToWindow(windowId, 'damage-update', damage);
    }
    if (Object.keys(state.bestLapTimes).length) sendToWindow(windowId, 'best-laps-update', state.bestLapTimes);
    if (state.fastestLap) sendToWindow(windowId, 'fastest-lap-update', state.fastestLap);
  }

  function normalizePort(value) {
    const port = Number(value);
    return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : DEFAULT_TELEMETRY_PORT;
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
      try { context.socket.close(); } catch {}
      telemetryContexts.delete(port);
    });

    context.socket.on('message', (msg) => {
      try {
        if (msg.length < PACKET_HEADER_SIZE) return;
        const header = parseHeader(msg);
        const state = context.state;
        state.playerCarIndex = header.playerCarIndex < MAX_CARS ? header.playerCarIndex : 0;

        switch (header.packetId) {
          case 1: {
            const session = parseSession(msg);
            if (session) {
              if (!state.sessionData || state.sessionData.trackId !== session.trackId || state.sessionData.sessionType !== session.sessionType) {
                console.log(`[Race Engineer] Session on UDP :${port} -> trackId=${session.trackId}, type=${session.sessionType}, laps=${session.totalLaps}`);
                state.bestLapTimes = {};
                state.fastestLap = null;
              }
              if (manualTrackId !== null && manualTrackId !== undefined) session.trackId = manualTrackId;
              state.sessionData = session;
              broadcastSession(context);
            }
            break;
          }
          case 2: {
            const lap = parseLapData(msg);
            if (lap) {
              state.lapData = lap;
              broadcastLapData(context);
            }
            break;
          }
          case 4: {
            const participants = parseParticipants(msg);
            if (participants) {
              state.participants = participants;
              broadcastParticipants(context);
            }
            break;
          }
          case 6: {
            const telemetry = parseCarTelemetry(msg);
            if (telemetry) {
              state.carTelemetry = telemetry;
              broadcastTelemetry(context);
            }
            break;
          }
          case 7: {
            const carStatus = parseCarStatus(msg);
            if (carStatus) {
              state.carStatus = carStatus;
              broadcastStatus(context);
            }
            break;
          }
          case 3: {
            const event = parseEvent(msg);
            if (event) {
              if (event.type === 'FTLP') {
                state.fastestLap = { vehicleIdx: event.vehicleIdx, lapTimeMs: event.lapTimeMs };
                broadcastFastestLap(context);
                console.log(`[Race Engineer] Fastest lap UDP :${port} -> car ${event.vehicleIdx}, ${(event.lapTimeMs / 1000).toFixed(3)}s`);
              }
              sendToSubscribers(context, 'event-update', event);
            }
            break;
          }
          case 10: {
            const damage = parseCarDamage(msg);
            if (damage) {
              state.carDamage = damage;
              broadcastDamage(context);
            }
            break;
          }
          case 11: {
            const history = parseSessionHistory(msg);
            if (history && history.bestLapTimeMs > 0) {
              state.bestLapTimes[history.carIdx] = history.bestLapTimeMs;
              broadcastBestLaps(context);
            }
            break;
          }
        }
      } catch {}
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
        try { context.socket.close(); } catch {}
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

  function setManualTrackId(trackId) {
    manualTrackId = trackId === -1 ? null : trackId;
    for (const context of telemetryContexts.values()) {
      if (context.state.sessionData) {
        if (manualTrackId !== null) context.state.sessionData.trackId = manualTrackId;
        broadcastSession(context);
      }
    }
    return manualTrackId;
  }

  function dispose() {
    for (const context of telemetryContexts.values()) {
      try { context.socket.close(); } catch {}
    }
    telemetryContexts.clear();
    windowPortMap.clear();
    clearInterval(sessionTicker);
  }

  const sessionTicker = setInterval(() => {
    for (const context of telemetryContexts.values()) {
      broadcastSession(context);
    }
  }, 2000);

  return {
    attachWindowToPort,
    getContextForWindow,
    getWindowByWebContentsId,
    sendToWindow,
    setManualTrackId,
    startTelemetryForWindow,
    stopTelemetryForWindow,
    dispose,
  };
}


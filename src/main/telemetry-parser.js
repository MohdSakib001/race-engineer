export const DEFAULT_TELEMETRY_PORT = 20777;
export const PACKET_HEADER_SIZE = 29;
export const MAX_CARS = 22;
export const LAP_DATA_SIZE = 57;
export const CAR_TELEMETRY_SIZE = 60;
export const CAR_STATUS_SIZE = 55;
export const CAR_DAMAGE_SIZE = 46;
export const CAR_SETUP_SIZE = 50;
export const PARTICIPANT_SIZE = 57;
export const LAP_HISTORY_SIZE = 14;

export function createTelemetryState() {
  return {
    sessionData: null,
    participants: null,
    lapData: null,
    carTelemetry: null,
    carStatus: null,
    carDamage: null,
    carSetup: null,
    nextFrontWingValue: null,
    playerCarIndex: 0,
    bestLapTimes: {},
    fastestLap: null,
  };
}

export function parseHeader(msg) {
  return {
    packetId: msg.readUInt8(6),
    playerCarIndex: msg.readUInt8(27),
    secondaryPlayerCarIndex: msg.readUInt8(28),
  };
}

export function parseSession(msg) {
  const d = PACKET_HEADER_SIZE;
  if (msg.length < d + 20) return null;
  try {
    const safetyCarStatus = msg.length > d + 124 ? msg.readUInt8(d + 124) : 0;
    const pitIdeal = msg.length > d + 653 ? msg.readUInt8(d + 653) : 0;
    const pitLatest = msg.length > d + 654 ? msg.readUInt8(d + 654) : 0;
    const weatherForecast = [];
    if (msg.length > d + 127) {
      const numSamples = msg.readUInt8(d + 126);
      for (let i = 0; i < Math.min(numSamples, 64); i++) {
        const fo = d + 127 + i * 8;
        if (fo + 8 > msg.length) break;
        weatherForecast.push({
          sessionType: msg.readUInt8(fo),
          timeOffset: msg.readUInt8(fo + 1),
          weather: msg.readUInt8(fo + 2),
          trackTemp: msg.readInt8(fo + 3),
          trackTempChange: msg.readInt8(fo + 4),
          airTemp: msg.readInt8(fo + 5),
          airTempChange: msg.readInt8(fo + 6),
          rainPercentage: msg.readUInt8(fo + 7),
        });
      }
    }
    const forecastAccuracy = msg.length > d + 639 ? msg.readUInt8(d + 639) : 0;

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
      safetyCarStatus,
      numRedFlagPeriods: msg.length > d + 678 ? msg.readUInt8(d + 678) : 0,
      pitStopWindowIdealLap: pitIdeal,
      pitStopWindowLatestLap: pitLatest,
      weatherForecast,
      forecastAccuracy,
    };
  } catch {
    return null;
  }
}

export function parseLapData(msg) {
  const d = PACKET_HEADER_SIZE;
  const cars = [];
  for (let i = 0; i < MAX_CARS; i++) {
    const o = d + i * LAP_DATA_SIZE;
    if (o + LAP_DATA_SIZE > msg.length) break;
    try {
      const sector1Ms = msg.readUInt16LE(o + 8) + msg.readUInt8(o + 10) * 60000;
      const sector2Ms = msg.readUInt16LE(o + 11) + msg.readUInt8(o + 13) * 60000;
      cars.push({
        lastLapTimeMs: msg.readUInt32LE(o + 0),
        currentLapTimeMs: msg.readUInt32LE(o + 4),
        sector1TimeMs: sector1Ms,
        sector2TimeMs: sector2Ms,
        deltaToCarAheadMs: msg.readUInt16LE(o + 14) + msg.readUInt8(o + 16) * 60000,
        deltaToLeaderMs: msg.readUInt16LE(o + 17) + msg.readUInt8(o + 19) * 60000,
        lapDistance: msg.readFloatLE(o + 20),
        totalDistance: msg.readFloatLE(o + 24),
        safetyCarDelta: msg.readFloatLE(o + 28),
        carPosition: msg.readUInt8(o + 32),
        currentLapNum: msg.readUInt8(o + 33),
        pitStatus: msg.readUInt8(o + 34),
        numPitStops: msg.readUInt8(o + 35),
        sector: msg.readUInt8(o + 36),
        currentLapInvalid: msg.readUInt8(o + 37),
        penalties: msg.readUInt8(o + 38),
        gridPosition: msg.readUInt8(o + 43),
        driverStatus: msg.readUInt8(o + 44),
        resultStatus: msg.readUInt8(o + 45),
        pitLaneTimerActive: msg.readUInt8(o + 46),
      });
    } catch {
      cars.push(null);
    }
  }
  return cars;
}

export function parseParticipants(msg) {
  const d = PACKET_HEADER_SIZE;
  if (msg.length < d + 1) return null;
  try {
    const numActiveCars = msg.readUInt8(d + 0);
    const participants = [];
    for (let i = 0; i < Math.min(numActiveCars, MAX_CARS); i++) {
      const o = d + 1 + i * PARTICIPANT_SIZE;
      if (o + PARTICIPANT_SIZE > msg.length) break;
      try {
        const nameSlice = msg.slice(o + 7, o + 39);
        const nullIdx = nameSlice.indexOf(0);
        const name = nameSlice.slice(0, nullIdx >= 0 ? nullIdx : 32).toString('utf8');
        participants.push({
          aiControlled: msg.readUInt8(o + 0),
          driverId: msg.readUInt8(o + 1),
          networkId: msg.readUInt8(o + 2),
          teamId: msg.readUInt8(o + 3),
          myTeam: msg.readUInt8(o + 4),
          raceNumber: msg.readUInt8(o + 5),
          nationality: msg.readUInt8(o + 6),
          name: name || `Car ${i + 1}`,
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

export function parseCarTelemetry(msg) {
  const d = PACKET_HEADER_SIZE;
  const cars = [];
  for (let i = 0; i < MAX_CARS; i++) {
    const o = d + i * CAR_TELEMETRY_SIZE;
    if (o + CAR_TELEMETRY_SIZE > msg.length) break;
    try {
      cars.push({
        speed: msg.readUInt16LE(o + 0),
        throttle: msg.readFloatLE(o + 2),
        steer: msg.readFloatLE(o + 6),
        brake: msg.readFloatLE(o + 10),
        clutch: msg.readUInt8(o + 14),
        gear: msg.readInt8(o + 15),
        engineRPM: msg.readUInt16LE(o + 16),
        drs: msg.readUInt8(o + 18),
        revLightsPercent: msg.readUInt8(o + 19),
        brakesTemp: [
          msg.readUInt16LE(o + 22),
          msg.readUInt16LE(o + 24),
          msg.readUInt16LE(o + 26),
          msg.readUInt16LE(o + 28),
        ],
        tyreSurfaceTemp: [
          msg.readUInt8(o + 30),
          msg.readUInt8(o + 31),
          msg.readUInt8(o + 32),
          msg.readUInt8(o + 33),
        ],
        tyreInnerTemp: [
          msg.readUInt8(o + 34),
          msg.readUInt8(o + 35),
          msg.readUInt8(o + 36),
          msg.readUInt8(o + 37),
        ],
        engineTemp: msg.readUInt16LE(o + 38),
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

export function parseCarSetup(msg) {
  const d = PACKET_HEADER_SIZE;
  const cars = [];
  for (let i = 0; i < MAX_CARS; i++) {
    const o = d + i * CAR_SETUP_SIZE;
    if (o + CAR_SETUP_SIZE > msg.length) break;
    try {
      cars.push({
        frontWing: msg.readUInt8(o + 0),
        rearWing: msg.readUInt8(o + 1),
        onThrottle: msg.readUInt8(o + 2),
        offThrottle: msg.readUInt8(o + 3),
        frontCamber: msg.readFloatLE(o + 4),
        rearCamber: msg.readFloatLE(o + 8),
        frontToe: msg.readFloatLE(o + 12),
        rearToe: msg.readFloatLE(o + 16),
        frontSuspension: msg.readUInt8(o + 20),
        rearSuspension: msg.readUInt8(o + 21),
        frontAntiRollBar: msg.readUInt8(o + 22),
        rearAntiRollBar: msg.readUInt8(o + 23),
        frontSuspensionHeight: msg.readUInt8(o + 24),
        rearSuspensionHeight: msg.readUInt8(o + 25),
        brakePressure: msg.readUInt8(o + 26),
        brakeBias: msg.readUInt8(o + 27),
        engineBraking: msg.readUInt8(o + 28),
        rearLeftTyrePressure: msg.readFloatLE(o + 29),
        rearRightTyrePressure: msg.readFloatLE(o + 33),
        frontLeftTyrePressure: msg.readFloatLE(o + 37),
        frontRightTyrePressure: msg.readFloatLE(o + 41),
        ballast: msg.readUInt8(o + 45),
        fuelLoad: msg.readFloatLE(o + 46),
      });
    } catch {
      cars.push(null);
    }
  }

  const nextFrontWingOffset = d + MAX_CARS * CAR_SETUP_SIZE;
  const nextFrontWingValue = msg.length >= nextFrontWingOffset + 4
    ? msg.readFloatLE(nextFrontWingOffset)
    : null;

  return {
    carSetups: cars,
    nextFrontWingValue,
  };
}

export function parseCarStatus(msg) {
  const d = PACKET_HEADER_SIZE;
  const cars = [];
  for (let i = 0; i < MAX_CARS; i++) {
    const o = d + i * CAR_STATUS_SIZE;
    if (o + CAR_STATUS_SIZE > msg.length) break;
    try {
      cars.push({
        tractionControl: msg.readUInt8(o + 0),
        antiLockBrakes: msg.readUInt8(o + 1),
        fuelMix: msg.readUInt8(o + 2),
        frontBrakeBias: msg.readUInt8(o + 3),
        pitLimiterStatus: msg.readUInt8(o + 4),
        fuelInTank: msg.readFloatLE(o + 5),
        fuelCapacity: msg.readFloatLE(o + 9),
        fuelRemainingLaps: msg.readFloatLE(o + 13),
        maxRPM: msg.readUInt16LE(o + 17),
        idleRPM: msg.readUInt16LE(o + 19),
        maxGears: msg.readUInt8(o + 21),
        drsAllowed: msg.readUInt8(o + 22),
        drsActivationDist: msg.readUInt16LE(o + 23),
        actualTyreCompound: msg.readUInt8(o + 25),
        visualTyreCompound: msg.readUInt8(o + 26),
        tyresAgeLaps: msg.readUInt8(o + 27),
        vehicleFiaFlags: msg.readInt8(o + 28),
        enginePowerICE: msg.readFloatLE(o + 29),
        enginePowerMGUK: msg.readFloatLE(o + 33),
        ersStoreEnergy: msg.readFloatLE(o + 37),
        ersDeployMode: msg.readUInt8(o + 41),
        ersHarvestedMGUK: msg.readFloatLE(o + 42),
        ersHarvestedMGUH: msg.readFloatLE(o + 46),
        ersDeployedThisLap: msg.readFloatLE(o + 50),
        networkPaused: msg.readUInt8(o + 54),
      });
    } catch {
      cars.push(null);
    }
  }
  return cars;
}

export function parseCarDamage(msg) {
  const d = PACKET_HEADER_SIZE;
  const cars = [];
  for (let i = 0; i < MAX_CARS; i++) {
    const o = d + i * CAR_DAMAGE_SIZE;
    if (o + CAR_DAMAGE_SIZE > msg.length) break;
    try {
      cars.push({
        tyresWear: [msg.readFloatLE(o + 0), msg.readFloatLE(o + 4), msg.readFloatLE(o + 8), msg.readFloatLE(o + 12)],
        tyresDamage: [msg.readUInt8(o + 16), msg.readUInt8(o + 17), msg.readUInt8(o + 18), msg.readUInt8(o + 19)],
        brakesDamage: [msg.readUInt8(o + 20), msg.readUInt8(o + 21), msg.readUInt8(o + 22), msg.readUInt8(o + 23)],
        tyreBlisters: [msg.readUInt8(o + 24), msg.readUInt8(o + 25), msg.readUInt8(o + 26), msg.readUInt8(o + 27)],
        frontLeftWingDamage: msg.readUInt8(o + 28),
        frontRightWingDamage: msg.readUInt8(o + 29),
        rearWingDamage: msg.readUInt8(o + 30),
        floorDamage: msg.readUInt8(o + 31),
        diffuserDamage: msg.readUInt8(o + 32),
        sidepodDamage: msg.readUInt8(o + 33),
        drsFault: msg.readUInt8(o + 34),
        ersFault: msg.readUInt8(o + 35),
        gearBoxDamage: msg.readUInt8(o + 36),
        engineDamage: msg.readUInt8(o + 37),
        engineMGUHWear: msg.readUInt8(o + 38),
        engineESWear: msg.readUInt8(o + 39),
        engineCEWear: msg.readUInt8(o + 40),
        engineICEWear: msg.readUInt8(o + 41),
        engineMGUKWear: msg.readUInt8(o + 42),
        engineTCWear: msg.readUInt8(o + 43),
        engineBlown: msg.readUInt8(o + 44),
        engineSeized: msg.readUInt8(o + 45),
      });
    } catch {
      cars.push(null);
    }
  }
  return cars;
}

export function parseEvent(msg) {
  const d = PACKET_HEADER_SIZE;
  if (msg.length < d + 4) return null;
  try {
    const code = msg.slice(d, d + 4).toString('ascii');
    if (code === 'FTLP') {
      return {
        type: 'FTLP',
        vehicleIdx: msg.readUInt8(d + 4),
        lapTimeMs: Math.round(msg.readFloatLE(d + 5) * 1000),
      };
    }
    if (code === 'SCAR') {
      return {
        type: 'SCAR',
        safetyCarType: msg.readUInt8(d + 4),
        eventType: msg.readUInt8(d + 5),
      };
    }
    if (code === 'OVTK') {
      return {
        type: 'OVTK',
        overtakingVehicleIdx: msg.readUInt8(d + 4),
        beingOvertakenVehicleIdx: msg.readUInt8(d + 5),
      };
    }
    return { type: code };
  } catch {
    return null;
  }
}

export function parseSessionHistory(msg) {
  const d = PACKET_HEADER_SIZE;
  if (msg.length < d + 7) return null;
  try {
    const carIdx = msg.readUInt8(d + 0);
    const numLaps = msg.readUInt8(d + 1);
    const bestLapTimeLapNum = msg.readUInt8(d + 3);
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

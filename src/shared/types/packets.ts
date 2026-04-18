// F1 25 UDP Packet Type Definitions
// Byte offsets verified against EA F1 25 official spec

export const PACKET_HEADER_SIZE = 29;
export const MAX_CARS = 22;

// Per-car data sizes (F1 25)
export const LAP_DATA_SIZE = 57;
export const CAR_TELEMETRY_SIZE = 60;
export const CAR_STATUS_SIZE = 55;
export const CAR_DAMAGE_SIZE = 46;
export const CAR_SETUP_SIZE = 50;
export const PARTICIPANT_SIZE = 57;
export const LAP_HISTORY_SIZE = 14;
export const WEATHER_FORECAST_SAMPLE_SIZE = 8;
export const MAX_WEATHER_SAMPLES = 64;
export const MARSHAL_ZONE_SIZE = 5;
export const MAX_MARSHAL_ZONES = 21;

// Packet IDs
export enum PacketId {
  Motion = 0,
  Session = 1,
  LapData = 2,
  Event = 3,
  Participants = 4,
  CarSetup = 5,
  CarTelemetry = 6,
  CarStatus = 7,
  FinalClassification = 8,
  LobbyInfo = 9,
  CarDamage = 10,
  SessionHistory = 11,
  TyreSets = 12,
  MotionEx = 13,
  TimeTrial = 14,
}

// Tyre order in F1 25: RL=0, RR=1, FL=2, FR=3
export enum TyreIndex {
  RearLeft = 0,
  RearRight = 1,
  FrontLeft = 2,
  FrontRight = 3,
}

export enum Weather {
  Clear = 0,
  LightCloud = 1,
  Overcast = 2,
  LightRain = 3,
  HeavyRain = 4,
  Storm = 5,
}

export enum SessionType {
  Unknown = 0,
  P1 = 1,
  P2 = 2,
  P3 = 3,
  ShortPractice = 4,
  Q1 = 5,
  Q2 = 6,
  Q3 = 7,
  ShortQ = 8,
  OSQ = 9,
  Race = 10,
  Race2 = 11,
  Race3 = 12,
  TimeTrial = 13,
}

export enum SafetyCarStatus {
  None = 0,
  Full = 1,
  Virtual = 2,
  FormationLap = 3,
}

export enum PitStatus {
  None = 0,
  Pitting = 1,
  InPitArea = 2,
}

export enum DriverStatus {
  InGarage = 0,
  FlyingLap = 1,
  InLap = 2,
  OutLap = 3,
  OnTrack = 4,
}

export enum ResultStatus {
  Invalid = 0,
  Inactive = 1,
  Active = 2,
  Finished = 3,
  DNF = 4,
  DSQ = 5,
  NotClassified = 6,
  Retired = 7,
}

export enum FiaFlag {
  None = 0,
  Green = 1,
  Blue = 2,
  Yellow = 3,
}

export enum ErsDeployMode {
  None = 0,
  Medium = 1,
  Hotlap = 2,
  Overtake = 3,
}

export enum ActualTyreCompound {
  C5 = 16,
  C4 = 17,
  C3 = 18,
  C2 = 19,
  C1 = 20,
  C0 = 21,
  C6 = 22,
  Inter = 7,
  Wet = 8,
}

export enum VisualTyreCompound {
  Soft = 16,
  Medium = 17,
  Hard = 18,
  Inter = 7,
  Wet = 8,
}

export interface PacketHeader {
  packetFormat: number;
  gameYear: number;
  gameMajorVersion: number;
  gameMinorVersion: number;
  packetVersion: number;
  packetId: PacketId;
  sessionUID: bigint;
  sessionTime: number;
  frameIdentifier: number;
  overallFrameIdentifier: number;
  playerCarIndex: number;
  secondaryPlayerCarIndex: number;
}

export interface WeatherForecastSample {
  sessionType: number;
  timeOffset: number;
  weather: Weather;
  trackTemp: number;
  trackTempChange: number;
  airTemp: number;
  airTempChange: number;
  rainPercentage: number;
}

export interface MarshalZone {
  zoneStart: number;
  zoneFlag: FiaFlag;
}

export interface SessionData {
  weather: Weather;
  trackTemperature: number;
  airTemperature: number;
  totalLaps: number;
  trackLength: number;
  sessionType: SessionType;
  trackId: number;
  formula: number;
  sessionTimeLeft: number;
  sessionDuration: number;
  pitSpeedLimit: number;
  gamePaused: number;
  isSpectating: number;
  spectatorCarIndex: number;
  safetyCarStatus: SafetyCarStatus;
  numRedFlagPeriods: number;
  pitStopWindowIdealLap: number;
  pitStopWindowLatestLap: number;
  weatherForecast: WeatherForecastSample[];
  forecastAccuracy: number;
  playerCarIndex: number;
  trackName: string;
  sessionTypeName: string;
  weatherName: string;
}

// 4-element arrays: [RL, RR, FL, FR]
export type TyreArray<T> = [T, T, T, T];

export interface LapData {
  lastLapTimeMs: number;
  currentLapTimeMs: number;
  sector1TimeMs: number;
  sector2TimeMs: number;
  deltaToCarAheadMs: number;
  deltaToLeaderMs: number;
  lapDistance: number;
  totalDistance: number;
  safetyCarDelta: number;
  carPosition: number;
  currentLapNum: number;
  pitStatus: PitStatus;
  numPitStops: number;
  sector: number;
  currentLapInvalid: number;
  penalties: number;
  gridPosition: number;
  driverStatus: DriverStatus;
  resultStatus: ResultStatus;
  pitLaneTimerActive: number;
}

export interface CarTelemetry {
  speed: number;
  throttle: number;
  steer: number;
  brake: number;
  clutch: number;
  gear: number;
  engineRPM: number;
  drs: number;
  revLightsPercent: number;
  brakesTemp: TyreArray<number>;
  tyreSurfaceTemp: TyreArray<number>;
  tyreInnerTemp: TyreArray<number>;
  engineTemp: number;
  tyrePressure: TyreArray<number>;
  surfaceType: TyreArray<number>;
}

export interface CarStatus {
  tractionControl: number;
  antiLockBrakes: number;
  fuelMix: number;
  frontBrakeBias: number;
  pitLimiterStatus: number;
  fuelInTank: number;
  fuelCapacity: number;
  fuelRemainingLaps: number;
  maxRPM: number;
  idleRPM: number;
  maxGears: number;
  drsAllowed: number;
  drsActivationDist: number;
  actualTyreCompound: ActualTyreCompound;
  visualTyreCompound: VisualTyreCompound;
  tyresAgeLaps: number;
  vehicleFiaFlags: FiaFlag;
  enginePowerICE: number;
  enginePowerMGUK: number;
  ersStoreEnergy: number;
  ersDeployMode: ErsDeployMode;
  ersHarvestedMGUK: number;
  ersHarvestedMGUH: number;
  ersDeployedThisLap: number;
  networkPaused: number;
}

export interface CarDamage {
  tyresWear: TyreArray<number>;
  tyresDamage: TyreArray<number>;
  brakesDamage: TyreArray<number>;
  tyreBlisters: TyreArray<number>;
  frontLeftWingDamage: number;
  frontRightWingDamage: number;
  rearWingDamage: number;
  floorDamage: number;
  diffuserDamage: number;
  sidepodDamage: number;
  drsFault: number;
  ersFault: number;
  gearBoxDamage: number;
  engineDamage: number;
  engineMGUHWear: number;
  engineESWear: number;
  engineCEWear: number;
  engineICEWear: number;
  engineMGUKWear: number;
  engineTCWear: number;
  engineBlown: number;
  engineSeized: number;
}

export interface CarSetup {
  frontWing: number;
  rearWing: number;
  onThrottle: number;
  offThrottle: number;
  frontCamber: number;
  rearCamber: number;
  frontToe: number;
  rearToe: number;
  frontSuspension: number;
  rearSuspension: number;
  frontAntiRollBar: number;
  rearAntiRollBar: number;
  frontSuspensionHeight: number;
  rearSuspensionHeight: number;
  brakePressure: number;
  brakeBias: number;
  engineBraking: number;
  rearLeftTyrePressure: number;
  rearRightTyrePressure: number;
  frontLeftTyrePressure: number;
  frontRightTyrePressure: number;
  ballast: number;
  fuelLoad: number;
}

export interface Participant {
  aiControlled: number;
  driverId: number;
  networkId: number;
  teamId: number;
  myTeam: number;
  raceNumber: number;
  nationality: number;
  name: string;
}

export interface EventData {
  type: string;
  vehicleIdx?: number;
  lapTimeMs?: number;
  safetyCarType?: number;
  eventType?: number;
  overtakingVehicleIdx?: number;
  beingOvertakenVehicleIdx?: number;
}

export interface SessionHistory {
  carIdx: number;
  numLaps: number;
  bestLapTimeMs: number;
}

// Enriched types for renderer consumption
export interface EnrichedSessionData extends SessionData {
  trackName: string;
  sessionTypeName: string;
  weatherName: string;
}

export interface LapDataUpdate {
  lapData: LapData[];
  playerCarIndex: number;
}

export interface SetupUpdate extends CarSetup {
  nextFrontWingValue: number | null;
}

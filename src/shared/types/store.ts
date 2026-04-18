import type {
  SessionData,
  LapData,
  CarTelemetry,
  CarStatus,
  CarDamage,
  CarSetup,
  Participant,
  EventData,
  TyreArray,
} from './packets';

// ── Telemetry Store State ──
export interface TelemetryState {
  connected: boolean;
  session: SessionData | null;
  participants: { numActiveCars: number; participants: (Participant | null)[] } | null;
  lapData: LapData[];
  telemetry: CarTelemetry | null;
  status: CarStatus | null;
  damage: CarDamage | null;
  setup: CarSetup | null;
  allCarTelemetry: CarTelemetry[];
  allCarStatus: CarStatus[];
  allCarSetup: CarSetup[];
  allCarDamage: CarDamage[];
  playerCarIndex: number;
  bestLapTimes: Record<number, number>;
  fastestLapCar: number | null;
  fastestLapMs: number | null;
  events: EventData[];
}

// ── Wear Prediction ──
export interface WearSample {
  lap: number;
  timestamp: number;
  wear: TyreArray<number>;
  surfaceTemp: TyreArray<number>;
  innerTemp: TyreArray<number>;
  pressure: TyreArray<number>;
  compound: number;
  fuelLoad: number;
}

export interface WearPrediction {
  predictedLapBelow40: TyreArray<number | null>; // lap number where grip < 40%
  wearRatePerLap: TyreArray<number>;             // % per lap
  currentGrip: TyreArray<number>;                // estimated grip %
  confidence: number;                             // 0-1
}

// ── Pace Analysis ──
export interface SectorTime {
  sector1Ms: number;
  sector2Ms: number;
  sector3Ms: number; // derived: lapTime - s1 - s2
}

export interface PurpleSectors {
  sector1Ms: number;
  sector2Ms: number;
  sector3Ms: number;
  sector1CarIdx: number;
  sector2CarIdx: number;
  sector3CarIdx: number;
}

export interface PaceAnalysis {
  ultimateBest: PurpleSectors;
  personalBest: SectorTime | null;
  currentLap: SectorTime | null;
  deltaToUltimate: SectorTime | null;
  suggestion: string | null;
}

// ── Energy Management ──
export enum ErsRecommendation {
  Push = 'PUSH',
  Conserve = 'CONSERVE',
  Neutral = 'NEUTRAL',
  Overtake = 'OVERTAKE',
  Defend = 'DEFEND',
}

export interface ErsAnalysis {
  recommendation: ErsRecommendation;
  reason: string;
  gapAhead: number;
  gapBehind: number;
  ersStorePercent: number;
  deployedThisLapPercent: number;
  harvestRate: number;
}

// ── Strategy ──
export interface StintData {
  compound: number;
  startLap: number;
  endLap: number | null;
  avgWear: number;
  avgPace: number;
  laps: number;
}

export interface PitStrategy {
  idealLap: number;
  latestLap: number;
  rejoinPosition: number | null;    // Virtual ghost pit exit position
  rejoinGap: number | null;         // seconds behind car you'd rejoin behind
  reason: string;
}

// ── Brake Bias History ──
export interface BrakeBiasSample {
  lapDistance: number;   // 0.0 - trackLength
  brakeBias: number;     // %
  lap: number;
  timestamp: number;
}

// ── Race Control ──
export interface RaceControlMessage {
  timestamp: number;
  type: 'penalty' | 'warning' | 'flag' | 'overtake' | 'safety_car' | 'info';
  message: string;
  carIdx?: number;
}

export interface PenaltyTracker {
  cornerCutWarnings: number;
  unservedPenalties: number;
  totalPenaltySeconds: number;
  messages: RaceControlMessage[];
}

// ── Settings ──
export interface AppSettings {
  apiKey: string;
  ttsEnabled: boolean;
  ttsVoice: string;
  ttsRate: number;
  telemetryPort: number;
  radioConfig: Record<string, boolean>;
}

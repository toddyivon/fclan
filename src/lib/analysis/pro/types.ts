/**
 * Harvested from GT7-Telemetry-Pro (MIT lineage: revived as features, not as base).
 * Pure analysis engine — no framework/CN/backend deps. Kept verbatim except this header.
 * See docs/00-KNOWLEDGE-BASE.md §4 (reuse map) for provenance.
 */

// Common types for telemetry analysis

export interface TelemetryPoint {
  timestamp: number;
  lapNumber: number;
  position: {
    x: number;
    y: number;
    z: number;
  };
  speed: number; // m/s
  throttle: number; // 0-255
  brake: number; // 0-255
  gear: number;
  rpm: number;
  fuel: number; // 0-100%
  tireTemp?: {
    frontLeft: number;
    frontRight: number;
    rearLeft: number;
    rearRight: number;
  };
  tireWear?: {
    frontLeft: number;
    frontRight: number;
    rearLeft: number;
    rearRight: number;
  };
  tirePressure?: {
    frontLeft: number;
    frontRight: number;
    rearLeft: number;
    rearRight: number;
  };
  suspension?: {
    frontLeft: number;
    frontRight: number;
    rearLeft: number;
    rearRight: number;
  };
  steering?: number; // -1 to 1
  yaw?: number;
  pitch?: number;
  roll?: number;
}

export interface LapData {
  lapNumber: number;
  lapTime: number;
  sector1Time?: number;
  sector2Time?: number;
  sector3Time?: number;
  topSpeed: number;
  averageSpeed: number;
  isValid: boolean;
  fuelRemaining?: number;
}

export interface Corner {
  id: number;
  name?: string;
  entryDistance: number;
  apexDistance: number;
  exitDistance: number;
  entrySpeed: number;
  apexSpeed: number;
  exitSpeed: number;
  minSpeed: number;
  brakePoint: number;
  throttlePoint: number;
  idealEntrySpeed?: number;
  idealApexSpeed?: number;
  idealExitSpeed?: number;
  rating: 'excellent' | 'good' | 'average' | 'poor' | 'bad';
  timeLoss: number;
  suggestions: string[];
}

export interface BrakeZone {
  id: number;
  startDistance: number;
  endDistance: number;
  startSpeed: number;
  endSpeed: number;
  maxBrakePressure: number;
  avgBrakePressure: number;
  brakePointConsistency: number;
  trailBrakingDetected: boolean;
  trailBrakingDuration: number;
  brakeTempStart?: number;
  brakeTempEnd?: number;
}

export interface RacingLinePoint {
  distance: number;
  x: number;
  y: number;
  speed: number;
  throttle: number;
  brake: number;
  isOptimal: boolean;
  deviation?: number;
}

export interface IdealLine {
  points: RacingLinePoint[];
  totalTime: number;
  avgSpeed: number;
}

export interface TimeDelta {
  distance: number;
  delta: number; // Positive = slower, Negative = faster
  lap1Time: number;
  lap2Time: number;
}

export interface SectorBreakdown {
  sector: number;
  lap1Time: number;
  lap2Time: number;
  delta: number;
  avgSpeed1: number;
  avgSpeed2: number;
}

export interface FuelStrategy {
  currentFuel: number;
  consumptionPerLap: number;
  estimatedLapsRemaining: number;
  optimalPitWindow: {
    earliestLap: number;
    latestLap: number;
    recommendedLap: number;
  };
  fuelMapRecommendation: 'lean' | 'normal' | 'rich';
  targetFuelSave: number;
}

export interface TireAnalysis {
  position: 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight';
  currentWear: number;
  wearRate: number;
  estimatedLapsRemaining: number;
  avgTemperature: number;
  currentTemperature: number;
  optimalTempRange: [number, number];
  isOverheating: boolean;
  currentPressure: number;
  optimalPressureRange: [number, number];
  gripLevel: number;
}

export interface AIInsight {
  id: string;
  category: 'braking' | 'acceleration' | 'cornering' | 'consistency' | 'strategy' | 'general';
  severity: 'info' | 'suggestion' | 'warning' | 'critical';
  title: string;
  description: string;
  improvement: string;
  potentialTimeSave: number; // seconds
  confidence: number; // 0-1
  relatedCorners?: number[];
  relatedLaps?: number[];
}

export interface ProgressMetrics {
  sessionId: string;
  date: Date;
  bestLapTime: number;
  avgLapTime: number;
  consistency: number;
  trackName: string;
  carModel: string;
}

export interface PerformanceTrend {
  metric: string;
  values: { date: Date; value: number }[];
  trend: 'improving' | 'stable' | 'declining';
  improvement: number; // percentage
}

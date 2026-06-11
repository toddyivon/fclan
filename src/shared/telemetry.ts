/**
 * Canonical telemetry types shared between the Next.js web app and the Expo
 * mobile capture app. Based on the GT7 Simulator Interface packets
 * (heartbeat 'A' = 296 bytes, '~B' = 316, '~' = 344, all Salsa20-encrypted).
 *
 * The mobile app duplicates this file at mobile-app/src/gt7/telemetry.ts —
 * keep them in sync.
 */

export interface TelemetryPacket {
  packetId: number;
  posX: number; posY: number; posZ: number;
  velX: number; velY: number; velZ: number;
  rotX: number; rotY: number; rotZ: number; rotW: number;
  rpm: number;
  speedMs: number;
  turboBoost: number;
  throttle: number;
  brake: number;
  gear: number;
  suggestedGear: number;
  fuelLevel: number;
  fuelCapacity: number;
  tireTempFl: number; tireTempFr: number; tireTempRl: number; tireTempRr: number;
  tireRadiusFl: number; tireRadiusFr: number; tireRadiusRl: number; tireRadiusRr: number;
  flags: number;
  // Lap state straight from the game (lap numbers are 1-based while on track,
  // 0 in menus/replays; times are milliseconds, -1 when not yet set).
  currentLap: number;
  totalLaps: number;
  bestLapMs: number;
  lastLapMs: number;
  // Extras the dashboard uses for engine-health and strategy views.
  oilTempC: number;
  waterTempC: number;
  oilPressureBar: number;
  carCode: number;
}

/**
 * Wire format for POST /api/ingest — snake_case keys matching the
 * telemetry_points columns plus session-level lap state.
 */
export interface IngestPoint {
  packet_id: number;
  posX?: number; posY?: number; posZ?: number;
  velX?: number; velY?: number; velZ?: number;
  rotX?: number; rotY?: number; rotZ?: number; rotW?: number;
  rpm?: number; speed_ms?: number; turbo_boost?: number;
  throttle?: number; brake?: number;
  gear?: number; suggested_gear?: number;
  fuel_level?: number; fuel_capacity?: number;
  tire_temp_fl?: number; tire_temp_fr?: number; tire_temp_rl?: number; tire_temp_rr?: number;
  tire_radius_fl?: number; tire_radius_fr?: number; tire_radius_rl?: number; tire_radius_rr?: number;
  flags?: number;
  current_lap?: number;
  total_laps?: number;
  best_lap_ms?: number;
  last_lap_ms?: number;
}

export const FLAG_IN_RACE = 1 << 0;
export const FLAG_PAUSED = 1 << 1;
export const FLAG_LOADING = 1 << 2;
export const FLAG_IN_GEAR = 1 << 3;
export const FLAG_HAS_TURBO = 1 << 4;
export const FLAG_REV_LIMITER = 1 << 5;
export const FLAG_HANDBRAKE = 1 << 6;
export const FLAG_LIGHTS = 1 << 7;
export const FLAG_TCS_ACTIVE = 1 << 11;

export function hasFlag(flags: number, flag: number): boolean {
  return (flags & flag) === flag;
}

/** Formats lap milliseconds as M:SS.mmm ("-" for unset/-1). */
export function formatLapTime(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return "-:--.---";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

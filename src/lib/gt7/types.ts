/**
 * GT7 Telemetry Types
 * Based on GT7 Simulator Interface PacketType3 (344 bytes)
 * Shared between the React Native mobile capture app and the Next.js web dashboard.
 */

export interface TelemetryPacket {
  packetId: number;
  // Position (meters)
  posX: number;
  posY: number;
  posZ: number;
  // Velocity (m/s)
  velX: number;
  velY: number;
  velZ: number;
  // Rotation (quaternion)
  rotX: number;
  rotY: number;
  rotZ: number;
  rotW: number;
  // Engine
  rpm: number;
  speedMs: number;
  turboBoost: number;
  // Pedals (0-255)
  throttle: number;
  brake: number;
  // Transmission
  gear: number;
  suggestedGear: number;
  // Fuel
  fuelLevel: number;
  fuelCapacity: number;
  // Tires (°C)
  tireTempFl: number;
  tireTempFr: number;
  tireTempRl: number;
  tireTempRr: number;
  // Tire radius (meters)
  tireRadiusFl: number;
  tireRadiusFr: number;
  tireRadiusRl: number;
  tireRadiusRr: number;
  // Suspension
  suspensionFl: number;
  suspensionFr: number;
  suspensionRl: number;
  suspensionRr: number;
  // Race
  currentLap: number;
  totalLaps: number;
  bestLapMs: number;
  lastLapMs: number;
  dayProgressionMs: number;
  // Flags (bitmask)
  flags: number;
  // Extended (PacketType2/3)
  wheelRotationRad: number;
  sway: number;
  heave: number;
  surge: number;
  energyRecovery: number;
}

/**
 * GT7 Flags bitmask constants
 */
export const GT7Flags = {
  CAR_ON_TRACK: 1 << 0,
  PAUSED: 1 << 1,
  LOADING_OR_PROCESSING: 1 << 2,
  IN_GEAR: 1 << 3,
  HAS_TURBO: 1 << 4,
  REV_LIMITER_BLINK: 1 << 5,
  HANDBRAKE: 1 << 6,
  LIGHTS_ACTIVE: 1 << 7,
  HIGH_BEAM: 1 << 8,
  LOW_BEAM: 1 << 9,
  ASM_ACTIVE: 1 << 10,
  TCS_ACTIVE: 1 << 11,
} as const;

export function hasFlag(flags: number, flag: number): boolean {
  return (flags & flag) !== 0;
}

export type Tier = "free" | "pro" | "ai_premium";

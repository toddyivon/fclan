/**
 * Canonical telemetry types shared between the Next.js web app and the Expo
 * mobile capture app. Based on GT7 Simulator Interface PacketType3 (344 bytes).
 *
 * The mobile app should import from here (via a relative path or a workspace
 * symlink) to prevent drift from the web's server-side types.
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
}

export const FLAG_IN_RACE = 1 << 0;
export const FLAG_PAUSED = 1 << 1;
export const FLAG_LOADING = 1 << 2;
export const FLAG_IN_GEAR = 1 << 3;

export function hasFlag(flags: number, flag: number): boolean {
  return (flags & flag) === flag;
}

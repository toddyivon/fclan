/**
 * GT7 Simulator Interface packet decryption + parsing.
 * Layout verified against Nenkai/PDTools, snipem/gt7dashboard and
 * Bornhall/gt7telemetry. Canonical module shared with the mobile app
 * (mobile-app/src/gt7/packet.ts is a copy — keep in sync).
 *
 * Wire protocol: send a 1-char heartbeat to UDP 33739 on the console every
 * ~10s; the game streams encrypted packets at 60Hz to UDP 33740.
 *   'A' -> 296-byte packet, 'B' -> 316, '~' -> 344 (B/~ need GT7 >= 1.42).
 */
import { salsa20Xor } from "./salsa20";
import type { TelemetryPacket } from "../telemetry";

export const GT7_HEARTBEAT_PORT = 33739;
export const GT7_TELEMETRY_PORT = 33740;
export const HEARTBEAT_A = "A";
export const HEARTBEAT_B = "B";
export const HEARTBEAT_C = "~";

export const PACKET_SIZE_A = 296;
export const PACKET_SIZE_B = 316;
export const PACKET_SIZE_C = 344;

const MAGIC = 0x47375330; // "G7S0" as little-endian uint32

const IV_XOR_A = 0xdeadbeaf; // not a typo — type A really ends in AF
const IV_XOR_B = 0xdeadbeef;
const IV_XOR_C = 0x55fabb4f;

// First 32 bytes of "Simulator Interface Packet GT7 ver 0.0"
const KEY = new TextEncoder()
  .encode("Simulator Interface Packet GT7 ver 0.0")
  .slice(0, 32);

function xorForLength(len: number): number[] {
  if (len === PACKET_SIZE_A) return [IV_XOR_A];
  if (len === PACKET_SIZE_B) return [IV_XOR_B];
  if (len === PACKET_SIZE_C) return [IV_XOR_C];
  return [IV_XOR_A, IV_XOR_B, IV_XOR_C];
}

/**
 * Decrypts a raw UDP datagram. The 8-byte nonce is derived from the uint32
 * IV seed embedded (readable) at 0x40 of the RAW packet:
 *   nonce = LE32(seed ^ xorConst) ++ LE32(seed)
 * The WHOLE packet is decrypted from byte 0; validity is checked via the
 * "G7S0" magic at offset 0. Returns null when no packet type matches.
 */
export function decryptPacket(raw: Uint8Array): Uint8Array | null {
  if (raw.length < 0x44) return null;

  const seed =
    (raw[0x40] | (raw[0x41] << 8) | (raw[0x42] << 16) | (raw[0x43] << 24)) >>> 0;

  for (const xorConst of xorForLength(raw.length)) {
    const iv2 = (seed ^ xorConst) >>> 0;
    const nonce = new Uint8Array(8);
    new DataView(nonce.buffer).setUint32(0, iv2, true);
    new DataView(nonce.buffer).setUint32(4, seed, true);

    const decrypted = salsa20Xor(KEY, nonce, raw);
    const magic = new DataView(decrypted.buffer, decrypted.byteOffset).getUint32(0, true);
    if (magic === MAGIC) return decrypted;
  }
  return null;
}

/** Parses a DECRYPTED packet (any of A/B/C — base layout is identical). */
export function parsePacket(data: Uint8Array): TelemetryPacket {
  if (data.byteLength < PACKET_SIZE_A) {
    throw new RangeError(`gt7 packet too short: ${data.byteLength} bytes`);
  }
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const f = (o: number) => v.getFloat32(o, true);
  const i32 = (o: number) => v.getInt32(o, true);
  const i16 = (o: number) => v.getInt16(o, true);
  const u8 = (o: number) => v.getUint8(o);

  const gearPacked = u8(0x90);

  return {
    packetId: i32(0x70),
    posX: f(0x04), posY: f(0x08), posZ: f(0x0c),
    velX: f(0x10), velY: f(0x14), velZ: f(0x18),
    rotX: f(0x1c), rotY: f(0x20), rotZ: f(0x24), rotW: f(0x28),
    rpm: f(0x3c),
    speedMs: f(0x4c),
    turboBoost: f(0x50),
    throttle: u8(0x91),
    brake: u8(0x92),
    gear: gearPacked & 0x0f,
    suggestedGear: (gearPacked >> 4) & 0x0f,
    fuelLevel: f(0x44),
    fuelCapacity: f(0x48),
    tireTempFl: f(0x60), tireTempFr: f(0x64), tireTempRl: f(0x68), tireTempRr: f(0x6c),
    tireRadiusFl: f(0xb4), tireRadiusFr: f(0xb8), tireRadiusRl: f(0xbc), tireRadiusRr: f(0xc0),
    flags: i16(0x8e),
    currentLap: i16(0x74),
    totalLaps: i16(0x76),
    bestLapMs: i32(0x78),
    lastLapMs: i32(0x7c),
    oilTempC: f(0x5c),
    waterTempC: f(0x58),
    oilPressureBar: f(0x54),
    carCode: i32(0x124),
  };
}

/** Convenience: decrypt + parse in one call (null on any invalid datagram). */
export function decodePacket(raw: Uint8Array): TelemetryPacket | null {
  if (raw.length < PACKET_SIZE_A) return null;
  const decrypted = decryptPacket(raw);
  return decrypted ? parsePacket(decrypted) : null;
}

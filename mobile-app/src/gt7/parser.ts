/**
 * GT7 PacketType3 parser (344 bytes encrypted, decrypted payload ~300 bytes)
 * Parses all telemetry fields from the decrypted payload.
 */

export interface Gt7Telemetry {
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
  suspensionFl: number; suspensionFr: number; suspensionRl: number; suspensionRr: number;
  currentLap: number;
  totalLaps: number;
  bestLapMs: number;
  lastLapMs: number;
  flags: number;
  wheelRotationRad: number;
  sway: number;
  heave: number;
  surge: number;
  energyRecovery: number;
  carType: number;
}

export function parsePacketType3(decryptedData: DataView, offset: number = 4): Gt7Telemetry {
  // Skip 4 bytes magic "G7S0"
  let pos = offset + 4;
  const view = decryptedData;

  function readFloat(): number { return view.getFloat32(pos); pos += 4; }
  function readInt32(): number { return view.getInt32(pos, true); pos += 4; }
  function readInt16(): number { return view.getInt16(pos, true); pos += 2; }
  function readFloat8(): number { return view.getUint8(pos); pos += 1; }

  // Position
  const posX = readFloat(), posY = readFloat(), posZ = readFloat();
  // Velocity
  const velX = readFloat(), velY = readFloat(), velZ = readFloat();
  // Rotation
  const rotX = readFloat(), rotY = readFloat(), rotZ = readFloat(), rotW = readFloat();
  // Engine
  const rpm = readFloat();
  const speedMs = readFloat();
  const turboBoost = readFloat();
  // Pedals
  const throttle = readFloat8();
  const brake = readFloat8();
  // Gear (lower 4 bits = current, upper 4 bits = suggested)
  const gearCombined = readFloat8();
  const gear = gearCombined & 0x0F;
  const suggestedGear = (gearCombined >> 4) & 0x0F;
  // Fuel
  const fuelLevel = readFloat();
  const fuelCapacity = readFloat();
  // Tire temps
  const tireTempFl = readFloat();
  const tireTempFr = readFloat();
  const tireTempRl = readFloat();
  const tireTempRr = readFloat();
  // Tire radius
  const tireRadiusFl = readFloat();
  const tireRadiusFr = readFloat();
  const tireRadiusRl = readFloat();
  const tireRadiusRr = readFloat();
  // Suspension
  const suspensionFl = readFloat();
  const suspensionFr = readFloat();
  const suspensionRl = readFloat();
  const suspensionRr = readFloat();

  const flags = readInt16();

  // Extended fields (Type2/3 only)
  const wheelRotationRad = readFloat();
  const sway = readFloat();
  const heave = readFloat();
  const surge = readFloat();

  // Type3 specific
  const energyRecovery = readFloat();
  const carType = readFloat8();

  // Remaining 4 bytes after carType (padding/reserved)
  pos += 4;

  return {
    packetId: 0, // Will be set from the encrypted header
    posX, posY, posZ,
    velX, velY, velZ,
    rotX, rotY, rotZ, rotW,
    rpm, speedMs, turboBoost,
    throttle, brake, gear, suggestedGear,
    fuelLevel, fuelCapacity,
    tireTempFl, tireTempFr, tireTempRl, tireTempRr,
    tireRadiusFl, tireRadiusFr, tireRadiusRl, tireRadiusRr,
    suspensionFl, suspensionFr, suspensionRl, suspensionRr,
    currentLap: 0, totalLaps: 0,
    bestLapMs: -1, lastLapMs: -1,
    flags,
    wheelRotationRad, sway, heave, surge,
    energyRecovery, carType,
  };
}

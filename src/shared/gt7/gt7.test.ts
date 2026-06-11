import { describe, it, expect } from "vitest";
import { salsa20Xor } from "./salsa20";
import {
  decryptPacket,
  decodePacket,
  parsePacket,
  PACKET_SIZE_A,
} from "./packet";

const KEY = new TextEncoder()
  .encode("Simulator Interface Packet GT7 ver 0.0")
  .slice(0, 32);

function hex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
function fromHex(s: string): Uint8Array {
  return new Uint8Array(s.match(/.{2}/g)!.map((x) => parseInt(x, 16)));
}

describe("salsa20", () => {
  // Golden vectors generated with pycryptodome (Salsa20, same key derivation).
  it("matches reference ciphertext for a GT7-style nonce", () => {
    const nonce = fromHex("d7e899cc78563412"); // iv1=0x12345678, iv2=iv1^0xDEADBEAF
    const plain = new Uint8Array(512);
    for (let i = 0; i < 512; i++) plain[i] = i & 0xff;
    const ct = salsa20Xor(KEY, nonce, plain);
    expect(hex(ct.slice(0, 64))).toBe(
      "e760233e5ae4f559171774e5b1848d4908fb66106d4fa71c5ef8794cec0ebaff" +
        "daa68a3b0688fae83349f0dacb5afd32dd27fafdc6ef508c96ee8da844bd54b8"
    );
    expect(hex(ct.slice(-16))).toBe("9023bc72cee35d0b741b393795264ed9");
  });

  it("matches reference ciphertext for a zero nonce", () => {
    const ct = salsa20Xor(KEY, new Uint8Array(8), new TextEncoder().encode("Hello GT7 telemetry!"));
    expect(hex(ct)).toBe("4fd058f0a2e0f9119cfb704195a281c59db30224");
  });

  it("is its own inverse", () => {
    const nonce = fromHex("0102030405060708");
    const plain = new Uint8Array(300).map((_, i) => (i * 7) & 0xff);
    expect(salsa20Xor(KEY, nonce, salsa20Xor(KEY, nonce, plain))).toEqual(plain);
  });

  it("rejects bad key/nonce sizes", () => {
    expect(() => salsa20Xor(new Uint8Array(16), new Uint8Array(8), new Uint8Array(4))).toThrow();
    expect(() => salsa20Xor(KEY, new Uint8Array(4), new Uint8Array(4))).toThrow();
  });
});

/** Builds a plausible decrypted 296-byte packet A with known field values. */
function buildPacketA(): Uint8Array {
  const buf = new Uint8Array(PACKET_SIZE_A);
  const v = new DataView(buf.buffer);
  v.setUint32(0x00, 0x47375330, true); // magic
  v.setFloat32(0x04, 12.5, true); // posX
  v.setFloat32(0x08, -3.25, true); // posY
  v.setFloat32(0x0c, 800.75, true); // posZ
  v.setFloat32(0x1c, 0.1, true); // rotX
  v.setFloat32(0x28, 0.9, true); // rotW
  v.setFloat32(0x3c, 7450, true); // rpm
  v.setFloat32(0x44, 42.5, true); // fuel level
  v.setFloat32(0x48, 100, true); // fuel capacity
  v.setFloat32(0x4c, 83.3, true); // speed m/s (~300 km/h)
  v.setFloat32(0x54, 4.5, true); // oil pressure
  v.setFloat32(0x58, 85, true); // water temp
  v.setFloat32(0x5c, 110, true); // oil temp
  v.setFloat32(0x60, 78.5, true); // tire temp FL
  v.setFloat32(0x6c, 95.25, true); // tire temp RR
  v.setInt32(0x70, 123456, true); // packet id
  v.setInt16(0x74, 3, true); // lap count
  v.setInt16(0x76, 10, true); // laps in race
  v.setInt32(0x78, 92345, true); // best lap ms
  v.setInt32(0x7c, 93456, true); // last lap ms
  v.setInt16(0x8e, 0b1001, true); // flags: in race + in gear
  v.setUint8(0x90, (4 << 4) | 3); // gear 3, suggested 4
  v.setUint8(0x91, 255); // throttle
  v.setUint8(0x92, 0); // brake
  v.setFloat32(0xb4, 0.33, true); // tire radius FL
  v.setInt32(0x124, 3337, true); // car code
  return buf;
}

/** Encrypts like the game: whole packet XOR'd, IV seed readable at 0x40. */
function encryptLikeGame(plain: Uint8Array, ivSeed: number, xorConst: number): Uint8Array {
  const nonce = new Uint8Array(8);
  new DataView(nonce.buffer).setUint32(0, (ivSeed ^ xorConst) >>> 0, true);
  new DataView(nonce.buffer).setUint32(4, ivSeed >>> 0, true);
  const ct = salsa20Xor(KEY, nonce, plain);
  new DataView(ct.buffer).setUint32(0x40, ivSeed >>> 0, true); // plant readable seed
  return ct;
}

describe("gt7 packet", () => {
  it("decrypts and parses a synthetic packet A end-to-end", () => {
    const raw = encryptLikeGame(buildPacketA(), 0xcafe1234, 0xdeadbeaf);
    const pkt = decodePacket(raw);
    expect(pkt).not.toBeNull();
    expect(pkt!.packetId).toBe(123456);
    expect(pkt!.posX).toBeCloseTo(12.5);
    expect(pkt!.posZ).toBeCloseTo(800.75);
    expect(pkt!.rpm).toBeCloseTo(7450);
    expect(pkt!.speedMs).toBeCloseTo(83.3, 1);
    expect(pkt!.fuelLevel).toBeCloseTo(42.5);
    expect(pkt!.tireTempFl).toBeCloseTo(78.5);
    expect(pkt!.tireTempRr).toBeCloseTo(95.25);
    expect(pkt!.currentLap).toBe(3);
    expect(pkt!.totalLaps).toBe(10);
    expect(pkt!.bestLapMs).toBe(92345);
    expect(pkt!.lastLapMs).toBe(93456);
    expect(pkt!.gear).toBe(3);
    expect(pkt!.suggestedGear).toBe(4);
    expect(pkt!.throttle).toBe(255);
    expect(pkt!.brake).toBe(0);
    expect(pkt!.oilTempC).toBeCloseTo(110);
    expect(pkt!.waterTempC).toBeCloseTo(85);
    expect(pkt!.oilPressureBar).toBeCloseTo(4.5);
    expect(pkt!.carCode).toBe(3337);
    expect(pkt!.flags & 1).toBe(1);
  });

  it("rejects a corrupted packet (magic check)", () => {
    const raw = encryptLikeGame(buildPacketA(), 0xcafe1234, 0xdeadbeaf);
    raw[0] ^= 0xff;
    expect(decryptPacket(raw)).toBeNull();
  });

  it("rejects packets that are too short", () => {
    expect(decryptPacket(new Uint8Array(16))).toBeNull();
  });

  it("falls back across XOR constants for unknown sizes", () => {
    // 300 bytes is no known packet size — decryptPacket must try all types.
    const plain = new Uint8Array(300);
    new DataView(plain.buffer).setUint32(0, 0x47375330, true);
    const raw = encryptLikeGame(plain, 0x00000042, 0x55fabb4f);
    expect(decryptPacket(raw)).not.toBeNull();
  });

  it("parses negative lap values (menus) correctly", () => {
    const plain = buildPacketA();
    new DataView(plain.buffer).setInt16(0x74, -1, true);
    new DataView(plain.buffer).setInt32(0x78, -1, true);
    const pkt = parsePacket(plain);
    expect(pkt.currentLap).toBe(-1);
    expect(pkt.bestLapMs).toBe(-1);
  });
});

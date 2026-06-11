/**
 * Salsa20 stream cipher (Bernstein, 20 rounds) — the exact construction GT7's
 * Simulator Interface uses. Canonical implementation shared with the mobile
 * app (mobile-app/src/gt7/salsa20.ts is a byte-for-byte copy — keep in sync).
 */

function rotl(v: number, n: number): number {
  return ((v << n) | (v >>> (32 - n))) | 0;
}

function readU32LE(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

// "expand 32-byte k"
const SIGMA = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574];

function coreBlock(input: Int32Array, out: Int32Array): void {
  const x = new Int32Array(16);
  x.set(input);
  for (let round = 0; round < 20; round += 2) {
    // column round
    x[4] ^= rotl((x[0] + x[12]) | 0, 7);
    x[8] ^= rotl((x[4] + x[0]) | 0, 9);
    x[12] ^= rotl((x[8] + x[4]) | 0, 13);
    x[0] ^= rotl((x[12] + x[8]) | 0, 18);
    x[9] ^= rotl((x[5] + x[1]) | 0, 7);
    x[13] ^= rotl((x[9] + x[5]) | 0, 9);
    x[1] ^= rotl((x[13] + x[9]) | 0, 13);
    x[5] ^= rotl((x[1] + x[13]) | 0, 18);
    x[14] ^= rotl((x[10] + x[6]) | 0, 7);
    x[2] ^= rotl((x[14] + x[10]) | 0, 9);
    x[6] ^= rotl((x[2] + x[14]) | 0, 13);
    x[10] ^= rotl((x[6] + x[2]) | 0, 18);
    x[3] ^= rotl((x[15] + x[11]) | 0, 7);
    x[7] ^= rotl((x[3] + x[15]) | 0, 9);
    x[11] ^= rotl((x[7] + x[3]) | 0, 13);
    x[15] ^= rotl((x[11] + x[7]) | 0, 18);
    // row round
    x[1] ^= rotl((x[0] + x[3]) | 0, 7);
    x[2] ^= rotl((x[1] + x[0]) | 0, 9);
    x[3] ^= rotl((x[2] + x[1]) | 0, 13);
    x[0] ^= rotl((x[3] + x[2]) | 0, 18);
    x[6] ^= rotl((x[5] + x[4]) | 0, 7);
    x[7] ^= rotl((x[6] + x[5]) | 0, 9);
    x[4] ^= rotl((x[7] + x[6]) | 0, 13);
    x[5] ^= rotl((x[4] + x[7]) | 0, 18);
    x[11] ^= rotl((x[10] + x[9]) | 0, 7);
    x[8] ^= rotl((x[11] + x[10]) | 0, 9);
    x[9] ^= rotl((x[8] + x[11]) | 0, 13);
    x[10] ^= rotl((x[9] + x[8]) | 0, 18);
    x[12] ^= rotl((x[15] + x[14]) | 0, 7);
    x[13] ^= rotl((x[12] + x[15]) | 0, 9);
    x[14] ^= rotl((x[13] + x[12]) | 0, 13);
    x[15] ^= rotl((x[14] + x[13]) | 0, 18);
  }
  for (let i = 0; i < 16; i++) out[i] = (x[i] + input[i]) | 0;
}

/**
 * XORs `data` with the Salsa20 keystream (encrypt == decrypt).
 * @param key   32 bytes
 * @param nonce 8 bytes
 */
export function salsa20Xor(key: Uint8Array, nonce: Uint8Array, data: Uint8Array): Uint8Array {
  if (key.length !== 32) throw new Error("salsa20: key must be 32 bytes");
  if (nonce.length !== 8) throw new Error("salsa20: nonce must be 8 bytes");

  const state = new Int32Array(16);
  state[0] = SIGMA[0];
  state[1] = readU32LE(key, 0) | 0;
  state[2] = readU32LE(key, 4) | 0;
  state[3] = readU32LE(key, 8) | 0;
  state[4] = readU32LE(key, 12) | 0;
  state[5] = SIGMA[1];
  state[6] = readU32LE(nonce, 0) | 0;
  state[7] = readU32LE(nonce, 4) | 0;
  state[8] = 0; // block counter low
  state[9] = 0; // block counter high
  state[10] = SIGMA[2];
  state[11] = readU32LE(key, 16) | 0;
  state[12] = readU32LE(key, 20) | 0;
  state[13] = readU32LE(key, 24) | 0;
  state[14] = readU32LE(key, 28) | 0;
  state[15] = SIGMA[3];

  const out = new Uint8Array(data.length);
  const block = new Int32Array(16);

  for (let offset = 0; offset < data.length; offset += 64) {
    coreBlock(state, block);
    // 64-bit little-endian counter increment
    state[8] = (state[8] + 1) | 0;
    if (state[8] === 0) state[9] = (state[9] + 1) | 0;

    const n = Math.min(64, data.length - offset);
    for (let i = 0; i < n; i++) {
      out[offset + i] = data[offset + i] ^ ((block[i >> 2] >>> ((i & 3) * 8)) & 0xff);
    }
  }
  return out;
}

/**
 * Salsa20 decryption for GT7 Simulator Interface packets.
 * Key: "Simulator Interface Packet GT7 ver 0.0" (32 bytes ASCII)
 * IV derivation varies by packet type:
 *   Type A: IV seed at 0x40 XOR'd with 0xDEADBEAF
 *   Type B: IV seed at 0x40 XOR'd with 0xDEADBEEF
 *   Type ~: IV seed at 0x40 XOR'd with 0x55FABB4F
 */

const GT7_KEY = new TextEncoder().encode('Simulator Interface Packet GT7 ver 0.0');
const MAGIC_CHECK = 0x47375330; // "G7S0"

// Packet type IV XOR constants
const IV_XOR_A = 0xDEADBEAF;
const IV_XOR_B = 0xDEADBEEF;
const IV_XOR_C = 0x55FABB4F;

function xor32(key: Uint8Array, input: Uint32Array): Uint32Array {
  const output = new Uint32Array(16);
  output.set(input);
  for (let i = 0; i < 20; i += 2) {
    output[4]  ^= (output[0]  + output[12]) | 0; output[8]  ^= rotl32(output[4],  7);
    output[9]  ^= (output[5]  + output[1])  | 0; output[13] ^= rotl32(output[9],  7);
    output[14] ^= (output[10] + output[6])  | 0; output[2]  ^= rotl32(output[14], 7);
    output[3]  ^= (output[15] + output[11]) | 0; output[7]  ^= rotl32(output[3],  7);
    output[8]  ^= (output[4]  + output[0])  | 0; output[12] ^= rotl32(output[8],  9);
    output[13] ^= (output[9]  + output[5])  | 0; output[1]  ^= rotl32(output[13], 9);
    output[2]  ^= (output[14] + output[10]) | 0; output[6]  ^= rotl32(output[2],  9);
    output[7]  ^= (output[3]  + output[15]) | 0; output[11] ^= rotl32(output[7],  9);
    output[0]  ^= (output[12] + output[8])  | 0; output[4]  ^= rotl32(output[0], 13);
    output[5]  ^= (output[1]  + output[13]) | 0; output[9]  ^= rotl32(output[5], 13);
    output[10] ^= (output[6]  + output[2])  | 0; output[14] ^= rotl32(output[10], 13);
    output[15] ^= (output[11] + output[7])  | 0; output[3]  ^= rotl32(output[15], 13);
    output[12] ^= (output[0]  + output[4])  | 0; output[8]  ^= rotl32(output[12], 18);
    output[1]  ^= (output[13] + output[9])  | 0; output[5]  ^= rotl32(output[1],  18);
    output[6]  ^= (output[2]  + output[14]) | 0; output[10] ^= rotl32(output[6],  18);
    output[11] ^= (output[7]  + output[15]) | 0; output[15] ^= rotl32(output[11], 18);
  }
  return output;
}

function rotl32(v: number, n: number): number {
  return ((v << n) | (v >>> (32 - n))) | 0;
}

function salsa20Decrypt(key: Uint8Array, nonce: Uint8Array, data: Uint8Array): Uint8Array {
  const keyInt = new Uint32Array(key.buffer);
  const sigma = new Uint32Array([
    0x61707865, 0x3320646e, 0x79622d32, 0x6b206574
  ]);

  const nonceInt = new Uint32Array(nonce.buffer);
  const nonceLow = nonceInt[0];
  const nonceHigh = nonceInt[1];

  const result = new Uint8Array(data.length);

  for (let blockStart = 0; blockStart < data.length; blockStart += 64) {
    const input = new Uint32Array(16);
    input[0] = sigma[0];
    input[1] = keyInt[0]; input[2] = keyInt[1];
    input[3] = keyInt[2]; input[4] = keyInt[3];
    input[5] = keyInt[4]; input[6] = keyInt[5];
    input[7] = keyInt[6]; input[8] = keyInt[7];
    input[9] = nonceLow;
    input[10] = nonceHigh;
    input[11] = nonceHigh;
    input[12] = nonceLow;
    input[13] = sigma[1]; input[14] = sigma[2]; input[15] = sigma[3];

    const ks = xor32(key, input);

    for (let i = 0; i < 16 && (blockStart + i * 4) < data.length; i++) {
      const byteOffset = blockStart + i * 4;
      for (let b = 0; b < 4 && (byteOffset + b) < data.length; b++) {
        result[byteOffset + b] = data[byteOffset + b] ^ ((ks[i] >>> (b * 8)) & 0xFF);
      }
    }
  }

  return result;
}

/**
 * Attempts to identify packet type by checking IV XOR constants,
 * decrypts with Salsa20, and returns the decrypted payload.
 * Returns null if decryption fails (magic check doesn't match).
 */
export function decryptGt7Packet(encryptedData: Buffer): Uint8Array | null {
  if (encryptedData.length < 0x44) return null; // Need at least 0x40 + 4 bytes

  const ivSeedView = new DataView(encryptedData.buffer, encryptedData.byteOffset + 0x40, 4);
  const ivSeed = ivSeedView.getUint32(0, true);

  // Try each packet type
  const xorConstants = [IV_XOR_A, IV_XOR_B, IV_XOR_C];

  for (const xorConst of xorConstants) {
    const derivedIV = ivSeed ^ xorConst;
    const nonce = new Uint8Array(8);
    const nonceView = new DataView(nonce.buffer);
    nonceView.setUint32(0, derivedIV, true);
    nonceView.setUint32(4, ivSeed, true);

    const payloadStart = 0x44;
    const payloadEnd = encryptedData.length;
    const payload = encryptedData.subarray(payloadStart, payloadEnd);

    const decrypted = salsa20Decrypt(GT7_KEY, nonce, new Uint8Array(payload));

    // Magic check: first 4 bytes should be 0x47375330 ("G7S0")
    const magicView = new DataView(decrypted.buffer, decrypted.byteOffset, 4);
    const magic = magicView.getUint32(0, true);

    if (magic === MAGIC_CHECK) {
      return decrypted;
    }
  }

  return null; // Magic check failed for all packet types
}

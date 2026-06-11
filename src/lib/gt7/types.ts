/**
 * Back-compat re-export. The canonical telemetry types live in
 * src/shared/telemetry.ts; the binary protocol (Salsa20 + packet layout)
 * lives in src/shared/gt7/.
 */
export * from "@/shared/telemetry";
export { decodePacket, decryptPacket, parsePacket } from "@/shared/gt7/packet";

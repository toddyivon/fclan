/**
 * UDP Socket listener for GT7 Simulator Interface telemetry.
 * Uses react-native-udp to receive raw UDP packets on port 33740
 * and send heartbeats to the console on port 33739 every 10 seconds.
 *
 * Heartbeat 'A' requests the 296-byte packet, which works on EVERY GT7
 * version ('B'/'~' need game update >= 1.42 and we don't use their extra
 * fields).
 */
import dgram from 'react-native-udp';
import { Buffer } from 'buffer';

const GT7_TARGET_PORT = 33739;
const GT7_LISTEN_PORT = 33740;
const HEARTBEAT_CHAR = 'A';
const HEARTBEAT_INTERVAL_MS = 10_000;
const STATUS_EMIT_MIN_INTERVAL_MS = 1_000;

export interface ListenerStatus {
  running: boolean;
  /** Epoch ms of the last raw datagram received (null until the first one). */
  lastPacketAt: number | null;
  error: string | null;
}

type PacketHandler = (packet: Uint8Array, remoteInfo: { address: string; port: number }) => void;
type StatusHandler = (status: ListenerStatus) => void;

class GT7UDPListener {
  private socket: ReturnType<typeof dgram.createSocket> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private ps5Ip: string | null = null;
  private isRunning = false;
  private lastPacketAt: number | null = null;
  private lastError: string | null = null;
  private lastStatusEmit = 0;
  private onStatus: StatusHandler | null = null;

  start(ps5Ip: string, onPacket: PacketHandler, onStatus?: StatusHandler): void {
    this.stop();

    this.ps5Ip = ps5Ip;
    this.isRunning = true;
    this.lastPacketAt = null;
    this.lastError = null;
    this.lastStatusEmit = 0;
    this.onStatus = onStatus ?? null;

    this.socket = dgram.createSocket({ type: 'udp4' });

    this.socket.on('message', (msg: Buffer, remoteInfo?: { address?: string; port?: number }) => {
      const address = remoteInfo?.address ?? '';
      if (this.ps5Ip && address && address !== this.ps5Ip) {
        return;
      }
      this.lastPacketAt = Date.now();
      this.emitStatus(false);
      onPacket(msg, { address, port: remoteInfo?.port ?? 0 });
    });

    this.socket.on('error', (err: unknown) => {
      console.error('UDP socket error:', err);
      this.lastError = err instanceof Error ? err.message : String(err);
      this.isRunning = false;
      this.emitStatus(true);
    });

    this.socket.bind(GT7_LISTEN_PORT, '0.0.0.0', () => {
      console.log(`UDP listener bound to port ${GT7_LISTEN_PORT}`);
      this.startHeartbeat();
      this.emitStatus(true);
    });
  }

  getStatus(): ListenerStatus {
    return {
      running: this.isRunning,
      lastPacketAt: this.lastPacketAt,
      error: this.lastError,
    };
  }

  private emitStatus(force: boolean): void {
    if (!this.onStatus) return;
    const now = Date.now();
    if (!force && now - this.lastStatusEmit < STATUS_EMIT_MIN_INTERVAL_MS) return;
    this.lastStatusEmit = now;
    this.onStatus(this.getStatus());
  }

  private startHeartbeat(): void {
    const sendHeartbeat = () => {
      if (!this.socket || !this.ps5Ip || !this.isRunning) return;

      this.socket.send(
        Buffer.from(HEARTBEAT_CHAR, 'utf8'),
        0,
        1,
        GT7_TARGET_PORT,
        this.ps5Ip,
        (err) => {
          if (err) console.error('Heartbeat send error:', err);
        }
      );
    };

    // Send immediately, then every 10 seconds
    sendHeartbeat();
    this.heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  }

  stop(): void {
    this.isRunning = false;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // already closed
      }
      this.socket = null;
    }
    this.onStatus = null;
  }
}

export const gt7UDPListener = new GT7UDPListener();

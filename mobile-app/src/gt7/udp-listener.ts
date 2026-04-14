/**
 * UDP Socket listener for GT7 Simulator Interface telemetry.
 * Uses react-native-udp to receive raw UDP packets on port 33740
 * and send heartbeats to PS5 on port 33739 every 10 seconds.
 */
import dgram from 'react-native-udp';

const GT7_TARGET_PORT = 33739;
const GT7_LISTEN_PORT = 33740;
const HEARTBEAT_PACKET_TYPE3 = '~';
const HEARTBEAT_INTERVAL_MS = 10_000;

type PacketHandler = (packet: Buffer, remoteInfo: { address: string; port: number }) => void;

class GT7UDPListener {
  private socket: ReturnType<typeof dgram.createSocket> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private ps5Ip: string | null = null;
  private isRunning = false;

  start(ps5Ip: string, onPacket: PacketHandler): void {
    this.ps5Ip = ps5Ip;
    this.isRunning = true;

    this.socket = dgram.createSocket('udp4');

    this.socket.on('message', (msg, remoteInfo) => {
      const address = remoteInfo?.address ?? '';
      if (this.ps5Ip && address && address !== this.ps5Ip) {
        return;
      }
      onPacket(msg, { address, port: remoteInfo?.port ?? 0 });
    });

    this.socket.on('error', (err) => {
      console.error('UDP socket error:', err);
      this.isRunning = false;
    });

    this.socket.bind(GT7_LISTEN_PORT, '0.0.0.0', () => {
      console.log(`UDP listener bound to port ${GT7_LISTEN_PORT}`);
      this.startHeartbeat();
    });
  }

  private startHeartbeat(): void {
    const sendHeartbeat = () => {
      if (!this.socket || !this.ps5Ip || !this.isRunning) return;

      this.socket.send(
        Buffer.from(HEARTBEAT_PACKET_TYPE3, 'utf8'),
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
      this.socket.close();
      this.socket = null;
    }
  }
}

export const gt7UDPListener = new GT7UDPListener();

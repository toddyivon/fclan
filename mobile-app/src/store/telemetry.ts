import { create } from 'zustand';

export interface MobileTelemetryPacket {
  packetId: number;
  posX: number; posY: number; posZ: number;
  velX: number; velY: number; velZ: number;
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

interface TelemetryState {
  isCapturing: boolean;
  ps5Ip: string | null;
  apiKey: string | null;
  currentPacket: MobileTelemetryPacket | null;
  sessionStarted: boolean;
  sessionId: string | null;
  batchBuffer: MobileTelemetryPacket[];
  ingestUrl: string;
  error: string | null;

  setPs5Ip: (ip: string) => void;
  setApiKey: (key: string) => void;
  setIngestUrl: (url: string) => void;
  setCapturing: (capturing: boolean) => void;
  updatePacket: (packet: MobileTelemetryPacket) => void;
  setError: (error: string | null) => void;
  setSessionId: (id: string | null) => void;
  getBufferedPoints: () => MobileTelemetryPacket[];
  clearBuffer: () => void;
}

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  isCapturing: false,
  ps5Ip: null,
  apiKey: null,
  currentPacket: null,
  sessionStarted: false,
  sessionId: null,
  batchBuffer: [],
  ingestUrl: 'https://gt7.donodomorro.com',
  error: null,

  setPs5Ip: (ip) => set({ ps5Ip: ip }),
  setApiKey: (key) => set({ apiKey: key }),
  setIngestUrl: (url) => {
    if (url && !/^https:\/\//i.test(url)) {
      set({ error: 'Ingest URL must use HTTPS' });
      return;
    }
    set({ ingestUrl: url, error: null });
  },

  setCapturing: (capturing) => {
    if (capturing) {
      set({ sessionStarted: false, sessionId: null, batchBuffer: [], error: null });
    } else {
      set({ isCapturing: false, currentPacket: null });
    }
  },

  updatePacket: (packet) => {
    set({ currentPacket: packet });
    const { batchBuffer } = get();
    set({ batchBuffer: [...batchBuffer, packet] });
  },

  setError: (error) => set({ error }),
  setSessionId: (id) => {
    if (id && !get().sessionStarted) {
      set({ sessionStarted: true });
    }
    set({ sessionId: id });
  },

  getBufferedPoints: () => {
    const points = get().batchBuffer;
    if (points.length > 30) return points.slice(-30);
    return points;
  },

  clearBuffer: () => set({ batchBuffer: [] }),
}));

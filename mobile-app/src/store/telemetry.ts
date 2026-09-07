/**
 * Telemetry capture store — owns the whole capture lifecycle:
 * UDP listener -> decode -> filter/downsample -> buffer -> 5s batched POST.
 *
 * The flush interval lives here (not in a component) and always reads fresh
 * state via useTelemetryStore.getState(), so there are no stale closures.
 */
import { create } from 'zustand';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { decodePacket } from '../gt7/packet';
import { FLAG_IN_RACE, FLAG_LOADING, FLAG_PAUSED } from '../gt7/telemetry';
import type { IngestPoint, TelemetryPacket } from '../gt7/telemetry';
import { gt7UDPListener } from '../gt7/udp-listener';
import { sendTelemetryBatch, getIngestErrorStatus } from '../api/ingest';

export type IngestStatus = 'idle' | 'ok' | 'error' | 'rate_limited';

const MAX_BUFFER_POINTS = 5000; // cap; oldest points are dropped beyond this
const FLUSH_INTERVAL_MS = 5000; // 12 req/min = server ingest rate limit
const DOWNSAMPLE_EVERY = 6; // game emits 60Hz; send at most 10 points/s
const UI_SYNC_EVERY = 6; // push live state to React at ~10Hz, not 60Hz
const BACKOFF_BASE_MS = 5000;
const BACKOFF_MAX_MS = 60_000;
const KEEP_AWAKE_TAG = 'gt7-capture';
// Final flush on stopCapture: up to 3 attempts (1s then 3s between them).
const FINAL_FLUSH_RETRY_DELAYS_MS = [1000, 3000];

// ---------------------------------------------------------------------------
// Non-reactive module state (mutated at 60Hz — keeping it out of zustand
// avoids re-rendering the UI on every packet).
// ---------------------------------------------------------------------------
const pointBuffer: IngestPoint[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushChain: Promise<void> = Promise.resolve();
let backoffMs = BACKOFF_BASE_MS;
let rateLimitedUntil = 0;
let onTrackCounter = 0;
let packetsSinceUiSync = 0;
let pendingReceived = 0;
let pendingDropped = 0;
let lastBufferedPoint: IngestPoint | null = null;
let latestCarCode: number | null = null;
// True once any flush has ASKED the server to create a session. Set before
// the request resolves so a timed-out first batch is never retried with
// is_new_session:true (which would duplicate the session server-side).
let newSessionRequested = false;

function toIngestPoint(p: TelemetryPacket): IngestPoint {
  return {
    packet_id: p.packetId,
    posX: p.posX, posY: p.posY, posZ: p.posZ,
    velX: p.velX, velY: p.velY, velZ: p.velZ,
    rotX: p.rotX, rotY: p.rotY, rotZ: p.rotZ, rotW: p.rotW,
    rpm: p.rpm,
    speed_ms: p.speedMs,
    turbo_boost: p.turboBoost,
    throttle: p.throttle,
    brake: p.brake,
    gear: p.gear,
    suggested_gear: p.suggestedGear,
    fuel_level: p.fuelLevel,
    fuel_capacity: p.fuelCapacity,
    tire_temp_fl: p.tireTempFl, tire_temp_fr: p.tireTempFr,
    tire_temp_rl: p.tireTempRl, tire_temp_rr: p.tireTempRr,
    tire_radius_fl: p.tireRadiusFl, tire_radius_fr: p.tireRadiusFr,
    tire_radius_rl: p.tireRadiusRl, tire_radius_rr: p.tireRadiusRr,
    flags: p.flags,
    current_lap: p.currentLap,
    total_laps: p.totalLaps,
    best_lap_ms: p.bestLapMs,
    last_lap_ms: p.lastLapMs,
  };
}

/** Drops oldest points beyond the cap; returns how many were dropped. */
function capBuffer(): number {
  const excess = pointBuffer.length - MAX_BUFFER_POINTS;
  if (excess > 0) {
    pointBuffer.splice(0, excess);
    return excess;
  }
  return 0;
}

function resetCaptureCounters(): void {
  pointBuffer.length = 0;
  backoffMs = BACKOFF_BASE_MS;
  rateLimitedUntil = 0;
  onTrackCounter = 0;
  packetsSinceUiSync = 0;
  pendingReceived = 0;
  pendingDropped = 0;
  lastBufferedPoint = null;
  latestCarCode = null;
  newSessionRequested = false;
}

interface TelemetryState {
  // settings
  ps5Ip: string | null;
  apiKey: string | null;
  ingestUrl: string;
  voiceEnabled: boolean;
  /** Optional manual track name — tags sessions for the leaderboard. */
  trackName: string | null;

  // capture lifecycle
  isCapturing: boolean;
  error: string | null;
  sessionId: string | null;

  // live telemetry for the UI (synced at ~10Hz)
  currentPacket: TelemetryPacket | null;
  lastPacketAt: number | null;
  packetsReceived: number;
  pointsSent: number;
  droppedPoints: number;
  bufferedPoints: number;
  ingestStatus: IngestStatus;
  currentLap: number;
  lastLapMs: number;
  bestLapMs: number;

  setPs5Ip: (ip: string) => void;
  setApiKey: (key: string) => void;
  setIngestUrl: (url: string) => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setTrackName: (name: string) => void;
  setError: (error: string | null) => void;

  startCapture: () => void;
  stopCapture: () => Promise<void>;
  /** Back-compat toggle — delegates to startCapture/stopCapture. */
  setCapturing: (capturing: boolean) => void;
}

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  ps5Ip: null,
  apiKey: null,
  // No default: the user must set their own ingest URL in Settings.
  // (Previously defaulted to a production domain — removed in fclan.)
  ingestUrl: "",
  voiceEnabled: true,
  trackName: null,

  isCapturing: false,
  error: null,
  sessionId: null,

  currentPacket: null,
  lastPacketAt: null,
  packetsReceived: 0,
  pointsSent: 0,
  droppedPoints: 0,
  bufferedPoints: 0,
  ingestStatus: 'idle',
  currentLap: 0,
  lastLapMs: 0,
  bestLapMs: 0,

  setPs5Ip: (ip) => set({ ps5Ip: ip }),
  setApiKey: (key) => set({ apiKey: key }),
  setIngestUrl: (url) => {
    if (url && !/^https:\/\//i.test(url)) {
      set({ error: 'Ingest URL must use HTTPS' });
      return;
    }
    set({ ingestUrl: url, error: null });
  },
  setVoiceEnabled: (enabled) => set({ voiceEnabled: enabled }),
  setTrackName: (name) => set({ trackName: name.trim() || null }),
  setError: (error) => set({ error }),

  startCapture: () => {
    const { isCapturing, ps5Ip, apiKey, ingestUrl } = get();
    if (isCapturing) return;
    if (!ps5Ip || !apiKey || !ingestUrl) {
      set({ error: 'Set PS5 IP, API key and ingest URL in Settings first' });
      return;
    }

    resetCaptureCounters();
    set({
      isCapturing: true,
      error: null,
      sessionId: null,
      currentPacket: null,
      lastPacketAt: null,
      packetsReceived: 0,
      pointsSent: 0,
      droppedPoints: 0,
      bufferedPoints: 0,
      ingestStatus: 'idle',
      currentLap: 0,
      lastLapMs: 0,
      bestLapMs: 0,
    });

    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {
      // best effort — capture still works if keep-awake fails
    });

    gt7UDPListener.start(
      ps5Ip,
      (msg) => handleRawPacket(msg),
      (status) => {
        if (status.error) {
          useTelemetryStore.setState({ error: `UDP error: ${status.error}` });
        }
      }
    );

    // Flush interval owned by the store. The callback reads fresh state via
    // getState() inside flush() — never through this closure.
    flushTimer = setInterval(() => {
      void enqueueFlush(false);
    }, FLUSH_INTERVAL_MS);
  },

  stopCapture: async () => {
    if (!get().isCapturing) return;

    gt7UDPListener.stop();
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    set({ isCapturing: false });

    try {
      // Final flush: drain whatever is buffered and mark the session ended.
      // A one-shot flush would orphan the session (no ended_at) and silently
      // drop the last points on failure, so retry with short backoff.
      let flushed = await enqueueFlush(true);
      for (const delayMs of FINAL_FLUSH_RETRY_DELAYS_MS) {
        if (flushed) break;
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        flushed = await enqueueFlush(true);
      }
      if (!flushed) {
        console.warn(
          'ingest: final flush failed after 3 attempts — session left open, remaining points not sent'
        );
        useTelemetryStore.setState({ ingestStatus: 'error' });
      }
    } finally {
      Promise.resolve(deactivateKeepAwake(KEEP_AWAKE_TAG)).catch(() => {});
      set({ sessionId: null, currentPacket: null });
    }
  },

  setCapturing: (capturing) => {
    if (capturing) {
      get().startCapture();
    } else {
      void get().stopCapture();
    }
  },
}));

// ---------------------------------------------------------------------------
// 60Hz packet path
// ---------------------------------------------------------------------------
function handleRawPacket(msg: Uint8Array): void {
  // react-native-udp hands us a Buffer (a Uint8Array subclass); normalize the
  // view so byteOffset/length are honored everywhere.
  const raw = new Uint8Array(msg.buffer, msg.byteOffset, msg.byteLength);
  const packet = decodePacket(raw);
  if (!packet) return;

  pendingReceived += 1;
  latestCarCode = packet.carCode;

  // Only record real on-track driving — skip menus, and discard paused or
  // loading packets so replays/pauses are not captured as driving. The
  // received counter above still includes those packets.
  const onTrack =
    (packet.flags & FLAG_IN_RACE) !== 0 &&
    (packet.flags & (FLAG_PAUSED | FLAG_LOADING)) === 0 &&
    packet.currentLap > 0;
  if (onTrack) {
    onTrackCounter += 1;
    // Downsample 60Hz -> 10Hz: keep 1 of every 6 on-track packets.
    if (onTrackCounter % DOWNSAMPLE_EVERY === 1) {
      const point = toIngestPoint(packet);
      pointBuffer.push(point);
      lastBufferedPoint = point;
      pendingDropped += capBuffer();
    }
  }

  packetsSinceUiSync += 1;
  if (packetsSinceUiSync >= UI_SYNC_EVERY) {
    packetsSinceUiSync = 0;
    const s = useTelemetryStore.getState();
    if (!s.isCapturing) return;
    useTelemetryStore.setState({
      currentPacket: packet,
      lastPacketAt: Date.now(),
      packetsReceived: s.packetsReceived + pendingReceived,
      droppedPoints: s.droppedPoints + pendingDropped,
      bufferedPoints: pointBuffer.length,
      currentLap: packet.currentLap,
      lastLapMs: packet.lastLapMs,
      bestLapMs: packet.bestLapMs,
    });
    pendingReceived = 0;
    pendingDropped = 0;
  }
}

// ---------------------------------------------------------------------------
// Batched ingest with drain-safe buffer and backoff
// ---------------------------------------------------------------------------

/**
 * Serializes flushes so a slow request never overlaps the next tick.
 * Resolves true when the flush succeeded (or had nothing to do), false when
 * the batch failed and may need a retry.
 */
function enqueueFlush(isFinal: boolean): Promise<boolean> {
  const run = flushChain.then(() => doFlush(isFinal));
  // doFlush never rejects, but guard the chain anyway.
  flushChain = run.then(
    () => {},
    () => {}
  );
  return run;
}

async function doFlush(isFinal: boolean): Promise<boolean> {
  const state = useTelemetryStore.getState();
  const { apiKey, ingestUrl } = state;
  if (!apiKey || !ingestUrl) return true;
  if (!isFinal && Date.now() < rateLimitedUntil) return true;

  // Drain via splice: points arriving during the await below are pushed onto
  // the (now empty) shared array — they are neither lost nor re-sent.
  let snapshot = pointBuffer.splice(0, pointBuffer.length);
  if (snapshot.length === 0) {
    if (isFinal && lastBufferedPoint && state.sessionId) {
      // Nothing left to send but we still need to close the session; resend
      // the last point (idempotent server-side) just to carry is_final.
      snapshot = [lastBufferedPoint];
    } else {
      return true;
    }
  }

  // Only the FIRST attempt may ask the server to create a session. If that
  // request times out after the server already created one, retries send
  // is_new_session:false so the server reuses the open session from its
  // reuse window (points dedupe by packet_id) instead of duplicating it.
  const isNewSession = state.sessionId === null && !newSessionRequested;
  if (state.sessionId === null) newSessionRequested = true;

  try {
    const result = await sendTelemetryBatch({
      baseUrl: ingestUrl,
      apiKey,
      sessionId: state.sessionId,
      points: snapshot,
      trackName: state.trackName ?? undefined,
      carCode: latestCarCode ?? undefined,
      isNewSession,
      isFinal,
    });
    backoffMs = BACKOFF_BASE_MS;
    rateLimitedUntil = 0;
    useTelemetryStore.setState((s) => ({
      ingestStatus: 'ok',
      sessionId: result.session_id ?? s.sessionId,
      pointsSent: s.pointsSent + snapshot.length,
      bufferedPoints: pointBuffer.length,
      error: null,
    }));
    return true;
  } catch (err) {
    const status = getIngestErrorStatus(err);

    if (status === 429) {
      // Rate limited: requeue and back off (x2 up to 60s).
      pointBuffer.unshift(...snapshot);
      const dropped = capBuffer();
      backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
      rateLimitedUntil = Date.now() + backoffMs;
      useTelemetryStore.setState((s) => ({
        ingestStatus: 'rate_limited',
        droppedPoints: s.droppedPoints + dropped,
        bufferedPoints: pointBuffer.length,
      }));
    } else if (status !== null && status >= 400 && status < 500) {
      // 400/401/404 (and other 4xx): the batch will never succeed — discard.
      console.warn(
        `ingest: HTTP ${status} — discarding batch of ${snapshot.length} points`
      );
      const message =
        status === 401
          ? 'Ingest rejected: invalid API key'
          : status === 404
            ? 'Ingest rejected: session not found'
            : `Ingest rejected (HTTP ${status})`;
      useTelemetryStore.setState((s) => ({
        ingestStatus: 'error',
        error: message,
        droppedPoints: s.droppedPoints + snapshot.length,
        bufferedPoints: pointBuffer.length,
      }));
    } else {
      // 5xx / timeout / network: requeue at the FRONT and retry next tick.
      pointBuffer.unshift(...snapshot);
      const dropped = capBuffer();
      useTelemetryStore.setState((s) => ({
        ingestStatus: 'error',
        droppedPoints: s.droppedPoints + dropped,
        bufferedPoints: pointBuffer.length,
      }));
    }
    return false;
  }
}

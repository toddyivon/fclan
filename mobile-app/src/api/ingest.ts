import axios from 'axios';
import type { IngestPoint } from '../gt7/telemetry';

const ingest = axios.create({
  timeout: 10_000,
});

export interface IngestResponse {
  status: string;
  session_id: string;
  points_received?: number;
  points_inserted?: number;
  current_lap?: number;
}

export interface SendBatchOptions {
  baseUrl: string;
  apiKey: string;
  sessionId: string | null;
  /** Points already mapped to the server wire format (snake_case). */
  points: IngestPoint[];
  carName?: string;
  trackName?: string;
  /** From settings if specified, otherwise from packet.carCode. */
  carCode?: number;
  /**
   * Ask the server to create a brand-new session. Only meaningful while
   * sessionId is null; defaults to true. The store passes false on retries
   * so a timed-out first batch never duplicates the session — the server
   * then reuses the open session from its reuse window instead.
   */
  isNewSession?: boolean;
  /** Marks the session as ended (sets ended_at server-side). */
  isFinal?: boolean;
}

export async function sendTelemetryBatch(opts: SendBatchOptions): Promise<IngestResponse> {
  const { baseUrl, apiKey, sessionId, points, carName, trackName, carCode, isNewSession, isFinal } = opts;
  const res = await ingest.post<IngestResponse>(
    `${baseUrl.replace(/\/+$/, '')}/api/ingest`,
    {
      session_id: sessionId ?? undefined,
      car_name: carName,
      car_code: carCode,
      track_name: trackName,
      is_new_session: sessionId === null ? (isNewSession ?? true) : undefined,
      is_final: isFinal === true ? true : undefined,
      points,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return res.data;
}

/** HTTP status of a failed ingest call, or null for network/timeout errors. */
export function getIngestErrorStatus(err: unknown): number | null {
  if (axios.isAxiosError(err)) return err.response?.status ?? null;
  return null;
}

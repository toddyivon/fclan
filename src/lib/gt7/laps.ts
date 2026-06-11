/**
 * Pure lap-transition detection for the ingest pipeline.
 *
 * GT7 packets carry session-level lap state on every point:
 *   - current_lap: 1-based lap counter while on track, 0 in menus/replays.
 *   - last_lap_ms: time of the most recently completed lap (-1 when unset).
 *   - best_lap_ms: best lap of the session so far (-1 when unset).
 *   - total_laps: race lap count (0 for time trial / free run).
 *
 * No IO here — everything is derived from the previous known lap number and
 * the incoming batch, so this module is trivially unit-testable.
 */

import type { IngestPoint } from "@/shared/telemetry";

export interface CompletedLap {
  lapNumber: number;
  /** Milliseconds, or null when the game did not report a usable time. */
  lapTimeMs: number | null;
}

export interface LapTransitionResult {
  /**
   * lap_number to store for each point, index-aligned with the input.
   * null when the point is out of track / in a menu (current_lap <= 0 or
   * missing).
   */
  pointLapNumbers: Array<number | null>;
  /** Laps completed within this batch, in order of completion. */
  completedLaps: CompletedLap[];
  /** Lap the car is on after the batch (>= prevLap semantics, see below). */
  currentLap: number;
  /** Min positive best lap seen in the batch (packets + completed laps). */
  bestLapMs: number | null;
  /** Most recent positive last_lap_ms in the batch. */
  lastLapMs: number | null;
  /** Max total_laps reported by the batch (race lap count), null if absent. */
  totalLaps: number | null;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Walks a batch of points and detects lap completions.
 *
 * Rules:
 * - A point belongs to lap `current_lap` when `current_lap >= 1`; a value of
 *   0 (menu / out of track) or a missing value maps to null.
 * - When current_lap increases from N to N+1 (N >= 1), lap N is complete.
 *   Its time is the `last_lap_ms` of the first point of lap N+1, when > 0;
 *   otherwise the lap is recorded with a null time.
 * - When current_lap jumps by more than one (dropped batches), intermediate
 *   laps are recorded with null times; only the lap immediately preceding the
 *   new lap can claim the reported `last_lap_ms`.
 * - Decreases (race restart, back to menu and into a new event) never create
 *   laps; tracking simply resumes from the lower lap number.
 *
 * @param prevLap last known current_lap for the session (0 when unknown).
 * @param points  incoming batch, in capture order.
 */
export function processLapTransitions(
  prevLap: number,
  points: IngestPoint[]
): LapTransitionResult {
  let currentLap = isFiniteNumber(prevLap) && prevLap >= 1 ? Math.floor(prevLap) : 0;

  const pointLapNumbers: Array<number | null> = [];
  const completedLaps: CompletedLap[] = [];
  let bestLapMs: number | null = null;
  let lastLapMs: number | null = null;
  let totalLaps: number | null = null;

  for (const point of points) {
    const rawLap = point.current_lap;
    const lap = isFiniteNumber(rawLap) && rawLap >= 1 ? Math.floor(rawLap) : null;
    pointLapNumbers.push(lap);

    if (isFiniteNumber(point.best_lap_ms) && point.best_lap_ms > 0) {
      bestLapMs = bestLapMs === null ? point.best_lap_ms : Math.min(bestLapMs, point.best_lap_ms);
    }
    if (isFiniteNumber(point.last_lap_ms) && point.last_lap_ms > 0) {
      lastLapMs = point.last_lap_ms;
    }
    if (isFiniteNumber(point.total_laps) && point.total_laps > 0) {
      totalLaps = totalLaps === null
        ? Math.floor(point.total_laps)
        : Math.max(totalLaps, Math.floor(point.total_laps));
    }

    if (lap === null) continue;

    if (currentLap >= 1 && lap > currentLap) {
      // Laps currentLap .. lap-1 finished. Only the one directly before the
      // new lap can claim this point's last_lap_ms.
      const reported =
        isFiniteNumber(point.last_lap_ms) && point.last_lap_ms > 0
          ? point.last_lap_ms
          : null;
      for (let n = currentLap; n < lap; n++) {
        completedLaps.push({
          lapNumber: n,
          lapTimeMs: n === lap - 1 ? reported : null,
        });
      }
    }
    // Decreases are resets/menus: never emit laps, just resume tracking.
    currentLap = lap;
  }

  for (const lapDone of completedLaps) {
    if (lapDone.lapTimeMs !== null && lapDone.lapTimeMs > 0) {
      bestLapMs = bestLapMs === null ? lapDone.lapTimeMs : Math.min(bestLapMs, lapDone.lapTimeMs);
    }
  }

  return { pointLapNumbers, completedLaps, currentLap, bestLapMs, lastLapMs, totalLaps };
}

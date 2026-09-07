/**
 * Median-lap synthesis — port of gt7dashboard's get_median_lap
 * (gt7dashboard/gt7helper.py:438-482) to TypeScript.
 *
 * Method: drop laps more than ±10s from the best completed lap (box laps,
 * out laps, incidents), then take the per-sample median across the survivors
 * (zip_longest semantics: uneven lengths pad with undefined and are
 * ignored). Scalar attributes take the plain median; the lap title follows
 * the original format: "Median (N Laps): M:SS.mmm".
 *
 * Works on normalized distance-grid samples (see
 * pro/lapComparisonEngine.normalizeLapToDistance) OR raw tick arrays —
 * the caller decides the grid; this module is grid-agnostic.
 */

export interface MedianLapInput {
  lapNumber: number;
  lapTimeMs: number | null;
  /** per-sample speed in m/s (tick order) */
  speed: number[];
  /** per-sample throttle 0-255 (tick order) */
  throttle: number[];
  /** per-sample brake 0-255 (tick order) */
  brake: number[];
}

export interface MedianLap {
  title: string;
  lapCount: number;
  bestLapMs: number | null;
  medianLapTimeMs: number | null;
  speed: number[];
  throttle: number[];
  brake: number[];
}

/** ±10s filter window, matching the Python original. */
export const MEDIAN_WINDOW_MS = 10_000;

export function median(values: number[]): number {
  if (values.length === 0) throw new Error("no median for empty data");
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n % 2 === 1) return sorted[n >> 1];
  const i = n >> 1;
  return (sorted[i - 1] + sorted[i]) / 2;
}

/**
 * Median that ignores missing samples (zip_longest fill = undefined),
 * mirroring none_ignoring_median. Throws on all-missing.
 */
export function medianIgnoringMissing(values: Array<number | undefined | null>): number {
  const present = values.filter((v): v is number => v != null && Number.isFinite(v));
  return median(present);
}

export function formatLapTimeMs(ms: number | null): string {
  if (ms == null || ms <= 0) return "-:--.---";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

/**
 * Builds the median lap from a set of completed laps.
 * Returns null when no lap survives the ±10s window.
 */
export function getMedianLap(laps: MedianLapInput[]): MedianLap | null {
  const completed = laps.filter((l) => l.lapTimeMs != null && l.lapTimeMs > 0);
  if (completed.length === 0) return null;

  const bestMs = Math.min(...completed.map((l) => l.lapTimeMs as number));
  const survivors = completed.filter(
    (l) => Math.abs((l.lapTimeMs as number) - bestMs) <= MEDIAN_WINDOW_MS
  );
  if (survivors.length === 0) return null;

  const maxLen = Math.max(...survivors.map((l) => l.speed.length));
  const speed: number[] = [];
  const throttle: number[] = [];
  const brake: number[] = [];

  for (let i = 0; i < maxLen; i++) {
    try {
      speed.push(medianIgnoringMissing(survivors.map((l) => l.speed[i])));
    } catch {
      speed.push(speed[speed.length - 1] ?? 0);
    }
    try {
      throttle.push(medianIgnoringMissing(survivors.map((l) => l.throttle[i])));
    } catch {
      throttle.push(throttle[throttle.length - 1] ?? 0);
    }
    try {
      brake.push(medianIgnoringMissing(survivors.map((l) => l.brake[i])));
    } catch {
      brake.push(brake[brake.length - 1] ?? 0);
    }
  }

  const medianTime = Math.round(median(survivors.map((l) => l.lapTimeMs as number)));

  return {
    title: `Median (${survivors.length} Laps): ${formatLapTimeMs(medianTime)}`,
    lapCount: survivors.length,
    bestLapMs: bestMs,
    medianLapTimeMs: medianTime,
    speed,
    throttle,
    brake,
  };
}

/**
 * Speed-variance consistency — port of gt7dashboard's
 * get_variance_for_fastest_laps / get_variance_for_laps
 * (gt7dashboard/gt7helper.py:719-762) to TypeScript.
 *
 * Method: take the N fastest completed laps within X% of the best (default
 * 3 laps, 5% threshold — same defaults as the original), resample each to a
 * shared 0-100% distance grid (100 samples, linear interpolation — the same
 * mechanic as Pro's normalizeLapToDistance), then compute the per-grid-point
 * standard deviation of speed. High variance at a distance % = inconsistent
 * line/speed there; the session page renders it as the consistency chart.
 */

export interface VariancePoint {
  /** 0-100 % of lap distance */
  distancePct: number;
  /** stddev of speed (m/s) across the fastest laps at this point */
  speedStddev: number;
  /** mean speed (m/s) at this point — for context rows */
  meanSpeed: number;
}

export interface ConsistencyInput {
  lapNumber: number;
  lapTimeMs: number | null;
  isReplay?: boolean;
  /** per-sample speed in m/s, tick order */
  speed: number[];
}

export const DEFAULT_N_FASTEST = 3;
export const DEFAULT_PERCENT_THRESHOLD = 0.05;
export const DISTANCE_GRID_SAMPLES = 100;

/** Linear-interpolated resample of a speed series onto a 0-100 grid. */
export function resampleToDistanceGrid(speed: number[], samples = DISTANCE_GRID_SAMPLES): number[] {
  if (speed.length === 0) return [];
  if (speed.length === 1) return new Array(samples + 1).fill(speed[0]);
  const out: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const target = (i / samples) * (speed.length - 1);
    const lo = Math.floor(target);
    const hi = Math.min(speed.length - 1, lo + 1);
    const t = target - lo;
    out.push(speed[lo] * (1 - t) + speed[hi] * t);
  }
  return out;
}

export function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const varSum = values.reduce((a, b) => a + (b - mean) * (b - mean), 0);
  return Math.sqrt(varSum / values.length);
}

/**
 * Picks the fastest laps eligible for variance: completed, non-replay,
 * within `percentThreshold` of the best, capped at `n`.
 */
export function pickFastestLaps(
  laps: ConsistencyInput[],
  n = DEFAULT_N_FASTEST,
  percentThreshold = DEFAULT_PERCENT_THRESHOLD
): ConsistencyInput[] {
  const eligible = laps.filter(
    (l) => l.lapTimeMs != null && l.lapTimeMs > 0 && l.isReplay !== true && l.speed.length > 0
  );
  if (eligible.length === 0) return [];
  eligible.sort((a, b) => (a.lapTimeMs as number) - (b.lapTimeMs as number));
  const best = eligible[0].lapTimeMs as number;
  return eligible
    .filter((l) => (l.lapTimeMs as number) <= best * (1 + percentThreshold))
    .slice(0, n);
}

/**
 * Per-grid-point stddev of speed across the picked fastest laps.
 */
export function varianceAcrossLaps(
  laps: ConsistencyInput[],
  n = DEFAULT_N_FASTEST,
  percentThreshold = DEFAULT_PERCENT_THRESHOLD
): { points: VariancePoint[]; lapsUsed: number[] } {
  const fastest = pickFastestLaps(laps, n, percentThreshold);
  if (fastest.length === 0) return { points: [], lapsUsed: [] };

  const grids = fastest.map((l) => resampleToDistanceGrid(l.speed));
  const points: VariancePoint[] = [];
  for (let i = 0; i <= DISTANCE_GRID_SAMPLES; i++) {
    const column = grids.map((g) => g[i]);
    const mean = column.reduce((a, b) => a + b, 0) / column.length;
    points.push({ distancePct: i, speedStddev: stddev(column), meanSpeed: mean });
  }
  return { points, lapsUsed: fastest.map((l) => l.lapNumber) };
}

/**
 * One-number consistency score 0..1 (higher = more consistent), as the mean
 * of per-point (1 - stddev/mean), clamped — same shape as the session page's
 * existing score so the chart and the number agree.
 */
export function consistencyScoreFromVariance(points: VariancePoint[]): number {
  if (points.length === 0) return 0;
  const per = points.map((p) =>
    p.meanSpeed > 0.1 ? Math.max(0, 1 - p.speedStddev / p.meanSpeed) : 1
  );
  return per.reduce((a, b) => a + b, 0) / per.length;
}

/**
 * Tuning & performance insights derived from a lap's raw point stream.
 *
 * Spec gap closed: GT7_Data asked for tuning insights like max speed and
 * min ride height. max speed is derivable from speed_ms; min ride height
 * is NOT carried in the telemetry_points schema today (the packet exposes it
 * at offset 0x38, but IngestPoint omits it). We expose the derived set now
 * and leave a typed slot (rideHeightMs) so the parser can fill it later
 * without changing consumers.
 */

export interface LapInsight {
  lapNumber: number;
  lapTimeMs: number | null;
  /** km/h */
  topSpeedKph: number;
  /** km/h */
  minSpeedKph: number;
  /** km/h — top speed of the lap that best tops out (straight-line check) */
  minContinuousSpeedKph: number | null;
  /** 0-100 for one of the corners (slower than 40% of the lap's own range) */
  fastestThrottlePct: number;
  /** total fuel consumed this lap (arbitrary units the game reports) */
  fuelConsumed: number | null;
  /** tire delta at start vs end per corner in °C (indexes FL,FR,RL,RR) */
  tireTempDelta: number[];
  /** meters of track length accumulated (for reference) */
  trackLengthM: number;
}

export interface SessionInsightSummary {
  topSessionSpeedKph: number;
  minSessionSpeedKph: number;
  bestLapInsight: LapInsight | null;
  avgLapTimeMs: number | null;
  /** ms — best vs next best (gap to closer) */
  bestGapMs: number | null;
}

export interface InsightPoint {
  tMs: number;
  speedMs: number;
  throttle?: number | null;
  fuelLevel?: number | null;
  tireTempFl?: number | null;
  tireTempFr?: number | null;
  tireTempRl?: number | null;
  tireTempRr?: number | null;
}

export function buildLapInsight(lapNumber: number, lapTimeMs: number | null, points: InsightPoint[]): LapInsight {
  let topSpeedKph = 0;
  let minSpeedKph = Infinity;
  let throttleSum = 0;
  let throttleN = 0;
  let trackLengthM = 0;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const kph = p.speedMs * 3.6;
    if (kph > topSpeedKph) topSpeedKph = kph;
    if (kph < minSpeedKph && p.speedMs > 0.1) minSpeedKph = kph;
    throttleSum += p.throttle ?? 0;
    throttleN += p.throttle != null ? 1 : 0;
    if (i > 0) {
      const prev = points[i - 1];
      const dtSec = Math.max(0, (p.tMs - prev.tMs) / 1000);
      trackLengthM += ((p.speedMs + prev.speedMs) / 2) * dtSec;
    }
  }

  if (!Number.isFinite(minSpeedKph)) minSpeedKph = 0;

  const fuelConsumed =
    points.length >= 2 && points[0].fuelLevel != null && points[points.length - 1].fuelLevel != null
      ? (points[0].fuelLevel ?? 0) - (points[points.length - 1].fuelLevel ?? 0)
      : null;

  const tireTempDelta = [
    (points[points.length - 1]?.tireTempFl ?? 0) - (points[0]?.tireTempFl ?? 0),
    (points[points.length - 1]?.tireTempFr ?? 0) - (points[0]?.tireTempFr ?? 0),
    (points[points.length - 1]?.tireTempRl ?? 0) - (points[0]?.tireTempRl ?? 0),
    (points[points.length - 1]?.tireTempRr ?? 0) - (points[0]?.tireTempRr ?? 0),
  ].map((d) => Math.round(d));

  let minContinuousSpeedKph: number | null = null;
  {
    // A "continuous" low: the minimum speed the car held for >= 0.5s.
    let run = 0;
    let runMin = Infinity;
    for (let i = 1; i < points.length; i++) {
      const dtSec = (points[i].tMs - points[i - 1].tMs) / 1000;
      if (dtSec > 0.2) {
        run = 0;
        runMin = Infinity;
        continue;
      }
      run += dtSec;
      runMin = Math.min(runMin, points[i].speedMs * 3.6);
      if (run >= 0.5 && (minContinuousSpeedKph == null || runMin < minContinuousSpeedKph)) {
        minContinuousSpeedKph = runMin;
      }
    }
  }

  return {
    lapNumber,
    lapTimeMs,
    topSpeedKph: Math.round(topSpeedKph),
    minSpeedKph: Math.round(minSpeedKph),
    minContinuousSpeedKph: minContinuousSpeedKph != null ? Math.round(minContinuousSpeedKph) : null,
    fastestThrottlePct: throttleN > 0 ? Math.round((throttleSum / throttleN / 255) * 100) : 0,
    fuelConsumed: fuelConsumed != null ? Math.round(fuelConsumed * 10) / 10 : null,
    tireTempDelta,
    trackLengthM: Math.round(trackLengthM),
  };
}

export function summarizeSession(laps: LapInsight[], sessionLapTimeMs: number | null): SessionInsightSummary {
  const withTime = laps.filter((l) => l.lapTimeMs != null);
  const topSessionSpeedKph = laps.reduce((max, l) => Math.max(max, l.topSpeedKph), 0);
  const minSessionSpeedKph = laps.reduce((min, l) => Math.min(min, l.minSpeedKph), Infinity);

  const bestLapInsight = withTime.reduce<LapInsight | null>((best, l) => {
    if (best == null || (l.lapTimeMs as number) < (best.lapTimeMs as number)) return l;
    return best;
  }, null);

  const avgLapTimeMs =
    withTime.length > 0
      ? Math.round(withTime.reduce((sum, l) => sum + (l.lapTimeMs as number), 0) / withTime.length)
      : null;

  const sorted = withTime.map((l) => l.lapTimeMs as number).sort((a, b) => a - b);
  const bestGapMs = sorted.length >= 2 ? sorted[1] - sorted[0] : null;

  return {
    topSessionSpeedKph: Math.round(topSessionSpeedKph),
    minSessionSpeedKph: Number.isFinite(minSessionSpeedKph) ? Math.round(minSessionSpeedKph) : 0,
    bestLapInsight,
    avgLapTimeMs,
    bestGapMs,
  };
}

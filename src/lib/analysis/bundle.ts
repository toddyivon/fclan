/**
 * Session analysis bundle — the ONE live product path for every harvested
 * engine (Stage 3). Pure: takes adapted points + lap metadata, returns a
 * JSON-safe bundle the `/api/sessions/[id]/analysis` route serves and the
 * SessionAnalysis UI renders.
 *
 * Engines used:
 *  - pro/lapComparisonEngine.compareLaps (distance-normalized delta — the
 *    TS equivalent of gt7dashboard's time-diff-by-distance)
 *  - pro/cornerDetector.detectCorners + detectBrakeZones (apex/minima work
 *    that replaces a separate scipy find_peaks port)
 *  - pro/fuelCalculator.analyzeFuelStrategy (strategy + pit windows)
 *  - variance.ts (consistency stddev chart, port of get_variance_for_laps)
 *  - median-lap.ts (median reference lap, port of get_median_lap)
 *  - fuel-map.ts (relative mixture simulator, port of the FuelMap table)
 */

import type { TelemetryPoint, TimeDelta, SectorBreakdown, LapData, BrakeZone } from "./pro/types";
import { compareLaps } from "./pro/lapComparisonEngine";
import { detectCorners, detectBrakeZones, type DetectedCorner } from "./pro/cornerDetector";
import { analyzeFuelStrategy, type FuelStrategyResult } from "./pro/fuelCalculator";
import { varianceAcrossLaps, consistencyScoreFromVariance } from "./variance";
import { getMedianLap } from "./median-lap";
import { baselineFromLap, simulateFuelMaps, type FuelMapSetting } from "./fuel-map";

export interface BundleLapInput {
  lapNumber: number;
  lapTimeMs: number | null;
  points: TelemetryPoint[];
}

export interface BundleMeta {
  currentLap: number;
  totalLaps: number;
}

export interface StrippedCorner {
  id: number;
  entryDistance: number;
  apexDistance: number;
  exitDistance: number;
  entrySpeed: number;
  apexSpeed: number;
  exitSpeed: number;
  rating: DetectedCorner["rating"];
  timeLoss: number;
  suggestions: string[];
  duration: number;
  speedProfile: Array<{ distance: number; speed: number }>;
}

export interface AnalysisBundle {
  bestLapNumber: number | null;
  targetLapNumber: number | null;
  /** downsampled to ~50 samples for the wire */
  timeDelta: TimeDelta[];
  totalDeltaSec: number | null;
  sectorBreakdown: SectorBreakdown[];
  comparisonInsights: string[];
  corners: StrippedCorner[];
  brakeZones: BrakeZone[];
  fuel: Pick<
    FuelStrategyResult,
    | "currentFuel"
    | "estimatedLapsRemaining"
    | "fuelMapRecommendation"
    | "canFinishWithoutStop"
    | "recommendations"
    | "pitStops"
  > & { avgConsumptionPerLap: number };
  consistency: { score: number; lapsUsed: number[] };
  median: { title: string; lapTimeMs: number | null } | null;
  fuelMaps: FuelMapSetting[];
}

const WIRE_SAMPLES = 50;

function toLapData(lap: BundleLapInput): LapData {
  const speeds = lap.points.map((p) => p.speed);
  const topSpeed = speeds.length ? Math.max(...speeds) : 0;
  const averageSpeed = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
  return {
    lapNumber: lap.lapNumber,
    lapTime: lap.lapTimeMs ?? 0,
    topSpeed,
    averageSpeed,
    isValid: lap.lapTimeMs != null && lap.lapTimeMs > 0,
  };
}

function stripCorner(c: DetectedCorner): StrippedCorner {
  return {
    id: c.id,
    entryDistance: c.entryDistance,
    apexDistance: c.apexDistance,
    exitDistance: c.exitDistance,
    entrySpeed: c.entrySpeed,
    apexSpeed: c.apexSpeed,
    exitSpeed: c.exitSpeed,
    rating: c.rating,
    timeLoss: c.timeLoss,
    suggestions: c.suggestions,
    duration: c.duration,
    speedProfile: c.speedProfile,
  };
}

function downsampleDelta(delta: TimeDelta[], target = WIRE_SAMPLES): TimeDelta[] {
  if (delta.length <= target) return delta;
  const step = delta.length / target;
  const out: TimeDelta[] = [];
  for (let i = 0; i < target; i++) out.push(delta[Math.floor(i * step)]);
  return out;
}

export function buildAnalysisBundle(laps: BundleLapInput[], meta: BundleMeta): AnalysisBundle {
  const completed = laps.filter((l) => l.lapTimeMs != null && l.lapTimeMs > 0 && l.points.length >= 2);
  const empty: AnalysisBundle = {
    bestLapNumber: null,
    targetLapNumber: null,
    timeDelta: [],
    totalDeltaSec: null,
    sectorBreakdown: [],
    comparisonInsights: [],
    corners: [],
    brakeZones: [],
    fuel: {
      currentFuel: 100,
      avgConsumptionPerLap: 0,
      estimatedLapsRemaining: Infinity,
      fuelMapRecommendation: "normal",
      canFinishWithoutStop: true,
      recommendations: ["No fuel data available for analysis"],
      pitStops: [],
    },
    consistency: { score: 0, lapsUsed: [] },
    median: null,
    fuelMaps: [],
  };
  if (completed.length === 0) return empty;

  const best = completed.reduce((a, b) => ((b.lapTimeMs as number) < (a.lapTimeMs as number) ? b : a));
  const target = completed[completed.length - 1];

  // --- Lap comparison (best vs last) ---
  let timeDelta: TimeDelta[] = [];
  let totalDeltaSec: number | null = null;
  let sectorBreakdown: SectorBreakdown[] = [];
  let comparisonInsights: string[] = [];
  if (completed.length >= 2 && target.lapNumber !== best.lapNumber) {
    const cmp = compareLaps(
      { lapNumber: best.lapNumber, lapData: toLapData(best), points: best.points },
      { lapNumber: target.lapNumber, lapData: toLapData(target), points: target.points }
    );
    timeDelta = downsampleDelta(cmp.timeDelta);
    // Pro's totalDelta is (bestMs - targetMs): negate + convert so the bundle
    // is seconds with positive = target slower (F1 timing convention).
    totalDeltaSec = -cmp.totalDelta / 1000;
    sectorBreakdown = cmp.sectorBreakdown;
    comparisonInsights = cmp.insights;
  }

  // --- Corners + brake zones on the best lap ---
  const corners = detectCorners(best.points).map(stripCorner);
  const brakeZones = detectBrakeZones(best.points);

  // --- Fuel strategy across the whole session ---
  const allPoints = completed.flatMap((l) => l.points);
  const fuelResult = analyzeFuelStrategy(allPoints, meta.currentLap, meta.totalLaps);
  const fuel = {
    currentFuel: fuelResult.currentFuel,
    avgConsumptionPerLap: fuelResult.consumptionStats.avgConsumptionPerLap,
    estimatedLapsRemaining: fuelResult.estimatedLapsRemaining,
    fuelMapRecommendation: fuelResult.fuelMapRecommendation,
    canFinishWithoutStop: fuelResult.canFinishWithoutStop,
    recommendations: fuelResult.recommendations.slice(0, 3),
    pitStops: fuelResult.pitStops,
  };

  // --- Consistency across fastest laps ---
  const { points: varPoints, lapsUsed } = varianceAcrossLaps(
    completed.map((l) => ({
      lapNumber: l.lapNumber,
      lapTimeMs: l.lapTimeMs,
      speed: l.points.map((p) => p.speed),
    }))
  );
  const consistency = { score: consistencyScoreFromVariance(varPoints), lapsUsed };

  // --- Median reference lap ---
  const medianLap = getMedianLap(
    completed.map((l) => ({
      lapNumber: l.lapNumber,
      lapTimeMs: l.lapTimeMs,
      speed: l.points.map((p) => p.speed),
      throttle: l.points.map((p) => p.throttle),
      brake: l.points.map((p) => p.brake),
    }))
  );
  const median = medianLap ? { title: medianLap.title, lapTimeMs: medianLap.medianLapTimeMs } : null;

  // --- Relative fuel maps from the best lap's fuel swing ---
  const bestFuelStart = best.points[0]?.fuel ?? null;
  const bestFuelEnd = best.points[best.points.length - 1]?.fuel ?? null;
  const fuelMaps = simulateFuelMaps(
    baselineFromLap({ fuelAtStart: bestFuelStart, fuelAtEnd: bestFuelEnd, lapTimeMs: best.lapTimeMs })
  ).map((m) => ({ ...m }));

  return {
    bestLapNumber: best.lapNumber,
    targetLapNumber: target.lapNumber,
    timeDelta,
    totalDeltaSec,
    sectorBreakdown,
    comparisonInsights,
    corners,
    brakeZones,
    fuel,
    consistency,
    median,
    fuelMaps,
  };
}

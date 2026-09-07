/**
 * Harvested from GT7-Telemetry-Pro (MIT lineage: revived as features, not as base).
 * Pure analysis engine — no framework/CN/backend deps. Kept verbatim except this header.
 * See docs/00-KNOWLEDGE-BASE.md §4 (reuse map) for provenance.
 */

import { TelemetryPoint, TimeDelta, SectorBreakdown, LapData } from './types';
import { calculateCumulativeDistance } from './racingLineCalculator';

/**
 * Lap Comparison Engine
 * Compares telemetry data between laps and calculates deltas
 */

export interface ComparisonMetric {
  distance: number;
  [lapId: string]: number;
}

export interface LapComparisonResult {
  timeDelta: TimeDelta[];
  speedDifferential: ComparisonMetric[];
  throttleComparison: ComparisonMetric[];
  brakeComparison: ComparisonMetric[];
  sectorBreakdown: SectorBreakdown[];
  insights: string[];
  totalDelta: number;
}

export type MetricKey = 'speed' | 'throttle' | 'brake' | 'gear' | 'rpm';

/**
 * Normalize lap data to distance-based metrics
 */
export function normalizeLapToDistance(
  points: TelemetryPoint[],
  numSamples: number = 100
): { distance: number; time: number; speed: number; throttle: number; brake: number; gear: number }[] {
  if (points.length < 2) return [];

  const pointsWithDistance = calculateCumulativeDistance(points);
  const totalDistance = (pointsWithDistance[pointsWithDistance.length - 1] as any).distance;
  const startTime = points[0].timestamp;

  const normalizedData: { distance: number; time: number; speed: number; throttle: number; brake: number; gear: number }[] = [];

  for (let i = 0; i <= numSamples; i++) {
    const targetDistance = (i / numSamples) * totalDistance;

    // Find interpolated values at this distance
    let prevIdx = 0;
    let nextIdx = 0;

    for (let j = 0; j < pointsWithDistance.length; j++) {
      if ((pointsWithDistance[j] as any).distance >= targetDistance) {
        nextIdx = j;
        prevIdx = Math.max(0, j - 1);
        break;
      }
    }

    const prev = pointsWithDistance[prevIdx];
    const next = pointsWithDistance[nextIdx];
    const prevDist = (prev as any).distance;
    const nextDist = (next as any).distance;

    // Interpolation factor
    const t = nextDist > prevDist
      ? (targetDistance - prevDist) / (nextDist - prevDist)
      : 0;

    normalizedData.push({
      distance: (i / numSamples) * 100, // Normalize to 0-100%
      time: (prev.timestamp - startTime) + t * ((next.timestamp - startTime) - (prev.timestamp - startTime)),
      speed: prev.speed + t * (next.speed - prev.speed),
      throttle: prev.throttle + t * (next.throttle - prev.throttle),
      brake: prev.brake + t * (next.brake - prev.brake),
      gear: Math.round(prev.gear + t * (next.gear - prev.gear)),
    });
  }

  return normalizedData;
}

/**
 * Calculate time delta between two laps
 */
export function calculateTimeDelta(
  lap1Points: TelemetryPoint[],
  lap2Points: TelemetryPoint[],
  numSamples: number = 100
): TimeDelta[] {
  const lap1Normalized = normalizeLapToDistance(lap1Points, numSamples);
  const lap2Normalized = normalizeLapToDistance(lap2Points, numSamples);

  if (lap1Normalized.length === 0 || lap2Normalized.length === 0) return [];

  const deltas: TimeDelta[] = [];

  for (let i = 0; i < numSamples; i++) {
    const lap1Data = lap1Normalized[i];
    const lap2Data = lap2Normalized[i];

    deltas.push({
      distance: lap1Data.distance,
      delta: (lap1Data.time - lap2Data.time) / 1000, // Convert to seconds
      lap1Time: lap1Data.time / 1000,
      lap2Time: lap2Data.time / 1000,
    });
  }

  return deltas;
}

/**
 * Calculate speed differential between laps
 */
export function calculateSpeedDifferential(
  laps: { lapNumber: number; points: TelemetryPoint[] }[],
  numSamples: number = 100
): ComparisonMetric[] {
  const normalizedLaps = laps.map(lap => ({
    lapNumber: lap.lapNumber,
    data: normalizeLapToDistance(lap.points, numSamples),
  }));

  const result: ComparisonMetric[] = [];

  for (let i = 0; i <= numSamples; i++) {
    const metric: ComparisonMetric = { distance: i };

    normalizedLaps.forEach(lap => {
      if (lap.data[i]) {
        metric[lap.lapNumber.toString()] = lap.data[i].speed * 3.6; // Convert to km/h
      }
    });

    result.push(metric);
  }

  return result;
}

/**
 * Calculate throttle comparison between laps
 */
export function calculateThrottleComparison(
  laps: { lapNumber: number; points: TelemetryPoint[] }[],
  numSamples: number = 100
): ComparisonMetric[] {
  const normalizedLaps = laps.map(lap => ({
    lapNumber: lap.lapNumber,
    data: normalizeLapToDistance(lap.points, numSamples),
  }));

  const result: ComparisonMetric[] = [];

  for (let i = 0; i <= numSamples; i++) {
    const metric: ComparisonMetric = { distance: i };

    normalizedLaps.forEach(lap => {
      if (lap.data[i]) {
        metric[lap.lapNumber.toString()] = lap.data[i].throttle / 255; // Normalize to 0-1
      }
    });

    result.push(metric);
  }

  return result;
}

/**
 * Calculate brake comparison between laps
 */
export function calculateBrakeComparison(
  laps: { lapNumber: number; points: TelemetryPoint[] }[],
  numSamples: number = 100
): ComparisonMetric[] {
  const normalizedLaps = laps.map(lap => ({
    lapNumber: lap.lapNumber,
    data: normalizeLapToDistance(lap.points, numSamples),
  }));

  const result: ComparisonMetric[] = [];

  for (let i = 0; i <= numSamples; i++) {
    const metric: ComparisonMetric = { distance: i };

    normalizedLaps.forEach(lap => {
      if (lap.data[i]) {
        metric[lap.lapNumber.toString()] = lap.data[i].brake / 255; // Normalize to 0-1
      }
    });

    result.push(metric);
  }

  return result;
}

/**
 * Calculate sector-by-sector breakdown
 */
export function calculateSectorBreakdown(
  lap1Data: LapData,
  lap2Data: LapData,
  lap1Points: TelemetryPoint[],
  lap2Points: TelemetryPoint[]
): SectorBreakdown[] {
  const sectors: SectorBreakdown[] = [];

  // Use provided sector times if available
  if (lap1Data.sector1Time && lap2Data.sector1Time) {
    // Calculate average speeds for each sector
    const lap1Normalized = normalizeLapToDistance(lap1Points, 100);
    const lap2Normalized = normalizeLapToDistance(lap2Points, 100);

    const calculateSectorSpeed = (data: typeof lap1Normalized, start: number, end: number) => {
      const sectorPoints = data.filter(d => d.distance >= start && d.distance < end);
      if (sectorPoints.length === 0) return 0;
      return (sectorPoints.reduce((sum, p) => sum + p.speed, 0) / sectorPoints.length) * 3.6;
    };

    sectors.push({
      sector: 1,
      lap1Time: lap1Data.sector1Time,
      lap2Time: lap2Data.sector1Time,
      delta: lap1Data.sector1Time - lap2Data.sector1Time,
      avgSpeed1: calculateSectorSpeed(lap1Normalized, 0, 33),
      avgSpeed2: calculateSectorSpeed(lap2Normalized, 0, 33),
    });

    if (lap1Data.sector2Time && lap2Data.sector2Time) {
      sectors.push({
        sector: 2,
        lap1Time: lap1Data.sector2Time,
        lap2Time: lap2Data.sector2Time,
        delta: lap1Data.sector2Time - lap2Data.sector2Time,
        avgSpeed1: calculateSectorSpeed(lap1Normalized, 33, 66),
        avgSpeed2: calculateSectorSpeed(lap2Normalized, 33, 66),
      });
    }

    if (lap1Data.sector3Time && lap2Data.sector3Time) {
      sectors.push({
        sector: 3,
        lap1Time: lap1Data.sector3Time,
        lap2Time: lap2Data.sector3Time,
        delta: lap1Data.sector3Time - lap2Data.sector3Time,
        avgSpeed1: calculateSectorSpeed(lap1Normalized, 66, 100),
        avgSpeed2: calculateSectorSpeed(lap2Normalized, 66, 100),
      });
    }
  } else {
    // Estimate sectors by dividing lap into thirds
    const lap1Normalized = normalizeLapToDistance(lap1Points, 100);
    const lap2Normalized = normalizeLapToDistance(lap2Points, 100);

    const getTotalTime = (data: typeof lap1Normalized) =>
      data.length > 0 ? data[data.length - 1].time : 0;

    const lap1TotalTime = getTotalTime(lap1Normalized);
    const lap2TotalTime = getTotalTime(lap2Normalized);

    for (let i = 0; i < 3; i++) {
      const start = (i / 3) * 100;
      const end = ((i + 1) / 3) * 100;

      const getSectorTime = (data: typeof lap1Normalized, startPct: number, endPct: number) => {
        const startPoint = data.find(d => d.distance >= startPct);
        const endPoint = data.find(d => d.distance >= endPct);
        if (!startPoint || !endPoint) return 0;
        return endPoint.time - startPoint.time;
      };

      const getSectorSpeed = (data: typeof lap1Normalized, startPct: number, endPct: number) => {
        const sectorPoints = data.filter(d => d.distance >= startPct && d.distance < endPct);
        if (sectorPoints.length === 0) return 0;
        return (sectorPoints.reduce((sum, p) => sum + p.speed, 0) / sectorPoints.length) * 3.6;
      };

      const lap1SectorTime = getSectorTime(lap1Normalized, start, end);
      const lap2SectorTime = getSectorTime(lap2Normalized, start, end);

      sectors.push({
        sector: i + 1,
        lap1Time: lap1SectorTime,
        lap2Time: lap2SectorTime,
        delta: lap1SectorTime - lap2SectorTime,
        avgSpeed1: getSectorSpeed(lap1Normalized, start, end),
        avgSpeed2: getSectorSpeed(lap2Normalized, start, end),
      });
    }
  }

  return sectors;
}

/**
 * Generate insights from lap comparison
 */
export function generateComparisonInsights(
  lap1Number: number,
  lap2Number: number,
  lap1Time: number,
  lap2Time: number,
  speedDiff: ComparisonMetric[],
  sectorBreakdown: SectorBreakdown[]
): string[] {
  const insights: string[] = [];
  const timeDelta = lap1Time - lap2Time;

  // Overall comparison
  if (timeDelta > 0) {
    insights.push(`Lap ${lap2Number} is ${(timeDelta / 1000).toFixed(3)}s faster than Lap ${lap1Number}`);
  } else if (timeDelta < 0) {
    insights.push(`Lap ${lap1Number} is ${(Math.abs(timeDelta) / 1000).toFixed(3)}s faster than Lap ${lap2Number}`);
  } else {
    insights.push('Both laps have identical times');
  }

  // Speed analysis
  const lap1Speeds = speedDiff.map(d => d[lap1Number.toString()] || 0);
  const lap2Speeds = speedDiff.map(d => d[lap2Number.toString()] || 0);
  const avgSpeedDiff = (lap1Speeds.reduce((a, b) => a + b, 0) / lap1Speeds.length) -
                       (lap2Speeds.reduce((a, b) => a + b, 0) / lap2Speeds.length);

  if (Math.abs(avgSpeedDiff) > 2) {
    if (avgSpeedDiff > 0) {
      insights.push(`Lap ${lap1Number} has ${avgSpeedDiff.toFixed(1)} km/h higher average speed`);
    } else {
      insights.push(`Lap ${lap2Number} has ${Math.abs(avgSpeedDiff).toFixed(1)} km/h higher average speed`);
    }
  }

  // Sector analysis
  sectorBreakdown.forEach(sector => {
    if (Math.abs(sector.delta) > 100) { // More than 0.1s difference
      const fasterLap = sector.delta > 0 ? lap2Number : lap1Number;
      insights.push(`Sector ${sector.sector}: Lap ${fasterLap} is ${(Math.abs(sector.delta) / 1000).toFixed(3)}s faster`);
    }
  });

  // Find sections with biggest speed differences
  let maxSpeedDiff = 0;
  let maxSpeedDiffDistance = 0;
  speedDiff.forEach(d => {
    const diff = (d[lap1Number.toString()] || 0) - (d[lap2Number.toString()] || 0);
    if (Math.abs(diff) > Math.abs(maxSpeedDiff)) {
      maxSpeedDiff = diff;
      maxSpeedDiffDistance = d.distance;
    }
  });

  if (Math.abs(maxSpeedDiff) > 10) {
    const fasterLap = maxSpeedDiff > 0 ? lap1Number : lap2Number;
    insights.push(`Largest speed difference at ${maxSpeedDiffDistance.toFixed(0)}%: Lap ${fasterLap} is ${Math.abs(maxSpeedDiff).toFixed(1)} km/h faster`);
  }

  return insights;
}

/**
 * Compare multiple laps and return full comparison result
 */
export function compareLaps(
  lap1: { lapNumber: number; lapData: LapData; points: TelemetryPoint[] },
  lap2: { lapNumber: number; lapData: LapData; points: TelemetryPoint[] }
): LapComparisonResult {
  const timeDelta = calculateTimeDelta(lap1.points, lap2.points);
  const speedDifferential = calculateSpeedDifferential([
    { lapNumber: lap1.lapNumber, points: lap1.points },
    { lapNumber: lap2.lapNumber, points: lap2.points },
  ]);
  const throttleComparison = calculateThrottleComparison([
    { lapNumber: lap1.lapNumber, points: lap1.points },
    { lapNumber: lap2.lapNumber, points: lap2.points },
  ]);
  const brakeComparison = calculateBrakeComparison([
    { lapNumber: lap1.lapNumber, points: lap1.points },
    { lapNumber: lap2.lapNumber, points: lap2.points },
  ]);
  const sectorBreakdown = calculateSectorBreakdown(
    lap1.lapData,
    lap2.lapData,
    lap1.points,
    lap2.points
  );
  const insights = generateComparisonInsights(
    lap1.lapNumber,
    lap2.lapNumber,
    lap1.lapData.lapTime,
    lap2.lapData.lapTime,
    speedDifferential,
    sectorBreakdown
  );

  const totalDelta = lap1.lapData.lapTime - lap2.lapData.lapTime;

  return {
    timeDelta,
    speedDifferential,
    throttleComparison,
    brakeComparison,
    sectorBreakdown,
    insights,
    totalDelta,
  };
}

/**
 * Format time in mm:ss.ms format
 */
export function formatLapTime(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);
  const ms = Math.floor((milliseconds % 1000) / 10);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

/**
 * Format delta time with +/- prefix
 */
export function formatDeltaTime(seconds: number): string {
  const prefix = seconds >= 0 ? '+' : '-';
  const absSeconds = Math.abs(seconds);
  return `${prefix}${absSeconds.toFixed(3)}s`;
}

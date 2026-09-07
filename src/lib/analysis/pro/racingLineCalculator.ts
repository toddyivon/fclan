/**
 * Harvested from GT7-Telemetry-Pro (MIT lineage: revived as features, not as base).
 * Pure analysis engine — no framework/CN/backend deps. Kept verbatim except this header.
 * See docs/00-KNOWLEDGE-BASE.md §4 (reuse map) for provenance.
 */

import { TelemetryPoint, RacingLinePoint, IdealLine, Corner } from './types';

/**
 * Racing Line Calculator
 * Analyzes and calculates optimal racing lines from telemetry data
 */

export interface RacingLineOptions {
  smoothingFactor?: number;
  speedColorScale?: {
    min: number;
    max: number;
  };
}

export interface BrakePoint {
  distance: number;
  x: number;
  y: number;
  speed: number;
  brakeIntensity: number;
}

export interface ThrottleZone {
  startDistance: number;
  endDistance: number;
  avgThrottle: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

/**
 * Calculate cumulative distance for telemetry points
 */
export function calculateCumulativeDistance(points: TelemetryPoint[]): TelemetryPoint[] {
  if (points.length === 0) return [];

  const result: TelemetryPoint[] = [];
  let cumulativeDistance = 0;

  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      const prev = points[i - 1];
      const curr = points[i];
      const dx = curr.position.x - prev.position.x;
      const dy = curr.position.y - prev.position.y;
      const dz = curr.position.z - prev.position.z;
      cumulativeDistance += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    result.push({
      ...points[i],
      // @ts-ignore - Adding distance property
      distance: cumulativeDistance,
    });
  }

  return result;
}

/**
 * Convert telemetry points to racing line points
 */
export function toRacingLinePoints(
  points: TelemetryPoint[],
  options: RacingLineOptions = {}
): RacingLinePoint[] {
  const pointsWithDistance = calculateCumulativeDistance(points);
  const totalDistance = pointsWithDistance.length > 0
    ? (pointsWithDistance[pointsWithDistance.length - 1] as any).distance
    : 0;

  return pointsWithDistance.map((p) => ({
    // @ts-ignore
    distance: (p.distance / totalDistance) * 100, // Normalize to 0-100%
    x: p.position.x,
    y: p.position.z, // Use Z as Y for 2D representation
    speed: p.speed * 3.6, // Convert m/s to km/h
    throttle: p.throttle / 255, // Normalize to 0-1
    brake: p.brake / 255, // Normalize to 0-1
    isOptimal: false,
  }));
}

/**
 * Detect brake points on the racing line
 */
export function detectBrakePoints(
  points: TelemetryPoint[],
  minBrakeThreshold: number = 30 // Minimum brake input (0-255) to consider as braking
): BrakePoint[] {
  const brakePoints: BrakePoint[] = [];
  const pointsWithDistance = calculateCumulativeDistance(points);
  const totalDistance = pointsWithDistance.length > 0
    ? (pointsWithDistance[pointsWithDistance.length - 1] as any).distance
    : 0;

  let inBrakeZone = false;
  let brakeZoneStart: TelemetryPoint | null = null;

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const isBraking = point.brake > minBrakeThreshold;

    if (isBraking && !inBrakeZone) {
      // Start of brake zone
      inBrakeZone = true;
      brakeZoneStart = point;

      brakePoints.push({
        // @ts-ignore
        distance: ((pointsWithDistance[i] as any).distance / totalDistance) * 100,
        x: point.position.x,
        y: point.position.z,
        speed: point.speed * 3.6,
        brakeIntensity: point.brake / 255,
      });
    } else if (!isBraking && inBrakeZone) {
      // End of brake zone
      inBrakeZone = false;
      brakeZoneStart = null;
    }
  }

  return brakePoints;
}

/**
 * Detect throttle application zones
 */
export function detectThrottleZones(
  points: TelemetryPoint[],
  minThrottleThreshold: number = 200 // High throttle threshold (0-255)
): ThrottleZone[] {
  const throttleZones: ThrottleZone[] = [];
  const pointsWithDistance = calculateCumulativeDistance(points);
  const totalDistance = pointsWithDistance.length > 0
    ? (pointsWithDistance[pointsWithDistance.length - 1] as any).distance
    : 0;

  let inThrottleZone = false;
  let zoneStart: { point: TelemetryPoint; distance: number } | null = null;
  let zoneThrottleSum = 0;
  let zonePointCount = 0;

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const distance = (pointsWithDistance[i] as any).distance;
    const isFullThrottle = point.throttle > minThrottleThreshold;

    if (isFullThrottle && !inThrottleZone) {
      // Start of throttle zone
      inThrottleZone = true;
      zoneStart = { point, distance };
      zoneThrottleSum = point.throttle;
      zonePointCount = 1;
    } else if (isFullThrottle && inThrottleZone) {
      // Continue throttle zone
      zoneThrottleSum += point.throttle;
      zonePointCount++;
    } else if (!isFullThrottle && inThrottleZone && zoneStart) {
      // End of throttle zone
      inThrottleZone = false;

      throttleZones.push({
        startDistance: (zoneStart.distance / totalDistance) * 100,
        endDistance: (distance / totalDistance) * 100,
        avgThrottle: (zoneThrottleSum / zonePointCount) / 255,
        startX: zoneStart.point.position.x,
        startY: zoneStart.point.position.z,
        endX: point.position.x,
        endY: point.position.z,
      });

      zoneStart = null;
      zoneThrottleSum = 0;
      zonePointCount = 0;
    }
  }

  return throttleZones;
}

/**
 * Calculate ideal racing line by comparing multiple laps
 */
export function calculateIdealLine(
  lapsData: TelemetryPoint[][],
  lapTimes: number[]
): IdealLine | null {
  if (lapsData.length === 0) return null;

  // Find the fastest lap
  const fastestLapIndex = lapTimes.indexOf(Math.min(...lapTimes));
  const fastestLap = lapsData[fastestLapIndex];

  if (!fastestLap || fastestLap.length === 0) return null;

  const pointsWithDistance = calculateCumulativeDistance(fastestLap);
  const totalDistance = (pointsWithDistance[pointsWithDistance.length - 1] as any).distance;

  // Normalize to 100 evenly spaced points
  const normalizedPoints: RacingLinePoint[] = [];
  const numPoints = 100;

  for (let i = 0; i <= numPoints; i++) {
    const targetDistance = (i / numPoints) * totalDistance;

    // Find closest points
    let closestIndex = 0;
    for (let j = 0; j < pointsWithDistance.length; j++) {
      if ((pointsWithDistance[j] as any).distance >= targetDistance) {
        closestIndex = j;
        break;
      }
    }

    const point = pointsWithDistance[closestIndex];
    normalizedPoints.push({
      distance: i,
      x: point.position.x,
      y: point.position.z,
      speed: point.speed * 3.6,
      throttle: point.throttle / 255,
      brake: point.brake / 255,
      isOptimal: true,
    });
  }

  const avgSpeed = normalizedPoints.reduce((sum, p) => sum + p.speed, 0) / normalizedPoints.length;

  return {
    points: normalizedPoints,
    totalTime: lapTimes[fastestLapIndex],
    avgSpeed,
  };
}

/**
 * Compare two racing lines and calculate deviation
 */
export function compareRacingLines(
  line1: RacingLinePoint[],
  line2: RacingLinePoint[]
): { deviations: number[]; avgDeviation: number; maxDeviation: number } {
  const deviations: number[] = [];

  // Ensure both lines have the same number of points
  const numPoints = Math.min(line1.length, line2.length);

  for (let i = 0; i < numPoints; i++) {
    const p1 = line1[i];
    const p2 = line2[i];
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const deviation = Math.sqrt(dx * dx + dy * dy);
    deviations.push(deviation);
  }

  const avgDeviation = deviations.reduce((sum, d) => sum + d, 0) / deviations.length;
  const maxDeviation = Math.max(...deviations);

  return { deviations, avgDeviation, maxDeviation };
}

/**
 * Get speed color based on value
 * Returns color from red (slow) to green (fast)
 */
export function getSpeedColor(speed: number, minSpeed: number, maxSpeed: number): string {
  const normalized = Math.max(0, Math.min(1, (speed - minSpeed) / (maxSpeed - minSpeed)));

  // Red -> Yellow -> Green
  const r = Math.round(255 * (1 - normalized));
  const g = Math.round(255 * normalized);
  const b = 0;

  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Smooth racing line using Catmull-Rom interpolation
 */
export function smoothRacingLine(
  points: RacingLinePoint[],
  segments: number = 5
): RacingLinePoint[] {
  if (points.length < 4) return points;

  const smoothedPoints: RacingLinePoint[] = [];

  for (let i = 0; i < points.length - 3; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const p2 = points[i + 2];
    const p3 = points[i + 3];

    for (let t = 0; t < segments; t++) {
      const tNorm = t / segments;

      // Catmull-Rom spline interpolation
      const tt = tNorm * tNorm;
      const ttt = tt * tNorm;

      const q0 = -ttt + 2 * tt - tNorm;
      const q1 = 3 * ttt - 5 * tt + 2;
      const q2 = -3 * ttt + 4 * tt + tNorm;
      const q3 = ttt - tt;

      const x = 0.5 * (p0.x * q0 + p1.x * q1 + p2.x * q2 + p3.x * q3);
      const y = 0.5 * (p0.y * q0 + p1.y * q1 + p2.y * q2 + p3.y * q3);

      // Linear interpolation for other values
      const speed = p1.speed + (p2.speed - p1.speed) * tNorm;
      const throttle = p1.throttle + (p2.throttle - p1.throttle) * tNorm;
      const brake = p1.brake + (p2.brake - p1.brake) * tNorm;
      const distance = p1.distance + (p2.distance - p1.distance) * tNorm;

      smoothedPoints.push({
        distance,
        x,
        y,
        speed,
        throttle,
        brake,
        isOptimal: p1.isOptimal,
      });
    }
  }

  return smoothedPoints;
}

/**
 * Generate track outline from racing line points
 */
export function generateTrackOutline(
  points: RacingLinePoint[],
  trackWidth: number = 10
): { outer: RacingLinePoint[]; inner: RacingLinePoint[] } {
  const outer: RacingLinePoint[] = [];
  const inner: RacingLinePoint[] = [];

  for (let i = 0; i < points.length; i++) {
    const prev = points[i === 0 ? points.length - 1 : i - 1];
    const curr = points[i];
    const next = points[(i + 1) % points.length];

    // Calculate perpendicular direction
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len > 0) {
      const perpX = -dy / len;
      const perpY = dx / len;

      outer.push({
        ...curr,
        x: curr.x + perpX * trackWidth / 2,
        y: curr.y + perpY * trackWidth / 2,
      });

      inner.push({
        ...curr,
        x: curr.x - perpX * trackWidth / 2,
        y: curr.y - perpY * trackWidth / 2,
      });
    }
  }

  return { outer, inner };
}

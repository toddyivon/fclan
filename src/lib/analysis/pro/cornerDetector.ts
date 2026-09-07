/**
 * Harvested from GT7-Telemetry-Pro (MIT lineage: revived as features, not as base).
 * Pure analysis engine — no framework/CN/backend deps. Kept verbatim except this header.
 * See docs/00-KNOWLEDGE-BASE.md §4 (reuse map) for provenance.
 */

import { TelemetryPoint, Corner, BrakeZone } from './types';
import { calculateCumulativeDistance } from './racingLineCalculator';

/**
 * Corner Detection and Analysis
 * Detects corners from telemetry and provides detailed analysis
 */

export interface CornerDetectionOptions {
  minSpeedDrop: number; // Minimum speed drop to consider as corner (km/h)
  minCornerDuration: number; // Minimum duration for a corner (ms)
  smoothingWindow: number; // Number of points for smoothing
}

export interface DetectedCorner extends Corner {
  telemetryPoints: TelemetryPoint[];
  duration: number;
  speedProfile: { distance: number; speed: number }[];
}

const DEFAULT_OPTIONS: CornerDetectionOptions = {
  minSpeedDrop: 15,
  minCornerDuration: 500,
  smoothingWindow: 5,
};

/**
 * Smooth speed data using moving average
 */
function smoothSpeed(points: TelemetryPoint[], window: number): number[] {
  const smoothed: number[] = [];

  for (let i = 0; i < points.length; i++) {
    let sum = 0;
    let count = 0;

    for (let j = Math.max(0, i - Math.floor(window / 2));
         j <= Math.min(points.length - 1, i + Math.floor(window / 2));
         j++) {
      sum += points[j].speed;
      count++;
    }

    smoothed.push(sum / count);
  }

  return smoothed;
}

/**
 * Find local minima in speed data (potential apexes)
 */
function findLocalMinima(speeds: number[], threshold: number = 5): number[] {
  const minima: number[] = [];

  for (let i = 1; i < speeds.length - 1; i++) {
    if (speeds[i] < speeds[i - 1] && speeds[i] < speeds[i + 1]) {
      // Check if this is a significant minimum
      const leftMax = Math.max(...speeds.slice(Math.max(0, i - 20), i));
      const rightMax = Math.max(...speeds.slice(i + 1, Math.min(speeds.length, i + 21)));

      if (leftMax - speeds[i] > threshold && rightMax - speeds[i] > threshold) {
        minima.push(i);
      }
    }
  }

  return minima;
}

/**
 * Detect corners from telemetry data
 */
export function detectCorners(
  points: TelemetryPoint[],
  options: Partial<CornerDetectionOptions> = {}
): DetectedCorner[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (points.length < opts.smoothingWindow * 2) return [];

  const pointsWithDistance = calculateCumulativeDistance(points);
  const totalDistance = (pointsWithDistance[pointsWithDistance.length - 1] as any).distance;

  // Smooth speed data
  const smoothedSpeeds = smoothSpeed(points, opts.smoothingWindow);

  // Find apexes (local minima)
  const apexIndices = findLocalMinima(smoothedSpeeds, opts.minSpeedDrop / 3.6);

  const corners: DetectedCorner[] = [];

  apexIndices.forEach((apexIdx, cornerNum) => {
    // Find entry point (where braking starts)
    let entryIdx = apexIdx;
    for (let i = apexIdx; i >= 0; i--) {
      if (points[i].brake > 30 && entryIdx === apexIdx) {
        // Start of braking zone
        while (i > 0 && points[i - 1].brake > 30) i--;
        entryIdx = i;
        break;
      }
      if (smoothedSpeeds[i] > smoothedSpeeds[apexIdx] + opts.minSpeedDrop / 3.6) {
        entryIdx = i;
        break;
      }
    }

    // Find exit point (where throttle is full)
    let exitIdx = apexIdx;
    for (let i = apexIdx; i < points.length; i++) {
      if (points[i].throttle > 240) {
        exitIdx = i;
        break;
      }
      if (smoothedSpeeds[i] > smoothedSpeeds[apexIdx] + opts.minSpeedDrop / 3.6) {
        exitIdx = i;
        break;
      }
    }

    // Validate corner duration
    const duration = points[exitIdx].timestamp - points[entryIdx].timestamp;
    if (duration < opts.minCornerDuration) return;

    // Extract corner points
    const cornerPoints = points.slice(entryIdx, exitIdx + 1);

    // Calculate distances
    const entryDistance = ((pointsWithDistance[entryIdx] as any).distance / totalDistance) * 100;
    const apexDistance = ((pointsWithDistance[apexIdx] as any).distance / totalDistance) * 100;
    const exitDistance = ((pointsWithDistance[exitIdx] as any).distance / totalDistance) * 100;

    // Find brake point
    let brakePointIdx = entryIdx;
    for (let i = entryIdx; i <= apexIdx; i++) {
      if (points[i].brake > 50) {
        brakePointIdx = i;
        break;
      }
    }

    // Find throttle point
    let throttlePointIdx = exitIdx;
    for (let i = apexIdx; i <= exitIdx; i++) {
      if (points[i].throttle > 200) {
        throttlePointIdx = i;
        break;
      }
    }

    // Speed profile
    const speedProfile = cornerPoints.map((p, i) => ({
      distance: ((pointsWithDistance[entryIdx + i] as any).distance / totalDistance) * 100,
      speed: p.speed * 3.6,
    }));

    const corner: DetectedCorner = {
      id: cornerNum + 1,
      entryDistance,
      apexDistance,
      exitDistance,
      entrySpeed: points[entryIdx].speed * 3.6,
      apexSpeed: points[apexIdx].speed * 3.6,
      exitSpeed: points[exitIdx].speed * 3.6,
      minSpeed: Math.min(...cornerPoints.map(p => p.speed * 3.6)),
      brakePoint: ((pointsWithDistance[brakePointIdx] as any).distance / totalDistance) * 100,
      throttlePoint: ((pointsWithDistance[throttlePointIdx] as any).distance / totalDistance) * 100,
      rating: 'average',
      timeLoss: 0,
      suggestions: [],
      telemetryPoints: cornerPoints,
      duration,
      speedProfile,
    };

    corners.push(corner);
  });

  return corners;
}

/**
 * Rate corner execution quality
 */
export function rateCornerExecution(
  corner: DetectedCorner,
  idealCorner?: DetectedCorner
): { rating: Corner['rating']; timeLoss: number; suggestions: string[] } {
  const suggestions: string[] = [];
  let score = 100;

  // Analyze brake point consistency
  const brakeApplication = corner.telemetryPoints.filter(p => p.brake > 30);
  if (brakeApplication.length > 0) {
    const avgBrake = brakeApplication.reduce((sum, p) => sum + p.brake, 0) / brakeApplication.length;
    if (avgBrake < 150) {
      score -= 10;
      suggestions.push('Brake harder and later for better corner entry');
    }
  }

  // Analyze apex speed
  if (idealCorner && corner.apexSpeed < idealCorner.apexSpeed * 0.95) {
    score -= 15;
    suggestions.push(`Apex speed is ${(idealCorner.apexSpeed - corner.apexSpeed).toFixed(1)} km/h slower than ideal`);
  }

  // Analyze throttle application
  const throttlePoint = corner.telemetryPoints.findIndex(p => p.throttle > 200);
  if (throttlePoint > corner.telemetryPoints.length * 0.7) {
    score -= 10;
    suggestions.push('Apply throttle earlier on corner exit');
  }

  // Check for early throttle lift
  const earlyThrottle = corner.telemetryPoints.slice(0, Math.floor(corner.telemetryPoints.length / 3));
  const hasEarlyThrottleLift = earlyThrottle.some((p, i) =>
    i > 0 && earlyThrottle[i - 1].throttle > 200 && p.throttle < 100
  );
  if (hasEarlyThrottleLift) {
    score -= 5;
    suggestions.push('Avoid lifting throttle before braking zone');
  }

  // Analyze exit speed
  if (idealCorner && corner.exitSpeed < idealCorner.exitSpeed * 0.95) {
    score -= 15;
    suggestions.push(`Exit speed is ${(idealCorner.exitSpeed - corner.exitSpeed).toFixed(1)} km/h slower than ideal`);
  }

  // Check steering smoothness
  const steeringValues = corner.telemetryPoints
    .filter(p => p.steering !== undefined)
    .map(p => p.steering || 0);
  if (steeringValues.length > 2) {
    let steeringChanges = 0;
    for (let i = 1; i < steeringValues.length; i++) {
      if (Math.abs(steeringValues[i] - steeringValues[i - 1]) > 0.1) {
        steeringChanges++;
      }
    }
    if (steeringChanges > steeringValues.length * 0.5) {
      score -= 10;
      suggestions.push('Smooth steering inputs - avoid sawing at the wheel');
    }
  }

  // Determine rating
  let rating: Corner['rating'];
  if (score >= 90) rating = 'excellent';
  else if (score >= 75) rating = 'good';
  else if (score >= 60) rating = 'average';
  else if (score >= 45) rating = 'poor';
  else rating = 'bad';

  // Calculate time loss
  const idealTime = idealCorner ? idealCorner.duration : corner.duration * 0.95;
  const timeLoss = Math.max(0, (corner.duration - idealTime) / 1000);

  if (suggestions.length === 0) {
    suggestions.push('Good corner execution - maintain consistency');
  }

  return { rating, timeLoss, suggestions };
}

/**
 * Detect braking zones
 */
export function detectBrakeZones(points: TelemetryPoint[]): BrakeZone[] {
  const brakeZones: BrakeZone[] = [];
  const pointsWithDistance = calculateCumulativeDistance(points);
  const totalDistance = pointsWithDistance.length > 0
    ? (pointsWithDistance[pointsWithDistance.length - 1] as any).distance
    : 0;

  let inBrakeZone = false;
  let zoneStart = -1;
  let zoneId = 0;

  for (let i = 0; i < points.length; i++) {
    const isBraking = points[i].brake > 30;

    if (isBraking && !inBrakeZone) {
      inBrakeZone = true;
      zoneStart = i;
    } else if (!isBraking && inBrakeZone) {
      inBrakeZone = false;

      const zonePoints = points.slice(zoneStart, i);
      const brakeValues = zonePoints.map(p => p.brake);

      // Detect trail braking
      const trailBrakingDetected = detectTrailBraking(zonePoints);
      const trailBrakingDuration = trailBrakingDetected
        ? (points[i].timestamp - points[zoneStart].timestamp) * 0.3
        : 0;

      brakeZones.push({
        id: ++zoneId,
        startDistance: ((pointsWithDistance[zoneStart] as any).distance / totalDistance) * 100,
        endDistance: ((pointsWithDistance[i] as any).distance / totalDistance) * 100,
        startSpeed: points[zoneStart].speed * 3.6,
        endSpeed: points[i].speed * 3.6,
        maxBrakePressure: Math.max(...brakeValues) / 255,
        avgBrakePressure: brakeValues.reduce((a, b) => a + b, 0) / brakeValues.length / 255,
        brakePointConsistency: 1, // Will be calculated when comparing multiple laps
        trailBrakingDetected,
        trailBrakingDuration,
      });
    }
  }

  return brakeZones;
}

/**
 * Detect if trail braking is being used
 */
function detectTrailBraking(brakePoints: TelemetryPoint[]): boolean {
  if (brakePoints.length < 5) return false;

  const brakeValues = brakePoints.map(p => p.brake);
  const maxBrake = Math.max(...brakeValues);
  const maxBrakeIdx = brakeValues.indexOf(maxBrake);

  // Check if brake pressure gradually decreases after peak
  if (maxBrakeIdx < brakePoints.length * 0.3) return false;

  let decreasing = true;
  for (let i = maxBrakeIdx + 1; i < brakeValues.length - 1; i++) {
    if (brakeValues[i + 1] > brakeValues[i] * 1.1) {
      decreasing = false;
      break;
    }
  }

  return decreasing && brakeValues[brakeValues.length - 1] < maxBrake * 0.5;
}

/**
 * Calculate brake point consistency across laps
 */
export function calculateBrakeConsistency(
  brakeZones: { lap: number; zones: BrakeZone[] }[]
): { zoneId: number; consistency: number; variance: number }[] {
  if (brakeZones.length < 2) return [];

  const numZones = Math.min(...brakeZones.map(b => b.zones.length));
  const consistencyResults: { zoneId: number; consistency: number; variance: number }[] = [];

  for (let i = 0; i < numZones; i++) {
    const startDistances = brakeZones.map(b => b.zones[i]?.startDistance || 0);
    const avg = startDistances.reduce((a, b) => a + b, 0) / startDistances.length;
    const variance = startDistances.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) / startDistances.length;
    const stdDev = Math.sqrt(variance);

    // Consistency score: 100% if stdDev < 0.5%, decreasing to 0% at stdDev > 5%
    const consistency = Math.max(0, Math.min(100, 100 - (stdDev * 20)));

    consistencyResults.push({
      zoneId: i + 1,
      consistency,
      variance: stdDev,
    });
  }

  return consistencyResults;
}

/**
 * Get corner rating color
 */
export function getCornerRatingColor(rating: Corner['rating']): string {
  switch (rating) {
    case 'excellent': return '#4CAF50';
    case 'good': return '#8BC34A';
    case 'average': return '#FFEB3B';
    case 'poor': return '#FF9800';
    case 'bad': return '#F44336';
    default: return '#9E9E9E';
  }
}

/**
 * Compare corner execution between laps
 */
export function compareCornerExecution(
  corner1: DetectedCorner,
  corner2: DetectedCorner
): { timeDelta: number; speedDelta: { entry: number; apex: number; exit: number }; better: 1 | 2 | 'equal' } {
  const timeDelta = (corner1.duration - corner2.duration) / 1000;

  const speedDelta = {
    entry: corner1.entrySpeed - corner2.entrySpeed,
    apex: corner1.apexSpeed - corner2.apexSpeed,
    exit: corner1.exitSpeed - corner2.exitSpeed,
  };

  // Determine which is better (faster through corner with better exit)
  let better: 1 | 2 | 'equal' = 'equal';
  if (timeDelta < -0.1 || speedDelta.exit > 2) {
    better = 1;
  } else if (timeDelta > 0.1 || speedDelta.exit < -2) {
    better = 2;
  }

  return { timeDelta, speedDelta, better };
}

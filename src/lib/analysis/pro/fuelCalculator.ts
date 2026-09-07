/**
 * Harvested from GT7-Telemetry-Pro (MIT lineage: revived as features, not as base).
 * Pure analysis engine — no framework/CN/backend deps. Kept verbatim except this header.
 * See docs/00-KNOWLEDGE-BASE.md §4 (reuse map) for provenance.
 */

import { TelemetryPoint, FuelStrategy } from './types';

/**
 * Fuel Calculator
 * Analyzes fuel consumption and generates pit strategy recommendations
 */

export interface FuelDataPoint {
  lapNumber: number;
  timestamp: number;
  fuelLevel: number; // 0-100%
  speed: number; // km/h
  distance: number; // km from session start
}

export interface FuelConsumptionStats {
  avgConsumptionPerLap: number; // % per lap
  avgConsumptionPer100km: number; // % per 100km
  minConsumption: number;
  maxConsumption: number;
  varianceCoefficient: number;
}

export interface FuelPitStop {
  lap: number;
  fuelLevelBefore: number;
  fuelToAdd: number;
  estimatedPitTime: number;
  racePositionImpact: string;
}

export interface FuelStrategyResult {
  currentFuel: number;
  consumptionStats: FuelConsumptionStats;
  estimatedLapsRemaining: number;
  estimatedDistanceRemaining: number;
  fuelMapRecommendation: 'lean' | 'normal' | 'rich';
  fuelMapEffect: string;
  pitStops: FuelPitStop[];
  canFinishWithoutStop: boolean;
  recommendations: string[];
}

/**
 * Extract fuel data from telemetry
 */
export function extractFuelData(points: TelemetryPoint[]): FuelDataPoint[] {
  if (points.length === 0) return [];

  const fuelData: FuelDataPoint[] = [];
  let cumulativeDistance = 0;
  let lastPoint = points[0];

  points.forEach((point, index) => {
    if (index > 0) {
      const timeDelta = (point.timestamp - lastPoint.timestamp) / 1000;
      const avgSpeed = (point.speed + lastPoint.speed) / 2;
      cumulativeDistance += (avgSpeed * timeDelta) / 1000; // km
    }

    fuelData.push({
      lapNumber: point.lapNumber,
      timestamp: point.timestamp,
      fuelLevel: point.fuel,
      speed: point.speed * 3.6, // m/s to km/h
      distance: cumulativeDistance,
    });

    lastPoint = point;
  });

  return fuelData;
}

/**
 * Calculate fuel consumption per lap
 */
export function calculateConsumptionPerLap(
  fuelData: FuelDataPoint[]
): { lap: number; consumption: number; distance: number; avgSpeed: number }[] {
  if (fuelData.length < 2) return [];

  const laps = [...new Set(fuelData.map(d => d.lapNumber))].sort((a, b) => a - b);
  const consumptionByLap: { lap: number; consumption: number; distance: number; avgSpeed: number }[] = [];

  laps.forEach(lapNum => {
    const lapPoints = fuelData.filter(d => d.lapNumber === lapNum);
    if (lapPoints.length < 2) return;

    const start = lapPoints[0];
    const end = lapPoints[lapPoints.length - 1];
    const consumption = start.fuelLevel - end.fuelLevel;
    const distance = end.distance - start.distance;
    const time = (end.timestamp - start.timestamp) / 1000 / 3600; // hours
    const avgSpeed = time > 0 ? distance / time : 0;

    consumptionByLap.push({
      lap: lapNum,
      consumption,
      distance,
      avgSpeed,
    });
  });

  return consumptionByLap;
}

/**
 * Calculate consumption statistics
 */
export function calculateConsumptionStats(
  consumptionByLap: { lap: number; consumption: number; distance: number }[]
): FuelConsumptionStats {
  if (consumptionByLap.length === 0) {
    return {
      avgConsumptionPerLap: 0,
      avgConsumptionPer100km: 0,
      minConsumption: 0,
      maxConsumption: 0,
      varianceCoefficient: 0,
    };
  }

  const consumptions = consumptionByLap.map(l => l.consumption);
  const distances = consumptionByLap.map(l => l.distance);

  const totalConsumption = consumptions.reduce((a, b) => a + b, 0);
  const totalDistance = distances.reduce((a, b) => a + b, 0);

  const avgConsumptionPerLap = totalConsumption / consumptionByLap.length;
  const avgConsumptionPer100km = totalDistance > 0 ? (totalConsumption / totalDistance) * 100 : 0;
  const minConsumption = Math.min(...consumptions);
  const maxConsumption = Math.max(...consumptions);

  // Calculate variance coefficient
  const mean = avgConsumptionPerLap;
  const variance = consumptions.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / consumptions.length;
  const stdDev = Math.sqrt(variance);
  const varianceCoefficient = mean > 0 ? stdDev / mean : 0;

  return {
    avgConsumptionPerLap,
    avgConsumptionPer100km,
    minConsumption,
    maxConsumption,
    varianceCoefficient,
  };
}

/**
 * Estimate laps remaining based on current fuel
 */
export function estimateLapsRemaining(
  currentFuel: number,
  avgConsumptionPerLap: number,
  safetyMargin: number = 0.05 // 5% safety margin
): number {
  if (avgConsumptionPerLap <= 0) return Infinity;
  const usableFuel = currentFuel - (currentFuel * safetyMargin);
  return Math.floor(usableFuel / avgConsumptionPerLap);
}

/**
 * Determine fuel map recommendation
 */
export function determineFuelMap(
  currentFuel: number,
  avgConsumptionPerLap: number,
  lapsRemaining: number,
  targetLaps: number
): { map: 'lean' | 'normal' | 'rich'; effect: string } {
  const estimatedLaps = estimateLapsRemaining(currentFuel, avgConsumptionPerLap);
  const deficit = targetLaps - estimatedLaps;

  if (deficit > 2) {
    // Need to save significant fuel
    return {
      map: 'lean',
      effect: `Lean mode saves ~${(avgConsumptionPerLap * 0.2).toFixed(2)}% fuel per lap (-10% power)`,
    };
  } else if (deficit > 0) {
    // Need to save a bit of fuel
    return {
      map: 'lean',
      effect: `Lean mode recommended to ensure finish. Saves ~${(avgConsumptionPerLap * 0.2).toFixed(2)}% per lap`,
    };
  } else if (deficit < -3) {
    // Plenty of fuel - can push
    return {
      map: 'rich',
      effect: `Rich mode available for +5% power. Uses ~${(avgConsumptionPerLap * 0.15).toFixed(2)}% extra per lap`,
    };
  } else {
    return {
      map: 'normal',
      effect: 'Normal fuel map is optimal for current situation',
    };
  }
}

/**
 * Calculate optimal pit stop strategy
 */
export function calculatePitStrategy(
  currentFuel: number,
  currentLap: number,
  totalLaps: number,
  avgConsumptionPerLap: number,
  pitStopTime: number = 25 // seconds
): FuelPitStop[] {
  const pitStops: FuelPitStop[] = [];

  if (avgConsumptionPerLap <= 0) return pitStops;

  let remainingLaps = totalLaps - currentLap;
  let fuel = currentFuel;
  let lap = currentLap;

  while (remainingLaps > 0) {
    const lapsOnCurrentFuel = Math.floor(fuel / avgConsumptionPerLap);

    if (lapsOnCurrentFuel >= remainingLaps) {
      // Can finish without more stops
      break;
    }

    // Need a pit stop
    const stopLap = lap + Math.max(1, lapsOnCurrentFuel - 1);
    const fuelAtStop = fuel - ((stopLap - lap) * avgConsumptionPerLap);
    const lapsToGo = totalLaps - stopLap;
    const fuelNeeded = (lapsToGo * avgConsumptionPerLap) + 5; // 5% buffer
    const fuelToAdd = Math.min(100 - fuelAtStop, Math.max(0, fuelNeeded));

    pitStops.push({
      lap: stopLap,
      fuelLevelBefore: Math.max(0, fuelAtStop),
      fuelToAdd,
      estimatedPitTime: pitStopTime + (fuelToAdd / 100) * 5, // ~5 extra seconds for full tank
      racePositionImpact: `~${Math.ceil(pitStopTime / 2)} positions lost`,
    });

    // Update for next iteration
    fuel = fuelAtStop + fuelToAdd;
    remainingLaps = totalLaps - stopLap;
    lap = stopLap;
  }

  return pitStops;
}

/**
 * Generate fuel recommendations
 */
export function generateFuelRecommendations(
  currentFuel: number,
  estimatedLaps: number,
  targetLaps: number,
  consumptionVariance: number,
  fuelMap: 'lean' | 'normal' | 'rich'
): string[] {
  const recommendations: string[] = [];

  // Fuel level warnings
  if (currentFuel < 10) {
    recommendations.push('CRITICAL: Fuel level critically low - pit immediately');
  } else if (currentFuel < 20) {
    recommendations.push('WARNING: Low fuel - plan pit stop within 2-3 laps');
  }

  // Target lap comparison
  if (estimatedLaps < targetLaps) {
    const deficit = targetLaps - estimatedLaps;
    recommendations.push(`Need to save fuel for ${deficit} additional lap(s) to finish`);

    if (fuelMap !== 'lean') {
      recommendations.push('Consider switching to lean fuel map');
    }
    recommendations.push('Lift and coast before braking zones to conserve fuel');
  } else if (estimatedLaps > targetLaps + 5) {
    recommendations.push('Sufficient fuel to finish - can push harder if needed');
    if (fuelMap !== 'rich') {
      recommendations.push('Consider rich fuel map for more power');
    }
  }

  // Consistency advice
  if (consumptionVariance > 0.2) {
    recommendations.push('High fuel consumption variance detected - aim for more consistent driving');
  }

  if (recommendations.length === 0) {
    recommendations.push('Fuel situation is optimal - maintain current pace');
  }

  return recommendations;
}

/**
 * Perform full fuel analysis
 */
export function analyzeFuelStrategy(
  points: TelemetryPoint[],
  currentLap: number,
  totalLaps: number
): FuelStrategyResult {
  const fuelData = extractFuelData(points);

  if (fuelData.length === 0) {
    return {
      currentFuel: 100,
      consumptionStats: {
        avgConsumptionPerLap: 0,
        avgConsumptionPer100km: 0,
        minConsumption: 0,
        maxConsumption: 0,
        varianceCoefficient: 0,
      },
      estimatedLapsRemaining: Infinity,
      estimatedDistanceRemaining: Infinity,
      fuelMapRecommendation: 'normal',
      fuelMapEffect: 'No fuel data available',
      pitStops: [],
      canFinishWithoutStop: true,
      recommendations: ['No fuel data available for analysis'],
    };
  }

  const currentFuel = fuelData[fuelData.length - 1].fuelLevel;
  const consumptionByLap = calculateConsumptionPerLap(fuelData);
  const consumptionStats = calculateConsumptionStats(consumptionByLap);

  const estimatedLapsRemaining = estimateLapsRemaining(
    currentFuel,
    consumptionStats.avgConsumptionPerLap
  );

  const avgLapDistance = consumptionByLap.length > 0
    ? consumptionByLap.reduce((sum, l) => sum + l.distance, 0) / consumptionByLap.length
    : 0;
  const estimatedDistanceRemaining = estimatedLapsRemaining * avgLapDistance;

  const targetLaps = totalLaps - currentLap;
  const { map: fuelMapRecommendation, effect: fuelMapEffect } = determineFuelMap(
    currentFuel,
    consumptionStats.avgConsumptionPerLap,
    estimatedLapsRemaining,
    targetLaps
  );

  const pitStops = calculatePitStrategy(
    currentFuel,
    currentLap,
    totalLaps,
    consumptionStats.avgConsumptionPerLap
  );

  const canFinishWithoutStop = estimatedLapsRemaining >= targetLaps;

  const recommendations = generateFuelRecommendations(
    currentFuel,
    estimatedLapsRemaining,
    targetLaps,
    consumptionStats.varianceCoefficient,
    fuelMapRecommendation
  );

  return {
    currentFuel,
    consumptionStats,
    estimatedLapsRemaining,
    estimatedDistanceRemaining,
    fuelMapRecommendation,
    fuelMapEffect,
    pitStops,
    canFinishWithoutStop,
    recommendations,
  };
}

/**
 * Format fuel percentage
 */
export function formatFuelLevel(fuel: number): string {
  return `${fuel.toFixed(1)}%`;
}

/**
 * Get fuel level color
 */
export function getFuelLevelColor(fuel: number): string {
  if (fuel < 10) return '#F44336'; // Red
  if (fuel < 25) return '#FF9800'; // Orange
  if (fuel < 50) return '#FFEB3B'; // Yellow
  return '#4CAF50'; // Green
}

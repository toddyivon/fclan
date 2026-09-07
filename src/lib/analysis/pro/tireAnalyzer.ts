/**
 * Harvested from GT7-Telemetry-Pro (MIT lineage: revived as features, not as base).
 * Pure analysis engine — no framework/CN/backend deps. Kept verbatim except this header.
 * See docs/00-KNOWLEDGE-BASE.md §4 (reuse map) for provenance.
 */

import { TelemetryPoint, TireAnalysis, LapData } from './types';

/**
 * Tire Performance Analyzer
 * Analyzes tire wear, temperature, pressure, and grip levels
 */

export interface TireDataPoint {
  lapNumber: number;
  timestamp: number;
  wear: {
    frontLeft: number;
    frontRight: number;
    rearLeft: number;
    rearRight: number;
  };
  temperature: {
    frontLeft: number;
    frontRight: number;
    rearLeft: number;
    rearRight: number;
  };
  pressure: {
    frontLeft: number;
    frontRight: number;
    rearLeft: number;
    rearRight: number;
  };
}

export interface TirePerformanceResult {
  currentState: {
    frontLeft: TireAnalysis;
    frontRight: TireAnalysis;
    rearLeft: TireAnalysis;
    rearRight: TireAnalysis;
  };
  wearHistory: TireDataPoint[];
  temperatureHeatMap: {
    position: string;
    data: { lap: number; temp: number }[];
  }[];
  pressureChanges: {
    position: string;
    data: { lap: number; pressure: number }[];
  }[];
  optimalPitWindow: {
    earliestLap: number;
    latestLap: number;
    recommendedLap: number;
    reason: string;
  };
  recommendations: string[];
}

export interface TireCompoundSettings {
  name: string;
  optimalTempRange: [number, number];
  optimalPressureRange: [number, number];
  wearMultiplier: number;
  gripCurve: (wear: number) => number;
}

// Default tire compound settings
export const DEFAULT_TIRE_COMPOUNDS: Record<string, TireCompoundSettings> = {
  soft: {
    name: 'Soft',
    optimalTempRange: [85, 105],
    optimalPressureRange: [1.8, 2.2],
    wearMultiplier: 1.5,
    gripCurve: (wear: number) => Math.max(0.7, 1 - (1 - wear) * 0.3),
  },
  medium: {
    name: 'Medium',
    optimalTempRange: [80, 100],
    optimalPressureRange: [1.9, 2.3],
    wearMultiplier: 1.0,
    gripCurve: (wear: number) => Math.max(0.75, 1 - (1 - wear) * 0.25),
  },
  hard: {
    name: 'Hard',
    optimalTempRange: [90, 110],
    optimalPressureRange: [2.0, 2.4],
    wearMultiplier: 0.7,
    gripCurve: (wear: number) => Math.max(0.8, 1 - (1 - wear) * 0.2),
  },
  rain: {
    name: 'Rain',
    optimalTempRange: [50, 80],
    optimalPressureRange: [2.0, 2.4],
    wearMultiplier: 1.2,
    gripCurve: (wear: number) => Math.max(0.6, 1 - (1 - wear) * 0.4),
  },
};

/**
 * Extract tire data from telemetry points
 */
export function extractTireData(points: TelemetryPoint[]): TireDataPoint[] {
  const tireData: TireDataPoint[] = [];
  const seenLaps = new Set<number>();

  points.forEach(point => {
    // Only get one sample per lap for cleaner data
    if (!seenLaps.has(point.lapNumber)) {
      seenLaps.add(point.lapNumber);

      tireData.push({
        lapNumber: point.lapNumber,
        timestamp: point.timestamp,
        wear: point.tireWear || {
          frontLeft: 1,
          frontRight: 1,
          rearLeft: 1,
          rearRight: 1,
        },
        temperature: point.tireTemp || {
          frontLeft: 85,
          frontRight: 85,
          rearLeft: 85,
          rearRight: 85,
        },
        pressure: point.tirePressure || {
          frontLeft: 2.0,
          frontRight: 2.0,
          rearLeft: 2.0,
          rearRight: 2.0,
        },
      });
    }
  });

  return tireData.sort((a, b) => a.lapNumber - b.lapNumber);
}

/**
 * Calculate tire wear rate
 */
export function calculateWearRate(
  tireData: TireDataPoint[],
  position: 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight'
): number {
  if (tireData.length < 2) return 0;

  const startWear = tireData[0].wear[position];
  const endWear = tireData[tireData.length - 1].wear[position];
  const lapsCompleted = tireData[tireData.length - 1].lapNumber - tireData[0].lapNumber;

  return lapsCompleted > 0 ? (startWear - endWear) / lapsCompleted : 0;
}

/**
 * Estimate laps remaining based on wear rate
 */
export function estimateLapsRemaining(
  currentWear: number,
  wearRate: number,
  minUsableWear: number = 0.2
): number {
  if (wearRate <= 0) return Infinity;
  return Math.floor((currentWear - minUsableWear) / wearRate);
}

/**
 * Calculate grip level based on tire state
 */
export function calculateGripLevel(
  wear: number,
  temperature: number,
  optimalTempRange: [number, number],
  compound: TireCompoundSettings
): number {
  // Base grip from wear
  const wearGrip = compound.gripCurve(wear);

  // Temperature factor
  const [minTemp, maxTemp] = optimalTempRange;
  let tempFactor = 1;

  if (temperature < minTemp) {
    tempFactor = 1 - (minTemp - temperature) / 30; // Lose grip as temp drops
  } else if (temperature > maxTemp) {
    tempFactor = 1 - (temperature - maxTemp) / 20; // Lose grip as temp rises
  }

  tempFactor = Math.max(0.5, Math.min(1, tempFactor));

  return wearGrip * tempFactor;
}

/**
 * Analyze tire for a specific position
 */
export function analyzeTire(
  tireData: TireDataPoint[],
  position: 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight',
  compound: TireCompoundSettings = DEFAULT_TIRE_COMPOUNDS.medium
): TireAnalysis {
  if (tireData.length === 0) {
    return {
      position,
      currentWear: 1,
      wearRate: 0,
      estimatedLapsRemaining: Infinity,
      avgTemperature: 85,
      currentTemperature: 85,
      optimalTempRange: compound.optimalTempRange,
      isOverheating: false,
      currentPressure: 2.0,
      optimalPressureRange: compound.optimalPressureRange,
      gripLevel: 1,
    };
  }

  const latestData = tireData[tireData.length - 1];
  const wearRate = calculateWearRate(tireData, position);
  const avgTemp = tireData.reduce((sum, d) => sum + d.temperature[position], 0) / tireData.length;
  const currentWear = latestData.wear[position];
  const currentTemp = latestData.temperature[position];
  const currentPressure = latestData.pressure[position];

  return {
    position,
    currentWear,
    wearRate,
    estimatedLapsRemaining: estimateLapsRemaining(currentWear, wearRate),
    avgTemperature: avgTemp,
    currentTemperature: currentTemp,
    optimalTempRange: compound.optimalTempRange,
    isOverheating: currentTemp > compound.optimalTempRange[1],
    currentPressure,
    optimalPressureRange: compound.optimalPressureRange,
    gripLevel: calculateGripLevel(currentWear, currentTemp, compound.optimalTempRange, compound),
  };
}

/**
 * Calculate optimal pit window based on tire wear
 */
export function calculateOptimalPitWindow(
  tireData: TireDataPoint[],
  totalLaps: number,
  currentLap: number,
  compound: TireCompoundSettings = DEFAULT_TIRE_COMPOUNDS.medium
): { earliestLap: number; latestLap: number; recommendedLap: number; reason: string } {
  const positions: ('frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight')[] = [
    'frontLeft', 'frontRight', 'rearLeft', 'rearRight'
  ];

  // Find the tire with highest wear rate
  let minLapsRemaining = Infinity;
  let criticalTire = 'frontLeft';

  positions.forEach(pos => {
    const analysis = analyzeTire(tireData, pos, compound);
    if (analysis.estimatedLapsRemaining < minLapsRemaining) {
      minLapsRemaining = analysis.estimatedLapsRemaining;
      criticalTire = pos;
    }
  });

  // Calculate pit window
  const latestLap = Math.min(currentLap + minLapsRemaining - 1, totalLaps);
  const earliestLap = Math.max(currentLap, Math.floor(latestLap * 0.7));
  const recommendedLap = Math.floor((earliestLap + latestLap) / 2);

  let reason = '';
  if (minLapsRemaining <= 3) {
    reason = `Critical wear on ${criticalTire.replace(/([A-Z])/g, ' $1').trim()} - pit immediately`;
  } else if (minLapsRemaining <= 10) {
    reason = `${criticalTire.replace(/([A-Z])/g, ' $1').trim()} approaching wear limit`;
  } else {
    reason = 'Tires in good condition - pit window flexible';
  }

  return { earliestLap, latestLap, recommendedLap, reason };
}

/**
 * Generate temperature heat map data
 */
export function generateTemperatureHeatMap(
  tireData: TireDataPoint[]
): { position: string; data: { lap: number; temp: number }[] }[] {
  const positions = ['Front Left', 'Front Right', 'Rear Left', 'Rear Right'];
  const keys: ('frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight')[] = [
    'frontLeft', 'frontRight', 'rearLeft', 'rearRight'
  ];

  return positions.map((pos, idx) => ({
    position: pos,
    data: tireData.map(d => ({
      lap: d.lapNumber,
      temp: d.temperature[keys[idx]],
    })),
  }));
}

/**
 * Generate pressure change data
 */
export function generatePressureChanges(
  tireData: TireDataPoint[]
): { position: string; data: { lap: number; pressure: number }[] }[] {
  const positions = ['Front Left', 'Front Right', 'Rear Left', 'Rear Right'];
  const keys: ('frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight')[] = [
    'frontLeft', 'frontRight', 'rearLeft', 'rearRight'
  ];

  return positions.map((pos, idx) => ({
    position: pos,
    data: tireData.map(d => ({
      lap: d.lapNumber,
      pressure: d.pressure[keys[idx]],
    })),
  }));
}

/**
 * Generate tire recommendations
 */
export function generateTireRecommendations(
  frontLeft: TireAnalysis,
  frontRight: TireAnalysis,
  rearLeft: TireAnalysis,
  rearRight: TireAnalysis
): string[] {
  const recommendations: string[] = [];
  const allTires = [
    { name: 'Front Left', data: frontLeft },
    { name: 'Front Right', data: frontRight },
    { name: 'Rear Left', data: rearLeft },
    { name: 'Rear Right', data: rearRight },
  ];

  // Check for overheating
  allTires.forEach(tire => {
    if (tire.data.isOverheating) {
      recommendations.push(`${tire.name} is overheating - reduce aggression or check alignment`);
    }
  });

  // Check for uneven wear (front vs rear)
  const avgFrontWear = (frontLeft.currentWear + frontRight.currentWear) / 2;
  const avgRearWear = (rearLeft.currentWear + rearRight.currentWear) / 2;

  if (avgFrontWear - avgRearWear > 0.1) {
    recommendations.push('Front tires wearing faster - consider adjusting brake bias or reducing steering aggression');
  } else if (avgRearWear - avgFrontWear > 0.1) {
    recommendations.push('Rear tires wearing faster - consider reducing throttle aggression or adjusting diff settings');
  }

  // Check for uneven wear (left vs right)
  const avgLeftWear = (frontLeft.currentWear + rearLeft.currentWear) / 2;
  const avgRightWear = (frontRight.currentWear + rearRight.currentWear) / 2;

  if (Math.abs(avgLeftWear - avgRightWear) > 0.1) {
    recommendations.push('Uneven left/right wear detected - check for circuit-specific characteristics or alignment issues');
  }

  // Grip level warnings
  allTires.forEach(tire => {
    if (tire.data.gripLevel < 0.8) {
      recommendations.push(`${tire.name} grip level is ${(tire.data.gripLevel * 100).toFixed(0)}% - consider pitting soon`);
    }
  });

  // Pressure recommendations
  allTires.forEach(tire => {
    const [minPressure, maxPressure] = tire.data.optimalPressureRange;
    if (tire.data.currentPressure < minPressure) {
      recommendations.push(`${tire.name} pressure is low - increase by ${(minPressure - tire.data.currentPressure).toFixed(2)} bar`);
    } else if (tire.data.currentPressure > maxPressure) {
      recommendations.push(`${tire.name} pressure is high - decrease by ${(tire.data.currentPressure - maxPressure).toFixed(2)} bar`);
    }
  });

  if (recommendations.length === 0) {
    recommendations.push('Tires are performing within optimal parameters');
  }

  return recommendations;
}

/**
 * Perform full tire analysis
 */
export function analyzeTirePerformance(
  points: TelemetryPoint[],
  totalLaps: number,
  currentLap: number,
  compound: TireCompoundSettings = DEFAULT_TIRE_COMPOUNDS.medium
): TirePerformanceResult {
  const tireData = extractTireData(points);

  const frontLeft = analyzeTire(tireData, 'frontLeft', compound);
  const frontRight = analyzeTire(tireData, 'frontRight', compound);
  const rearLeft = analyzeTire(tireData, 'rearLeft', compound);
  const rearRight = analyzeTire(tireData, 'rearRight', compound);

  const temperatureHeatMap = generateTemperatureHeatMap(tireData);
  const pressureChanges = generatePressureChanges(tireData);
  const optimalPitWindow = calculateOptimalPitWindow(tireData, totalLaps, currentLap, compound);
  const recommendations = generateTireRecommendations(frontLeft, frontRight, rearLeft, rearRight);

  return {
    currentState: { frontLeft, frontRight, rearLeft, rearRight },
    wearHistory: tireData,
    temperatureHeatMap,
    pressureChanges,
    optimalPitWindow,
    recommendations,
  };
}

/**
 * Get color for tire temperature visualization
 */
export function getTireTemperatureColor(temp: number, optimalRange: [number, number]): string {
  const [minOptimal, maxOptimal] = optimalRange;
  const cold = minOptimal - 20;
  const hot = maxOptimal + 20;

  if (temp < cold) {
    return '#2196F3'; // Cold - blue
  } else if (temp < minOptimal) {
    // Transitioning from cold to optimal
    const t = (temp - cold) / (minOptimal - cold);
    return interpolateColor('#2196F3', '#4CAF50', t);
  } else if (temp <= maxOptimal) {
    return '#4CAF50'; // Optimal - green
  } else if (temp < hot) {
    // Transitioning from optimal to hot
    const t = (temp - maxOptimal) / (hot - maxOptimal);
    return interpolateColor('#4CAF50', '#F44336', t);
  } else {
    return '#F44336'; // Hot - red
  }
}

/**
 * Interpolate between two hex colors
 */
function interpolateColor(color1: string, color2: string, t: number): string {
  const r1 = parseInt(color1.slice(1, 3), 16);
  const g1 = parseInt(color1.slice(3, 5), 16);
  const b1 = parseInt(color1.slice(5, 7), 16);

  const r2 = parseInt(color2.slice(1, 3), 16);
  const g2 = parseInt(color2.slice(3, 5), 16);
  const b2 = parseInt(color2.slice(5, 7), 16);

  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

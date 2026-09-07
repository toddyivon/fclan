/**
 * Harvested from GT7-Telemetry-Pro (MIT lineage: revived as features, not as base).
 * Pure analysis engine — no framework/CN/backend deps. Kept verbatim except this header.
 * See docs/00-KNOWLEDGE-BASE.md §4 (reuse map) for provenance.
 */

// Analysis Utilities - explicit re-exports.
//
// NOTE (fclan harvest fix): fuelCalculator and tireAnalyzer both export
// `estimateLapsRemaining` (fuel-domain vs tire-domain). The wildcard barrel
// collided, so they are aliased here. Import from the module file directly
// if you need the unaliased name.

export * from './types';
export * from './racingLineCalculator';
export * from './lapComparisonEngine';
export {
  extractTireData,
  calculateWearRate,
  estimateLapsRemaining as estimateTireLapsRemaining,
  calculateGripLevel,
  analyzeTire,
  calculateOptimalPitWindow,
  generateTemperatureHeatMap,
  generatePressureChanges,
  generateTireRecommendations,
  analyzeTirePerformance,
  getTireTemperatureColor,
  DEFAULT_TIRE_COMPOUNDS,
} from './tireAnalyzer';
export type { TireDataPoint, TirePerformanceResult, TireCompoundSettings } from './tireAnalyzer';
export * from './fuelCalculator';
export * from './cornerDetector';

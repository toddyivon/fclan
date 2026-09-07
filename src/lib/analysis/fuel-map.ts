/**
 * Relative fuel-map simulator — port of gt7dashboard's
 * get_fuel_on_consumption_by_relative_fuel_levels
 * (gt7dashboard/gt7helper.py:644-716) to TypeScript.
 *
 * Physics (from the gtplanet measurement thread, cited in the original):
 * each mixture level leaner saves ~8% fuel and costs ~4% power; each level
 * richer costs the inverse. The simulator projects, for settings -5..+5
 * relative to the current map: fuel per lap, laps remaining, time remaining,
 * expected lap time and its delta.
 *
 * Pure functions — the FuelStrategy UI and the analysis API both consume
 * this; Pro's fuelCalculator (strategy/pit windows) is complementary, not
 * a replacement.
 */

export interface FuelMapSetting {
  /** -5 (leanest) .. +5 (richest), 0 = current map */
  mixtureSetting: number;
  /** fraction of available power vs current map (1.0 = same) */
  powerFraction: number;
  /** fraction of fuel consumption vs current map (1.0 = same) */
  consumptionFraction: number;
  fuelConsumedPerLap: number;
  lapsRemainingOnCurrentFuel: number;
  timeRemainingOnCurrentFuelMs: number;
  /** ms slower (+) / faster (-) than the reference lap */
  lapTimeDiffMs: number;
  lapTimeExpectedMs: number;
}

/** gtplanet-measured: -8% consumption / -4% power per level leaner. */
export const FUEL_CONSUMPTION_PER_LEVEL = 0.08;
export const POWER_PER_LEVEL = 0.04;

export interface FuelBaseline {
  /** fuel units consumed per lap at the current map */
  fuelConsumedPerLap: number;
  /** laps remaining on current fuel at the current map */
  lapsRemaining: number;
  /** ms remaining on current fuel at the current map */
  timeRemainingMs: number;
  /** ms — reference lap time at the current map */
  referenceLapTimeMs: number;
}

/**
 * Derives the baseline from a finished lap: consumed = start - end over
 * the lap's points, remaining = fuelLeft / consumed, time = remaining * lap.
 * Returns nulls-as-zero so a fuel-less stream degrades gracefully.
 */
export function baselineFromLap(args: {
  fuelAtStart: number | null;
  fuelAtEnd: number | null;
  lapTimeMs: number | null;
}): FuelBaseline {
  const consumed =
    args.fuelAtStart != null && args.fuelAtEnd != null
      ? Math.max(0, args.fuelAtStart - args.fuelAtEnd)
      : 0;
  const lapsRemaining =
    consumed > 0 && args.fuelAtEnd != null ? args.fuelAtEnd / consumed : 0;
  const timeRemainingMs =
    args.lapTimeMs != null && args.lapTimeMs > 0 ? lapsRemaining * args.lapTimeMs : 0;
  return {
    fuelConsumedPerLap: consumed,
    lapsRemaining,
    timeRemainingMs,
    referenceLapTimeMs: args.lapTimeMs ?? 0,
  };
}

export function simulateFuelMaps(baseline: FuelBaseline): FuelMapSetting[] {
  const out: FuelMapSetting[] = [];
  for (let i = -5; i <= 5; i++) {
    const powerFraction = (100 - i * POWER_PER_LEVEL * 100) / 100;
    const consumptionFraction = (100 - i * FUEL_CONSUMPTION_PER_LEVEL * 100) / 100;

    const fuelConsumedPerLap = baseline.fuelConsumedPerLap * consumptionFraction;
    const lapsRemainingOnCurrentFuel =
      baseline.lapsRemaining + baseline.lapsRemaining * (1 - consumptionFraction);
    const timeRemainingOnCurrentFuelMs =
      baseline.timeRemainingMs + baseline.timeRemainingMs * (1 - consumptionFraction);
    const lapTimeDiffMs = baseline.referenceLapTimeMs * (1 - powerFraction);
    const lapTimeExpectedMs = baseline.referenceLapTimeMs + lapTimeDiffMs;

    out.push({
      mixtureSetting: i,
      powerFraction,
      consumptionFraction,
      fuelConsumedPerLap,
      lapsRemainingOnCurrentFuel,
      timeRemainingOnCurrentFuelMs,
      lapTimeExpectedMs,
      lapTimeDiffMs,
    });
  }
  return out;
}

/**
 * Picks the richest map that still finishes the race: given laps remaining
 * in the race and current fuel, walk from the richest (-5) toward leanest
 * (+5) until lapsRemaining covers the race — the classic "how rich can I
 * run" answer. Falls back to the leanest map if nothing covers.
 *
 * Orientation (matches gt7dashboard's original table): negative relative
 * settings are RICHER (more power, more consumption), positive are LEANER.
 */
export function pickRichestViableMap(
  maps: FuelMapSetting[],
  lapsToGo: number
): FuelMapSetting {
  const sorted = [...maps].sort((a, b) => a.mixtureSetting - b.mixtureSetting);
  for (const m of sorted) {
    if (m.lapsRemainingOnCurrentFuel >= lapsToGo) return m;
  }
  return sorted[sorted.length - 1];
}

import { describe, it, expect } from "vitest";
import { baselineFromLap, simulateFuelMaps, pickRichestViableMap } from "./fuel-map";

describe("baselineFromLap", () => {
  it("derives consumed/remaining/time from a finished lap", () => {
    const b = baselineFromLap({ fuelAtStart: 100, fuelAtEnd: 90, lapTimeMs: 90_000 });
    expect(b.fuelConsumedPerLap).toBe(10);
    expect(b.lapsRemaining).toBe(9);
    expect(b.timeRemainingMs).toBe(810_000);
    expect(b.referenceLapTimeMs).toBe(90_000);
  });
  it("degrades gracefully without fuel data", () => {
    const b = baselineFromLap({ fuelAtStart: null, fuelAtEnd: null, lapTimeMs: 90_000 });
    expect(b.fuelConsumedPerLap).toBe(0);
    expect(b.lapsRemaining).toBe(0);
  });
});

describe("simulateFuelMaps", () => {
  const base = baselineFromLap({ fuelAtStart: 100, fuelAtEnd: 90, lapTimeMs: 90_000 });
  const maps = simulateFuelMaps(base);

  it("produces 11 maps (-5..+5)", () => {
    expect(maps).toHaveLength(11);
    expect(maps[0].mixtureSetting).toBe(-5);
    expect(maps[10].mixtureSetting).toBe(5);
  });

  it("richest map (-5) burns ~40% more and gains pace (8%/4% per level)", () => {
    const rich = maps[0];
    expect(rich.mixtureSetting).toBe(-5);
    expect(rich.consumptionFraction).toBeCloseTo(1.4, 5);
    expect(rich.powerFraction).toBeCloseTo(1.2, 5);
    expect(rich.fuelConsumedPerLap).toBeCloseTo(14, 5);
    expect(rich.lapsRemainingOnCurrentFuel).toBeCloseTo(9 - 9 * 0.4, 5);
    expect(rich.lapTimeDiffMs).toBeCloseTo(-90_000 * 0.2, 0);
  });

  it("leanest map (+5) saves ~40% fuel and costs ~20% pace", () => {
    const lean = maps[10];
    expect(lean.mixtureSetting).toBe(5);
    expect(lean.consumptionFraction).toBeCloseTo(0.6, 5);
    expect(lean.fuelConsumedPerLap).toBeCloseTo(6, 5);
    expect(lean.lapTimeDiffMs).toBeCloseTo(90_000 * 0.2, 0);
  });

  it("current map (0) is identity", () => {
    const cur = maps[5];
    expect(cur.consumptionFraction).toBe(1);
    expect(cur.powerFraction).toBe(1);
    expect(cur.lapTimeExpectedMs).toBe(90_000);
  });
});

describe("pickRichestViableMap", () => {
  it("picks the richest map that still finishes", () => {
    const base = baselineFromLap({ fuelAtStart: 100, fuelAtEnd: 90, lapTimeMs: 90_000 });
    const maps = simulateFuelMaps(base);
    // 10 laps to go, richest map (-5) only gives 5.4: must go leaner
    const pick = pickRichestViableMap(maps, 10);
    expect(pick.lapsRemainingOnCurrentFuel).toBeGreaterThanOrEqual(10);
    expect(pick.mixtureSetting).toBeGreaterThan(-5);
  });

  it("stays on the richest map when fuel is plenty", () => {
    const base = baselineFromLap({ fuelAtStart: 100, fuelAtEnd: 90, lapTimeMs: 90_000 });
    const maps = simulateFuelMaps(base);
    const pick = pickRichestViableMap(maps, 5);
    expect(pick.mixtureSetting).toBe(-5);
  });
});

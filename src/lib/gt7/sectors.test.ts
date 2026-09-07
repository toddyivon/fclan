import { describe, it, expect } from "vitest";
import {
  buildProgressSeries,
  splitIntoSectors,
  breakdownLaps,
  computeSectorDeltas,
} from "./sectors";

/** Synthesizes a constant-speed lap: 60 samples @ 10Hz, v = 60 m/s. */
function constantLap(speed = 60): Array<{ tMs: number; speedMs: number }> {
  const points = [];
  for (let i = 0; i < 60; i++) points.push({ tMs: i * 100, speedMs: speed });
  return points;
}

/** Synthesizes a slow-then-fast lap: 40 samples @ 30 m/s, 40 samples @ 90 m/s. */
function mixedLap(): Array<{ tMs: number; speedMs: number }> {
  const points = [];
  for (let i = 0; i < 40; i++) points.push({ tMs: i * 100, speedMs: 30 });
  for (let i = 40; i < 80; i++) points.push({ tMs: i * 100, speedMs: 90 });
  return points;
}

describe("buildProgressSeries", () => {
  it("returns empty for empty input", () => {
    expect(buildProgressSeries([])).toEqual([]);
  });

  it("normalizes a constant-speed lap to monotonic progress ending at 1.0", () => {
    const series = buildProgressSeries(constantLap());
    expect(series.length).toBe(60);
    expect(series[0].progress).toBe(0);
    expect(series[series.length - 1].progress).toBeCloseTo(1, 5);
    // Monotonic non-decreasing.
    for (let i = 1; i < series.length; i++) {
      expect(series[i].progress).toBeGreaterThanOrEqual(series[i - 1].progress);
    }
  });

  it("integrates trapezoid correctly: half lap at 30 then half at 90", () => {
    const series = buildProgressSeries(mixedLap());
    // distance = 40*0.1*30 + 40*0.1*90 = 120 + 360 = 480 m.
    // At sample 39 (0.39s... first 40 samples), progress should be ~120/480=0.25.
    expect(series[39].progress).toBeCloseTo(0.25, 2);
    expect(series[79].progress).toBeCloseTo(1, 5);
  });

  it("clamps progress at 1.0 for overshoot", () => {
    const series = buildProgressSeries(constantLap(100)); // longer track, ends full
    expect(series[series.length - 1].progress).toBeLessThanOrEqual(1);
  });
});

describe("splitIntoSectors", () => {
  it("splits a constant lap into roughly equal thirds by duration", () => {
    const series = buildProgressSeries(constantLap());
    const sectors = splitIntoSectors(series, 6000);
    expect(sectors).toHaveLength(3);
    // 60 samples => 20 samples per sector => ~2000ms each.
    expect(sectors[0].durationMs).toBeGreaterThan(1800);
    expect(sectors[0].durationMs).toBeLessThan(2200);
    expect(sectors[1].durationMs).toBeGreaterThan(1800);
    expect(sectors[1].durationMs).toBeLessThan(2200);
    expect(sectors[2].durationMs).toBeGreaterThan(1800);
    expect(sectors[2].durationMs).toBeLessThan(2200);
  });

  it("measures avg speed in km/h correctly (60 m/s => 216 kph)", () => {
    const series = buildProgressSeries(constantLap(60));
    const sectors = splitIntoSectors(series, 6000);
    expect(sectors[0].avgSpeedKph).toBe(216);
  });

  it("handles a partial lap (never reaches boundary) without losing sectors", () => {
    const short = buildProgressSeries(constantLap(10).slice(0, 10));
    const sectors = splitIntoSectors(short, 1000);
    expect(sectors).toHaveLength(3);
  });
});

describe("computeSectorDeltas", () => {
  it("finds the biggest loss sector on a slower lap", () => {
    // Best: constant 60 m/s (6000ms). Target: slow first half (30 m/s x40) then fast (90 x40) => 8000ms
    const lap1 = { lapNumber: 1, lapTimeMs: 6000, points: constantLap() };
    const lap2 = { lapNumber: 2, lapTimeMs: 8000, points: mixedLap() };
    const breakdowns = breakdownLaps([lap1, lap2]);
    const stats = computeSectorDeltas(breakdowns, 2);
    expect(stats.bestBreakdown?.lapNumber).toBe(1);
    expect(stats.sectorDeltas).toHaveLength(3);
    expect(stats.biggestLossBySector).toBe(1); // slow first third
  });

  it("returns null stats on empty", () => {
    expect(computeSectorDeltas([])).toEqual({
      biggestLossBySector: null,
      sectorDeltas: [],
      bestBreakdown: null,
    });
  });
});

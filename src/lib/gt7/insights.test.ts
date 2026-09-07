import { describe, it, expect } from "vitest";
import { buildLapInsight, summarizeSession } from "./insights";
import type { InsightPoint } from "./insights";

function pts(speed: number, throttle = 200, n = 60): InsightPoint[] {
  const out: InsightPoint[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      tMs: i * 100,
      speedMs: speed,
      throttle,
      fuelLevel: 100 - i * 0.1,
      tireTempFl: 90,
      tireTempFr: 91,
      tireTempRl: 92,
      tireTempRr: 93,
    });
  }
  return out;
}

describe("buildLapInsight", () => {
  it("computes top/min speed and throttle from a constant-speed lap", () => {
    const insight = buildLapInsight(1, 6000, pts(60));
    expect(insight.topSpeedKph).toBe(216);
    expect(insight.minSpeedKph).toBe(216);
    expect(insight.fuelConsumed).toBeCloseTo(5.9, 1); // 100 -> 94.1
    expect(insight.tireTempDelta).toEqual([0, 0, 0, 0]);
  });

  it("handles a speed ramp with a valid min", () => {
    const points: InsightPoint[] = [];
    for (let i = 0; i < 30; i++) points.push({ tMs: i * 100, speedMs: 10 + i * 3, throttle: 100 });
    const insight = buildLapInsight(1, 9000, points);
    expect(insight.minSpeedKph).toBe(36); // 10 m/s
    expect(insight.topSpeedKph).toBe(Math.round(97 * 3.6)); // 29 * 3 + 10
    expect(insight.fastestThrottlePct).toBe(Math.round((100 / 255) * 100));
  });

  it("clamps min speed to 0 when only resting points exist", () => {
    const insight = buildLapInsight(1, 1000, pts(0, 0, 10));
    expect(insight.minSpeedKph).toBe(0);
  });
});

describe("summarizeSession", () => {
  it("picks best lap and computes average + gap", () => {
    const laps = [
      buildLapInsight(1, 6000, pts(60)),
      buildLapInsight(2, 5000, pts(72)),
      buildLapInsight(3, 5500, pts(65)),
    ];
    const sum = summarizeSession(laps, null);
    expect(sum.bestLapInsight?.lapNumber).toBe(2);
    expect(sum.avgLapTimeMs).toBe(5500);
    expect(sum.bestGapMs).toBe(500); // 5500 - 5000
    expect(sum.minSessionSpeedKph).toBe(216);
  });

  it("returns nulls for empty sessions", () => {
    const sum = summarizeSession([], null);
    expect(sum.topSessionSpeedKph).toBe(0);
    expect(sum.bestLapInsight).toBeNull();
    expect(sum.avgLapTimeMs).toBeNull();
    expect(sum.bestGapMs).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import {
  resampleToDistanceGrid,
  stddev,
  pickFastestLaps,
  varianceAcrossLaps,
  consistencyScoreFromVariance,
} from "./variance";
import { adaptPoints, groupByLap, CAPTURE_STEP_MS } from "./adapter";
import type { FclanPointRow } from "./adapter";

function lapInput(n: number, timeMs: number | null, speed: number, len = 50, replay = false) {
  return { lapNumber: n, lapTimeMs: timeMs, isReplay: replay, speed: new Array(len).fill(speed) };
}

describe("resampleToDistanceGrid", () => {
  it("interpolates evenly", () => {
    const g = resampleToDistanceGrid([0, 100], 4);
    expect(g).toEqual([0, 25, 50, 75, 100]);
  });
  it("single-sample series fills flat", () => {
    expect(resampleToDistanceGrid([42], 3)).toEqual([42, 42, 42, 42]);
  });
});

describe("stddev", () => {
  it("is 0 for flat data", () => {
    expect(stddev([60, 60, 60])).toBe(0);
  });
  it("population stddev of [0, 100] is 50", () => {
    expect(stddev([0, 100])).toBe(50);
  });
});

describe("pickFastestLaps", () => {
  it("picks N fastest within 5% and drops replays/box laps", () => {
    const laps = [
      lapInput(1, 100_000, 60),
      lapInput(2, 99_000, 61),
      lapInput(3, 200_000, 30), // incident lap, outside window
      lapInput(4, 98_000, 62, 50, true), // replay, dropped
      lapInput(5, null, 60), // incomplete, dropped
      lapInput(6, 101_000, 59),
    ];
    const picked = pickFastestLaps(laps, 3, 0.05);
    expect(picked.map((l) => l.lapNumber)).toEqual([2, 1, 6]);
  });
});

describe("varianceAcrossLaps", () => {
  it("flat identical laps => zero variance everywhere, score 1", () => {
    const laps = [lapInput(1, 100_000, 60), lapInput(2, 101_000, 60)];
    const { points, lapsUsed } = varianceAcrossLaps(laps);
    expect(points).toHaveLength(101);
    expect(points.every((p) => p.speedStddev === 0)).toBe(true);
    expect(lapsUsed).toEqual([1, 2]);
    expect(consistencyScoreFromVariance(points)).toBeCloseTo(1, 5);
  });

  it("different laps => nonzero variance, score below 1", () => {
    const laps = [lapInput(1, 100_000, 40), lapInput(2, 101_000, 80)];
    const { points } = varianceAcrossLaps(laps);
    expect(points[50].speedStddev).toBeGreaterThan(0);
    expect(consistencyScoreFromVariance(points)).toBeLessThan(1);
  });

  it("empty set => empty points", () => {
    expect(varianceAcrossLaps([]).points).toEqual([]);
  });
});

describe("adaptPoints", () => {
  function row(packet: number, extra: Partial<FclanPointRow> = {}): FclanPointRow {
    return {
      packet_id: packet,
      lap_number: 1,
      speed_ms: 60,
      rpm: 6000,
      throttle: 200,
      brake: 0,
      gear: 4,
      pos_x: 1,
      pos_z: 2,
      fuel_level: 50,
      fuel_capacity: 100,
      tire_temp_fl: 90,
      tire_temp_fr: 91,
      tire_temp_rl: 92,
      tire_temp_rr: 93,
      ...extra,
    };
  }

  it("maps rows to Pro shape with synthetic 100ms clock", () => {
    const [a, b] = adaptPoints([row(10), row(11)]);
    expect(a.speed).toBe(60);
    expect(a.position).toEqual({ x: 1, y: 0, z: 2 });
    expect(a.fuel).toBe(50);
    expect(a.tireTemp).toEqual({ frontLeft: 90, frontRight: 91, rearLeft: 92, rearRight: 93 });
    expect(b.timestamp - a.timestamp).toBe(CAPTURE_STEP_MS);
  });

  it("passes fuel through raw when capacity is missing", () => {
    const [a] = adaptPoints([row(1, { fuel_level: 42, fuel_capacity: null })]);
    expect(a.fuel).toBe(42);
  });

  it("omits tireTemp when no temps captured", () => {
    const [a] = adaptPoints([
      row(1, { tire_temp_fl: null, tire_temp_fr: null, tire_temp_rl: null, tire_temp_rr: null }),
    ]);
    expect(a.tireTemp).toBeUndefined();
  });

  it("drops menu/outlap points when grouping (lap_number <= 0)", () => {
    const pts = adaptPoints([row(1, { lap_number: 0 }), row(2, { lap_number: 1 }), row(3, { lap_number: 2 })]);
    const byLap = groupByLap(pts);
    expect([...byLap.keys()]).toEqual([1, 2]);
  });
});

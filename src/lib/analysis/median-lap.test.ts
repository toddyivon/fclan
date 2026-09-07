import { describe, it, expect } from "vitest";
import { median, medianIgnoringMissing, getMedianLap, MEDIAN_WINDOW_MS } from "./median-lap";

function lap(n: number, timeMs: number | null, v: number, len = 20) {
  return {
    lapNumber: n,
    lapTimeMs: timeMs,
    speed: new Array(len).fill(v),
    throttle: new Array(len).fill(200),
    brake: new Array(len).fill(0),
  };
}

describe("median", () => {
  it("odd count returns the middle", () => {
    expect(median([5, 1, 3])).toBe(3);
  });
  it("even count averages the two middles (matches none_ignoring_median)", () => {
    expect(median([1, 3, 5, 7])).toBe(4);
  });
  it("throws on empty", () => {
    expect(() => median([])).toThrow();
  });
});

describe("medianIgnoringMissing", () => {
  it("ignores None/undefined (matches doctest [1,3,None,5] -> 3)", () => {
    expect(medianIgnoringMissing([1, 3, undefined, 5])).toBe(3);
  });
  it("even with a hole averages middles ([1,3,5,None,7] -> 4.0)", () => {
    expect(medianIgnoringMissing([1, 3, 5, undefined, 7])).toBe(4);
  });
});

describe("getMedianLap", () => {
  it("returns null when no completed laps", () => {
    expect(getMedianLap([lap(1, null, 60), lap(2, -1, 60)])).toBeNull();
  });

  it("filters laps beyond ±10s of best (box laps excluded)", () => {
    const m = getMedianLap([
      lap(1, 90_000, 60),
      lap(2, 90_000 + MEDIAN_WINDOW_MS + 5_000, 10), // box lap
      lap(3, 91_000, 61),
    ]);
    expect(m?.lapCount).toBe(2);
    expect(m?.bestLapMs).toBe(90_000);
    expect(m?.title).toBe("Median (2 Laps): 1:30.500");
  });

  it("takes per-sample medians across uneven lengths (zip_longest)", () => {
    const m = getMedianLap([
      { lapNumber: 1, lapTimeMs: 60000, speed: [60, 60, 60], throttle: [200, 200, 200], brake: [0, 0, 0] },
      { lapNumber: 2, lapTimeMs: 61000, speed: [62, 62, 62, 62, 62], throttle: [210, 210, 210, 210, 210], brake: [0, 0, 0, 0, 0] },
    ]);
    expect(m?.speed).toHaveLength(5);
    expect(m?.speed[0]).toBe(61);
    expect(m?.speed[3]).toBe(62); // only lap 2 has it
  });
});

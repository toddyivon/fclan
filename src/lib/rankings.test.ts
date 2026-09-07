import { describe, it, expect } from "vitest";
import {
  pointsForRank,
  tierForPoints,
  buildDriverStandings,
  TIER_THRESHOLDS,
} from "./rankings";

describe("pointsForRank", () => {
  it("pays F1-style points for P1..P10", () => {
    expect(pointsForRank(1)).toBe(25);
    expect(pointsForRank(2)).toBe(18);
    expect(pointsForRank(10)).toBe(1);
  });
  it("pays nothing outside the points", () => {
    expect(pointsForRank(0)).toBe(0);
    expect(pointsForRank(11)).toBe(0);
  });
});

describe("tierForPoints", () => {
  it("returns null below bronze", () => {
    expect(tierForPoints(0)).toBeNull();
  });
  it("walks the ladder at thresholds", () => {
    expect(tierForPoints(TIER_THRESHOLDS.bronze)).toBe("bronze");
    expect(tierForPoints(TIER_THRESHOLDS.silver)).toBe("silver");
    expect(tierForPoints(TIER_THRESHOLDS.gold)).toBe("gold");
    expect(tierForPoints(TIER_THRESHOLDS.platinum)).toBe("platinum");
    expect(tierForPoints(TIER_THRESHOLDS.diamond)).toBe("diamond");
    expect(tierForPoints(10_000)).toBe("diamond");
  });
});

describe("buildDriverStandings", () => {
  it("aggregates points across tracks, ranks by points then wins", () => {
    const rows = [
      { driver_name: "A", track_name: "T1", rank: 1 }, // 25
      { driver_name: "A", track_name: "T2", rank: 2 }, // 18 => 43
      { driver_name: "B", track_name: "T1", rank: 2 }, // 18
      { driver_name: "B", track_name: "T2", rank: 1 }, // 25 => 43, 1 win
      { driver_name: "C", track_name: "T1", rank: 11 }, // 0, dropped
    ];
    const table = buildDriverStandings(rows);
    expect(table.map((s) => s.driver_name)).toEqual(["A", "B"]);
    expect(table[0].points).toBe(43);
    expect(table[0].wins).toBe(1);
    expect(table[0].podiums).toBe(2);
    expect(table[0].tracks).toBe(2);
    expect(table[0].tier).toBe("silver");
  });

  it("drops scoreless drivers", () => {
    expect(buildDriverStandings([{ driver_name: "Z", track_name: "T", rank: 99 }])).toEqual([]);
  });
});

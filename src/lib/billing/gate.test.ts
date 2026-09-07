import { describe, it, expect } from "vitest";
import { tierHasFeature, FEATURES, TIER_RANK } from "./gate";
import { formatLapTime } from "@/shared/telemetry";

describe("tier feature gates", () => {
  it("matches the product spec per tier", () => {
    expect(tierHasFeature("free", "live_telemetry")).toBe(true);
    expect(tierHasFeature("free", "ai_analysis")).toBe(false);
    expect(tierHasFeature("free", "telemetry_export")).toBe(false);
    expect(tierHasFeature("pro", "ai_analysis")).toBe(true);
    expect(tierHasFeature("pro", "lap_comparison")).toBe(true);
    expect(tierHasFeature("pro", "ghost_laps")).toBe(false);
    expect(tierHasFeature("pro", "fuel_strategy")).toBe(false);
    expect(tierHasFeature("ai_premium", "ghost_laps")).toBe(true);
    expect(tierHasFeature("ai_premium", "fuel_strategy")).toBe(true);
  });

  it("every feature is available to ai_premium", () => {
    for (const feature of Object.keys(FEATURES) as (keyof typeof FEATURES)[]) {
      expect(tierHasFeature("ai_premium", feature)).toBe(true);
    }
  });

  it("ranks tiers in upgrade order", () => {
    expect(TIER_RANK.free).toBeLessThan(TIER_RANK.pro);
    expect(TIER_RANK.pro).toBeLessThan(TIER_RANK.ai_premium);
  });
});

describe("formatLapTime", () => {
  it("formats milliseconds as M:SS.mmm", () => {
    expect(formatLapTime(93456)).toBe("1:33.456");
    expect(formatLapTime(60000)).toBe("1:00.000");
    expect(formatLapTime(599999)).toBe("9:59.999");
  });
  it("handles unset values", () => {
    expect(formatLapTime(-1)).toBe("-:--.---");
    expect(formatLapTime(0)).toBe("-:--.---");
    expect(formatLapTime(null)).toBe("-:--.---");
    expect(formatLapTime(undefined)).toBe("-:--.---");
  });
});

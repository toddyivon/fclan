import { describe, it, expect } from "vitest";
import { processLapTransitions } from "./laps";
import type { IngestPoint } from "@/shared/telemetry";

function pt(overrides: Partial<IngestPoint>): IngestPoint {
  return { packet_id: 0, ...overrides };
}

describe("processLapTransitions", () => {
  it("completes a lap when current_lap increments", () => {
    const r = processLapTransitions(0, [
      pt({ packet_id: 1, current_lap: 1 }),
      pt({ packet_id: 2, current_lap: 1 }),
      pt({ packet_id: 3, current_lap: 2, last_lap_ms: 93456 }),
    ]);
    expect(r.completedLaps).toEqual([{ lapNumber: 1, lapTimeMs: 93456 }]);
    expect(r.currentLap).toBe(2);
    expect(r.pointLapNumbers).toEqual([1, 1, 2]);
    expect(r.lastLapMs).toBe(93456);
  });

  it("emits nothing without a transition", () => {
    const r = processLapTransitions(1, [
      pt({ packet_id: 1, current_lap: 1 }),
      pt({ packet_id: 2, current_lap: 1 }),
    ]);
    expect(r.completedLaps).toEqual([]);
    expect(r.currentLap).toBe(1);
  });

  it("uses prevLap continuity across batches", () => {
    const r = processLapTransitions(3, [
      pt({ packet_id: 10, current_lap: 4, last_lap_ms: 91200 }),
    ]);
    expect(r.completedLaps).toEqual([{ lapNumber: 3, lapTimeMs: 91200 }]);
    expect(r.currentLap).toBe(4);
  });

  it("maps menu/out-of-track points to null laps", () => {
    const r = processLapTransitions(0, [
      pt({ packet_id: 1, current_lap: 0 }),
      pt({ packet_id: 2 }),
      pt({ packet_id: 3, current_lap: -1 }),
    ]);
    expect(r.pointLapNumbers).toEqual([null, null, null]);
    expect(r.completedLaps).toEqual([]);
    expect(r.currentLap).toBe(0);
  });

  it("fills multi-lap jumps with null times, crediting only the last", () => {
    const r = processLapTransitions(1, [
      pt({ packet_id: 1, current_lap: 4, last_lap_ms: 90000 }),
    ]);
    expect(r.completedLaps).toEqual([
      { lapNumber: 1, lapTimeMs: null },
      { lapNumber: 2, lapTimeMs: null },
      { lapNumber: 3, lapTimeMs: 90000 },
    ]);
  });

  it("treats lap decreases as resets (no phantom laps)", () => {
    const r = processLapTransitions(5, [
      pt({ packet_id: 1, current_lap: 1 }),
      pt({ packet_id: 2, current_lap: 2, last_lap_ms: 95000 }),
    ]);
    expect(r.completedLaps).toEqual([{ lapNumber: 1, lapTimeMs: 95000 }]);
    expect(r.currentLap).toBe(2);
  });

  it("does not complete laps on a cold start mid-session", () => {
    const r = processLapTransitions(0, [pt({ packet_id: 1, current_lap: 2 })]);
    expect(r.completedLaps).toEqual([]);
    expect(r.currentLap).toBe(2);
  });

  it("aggregates best/last/total lap metadata", () => {
    const r = processLapTransitions(1, [
      pt({ packet_id: 1, current_lap: 1, best_lap_ms: 92000, total_laps: 10 }),
      pt({ packet_id: 2, current_lap: 1, best_lap_ms: 91500, last_lap_ms: 93000 }),
      pt({ packet_id: 3, current_lap: 1, best_lap_ms: -1, last_lap_ms: -1 }),
    ]);
    expect(r.bestLapMs).toBe(91500);
    expect(r.lastLapMs).toBe(93000);
    expect(r.totalLaps).toBe(10);
  });

  it("counts a completed lap's time toward best", () => {
    const r = processLapTransitions(1, [
      pt({ packet_id: 1, current_lap: 2, last_lap_ms: 89000 }),
    ]);
    expect(r.bestLapMs).toBe(89000);
  });

  it("ignores non-finite junk", () => {
    const r = processLapTransitions(NaN as unknown as number, [
      pt({ packet_id: 1, current_lap: Infinity, last_lap_ms: NaN }),
    ]);
    expect(r.completedLaps).toEqual([]);
    expect(r.pointLapNumbers).toEqual([null]);
  });
});

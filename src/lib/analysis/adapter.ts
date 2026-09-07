/**
 * Adapter: fclan telemetry_points rows -> Pro-engine TelemetryPoint shape.
 *
 * Clock: telemetry_points.timestamp is server-receipt time (batch inserts),
 * NOT capture time, so intra-lap ordering comes from packet_id. At capture
 * the mobile downsamples to 10 Hz => 100 ms steps. Timestamps are therefore
 * synthesized as firstPointTime + packetOffset*100, which is exactly what
 * the distance/time engines need (monotonic, evenly spaced).
 *
 * Fuel: Pro engines expect 0-100 %. fclan stores game units, so normalize
 * by fuel_capacity when present; otherwise pass through raw (engines treat
 * it as relative consumption, verified no crashes on either scale).
 *
 * Positions: pos_x/pos_z feed racing-line geometry (y is up in GT7, kept 0).
 * Tire temps pass straight through; pressures/wear are not captured by GT7
 * and stay undefined by design (tireAnalyzer handles absence).
 */

import type { TelemetryPoint } from "./pro/types";

export interface FclanPointRow {
  packet_id: number;
  lap_number?: number | null;
  speed_ms?: number | null;
  rpm?: number | null;
  throttle?: number | null;
  brake?: number | null;
  gear?: number | null;
  pos_x?: number | null;
  pos_y?: number | null;
  pos_z?: number | null;
  fuel_level?: number | null;
  fuel_capacity?: number | null;
  tire_temp_fl?: number | null;
  tire_temp_fr?: number | null;
  tire_temp_rl?: number | null;
  tire_temp_rr?: number | null;
  timestamp?: string | null;
}

/** Synthetic 10 Hz clock step (ms) — matches the mobile downsample. */
export const CAPTURE_STEP_MS = 100;

export function adaptPoints(rows: FclanPointRow[]): TelemetryPoint[] {
  if (rows.length === 0) return [];

  const base = rows[0].timestamp != null ? Date.parse(rows[0].timestamp) : 0;
  const baseMs = Number.isFinite(base) ? base : 0;
  const firstPacket = rows[0].packet_id;

  return rows.map((r) => {
    const fuelPct =
      r.fuel_level != null && r.fuel_capacity != null && r.fuel_capacity > 0
        ? (r.fuel_level / r.fuel_capacity) * 100
        : (r.fuel_level ?? 100);

    return {
      timestamp: baseMs + (r.packet_id - firstPacket) * CAPTURE_STEP_MS,
      lapNumber: r.lap_number ?? 0,
      position: {
        x: r.pos_x ?? 0,
        y: r.pos_y ?? 0,
        z: r.pos_z ?? 0,
      },
      speed: r.speed_ms ?? 0,
      throttle: r.throttle ?? 0,
      brake: r.brake ?? 0,
      gear: r.gear ?? 0,
      rpm: r.rpm ?? 0,
      fuel: fuelPct,
      tireTemp:
        r.tire_temp_fl != null || r.tire_temp_fr != null || r.tire_temp_rl != null || r.tire_temp_rr != null
          ? {
              frontLeft: r.tire_temp_fl ?? 0,
              frontRight: r.tire_temp_fr ?? 0,
              rearLeft: r.tire_temp_rl ?? 0,
              rearRight: r.tire_temp_rr ?? 0,
            }
          : undefined,
    };
  });
}

/**
 * Groups adapted points by lap_number (the shape Pro engines and the AI
 * route both consume). Points with no/unknown lap (menu, outlap) are
 * dropped — matching ingest's lap-detection semantics.
 */
export function groupByLap(points: TelemetryPoint[]): Map<number, TelemetryPoint[]> {
  const byLap = new Map<number, TelemetryPoint[]>();
  for (const p of points) {
    if (p.lapNumber <= 0) continue;
    const arr = byLap.get(p.lapNumber);
    if (arr) arr.push(p);
    else byLap.set(p.lapNumber, [p]);
  }
  return byLap;
}

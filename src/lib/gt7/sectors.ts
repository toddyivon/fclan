/**
 * Sector analysis — splits a lap into 3 sectors by cumulative distance,
 * and reports each sector's split time (and delta vs best).
 *
 * The GT7 packet has position (posX/posZ) and velocity on every point, so
 * a lap's normalized distance can be integrated from the sample stream just
 * like gt7dashboard's time-diff-by-distance: walk points in packet order,
 * integrate speed*dt into accumulated distance, then bin the samples into
 * S1 / S2 / S3 by standard thirds (33.3% / 66.6%).
 *
 * Pure functions — no IO — so the engines are unit-testable.
 */

export interface SectorPoint {
  /** cumulative distance normalized to 0-1 within this lap */
  progress: number;
  /** time from lap start in ms */
  tMs: number;
  /** speed in m/s */
  speedMs: number;
}

export interface SectorSplit {
  sector: 1 | 2 | 3;
  /** ms from lap start at which this sector starts */
  startMs: number;
  /** ms into the lap this sector's split (end boundary) */
  splitMs: number;
  /** milliseconds spent in this sector */
  durationMs: number;
  /** average speed in km/h through this sector */
  avgSpeedKph: number;
}

export interface LapSectorBreakdown {
  lapNumber: number;
  lapTimeMs: number | null;
  sectors: SectorSplit[];
}

export interface SectorStats {
  biggestLossBySector: 1 | 2 | 3 | null;
  sectorDeltas: Array<{ sector: 1 | 2 | 3; deltaMs: number }>;
  bestBreakdown: LapSectorBreakdown | null;
}

const SECTOR_BOUNDS: Array<[number, number]> = [
  [0, 1 / 3],
  [1 / 3, 2 / 3],
  [2 / 3, 1.0001],
];

export interface RawSectorPoint {
  /** time from lap start in ms (monotonic per lap) */
  tMs: number;
  /** speed in m/s */
  speedMs: number;
}

/**
 * Integrates a raw point stream into a distance-progressed series.
 *
 * Each step covers dt = next.tMs - prev.tMs seconds at the average of the
 * two speeds (trapezoid), which is the standard small-step integration.
 * The lap's total distance is whatever the stream accumulated by its last
 * point; progress is normalized against that total (1.0 = start/finish).
 *
 * Points outside [0, 100%] are clamped; a stream with no motion delta yields
 * a flat progress of 0, which callers should treat as an unusable lap. This
 * mirrors how gt7dashboard resamples to a distance axis before comparing.
 */
export function buildProgressSeries(points: RawSectorPoint[]): SectorPoint[] {
  if (points.length === 0) return [];

  let distance = 0;
  const out: SectorPoint[] = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i > 0) {
      const prev = points[i - 1];
      const dtSec = Math.max(0, (p.tMs - prev.tMs) / 1000);
      distance += ((p.speedMs + prev.speedMs) / 2) * dtSec;
    }
    out.push({
      progress: 0, // filled after total known
      tMs: p.tMs,
      speedMs: p.speedMs,
    });
  }

  const total = distance || 1;
  // Reposition progress as a running cumulative fraction of the total.
  let run = 0;
  for (let i = 0; i < out.length; i++) {
    if (i > 0) {
      const prev = points[i - 1];
      const dtSec = Math.max(0, (points[i].tMs - prev.tMs) / 1000);
      run += ((points[i].speedMs + prev.speedMs) / 2) * dtSec;
    }
    out[i].progress = Math.min(1, run / total);
  }

  return out;
}

/**
 * Splits a normalized series into per-sector splits. A sector ends at the
 * first sample whose progress reaches its boundary; if the stream never
 * reaches the boundary (short/partial lap), the last sample's time is used
 * as its end.
 */
export function splitIntoSectors(series: SectorPoint[], lapTimeMs: number | null): SectorSplit[] {
  const sectors: SectorSplit[] = [];
  const n = series.length;

  for (let idx = 0; idx < SECTOR_BOUNDS.length; idx++) {
    const [lo, hi] = SECTOR_BOUNDS[idx];

    let startIdx = 0;
    if (idx > 0) {
      const prevHi = SECTOR_BOUNDS[idx - 1][1];
      for (let i = 0; i < n; i++) {
        if (series[i].progress >= prevHi) {
          startIdx = i;
          break;
        }
      }
    }

    let endIdx = n - 1;
    for (let i = 0; i < n; i++) {
      if (series[i].progress >= hi) {
        endIdx = i;
        break;
      }
    }

    const startMs = startIdx > 0 ? series[startIdx - 1].tMs : 0;
    const endMs = series[endIdx]?.tMs ?? lapTimeMs ?? series[n - 1]?.tMs ?? 0;

    let speedSum = 0;
    let speedN = 0;
    for (let i = startIdx; i <= Math.min(endIdx, n - 1); i++) {
      speedSum += series[i].speedMs * 3.6;
      speedN++;
    }

    sectors.push({
      sector: (idx + 1) as 1 | 2 | 3,
      startMs: Math.round(startMs),
      splitMs: Math.round(endMs),
      durationMs: Math.max(0, Math.round(endMs - startMs)),
      avgSpeedKph: speedN > 0 ? Math.round(speedSum / speedN) : 0,
    });
  }

  return sectors;
}

/**
 * Analyzes completed laps into per-lap sector breakdowns.
 */
export function breakdownLaps(
  laps: Array<{ lapNumber: number; lapTimeMs: number | null; points: RawSectorPoint[] }>
): LapSectorBreakdown[] {
  return laps.map((lap) => {
    const series = buildProgressSeries(lap.points);
    return {
      lapNumber: lap.lapNumber,
      lapTimeMs: lap.lapTimeMs,
      sectors: splitIntoSectors(series, lap.lapTimeMs),
    };
  });
}

/**
 * Computes per-sector deltas of a target lap versus the best lap, and
 * identifies the sector with the biggest loss.
 */
export function computeSectorDeltas(
  laps: LapSectorBreakdown[],
  targetLapNumber?: number
): SectorStats {
  if (laps.length === 0) {
    return { biggestLossBySector: null, sectorDeltas: [], bestBreakdown: null };
  }

  const bestBreakdown = laps.reduce((best, lap) => {
    if (best == null || best.lapTimeMs == null) return lap;
    if (lap.lapTimeMs == null || lap.lapTimeMs < best.lapTimeMs) return lap;
    return best;
  }, laps[0] ?? null);

  const valid = laps.filter((l) => l.lapTimeMs != null);
  const target =
    (targetLapNumber != null ? valid.find((l) => l.lapNumber === targetLapNumber) : null) ??
    valid[valid.length - 1] ??
    laps[laps.length - 1];

  if (!bestBreakdown) {
    return { biggestLossBySector: null, sectorDeltas: [], bestBreakdown: null };
  }

  const sectorDeltas = ([1, 2, 3] as const).map((sector) => {
    const bestSector = bestBreakdown.sectors.find((s) => s.sector === sector);
    const targetSector = target?.sectors.find((s) => s.sector === sector);
    const deltaMs = bestSector && targetSector ? targetSector.durationMs - bestSector.durationMs : 0;
    return { sector, deltaMs: Math.round(deltaMs) };
  });

  let biggestLossBySector: 1 | 2 | 3 | null = null;
  let biggestLossMs = 0;
  for (const d of sectorDeltas) {
    if (d.deltaMs > biggestLossMs) {
      biggestLossMs = d.deltaMs;
      biggestLossBySector = d.sector;
    }
  }

  return { biggestLossBySector, sectorDeltas, bestBreakdown };
}

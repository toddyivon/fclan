/**
 * Driver standings — the competition layer (harvested conceptually from
 * therank + GT7-Telemetry-Pro's bronze→diamond points domain, rebuilt on
 * fclan's leaderboard_public view with zero new tables).
 *
 * Scoring: F1-style points per track (one entry per driver per track),
 * summed across tracks. Tiers reward breadth + pace: winning one track
 * gets you noticed (25 pts), grinding podiums across tracks gets you ranked.
 */

export type Tier = "bronze" | "silver" | "gold" | "platinum" | "diamond";

/** F1-style points for P1..P10 on a track. */
export const POINTS_TABLE: readonly number[] = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export function pointsForRank(rank: number): number {
  if (rank < 1 || rank > POINTS_TABLE.length) return 0;
  return POINTS_TABLE[rank - 1];
}

/** Tier thresholds in total points (tuned for a young community). */
export const TIER_THRESHOLDS: Readonly<Record<Tier, number>> = {
  bronze: 1,
  silver: 25,
  gold: 75,
  platinum: 150,
  diamond: 300,
};

export const TIER_ORDER: readonly Tier[] = ["bronze", "silver", "gold", "platinum", "diamond"];

export function tierForPoints(points: number): Tier | null {
  if (points < TIER_THRESHOLDS.bronze) return null;
  let tier: Tier = "bronze";
  for (const t of TIER_ORDER) {
    if (points >= TIER_THRESHOLDS[t]) tier = t;
  }
  return tier;
}

export function tierLabel(tier: Tier): string {
  return tier[0].toUpperCase() + tier.slice(1);
}

export interface StandingInput {
  driver_name: string;
  track_name: string;
  /** 1-based rank on that track */
  rank: number;
}

export interface DriverStanding {
  driver_name: string;
  points: number;
  tier: Tier | null;
  tracks: number;
  wins: number;
  podiums: number;
}

/**
 * Aggregates per-track ranks into global driver standings.
 * One row per (driver, track) expected — callers must rank first.
 */
export function buildDriverStandings(rows: StandingInput[]): DriverStanding[] {
  const byDriver = new Map<string, { points: number; tracks: Set<string>; wins: number; podiums: number }>();
  for (const r of rows) {
    if (!r.driver_name) continue;
    let acc = byDriver.get(r.driver_name);
    if (!acc) {
      acc = { points: 0, tracks: new Set(), wins: 0, podiums: 0 };
      byDriver.set(r.driver_name, acc);
    }
    acc.points += pointsForRank(r.rank);
    acc.tracks.add(r.track_name);
    if (r.rank === 1) acc.wins++;
    if (r.rank <= 3) acc.podiums++;
  }

  return [...byDriver.entries()]
    .map(([driver_name, acc]) => ({
      driver_name,
      points: acc.points,
      tier: tierForPoints(acc.points),
      tracks: acc.tracks.size,
      wins: acc.wins,
      podiums: acc.podiums,
    }))
    .filter((s) => s.points > 0)
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.driver_name.localeCompare(b.driver_name));
}

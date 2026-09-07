import { z } from "zod";

/**
 * GT7 Daily Races data source.
 *
 * Research notes (2026-06-10):
 * - The only stable public JSON for GT7 online data is GT7Info by ddm999:
 *   https://ddm999.github.io/gt7info/data.json (rebuilt daily; `updatetimestamp`
 *   is maintained, currently matching the latest game update).
 * - HOWEVER, the `dailyrace` section of that feed stopped being updated in
 *   October 2022. Since then it ships a hardcoded placeholder:
 *   `date: "70-01-01"`, `courseid: 0`, `track: "No Longer Updated"`.
 *   The project's own dev notes (json-dev-notes.html) say: "All data in
 *   'dailyrace' is placeholder ... Do not use it."
 * - Other candidates checked: GTDB (gtdb.io/gt7/races — career races only, no
 *   API) and DG EDGE (dg-edge.com/events/dailies — live data, but its API at
 *   admin.dg-edge.com/api returns 403 and is private).
 *
 * Strategy: fetch the stable URL anyway, validate defensively, and REJECT
 * placeholder entries. Today this yields an empty race list (the UI shows an
 * honest "live data unavailable" state), but if the feed ever resumes
 * publishing real rotations the hub lights up automatically.
 */
export const DAILY_RACES_SOURCE = {
  name: "GT7Info (ddm999/gt7info)",
  url: "https://ddm999.github.io/gt7info/data.json",
  homepage: "https://ddm999.github.io/gt7info/",
} as const;

/** Raw race entry as emitted by gt7info's build script (build.py). */
const rawRaceSchema = z.object({
  // Real data serializes courseid as a CSV string; the placeholder uses 0.
  courseid: z.union([z.string(), z.number()]).optional(),
  track: z.string().optional(),
  crsbase: z.string().optional(),
  laps: z.number().optional(),
  cars: z.number().optional(),
  starttype: z.string().optional(),
  fuelcons: z.number().optional(),
  tyrewear: z.number().optional(),
  cartype: z.string().optional(),
  // Present only when cartype is "category" / "both".
  category: z.string().optional(),
  // Present only when cartype is "specific" / "both" / "specific_tuninglimits".
  specificcars: z.array(z.string()).optional(),
  // Present only when cartype is "pp" / "dt_tuninglimits".
  cartags: z.string().optional(),
  pplimit: z.string().optional(),
  widebodyban: z.boolean().optional(),
  nitrousban: z.boolean().optional(),
  tyres: z.array(z.string()).optional(),
  requiredtyres: z.array(z.string()).optional(),
  bop: z.boolean().optional(),
  carsettings_specified: z.boolean().optional(),
  garagecar: z.boolean().optional(),
  // "light" | "heavy" | false in real data.
  damage: z.union([z.string(), z.boolean()]).optional(),
  shortcutpen: z.boolean().optional(),
  carcollisionpen: z.boolean().optional(),
  pitlanepen: z.boolean().optional(),
  time: z.number().optional(),
  // Minutes past the hour when races start; the placeholder abuses this
  // field with a string, so accept both.
  schedule: z.union([z.array(z.number()), z.string()]).optional(),
});

const payloadSchema = z.object({
  updatetimestamp: z.string().optional(),
  dailyrace: z
    .object({
      date: z.string().optional(),
      races: z.array(z.unknown()).optional(),
    })
    .optional(),
});

type RawRace = z.infer<typeof rawRaceSchema>;

export interface DailyRace {
  /** Stable id, e.g. "daily-race-a". */
  id: string;
  /** "A" | "B" | "C". */
  letter: string;
  /** "Daily Race A" etc. */
  name: string;
  track: string;
  /** Base circuit (without layout suffix), when provided. */
  trackBase: string | null;
  laps: number | null;
  /** Grid size. */
  gridSize: number | null;
  /** Car category ("Gr.3"), specified car list, or PP-limit summary. */
  eligibility: string | null;
  specificCars: string[];
  startType: string | null;
  /** Allowed tyre compounds, e.g. ["RH", "RM"]. */
  tyres: string[];
  /** Mandatory compounds (pit-strategy races). */
  requiredTyres: string[];
  /** Human-readable regulation chips ("Fuel use x10", "BoP on", ...). */
  settings: string[];
  /** Minutes past each hour when a slot starts, e.g. [0, 20, 40]. */
  startMinutes: number[] | null;
}

export interface DailyRaces {
  /** Monday the rotation started (ISO date), when known. */
  weekOf: string | null;
  /** Source's own update stamp (ISO date), when known. */
  sourceUpdatedAt: string | null;
  /**
   * Valid (non-placeholder) races. Empty while the upstream feed only
   * publishes its placeholder block — render a fallback in that case.
   */
  races: DailyRace[];
  /** GT7Info has no time-trial section; kept for forward compatibility. */
  timeTrials: DailyRace[];
}

const PLACEHOLDER_TRACK = /no longer updated/i;

function isPlaceholderRace(race: RawRace): boolean {
  const courseId = Number(race.courseid ?? 0);
  if (!Number.isFinite(courseId) || courseId <= 0) return true;
  if (!race.track || PLACEHOLDER_TRACK.test(race.track)) return true;
  if (!race.laps || race.laps <= 0) return true;
  return false;
}

/** "22-10-31" → "2022-10-31"; passes through full ISO dates; else null. */
function normalizeSourceDate(value: string | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{2}-\d{2}-\d{2}$/.test(value)) {
    const normalized = `20${value}`;
    // The placeholder week is epoch-based ("70-01-01" → "2070-01-01").
    return value.startsWith("70-") ? null : normalized;
  }
  return null;
}

function formatStartType(startType: string | undefined): string | null {
  switch (startType) {
    case "grid":
      return "Grid start";
    case "grid_with_false_start":
      return "Grid start (false start check)";
    case "formation":
      return "Rolling start";
    default:
      // The placeholder stuffs prose into this field — drop anything unknown.
      return null;
  }
}

function buildEligibility(race: RawRace): string | null {
  if (race.category) return race.category;
  if (race.specificcars && race.specificcars.length > 0) {
    return race.specificcars.join(", ");
  }
  if (race.cartags && race.pplimit) return `${race.cartags} · ${race.pplimit} PP or less`;
  if (race.cartags) return race.cartags;
  return null;
}

function buildSettings(race: RawRace): string[] {
  const chips: string[] = [];
  if (race.bop) chips.push("BoP on");
  // x1 is the game default — only call out accelerated multipliers.
  if ((race.fuelcons ?? 0) > 1) chips.push(`Fuel use x${race.fuelcons}`);
  if ((race.tyrewear ?? 0) > 1) chips.push(`Tyre wear x${race.tyrewear}`);
  if (typeof race.damage === "string" && race.damage) {
    chips.push(`Damage: ${race.damage}`);
  }
  if (race.carsettings_specified) chips.push("Fixed car settings");
  if (race.garagecar) chips.push("Garage car allowed");
  if (race.shortcutpen) chips.push("Shortcut penalty");
  if (race.carcollisionpen) chips.push("Collision penalty");
  if (race.pitlanepen) chips.push("Pit lane penalty");
  if (race.widebodyban) chips.push("No widebody");
  if (race.nitrousban) chips.push("No nitrous");
  return chips;
}

const RACE_LETTERS = ["A", "B", "C", "D", "E"] as const;

function toDailyRace(race: RawRace, index: number): DailyRace {
  const letter = RACE_LETTERS[index] ?? String(index + 1);
  return {
    id: `daily-race-${letter.toLowerCase()}`,
    letter,
    name: `Daily Race ${letter}`,
    track: race.track ?? "Unknown track",
    trackBase:
      race.crsbase && race.crsbase !== race.track && !PLACEHOLDER_TRACK.test(race.crsbase)
        ? race.crsbase
        : null,
    laps: race.laps && race.laps > 0 ? race.laps : null,
    gridSize: race.cars && race.cars > 0 ? race.cars : null,
    eligibility: buildEligibility(race),
    specificCars: race.specificcars ?? [],
    startType: formatStartType(race.starttype),
    tyres: (race.tyres ?? []).filter((t) => t && t !== "-"),
    requiredTyres: (race.requiredtyres ?? []).filter((t) => t && t !== "-"),
    settings: buildSettings(race),
    startMinutes: Array.isArray(race.schedule) ? race.schedule : null,
  };
}

/**
 * Fetches the current GT7 Daily Races rotation.
 *
 * Returns `null` on network/HTTP/parse failure. Returns a result with an
 * empty `races` array when the feed responds but only contains placeholder
 * data (the current upstream situation) — callers should render an honest
 * "live data unavailable" state for that case.
 */
export async function fetchDailyRaces(): Promise<DailyRaces | null> {
  let payload: unknown;
  try {
    const res = await fetch(DAILY_RACES_SOURCE.url, {
      next: { revalidate: 3600 },
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    payload = await res.json();
  } catch {
    return null;
  }

  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return null;

  const races: DailyRace[] = [];
  const rawRaces = parsed.data.dailyrace?.races ?? [];
  for (const [index, raw] of rawRaces.entries()) {
    const race = rawRaceSchema.safeParse(raw);
    if (!race.success || isPlaceholderRace(race.data)) continue;
    races.push(toDailyRace(race.data, index));
  }

  return {
    weekOf: normalizeSourceDate(parsed.data.dailyrace?.date),
    sourceUpdatedAt: normalizeSourceDate(parsed.data.updatetimestamp),
    races,
    timeTrials: [],
  };
}

import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { formatLapTime } from "@/shared/telemetry";
import { serverEnv } from "@/env";
import { Badge } from "@/components/ui/badge";
import { Car, Flag, Timer } from "lucide-react";

/**
 * Public lap card — /share/[token]
 *
 * No auth: this path is outside the middleware's protectedPaths, and all data
 * access goes through the service-role client (shared_laps has no anon RLS
 * policies on purpose). Revoked or unknown tokens 404.
 */

const MAX_POINTS = 2000;
const CHUNK_SIZE = 1000;
const MAX_POINTS_SCANNED = 20_000;

type SharePoint = {
  packet_id: number;
  speed_ms: number | null;
  pos_x: number | null;
  pos_z: number | null;
};

function getServiceClient() {
  return createAdminClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

/** Resolve token → share + session + chosen lap. Cached so generateMetadata
 *  and the page body share one round-trip per request. */
const getShare = cache(async (token: string) => {
  const service = getServiceClient();

  const { data: share } = await service
    .from("shared_laps")
    .select("id, session_id, lap_number, created_at")
    .eq("token", token)
    .is("revoked_at", null)
    .maybeSingle();
  if (!share) return null;

  const { data: session } = await service
    .from("telemetry_sessions")
    .select("id, car_name, track_name, started_at, best_lap_ms")
    .eq("id", share.session_id)
    .maybeSingle();
  if (!session) return null;

  const { data: laps } = await service
    .from("lap_data")
    .select("lap_number, lap_time_ms")
    .eq("session_id", share.session_id)
    .order("lap_number", { ascending: true });

  const timed = (laps ?? []).filter((l) => l.lap_time_ms != null && l.lap_time_ms > 0);

  // Shared lap if pinned, otherwise the session's best lap.
  let lapNumber: number | null = share.lap_number;
  let lapTimeMs: number | null = null;
  if (lapNumber !== null) {
    lapTimeMs = timed.find((l) => l.lap_number === lapNumber)?.lap_time_ms ?? null;
  } else if (timed.length > 0) {
    const best = timed.reduce((a, b) => (b.lap_time_ms! < a.lap_time_ms! ? b : a));
    lapNumber = best.lap_number;
    lapTimeMs = best.lap_time_ms;
  }
  lapTimeMs = lapTimeMs ?? session.best_lap_ms;

  return { share, session, lapNumber, lapTimeMs };
});

/** Page through PostgREST (1000-row truncation) and stride-sample to ≤2000. */
async function getLapPoints(sessionId: string, lapNumber: number | null) {
  const service = getServiceClient();
  const all: SharePoint[] = [];

  for (let from = 0; from < MAX_POINTS_SCANNED; from += CHUNK_SIZE) {
    const to = Math.min(from + CHUNK_SIZE, MAX_POINTS_SCANNED) - 1;
    let query = service
      .from("telemetry_points")
      .select("packet_id, speed_ms, pos_x, pos_z")
      .eq("session_id", sessionId)
      .order("packet_id", { ascending: true })
      .range(from, to);
    if (lapNumber !== null) query = query.eq("lap_number", lapNumber);

    const { data, error } = await query;
    if (error) break;
    const rows = (data ?? []) as SharePoint[];
    all.push(...rows);
    if (rows.length < to - from + 1) break;
  }

  if (all.length <= MAX_POINTS) return all;
  const stride = Math.ceil(all.length / MAX_POINTS);
  return all.filter((_, i) => i % stride === 0);
}

/** Static SVG polyline of the lap's pos_x/pos_z trace. */
function TrackTrace({ points }: { points: SharePoint[] }) {
  const xy = points.filter((p) => p.pos_x != null && p.pos_z != null);
  if (xy.length < 2) return null;

  const W = 460;
  const H = 300;
  const PAD = 16;
  const xs = xy.map((p) => p.pos_x as number);
  const zs = xy.map((p) => p.pos_z as number);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const scale = Math.min(
    (W - PAD * 2) / Math.max(maxX - minX, 1e-6),
    (H - PAD * 2) / Math.max(maxZ - minZ, 1e-6)
  );
  const offX = (W - (maxX - minX) * scale) / 2;
  const offY = (H - (maxZ - minZ) * scale) / 2;

  const pts = xy
    .map((p) => {
      const x = offX + ((p.pos_x as number) - minX) * scale;
      const y = H - (offY + ((p.pos_z as number) - minZ) * scale); // flip Z → screen Y
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const [startX, startY] = pts.split(" ")[0].split(",").map(Number);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Lap trace"
    >
      {/* glow underlay */}
      <polyline
        points={pts}
        fill="none"
        stroke="oklch(0.48 0.26 289.3)"
        strokeOpacity="0.3"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={pts}
        fill="none"
        stroke="#8b5cf6"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={startX} cy={startY} r="4" fill="#ede9fe" stroke="#8b5cf6" strokeWidth="2" />
    </svg>
  );
}

/** Static SVG speed sparkline (km/h over the lap). */
function SpeedSparkline({ points }: { points: SharePoint[] }) {
  const speeds = points
    .map((p) => p.speed_ms)
    .filter((v): v is number => v != null)
    .map((v) => v * 3.6);
  if (speeds.length < 2) return null;

  const W = 460;
  const H = 64;
  const min = Math.min(...speeds);
  const max = Math.max(...speeds);
  const span = Math.max(max - min, 1e-6);

  const pts = speeds
    .map((v, i) => {
      const x = (i / (speeds.length - 1)) * W;
      const y = H - 4 - ((v - min) / span) * (H - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Speed over the lap"
      >
        <polygon
          points={`0,${H} ${pts} ${W},${H}`}
          fill="#8b5cf6"
          fillOpacity="0.12"
        />
        <polyline
          points={pts}
          fill="none"
          stroke="#a78bfa"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-xs text-zinc-500">
        <span>Speed</span>
        <span>
          {Math.round(min)}–{Math.round(max)} km/h
        </span>
      </div>
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await getShare(token);
  if (!data) return { title: "Lap not found — GT7 Telemetry" };

  const track = data.session.track_name ?? "Unknown track";
  const car = data.session.car_name ?? "Unknown car";
  const title = `${formatLapTime(data.lapTimeMs)} — ${track} | GT7 Telemetry`;
  const description = `${car} lap at ${track}, captured with GT7 Telemetry. Track your own Gran Turismo 7 laps with live telemetry and AI coaching.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "GT7 Telemetry",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function SharedLapPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getShare(token);
  if (!data) notFound();

  const { session, lapNumber, lapTimeMs } = data;
  const points = await getLapPoints(session.id, lapNumber);
  const drivenAt = new Date(session.started_at);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-4 py-12 text-zinc-100">
      {/* ambient violet glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_50%_-10%,rgba(124,58,237,0.28),transparent),radial-gradient(ellipse_45%_35%_at_85%_110%,rgba(124,58,237,0.14),transparent)]"
      />

      <div className="relative w-full max-w-xl">
        <div className="overflow-hidden rounded-2xl border border-violet-500/25 bg-zinc-900/70 shadow-[0_0_60px_-15px_rgba(124,58,237,0.45)] backdrop-blur">
          {/* top accent strip */}
          <div className="h-1 w-full bg-gradient-to-r from-violet-700 via-violet-500 to-violet-700" />

          <div className="space-y-6 p-6 sm:p-8">
            <div className="flex items-center justify-between gap-3">
              <Badge className="border-violet-500/40 bg-violet-500/15 text-violet-300">
                <Flag />
                GT7 Telemetry
              </Badge>
              <span className="font-mono text-xs tracking-wider text-zinc-500 uppercase">
                {drivenAt.toLocaleDateString("en-US", { dateStyle: "medium" })}
              </span>
            </div>

            <div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                {session.track_name ?? "Unknown track"}
              </h1>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-zinc-400">
                <Car className="h-4 w-4 text-violet-400" />
                {session.car_name ?? "Unknown car"}
              </p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-5 py-4">
              <p className="flex items-center gap-1.5 text-xs tracking-wider text-zinc-500 uppercase">
                <Timer className="h-3.5 w-3.5 text-violet-400" />
                {lapNumber !== null ? `Lap ${lapNumber}` : "Best lap"}
              </p>
              <p className="mt-1 bg-gradient-to-r from-violet-300 via-violet-400 to-fuchsia-400 bg-clip-text font-mono text-5xl font-bold text-transparent sm:text-6xl">
                {formatLapTime(lapTimeMs)}
              </p>
            </div>

            <TrackTrace points={points} />
            <SpeedSparkline points={points} />

            <div className="border-t border-zinc-800 pt-6 text-center">
              <Link
                href="/signup"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-violet-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-violet-500 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:outline-none"
              >
                Track your own laps
              </Link>
              <p className="mt-3 text-xs text-zinc-500">
                Live PS5 telemetry, lap analysis and AI coaching for Gran Turismo 7.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

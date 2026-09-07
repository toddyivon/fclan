"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatLapTime } from "@/shared/telemetry";
import { ChevronDown, Loader2, Lock, Map } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Shared types + helpers (reused by lap-compare / ghost-replay /     */
/* fuel-strategy / consistency-card)                                  */
/* ------------------------------------------------------------------ */

export interface LapOption {
  lap_number: number;
  lap_time_ms: number;
}

/** Row shape returned by GET /api/sessions/:id/points?fields=full. */
export interface FullPoint {
  packet_id: number;
  speed_ms: number | null;
  rpm: number | null;
  throttle: number | null;
  brake: number | null;
  gear: number | null;
  lap_number: number | null;
  pos_x: number | null;
  pos_z: number | null;
  tire_temp_fl: number | null;
  tire_temp_fr: number | null;
  tire_temp_rl: number | null;
  tire_temp_rr: number | null;
  fuel_level: number | null;
}

const EMPTY_POINTS: FullPoint[] = [];

/**
 * Fetches downsampled telemetry points for a session (optionally one lap).
 * Mirrors the request-key pattern from charts.tsx so loading state is
 * derived and the effect never calls setState synchronously.
 */
export function useSessionPoints(
  sessionId: string,
  lap: number | null,
  fields: "basic" | "full" = "full"
): { points: FullPoint[]; loading: boolean; error: string | null } {
  const requestKey = `${sessionId}:${lap ?? "all"}:${fields}`;
  const [result, setResult] = useState<{ key: string; points: FullPoint[] } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const qs = new URLSearchParams({ fields });
    if (lap !== null) qs.set("lap", String(lap));

    fetch(`/api/sessions/${sessionId}/points?${qs}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Failed to load points (${res.status})`);
        }
        return res.json() as Promise<{ points: FullPoint[] }>;
      })
      .then(({ points }) => {
        if (!cancelled) setResult({ key: requestKey, points });
      })
      .catch((e) => {
        if (!cancelled) {
          setFailure({
            key: requestKey,
            message: e instanceof Error ? e.message : "Failed to load telemetry",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, lap, fields, requestKey]);

  return {
    points: result?.key === requestKey ? result.points : EMPTY_POINTS,
    error: failure?.key === requestKey ? failure.message : null,
    loading: result?.key !== requestKey && failure?.key !== requestKey,
  };
}

/** SVG viewBox is `0 0 VIEW VIEW`; geometry coords live in that space. */
export const VIEW = 100;
const PADDING = 0.08; // 8% padding on each side

export interface TrackPt {
  x: number;
  y: number;
  kmh: number;
}

export interface TrackGeometry {
  /** Projected racing-line points (viewBox coords) with local speed. */
  pts: TrackPt[];
  minKmh: number;
  maxKmh: number;
  /** Projects raw world coords (pos_x/pos_z) into viewBox coords. */
  project: (posX: number, posZ: number) => { x: number; y: number };
}

/**
 * Normalizes pos_x/pos_z into a square viewBox, preserving aspect ratio
 * with 8% padding. Returns null when there aren't enough positioned points.
 */
export function buildTrackGeometry(points: FullPoint[]): TrackGeometry | null {
  const valid = points.filter((p) => p.pos_x != null && p.pos_z != null);
  if (valid.length < 2) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of valid) {
    const x = p.pos_x as number;
    const z = p.pos_z as number;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const range = Math.max(maxX - minX, maxZ - minZ, 1e-6);
  const scale = (VIEW * (1 - PADDING * 2)) / range;
  const offX = (VIEW - (maxX - minX) * scale) / 2;
  const offY = (VIEW - (maxZ - minZ) * scale) / 2;

  const project = (posX: number, posZ: number) => ({
    x: offX + (posX - minX) * scale,
    y: offY + (posZ - minZ) * scale,
  });

  let minKmh = Infinity;
  let maxKmh = -Infinity;
  const pts = valid.map((p) => {
    const { x, y } = project(p.pos_x as number, p.pos_z as number);
    const kmh = (p.speed_ms ?? 0) * 3.6;
    if (kmh < minKmh) minKmh = kmh;
    if (kmh > maxKmh) maxKmh = kmh;
    return { x, y, kmh };
  });

  return { pts, minKmh, maxKmh, project };
}

/** Projects another point set with an existing geometry (for overlays). */
export function projectPoints(
  points: FullPoint[],
  geometry: TrackGeometry
): { x: number; y: number }[] {
  return points
    .filter((p) => p.pos_x != null && p.pos_z != null)
    .map((p) => geometry.project(p.pos_x as number, p.pos_z as number));
}

const SLOW_RGB = [59, 130, 246]; // blue-500
const MID_RGB = [139, 92, 246]; // violet-500
const FAST_RGB = [239, 68, 68]; // red-500

/** Speed gradient: blue (slow) → violet → red (fast). t in [0, 1]. */
export function speedColor(t: number): string {
  const clamped = Math.min(Math.max(t, 0), 1);
  const [from, to, u] =
    clamped < 0.5 ? [SLOW_RGB, MID_RGB, clamped * 2] : [MID_RGB, FAST_RGB, (clamped - 0.5) * 2];
  const r = Math.round(from[0] + (to[0] - from[0]) * u);
  const g = Math.round(from[1] + (to[1] - from[1]) * u);
  const b = Math.round(from[2] + (to[2] - from[2]) * u);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Racing line as per-segment <line>s, each stroked with the local speed
 * color, plus a start/finish marker on the first point.
 */
export function TrackOutline({ geometry }: { geometry: TrackGeometry }) {
  const { pts, minKmh, maxKmh } = geometry;
  const span = Math.max(maxKmh - minKmh, 1e-6);
  return (
    <g>
      {pts.slice(1).map((p, i) => {
        const prev = pts[i];
        const t = ((prev.kmh + p.kmh) / 2 - minKmh) / span;
        return (
          <line
            key={i}
            x1={prev.x}
            y1={prev.y}
            x2={p.x}
            y2={p.y}
            stroke={speedColor(t)}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        );
      })}
      {/* Start marker */}
      <circle
        cx={pts[0].x}
        cy={pts[0].y}
        r={2.4}
        fill="#09090b"
        stroke="#10b981"
        strokeWidth={0.8}
      />
      <text
        x={pts[0].x}
        y={pts[0].y + 1.1}
        textAnchor="middle"
        fontSize={3}
        fill="#10b981"
        fontWeight={700}
      >
        S
      </text>
    </g>
  );
}

/** Locked-state card: <Lock> + upgrade CTA pointing at /settings. */
export function LockedFeatureCard({
  title,
  description,
  requiredTier,
}: {
  title: string;
  description: string;
  requiredTier: "Pro" | "AI Premium";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 px-6 py-10 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 ring-1 ring-primary/40">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">
            {title} is available on the{" "}
            <span className="font-medium text-primary">{requiredTier}</span> plan.
          </p>
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90"
            render={<Link href="/settings" />}
          >
            Upgrade plan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Track map (Pro)                                                    */
/* ------------------------------------------------------------------ */

interface TrackMapProps {
  sessionId: string;
  laps: LapOption[];
  /** Resolved server-side via checkFeature(…, 'track_map'). */
  locked: boolean;
}

export function TrackMap({ sessionId, laps, locked }: TrackMapProps) {
  if (locked) {
    return (
      <LockedFeatureCard
        title="Track Map"
        description="Racing line colored by speed"
        requiredTier="Pro"
      />
    );
  }
  return <TrackMapInner sessionId={sessionId} laps={laps} />;
}

interface Hover {
  pt: TrackPt;
  left: number;
  top: number;
}

function TrackMapInner({ sessionId, laps }: { sessionId: string; laps: LapOption[] }) {
  const bestLap = useMemo(
    () =>
      laps.length > 0
        ? laps.reduce((a, b) => (b.lap_time_ms < a.lap_time_ms ? b : a))
        : null,
    [laps]
  );
  const [lap, setLap] = useState<number | null>(bestLap?.lap_number ?? null);
  const { points, loading, error } = useSessionPoints(sessionId, lap, "full");

  const geometry = useMemo(() => buildTrackGeometry(points), [points]);

  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || !geometry) return;
    const rect = svg.getBoundingClientRect();
    // viewBox is square with preserveAspectRatio "meet": account for letterboxing.
    const scale = Math.min(rect.width, rect.height) / VIEW;
    const offX = (rect.width - VIEW * scale) / 2;
    const offY = (rect.height - VIEW * scale) / 2;
    const mx = (e.clientX - rect.left - offX) / scale;
    const my = (e.clientY - rect.top - offY) / scale;

    let nearest: TrackPt | null = null;
    let bestD = Infinity;
    for (const p of geometry.pts) {
      const d = (p.x - mx) * (p.x - mx) + (p.y - my) * (p.y - my);
      if (d < bestD) {
        bestD = d;
        nearest = p;
      }
    }
    if (nearest && bestD <= 25) {
      setHover({ pt: nearest, left: e.clientX - rect.left, top: e.clientY - rect.top });
    } else {
      setHover(null);
    }
  };

  const selectedLap = lap !== null ? laps.find((l) => l.lap_number === lap) : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Map className="h-4 w-4 text-primary" />
          Track Map
        </CardTitle>
        <CardDescription>Racing line colored by speed</CardDescription>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              {selectedLap
                ? `Lap ${selectedLap.lap_number} · ${formatLapTime(selectedLap.lap_time_ms)}`
                : "All laps"}
              <ChevronDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setLap(null)}>All laps</DropdownMenuItem>
              {laps.map((l) => (
                <DropdownMenuItem key={l.lap_number} onClick={() => setLap(l.lap_number)}>
                  Lap {l.lap_number}
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {formatLapTime(l.lap_time_ms)}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}
        {loading ? (
          <div className="flex h-72 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading track map…
          </div>
        ) : !geometry ? (
          !error && (
            <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
              No position data for this selection.
            </div>
          )
        ) : (
          <div className="relative">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VIEW} ${VIEW}`}
              className="h-72 w-full"
              onMouseMove={handleMove}
              onMouseLeave={() => setHover(null)}
              role="img"
              aria-label="Track map colored by speed"
            >
              <TrackOutline geometry={geometry} />
              {hover && (
                <circle
                  cx={hover.pt.x}
                  cy={hover.pt.y}
                  r={1.8}
                  fill="#fff"
                  stroke="#09090b"
                  strokeWidth={0.5}
                  pointerEvents="none"
                />
              )}
            </svg>
            {hover && (
              <div
                className="pointer-events-none absolute z-10 rounded-md border border-primary/40 bg-popover px-2 py-1 font-mono text-xs text-popover-foreground shadow-md"
                style={{
                  left: hover.left,
                  top: hover.top,
                  transform: "translate(-50%, -140%)",
                }}
              >
                {Math.round(hover.pt.kmh)} km/h
              </div>
            )}
            {/* Speed legend */}
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{Math.round(geometry.minKmh)} km/h</span>
              <div
                className="h-1.5 flex-1 rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, rgb(59,130,246), rgb(139,92,246), rgb(239,68,68))",
                }}
              />
              <span>{Math.round(geometry.maxKmh)} km/h</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

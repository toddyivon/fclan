"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
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
import { ChevronDown, Ghost, Loader2, Pause, Play, RotateCcw } from "lucide-react";
import {
  buildTrackGeometry,
  LockedFeatureCard,
  projectPoints,
  TrackOutline,
  useSessionPoints,
  VIEW,
  type LapOption,
} from "./track-map";

const COLOR_CURRENT = "#22d3ee"; // cyan
const COLOR_REFERENCE = "#8b5cf6"; // violet
const SPEEDS = [1, 2, 4] as const;

interface GhostReplayProps {
  sessionId: string;
  laps: LapOption[];
  /** Resolved server-side via checkFeature(…, 'ghost_laps'). */
  locked: boolean;
}

export function GhostReplay({ sessionId, laps, locked }: GhostReplayProps) {
  if (locked) {
    return (
      <LockedFeatureCard
        title="Ghost Replay"
        description="Replay a lap against your best as an animated ghost"
        requiredTier="AI Premium"
      />
    );
  }
  if (laps.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ghost Replay</CardTitle>
          <CardDescription>Replay a lap against your best as an animated ghost</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="py-10 text-center text-sm text-muted-foreground">
            No completed laps recorded for this session.
          </p>
        </CardContent>
      </Card>
    );
  }
  return <GhostReplayInner sessionId={sessionId} laps={laps} />;
}

/**
 * Position along a path at elapsed time `t`, assuming samples are evenly
 * spaced in time (sample index × lap duration / total samples), with linear
 * interpolation between adjacent samples.
 */
function posAlong(
  path: { x: number; y: number }[],
  durationMs: number,
  t: number
): { x: number; y: number } | null {
  if (path.length < 2 || durationMs <= 0) return null;
  const f = Math.min(Math.max(t / durationMs, 0), 1) * (path.length - 1);
  const lo = Math.floor(f);
  const hi = Math.min(lo + 1, path.length - 1);
  const u = f - lo;
  return {
    x: path[lo].x + (path[hi].x - path[lo].x) * u,
    y: path[lo].y + (path[hi].y - path[lo].y) * u,
  };
}

function LapPicker({
  label,
  value,
  laps,
  onPick,
  color,
}: {
  label: string;
  value: number;
  laps: LapOption[];
  onPick: (lap: number) => void;
  color: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        {label}: Lap {value}
        <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {laps.map((l) => (
          <DropdownMenuItem key={l.lap_number} onClick={() => onPick(l.lap_number)}>
            Lap {l.lap_number}
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              {formatLapTime(l.lap_time_ms)}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatElapsed(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = Math.floor(ms % 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function GhostReplayInner({ sessionId, laps }: { sessionId: string; laps: LapOption[] }) {
  const sorted = useMemo(
    () => [...laps].sort((a, b) => a.lap_time_ms - b.lap_time_ms),
    [laps]
  );
  // Reference defaults to the best lap; "current" to the second best (or best).
  const [refLap, setRefLap] = useState<number>(sorted[0].lap_number);
  const [curLap, setCurLap] = useState<number>((sorted[1] ?? sorted[0]).lap_number);

  const ref = useSessionPoints(sessionId, refLap, "full");
  const cur = useSessionPoints(sessionId, curLap, "full");

  const refTime = laps.find((l) => l.lap_number === refLap)?.lap_time_ms ?? 0;
  const curTime = laps.find((l) => l.lap_number === curLap)?.lap_time_ms ?? 0;
  const maxDur = Math.max(refTime, curTime);

  // Track base is drawn from the reference lap; the current lap is projected
  // with the same geometry so both markers share one coordinate space.
  const geometry = useMemo(() => buildTrackGeometry(ref.points), [ref.points]);
  const refPath = useMemo(() => (geometry ? geometry.pts : []), [geometry]);
  const curPath = useMemo(
    () => (geometry ? projectPoints(cur.points, geometry) : []),
    [cur.points, geometry]
  );
  // Memoized so 60fps elapsed updates don't re-render ~2000 line segments.
  const outline = useMemo(
    () => (geometry ? <TrackOutline geometry={geometry} /> : null),
    [geometry]
  );

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const speedRef = useRef(1);

  useEffect(() => {
    if (!playing || maxDur <= 0) return;
    let raf = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      if (last !== null) {
        const next = Math.min(elapsedRef.current + (now - last) * speedRef.current, maxDur);
        elapsedRef.current = next;
        setElapsed(next);
        if (next >= maxDur) {
          setPlaying(false);
          return;
        }
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, maxDur]);

  const reset = () => {
    elapsedRef.current = 0;
    setElapsed(0);
  };
  const togglePlay = () => {
    if (!playing && elapsedRef.current >= maxDur) reset();
    setPlaying((p) => !p);
  };
  const restart = () => {
    reset();
    setPlaying(true);
  };
  const changeSpeed = (s: number) => {
    speedRef.current = s;
    setSpeed(s);
  };
  const selectCurLap = (n: number) => {
    setPlaying(false);
    reset();
    setCurLap(n);
  };
  const selectRefLap = (n: number) => {
    setPlaying(false);
    reset();
    setRefLap(n);
  };

  const refPos = posAlong(refPath, refTime, elapsed);
  const curPos = posAlong(curPath, curTime, elapsed);

  // Gap at the reference car's current track position: how far ahead/behind
  // the current lap is in time terms, growing linearly to the final delta.
  const refFraction = refTime > 0 ? Math.min(elapsed / refTime, 1) : 0;
  const gapSec = (refFraction * (curTime - refTime)) / 1000;

  const loading = ref.loading || cur.loading;
  const error = ref.error ?? cur.error;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Ghost className="h-4 w-4 text-primary" />
          Ghost Replay
        </CardTitle>
        <CardDescription>Animated lap vs reference, in adjustable real time</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <LapPicker label="Lap" value={curLap} laps={laps} onPick={selectCurLap} color={COLOR_CURRENT} />
          <LapPicker label="Ref" value={refLap} laps={laps} onPick={selectRefLap} color={COLOR_REFERENCE} />
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex h-72 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading ghost laps…
          </div>
        ) : !geometry ? (
          !error && (
            <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
              No position data for these laps.
            </div>
          )
        ) : (
          <>
            <svg
              viewBox={`0 0 ${VIEW} ${VIEW}`}
              className="h-72 w-full"
              role="img"
              aria-label="Ghost replay of two laps"
            >
              {outline}
              {refPos && (
                <circle
                  cx={refPos.x}
                  cy={refPos.y}
                  r={2.2}
                  fill={COLOR_REFERENCE}
                  fillOpacity={0.55}
                  stroke={COLOR_REFERENCE}
                  strokeWidth={0.6}
                />
              )}
              {curPos && (
                <circle
                  cx={curPos.x}
                  cy={curPos.y}
                  r={2}
                  fill={COLOR_CURRENT}
                  stroke="#09090b"
                  strokeWidth={0.5}
                />
              )}
            </svg>

            {/* Transport controls */}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="icon-sm" variant="outline" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
                {playing ? <Pause /> : <Play />}
              </Button>
              <Button size="icon-sm" variant="outline" onClick={restart} aria-label="Restart">
                <RotateCcw />
              </Button>
              <div className="flex items-center gap-1">
                {SPEEDS.map((s) => (
                  <Button
                    key={s}
                    size="xs"
                    variant={speed === s ? "default" : "outline"}
                    className={speed === s ? "bg-primary hover:bg-primary/90" : undefined}
                    onClick={() => changeSpeed(s)}
                  >
                    {s}x
                  </Button>
                ))}
              </div>
              <span className="ml-auto font-mono text-sm tabular-nums">
                {formatElapsed(Math.min(elapsed, maxDur))}
              </span>
              <span
                className={`rounded-md px-2 py-0.5 font-mono text-xs ${
                  gapSec > 0
                    ? "bg-red-500/15 text-red-400"
                    : "bg-emerald-500/15 text-emerald-400"
                }`}
              >
                {gapSec >= 0 ? "+" : ""}
                {gapSec.toFixed(2)}s
              </span>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLOR_CURRENT }} />
                Lap {curLap} · {formatLapTime(curTime)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLOR_REFERENCE }} />
                Ghost: Lap {refLap} · {formatLapTime(refTime)}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

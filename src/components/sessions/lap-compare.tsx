"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
import { ChevronDown, GitCompareArrows, Loader2 } from "lucide-react";
import {
  LockedFeatureCard,
  useSessionPoints,
  type FullPoint,
  type LapOption,
} from "./track-map";

const COLOR_A = "#8b5cf6"; // violet
const COLOR_B = "#22d3ee"; // cyan
const SAMPLES = 101; // 0..100% of the lap
const SPEED_MARGIN_KMH = 2;

const tooltipStyle: React.CSSProperties = {
  backgroundColor: "rgba(9, 9, 11, 0.95)",
  border: "1px solid rgba(139, 92, 246, 0.35)",
  borderRadius: 8,
  fontSize: 12,
};

interface LapCompareProps {
  sessionId: string;
  laps: LapOption[];
  /** Resolved server-side via checkFeature(…, 'lap_comparison'). */
  locked: boolean;
}

export function LapCompare({ sessionId, laps, locked }: LapCompareProps) {
  if (locked) {
    return (
      <LockedFeatureCard
        title="Lap Comparison"
        description="Overlay two laps and see where time is lost"
        requiredTier="Pro"
      />
    );
  }
  if (laps.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lap Comparison</CardTitle>
          <CardDescription>Overlay two laps and see where time is lost</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="py-10 text-center text-sm text-muted-foreground">
            At least 2 completed laps are needed to compare.
          </p>
        </CardContent>
      </Card>
    );
  }
  return <LapCompareInner sessionId={sessionId} laps={laps} />;
}

/** Linear resample of speed (km/h) onto a fixed 0–100% grid. */
function resampleSpeeds(points: FullPoint[], n: number): number[] | null {
  if (points.length < 2) return null;
  const speeds = points.map((p) => (p.speed_ms ?? 0) * 3.6);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1)) * (speeds.length - 1);
    const lo = Math.floor(f);
    const hi = Math.min(lo + 1, speeds.length - 1);
    const u = f - lo;
    out.push(speeds[lo] * (1 - u) + speeds[hi] * u);
  }
  return out;
}

function sectorName(midPct: number): string {
  if (midPct < 33) return "opening sector";
  if (midPct < 66) return "mid sector";
  return "final sector";
}

interface LossZone {
  start: number;
  end: number;
  lossMs: number;
  sector: string;
}

function LapCompareInner({ sessionId, laps }: { sessionId: string; laps: LapOption[] }) {
  // Defaults: best and second-best lap.
  const sorted = useMemo(
    () => [...laps].sort((a, b) => a.lap_time_ms - b.lap_time_ms),
    [laps]
  );
  const [lapA, setLapA] = useState<number>(sorted[0].lap_number);
  const [lapB, setLapB] = useState<number>(sorted[1].lap_number);

  const a = useSessionPoints(sessionId, lapA, "basic");
  const b = useSessionPoints(sessionId, lapB, "basic");

  const timeA = laps.find((l) => l.lap_number === lapA)?.lap_time_ms ?? 0;
  const timeB = laps.find((l) => l.lap_number === lapB)?.lap_time_ms ?? 0;

  const analysis = useMemo(() => {
    const speedsA = resampleSpeeds(a.points, SAMPLES);
    const speedsB = resampleSpeeds(b.points, SAMPLES);
    if (!speedsA || !speedsB) return null;

    const data = speedsA.map((v, i) => ({
      pct: i,
      a: Math.round(v * 10) / 10,
      b: Math.round(speedsB[i] * 10) / 10,
    }));
    const vmaxA = Math.max(...speedsA);
    const vmaxB = Math.max(...speedsB);

    // Where does the slower lap lose time? Find % ranges where its speed is
    // below the faster lap's by a margin, then apportion the total time delta
    // by each zone's speed-deficit integral.
    const slowerIsB = timeB >= timeA;
    const fast = slowerIsB ? speedsA : speedsB;
    const slow = slowerIsB ? speedsB : speedsA;
    const deficit = fast.map((v, i) => Math.max(0, v - slow[i] - SPEED_MARGIN_KMH));

    const rawZones: { start: number; end: number; weight: number }[] = [];
    let cur: { start: number; end: number; weight: number } | null = null;
    let gap = 0;
    for (let i = 0; i < SAMPLES; i++) {
      if (deficit[i] > 0) {
        if (!cur) cur = { start: i, end: i, weight: 0 };
        cur.end = i;
        cur.weight += deficit[i];
        gap = 0;
      } else if (cur) {
        gap += 1;
        if (gap > 3) {
          rawZones.push(cur);
          cur = null;
        }
      }
    }
    if (cur) rawZones.push(cur);

    const significant = rawZones.filter((z) => z.end - z.start >= 2);
    const totalWeight = significant.reduce((s, z) => s + z.weight, 0);
    const totalDelta = Math.abs(timeB - timeA);
    const zones: LossZone[] = significant
      .sort((x, y) => y.weight - x.weight)
      .slice(0, 3)
      .map((z) => ({
        start: z.start,
        end: z.end,
        lossMs: totalWeight > 0 ? (totalDelta * z.weight) / totalWeight : 0,
        sector: sectorName((z.start + z.end) / 2),
      }));

    return { data, vmaxA, vmaxB, zones, slowerIsB, totalDelta };
  }, [a.points, b.points, timeA, timeB]);

  const loading = a.loading || b.loading;
  const error = a.error ?? b.error;

  const lapPicker = (value: number, onPick: (lap: number) => void, color: string) => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        Lap {value}
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

  const slowerLabel = analysis?.slowerIsB ? `Lap ${lapB}` : `Lap ${lapA}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GitCompareArrows className="h-4 w-4 text-primary" />
          Lap Comparison
        </CardTitle>
        <CardDescription>Speed overlay across the lap (% distance)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {lapPicker(lapA, setLapA, COLOR_A)}
          <span className="text-xs text-muted-foreground">vs</span>
          {lapPicker(lapB, setLapB, COLOR_B)}
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex h-56 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading laps…
          </div>
        ) : !analysis ? (
          !error && (
            <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
              Not enough telemetry for these laps.
            </div>
          )
        ) : (
          <>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analysis.data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="pct"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${v}%`}
                    interval={24}
                    axisLine={false}
                  />
                  <YAxis tick={{ fontSize: 11 }} width={48} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(v) => `${v}% of lap`}
                    formatter={(value, name) => [
                      `${value} km/h`,
                      name === "a" ? `Lap ${lapA}` : `Lap ${lapB}`,
                    ]}
                  />
                  <Legend
                    formatter={(value) => (value === "a" ? `Lap ${lapA}` : `Lap ${lapB}`)}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="a"
                    stroke={COLOR_A}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="b"
                    stroke={COLOR_B}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Delta panel */}
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">Delta</p>
                <p className="font-mono font-medium text-red-400">
                  +{(analysis.totalDelta / 1000).toFixed(3)}s
                </p>
                <p className="text-xs text-muted-foreground">{slowerLabel} slower</p>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">Lap {lapA}</p>
                <p className="font-mono font-medium" style={{ color: COLOR_A }}>
                  {formatLapTime(timeA)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Vmax {Math.round(analysis.vmaxA)} km/h
                </p>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">Lap {lapB}</p>
                <p className="font-mono font-medium" style={{ color: COLOR_B }}>
                  {formatLapTime(timeB)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Vmax {Math.round(analysis.vmaxB)} km/h
                </p>
              </div>
            </div>

            {analysis.totalDelta > 0 && analysis.zones.length > 0 && (
              <div className="rounded-lg border border-border px-3 py-2 text-sm">
                <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Where {slowerLabel} loses time
                </p>
                <ul className="space-y-0.5">
                  {analysis.zones.map((z) => (
                    <li key={`${z.start}-${z.end}`} className="text-muted-foreground">
                      Loses{" "}
                      <span className="font-mono text-red-400">
                        ~{(z.lossMs / 1000).toFixed(2)}s
                      </span>{" "}
                      in the {z.sector} ({z.start}–{z.end}% of the lap)
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

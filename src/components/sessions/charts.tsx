"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatLapTime } from "@/shared/telemetry";
import { ChevronDown, Loader2 } from "lucide-react";

interface LapOption {
  lap_number: number;
  lap_time_ms: number;
}

interface SessionChartsProps {
  sessionId: string;
  laps: LapOption[];
}

interface ApiPoint {
  packet_id: number;
  speed_ms: number | null;
  rpm: number | null;
  throttle: number | null;
  brake: number | null;
  gear: number | null;
  lap_number: number | null;
  pos_x: number | null;
  pos_z: number | null;
  fuel_level: number | null;
}

interface ChartPoint {
  idx: number;
  speedKmh: number;
  rpm: number;
  throttlePct: number;
  brakePct: number;
}

const tooltipStyle: React.CSSProperties = {
  backgroundColor: "rgba(9, 9, 11, 0.95)",
  border: "1px solid rgba(139, 92, 246, 0.35)",
  borderRadius: 8,
  fontSize: 12,
};

/**
 * Telemetry charts (speed / rpm / throttle+brake) fed by
 * GET /api/sessions/:id/points?fields=full with an optional lap filter.
 */
export function SessionCharts({ sessionId, laps }: SessionChartsProps) {
  const [lap, setLap] = useState<number | null>(null);
  // Loading state is derived from the request key so the effect never has to
  // call setState synchronously (react-hooks/set-state-in-effect).
  const requestKey = `${sessionId}:${lap ?? "all"}`;
  const [result, setResult] = useState<{ key: string; points: ChartPoint[] } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const qs = new URLSearchParams({ fields: "full" });
    if (lap !== null) qs.set("lap", String(lap));

    fetch(`/api/sessions/${sessionId}/points?${qs}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Failed to load points (${res.status})`);
        }
        return res.json() as Promise<{ points: ApiPoint[] }>;
      })
      .then(({ points: raw }) => {
        if (cancelled) return;
        setResult({
          key: requestKey,
          points: raw.map((p, idx) => ({
            idx,
            speedKmh: Math.round((p.speed_ms ?? 0) * 3.6 * 10) / 10,
            rpm: Math.round(p.rpm ?? 0),
            throttlePct: Math.round(((p.throttle ?? 0) / 255) * 1000) / 10,
            brakePct: Math.round(((p.brake ?? 0) / 255) * 1000) / 10,
          })),
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setFailure({
          key: requestKey,
          message: e instanceof Error ? e.message : "Failed to load telemetry",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, lap, requestKey]);

  const points = result?.key === requestKey ? result.points : [];
  const error = failure?.key === requestKey ? failure.message : null;
  const loading = result?.key !== requestKey && failure?.key !== requestKey;

  const selectedLap = lap !== null ? laps.find((l) => l.lap_number === lap) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Telemetry</h2>
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
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading telemetry…
        </div>
      ) : points.length === 0 && !error ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-card text-sm text-muted-foreground">
          No telemetry points for this selection.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Speed</CardTitle>
              <CardDescription>km/h over the selected stint</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <defs>
                      <linearGradient id="speedFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="idx" tick={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} unit="" width={48} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={() => ""}
                      formatter={(value) => [`${value} km/h`, "Speed"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="speedKmh"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      fill="url(#speedFill)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">RPM</CardTitle>
              <CardDescription>Engine speed</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="idx" tick={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} width={56} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={() => ""}
                      formatter={(value) => [`${value} rpm`, "RPM"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="rpm"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Throttle & Brake</CardTitle>
              <CardDescription>Pedal inputs (%)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="idx" tick={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} width={40} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={() => ""}
                      formatter={(value, name) => [
                        `${value}%`,
                        name === "throttlePct" ? "Throttle" : "Brake",
                      ]}
                    />
                    <Legend
                      formatter={(value) => (value === "throttlePct" ? "Throttle" : "Brake")}
                      wrapperStyle={{ fontSize: 12 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="throttlePct"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="brakePct"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

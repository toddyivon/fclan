"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { formatLapTime } from "@/shared/telemetry";
import { Activity } from "lucide-react";
import { LockedFeatureCard, type LapOption } from "./track-map";

const tooltipStyle: React.CSSProperties = {
  backgroundColor: "rgba(9, 9, 11, 0.95)",
  border: "1px solid rgba(139, 92, 246, 0.35)",
  borderRadius: 8,
  fontSize: 12,
};

interface ConsistencyCardProps {
  laps: LapOption[];
  /** Pro feature — resolved server-side (lap_comparison gate). */
  locked: boolean;
}

export function ConsistencyCard({ laps, locked }: ConsistencyCardProps) {
  if (locked) {
    return (
      <LockedFeatureCard
        title="Consistency"
        description="Lap-time spread and consistency score"
        requiredTier="Pro"
      />
    );
  }

  const valid = laps.filter((l) => l.lap_time_ms > 0);
  if (valid.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Consistency</CardTitle>
          <CardDescription>Lap-time spread and consistency score</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="py-10 text-center text-sm text-muted-foreground">
            At least 2 completed laps are needed to measure consistency.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Median, then drop outliers slower than 130% of it (out-laps, spins…).
  const sortedTimes = valid.map((l) => l.lap_time_ms).sort((a, b) => a - b);
  const mid = Math.floor(sortedTimes.length / 2);
  const median =
    sortedTimes.length % 2 === 0
      ? (sortedTimes[mid - 1] + sortedTimes[mid]) / 2
      : sortedTimes[mid];
  const kept = valid.filter((l) => l.lap_time_ms <= median * 1.3);
  const excluded = valid.length - kept.length;

  const mean = kept.reduce((s, l) => s + l.lap_time_ms, 0) / kept.length;
  const variance =
    kept.reduce((s, l) => s + (l.lap_time_ms - mean) * (l.lap_time_ms - mean), 0) /
    kept.length;
  const stddev = Math.sqrt(variance);
  const consistency = mean > 0 ? Math.max(0, 1 - stddev / mean) * 100 : 0;
  const best = Math.min(...kept.map((l) => l.lap_time_ms));

  const data = kept.map((l) => ({ lap: l.lap_number, time: l.lap_time_ms }));
  const minT = Math.min(...data.map((d) => d.time));
  const maxT = Math.max(...data.map((d) => d.time));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-violet-400" />
          Consistency
        </CardTitle>
        <CardDescription>
          Lap-time spread across {kept.length} lap{kept.length === 1 ? "" : "s"}
          {excluded > 0 &&
            ` (${excluded} outlier lap${excluded === 1 ? "" : "s"} excluded)`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 px-3 py-2">
            <p className="text-xs text-muted-foreground">Consistency</p>
            <p className="font-mono font-medium text-violet-400">
              {consistency.toFixed(1)}%
            </p>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <p className="text-xs text-muted-foreground">Avg lap</p>
            <p className="font-mono font-medium">{formatLapTime(Math.round(mean))}</p>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <p className="text-xs text-muted-foreground">Std dev</p>
            <p className="font-mono font-medium">±{(stddev / 1000).toFixed(3)}s</p>
          </div>
        </div>

        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="lap" tick={{ fontSize: 11 }} axisLine={false} />
              <YAxis
                tick={{ fontSize: 11 }}
                width={56}
                domain={[Math.floor(minT * 0.97), Math.ceil(maxT * 1.01)]}
                tickFormatter={(v) => `${Math.round(Number(v) / 1000)}s`}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: "rgba(139, 92, 246, 0.08)" }}
                labelFormatter={(v) => `Lap ${v}`}
                formatter={(value) => [formatLapTime(Number(value)), "Time"]}
              />
              <Bar dataKey="time" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {data.map((d) => (
                  <Cell
                    key={d.lap}
                    fill={d.time === best ? "#8b5cf6" : "rgba(139, 92, 246, 0.3)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <p className="text-xs text-muted-foreground">
          Best lap <span className="font-mono text-violet-400">{formatLapTime(best)}</span>{" "}
          highlighted. Consistency = 1 − (std dev ÷ avg lap time).
        </p>
      </CardContent>
    </Card>
  );
}

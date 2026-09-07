"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
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
import { Fuel, Loader2 } from "lucide-react";
import { LockedFeatureCard, useSessionPoints, type LapOption } from "./track-map";

const FUEL_COLOR = "#f59e0b"; // amber

const tooltipStyle: React.CSSProperties = {
  backgroundColor: "rgba(9, 9, 11, 0.95)",
  border: "1px solid rgba(139, 92, 246, 0.35)",
  borderRadius: 8,
  fontSize: 12,
};

interface FuelStrategyProps {
  sessionId: string;
  laps: LapOption[];
  /** Resolved server-side via checkFeature(…, 'fuel_strategy'). */
  locked: boolean;
}

export function FuelStrategy({ sessionId, laps, locked }: FuelStrategyProps) {
  if (locked) {
    return (
      <LockedFeatureCard
        title="Fuel Strategy"
        description="Per-lap consumption, range and pit-window prediction"
        requiredTier="AI Premium"
      />
    );
  }
  return <FuelStrategyInner sessionId={sessionId} laps={laps} />;
}

interface FuelAnalysis {
  noData: boolean;
  chart: { idx: number; fuel: number; lap: number | null }[];
  avgPerLap: number | null;
  lastFuel: number;
  lapsRemaining: number | null;
  pitLap: number | null;
  lapsMeasured: number;
}

function FuelStrategyInner({ sessionId, laps }: { sessionId: string; laps: LapOption[] }) {
  // Whole-session points (no lap filter) so consumption spans every lap.
  const { points, loading, error } = useSessionPoints(sessionId, null, "full");

  const analysis = useMemo<FuelAnalysis | null>(() => {
    const fuelPts = points.filter((p) => p.fuel_level != null);
    if (fuelPts.length === 0) return points.length > 0 ? emptyAnalysis() : null;

    // fuel_capacity = 0 (EV) shows up as fuel_level stuck at/below zero.
    const maxFuel = Math.max(...fuelPts.map((p) => p.fuel_level as number));
    if (maxFuel <= 0) return emptyAnalysis();

    const chart = fuelPts.map((p, idx) => ({
      idx,
      fuel: Math.round((p.fuel_level as number) * 100) / 100,
      lap: p.lap_number,
    }));

    // Consumption per lap = fuel at the lap's first sample minus its last.
    const completed = new Set(laps.map((l) => l.lap_number));
    const byLap = new Map<number, { first: number; last: number }>();
    for (const p of fuelPts) {
      if (p.lap_number == null || p.lap_number < 1) continue;
      const entry = byLap.get(p.lap_number);
      if (!entry) {
        byLap.set(p.lap_number, {
          first: p.fuel_level as number,
          last: p.fuel_level as number,
        });
      } else {
        entry.last = p.fuel_level as number;
      }
    }
    const perLap = [...byLap.entries()]
      .filter(([lap]) => completed.size === 0 || completed.has(lap))
      .map(([, v]) => v.first - v.last)
      // Negative usage means a refuel happened mid-lap — skip those laps.
      .filter((used) => used > 0);

    const avgPerLap =
      perLap.length > 0 ? perLap.reduce((s, u) => s + u, 0) / perLap.length : null;
    const lastFuel = fuelPts[fuelPts.length - 1].fuel_level as number;
    const lapsRemaining = avgPerLap && avgPerLap > 0 ? lastFuel / avgPerLap : null;
    const currentLap = Math.max(0, ...fuelPts.map((p) => p.lap_number ?? 0));
    const pitLap = lapsRemaining != null ? currentLap + Math.floor(lapsRemaining) : null;

    return {
      noData: false,
      chart,
      avgPerLap,
      lastFuel,
      lapsRemaining,
      pitLap,
      lapsMeasured: perLap.length,
    };
  }, [points, laps]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Fuel className="h-4 w-4 text-primary" />
          Fuel Strategy
        </CardTitle>
        <CardDescription>Consumption, range and pit-window prediction</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex h-56 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading fuel data…
          </div>
        ) : !analysis || analysis.noData ? (
          !error && (
            <div className="flex h-56 flex-col items-center justify-center gap-2 text-center">
              <Fuel className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No fuel data — this car doesn&apos;t report fuel usage (EV or no telemetry).
              </p>
            </div>
          )
        ) : (
          <>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={analysis.chart}
                  margin={{ top: 4, right: 8, bottom: 0, left: -16 }}
                >
                  <defs>
                    <linearGradient id="fuelFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={FUEL_COLOR} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={FUEL_COLOR} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="idx" tick={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} width={48} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={() => ""}
                    formatter={(value) => [`${value} L`, "Fuel"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="fuel"
                    stroke={FUEL_COLOR}
                    strokeWidth={2}
                    fill="url(#fuelFill)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
              <div className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">Avg / lap</p>
                <p className="font-mono font-medium">
                  {analysis.avgPerLap != null ? `${analysis.avgPerLap.toFixed(2)} L` : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">Fuel left</p>
                <p className="font-mono font-medium">{analysis.lastFuel.toFixed(1)} L</p>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">Laps left</p>
                <p className="font-mono font-medium">
                  {analysis.lapsRemaining != null
                    ? `~${analysis.lapsRemaining.toFixed(1)}`
                    : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                <p className="text-xs text-muted-foreground">Pit window</p>
                <p className="font-mono font-medium text-primary">
                  {analysis.pitLap != null ? `lap ~${analysis.pitLap}` : "—"}
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {analysis.lapsMeasured > 0
                ? `Based on ${analysis.lapsMeasured} measured lap${
                    analysis.lapsMeasured === 1 ? "" : "s"
                  } at the current burn rate.`
                : "Not enough completed laps to estimate consumption."}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function emptyAnalysis(): FuelAnalysis {
  return {
    noData: true,
    chart: [],
    avgPerLap: null,
    lastFuel: 0,
    lapsRemaining: null,
    pitLap: null,
    lapsMeasured: 0,
  };
}

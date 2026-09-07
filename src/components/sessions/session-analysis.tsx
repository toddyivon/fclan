"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Flag, Fuel, Gauge, TrendingUp, Wrench } from "lucide-react";
import { LockedFeatureCard } from "./track-map";
import type { AnalysisBundle } from "@/lib/analysis/bundle";
import { getCornerRatingColor } from "@/lib/analysis/pro/cornerDetector";

interface SessionAnalysisProps {
  sessionId: string;
  /** Resolved server-side via checkFeature(…, 'lap_comparison'). */
  locked: boolean;
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; bundle: AnalysisBundle };

/**
 * Advanced analysis surface — the live UI for every harvested engine:
 * corner detection + ratings, brake zones, fuel strategy + map picker,
 * best-vs-last delta, consistency score. Fetches the server-computed
 * /api/sessions/[id]/analysis bundle once per session.
 */
export function SessionAnalysis({ sessionId, locked }: SessionAnalysisProps) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (locked) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/analysis`);
        if (!res.ok) throw new Error(`analysis failed (${res.status})`);
        const bundle = (await res.json()) as AnalysisBundle;
        if (!cancelled) setState({ status: "ready", bundle });
      } catch (e) {
        if (!cancelled) setState({ status: "error", message: e instanceof Error ? e.message : "failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, locked]);

  if (locked) {
    return (
      <LockedFeatureCard
        title="Advanced Analysis"
        description="Corner ratings, brake zones, fuel strategy & delta breakdown"
        requiredTier="Pro"
      />
    );
  }

  if (state.status === "loading") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Advanced Analysis</CardTitle>
          <CardDescription>Crunching your telemetry…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-24 animate-pulse rounded-lg bg-muted/50" aria-label="Loading analysis" />
        </CardContent>
      </Card>
    );
  }

  if (state.status === "error") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Advanced Analysis</CardTitle>
          <CardDescription>Couldn&apos;t compute analysis for this session.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{state.message}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setState({ status: "loading" })}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const b = state.bundle;
  const hasComparison = b.bestLapNumber != null && b.targetLapNumber != null && b.totalDeltaSec != null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4 text-primary" />
          Advanced Analysis
          {b.median && (
            <span className="text-xs font-normal text-muted-foreground">{b.median.title}</span>
          )}
        </CardTitle>
        <CardDescription>
          {hasComparison
            ? `Lap ${b.targetLapNumber} vs best (lap ${b.bestLapNumber})`
            : "Corner ratings, brake zones & fuel strategy for your best lap"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {hasComparison && (
          <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-sm">
            <Badge variant={b.totalDeltaSec! > 0 ? "destructive" : "default"}>
              {b.totalDeltaSec! > 0 ? "+" : ""}
              {b.totalDeltaSec!.toFixed(3)}s
            </Badge>
            <span className="text-muted-foreground">
              {b.sectorBreakdown
                .map((s) => `S${s.sector} ${s.delta >= 0 ? "+" : ""}${(s.delta / 1000).toFixed(3)}`)
                .join(" · ")}
            </span>
          </div>
        )}

        {b.corners.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <Flag className="h-4 w-4 text-primary" /> Corners ({b.corners.length})
            </p>
            <ul className="space-y-1.5">
              {b.corners.slice(0, 6).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">
                    T{c.id} · apex {Math.round(c.apexSpeed)} km/h · exit {Math.round(c.exitSpeed)} km/h
                  </span>
                  <span className={`font-medium ${getCornerRatingColor(c.rating)}`}>{c.rating}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {b.brakeZones.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">Brake zones ({b.brakeZones.length})</p>
            <ul className="space-y-1.5">
              {b.brakeZones.slice(0, 4).map((z) => (
                <li key={z.id} className="flex items-center justify-between gap-2 font-mono text-xs tabular-nums">
                  <span className="text-muted-foreground">
                    {Math.round(z.startSpeed)} → {Math.round(z.endSpeed)} km/h
                  </span>
                  <span>
                    {z.trailBrakingDetected ? (
                      <Badge variant="secondary">trail braking</Badge>
                    ) : (
                      <span className="text-muted-foreground">max {Math.round(z.maxBrakePressure)}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <Fuel className="h-4 w-4 text-primary" /> Fuel strategy
          </p>
          <p className="text-sm text-muted-foreground">
            ~{b.fuel.avgConsumptionPerLap.toFixed(1)} units/lap ·{" "}
            {Number.isFinite(b.fuel.estimatedLapsRemaining)
              ? `${Math.floor(b.fuel.estimatedLapsRemaining)} laps left`
              : "unlimited"} ·{" "}
            <span className="font-medium text-foreground">{b.fuel.fuelMapRecommendation} map</span>
            {b.fuel.pitStops.length > 0 && (
              <> · pit: lap {b.fuel.pitStops.map((p) => p.lap).join(", ")}</>
            )}
          </p>
          {b.fuel.recommendations.slice(0, 2).map((r, i) => (
            <p key={i} className="mt-1 text-xs text-muted-foreground">
              {r}
            </p>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4 text-sm">
          <span className="flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-primary" />
            Consistency{" "}
            <span className="font-mono tabular-nums font-medium">
              {Math.round(b.consistency.score * 100)}%
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Wrench className="h-4 w-4" />
            {b.comparisonInsights[0] ?? "Run more laps to unlock comparison insights."}
          </span>
        </div>

        <Link href="/analysis" className="text-xs text-primary hover:underline">
          Open full AI analysis →
        </Link>
      </CardContent>
    </Card>
  );
}

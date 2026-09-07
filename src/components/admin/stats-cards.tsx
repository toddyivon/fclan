"use client";

import { useEffect, useState } from "react";
import { Activity, Brain, CreditCard, Database, Server, Users } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AdminStats {
  users: { total: number; by_tier: { free: number; pro: number; ai_premium: number } };
  sessions: { total: number; last_7d: number };
  points: { total: number };
  analyses: { last_30d: number };
  subscriptions: { active: number };
}

const numberFormat = new Intl.NumberFormat("en-US");

function fmt(n: number | undefined): string {
  return n === undefined ? "—" : numberFormat.format(n);
}

export function StatsCards() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/stats")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load stats (${res.status})`);
        return res.json() as Promise<AdminStats>;
      })
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load stats");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Total Users</CardDescription>
          <CardTitle className="text-3xl flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {fmt(stats?.users.total)}
          </CardTitle>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <span className="text-zinc-400">{fmt(stats?.users.by_tier.free)} free</span>
            <span className="text-primary">{fmt(stats?.users.by_tier.pro)} pro</span>
            <span className="text-fuchsia-400">{fmt(stats?.users.by_tier.ai_premium)} ai premium</span>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Sessions</CardDescription>
          <CardTitle className="text-3xl flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            {fmt(stats?.sessions.total)}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {fmt(stats?.sessions.last_7d)} in the last 7 days
          </p>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Telemetry Points</CardDescription>
          <CardTitle className="text-3xl flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            {fmt(stats?.points.total)}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">total stored</p>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>AI Analyses</CardDescription>
          <CardTitle className="text-3xl flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            {fmt(stats?.analyses.last_30d)}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">last 30 days</p>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Active Subscriptions</CardDescription>
          <CardTitle className="text-3xl flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            {fmt(stats?.subscriptions.active)}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
            <Activity className="h-3 w-3" /> Stripe status: active
          </p>
        </CardHeader>
      </Card>
    </div>
  );
}

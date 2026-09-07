"use client";

import Link from "next/link";
import { Brain, ChevronRight, Lock, Sparkles, Timer, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const PERKS = [
  { icon: Brain, text: "50 AI lap analyses per month on Pro — unlimited on AI Premium" },
  { icon: Timer, text: "Lap-by-lap breakdowns: braking zones, throttle traces, gear usage" },
  { icon: Zap, text: "Concrete coaching grounded in your real telemetry numbers" },
];

export function UpgradeCard() {
  return (
    <Card className="relative overflow-hidden border-violet-500/30 ring-violet-500/30">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-600/15 via-transparent to-fuchsia-600/10" />
      <CardContent className="relative py-6">
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-600/20 ring-1 ring-violet-500/40">
            <Lock className="h-6 w-6 text-violet-400" />
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                Unlock AI Race Coaching
                <Sparkles className="h-4 w-4 text-violet-400" />
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                AI lap analysis is available on Pro and AI Premium plans.
              </p>
            </div>
            <ul className="space-y-1.5">
              {PERKS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <Link href="/settings" className="shrink-0">
            <Button className="bg-violet-600 hover:bg-violet-500">
              Upgrade plan <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

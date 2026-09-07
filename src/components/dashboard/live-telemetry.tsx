"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Fuel, KeyRound, Radio, Smartphone } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { formatLapTime } from "@/shared/telemetry";

export interface LiveSessionInfo {
  id: string;
  car_name: string | null;
  track_name: string | null;
}

interface LivePoint {
  packet_id: number;
  speed_ms: number | null;
  rpm: number | null;
  throttle: number | null;
  brake: number | null;
  gear: number | null;
  suggested_gear: number | null;
  fuel_level: number | null;
  fuel_capacity: number | null;
  tire_temp_fl: number | null;
  tire_temp_fr: number | null;
  tire_temp_rl: number | null;
  tire_temp_rr: number | null;
  lap_number: number | null;
}

interface SessionRowPayload {
  id: string;
  user_id: string;
  car_name: string | null;
  track_name: string | null;
  ended_at: string | null;
  current_lap: number | null;
  last_lap_ms: number | null;
  best_lap_ms: number | null;
}

interface LapState {
  currentLap: number | null;
  lastLapMs: number | null;
  bestLapMs: number | null;
}

type ConnStatus = "connecting" | "live" | "reconnecting";

const WAITING_THRESHOLD_MS = 5_000;
const RPM_FLOOR = 8_000;

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function pedalPct(raw: number | null | undefined): number {
  return clampPct(((raw ?? 0) / 255) * 100);
}

function gearLabel(gear: number | null | undefined): string {
  if (gear == null || gear < 0) return "N";
  if (gear === 0) return "R";
  return String(gear);
}

function tireColor(temp: number): string {
  if (temp < 60) return "bg-sky-500/80 ring-sky-400/50";
  if (temp <= 90) return "bg-emerald-500/80 ring-emerald-400/50";
  if (temp <= 110) return "bg-amber-500/80 ring-amber-400/50";
  return "bg-red-500/80 ring-red-400/50";
}

export function LiveTelemetry({
  userId,
  initialSession,
}: {
  userId: string;
  initialSession: LiveSessionInfo | null;
}) {
  const [session, setSession] = useState<LiveSessionInfo | null>(initialSession);
  const [point, setPoint] = useState<LivePoint | null>(null);
  const [lapState, setLapState] = useState<LapState>({
    currentLap: null,
    lastLapMs: null,
    bestLapMs: null,
  });
  // Keyed by session id so a session switch derives back to "connecting"
  // without a synchronous setState in the subscription effect.
  const [conn, setConn] = useState<{ id: string | null; status: ConnStatus }>({
    id: null,
    status: "connecting",
  });
  const [waiting, setWaiting] = useState(false);
  // Rev-bar scale: grows when the car revs past the floor, resets per session.
  const [maxRpm, setMaxRpm] = useState(RPM_FLOOR);

  const sessionIdRef = useRef<string | null>(initialSession?.id ?? null);
  // 0 = no packet seen yet; the subscription effects stamp it before the
  // watchdog can read it (both are keyed on the same sessionId).
  const lastPacketRef = useRef<number>(0);

  // Watch the user's sessions: adopt a freshly opened session, follow lap
  // state on updates, and drop the panel when the session is closed.
  useEffect(() => {
    const supabase = createClient();

    const adopt = (row: SessionRowPayload) => {
      sessionIdRef.current = row.id;
      lastPacketRef.current = Date.now();
      setMaxRpm(RPM_FLOOR);
      setPoint(null);
      setWaiting(false);
      setLapState({
        currentLap: row.current_lap,
        lastLapMs: row.last_lap_ms,
        bestLapMs: row.best_lap_ms,
      });
      setSession({ id: row.id, car_name: row.car_name, track_name: row.track_name });
    };

    const channel = supabase
      .channel(`session-watch:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "telemetry_sessions",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as SessionRowPayload;
          if (!row.ended_at) adopt(row);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "telemetry_sessions",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as SessionRowPayload;
          if (row.id === sessionIdRef.current) {
            if (row.ended_at) {
              sessionIdRef.current = null;
              setSession(null);
              setPoint(null);
            } else {
              setLapState({
                currentLap: row.current_lap,
                lastLapMs: row.last_lap_ms,
                bestLapMs: row.best_lap_ms,
              });
              setSession((cur) =>
                cur && cur.id === row.id
                  ? { id: row.id, car_name: row.car_name, track_name: row.track_name }
                  : cur
              );
            }
          } else if (!sessionIdRef.current && !row.ended_at) {
            adopt(row);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Live packets for the active session. Inserts can land in batches — keep
  // only the newest packet (highest packet_id).
  const sessionId = session?.id ?? null;
  useEffect(() => {
    if (!sessionId) return;
    const supabase = createClient();
    lastPacketRef.current = Date.now();

    const channel = supabase
      .channel(`live:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "telemetry_points",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as LivePoint;
          lastPacketRef.current = Date.now();
          if (row.rpm != null) {
            const rpm = row.rpm;
            setMaxRpm((prev) => (rpm > prev ? rpm : prev));
          }
          setWaiting(false);
          setPoint((prev) => {
            if (!prev) return row;
            // Accept newer packets, but also accept a large backwards jump:
            // relaunching GT7 resets packet_id, and dropping those packets
            // would freeze the panel forever.
            if (row.packet_id > prev.packet_id || prev.packet_id - row.packet_id > 1000) {
              return row;
            }
            return prev;
          });
        }
      )
      .subscribe((status) => {
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          lastPacketRef.current = Date.now();
          setConn({ id: sessionId, status: "live" });
        } else {
          setConn({ id: sessionId, status: "reconnecting" });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // Watchdog: flag "waiting for data" when subscribed but silent for 5s.
  useEffect(() => {
    if (!sessionId) return;
    const timer = setInterval(() => {
      setWaiting(Date.now() - lastPacketRef.current > WAITING_THRESHOLD_MS);
    }, 1_000);
    return () => clearInterval(timer);
  }, [sessionId]);

  if (!session) return <SetupCard />;

  const connStatus: ConnStatus = conn.id === session.id ? conn.status : "connecting";
  const speedKmh = Math.round((point?.speed_ms ?? 0) * 3.6);
  const rpm = Math.round(point?.rpm ?? 0);
  const rpmPct = clampPct((rpm / maxRpm) * 100);
  const throttlePct = pedalPct(point?.throttle);
  const brakePct = pedalPct(point?.brake);
  const gear = point?.gear ?? null;
  const suggested = point?.suggested_gear ?? null;
  const showSuggested =
    suggested != null && suggested > 0 && suggested < 15 && suggested !== gear;
  const fuelPct =
    point?.fuel_level != null && point?.fuel_capacity != null && point.fuel_capacity > 0
      ? clampPct((point.fuel_level / point.fuel_capacity) * 100)
      : null;
  const tires =
    point &&
    [point.tire_temp_fl, point.tire_temp_fr, point.tire_temp_rl, point.tire_temp_rr].some(
      (t) => t != null
    )
      ? ([
          ["FL", point.tire_temp_fl],
          ["FR", point.tire_temp_fr],
          ["RL", point.tire_temp_rl],
          ["RR", point.tire_temp_rr],
        ] as const)
      : null;
  const currentLap = point?.lap_number ?? lapState.currentLap;

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="relative flex h-5 w-5 items-center justify-center">
            <Radio className="h-5 w-5 text-primary" />
            {connStatus === "live" && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </span>
          Live Telemetry
        </CardTitle>
        <CardDescription className="truncate">
          {session.car_name ?? "Unknown car"}
          {session.track_name ? ` · ${session.track_name}` : ""}
        </CardDescription>
        <CardAction>
          {connStatus === "live" ? (
            <Badge
              variant="outline"
              className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
            >
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </Badge>
          ) : connStatus === "connecting" ? (
            <Badge
              variant="outline"
              className="border-primary/40 bg-primary/10 text-primary"
            >
              CONNECTING
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 text-amber-400"
            >
              RECONNECTING
            </Badge>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-5">
        {waiting && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            Waiting for telemetry data…
          </div>
        )}

        {/* Speed + gear */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Speed</p>
            <p className="font-mono text-6xl font-bold leading-none tabular-nums">
              {speedKmh}
              <span className="ml-2 text-base font-normal text-muted-foreground">km/h</span>
            </p>
          </div>
          <div className="flex items-end gap-2">
            {showSuggested && (
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Sug
                </p>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 font-mono text-xl font-bold text-primary ring-1 ring-primary/40 animate-pulse">
                  {gearLabel(suggested)}
                </div>
              </div>
            )}
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Gear</p>
              <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary font-mono text-3xl font-bold text-white shadow-lg shadow-primary/30">
                {gearLabel(gear)}
              </div>
            </div>
          </div>
        </div>

        {/* RPM */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span className="uppercase tracking-widest">RPM</span>
            <span className="font-mono tabular-nums">{rpm.toLocaleString("en-US")}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-muted/60 ring-1 ring-foreground/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary/60 via-fuchsia-500 to-red-500"
              animate={{ width: `${rpmPct}%` }}
              transition={{ duration: 0.12, ease: "linear" }}
            />
          </div>
        </div>

        {/* Pedals / laps / fuel / tires */}
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex items-end gap-3">
            <div className="flex flex-col items-center gap-1">
              <div className="flex h-20 w-4 items-end overflow-hidden rounded-full bg-muted/60 ring-1 ring-foreground/10">
                <motion.div
                  className="w-full rounded-full bg-emerald-500"
                  animate={{ height: `${throttlePct}%` }}
                  transition={{ duration: 0.12, ease: "linear" }}
                />
              </div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Thr
              </span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="flex h-20 w-4 items-end overflow-hidden rounded-full bg-muted/60 ring-1 ring-foreground/10">
                <motion.div
                  className="w-full rounded-full bg-red-500"
                  animate={{ height: `${brakePct}%` }}
                  transition={{ duration: 0.12, ease: "linear" }}
                />
              </div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Brk
              </span>
            </div>
          </div>

          <div className="space-y-1 text-sm">
            <div className="flex items-baseline gap-2">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Lap</span>
              <span className="font-mono text-xl font-bold tabular-nums">
                {currentLap != null && currentLap > 0 ? currentLap : "–"}
              </span>
            </div>
            <div className="flex items-baseline gap-2 text-muted-foreground">
              <span className="text-[10px] uppercase tracking-wider">Last</span>
              <span className="font-mono tabular-nums text-foreground">
                {formatLapTime(lapState.lastLapMs)}
              </span>
            </div>
            <div className="flex items-baseline gap-2 text-muted-foreground">
              <span className="text-[10px] uppercase tracking-wider">Best</span>
              <span className="font-mono tabular-nums text-primary">
                {formatLapTime(lapState.bestLapMs)}
              </span>
            </div>
            {fuelPct != null && (
              <div className="flex items-center gap-2 pt-1">
                <Fuel className="h-3.5 w-3.5 text-muted-foreground" />
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted/60">
                  <motion.div
                    className={`h-full rounded-full ${fuelPct <= 15 ? "bg-red-500" : "bg-primary"}`}
                    animate={{ width: `${fuelPct}%` }}
                    transition={{ duration: 0.2, ease: "linear" }}
                  />
                </div>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {Math.round(fuelPct)}%
                </span>
              </div>
            )}
          </div>

          {tires && (
            <div>
              <p className="mb-1 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
                Tires °C
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {tires.map(([label, temp]) => (
                  <div
                    key={label}
                    className={`flex h-11 w-11 flex-col items-center justify-center rounded-md ring-1 ${
                      temp != null
                        ? tireColor(temp)
                        : "bg-muted/60 ring-foreground/10"
                    }`}
                  >
                    <span className="text-[9px] font-medium uppercase leading-none text-white/80">
                      {label}
                    </span>
                    <span className="font-mono text-xs font-bold leading-tight text-white">
                      {temp != null ? Math.round(temp) : "–"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SetupCard() {
  const steps = [
    "Connect your phone to the same WiFi as your PlayStation",
    "Open the fclan app on your phone",
    "Enter your PS5 IP address and API key, then press Start",
    "Start GT7 with Simulator Interface enabled in Settings",
  ];

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" />
          Start Capturing
        </CardTitle>
        <CardDescription>
          Use your phone to capture GT7 telemetry data. Open the mobile app, enter your API key,
          and start driving — this panel goes live automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            {steps.map((step, i) => (
              <div key={step} className="flex items-start gap-2">
                <Badge
                  variant="outline"
                  className="shrink-0 border-primary/40 bg-primary/20 text-primary"
                >
                  {i + 1}
                </Badge>
                <span>{step}</span>
              </div>
            ))}
          </div>
          <Link href="/settings" className="block">
            <Button className="w-full bg-primary hover:bg-primary/90">
              <KeyRound className="mr-2 h-4 w-4" />
              Set up capture
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

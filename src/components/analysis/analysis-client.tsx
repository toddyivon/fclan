"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Brain,
  ChevronDown,
  Gauge,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatLapTime } from "@/shared/telemetry";
import { AnalysisHistory } from "./analysis-history";
import { UpgradeCard } from "./upgrade-card";

interface SessionSummary {
  id: string;
  car_name: string | null;
  track_name: string | null;
  started_at: string | null;
  best_lap_ms: number | null;
}

interface LapSummary {
  lap_number: number;
  lap_time_ms: number | null;
}

interface QuotaInfo {
  used: number;
  limit: number;
  resetAt: string | null;
  tier: string | null;
}

type ErrorState =
  | { kind: "upgrade" }
  | { kind: "quota"; resetAt: string | null }
  | { kind: "no_telemetry" }
  | { kind: "generic"; message: string };

const UNLIMITED_THRESHOLD = 100000;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Tolerates a few plausible /api/me shapes (route owned by another agent). */
function parseQuota(json: unknown): QuotaInfo | null {
  const root = asRecord(json);
  if (!root) return null;
  const q = asRecord(root.quota) ?? root;
  const used = asNumber(q.ai_analyses_used) ?? asNumber(q.used);
  const limit = asNumber(q.ai_analyses_limit) ?? asNumber(q.limit);
  if (used == null || limit == null) return null;
  const resetAt = asString(q.quota_reset_at) ?? asString(q.reset_at);
  const tier =
    asString(root.tier) ?? asString(q.tier) ?? asString(asRecord(root.user)?.tier);
  return { used, limit, resetAt, tier };
}

function parseSessions(json: unknown): SessionSummary[] {
  const root = asRecord(json);
  const list = Array.isArray(json) ? json : Array.isArray(root?.sessions) ? root.sessions : [];
  return list
    .map((s) => asRecord(s))
    .filter((s): s is Record<string, unknown> => s != null && typeof s.id === "string")
    .map((s) => ({
      id: s.id as string,
      car_name: asString(s.car_name),
      track_name: asString(s.track_name),
      started_at: asString(s.started_at),
      best_lap_ms: asNumber(s.best_lap_ms),
    }));
}

function parseLaps(json: unknown): LapSummary[] {
  const root = asRecord(json);
  const list = Array.isArray(root?.laps) ? root.laps : [];
  return list
    .map((l) => asRecord(l))
    .filter((l): l is Record<string, unknown> => l != null && asNumber(l.lap_number) != null)
    .map((l) => ({
      lap_number: l.lap_number as number,
      lap_time_ms: asNumber(l.lap_time_ms),
    }));
}

function sessionLabel(s: SessionSummary): string {
  const car = s.car_name ?? "Unknown car";
  const track = s.track_name ?? "Unknown track";
  const date = s.started_at
    ? new Date(s.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;
  return `${car} @ ${track}${date ? ` · ${date}` : ""}`;
}

function formatResetDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

const selectClassName =
  "h-9 w-full appearance-none rounded-lg border border-input bg-background dark:bg-input/30 px-3 pr-9 text-sm outline-none transition-colors hover:dark:bg-input/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";

export function AnalysisClient() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);

  const [selectedSession, setSelectedSession] = useState("");
  const [laps, setLaps] = useState<LapSummary[]>([]);
  const [loadingLaps, setLoadingLaps] = useState(false);
  const [selectedLap, setSelectedLap] = useState<number | null>(null);

  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const [errorState, setErrorState] = useState<ErrorState | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const streamingRef = useRef(false);

  // Sessions list (route owned elsewhere — tolerate it not existing yet).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/sessions")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Sessions unavailable (${res.status})`);
        const parsed = parseSessions(await res.json());
        if (!cancelled) setSessions(parsed);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setSessionsError(e instanceof Error ? e.message : "Failed to load sessions");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSessions(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Quota / tier from /api/me (also owned elsewhere — best effort).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then(async (res) => {
        if (!res.ok) return;
        const parsed = parseQuota(await res.json());
        if (!cancelled && parsed) setQuota(parsed);
      })
      .catch(() => {
        /* quota display is best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Laps for the selected session.
  useEffect(() => {
    setLaps([]);
    setSelectedLap(null);
    if (!selectedSession) return;
    let cancelled = false;
    setLoadingLaps(true);
    fetch(`/api/sessions/${selectedSession}`)
      .then(async (res) => {
        if (!res.ok) return;
        const parsed = parseLaps(await res.json());
        if (!cancelled) setLaps(parsed);
      })
      .catch(() => {
        /* lap picker degrades to "entire session" */
      })
      .finally(() => {
        if (!cancelled) setLoadingLaps(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSession]);

  const sessionLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of sessions) map[s.id] = sessionLabel(s);
    return map;
  }, [sessions]);

  const isFreeTier = quota != null && (quota.limit === 0 || quota.tier === "free");
  const showUpsell = isFreeTier || errorState?.kind === "upgrade";

  const runAnalysis = useCallback(async () => {
    if (!selectedSession || streamingRef.current) return;
    streamingRef.current = true;
    setStreaming(true);
    setErrorState(null);
    setStreamedText("");
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: selectedSession,
          ...(selectedLap != null ? { lap_number: selectedLap } : {}),
        }),
      });

      if (!res.ok) {
        const json: unknown = await res.json().catch(() => null);
        const body = asRecord(json);
        const quotaBody = asRecord(body?.quota);
        if (quotaBody) {
          const used = asNumber(quotaBody.used);
          const limit = asNumber(quotaBody.limit);
          if (used != null && limit != null) {
            setQuota((prev) => ({
              used,
              limit,
              resetAt: asString(quotaBody.reset_at) ?? prev?.resetAt ?? null,
              tier: prev?.tier ?? null,
            }));
          }
        }
        if (res.status === 403) {
          setErrorState({ kind: "upgrade" });
        } else if (res.status === 429) {
          setErrorState({ kind: "quota", resetAt: asString(quotaBody?.reset_at) });
        } else if (res.status === 422) {
          setErrorState({ kind: "no_telemetry" });
        } else {
          setErrorState({
            kind: "generic",
            message: asString(body?.error) ?? `Analysis failed (${res.status})`,
          });
        }
        return;
      }

      const used = Number(res.headers.get("X-Quota-Used"));
      const limit = Number(res.headers.get("X-Quota-Limit"));
      const resetAt = res.headers.get("X-Quota-Reset-At");
      if (Number.isFinite(used) && Number.isFinite(limit) && res.headers.get("X-Quota-Limit")) {
        setQuota((prev) => ({
          used,
          limit,
          resetAt: resetAt || prev?.resetAt || null,
          tier: prev?.tier ?? null,
        }));
      }

      if (!res.body) {
        setErrorState({ kind: "generic", message: "No response stream received" });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) setStreamedText((prev) => prev + chunk);
      }
      const tail = decoder.decode();
      if (tail) setStreamedText((prev) => prev + tail);
      setHistoryKey((k) => k + 1);
    } catch (e) {
      setErrorState({
        kind: "generic",
        message: e instanceof Error ? e.message : "Analysis failed",
      });
    } finally {
      streamingRef.current = false;
      setStreaming(false);
    }
  }, [selectedSession, selectedLap]);

  const quotaResetLabel = formatResetDate(quota?.resetAt ?? null);

  return (
    <div className="space-y-6">
      {/* Quota meter */}
      {quota && !isFreeTier && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-2.5">
          <Gauge className="h-4 w-4 text-primary" />
          <span className="text-sm">
            AI analyses this month:{" "}
            <span className="font-semibold text-primary">
              {quota.used}
              {quota.limit < UNLIMITED_THRESHOLD ? ` / ${quota.limit}` : ""}
            </span>
            {quota.limit >= UNLIMITED_THRESHOLD && (
              <Badge variant="secondary" className="ml-2 bg-primary/15 text-primary">
                Unlimited
              </Badge>
            )}
          </span>
          {quotaResetLabel && quota.limit < UNLIMITED_THRESHOLD && (
            <span className="text-xs text-muted-foreground">Resets {quotaResetLabel}</span>
          )}
        </div>
      )}

      {showUpsell ? (
        <UpgradeCard />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              Analyze Your Laps
            </CardTitle>
            <CardDescription>
              Pick a session and lap — the AI coach reviews your real telemetry numbers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="analysis-session" className="text-sm font-medium">
                  Session
                </label>
                <div className="relative">
                  <select
                    id="analysis-session"
                    className={selectClassName}
                    value={selectedSession}
                    disabled={loadingSessions || streaming}
                    onChange={(e) => setSelectedSession(e.target.value)}
                  >
                    <option value="">
                      {loadingSessions
                        ? "Loading sessions…"
                        : sessions.length === 0
                          ? "No sessions found"
                          : "Select a session"}
                    </option>
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {sessionLabel(s)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
                {sessionsError && (
                  <p className="text-xs text-muted-foreground">{sessionsError}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="analysis-lap" className="text-sm font-medium">
                  Lap
                </label>
                <div className="relative">
                  <select
                    id="analysis-lap"
                    className={selectClassName}
                    value={selectedLap == null ? "" : String(selectedLap)}
                    disabled={!selectedSession || loadingLaps || streaming}
                    onChange={(e) =>
                      setSelectedLap(e.target.value === "" ? null : Number(e.target.value))
                    }
                  >
                    <option value="">
                      {loadingLaps ? "Loading laps…" : "Entire session"}
                    </option>
                    {laps.map((l) => (
                      <option key={l.lap_number} value={l.lap_number}>
                        {`Lap ${l.lap_number} — ${formatLapTime(l.lap_time_ms)}`}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
            </div>

            <Button
              className="bg-primary hover:bg-primary"
              disabled={!selectedSession || streaming}
              onClick={runAnalysis}
            >
              {streaming ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Analyzing…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Analyze
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Error banners */}
      {errorState?.kind === "quota" && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <p className="font-medium text-amber-300">Monthly AI quota exhausted</p>
            <p className="text-muted-foreground mt-0.5">
              {formatResetDate(errorState.resetAt) ?? quotaResetLabel
                ? `Your quota resets on ${formatResetDate(errorState.resetAt) ?? quotaResetLabel}.`
                : "Your quota resets at the start of next month."}{" "}
              Need more? Upgrade to AI Premium in settings.
            </p>
          </div>
        </div>
      )}
      {errorState?.kind === "no_telemetry" && (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            This session has no telemetry points to analyze. Capture some laps with the mobile
            app first.
          </p>
        </div>
      )}
      {errorState?.kind === "generic" && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-destructive">{errorState.message}</p>
        </div>
      )}

      {/* Streaming coach card */}
      {(streaming || streamedText) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <Card className="border-primary/20 ring-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                AI Race Coach
                <Badge variant="secondary" className="ml-1 bg-primary/15 text-primary">
                  gpt-4o-mini
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {streamedText ? (
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
                  {streamedText}
                  {streaming && (
                    <span className="ml-0.5 inline-block h-4 w-2 animate-pulse rounded-sm bg-primary align-text-bottom" />
                  )}
                </p>
              ) : (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Reviewing your telemetry…
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      <AnalysisHistory refreshKey={historyKey} sessionLabels={sessionLabels} />
    </div>
  );
}

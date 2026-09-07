"use client";

import { useEffect, useState } from "react";
import { ChevronDown, History, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface AnalysisRecord {
  id: string;
  session_id: string;
  lap_number: number | null;
  analysis_text: string | null;
  model: string | null;
  created_at: string;
}

interface AnalysisHistoryProps {
  /** Bump to refetch (e.g. after a new analysis completes). */
  refreshKey: number;
  /** Optional map of session_id -> human label for nicer headers. */
  sessionLabels?: Record<string, string>;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

interface HistoryResult {
  key: number;
  items: AnalysisRecord[] | null;
  error: string | null;
}

export function AnalysisHistory({ refreshKey, sessionLabels }: AnalysisHistoryProps) {
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Loading whenever we have no result for the current refreshKey — avoids
  // synchronous setState inside the effect.
  const loading = result == null || result.key !== refreshKey;
  const items = loading ? null : result.items;
  const error = loading ? null : result.error;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/analyses?limit=20")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load history (${res.status})`);
        const json = await res.json();
        if (!cancelled) {
          setResult({
            key: refreshKey,
            items: Array.isArray(json?.analyses) ? json.analyses : [],
            error: null,
          });
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setResult({
            key: refreshKey,
            items: null,
            error: e instanceof Error ? e.message : "Failed to load history",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          Analysis History
        </CardTitle>
        <CardDescription>Your most recent AI coaching reports.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
          </div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{error}</p>
        ) : !items || items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No analyses yet. Run your first one above.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const expanded = expandedId === item.id;
              const sessionLabel = sessionLabels?.[item.session_id] ?? `Session ${item.session_id.slice(0, 8)}`;
              return (
                <li key={item.id} className="rounded-lg border border-border/60 bg-muted/20">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : item.id)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 rounded-lg"
                    aria-expanded={expanded}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">{sessionLabel}</span>
                        <Badge variant="secondary" className="bg-primary/15 text-primary">
                          {item.lap_number != null && item.lap_number >= 0
                            ? `Lap ${item.lap_number}`
                            : "Full session"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDate(item.created_at)}
                        {item.model ? ` · ${item.model}` : ""}
                      </p>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        expanded && "rotate-180"
                      )}
                    />
                  </button>
                  {expanded && (
                    <div className="border-t border-border/60 px-3 py-3">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
                        {item.analysis_text || "No text saved for this analysis."}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

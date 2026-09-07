import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isLiveSession, listSessions } from "@/components/sessions/query";
import { SessionFilters } from "@/components/sessions/session-filters";
import { DeleteSessionButton } from "@/components/sessions/delete-session-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatLapTime } from "@/shared/telemetry";
import { Car, ChevronLeft, ChevronRight, Smartphone, Sparkles } from "lucide-react";

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 30) return rtf.format(-days, "day");
  const months = Math.round(days / 30);
  return rtf.format(-months, "month");
}

function pageHref(page: number, track?: string, car?: string): string {
  const params = new URLSearchParams();
  if (track) params.set("track", track);
  if (car) params.set("car", car);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/sessions?${qs}` : "/sessions";
}

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const track = typeof sp.track === "string" ? sp.track : undefined;
  const car = typeof sp.car === "string" ? sp.car : undefined;
  const requestedPage = typeof sp.page === "string" ? sp.page : undefined;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { sessions, page, limit, total, tier } = await listSessions(supabase, user.id, {
    page: requestedPage,
    track,
    car,
  });

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasFilters = Boolean(track || car);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Sessions</h1>
        <p className="text-muted-foreground mt-1">View and manage your GT7 telemetry sessions.</p>
      </div>

      {tier === "free" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
          <p className="text-sm">
            <Sparkles className="mr-2 inline h-4 w-4 text-primary" />
            Free keeps <span className="font-medium text-primary">7 days</span> of session
            history — upgrade to Pro for unlimited history, AI analysis and exports.
          </p>
          <Button size="sm" className="bg-primary hover:bg-primary" render={<Link href="/settings" />}>
            Upgrade
          </Button>
        </div>
      )}

      <SessionFilters track={track} car={car} />

      {sessions.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-20 text-center text-muted-foreground">
          <Car className="mx-auto mb-4 h-12 w-12 opacity-30" />
          {hasFilters ? (
            <>
              <p className="text-lg">No sessions match your filters</p>
              <p className="mt-2 text-sm">Try a different track or car name.</p>
            </>
          ) : (
            <>
              <p className="text-lg">No sessions yet</p>
              <p className="mt-2 text-sm">
                Start capturing telemetry with the mobile app — drive a lap and it shows up here.
              </p>
              <Button className="mt-6 bg-primary hover:bg-primary" render={<Link href="/dashboard" />}>
                <Smartphone className="mr-2 h-4 w-4" />
                Get the Mobile App
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_7.5rem_4rem_6.5rem_5.5rem_3rem] items-center gap-2 border-b border-border px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase md:grid">
            <span>Track</span>
            <span>Car</span>
            <span>Date</span>
            <span className="text-right">Laps</span>
            <span className="text-right">Best Lap</span>
            <span>Status</span>
            <span />
          </div>
          <div className="divide-y divide-border">
            {sessions.map((s) => {
              const isLive = isLiveSession(s.started_at, s.ended_at);
              return (
                <div
                  key={s.id}
                  className="relative grid grid-cols-2 items-center gap-2 px-4 py-3 transition-colors hover:bg-muted/40 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_7.5rem_4rem_6.5rem_5.5rem_3rem]"
                >
                  {/* Stretched link makes the whole row clickable. */}
                  <Link
                    href={`/sessions/${s.id}`}
                    className="absolute inset-0 z-0"
                    aria-label={`Open session at ${s.track_name ?? "unknown track"}`}
                  />
                  <span className="truncate font-medium">{s.track_name ?? "Unknown track"}</span>
                  <span className="truncate text-sm text-muted-foreground">
                    {s.car_name ?? "Unknown car"}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatRelativeTime(s.started_at)}
                  </span>
                  <span className="text-right font-mono text-sm">{s.total_laps ?? 0}</span>
                  <span className="text-right font-mono text-sm">
                    {formatLapTime(s.best_lap_ms)}
                  </span>
                  <span>
                    {isLive ? (
                      <Badge className="bg-emerald-500/15 text-emerald-400">
                        <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                        Live
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Done
                      </Badge>
                    )}
                  </span>
                  <span className="relative z-10 justify-self-end">
                    <DeleteSessionButton
                      sessionId={s.id}
                      sessionLabel={`${s.track_name ?? "Unknown track"} · ${s.car_name ?? "Unknown car"}`}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {total > limit && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} · {total} session{total === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Button variant="outline" size="sm" render={<Link href={pageHref(page - 1, track, car)} />}>
                <ChevronLeft />
                Previous
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                <ChevronLeft />
                Previous
              </Button>
            )}
            {page < totalPages ? (
              <Button variant="outline" size="sm" render={<Link href={pageHref(page + 1, track, car)} />}>
                Next
                <ChevronRight />
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Next
                <ChevronRight />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

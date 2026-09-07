import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarClock,
  CloudOff,
  ExternalLink,
  Flag,
  Timer,
  Trophy,
  Users,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DAILY_RACES_SOURCE,
  fetchDailyRaces,
  type DailyRace,
} from "@/lib/gt7/daily-races";

export const metadata: Metadata = {
  title: "Daily Races · GT7 Telemetry",
  description: "Current Gran Turismo 7 Daily Race rotation and leaderboards.",
};

function leaderboardHref(track: string): string {
  return `/leaderboards?track=${encodeURIComponent(track)}`;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}

function RaceCard({ race }: { race: DailyRace }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary font-bold text-white">
            {race.letter}
          </div>
          <div className="min-w-0">
            <CardTitle className="truncate">{race.track}</CardTitle>
            <CardDescription>
              {race.name}
              {race.trackBase ? ` · ${race.trackBase}` : ""}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-2">
        {race.eligibility && <DetailRow label="Car" value={race.eligibility} />}
        {race.laps !== null && <DetailRow label="Laps" value={String(race.laps)} />}
        {race.gridSize !== null && <DetailRow label="Grid" value={`${race.gridSize} cars`} />}
        {race.startType && <DetailRow label="Start" value={race.startType} />}
        {race.tyres.length > 0 && <DetailRow label="Tyres" value={race.tyres.join(" / ")} />}
        {race.requiredTyres.length > 0 && (
          <DetailRow label="Required tyres" value={race.requiredTyres.join(" + ")} />
        )}
        {race.startMinutes && race.startMinutes.length > 0 && (
          <DetailRow
            label="Starts at"
            value={race.startMinutes.map((m) => `:${String(m).padStart(2, "0")}`).join(" ")}
          />
        )}
        {race.settings.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-2">
            {race.settings.map((setting) => (
              <Badge key={setting} variant="outline" className="text-muted-foreground">
                {setting}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="text-primary hover:text-primary"
          render={<Link href={leaderboardHref(race.track)} />}
        >
          <Trophy className="h-3.5 w-3.5" />
          View leaderboard
        </Button>
      </CardFooter>
    </Card>
  );
}

export default async function RacesPage() {
  const data = await fetchDailyRaces();
  const races = data?.races ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Daily Races</h1>
        <p className="text-muted-foreground mt-1">
          The current GT7 Sport Mode rotation, with leaderboards for every combo.
        </p>
      </div>

      {/* Rotation banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
        <p className="text-sm">
          <CalendarClock className="mr-2 inline h-4 w-4 text-primary" />
          Official GT7 weekly rotation — new Daily Races every{" "}
          <span className="font-medium text-primary">Monday at 06:00 UTC</span>.
        </p>
        {data?.sourceUpdatedAt && (
          <p className="text-xs text-muted-foreground">
            Source updated {data.sourceUpdatedAt}
            {data.weekOf ? ` · week of ${data.weekOf}` : ""}
          </p>
        )}
      </div>

      {races.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {races.map((race) => (
            <RaceCard key={race.id} race={race} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card px-6 py-14 text-center">
          <CloudOff className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-30" />
          <p className="text-lg font-medium">Live race data unavailable</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            {data
              ? "The community data feed we monitor (GT7Info) no longer publishes Daily Race rotations, and Polyphony Digital offers no public API. If the feed resumes, this page will pick it up automatically."
              : "We couldn't reach the community data feed (GT7Info). It may be temporarily down — this page retries every hour."}{" "}
            In the meantime, the current week&apos;s races are covered by the GT7 community:
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              render={
                <a
                  href="https://www.gtplanet.net/category/gran-turismo-7/"
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              GTPlanet weekly roundup
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              render={
                <a href={DAILY_RACES_SOURCE.homepage} target="_blank" rel="noopener noreferrer" />
              }
            >
              GT7Info
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            Already racing this week&apos;s combos? Your lap times still count —{" "}
            <Link href="/leaderboards" className="text-primary hover:underline">
              browse the leaderboards
            </Link>
            .
          </p>
        </div>
      )}

      {/* Fixed: official time trials */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/20">
              <Timer className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Lap Time Challenge</CardTitle>
              <CardDescription>
                Official online time trials, refreshed every two weeks in Sport Mode.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            <Flag className="mr-2 inline h-4 w-4 text-primary" />
            Set a clean lap in-game, then check the official rankings for the current events.
          </p>
          <Button
            size="sm"
            className="bg-primary text-white hover:bg-primary"
            render={
              <a
                href="https://www.gran-turismo.com/us/gt7/"
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            gran-turismo.com
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </CardContent>
      </Card>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        Race data via{" "}
        <a
          href={DAILY_RACES_SOURCE.homepage}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          {DAILY_RACES_SOURCE.name}
        </a>
        , refreshed hourly. Track names may differ slightly from your telemetry sessions.
      </p>
    </div>
  );
}

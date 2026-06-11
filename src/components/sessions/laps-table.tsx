import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatLapTime } from "@/shared/telemetry";

interface LapRow {
  lap_number: number;
  lap_time_ms: number | null;
  start_ms?: number | null;
  end_ms?: number | null;
}

interface LapsTableProps {
  laps: LapRow[];
}

/** Lap times with delta vs the session's best lap (green = best, red = slower). */
export function LapsTable({ laps }: LapsTableProps) {
  const validTimes = laps
    .map((l) => l.lap_time_ms)
    .filter((t): t is number => t != null && t > 0);
  const best = validTimes.length > 0 ? Math.min(...validTimes) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Laps</CardTitle>
        <CardDescription>
          {laps.length} lap{laps.length === 1 ? "" : "s"} recorded
        </CardDescription>
      </CardHeader>
      <CardContent>
        {laps.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No completed laps recorded for this session.
          </p>
        ) : (
          <div className="divide-y divide-border">
            <div className="grid grid-cols-[3rem_1fr_1fr] gap-2 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <span>Lap</span>
              <span className="text-right">Time</span>
              <span className="text-right">Delta</span>
            </div>
            {laps.map((lap) => {
              const time = lap.lap_time_ms;
              const isBest = best !== null && time === best;
              const delta = best !== null && time != null && time > 0 ? time - best : null;
              return (
                <div
                  key={lap.lap_number}
                  className="grid grid-cols-[3rem_1fr_1fr] items-center gap-2 py-2 text-sm"
                >
                  <span className="font-mono text-muted-foreground">{lap.lap_number}</span>
                  <span className="text-right font-mono">{formatLapTime(time)}</span>
                  <span className="text-right font-mono">
                    {isBest ? (
                      <Badge className="bg-emerald-500/15 text-emerald-400">BEST</Badge>
                    ) : delta !== null ? (
                      <span className="text-red-400">+{(delta / 1000).toFixed(3)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

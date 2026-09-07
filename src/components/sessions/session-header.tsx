import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ExportButtons } from "@/components/sessions/export-buttons";
import { DeleteSessionButton } from "@/components/sessions/delete-session-button";
import { ShareButton } from "@/components/sessions/share-button";
import { ArrowLeft, Car, MapPin } from "lucide-react";

interface SessionHeaderProps {
  session: {
    id: string;
    track_name: string | null;
    car_name: string | null;
    started_at: string;
  };
  isLive: boolean;
  /** Resolved server-side via checkFeature(…, 'telemetry_export'). */
  canExport: boolean;
}

/**
 * Session detail header: back link, track/car/date title block and the
 * action row (export, public share link, delete). Extracted from the
 * session detail page; drop-in replacement for its inline header section.
 */
export function SessionHeader({ session, isLive, canExport }: SessionHeaderProps) {
  const startedAt = new Date(session.started_at);

  return (
    <div className="space-y-4">
      <Link
        href="/sessions"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to sessions
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{session.track_name ?? "Unknown track"}</h1>
            {isLive && (
              <Badge className="bg-emerald-500/15 text-emerald-400">
                <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                Live
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1.5">
              <Car className="h-4 w-4 text-violet-400" />
              {session.car_name ?? "Unknown car"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-violet-400" />
              {startedAt.toLocaleString("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons sessionId={session.id} canExport={canExport} />
          <ShareButton sessionId={session.id} />
          <DeleteSessionButton
            sessionId={session.id}
            sessionLabel={`${session.track_name ?? "Unknown track"} · ${session.car_name ?? "Unknown car"}`}
            redirectTo="/sessions"
            showLabel
          />
        </div>
      </div>
    </div>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import { FileJson, FileSpreadsheet, Lock } from "lucide-react";

interface ExportButtonsProps {
  sessionId: string;
  /** Resolved server-side via checkFeature(…, 'telemetry_export'). */
  canExport: boolean;
}

/**
 * CSV/JSON export download buttons. Free tier sees locked buttons with an
 * upgrade tooltip instead of the download links.
 */
export function ExportButtons({ sessionId, canExport }: ExportButtonsProps) {
  if (!canExport) {
    return (
      <div className="group relative inline-flex items-center gap-2">
        <Button variant="outline" size="sm" disabled aria-label="Export CSV (Pro feature)">
          <Lock />
          CSV
        </Button>
        <Button variant="outline" size="sm" disabled aria-label="Export JSON (Pro feature)">
          <Lock />
          JSON
        </Button>
        <span
          role="tooltip"
          className="pointer-events-none absolute -top-9 left-1/2 z-20 hidden -translate-x-1/2 rounded-md border border-violet-500/40 bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md group-hover:block"
        >
          Telemetry export is a <span className="font-medium text-violet-400">Pro</span> feature —
          upgrade to unlock
        </span>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        render={<a href={`/api/sessions/${sessionId}/export?format=csv`} />}
      >
        <FileSpreadsheet />
        CSV
      </Button>
      <Button
        variant="outline"
        size="sm"
        render={<a href={`/api/sessions/${sessionId}/export?format=json`} />}
      >
        <FileJson />
        JSON
      </Button>
    </div>
  );
}

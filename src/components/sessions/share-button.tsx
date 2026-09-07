"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Share2, TriangleAlert } from "lucide-react";

interface ShareButtonProps {
  sessionId: string;
  /** Pin the share to a specific lap; omit to share the session's best lap. */
  lapNumber?: number;
}

type ShareState = "idle" | "loading" | "copied" | "error";

/**
 * Creates (or reuses) a public share link via POST /api/share, copies it to
 * the clipboard and flashes "Copied!" for 2s. Errors show a discreet "Failed".
 */
export function ShareButton({ sessionId, lapNumber }: ShareButtonProps) {
  const [state, setState] = useState<ShareState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function flash(next: ShareState) {
    setState(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState("idle"), 2000);
  }

  async function handleShare() {
    if (state === "loading") return;
    setState("loading");
    let url: string;
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          ...(lapNumber !== undefined ? { lap_number: lapNumber } : {}),
        }),
      });
      if (!res.ok) throw new Error(`share failed (${res.status})`);
      ({ url } = (await res.json()) as { url: string });
    } catch {
      flash("error");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      flash("copied");
    } catch {
      // Safari revokes the user-activation token across the awaited fetch and
      // rejects the clipboard write — offer the URL for manual copy instead.
      window.prompt("Copy link:", url);
      setState("idle");
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleShare}
      disabled={state === "loading"}
      aria-label="Copy public share link"
    >
      {state === "copied" ? (
        <>
          <Check className="text-emerald-400" />
          Copied!
        </>
      ) : state === "error" ? (
        <>
          <TriangleAlert className="text-destructive" />
          Failed
        </>
      ) : (
        <>
          <Share2 />
          Share
        </>
      )}
    </Button>
  );
}

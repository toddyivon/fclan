"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Trash2 } from "lucide-react";

interface DeleteSessionButtonProps {
  sessionId: string;
  sessionLabel?: string;
  /** When set, navigate here after a successful delete (else router.refresh). */
  redirectTo?: string;
  /** Show a text label next to the trash icon (detail-page header style). */
  showLabel?: boolean;
}

/** Confirm-dialog delete for a telemetry session (DELETE /api/sessions/:id). */
export function DeleteSessionButton({
  sessionId,
  sessionLabel,
  redirectTo,
  showLabel = false,
}: DeleteSessionButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Delete failed (${res.status})`);
      }
      setOpen(false);
      if (redirectTo) {
        router.push(redirectTo);
        router.refresh();
      } else {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant={showLabel ? "destructive" : "ghost"}
            size={showLabel ? "sm" : "icon-sm"}
            aria-label="Delete session"
            className={showLabel ? undefined : "text-muted-foreground hover:text-red-400"}
          />
        }
      >
        <Trash2 />
        {showLabel && "Delete"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete session?</DialogTitle>
          <DialogDescription>
            {sessionLabel ? (
              <>
                This permanently deletes <span className="text-foreground">{sessionLabel}</span>{" "}
                with all of its telemetry points, laps and AI analyses.
              </>
            ) : (
              "This permanently deletes the session with all of its telemetry points, laps and AI analyses."
            )}{" "}
            This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" disabled={busy} />}>
            Cancel
          </DialogClose>
          <Button variant="destructive" size="sm" disabled={busy} onClick={handleDelete}>
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

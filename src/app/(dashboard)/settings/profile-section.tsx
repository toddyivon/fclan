"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/browser";

export function ProfileSection({
  userId,
  initialName,
}: {
  userId: string;
  initialName: string;
}) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setStatus("idle");
    setErrorMsg(null);
    // RLS limits this to the caller's own row; column grants limit it to `name`.
    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({ name: name.trim() || null })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    } else {
      setStatus("saved");
    }
  }

  return (
    <div className="space-y-4 max-w-md">
      <div className="space-y-2">
        <Label htmlFor="name">Display Name</Label>
        <Input
          id="name"
          placeholder="Your name"
          value={name}
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value);
            setStatus("idle");
          }}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button
          className="bg-violet-600 hover:bg-violet-500 text-white"
          disabled={saving}
          onClick={save}
        >
          {saving && <Loader2 className="animate-spin" />}
          {saving ? "Saving…" : "Save changes"}
        </Button>
        {status === "saved" && (
          <span className="flex items-center gap-1 text-sm text-emerald-400">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
        {status === "error" && (
          <span className="text-sm text-destructive">{errorMsg ?? "Failed to save"}</span>
        )}
      </div>
    </div>
  );
}

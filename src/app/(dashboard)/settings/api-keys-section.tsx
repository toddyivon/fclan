"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";

interface ApiKey {
  id: string;
  name: string;
  created_at: string;
  last_used: string | null;
}

export function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [justCreated, setJustCreated] = useState<string | null>(null);

  async function load() {
    setLoadError(null);
    try {
      const res = await fetch("/api/keys");
      if (!res.ok) throw new Error(`Failed to load keys (${res.status})`);
      const data = await res.json();
      setKeys(data.keys);
    } catch (e: unknown) {
      setLoadError(e instanceof Error && e.message ? e.message : "Failed to load keys");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    setError(null);
    setCreating(true);
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName || "Mobile app" }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to create key");
      return;
    }
    setJustCreated(data.key.plaintext);
    setNewName("");
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this API key? Devices using it will stop working.")) return;
    setError(null);
    try {
      const res = await fetch(`/api/keys?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Failed to delete key (${res.status})`);
      }
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error && e.message ? e.message : "Failed to delete key");
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {justCreated && (
        <div className="bg-violet-600/10 border border-violet-600/30 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium">Copy this key now — it will not be shown again.</p>
          <code className="block bg-black/40 p-2 rounded text-xs break-all">{justCreated}</code>
          <Button size="sm" variant="outline" onClick={() => setJustCreated(null)}>Done</Button>
        </div>
      )}

      <div className="flex gap-2 items-end max-w-lg">
        <div className="flex-1 space-y-2">
          <Label htmlFor="key-name">Key name</Label>
          <Input id="key-name" placeholder="Mobile app" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </div>
        <Button className="bg-violet-600 hover:bg-violet-500" disabled={creating} onClick={create}>
          {creating ? "Creating…" : "Generate"}
        </Button>
      </div>

      <ul className="space-y-2">
        {keys?.length === 0 && <li className="text-sm text-muted-foreground">No API keys yet.</li>}
        {keys?.map((k) => (
          <li key={k.id} className="flex items-center justify-between border border-white/10 rounded-lg px-3 py-2">
            <div>
              <p className="text-sm font-medium">{k.name}</p>
              <p className="text-xs text-muted-foreground">
                created {new Date(k.created_at).toLocaleDateString()}
                {k.last_used ? ` · last used ${new Date(k.last_used).toLocaleDateString()}` : " · never used"}
              </p>
            </div>
            <button onClick={() => remove(k.id)} aria-label={`Delete key ${k.name}`} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
        {keys === null && loadError === null && (
          <li className="text-sm text-muted-foreground">Loading…</li>
        )}
        {loadError !== null && (
          <li className="flex items-center gap-3">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button size="sm" variant="outline" onClick={load}>
              Retry
            </Button>
          </li>
        )}
      </ul>
    </div>
  );
}

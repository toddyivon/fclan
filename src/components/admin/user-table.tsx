"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Search,
  Shield,
  ShieldOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  tier: "free" | "pro" | "ai_premium";
  role: "user" | "admin";
  created_at: string;
}

const PAGE_SIZE = 50;
const TIERS = ["free", "pro", "ai_premium"] as const;

const TIER_LABELS: Record<AdminUser["tier"], string> = {
  free: "Free",
  pro: "Pro",
  ai_premium: "AI Premium",
};

const TIER_BADGE_CLASS: Record<AdminUser["tier"], string> = {
  free: "bg-zinc-500/15 text-zinc-400",
  pro: "bg-primary/15 text-primary",
  ai_premium: "bg-fuchsia-500/15 text-fuchsia-400",
};

export function UserTable({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [roleConfirm, setRoleConfirm] = useState<AdminUser | null>(null);
  const [roleBusy, setRoleBusy] = useState(false);
  // Monotonic id so an out-of-order (stale) response never overwrites a newer one.
  const loadRequestIdRef = useRef(0);

  const load = useCallback(async (p: number, q: string) => {
    const requestId = ++loadRequestIdRef.current;
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (q) params.set("search", q);
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const data = await res.json().catch(() => null);
      if (requestId !== loadRequestIdRef.current) return;
      if (!res.ok) throw new Error(data?.error ?? `Failed to load users (${res.status})`);
      setUsers(data.users);
      setTotal(data.total);
    } catch (e: unknown) {
      if (requestId !== loadRequestIdRef.current) return;
      setError(e instanceof Error ? e.message : "Failed to load users");
    }
  }, []);

  // Debounced reload on search/page change (immediate on first render / page nav).
  useEffect(() => {
    const t = setTimeout(() => {
      load(page, search);
    }, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [page, search, load]);

  async function applyUpdate(
    userId: string,
    patch: { tier?: AdminUser["tier"]; role?: AdminUser["role"] }
  ): Promise<boolean> {
    setBusyId(userId);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, ...patch }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Update failed (${res.status})`);
      setUsers((prev) =>
        prev ? prev.map((u) => (u.id === userId ? { ...u, ...data.user } : u)) : prev
      );
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function confirmRoleChange() {
    if (!roleConfirm) return;
    const nextRole = roleConfirm.role === "admin" ? "user" : "admin";
    setRoleBusy(true);
    const ok = await applyUpdate(roleConfirm.id, { role: nextRole });
    setRoleBusy(false);
    if (ok) setRoleConfirm(null);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search users by email"
          placeholder="Search by email…"
          className="pl-8"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Tier</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Joined</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users === null && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            )}
            {users?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No users found.
                </td>
              </tr>
            )}
            {users?.map((u) => (
              <tr key={u.id} className="border-b border-border/50 last:border-0">
                <td className="px-3 py-2 max-w-[240px] truncate font-medium">
                  {u.email}
                  {u.id === currentUserId && (
                    <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                  )}
                </td>
                <td className="px-3 py-2 max-w-[160px] truncate text-muted-foreground">
                  {u.name ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <Badge className={TIER_BADGE_CLASS[u.tier]}>{TIER_LABELS[u.tier]}</Badge>
                </td>
                <td className="px-3 py-2">
                  {u.role === "admin" ? (
                    <Badge className="bg-amber-500/15 text-amber-400">
                      <Shield /> admin
                    </Badge>
                  ) : (
                    <Badge variant="outline">user</Badge>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="px-3 py-2 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for ${u.email}`}
                          disabled={busyId === u.id}
                        />
                      }
                    >
                      {busyId === u.id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <MoreHorizontal />
                      )}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuLabel>Set tier</DropdownMenuLabel>
                      {TIERS.map((t) => (
                        <DropdownMenuItem
                          key={t}
                          disabled={u.tier === t}
                          onClick={() => applyUpdate(u.id, { tier: t })}
                        >
                          {TIER_LABELS[t]}
                          {u.tier === t && (
                            <span className="ml-auto text-xs text-muted-foreground">current</span>
                          )}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={u.id === currentUserId && u.role === "admin"}
                        onClick={() => setRoleConfirm(u)}
                      >
                        {u.role === "admin" ? (
                          <>
                            <ShieldOff /> Remove admin
                          </>
                        ) : (
                          <>
                            <Shield /> Make admin
                          </>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} user{total === 1 ? "" : "s"} · page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft /> Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next <ChevronRight />
          </Button>
        </div>
      </div>

      <Dialog open={roleConfirm !== null} onOpenChange={(open) => !open && setRoleConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {roleConfirm?.role === "admin" ? "Remove admin role?" : "Grant admin role?"}
            </DialogTitle>
            <DialogDescription>
              {roleConfirm?.role === "admin" ? (
                <>
                  <span className="text-foreground">{roleConfirm?.email}</span> will lose access to
                  the admin panel and all administrative actions.
                </>
              ) : (
                <>
                  <span className="text-foreground">{roleConfirm?.email}</span> will gain full
                  access to the admin panel, including user and tier management.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" disabled={roleBusy} />}>
              Cancel
            </DialogClose>
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90 text-white"
              disabled={roleBusy}
              onClick={confirmRoleChange}
            >
              {roleBusy && <Loader2 className="animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useRef } from "react";
import { EllipsisVertical, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export function UserMenu({
  user,
  tier,
  compact = false,
}: {
  user: { email: string; name?: string | null };
  tier: string;
  compact?: boolean;
}) {
  const signOutFormRef = useRef<HTMLFormElement>(null);
  const displayName = user.name || user.email || "User";

  return (
    <div className="flex items-center justify-between gap-2">
      {!compact && (
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-white">
            {displayName[0].toUpperCase()}
          </div>
          <div className="min-w-0 text-sm">
            <p className="max-w-[120px] truncate font-medium">{displayName}</p>
            <Badge variant="secondary" className="mt-1 text-xs">
              {tier}
            </Badge>
          </div>
        </div>
      )}
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <DropdownMenu>
          {/* Base UI composition: `render` swaps the default <button> for our
              Button instead of nesting a button inside a button. */}
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Open user menu" />}>
            <EllipsisVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => signOutFormRef.current?.requestSubmit()}
            >
              <LogOut className="h-4 w-4" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* Full-document POST so the 303 redirect to /login clears all client state. */}
      <form ref={signOutFormRef} action="/auth/signout" method="post" className="hidden" />
    </div>
  );
}

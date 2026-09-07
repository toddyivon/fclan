"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain, CalendarDays, Car, LayoutDashboard, Settings, Shield, Trophy, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Icons are mapped client-side by string key so the server layout can pass
// serializable nav items across the RSC boundary.
const ICONS = {
  overview: LayoutDashboard,
  sessions: Car,
  leaderboards: Trophy,
  races: CalendarDays,
  analysis: Brain,
  settings: Settings,
  admin: Shield,
} satisfies Record<string, LucideIcon>;

export type NavIcon = keyof typeof ICONS;

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
}

export function NavLinks({
  items,
  variant = "sidebar",
}: {
  items: NavItem[];
  variant?: "sidebar" | "mobile";
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  if (variant === "mobile") {
    // On mobile, show only the 4 primary destinations (Settings lives in the
    // user menu). Races/Admin stay desktop-only for glanceability.
    const primary = items.filter((i) =>
      ["overview", "sessions", "analysis", "leaderboards"].includes(i.icon)
    );
    return (
      <>
        {primary.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-1 px-4 transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-primary"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[11px]">{item.label}</span>
            </Link>
          );
        })}
      </>
    );
  }

  return (
    <>
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-primary/15 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

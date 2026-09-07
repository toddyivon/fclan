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
                "flex flex-col items-center gap-1 py-1 px-3 transition-colors",
                active ? "text-violet-400" : "text-muted-foreground hover:text-violet-400"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px]">{item.label}</span>
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
                ? "bg-violet-600/15 text-violet-300 font-medium"
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

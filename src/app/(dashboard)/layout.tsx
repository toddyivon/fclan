import { Badge } from "@/components/ui/badge";
import { Gauge } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NavLinks, type NavItem } from "@/components/shared/nav-links";
import { UserMenu } from "@/components/shared/user-menu";

const navItems: NavItem[] = [
  { href: "/dashboard", icon: "overview", label: "Overview" },
  { href: "/sessions", icon: "sessions", label: "Sessions" },
  { href: "/leaderboards", icon: "leaderboards", label: "Leaderboards" },
  { href: "/races", icon: "races", label: "Races" },
  { href: "/analysis", icon: "analysis", label: "AI Analysis" },
  { href: "/settings", icon: "settings", label: "Settings" },
];
const adminNavItem: NavItem = { href: "/admin", icon: "admin", label: "Admin" };

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: userData } = await supabase
    .from("users")
    .select("tier, name, role")
    .eq("id", user.id)
    .single();

  const tierLabel = userData?.tier === "ai_premium" ? "AI Premium" : userData?.tier === "pro" ? "Pro" : "Free";
  const isAdmin = userData?.role === "admin";
  const visibleNavItems = isAdmin ? [...navItems, adminNavItem] : navItems;
  const menuUser = { email: user.email ?? "", name: userData?.name ?? null };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card min-h-screen sticky top-0">
        {/* Logo */}
        <div className="p-6 border-b border-border">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Gauge className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg">fclan</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          <NavLinks items={visibleNavItems} />
        </nav>

        {/* User */}
        <div className="p-4 border-t border-border">
          <UserMenu user={menuUser} tier={tierLabel} />
        </div>
      </aside>

      {/* Mobile nav + content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile top bar */}
        <header className="md:hidden border-b border-border bg-card px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
              <Gauge className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold">fclan</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{tierLabel}</Badge>
            <UserMenu user={menuUser} tier={tierLabel} compact />
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 p-4 md:p-8">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden border-t border-border bg-card px-2 py-2 flex justify-around">
          <NavLinks items={visibleNavItems} variant="mobile" />
        </nav>
      </div>
    </div>
  );
}

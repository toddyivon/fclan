import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Gauge, LayoutDashboard, Car, Brain, Settings, Shield, LogOut, User, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Overview" },
  { href: "/sessions", icon: Car, label: "Sessions" },
  { href: "/analysis", icon: Brain, label: "AI Analysis" },
  { href: "/settings", icon: Settings, label: "Settings" },
  { href: "/admin", icon: Shield, label: "Admin" },
];

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
    .select("tier, name")
    .eq("id", user.id)
    .single();

  const tierLabel = userData?.tier === "ai_premium" ? "AI Premium" : userData?.tier === "pro" ? "Pro" : "Free";

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card min-h-screen sticky top-0">
        {/* Logo */}
        <div className="p-6 border-b border-border">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-violet-600 flex items-center justify-center">
              <motion.div whileHover={{ rotate: 15 }}>
                <Gauge className="h-5 w-5 text-white" />
              </motion.div>
            </div>
            <span className="font-bold text-lg">GT7 Telemetry</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 font-normal"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Button>
            </Link>
          ))}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-violet-600 flex items-center justify-center text-sm font-medium">
                {(user.email || "U")[0].toUpperCase()}
              </div>
              <div className="text-sm">
                <p className="font-medium truncate max-w-[120px]">{user.email}</p>
                <Badge variant="secondary" className="text-xs mt-1">
                  {tierLabel}
                </Badge>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button variant="ghost" size="icon">
                  <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                  <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                  <span className="sr-only">Toggle theme</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Toggle Theme</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <LogOut className="h-4 w-4 mr-2" /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Mobile nav + content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile top bar */}
        <header className="md:hidden border-b border-border bg-card px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-violet-600 flex items-center justify-center">
              <Gauge className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold">GT7</span>
          </div>
          <Badge variant="secondary">{tierLabel}</Badge>
        </header>

        {/* Main content */}
        <main className="flex-1 p-4 md:p-8">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden border-t border-border bg-card px-2 py-2 flex justify-around">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="flex flex-col items-center gap-1 py-1 px-3 text-muted-foreground hover:text-violet-400 transition-colors">
              <item.icon className="h-5 w-5" />
              <span className="text-[10px]">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

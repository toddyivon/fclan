"use client";

import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

// The app defaults to dark (class "dark" hardcoded on <html> in the root
// layout). This toggles the class and persists the choice in localStorage.
const STORAGE_KEY = "theme";

export function ThemeToggle() {
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light") {
      document.documentElement.classList.remove("dark");
    } else if (stored === "dark") {
      document.documentElement.classList.add("dark");
    }
  }, []);

  function toggle() {
    const nextIsDark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", nextIsDark);
    localStorage.setItem(STORAGE_KEY, nextIsDark ? "dark" : "light");
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggle} className="relative" aria-label="Toggle theme">
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  );
}

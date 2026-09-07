"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";

interface SessionFiltersProps {
  track?: string;
  car?: string;
}

/**
 * Track/car filters for the sessions list. Applies via router.replace on the
 * querystring (dropping `page` so filtering always restarts at page 1).
 */
export function SessionFilters({ track = "", car = "" }: SessionFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [trackValue, setTrackValue] = useState(track);
  const [carValue, setCarValue] = useState(car);

  const hasActiveFilters = track !== "" || car !== "";

  function apply(nextTrack: string, nextCar: string) {
    const params = new URLSearchParams();
    if (nextTrack.trim()) params.set("track", nextTrack.trim());
    if (nextCar.trim()) params.set("car", nextCar.trim());
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  function clear() {
    setTrackValue("");
    setCarValue("");
    apply("", "");
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        apply(trackValue, carValue);
      }}
    >
      <Input
        value={trackValue}
        onChange={(e) => setTrackValue(e.target.value)}
        placeholder="Filter by track…"
        className="h-8 w-44"
        aria-label="Filter by track"
      />
      <Input
        value={carValue}
        onChange={(e) => setCarValue(e.target.value)}
        placeholder="Filter by car…"
        className="h-8 w-44"
        aria-label="Filter by car"
      />
      <Button type="submit" variant="outline" size="sm">
        <Search />
        Filter
      </Button>
      {(hasActiveFilters || trackValue !== "" || carValue !== "") && (
        <Button type="button" variant="ghost" size="sm" onClick={clear}>
          <X />
          Clear
        </Button>
      )}
    </form>
  );
}

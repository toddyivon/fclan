const ALLOWED_PREFIXES = ["/dashboard", "/sessions", "/analysis", "/settings", "/admin"];

export function safeRedirect(pathname: string | null | undefined, fallback = "/dashboard"): string {
  if (!pathname || typeof pathname !== "string") return fallback;
  if (!pathname.startsWith("/")) return fallback;
  if (pathname.startsWith("//") || pathname.startsWith("/\\")) return fallback;
  try {
    const url = new URL(pathname, "http://local.invalid");
    if (url.origin !== "http://local.invalid") return fallback;
    if (!ALLOWED_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"))) {
      return fallback;
    }
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirect } from "@/lib/auth/safe-redirect";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next");

  // safeRedirect only allows dashboard-area prefixes; /reset-password is the
  // one auth-flow destination (password recovery) that must also be reachable.
  const next =
    nextParam === "/reset-password" ? "/reset-password" : safeRedirect(nextParam);

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=auth", url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=auth", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}

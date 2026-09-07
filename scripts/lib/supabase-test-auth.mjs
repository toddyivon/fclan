/**
 * Test helper: signs a user in against the local Supabase stack and returns
 * the Cookie header the Next.js app expects, built by @supabase/ssr itself
 * (so chunking/encoding always match the app's middleware).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

// Default to whatever Supabase the app under test is configured against
// (.env.production.local) so the suites follow env switches automatically.
function appEnv() {
  try {
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env.production.local");
    return Object.fromEntries(
      fs.readFileSync(file, "utf8").split("\n")
        .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2]])
    );
  } catch {
    return {};
  }
}
const fromApp = appEnv();

export const SUPABASE_URL =
  process.env.SUPABASE_URL ?? fromApp.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
export const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? fromApp.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_ANON_KEY_FROM_ENV";
export const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? fromApp.SUPABASE_SERVICE_ROLE_KEY ??
  "sb_secret_SERVICE_ROLE_FROM_ENV";

export function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

/** Creates (or recreates) a confirmed user and returns its id. */
export async function ensureUser(email, password, { tier } = {}) {
  const admin = adminClient();
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users?.find((u) => u.email === email);
  if (existing) await admin.auth.admin.deleteUser(existing.id);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  const userId = data.user.id;
  if (tier && tier !== "free") {
    const { error: e2 } = await admin.from("users").update({ tier }).eq("id", userId);
    if (e2) throw new Error(`set tier: ${e2.message}`);
  }
  return userId;
}

/** Signs in and returns { cookieHeader, userId, accessToken }. */
export async function signInForCookies(email, password) {
  const jar = new Map();
  const supabase = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () =>
        Array.from(jar.entries()).map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) jar.set(name, value);
      },
    },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  const cookieHeader = Array.from(jar.entries())
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");
  return { cookieHeader, userId: data.user.id, accessToken: data.session.access_token };
}

#!/usr/bin/env node
/**
 * End-to-end endpoint tests against a running app + local Supabase stack.
 *
 * Prereqs:
 *   - supabase start (local stack on 54321/54322)
 *   - app built & running with .env.production.local (e.g. PORT=3002 npm run start)
 *   - migrations applied (supabase migration up)
 *
 * Usage: node scripts/test-endpoints.mjs [baseUrl]
 *   BASE_URL defaults to http://localhost:3002
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import {
  adminClient,
  ensureUser,
  signInForCookies,
  SUPABASE_URL,
  ANON_KEY,
} from "./lib/supabase-test-auth.mjs";

const BASE = process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:3002";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_local_test_secret";
const PRICE_PRO = process.env.STRIPE_PRICE_PRO ?? "price_local_pro";
const PRICE_AI = process.env.STRIPE_PRICE_AI_PREMIUM ?? "price_local_ai_premium";

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "✓" : "✗"} ${name}${pass || !detail ? "" : ` — ${detail}`}`);
}

async function req(method, path, { cookie, apiKey, body, raw, redirect } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  let payload;
  if (raw !== undefined) {
    payload = raw;
    headers["content-type"] = "application/json";
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers["content-type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: payload,
    redirect: redirect ?? "manual",
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, headers: res.headers };
}

function stripeSig(payload, secret) {
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto
    .createHmac("sha256", secret)
    .update(`${t}.${payload}`)
    .digest("hex");
  return `t=${t},v1=${v1}`;
}

async function postWebhook(event) {
  const payload = JSON.stringify(event);
  const res = await fetch(`${BASE}/api/webhooks/stripe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": stripeSig(payload, WEBHOOK_SECRET),
    },
    body: payload,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json, text };
}

function ingestPoints({ startPacket, n, lap, lastLapMs = -1, bestLapMs = -1 }) {
  return Array.from({ length: n }, (_, i) => ({
    packet_id: startPacket + i,
    posX: 100 + i, posY: 1, posZ: 200 + i * 2,
    velX: 50, velY: 0, velZ: 10,
    rotX: 0, rotY: 0.1, rotZ: 0, rotW: 0.99,
    rpm: 6000 + (i % 100) * 10,
    speed_ms: 40 + (i % 50),
    throttle: i % 2 === 0 ? 255 : 120,
    brake: i % 10 === 0 ? 200 : 0,
    gear: 3 + (i % 3),
    suggested_gear: 15,
    fuel_level: 80 - i * 0.01,
    fuel_capacity: 100,
    tire_temp_fl: 75, tire_temp_fr: 76, tire_temp_rl: 80, tire_temp_rr: 81,
    flags: 0b1001,
    current_lap: lap,
    total_laps: 0,
    best_lap_ms: bestLapMs,
    last_lap_ms: lastLapMs,
  }));
}

async function main() {
  console.log(`\n=== GT7 endpoint tests against ${BASE} ===\n`);

  // Mock AI upstream for /api/ai/analyze
  const mock = spawn("node", ["scripts/mock-openrouter.mjs", "4545"], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 400));

  const admin = adminClient();
  try {
    // ---------- setup: make the suite re-runnable ----------
    await admin.from("stripe_webhook_events").delete().like("event_id", "evt_e2e%");

    // ---------- setup users ----------
    const freeId = await ensureUser("e2e-free@test.local", "test-pass-123");
    const proId = await ensureUser("e2e-pro@test.local", "test-pass-123", { tier: "pro" });
    const free = await signInForCookies("e2e-free@test.local", "test-pass-123");
    const pro = await signInForCookies("e2e-pro@test.local", "test-pass-123");

    // ---------- public + auth gating ----------
    {
      const r = await req("GET", "/");
      check("GET / responds 200", r.status === 200, `got ${r.status}`);
    }
    {
      const r = await req("GET", "/dashboard");
      check("GET /dashboard unauth redirects to /login",
        r.status >= 300 && r.status < 400 && (r.headers.get("location") ?? "").includes("/login"),
        `got ${r.status} -> ${r.headers.get("location")}`);
    }
    {
      const r = await req("GET", "/dashboard", { cookie: free.cookieHeader });
      check("GET /dashboard authed responds 200", r.status === 200, `got ${r.status}`);
    }

    // ---------- /api/me ----------
    {
      const r = await req("GET", "/api/me");
      check("GET /api/me unauth -> 401", r.status === 401, `got ${r.status}`);
    }
    {
      const r = await req("GET", "/api/me", { cookie: free.cookieHeader });
      check("GET /api/me free tier", r.status === 200 && r.json?.user?.tier === "free",
        `got ${r.status} tier=${r.json?.user?.tier}`);
      check("GET /api/me exposes quota", r.json?.quota?.ai_analyses_limit === 0,
        `quota=${JSON.stringify(r.json?.quota)}`);
    }
    {
      const r = await req("GET", "/api/me", { cookie: pro.cookieHeader });
      check("GET /api/me pro tier", r.status === 200 && r.json?.user?.tier === "pro",
        `got ${r.status} tier=${r.json?.user?.tier}`);
    }

    // ---------- /api/keys ----------
    let freeKey = null;
    let proKey = null;
    {
      const r = await req("GET", "/api/keys", { cookie: free.cookieHeader });
      check("GET /api/keys starts empty", r.status === 200 && r.json?.keys?.length === 0,
        `got ${r.status} keys=${r.json?.keys?.length}`);
    }
    {
      const r = await req("POST", "/api/keys", { cookie: free.cookieHeader, body: { name: "e2e" } });
      freeKey = r.json?.key?.plaintext;
      check("POST /api/keys creates key", r.status === 201 && typeof freeKey === "string" && freeKey.startsWith("gt7_"),
        `got ${r.status}`);
    }
    {
      const r = await req("POST", "/api/keys", { cookie: free.cookieHeader, body: { name: "e2e2" } });
      check("POST /api/keys over free limit -> 403", r.status === 403, `got ${r.status}`);
    }
    {
      const r = await req("POST", "/api/keys", { cookie: pro.cookieHeader, body: { name: "e2e-pro" } });
      proKey = r.json?.key?.plaintext;
      check("POST /api/keys pro can create", r.status === 201 && !!proKey, `got ${r.status}`);
    }

    // ---------- /api/ingest ----------
    let sessionId = null;
    {
      const r = await req("POST", "/api/ingest", { body: { points: ingestPoints({ startPacket: 1, n: 5, lap: 1 }) } });
      check("POST /api/ingest no auth -> 401", r.status === 401, `got ${r.status}`);
    }
    {
      const r = await req("POST", "/api/ingest", { apiKey: "gt7_invalid", body: { points: ingestPoints({ startPacket: 1, n: 5, lap: 1 }) } });
      check("POST /api/ingest bad key -> 401", r.status === 401, `got ${r.status}`);
    }
    {
      const r = await req("POST", "/api/ingest", { apiKey: proKey, body: { points: [] } });
      check("POST /api/ingest empty points -> 400", r.status === 400, `got ${r.status}`);
    }
    {
      const r = await req("POST", "/api/ingest", {
        apiKey: proKey,
        body: {
          is_new_session: true,
          car_name: "Mazda RX-7", car_code: 1234, track_name: "Deep Forest",
          points: ingestPoints({ startPacket: 1, n: 60, lap: 1 }),
        },
      });
      sessionId = r.json?.session_id;
      check("POST /api/ingest creates session", r.status === 200 && !!sessionId,
        `got ${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
    }
    {
      const r = await req("POST", "/api/ingest", {
        apiKey: proKey,
        body: {
          session_id: sessionId,
          points: ingestPoints({ startPacket: 61, n: 60, lap: 2, lastLapMs: 93456, bestLapMs: 93456 }),
        },
      });
      const laps = r.json?.laps_completed ?? [];
      check("ingest lap transition completes lap 1",
        r.status === 200 && laps.some((l) => (l.lapNumber ?? l.lap_number) === 1),
        `got ${r.status} laps=${JSON.stringify(laps)}`);
    }
    {
      const r = await req("POST", "/api/ingest", {
        apiKey: proKey,
        body: { session_id: sessionId, points: ingestPoints({ startPacket: 61, n: 60, lap: 2, lastLapMs: 93456 }) },
      });
      check("ingest duplicate batch inserts 0 points",
        r.status === 200 && (r.json?.points_inserted === 0),
        `got ${r.status} inserted=${r.json?.points_inserted}`);
    }
    {
      const r = await req("POST", "/api/ingest", {
        apiKey: proKey,
        body: {
          session_id: sessionId, is_final: true,
          points: ingestPoints({ startPacket: 121, n: 10, lap: 3, lastLapMs: 91200, bestLapMs: 91200 }),
        },
      });
      check("ingest is_final accepted", r.status === 200, `got ${r.status}`);
    }
    {
      // someone else's session id must not be writable
      const r = await req("POST", "/api/ingest", {
        apiKey: freeKey,
        body: { session_id: sessionId, points: ingestPoints({ startPacket: 1, n: 5, lap: 1 }) },
      });
      check("ingest rejects foreign session_id", r.status === 404 || r.status === 403, `got ${r.status}`);
    }

    // ---------- /api/sessions ----------
    {
      const r = await req("GET", "/api/sessions", { cookie: pro.cookieHeader });
      const found = r.json?.sessions?.find((s) => s.id === sessionId);
      check("GET /api/sessions lists session", r.status === 200 && !!found, `got ${r.status}`);
      check("session has aggregates", (found?.total_laps ?? 0) >= 2 && found?.best_lap_ms === 91200,
        `laps=${found?.total_laps} best=${found?.best_lap_ms}`);
    }
    {
      const r = await req("GET", `/api/sessions/${sessionId}`, { cookie: pro.cookieHeader });
      const laps = r.json?.laps ?? r.json?.session?.laps ?? [];
      check("GET /api/sessions/[id] detail + laps", r.status === 200 && laps.length >= 1,
        `got ${r.status} laps=${laps.length}`);
      check("session ended via is_final", !!(r.json?.session?.ended_at ?? r.json?.ended_at),
        JSON.stringify(r.json).slice(0, 160));
    }
    {
      const r = await req("GET", `/api/sessions/${sessionId}`, { cookie: free.cookieHeader });
      check("foreign session detail -> 404", r.status === 404, `got ${r.status}`);
    }
    {
      // free user 7d history window
      const { data: old } = await admin.from("telemetry_sessions").insert({
        user_id: freeId, car_name: "Old", track_name: "Old Track",
        started_at: new Date(Date.now() - 10 * 864e5).toISOString(),
        ended_at: new Date(Date.now() - 10 * 864e5 + 36e5).toISOString(),
      }).select("id").single();
      const r = await req("GET", "/api/sessions", { cookie: free.cookieHeader });
      const leaked = r.json?.sessions?.some((s) => s.id === old?.id);
      check("free tier hides sessions older than 7d", r.status === 200 && !leaked,
        `leaked=${leaked}`);
    }

    // ---------- points + export ----------
    {
      const r = await req("GET", `/api/sessions/${sessionId}/points?lap=2&fields=full`, { cookie: pro.cookieHeader });
      const pts = r.json?.points ?? [];
      const onlyLap2 = pts.length > 0 && pts.every((p) => p.lap_number === 2 || p.lap_number === undefined);
      check("points?lap=2 filters by lap", r.status === 200 && pts.length > 0 && onlyLap2,
        `got ${r.status} n=${pts.length}`);
      check("points fields=full includes pos", pts.length > 0 && "pos_x" in (pts[0] ?? {}),
        Object.keys(pts[0] ?? {}).join(","));
    }
    {
      const r = await req("GET", `/api/sessions/${sessionId}/export?format=csv`, { cookie: pro.cookieHeader });
      check("export csv (pro) -> 200 with rows",
        r.status === 200 && r.text.split("\n").length > 10 && r.text.includes("packet_id"),
        `got ${r.status} lines=${r.text.split("\n").length}`);
    }
    {
      // free user needs a session of their own to hit the gate (not 404)
      const rIngest = await req("POST", "/api/ingest", {
        apiKey: freeKey,
        body: { is_new_session: true, track_name: "T", points: ingestPoints({ startPacket: 1, n: 5, lap: 1 }) },
      });
      const freeSession = rIngest.json?.session_id;
      const r = await req("GET", `/api/sessions/${freeSession}/export?format=csv`, { cookie: free.cookieHeader });
      check("export gated for free -> 403", r.status === 403, `got ${r.status}`);
    }

    // ---------- AI analyze ----------
    {
      const r = await req("POST", "/api/ai/analyze", { cookie: free.cookieHeader, body: { session_id: sessionId } });
      check("analyze free -> 403/404 (gate before leak)", r.status === 403 || r.status === 404, `got ${r.status}`);
    }
    {
      const before = (await req("GET", "/api/me", { cookie: pro.cookieHeader })).json?.quota?.ai_analyses_used ?? -1;
      const r = await req("POST", "/api/ai/analyze", { cookie: pro.cookieHeader, body: { session_id: sessionId, lap_number: 2 } });
      check("analyze pro streams text", r.status === 200 && r.text.length > 50,
        `got ${r.status} len=${r.text.length} body=${r.text.slice(0, 80)}`);
      const after = (await req("GET", "/api/me", { cookie: pro.cookieHeader })).json?.quota?.ai_analyses_used ?? -1;
      check("analyze consumed 1 quota unit", after === before + 1, `before=${before} after=${after}`);
    }
    {
      const r = await req("GET", "/api/ai/analyses", { cookie: pro.cookieHeader });
      const list = r.json?.analyses ?? [];
      check("GET /api/ai/analyses persists history", r.status === 200 && list.length >= 1,
        `got ${r.status} n=${list.length}`);
    }
    {
      await admin.from("user_quotas").update({ ai_analyses_used: 50 }).eq("user_id", proId);
      const r = await req("POST", "/api/ai/analyze", { cookie: pro.cookieHeader, body: { session_id: sessionId } });
      check("analyze quota exhausted -> 429", r.status === 429, `got ${r.status}`);
      await admin.from("user_quotas").update({ ai_analyses_used: 1 }).eq("user_id", proId);
    }

    // ---------- Stripe webhook ----------
    {
      const r = await fetch(`${BASE}/api/webhooks/stripe`, { method: "POST", body: "{}" });
      check("webhook without signature -> 400", r.status === 400, `got ${r.status}`);
    }
    {
      const payload = JSON.stringify({ id: "evt_bad", type: "checkout.session.completed", data: { object: {} } });
      const r = await fetch(`${BASE}/api/webhooks/stripe`, {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=deadbeef", "content-type": "application/json" },
        body: payload,
      });
      check("webhook invalid signature -> 400", r.status === 400, `got ${r.status}`);
    }
    {
      const evt = {
        id: "evt_e2e_checkout_1",
        object: "event",
        type: "checkout.session.completed",
        created: Math.floor(Date.now() / 1000) - 30,
        data: {
          object: {
            id: "cs_e2e_1", object: "checkout.session",
            customer: "cus_e2e_1", subscription: "sub_e2e_1",
            client_reference_id: freeId,
            payment_status: "paid",
            metadata: { user_id: freeId, price_id: PRICE_PRO },
          },
        },
      };
      const r = await postWebhook(evt);
      const { data: u } = await admin.from("users").select("tier, stripe_customer_id").eq("id", freeId).single();
      check("webhook checkout.completed -> 200", r.status === 200, `got ${r.status} ${r.text.slice(0, 100)}`);
      check("webhook upgraded user to pro", u?.tier === "pro" && u?.stripe_customer_id === "cus_e2e_1",
        `tier=${u?.tier} cust=${u?.stripe_customer_id}`);
      const r2 = await postWebhook(evt);
      check("webhook duplicate event short-circuits", r2.status === 200 && r2.json?.duplicate === true,
        `got ${r2.status} ${r2.text.slice(0, 80)}`);
    }
    {
      const evt = {
        id: "evt_e2e_subupd_1",
        object: "event",
        type: "customer.subscription.updated",
        created: Math.floor(Date.now() / 1000) - 20,
        data: {
          object: {
            id: "sub_e2e_1", object: "subscription", customer: "cus_e2e_1",
            status: "active",
            metadata: { user_id: freeId },
            items: { data: [{ price: { id: PRICE_AI }, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] },
          },
        },
      };
      const r = await postWebhook(evt);
      const { data: u } = await admin.from("users").select("tier").eq("id", freeId).single();
      check("webhook subscription.updated upgrades to ai_premium",
        r.status === 200 && u?.tier === "ai_premium", `got ${r.status} tier=${u?.tier}`);
    }
    {
      const evt = {
        id: "evt_e2e_subdel_1",
        object: "event",
        type: "customer.subscription.deleted",
        created: Math.floor(Date.now() / 1000) - 10,
        data: { object: { id: "sub_e2e_1", object: "subscription", customer: "cus_e2e_1", status: "canceled", metadata: { user_id: freeId }, items: { data: [] } } },
      };
      const r = await postWebhook(evt);
      const { data: u } = await admin.from("users").select("tier").eq("id", freeId).single();
      check("webhook subscription.deleted downgrades to free",
        r.status === 200 && u?.tier === "free", `got ${r.status} tier=${u?.tier}`);
    }

    // ---------- billing endpoints ----------
    {
      const r = await req("POST", "/api/billing/checkout", { body: { plan: "pro" } });
      check("checkout unauth -> 401", r.status === 401, `got ${r.status}`);
    }
    {
      const r = await req("POST", "/api/billing/checkout", { cookie: pro.cookieHeader, body: { plan: "mega" } });
      check("checkout invalid plan -> 400", r.status === 400, `got ${r.status}`);
    }
    {
      const r = await req("POST", "/api/billing/portal", { cookie: pro.cookieHeader });
      check("portal without stripe customer -> 4xx", r.status >= 400 && r.status < 500, `got ${r.status}`);
    }

    // ---------- stripe-mock checkout happy path (requires STRIPE_API_HOST on the server) ----------
    {
      let mockUp = false;
      try {
        const ping = await fetch("http://127.0.0.1:12111/v1/charges", {
          headers: {
            authorization: `Bearer ${process.env.STRIPE_SECRET_KEY ?? "sk_test_LocalOfflineDummy0000"}`,
          },
        });
        mockUp = ping.status === 200;
      } catch { /* not running */ }
      if (mockUp) {
        const r = await req("POST", "/api/billing/checkout", {
          cookie: pro.cookieHeader,
          body: { plan: "ai_premium" },
        });
        check("checkout via stripe-mock -> 200 with url key",
          r.status === 200 && r.json !== null && "url" in r.json,
          `got ${r.status} ${r.text.slice(0, 120)}`);
      } else {
        console.log("· stripe-mock not running — skipping checkout happy path");
      }
    }

    // ---------- Wave 2: share links ----------
    {
      const r = await req("POST", "/api/share", { body: { session_id: sessionId } });
      check("share unauth -> 401", r.status === 401, `got ${r.status}`);
    }
    {
      const r = await req("POST", "/api/share", { cookie: pro.cookieHeader, body: { session_id: sessionId, lap_number: 2 } });
      const token = r.json?.token;
      check("POST /api/share creates link", r.status === 200 || r.status === 201, `got ${r.status} ${r.text.slice(0, 100)}`);
      if (token) {
        const pub = await fetch(`${BASE}/share/${token}`);
        check("GET /share/[token] public page 200", pub.status === 200, `got ${pub.status}`);
        const bad = await fetch(`${BASE}/share/not-a-real-token`);
        check("GET /share/bad-token -> 404", bad.status === 404, `got ${bad.status}`);
      }
    }
    {
      const r = await req("POST", "/api/share", { cookie: free.cookieHeader, body: { session_id: sessionId } });
      check("share foreign session rejected", r.status === 403 || r.status === 404, `got ${r.status}`);
    }

    // ---------- Wave 2: leaderboards ----------
    {
      const r = await req("GET", "/api/leaderboards");
      check("leaderboards unauth -> 401", r.status === 401, `got ${r.status}`);
    }
    {
      const r = await req("GET", "/api/leaderboards", { cookie: pro.cookieHeader });
      check("leaderboards lists tracks", r.status === 200 && Array.isArray(r.json?.tracks),
        `got ${r.status} ${r.text.slice(0, 100)}`);
    }
    {
      const r = await req("GET", `/api/leaderboards?track=${encodeURIComponent("Deep Forest")}`, { cookie: pro.cookieHeader });
      const entries = r.json?.entries ?? [];
      check("leaderboard for track has the ingested lap",
        r.status === 200 && entries.length >= 1 && entries[0].lap_time_ms === 91200,
        `got ${r.status} n=${entries.length} best=${entries[0]?.lap_time_ms}`);
      check("leaderboard exposes own rank", r.json?.me?.rank === 1, `me=${JSON.stringify(r.json?.me)}`);
    }

    // ---------- Wave 2: admin ----------
    {
      const r = await req("GET", "/api/admin/stats", { cookie: pro.cookieHeader });
      check("admin stats blocked for non-admin", r.status === 403, `got ${r.status}`);
    }
    {
      const adminId = await ensureUser("e2e-admin@test.local", "test-pass-123");
      await admin.from("users").update({ role: "admin" }).eq("id", adminId);
      const adm = await signInForCookies("e2e-admin@test.local", "test-pass-123");
      const r = await req("GET", "/api/admin/stats", { cookie: adm.cookieHeader });
      check("admin stats for admin -> 200", r.status === 200 && (r.json?.users?.total ?? 0) >= 2,
        `got ${r.status} ${r.text.slice(0, 120)}`);
      const r2 = await req("PATCH", "/api/admin/users", {
        cookie: adm.cookieHeader,
        body: { user_id: freeId, tier: "pro" },
      });
      const { data: u } = await admin.from("users").select("tier").eq("id", freeId).single();
      check("admin can change user tier", r2.status === 200 && u?.tier === "pro",
        `got ${r2.status} tier=${u?.tier}`);
      const r3 = await req("PATCH", "/api/admin/users", {
        cookie: adm.cookieHeader,
        body: { user_id: adminId, role: "user" },
      });
      check("admin self-demotion blocked", r3.status >= 400, `got ${r3.status}`);
      await admin.auth.admin.deleteUser(adminId).catch(() => {});
    }

    // ---------- security: direct REST probes ----------
    {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/users?select=email`, {
        headers: { apikey: ANON_KEY },
      });
      const rows = await r.json().catch(() => null);
      check("RLS: anon cannot read users via REST", Array.isArray(rows) ? rows.length === 0 : r.status >= 400,
        `status=${r.status} rows=${JSON.stringify(rows).slice(0, 80)}`);
    }
    {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/users?id=eq.${proId}`,
        {
          method: "PATCH",
          headers: {
            apikey: ANON_KEY,
            authorization: `Bearer ${pro.accessToken}`,
            "content-type": "application/json",
            prefer: "return=minimal",
          },
          body: JSON.stringify({ tier: "ai_premium" }),
        }
      );
      const { data: u } = await admin.from("users").select("tier").eq("id", proId).single();
      check("RLS: user cannot self-upgrade tier via REST",
        r.status >= 400 && u?.tier === "pro",
        `status=${r.status} tier=${u?.tier}`);
    }

    // ---------- signout ----------
    {
      const r = await req("POST", "/auth/signout", { cookie: free.cookieHeader });
      check("POST /auth/signout redirects", r.status >= 300 && r.status < 400, `got ${r.status}`);
    }

    // ---------- cleanup ----------
    await admin.auth.admin.deleteUser(freeId).catch(() => {});
    await admin.auth.admin.deleteUser(proId).catch(() => {});
  } finally {
    mock.kill();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) {
    console.log("FAILED:");
    for (const f of failed) console.log(`  ✗ ${f.name} — ${f.detail}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});

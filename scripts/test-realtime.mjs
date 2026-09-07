#!/usr/bin/env node
/**
 * Verifies the live-telemetry pipeline end to end:
 * user subscribes to Realtime INSERTs on telemetry_points (RLS-scoped),
 * the ingest API writes points with the service role, the subscriber
 * must receive them over the websocket.
 *
 * Usage: node scripts/test-realtime.mjs [baseUrl]
 */
import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  ANON_KEY,
  adminClient,
  ensureUser,
} from "./lib/supabase-test-auth.mjs";

const BASE = process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:3002";

async function main() {
  const admin = adminClient();
  const userId = await ensureUser("e2e-realtime@test.local", "test-pass-123");

  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { error: signInError } = await client.auth.signInWithPassword({
    email: "e2e-realtime@test.local",
    password: "test-pass-123",
  });
  if (signInError) throw new Error(`signIn: ${signInError.message}`);
  await client.realtime.setAuth(); // forward the user JWT to realtime

  // API key for ingest
  const keyRes = await fetch(`${BASE}/api/keys`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // route uses cookie auth — call supabase directly instead
    },
  });
  void keyRes;
  // Create the API key directly (hash) to avoid cookie plumbing here.
  const { createHash, randomBytes } = await import("node:crypto");
  const rawKey = `gt7_${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const { error: keyErr } = await admin
    .from("api_keys")
    .insert({ user_id: userId, key_hash: keyHash, name: "realtime-e2e" });
  if (keyErr) throw new Error(`api key insert: ${keyErr.message}`);

  // Create the session first so we can subscribe before points arrive.
  const first = await fetch(`${BASE}/api/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${rawKey}` },
    body: JSON.stringify({
      is_new_session: true,
      track_name: "Realtime Test Track",
      points: [{ packet_id: 1, speed_ms: 10, rpm: 3000, current_lap: 1 }],
    }),
  });
  const firstJson = await first.json();
  const sessionId = firstJson.session_id;
  if (!sessionId) throw new Error(`ingest failed: ${JSON.stringify(firstJson)}`);

  let received = 0;
  let firstPayload = null;
  const channel = client
    .channel(`live:${sessionId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "telemetry_points",
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        received++;
        // WAL replay may also deliver the pre-subscribe seed point; assert
        // against the batch we ingest below (packet_id >= 100).
        if (!firstPayload && payload.new?.packet_id >= 100) firstPayload = payload.new;
      }
    );

  const status = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve("TIMED_OUT"), 10000);
    channel.subscribe((s) => {
      if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "CLOSED") {
        clearTimeout(timer);
        resolve(s);
      }
    });
  });
  console.log(`subscribe status: ${status}`);
  if (status !== "SUBSCRIBED") {
    throw new Error(`realtime subscription failed: ${status}`);
  }
  // WALRUS materializes the subscription slightly after the join ack;
  // give it a moment so the very first inserts aren't dropped.
  await new Promise((r) => setTimeout(r, 1500));

  // Ingest a visible batch.
  const res = await fetch(`${BASE}/api/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${rawKey}` },
    body: JSON.stringify({
      session_id: sessionId,
      points: Array.from({ length: 5 }, (_, i) => ({
        packet_id: 100 + i,
        speed_ms: 55.5,
        rpm: 7000,
        gear: 4,
        throttle: 255,
        brake: 0,
        current_lap: 1,
      })),
    }),
  });
  if (!res.ok) throw new Error(`ingest batch failed: ${res.status}`);

  const deadline = Date.now() + 10000;
  while (received < 5 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`events received: ${received}/5`);
  if (firstPayload) {
    console.log(
      `payload sanity: speed_ms=${firstPayload.speed_ms} rpm=${firstPayload.rpm} gear=${firstPayload.gear} lap=${firstPayload.lap_number}`
    );
  }

  await client.removeChannel(channel);
  await admin.auth.admin.deleteUser(userId).catch(() => {});

  if (received < 5) {
    console.error("✗ realtime pipeline FAILED (events missing)");
    process.exit(1);
  }
  const ok =
    firstPayload &&
    Number(firstPayload.speed_ms) === 55.5 &&
    Number(firstPayload.rpm) === 7000 &&
    firstPayload.lap_number === 1;
  if (!ok) {
    console.error("✗ realtime payload mismatch");
    process.exit(1);
  }
  console.log("✓ realtime live-telemetry pipeline verified");
}

main().catch((e) => {
  console.error("FATAL", e.message);
  process.exit(1);
});

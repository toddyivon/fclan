#!/usr/bin/env node
/**
 * Seeds a demo user + a realistic telemetry session so every dashboard
 * feature has data to show (charts, track map, lap compare, ghost replay,
 * fuel strategy, consistency, leaderboard).
 *
 * Usage:
 *   SUPABASE_URL=http://localhost:8100 \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/seed-demo.mjs [email] [password]
 */
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

const URL = process.env.SUPABASE_URL ?? "http://localhost:8100";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is required");
  process.exit(1);
}
const EMAIL = process.argv[2] ?? "demo@gt7.local";
const PASSWORD = process.argv[3] ?? "gt7demo123";

const TRACK = "Deep Forest Raceway";
const CAR = "Mazda RX-7 Spirit R (FD)";
const CAR_CODE = 2034;
// Three laps: warm-up, flyer, cool-down — sums drive the fuel model too.
const LAP_TIMES_MS = [94350, 91207, 95820];
const HZ = 10; // seeded sample rate (the real app downsamples 60Hz -> 10Hz)

const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });

/** Closed circuit: skewed ellipse with two chicane wobbles. t in [0,1). */
function trackPoint(t) {
  const a = t * 2 * Math.PI;
  const wobble = Math.sin(3 * a) * 60 + Math.sin(7 * a) * 18;
  return {
    x: 420 * Math.cos(a) + wobble,
    z: 260 * Math.sin(a) + Math.cos(2 * a) * 40,
  };
}

/** Speed profile along the lap: straights fast, three braking zones. */
function speedAt(t, lapQuality) {
  const a = t * 2 * Math.PI;
  const base = 52 + 26 * Math.sin(a + 0.7) * Math.sin(2.1 * a - 0.3);
  const brakeZones = Math.max(0, Math.sin(3 * a + 1.2)) ** 6 * 28;
  return Math.max(18, (base - brakeZones) * lapQuality);
}

function buildLapPoints({ lapNumber, lapTimeMs, startPacket, lastLapMs, bestLapMs, fuelStart }) {
  const samples = Math.round((lapTimeMs / 1000) * HZ);
  const points = [];
  const quality = 1 + (91207 - lapTimeMs) / 400000; // faster lap = higher speeds
  for (let i = 0; i < samples; i++) {
    const t = i / samples;
    const { x, z } = trackPoint(t);
    const speed = speedAt(t, quality);
    const prevSpeed = speedAt(Math.max(0, (i - 1) / samples), quality);
    const accel = speed - prevSpeed;
    const gear = speed < 25 ? 2 : speed < 38 ? 3 : speed < 52 ? 4 : speed < 66 ? 5 : 6;
    points.push({
      packet_id: startPacket + i,
      posX: x, posY: 12, posZ: z,
      velX: speed * Math.cos(t * 2 * Math.PI), velY: 0, velZ: speed * Math.sin(t * 2 * Math.PI),
      rotX: 0, rotY: Math.sin(t * Math.PI * 2), rotZ: 0, rotW: Math.cos(t * Math.PI * 2),
      rpm: 3000 + (speed / 80) * 5200 + (gear === 6 ? -400 : 0),
      speed_ms: speed,
      turbo_boost: 1 + Math.max(0, accel) * 0.08,
      throttle: accel >= 0 ? Math.min(255, 180 + accel * 40) : 0,
      brake: accel < -0.8 ? Math.min(255, -accel * 70) : 0,
      gear,
      suggested_gear: 15,
      fuel_level: fuelStart - (i / samples) * 1.9,
      fuel_capacity: 66,
      tire_temp_fl: 68 + speed * 0.35 + Math.sin(t * 9) * 4,
      tire_temp_fr: 70 + speed * 0.36 + Math.cos(t * 9) * 4,
      tire_temp_rl: 74 + speed * 0.4,
      tire_temp_rr: 76 + speed * 0.41,
      flags: 0b1001,
      current_lap: lapNumber,
      total_laps: 0,
      best_lap_ms: bestLapMs,
      last_lap_ms: lastLapMs,
    });
  }
  return points;
}

async function main() {
  console.log(`Seeding demo data at ${URL} for ${EMAIL}`);

  // 1. User (recreate for idempotency)
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users?.find((u) => u.email === EMAIL);
  if (existing) await admin.auth.admin.deleteUser(existing.id);
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name: "Demo Driver" },
  });
  if (userErr) throw new Error(`createUser: ${userErr.message}`);
  const userId = created.user.id;

  // Full access for testing every gated feature + the admin panel.
  const { error: tierErr } = await admin
    .from("users")
    .update({ tier: "ai_premium", role: "admin", name: "Demo Driver" })
    .eq("id", userId);
  if (tierErr) throw new Error(`tier update: ${tierErr.message}`);

  // 2. API key for the mobile app
  const plaintext = `gt7_${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(plaintext).digest("hex");
  const { error: keyErr } = await admin
    .from("api_keys")
    .insert({ user_id: userId, key_hash: keyHash, name: "Demo key" });
  if (keyErr) throw new Error(`api key: ${keyErr.message}`);
  await admin.rpc("refresh_api_key_count", { p_user_id: userId });

  // 3. Session with 3 laps of telemetry
  const startedAt = new Date(Date.now() - 30 * 60 * 1000);
  const { data: session, error: sessErr } = await admin
    .from("telemetry_sessions")
    .insert({
      user_id: userId,
      car_name: CAR,
      car_code: CAR_CODE,
      track_name: TRACK,
      started_at: startedAt.toISOString(),
      ended_at: new Date(startedAt.getTime() + 6 * 60 * 1000).toISOString(),
      total_laps: 3,
      best_lap_ms: Math.min(...LAP_TIMES_MS),
      current_lap: 3,
      last_lap_ms: LAP_TIMES_MS[2],
    })
    .select("id")
    .single();
  if (sessErr) throw new Error(`session: ${sessErr.message}`);

  let packet = 1000;
  let fuel = 64;
  let best = -1;
  const allPoints = [];
  LAP_TIMES_MS.forEach((lapTimeMs, idx) => {
    const lastLapMs = idx === 0 ? -1 : LAP_TIMES_MS[idx - 1];
    if (idx > 0) best = best < 0 ? LAP_TIMES_MS[idx - 1] : Math.min(best, LAP_TIMES_MS[idx - 1]);
    const pts = buildLapPoints({
      lapNumber: idx + 1, lapTimeMs, startPacket: packet,
      lastLapMs, bestLapMs: best, fuelStart: fuel,
    });
    packet += pts.length;
    fuel -= 1.9;
    allPoints.push(...pts.map((p) => ({ ...p, session_id: session.id, lap_number: p.current_lap })));
  });

  const rows = allPoints.map((p) => ({
    session_id: p.session_id, packet_id: p.packet_id,
    pos_x: p.posX, pos_y: p.posY, pos_z: p.posZ,
    vel_x: p.velX, vel_y: p.velY, vel_z: p.velZ,
    rot_x: p.rotX, rot_y: p.rotY, rot_z: p.rotZ, rot_w: p.rotW,
    rpm: p.rpm, speed_ms: p.speed_ms, turbo_boost: p.turbo_boost,
    throttle: Math.round(p.throttle), brake: Math.round(p.brake),
    gear: p.gear, suggested_gear: p.suggested_gear,
    fuel_level: p.fuel_level, fuel_capacity: p.fuel_capacity,
    tire_temp_fl: p.tire_temp_fl, tire_temp_fr: p.tire_temp_fr,
    tire_temp_rl: p.tire_temp_rl, tire_temp_rr: p.tire_temp_rr,
    flags: p.flags, lap_number: p.lap_number,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from("telemetry_points").insert(rows.slice(i, i + 500));
    if (error) throw new Error(`points chunk ${i}: ${error.message}`);
  }

  const { error: lapErr } = await admin.from("lap_data").insert(
    LAP_TIMES_MS.map((ms, idx) => ({
      session_id: session.id, lap_number: idx + 1, lap_time_ms: ms,
    }))
  );
  if (lapErr) throw new Error(`laps: ${lapErr.message}`);

  const { error: lbErr } = await admin.from("leaderboard_entries").upsert(
    {
      user_id: userId, track_name: TRACK, car_name: CAR,
      lap_time_ms: Math.min(...LAP_TIMES_MS), session_id: session.id,
      lap_number: LAP_TIMES_MS.indexOf(Math.min(...LAP_TIMES_MS)) + 1,
    },
    { onConflict: "user_id,track_name" }
  );
  if (lbErr) throw new Error(`leaderboard: ${lbErr.message}`);

  console.log("\n=== Demo seed complete ===");
  console.log(`login:    ${EMAIL}`);
  console.log(`password: ${PASSWORD}`);
  console.log(`tier:     ai_premium (admin)`);
  console.log(`API key:  ${plaintext}`);
  console.log(`session:  ${session.id} (${TRACK}, 3 laps, ${rows.length} points)`);
}

main().catch((e) => {
  console.error("FATAL", e.message);
  process.exit(1);
});

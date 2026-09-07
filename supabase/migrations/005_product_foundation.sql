-- Product foundation: billing states, ingest idempotency, AI persistence,
-- shared laps, leaderboards, retention scheduling.
-- Depends on 004_security_and_laps.sql

-- 1. Stripe subscription lifecycle: accept every status the API can send.
ALTER TABLE stripe_subscriptions DROP CONSTRAINT IF EXISTS stripe_subscriptions_status_check;
ALTER TABLE stripe_subscriptions
  ADD CONSTRAINT stripe_subscriptions_status_check
  CHECK (status IN ('active','trialing','canceled','past_due','unpaid',
                    'incomplete','incomplete_expired','paused'));

-- Webhooks upsert by subscription id; make that idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_stripe_subscriptions_sub_id
  ON stripe_subscriptions (stripe_sub_id);

-- 2. Ingest idempotency: a retried batch must not duplicate points.
--    packet_id is monotonic per console session, unique within a session.
DELETE FROM telemetry_points a
 USING telemetry_points b
 WHERE a.session_id = b.session_id AND a.packet_id = b.packet_id AND a.id > b.id;
DROP INDEX IF EXISTS idx_telemetry_points_session_packet;
CREATE UNIQUE INDEX IF NOT EXISTS uq_telemetry_points_session_packet
  ON telemetry_points (session_id, packet_id);

-- 3. AI analyses: persistable by the analyzing user, listable per user.
ALTER TABLE ai_analyses
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS analysis_text text;

UPDATE ai_analyses a
   SET user_id = s.user_id
  FROM telemetry_sessions s
 WHERE a.session_id = s.id AND a.user_id IS NULL;

CREATE POLICY "users_insert_own_ai_analyses" ON ai_analyses
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM telemetry_sessions s
            WHERE s.id = ai_analyses.session_id AND s.user_id = auth.uid())
  );
CREATE INDEX IF NOT EXISTS idx_ai_analyses_user_created
  ON ai_analyses (user_id, created_at DESC);

-- 4. Shareable lap links (public lap cards). Public pages resolve the token
--    with the service role; no anon policies on purpose.
CREATE TABLE IF NOT EXISTS shared_laps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  session_id uuid NOT NULL REFERENCES telemetry_sessions(id) ON DELETE CASCADE,
  lap_number integer,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
ALTER TABLE shared_laps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_select_own_shared_laps" ON shared_laps
  FOR SELECT USING (auth.uid() = created_by);
CREATE POLICY "users_insert_own_shared_laps" ON shared_laps
  FOR INSERT WITH CHECK (
    auth.uid() = created_by AND
    EXISTS (SELECT 1 FROM telemetry_sessions s
            WHERE s.id = shared_laps.session_id AND s.user_id = auth.uid())
  );
CREATE POLICY "users_delete_own_shared_laps" ON shared_laps
  FOR DELETE USING (auth.uid() = created_by);

-- 5. Community leaderboards: one best lap per user per track.
--    Rows are written server-side (service role) when laps are finalized.
CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_name text NOT NULL,
  car_name text,
  lap_time_ms integer NOT NULL CHECK (lap_time_ms > 0),
  session_id uuid REFERENCES telemetry_sessions(id) ON DELETE SET NULL,
  lap_number integer,
  achieved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, track_name)
);
ALTER TABLE leaderboard_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leaderboard_read_all" ON leaderboard_entries
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE INDEX IF NOT EXISTS idx_leaderboard_track_time
  ON leaderboard_entries (track_name, lap_time_ms ASC);

-- Public display names come from users.name; expose a safe view for ranking.
CREATE OR REPLACE VIEW leaderboard_public
WITH (security_invoker = off) AS
SELECT le.id, le.track_name, le.car_name, le.lap_time_ms, le.lap_number,
       le.achieved_at, COALESCE(NULLIF(u.name, ''), 'Driver') AS driver_name
  FROM leaderboard_entries le
  JOIN users u ON u.id = le.user_id;
GRANT SELECT ON leaderboard_public TO authenticated;

-- 6. Free-tier retention: run the purge daily when pg_cron is available
--    (Supabase cloud has it; tolerate local stacks without it).
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule('purge-free-tier-sessions')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-free-tier-sessions');
  PERFORM cron.schedule('purge-free-tier-sessions', '17 3 * * *',
                        'SELECT purge_free_tier_sessions()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron unavailable, skipping schedule: %', SQLERRM;
END;
$$;

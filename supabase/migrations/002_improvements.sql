-- GT7 Telemetry SaaS — hardening + product foundation
-- Depends on 001_initial.sql

-- 1. Add role + quota columns to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role text CHECK (role IN ('user','admin')) DEFAULT 'user' NOT NULL;

-- 2. Recreate FKs with ON DELETE CASCADE where user deletion implies child cleanup
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_user_id_fkey;
ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE telemetry_sessions DROP CONSTRAINT IF EXISTS telemetry_sessions_user_id_fkey;
ALTER TABLE telemetry_sessions
  ADD CONSTRAINT telemetry_sessions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE telemetry_points DROP CONSTRAINT IF EXISTS telemetry_points_session_id_fkey;
ALTER TABLE telemetry_points
  ADD CONSTRAINT telemetry_points_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES telemetry_sessions(id) ON DELETE CASCADE;

ALTER TABLE lap_data DROP CONSTRAINT IF EXISTS lap_data_session_id_fkey;
ALTER TABLE lap_data
  ADD CONSTRAINT lap_data_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES telemetry_sessions(id) ON DELETE CASCADE;

ALTER TABLE ai_analyses DROP CONSTRAINT IF EXISTS ai_analyses_session_id_fkey;
ALTER TABLE ai_analyses
  ADD CONSTRAINT ai_analyses_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES telemetry_sessions(id) ON DELETE CASCADE;

ALTER TABLE stripe_subscriptions DROP CONSTRAINT IF EXISTS stripe_subscriptions_user_id_fkey;
ALTER TABLE stripe_subscriptions
  ADD CONSTRAINT stripe_subscriptions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 3. Hot-path indexes
CREATE INDEX IF NOT EXISTS idx_telemetry_points_session_ts
  ON telemetry_points (session_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_sessions_user_created
  ON telemetry_sessions (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_analyses_session_created
  ON ai_analyses (session_id, created_at DESC);

-- 4. Missing INSERT/UPDATE RLS policies for telemetry_points, lap_data, ai_analyses
CREATE POLICY "users_insert_own_telemetry" ON telemetry_points
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM telemetry_sessions s
            WHERE s.id = telemetry_points.session_id AND s.user_id = auth.uid())
  );

CREATE POLICY "users_insert_own_lap" ON lap_data
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM telemetry_sessions s
            WHERE s.id = lap_data.session_id AND s.user_id = auth.uid())
  );

-- 5. Persistent rate limiter (replaces in-memory Map)
CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL
);
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
-- service role only; no user-facing policies.

CREATE OR REPLACE FUNCTION consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  v_reset timestamptz;
  v_count integer;
BEGIN
  INSERT INTO rate_limits (key, count, reset_at)
  VALUES (p_key, 1, now() + make_interval(secs => p_window_seconds))
  ON CONFLICT (key) DO UPDATE
    SET count = CASE
                  WHEN rate_limits.reset_at < now() THEN 1
                  ELSE rate_limits.count + 1
                END,
        reset_at = CASE
                     WHEN rate_limits.reset_at < now()
                       THEN now() + make_interval(secs => p_window_seconds)
                     ELSE rate_limits.reset_at
                   END
  RETURNING count, reset_at INTO v_count, v_reset;
  RETURN v_count <= p_limit;
END;
$$;

-- 6. Stripe webhook idempotency
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id text PRIMARY KEY,
  type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- 7. Per-tier quotas
CREATE TABLE IF NOT EXISTS user_quotas (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tier text NOT NULL DEFAULT 'free',
  api_keys_used integer NOT NULL DEFAULT 0,
  api_keys_limit integer NOT NULL DEFAULT 1,
  ai_analyses_used integer NOT NULL DEFAULT 0,
  ai_analyses_limit integer NOT NULL DEFAULT 0,
  quota_reset_at timestamptz NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month')
);
ALTER TABLE user_quotas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_select_own_quota" ON user_quotas
  FOR SELECT USING (auth.uid() = user_id);

-- Seed user_quotas for existing users
INSERT INTO user_quotas (user_id, tier, api_keys_limit, ai_analyses_limit)
SELECT id, tier,
       CASE tier WHEN 'free' THEN 1 WHEN 'pro' THEN 5 WHEN 'ai_premium' THEN 999999 ELSE 1 END,
       CASE tier WHEN 'free' THEN 0 WHEN 'pro' THEN 50 WHEN 'ai_premium' THEN 999999 ELSE 0 END
FROM users
ON CONFLICT (user_id) DO NOTHING;

-- Keep user_quotas.tier in sync with users.tier
CREATE OR REPLACE FUNCTION sync_user_quota_tier() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE user_quotas
     SET tier = NEW.tier,
         api_keys_limit = CASE NEW.tier WHEN 'free' THEN 1 WHEN 'pro' THEN 5 WHEN 'ai_premium' THEN 999999 END,
         ai_analyses_limit = CASE NEW.tier WHEN 'free' THEN 0 WHEN 'pro' THEN 50 WHEN 'ai_premium' THEN 999999 END
   WHERE user_id = NEW.id;
  IF NOT FOUND THEN
    INSERT INTO user_quotas (user_id, tier,
      api_keys_limit, ai_analyses_limit)
    VALUES (NEW.id, NEW.tier,
      CASE NEW.tier WHEN 'free' THEN 1 WHEN 'pro' THEN 5 WHEN 'ai_premium' THEN 999999 END,
      CASE NEW.tier WHEN 'free' THEN 0 WHEN 'pro' THEN 50 WHEN 'ai_premium' THEN 999999 END);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_sync_quota ON users;
CREATE TRIGGER trg_users_sync_quota
  AFTER INSERT OR UPDATE OF tier ON users
  FOR EACH ROW EXECUTE FUNCTION sync_user_quota_tier();

-- 8. Retention: delete Free-tier telemetry older than 7 days (call via pg_cron or Edge Function)
CREATE OR REPLACE FUNCTION purge_free_tier_sessions() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  deleted integer;
BEGIN
  DELETE FROM telemetry_sessions s
   USING users u
   WHERE s.user_id = u.id
     AND u.tier = 'free'
     AND s.started_at < now() - interval '7 days';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

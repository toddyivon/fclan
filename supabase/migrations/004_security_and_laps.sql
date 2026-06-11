-- Security hardening + lap-tracking foundation
-- Depends on 003_auth_sync.sql

-- 1. CRITICAL: users table had RLS disabled — any anon client could read every
--    user's email/tier. Enable RLS and scope access to the row owner.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_self" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_update_self" ON users
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Column-level guard: users may only change their display name, never their
-- own tier/role/stripe linkage (those are managed by webhooks/admin).
REVOKE UPDATE ON users FROM authenticated;
GRANT UPDATE (name) ON users TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON users FROM anon;

-- 2. Tie public.users to auth.users so deleting an auth user cleans up the
--    mirrored row (and, via existing cascades, all their data).
DELETE FROM users u WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_id_auth_fkey;
ALTER TABLE users
  ADD CONSTRAINT users_id_auth_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Carry the signup display name into the mirror.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 3. Fix quota limits seeded by 003 with values that contradict the product
--    spec and the 002 sync trigger (free gets NO AI analyses, pro gets 50).
UPDATE user_quotas q
   SET api_keys_limit   = CASE q.tier WHEN 'free' THEN 1 WHEN 'pro' THEN 5 WHEN 'ai_premium' THEN 999999 ELSE 1 END,
       ai_analyses_limit = CASE q.tier WHEN 'free' THEN 0 WHEN 'pro' THEN 50 WHEN 'ai_premium' THEN 999999 ELSE 0 END;

-- 4. Atomic AI-quota consumption (the read-then-update in app code raced).
CREATE OR REPLACE FUNCTION consume_ai_quota(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row user_quotas;
BEGIN
  -- lazily roll the monthly window, then take one unit if available
  UPDATE user_quotas
     SET ai_analyses_used = 0,
         quota_reset_at = date_trunc('month', now()) + interval '1 month'
   WHERE user_id = p_user_id AND quota_reset_at < now();

  UPDATE user_quotas
     SET ai_analyses_used = ai_analyses_used + 1
   WHERE user_id = p_user_id AND ai_analyses_used < ai_analyses_limit
  RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN jsonb_build_object('allowed', true,
      'used', v_row.ai_analyses_used, 'limit', v_row.ai_analyses_limit,
      'tier', v_row.tier, 'reset_at', v_row.quota_reset_at);
  END IF;

  SELECT * INTO v_row FROM user_quotas WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_quota_record');
  END IF;
  RETURN jsonb_build_object('allowed', false,
    'reason', CASE WHEN v_row.ai_analyses_limit = 0 THEN 'upgrade_required' ELSE 'quota_exhausted' END,
    'used', v_row.ai_analyses_used, 'limit', v_row.ai_analyses_limit,
    'tier', v_row.tier, 'reset_at', v_row.quota_reset_at);
END;
$$;
REVOKE EXECUTE ON FUNCTION consume_ai_quota(uuid) FROM anon, authenticated;

-- Same race exists for api_keys_used; count keys atomically instead of a cached counter.
CREATE OR REPLACE FUNCTION refresh_api_key_count(p_user_id uuid)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE user_quotas
     SET api_keys_used = (SELECT count(*) FROM api_keys WHERE user_id = p_user_id)
   WHERE user_id = p_user_id
  RETURNING api_keys_used;
$$;
REVOKE EXECUTE ON FUNCTION refresh_api_key_count(uuid) FROM anon, authenticated;

-- 5. Lap tracking: GT7 packets carry lap count + last/best lap ms; persist them.
ALTER TABLE telemetry_points ADD COLUMN IF NOT EXISTS lap_number integer;
ALTER TABLE telemetry_sessions
  ADD COLUMN IF NOT EXISTS current_lap integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_lap_ms integer DEFAULT -1;

-- lap_data rows are finalized once per lap; make that idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lap_data_session_lap
  ON lap_data (session_id, lap_number);

-- 6. Users can delete their own sessions (cascades to points/laps/analyses).
CREATE POLICY "users_delete_own_sessions" ON telemetry_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Realtime for live dashboard + correct function privileges.
-- Depends on 005_product_foundation.sql

-- 1. Live telemetry: the dashboard subscribes to INSERTs on telemetry_points
--    and to session lifecycle changes. Realtime enforces RLS per subscriber.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE telemetry_points;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE telemetry_sessions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. CREATE FUNCTION grants EXECUTE to PUBLIC by default, so the REVOKEs in
--    002/004 from anon/authenticated were ineffective. Lock service-only
--    functions down properly (anon could e.g. burn rate-limit windows).
REVOKE ALL ON FUNCTION consume_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_rate_limit(text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION consume_ai_quota(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_ai_quota(uuid) TO service_role;

REVOKE ALL ON FUNCTION refresh_api_key_count(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION refresh_api_key_count(uuid) TO service_role;

REVOKE ALL ON FUNCTION purge_free_tier_sessions() FROM PUBLIC, anon, authenticated;

-- 3. Refund an AI-analysis unit when the model call fails post-consume.
CREATE OR REPLACE FUNCTION refund_ai_quota(p_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE user_quotas
     SET ai_analyses_used = greatest(0, ai_analyses_used - 1)
   WHERE user_id = p_user_id;
$$;
REVOKE ALL ON FUNCTION refund_ai_quota(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION refund_ai_quota(uuid) TO service_role;

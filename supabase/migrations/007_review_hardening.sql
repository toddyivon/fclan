-- Fixes from the adversarial review: atomic API-key creation and
-- out-of-order webhook protection.
-- Depends on 006_realtime_and_grants.sql

-- 1. Atomic API-key creation: lock the quota row, count REAL keys, insert
--    only when under the tier limit. Closes the TOCTOU race in /api/keys.
CREATE OR REPLACE FUNCTION create_api_key(p_user_id uuid, p_key_hash text, p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit integer;
  v_count integer;
  v_row api_keys;
BEGIN
  SELECT api_keys_limit INTO v_limit
    FROM user_quotas WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_quota_record');
  END IF;

  SELECT count(*) INTO v_count FROM api_keys WHERE user_id = p_user_id;
  IF v_count >= v_limit THEN
    UPDATE user_quotas SET api_keys_used = v_count WHERE user_id = p_user_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'limit_reached',
                              'used', v_count, 'limit', v_limit);
  END IF;

  INSERT INTO api_keys (user_id, key_hash, name)
  VALUES (p_user_id, p_key_hash, p_name)
  RETURNING * INTO v_row;

  UPDATE user_quotas SET api_keys_used = v_count + 1 WHERE user_id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'id', v_row.id, 'name', v_row.name,
                            'created_at', v_row.created_at,
                            'used', v_count + 1, 'limit', v_limit);
END;
$$;
REVOKE ALL ON FUNCTION create_api_key(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_api_key(uuid, text, text) TO service_role;

-- 2. Webhook ordering: remember when the last applied Stripe event was
--    created so a stale retry can never overwrite newer subscription state.
ALTER TABLE stripe_subscriptions
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz;

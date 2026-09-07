-- Mirror auth.users into public.users on signup, so tier/quotas work.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Backfill existing auth users.
INSERT INTO public.users (id, email)
SELECT id, email FROM auth.users
WHERE email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Seed user_quotas for every public.users row that doesn't have one yet.
INSERT INTO public.user_quotas (user_id, tier, api_keys_limit, ai_analyses_limit)
SELECT u.id, u.tier,
  CASE u.tier WHEN 'free' THEN 1 WHEN 'pro' THEN 5 WHEN 'ai_premium' THEN 999999 END,
  CASE u.tier WHEN 'free' THEN 50 WHEN 'pro' THEN 500 WHEN 'ai_premium' THEN 999999 END
FROM public.users u
LEFT JOIN public.user_quotas q ON q.user_id = u.id
WHERE q.user_id IS NULL;

CREATE OR REPLACE FUNCTION public.gen_referral_code(_len int DEFAULT 8)
RETURNS text LANGUAGE sql VOLATILE SET search_path = public, extensions, pg_catalog AS $$
  SELECT upper(substr(replace(encode(gen_random_bytes(16), 'base64'), '/', ''), 1, _len));
$$;
REVOKE ALL ON FUNCTION public.gen_referral_code(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gen_referral_code(int) TO service_role;
REVOKE EXECUTE ON FUNCTION public.current_partner_id() FROM anon;
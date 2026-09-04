CREATE TABLE public.platform_admin_allowlist (
  email text PRIMARY KEY,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_admin_allowlist TO authenticated;
GRANT ALL ON public.platform_admin_allowlist TO service_role;

ALTER TABLE public.platform_admin_allowlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins read allowlist"
  ON public.platform_admin_allowlist FOR SELECT TO authenticated
  USING (public.is_platform_admin());

INSERT INTO public.platform_admin_allowlist (email, note)
VALUES ('pugoymarvin14@gmail.com', 'Initial platform administrator')
ON CONFLICT (email) DO NOTHING;

CREATE OR REPLACE FUNCTION public.enforce_platform_admin_allowlist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _email text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  SELECT lower(u.email) INTO _email FROM auth.users u WHERE u.id = NEW.user_id;

  IF _email IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.platform_admin_allowlist a WHERE lower(a.email) = _email
  ) THEN
    RAISE EXCEPTION 'This account is not on the platform administrator allowlist';
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER platform_admins_allowlist_guard
  BEFORE INSERT OR UPDATE ON public.platform_admins
  FOR EACH ROW EXECUTE FUNCTION public.enforce_platform_admin_allowlist();
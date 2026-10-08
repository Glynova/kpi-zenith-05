CREATE OR REPLACE FUNCTION public.provision_allowlisted_platform_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.platform_admin_allowlist a WHERE lower(a.email) = lower(NEW.email)
  ) THEN
    INSERT INTO public.platform_admins (user_id, role, status)
    VALUES (NEW.id, 'superadmin', 'active')
    ON CONFLICT (user_id) DO UPDATE SET status = 'active', role = 'superadmin';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_provision_platform_admin ON auth.users;
CREATE TRIGGER on_auth_user_provision_platform_admin
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.provision_allowlisted_platform_admin();

-- Backfill: remove admin rows for deleted accounts, provision current allowlisted accounts
DELETE FROM public.platform_admins pa
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = pa.user_id);

INSERT INTO public.platform_admins (user_id, role, status)
SELECT u.id, 'superadmin', 'active'
FROM auth.users u
JOIN public.platform_admin_allowlist a ON lower(a.email) = lower(u.email)
ON CONFLICT (user_id) DO UPDATE SET status = 'active', role = 'superadmin';
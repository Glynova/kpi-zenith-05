DROP POLICY IF EXISTS "members insert" ON public.invoices;
DROP POLICY IF EXISTS "members update" ON public.invoices;
CREATE POLICY "members insert" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (public.can_write_business(business_id) AND public.business_has_feature(business_id,'invoices'));
CREATE POLICY "members update" ON public.invoices FOR UPDATE TO authenticated
  USING (public.can_write_business(business_id) AND public.business_has_feature(business_id,'invoices'))
  WITH CHECK (public.can_write_business(business_id) AND public.business_has_feature(business_id,'invoices'));

DROP POLICY IF EXISTS "members read logs" ON public.audit_logs;
CREATE POLICY "members read logs" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_business_member(business_id) AND public.business_has_feature(business_id,'audit_logs'));

CREATE OR REPLACE FUNCTION public.provision_allowlisted_platform_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email IS NOT NULL AND NEW.email_confirmed_at IS NOT NULL AND EXISTS (
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
  AFTER INSERT OR UPDATE OF email, email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.provision_allowlisted_platform_admin();

UPDATE public.platform_admins pa SET status = 'suspended'
FROM auth.users u
WHERE u.id = pa.user_id AND u.email_confirmed_at IS NULL AND pa.status = 'active';
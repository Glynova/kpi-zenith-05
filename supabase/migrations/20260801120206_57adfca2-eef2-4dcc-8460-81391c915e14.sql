-- 1. Remove self-insert privilege escalation on user_businesses
DROP POLICY IF EXISTS "join or admin adds member" ON public.user_businesses;
CREATE POLICY "admins add members" ON public.user_businesses
  FOR INSERT TO authenticated
  WITH CHECK (public.is_business_admin(business_id));

-- 2. Finance/HR-sensitive write gate
CREATE OR REPLACE FUNCTION public.can_manage_sensitive(_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_businesses ub
    WHERE ub.business_id = _business_id
      AND ub.user_id = auth.uid()
      AND ub.status = 'active'
      AND ub.role IN ('owner','admin','manager','accountant')
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_sensitive(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_sensitive(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "members insert" ON public.payroll;
DROP POLICY IF EXISTS "members update" ON public.payroll;
DROP POLICY IF EXISTS "members delete" ON public.payroll;
CREATE POLICY "sensitive insert" ON public.payroll FOR INSERT TO authenticated WITH CHECK (public.can_manage_sensitive(business_id));
CREATE POLICY "sensitive update" ON public.payroll FOR UPDATE TO authenticated USING (public.can_manage_sensitive(business_id)) WITH CHECK (public.can_manage_sensitive(business_id));
CREATE POLICY "sensitive delete" ON public.payroll FOR DELETE TO authenticated USING (public.can_manage_sensitive(business_id));

DROP POLICY IF EXISTS "members insert" ON public.employees;
DROP POLICY IF EXISTS "members update" ON public.employees;
DROP POLICY IF EXISTS "members delete" ON public.employees;
CREATE POLICY "sensitive insert" ON public.employees FOR INSERT TO authenticated WITH CHECK (public.can_manage_sensitive(business_id));
CREATE POLICY "sensitive update" ON public.employees FOR UPDATE TO authenticated USING (public.can_manage_sensitive(business_id)) WITH CHECK (public.can_manage_sensitive(business_id));
CREATE POLICY "sensitive delete" ON public.employees FOR DELETE TO authenticated USING (public.can_manage_sensitive(business_id));

DROP POLICY IF EXISTS "members insert" ON public.accounts_payable;
DROP POLICY IF EXISTS "members update" ON public.accounts_payable;
DROP POLICY IF EXISTS "members delete" ON public.accounts_payable;
CREATE POLICY "sensitive insert" ON public.accounts_payable FOR INSERT TO authenticated WITH CHECK (public.can_manage_sensitive(business_id));
CREATE POLICY "sensitive update" ON public.accounts_payable FOR UPDATE TO authenticated USING (public.can_manage_sensitive(business_id)) WITH CHECK (public.can_manage_sensitive(business_id));
CREATE POLICY "sensitive delete" ON public.accounts_payable FOR DELETE TO authenticated USING (public.can_manage_sensitive(business_id));

DROP POLICY IF EXISTS "members insert" ON public.accounts_receivable;
DROP POLICY IF EXISTS "members update" ON public.accounts_receivable;
DROP POLICY IF EXISTS "members delete" ON public.accounts_receivable;
CREATE POLICY "sensitive insert" ON public.accounts_receivable FOR INSERT TO authenticated WITH CHECK (public.can_manage_sensitive(business_id));
CREATE POLICY "sensitive update" ON public.accounts_receivable FOR UPDATE TO authenticated USING (public.can_manage_sensitive(business_id)) WITH CHECK (public.can_manage_sensitive(business_id));
CREATE POLICY "sensitive delete" ON public.accounts_receivable FOR DELETE TO authenticated USING (public.can_manage_sensitive(business_id));

-- 3. Audit logs are append-only and immutable, enforced by grants too
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM authenticated, anon;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;

-- 4. Trigger-only SECURITY DEFINER functions must not be directly callable
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_business() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_inventory_movement() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_business_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_business_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_write_business(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_role(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_business_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_business_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_business(uuid) TO authenticated, service_role;
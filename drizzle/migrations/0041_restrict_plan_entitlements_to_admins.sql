DROP POLICY "Signed-in users read entitlements" ON public.plan_entitlements;

CREATE POLICY "Platform admins read entitlements"
ON public.plan_entitlements
FOR SELECT
TO authenticated
USING (public.is_platform_admin());

-- Plan feature lists are shared catalog data, not user data. Signed-in users
-- read them through this fixed-shape function instead of the table directly.
CREATE OR REPLACE FUNCTION public.get_plan_entitlements()
RETURNS TABLE(plan_id uuid, feature_key text, enabled boolean, limit_value numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pe.plan_id, pe.feature_key, pe.enabled, pe.limit_value
  FROM public.plan_entitlements pe
$$;

GRANT EXECUTE ON FUNCTION public.get_plan_entitlements() TO authenticated;
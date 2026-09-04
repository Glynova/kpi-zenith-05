ALTER TABLE public.platform_admins
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.platform_admins
  DROP CONSTRAINT IF EXISTS platform_admins_role_check,
  DROP CONSTRAINT IF EXISTS platform_admins_status_check;
ALTER TABLE public.platform_admins
  ADD CONSTRAINT platform_admins_role_check CHECK (role IN ('admin','superadmin')),
  ADD CONSTRAINT platform_admins_status_check CHECK (status IN ('active','suspended'));

DROP TRIGGER IF EXISTS set_platform_admins_updated_at ON public.platform_admins;
CREATE TRIGGER set_platform_admins_updated_at
  BEFORE UPDATE ON public.platform_admins
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = auth.uid() AND status = 'active'
  );
$$;

CREATE TABLE IF NOT EXISTS public.platform_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  action text NOT NULL,
  success boolean NOT NULL DEFAULT true,
  detail jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_admin_audit TO authenticated;
GRANT ALL ON public.platform_admin_audit TO service_role;

ALTER TABLE public.platform_admin_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins read admin audit" ON public.platform_admin_audit;
CREATE POLICY "Platform admins read admin audit"
  ON public.platform_admin_audit FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE INDEX IF NOT EXISTS platform_admin_audit_created_idx
  ON public.platform_admin_audit (created_at DESC);
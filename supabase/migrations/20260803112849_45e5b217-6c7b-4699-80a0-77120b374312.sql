ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS industry text;

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS enable_services boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_low_stock_alerts boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_stock_counts boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_stock_transfers boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_food_costing boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.business_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  completed boolean NOT NULL DEFAULT false,
  current_step integer NOT NULL DEFAULT 1,
  draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS business_onboarding_business_id_idx ON public.business_onboarding(business_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_onboarding TO authenticated;
GRANT ALL ON public.business_onboarding TO service_role;

ALTER TABLE public.business_onboarding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read onboarding" ON public.business_onboarding;
CREATE POLICY "members read onboarding" ON public.business_onboarding
  FOR SELECT TO authenticated USING (public.is_business_member(business_id));

DROP POLICY IF EXISTS "writers insert onboarding" ON public.business_onboarding;
CREATE POLICY "writers insert onboarding" ON public.business_onboarding
  FOR INSERT TO authenticated WITH CHECK (public.can_write_business(business_id));

DROP POLICY IF EXISTS "writers update onboarding" ON public.business_onboarding;
CREATE POLICY "writers update onboarding" ON public.business_onboarding
  FOR UPDATE TO authenticated USING (public.can_write_business(business_id))
  WITH CHECK (public.can_write_business(business_id));

DROP POLICY IF EXISTS "admins delete onboarding" ON public.business_onboarding;
CREATE POLICY "admins delete onboarding" ON public.business_onboarding
  FOR DELETE TO authenticated USING (public.is_business_admin(business_id));

DROP TRIGGER IF EXISTS set_updated_at ON public.business_onboarding;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.business_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
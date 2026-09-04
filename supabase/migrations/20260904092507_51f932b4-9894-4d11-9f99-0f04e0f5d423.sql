-- =============== helpers ===============
CREATE OR REPLACE FUNCTION public.gen_referral_code(_len int DEFAULT 8)
RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT upper(substr(replace(encode(gen_random_bytes(16), 'base64'), '/', ''), 1, _len));
$$;

-- =============== platform settings ===============
CREATE TABLE public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform admins manage settings" ON public.platform_settings
  FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

INSERT INTO public.platform_settings(key, value) VALUES
  ('affiliate', '{"default_commission_rate":20,"default_commission_duration":"lifetime","cookie_days":30}'::jsonb);

-- =============== affiliate applications ===============
CREATE TABLE public.affiliate_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  company text,
  website text,
  audience text,
  motivation text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX affiliate_applications_pending_uniq
  ON public.affiliate_applications(user_id) WHERE status = 'pending';
GRANT SELECT, INSERT ON public.affiliate_applications TO authenticated;
GRANT ALL ON public.affiliate_applications TO service_role;
ALTER TABLE public.affiliate_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own applications readable" ON public.affiliate_applications
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_platform_admin());
CREATE POLICY "apply for self" ON public.affiliate_applications
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "admins manage applications" ON public.affiliate_applications
  FOR UPDATE TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- =============== affiliate partners ===============
CREATE TABLE public.affiliate_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  application_id uuid REFERENCES public.affiliate_applications(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  email text NOT NULL,
  company text,
  website text,
  referral_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
  commission_rate numeric(5,2) NOT NULL DEFAULT 20,
  commission_duration text NOT NULL DEFAULT 'lifetime'
    CHECK (commission_duration IN ('lifetime','12_months','6_months','first_payment')),
  payout_method text,
  payout_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  approved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX affiliate_partners_code_idx ON public.affiliate_partners(referral_code);
GRANT SELECT, UPDATE ON public.affiliate_partners TO authenticated;
GRANT ALL ON public.affiliate_partners TO service_role;
ALTER TABLE public.affiliate_partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partners read own record" ON public.affiliate_partners
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_platform_admin());
CREATE POLICY "partners update own profile" ON public.affiliate_partners
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "admins manage partners" ON public.affiliate_partners
  FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.current_partner_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.affiliate_partners WHERE user_id = auth.uid() AND status = 'active' LIMIT 1;
$$;

-- =============== promo codes ===============
CREATE TABLE public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage','fixed')),
  discount_value numeric(12,2) NOT NULL CHECK (discount_value > 0),
  duration text NOT NULL DEFAULT 'first_payment'
    CHECK (duration IN ('first_payment','forever','12_months','6_months','3_months')),
  applicable_plans text[] NOT NULL DEFAULT '{}',
  min_amount numeric(12,2),
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer,
  max_per_business integer NOT NULL DEFAULT 1,
  redemption_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  affiliate_partner_id uuid REFERENCES public.affiliate_partners(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX promo_codes_partner_idx ON public.promo_codes(affiliate_partner_id);
GRANT SELECT ON public.promo_codes TO authenticated;
GRANT ALL ON public.promo_codes TO service_role;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partners read own promo codes" ON public.promo_codes
  FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR affiliate_partner_id = public.current_partner_id());
CREATE POLICY "admins manage promo codes" ON public.promo_codes
  FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

CREATE TABLE public.promo_code_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  code text NOT NULL,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  redeemed_by uuid,
  original_amount numeric(12,2) NOT NULL,
  discount_amount numeric(12,2) NOT NULL,
  final_amount numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX promo_redemptions_business_idx ON public.promo_code_redemptions(business_id);
CREATE INDEX promo_redemptions_code_idx ON public.promo_code_redemptions(promo_code_id);
GRANT SELECT ON public.promo_code_redemptions TO authenticated;
GRANT ALL ON public.promo_code_redemptions TO service_role;
ALTER TABLE public.promo_code_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "business reads own redemptions" ON public.promo_code_redemptions
  FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR public.is_business_member(business_id));

CREATE TABLE public.subscription_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  promo_code_id uuid REFERENCES public.promo_codes(id) ON DELETE SET NULL,
  code text NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage','fixed')),
  discount_value numeric(12,2) NOT NULL,
  discount_amount numeric(12,2) NOT NULL,
  original_amount numeric(12,2) NOT NULL,
  final_amount numeric(12,2) NOT NULL,
  duration text NOT NULL DEFAULT 'first_payment',
  remaining_cycles integer,
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscription_discounts_business_idx ON public.subscription_discounts(business_id);
GRANT SELECT ON public.subscription_discounts TO authenticated;
GRANT ALL ON public.subscription_discounts TO service_role;
ALTER TABLE public.subscription_discounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "business reads own discounts" ON public.subscription_discounts
  FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR public.is_business_member(business_id));

-- =============== clicks & referrals ===============
CREATE TABLE public.affiliate_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid REFERENCES public.affiliate_partners(id) ON DELETE CASCADE,
  referral_code text NOT NULL,
  landing_path text,
  referrer text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX affiliate_clicks_partner_idx ON public.affiliate_clicks(partner_id, created_at DESC);
GRANT SELECT ON public.affiliate_clicks TO authenticated;
GRANT ALL ON public.affiliate_clicks TO service_role;
ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partners read own clicks" ON public.affiliate_clicks
  FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR partner_id = public.current_partner_id());

CREATE TABLE public.affiliate_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.affiliate_partners(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid,
  referral_code text NOT NULL,
  promo_code_id uuid REFERENCES public.promo_codes(id) ON DELETE SET NULL,
  attribution_source text NOT NULL DEFAULT 'referral_link'
    CHECK (attribution_source IN ('referral_link','promo_code','manual')),
  status text NOT NULL DEFAULT 'signed_up'
    CHECK (status IN ('clicked','signed_up','trialing','paid','active','past_due','cancelled')),
  signed_up_at timestamptz NOT NULL DEFAULT now(),
  first_paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX affiliate_referrals_business_uniq ON public.affiliate_referrals(business_id)
  WHERE business_id IS NOT NULL;
CREATE INDEX affiliate_referrals_partner_idx ON public.affiliate_referrals(partner_id);
GRANT SELECT ON public.affiliate_referrals TO authenticated;
GRANT ALL ON public.affiliate_referrals TO service_role;
ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partners read own referrals" ON public.affiliate_referrals
  FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR partner_id = public.current_partner_id());

-- =============== commissions & payouts ===============
CREATE TABLE public.affiliate_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.affiliate_partners(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'PHP',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','paid','failed','cancelled')),
  period_start date,
  period_end date,
  method text,
  reference text,
  notes text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX affiliate_payouts_partner_idx ON public.affiliate_payouts(partner_id, created_at DESC);
GRANT SELECT ON public.affiliate_payouts TO authenticated;
GRANT ALL ON public.affiliate_payouts TO service_role;
ALTER TABLE public.affiliate_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partners read own payouts" ON public.affiliate_payouts
  FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR partner_id = public.current_partner_id());
CREATE POLICY "admins manage payouts" ON public.affiliate_payouts
  FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

CREATE TABLE public.affiliate_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.affiliate_partners(id) ON DELETE CASCADE,
  referral_id uuid REFERENCES public.affiliate_referrals(id) ON DELETE SET NULL,
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.subscription_payments(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.billing_invoices(id) ON DELETE SET NULL,
  source_type text NOT NULL DEFAULT 'payment' CHECK (source_type IN ('payment','invoice','manual')),
  external_reference text,
  entry_type text NOT NULL DEFAULT 'earning' CHECK (entry_type IN ('earning','reversal','adjustment')),
  gross_amount numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  net_amount numeric(12,2) NOT NULL DEFAULT 0,
  commission_rate numeric(5,2) NOT NULL DEFAULT 0,
  commission_amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'PHP',
  period_index integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','reversed','paid','cancelled')),
  payout_id uuid REFERENCES public.affiliate_payouts(id) ON DELETE SET NULL,
  reverses_id uuid REFERENCES public.affiliate_commissions(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX affiliate_commissions_source_uniq
  ON public.affiliate_commissions(entry_type, external_reference)
  WHERE external_reference IS NOT NULL;
CREATE INDEX affiliate_commissions_partner_idx ON public.affiliate_commissions(partner_id, created_at DESC);
CREATE INDEX affiliate_commissions_payout_idx ON public.affiliate_commissions(payout_id);
GRANT SELECT ON public.affiliate_commissions TO authenticated;
GRANT ALL ON public.affiliate_commissions TO service_role;
ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partners read own commissions" ON public.affiliate_commissions
  FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR partner_id = public.current_partner_id());
CREATE POLICY "admins manage commissions" ON public.affiliate_commissions
  FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- =============== updated_at triggers ===============
CREATE TRIGGER affiliate_applications_updated BEFORE UPDATE ON public.affiliate_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER affiliate_partners_updated BEFORE UPDATE ON public.affiliate_partners
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER promo_codes_updated BEFORE UPDATE ON public.promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER subscription_discounts_updated BEFORE UPDATE ON public.subscription_discounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER affiliate_referrals_updated BEFORE UPDATE ON public.affiliate_referrals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER affiliate_commissions_updated BEFORE UPDATE ON public.affiliate_commissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER affiliate_payouts_updated BEFORE UPDATE ON public.affiliate_payouts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
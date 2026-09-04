ALTER TABLE public.affiliate_commissions ADD COLUMN IF NOT EXISTS cycle_key text;

CREATE UNIQUE INDEX IF NOT EXISTS affiliate_commissions_cycle_unique
  ON public.affiliate_commissions (subscription_id, cycle_key)
  WHERE entry_type = 'earning' AND cycle_key IS NOT NULL AND subscription_id IS NOT NULL;

ALTER TABLE public.subscription_discounts
  ADD COLUMN IF NOT EXISTS provider_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fulfilment_status text NOT NULL DEFAULT 'manual_credit_pending';

COMMENT ON COLUMN public.subscription_discounts.provider_applied IS 'True only when the payment provider actually charged the discounted amount. PayMongo recurring plans have fixed provider-side pricing, so promo discounts are recorded here and settled manually.';
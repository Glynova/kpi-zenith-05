ALTER TABLE public.billing_checkouts DROP CONSTRAINT IF EXISTS billing_checkouts_payment_method_type_check;
ALTER TABLE public.billing_checkouts ADD CONSTRAINT billing_checkouts_payment_method_type_check
  CHECK (payment_method_type IS NULL OR payment_method_type = ANY (ARRAY['card','paymaya','checkout_session','qrph']));
ALTER TABLE public.billing_checkouts
  ADD COLUMN IF NOT EXISTS amount_centavos integer,
  ADD COLUMN IF NOT EXISTS qr_image text,
  ADD COLUMN IF NOT EXISTS paymongo_payment_id text;
CREATE UNIQUE INDEX IF NOT EXISTS billing_checkouts_payment_id_uniq ON public.billing_checkouts(paymongo_payment_id) WHERE paymongo_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS billing_checkouts_qrph_intent_uniq ON public.billing_checkouts(paymongo_payment_intent_id) WHERE payment_method_type = 'qrph' AND paymongo_payment_intent_id IS NOT NULL;
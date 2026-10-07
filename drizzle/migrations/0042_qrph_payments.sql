CREATE TABLE public.qrph_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  payment_intent_id text NOT NULL UNIQUE,
  paymongo_payment_id text UNIQUE,
  mode text NOT NULL DEFAULT 'test' CHECK (mode IN ('test','live')),
  amount_centavos integer NOT NULL CHECK (amount_centavos > 0),
  qr_image text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','expired')),
  expires_at timestamptz NOT NULL,
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX qrph_payments_invoice_idx ON public.qrph_payments(invoice_id);
CREATE INDEX qrph_payments_pending_idx ON public.qrph_payments(status, created_at) WHERE status = 'pending';

GRANT SELECT ON public.qrph_payments TO authenticated;
GRANT ALL ON public.qrph_payments TO service_role;
ALTER TABLE public.qrph_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read QR Ph payments" ON public.qrph_payments
  FOR SELECT TO authenticated USING (public.is_business_member(business_id));

ALTER TABLE public.qrph_payments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.qrph_payments;

-- Idempotently settle a QR Ph payment: marks it paid (only if amount matches)
-- and posts the money to the linked sale (sale_payments) or the invoice.
CREATE OR REPLACE FUNCTION public.apply_qrph_payment(_intent_id text, _amount_centavos integer, _payment_id text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.qrph_payments%ROWTYPE; inv public.invoices%ROWTYPE; amt numeric;
BEGIN
  SELECT * INTO r FROM public.qrph_payments WHERE payment_intent_id = _intent_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unknown'; END IF;
  IF r.status = 'paid' THEN RETURN 'duplicate'; END IF;
  IF _amount_centavos IS DISTINCT FROM r.amount_centavos THEN RETURN 'amount_mismatch'; END IF;
  amt := r.amount_centavos / 100.0;
  UPDATE public.qrph_payments SET status='paid', paid_at=now(), paymongo_payment_id=_payment_id, updated_at=now() WHERE id=r.id;
  SELECT * INTO inv FROM public.invoices WHERE id = r.invoice_id;
  IF inv.sale_id IS NOT NULL THEN
    INSERT INTO public.sale_payments(business_id, sale_id, method, amount, tendered, change_given, reference, notes, paid_at)
    VALUES (r.business_id, inv.sale_id, 'qrph', amt, amt, 0, _payment_id, 'QR Ph via PayMongo', now());
    UPDATE public.invoices SET paid = LEAST(COALESCE(paid,0) + amt, total) WHERE id = inv.id;
  ELSE
    UPDATE public.invoices SET paid = LEAST(COALESCE(paid,0) + amt, total) WHERE id = inv.id;
  END IF;
  RETURN 'paid';
END $$;
REVOKE ALL ON FUNCTION public.apply_qrph_payment(text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_qrph_payment(text, integer, text) TO service_role;
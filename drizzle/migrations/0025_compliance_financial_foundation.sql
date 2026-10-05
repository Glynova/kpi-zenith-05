
-- 1. Business compliance (1:1 with businesses)
CREATE TABLE IF NOT EXISTS public.business_compliance (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  jurisdiction text NOT NULL DEFAULT 'PH',
  legal_name text, trade_name text, tin text, rdo_code text, business_address text,
  pos_accreditation_no text, pos_ptu_no text, machine_id_no text,
  is_vat_registered boolean NOT NULL DEFAULT false,
  vat_registration_type text NOT NULL DEFAULT 'non_vat' CHECK (vat_registration_type IN ('non_vat','vat','vat_exempt')),
  base_currency text NOT NULL DEFAULT 'PHP',
  timezone text NOT NULL DEFAULT 'Asia/Manila',
  last_grand_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.business_compliance TO authenticated;
GRANT ALL ON public.business_compliance TO service_role;
ALTER TABLE public.business_compliance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read compliance" ON public.business_compliance FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY "admins insert compliance" ON public.business_compliance FOR INSERT TO authenticated WITH CHECK (public.is_business_admin(business_id));
CREATE POLICY "admins update compliance" ON public.business_compliance FOR UPDATE TO authenticated USING (public.is_business_admin(business_id)) WITH CHECK (public.is_business_admin(business_id));
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.business_compliance FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.business_compliance (business_id, legal_name, trade_name, business_address, base_currency, timezone, jurisdiction)
SELECT b.id, b.name, b.name, b.address, COALESCE(NULLIF(b.currency,''),'PHP'), COALESCE(NULLIF(b.timezone,''),'Asia/Manila'),
       CASE WHEN b.country IS NULL OR b.country ILIKE 'ph%' THEN 'PH' ELSE upper(left(b.country,2)) END
FROM public.businesses b ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_business_compliance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.business_compliance (business_id, legal_name, trade_name, business_address, base_currency, timezone)
  VALUES (NEW.id, NEW.name, NEW.name, NEW.address, COALESCE(NULLIF(NEW.currency,''),'PHP'), COALESCE(NULLIF(NEW.timezone,''),'Asia/Manila'))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER ensure_business_compliance_trg AFTER INSERT ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.ensure_business_compliance();

-- 2. Internal audit helper (not callable by clients)
CREATE OR REPLACE FUNCTION public._audit(_business_id uuid, _action text, _module text, _record_id text, _old jsonb, _new jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.audit_logs (business_id, action, module, record_id, old_value, new_value)
  VALUES (_business_id, _action, _module, _record_id, _old, _new);
END $$;
REVOKE ALL ON FUNCTION public._audit(uuid,text,text,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;

-- 3. Snapshot / compliance columns
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS variant_label text, ADD COLUMN IF NOT EXISTS tax_type text CHECK (tax_type IN ('VAT','VAT_EXEMPT','ZERO_RATED'));
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS customer_name_snapshot text, ADD COLUMN IF NOT EXISTS customer_tin_snapshot text,
  ADD COLUMN IF NOT EXISTS vatable_amount numeric NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS vat_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_exempt_amount numeric NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS zero_rated_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS non_vat_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grand_total_before numeric, ADD COLUMN IF NOT EXISTS grand_total_after numeric,
  ADD COLUMN IF NOT EXISTS void_reason text, ADD COLUMN IF NOT EXISTS voided_by uuid;
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS document_status text NOT NULL DEFAULT 'issued' CHECK (document_status IN ('issued','void')),
  ADD COLUMN IF NOT EXISTS parent_invoice_id uuid REFERENCES public.invoices(id),
  ADD COLUMN IF NOT EXISTS customer_name_snapshot text, ADD COLUMN IF NOT EXISTS customer_tin_snapshot text,
  ADD COLUMN IF NOT EXISTS gross_amount numeric, ADD COLUMN IF NOT EXISTS taxable_amount numeric,
  ADD COLUMN IF NOT EXISTS vat_amount numeric NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS vat_exempt_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zero_rated_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz, ADD COLUMN IF NOT EXISTS void_reason text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS balance numeric GENERATED ALWAYS AS (GREATEST(COALESCE(total,0) - COALESCE(paid,0), 0)) STORED;

-- 4. Server-side numbering
CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_unique ON public.invoices (business_id, invoice_number);
CREATE OR REPLACE FUNCTION public._next_doc(_business_id uuid, _prefix text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE y int := EXTRACT(YEAR FROM now())::int; n int;
BEGIN
  INSERT INTO public.doc_sequences (business_id, prefix, year, last_number) VALUES (_business_id, _prefix, y, 1)
  ON CONFLICT (business_id, prefix, year) DO UPDATE SET last_number = public.doc_sequences.last_number + 1
  RETURNING last_number INTO n;
  RETURN _prefix || '-' || y || '-' || LPAD(n::text, 6, '0');
END $$;
REVOKE ALL ON FUNCTION public._next_doc(uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assign_sale_number() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.sale_number IS NULL OR btrim(NEW.sale_number) = '' OR NEW.sale_number ~ '^SO-\d{1,6}$' THEN
    NEW.sale_number := public._next_doc(NEW.business_id, 'SO');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER assign_sale_number_trg BEFORE INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION public.assign_sale_number();

CREATE OR REPLACE FUNCTION public.assign_invoice_number() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c record;
BEGIN
  NEW.invoice_number := public._next_doc(NEW.business_id, 'INV');
  IF NEW.customer_id IS NOT NULL THEN
    SELECT name, tax_id INTO c FROM public.customers WHERE id = NEW.customer_id AND business_id = NEW.business_id;
    NEW.customer_name_snapshot := COALESCE(NEW.customer_name_snapshot, c.name);
    NEW.customer_tin_snapshot := COALESCE(NEW.customer_tin_snapshot, c.tax_id);
  END IF;
  NEW.gross_amount := COALESCE(NEW.gross_amount, NEW.subtotal);
  NEW.taxable_amount := COALESCE(NEW.taxable_amount, COALESCE(NEW.subtotal,0) - COALESCE(NEW.discount,0));
  IF NEW.sale_id IS NOT NULL THEN
    SELECT vat_amount, vat_exempt_amount, zero_rated_amount INTO c FROM public.sales WHERE id = NEW.sale_id;
    NEW.vat_amount := COALESCE(c.vat_amount, 0); NEW.vat_exempt_amount := COALESCE(c.vat_exempt_amount,0); NEW.zero_rated_amount := COALESCE(c.zero_rated_amount,0);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER assign_invoice_number_trg BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.assign_invoice_number();

-- 5. Posting snapshot (before) + tax/audit (after)
CREATE OR REPLACE FUNCTION public.snapshot_sale_on_post() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE comp public.business_compliance%ROWTYPE; c record; base numeric; ex numeric; zr numeric;
BEGIN
  IF NEW.inventory_posted AND NOT COALESCE(OLD.inventory_posted,false) THEN
    INSERT INTO public.business_compliance (business_id) VALUES (NEW.business_id) ON CONFLICT DO NOTHING;
    SELECT * INTO comp FROM public.business_compliance WHERE business_id = NEW.business_id FOR UPDATE;
    IF NEW.customer_id IS NOT NULL THEN
      SELECT name, tax_id INTO c FROM public.customers WHERE id = NEW.customer_id;
      NEW.customer_name_snapshot := c.name; NEW.customer_tin_snapshot := c.tax_id;
    END IF;
    base := GREATEST(COALESCE(NEW.subtotal,0) - COALESCE(NEW.discount,0), 0);
    IF comp.is_vat_registered THEN
      SELECT COALESCE(SUM(CASE WHEN tax_type='VAT_EXEMPT' OR (tax_type IS NULL AND COALESCE(tax_rate,0)=0) THEN quantity*unit_price - COALESCE(discount,0) END),0),
             COALESCE(SUM(CASE WHEN tax_type='ZERO_RATED' THEN quantity*unit_price - COALESCE(discount,0) END),0)
        INTO ex, zr FROM public.sale_items WHERE sale_id = NEW.id;
      NEW.vat_exempt_amount := LEAST(ex, base); NEW.zero_rated_amount := LEAST(zr, base - NEW.vat_exempt_amount);
      NEW.vatable_amount := GREATEST(base - NEW.vat_exempt_amount - NEW.zero_rated_amount, 0);
      NEW.vat_amount := COALESCE(NEW.tax,0); NEW.non_vat_amount := 0;
    ELSE
      NEW.vatable_amount := 0; NEW.vat_amount := 0; NEW.vat_exempt_amount := 0; NEW.zero_rated_amount := 0;
      NEW.non_vat_amount := base;
    END IF;
    NEW.grand_total_before := comp.last_grand_total;
    NEW.grand_total_after := comp.last_grand_total + COALESCE(NEW.total,0);
    UPDATE public.business_compliance SET last_grand_total = NEW.grand_total_after WHERE business_id = NEW.business_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER a_snapshot_sale_on_post BEFORE UPDATE OF inventory_posted ON public.sales FOR EACH ROW EXECUTE FUNCTION public.snapshot_sale_on_post();

-- 6. Tax transactions + withholding
CREATE TABLE IF NOT EXISTS public.tax_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  source_type text NOT NULL, source_id uuid, reference text,
  tax_type text NOT NULL CHECK (tax_type IN ('VAT','VAT_EXEMPT','ZERO_RATED','WITHHOLDING')),
  direction text NOT NULL DEFAULT 'output' CHECK (direction IN ('output','input','withheld_by_customer','withheld_from_supplier')),
  taxable_amount numeric NOT NULL DEFAULT 0, rate numeric NOT NULL DEFAULT 0, tax_amount numeric NOT NULL DEFAULT 0,
  counterparty_name text, counterparty_tin text, txn_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tax_transactions_biz_date ON public.tax_transactions (business_id, txn_date);
GRANT SELECT ON public.tax_transactions TO authenticated;
GRANT ALL ON public.tax_transactions TO service_role;
ALTER TABLE public.tax_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read tax txns" ON public.tax_transactions FOR SELECT TO authenticated USING (public.is_business_member(business_id));

CREATE TABLE IF NOT EXISTS public.withholding_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  direction text NOT NULL DEFAULT 'received' CHECK (direction IN ('received','issued')),
  payer_name text NOT NULL, payer_tin text, payer_address text,
  payee_name text NOT NULL, payee_tin text, payee_address text,
  atc text NOT NULL, income_description text,
  taxable_amount numeric NOT NULL CHECK (taxable_amount >= 0),
  rate numeric NOT NULL CHECK (rate >= 0 AND rate <= 100),
  withholding_amount numeric NOT NULL CHECK (withholding_amount >= 0),
  period_from date NOT NULL, period_to date NOT NULL,
  certificate_number text, reference_type text, reference_id uuid, reference text,
  form_code text NOT NULL DEFAULT 'PH-2307',
  status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','void')),
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS withholding_certs_biz ON public.withholding_certificates (business_id, period_to);
GRANT SELECT, INSERT, UPDATE ON public.withholding_certificates TO authenticated;
GRANT ALL ON public.withholding_certificates TO service_role;
ALTER TABLE public.withholding_certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read wht" ON public.withholding_certificates FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY "writers add wht" ON public.withholding_certificates FOR INSERT TO authenticated WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "admins void wht" ON public.withholding_certificates FOR UPDATE TO authenticated USING (public.is_business_admin(business_id)) WITH CHECK (public.is_business_admin(business_id));

CREATE OR REPLACE FUNCTION public.withholding_to_tax_txn() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'void' THEN RAISE EXCEPTION 'A voided certificate cannot be changed'; END IF;
    IF NEW.status <> 'void' AND (NEW.taxable_amount, NEW.rate, NEW.withholding_amount, NEW.atc, NEW.payer_tin, NEW.payee_tin)
       IS DISTINCT FROM (OLD.taxable_amount, OLD.rate, OLD.withholding_amount, OLD.atc, OLD.payer_tin, OLD.payee_tin) THEN
      RAISE EXCEPTION 'Recorded certificates cannot be edited. Void it and record a new one.';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' OR (NEW.status = 'void' AND OLD.status <> 'void') THEN
    INSERT INTO public.tax_transactions (business_id, source_type, source_id, reference, tax_type, direction, taxable_amount, rate, tax_amount, counterparty_name, counterparty_tin, txn_date)
    VALUES (NEW.business_id, 'withholding_certificate', NEW.id, COALESCE(NEW.certificate_number, NEW.reference), 'WITHHOLDING',
            CASE WHEN NEW.direction='received' THEN 'withheld_by_customer' ELSE 'withheld_from_supplier' END,
            CASE WHEN TG_OP='INSERT' THEN NEW.taxable_amount ELSE -NEW.taxable_amount END, NEW.rate,
            CASE WHEN TG_OP='INSERT' THEN NEW.withholding_amount ELSE -NEW.withholding_amount END,
            CASE WHEN NEW.direction='received' THEN NEW.payer_name ELSE NEW.payee_name END,
            CASE WHEN NEW.direction='received' THEN NEW.payer_tin ELSE NEW.payee_tin END, NEW.period_to);
    PERFORM public._audit(NEW.business_id, CASE WHEN TG_OP='INSERT' THEN 'CREATE' ELSE 'VOID' END, 'withholding', NEW.id::text, NULL, to_jsonb(NEW));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER withholding_to_tax_txn_trg AFTER INSERT OR UPDATE ON public.withholding_certificates FOR EACH ROW EXECUTE FUNCTION public.withholding_to_tax_txn();
CREATE OR REPLACE FUNCTION public.block_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% records cannot be deleted. Use void instead.', TG_TABLE_NAME; END $$;
CREATE TRIGGER withholding_no_delete BEFORE DELETE ON public.withholding_certificates FOR EACH ROW EXECUTE FUNCTION public.block_delete();
CREATE TRIGGER tax_txn_no_change BEFORE UPDATE OR DELETE ON public.tax_transactions FOR EACH ROW EXECUTE FUNCTION public.block_delete();

CREATE OR REPLACE FUNCTION public.after_sale_posted() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rate numeric;
BEGIN
  PERFORM set_config('app.fin_bypass','on',true);
  -- record actual movement COGS on each line (FIFO/AVCO resolved by the movement engine)
  UPDATE public.sale_items si SET unit_cost = ROUND(m.cost / NULLIF(si.quantity,0), 4)
    FROM (SELECT product_id, variant_id, SUM(COALESCE(total_cost, unit_cost*quantity)) cost
            FROM public.inventory_movements WHERE reference_type='sale' AND reference_id=NEW.id AND type='sale'
           GROUP BY 1,2) m
   WHERE si.sale_id = NEW.id AND si.product_id = m.product_id AND si.variant_id IS NOT DISTINCT FROM m.variant_id
     AND (SELECT count(*) FROM public.sale_items x WHERE x.sale_id=NEW.id AND x.product_id=si.product_id AND x.variant_id IS NOT DISTINCT FROM si.variant_id) = 1;
  -- variant label snapshot
  UPDATE public.sale_items si SET variant_label = COALESCE(si.variant_label, v.name)
    FROM public.product_variants v WHERE si.sale_id = NEW.id AND v.id = si.variant_id;
  PERFORM set_config('app.fin_bypass','off',true);
  rate := CASE WHEN NEW.vatable_amount > 0 THEN ROUND(NEW.vat_amount / NEW.vatable_amount * 100, 2) ELSE 0 END;
  IF NEW.vatable_amount > 0 OR NEW.vat_amount > 0 THEN
    INSERT INTO public.tax_transactions (business_id, source_type, source_id, reference, tax_type, taxable_amount, rate, tax_amount, counterparty_name, counterparty_tin, txn_date)
    VALUES (NEW.business_id, 'sale', NEW.id, NEW.sale_number, 'VAT', NEW.vatable_amount, rate, NEW.vat_amount, NEW.customer_name_snapshot, NEW.customer_tin_snapshot, NEW.sale_date);
  END IF;
  IF NEW.vat_exempt_amount > 0 THEN
    INSERT INTO public.tax_transactions (business_id, source_type, source_id, reference, tax_type, taxable_amount, counterparty_name, counterparty_tin, txn_date)
    VALUES (NEW.business_id, 'sale', NEW.id, NEW.sale_number, 'VAT_EXEMPT', NEW.vat_exempt_amount, NEW.customer_name_snapshot, NEW.customer_tin_snapshot, NEW.sale_date);
  END IF;
  IF NEW.zero_rated_amount > 0 THEN
    INSERT INTO public.tax_transactions (business_id, source_type, source_id, reference, tax_type, taxable_amount, counterparty_name, counterparty_tin, txn_date)
    VALUES (NEW.business_id, 'sale', NEW.id, NEW.sale_number, 'ZERO_RATED', NEW.zero_rated_amount, NEW.customer_name_snapshot, NEW.customer_tin_snapshot, NEW.sale_date);
  END IF;
  PERFORM public._audit(NEW.business_id, 'POST', 'sales', NEW.id::text, NULL,
    jsonb_build_object('sale_number', NEW.sale_number, 'total', NEW.total, 'cost_total', NEW.cost_total, 'grand_total_after', NEW.grand_total_after));
  RETURN NEW;
END $$;
CREATE TRIGGER z_after_sale_posted AFTER UPDATE OF inventory_posted ON public.sales FOR EACH ROW
  WHEN (NEW.inventory_posted AND NOT COALESCE(OLD.inventory_posted,false)) EXECUTE FUNCTION public.after_sale_posted();

-- 7. Immutability of posted financial records
CREATE OR REPLACE FUNCTION public.guard_posted_sale() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF current_setting('app.fin_bypass', true) = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.inventory_posted OR OLD.status IN ('completed','fulfilled','voided') THEN
      RAISE EXCEPTION 'Posted sale % cannot be deleted. Void it instead.', OLD.sale_number;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.inventory_posted AND (
     (NEW.subtotal, NEW.discount, NEW.tax, NEW.total, NEW.cost_total, NEW.sale_number, NEW.customer_id, NEW.sale_date, NEW.shipping, NEW.other_charges,
      NEW.vatable_amount, NEW.vat_amount, NEW.vat_exempt_amount, NEW.zero_rated_amount, NEW.grand_total_before, NEW.grand_total_after, NEW.business_id)
     IS DISTINCT FROM
     (OLD.subtotal, OLD.discount, OLD.tax, OLD.total, OLD.cost_total, OLD.sale_number, OLD.customer_id, OLD.sale_date, OLD.shipping, OLD.other_charges,
      OLD.vatable_amount, OLD.vat_amount, OLD.vat_exempt_amount, OLD.zero_rated_amount, OLD.grand_total_before, OLD.grand_total_after, OLD.business_id)) THEN
    RAISE EXCEPTION 'Posted sale % is locked. Use void or refund instead.', OLD.sale_number;
  END IF;
  IF OLD.status = 'voided' AND NEW.status IS DISTINCT FROM 'voided' THEN
    RAISE EXCEPTION 'A voided sale cannot be reopened';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_posted_sale_trg BEFORE UPDATE OR DELETE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.guard_posted_sale();

CREATE OR REPLACE FUNCTION public.guard_posted_sale_item() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE posted boolean;
BEGIN
  IF current_setting('app.fin_bypass', true) = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT inventory_posted INTO posted FROM public.sales WHERE id = COALESCE(OLD.sale_id, NEW.sale_id);
  IF NOT COALESCE(posted,false) THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Lines of a posted sale cannot be deleted'; END IF;
  IF TG_OP = 'INSERT' THEN RAISE EXCEPTION 'Lines cannot be added to a posted sale'; END IF;
  IF (NEW.product_id, NEW.variant_id, NEW.quantity, NEW.unit_price, NEW.unit_cost, NEW.discount, NEW.tax, NEW.total, NEW.tax_rate, NEW.product_name, NEW.sku)
     IS DISTINCT FROM (OLD.product_id, OLD.variant_id, OLD.quantity, OLD.unit_price, OLD.unit_cost, OLD.discount, OLD.tax, OLD.total, OLD.tax_rate, OLD.product_name, OLD.sku) THEN
    RAISE EXCEPTION 'Lines of a posted sale are locked';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_posted_sale_item_trg BEFORE INSERT OR UPDATE OR DELETE ON public.sale_items FOR EACH ROW EXECUTE FUNCTION public.guard_posted_sale_item();

CREATE OR REPLACE FUNCTION public.guard_invoice() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF current_setting('app.fin_bypass', true) = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Invoice % cannot be deleted. Void it instead.', OLD.invoice_number; END IF;
  IF OLD.document_status = 'void' THEN RAISE EXCEPTION 'Invoice % is void and cannot be changed', OLD.invoice_number; END IF;
  IF (NEW.invoice_number, NEW.subtotal, NEW.discount, NEW.tax, NEW.total, NEW.customer_id, NEW.issue_date, NEW.sale_id, NEW.business_id,
      NEW.vat_amount, NEW.vat_exempt_amount, NEW.zero_rated_amount, NEW.customer_name_snapshot, NEW.customer_tin_snapshot)
     IS DISTINCT FROM (OLD.invoice_number, OLD.subtotal, OLD.discount, OLD.tax, OLD.total, OLD.customer_id, OLD.issue_date, OLD.sale_id, OLD.business_id,
      OLD.vat_amount, OLD.vat_exempt_amount, OLD.zero_rated_amount, OLD.customer_name_snapshot, OLD.customer_tin_snapshot) THEN
    RAISE EXCEPTION 'Issued invoice % is locked. Void it and issue a new one.', OLD.invoice_number;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_invoice_trg BEFORE UPDATE OR DELETE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.guard_invoice();

-- 8. Void (compensating reversal)
CREATE OR REPLACE FUNCTION public.void_sale(_sale_id uuid, _reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.sales%ROWTYPE; m record; paid_net numeric;
BEGIN
  SELECT * INTO s FROM public.sales WHERE id = _sale_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Sale not found'; END IF;
  IF NOT public.can_manage_sensitive(s.business_id) THEN RAISE EXCEPTION 'Only an owner, admin or manager can void a sale'; END IF;
  IF s.status = 'voided' THEN RAISE EXCEPTION 'Sale % is already void', s.sale_number; END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN RAISE EXCEPTION 'A void reason is required'; END IF;
  IF EXISTS (SELECT 1 FROM public.sales r WHERE r.original_sale_id = s.id AND r.status <> 'voided') THEN
    RAISE EXCEPTION 'This sale has returns. Void or reverse those first.';
  END IF;
  SELECT COALESCE(SUM(CASE WHEN is_refund THEN -amount ELSE amount END),0) INTO paid_net FROM public.sale_payments WHERE sale_id = s.id;

  IF s.inventory_posted THEN
    FOR m IN SELECT * FROM public.inventory_movements WHERE reference_type = 'sale' AND reference_id = s.id AND public.movement_sign(type) = -1 LOOP
      INSERT INTO public.inventory_movements (business_id, product_id, variant_id, warehouse_id, type, quantity, base_quantity, unit, unit_cost, total_cost,
        reference, reference_type, reference_id, movement_date, notes, created_by, batch_id)
      VALUES (m.business_id, m.product_id, m.variant_id, m.warehouse_id, 'return_in', m.quantity, COALESCE(m.base_quantity, m.quantity), m.unit,
        m.unit_cost, COALESCE(m.total_cost, m.unit_cost * m.quantity), s.sale_number, 'sale_void', s.id, CURRENT_DATE,
        'Void of ' || s.sale_number || ': ' || _reason, auth.uid(), m.batch_id);
    END LOOP;
  END IF;

  PERFORM set_config('app.fin_bypass','on',true);
  UPDATE public.sales SET status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = _reason,
         payment_status = 'voided', updated_at = now() WHERE id = s.id;
  UPDATE public.accounts_receivable SET status = 'written_off', notes = COALESCE(notes,'') || ' [void: ' || _reason || ']' WHERE sale_id = s.id;
  UPDATE public.invoices SET document_status = 'void', voided_at = now(), void_reason = _reason WHERE sale_id = s.id;
  PERFORM set_config('app.fin_bypass','off',true);

  IF s.vatable_amount > 0 OR s.vat_amount > 0 THEN
    INSERT INTO public.tax_transactions (business_id, source_type, source_id, reference, tax_type, taxable_amount, tax_amount, txn_date)
    VALUES (s.business_id, 'sale_void', s.id, s.sale_number, 'VAT', -s.vatable_amount, -s.vat_amount, CURRENT_DATE);
  END IF;
  IF s.vat_exempt_amount > 0 THEN
    INSERT INTO public.tax_transactions (business_id, source_type, source_id, reference, tax_type, taxable_amount, txn_date)
    VALUES (s.business_id, 'sale_void', s.id, s.sale_number, 'VAT_EXEMPT', -s.vat_exempt_amount, CURRENT_DATE);
  END IF;
  IF s.zero_rated_amount > 0 THEN
    INSERT INTO public.tax_transactions (business_id, source_type, source_id, reference, tax_type, taxable_amount, txn_date)
    VALUES (s.business_id, 'sale_void', s.id, s.sale_number, 'ZERO_RATED', -s.zero_rated_amount, CURRENT_DATE);
  END IF;
  PERFORM public._audit(s.business_id, 'VOID', 'sales', s.id::text,
    jsonb_build_object('status', s.status, 'total', s.total, 'paid', paid_net),
    jsonb_build_object('status','voided','reason',_reason,'refund_due',paid_net));
END $$;
GRANT EXECUTE ON FUNCTION public.void_sale(uuid,text) TO authenticated;

-- 9. AR: no overpayment, payment audit
CREATE OR REPLACE FUNCTION public.guard_overpayment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.sales%ROWTYPE; net numeric;
BEGIN
  SELECT * INTO s FROM public.sales WHERE id = NEW.sale_id FOR UPDATE;
  IF s.id IS NULL THEN RETURN NEW; END IF;
  IF s.business_id <> NEW.business_id THEN RAISE EXCEPTION 'Payment business does not match sale'; END IF;
  IF s.status = 'voided' AND NOT NEW.is_refund THEN RAISE EXCEPTION 'Cannot take payment on a void sale'; END IF;
  IF NEW.amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;
  SELECT COALESCE(SUM(CASE WHEN is_refund THEN -amount ELSE amount END),0) INTO net FROM public.sale_payments WHERE sale_id = s.id;
  IF NOT NEW.is_refund AND net + NEW.amount > s.total + 0.009 THEN
    RAISE EXCEPTION 'Payment of % exceeds the balance of %. Record the excess as customer credit or change.', NEW.amount, GREATEST(s.total - net, 0);
  END IF;
  IF NEW.is_refund AND NEW.amount > net + 0.009 THEN
    RAISE EXCEPTION 'Refund of % exceeds the amount paid (%)', NEW.amount, net;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER a_guard_overpayment_trg BEFORE INSERT ON public.sale_payments FOR EACH ROW EXECUTE FUNCTION public.guard_overpayment();

CREATE OR REPLACE FUNCTION public.audit_payment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public._audit(NEW.business_id, CASE WHEN NEW.is_refund THEN 'REFUND' ELSE 'PAYMENT' END, 'payments', NEW.sale_id::text, NULL,
    jsonb_build_object('payment_id', NEW.id, 'method', NEW.method, 'amount', NEW.amount));
  RETURN NEW;
END $$;
CREATE TRIGGER audit_payment_trg AFTER INSERT ON public.sale_payments FOR EACH ROW EXECUTE FUNCTION public.audit_payment();

CREATE OR REPLACE FUNCTION public.ar_aging(_business_id uuid, _as_of date)
RETURNS TABLE(customer_id uuid, customer_name text, current_amt numeric, d1_30 numeric, d31_60 numeric, d61_90 numeric, d91_120 numeric, d121_plus numeric, total numeric, open_items int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH open_ar AS (
    SELECT ar.customer_id, GREATEST(ar.amount - COALESCE(ar.paid,0), 0) AS bal,
           (_as_of - COALESCE(ar.due_date, ar.created_at::date)) AS days
      FROM public.accounts_receivable ar
     WHERE ar.business_id = _business_id AND public.is_business_member(_business_id)
       AND ar.status NOT IN ('settled','written_off') AND ar.created_at::date <= _as_of
       AND ar.amount - COALESCE(ar.paid,0) > 0.009
  )
  SELECT o.customer_id, COALESCE(c.name, 'No customer'),
    SUM(CASE WHEN days <= 0 THEN bal ELSE 0 END), SUM(CASE WHEN days BETWEEN 1 AND 30 THEN bal ELSE 0 END),
    SUM(CASE WHEN days BETWEEN 31 AND 60 THEN bal ELSE 0 END), SUM(CASE WHEN days BETWEEN 61 AND 90 THEN bal ELSE 0 END),
    SUM(CASE WHEN days BETWEEN 91 AND 120 THEN bal ELSE 0 END), SUM(CASE WHEN days > 120 THEN bal ELSE 0 END),
    SUM(bal), count(*)::int
  FROM open_ar o LEFT JOIN public.customers c ON c.id = o.customer_id
  GROUP BY o.customer_id, c.name ORDER BY SUM(bal) DESC;
$$;
GRANT EXECUTE ON FUNCTION public.ar_aging(uuid,date) TO authenticated;

-- 10. Z readings
CREATE TABLE IF NOT EXISTS public.z_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.warehouses(id), register_id uuid REFERENCES public.cash_registers(id),
  z_number integer NOT NULL, reading_date date NOT NULL,
  beginning_invoice text, ending_invoice text, transaction_count int NOT NULL DEFAULT 0,
  beginning_grand_total numeric NOT NULL DEFAULT 0, ending_grand_total numeric NOT NULL DEFAULT 0,
  gross_sales numeric NOT NULL DEFAULT 0, vatable_sales numeric NOT NULL DEFAULT 0, vat_amount numeric NOT NULL DEFAULT 0,
  vat_exempt_sales numeric NOT NULL DEFAULT 0, zero_rated_sales numeric NOT NULL DEFAULT 0, non_vat_sales numeric NOT NULL DEFAULT 0,
  discounts numeric NOT NULL DEFAULT 0, voids numeric NOT NULL DEFAULT 0, void_count int NOT NULL DEFAULT 0,
  refunds numeric NOT NULL DEFAULT 0, net_sales numeric NOT NULL DEFAULT 0,
  payment_totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS z_readings_number ON public.z_readings (business_id, COALESCE(register_id,'00000000-0000-0000-0000-000000000000'::uuid), z_number);
CREATE UNIQUE INDEX IF NOT EXISTS z_readings_day ON public.z_readings (business_id, COALESCE(register_id,'00000000-0000-0000-0000-000000000000'::uuid), reading_date);
GRANT SELECT ON public.z_readings TO authenticated;
GRANT ALL ON public.z_readings TO service_role;
ALTER TABLE public.z_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read z" ON public.z_readings FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE TRIGGER z_readings_immutable BEFORE UPDATE OR DELETE ON public.z_readings FOR EACH ROW EXECUTE FUNCTION public.block_delete();

CREATE OR REPLACE FUNCTION public.z_reading_preview(_business_id uuid, _date date, _register_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; pays jsonb;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN RAISE EXCEPTION 'Not a member of this business'; END IF;
  SELECT COALESCE(jsonb_object_agg(method, amt), '{}'::jsonb) INTO pays FROM (
    SELECT p.method, SUM(CASE WHEN p.is_refund THEN -p.amount ELSE p.amount END) amt
      FROM public.sale_payments p JOIN public.sales s ON s.id = p.sale_id
     WHERE s.business_id = _business_id AND s.inventory_posted AND s.status <> 'voided' AND s.sale_date = _date
       AND (_register_id IS NULL OR s.register_id = _register_id) GROUP BY p.method) x;
  SELECT jsonb_build_object(
    'reading_date', _date,
    'transaction_count', count(*) FILTER (WHERE status <> 'voided' AND document_type IN ('sale','pos_sale')),
    'beginning_invoice', min(sale_number) FILTER (WHERE document_type IN ('sale','pos_sale')),
    'ending_invoice', max(sale_number) FILTER (WHERE document_type IN ('sale','pos_sale')),
    'beginning_grand_total', COALESCE(min(grand_total_before), 0),
    'ending_grand_total', COALESCE(max(grand_total_after), 0),
    'gross_sales', COALESCE(sum(subtotal) FILTER (WHERE status <> 'voided' AND document_type IN ('sale','pos_sale')),0),
    'vatable_sales', COALESCE(sum(vatable_amount) FILTER (WHERE status <> 'voided' AND document_type IN ('sale','pos_sale')),0),
    'vat_amount', COALESCE(sum(vat_amount) FILTER (WHERE status <> 'voided' AND document_type IN ('sale','pos_sale')),0),
    'vat_exempt_sales', COALESCE(sum(vat_exempt_amount) FILTER (WHERE status <> 'voided' AND document_type IN ('sale','pos_sale')),0),
    'zero_rated_sales', COALESCE(sum(zero_rated_amount) FILTER (WHERE status <> 'voided' AND document_type IN ('sale','pos_sale')),0),
    'non_vat_sales', COALESCE(sum(non_vat_amount) FILTER (WHERE status <> 'voided' AND document_type IN ('sale','pos_sale')),0),
    'discounts', COALESCE(sum(discount) FILTER (WHERE status <> 'voided' AND document_type IN ('sale','pos_sale')),0),
    'voids', COALESCE(sum(total) FILTER (WHERE status = 'voided'),0),
    'void_count', count(*) FILTER (WHERE status = 'voided'),
    'refunds', COALESCE(sum(total) FILTER (WHERE status <> 'voided' AND document_type NOT IN ('sale','pos_sale','quote','sales_order')),0),
    'net_sales', COALESCE(sum(total) FILTER (WHERE status <> 'voided' AND document_type IN ('sale','pos_sale')),0)
               - COALESCE(sum(total) FILTER (WHERE status <> 'voided' AND document_type NOT IN ('sale','pos_sale','quote','sales_order')),0),
    'payment_totals', pays)
  INTO r FROM public.sales
  WHERE business_id = _business_id AND inventory_posted AND sale_date = _date
    AND (_register_id IS NULL OR register_id = _register_id);
  RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.z_reading_preview(uuid,date,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_day_z(_business_id uuid, _date date, _register_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p jsonb; n int; zid uuid; loc uuid;
BEGIN
  IF NOT public.can_manage_sensitive(_business_id) THEN RAISE EXCEPTION 'Only an owner, admin or manager can close the day'; END IF;
  IF _date > public.business_today(_business_id) THEN RAISE EXCEPTION 'Cannot close a future day'; END IF;
  INSERT INTO public.business_compliance (business_id) VALUES (_business_id) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public.business_compliance WHERE business_id = _business_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.z_readings WHERE business_id=_business_id AND register_id IS NOT DISTINCT FROM _register_id AND reading_date=_date) THEN
    RAISE EXCEPTION 'This day is already closed';
  END IF;
  p := public.z_reading_preview(_business_id, _date, _register_id);
  SELECT COALESCE(max(z_number),0)+1 INTO n FROM public.z_readings WHERE business_id=_business_id AND register_id IS NOT DISTINCT FROM _register_id;
  IF _register_id IS NOT NULL THEN SELECT location_id INTO loc FROM public.cash_registers WHERE id=_register_id AND business_id=_business_id; END IF;
  INSERT INTO public.z_readings (business_id, location_id, register_id, z_number, reading_date, beginning_invoice, ending_invoice, transaction_count,
    beginning_grand_total, ending_grand_total, gross_sales, vatable_sales, vat_amount, vat_exempt_sales, zero_rated_sales, non_vat_sales,
    discounts, voids, void_count, refunds, net_sales, payment_totals)
  VALUES (_business_id, loc, _register_id, n, _date, p->>'beginning_invoice', p->>'ending_invoice', (p->>'transaction_count')::int,
    (p->>'beginning_grand_total')::numeric, (p->>'ending_grand_total')::numeric, (p->>'gross_sales')::numeric, (p->>'vatable_sales')::numeric,
    (p->>'vat_amount')::numeric, (p->>'vat_exempt_sales')::numeric, (p->>'zero_rated_sales')::numeric, (p->>'non_vat_sales')::numeric,
    (p->>'discounts')::numeric, (p->>'voids')::numeric, (p->>'void_count')::int, (p->>'refunds')::numeric, (p->>'net_sales')::numeric, p->'payment_totals')
  RETURNING id INTO zid;
  PERFORM public._audit(_business_id, 'Z_CLOSE', 'daily_close', zid::text, NULL, p || jsonb_build_object('z_number', n));
  RETURN zid;
END $$;
GRANT EXECUTE ON FUNCTION public.close_day_z(uuid,date,uuid) TO authenticated;

-- 11. Audit triggers for key actions
CREATE OR REPLACE FUNCTION public.audit_price_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF (NEW.selling_price, NEW.cost_price) IS DISTINCT FROM (OLD.selling_price, OLD.cost_price) THEN
    PERFORM public._audit(NEW.business_id, 'PRICE_CHANGE', TG_TABLE_NAME, NEW.id::text,
      jsonb_build_object('selling_price', OLD.selling_price, 'cost_price', OLD.cost_price),
      jsonb_build_object('selling_price', NEW.selling_price, 'cost_price', NEW.cost_price));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER audit_price_change_trg AFTER UPDATE OF selling_price, cost_price ON public.products FOR EACH ROW EXECUTE FUNCTION public.audit_price_change();
CREATE TRIGGER audit_price_change_trg AFTER UPDATE OF selling_price, cost_price ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.audit_price_change();

CREATE OR REPLACE FUNCTION public.audit_row_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE act text := TG_ARGV[0];
BEGIN
  PERFORM public._audit(COALESCE(NEW.business_id, OLD.business_id), act, TG_TABLE_NAME, COALESCE(NEW.id, OLD.id)::text,
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END, CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER audit_settings_trg AFTER UPDATE ON public.business_settings FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('SETTINGS_CHANGE');
CREATE TRIGGER audit_compliance_trg AFTER UPDATE ON public.business_compliance FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('SETTINGS_CHANGE');
CREATE TRIGGER audit_membership_trg AFTER INSERT OR UPDATE OF role OR DELETE ON public.user_businesses FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('PERMISSION_CHANGE');
CREATE TRIGGER audit_transfer_trg AFTER INSERT OR UPDATE OF status ON public.stock_transfers FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('TRANSFER');

CREATE OR REPLACE FUNCTION public.audit_adjustment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.type IN ('adjustment_in','adjustment_out','damage','waste','stock_in','stock_out') THEN
    PERFORM public._audit(NEW.business_id, 'INVENTORY_ADJUSTMENT', 'inventory', NEW.id::text, NULL,
      jsonb_build_object('product_id', NEW.product_id, 'variant_id', NEW.variant_id, 'type', NEW.type, 'quantity', NEW.quantity, 'unit_cost', NEW.unit_cost, 'reference', NEW.reference));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER audit_adjustment_trg AFTER INSERT ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.audit_adjustment();

CREATE OR REPLACE FUNCTION public.log_auth_event(_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR _action NOT IN ('LOGIN','LOGOUT') THEN RETURN; END IF;
  INSERT INTO public.audit_logs (business_id, action, module, record_id)
  SELECT ub.business_id, _action, 'auth', auth.uid()::text FROM public.user_businesses ub WHERE ub.user_id = auth.uid();
END $$;
GRANT EXECUTE ON FUNCTION public.log_auth_event(text) TO authenticated;

-- audit log rows are append-only
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.block_delete();
CREATE INDEX IF NOT EXISTS audit_logs_biz_created ON public.audit_logs (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ar_biz_customer ON public.accounts_receivable (business_id, customer_id);

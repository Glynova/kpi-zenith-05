
-- ============ SUPPLIER MASTER ============
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS supplier_type text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS payment_terms text NOT NULL DEFAULT 'due_on_receipt',
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS credit_limit numeric NOT NULL DEFAULT 0;

-- ============ SUPPLIER PRODUCTS ============
ALTER TABLE public.supplier_products
  ADD COLUMN IF NOT EXISTS supplier_product_name text,
  ADD COLUMN IF NOT EXISTS purchase_unit text,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS last_purchase_price numeric,
  ADD COLUMN IF NOT EXISTS last_purchase_date date,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_products_unique
  ON public.supplier_products (business_id, supplier_id, product_id);

-- ============ SUPPLIER PRICE HISTORY ============
CREATE TABLE IF NOT EXISTS public.supplier_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  price numeric NOT NULL DEFAULT 0,
  currency text,
  source text NOT NULL DEFAULT 'manual',
  reference text,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.supplier_price_history TO authenticated;
GRANT ALL ON public.supplier_price_history TO service_role;
ALTER TABLE public.supplier_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY sph_select ON public.supplier_price_history FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY sph_insert ON public.supplier_price_history FOR INSERT TO authenticated WITH CHECK (public.can_write_business(business_id));

-- ============ DOCUMENT NUMBERING ============
CREATE TABLE IF NOT EXISTS public.doc_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  prefix text NOT NULL,
  year integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  UNIQUE (business_id, prefix, year)
);
GRANT SELECT ON public.doc_sequences TO authenticated;
GRANT ALL ON public.doc_sequences TO service_role;
ALTER TABLE public.doc_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY docseq_select ON public.doc_sequences FOR SELECT TO authenticated USING (public.is_business_member(business_id));

CREATE OR REPLACE FUNCTION public.next_doc_number(_business_id uuid, _prefix text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE y integer := EXTRACT(YEAR FROM now())::int; n integer;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not a member of this business';
  END IF;
  INSERT INTO public.doc_sequences (business_id, prefix, year, last_number)
  VALUES (_business_id, _prefix, y, 1)
  ON CONFLICT (business_id, prefix, year)
  DO UPDATE SET last_number = public.doc_sequences.last_number + 1
  RETURNING last_number INTO n;
  RETURN _prefix || '-' || y || '-' || LPAD(n::text, 6, '0');
END; $$;
GRANT EXECUTE ON FUNCTION public.next_doc_number(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.payment_terms_days(_terms text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _terms
    WHEN 'cash' THEN 0 WHEN 'due_on_receipt' THEN 0
    WHEN 'net_7' THEN 7 WHEN 'net_15' THEN 15 WHEN 'net_30' THEN 30
    WHEN 'net_45' THEN 45 WHEN 'net_60' THEN 60 ELSE 0 END;
$$;
GRANT EXECUTE ON FUNCTION public.payment_terms_days(text) TO authenticated;

-- ============ PURCHASE REQUESTS ============
CREATE TABLE IF NOT EXISTS public.purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  request_number text NOT NULL,
  requester_id uuid,
  requester_name text,
  department text,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  request_date date NOT NULL DEFAULT CURRENT_DATE,
  required_date date,
  reason text,
  notes text,
  status text NOT NULL DEFAULT 'draft',
  converted_po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.purchase_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.purchase_requests(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit text,
  estimated_cost numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ PURCHASE ORDER EXPANSION ============
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS exchange_rate numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS shipping_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_charges numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS landed_cost_method text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES public.purchase_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_po_number_unique ON public.purchase_orders (business_id, po_number);

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_sku text,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS damaged_quantity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejected_quantity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_date date,
  ADD COLUMN IF NOT EXISTS notes text;

-- ============ GOODS RECEIPTS ============
CREATE TABLE IF NOT EXISTS public.goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  receipt_number text NOT NULL,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  receipt_date date NOT NULL DEFAULT CURRENT_DATE,
  received_by uuid,
  received_by_name text,
  reference text,
  attachment_url text,
  notes text,
  status text NOT NULL DEFAULT 'draft',
  confirmed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.goods_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  receipt_id uuid NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id uuid REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  ordered_quantity numeric NOT NULL DEFAULT 0,
  received_quantity numeric NOT NULL DEFAULT 0,
  damaged_quantity numeric NOT NULL DEFAULT 0,
  rejected_quantity numeric NOT NULL DEFAULT 0,
  accepted_quantity numeric NOT NULL DEFAULT 0,
  unit text,
  unit_cost numeric NOT NULL DEFAULT 0,
  batch_number text,
  manufactured_date date,
  expiry_date date,
  serial_numbers text[],
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ PURCHASE RETURNS + CREDITS ============
CREATE TABLE IF NOT EXISTS public.purchase_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  return_number text NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  goods_receipt_id uuid REFERENCES public.goods_receipts(id) ON DELETE SET NULL,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  return_date date NOT NULL DEFAULT CURRENT_DATE,
  reason text,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.purchase_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  return_id uuid NOT NULL REFERENCES public.purchase_returns(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.supplier_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  purchase_return_id uuid REFERENCES public.purchase_returns(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  applied numeric NOT NULL DEFAULT 0,
  currency text,
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ SUPPLIER INVOICES (three-way match) ============
CREATE TABLE IF NOT EXISTS public.supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  goods_receipt_id uuid REFERENCES public.goods_receipts(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  currency text,
  exchange_rate numeric NOT NULL DEFAULT 1,
  invoiced_quantity numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  match_status text NOT NULL DEFAULT 'pending',
  match_notes text,
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ GRANTS + RLS FOR NEW DOC TABLES ============
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['purchase_requests','purchase_request_items','goods_receipts','goods_receipt_items','purchase_returns','purchase_return_items','supplier_credits','supplier_invoices']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_business_member(business_id))', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_write_business(business_id))', t||'_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.can_write_business(business_id)) WITH CHECK (public.can_write_business(business_id))', t||'_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_business_admin(business_id))', t||'_delete', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (business_id)', 'idx_'||t||'_biz', t);
  END LOOP;
END $$;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.purchase_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.goods_receipts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.purchase_returns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.supplier_credits FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.supplier_invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ PERFORMANCE INDEXES ============
CREATE INDEX IF NOT EXISTS idx_po_supplier ON public.purchase_orders (business_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON public.purchase_orders (business_id, status, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_poi_po ON public.purchase_order_items (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_gr_po ON public.goods_receipts (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_gri_receipt ON public.goods_receipt_items (receipt_id);
CREATE INDEX IF NOT EXISTS idx_sph_product ON public.supplier_price_history (business_id, product_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_products_product ON public.supplier_products (business_id, product_id);

-- ============ GOODS RECEIPT CONFIRMATION ENGINE ============
CREATE OR REPLACE FUNCTION public.confirm_goods_receipt(_receipt_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  gr public.goods_receipts%ROWTYPE;
  po public.purchase_orders%ROWTYPE;
  it record;
  bid uuid;
  batch uuid;
  terms text;
  due date;
  payable numeric := 0;
  remaining numeric;
  s text;
BEGIN
  SELECT * INTO gr FROM public.goods_receipts WHERE id = _receipt_id;
  IF gr.id IS NULL THEN RAISE EXCEPTION 'Goods receipt not found'; END IF;
  IF NOT public.can_write_business(gr.business_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF gr.status <> 'draft' THEN RAISE EXCEPTION 'Only draft receipts can be confirmed'; END IF;
  bid := gr.business_id;

  FOR it IN SELECT * FROM public.goods_receipt_items WHERE receipt_id = _receipt_id LOOP
    IF it.accepted_quantity > 0 THEN
      batch := NULL;
      IF it.batch_number IS NOT NULL AND it.batch_number <> '' THEN
        INSERT INTO public.batches (business_id, product_id, variant_id, warehouse_id, supplier_id,
          batch_number, manufactured_date, expiry_date, quantity, remaining_quantity, unit_cost, status)
        VALUES (bid, it.product_id, it.variant_id, gr.warehouse_id, gr.supplier_id,
          it.batch_number, it.manufactured_date, it.expiry_date, 0, 0, it.unit_cost, 'active')
        RETURNING id INTO batch;
      END IF;

      INSERT INTO public.inventory_movements
        (business_id, product_id, variant_id, warehouse_id, batch_id, type, quantity, base_quantity,
         unit, unit_cost, total_cost, reference, reference_type, reference_id, movement_date, notes, created_by)
      VALUES (bid, it.product_id, it.variant_id, gr.warehouse_id, batch, 'purchase',
         it.accepted_quantity, it.accepted_quantity, it.unit, it.unit_cost,
         it.accepted_quantity * it.unit_cost, gr.receipt_number, 'goods_receipt', gr.id,
         gr.receipt_date, 'Goods receipt ' || gr.receipt_number, gr.received_by);

      payable := payable + (it.accepted_quantity * it.unit_cost);

      INSERT INTO public.supplier_price_history
        (business_id, supplier_id, product_id, variant_id, price, currency, source, reference, effective_date, created_by)
      VALUES (bid, gr.supplier_id, it.product_id, it.variant_id, it.unit_cost, NULL,
        'goods_receipt', gr.receipt_number, gr.receipt_date, gr.received_by);

      UPDATE public.supplier_products
        SET last_purchase_price = it.unit_cost, last_purchase_date = gr.receipt_date, updated_at = now()
        WHERE business_id = bid AND supplier_id = gr.supplier_id AND product_id = it.product_id;
    END IF;

    IF it.purchase_order_item_id IS NOT NULL THEN
      UPDATE public.purchase_order_items
        SET received_quantity = COALESCE(received_quantity,0) + it.accepted_quantity,
            damaged_quantity = COALESCE(damaged_quantity,0) + it.damaged_quantity,
            rejected_quantity = COALESCE(rejected_quantity,0) + it.rejected_quantity
        WHERE id = it.purchase_order_item_id;
    END IF;
  END LOOP;

  UPDATE public.goods_receipts SET status = 'confirmed', confirmed_at = now() WHERE id = _receipt_id;

  IF gr.purchase_order_id IS NOT NULL THEN
    SELECT * INTO po FROM public.purchase_orders WHERE id = gr.purchase_order_id;
    SELECT COALESCE(SUM(GREATEST(quantity - COALESCE(received_quantity,0) - COALESCE(damaged_quantity,0) - COALESCE(rejected_quantity,0), 0)), 0)
      INTO remaining FROM public.purchase_order_items WHERE purchase_order_id = po.id;
    s := CASE WHEN remaining <= 0 THEN 'received' ELSE 'partially_received' END;
    UPDATE public.purchase_orders SET status = s WHERE id = po.id;
    terms := COALESCE(po.payment_terms, (SELECT payment_terms FROM public.suppliers WHERE id = gr.supplier_id), 'due_on_receipt');
  ELSE
    terms := COALESCE((SELECT payment_terms FROM public.suppliers WHERE id = gr.supplier_id), 'due_on_receipt');
  END IF;

  IF payable > 0 THEN
    due := gr.receipt_date + public.payment_terms_days(terms);
    INSERT INTO public.accounts_payable (business_id, supplier_id, purchase_order_id, amount, paid, due_date, status, notes)
    VALUES (bid, gr.supplier_id, gr.purchase_order_id, payable, 0, due, 'open',
            'Goods receipt ' || gr.receipt_number);
  END IF;

  INSERT INTO public.audit_logs (business_id, user_id, action, module, record_id, new_value)
  VALUES (bid, auth.uid(), 'goods_received', 'purchasing', gr.receipt_number,
          jsonb_build_object('receipt', gr.receipt_number, 'amount', payable));
END; $$;
GRANT EXECUTE ON FUNCTION public.confirm_goods_receipt(uuid) TO authenticated;

-- ============ PURCHASE RETURN POSTING ============
CREATE OR REPLACE FUNCTION public.post_purchase_return(_return_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pr public.purchase_returns%ROWTYPE; it record; amount numeric := 0;
BEGIN
  SELECT * INTO pr FROM public.purchase_returns WHERE id = _return_id;
  IF pr.id IS NULL THEN RAISE EXCEPTION 'Return not found'; END IF;
  IF NOT public.can_write_business(pr.business_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF pr.status <> 'draft' THEN RAISE EXCEPTION 'This return was already posted'; END IF;

  FOR it IN SELECT * FROM public.purchase_return_items WHERE return_id = _return_id LOOP
    IF it.quantity > 0 THEN
      INSERT INTO public.inventory_movements
        (business_id, product_id, variant_id, warehouse_id, type, quantity, base_quantity,
         unit_cost, total_cost, reference, reference_type, reference_id, movement_date, reason, created_by)
      VALUES (pr.business_id, it.product_id, it.variant_id, pr.warehouse_id, 'return_out',
        it.quantity, it.quantity, it.unit_cost, it.quantity * it.unit_cost,
        pr.return_number, 'purchase_return', pr.id, pr.return_date, pr.reason, pr.created_by);
      amount := amount + (it.quantity * it.unit_cost);
    END IF;
  END LOOP;

  UPDATE public.purchase_returns SET status = 'posted', total = amount WHERE id = _return_id;

  IF amount > 0 THEN
    INSERT INTO public.supplier_credits (business_id, supplier_id, purchase_return_id, amount, status, notes)
    VALUES (pr.business_id, pr.supplier_id, pr.id, amount, 'open', 'Credit from return ' || pr.return_number);
  END IF;

  INSERT INTO public.audit_logs (business_id, user_id, action, module, record_id, new_value)
  VALUES (pr.business_id, auth.uid(), 'purchase_return', 'purchasing', pr.return_number,
          jsonb_build_object('amount', amount));
END; $$;
GRANT EXECUTE ON FUNCTION public.post_purchase_return(uuid) TO authenticated;

-- ============ SUPPLIER SOFT-DELETE PROTECTION ============
CREATE OR REPLACE FUNCTION public.protect_supplier_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.purchase_orders WHERE supplier_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.goods_receipts WHERE supplier_id = OLD.id) THEN
    RAISE EXCEPTION 'This supplier has purchase history. Set the status to inactive instead of deleting.';
  END IF;
  RETURN OLD;
END; $$;
DROP TRIGGER IF EXISTS protect_supplier_delete_trg ON public.suppliers;
CREATE TRIGGER protect_supplier_delete_trg BEFORE DELETE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.protect_supplier_delete();

-- ============ PO STATUS STATE MACHINE ============
CREATE OR REPLACE FUNCTION public.guard_po_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF OLD.status IN ('received','closed','cancelled') AND NEW.status IN ('draft','pending_approval') THEN
      RAISE EXCEPTION 'Cannot move a % order back to %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS guard_po_status_trg ON public.purchase_orders;
CREATE TRIGGER guard_po_status_trg BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_po_status();

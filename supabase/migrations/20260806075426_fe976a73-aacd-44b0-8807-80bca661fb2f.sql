
-- ============ 1. CUSTOMERS ============
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS payment_terms text DEFAULT 'due_on_receipt',
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS price_tier text DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS is_walk_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS code text;

CREATE OR REPLACE FUNCTION public.protect_customer_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.sales WHERE customer_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.invoices WHERE customer_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.accounts_receivable WHERE customer_id = OLD.id) THEN
    RAISE EXCEPTION 'This customer has transaction history. Set the status to inactive instead of deleting.';
  END IF;
  RETURN OLD;
END; $$;
DROP TRIGGER IF EXISTS protect_customer_delete_trg ON public.customers;
CREATE TRIGGER protect_customer_delete_trg BEFORE DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.protect_customer_delete();

-- ============ 2. BUSINESS SETTINGS ============
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS enable_pos boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_quotes boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_sales_orders boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_shipping boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_customer_credit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_cash_register boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_name text NOT NULL DEFAULT 'Tax',
  ADD COLUMN IF NOT EXISTS tax_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_inclusive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sales_inventory_timing text NOT NULL DEFAULT 'sale_completed',
  ADD COLUMN IF NOT EXISTS sales_bom_mode text NOT NULL DEFAULT 'finished_good',
  ADD COLUMN IF NOT EXISTS discount_limit_percent numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS payment_methods jsonb NOT NULL DEFAULT '["cash","card","bank_transfer","digital_wallet","credit","other"]'::jsonb,
  ADD COLUMN IF NOT EXISTS sales_channels jsonb NOT NULL DEFAULT '["pos","online","phone","manual","wholesale","other"]'::jsonb;

-- ============ 3. SALES DOCUMENTS ============
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'sale',
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'pos',
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS exchange_rate numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS base_total numeric,
  ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'amount',
  ADD COLUMN IF NOT EXISTS discount_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_charges numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_inclusive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS salesperson_id uuid,
  ADD COLUMN IF NOT EXISTS register_id uuid,
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS customer_status text NOT NULL DEFAULT 'order_received',
  ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sales_order_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inventory_posted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS expected_date date,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS expires_on date,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS shipping_address text,
  ADD COLUMN IF NOT EXISTS billing_address text,
  ADD COLUMN IF NOT EXISTS shipping_method text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS return_reason text,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz;

ALTER TABLE public.sales ALTER COLUMN status SET DEFAULT 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS sales_number_unique ON public.sales(business_id, sale_number);
CREATE INDEX IF NOT EXISTS sales_biz_date_idx ON public.sales(business_id, sale_date DESC);
CREATE INDEX IF NOT EXISTS sales_biz_doc_status_idx ON public.sales(business_id, document_type, status);
CREATE INDEX IF NOT EXISTS sales_customer_idx ON public.sales(customer_id);
CREATE INDEX IF NOT EXISTS sales_location_idx ON public.sales(location_id);

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS tax_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'amount',
  ADD COLUMN IF NOT EXISTS fulfilled_quantity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS returned_quantity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS condition text,
  ADD COLUMN IF NOT EXISTS notes text;
CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS sale_items_product_idx ON public.sale_items(product_id);

-- ============ 4. NEW TABLES ============
CREATE TABLE IF NOT EXISTS public.cash_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  name text NOT NULL,
  assigned_user uuid,
  opening_cash numeric NOT NULL DEFAULT 0,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  expected_cash numeric,
  actual_cash numeric,
  variance numeric,
  variance_reason text,
  notes text,
  status text NOT NULL DEFAULT 'open',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_registers TO authenticated;
GRANT ALL ON public.cash_registers TO service_role;
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.register_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  register_id uuid NOT NULL REFERENCES public.cash_registers(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  reference text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.register_movements TO authenticated;
GRANT ALL ON public.register_movements TO service_role;
ALTER TABLE public.register_movements ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  register_id uuid REFERENCES public.cash_registers(id) ON DELETE SET NULL,
  method text NOT NULL DEFAULT 'cash',
  amount numeric NOT NULL,
  tendered numeric,
  change_given numeric NOT NULL DEFAULT 0,
  is_refund boolean NOT NULL DEFAULT false,
  reference text,
  notes text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_payments TO authenticated;
GRANT ALL ON public.sale_payments TO service_role;
ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS sale_payments_sale_idx ON public.sale_payments(sale_id);

CREATE TABLE IF NOT EXISTS public.held_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  register_id uuid REFERENCES public.cash_registers(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  label text,
  cart jsonb NOT NULL DEFAULT '[]'::jsonb,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'held',
  held_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.held_orders TO authenticated;
GRANT ALL ON public.held_orders TO service_role;
ALTER TABLE public.held_orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  tier text,
  price numeric NOT NULL,
  min_quantity numeric NOT NULL DEFAULT 0,
  currency text,
  starts_on date,
  ends_on date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_lists TO authenticated;
GRANT ALL ON public.price_lists TO service_role;
ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS price_lists_lookup_idx ON public.price_lists(business_id, product_id);

CREATE TABLE IF NOT EXISTS public.price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  old_price numeric,
  new_price numeric,
  reason text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.price_history TO authenticated;
GRANT ALL ON public.price_history TO service_role;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  sale_id uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  quantity numeric NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_reservations TO authenticated;
GRANT ALL ON public.inventory_reservations TO service_role;
ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS reservations_lookup_idx ON public.inventory_reservations(business_id, product_id, status);

-- shared policies
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cash_registers','register_movements','sale_payments','held_orders','price_lists','inventory_reservations'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_select" ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_insert" ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_update" ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_delete" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "%1$s_select" ON public.%1$s FOR SELECT TO authenticated USING (public.is_business_member(business_id))', t);
    EXECUTE format('CREATE POLICY "%1$s_insert" ON public.%1$s FOR INSERT TO authenticated WITH CHECK (public.can_write_business(business_id))', t);
    EXECUTE format('CREATE POLICY "%1$s_update" ON public.%1$s FOR UPDATE TO authenticated USING (public.can_write_business(business_id)) WITH CHECK (public.can_write_business(business_id))', t);
    EXECUTE format('CREATE POLICY "%1$s_delete" ON public.%1$s FOR DELETE TO authenticated USING (public.can_write_business(business_id))', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "price_history_select" ON public.price_history;
CREATE POLICY "price_history_select" ON public.price_history FOR SELECT TO authenticated USING (public.is_business_member(business_id));
DROP POLICY IF EXISTS "price_history_insert" ON public.price_history;
CREATE POLICY "price_history_insert" ON public.price_history FOR INSERT TO authenticated WITH CHECK (public.can_write_business(business_id));

DROP TRIGGER IF EXISTS set_updated_at ON public.cash_registers;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.cash_registers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.held_orders;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.held_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.price_lists;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.price_lists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.inventory_reservations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.inventory_reservations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 5. PRICE HISTORY TRIGGER ============
CREATE OR REPLACE FUNCTION public.track_price_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.selling_price IS DISTINCT FROM OLD.selling_price THEN
    INSERT INTO public.price_history (business_id, product_id, old_price, new_price, reason, changed_by)
    VALUES (NEW.business_id, NEW.id, OLD.selling_price, NEW.selling_price, 'Product price updated', auth.uid());
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS track_price_change_trg ON public.products;
CREATE TRIGGER track_price_change_trg AFTER UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.track_price_change();

-- ============ 6. PAYMENT STATUS ENGINE ============
CREATE OR REPLACE FUNCTION public.sync_sale_payments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE sid uuid; net numeric; refunds numeric; s public.sales%ROWTYPE; st text;
BEGIN
  sid := COALESCE(NEW.sale_id, OLD.sale_id);
  SELECT COALESCE(SUM(CASE WHEN is_refund THEN -amount ELSE amount END), 0),
         COALESCE(SUM(CASE WHEN is_refund THEN amount ELSE 0 END), 0)
    INTO net, refunds FROM public.sale_payments WHERE sale_id = sid;
  SELECT * INTO s FROM public.sales WHERE id = sid;

  IF s.status = 'voided' THEN st := 'voided';
  ELSIF refunds > 0 AND net <= 0.009 THEN st := 'refunded';
  ELSIF refunds > 0 THEN st := 'partially_refunded';
  ELSIF net <= 0.009 THEN st := 'unpaid';
  ELSIF net + 0.009 >= s.total THEN st := 'paid';
  ELSE st := 'partially_paid';
  END IF;

  UPDATE public.sales SET paid = net, payment_status = st, updated_at = now() WHERE id = sid;
  UPDATE public.accounts_receivable SET paid = LEAST(net, amount),
         status = CASE WHEN net + 0.009 >= amount THEN 'paid' ELSE 'open' END, updated_at = now()
   WHERE sale_id = sid;
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS sync_sale_payments_trg ON public.sale_payments;
CREATE TRIGGER sync_sale_payments_trg AFTER INSERT OR UPDATE OR DELETE ON public.sale_payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_sale_payments();

-- ============ 7. SALE COMPLETION ENGINE ============
CREATE OR REPLACE FUNCTION public.complete_sale(_sale_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  s public.sales%ROWTYPE;
  bs public.business_settings%ROWTYPE;
  it record;
  comp record;
  cost numeric;
  total_cogs numeric := 0;
  outstanding numeric;
  cust public.customers%ROWTYPE;
  avail numeric;
BEGIN
  SELECT * INTO s FROM public.sales WHERE id = _sale_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Sale not found'; END IF;
  IF NOT public.can_write_business(s.business_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF s.inventory_posted THEN RAISE EXCEPTION 'This sale was already completed'; END IF;
  IF s.status = 'voided' OR s.status = 'cancelled' THEN RAISE EXCEPTION 'Cannot complete a % sale', s.status; END IF;
  IF s.total < 0 THEN RAISE EXCEPTION 'Sale total cannot be negative'; END IF;

  SELECT * INTO bs FROM public.business_settings WHERE business_id = s.business_id;

  -- credit limit check
  outstanding := s.total - COALESCE(s.paid, 0);
  IF outstanding > 0.009 AND s.customer_id IS NOT NULL THEN
    SELECT * INTO cust FROM public.customers WHERE id = s.customer_id;
    IF COALESCE(bs.enable_customer_credit, false) AND COALESCE(cust.credit_limit, 0) > 0
       AND COALESCE(cust.balance, 0) + outstanding > cust.credit_limit THEN
      RAISE EXCEPTION 'Credit limit exceeded: available % of %',
        GREATEST(cust.credit_limit - COALESCE(cust.balance,0), 0), cust.credit_limit;
    END IF;
  END IF;

  FOR it IN SELECT si.*, p.has_bom, p.inventory_model, p.average_cost, p.standard_cost, p.cost_price
              FROM public.sale_items si JOIN public.products p ON p.id = si.product_id
             WHERE si.sale_id = _sale_id LOOP

    CONTINUE WHEN it.inventory_model IN ('service','non_stock','digital');
    IF NOT COALESCE(bs.track_quantity, true) THEN CONTINUE; END IF;

    IF it.has_bom AND COALESCE(bs.sales_bom_mode, 'finished_good') = 'consume_components' THEN
      FOR comp IN SELECT bi.component_id, bi.quantity
                    FROM public.bill_of_materials b JOIN public.bom_items bi ON bi.bom_id = b.id
                   WHERE b.product_id = it.product_id AND b.business_id = s.business_id LIMIT 200 LOOP
        SELECT COALESCE(average_cost, cost_price, 0) INTO cost FROM public.products WHERE id = comp.component_id;
        INSERT INTO public.inventory_movements
          (business_id, product_id, warehouse_id, type, quantity, base_quantity, unit_cost, total_cost,
           reference, reference_type, reference_id, movement_date, notes, created_by)
        VALUES (s.business_id, comp.component_id, s.location_id, 'consumption',
                comp.quantity * it.quantity, comp.quantity * it.quantity, cost,
                cost * comp.quantity * it.quantity, s.sale_number, 'sale', s.id, s.sale_date,
                'Recipe consumption for ' || s.sale_number, COALESCE(s.created_by, auth.uid()));
        total_cogs := total_cogs + (cost * comp.quantity * it.quantity);
      END LOOP;
      CONTINUE;
    END IF;

    -- cost basis for this line
    IF COALESCE(bs.costing_method, 'weighted_average') = 'standard' THEN
      cost := COALESCE(it.standard_cost, it.average_cost, it.cost_price, 0);
    ELSE
      SELECT COALESCE(b.average_cost, 0) INTO cost FROM public.inventory_balances b
       WHERE b.business_id = s.business_id AND b.product_id = it.product_id
         AND b.variant_id IS NOT DISTINCT FROM it.variant_id
         AND b.warehouse_id IS NOT DISTINCT FROM s.location_id;
      cost := COALESCE(NULLIF(cost, 0), it.average_cost, it.cost_price, 0);
    END IF;

    INSERT INTO public.inventory_movements
      (business_id, product_id, variant_id, warehouse_id, type, quantity, base_quantity, unit,
       unit_cost, total_cost, reference, reference_type, reference_id, movement_date, notes, created_by)
    VALUES (s.business_id, it.product_id, it.variant_id, s.location_id, 'sale',
            it.quantity, it.quantity, it.unit, cost, cost * it.quantity,
            s.sale_number, 'sale', s.id, s.sale_date, 'Sale ' || s.sale_number,
            COALESCE(s.created_by, auth.uid()));
  END LOOP;

  SELECT COALESCE(SUM(COALESCE(total_cost, unit_cost * quantity)), 0) INTO cost
    FROM public.inventory_movements WHERE reference_id = s.id AND reference_type = 'sale';
  total_cogs := GREATEST(total_cogs, COALESCE(cost, 0));

  UPDATE public.inventory_reservations SET status = 'released', updated_at = now()
   WHERE sale_id = s.id AND status = 'active';

  UPDATE public.sales
     SET inventory_posted = true, posted_at = now(),
         status = CASE WHEN document_type IN ('sale','pos_sale') THEN 'completed' ELSE 'fulfilled' END,
         fulfillment_status = 'fulfilled', customer_status = 'delivered',
         cost_total = total_cogs,
         base_total = ROUND(total * COALESCE(NULLIF(exchange_rate,0),1), 2),
         updated_at = now()
   WHERE id = s.id;

  UPDATE public.sale_items SET fulfilled_quantity = quantity WHERE sale_id = s.id;

  IF outstanding > 0.009 THEN
    INSERT INTO public.accounts_receivable (business_id, customer_id, sale_id, amount, paid, due_date, status, notes)
    VALUES (s.business_id, s.customer_id, s.id, s.total, COALESCE(s.paid, 0),
            COALESCE(s.due_date, s.sale_date + public.payment_terms_days(COALESCE(s.payment_terms,'due_on_receipt'))),
            'open', 'Sale ' || s.sale_number);
    IF s.customer_id IS NOT NULL THEN
      UPDATE public.customers SET balance = COALESCE(balance,0) + outstanding WHERE id = s.customer_id;
    END IF;
  END IF;

  INSERT INTO public.cash_transactions (business_id, type, amount, category, description, reference, transaction_date, created_by)
  SELECT s.business_id, 'in', SUM(amount), 'sales', 'Cash from ' || s.sale_number, s.sale_number, s.sale_date, COALESCE(s.created_by, auth.uid())
    FROM public.sale_payments WHERE sale_id = s.id AND method = 'cash' AND NOT is_refund
   HAVING SUM(amount) > 0;

  INSERT INTO public.audit_logs (business_id, user_id, action, module, record_id, new_value)
  VALUES (s.business_id, auth.uid(), 'sale_completed', 'sales', s.sale_number,
          jsonb_build_object('total', s.total, 'cogs', total_cogs, 'location', s.location_id));
END; $$;

-- ============ 8. RETURNS ENGINE ============
CREATE OR REPLACE FUNCTION public.post_sales_return(_return_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r public.sales%ROWTYPE; it record; cost numeric; total_cogs numeric := 0; sold numeric; already numeric;
BEGIN
  SELECT * INTO r FROM public.sales WHERE id = _return_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Return not found'; END IF;
  IF NOT public.can_write_business(r.business_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF r.inventory_posted THEN RAISE EXCEPTION 'This return was already posted'; END IF;

  FOR it IN SELECT si.*, p.inventory_model FROM public.sale_items si
              JOIN public.products p ON p.id = si.product_id WHERE si.sale_id = _return_id LOOP
    IF it.quantity <= 0 THEN RAISE EXCEPTION 'Return quantity must be positive'; END IF;

    IF r.original_sale_id IS NOT NULL THEN
      SELECT COALESCE(SUM(quantity),0), COALESCE(SUM(returned_quantity),0) INTO sold, already
        FROM public.sale_items WHERE sale_id = r.original_sale_id AND product_id = it.product_id
          AND variant_id IS NOT DISTINCT FROM it.variant_id;
      IF it.quantity + already > sold THEN
        RAISE EXCEPTION 'Cannot return more than was sold (sold %, already returned %)', sold, already;
      END IF;
      UPDATE public.sale_items SET returned_quantity = COALESCE(returned_quantity,0) + it.quantity
       WHERE sale_id = r.original_sale_id AND product_id = it.product_id
         AND variant_id IS NOT DISTINCT FROM it.variant_id;
    END IF;

    CONTINUE WHEN it.inventory_model IN ('service','non_stock','digital');

    cost := COALESCE(NULLIF(it.unit_cost, 0),
      (SELECT COALESCE(average_cost, cost_price, 0) FROM public.products WHERE id = it.product_id));

    INSERT INTO public.inventory_movements
      (business_id, product_id, variant_id, warehouse_id, type, quantity, base_quantity,
       unit_cost, total_cost, reference, reference_type, reference_id, movement_date, reason, created_by)
    VALUES (r.business_id, it.product_id, it.variant_id, r.location_id, 'return_in', it.quantity, it.quantity,
            cost, cost * it.quantity, r.sale_number, 'sales_return', r.id, r.sale_date,
            COALESCE(it.condition, 'resellable'), COALESCE(r.created_by, auth.uid()));
    total_cogs := total_cogs + (cost * it.quantity);

    IF COALESCE(it.condition, 'resellable') <> 'resellable' THEN
      INSERT INTO public.inventory_movements
        (business_id, product_id, variant_id, warehouse_id, type, quantity, base_quantity,
         unit_cost, total_cost, reference, reference_type, reference_id, movement_date, reason, created_by)
      VALUES (r.business_id, it.product_id, it.variant_id, r.location_id, 'damage', it.quantity, it.quantity,
              cost, cost * it.quantity, r.sale_number, 'sales_return', r.id, r.sale_date,
              it.condition, COALESCE(r.created_by, auth.uid()));
    END IF;
  END LOOP;

  UPDATE public.sales SET inventory_posted = true, posted_at = now(), status = 'completed',
         cost_total = -total_cogs, updated_at = now() WHERE id = r.id;

  IF r.original_sale_id IS NOT NULL AND r.total > 0 THEN
    UPDATE public.accounts_receivable ar
       SET amount = GREATEST(ar.amount - r.total, 0), updated_at = now()
     WHERE ar.sale_id = r.original_sale_id AND ar.status <> 'paid';
  END IF;

  INSERT INTO public.audit_logs (business_id, user_id, action, module, record_id, new_value)
  VALUES (r.business_id, auth.uid(), 'sales_return', 'sales', r.sale_number,
          jsonb_build_object('total', r.total, 'cogs_reversed', total_cogs));
END; $$;

-- ============ 9. REGISTER CLOSING ============
CREATE OR REPLACE FUNCTION public.close_register(_register_id uuid, _actual numeric, _reason text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE reg public.cash_registers%ROWTYPE; expected numeric; var numeric;
BEGIN
  SELECT * INTO reg FROM public.cash_registers WHERE id = _register_id FOR UPDATE;
  IF reg.id IS NULL THEN RAISE EXCEPTION 'Register not found'; END IF;
  IF NOT public.can_write_business(reg.business_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF reg.status <> 'open' THEN RAISE EXCEPTION 'Register is already closed'; END IF;

  SELECT reg.opening_cash
    + COALESCE((SELECT SUM(CASE WHEN is_refund THEN -amount ELSE amount END)
                  FROM public.sale_payments WHERE register_id = reg.id AND method = 'cash'), 0)
    + COALESCE((SELECT SUM(CASE WHEN type IN ('cash_in','float') THEN amount ELSE -amount END)
                  FROM public.register_movements WHERE register_id = reg.id), 0)
    INTO expected;

  var := COALESCE(_actual, 0) - expected;
  IF ABS(var) > 0.009 AND (_reason IS NULL OR _reason = '') THEN
    RAISE EXCEPTION 'A reason is required when the counted cash does not match';
  END IF;

  UPDATE public.cash_registers
     SET status = 'closed', closed_at = now(), expected_cash = expected,
         actual_cash = _actual, variance = var, variance_reason = _reason, updated_at = now()
   WHERE id = reg.id;

  INSERT INTO public.audit_logs (business_id, user_id, action, module, record_id, new_value)
  VALUES (reg.business_id, auth.uid(), 'register_closed', 'sales', reg.name,
          jsonb_build_object('expected', expected, 'actual', _actual, 'variance', var, 'reason', _reason));
  RETURN var;
END; $$;

-- ============ 10. SALE STATUS GUARD ============
CREATE OR REPLACE FUNCTION public.guard_sale_status()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF OLD.status IN ('completed','fulfilled','cancelled','voided','closed','converted')
       AND NEW.status IN ('draft','pending_approval') THEN
      RAISE EXCEPTION 'Cannot move a % sale back to %', OLD.status, NEW.status;
    END IF;
  END IF;
  IF NEW.total < 0 THEN RAISE EXCEPTION 'Sale total cannot be negative'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS guard_sale_status_trg ON public.sales;
CREATE TRIGGER guard_sale_status_trg BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.guard_sale_status();

REVOKE EXECUTE ON FUNCTION public.track_price_change() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_sale_payments() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_customer_delete() FROM authenticated;

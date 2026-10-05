ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS consumption_mode text NOT NULL DEFAULT 'on_sale',
  ADD COLUMN IF NOT EXISTS output_quantity numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS labor_hours numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overhead_per_unit numeric NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD CONSTRAINT products_consumption_mode_chk CHECK (consumption_mode IN ('on_sale','on_production'));
ALTER TABLE public.products ADD CONSTRAINT products_made_from_nonneg_chk CHECK (output_quantity > 0 AND labor_hours >= 0 AND labor_rate >= 0 AND overhead_per_unit >= 0);

ALTER TABLE public.bundle_components
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS entered_quantity numeric,
  ADD COLUMN IF NOT EXISTS entered_unit text,
  ADD COLUMN IF NOT EXISTS waste_percent numeric NOT NULL DEFAULT 0;
ALTER TABLE public.bundle_components ADD CONSTRAINT bundle_components_waste_chk CHECK (waste_percent >= 0 AND waste_percent <= 100);
ALTER TABLE public.bundle_components ADD CONSTRAINT bundle_components_qty_chk CHECK (quantity > 0) NOT VALID;
COMMENT ON TABLE public.bundle_components IS 'Made-from components for any item (menu items, combos, finished products, service supplies). quantity is in the component stock unit per output_quantity of the parent.';

CREATE OR REPLACE FUNCTION public.guard_bundle_component_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE comp public.products%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = NEW.bundle_product_id AND business_id = NEW.business_id) THEN
    RAISE EXCEPTION 'Item must belong to the current business';
  END IF;
  SELECT * INTO comp FROM public.products WHERE id = NEW.component_product_id AND business_id = NEW.business_id;
  IF comp.id IS NULL THEN RAISE EXCEPTION 'Component must belong to the same business'; END IF;
  IF comp.item_type = 'service' THEN RAISE EXCEPTION 'A service cannot be used as a component'; END IF;
  IF NEW.component_product_id = NEW.bundle_product_id THEN RAISE EXCEPTION 'An item cannot be made from itself'; END IF;
  IF EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = comp.id AND COALESCE(v.status,'active') <> 'archived') THEN
    IF NEW.variant_id IS NULL THEN RAISE EXCEPTION 'Choose a variant for %', comp.name; END IF;
  END IF;
  IF NEW.variant_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.product_variants v WHERE v.id = NEW.variant_id AND v.product_id = comp.id AND v.business_id = NEW.business_id) THEN
    RAISE EXCEPTION 'Variant does not belong to %', comp.name;
  END IF;
  IF EXISTS (
    WITH RECURSIVE chain(pid) AS (
      SELECT NEW.component_product_id
      UNION
      SELECT bc.component_product_id FROM public.bundle_components bc JOIN chain c ON bc.bundle_product_id = c.pid
    ) SELECT 1 FROM chain WHERE pid = NEW.bundle_product_id) THEN
    RAISE EXCEPTION 'This would make a circular recipe (% already uses this item)', comp.name;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.recalc_made_from_cost(_product_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p public.products%ROWTYPE; material numeric; unit_cost numeric;
BEGIN
  SELECT * INTO p FROM public.products WHERE id = _product_id;
  IF p.id IS NULL OR NOT EXISTS (SELECT 1 FROM public.bundle_components WHERE bundle_product_id = _product_id) THEN RETURN; END IF;
  SELECT COALESCE(SUM(bc.quantity * (1 + bc.waste_percent / 100) *
           COALESCE(NULLIF(v.cost_price, 0), NULLIF(c.cost_price, 0), c.average_cost, 0)), 0)
    INTO material
    FROM public.bundle_components bc
    JOIN public.products c ON c.id = bc.component_product_id
    LEFT JOIN public.product_variants v ON v.id = bc.variant_id
   WHERE bc.bundle_product_id = _product_id;
  unit_cost := ROUND((material + p.labor_hours * p.labor_rate) / NULLIF(p.output_quantity, 0) + p.overhead_per_unit, 4);
  UPDATE public.products SET cost_price = unit_cost
   WHERE id = _product_id AND cost_price IS DISTINCT FROM unit_cost;
END $$;

CREATE OR REPLACE FUNCTION public.made_from_component_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN PERFORM public.recalc_made_from_cost(OLD.bundle_product_id); END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN PERFORM public.recalc_made_from_cost(NEW.bundle_product_id); END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS made_from_component_changed_trg ON public.bundle_components;
CREATE TRIGGER made_from_component_changed_trg AFTER INSERT OR UPDATE OR DELETE ON public.bundle_components
  FOR EACH ROW EXECUTE FUNCTION public.made_from_component_changed();

CREATE OR REPLACE FUNCTION public.made_from_product_cost_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE parent uuid;
BEGIN
  IF NEW.labor_hours IS DISTINCT FROM OLD.labor_hours OR NEW.labor_rate IS DISTINCT FROM OLD.labor_rate
     OR NEW.overhead_per_unit IS DISTINCT FROM OLD.overhead_per_unit OR NEW.output_quantity IS DISTINCT FROM OLD.output_quantity THEN
    PERFORM public.recalc_made_from_cost(NEW.id);
  END IF;
  IF NEW.cost_price IS DISTINCT FROM OLD.cost_price OR NEW.average_cost IS DISTINCT FROM OLD.average_cost THEN
    FOR parent IN SELECT DISTINCT bundle_product_id FROM public.bundle_components
                   WHERE component_product_id = NEW.id AND variant_id IS NULL AND bundle_product_id <> NEW.id LOOP
      PERFORM public.recalc_made_from_cost(parent);
    END LOOP;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS made_from_product_cost_trg ON public.products;
CREATE TRIGGER made_from_product_cost_trg AFTER UPDATE OF cost_price, average_cost, labor_hours, labor_rate, overhead_per_unit, output_quantity
  ON public.products FOR EACH ROW EXECUTE FUNCTION public.made_from_product_cost_changed();

CREATE OR REPLACE FUNCTION public.made_from_variant_cost_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE parent uuid;
BEGIN
  IF NEW.cost_price IS DISTINCT FROM OLD.cost_price THEN
    FOR parent IN SELECT DISTINCT bundle_product_id FROM public.bundle_components WHERE variant_id = NEW.id LOOP
      PERFORM public.recalc_made_from_cost(parent);
    END LOOP;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS made_from_variant_cost_trg ON public.product_variants;
CREATE TRIGGER made_from_variant_cost_trg AFTER UPDATE OF cost_price ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.made_from_variant_cost_changed();

CREATE OR REPLACE FUNCTION public.complete_sale(_sale_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  s public.sales%ROWTYPE;
  bs public.business_settings%ROWTYPE;
  it record; comp record;
  cost numeric; total_cogs numeric := 0; outstanding numeric; need numeric;
  cust public.customers%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.sales WHERE id = _sale_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Sale not found'; END IF;
  IF NOT public.can_write_business(s.business_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF s.inventory_posted THEN RAISE EXCEPTION 'This sale was already completed'; END IF;
  IF s.status = 'voided' OR s.status = 'cancelled' THEN RAISE EXCEPTION 'Cannot complete a % sale', s.status; END IF;
  IF s.total < 0 THEN RAISE EXCEPTION 'Sale total cannot be negative'; END IF;

  SELECT * INTO bs FROM public.business_settings WHERE business_id = s.business_id;

  outstanding := s.total - COALESCE(s.paid, 0);
  IF outstanding > 0.009 AND s.customer_id IS NOT NULL THEN
    SELECT * INTO cust FROM public.customers WHERE id = s.customer_id;
    IF COALESCE(bs.enable_customer_credit, false) AND COALESCE(cust.credit_limit, 0) > 0
       AND COALESCE(cust.balance, 0) + outstanding > cust.credit_limit THEN
      RAISE EXCEPTION 'Credit limit exceeded: available % of %',
        GREATEST(cust.credit_limit - COALESCE(cust.balance,0), 0), cust.credit_limit;
    END IF;
  END IF;

  FOR it IN SELECT si.*, p.has_bom, p.inventory_model, p.average_cost, p.standard_cost, p.cost_price,
                   v.cost_price AS variant_cost, p.item_type AS item_type,
                   p.consumption_mode, p.output_quantity,
                   EXISTS (SELECT 1 FROM public.bundle_components bc WHERE bc.bundle_product_id = p.id AND bc.business_id = s.business_id) AS has_components
              FROM public.sale_items si JOIN public.products p ON p.id = si.product_id
              LEFT JOIN public.product_variants v ON v.id = si.variant_id
             WHERE si.sale_id = _sale_id LOOP

    IF it.item_type = 'bundle' AND NOT it.has_components THEN
      RAISE EXCEPTION 'Bundle has no components';
    END IF;

    -- Made-from items sold in on_sale mode hold no stock: deduct each component
    -- (exact variant, waste included) in this same locked/idempotent transaction.
    IF it.has_components AND it.consumption_mode = 'on_sale' THEN
      IF COALESCE(bs.track_quantity, true) THEN
        FOR comp IN SELECT bc.component_product_id, bc.variant_id, bc.quantity, bc.waste_percent, p.unit,
                           COALESCE(NULLIF(b.average_cost, 0), NULLIF(v.cost_price, 0),
                                    CASE WHEN bc.variant_id IS NULL THEN COALESCE(NULLIF(p.average_cost, 0), p.cost_price) END, 0) AS component_cost
                      FROM public.bundle_components bc
                      JOIN public.products p ON p.id = bc.component_product_id AND p.business_id = s.business_id
                      LEFT JOIN public.product_variants v ON v.id = bc.variant_id
                      LEFT JOIN public.inventory_balances b ON b.business_id = s.business_id
                        AND b.product_id = p.id AND b.variant_id IS NOT DISTINCT FROM bc.variant_id
                        AND b.warehouse_id IS NOT DISTINCT FROM s.location_id
                     WHERE bc.bundle_product_id = it.product_id AND bc.business_id = s.business_id LOOP
          need := ROUND(comp.quantity * (1 + comp.waste_percent / 100) / NULLIF(it.output_quantity, 0) * it.quantity, 4);
          INSERT INTO public.inventory_movements
            (business_id, product_id, variant_id, warehouse_id, type, quantity, base_quantity, unit, unit_cost, total_cost,
             reference, reference_type, reference_id, movement_date, notes, created_by)
          VALUES (s.business_id, comp.component_product_id, comp.variant_id, s.location_id, 'consumption',
                  need, need, comp.unit, comp.component_cost, comp.component_cost * need,
                  s.sale_number, 'sale', s.id, s.sale_date,
                  'Component for ' || s.sale_number, COALESCE(s.created_by, auth.uid()));
          total_cogs := total_cogs + comp.component_cost * need;
        END LOOP;
      END IF;
      CONTINUE;
    END IF;
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

    IF COALESCE(bs.costing_method, 'weighted_average') = 'standard' THEN
      cost := CASE WHEN it.variant_id IS NOT NULL
                   THEN COALESCE(it.variant_cost, it.standard_cost, 0)
                   ELSE COALESCE(it.standard_cost, it.average_cost, it.cost_price, 0) END;
    ELSE
      SELECT COALESCE(b.average_cost, 0) INTO cost FROM public.inventory_balances b
       WHERE b.business_id = s.business_id AND b.product_id = it.product_id
         AND b.variant_id IS NOT DISTINCT FROM it.variant_id
         AND b.warehouse_id IS NOT DISTINCT FROM s.location_id;
      cost := CASE WHEN it.variant_id IS NOT NULL
                   THEN COALESCE(NULLIF(cost, 0), it.variant_cost, 0)
                   ELSE COALESCE(NULLIF(cost, 0), it.average_cost, it.cost_price, 0) END;
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
END; $function$;

REVOKE EXECUTE ON FUNCTION public.recalc_made_from_cost(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.made_from_component_changed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.made_from_product_cost_changed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.made_from_variant_cost_changed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_bundle_component_identity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_sale(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_sale(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalc_made_from_cost(uuid) TO authenticated, service_role;
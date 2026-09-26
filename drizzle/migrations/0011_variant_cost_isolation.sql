CREATE OR REPLACE FUNCTION public.apply_inventory_movement()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  s integer := public.movement_sign(NEW.type);
  qty numeric := COALESCE(NEW.base_quantity, NEW.quantity);
  delta numeric; prev_qty numeric; prev_cost numeric; new_cost numeric;
BEGIN
  IF NEW.type = 'stock_count' THEN
    delta := qty - COALESCE((SELECT quantity FROM public.inventory_balances b
      WHERE b.product_id = NEW.product_id
        AND b.warehouse_id IS NOT DISTINCT FROM NEW.warehouse_id
        AND b.variant_id IS NOT DISTINCT FROM NEW.variant_id), 0);
  ELSE
    delta := s * qty;
  END IF;

  UPDATE public.products SET stock = stock + delta, updated_at = now() WHERE id = NEW.product_id;
  IF NEW.variant_id IS NOT NULL THEN
    UPDATE public.product_variants SET stock = stock + delta, updated_at = now() WHERE id = NEW.variant_id;
  END IF;

  SELECT quantity, average_cost INTO prev_qty, prev_cost FROM public.inventory_balances b
    WHERE b.product_id = NEW.product_id
      AND b.warehouse_id IS NOT DISTINCT FROM NEW.warehouse_id
      AND b.variant_id IS NOT DISTINCT FROM NEW.variant_id;
  prev_qty := COALESCE(prev_qty, 0);
  prev_cost := COALESCE(prev_cost, 0);
  IF delta > 0 AND COALESCE(NEW.unit_cost, 0) > 0 AND (prev_qty + delta) > 0 THEN
    new_cost := ((GREATEST(prev_qty,0) * prev_cost) + (delta * NEW.unit_cost)) / (GREATEST(prev_qty,0) + delta);
  ELSE
    new_cost := prev_cost;
  END IF;

  INSERT INTO public.inventory_balances (business_id, product_id, variant_id, warehouse_id, batch_id, quantity, average_cost)
  VALUES (NEW.business_id, NEW.product_id, NEW.variant_id, NEW.warehouse_id, NEW.batch_id, delta, COALESCE(NULLIF(new_cost,0), NEW.unit_cost, 0))
  ON CONFLICT (business_id, product_id,
               COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
               COALESCE(warehouse_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET quantity = public.inventory_balances.quantity + delta,
                average_cost = COALESCE(NULLIF(new_cost,0), public.inventory_balances.average_cost),
                updated_at = now();

  IF NEW.type = 'transfer_out' AND NEW.to_warehouse_id IS NOT NULL THEN
    INSERT INTO public.inventory_balances (business_id, product_id, variant_id, warehouse_id, quantity, average_cost)
    VALUES (NEW.business_id, NEW.product_id, NEW.variant_id, NEW.to_warehouse_id, qty, COALESCE(NEW.unit_cost, 0))
    ON CONFLICT (business_id, product_id,
                 COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 COALESCE(warehouse_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET quantity = public.inventory_balances.quantity + qty, updated_at = now();
    UPDATE public.products SET stock = stock + qty WHERE id = NEW.product_id;
  END IF;

  IF NEW.batch_id IS NOT NULL THEN
    UPDATE public.batches SET remaining_quantity = remaining_quantity + delta, updated_at = now() WHERE id = NEW.batch_id;
  END IF;

  -- Cost history per exact identity. The parent average_cost is only updated
  -- for non-variant stock so variant costs never bleed into the parent.
  IF delta > 0 AND COALESCE(NEW.unit_cost,0) > 0 THEN
    IF NEW.variant_id IS NULL THEN
      INSERT INTO public.cost_history (business_id, product_id, variant_id, old_cost, new_cost, method, reason, created_by)
      SELECT NEW.business_id, NEW.product_id, NULL, p.average_cost, new_cost, 'weighted_average', NEW.type, NEW.created_by
      FROM public.products p WHERE p.id = NEW.product_id AND p.average_cost IS DISTINCT FROM new_cost;
      UPDATE public.products SET average_cost = new_cost WHERE id = NEW.product_id;
    ELSIF prev_cost IS DISTINCT FROM new_cost THEN
      INSERT INTO public.cost_history (business_id, product_id, variant_id, old_cost, new_cost, method, reason, created_by)
      VALUES (NEW.business_id, NEW.product_id, NEW.variant_id, prev_cost, new_cost, 'weighted_average', NEW.type, NEW.created_by);
    END IF;
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.complete_sale(_sale_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  s public.sales%ROWTYPE;
  bs public.business_settings%ROWTYPE;
  it record; comp record;
  cost numeric; total_cogs numeric := 0; outstanding numeric;
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
                   v.cost_price AS variant_cost
              FROM public.sale_items si JOIN public.products p ON p.id = si.product_id
              LEFT JOIN public.product_variants v ON v.id = si.variant_id
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

    IF COALESCE(bs.costing_method, 'weighted_average') = 'standard' THEN
      cost := CASE WHEN it.variant_id IS NOT NULL
                   THEN COALESCE(it.variant_cost, it.standard_cost, 0)
                   ELSE COALESCE(it.standard_cost, it.average_cost, it.cost_price, 0) END;
    ELSE
      SELECT COALESCE(b.average_cost, 0) INTO cost FROM public.inventory_balances b
       WHERE b.business_id = s.business_id AND b.product_id = it.product_id
         AND b.variant_id IS NOT DISTINCT FROM it.variant_id
         AND b.warehouse_id IS NOT DISTINCT FROM s.location_id;
      -- Fallback stays on the exact sellable identity: variant cost for variants.
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

REVOKE EXECUTE ON FUNCTION public.apply_inventory_movement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_sale(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_sale(uuid) TO authenticated, service_role;
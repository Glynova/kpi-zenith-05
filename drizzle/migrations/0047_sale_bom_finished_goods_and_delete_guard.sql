CREATE OR REPLACE FUNCTION public.complete_sale(_sale_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s public.sales%ROWTYPE;
  bs public.business_settings%ROWTYPE;
  it record; comp record;
  cost numeric; total_cogs numeric := 0; outstanding numeric; need numeric;
  fg_qty numeric; fg_cost numeric; from_stock numeric; remaining numeric;
  cust public.customers%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.sales WHERE id = _sale_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Sale not found'; END IF;
  IF NOT public.can_write_business(s.business_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF s.inventory_posted THEN RAISE EXCEPTION 'This sale was already completed'; END IF;
  IF s.status = 'voided' OR s.status = 'cancelled' THEN RAISE EXCEPTION 'Cannot complete a % sale', s.status; END IF;
  IF s.total < 0 THEN RAISE EXCEPTION 'Sale total cannot be negative'; END IF;
  -- Idempotency: never post stock twice for the same sale.
  IF EXISTS (SELECT 1 FROM public.inventory_movements WHERE reference_type = 'sale' AND reference_id = s.id) THEN
    RAISE EXCEPTION 'Stock for this sale was already posted';
  END IF;

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
                   p.costing_method AS item_costing, p.last_purchase_cost AS p_lpc, v.last_purchase_cost AS v_lpc,
                   p.consumption_mode, p.output_quantity,
                   EXISTS (SELECT 1 FROM public.bundle_components bc WHERE bc.bundle_product_id = p.id AND bc.business_id = s.business_id) AS has_components
              FROM public.sale_items si JOIN public.products p ON p.id = si.product_id AND p.business_id = s.business_id
              LEFT JOIN public.product_variants v ON v.id = si.variant_id
             WHERE si.sale_id = _sale_id LOOP

    IF it.item_type = 'bundle' AND NOT it.has_components THEN
      RAISE EXCEPTION 'Bundle has no components';
    END IF;

    -- Made-to-order: deduct components. Finished stock already produced for this
    -- item (e.g. made in batches before its type changed) is sold first so the
    -- ingredients are never deducted twice.
    IF it.has_components AND COALESCE(it.consumption_mode, 'on_sale') = 'on_sale' THEN
      IF COALESCE(bs.track_quantity, true) THEN
        SELECT COALESCE(SUM(b.quantity), 0),
               COALESCE(SUM(b.quantity * b.average_cost) / NULLIF(SUM(b.quantity), 0), 0)
          INTO fg_qty, fg_cost
          FROM public.inventory_balances b
         WHERE b.business_id = s.business_id AND b.product_id = it.product_id
           AND b.variant_id IS NOT DISTINCT FROM it.variant_id
           AND b.warehouse_id IS NOT DISTINCT FROM s.location_id AND b.quantity > 0;
        from_stock := LEAST(GREATEST(fg_qty, 0), it.quantity);
        remaining := it.quantity - from_stock;

        IF from_stock > 0 THEN
          fg_cost := COALESCE(NULLIF(fg_cost, 0), it.variant_cost, it.average_cost, it.cost_price, 0);
          INSERT INTO public.inventory_movements
            (business_id, product_id, variant_id, warehouse_id, type, quantity, base_quantity, unit,
             unit_cost, total_cost, reference, reference_type, reference_id, movement_date, notes, created_by)
          VALUES (s.business_id, it.product_id, it.variant_id, s.location_id, 'sale',
                  from_stock, from_stock, it.unit, fg_cost, fg_cost * from_stock,
                  s.sale_number, 'sale', s.id, s.sale_date, 'Sale ' || s.sale_number || ' (from produced stock)',
                  COALESCE(s.created_by, auth.uid()));
        END IF;

        IF remaining > 0 THEN
          FOR comp IN SELECT bc.component_product_id, bc.variant_id, bc.quantity, bc.waste_percent, p.unit,
                             COALESCE(NULLIF(b.average_cost, 0), NULLIF(v.cost_price, 0),
                                      CASE WHEN bc.variant_id IS NULL THEN COALESCE(NULLIF(p.average_cost, 0), p.cost_price) END, 0) AS component_cost
                        FROM public.bundle_components bc
                        JOIN public.products p ON p.id = bc.component_product_id AND p.business_id = s.business_id
                        LEFT JOIN public.product_variants v ON v.id = bc.variant_id
                        LEFT JOIN public.inventory_balances b ON b.business_id = s.business_id
                          AND b.product_id = p.id AND b.variant_id IS NOT DISTINCT FROM bc.variant_id
                          AND b.warehouse_id IS NOT DISTINCT FROM s.location_id AND b.batch_id IS NULL
                       WHERE bc.bundle_product_id = it.product_id AND bc.business_id = s.business_id LOOP
            need := ROUND(comp.quantity * (1 + COALESCE(comp.waste_percent,0) / 100) / NULLIF(COALESCE(it.output_quantity,1), 0) * remaining, 4);
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
      END IF;
      CONTINUE;
    END IF;
    CONTINUE WHEN it.inventory_model IN ('service','non_stock','digital');
    IF NOT COALESCE(bs.track_quantity, true) THEN CONTINUE; END IF;

    -- Legacy recipes: only consume ingredients for made-to-order items. Items
    -- produced ahead (on_production) always sell their finished stock.
    IF it.has_bom AND COALESCE(it.consumption_mode, 'on_sale') <> 'on_production'
       AND COALESCE(bs.sales_bom_mode, 'finished_good') = 'consume_components' THEN
      FOR comp IN SELECT bi.component_product_id, bi.quantity, b.output_quantity
                    FROM public.bill_of_materials b JOIN public.bom_items bi ON bi.bom_id = b.id
                   WHERE b.product_id = it.product_id AND b.business_id = s.business_id LIMIT 200 LOOP
        SELECT COALESCE(NULLIF(average_cost,0), cost_price, 0) INTO cost FROM public.products
         WHERE id = comp.component_product_id AND business_id = s.business_id;
        need := ROUND(comp.quantity / NULLIF(COALESCE(comp.output_quantity,1),0) * it.quantity, 4);
        INSERT INTO public.inventory_movements
          (business_id, product_id, warehouse_id, type, quantity, base_quantity, unit_cost, total_cost,
           reference, reference_type, reference_id, movement_date, notes, created_by)
        VALUES (s.business_id, comp.component_product_id, s.location_id, 'consumption',
                need, need, cost, cost * need, s.sale_number, 'sale', s.id, s.sale_date,
                'Recipe consumption for ' || s.sale_number, COALESCE(s.created_by, auth.uid()));
        total_cogs := total_cogs + (cost * need);
      END LOOP;
      CONTINUE;
    END IF;

    IF it.item_costing = 'last_purchase' THEN
      cost := CASE WHEN it.variant_id IS NOT NULL
                   THEN COALESCE(NULLIF(it.v_lpc,0), it.variant_cost, 0)
                   ELSE COALESCE(NULLIF(it.p_lpc,0), it.cost_price, 0) END;
    ELSIF COALESCE(it.item_costing, bs.costing_method, 'weighted_average') = 'standard' THEN
      cost := CASE WHEN it.variant_id IS NOT NULL
                   THEN COALESCE(it.variant_cost, it.standard_cost, 0)
                   ELSE COALESCE(it.standard_cost, it.average_cost, it.cost_price, 0) END;
    ELSE
      SELECT COALESCE(b.average_cost, 0) INTO cost FROM public.inventory_balances b
       WHERE b.business_id = s.business_id AND b.product_id = it.product_id
         AND b.variant_id IS NOT DISTINCT FROM it.variant_id
         AND b.warehouse_id IS NOT DISTINCT FROM s.location_id
       ORDER BY (b.batch_id IS NULL) DESC LIMIT 1;
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

-- Confirmed (non-draft) sales can never be deleted; void/refund instead.
CREATE OR REPLACE FUNCTION public.guard_posted_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.fin_bypass', true) = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.inventory_posted OR COALESCE(OLD.status, 'draft') NOT IN ('draft', 'quote', 'quotation', 'held') THEN
      RAISE EXCEPTION 'Confirmed sale % cannot be deleted. Void or refund it instead.', OLD.sale_number;
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
END $function$;

CREATE OR REPLACE FUNCTION public.guard_posted_sale_payment_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.fin_bypass', true) = 'on' THEN RETURN OLD; END IF;
  IF EXISTS (SELECT 1 FROM public.sales WHERE id = OLD.sale_id
               AND (inventory_posted OR COALESCE(status,'draft') NOT IN ('draft','quote','quotation','held'))) THEN
    RAISE EXCEPTION 'Payments of a confirmed sale cannot be deleted. Record a refund instead.';
  END IF;
  RETURN OLD;
END $function$;

DROP TRIGGER IF EXISTS guard_posted_sale_payment_delete_trg ON public.sale_payments;
CREATE TRIGGER guard_posted_sale_payment_delete_trg BEFORE DELETE ON public.sale_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_posted_sale_payment_delete();
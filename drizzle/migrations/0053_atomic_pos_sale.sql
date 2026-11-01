-- Apply 0052_product_tax_rate_guard.sql first. Its product-rate tax validator
-- is called explicitly here, and its deferred item trigger validates again at commit.
CREATE OR REPLACE FUNCTION public.create_complete_pos_sale(
  _sale jsonb,
  _items jsonb,
  _payments jsonb,
  _pin text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_business_id uuid;
  v_sale_id uuid;
  sale_number text;
  sale_row public.sales%ROWTYPE;
  item jsonb;
  addon jsonb;
  payment jsonb;
  sale_item_id uuid;
  approval_result jsonb;
  final_paid numeric;
  final_refunds numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in before completing a POS sale';
  END IF;
  IF jsonb_typeof(_sale) IS DISTINCT FROM 'object'
     OR jsonb_typeof(_items) IS DISTINCT FROM 'array'
     OR (_payments IS NOT NULL AND jsonb_typeof(_payments) IS DISTINCT FROM 'array') THEN
    RAISE EXCEPTION 'Invalid POS sale payload';
  END IF;
  IF jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'A POS sale must contain at least one item';
  END IF;

  v_business_id := NULLIF(_sale->>'business_id', '')::uuid;
  v_sale_id := NULLIF(_sale->>'id', '')::uuid;
  IF v_business_id IS NULL OR v_sale_id IS NULL
     OR NOT public.can_write_business(v_business_id) THEN
    RAISE EXCEPTION 'Not allowed to complete a sale for this business';
  END IF;
  IF NULLIF(_sale->>'customer_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers c
     WHERE c.id = (_sale->>'customer_id')::uuid
       AND c.business_id = v_business_id
  ) THEN
    RAISE EXCEPTION 'Customer does not belong to this business';
  END IF;
  IF NULLIF(_sale->>'location_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.warehouses w
     WHERE w.id = (_sale->>'location_id')::uuid
       AND w.business_id = v_business_id
  ) THEN
    RAISE EXCEPTION 'Location does not belong to this business';
  END IF;
  IF NULLIF(_sale->>'register_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cash_registers r
     WHERE r.id = (_sale->>'register_id')::uuid
       AND r.business_id = v_business_id
       AND r.status = 'open'
  ) THEN
    RAISE EXCEPTION 'Cash register is not open for this business';
  END IF;

  SELECT * INTO sale_row FROM public.sales WHERE id = v_sale_id FOR UPDATE;
  IF FOUND THEN
    IF sale_row.business_id <> v_business_id THEN
      RAISE EXCEPTION 'POS sale request is not available';
    END IF;
    IF sale_row.inventory_posted AND sale_row.status = 'completed' THEN
      RETURN to_jsonb(sale_row);
    END IF;
    RAISE EXCEPTION 'An incomplete sale already exists for this request';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(_items) AS line(value)
     WHERE NULLIF(line.value->>'product_id', '') IS NULL
        OR COALESCE(NULLIF(line.value->>'quantity', '')::numeric, 0) <= 0
        OR COALESCE(NULLIF(line.value->>'unit_price', '')::numeric, 0) < 0
  ) THEN
    RAISE EXCEPTION 'Each POS line must have a product, positive quantity, and non-negative price';
  END IF;

  sale_number := public.next_doc_number(v_business_id, 'SALE');
  INSERT INTO public.sales (
    id, business_id, document_type, sale_number, sale_type, channel, source,
    customer_id, location_id, register_id, currency, exchange_rate,
    tax_inclusive, status, payment_status, payment_method, sale_date,
    salesperson_id, created_by, subtotal, discount, discount_type,
    discount_value, tax, total, paid, cost_total, base_total, notes
  ) VALUES (
    v_sale_id, v_business_id, 'pos_sale', sale_number, 'pos_sale', 'pos',
    COALESCE(NULLIF(_sale->>'source', ''), 'pos'),
    NULLIF(_sale->>'customer_id', '')::uuid,
    NULLIF(_sale->>'location_id', '')::uuid,
    NULLIF(_sale->>'register_id', '')::uuid,
    NULLIF(_sale->>'currency', ''),
    COALESCE(NULLIF(_sale->>'exchange_rate', '')::numeric, 1),
    COALESCE(NULLIF(_sale->>'tax_inclusive', '')::boolean, false),
    'draft', 'unpaid',
    COALESCE(NULLIF(_sale->>'payment_method', ''), 'cash'),
    COALESCE(NULLIF(_sale->>'sale_date', '')::date, CURRENT_DATE),
    auth.uid(), auth.uid(),
    0, 0, COALESCE(NULLIF(_sale->>'discount_type', ''), 'amount'),
    COALESCE(NULLIF(_sale->>'discount_value', '')::numeric, 0),
    0, 0, 0, 0, 0,
    NULLIF(_sale->>'notes', '')
  );

  FOR item IN SELECT value FROM jsonb_array_elements(_items) AS lines(value) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
       WHERE p.id = NULLIF(item->>'product_id', '')::uuid
         AND p.business_id = v_business_id
    ) THEN
      RAISE EXCEPTION 'A POS item does not belong to this business';
    END IF;
    IF NULLIF(item->>'variant_id', '') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.product_variants v
       WHERE v.id = (item->>'variant_id')::uuid
         AND v.product_id = (item->>'product_id')::uuid
    ) THEN
      RAISE EXCEPTION 'A POS variant does not belong to its product';
    END IF;

    sale_item_id := gen_random_uuid();
    INSERT INTO public.sale_items (
      id, business_id, sale_id, product_id, variant_id, product_name, sku,
      unit, quantity, unit_price, unit_cost, discount, discount_type,
      tax_rate, tax, total, condition, notes
    ) VALUES (
      sale_item_id, v_business_id, v_sale_id,
      NULLIF(item->>'product_id', '')::uuid,
      NULLIF(item->>'variant_id', '')::uuid,
      NULLIF(item->>'product_name', ''),
      NULLIF(item->>'sku', ''),
      NULLIF(item->>'unit', ''),
      (item->>'quantity')::numeric,
      (item->>'unit_price')::numeric,
      COALESCE(NULLIF(item->>'unit_cost', '')::numeric, 0),
      COALESCE(NULLIF(item->>'discount', '')::numeric, 0),
      COALESCE(NULLIF(item->>'discount_type', ''), 'amount'),
      COALESCE(NULLIF(item->>'tax_rate', '')::numeric, 0),
      COALESCE(NULLIF(item->>'tax', '')::numeric, 0),
      COALESCE(NULLIF(item->>'total', '')::numeric, 0),
      NULLIF(item->>'condition', ''),
      NULLIF(item->>'notes', '')
    );

    FOR addon IN
      SELECT value FROM jsonb_array_elements(COALESCE(item->'addons', '[]'::jsonb)) AS addons(value)
    LOOP
      IF NULLIF(addon->>'option_id', '') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.addon_options o
         WHERE o.id = (addon->>'option_id')::uuid
           AND o.business_id = v_business_id
      ) THEN
        RAISE EXCEPTION 'A POS add-on does not belong to this business';
      END IF;
      INSERT INTO public.sale_item_addons (
        business_id, sale_item_id, option_id, group_name, option_name,
        extra_price, extra_cost
      ) VALUES (
        v_business_id, sale_item_id, (addon->>'option_id')::uuid,
        addon->>'group_name', addon->>'option_name',
        COALESCE(NULLIF(addon->>'extra_price', '')::numeric, 0),
        COALESCE(NULLIF(addon->>'extra_cost', '')::numeric, 0)
      );
    END LOOP;
  END LOOP;

  UPDATE public.sales
     SET subtotal = COALESCE(NULLIF(_sale->>'subtotal', '')::numeric, 0),
         discount = COALESCE(NULLIF(_sale->>'discount', '')::numeric, 0),
         tax = COALESCE(NULLIF(_sale->>'tax', '')::numeric, 0),
         total = COALESCE(NULLIF(_sale->>'total', '')::numeric, 0),
         base_total = COALESCE(NULLIF(_sale->>'base_total', '')::numeric, 0),
         updated_at = now()
   WHERE id = v_sale_id;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(COALESCE(_payments, '[]'::jsonb)) AS payments(value)
     WHERE COALESCE(NULLIF(payments.value->>'amount', '')::numeric, 0) <= 0
        OR COALESCE(NULLIF(payments.value->>'tendered', '')::numeric, 0) < 0
  ) THEN
    RAISE EXCEPTION 'Payment amounts must be positive and tendered amounts cannot be negative';
  END IF;
  IF (
    SELECT COALESCE(SUM(NULLIF(payments.value->>'amount', '')::numeric), 0)
      FROM jsonb_array_elements(COALESCE(_payments, '[]'::jsonb)) AS payments(value)
  ) > COALESCE(NULLIF(_sale->>'total', '')::numeric, 0) + 0.009 THEN
    RAISE EXCEPTION 'Payments exceed the sale total';
  END IF;

  PERFORM public.validate_sale_tax_for_items(
    v_sale_id,
    v_business_id,
    COALESCE(NULLIF(_sale->>'subtotal', '')::numeric, 0),
    COALESCE(NULLIF(_sale->>'discount_type', ''), 'amount'),
    COALESCE(NULLIF(_sale->>'discount_value', '')::numeric, 0),
    COALESCE(NULLIF(_sale->>'tax', '')::numeric, 0),
    COALESCE(NULLIF(_sale->>'tax_inclusive', '')::boolean, false)
  );

  FOR payment IN
    SELECT value FROM jsonb_array_elements(COALESCE(_payments, '[]'::jsonb)) AS payments(value)
  LOOP
    INSERT INTO public.sale_payments (
      business_id, sale_id, register_id, method, amount, tendered,
      change_given, is_refund, reference, notes, created_by
    ) VALUES (
      v_business_id, v_sale_id, NULLIF(_sale->>'register_id', '')::uuid,
      COALESCE(NULLIF(payment->>'method', ''), 'cash'),
      (payment->>'amount')::numeric,
      NULLIF(payment->>'tendered', '')::numeric,
      CASE
        WHEN NULLIF(payment->>'tendered', '') IS NOT NULL
          THEN GREATEST(
            ROUND((payment->>'tendered')::numeric - (payment->>'amount')::numeric, 2),
            0
          )
        ELSE 0
      END,
      false, NULLIF(payment->>'reference', ''),
      NULLIF(payment->>'notes', ''), auth.uid()
    );
  END LOOP;

  IF NULLIF(_pin, '') IS NOT NULL THEN
    approval_result := public.approve_negative_stock_sale(v_sale_id, _pin);
    IF NOT COALESCE((approval_result->>'approved')::boolean, false) THEN
      RAISE EXCEPTION '%',
        COALESCE(approval_result->>'message', 'Manager approval was not granted');
    END IF;
  END IF;

  -- This posts stock, accounting, and completion status in the same transaction.
  -- Any validation, approval, or posting error rolls back every row above.
  PERFORM public.complete_sale(v_sale_id);

  SELECT COALESCE(SUM(CASE WHEN is_refund THEN -amount ELSE amount END), 0),
         COALESCE(SUM(CASE WHEN is_refund THEN amount ELSE 0 END), 0)
    INTO final_paid, final_refunds
    FROM public.sale_payments
   WHERE sale_id = v_sale_id;
  UPDATE public.sales
     SET paid = final_paid,
         payment_status = CASE
           WHEN final_refunds > 0 AND final_paid <= 0.009 THEN 'refunded'
           WHEN final_refunds > 0 THEN 'partially_refunded'
           WHEN final_paid <= 0.009 THEN 'unpaid'
           WHEN final_paid + 0.009 >= total THEN 'paid'
           ELSE 'partially_paid'
         END,
         updated_at = now()
   WHERE id = v_sale_id;

  SELECT * INTO sale_row FROM public.sales WHERE id = v_sale_id;
  RETURN to_jsonb(sale_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_sale_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sid uuid;
  net numeric;
  refunds numeric;
  sale_row public.sales%ROWTYPE;
  payment_state text;
BEGIN
  sid := COALESCE(NEW.sale_id, OLD.sale_id);
  SELECT COALESCE(SUM(CASE WHEN is_refund THEN -amount ELSE amount END), 0),
         COALESCE(SUM(CASE WHEN is_refund THEN amount ELSE 0 END), 0)
    INTO net, refunds
    FROM public.sale_payments
   WHERE sale_id = sid;
  SELECT * INTO sale_row FROM public.sales WHERE id = sid;

  IF sale_row.document_type = 'pos_sale' AND NOT sale_row.inventory_posted THEN
    UPDATE public.sales SET paid = net, updated_at = now() WHERE id = sid;
  ELSE
    IF sale_row.status = 'voided' THEN payment_state := 'voided';
    ELSIF refunds > 0 AND net <= 0.009 THEN payment_state := 'refunded';
    ELSIF refunds > 0 THEN payment_state := 'partially_refunded';
    ELSIF net <= 0.009 THEN payment_state := 'unpaid';
    ELSIF net + 0.009 >= sale_row.total THEN payment_state := 'paid';
    ELSE payment_state := 'partially_paid';
    END IF;

    UPDATE public.sales
       SET paid = net, payment_status = payment_state, updated_at = now()
     WHERE id = sid;
  END IF;

  UPDATE public.accounts_receivable
     SET paid = LEAST(net, amount),
         status = CASE WHEN net + 0.009 >= amount THEN 'paid' ELSE 'open' END,
         updated_at = now()
   WHERE sale_id = sid;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.create_complete_pos_sale(jsonb, jsonb, jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_complete_pos_sale(jsonb, jsonb, jsonb, text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.sync_sale_payments() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

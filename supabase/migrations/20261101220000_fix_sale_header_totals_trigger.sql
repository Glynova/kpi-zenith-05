CREATE OR REPLACE FUNCTION public.sale_line_totals(
  _quantity numeric,
  _unit_price numeric,
  _discount numeric,
  _discount_type text,
  _tax_rate numeric,
  _tax_inclusive boolean
)
RETURNS TABLE(gross numeric, discount numeric, net numeric, tax numeric, total numeric)
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  after_discount numeric;
  rate numeric := GREATEST(COALESCE(_tax_rate, 0), 0) / 100;
BEGIN
  gross := ROUND(COALESCE(_quantity, 0) * COALESCE(_unit_price, 0), 2);
  discount := CASE
    WHEN COALESCE(_discount_type, 'amount') = 'percent'
      THEN ROUND(gross * LEAST(GREATEST(COALESCE(_discount, 0), 0), 100) / 100, 2)
    ELSE ROUND(LEAST(GREATEST(COALESCE(_discount, 0), 0), gross), 2)
  END;
  after_discount := ROUND(gross - discount, 2);

  IF COALESCE(_tax_inclusive, false) THEN
    net := ROUND(after_discount / (1 + rate), 2);
    tax := ROUND(after_discount - net, 2);
    total := after_discount;
  ELSE
    net := after_discount;
    tax := ROUND(net * rate, 2);
    total := ROUND(net + tax, 2);
  END IF;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_sale_header_totals(_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  s public.sales%ROWTYPE;
  item_net numeric;
  item_disc numeric;
  item_tax numeric;
  order_disc numeric;
  tax_scale numeric;
  expected_subtotal numeric;
  expected_discount numeric;
  expected_tax numeric;
  expected_total numeric;
  tol constant numeric := 0.02;
BEGIN
  SELECT * INTO s FROM public.sales WHERE id = _sale_id;
  IF s.id IS NULL OR s.document_type NOT IN ('sale', 'pos_sale') THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sale_items WHERE sale_id = _sale_id) THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(COALESCE(total, 0) - COALESCE(tax, 0)), 0),
    COALESCE(SUM(COALESCE(discount, 0)), 0),
    COALESCE(SUM(COALESCE(tax, 0)), 0)
  INTO item_net, item_disc, item_tax
  FROM public.sale_items
  WHERE sale_id = _sale_id;

  expected_subtotal := ROUND(item_net, 2);
  order_disc := CASE
    WHEN s.discount_type = 'percent'
      THEN ROUND(expected_subtotal * LEAST(GREATEST(COALESCE(s.discount_value, 0), 0), 100) / 100, 2)
    ELSE ROUND(LEAST(GREATEST(COALESCE(s.discount_value, 0), 0), expected_subtotal), 2)
  END;
  expected_discount := ROUND(item_disc + order_disc, 2);
  tax_scale := CASE
    WHEN expected_subtotal > 0 THEN (expected_subtotal - order_disc) / expected_subtotal
    ELSE 1
  END;
  expected_tax := ROUND(item_tax * tax_scale, 2);
  expected_total := GREATEST(
    ROUND(expected_subtotal - order_disc + expected_tax
      + ROUND(COALESCE(s.shipping, 0), 2) + ROUND(COALESCE(s.other_charges, 0), 2), 2),
    0
  );

  IF ABS(expected_subtotal - COALESCE(s.subtotal, 0)) > tol
     OR ABS(expected_discount - COALESCE(s.discount, 0)) > tol
     OR ABS(expected_tax - COALESCE(s.tax, 0)) > tol
     OR ABS(expected_total - COALESCE(s.total, 0)) > tol THEN
    RAISE EXCEPTION
      'Sale % header totals must match its items (expected subtotal %, discount %, tax %, total %)',
      s.sale_number, expected_subtotal, expected_discount, expected_tax, expected_total;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS sale_header_totals_trg ON public.sales;
CREATE CONSTRAINT TRIGGER sale_header_totals_trg
  AFTER INSERT OR UPDATE ON public.sales
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_sale_header_totals();

CREATE OR REPLACE FUNCTION public.create_sale(
  header jsonb,
  items jsonb,
  payments jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_business_id uuid;
  v_sale_id uuid := gen_random_uuid();
  v_document_type text;
  v_discount_type text;
  v_discount_value numeric;
  v_shipping numeric;
  v_other_charges numeric;
  v_tax_inclusive boolean;
  v_item_net numeric;
  v_item_discount numeric;
  v_item_tax numeric;
  v_subtotal numeric;
  v_order_discount numeric;
  v_discount numeric;
  v_tax numeric;
  v_total numeric;
  v_exchange_rate numeric;
  item jsonb;
  addon jsonb;
  payment jsonb;
  sale_item_id uuid;
  line_result record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in before creating a sale';
  END IF;
  IF jsonb_typeof(header) IS DISTINCT FROM 'object'
     OR jsonb_typeof(items) IS DISTINCT FROM 'array'
     OR jsonb_typeof(COALESCE(payments, '[]'::jsonb)) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid sale payload';
  END IF;
  IF jsonb_array_length(items) = 0 THEN
    RAISE EXCEPTION 'A sale must contain at least one item';
  END IF;

  v_business_id := NULLIF(header->>'business_id', '')::uuid;
  v_document_type := COALESCE(NULLIF(header->>'document_type', ''), 'sale');
  v_tax_inclusive := COALESCE(NULLIF(header->>'tax_inclusive', '')::boolean, false);
  v_discount_type := COALESCE(NULLIF(header->>'discount_type', ''), 'amount');
  v_discount_value := COALESCE(NULLIF(header->>'discount_value', '')::numeric, 0);
  v_shipping := ROUND(COALESCE(NULLIF(header->>'shipping', '')::numeric, 0), 2);
  v_other_charges := ROUND(COALESCE(NULLIF(header->>'other_charges', '')::numeric, 0), 2);
  v_exchange_rate := COALESCE(NULLIF(header->>'exchange_rate', '')::numeric, 1);

  IF v_business_id IS NULL OR NOT public.can_write_business(v_business_id) THEN
    RAISE EXCEPTION 'Not allowed to create a sale for this business';
  END IF;
  IF v_document_type NOT IN ('sale', 'pos_sale', 'return', 'quote', 'sales_order')
     OR NULLIF(header->>'sale_number', '') IS NULL THEN
    RAISE EXCEPTION 'Invalid sale document type or number';
  END IF;
  IF v_discount_type NOT IN ('amount', 'percent') THEN
    RAISE EXCEPTION 'Sale discount type must be amount or percent';
  END IF;
  IF NULLIF(header->>'customer_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = (header->>'customer_id')::uuid AND c.business_id = v_business_id
  ) THEN
    RAISE EXCEPTION 'Customer does not belong to this business';
  END IF;
  IF NULLIF(header->>'location_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.warehouses w
    WHERE w.id = (header->>'location_id')::uuid AND w.business_id = v_business_id
  ) THEN
    RAISE EXCEPTION 'Location does not belong to this business';
  END IF;
  IF NULLIF(header->>'register_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cash_registers r
    WHERE r.id = (header->>'register_id')::uuid
      AND r.business_id = v_business_id
      AND r.status = 'open'
  ) THEN
    RAISE EXCEPTION 'Cash register is not open for this business';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(items) AS line(value)
    WHERE NULLIF(line.value->>'product_id', '') IS NULL
       OR COALESCE(NULLIF(line.value->>'quantity', '')::numeric, 0) <= 0
       OR COALESCE(NULLIF(line.value->>'unit_price', '')::numeric, 0) < 0
  ) THEN
    RAISE EXCEPTION 'Each sale line must have a product, positive quantity, and non-negative price';
  END IF;

  SELECT
    ROUND(COALESCE(SUM(t.net), 0), 2),
    ROUND(COALESCE(SUM(t.discount), 0), 2),
    ROUND(COALESCE(SUM(t.tax), 0), 2)
  INTO v_item_net, v_item_discount, v_item_tax
  FROM jsonb_array_elements(items) AS line(value)
  CROSS JOIN LATERAL public.sale_line_totals(
    NULLIF(line.value->>'quantity', '')::numeric,
    NULLIF(line.value->>'unit_price', '')::numeric,
    COALESCE(NULLIF(line.value->>'discount', '')::numeric, 0),
    COALESCE(NULLIF(line.value->>'discount_type', ''), 'amount'),
    COALESCE(NULLIF(line.value->>'tax_rate', '')::numeric, 0),
    v_tax_inclusive
  ) AS t;

  v_subtotal := ROUND(v_item_net, 2);
  v_order_discount := CASE
    WHEN v_discount_type = 'percent'
      THEN ROUND(v_subtotal * LEAST(GREATEST(v_discount_value, 0), 100) / 100, 2)
    ELSE ROUND(LEAST(GREATEST(v_discount_value, 0), v_subtotal), 2)
  END;
  v_discount := ROUND(v_item_discount + v_order_discount, 2);
  v_tax := ROUND(
    v_item_tax * CASE WHEN v_subtotal > 0 THEN (v_subtotal - v_order_discount) / v_subtotal ELSE 1 END,
    2
  );
  v_total := GREATEST(ROUND(v_subtotal - v_order_discount + v_tax + v_shipping + v_other_charges, 2), 0);

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(payments, '[]'::jsonb)) AS p(value)
    WHERE COALESCE(NULLIF(p.value->>'amount', '')::numeric, 0) <= 0
       OR COALESCE(NULLIF(p.value->>'tendered', '')::numeric, 0) < 0
  ) OR (
    SELECT COALESCE(SUM(NULLIF(p.value->>'amount', '')::numeric), 0)
    FROM jsonb_array_elements(COALESCE(payments, '[]'::jsonb)) AS p(value)
  ) > v_total + 0.009 THEN
    RAISE EXCEPTION 'Payment amounts are invalid or exceed the sale total';
  END IF;

  INSERT INTO public.sales (
    business_id, document_type, sale_number, sale_type, channel, source,
    customer_id, location_id, register_id, currency, exchange_rate,
    tax_inclusive, status, payment_status, payment_method, sale_date,
    due_date, expected_date, expires_on, payment_terms, salesperson_id,
    subtotal, discount, discount_type, discount_value, tax, shipping,
    other_charges, total, paid, cost_total, base_total, notes,
    shipping_address, billing_address, shipping_method, delivery_status,
    quote_id, sales_order_id, original_sale_id, return_reason, created_by
  ) VALUES (
    v_business_id, v_document_type, header->>'sale_number',
    COALESCE(NULLIF(header->>'sale_type', ''), v_document_type),
    COALESCE(NULLIF(header->>'channel', ''), 'manual'),
    NULLIF(header->>'source', ''),
    NULLIF(header->>'customer_id', '')::uuid,
    NULLIF(header->>'location_id', '')::uuid,
    NULLIF(header->>'register_id', '')::uuid,
    NULLIF(header->>'currency', ''),
    v_exchange_rate, v_tax_inclusive,
    COALESCE(NULLIF(header->>'status', ''), 'draft'), 'unpaid',
    COALESCE(NULLIF(header->>'payment_method', ''), 'cash'),
    COALESCE(NULLIF(header->>'sale_date', '')::date, CURRENT_DATE),
    NULLIF(header->>'due_date', '')::date,
    NULLIF(header->>'expected_date', '')::date,
    NULLIF(header->>'expires_on', '')::date,
    NULLIF(header->>'payment_terms', ''),
    NULLIF(header->>'salesperson_id', '')::uuid,
    v_subtotal, v_discount, v_discount_type, v_discount_value, v_tax,
    v_shipping, v_other_charges, v_total, 0, 0,
    ROUND(v_total * v_exchange_rate, 2),
    NULLIF(header->>'notes', ''),
    NULLIF(header->>'shipping_address', ''),
    NULLIF(header->>'billing_address', ''),
    NULLIF(header->>'shipping_method', ''),
    NULLIF(header->>'delivery_status', ''),
    NULLIF(header->>'quote_id', '')::uuid,
    NULLIF(header->>'sales_order_id', '')::uuid,
    NULLIF(header->>'original_sale_id', '')::uuid,
    NULLIF(header->>'return_reason', ''),
    auth.uid()
  )
  RETURNING id INTO v_sale_id;

  FOR item IN SELECT value FROM jsonb_array_elements(items) AS lines(value) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = NULLIF(item->>'product_id', '')::uuid AND p.business_id = v_business_id
    ) THEN
      RAISE EXCEPTION 'A sale item does not belong to this business';
    END IF;
    IF NULLIF(item->>'variant_id', '') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.product_variants v
      WHERE v.id = (item->>'variant_id')::uuid
        AND v.product_id = (item->>'product_id')::uuid
    ) THEN
      RAISE EXCEPTION 'A sale variant does not belong to its product';
    END IF;

    SELECT * INTO line_result
    FROM public.sale_line_totals(
      NULLIF(item->>'quantity', '')::numeric,
      NULLIF(item->>'unit_price', '')::numeric,
      COALESCE(NULLIF(item->>'discount', '')::numeric, 0),
      COALESCE(NULLIF(item->>'discount_type', ''), 'amount'),
      COALESCE(NULLIF(item->>'tax_rate', '')::numeric, 0),
      v_tax_inclusive
    );
    sale_item_id := gen_random_uuid();
    INSERT INTO public.sale_items (
      id, business_id, sale_id, product_id, variant_id, product_name, sku, unit,
      batch_id, serial_ids, quantity, unit_price, unit_cost, discount,
      discount_type, tax_rate, tax, total, condition, notes
    ) VALUES (
      sale_item_id, v_business_id, v_sale_id,
      NULLIF(item->>'product_id', '')::uuid,
      NULLIF(item->>'variant_id', '')::uuid,
      NULLIF(item->>'product_name', ''),
      NULLIF(item->>'sku', ''),
      NULLIF(item->>'unit', ''),
      NULLIF(item->>'batch_id', '')::uuid,
      CASE
        WHEN jsonb_typeof(item->'serial_ids') = 'array'
          THEN ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(item->'serial_ids'))
        ELSE NULL
      END,
      NULLIF(item->>'quantity', '')::numeric,
      NULLIF(item->>'unit_price', '')::numeric,
      COALESCE(NULLIF(item->>'unit_cost', '')::numeric, 0),
      line_result.discount,
      COALESCE(NULLIF(item->>'discount_type', ''), 'amount'),
      COALESCE(NULLIF(item->>'tax_rate', '')::numeric, 0),
      line_result.tax, line_result.total,
      NULLIF(item->>'condition', ''), NULLIF(item->>'notes', '')
    );

    IF jsonb_typeof(COALESCE(item->'addons', '[]'::jsonb)) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Sale item add-ons must be an array';
    END IF;
    FOR addon IN SELECT value FROM jsonb_array_elements(COALESCE(item->'addons', '[]'::jsonb)) AS addons(value) LOOP
      IF NULLIF(addon->>'option_id', '') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.addon_options o
        WHERE o.id = (addon->>'option_id')::uuid AND o.business_id = v_business_id
      ) THEN
        RAISE EXCEPTION 'A sale add-on does not belong to this business';
      END IF;
      INSERT INTO public.sale_item_addons (
        business_id, sale_item_id, option_id, group_name, option_name, extra_price, extra_cost
      ) VALUES (
        v_business_id, sale_item_id,
        NULLIF(addon->>'option_id', '')::uuid,
        COALESCE(addon->>'group_name', ''),
        COALESCE(addon->>'option_name', ''),
        COALESCE(NULLIF(addon->>'extra_price', '')::numeric, 0),
        COALESCE(NULLIF(addon->>'extra_cost', '')::numeric, 0)
      );
    END LOOP;
  END LOOP;

  PERFORM public.validate_sale_tax_for_items(
    v_sale_id, v_business_id, v_subtotal, v_discount_type, v_discount_value, v_tax, v_tax_inclusive
  );

  FOR payment IN SELECT value FROM jsonb_array_elements(COALESCE(payments, '[]'::jsonb)) AS p(value) LOOP
    INSERT INTO public.sale_payments (
      business_id, sale_id, register_id, method, amount, tendered,
      change_given, is_refund, reference, notes, created_by
    ) VALUES (
      v_business_id, v_sale_id, NULLIF(header->>'register_id', '')::uuid,
      COALESCE(NULLIF(payment->>'method', ''), 'cash'),
      ROUND(NULLIF(payment->>'amount', '')::numeric, 2),
      NULLIF(payment->>'tendered', '')::numeric,
      CASE WHEN NULLIF(payment->>'tendered', '') IS NOT NULL
        THEN GREATEST(ROUND(
          NULLIF(payment->>'tendered', '')::numeric - NULLIF(payment->>'amount', '')::numeric, 2
        ), 0)
        ELSE 0
      END,
      false, NULLIF(payment->>'reference', ''), NULLIF(payment->>'notes', ''), auth.uid()
    );
  END LOOP;

  RETURN v_sale_id;
END;
$$;

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
  item_net numeric;
  item_discount numeric;
  item_tax numeric;
  order_discount numeric;
  v_subtotal numeric;
  v_discount numeric;
  v_tax numeric;
  v_total numeric;
  v_exchange_rate numeric;
  line_result record;
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
    WHERE c.id = (_sale->>'customer_id')::uuid AND c.business_id = v_business_id
  ) THEN
    RAISE EXCEPTION 'Customer does not belong to this business';
  END IF;
  IF NULLIF(_sale->>'location_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.warehouses w
    WHERE w.id = (_sale->>'location_id')::uuid AND w.business_id = v_business_id
  ) THEN
    RAISE EXCEPTION 'Location does not belong to this business';
  END IF;
  IF NULLIF(_sale->>'register_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cash_registers r
    WHERE r.id = (_sale->>'register_id')::uuid AND r.business_id = v_business_id AND r.status = 'open'
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

  SELECT
    ROUND(COALESCE(SUM(t.net), 0), 2),
    ROUND(COALESCE(SUM(t.discount), 0), 2),
    ROUND(COALESCE(SUM(t.tax), 0), 2)
  INTO item_net, item_discount, item_tax
  FROM jsonb_array_elements(_items) AS line(value)
  CROSS JOIN LATERAL public.sale_line_totals(
    NULLIF(line.value->>'quantity', '')::numeric,
    NULLIF(line.value->>'unit_price', '')::numeric,
    COALESCE(NULLIF(line.value->>'discount', '')::numeric, 0),
    COALESCE(NULLIF(line.value->>'discount_type', ''), 'amount'),
    COALESCE(NULLIF(line.value->>'tax_rate', '')::numeric, 0),
    COALESCE(NULLIF(_sale->>'tax_inclusive', '')::boolean, false)
  ) AS t;
  v_subtotal := ROUND(item_net, 2);
  order_discount := CASE
    WHEN COALESCE(NULLIF(_sale->>'discount_type', ''), 'amount') = 'percent'
      THEN ROUND(v_subtotal * LEAST(GREATEST(COALESCE(NULLIF(_sale->>'discount_value', '')::numeric, 0), 0), 100) / 100, 2)
    ELSE ROUND(LEAST(GREATEST(COALESCE(NULLIF(_sale->>'discount_value', '')::numeric, 0), 0), v_subtotal), 2)
  END;
  v_discount := ROUND(item_discount + order_discount, 2);
  v_tax := ROUND(
    item_tax * CASE WHEN v_subtotal > 0 THEN (v_subtotal - order_discount) / v_subtotal ELSE 1 END,
    2
  );
  v_total := GREATEST(ROUND(
    v_subtotal - order_discount + v_tax
      + ROUND(COALESCE(NULLIF(_sale->>'shipping', '')::numeric, 0), 2)
      + ROUND(COALESCE(NULLIF(_sale->>'other_charges', '')::numeric, 0), 2),
    2
  ), 0);
  v_exchange_rate := COALESCE(NULLIF(_sale->>'exchange_rate', '')::numeric, 1);

  sale_number := public.next_doc_number(v_business_id, 'SALE');
  INSERT INTO public.sales (
    id, business_id, document_type, sale_number, sale_type, channel, source,
    customer_id, location_id, register_id, currency, exchange_rate,
    tax_inclusive, status, payment_status, payment_method, sale_date,
    salesperson_id, created_by, subtotal, discount, discount_type,
    discount_value, tax, shipping, other_charges, total, paid, cost_total,
    base_total, notes
  ) VALUES (
    v_sale_id, v_business_id, 'pos_sale', sale_number, 'pos_sale', 'pos',
    COALESCE(NULLIF(_sale->>'source', ''), 'pos'),
    NULLIF(_sale->>'customer_id', '')::uuid,
    NULLIF(_sale->>'location_id', '')::uuid,
    NULLIF(_sale->>'register_id', '')::uuid,
    NULLIF(_sale->>'currency', ''), v_exchange_rate,
    COALESCE(NULLIF(_sale->>'tax_inclusive', '')::boolean, false),
    'draft', 'unpaid',
    COALESCE(NULLIF(_sale->>'payment_method', ''), 'cash'),
    COALESCE(NULLIF(_sale->>'sale_date', '')::date, CURRENT_DATE),
    auth.uid(), auth.uid(),
    v_subtotal, v_discount,
    COALESCE(NULLIF(_sale->>'discount_type', ''), 'amount'),
    COALESCE(NULLIF(_sale->>'discount_value', '')::numeric, 0),
    v_tax,
    ROUND(COALESCE(NULLIF(_sale->>'shipping', '')::numeric, 0), 2),
    ROUND(COALESCE(NULLIF(_sale->>'other_charges', '')::numeric, 0), 2),
    v_total, 0, 0, ROUND(v_total * v_exchange_rate, 2),
    NULLIF(_sale->>'notes', '')
  );

  FOR item IN SELECT value FROM jsonb_array_elements(_items) AS lines(value) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = NULLIF(item->>'product_id', '')::uuid AND p.business_id = v_business_id
    ) THEN
      RAISE EXCEPTION 'A POS item does not belong to this business';
    END IF;
    IF NULLIF(item->>'variant_id', '') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.product_variants v
      WHERE v.id = (item->>'variant_id')::uuid AND v.product_id = (item->>'product_id')::uuid
    ) THEN
      RAISE EXCEPTION 'A POS variant does not belong to its product';
    END IF;

    sale_item_id := gen_random_uuid();
    SELECT * INTO line_result
    FROM public.sale_line_totals(
      NULLIF(item->>'quantity', '')::numeric,
      NULLIF(item->>'unit_price', '')::numeric,
      COALESCE(NULLIF(item->>'discount', '')::numeric, 0),
      COALESCE(NULLIF(item->>'discount_type', ''), 'amount'),
      COALESCE(NULLIF(item->>'tax_rate', '')::numeric, 0),
      COALESCE(NULLIF(_sale->>'tax_inclusive', '')::boolean, false)
    );
    INSERT INTO public.sale_items (
      id, business_id, sale_id, product_id, variant_id, product_name, sku,
      unit, quantity, unit_price, unit_cost, discount, discount_type,
      tax_rate, tax, total, condition, notes
    ) VALUES (
      sale_item_id, v_business_id, v_sale_id,
      NULLIF(item->>'product_id', '')::uuid,
      NULLIF(item->>'variant_id', '')::uuid,
      NULLIF(item->>'product_name', ''), NULLIF(item->>'sku', ''),
      NULLIF(item->>'unit', ''), (item->>'quantity')::numeric,
      (item->>'unit_price')::numeric, COALESCE(NULLIF(item->>'unit_cost', '')::numeric, 0),
      line_result.discount, COALESCE(NULLIF(item->>'discount_type', ''), 'amount'),
      COALESCE(NULLIF(item->>'tax_rate', '')::numeric, 0),
      line_result.tax, line_result.total,
      NULLIF(item->>'condition', ''), NULLIF(item->>'notes', '')
    );

    FOR addon IN SELECT value FROM jsonb_array_elements(COALESCE(item->'addons', '[]'::jsonb)) AS addons(value) LOOP
      IF NULLIF(addon->>'option_id', '') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.addon_options o
        WHERE o.id = (addon->>'option_id')::uuid AND o.business_id = v_business_id
      ) THEN
        RAISE EXCEPTION 'A POS add-on does not belong to this business';
      END IF;
      INSERT INTO public.sale_item_addons (
        business_id, sale_item_id, option_id, group_name, option_name, extra_price, extra_cost
      ) VALUES (
        v_business_id, sale_item_id, NULLIF(addon->>'option_id', '')::uuid,
        addon->>'group_name', addon->>'option_name',
        COALESCE(NULLIF(addon->>'extra_price', '')::numeric, 0),
        COALESCE(NULLIF(addon->>'extra_cost', '')::numeric, 0)
      );
    END LOOP;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(_payments, '[]'::jsonb)) AS p(value)
    WHERE COALESCE(NULLIF(p.value->>'amount', '')::numeric, 0) <= 0
       OR COALESCE(NULLIF(p.value->>'tendered', '')::numeric, 0) < 0
  ) THEN
    RAISE EXCEPTION 'Payment amounts must be positive and tendered amounts cannot be negative';
  END IF;
  IF (
    SELECT COALESCE(SUM(NULLIF(p.value->>'amount', '')::numeric), 0)
    FROM jsonb_array_elements(COALESCE(_payments, '[]'::jsonb)) AS p(value)
  ) > v_total + 0.009 THEN
    RAISE EXCEPTION 'Payments exceed the sale total';
  END IF;

  PERFORM public.validate_sale_tax_for_items(
    v_sale_id, v_business_id, v_subtotal,
    COALESCE(NULLIF(_sale->>'discount_type', ''), 'amount'),
    COALESCE(NULLIF(_sale->>'discount_value', '')::numeric, 0),
    v_tax, COALESCE(NULLIF(_sale->>'tax_inclusive', '')::boolean, false)
  );

  FOR payment IN SELECT value FROM jsonb_array_elements(COALESCE(_payments, '[]'::jsonb)) AS p(value) LOOP
    INSERT INTO public.sale_payments (
      business_id, sale_id, register_id, method, amount, tendered,
      change_given, is_refund, reference, notes, created_by
    ) VALUES (
      v_business_id, v_sale_id, NULLIF(_sale->>'register_id', '')::uuid,
      COALESCE(NULLIF(payment->>'method', ''), 'cash'),
      (payment->>'amount')::numeric, NULLIF(payment->>'tendered', '')::numeric,
      CASE WHEN NULLIF(payment->>'tendered', '') IS NOT NULL
        THEN GREATEST(ROUND(
          (payment->>'tendered')::numeric - (payment->>'amount')::numeric, 2
        ), 0)
        ELSE 0
      END,
      false, NULLIF(payment->>'reference', ''), NULLIF(payment->>'notes', ''), auth.uid()
    );
  END LOOP;

  IF NULLIF(_pin, '') IS NOT NULL THEN
    approval_result := public.approve_negative_stock_sale(v_sale_id, _pin);
    IF NOT COALESCE((approval_result->>'approved')::boolean, false) THEN
      RAISE EXCEPTION '%',
        COALESCE(approval_result->>'message', 'Manager approval was not granted');
    END IF;
  END IF;

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

REVOKE ALL ON FUNCTION public.sale_line_totals(numeric, numeric, numeric, text, numeric, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_sale_header_totals(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_sale(jsonb, jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sale(jsonb, jsonb, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.create_complete_pos_sale(jsonb, jsonb, jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_complete_pos_sale(jsonb, jsonb, jsonb, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

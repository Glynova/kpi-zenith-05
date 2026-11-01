CREATE OR REPLACE FUNCTION public.calculate_sale_header_totals(
  _item_subtotal numeric,
  _item_discount numeric,
  _item_tax numeric,
  _discount_type text,
  _discount_value numeric,
  _shipping numeric DEFAULT 0,
  _other_charges numeric DEFAULT 0
)
RETURNS TABLE(subtotal numeric, discount numeric, tax numeric, total numeric)
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  gross_subtotal numeric := ROUND(COALESCE(_item_subtotal, 0), 2);
  line_discount numeric;
  after_line_discount numeric;
  order_discount numeric;
  tax_scale numeric;
  final_tax numeric;
BEGIN
  line_discount := LEAST(
    GREATEST(ROUND(COALESCE(_item_discount, 0), 2), 0),
    gross_subtotal
  );
  after_line_discount := GREATEST(ROUND(gross_subtotal - line_discount, 2), 0);

  IF COALESCE(_discount_type, 'amount') = 'percent' THEN
    order_discount := ROUND(
      after_line_discount * LEAST(GREATEST(COALESCE(_discount_value, 0), 0), 100) / 100,
      2
    );
  ELSE
    order_discount := ROUND(
      LEAST(GREATEST(COALESCE(_discount_value, 0), 0), after_line_discount),
      2
    );
  END IF;

  tax_scale := CASE
    WHEN after_line_discount > 0
      THEN GREATEST(after_line_discount - order_discount, 0) / after_line_discount
    ELSE 1
  END;
  final_tax := ROUND(COALESCE(_item_tax, 0) * tax_scale, 2);

  RETURN QUERY
  SELECT
    gross_subtotal,
    ROUND(line_discount + order_discount, 2),
    final_tax,
    GREATEST(
      ROUND(
        gross_subtotal - line_discount - order_discount + final_tax
          + COALESCE(_shipping, 0) + COALESCE(_other_charges, 0),
        2
      ),
      0
    );
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_sale_header_totals(
  numeric, numeric, numeric, text, numeric, numeric, numeric
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_sale_header_totals(_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  s public.sales%ROWTYPE;
  item_subtotal numeric;
  item_discount numeric;
  item_tax numeric;
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
    ROUND(COALESCE(SUM(
      ROUND(COALESCE(si.total, 0) - COALESCE(si.tax, 0), 2)
        + CASE
            WHEN COALESCE(s.tax_inclusive, false)
              THEN ROUND(
                ROUND(COALESCE(si.discount, 0), 2)
                  / (1 + COALESCE(si.tax_rate, 0) / 100),
                2
              )
            ELSE ROUND(COALESCE(si.discount, 0), 2)
          END
    ), 0), 2),
    ROUND(COALESCE(SUM(
      CASE
        WHEN COALESCE(s.tax_inclusive, false)
          THEN ROUND(
            ROUND(COALESCE(si.discount, 0), 2)
              / (1 + COALESCE(si.tax_rate, 0) / 100),
            2
          )
        ELSE ROUND(COALESCE(si.discount, 0), 2)
      END
    ), 0), 2),
    ROUND(COALESCE(SUM(ROUND(COALESCE(si.tax, 0), 2)), 0), 2)
  INTO item_subtotal, item_discount, item_tax
  FROM public.sale_items si
  WHERE si.sale_id = _sale_id;

  SELECT t.subtotal, t.discount, t.tax, t.total
  INTO expected_subtotal, expected_discount, expected_tax, expected_total
  FROM public.calculate_sale_header_totals(
    item_subtotal,
    item_discount,
    item_tax,
    s.discount_type,
    s.discount_value,
    s.shipping,
    s.other_charges
  ) AS t;

  IF ABS(expected_subtotal - COALESCE(s.subtotal, 0)) > tol
     OR ABS(expected_discount - COALESCE(s.discount, 0)) > tol
     OR ABS(expected_tax - COALESCE(s.tax, 0)) > tol
     OR ABS(expected_total - COALESCE(s.total, 0)) > tol THEN
    RAISE EXCEPTION
      'Sale % header totals must match its items (received subtotal %, discount %, tax %, total %; expected subtotal %, discount %, tax %, total %)',
      s.sale_number,
      ROUND(COALESCE(s.subtotal, 0), 2),
      ROUND(COALESCE(s.discount, 0), 2),
      ROUND(COALESCE(s.tax, 0), 2),
      ROUND(COALESCE(s.total, 0), 2),
      expected_subtotal,
      expected_discount,
      expected_tax,
      expected_total
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_sale_tax_for_items(
  _sale_id uuid,
  _business_id uuid,
  _subtotal numeric,
  _discount_type text,
  _discount_value numeric,
  _submitted_tax numeric,
  _tax_inclusive boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  bs public.business_settings%ROWTYPE;
  item_discount numeric;
  after_line_discount numeric;
  order_discount numeric;
  taxable numeric;
  discount_scale numeric;
  line_tax numeric;
  expected_tax numeric;
  tax_tolerance constant numeric := 0.02;
BEGIN
  IF COALESCE(_tax_inclusive, false)
     OR NOT EXISTS (SELECT 1 FROM public.sale_items WHERE sale_id = _sale_id) THEN
    RETURN;
  END IF;

  SELECT * INTO bs
  FROM public.business_settings
  WHERE business_id = _business_id;

  SELECT ROUND(COALESCE(SUM(ROUND(COALESCE(discount, 0), 2)), 0), 2)
  INTO item_discount
  FROM public.sale_items
  WHERE sale_id = _sale_id;

  after_line_discount := GREATEST(
    ROUND(COALESCE(_subtotal, 0) - item_discount, 2),
    0
  );
  IF COALESCE(_discount_type, 'amount') = 'percent' THEN
    order_discount := ROUND(
      after_line_discount * LEAST(GREATEST(COALESCE(_discount_value, 0), 0), 100) / 100,
      2
    );
  ELSE
    order_discount := ROUND(
      LEAST(GREATEST(COALESCE(_discount_value, 0), 0), after_line_discount),
      2
    );
  END IF;
  taxable := GREATEST(after_line_discount - order_discount, 0);
  discount_scale := CASE
    WHEN after_line_discount > 0 THEN taxable / after_line_discount
    ELSE 1
  END;

  SELECT COALESCE(SUM(
    ROUND(
      GREATEST(
        ROUND(COALESCE(si.quantity, 0) * COALESCE(si.unit_price, 0), 2)
          - ROUND(COALESCE(si.discount, 0), 2),
        0
      )
      * GREATEST(COALESCE(p.tax_rate, bs.tax_rate, 0), 0) / 100,
      2
    )
  ), 0)
  INTO line_tax
  FROM public.sale_items si
  LEFT JOIN public.products p
    ON p.id = si.product_id
   AND p.business_id = _business_id
  WHERE si.sale_id = _sale_id;

  expected_tax := ROUND(line_tax * discount_scale, 2);
  IF ABS(COALESCE(_submitted_tax, 0) - expected_tax) > tax_tolerance THEN
    RAISE EXCEPTION
      'Tax % does not match expected product-rate tax % on a taxable amount of %',
      ROUND(COALESCE(_submitted_tax, 0), 2),
      expected_tax,
      taxable
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_sale_capability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  bs public.business_settings%ROWTYPE;
  total_discount numeric;
  taxable numeric;
  max_tax numeric;
  expected_total numeric;
  check_money boolean := (TG_OP = 'INSERT');
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.require_capability(NEW.business_id, 'enable_sales', 'Sales');
    IF NEW.document_type = 'pos_sale' OR NEW.channel = 'pos' THEN
      PERFORM public.require_capability(NEW.business_id, 'enable_pos', 'Point of sale');
    END IF;
    IF NEW.document_type = 'quote' THEN
      PERFORM public.require_capability(NEW.business_id, 'enable_quotes', 'Quotations');
    END IF;
    IF NEW.document_type = 'sales_order' THEN
      PERFORM public.require_capability(NEW.business_id, 'enable_sales_orders', 'Sales orders');
    END IF;
    IF NEW.document_type IN ('return', 'sales_return', 'credit_note') THEN
      PERFORM public.require_capability(NEW.business_id, 'enable_returns', 'Returns');
    END IF;
    IF COALESCE(NEW.shipping, 0) <> 0 OR NEW.shipping_method IS NOT NULL OR NEW.tracking_number IS NOT NULL THEN
      PERFORM public.require_capability(NEW.business_id, 'enable_shipping', 'Shipping and delivery');
    END IF;
    IF NEW.register_id IS NOT NULL THEN
      PERFORM public.require_capability(NEW.business_id, 'enable_cash_register', 'Cash registers');
    END IF;
  ELSE
    check_money := (
      COALESCE(NEW.subtotal, 0) IS DISTINCT FROM COALESCE(OLD.subtotal, 0)
      OR COALESCE(NEW.discount, 0) IS DISTINCT FROM COALESCE(OLD.discount, 0)
      OR COALESCE(NEW.discount_type, 'amount') IS DISTINCT FROM COALESCE(OLD.discount_type, 'amount')
      OR COALESCE(NEW.discount_value, 0) IS DISTINCT FROM COALESCE(OLD.discount_value, 0)
      OR COALESCE(NEW.tax, 0) IS DISTINCT FROM COALESCE(OLD.tax, 0)
      OR COALESCE(NEW.tax_inclusive, false) IS DISTINCT FROM COALESCE(OLD.tax_inclusive, false)
      OR COALESCE(NEW.total, 0) IS DISTINCT FROM COALESCE(OLD.total, 0)
      OR COALESCE(NEW.shipping, 0) IS DISTINCT FROM COALESCE(OLD.shipping, 0)
      OR COALESCE(NEW.other_charges, 0) IS DISTINCT FROM COALESCE(OLD.other_charges, 0)
    );
  END IF;

  IF NOT check_money THEN
    RETURN NEW;
  END IF;

  SELECT * INTO bs
  FROM public.business_settings
  WHERE business_id = NEW.business_id;

  total_discount := LEAST(
    GREATEST(COALESCE(NEW.discount, 0), 0),
    GREATEST(COALESCE(NEW.subtotal, 0), 0)
  );
  taxable := GREATEST(COALESCE(NEW.subtotal, 0) - total_discount, 0);

  IF NOT COALESCE(NEW.tax_inclusive, false) THEN
    max_tax := ROUND(taxable * GREATEST(COALESCE(bs.tax_rate, 0), 0) / 100, 2);
    IF COALESCE(NEW.tax, 0) > max_tax + 0.05 THEN
      RAISE EXCEPTION
        'Tax % exceeds % on a taxable amount of % (tax is charged once, after discount)',
        ROUND(COALESCE(NEW.tax, 0), 2),
        max_tax,
        taxable
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM public.validate_sale_tax_for_items(
    NEW.id,
    NEW.business_id,
    NEW.subtotal,
    NEW.discount_type,
    NEW.discount_value,
    NEW.tax,
    NEW.tax_inclusive
  );

  expected_total := ROUND(
    taxable + COALESCE(NEW.tax, 0) + COALESCE(NEW.shipping, 0) + COALESCE(NEW.other_charges, 0),
    2
  );
  IF ABS(COALESCE(NEW.total, 0) - expected_total) > 0.05 THEN
    RAISE EXCEPTION
      'Sale total % does not match % (taxable % + tax % + shipping % + charges %)',
      ROUND(COALESCE(NEW.total, 0), 2),
      expected_total,
      taxable,
      ROUND(COALESCE(NEW.tax, 0), 2),
      COALESCE(NEW.shipping, 0),
      COALESCE(NEW.other_charges, 0)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Reconcile historical revenue headers before enabling the new invariant.
-- Total, tax, and payment values remain unchanged apart from cent rounding.
DROP TRIGGER IF EXISTS sale_header_totals_trg ON public.sales;
DROP TRIGGER IF EXISTS guard_sale_capability_trg ON public.sales;

WITH item_totals AS (
  SELECT
    si.sale_id,
    ROUND(COALESCE(SUM(
      ROUND(COALESCE(si.total, 0) - COALESCE(si.tax, 0), 2)
        + CASE
            WHEN COALESCE(s.tax_inclusive, false)
              THEN ROUND(
                ROUND(COALESCE(si.discount, 0), 2)
                  / (1 + COALESCE(si.tax_rate, 0) / 100),
                2
              )
            ELSE ROUND(COALESCE(si.discount, 0), 2)
          END
    ), 0), 2) AS subtotal,
    ROUND(COALESCE(SUM(
      CASE
        WHEN COALESCE(s.tax_inclusive, false)
          THEN ROUND(
            ROUND(COALESCE(si.discount, 0), 2)
              / (1 + COALESCE(si.tax_rate, 0) / 100),
            2
          )
        ELSE ROUND(COALESCE(si.discount, 0), 2)
      END
    ), 0), 2) AS item_discount,
    ROUND(COALESCE(SUM(ROUND(COALESCE(si.tax, 0), 2)), 0), 2) AS tax
  FROM public.sale_items si
  JOIN public.sales s ON s.id = si.sale_id
  GROUP BY si.sale_id, s.tax_inclusive
),
calculated AS (
  SELECT s.id, totals.subtotal, totals.discount, totals.tax, totals.total
  FROM public.sales s
  JOIN item_totals i ON i.sale_id = s.id
  CROSS JOIN LATERAL public.calculate_sale_header_totals(
    i.subtotal,
    i.item_discount,
    i.tax,
    s.discount_type,
    s.discount_value,
    s.shipping,
    s.other_charges
  ) AS totals
  WHERE s.document_type IN ('sale', 'pos_sale')
)
UPDATE public.sales s
SET subtotal = c.subtotal,
    discount = c.discount,
    tax = c.tax,
    total = c.total,
    base_total = ROUND(c.total * COALESCE(s.exchange_rate, 1), 2)
FROM calculated c
WHERE s.id = c.id
  AND (
    s.subtotal IS DISTINCT FROM c.subtotal
    OR s.discount IS DISTINCT FROM c.discount
    OR s.tax IS DISTINCT FROM c.tax
    OR s.total IS DISTINCT FROM c.total
    OR s.base_total IS DISTINCT FROM ROUND(c.total * COALESCE(s.exchange_rate, 1), 2)
  );

CREATE TRIGGER guard_sale_capability_trg
  BEFORE INSERT OR UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.guard_sale_capability();

CREATE TRIGGER sale_header_totals_trg
  AFTER INSERT OR UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_sale_header_totals();

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
  v_item_subtotal numeric;
  v_item_discount numeric;
  v_item_tax numeric;
  v_expected_subtotal numeric;
  v_expected_discount numeric;
  v_expected_tax numeric;
  v_expected_total numeric;
  v_subtotal numeric;
  v_discount numeric;
  v_tax numeric;
  v_total numeric;
  v_base_total numeric;
  v_exchange_rate numeric;
  v_normalized_sale jsonb;
BEGIN
  IF jsonb_typeof(_sale) IS DISTINCT FROM 'object'
     OR jsonb_typeof(_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid POS sale payload';
  END IF;
  IF jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'A POS sale must contain at least one item';
  END IF;

  SELECT
    ROUND(COALESCE(SUM(
      ROUND(
        COALESCE(NULLIF(line.value->>'total', '')::numeric, 0)
          - COALESCE(NULLIF(line.value->>'tax', '')::numeric, 0),
        2
      )
        + CASE
            WHEN COALESCE(NULLIF(_sale->>'tax_inclusive', '')::boolean, false)
              THEN ROUND(
                ROUND(COALESCE(NULLIF(line.value->>'discount', '')::numeric, 0), 2)
                  / (
                    1 + COALESCE(NULLIF(line.value->>'tax_rate', '')::numeric, 0) / 100
                  ),
                2
              )
            ELSE ROUND(COALESCE(NULLIF(line.value->>'discount', '')::numeric, 0), 2)
          END
    ), 0), 2),
    ROUND(COALESCE(SUM(
      CASE
        WHEN COALESCE(NULLIF(_sale->>'tax_inclusive', '')::boolean, false)
          THEN ROUND(
            ROUND(COALESCE(NULLIF(line.value->>'discount', '')::numeric, 0), 2)
              / (
                1 + COALESCE(NULLIF(line.value->>'tax_rate', '')::numeric, 0) / 100
              ),
            2
          )
        ELSE ROUND(COALESCE(NULLIF(line.value->>'discount', '')::numeric, 0), 2)
      END
    ), 0), 2),
    ROUND(COALESCE(SUM(ROUND(
      COALESCE(NULLIF(line.value->>'tax', '')::numeric, 0),
      2
    )), 0), 2)
  INTO v_item_subtotal, v_item_discount, v_item_tax
  FROM jsonb_array_elements(_items) AS line(value);

  SELECT t.subtotal, t.discount, t.tax, t.total
  INTO v_expected_subtotal, v_expected_discount, v_expected_tax, v_expected_total
  FROM public.calculate_sale_header_totals(
    v_item_subtotal,
    v_item_discount,
    v_item_tax,
    COALESCE(NULLIF(_sale->>'discount_type', ''), 'amount'),
    COALESCE(NULLIF(_sale->>'discount_value', '')::numeric, 0),
    COALESCE(NULLIF(_sale->>'shipping', '')::numeric, 0),
    COALESCE(NULLIF(_sale->>'other_charges', '')::numeric, 0)
  ) AS t;

  v_subtotal := COALESCE(
    ROUND(NULLIF(_sale->>'subtotal', '')::numeric, 2),
    v_expected_subtotal
  );
  v_discount := COALESCE(
    ROUND(NULLIF(_sale->>'discount', '')::numeric, 2),
    v_expected_discount
  );
  v_tax := COALESCE(ROUND(NULLIF(_sale->>'tax', '')::numeric, 2), v_expected_tax);
  v_total := COALESCE(
    ROUND(NULLIF(_sale->>'total', '')::numeric, 2),
    v_expected_total
  );
  v_exchange_rate := COALESCE(NULLIF(_sale->>'exchange_rate', '')::numeric, 1);
  v_base_total := COALESCE(
    ROUND(NULLIF(_sale->>'base_total', '')::numeric, 2),
    ROUND(v_total * v_exchange_rate, 2)
  );

  v_normalized_sale := jsonb_set(_sale, '{subtotal}', to_jsonb(v_subtotal), true);
  v_normalized_sale := jsonb_set(v_normalized_sale, '{discount}', to_jsonb(v_discount), true);
  v_normalized_sale := jsonb_set(v_normalized_sale, '{tax}', to_jsonb(v_tax), true);
  v_normalized_sale := jsonb_set(v_normalized_sale, '{total}', to_jsonb(v_total), true);
  v_normalized_sale := jsonb_set(v_normalized_sale, '{base_total}', to_jsonb(v_base_total), true);

  RETURN public.create_complete_pos_sale_legacy(
    v_normalized_sale,
    _items,
    _payments,
    _pin
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_sale_header_totals(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_sale_tax_for_items(
  uuid, uuid, numeric, text, numeric, numeric, boolean
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_sale_capability()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_complete_pos_sale(jsonb, jsonb, jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_complete_pos_sale(jsonb, jsonb, jsonb, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

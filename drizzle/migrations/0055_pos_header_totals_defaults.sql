-- Preserve the atomic POS implementation while normalizing its header totals
-- before calling it. Missing totals are derived from item snapshots; supplied
-- totals are rounded and remain subject to the existing database guards.
DO $$
BEGIN
  IF to_regprocedure('public.create_complete_pos_sale(jsonb,jsonb,jsonb,text)') IS NOT NULL
     AND to_regprocedure('public.create_complete_pos_sale_legacy(jsonb,jsonb,jsonb,text)') IS NULL THEN
    ALTER FUNCTION public.create_complete_pos_sale(jsonb, jsonb, jsonb, text)
      RENAME TO create_complete_pos_sale_legacy;
  END IF;

  IF to_regprocedure('public.create_complete_pos_sale_legacy(jsonb,jsonb,jsonb,text)') IS NULL THEN
    RAISE EXCEPTION 'The atomic POS sale function must be installed before migration 0055';
  END IF;
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
  scale numeric;
  exp_subtotal numeric;
  exp_discount numeric;
  exp_tax numeric;
  exp_total numeric;
  tol constant numeric := 0.02;
BEGIN
  SELECT * INTO s FROM public.sales WHERE id = _sale_id;
  IF s.id IS NULL THEN RETURN; END IF;
  IF s.document_type NOT IN ('sale', 'pos_sale') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sale_items WHERE sale_id = _sale_id) THEN RETURN; END IF;

  SELECT COALESCE(SUM(COALESCE(total, 0) - COALESCE(tax, 0)), 0),
         COALESCE(SUM(COALESCE(discount, 0)), 0),
         COALESCE(SUM(COALESCE(tax, 0)), 0)
    INTO item_net, item_disc, item_tax
    FROM public.sale_items
   WHERE sale_id = _sale_id;

  exp_subtotal := ROUND(item_net, 2);
  IF s.discount_type = 'percent' THEN
    order_disc := ROUND(exp_subtotal * LEAST(GREATEST(COALESCE(s.discount_value, 0), 0), 100) / 100, 2);
  ELSE
    order_disc := ROUND(LEAST(GREATEST(COALESCE(s.discount_value, 0), 0), exp_subtotal), 2);
  END IF;
  exp_discount := ROUND(item_disc + order_disc, 2);
  scale := CASE WHEN exp_subtotal > 0 THEN (exp_subtotal - order_disc) / exp_subtotal ELSE 1 END;
  exp_tax := ROUND(item_tax * scale, 2);
  exp_total := GREATEST(ROUND(exp_subtotal - order_disc + exp_tax
                              + COALESCE(s.shipping, 0) + COALESCE(s.other_charges, 0), 2), 0);

  IF abs(exp_subtotal - COALESCE(s.subtotal, 0)) > tol
     OR abs(exp_discount - COALESCE(s.discount, 0)) > tol
     OR abs(exp_tax - COALESCE(s.tax, 0)) > tol
     OR abs(exp_total - COALESCE(s.total, 0)) > tol THEN
    RAISE EXCEPTION
      'Sale % header totals must match its items (received subtotal %, discount %, tax %, total %; expected subtotal %, discount %, tax %, total %)',
      s.sale_number,
      ROUND(COALESCE(s.subtotal, 0), 2),
      ROUND(COALESCE(s.discount, 0), 2),
      ROUND(COALESCE(s.tax, 0), 2),
      ROUND(COALESCE(s.total, 0), 2),
      exp_subtotal,
      exp_discount,
      exp_tax,
      exp_total;
  END IF;
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
  v_item_subtotal numeric;
  v_item_discount numeric;
  v_item_tax numeric;
  v_order_discount numeric;
  v_discount_type text;
  v_discount_value numeric;
  v_tax_scale numeric;
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

  SELECT ROUND(COALESCE(SUM(
           COALESCE(NULLIF(line.value->>'total', '')::numeric, 0)
           - COALESCE(NULLIF(line.value->>'tax', '')::numeric, 0)
         ), 0), 2),
         ROUND(COALESCE(SUM(COALESCE(NULLIF(line.value->>'discount', '')::numeric, 0)), 0), 2),
         ROUND(COALESCE(SUM(COALESCE(NULLIF(line.value->>'tax', '')::numeric, 0)), 0), 2)
    INTO v_item_subtotal, v_item_discount, v_item_tax
    FROM jsonb_array_elements(_items) AS line(value);

  v_discount_type := COALESCE(NULLIF(_sale->>'discount_type', ''), 'amount');
  v_discount_value := COALESCE(NULLIF(_sale->>'discount_value', '')::numeric, 0);
  IF v_discount_type = 'percent' THEN
    v_order_discount := ROUND(v_item_subtotal * LEAST(GREATEST(v_discount_value, 0), 100) / 100, 2);
  ELSE
    v_order_discount := ROUND(LEAST(GREATEST(v_discount_value, 0), v_item_subtotal), 2);
  END IF;

  v_tax_scale := CASE
    WHEN v_item_subtotal > 0 THEN (v_item_subtotal - v_order_discount) / v_item_subtotal
    ELSE 1
  END;
  v_subtotal := COALESCE(
    ROUND(NULLIF(_sale->>'subtotal', '')::numeric, 2),
    v_item_subtotal
  );
  v_discount := COALESCE(
    ROUND(NULLIF(_sale->>'discount', '')::numeric, 2),
    ROUND(v_item_discount + v_order_discount, 2)
  );
  v_tax := COALESCE(
    ROUND(NULLIF(_sale->>'tax', '')::numeric, 2),
    ROUND(v_item_tax * v_tax_scale, 2)
  );
  v_total := COALESCE(
    ROUND(NULLIF(_sale->>'total', '')::numeric, 2),
    GREATEST(ROUND(v_item_subtotal - v_order_discount + ROUND(v_item_tax * v_tax_scale, 2), 2), 0)
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

  RETURN public.create_complete_pos_sale_legacy(v_normalized_sale, _items, _payments, _pin);
END;
$$;

REVOKE ALL ON FUNCTION public.create_complete_pos_sale_legacy(jsonb, jsonb, jsonb, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_complete_pos_sale(jsonb, jsonb, jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_complete_pos_sale(jsonb, jsonb, jsonb, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

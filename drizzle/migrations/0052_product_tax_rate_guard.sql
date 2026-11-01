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
  order_discount numeric;
  taxable numeric;
  discount_scale numeric;
  line_tax numeric;
  expected_tax numeric;
  tax_tolerance constant numeric := 0.02;
BEGIN
  IF COALESCE(_tax_inclusive, false)
     OR NOT EXISTS (
       SELECT 1 FROM public.sale_items WHERE sale_id = _sale_id
     ) THEN
    RETURN;
  END IF;

  SELECT * INTO bs
    FROM public.business_settings
   WHERE business_id = _business_id;

  order_discount := CASE
    WHEN COALESCE(_discount_type, 'amount') = 'percent'
      THEN ROUND(COALESCE(_subtotal, 0)
        * LEAST(GREATEST(COALESCE(_discount_value, 0), 0), 100) / 100, 2)
    ELSE LEAST(
      GREATEST(COALESCE(_discount_value, 0), 0),
      COALESCE(_subtotal, 0)
    )
  END;
  taxable := GREATEST(COALESCE(_subtotal, 0) - order_discount, 0);
  discount_scale := CASE
    WHEN COALESCE(_subtotal, 0) > 0 THEN taxable / _subtotal
    ELSE 1
  END;

  SELECT COALESCE(SUM(
    ROUND(
      GREATEST(
        ROUND(COALESCE(si.quantity, 0) * COALESCE(si.unit_price, 0), 2)
          - COALESCE(si.discount, 0),
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
      ROUND(COALESCE(_submitted_tax, 0), 2), expected_tax, taxable
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_sale_tax_for_items(
  uuid, uuid, numeric, text, numeric, numeric, boolean
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_sale_capability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  order_discount numeric;
  taxable numeric;
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
    IF NEW.document_type IN ('return','sales_return','credit_note') THEN
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
      COALESCE(NEW.subtotal,0) IS DISTINCT FROM COALESCE(OLD.subtotal,0)
      OR COALESCE(NEW.discount,0) IS DISTINCT FROM COALESCE(OLD.discount,0)
      OR COALESCE(NEW.discount_value,0) IS DISTINCT FROM COALESCE(OLD.discount_value,0)
      OR COALESCE(NEW.tax,0) IS DISTINCT FROM COALESCE(OLD.tax,0)
      OR COALESCE(NEW.total,0) IS DISTINCT FROM COALESCE(OLD.total,0)
      OR COALESCE(NEW.shipping,0) IS DISTINCT FROM COALESCE(OLD.shipping,0)
      OR COALESCE(NEW.other_charges,0) IS DISTINCT FROM COALESCE(OLD.other_charges,0)
    );
  END IF;

  IF NOT check_money THEN RETURN NEW; END IF;

  order_discount := CASE
    WHEN COALESCE(NEW.discount_type, 'amount') = 'percent'
      THEN ROUND(COALESCE(NEW.subtotal, 0) * LEAST(GREATEST(COALESCE(NEW.discount_value, 0), 0), 100) / 100, 2)
    ELSE LEAST(GREATEST(COALESCE(NEW.discount_value, 0), 0), COALESCE(NEW.subtotal, 0))
  END;
  taxable := GREATEST(COALESCE(NEW.subtotal, 0) - order_discount, 0);

  PERFORM public.validate_sale_tax_for_items(
    NEW.id,
    NEW.business_id,
    NEW.subtotal,
    NEW.discount_type,
    NEW.discount_value,
    NEW.tax,
    NEW.tax_inclusive
  );

  expected_total := ROUND(taxable + COALESCE(NEW.tax, 0) + COALESCE(NEW.shipping, 0) + COALESCE(NEW.other_charges, 0), 2);
  IF ABS(COALESCE(NEW.total, 0) - expected_total) > 0.05 THEN
    RAISE EXCEPTION 'Sale total % does not match % (taxable % + tax % + shipping % + charges %)',
      ROUND(COALESCE(NEW.total,0),2), expected_total, taxable,
      ROUND(COALESCE(NEW.tax,0),2), COALESCE(NEW.shipping,0), COALESCE(NEW.other_charges,0)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_sale_tax_after_item_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sale_row public.sales%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT * INTO sale_row
      FROM public.sales
     WHERE id = OLD.sale_id;
    IF FOUND THEN
      PERFORM public.validate_sale_tax_for_items(
        sale_row.id,
        sale_row.business_id,
        sale_row.subtotal,
        sale_row.discount_type,
        sale_row.discount_value,
        sale_row.tax,
        sale_row.tax_inclusive
      );
    END IF;
  END IF;

  IF TG_OP <> 'DELETE'
     AND (TG_OP = 'INSERT' OR NEW.sale_id IS DISTINCT FROM OLD.sale_id) THEN
    SELECT * INTO sale_row
      FROM public.sales
     WHERE id = NEW.sale_id;
    IF FOUND THEN
      PERFORM public.validate_sale_tax_for_items(
        sale_row.id,
        sale_row.business_id,
        sale_row.subtotal,
        sale_row.discount_type,
        sale_row.discount_value,
        sale_row.tax,
        sale_row.tax_inclusive
      );
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_sale_tax_after_item_change()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sale_items_product_tax_ins_trg ON public.sale_items;
CREATE CONSTRAINT TRIGGER sale_items_product_tax_ins_trg
  AFTER INSERT ON public.sale_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_sale_tax_after_item_change();

DROP TRIGGER IF EXISTS sale_items_product_tax_upd_trg ON public.sale_items;
CREATE CONSTRAINT TRIGGER sale_items_product_tax_upd_trg
  AFTER UPDATE ON public.sale_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_sale_tax_after_item_change();

DROP TRIGGER IF EXISTS sale_items_product_tax_del_trg ON public.sale_items;
CREATE CONSTRAINT TRIGGER sale_items_product_tax_del_trg
  AFTER DELETE ON public.sale_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_sale_tax_after_item_change();

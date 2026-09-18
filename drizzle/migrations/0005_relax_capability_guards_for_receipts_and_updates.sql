-- Receiving a cross-business transfer must never fail because the *receiving*
-- business has transfers switched off — the source already gave up the stock.
-- Only outbound movements are gated.
CREATE OR REPLACE FUNCTION public.guard_movement_capability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.type IN ('waste','damage','spoilage','expired') THEN
    PERFORM public.require_capability(NEW.business_id, 'enable_waste', 'Waste tracking');
  END IF;
  IF NEW.type = 'transfer_out' THEN
    PERFORM public.require_capability(NEW.business_id, 'enable_stock_transfers', 'Stock transfers');
  END IF;
  RETURN NEW;
END; $$;

-- Totals integrity is validated when a document is created or when its money
-- columns change; posting/status updates on historical documents (which were
-- priced under an older tax rate) stay untouched.
CREATE OR REPLACE FUNCTION public.guard_sale_capability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  bs public.business_settings%ROWTYPE;
  order_discount numeric;
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

  SELECT * INTO bs FROM public.business_settings WHERE business_id = NEW.business_id;

  order_discount := CASE
    WHEN COALESCE(NEW.discount_type, 'amount') = 'percent'
      THEN ROUND(COALESCE(NEW.subtotal, 0) * LEAST(GREATEST(COALESCE(NEW.discount_value, 0), 0), 100) / 100, 2)
    ELSE LEAST(GREATEST(COALESCE(NEW.discount_value, 0), 0), COALESCE(NEW.subtotal, 0))
  END;
  taxable := GREATEST(COALESCE(NEW.subtotal, 0) - order_discount, 0);

  IF NOT COALESCE(NEW.tax_inclusive, false) THEN
    max_tax := ROUND(taxable * GREATEST(COALESCE(bs.tax_rate, 0), 0) / 100, 2);
    IF COALESCE(NEW.tax, 0) > max_tax + 0.05 THEN
      RAISE EXCEPTION 'Tax % exceeds % on a taxable amount of % (tax is charged once, after discount)',
        ROUND(COALESCE(NEW.tax,0),2), max_tax, taxable USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  expected_total := ROUND(taxable + COALESCE(NEW.tax, 0) + COALESCE(NEW.shipping, 0) + COALESCE(NEW.other_charges, 0), 2);
  IF ABS(COALESCE(NEW.total, 0) - expected_total) > 0.05 THEN
    RAISE EXCEPTION 'Sale total % does not match % (taxable % + tax % + shipping % + charges %)',
      ROUND(COALESCE(NEW.total,0),2), expected_total, taxable,
      ROUND(COALESCE(NEW.tax,0),2), COALESCE(NEW.shipping,0), COALESCE(NEW.other_charges,0)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

-- =====================================================================
-- Central capability engine in the database.
-- Mirrors src/lib/capabilities.ts: a capability is usable only when its
-- own switch AND every hard prerequisite are on. Route guards in React are
-- convenience; these checks are the real boundary.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.capability_enabled(_business_id uuid, _key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  bs public.business_settings%ROWTYPE;
  deps text[];
  d text;
  own boolean;
BEGIN
  SELECT * INTO bs FROM public.business_settings WHERE business_id = _business_id;
  IF bs.business_id IS NULL THEN
    -- No saved configuration yet: fall back to the permissive defaults so
    -- existing businesses never lose access mid-setup.
    RETURN true;
  END IF;

  own := CASE _key
    WHEN 'track_quantity' THEN COALESCE(bs.track_quantity, true)
    WHEN 'track_cost' THEN COALESCE(bs.track_cost, true)
    WHEN 'track_locations' THEN COALESCE(bs.track_locations, false)
    WHEN 'track_batch' THEN COALESCE(bs.track_batch, false)
    WHEN 'track_lot' THEN COALESCE(bs.track_lot, false)
    WHEN 'track_expiry' THEN COALESCE(bs.track_expiry, false)
    WHEN 'track_serial' THEN COALESCE(bs.track_serial, false)
    WHEN 'track_variants' THEN COALESCE(bs.track_variants, false)
    WHEN 'enable_bom' THEN COALESCE(bs.enable_bom, false)
    WHEN 'enable_production' THEN COALESCE(bs.enable_production, false)
    WHEN 'enable_food_costing' THEN COALESCE(bs.enable_food_costing, false)
    WHEN 'enable_waste' THEN COALESCE(bs.enable_waste, false)
    WHEN 'enable_unit_conversion' THEN COALESCE(bs.enable_unit_conversion, false)
    WHEN 'enable_purchasing' THEN COALESCE(bs.enable_purchasing, true)
    WHEN 'enable_sales' THEN COALESCE(bs.enable_sales, true)
    WHEN 'enable_services' THEN COALESCE(bs.enable_services, false)
    WHEN 'enable_returns' THEN COALESCE(bs.enable_returns, true)
    WHEN 'enable_barcode' THEN COALESCE(bs.enable_barcode, true)
    WHEN 'enable_projects' THEN COALESCE(bs.enable_projects, false)
    WHEN 'enable_stock_transfers' THEN COALESCE(bs.enable_stock_transfers, false)
    WHEN 'enable_stock_counts' THEN COALESCE(bs.enable_stock_counts, true)
    WHEN 'enable_low_stock_alerts' THEN COALESCE(bs.enable_low_stock_alerts, true)
    WHEN 'enable_pos' THEN COALESCE(bs.enable_pos, true)
    WHEN 'enable_quotes' THEN COALESCE(bs.enable_quotes, false)
    WHEN 'enable_sales_orders' THEN COALESCE(bs.enable_sales_orders, false)
    WHEN 'enable_shipping' THEN COALESCE(bs.enable_shipping, false)
    WHEN 'enable_customer_credit' THEN COALESCE(bs.enable_customer_credit, false)
    WHEN 'enable_cash_register' THEN COALESCE(bs.enable_cash_register, false)
    ELSE true
  END;

  IF NOT own THEN RETURN false; END IF;

  deps := CASE _key
    WHEN 'enable_stock_transfers' THEN ARRAY['track_locations','track_quantity']
    WHEN 'enable_stock_counts' THEN ARRAY['track_quantity']
    WHEN 'enable_low_stock_alerts' THEN ARRAY['track_quantity']
    WHEN 'track_batch' THEN ARRAY['track_quantity']
    WHEN 'track_lot' THEN ARRAY['track_quantity','track_batch']
    WHEN 'track_expiry' THEN ARRAY['track_quantity']
    WHEN 'track_serial' THEN ARRAY['track_quantity']
    WHEN 'enable_production' THEN ARRAY['enable_bom','track_quantity']
    WHEN 'enable_food_costing' THEN ARRAY['enable_bom','track_cost']
    WHEN 'enable_waste' THEN ARRAY['track_quantity']
    WHEN 'enable_unit_conversion' THEN ARRAY['track_quantity']
    WHEN 'enable_pos' THEN ARRAY['enable_sales']
    WHEN 'enable_quotes' THEN ARRAY['enable_sales']
    WHEN 'enable_sales_orders' THEN ARRAY['enable_sales']
    WHEN 'enable_shipping' THEN ARRAY['enable_sales']
    WHEN 'enable_customer_credit' THEN ARRAY['enable_sales']
    WHEN 'enable_cash_register' THEN ARRAY['enable_pos']
    ELSE ARRAY[]::text[]
  END;

  FOREACH d IN ARRAY deps LOOP
    IF NOT public.capability_enabled(_business_id, d) THEN RETURN false; END IF;
  END LOOP;

  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.capability_enabled(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.capability_enabled(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.require_capability(_business_id uuid, _key text, _label text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.capability_enabled(_business_id, _key) THEN
    RAISE EXCEPTION '% is switched off for this business. Enable it in Settings first.', _label
      USING ERRCODE = 'check_violation';
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.require_capability(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_capability(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Sales: capability gate + tax-exactly-once integrity
-- ---------------------------------------------------------------------
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
  END IF;

  SELECT * INTO bs FROM public.business_settings WHERE business_id = NEW.business_id;

  -- Tax is applied exactly once, to the discounted amount.
  -- subtotal is stored net of line discounts; discount_value/discount_type
  -- carry the order-level discount on top of it.
  order_discount := CASE
    WHEN COALESCE(NEW.discount_type, 'amount') = 'percent'
      THEN ROUND(COALESCE(NEW.subtotal, 0) * LEAST(GREATEST(COALESCE(NEW.discount_value, 0), 0), 100) / 100, 2)
    ELSE LEAST(GREATEST(COALESCE(NEW.discount_value, 0), 0), COALESCE(NEW.subtotal, 0))
  END;
  taxable := GREATEST(COALESCE(NEW.subtotal, 0) - order_discount, 0);

  IF NOT COALESCE(NEW.tax_inclusive, false) THEN
    max_tax := ROUND(taxable * GREATEST(COALESCE(bs.tax_rate, 0), 0) / 100, 2);
    -- Per-line rates may be lower than the business default, never higher:
    -- a larger figure means tax was applied twice or to a pre-discount base.
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

DROP TRIGGER IF EXISTS guard_sale_capability_trg ON public.sales;
CREATE TRIGGER guard_sale_capability_trg
  BEFORE INSERT OR UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.guard_sale_capability();

-- ---------------------------------------------------------------------
-- Purchasing, transfers, production, counts, batches, serials
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_purchasing_capability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.require_capability(NEW.business_id, 'enable_purchasing', 'Purchasing');
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS guard_purchasing_capability_trg ON public.purchase_orders;
CREATE TRIGGER guard_purchasing_capability_trg
  BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchasing_capability();

CREATE OR REPLACE FUNCTION public.guard_returns_capability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.require_capability(NEW.business_id, 'enable_returns', 'Returns');
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS guard_returns_capability_trg ON public.purchase_returns;
CREATE TRIGGER guard_returns_capability_trg
  BEFORE INSERT ON public.purchase_returns
  FOR EACH ROW EXECUTE FUNCTION public.guard_returns_capability();

CREATE OR REPLACE FUNCTION public.guard_transfer_capability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.require_capability(NEW.source_business_id, 'enable_stock_transfers', 'Stock transfers');
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS guard_transfer_capability_trg ON public.stock_transfers;
CREATE TRIGGER guard_transfer_capability_trg
  BEFORE INSERT ON public.stock_transfers
  FOR EACH ROW EXECUTE FUNCTION public.guard_transfer_capability();

CREATE OR REPLACE FUNCTION public.guard_production_capability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.require_capability(NEW.business_id, 'enable_production', 'Production');
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS guard_production_capability_trg ON public.production_orders;
CREATE TRIGGER guard_production_capability_trg
  BEFORE INSERT ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_production_capability();

CREATE OR REPLACE FUNCTION public.guard_stock_count_capability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.require_capability(NEW.business_id, 'enable_stock_counts', 'Stock counts');
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS guard_stock_count_capability_trg ON public.stock_counts;
CREATE TRIGGER guard_stock_count_capability_trg
  BEFORE INSERT ON public.stock_counts
  FOR EACH ROW EXECUTE FUNCTION public.guard_stock_count_capability();

CREATE OR REPLACE FUNCTION public.guard_batch_capability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.require_capability(NEW.business_id, 'track_batch', 'Batch tracking');
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS guard_batch_capability_trg ON public.batches;
CREATE TRIGGER guard_batch_capability_trg
  BEFORE INSERT ON public.batches
  FOR EACH ROW EXECUTE FUNCTION public.guard_batch_capability();

CREATE OR REPLACE FUNCTION public.guard_serial_capability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.require_capability(NEW.business_id, 'track_serial', 'Serial number tracking');
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS guard_serial_capability_trg ON public.serial_numbers;
CREATE TRIGGER guard_serial_capability_trg
  BEFORE INSERT ON public.serial_numbers
  FOR EACH ROW EXECUTE FUNCTION public.guard_serial_capability();

CREATE OR REPLACE FUNCTION public.guard_unit_conversion_capability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.require_capability(NEW.business_id, 'enable_unit_conversion', 'Unit conversion');
  IF COALESCE(NEW.factor, 0) <= 0 THEN
    RAISE EXCEPTION 'Conversion factor must be greater than zero' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS guard_unit_conversion_capability_trg ON public.unit_conversions;
CREATE TRIGGER guard_unit_conversion_capability_trg
  BEFORE INSERT OR UPDATE ON public.unit_conversions
  FOR EACH ROW EXECUTE FUNCTION public.guard_unit_conversion_capability();

-- Waste / spoilage movements only exist when waste tracking is on.
CREATE OR REPLACE FUNCTION public.guard_movement_capability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.type IN ('waste','damage','spoilage','expired') THEN
    PERFORM public.require_capability(NEW.business_id, 'enable_waste', 'Waste tracking');
  END IF;
  IF NEW.type IN ('transfer_in','transfer_out') THEN
    PERFORM public.require_capability(NEW.business_id, 'enable_stock_transfers', 'Stock transfers');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS guard_movement_capability_trg ON public.inventory_movements;
CREATE TRIGGER guard_movement_capability_trg
  BEFORE INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.guard_movement_capability();

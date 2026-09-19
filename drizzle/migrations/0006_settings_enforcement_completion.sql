-- Settings enforcement completion: every remaining Business Settings toggle
-- gets a server-side consequence through the single capability engine.
-- All guards are INSERT/UPDATE-time only; historical rows are untouched.

CREATE OR REPLACE FUNCTION public.guard_batch_capability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_capability(NEW.business_id, 'track_batch', 'Batch tracking');
  IF NULLIF(BTRIM(COALESCE(NEW.lot_number, '')), '') IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.lot_number IS DISTINCT FROM OLD.lot_number) THEN
    PERFORM public.require_capability(NEW.business_id, 'track_lot', 'Lot tracking');
  END IF;
  IF NEW.expiry_date IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.expiry_date IS DISTINCT FROM OLD.expiry_date) THEN
    PERFORM public.require_capability(NEW.business_id, 'track_expiry', 'Expiry tracking');
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS guard_batch_capability_trg ON public.batches;
CREATE TRIGGER guard_batch_capability_trg BEFORE INSERT OR UPDATE ON public.batches
  FOR EACH ROW EXECUTE FUNCTION public.guard_batch_capability();

CREATE OR REPLACE FUNCTION public.guard_variant_capability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_capability(NEW.business_id, 'track_variants', 'Product variants');
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS guard_variant_capability_trg ON public.product_variants;
CREATE TRIGGER guard_variant_capability_trg BEFORE INSERT ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.guard_variant_capability();

CREATE OR REPLACE FUNCTION public.guard_product_capability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(NEW.product_type, 'goods') = 'service'
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.product_type, 'goods') <> 'service') THEN
    PERFORM public.require_capability(NEW.business_id, 'enable_services', 'Services');
  END IF;
  IF COALESCE(NEW.has_bom, false)
     AND (TG_OP = 'INSERT' OR NOT COALESCE(OLD.has_bom, false)) THEN
    PERFORM public.require_capability(NEW.business_id, 'enable_bom', 'Recipes / BOM');
  END IF;
  IF COALESCE(NEW.has_variants, false)
     AND (TG_OP = 'INSERT' OR NOT COALESCE(OLD.has_variants, false)) THEN
    PERFORM public.require_capability(NEW.business_id, 'track_variants', 'Product variants');
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS guard_product_capability_trg ON public.products;
CREATE TRIGGER guard_product_capability_trg BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.guard_product_capability();

CREATE OR REPLACE FUNCTION public.guard_bom_capability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_capability(NEW.business_id, 'enable_bom', 'Recipes / BOM');
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS guard_bom_capability_trg ON public.bill_of_materials;
CREATE TRIGGER guard_bom_capability_trg BEFORE INSERT ON public.bill_of_materials
  FOR EACH ROW EXECUTE FUNCTION public.guard_bom_capability();

CREATE OR REPLACE FUNCTION public.guard_location_capability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE existing integer;
BEGIN
  IF COALESCE(NEW.is_default, false) THEN RETURN NEW; END IF;
  SELECT count(*) INTO existing FROM public.warehouses WHERE business_id = NEW.business_id;
  IF existing = 0 THEN RETURN NEW; END IF;
  PERFORM public.require_capability(NEW.business_id, 'track_locations', 'Multiple locations');
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS guard_location_capability_trg ON public.warehouses;
CREATE TRIGGER guard_location_capability_trg BEFORE INSERT ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.guard_location_capability();

CREATE OR REPLACE FUNCTION public.guard_register_capability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_capability(NEW.business_id, 'enable_cash_register', 'Cash registers');
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS guard_register_capability_trg ON public.cash_registers;
CREATE TRIGGER guard_register_capability_trg BEFORE INSERT ON public.cash_registers
  FOR EACH ROW EXECUTE FUNCTION public.guard_register_capability();

CREATE OR REPLACE FUNCTION public.guard_customer_credit_capability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(NEW.credit_limit, 0) > 0
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.credit_limit, 0) IS DISTINCT FROM COALESCE(NEW.credit_limit, 0)) THEN
    PERFORM public.require_capability(NEW.business_id, 'enable_customer_credit', 'Customer credit');
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS guard_customer_credit_capability_trg ON public.customers;
CREATE TRIGGER guard_customer_credit_capability_trg BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.guard_customer_credit_capability();

CREATE OR REPLACE FUNCTION public.guard_payment_capability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE allowed jsonb;
BEGIN
  IF NEW.method = 'credit' THEN
    PERFORM public.require_capability(NEW.business_id, 'enable_customer_credit', 'Customer credit');
  END IF;
  IF NEW.register_id IS NOT NULL THEN
    PERFORM public.require_capability(NEW.business_id, 'enable_cash_register', 'Cash registers');
  END IF;
  SELECT payment_methods INTO allowed FROM public.business_settings WHERE business_id = NEW.business_id;
  IF allowed IS NOT NULL AND jsonb_typeof(allowed) = 'array' AND jsonb_array_length(allowed) > 0
     AND NOT (allowed ? NEW.method) THEN
    RAISE EXCEPTION 'Payment method "%" is not enabled for this business', NEW.method
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS guard_payment_capability_trg ON public.sale_payments;
CREATE TRIGGER guard_payment_capability_trg BEFORE INSERT ON public.sale_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_payment_capability();

CREATE OR REPLACE FUNCTION public.guard_receipt_capability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_capability(NEW.business_id, 'enable_purchasing', 'Purchasing');
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS guard_receipt_capability_trg ON public.goods_receipts;
CREATE TRIGGER guard_receipt_capability_trg BEFORE INSERT ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.guard_receipt_capability();

REVOKE ALL ON FUNCTION public.guard_variant_capability() FROM anon;
REVOKE ALL ON FUNCTION public.guard_product_capability() FROM anon;
REVOKE ALL ON FUNCTION public.guard_bom_capability() FROM anon;
REVOKE ALL ON FUNCTION public.guard_location_capability() FROM anon;
REVOKE ALL ON FUNCTION public.guard_register_capability() FROM anon;
REVOKE ALL ON FUNCTION public.guard_customer_credit_capability() FROM anon;
REVOKE ALL ON FUNCTION public.guard_payment_capability() FROM anon;
REVOKE ALL ON FUNCTION public.guard_receipt_capability() FROM anon;

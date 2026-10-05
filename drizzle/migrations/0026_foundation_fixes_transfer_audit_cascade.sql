
CREATE OR REPLACE FUNCTION public.block_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- allow cascades from deleting the whole business
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  RAISE EXCEPTION '% records cannot be changed or deleted. Use a reversal instead.', TG_TABLE_NAME;
END $$;

DROP TRIGGER IF EXISTS audit_transfer_trg ON public.stock_transfers;
CREATE OR REPLACE FUNCTION public.audit_transfer() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE payload jsonb := jsonb_build_object('transfer_id', NEW.id, 'status', NEW.status, 'old_status', CASE WHEN TG_OP='UPDATE' THEN OLD.status END,
  'source_business_id', NEW.source_business_id, 'dest_business_id', NEW.dest_business_id);
BEGIN
  PERFORM public._audit(NEW.source_business_id, 'TRANSFER', 'stock_transfers', NEW.id::text, NULL, payload);
  IF NEW.dest_business_id IS DISTINCT FROM NEW.source_business_id THEN
    PERFORM public._audit(NEW.dest_business_id, 'TRANSFER', 'stock_transfers', NEW.id::text, NULL, payload);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER audit_transfer_trg AFTER INSERT OR UPDATE OF status ON public.stock_transfers FOR EACH ROW EXECUTE FUNCTION public.audit_transfer();

CREATE OR REPLACE FUNCTION public.guard_posted_sale() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF current_setting('app.fin_bypass', true) = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
    IF OLD.inventory_posted OR OLD.status IN ('completed','fulfilled','voided') THEN
      RAISE EXCEPTION 'Posted sale % cannot be deleted. Void it instead.', OLD.sale_number;
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
END $$;

CREATE OR REPLACE FUNCTION public.guard_posted_sale_item() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE posted boolean;
BEGIN
  IF current_setting('app.fin_bypass', true) = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  SELECT inventory_posted INTO posted FROM public.sales WHERE id = COALESCE(OLD.sale_id, NEW.sale_id);
  IF NOT COALESCE(posted,false) THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Lines of a posted sale cannot be deleted'; END IF;
  IF TG_OP = 'INSERT' THEN RAISE EXCEPTION 'Lines cannot be added to a posted sale'; END IF;
  IF (NEW.product_id, NEW.variant_id, NEW.quantity, NEW.unit_price, NEW.unit_cost, NEW.discount, NEW.tax, NEW.total, NEW.tax_rate, NEW.product_name, NEW.sku)
     IS DISTINCT FROM (OLD.product_id, OLD.variant_id, OLD.quantity, OLD.unit_price, OLD.unit_cost, OLD.discount, OLD.tax, OLD.total, OLD.tax_rate, OLD.product_name, OLD.sku) THEN
    RAISE EXCEPTION 'Lines of a posted sale are locked';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_invoice() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF current_setting('app.fin_bypass', true) = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Invoice % cannot be deleted. Void it instead.', OLD.invoice_number;
  END IF;
  IF OLD.document_status = 'void' THEN RAISE EXCEPTION 'Invoice % is void and cannot be changed', OLD.invoice_number; END IF;
  IF (NEW.invoice_number, NEW.subtotal, NEW.discount, NEW.tax, NEW.total, NEW.customer_id, NEW.issue_date, NEW.sale_id, NEW.business_id,
      NEW.vat_amount, NEW.vat_exempt_amount, NEW.zero_rated_amount, NEW.customer_name_snapshot, NEW.customer_tin_snapshot)
     IS DISTINCT FROM (OLD.invoice_number, OLD.subtotal, OLD.discount, OLD.tax, OLD.total, OLD.customer_id, OLD.issue_date, OLD.sale_id, OLD.business_id,
      OLD.vat_amount, OLD.vat_exempt_amount, OLD.zero_rated_amount, OLD.customer_name_snapshot, OLD.customer_tin_snapshot) THEN
    RAISE EXCEPTION 'Issued invoice % is locked. Void it and issue a new one.', OLD.invoice_number;
  END IF;
  RETURN NEW;
END $$;

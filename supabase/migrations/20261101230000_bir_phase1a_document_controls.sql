ALTER TABLE public.doc_sequences
  ADD COLUMN IF NOT EXISTS scope_type text NOT NULL DEFAULT 'business',
  ADD COLUMN IF NOT EXISTS scope_id uuid,
  ADD COLUMN IF NOT EXISTS scope_key uuid GENERATED ALWAYS AS (
    COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED;

ALTER TABLE public.doc_sequences
  DROP CONSTRAINT IF EXISTS doc_sequences_business_id_prefix_year_key;

CREATE UNIQUE INDEX IF NOT EXISTS doc_sequences_scoped_unique
  ON public.doc_sequences (business_id, prefix, year, scope_type, scope_key);

CREATE OR REPLACE FUNCTION public.next_doc_number(
  _business_id uuid,
  _prefix text,
  _scope_type text,
  _scope_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  y integer := EXTRACT(YEAR FROM now())::integer;
  n integer;
  scoped_prefix text := _prefix;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not a member of this business';
  END IF;
  IF _scope_type NOT IN ('business', 'branch', 'terminal')
     OR (_scope_type = 'business' AND _scope_id IS NOT NULL)
     OR (_scope_type <> 'business' AND _scope_id IS NULL) THEN
    RAISE EXCEPTION 'Invalid document number scope';
  END IF;
  IF _scope_type = 'branch' AND NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = _scope_id AND business_id = _business_id
  ) THEN
    RAISE EXCEPTION 'Branch does not belong to this business';
  END IF;
  IF _scope_type = 'terminal' AND NOT EXISTS (
    SELECT 1 FROM public.cash_registers
    WHERE id = _scope_id AND business_id = _business_id
  ) THEN
    RAISE EXCEPTION 'Terminal does not belong to this business';
  END IF;
  IF _scope_type <> 'business' THEN
    scoped_prefix := _prefix || '-' ||
      CASE _scope_type WHEN 'branch' THEN 'B' ELSE 'T' END ||
      upper(replace(_scope_id::text, '-', ''));
  END IF;

  INSERT INTO public.doc_sequences (business_id, prefix, year, scope_type, scope_id, last_number)
  VALUES (_business_id, _prefix, y, _scope_type, _scope_id, 1)
  ON CONFLICT (business_id, prefix, year, scope_type, scope_key)
  DO UPDATE SET last_number = public.doc_sequences.last_number + 1
  RETURNING last_number INTO n;

  RETURN scoped_prefix || '-' || y || '-' || lpad(n::text, 6, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION public.next_doc_number(uuid, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.next_doc_number(_business_id uuid, _prefix text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.next_doc_number(_business_id, _prefix, 'business', NULL::uuid);
$$;

CREATE OR REPLACE FUNCTION public.assign_sale_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix text;
  scope_type text;
  scope_id uuid;
BEGIN
  prefix := CASE COALESCE(NEW.document_type, 'sale')
    WHEN 'quote' THEN 'QT'
    WHEN 'sales_order' THEN 'SO'
    WHEN 'return' THEN 'RET'
    ELSE 'SALE'
  END;
  scope_type := CASE
    WHEN NEW.register_id IS NOT NULL THEN 'terminal'
    WHEN NEW.location_id IS NOT NULL THEN 'branch'
    ELSE 'business'
  END;
  scope_id := COALESCE(NEW.register_id, NEW.location_id);
  NEW.sale_number := public.next_doc_number(NEW.business_id, prefix, scope_type, scope_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_sale_number_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.sale_number IS DISTINCT FROM OLD.sale_number THEN
    RAISE EXCEPTION 'Sale number % is immutable', OLD.sale_number;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sale_number_immutable_trg ON public.sales;
CREATE TRIGGER sale_number_immutable_trg
  BEFORE UPDATE OF sale_number ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.guard_sale_number_immutable();

DROP TRIGGER IF EXISTS assign_sale_number_trg ON public.sales;
CREATE TRIGGER assign_sale_number_trg
  BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.assign_sale_number();

DO $$
DECLARE
  definition text;
  changed text;
BEGIN
  SELECT pg_get_functiondef('public.create_sale(jsonb,jsonb,jsonb)'::regprocedure)
  INTO definition;
  changed := replace(
    definition,
    'OR NULLIF(header->>''sale_number'', '''') IS NULL',
    ''
  );
  IF changed = definition THEN
    RAISE EXCEPTION 'Could not make create_sale accept database-assigned sale numbers';
  END IF;
  EXECUTE changed;

  SELECT pg_get_functiondef(
    'public.create_complete_pos_sale(jsonb,jsonb,jsonb,text)'::regprocedure
  ) INTO definition;
  changed := replace(
    definition,
    'sale_number := public.next_doc_number(v_business_id, ''SALE'');',
    'sale_number := NULL;'
  );
  IF changed = definition THEN
    RAISE EXCEPTION 'Could not remove the separate POS sale number reservation';
  END IF;
  EXECUTE changed;
END;
$$;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

CREATE OR REPLACE FUNCTION public.cancel_draft_sale(_sale_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.sales%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.sales WHERE id = _sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;
  IF NOT public.can_write_business(s.business_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF s.status <> 'draft' OR COALESCE(s.inventory_posted, false) THEN
    RAISE EXCEPTION 'Only an unposted draft sale can be cancelled';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RAISE EXCEPTION 'A cancellation reason is required';
  END IF;
  UPDATE public.sales
     SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
         cancel_reason = btrim(_reason), updated_at = now()
   WHERE id = s.id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_draft_sale(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.block_transaction_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% records cannot be deleted. Cancel or reverse the document instead.',
    TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS sales_no_delete_phase1a ON public.sales;
CREATE TRIGGER sales_no_delete_phase1a
  BEFORE DELETE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.block_transaction_delete();
DROP TRIGGER IF EXISTS sale_items_no_delete_phase1a ON public.sale_items;
CREATE TRIGGER sale_items_no_delete_phase1a
  BEFORE DELETE ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.block_transaction_delete();
DROP TRIGGER IF EXISTS sale_payments_no_delete_phase1a ON public.sale_payments;
CREATE TRIGGER sale_payments_no_delete_phase1a
  BEFORE DELETE ON public.sale_payments
  FOR EACH ROW EXECUTE FUNCTION public.block_transaction_delete();

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

CREATE OR REPLACE FUNCTION public.cancel_purchase_order(_purchase_order_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  po public.purchase_orders%ROWTYPE;
BEGIN
  SELECT * INTO po FROM public.purchase_orders WHERE id = _purchase_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  IF NOT public.can_write_business(po.business_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF po.status IN ('closed', 'cancelled', 'received', 'partially_received') THEN
    RAISE EXCEPTION 'This purchase order cannot be cancelled';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.purchase_order_items i
    WHERE i.purchase_order_id = po.id
      AND COALESCE(i.received_quantity, 0) > 0
  ) THEN
    RAISE EXCEPTION 'A purchase order with received items must be reversed, not cancelled';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RAISE EXCEPTION 'A cancellation reason is required';
  END IF;
  UPDATE public.purchase_orders
     SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
         cancel_reason = btrim(_reason), updated_at = now()
   WHERE id = po.id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_purchase_order(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_purchase_order_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.status IN ('approved', 'sent', 'partially_received', 'received', 'closed')
    OR NEW.status IN ('approved', 'sent', 'partially_received', 'received', 'closed')
  ) AND (
    NEW.supplier_id, NEW.warehouse_id, NEW.order_date, NEW.expected_date, NEW.subtotal,
    NEW.tax, NEW.total, NEW.currency, NEW.exchange_rate, NEW.discount, NEW.shipping_cost,
    NEW.other_charges
  ) IS DISTINCT FROM (
    OLD.supplier_id, OLD.warehouse_id, OLD.order_date, OLD.expected_date, OLD.subtotal,
    OLD.tax, OLD.total, OLD.currency, OLD.exchange_rate, OLD.discount, OLD.shipping_cost,
    OLD.other_charges
  ) THEN
    RAISE EXCEPTION 'Approved purchase order financial fields are locked';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS purchase_order_lock_phase1a ON public.purchase_orders;
CREATE TRIGGER purchase_order_lock_phase1a
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_order_lock();

CREATE OR REPLACE FUNCTION public.guard_purchase_order_item_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_status text;
  new_status text;
  line_changed boolean;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT status INTO old_status FROM public.purchase_orders
     WHERE id = OLD.purchase_order_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT status INTO new_status FROM public.purchase_orders
     WHERE id = NEW.purchase_order_id;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    line_changed :=
      NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id OR (
        NEW.product_id, NEW.variant_id, NEW.quantity, NEW.unit_cost, NEW.discount,
        NEW.tax, NEW.total, NEW.unit, NEW.supplier_sku
      ) IS DISTINCT FROM (
        OLD.product_id, OLD.variant_id, OLD.quantity, OLD.unit_cost, OLD.discount,
        OLD.tax, OLD.total, OLD.unit, OLD.supplier_sku
      );
  ELSE
    line_changed := true;
  END IF;
  IF old_status IN ('approved', 'sent', 'partially_received', 'received', 'closed')
     AND line_changed THEN
    RAISE EXCEPTION 'Lines of an approved purchase order are locked';
  END IF;
  IF new_status IN ('approved', 'sent', 'partially_received', 'received', 'closed')
     AND line_changed THEN
    RAISE EXCEPTION 'Lines of an approved purchase order are locked';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS purchase_order_item_lock_phase1a ON public.purchase_order_items;
CREATE TRIGGER purchase_order_item_lock_phase1a
  BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_order_item_lock();

CREATE OR REPLACE FUNCTION public.guard_goods_receipt_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' AND (
    NEW.receipt_number, NEW.purchase_order_id, NEW.supplier_id, NEW.warehouse_id,
    NEW.receipt_date, NEW.received_by, NEW.reference, NEW.attachment_url, NEW.notes
  ) IS DISTINCT FROM (
    OLD.receipt_number, OLD.purchase_order_id, OLD.supplier_id, OLD.warehouse_id,
    OLD.receipt_date, OLD.received_by, OLD.reference, OLD.attachment_url, OLD.notes
  ) THEN
    RAISE EXCEPTION 'Confirmed goods receipt fields are locked';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS goods_receipt_lock_phase1a ON public.goods_receipts;
CREATE TRIGGER goods_receipt_lock_phase1a
  BEFORE UPDATE ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.guard_goods_receipt_lock();

CREATE OR REPLACE FUNCTION public.guard_goods_receipt_item_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE receipt_status text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT status INTO receipt_status FROM public.goods_receipts
    WHERE id = OLD.receipt_id;
    IF receipt_status <> 'draft' THEN
      RAISE EXCEPTION 'Lines of a confirmed goods receipt are locked';
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT status INTO receipt_status FROM public.goods_receipts
    WHERE id = NEW.receipt_id;
    IF receipt_status <> 'draft' THEN
      RAISE EXCEPTION 'Lines of a confirmed goods receipt are locked';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS goods_receipt_item_lock_phase1a ON public.goods_receipt_items;
CREATE TRIGGER goods_receipt_item_lock_phase1a
  BEFORE INSERT OR UPDATE OR DELETE ON public.goods_receipt_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_goods_receipt_item_lock();

DROP TRIGGER IF EXISTS purchase_orders_no_delete_phase1a ON public.purchase_orders;
CREATE TRIGGER purchase_orders_no_delete_phase1a
  BEFORE DELETE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.block_transaction_delete();
DROP TRIGGER IF EXISTS goods_receipts_no_delete_phase1a ON public.goods_receipts;
CREATE TRIGGER goods_receipts_no_delete_phase1a
  BEFORE DELETE ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.block_transaction_delete();

-- ------------------------------------------------------------------ settings
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS po_approval_threshold numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enable_alerts boolean NOT NULL DEFAULT true;

ALTER TABLE public.business_settings
  ALTER COLUMN discount_limit_percent SET DEFAULT 0;

-- ------------------------------------------------------- movement sign fix
CREATE OR REPLACE FUNCTION public.movement_sign(_type text)
 RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _type IN ('stock_in','purchase','return_in','adjustment_in','transfer_in','production','production_in','opening_balance') THEN 1
    WHEN _type IN ('stock_out','sale','return_out','adjustment_out','transfer_out','consumption','production_out','damage','waste') THEN -1
    ELSE 0 END;
$function$;

-- --------------------------------------------------- BOM cost uses real cost
CREATE OR REPLACE FUNCTION public.recalc_product_cost_from_bom(_product_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE b record; total numeric; out_qty numeric; bid uuid;
BEGIN
  SELECT business_id INTO bid FROM public.products WHERE id = _product_id;
  IF bid IS NULL THEN RETURN; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_business_member(bid) THEN
    RAISE EXCEPTION 'Not a member of this business';
  END IF;

  SELECT * INTO b FROM public.bill_of_materials
   WHERE product_id = _product_id ORDER BY created_at LIMIT 1;
  IF b.id IS NULL THEN RETURN; END IF;

  out_qty := GREATEST(COALESCE(b.output_quantity, 1), 0.000001);

  SELECT COALESCE(SUM(bi.quantity * COALESCE(NULLIF(p.average_cost, 0), p.cost_price, 0)), 0)
    INTO total
    FROM public.bom_items bi
    JOIN public.products p ON p.id = bi.component_product_id
   WHERE bi.bom_id = b.id;

  UPDATE public.products
     SET cost_price = ROUND(total / out_qty, 4),
         has_bom = true,
         updated_at = now()
   WHERE id = _product_id
     AND cost_price IS DISTINCT FROM ROUND(total / out_qty, 4);
END; $function$;

CREATE OR REPLACE FUNCTION public.product_cost_cascade()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE parent uuid;
BEGIN
  IF NEW.cost_price IS NOT DISTINCT FROM OLD.cost_price
     AND NEW.average_cost IS NOT DISTINCT FROM OLD.average_cost THEN
    RETURN NEW;
  END IF;
  FOR parent IN
    SELECT DISTINCT b.product_id FROM public.bom_items bi
      JOIN public.bill_of_materials b ON b.id = bi.bom_id
     WHERE bi.component_product_id = NEW.id AND b.product_id <> NEW.id
  LOOP
    PERFORM public.recalc_product_cost_from_bom(parent);
  END LOOP;
  RETURN NEW;
END; $function$;

-- ------------------------------------------- production uses default location
CREATE OR REPLACE FUNCTION public.produce_from_bom(_bom_id uuid, _batches numeric DEFAULT 1)
 RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  b public.bill_of_materials%ROWTYPE;
  it record;
  need numeric;
  avail numeric;
  out_qty numeric;
  cost_total numeric := 0;
  n integer := 0;
  wh uuid;
BEGIN
  IF COALESCE(_batches, 0) <= 0 THEN RAISE EXCEPTION 'Batches must be greater than zero'; END IF;

  SELECT * INTO b FROM public.bill_of_materials WHERE id = _bom_id;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Recipe not found'; END IF;
  IF NOT public.can_write_business(b.business_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;

  SELECT id INTO wh FROM public.warehouses
   WHERE business_id = b.business_id AND COALESCE(is_active, true)
   ORDER BY is_default DESC, created_at LIMIT 1;

  out_qty := COALESCE(b.output_quantity, 1) * _batches;
  IF out_qty <= 0 THEN RAISE EXCEPTION 'Output quantity must be greater than zero'; END IF;

  FOR it IN
    SELECT bi.component_product_id AS pid, bi.quantity AS qty, p.name,
           COALESCE(NULLIF(p.average_cost, 0), p.cost_price, 0) AS cost,
           COALESCE((SELECT SUM(ib.quantity) FROM public.inventory_balances ib
                      WHERE ib.product_id = bi.component_product_id), COALESCE(p.stock, 0)) AS on_hand
      FROM public.bom_items bi
      JOIN public.products p ON p.id = bi.component_product_id
     WHERE bi.bom_id = b.id
  LOOP
    n := n + 1;
    need := it.qty * _batches;
    avail := COALESCE(it.on_hand, 0);
    IF avail < need THEN
      RAISE EXCEPTION 'Not enough stock of %: % available, % needed', it.name, avail, need;
    END IF;
  END LOOP;

  IF n = 0 THEN RAISE EXCEPTION 'This recipe has no components'; END IF;

  FOR it IN
    SELECT bi.component_product_id AS pid, bi.quantity AS qty, p.name,
           COALESCE(NULLIF(p.average_cost, 0), p.cost_price, 0) AS cost
      FROM public.bom_items bi
      JOIN public.products p ON p.id = bi.component_product_id
     WHERE bi.bom_id = b.id
  LOOP
    need := it.qty * _batches;
    INSERT INTO public.inventory_movements
      (business_id, product_id, warehouse_id, type, quantity, base_quantity, unit_cost, total_cost,
       reference, reference_type, reference_id, movement_date, reason, notes, created_by)
    VALUES (b.business_id, it.pid, wh, 'consumption', need, need, it.cost, it.cost * need,
            b.name, 'production', b.id, CURRENT_DATE, 'Production - consumed',
            'Consumed by production run', auth.uid());
    cost_total := cost_total + (it.cost * need);
  END LOOP;

  INSERT INTO public.inventory_movements
    (business_id, product_id, warehouse_id, type, quantity, base_quantity, unit_cost, total_cost,
     reference, reference_type, reference_id, movement_date, reason, notes, created_by)
  VALUES (b.business_id, b.product_id, wh, 'production', out_qty, out_qty,
          ROUND(cost_total / out_qty, 4), cost_total,
          b.name, 'production', b.id, CURRENT_DATE, 'Production',
          'Produced from bill of materials', auth.uid());

  INSERT INTO public.audit_logs (business_id, user_id, action, module, record_id, new_value)
  VALUES (b.business_id, auth.uid(), 'production_run', 'inventory', b.name,
          jsonb_build_object('batches', _batches, 'output', out_qty, 'cost', cost_total));

  RETURN out_qty;
END; $function$;

-- --------------------------------------------------------------- alert core
CREATE OR REPLACE FUNCTION public.notify_business(
  _business_id uuid, _type text, _title text, _message text, _link text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE((SELECT enable_alerts FROM public.business_settings WHERE business_id = _business_id), true) THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.notifications n
              WHERE n.business_id = _business_id AND n.title = _title AND n.is_read = false) THEN
    RETURN;
  END IF;
  INSERT INTO public.notifications (business_id, type, title, message, link, is_read)
  VALUES (_business_id, _type, _title, _message, _link, false);
END; $function$;

REVOKE EXECUTE ON FUNCTION public.notify_business(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;

-- low stock alerts driven by the balance ledger
CREATE OR REPLACE FUNCTION public.alert_low_stock()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p record; on_hand numeric; threshold numeric; rule text; enabled boolean;
BEGIN
  SELECT enable_low_stock_alerts, low_stock_rule INTO enabled, rule
    FROM public.business_settings WHERE business_id = NEW.business_id;
  IF NOT COALESCE(enabled, true) THEN RETURN NEW; END IF;

  SELECT id, name, reorder_level, min_stock, status INTO p
    FROM public.products WHERE id = NEW.product_id;
  IF p.id IS NULL OR COALESCE(p.status, 'active') <> 'active' THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO on_hand
    FROM public.inventory_balances WHERE product_id = NEW.product_id;

  threshold := CASE WHEN rule = 'min_stock' THEN COALESCE(p.min_stock, 0)
                    ELSE COALESCE(p.reorder_level, 0) END;

  IF on_hand <= 0 THEN
    PERFORM public.notify_business(NEW.business_id, 'out_of_stock',
      p.name || ' is out of stock',
      'Reorder this product to avoid lost sales.', '/products');
  ELSIF threshold > 0 AND on_hand <= threshold THEN
    PERFORM public.notify_business(NEW.business_id, 'low_stock',
      p.name || ' is below reorder level',
      'Stock is ' || on_hand || ', reorder level is ' || threshold || '.', '/products');
  END IF;
  RETURN NEW;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.alert_low_stock() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS alert_low_stock_trg ON public.inventory_balances;
CREATE TRIGGER alert_low_stock_trg
AFTER INSERT OR UPDATE OF quantity ON public.inventory_balances
FOR EACH ROW EXECUTE FUNCTION public.alert_low_stock();

-- ------------------------------------------------ purchase order approvals
CREATE OR REPLACE FUNCTION public.enforce_po_approval()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  approval_statuses text[] := ARRAY['approved','ordered','partially_received','received','completed'];
  threshold numeric;
BEGIN
  SELECT COALESCE(po_approval_threshold, 0) INTO threshold
    FROM public.business_settings WHERE business_id = NEW.business_id;

  IF NEW.status = ANY(approval_statuses)
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF public.business_role(NEW.business_id) <> 'owner' THEN
      RAISE EXCEPTION 'Only the business owner can approve purchase orders';
    END IF;
    IF COALESCE(threshold, 0) > 0 AND COALESCE(NEW.total, 0) >= threshold
       AND NEW.status = 'approved'
       AND (TG_OP = 'INSERT' OR COALESCE(OLD.status, '') NOT IN ('pending_approval','approved')) THEN
      RAISE EXCEPTION 'Orders of % or more must be submitted for approval first', threshold;
    END IF;
    IF NEW.status = 'approved' THEN
      NEW.approved_by := auth.uid();
      NEW.approved_at := now();
    END IF;
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.alert_po_approval()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'pending_approval'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.notify_business(NEW.business_id, 'approval_pending',
      'Purchase order ' || NEW.po_number || ' needs approval',
      'Total ' || COALESCE(NEW.total, 0) || '. Review and approve to send it to the supplier.',
      '/purchase-orders');
  END IF;
  RETURN NEW;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.alert_po_approval() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS alert_po_approval_trg ON public.purchase_orders;
CREATE TRIGGER alert_po_approval_trg
AFTER INSERT OR UPDATE OF status ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.alert_po_approval();

-- --------------------------------------------------- large discount control
CREATE OR REPLACE FUNCTION public.enforce_discount_limit()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE limit_pct numeric; gross numeric; pct numeric; r app_role;
BEGIN
  SELECT COALESCE(discount_limit_percent, 0) INTO limit_pct
    FROM public.business_settings WHERE business_id = NEW.business_id;
  IF COALESCE(limit_pct, 0) <= 0 THEN RETURN NEW; END IF;

  gross := COALESCE(NEW.subtotal, 0) + COALESCE(NEW.discount, 0);
  IF gross <= 0 THEN RETURN NEW; END IF;
  pct := (COALESCE(NEW.discount, 0) / gross) * 100;
  IF pct <= limit_pct + 0.0001 THEN RETURN NEW; END IF;

  r := public.business_role(NEW.business_id);
  IF r IS NULL OR r NOT IN ('owner','admin','manager') THEN
    RAISE EXCEPTION 'Discounts above %%% need manager approval (this one is %%%)',
      ROUND(limit_pct, 2), ROUND(pct, 2);
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS enforce_discount_limit_trg ON public.sales;
CREATE TRIGGER enforce_discount_limit_trg
BEFORE INSERT OR UPDATE OF discount, subtotal ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.enforce_discount_limit();

-- --------------------------------------------------- automatic status rules
CREATE OR REPLACE FUNCTION public.sync_invoice_status()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(NEW.status, '') IN ('cancelled','voided','draft') THEN RETURN NEW; END IF;
  IF COALESCE(NEW.paid, 0) + 0.009 >= COALESCE(NEW.total, 0) AND COALESCE(NEW.total, 0) > 0 THEN
    NEW.status := 'paid';
  ELSIF COALESCE(NEW.paid, 0) > 0.009 THEN
    NEW.status := 'partially_paid';
  ELSIF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
    NEW.status := 'overdue';
  ELSE
    NEW.status := 'unpaid';
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS sync_invoice_status_trg ON public.invoices;
CREATE TRIGGER sync_invoice_status_trg
BEFORE INSERT OR UPDATE OF paid, total, due_date ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_status();

CREATE OR REPLACE FUNCTION public.sync_ledger_status()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(NEW.status, '') IN ('cancelled','written_off') THEN RETURN NEW; END IF;
  IF COALESCE(NEW.paid, 0) + 0.009 >= COALESCE(NEW.amount, 0) THEN
    NEW.status := 'paid';
  ELSIF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
    NEW.status := 'overdue';
  ELSE
    NEW.status := 'open';
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS sync_ar_status_trg ON public.accounts_receivable;
CREATE TRIGGER sync_ar_status_trg
BEFORE INSERT OR UPDATE OF paid, amount, due_date ON public.accounts_receivable
FOR EACH ROW EXECUTE FUNCTION public.sync_ledger_status();

DROP TRIGGER IF EXISTS sync_ap_status_trg ON public.accounts_payable;
CREATE TRIGGER sync_ap_status_trg
BEFORE INSERT OR UPDATE OF paid, amount, due_date ON public.accounts_payable
FOR EACH ROW EXECUTE FUNCTION public.sync_ledger_status();

-- ------------------------------------------------------------- alert sweep
CREATE OR REPLACE FUNCTION public.scan_business_alerts(_business_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE before_count integer; r record; rule text;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not a member of this business';
  END IF;

  SELECT COUNT(*) INTO before_count FROM public.notifications WHERE business_id = _business_id;
  SELECT low_stock_rule INTO rule FROM public.business_settings WHERE business_id = _business_id;

  FOR r IN
    SELECT p.name,
           COALESCE((SELECT SUM(ib.quantity) FROM public.inventory_balances ib WHERE ib.product_id = p.id),
                    COALESCE(p.stock, 0)) AS on_hand,
           CASE WHEN rule = 'min_stock' THEN COALESCE(p.min_stock, 0) ELSE COALESCE(p.reorder_level, 0) END AS threshold
      FROM public.products p
     WHERE p.business_id = _business_id AND COALESCE(p.status, 'active') = 'active'
  LOOP
    IF r.on_hand <= 0 THEN
      PERFORM public.notify_business(_business_id, 'out_of_stock', r.name || ' is out of stock',
        'Reorder this product to avoid lost sales.', '/products');
    ELSIF r.threshold > 0 AND r.on_hand <= r.threshold THEN
      PERFORM public.notify_business(_business_id, 'low_stock', r.name || ' is below reorder level',
        'Stock is ' || r.on_hand || ', reorder level is ' || r.threshold || '.', '/products');
    END IF;
  END LOOP;

  FOR r IN
    SELECT invoice_number, due_date, (COALESCE(total,0) - COALESCE(paid,0)) AS outstanding
      FROM public.invoices
     WHERE business_id = _business_id AND due_date < CURRENT_DATE
       AND COALESCE(status,'') NOT IN ('cancelled','paid','draft')
       AND COALESCE(paid,0) + 0.009 < COALESCE(total,0)
  LOOP
    PERFORM public.notify_business(_business_id, 'invoice_due',
      'Invoice ' || r.invoice_number || ' is overdue',
      'Outstanding ' || ROUND(r.outstanding, 2) || ' since ' || r.due_date || '.', '/invoices');
  END LOOP;

  FOR r IN
    SELECT COALESCE(c.name, 'A customer') AS who, ar.due_date,
           (COALESCE(ar.amount,0) - COALESCE(ar.paid,0)) AS outstanding
      FROM public.accounts_receivable ar
      LEFT JOIN public.customers c ON c.id = ar.customer_id
     WHERE ar.business_id = _business_id AND ar.due_date < CURRENT_DATE
       AND COALESCE(ar.paid,0) + 0.009 < COALESCE(ar.amount,0)
  LOOP
    PERFORM public.notify_business(_business_id, 'debt_due',
      r.who || ' has an overdue balance',
      'Outstanding ' || ROUND(r.outstanding, 2) || ' since ' || r.due_date || '.', '/receivables');
  END LOOP;

  FOR r IN
    SELECT COALESCE(s.name, 'A supplier') AS who, ap.due_date,
           (COALESCE(ap.amount,0) - COALESCE(ap.paid,0)) AS outstanding
      FROM public.accounts_payable ap
      LEFT JOIN public.suppliers s ON s.id = ap.supplier_id
     WHERE ap.business_id = _business_id AND ap.due_date < CURRENT_DATE
       AND COALESCE(ap.paid,0) + 0.009 < COALESCE(ap.amount,0)
  LOOP
    PERFORM public.notify_business(_business_id, 'payable_due',
      'Supplier bill to ' || r.who || ' is overdue',
      'Outstanding ' || ROUND(r.outstanding, 2) || ' since ' || r.due_date || '.', '/payables');
  END LOOP;

  FOR r IN
    SELECT po_number, total FROM public.purchase_orders
     WHERE business_id = _business_id AND status = 'pending_approval'
  LOOP
    PERFORM public.notify_business(_business_id, 'approval_pending',
      'Purchase order ' || r.po_number || ' needs approval',
      'Total ' || COALESCE(r.total, 0) || '. Review and approve to send it to the supplier.',
      '/purchase-orders');
  END LOOP;

  RETURN (SELECT COUNT(*) FROM public.notifications WHERE business_id = _business_id) - before_count;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.scan_business_alerts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scan_business_alerts(uuid) TO authenticated, service_role;
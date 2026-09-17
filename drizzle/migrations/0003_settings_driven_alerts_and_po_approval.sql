-- Business "today" in the configured timezone: every date-based rule uses this.
CREATE OR REPLACE FUNCTION public.business_today(_business_id uuid)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT (now() AT TIME ZONE COALESCE(NULLIF(b.timezone, ''), 'UTC'))::date
    FROM public.businesses b WHERE b.id = _business_id;
$function$;

-- Low stock comparison honouring the configured rule.
--   reorder_level : on hand <= reorder level
--   min_stock     : on hand <= minimum stock
--   zero          : never (out of stock only)
CREATE OR REPLACE FUNCTION public.low_stock_threshold(_rule text, _reorder numeric, _min numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    WHEN _rule = 'zero' THEN 0
    WHEN _rule = 'min_stock' THEN COALESCE(_min, 0)
    ELSE COALESCE(_reorder, 0)
  END;
$function$;

CREATE OR REPLACE FUNCTION public.alert_low_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE p record; on_hand numeric; threshold numeric; rule text; enabled boolean; qty boolean;
BEGIN
  SELECT enable_low_stock_alerts, low_stock_rule, track_quantity
    INTO enabled, rule, qty
    FROM public.business_settings WHERE business_id = NEW.business_id;
  -- Capability gate: quantity tracking is a hard prerequisite for stock alerts.
  IF NOT COALESCE(enabled, true) OR NOT COALESCE(qty, true) THEN RETURN NEW; END IF;

  SELECT id, name, reorder_level, min_stock, status INTO p
    FROM public.products WHERE id = NEW.product_id;
  IF p.id IS NULL OR COALESCE(p.status, 'active') <> 'active' THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO on_hand
    FROM public.inventory_balances WHERE product_id = NEW.product_id;

  threshold := public.low_stock_threshold(rule, p.reorder_level, p.min_stock);

  IF on_hand <= 0 THEN
    PERFORM public.notify_business(NEW.business_id, 'out_of_stock',
      p.name || ' is out of stock',
      'Reorder this product to avoid lost sales.', '/products');
  ELSIF threshold > 0 AND on_hand <= threshold THEN
    PERFORM public.notify_business(NEW.business_id, 'low_stock',
      p.name || ' is running low',
      'Stock is ' || on_hand || ', alert level is ' || threshold || '.', '/products');
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.scan_business_alerts(_business_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  before_count integer;
  r record;
  s record;
  today date;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not a member of this business';
  END IF;

  SELECT COUNT(*) INTO before_count FROM public.notifications WHERE business_id = _business_id;

  SELECT COALESCE(enable_alerts, true) AS enable_alerts,
         COALESCE(enable_low_stock_alerts, true) AS low_stock,
         COALESCE(track_quantity, true) AS qty,
         COALESCE(track_expiry, false) AS expiry,
         COALESCE(enable_purchasing, true) AS purchasing,
         COALESCE(enable_sales, true) AS sales,
         COALESCE(low_stock_rule, 'reorder_level') AS rule,
         COALESCE(expiry_alert_days, 30) AS expiry_days
    INTO s
    FROM public.business_settings WHERE business_id = _business_id;

  IF s IS NULL THEN
    s := ROW(true, true, true, false, true, true, 'reorder_level', 30);
  END IF;
  IF NOT s.enable_alerts THEN RETURN 0; END IF;

  today := COALESCE(public.business_today(_business_id), CURRENT_DATE);

  -- Stock alerts (needs quantity tracking + the low-stock capability).
  IF s.qty AND s.low_stock THEN
    FOR r IN
      SELECT p.name,
             COALESCE((SELECT SUM(ib.quantity) FROM public.inventory_balances ib WHERE ib.product_id = p.id),
                      COALESCE(p.stock, 0)) AS on_hand,
             public.low_stock_threshold(s.rule, p.reorder_level, p.min_stock) AS threshold
        FROM public.products p
       WHERE p.business_id = _business_id AND COALESCE(p.status, 'active') = 'active'
    LOOP
      IF r.on_hand <= 0 THEN
        PERFORM public.notify_business(_business_id, 'out_of_stock', r.name || ' is out of stock',
          'Reorder this product to avoid lost sales.', '/products');
      ELSIF r.threshold > 0 AND r.on_hand <= r.threshold THEN
        PERFORM public.notify_business(_business_id, 'low_stock', r.name || ' is running low',
          'Stock is ' || r.on_hand || ', alert level is ' || r.threshold || '.', '/products');
      END IF;
    END LOOP;
  END IF;

  -- Expiry alerts (needs the expiry capability; uses the configured window).
  IF s.expiry THEN
    FOR r IN
      SELECT b.batch_number, b.expiry_date, p.name AS product_name,
             (b.expiry_date - today) AS days_left
        FROM public.batches b
        JOIN public.products p ON p.id = b.product_id
       WHERE b.business_id = _business_id
         AND b.expiry_date IS NOT NULL
         AND COALESCE(b.remaining_quantity, b.quantity, 0) > 0
         AND COALESCE(b.status, 'active') <> 'consumed'
         AND b.expiry_date <= today + s.expiry_days
    LOOP
      IF r.days_left < 0 THEN
        PERFORM public.notify_business(_business_id, 'expired',
          r.product_name || ' batch ' || COALESCE(r.batch_number, '—') || ' has expired',
          'Expired on ' || r.expiry_date || '. Remove it from sellable stock.', '/batches');
      ELSE
        PERFORM public.notify_business(_business_id, 'expiring',
          r.product_name || ' batch ' || COALESCE(r.batch_number, '—') || ' expires soon',
          r.days_left || ' day(s) remaining (expires ' || r.expiry_date || ').', '/batches');
      END IF;
    END LOOP;
  END IF;

  -- Receivables / invoices (sales capability).
  IF s.sales THEN
    FOR r IN
      SELECT invoice_number, due_date, (COALESCE(total,0) - COALESCE(paid,0)) AS outstanding
        FROM public.invoices
       WHERE business_id = _business_id AND due_date < today
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
       WHERE ar.business_id = _business_id AND ar.due_date < today
         AND COALESCE(ar.paid,0) + 0.009 < COALESCE(ar.amount,0)
    LOOP
      PERFORM public.notify_business(_business_id, 'debt_due',
        r.who || ' has an overdue balance',
        'Outstanding ' || ROUND(r.outstanding, 2) || ' since ' || r.due_date || '.', '/receivables');
    END LOOP;
  END IF;

  -- Payables and approvals (purchasing capability).
  IF s.purchasing THEN
    FOR r IN
      SELECT COALESCE(sp.name, 'A supplier') AS who, ap.due_date,
             (COALESCE(ap.amount,0) - COALESCE(ap.paid,0)) AS outstanding
        FROM public.accounts_payable ap
        LEFT JOIN public.suppliers sp ON sp.id = ap.supplier_id
       WHERE ap.business_id = _business_id AND ap.due_date < today
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
  END IF;

  RETURN (SELECT COUNT(*) FROM public.notifications WHERE business_id = _business_id) - before_count;
END; $function$;

-- Purchase order approval threshold, with documented behaviour:
--   threshold = 0  -> approval step disabled; an owner may approve/order directly.
--   threshold > 0  -> orders whose total reaches the threshold MUST pass through
--                     'pending_approval' before they can be approved or received.
CREATE OR REPLACE FUNCTION public.enforce_po_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

    IF COALESCE(threshold, 0) > 0
       AND COALESCE(NEW.total, 0) >= threshold
       AND (TG_OP = 'INSERT' OR COALESCE(OLD.status, '') NOT IN ('pending_approval','approved','ordered','partially_received','received','completed'))
    THEN
      RAISE EXCEPTION 'Orders of % or more must be submitted for approval first', threshold;
    END IF;

    IF NEW.status = 'approved' THEN
      NEW.approved_by := auth.uid();
      NEW.approved_at := now();
    END IF;
  END IF;
  RETURN NEW;
END; $function$;

REVOKE ALL ON FUNCTION public.business_today(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.low_stock_threshold(text, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_today(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.low_stock_threshold(text, numeric, numeric) TO authenticated;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_business_order_date
  ON public.purchase_orders (business_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_business_date
  ON public.cash_transactions (business_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_sale_payments_business_paid_at
  ON public.sale_payments (business_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_business_date
  ON public.inventory_movements (business_id, movement_date DESC);

CREATE OR REPLACE FUNCTION public.get_business_earliest_transaction_date(_business_id uuid)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  earliest date;
  business_timezone text;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not a member of this business';
  END IF;

  SELECT COALESCE(NULLIF(b.timezone, ''), 'Asia/Manila')
    INTO business_timezone
    FROM public.businesses b
   WHERE b.id = _business_id;

  SELECT MIN(transaction_date)
    INTO earliest
    FROM (
      SELECT s.sale_date AS transaction_date
        FROM public.sales s
       WHERE s.business_id = _business_id
      UNION ALL
      SELECT po.order_date
        FROM public.purchase_orders po
       WHERE po.business_id = _business_id
      UNION ALL
      SELECT e.expense_date
        FROM public.expenses e
       WHERE e.business_id = _business_id
      UNION ALL
      SELECT ct.transaction_date
        FROM public.cash_transactions ct
       WHERE ct.business_id = _business_id
      UNION ALL
      SELECT (sp.paid_at AT TIME ZONE business_timezone)::date
        FROM public.sale_payments sp
       WHERE sp.business_id = _business_id
    ) dates;

  RETURN earliest;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_business_period_aggregate(
  _business_id uuid,
  _from timestamptz,
  _to timestamptz,
  _timezone text DEFAULT 'Asia/Manila',
  _bucket text DEFAULT 'day'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  tz text := COALESCE(NULLIF(_timezone, ''), 'Asia/Manila');
BEGIN
  IF NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not a member of this business';
  END IF;
  IF _from IS NULL OR _to IS NULL OR _to < _from THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;
  IF _bucket NOT IN ('day', 'week', 'month') THEN
    RAISE EXCEPTION 'Invalid bucket';
  END IF;

  WITH sales AS (
    SELECT s.*
      FROM public.sales s
     WHERE s.business_id = _business_id
       AND (s.sale_date::timestamp AT TIME ZONE tz) BETWEEN _from AND _to
       AND COALESCE(s.status, '') NOT IN ('draft', 'voided', 'cancelled', 'rejected', 'expired')
       AND COALESCE(s.document_type, '') NOT IN ('quote', 'sales_order')
       AND (
         COALESCE(s.document_type, '') <> 'pos_sale'
         OR (s.inventory_posted = true AND s.status = 'completed')
       )
  ),
  expenses AS (
    SELECT e.*
      FROM public.expenses e
     WHERE e.business_id = _business_id
       AND (e.expense_date::timestamp AT TIME ZONE tz) BETWEEN _from AND _to
  ),
  purchases AS (
    SELECT po.*
      FROM public.purchase_orders po
     WHERE po.business_id = _business_id
       AND (po.order_date::timestamp AT TIME ZONE tz) BETWEEN _from AND _to
       AND COALESCE(po.status, '') NOT IN ('draft', 'cancelled', 'rejected')
  ),
  facts AS (
    SELECT date_trunc(_bucket, s.sale_date::timestamp)::date AS bucket_date,
           'sales'::text AS kind,
           COALESCE(SUM(
             (s.total - s.tax - COALESCE(s.shipping, 0) - COALESCE(s.other_charges, 0))
             * CASE WHEN COALESCE(s.document_type, '') = 'return' THEN -1 ELSE 1 END
           ), 0)::numeric AS amount
      FROM sales s
     GROUP BY 1
    UNION ALL
    SELECT date_trunc(_bucket, e.expense_date::timestamp)::date,
           'expenses',
           COALESCE(SUM(e.amount), 0)::numeric
      FROM expenses e
     GROUP BY 1
    UNION ALL
    SELECT date_trunc(_bucket, po.order_date::timestamp)::date,
           'purchases',
           COALESCE(SUM(po.total), 0)::numeric
      FROM purchases po
     GROUP BY 1
  ),
  buckets AS (
    SELECT bucket_date,
           SUM(amount) FILTER (WHERE kind = 'sales') AS sales,
           SUM(amount) FILTER (WHERE kind = 'expenses') AS expenses,
           SUM(amount) FILTER (WHERE kind = 'purchases') AS purchases
      FROM facts
     GROUP BY bucket_date
  ),
  item_sales AS (
    SELECT si.product_id,
           si.variant_id,
           COALESCE(MAX(si.product_name), MAX(p.name), 'Unknown') AS item,
           COALESCE(MAX(si.sku), MAX(p.sku), '') AS sku,
           COALESCE(SUM(si.returned_quantity), 0) AS quantity_returned,
           COALESCE(SUM(si.quantity - COALESCE(si.returned_quantity, 0)), 0) AS quantity,
           COALESCE(SUM(
             si.unit_price * (si.quantity - COALESCE(si.returned_quantity, 0))
           ), 0) AS revenue,
           COALESCE(SUM(si.unit_cost * (si.quantity - COALESCE(si.returned_quantity, 0))), 0) AS cogs
      FROM public.sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN public.products p ON p.id = si.product_id
     WHERE COALESCE(s.document_type, '') NOT IN ('quote', 'sales_order', 'return')
     GROUP BY si.product_id, si.variant_id
  ),
  expense_categories AS (
    SELECT COALESCE(category, 'other') AS category, SUM(amount) AS amount
      FROM expenses
     GROUP BY COALESCE(category, 'other')
  ),
  customer_sales AS (
    SELECT s.customer_id, COALESCE(MAX(c.name), 'Unknown') AS name,
           SUM((s.total - s.tax - COALESCE(s.shipping, 0) - COALESCE(s.other_charges, 0))
             * CASE WHEN COALESCE(s.document_type, '') = 'return' THEN -1 ELSE 1 END) AS amount
      FROM sales s
      LEFT JOIN public.customers c ON c.id = s.customer_id
     WHERE s.customer_id IS NOT NULL
     GROUP BY s.customer_id
  ),
  sales_report_rows AS (
    SELECT sale_date, COALESCE(document_type, 'sale') AS document_type,
           COUNT(*) AS transactions,
           SUM(total) AS total,
           SUM(tax) AS tax,
           SUM(discount) AS discount
      FROM sales
     GROUP BY sale_date, COALESCE(document_type, 'sale')
  ),
  expense_report_rows AS (
    SELECT expense_date, COALESCE(category, 'other') AS category,
           COUNT(*) AS entries, SUM(amount) AS amount
      FROM expenses
     GROUP BY expense_date, COALESCE(category, 'other')
  ),
  purchase_item_totals AS (
    SELECT poi.product_id, poi.variant_id,
           COALESCE(MAX(p.name), 'Unknown') AS item,
           COALESCE(MAX(v.name), '') AS variant,
           COALESCE(MAX(v.sku), MAX(p.sku), '') AS sku,
           SUM(poi.received_quantity) AS quantity_received,
           SUM(poi.received_quantity * poi.unit_cost) AS purchase_value
      FROM public.purchase_order_items poi
      JOIN purchases po ON po.id = poi.purchase_order_id
      LEFT JOIN public.products p ON p.id = poi.product_id
      LEFT JOIN public.product_variants v ON v.id = poi.variant_id
     GROUP BY poi.product_id, poi.variant_id
  ),
  purchase_return_totals AS (
    SELECT pri.product_id, pri.variant_id,
           SUM(pri.quantity) AS quantity_returned,
           SUM(pri.total) AS return_value
      FROM public.purchase_return_items pri
      JOIN public.purchase_returns pr ON pr.id = pri.return_id
     WHERE pr.business_id = _business_id
       AND pr.status = 'posted'
       AND (pr.return_date::timestamp AT TIME ZONE tz) BETWEEN _from AND _to
     GROUP BY pri.product_id, pri.variant_id
  ),
  purchase_report_rows AS (
    SELECT pt.product_id, pt.variant_id, pt.item, pt.variant, pt.sku,
           pt.quantity_received,
           COALESCE(rt.quantity_returned, 0) AS quantity_returned,
           pt.purchase_value - COALESCE(rt.return_value, 0) AS purchase_value
      FROM purchase_item_totals pt
      LEFT JOIN purchase_return_totals rt
        ON rt.product_id = pt.product_id AND rt.variant_id IS NOT DISTINCT FROM pt.variant_id
  ),
  movement_report_rows AS (
    SELECT im.product_id, im.variant_id, im.type,
           COALESCE(MAX(p.name), 'Unknown') AS item,
           COALESCE(MAX(v.name), '') AS variant,
           SUM(im.quantity) AS quantity,
           AVG(im.unit_cost) AS unit_cost,
           SUM(im.total_cost) AS total_cost,
           COUNT(*) AS movements
      FROM public.inventory_movements im
      LEFT JOIN public.products p ON p.id = im.product_id
      LEFT JOIN public.product_variants v ON v.id = im.variant_id
     WHERE im.business_id = _business_id
       AND (im.movement_date::timestamp AT TIME ZONE tz) BETWEEN _from AND _to
     GROUP BY im.product_id, im.variant_id, im.type
  ),
  payroll_report_rows AS (
    SELECT period_start, period_end, status, COUNT(*) AS pay_runs,
           SUM(net_pay) AS net_pay
      FROM public.payroll
     WHERE business_id = _business_id
       AND (period_end::timestamp AT TIME ZONE tz) BETWEEN _from AND _to
     GROUP BY period_start, period_end, status
  )
  SELECT jsonb_build_object(
    'sales', jsonb_build_object(
      'count', (SELECT COUNT(*) FROM sales WHERE COALESCE(document_type, '') <> 'return'),
      'customer_count', (SELECT COUNT(DISTINCT customer_id) FROM sales WHERE customer_id IS NOT NULL),
      'revenue', COALESCE((SELECT SUM((total - tax - COALESCE(shipping, 0) - COALESCE(other_charges, 0))
        * CASE WHEN COALESCE(document_type, '') = 'return' THEN -1 ELSE 1 END) FROM sales), 0),
      'gross_sales', COALESCE((SELECT SUM(total * CASE WHEN COALESCE(document_type, '') = 'return' THEN -1 ELSE 1 END) FROM sales), 0),
      'tax', COALESCE((SELECT SUM(tax * CASE WHEN COALESCE(document_type, '') = 'return' THEN -1 ELSE 1 END) FROM sales), 0),
      'discount', COALESCE((SELECT SUM(discount * CASE WHEN COALESCE(document_type, '') = 'return' THEN -1 ELSE 1 END) FROM sales), 0),
      'cogs', COALESCE((SELECT SUM(cost_total * CASE WHEN COALESCE(document_type, '') = 'return' THEN -1 ELSE 1 END) FROM sales), 0)
    ),
    'expenses', jsonb_build_object(
      'count', (SELECT COUNT(*) FROM expenses),
      'total', COALESCE((SELECT SUM(amount) FROM expenses), 0)
    ),
    'purchases', jsonb_build_object(
      'count', (SELECT COUNT(*) FROM purchases),
      'total', COALESCE((SELECT SUM(total) FROM purchases), 0)
    ),
    'series', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'date', bucket_date,
        'sales', COALESCE(sales, 0),
        'expenses', COALESCE(expenses, 0),
        'purchases', COALESCE(purchases, 0)
      ) ORDER BY bucket_date)
        FROM buckets
    ), '[]'::jsonb)
  )
  || jsonb_build_object(
      'top_items', COALESCE((
        SELECT jsonb_agg(to_jsonb(r))
          FROM (SELECT item, quantity, revenue FROM item_sales ORDER BY revenue DESC LIMIT 5) r
      ), '[]'::jsonb),
      'expense_categories', COALESCE((
        SELECT jsonb_agg(to_jsonb(r))
          FROM (SELECT category, amount FROM expense_categories ORDER BY amount DESC) r
      ), '[]'::jsonb),
      'top_customers', COALESCE((
        SELECT jsonb_agg(to_jsonb(r))
          FROM (SELECT name, amount FROM customer_sales ORDER BY amount DESC LIMIT 5) r
      ), '[]'::jsonb),
      'sales_report_rows', COALESCE((
        SELECT jsonb_agg(to_jsonb(r) ORDER BY sale_date)
          FROM sales_report_rows r
      ), '[]'::jsonb),
      'expense_report_rows', COALESCE((
        SELECT jsonb_agg(to_jsonb(r) ORDER BY expense_date)
          FROM expense_report_rows r
      ), '[]'::jsonb),
      'item_report_rows', COALESCE((
        SELECT jsonb_agg(to_jsonb(r) ORDER BY revenue DESC)
          FROM item_sales r
      ), '[]'::jsonb),
      'purchase_report_rows', COALESCE((
        SELECT jsonb_agg(to_jsonb(r) ORDER BY purchase_value DESC)
          FROM purchase_report_rows r
      ), '[]'::jsonb),
      'movement_report_rows', COALESCE((
        SELECT jsonb_agg(to_jsonb(r) ORDER BY total_cost DESC)
          FROM movement_report_rows r
      ), '[]'::jsonb),
      'payroll_report_rows', COALESCE((
        SELECT jsonb_agg(to_jsonb(r) ORDER BY period_end DESC)
          FROM payroll_report_rows r
      ), '[]'::jsonb)
    )
    INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_business_earliest_transaction_date(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_business_period_aggregate(uuid, timestamptz, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_earliest_transaction_date(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_period_aggregate(uuid, timestamptz, timestamptz, text, text) TO authenticated;

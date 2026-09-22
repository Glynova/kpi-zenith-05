create or replace function public.post_sales_return(_return_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  r public.sales%ROWTYPE; it record; cost numeric; total_cogs numeric := 0; sold numeric; already numeric;
  bnum text; resellable boolean;
BEGIN
  SELECT * INTO r FROM public.sales WHERE id = _return_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Return not found'; END IF;
  IF NOT public.can_write_business(r.business_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF r.inventory_posted THEN RAISE EXCEPTION 'This return was already posted'; END IF;

  PERFORM public.require_capability(r.business_id, 'enable_returns', 'Sales returns');

  FOR it IN SELECT si.*, p.inventory_model FROM public.sale_items si
              JOIN public.products p ON p.id = si.product_id WHERE si.sale_id = _return_id LOOP
    IF it.quantity <= 0 THEN RAISE EXCEPTION 'Return quantity must be positive'; END IF;

    IF r.original_sale_id IS NOT NULL THEN
      SELECT COALESCE(SUM(quantity),0), COALESCE(SUM(returned_quantity),0) INTO sold, already
        FROM public.sale_items WHERE sale_id = r.original_sale_id AND product_id = it.product_id
          AND variant_id IS NOT DISTINCT FROM it.variant_id;
      IF it.quantity + already > sold THEN
        RAISE EXCEPTION 'Cannot return more than was sold (sold %, already returned %)', sold, already;
      END IF;
      UPDATE public.sale_items SET returned_quantity = COALESCE(returned_quantity,0) + it.quantity
       WHERE sale_id = r.original_sale_id AND product_id = it.product_id
         AND variant_id IS NOT DISTINCT FROM it.variant_id;
    END IF;

    CONTINUE WHEN it.inventory_model IN ('service','non_stock','digital');

    PERFORM public.validate_return_identity(r.business_id, it.product_id, it.variant_id,
      r.location_id, it.batch_id, it.serial_ids, it.quantity, 'Return line');

    cost := COALESCE(NULLIF(it.unit_cost, 0),
      (SELECT COALESCE(average_cost, cost_price, 0) FROM public.products WHERE id = it.product_id));

    resellable := COALESCE(it.condition, 'resellable') = 'resellable';
    bnum := NULL;
    IF it.batch_id IS NOT NULL THEN
      SELECT batch_number INTO bnum FROM public.batches WHERE id = it.batch_id;
      IF resellable THEN
        UPDATE public.batches
           SET remaining_quantity = COALESCE(remaining_quantity,0) + it.quantity, updated_at = now()
         WHERE id = it.batch_id;
      END IF;
    END IF;

    IF it.serial_ids IS NOT NULL THEN
      UPDATE public.serial_numbers
         SET status = CASE WHEN resellable THEN 'returned' ELSE 'written_off' END,
             warehouse_id = CASE WHEN resellable THEN r.location_id ELSE NULL END,
             updated_at = now()
       WHERE id = ANY(it.serial_ids) AND business_id = r.business_id;
    END IF;

    INSERT INTO public.inventory_movements
      (business_id, product_id, variant_id, warehouse_id, batch_id, batch_number, type, quantity, base_quantity,
       unit_cost, total_cost, reference, reference_type, reference_id, movement_date, reason, created_by)
    VALUES (r.business_id, it.product_id, it.variant_id, r.location_id, it.batch_id, bnum, 'return_in', it.quantity, it.quantity,
            cost, cost * it.quantity, r.sale_number, 'sales_return', r.id, r.sale_date,
            COALESCE(it.condition, 'resellable'), COALESCE(r.created_by, auth.uid()));
    total_cogs := total_cogs + (cost * it.quantity);

    IF NOT resellable THEN
      INSERT INTO public.inventory_movements
        (business_id, product_id, variant_id, warehouse_id, batch_id, batch_number, type, quantity, base_quantity,
         unit_cost, total_cost, reference, reference_type, reference_id, movement_date, reason, created_by)
      VALUES (r.business_id, it.product_id, it.variant_id, r.location_id, it.batch_id, bnum, 'damage', it.quantity, it.quantity,
              cost, cost * it.quantity, r.sale_number, 'sales_return', r.id, r.sale_date,
              it.condition, COALESCE(r.created_by, auth.uid()));
    END IF;
  END LOOP;

  UPDATE public.sales SET inventory_posted = true, posted_at = now(), status = 'completed',
         cost_total = -total_cogs, updated_at = now() WHERE id = r.id;

  IF r.original_sale_id IS NOT NULL AND r.total > 0 THEN
    UPDATE public.accounts_receivable ar
       SET amount = GREATEST(ar.amount - r.total, 0), updated_at = now()
     WHERE ar.sale_id = r.original_sale_id AND ar.status <> 'paid';
  END IF;

  INSERT INTO public.audit_logs (business_id, user_id, action, module, record_id, new_value)
  VALUES (r.business_id, auth.uid(), 'sales_return', 'sales', r.sale_number,
          jsonb_build_object('total', r.total, 'cogs_reversed', total_cogs));
END; $function$;

revoke all on function public.post_sales_return(uuid) from public, anon;
grant execute on function public.post_sales_return(uuid) to authenticated, service_role;
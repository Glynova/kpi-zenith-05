CREATE OR REPLACE FUNCTION public.produce_made_from(_product_id uuid, _quantity numeric)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p public.products%ROWTYPE; it record; need numeric; cost_total numeric := 0; n integer := 0; wh uuid;
BEGIN
  IF COALESCE(_quantity, 0) <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
  SELECT * INTO p FROM public.products WHERE id = _product_id FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF NOT public.can_write_business(p.business_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF p.consumption_mode <> 'on_production' THEN RAISE EXCEPTION 'This item is made when sold, not in batches'; END IF;
  wh := COALESCE(p.default_location_id, (SELECT w.id FROM public.warehouses w WHERE w.business_id = p.business_id AND COALESCE(w.is_active, true) ORDER BY w.is_default DESC, w.created_at LIMIT 1));
  FOR it IN
    SELECT bc.component_product_id AS pid, bc.variant_id AS vid, c.name, c.unit,
           bc.quantity * (1 + bc.waste_percent / 100) / p.output_quantity AS per_unit,
           COALESCE((SELECT SUM(ib.quantity) FROM public.inventory_balances ib
                      WHERE ib.product_id = bc.component_product_id AND ib.variant_id IS NOT DISTINCT FROM bc.variant_id
                        AND ib.warehouse_id IS NOT DISTINCT FROM wh), 0) AS on_hand
      FROM public.bundle_components bc JOIN public.products c ON c.id = bc.component_product_id
     WHERE bc.bundle_product_id = p.id
  LOOP
    n := n + 1; need := ROUND(it.per_unit * _quantity, 4);
    IF it.on_hand < need THEN RAISE EXCEPTION 'Not enough %: short by % %', it.name, ROUND(need - it.on_hand, 4), COALESCE(it.unit, ''); END IF;
  END LOOP;
  IF n = 0 THEN RAISE EXCEPTION 'This item has no components'; END IF;
  FOR it IN
    SELECT bc.component_product_id AS pid, bc.variant_id AS vid, c.unit,
           bc.quantity * (1 + bc.waste_percent / 100) / p.output_quantity AS per_unit,
           COALESCE(NULLIF(b.average_cost, 0), NULLIF(v.cost_price, 0), CASE WHEN bc.variant_id IS NULL THEN COALESCE(NULLIF(c.average_cost, 0), c.cost_price) END, 0) AS cost
      FROM public.bundle_components bc JOIN public.products c ON c.id = bc.component_product_id
      LEFT JOIN public.product_variants v ON v.id = bc.variant_id
      LEFT JOIN public.inventory_balances b ON b.product_id = c.id AND b.variant_id IS NOT DISTINCT FROM bc.variant_id AND b.warehouse_id IS NOT DISTINCT FROM wh
     WHERE bc.bundle_product_id = p.id
  LOOP
    need := ROUND(it.per_unit * _quantity, 4);
    INSERT INTO public.inventory_movements (business_id, product_id, variant_id, warehouse_id, type, quantity, base_quantity, unit, unit_cost, total_cost, reference, reference_type, reference_id, movement_date, reason, notes, created_by)
    VALUES (p.business_id, it.pid, it.vid, wh, 'consumption', need, need, it.unit, it.cost, it.cost * need, p.name, 'production', p.id, CURRENT_DATE, 'Production - consumed', 'Used to make ' || p.name, auth.uid());
    cost_total := cost_total + it.cost * need;
  END LOOP;
  cost_total := cost_total + (p.labor_hours * p.labor_rate / p.output_quantity + p.overhead_per_unit) * _quantity;
  INSERT INTO public.inventory_movements (business_id, product_id, warehouse_id, type, quantity, base_quantity, unit, unit_cost, total_cost, reference, reference_type, reference_id, movement_date, reason, notes, created_by)
  VALUES (p.business_id, p.id, wh, 'production', _quantity, _quantity, p.unit, ROUND(cost_total / _quantity, 4), cost_total, p.name, 'production', p.id, CURRENT_DATE, 'Production', 'Batch made', auth.uid());
  INSERT INTO public.audit_logs (business_id, user_id, action, module, record_id, new_value)
  VALUES (p.business_id, auth.uid(), 'production_run', 'inventory', p.name, jsonb_build_object('quantity', _quantity, 'cost', cost_total));
  RETURN _quantity;
END $$;
REVOKE EXECUTE ON FUNCTION public.produce_made_from(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.produce_made_from(uuid, numeric) TO authenticated, service_role;
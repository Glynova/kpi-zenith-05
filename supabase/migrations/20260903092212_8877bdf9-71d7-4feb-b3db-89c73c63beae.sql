CREATE OR REPLACE FUNCTION public.produce_from_bom(_bom_id uuid, _batches numeric DEFAULT 1)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  b public.bill_of_materials%ROWTYPE;
  it record;
  need numeric;
  avail numeric;
  out_qty numeric;
  cost_total numeric := 0;
  n integer := 0;
BEGIN
  IF COALESCE(_batches, 0) <= 0 THEN RAISE EXCEPTION 'Batches must be greater than zero'; END IF;

  SELECT * INTO b FROM public.bill_of_materials WHERE id = _bom_id;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Recipe not found'; END IF;
  IF NOT public.can_write_business(b.business_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;

  out_qty := COALESCE(b.output_quantity, 1) * _batches;
  IF out_qty <= 0 THEN RAISE EXCEPTION 'Output quantity must be greater than zero'; END IF;

  -- validate stock first so nothing moves on a shortage
  FOR it IN
    SELECT bi.component_product_id AS pid, bi.quantity AS qty, p.name, p.stock,
           COALESCE(p.average_cost, p.cost_price, 0) AS cost
      FROM public.bom_items bi
      JOIN public.products p ON p.id = bi.component_product_id
     WHERE bi.bom_id = b.id
  LOOP
    n := n + 1;
    need := it.qty * _batches;
    avail := COALESCE(it.stock, 0);
    IF avail < need THEN
      RAISE EXCEPTION 'Not enough stock of %: % available, % needed', it.name, avail, need;
    END IF;
  END LOOP;

  IF n = 0 THEN RAISE EXCEPTION 'This recipe has no components'; END IF;

  FOR it IN
    SELECT bi.component_product_id AS pid, bi.quantity AS qty, p.name,
           COALESCE(p.average_cost, p.cost_price, 0) AS cost
      FROM public.bom_items bi
      JOIN public.products p ON p.id = bi.component_product_id
     WHERE bi.bom_id = b.id
  LOOP
    need := it.qty * _batches;
    INSERT INTO public.inventory_movements
      (business_id, product_id, type, quantity, base_quantity, unit_cost, total_cost,
       reference, reference_type, reference_id, movement_date, reason, notes, created_by)
    VALUES (b.business_id, it.pid, 'consumption', need, need, it.cost, it.cost * need,
            b.name, 'production', b.id, CURRENT_DATE, 'Production - consumed',
            'Consumed by production run', auth.uid());
    cost_total := cost_total + (it.cost * need);
  END LOOP;

  INSERT INTO public.inventory_movements
    (business_id, product_id, type, quantity, base_quantity, unit_cost, total_cost,
     reference, reference_type, reference_id, movement_date, reason, notes, created_by)
  VALUES (b.business_id, b.product_id, 'production', out_qty, out_qty,
          ROUND(cost_total / out_qty, 4), cost_total,
          b.name, 'production', b.id, CURRENT_DATE, 'Production',
          'Produced from bill of materials', auth.uid());

  INSERT INTO public.audit_logs (business_id, user_id, action, module, record_id, new_value)
  VALUES (b.business_id, auth.uid(), 'production_run', 'inventory', b.name,
          jsonb_build_object('batches', _batches, 'output', out_qty, 'cost', cost_total));

  RETURN out_qty;
END; $$;

REVOKE ALL ON FUNCTION public.produce_from_bom(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.produce_from_bom(uuid, numeric) TO authenticated, service_role;
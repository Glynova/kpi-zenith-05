ALTER TABLE public.bill_of_materials ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bom_product_variant_uniq ON public.bill_of_materials (product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE OR REPLACE FUNCTION public.guard_cross_sku()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.sku IS NULL OR btrim(NEW.sku) = '' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'products' THEN
    IF EXISTS (SELECT 1 FROM public.product_variants v WHERE v.business_id = NEW.business_id AND lower(v.sku) = lower(NEW.sku)) THEN
      RAISE EXCEPTION 'SKU "%" is already used by a variant in this business', NEW.sku;
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.products p WHERE p.business_id = NEW.business_id AND lower(p.sku) = lower(NEW.sku)) THEN
      RAISE EXCEPTION 'SKU "%" is already used by a product in this business', NEW.sku;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_cross_sku() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_cross_sku_trg ON public.products;
CREATE TRIGGER guard_cross_sku_trg BEFORE INSERT OR UPDATE OF sku ON public.products FOR EACH ROW EXECUTE FUNCTION public.guard_cross_sku();
DROP TRIGGER IF EXISTS guard_cross_sku_trg ON public.product_variants;
CREATE TRIGGER guard_cross_sku_trg BEFORE INSERT OR UPDATE OF sku ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.guard_cross_sku();

CREATE OR REPLACE FUNCTION public.produce_from_bom(_bom_id uuid, _batches numeric DEFAULT 1)
 RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  b public.bill_of_materials%ROWTYPE; it record; need numeric; avail numeric; out_qty numeric;
  cost_total numeric := 0; n integer := 0; wh uuid;
BEGIN
  IF COALESCE(_batches, 0) <= 0 THEN RAISE EXCEPTION 'Batches must be greater than zero'; END IF;
  SELECT * INTO b FROM public.bill_of_materials WHERE id = _bom_id;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Recipe not found'; END IF;
  IF NOT public.can_write_business(b.business_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF b.variant_id IS NULL AND EXISTS (SELECT 1 FROM public.products WHERE id = b.product_id AND has_variants) THEN
    RAISE EXCEPTION 'This product has variants — produce from a variant recipe';
  END IF;
  SELECT COALESCE(p.default_location_id, (SELECT w.id FROM public.warehouses w WHERE w.business_id = b.business_id AND COALESCE(w.is_active, true) ORDER BY w.is_default DESC, w.created_at LIMIT 1))
    INTO wh FROM public.products p WHERE p.id = b.product_id;
  out_qty := COALESCE(b.output_quantity, 1) * _batches;
  IF out_qty <= 0 THEN RAISE EXCEPTION 'Output quantity must be greater than zero'; END IF;
  FOR it IN
    SELECT bi.component_product_id AS pid, bi.quantity AS qty, p.name,
           COALESCE((SELECT SUM(ib.quantity) FROM public.inventory_balances ib WHERE ib.product_id = bi.component_product_id), COALESCE(p.stock, 0)) AS on_hand
      FROM public.bom_items bi JOIN public.products p ON p.id = bi.component_product_id WHERE bi.bom_id = b.id
  LOOP
    n := n + 1; need := it.qty * _batches; avail := COALESCE(it.on_hand, 0);
    IF avail < need THEN RAISE EXCEPTION 'Not enough stock of %: % available, % needed', it.name, avail, need; END IF;
  END LOOP;
  IF n = 0 THEN RAISE EXCEPTION 'This recipe has no components'; END IF;
  FOR it IN
    SELECT bi.component_product_id AS pid, bi.quantity AS qty, COALESCE(NULLIF(p.average_cost, 0), p.cost_price, 0) AS cost
      FROM public.bom_items bi JOIN public.products p ON p.id = bi.component_product_id WHERE bi.bom_id = b.id
  LOOP
    need := it.qty * _batches;
    INSERT INTO public.inventory_movements (business_id, product_id, warehouse_id, type, quantity, base_quantity, unit_cost, total_cost, reference, reference_type, reference_id, movement_date, reason, notes, created_by)
    VALUES (b.business_id, it.pid, wh, 'consumption', need, need, it.cost, it.cost * need, b.name, 'production', b.id, CURRENT_DATE, 'Production - consumed', 'Consumed by production run', auth.uid());
    cost_total := cost_total + (it.cost * need);
  END LOOP;
  INSERT INTO public.inventory_movements (business_id, product_id, variant_id, warehouse_id, type, quantity, base_quantity, unit_cost, total_cost, reference, reference_type, reference_id, movement_date, reason, notes, created_by)
  VALUES (b.business_id, b.product_id, b.variant_id, wh, 'production', out_qty, out_qty, ROUND(cost_total / out_qty, 4), cost_total, b.name, 'production', b.id, CURRENT_DATE, 'Production', 'Produced from bill of materials', auth.uid());
  INSERT INTO public.audit_logs (business_id, user_id, action, module, record_id, new_value)
  VALUES (b.business_id, auth.uid(), 'production_run', 'inventory', b.name, jsonb_build_object('batches', _batches, 'output', out_qty, 'cost', cost_total, 'variant_id', b.variant_id));
  RETURN out_qty;
END; $function$;

CREATE OR REPLACE FUNCTION public.recalc_product_cost_from_bom(_product_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE b record; total numeric; out_qty numeric; bid uuid;
BEGIN
  SELECT business_id INTO bid FROM public.products WHERE id = _product_id;
  IF bid IS NULL THEN RETURN; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_business_member(bid) THEN RAISE EXCEPTION 'Not a member of this business'; END IF;
  FOR b IN SELECT * FROM public.bill_of_materials WHERE product_id = _product_id ORDER BY created_at LOOP
    out_qty := GREATEST(COALESCE(b.output_quantity, 1), 0.000001);
    SELECT COALESCE(SUM(bi.quantity * COALESCE(NULLIF(p.average_cost, 0), p.cost_price, 0)), 0) INTO total
      FROM public.bom_items bi JOIN public.products p ON p.id = bi.component_product_id WHERE bi.bom_id = b.id;
    IF b.variant_id IS NULL THEN
      UPDATE public.products SET cost_price = ROUND(total / out_qty, 4), has_bom = true, updated_at = now()
       WHERE id = _product_id AND cost_price IS DISTINCT FROM ROUND(total / out_qty, 4);
    ELSE
      UPDATE public.product_variants SET cost_price = ROUND(total / out_qty, 4)
       WHERE id = b.variant_id AND cost_price IS DISTINCT FROM ROUND(total / out_qty, 4);
      UPDATE public.products SET has_bom = true WHERE id = _product_id AND NOT COALESCE(has_bom, false);
    END IF;
  END LOOP;
END; $function$;
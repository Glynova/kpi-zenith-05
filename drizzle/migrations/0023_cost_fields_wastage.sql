ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS registered_cost numeric,
  ADD COLUMN IF NOT EXISTS last_purchase_cost numeric,
  ADD COLUMN IF NOT EXISTS last_purchase_date timestamptz;
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS registered_cost numeric,
  ADD COLUMN IF NOT EXISTS last_purchase_cost numeric,
  ADD COLUMN IF NOT EXISTS last_purchase_date timestamptz;
UPDATE public.products SET registered_cost = cost_price WHERE registered_cost IS NULL;
UPDATE public.product_variants SET registered_cost = cost_price WHERE registered_cost IS NULL;

CREATE OR REPLACE FUNCTION public.set_registered_cost()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.registered_cost IS NULL THEN NEW.registered_cost := COALESCE(NEW.cost_price, 0); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS set_registered_cost_trg ON public.products;
CREATE TRIGGER set_registered_cost_trg BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_registered_cost();
DROP TRIGGER IF EXISTS set_registered_cost_trg ON public.product_variants;
CREATE TRIGGER set_registered_cost_trg BEFORE INSERT ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.set_registered_cost();

CREATE OR REPLACE FUNCTION public.track_last_purchase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.type = 'purchase' AND COALESCE(NEW.unit_cost, 0) > 0 THEN
    IF NEW.variant_id IS NOT NULL THEN
      UPDATE public.product_variants SET last_purchase_cost = NEW.unit_cost, last_purchase_date = NEW.created_at WHERE id = NEW.variant_id;
    ELSE
      UPDATE public.products SET last_purchase_cost = NEW.unit_cost, last_purchase_date = NEW.created_at WHERE id = NEW.product_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS track_last_purchase_trg ON public.inventory_movements;
CREATE TRIGGER track_last_purchase_trg AFTER INSERT ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.track_last_purchase();

UPDATE public.products p SET last_purchase_cost = m.unit_cost, last_purchase_date = m.created_at
FROM (SELECT DISTINCT ON (product_id) product_id, unit_cost, created_at FROM public.inventory_movements
      WHERE type='purchase' AND variant_id IS NULL AND unit_cost > 0 ORDER BY product_id, created_at DESC) m
WHERE p.id = m.product_id;
UPDATE public.product_variants v SET last_purchase_cost = m.unit_cost, last_purchase_date = m.created_at
FROM (SELECT DISTINCT ON (variant_id) variant_id, unit_cost, created_at FROM public.inventory_movements
      WHERE type='purchase' AND variant_id IS NOT NULL AND unit_cost > 0 ORDER BY variant_id, created_at DESC) m
WHERE v.id = m.variant_id;

CREATE TABLE IF NOT EXISTS public.wastage_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  variant_id uuid REFERENCES public.product_variants(id),
  warehouse_id uuid REFERENCES public.warehouses(id),
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  reason text NOT NULL,
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wastage_entries TO authenticated;
GRANT ALL ON public.wastage_entries TO service_role;
ALTER TABLE public.wastage_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read wastage" ON public.wastage_entries FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));

CREATE OR REPLACE FUNCTION public.record_wastage(
  _product_id uuid, _variant_id uuid, _quantity numeric, _reason text, _note text DEFAULT NULL, _warehouse_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p record; biz uuid; unit_c numeric := 0; c record; entry uuid; comp_cost numeric; q numeric;
BEGIN
  IF COALESCE(_quantity,0) <= 0 THEN RAISE EXCEPTION 'Enter a quantity above zero'; END IF;
  IF COALESCE(trim(_reason),'') = '' THEN RAISE EXCEPTION 'Choose a reason'; END IF;
  SELECT * INTO p FROM public.products WHERE id = _product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
  biz := p.business_id;
  IF NOT public.is_business_member(biz) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _variant_id IS NULL AND EXISTS (SELECT 1 FROM public.product_variants WHERE product_id = _product_id) THEN
    RAISE EXCEPTION 'Choose a variant';
  END IF;

  IF p.consumption_mode = 'on_sale' AND EXISTS (SELECT 1 FROM public.bundle_components WHERE bundle_product_id = _product_id) THEN
    FOR c IN SELECT * FROM public.bundle_components WHERE bundle_product_id = _product_id LOOP
      SELECT COALESCE(NULLIF(b.average_cost,0), NULLIF(v.cost_price,0), NULLIF(cp.cost_price,0), cp.average_cost, 0) INTO comp_cost
        FROM public.products cp
        LEFT JOIN public.product_variants v ON v.id = c.variant_id
        LEFT JOIN public.inventory_balances b ON b.product_id = cp.id AND b.variant_id IS NOT DISTINCT FROM c.variant_id
          AND b.warehouse_id IS NOT DISTINCT FROM _warehouse_id
        WHERE cp.id = c.component_product_id LIMIT 1;
      q := round(c.quantity * (1 + COALESCE(c.waste_percent,0)/100) * _quantity, 4);
      INSERT INTO public.inventory_movements (business_id, product_id, variant_id, warehouse_id, type, quantity, unit_cost, total_cost, reason, reference_type, notes, created_by)
      VALUES (biz, c.component_product_id, c.variant_id, _warehouse_id, 'waste', q, comp_cost, round(q * comp_cost, 2), _reason, 'wastage', 'Wasted: ' || p.name, auth.uid());
      unit_c := unit_c + c.quantity * (1 + COALESCE(c.waste_percent,0)/100) * comp_cost;
    END LOOP;
  ELSE
    SELECT COALESCE(NULLIF(b.average_cost,0), NULLIF(v.cost_price,0), NULLIF(p.cost_price,0), p.average_cost, 0) INTO unit_c
      FROM (SELECT 1) x
      LEFT JOIN public.product_variants v ON v.id = _variant_id
      LEFT JOIN public.inventory_balances b ON b.product_id = _product_id AND b.variant_id IS NOT DISTINCT FROM _variant_id
        AND b.warehouse_id IS NOT DISTINCT FROM _warehouse_id;
    INSERT INTO public.inventory_movements (business_id, product_id, variant_id, warehouse_id, type, quantity, unit_cost, total_cost, reason, reference_type, notes, created_by)
    VALUES (biz, _product_id, _variant_id, _warehouse_id, 'waste', _quantity, unit_c, round(_quantity*unit_c,2), _reason, 'wastage', _note, auth.uid());
  END IF;

  INSERT INTO public.wastage_entries (business_id, product_id, variant_id, warehouse_id, quantity, unit_cost, total_cost, reason, note)
  VALUES (biz, _product_id, _variant_id, _warehouse_id, _quantity, round(unit_c,4), round(unit_c*_quantity,2), _reason, _note)
  RETURNING id INTO entry;

  IF round(unit_c*_quantity,2) > 0 THEN
    INSERT INTO public.expenses (business_id, category, description, amount, status)
    VALUES (biz, 'wastage', 'Wastage: ' || p.name || ' (' || _reason || ')', round(unit_c*_quantity,2), 'approved');
  END IF;
  RETURN entry;
END $$;
REVOKE ALL ON FUNCTION public.record_wastage(uuid,uuid,numeric,text,text,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_wastage(uuid,uuid,numeric,text,text,uuid) TO authenticated;
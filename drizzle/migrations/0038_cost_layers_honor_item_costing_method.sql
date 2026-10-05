CREATE OR REPLACE FUNCTION public.apply_cost_layers()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s integer := public.movement_sign(NEW.type);
  qty numeric := COALESCE(NEW.base_quantity, NEW.quantity);
  method text;
  need numeric;
  take numeric;
  cost_sum numeric := 0;
  layer record;
BEGIN
  -- Item-level costing method overrides the business default (set intentionally in the item form).
  SELECT COALESCE(p.costing_method, bs.costing_method) INTO method
    FROM public.business_settings bs LEFT JOIN public.products p ON p.id = NEW.product_id
   WHERE bs.business_id = NEW.business_id;

  IF s > 0 THEN
    INSERT INTO public.inventory_cost_layers
      (business_id, product_id, variant_id, warehouse_id, movement_id, quantity, remaining_quantity, unit_cost)
    VALUES (NEW.business_id, NEW.product_id, NEW.variant_id, NEW.warehouse_id, NEW.id, qty, qty, COALESCE(NEW.unit_cost, 0));
    RETURN NEW;
  END IF;

  IF s < 0 THEN
    need := qty;
    FOR layer IN
      SELECT * FROM public.inventory_cost_layers l
      WHERE l.business_id = NEW.business_id AND l.product_id = NEW.product_id
        AND l.variant_id IS NOT DISTINCT FROM NEW.variant_id
        AND l.warehouse_id IS NOT DISTINCT FROM NEW.warehouse_id
        AND l.remaining_quantity > 0
      ORDER BY l.created_at
    LOOP
      EXIT WHEN need <= 0;
      take := LEAST(need, layer.remaining_quantity);
      UPDATE public.inventory_cost_layers SET remaining_quantity = remaining_quantity - take WHERE id = layer.id;
      cost_sum := cost_sum + (take * layer.unit_cost);
      need := need - take;
    END LOOP;

    IF method = 'fifo' AND qty > 0 AND (qty - need) > 0 THEN
      UPDATE public.inventory_movements
        SET unit_cost = ROUND(cost_sum / NULLIF(qty - need, 0), 2), total_cost = cost_sum
        WHERE id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END; $function$;
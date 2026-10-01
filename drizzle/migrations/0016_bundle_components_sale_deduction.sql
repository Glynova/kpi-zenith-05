CREATE OR REPLACE FUNCTION public.guard_bundle_component_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = NEW.bundle_product_id AND business_id = NEW.business_id AND item_type = 'bundle') THEN RAISE EXCEPTION 'Bundle must belong to the current business'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = NEW.component_product_id AND business_id = NEW.business_id AND NOT has_variants AND item_type <> 'bundle') THEN RAISE EXCEPTION 'Component must be a non-variant item in the same business'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_bundle_component_identity_trg BEFORE INSERT OR UPDATE ON public.bundle_components FOR EACH ROW EXECUTE FUNCTION public.guard_bundle_component_identity();
REVOKE EXECUTE ON FUNCTION public.guard_bundle_component_identity() FROM PUBLIC, anon, authenticated;
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.complete_sale(uuid)'::regprocedure) INTO definition;
 IF position('p.item_type AS item_type' in definition) > 0 THEN RETURN; END IF;
 definition := replace(definition, 'v.cost_price AS variant_cost', 'v.cost_price AS variant_cost, p.item_type AS item_type');
 definition := replace(definition, '    CONTINUE WHEN it.inventory_model IN (''service'',''non_stock'',''digital'');', $block$
    -- Bundles are non-stock containers. Deduct each component in this same
    -- locked/idempotent sale transaction, never the bundle parent itself.
    IF it.item_type = 'bundle' THEN
      IF NOT EXISTS (SELECT 1 FROM public.bundle_components bc WHERE bc.bundle_product_id = it.product_id AND bc.business_id = s.business_id) THEN
        RAISE EXCEPTION 'Bundle has no components';
      END IF;
      IF COALESCE(bs.track_quantity, true) THEN
        FOR comp IN SELECT bc.component_product_id, bc.quantity, p.unit,
                           COALESCE(NULLIF(b.average_cost, 0), p.average_cost, p.cost_price, 0) AS component_cost
                      FROM public.bundle_components bc
                      JOIN public.products p ON p.id = bc.component_product_id AND p.business_id = s.business_id
                      LEFT JOIN public.inventory_balances b ON b.business_id = s.business_id
                        AND b.product_id = p.id AND b.variant_id IS NULL
                        AND b.warehouse_id IS NOT DISTINCT FROM s.location_id
                     WHERE bc.bundle_product_id = it.product_id AND bc.business_id = s.business_id LOOP
          INSERT INTO public.inventory_movements
            (business_id, product_id, warehouse_id, type, quantity, base_quantity, unit, unit_cost, total_cost,
             reference, reference_type, reference_id, movement_date, notes, created_by)
          VALUES (s.business_id, comp.component_product_id, s.location_id, 'consumption',
                  comp.quantity * it.quantity, comp.quantity * it.quantity, comp.unit,
                  comp.component_cost, comp.component_cost * comp.quantity * it.quantity,
                  s.sale_number, 'sale', s.id, s.sale_date,
                  'Bundle component for ' || s.sale_number, COALESCE(s.created_by, auth.uid()));
          total_cogs := total_cogs + comp.component_cost * comp.quantity * it.quantity;
        END LOOP;
      END IF;
      CONTINUE;
    END IF;
    CONTINUE WHEN it.inventory_model IN ('service','non_stock','digital');$block$);
 IF position('Bundle component for ' in definition) = 0 THEN RAISE EXCEPTION 'Sale function structure changed; bundle integration not installed'; END IF;
 EXECUTE definition;
END $migration$;
REVOKE EXECUTE ON FUNCTION public.complete_sale(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_sale(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.post_sale_addons()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE comp record; extra numeric := 0;
BEGIN
  IF NOT COALESCE((SELECT track_quantity FROM public.business_settings WHERE business_id = NEW.business_id), true) THEN RETURN NULL; END IF;
  -- Add-on ingredients deduct at the same moment as the base recipe (same transaction as complete_sale).
  FOR comp IN SELECT ac.component_product_id, ac.variant_id, ROUND(ac.quantity * si.quantity, 4) AS need, p.unit,
                     COALESCE(NULLIF(b.average_cost, 0), NULLIF(v.cost_price, 0),
                              CASE WHEN ac.variant_id IS NULL THEN COALESCE(NULLIF(p.average_cost, 0), p.cost_price) END, 0) AS component_cost
                FROM public.sale_item_addons sa
                JOIN public.sale_items si ON si.id = sa.sale_item_id AND si.sale_id = NEW.id
                JOIN public.addon_option_components ac ON ac.option_id = sa.option_id
                JOIN public.products p ON p.id = ac.component_product_id AND p.business_id = NEW.business_id
                LEFT JOIN public.product_variants v ON v.id = ac.variant_id
                LEFT JOIN public.inventory_balances b ON b.business_id = NEW.business_id AND b.product_id = p.id
                  AND b.variant_id IS NOT DISTINCT FROM ac.variant_id AND b.warehouse_id IS NOT DISTINCT FROM NEW.location_id LOOP
    INSERT INTO public.inventory_movements
      (business_id, product_id, variant_id, warehouse_id, type, quantity, base_quantity, unit, unit_cost, total_cost,
       reference, reference_type, reference_id, movement_date, notes, created_by)
    VALUES (NEW.business_id, comp.component_product_id, comp.variant_id, NEW.location_id, 'consumption',
            comp.need, comp.need, comp.unit, comp.component_cost, comp.component_cost * comp.need,
            NEW.sale_number, 'sale', NEW.id, NEW.sale_date, 'Add-on for ' || NEW.sale_number, COALESCE(NEW.created_by, auth.uid()));
    extra := extra + comp.component_cost * comp.need;
  END LOOP;
  IF extra > 0 THEN
    UPDATE public.sales SET cost_total = COALESCE(cost_total, 0) + extra WHERE id = NEW.id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER post_sale_addons_trg AFTER UPDATE OF inventory_posted ON public.sales
  FOR EACH ROW WHEN (NEW.inventory_posted AND NOT COALESCE(OLD.inventory_posted, false))
  EXECUTE FUNCTION public.post_sale_addons();
REVOKE EXECUTE ON FUNCTION public.post_sale_addons() FROM PUBLIC, anon, authenticated;
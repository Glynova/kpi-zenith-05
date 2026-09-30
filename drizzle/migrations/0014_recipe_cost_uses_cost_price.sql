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
    SELECT COALESCE(SUM(bi.quantity * COALESCE(NULLIF(p.cost_price, 0), p.average_cost, 0)), 0) INTO total
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
REVOKE EXECUTE ON FUNCTION public.recalc_product_cost_from_bom(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_product_cost_from_bom(uuid) TO authenticated, service_role;
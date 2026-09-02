CREATE OR REPLACE FUNCTION public.recalc_product_cost_from_bom(_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE b record; total numeric; out_qty numeric;
BEGIN
  SELECT * INTO b FROM public.bill_of_materials
   WHERE product_id = _product_id ORDER BY created_at LIMIT 1;
  IF b.id IS NULL THEN RETURN; END IF;

  out_qty := GREATEST(COALESCE(b.output_quantity, 1), 0.000001);

  SELECT COALESCE(SUM(bi.quantity * COALESCE(p.cost_price, 0)), 0) INTO total
    FROM public.bom_items bi
    JOIN public.products p ON p.id = bi.component_product_id
   WHERE bi.bom_id = b.id;

  UPDATE public.products
     SET cost_price = ROUND(total / out_qty, 4),
         has_bom = true,
         updated_at = now()
   WHERE id = _product_id
     AND cost_price IS DISTINCT FROM ROUND(total / out_qty, 4);
END; $$;

REVOKE EXECUTE ON FUNCTION public.recalc_product_cost_from_bom(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.recalc_product_cost_from_bom(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bom_items_recalc_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE pid uuid;
BEGIN
  SELECT product_id INTO pid FROM public.bill_of_materials
   WHERE id = COALESCE(NEW.bom_id, OLD.bom_id);
  IF pid IS NOT NULL THEN PERFORM public.recalc_product_cost_from_bom(pid); END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS bom_items_recalc_cost_trg ON public.bom_items;
CREATE TRIGGER bom_items_recalc_cost_trg
AFTER INSERT OR UPDATE OR DELETE ON public.bom_items
FOR EACH ROW EXECUTE FUNCTION public.bom_items_recalc_cost();

CREATE OR REPLACE FUNCTION public.bom_output_recalc_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.recalc_product_cost_from_bom(NEW.product_id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS bom_output_recalc_cost_trg ON public.bill_of_materials;
CREATE TRIGGER bom_output_recalc_cost_trg
AFTER INSERT OR UPDATE OF output_quantity, product_id ON public.bill_of_materials
FOR EACH ROW EXECUTE FUNCTION public.bom_output_recalc_cost();

CREATE OR REPLACE FUNCTION public.product_cost_cascade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE parent uuid;
BEGIN
  IF NEW.cost_price IS NOT DISTINCT FROM OLD.cost_price THEN RETURN NEW; END IF;
  FOR parent IN
    SELECT DISTINCT b.product_id FROM public.bom_items bi
      JOIN public.bill_of_materials b ON b.id = bi.bom_id
     WHERE bi.component_product_id = NEW.id AND b.product_id <> NEW.id
  LOOP
    PERFORM public.recalc_product_cost_from_bom(parent);
  END LOOP;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS product_cost_cascade_trg ON public.products;
CREATE TRIGGER product_cost_cascade_trg
AFTER UPDATE OF cost_price ON public.products
FOR EACH ROW EXECUTE FUNCTION public.product_cost_cascade();
-- Costing method may only change while the affected items hold no stock or open cost layers,
-- so historical FIFO layers and running averages are never reinterpreted under another method.
CREATE OR REPLACE FUNCTION public.business_has_costed_stock(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.inventory_balances b JOIN public.products p ON p.id = b.product_id
     WHERE b.business_id = _business_id AND b.quantity <> 0 AND p.costing_method IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.inventory_cost_layers l JOIN public.products p ON p.id = l.product_id
     WHERE l.business_id = _business_id AND l.remaining_quantity > 0 AND p.costing_method IS NULL
  )
$$;
REVOKE ALL ON FUNCTION public.business_has_costed_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_has_costed_stock(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_costing_method_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.costing_method IS NOT DISTINCT FROM OLD.costing_method THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'business_settings' THEN
    IF public.business_has_costed_stock(NEW.business_id) THEN
      RAISE EXCEPTION 'Costing method can''t change while items using it have stock on hand. Sell, transfer or adjust that stock to zero first, or set a costing method on new items only.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.inventory_balances WHERE product_id = NEW.id AND quantity <> 0)
       OR EXISTS (SELECT 1 FROM public.inventory_cost_layers WHERE product_id = NEW.id AND remaining_quantity > 0) THEN
      RAISE EXCEPTION 'Costing method for % can''t change while it has stock on hand. Bring its stock to zero first.', NEW.name
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  PERFORM public.log_audit_event(NEW.business_id, 'SETTINGS_CHANGE', TG_TABLE_NAME, NEW.business_id::text,
    jsonb_build_object('costing_method', OLD.costing_method), jsonb_build_object('costing_method', NEW.costing_method));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_costing_method_change ON public.business_settings;
CREATE TRIGGER guard_costing_method_change BEFORE UPDATE OF costing_method ON public.business_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_costing_method_change();
DROP TRIGGER IF EXISTS guard_costing_method_change ON public.products;
CREATE TRIGGER guard_costing_method_change BEFORE UPDATE OF costing_method ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.guard_costing_method_change();
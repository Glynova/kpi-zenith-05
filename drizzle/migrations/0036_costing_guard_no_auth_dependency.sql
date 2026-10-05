-- Settings/product changes are already audited by the generic row-change triggers; the guard only blocks.
CREATE OR REPLACE FUNCTION public.guard_costing_method_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.costing_method IS NOT DISTINCT FROM OLD.costing_method THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'business_settings' THEN
    IF public.business_has_costed_stock(NEW.business_id) THEN
      RAISE EXCEPTION 'Costing method can''t change while items using it have stock on hand. Sell, transfer or adjust that stock to zero first.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.inventory_balances WHERE product_id = NEW.id AND quantity <> 0)
       OR EXISTS (SELECT 1 FROM public.inventory_cost_layers WHERE product_id = NEW.id AND remaining_quantity > 0) THEN
      RAISE EXCEPTION 'Costing method for % can''t change while it has stock on hand. Bring its stock to zero first.', NEW.name
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
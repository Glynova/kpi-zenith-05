CREATE OR REPLACE FUNCTION public.business_has_feature(_business_id uuid, _key text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; _plan uuid;
BEGIN
  SELECT plan_id, status, trial_ends_at INTO s FROM public.subscriptions WHERE business_id = _business_id LIMIT 1;
  IF FOUND AND s.status IN ('trialing','active','past_due')
     AND NOT (s.status = 'trialing' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at <= now()) THEN
    _plan := s.plan_id;
  ELSE
    SELECT id INTO _plan FROM public.subscription_plans WHERE slug = 'free' LIMIT 1;
  END IF;
  RETURN COALESCE((SELECT enabled FROM public.plan_entitlements WHERE plan_id = _plan AND feature_key = _key LIMIT 1), false);
END; $$;

DROP POLICY IF EXISTS "members read" ON public.purchase_orders;
DROP POLICY IF EXISTS "members insert" ON public.purchase_orders;
DROP POLICY IF EXISTS "members update" ON public.purchase_orders;
DROP POLICY IF EXISTS "members delete" ON public.purchase_orders;
CREATE POLICY "members read" ON public.purchase_orders FOR SELECT TO authenticated USING (is_business_member(business_id) AND business_has_feature(business_id,'purchase_orders'));
CREATE POLICY "members insert" ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK (can_write_business(business_id) AND business_has_feature(business_id,'purchase_orders'));
CREATE POLICY "members update" ON public.purchase_orders FOR UPDATE TO authenticated USING (can_write_business(business_id) AND business_has_feature(business_id,'purchase_orders')) WITH CHECK (can_write_business(business_id) AND business_has_feature(business_id,'purchase_orders'));
CREATE POLICY "members delete" ON public.purchase_orders FOR DELETE TO authenticated USING (can_write_business(business_id) AND business_has_feature(business_id,'purchase_orders'));

DROP POLICY IF EXISTS "members read" ON public.purchase_order_items;
DROP POLICY IF EXISTS "members insert" ON public.purchase_order_items;
DROP POLICY IF EXISTS "members update" ON public.purchase_order_items;
DROP POLICY IF EXISTS "members delete" ON public.purchase_order_items;
CREATE POLICY "members read" ON public.purchase_order_items FOR SELECT TO authenticated USING (is_business_member(business_id) AND business_has_feature(business_id,'purchase_orders'));
CREATE POLICY "members insert" ON public.purchase_order_items FOR INSERT TO authenticated WITH CHECK (can_write_business(business_id) AND business_has_feature(business_id,'purchase_orders'));
CREATE POLICY "members update" ON public.purchase_order_items FOR UPDATE TO authenticated USING (can_write_business(business_id) AND business_has_feature(business_id,'purchase_orders')) WITH CHECK (can_write_business(business_id) AND business_has_feature(business_id,'purchase_orders'));
CREATE POLICY "members delete" ON public.purchase_order_items FOR DELETE TO authenticated USING (can_write_business(business_id) AND business_has_feature(business_id,'purchase_orders'));

CREATE OR REPLACE FUNCTION public.guard_sale_item_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE floor_price numeric; sp numeric; wp numeric; r app_role;
BEGIN
  IF auth.uid() IS NULL OR NEW.product_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.unit_price IS NOT DISTINCT FROM OLD.unit_price THEN RETURN NEW; END IF;
  IF NEW.variant_id IS NOT NULL THEN
    SELECT selling_price, wholesale_price INTO sp, wp FROM public.product_variants WHERE id = NEW.variant_id;
  END IF;
  IF sp IS NULL OR sp <= 0 THEN
    SELECT selling_price, wholesale_price INTO sp, wp FROM public.products WHERE id = NEW.product_id;
  END IF;
  IF COALESCE(sp,0) <= 0 THEN RETURN NEW; END IF;
  floor_price := CASE WHEN COALESCE(wp,0) > 0 THEN LEAST(sp, wp) ELSE sp END;
  IF COALESCE(NEW.unit_price,0) + 0.0001 >= floor_price THEN RETURN NEW; END IF;
  r := public.business_role(NEW.business_id);
  IF r IS NULL OR r NOT IN ('owner','admin','manager') THEN
    RAISE EXCEPTION 'Selling below the item price (%) needs manager approval', ROUND(floor_price,2);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS guard_sale_item_price_trg ON public.sale_items;
CREATE TRIGGER guard_sale_item_price_trg BEFORE INSERT OR UPDATE OF unit_price ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.guard_sale_item_price();

DROP POLICY IF EXISTS "Anyone can read entitlements" ON public.plan_entitlements;
CREATE POLICY "Signed-in users read entitlements" ON public.plan_entitlements FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE OR REPLACE FUNCTION public.guard_unit_conversion_capability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- Standard reference conversions seeded during business creation are not a
  -- user "use" of unit conversion; only user-driven writes require the capability.
  IF COALESCE(current_setting('app.seeding_business_defaults', true), '') <> 'on' THEN
    PERFORM public.require_capability(NEW.business_id, 'enable_unit_conversion', 'Unit conversion');
  END IF;
  IF COALESCE(NEW.factor, 0) <= 0 THEN
    RAISE EXCEPTION 'Conversion factor must be greater than zero' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.seed_business_defaults(_business_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.seeding_business_defaults', 'on', true);

  INSERT INTO public.business_settings (business_id) VALUES (_business_id)
  ON CONFLICT (business_id) DO NOTHING;

  INSERT INTO public.units_of_measure (business_id, code, name, category, is_base)
  VALUES
    (_business_id,'pcs','Piece','count',true),
    (_business_id,'g','Gram','weight',true),
    (_business_id,'kg','Kilogram','weight',false),
    (_business_id,'ml','Milliliter','volume',true),
    (_business_id,'l','Liter','volume',false),
    (_business_id,'box','Box','count',false),
    (_business_id,'pack','Pack','count',false),
    (_business_id,'case','Case','count',false),
    (_business_id,'bottle','Bottle','count',false),
    (_business_id,'bag','Bag','count',false),
    (_business_id,'dozen','Dozen','count',false)
  ON CONFLICT (business_id, code) DO NOTHING;

  INSERT INTO public.unit_conversions (business_id, from_unit, to_unit, factor)
  SELECT _business_id, v.f, v.t, v.x FROM (VALUES
    ('kg','g',1000::numeric), ('l','ml',1000::numeric),
    ('dozen','pcs',12::numeric), ('case','pcs',24::numeric)) AS v(f,t,x)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.unit_conversions c
    WHERE c.business_id = _business_id AND c.product_id IS NULL AND c.from_unit = v.f AND c.to_unit = v.t);

  INSERT INTO public.warehouses (business_id, name, code, type, is_default)
  SELECT _business_id, 'Main Location', 'MAIN', 'warehouse', true
  WHERE NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.business_id = _business_id);

  PERFORM set_config('app.seeding_business_defaults', 'off', true);
END; $function$;

REVOKE EXECUTE ON FUNCTION public.seed_business_defaults(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_unit_conversion_capability() FROM PUBLIC, anon, authenticated;
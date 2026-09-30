ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'product',
  ADD COLUMN IF NOT EXISTS item_subtype text,
  ADD COLUMN IF NOT EXISTS costing_method text,
  ADD COLUMN IF NOT EXISTS track_stock boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS service_duration_minutes integer,
  ADD COLUMN IF NOT EXISTS commission_rate numeric,
  ADD COLUMN IF NOT EXISTS assigned_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS income_account text,
  ADD COLUMN IF NOT EXISTS requires_booking boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_unit text,
  ADD COLUMN IF NOT EXISTS bundle_fixed_price boolean NOT NULL DEFAULT false;

UPDATE public.products SET
  item_type = CASE
    WHEN product_type = 'service' OR inventory_model = 'service' THEN 'service'
    WHEN product_type = 'bundle' THEN 'bundle'
    WHEN inventory_model = 'non_stocked_item' OR product_type = 'non_stocked' THEN 'non_stock'
    ELSE 'product' END,
  track_stock = NOT (product_type = 'service' OR inventory_model IN ('service','non_stocked_item') OR product_type = 'non_stocked'),
  image_urls = CASE WHEN image_url IS NOT NULL AND image_url <> '' THEN ARRAY[image_url] ELSE '{}' END;

UPDATE public.products SET item_subtype = CASE item_type
  WHEN 'service' THEN 'standard_service' WHEN 'bundle' THEN 'fixed_bundle'
  WHEN 'non_stock' THEN 'non_stock_item' ELSE 'standard_product' END
WHERE item_subtype IS NULL;

ALTER TABLE public.products ADD CONSTRAINT products_item_type_chk
  CHECK (item_type IN ('product','service','bundle','non_stock'));
ALTER TABLE public.products ADD CONSTRAINT products_costing_method_chk
  CHECK (costing_method IS NULL OR costing_method IN ('weighted_average','fifo','lifo','standard'));

CREATE TABLE public.bundle_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  bundle_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  component_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_cost numeric NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (bundle_product_id <> component_product_id)
);
CREATE INDEX bundle_components_bundle_idx ON public.bundle_components(bundle_product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bundle_components TO authenticated;
GRANT ALL ON public.bundle_components TO service_role;
ALTER TABLE public.bundle_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read bundle components" ON public.bundle_components FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));
CREATE POLICY "Writers insert bundle components" ON public.bundle_components FOR INSERT TO authenticated
  WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "Writers update bundle components" ON public.bundle_components FOR UPDATE TO authenticated
  USING (public.can_write_business(business_id)) WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "Writers delete bundle components" ON public.bundle_components FOR DELETE TO authenticated
  USING (public.can_write_business(business_id));
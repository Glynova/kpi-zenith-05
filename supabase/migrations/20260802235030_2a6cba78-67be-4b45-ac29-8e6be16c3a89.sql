
-- ============ 1. BUSINESS SETTINGS ============
CREATE TABLE public.business_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  costing_method text NOT NULL DEFAULT 'weighted_average',
  track_quantity boolean NOT NULL DEFAULT true,
  track_cost boolean NOT NULL DEFAULT true,
  track_locations boolean NOT NULL DEFAULT false,
  track_batch boolean NOT NULL DEFAULT false,
  track_expiry boolean NOT NULL DEFAULT false,
  track_serial boolean NOT NULL DEFAULT false,
  track_lot boolean NOT NULL DEFAULT false,
  track_variants boolean NOT NULL DEFAULT false,
  enable_bom boolean NOT NULL DEFAULT false,
  enable_production boolean NOT NULL DEFAULT false,
  enable_waste boolean NOT NULL DEFAULT false,
  enable_unit_conversion boolean NOT NULL DEFAULT false,
  enable_returns boolean NOT NULL DEFAULT true,
  enable_purchasing boolean NOT NULL DEFAULT true,
  enable_sales boolean NOT NULL DEFAULT true,
  enable_barcode boolean NOT NULL DEFAULT true,
  enable_projects boolean NOT NULL DEFAULT false,
  enable_assets boolean NOT NULL DEFAULT false,
  low_stock_rule text NOT NULL DEFAULT 'reorder_level',
  expiry_alert_days integer NOT NULL DEFAULT 30,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_settings TO authenticated;
GRANT ALL ON public.business_settings TO service_role;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read settings" ON public.business_settings FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY "admins insert settings" ON public.business_settings FOR INSERT TO authenticated WITH CHECK (public.is_business_admin(business_id));
CREATE POLICY "admins update settings" ON public.business_settings FOR UPDATE TO authenticated USING (public.is_business_admin(business_id)) WITH CHECK (public.is_business_admin(business_id));
CREATE POLICY "admins delete settings" ON public.business_settings FOR DELETE TO authenticated USING (public.is_business_admin(business_id));
CREATE TRIGGER business_settings_updated BEFORE UPDATE ON public.business_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 2. UNITS OF MEASURE ============
CREATE TABLE public.units_of_measure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'count',
  is_base boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units_of_measure TO authenticated;
GRANT ALL ON public.units_of_measure TO service_role;
ALTER TABLE public.units_of_measure ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read uom" ON public.units_of_measure FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY "writers insert uom" ON public.units_of_measure FOR INSERT TO authenticated WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers update uom" ON public.units_of_measure FOR UPDATE TO authenticated USING (public.can_write_business(business_id)) WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers delete uom" ON public.units_of_measure FOR DELETE TO authenticated USING (public.can_write_business(business_id));
CREATE TRIGGER uom_updated BEFORE UPDATE ON public.units_of_measure FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.unit_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  from_unit text NOT NULL,
  to_unit text NOT NULL,
  factor numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unit_conversions TO authenticated;
GRANT ALL ON public.unit_conversions TO service_role;
ALTER TABLE public.unit_conversions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read conv" ON public.unit_conversions FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY "writers insert conv" ON public.unit_conversions FOR INSERT TO authenticated WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers update conv" ON public.unit_conversions FOR UPDATE TO authenticated USING (public.can_write_business(business_id)) WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers delete conv" ON public.unit_conversions FOR DELETE TO authenticated USING (public.can_write_business(business_id));
CREATE TRIGGER unit_conversions_updated BEFORE UPDATE ON public.unit_conversions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 3. LOCATIONS (extend warehouses) ============
ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'warehouse',
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- ============ 4. PRODUCT FLEXIBILITY ============
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'stocked',
  ADD COLUMN IF NOT EXISTS inventory_model text NOT NULL DEFAULT 'stocked_item',
  ADD COLUMN IF NOT EXISTS track_batch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS track_expiry boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS track_serial boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_variants boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_bom boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_stock numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_stock numeric,
  ADD COLUMN IF NOT EXISTS default_location_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purchase_unit text,
  ADD COLUMN IF NOT EXISTS purchase_conversion numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS average_cost numeric NOT NULL DEFAULT 0;

UPDATE public.products SET inventory_model = 'finished_product', product_type = 'stocked'
  WHERE is_finished_good = true;

-- ============ 5. PRODUCT VARIANTS ============
CREATE TABLE public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  barcode text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  cost_price numeric NOT NULL DEFAULT 0,
  selling_price numeric NOT NULL DEFAULT 0,
  stock numeric NOT NULL DEFAULT 0,
  reorder_level numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read variants" ON public.product_variants FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY "writers insert variants" ON public.product_variants FOR INSERT TO authenticated WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers update variants" ON public.product_variants FOR UPDATE TO authenticated USING (public.can_write_business(business_id)) WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers delete variants" ON public.product_variants FOR DELETE TO authenticated USING (public.can_write_business(business_id));
CREATE TRIGGER product_variants_updated BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 6. BATCHES ============
CREATE TABLE public.batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  batch_number text NOT NULL,
  lot_number text,
  manufactured_date date,
  expiry_date date,
  quantity numeric NOT NULL DEFAULT 0,
  remaining_quantity numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batches TO authenticated;
GRANT ALL ON public.batches TO service_role;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read batches" ON public.batches FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY "writers insert batches" ON public.batches FOR INSERT TO authenticated WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers update batches" ON public.batches FOR UPDATE TO authenticated USING (public.can_write_business(business_id)) WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers delete batches" ON public.batches FOR DELETE TO authenticated USING (public.can_write_business(business_id));
CREATE TRIGGER batches_updated BEFORE UPDATE ON public.batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 7. SERIAL NUMBERS ============
CREATE TABLE public.serial_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  serial_number text NOT NULL,
  purchase_date date,
  warranty_expiry date,
  status text NOT NULL DEFAULT 'in_stock',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, product_id, serial_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.serial_numbers TO authenticated;
GRANT ALL ON public.serial_numbers TO service_role;
ALTER TABLE public.serial_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read serials" ON public.serial_numbers FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY "writers insert serials" ON public.serial_numbers FOR INSERT TO authenticated WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers update serials" ON public.serial_numbers FOR UPDATE TO authenticated USING (public.can_write_business(business_id)) WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers delete serials" ON public.serial_numbers FOR DELETE TO authenticated USING (public.can_write_business(business_id));
CREATE TRIGGER serial_numbers_updated BEFORE UPDATE ON public.serial_numbers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 8. INVENTORY BALANCES ============
CREATE TABLE public.inventory_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL,
  quantity numeric NOT NULL DEFAULT 0,
  reserved_quantity numeric NOT NULL DEFAULT 0,
  average_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX inventory_balances_key ON public.inventory_balances (
  business_id, product_id,
  COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(warehouse_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_balances TO authenticated;
GRANT ALL ON public.inventory_balances TO service_role;
ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read balances" ON public.inventory_balances FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY "writers insert balances" ON public.inventory_balances FOR INSERT TO authenticated WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers update balances" ON public.inventory_balances FOR UPDATE TO authenticated USING (public.can_write_business(business_id)) WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers delete balances" ON public.inventory_balances FOR DELETE TO authenticated USING (public.can_write_business(business_id));
CREATE TRIGGER inventory_balances_updated BEFORE UPDATE ON public.inventory_balances FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 9. INVENTORY TRANSACTIONS (extend movements) ============
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS serial_id uuid REFERENCES public.serial_numbers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS to_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS base_quantity numeric,
  ADD COLUMN IF NOT EXISTS total_cost numeric,
  ADD COLUMN IF NOT EXISTS movement_date date NOT NULL DEFAULT CURRENT_DATE;

-- ============ 10. PRODUCTION ORDERS ============
CREATE TABLE public.production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  bom_id uuid REFERENCES public.bill_of_materials(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  order_number text,
  quantity numeric NOT NULL DEFAULT 1,
  produced_quantity numeric NOT NULL DEFAULT 0,
  waste_quantity numeric NOT NULL DEFAULT 0,
  material_cost numeric NOT NULL DEFAULT 0,
  labor_cost numeric NOT NULL DEFAULT 0,
  overhead_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  start_date date,
  end_date date,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_orders TO authenticated;
GRANT ALL ON public.production_orders TO service_role;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read production" ON public.production_orders FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY "writers insert production" ON public.production_orders FOR INSERT TO authenticated WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers update production" ON public.production_orders FOR UPDATE TO authenticated USING (public.can_write_business(business_id)) WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers delete production" ON public.production_orders FOR DELETE TO authenticated USING (public.can_write_business(business_id));
CREATE TRIGGER production_orders_updated BEFORE UPDATE ON public.production_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 11. SUPPLIER PRODUCTS ============
CREATE TABLE public.supplier_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_sku text,
  unit_cost numeric NOT NULL DEFAULT 0,
  lead_time_days integer NOT NULL DEFAULT 0,
  min_order_quantity numeric NOT NULL DEFAULT 0,
  is_preferred boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_products TO authenticated;
GRANT ALL ON public.supplier_products TO service_role;
ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read supplier products" ON public.supplier_products FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY "writers insert supplier products" ON public.supplier_products FOR INSERT TO authenticated WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers update supplier products" ON public.supplier_products FOR UPDATE TO authenticated USING (public.can_write_business(business_id)) WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers delete supplier products" ON public.supplier_products FOR DELETE TO authenticated USING (public.can_write_business(business_id));
CREATE TRIGGER supplier_products_updated BEFORE UPDATE ON public.supplier_products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 12. COST HISTORY ============
CREATE TABLE public.cost_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  old_cost numeric,
  new_cost numeric NOT NULL,
  method text NOT NULL DEFAULT 'weighted_average',
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.cost_history TO authenticated;
GRANT ALL ON public.cost_history TO service_role;
ALTER TABLE public.cost_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read cost history" ON public.cost_history FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY "writers insert cost history" ON public.cost_history FOR INSERT TO authenticated WITH CHECK (public.can_write_business(business_id));

-- ============ 13. BOM extras ============
ALTER TABLE public.bill_of_materials
  ADD COLUMN IF NOT EXISTS labor_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overhead_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waste_percent numeric NOT NULL DEFAULT 0;
ALTER TABLE public.bom_items
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS waste_percent numeric NOT NULL DEFAULT 0;

-- ============ 14. MOVEMENT SIGN + BALANCE ENGINE ============
CREATE OR REPLACE FUNCTION public.movement_sign(_type text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _type IN ('stock_in','purchase','return_in','adjustment_in','transfer_in','production','production_in','opening_balance') THEN 1
    WHEN _type IN ('stock_out','sale','return_out','adjustment_out','transfer_out','consumption','damage','waste') THEN -1
    ELSE 0 END;
$$;
REVOKE ALL ON FUNCTION public.movement_sign(text) FROM PUBLIC, authenticated, anon;

CREATE OR REPLACE FUNCTION public.apply_inventory_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s integer := public.movement_sign(NEW.type);
  qty numeric := COALESCE(NEW.base_quantity, NEW.quantity);
  delta numeric;
  prev_qty numeric;
  prev_cost numeric;
  new_cost numeric;
BEGIN
  -- stock count sets an absolute level
  IF NEW.type = 'stock_count' THEN
    delta := qty - COALESCE((SELECT quantity FROM public.inventory_balances b
      WHERE b.product_id = NEW.product_id
        AND b.warehouse_id IS NOT DISTINCT FROM NEW.warehouse_id
        AND b.variant_id IS NOT DISTINCT FROM NEW.variant_id), 0);
  ELSE
    delta := s * qty;
  END IF;

  -- product-level stock (kept for backwards compatibility)
  UPDATE public.products SET stock = stock + delta, updated_at = now() WHERE id = NEW.product_id;

  IF NEW.variant_id IS NOT NULL THEN
    UPDATE public.product_variants SET stock = stock + delta, updated_at = now() WHERE id = NEW.variant_id;
  END IF;

  -- per-location balance with weighted average cost
  SELECT quantity, average_cost INTO prev_qty, prev_cost FROM public.inventory_balances b
    WHERE b.product_id = NEW.product_id
      AND b.warehouse_id IS NOT DISTINCT FROM NEW.warehouse_id
      AND b.variant_id IS NOT DISTINCT FROM NEW.variant_id;

  prev_qty := COALESCE(prev_qty, 0);
  prev_cost := COALESCE(prev_cost, 0);
  IF delta > 0 AND COALESCE(NEW.unit_cost, 0) > 0 AND (prev_qty + delta) > 0 THEN
    new_cost := ((prev_qty * prev_cost) + (delta * NEW.unit_cost)) / (prev_qty + delta);
  ELSE
    new_cost := prev_cost;
  END IF;

  INSERT INTO public.inventory_balances (business_id, product_id, variant_id, warehouse_id, batch_id, quantity, average_cost)
  VALUES (NEW.business_id, NEW.product_id, NEW.variant_id, NEW.warehouse_id, NEW.batch_id, delta, COALESCE(NULLIF(new_cost,0), NEW.unit_cost, 0))
  ON CONFLICT (business_id, product_id,
               COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
               COALESCE(warehouse_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET quantity = public.inventory_balances.quantity + delta,
                average_cost = COALESCE(NULLIF(new_cost,0), public.inventory_balances.average_cost),
                updated_at = now();

  -- transfers add to destination
  IF NEW.type = 'transfer_out' AND NEW.to_warehouse_id IS NOT NULL THEN
    INSERT INTO public.inventory_balances (business_id, product_id, variant_id, warehouse_id, quantity, average_cost)
    VALUES (NEW.business_id, NEW.product_id, NEW.variant_id, NEW.to_warehouse_id, qty, COALESCE(NEW.unit_cost, 0))
    ON CONFLICT (business_id, product_id,
                 COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 COALESCE(warehouse_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET quantity = public.inventory_balances.quantity + qty, updated_at = now();
    -- transfer keeps total company stock unchanged
    UPDATE public.products SET stock = stock + qty WHERE id = NEW.product_id;
  END IF;

  -- batch remaining quantity
  IF NEW.batch_id IS NOT NULL THEN
    UPDATE public.batches SET remaining_quantity = remaining_quantity + delta, updated_at = now() WHERE id = NEW.batch_id;
  END IF;

  -- weighted-average product cost + history
  IF delta > 0 AND COALESCE(NEW.unit_cost,0) > 0 THEN
    INSERT INTO public.cost_history (business_id, product_id, variant_id, old_cost, new_cost, method, reason, created_by)
    SELECT NEW.business_id, NEW.product_id, NEW.variant_id, p.average_cost, new_cost, 'weighted_average', NEW.type, NEW.created_by
    FROM public.products p WHERE p.id = NEW.product_id AND p.average_cost IS DISTINCT FROM new_cost;
    UPDATE public.products SET average_cost = new_cost WHERE id = NEW.product_id;
  END IF;

  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.apply_inventory_movement() FROM PUBLIC, authenticated, anon;

DROP TRIGGER IF EXISTS apply_inventory_movement_trg ON public.inventory_movements;
CREATE TRIGGER apply_inventory_movement_trg
AFTER INSERT ON public.inventory_movements
FOR EACH ROW EXECUTE FUNCTION public.apply_inventory_movement();

-- ============ 15. DEFAULTS FOR NEW + EXISTING BUSINESSES ============
CREATE OR REPLACE FUNCTION public.seed_business_defaults(_business_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
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
END; $$;
REVOKE ALL ON FUNCTION public.seed_business_defaults(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.handle_new_business()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_businesses (user_id, business_id, role)
  VALUES (auth.uid(), NEW.id, 'owner') ON CONFLICT DO NOTHING;
  PERFORM public.seed_business_defaults(NEW.id);
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.handle_new_business() FROM PUBLIC, authenticated, anon;

DROP TRIGGER IF EXISTS handle_new_business_trg ON public.businesses;
CREATE TRIGGER handle_new_business_trg AFTER INSERT ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.handle_new_business();

-- backfill defaults + balances for existing businesses
DO $$
DECLARE b record;
BEGIN
  FOR b IN SELECT id FROM public.businesses LOOP
    PERFORM public.seed_business_defaults(b.id);
  END LOOP;
END $$;

INSERT INTO public.inventory_balances (business_id, product_id, warehouse_id, quantity, average_cost)
SELECT p.business_id, p.id,
       (SELECT w.id FROM public.warehouses w WHERE w.business_id = p.business_id ORDER BY w.is_default DESC, w.created_at LIMIT 1),
       p.stock, p.cost_price
FROM public.products p
ON CONFLICT DO NOTHING;

UPDATE public.products SET average_cost = cost_price WHERE average_cost = 0;

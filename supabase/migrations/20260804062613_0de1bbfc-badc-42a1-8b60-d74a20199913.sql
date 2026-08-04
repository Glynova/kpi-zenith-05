-- 1. Remove duplicate triggers that applied every movement twice
DROP TRIGGER IF EXISTS on_inventory_movement ON public.inventory_movements;
DROP TRIGGER IF EXISTS on_business_created ON public.businesses;
DROP TRIGGER IF EXISTS enforce_po_approval_trg ON public.purchase_orders;
CREATE TRIGGER enforce_po_approval_trg BEFORE INSERT OR UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_po_approval();

-- 2. Business settings: negative stock + production mode
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS allow_negative_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS production_mode text NOT NULL DEFAULT 'make_to_stock';

-- 3. Products: standard cost
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS standard_cost numeric(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS track_warranty boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS warranty_months integer;

-- 4. Movement ledger metadata
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS reference_type text,
  ADD COLUMN IF NOT EXISTS reference_id uuid;

-- 5. FIFO cost layers
CREATE TABLE IF NOT EXISTS public.inventory_cost_layers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  movement_id uuid REFERENCES public.inventory_movements(id) ON DELETE SET NULL,
  quantity numeric(14,3) NOT NULL,
  remaining_quantity numeric(14,3) NOT NULL,
  unit_cost numeric(14,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_cost_layers TO authenticated;
GRANT ALL ON public.inventory_cost_layers TO service_role;
ALTER TABLE public.inventory_cost_layers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read" ON public.inventory_cost_layers;
CREATE POLICY "members read" ON public.inventory_cost_layers FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));
DROP POLICY IF EXISTS "members write" ON public.inventory_cost_layers;
CREATE POLICY "members write" ON public.inventory_cost_layers FOR ALL TO authenticated
  USING (public.can_write_business(business_id)) WITH CHECK (public.can_write_business(business_id));

-- 6. Stock counts
CREATE TABLE IF NOT EXISTS public.stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  reference text,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  counted_by uuid DEFAULT auth.uid(),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_counts TO authenticated;
GRANT ALL ON public.stock_counts TO service_role;
ALTER TABLE public.stock_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read" ON public.stock_counts FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));
CREATE POLICY "members write" ON public.stock_counts FOR ALL TO authenticated
  USING (public.can_write_business(business_id)) WITH CHECK (public.can_write_business(business_id));
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.stock_counts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.stock_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  stock_count_id uuid NOT NULL REFERENCES public.stock_counts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  expected_quantity numeric(14,3) NOT NULL DEFAULT 0,
  counted_quantity numeric(14,3),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_count_items TO authenticated;
GRANT ALL ON public.stock_count_items TO service_role;
ALTER TABLE public.stock_count_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read" ON public.stock_count_items FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));
CREATE POLICY "members write" ON public.stock_count_items FOR ALL TO authenticated
  USING (public.can_write_business(business_id)) WITH CHECK (public.can_write_business(business_id));

-- 7. Uniqueness guards
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode ON public.products (business_id, barcode) WHERE barcode IS NOT NULL AND barcode <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_variants_sku ON public.product_variants (business_id, sku) WHERE sku IS NOT NULL AND sku <> '';
CREATE INDEX IF NOT EXISTS idx_variants_barcode ON public.product_variants (business_id, barcode) WHERE barcode IS NOT NULL AND barcode <> '';

-- 8. Performance indexes
CREATE INDEX IF NOT EXISTS idx_movements_product ON public.inventory_movements (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_type ON public.inventory_movements (business_id, type);
CREATE INDEX IF NOT EXISTS idx_movements_warehouse ON public.inventory_movements (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_balances_lookup ON public.inventory_balances (business_id, product_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_layers_lookup ON public.inventory_cost_layers (business_id, product_id, warehouse_id, created_at);
CREATE INDEX IF NOT EXISTS idx_variants_product ON public.product_variants (product_id);
CREATE INDEX IF NOT EXISTS idx_batches_product ON public.batches (product_id, expiry_date);

-- 9. Negative stock guard
CREATE OR REPLACE FUNCTION public.guard_negative_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  allow boolean;
  s integer := public.movement_sign(NEW.type);
  qty numeric := COALESCE(NEW.base_quantity, NEW.quantity);
  current_qty numeric;
BEGIN
  IF s >= 0 OR NEW.type = 'stock_count' THEN RETURN NEW; END IF;
  SELECT bs.allow_negative_stock INTO allow FROM public.business_settings bs WHERE bs.business_id = NEW.business_id;
  IF COALESCE(allow, false) THEN RETURN NEW; END IF;

  SELECT COALESCE(b.quantity, 0) INTO current_qty FROM public.inventory_balances b
   WHERE b.business_id = NEW.business_id
     AND b.product_id = NEW.product_id
     AND b.warehouse_id IS NOT DISTINCT FROM NEW.warehouse_id
     AND b.variant_id IS NOT DISTINCT FROM NEW.variant_id;

  IF COALESCE(current_qty, 0) < qty THEN
    RAISE EXCEPTION 'Not enough stock: % available, % requested', COALESCE(current_qty,0), qty;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.guard_negative_stock() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_negative_stock_trg ON public.inventory_movements;
CREATE TRIGGER guard_negative_stock_trg BEFORE INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.guard_negative_stock();

-- 10. Cost layers maintained by the movement trigger (FIFO support)
CREATE OR REPLACE FUNCTION public.apply_cost_layers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s integer := public.movement_sign(NEW.type);
  qty numeric := COALESCE(NEW.base_quantity, NEW.quantity);
  method text;
  need numeric;
  take numeric;
  cost_sum numeric := 0;
  layer record;
BEGIN
  SELECT bs.costing_method INTO method FROM public.business_settings bs WHERE bs.business_id = NEW.business_id;

  IF s > 0 THEN
    INSERT INTO public.inventory_cost_layers
      (business_id, product_id, variant_id, warehouse_id, movement_id, quantity, remaining_quantity, unit_cost)
    VALUES (NEW.business_id, NEW.product_id, NEW.variant_id, NEW.warehouse_id, NEW.id, qty, qty, COALESCE(NEW.unit_cost, 0));
    RETURN NEW;
  END IF;

  IF s < 0 THEN
    need := qty;
    FOR layer IN
      SELECT * FROM public.inventory_cost_layers l
      WHERE l.business_id = NEW.business_id AND l.product_id = NEW.product_id
        AND l.variant_id IS NOT DISTINCT FROM NEW.variant_id
        AND l.warehouse_id IS NOT DISTINCT FROM NEW.warehouse_id
        AND l.remaining_quantity > 0
      ORDER BY l.created_at
    LOOP
      EXIT WHEN need <= 0;
      take := LEAST(need, layer.remaining_quantity);
      UPDATE public.inventory_cost_layers SET remaining_quantity = remaining_quantity - take WHERE id = layer.id;
      cost_sum := cost_sum + (take * layer.unit_cost);
      need := need - take;
    END LOOP;

    IF method = 'fifo' AND qty > 0 AND (qty - need) > 0 THEN
      UPDATE public.inventory_movements
        SET unit_cost = ROUND(cost_sum / NULLIF(qty - need, 0), 2), total_cost = cost_sum
        WHERE id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.apply_cost_layers() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS apply_cost_layers_trg ON public.inventory_movements;
CREATE TRIGGER apply_cost_layers_trg AFTER INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_cost_layers();
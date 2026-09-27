ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS internal_ref text,
  ADD COLUMN IF NOT EXISTS subcategory_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS weight numeric,
  ADD COLUMN IF NOT EXISTS dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS wholesale_price numeric,
  ADD COLUMN IF NOT EXISTS reorder_quantity numeric,
  ADD COLUMN IF NOT EXISTS supplier_item_code text,
  ADD COLUMN IF NOT EXISTS bin_location text,
  ADD COLUMN IF NOT EXISTS price_includes_tax boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_sellable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_purchasable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS category_attributes jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS weight numeric,
  ADD COLUMN IF NOT EXISTS wholesale_price numeric,
  ADD COLUMN IF NOT EXISTS supplier_item_code text,
  ADD COLUMN IF NOT EXISTS min_stock numeric,
  ADD COLUMN IF NOT EXISTS max_stock numeric,
  ADD COLUMN IF NOT EXISTS reorder_quantity numeric,
  ADD COLUMN IF NOT EXISTS bin_location text;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attribute_schema jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.guard_parent_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.variant_id IS NULL AND EXISTS (
    SELECT 1 FROM public.products p WHERE p.id = NEW.product_id AND p.has_variants
  ) THEN
    RAISE EXCEPTION 'This product has variants — stock must be recorded against a specific variant.';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_parent_stock() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_parent_stock ON public.inventory_movements;
CREATE TRIGGER trg_guard_parent_stock BEFORE INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.guard_parent_stock();
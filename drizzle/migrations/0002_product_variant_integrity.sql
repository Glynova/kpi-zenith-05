-- Variant dimension definitions live on the parent product (single catalog).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS variant_options jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Unique SKU / barcode per business; unique attribute combination per product.
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_business_sku_key
  ON public.product_variants (business_id, lower(sku))
  WHERE sku IS NOT NULL AND btrim(sku) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS product_variants_business_barcode_key
  ON public.product_variants (business_id, lower(barcode))
  WHERE barcode IS NOT NULL AND btrim(barcode) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS product_variants_combination_key
  ON public.product_variants (product_id, attributes)
  WHERE attributes <> '{}'::jsonb;

CREATE INDEX IF NOT EXISTS product_variants_product_idx
  ON public.product_variants (product_id);

-- Never hard-delete a variant that carries stock or transaction history.
CREATE OR REPLACE FUNCTION public.guard_variant_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(OLD.stock, 0) <> 0
     OR EXISTS (SELECT 1 FROM public.sale_items WHERE variant_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.purchase_order_items WHERE variant_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.goods_receipt_items WHERE variant_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.inventory_movements WHERE variant_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.inventory_balances WHERE variant_id = OLD.id AND quantity <> 0)
     OR EXISTS (SELECT 1 FROM public.serial_numbers WHERE variant_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.batches WHERE variant_id = OLD.id)
  THEN
    RAISE EXCEPTION 'This variant has stock or transaction history. Archive it instead of deleting it.';
  END IF;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS guard_variant_delete ON public.product_variants;
CREATE TRIGGER guard_variant_delete
  BEFORE DELETE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.guard_variant_delete();

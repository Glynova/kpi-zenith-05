ALTER TABLE public.goods_receipt_items ADD COLUMN IF NOT EXISTS condition text;

CREATE OR REPLACE FUNCTION public.guard_purchase_line_variant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE po_variant uuid;
BEGIN
  IF NEW.variant_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.product_variants v
               WHERE v.product_id = NEW.product_id AND COALESCE(v.status,'active') <> 'archived') THEN
      RAISE EXCEPTION 'Choose a variant';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.product_variants v
                   WHERE v.id = NEW.variant_id AND v.product_id = NEW.product_id
                     AND v.business_id = NEW.business_id) THEN
      RAISE EXCEPTION 'Variant does not belong to this item';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'goods_receipt_items' AND NEW.purchase_order_item_id IS NOT NULL THEN
    SELECT variant_id INTO po_variant FROM public.purchase_order_items WHERE id = NEW.purchase_order_item_id;
    IF po_variant IS DISTINCT FROM NEW.variant_id THEN
      RAISE EXCEPTION 'Received variant does not match the order line';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.guard_purchase_line_variant() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_po_item_variant ON public.purchase_order_items;
CREATE TRIGGER trg_guard_po_item_variant BEFORE INSERT OR UPDATE OF product_id, variant_id
  ON public.purchase_order_items FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_line_variant();
DROP TRIGGER IF EXISTS trg_guard_gr_item_variant ON public.goods_receipt_items;
CREATE TRIGGER trg_guard_gr_item_variant BEFORE INSERT OR UPDATE OF product_id, variant_id, purchase_order_item_id
  ON public.goods_receipt_items FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_line_variant();
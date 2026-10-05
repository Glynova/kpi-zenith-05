CREATE OR REPLACE FUNCTION public.guard_purchase_line_variant()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE po_variant uuid; po_item uuid;
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
  IF TG_TABLE_NAME = 'goods_receipt_items' THEN
    po_item := NULLIF(to_jsonb(NEW)->>'purchase_order_item_id','')::uuid;
    IF po_item IS NOT NULL THEN
      SELECT variant_id INTO po_variant FROM public.purchase_order_items WHERE id = po_item;
      IF po_variant IS DISTINCT FROM NEW.variant_id THEN
        RAISE EXCEPTION 'Received variant does not match the order line';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $function$;
REVOKE EXECUTE ON FUNCTION public.guard_purchase_line_variant() FROM PUBLIC, anon;
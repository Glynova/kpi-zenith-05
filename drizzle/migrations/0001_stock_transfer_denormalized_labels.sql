ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS source_business_name text,
  ADD COLUMN IF NOT EXISTS dest_business_name text,
  ADD COLUMN IF NOT EXISTS source_warehouse_name text,
  ADD COLUMN IF NOT EXISTS dest_warehouse_name text;

ALTER TABLE public.stock_transfer_items
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS product_sku text,
  ADD COLUMN IF NOT EXISTS product_barcode text;

CREATE OR REPLACE FUNCTION public.stamp_stock_transfer_labels()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  NEW.source_business_name := (SELECT name FROM public.businesses WHERE id = NEW.source_business_id);
  NEW.dest_business_name := (SELECT name FROM public.businesses WHERE id = NEW.dest_business_id);
  NEW.source_warehouse_name := (SELECT name FROM public.warehouses WHERE id = NEW.source_warehouse_id);
  NEW.dest_warehouse_name := (SELECT name FROM public.warehouses WHERE id = NEW.dest_warehouse_id);
  RETURN NEW;
END; $$;

CREATE TRIGGER stock_transfers_stamp_labels BEFORE INSERT ON public.stock_transfers
FOR EACH ROW EXECUTE FUNCTION public.stamp_stock_transfer_labels();

CREATE OR REPLACE FUNCTION public.stamp_stock_transfer_item_labels()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  SELECT p.name, p.sku, p.barcode INTO NEW.product_name, NEW.product_sku, NEW.product_barcode
  FROM public.products p WHERE p.id = NEW.product_id;
  RETURN NEW;
END; $$;

CREATE TRIGGER stock_transfer_items_stamp_labels BEFORE INSERT ON public.stock_transfer_items
FOR EACH ROW EXECUTE FUNCTION public.stamp_stock_transfer_item_labels();
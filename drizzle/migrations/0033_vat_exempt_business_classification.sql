CREATE OR REPLACE FUNCTION public.snapshot_sale_on_post()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE comp public.business_compliance%ROWTYPE; c record; base numeric; ex numeric; zr numeric; is_sale boolean;
BEGIN
  IF NEW.inventory_posted AND NOT COALESCE(OLD.inventory_posted,false) THEN
    is_sale := NEW.document_type IN ('sale','pos_sale');
    INSERT INTO public.business_compliance (business_id) VALUES (NEW.business_id) ON CONFLICT DO NOTHING;
    SELECT * INTO comp FROM public.business_compliance WHERE business_id = NEW.business_id FOR UPDATE;
    IF NEW.customer_id IS NOT NULL THEN
      SELECT name, tax_id INTO c FROM public.customers WHERE id = NEW.customer_id;
      NEW.customer_name_snapshot := c.name; NEW.customer_tin_snapshot := c.tax_id;
    END IF;
    base := GREATEST(COALESCE(NEW.subtotal,0) - COALESCE(NEW.discount,0), 0);
    IF comp.is_vat_registered THEN
      SELECT COALESCE(SUM(CASE WHEN tax_type='VAT_EXEMPT' OR (tax_type IS NULL AND COALESCE(tax_rate,0)=0) THEN quantity*unit_price - COALESCE(discount,0) END),0),
             COALESCE(SUM(CASE WHEN tax_type='ZERO_RATED' THEN quantity*unit_price - COALESCE(discount,0) END),0)
        INTO ex, zr FROM public.sale_items WHERE sale_id = NEW.id;
      NEW.vat_exempt_amount := LEAST(ex, base); NEW.zero_rated_amount := LEAST(zr, base - NEW.vat_exempt_amount);
      NEW.vatable_amount := GREATEST(base - NEW.vat_exempt_amount - NEW.zero_rated_amount, 0);
      NEW.vat_amount := COALESCE(NEW.tax,0); NEW.non_vat_amount := 0;
    ELSIF comp.vat_registration_type = 'vat_exempt' THEN
      -- VAT-exempt business: no output VAT, and sales are reported as VAT-exempt, not as ordinary non-VAT sales.
      NEW.vatable_amount := 0; NEW.vat_amount := 0; NEW.zero_rated_amount := 0;
      NEW.vat_exempt_amount := base; NEW.non_vat_amount := 0;
    ELSE
      NEW.vatable_amount := 0; NEW.vat_amount := 0; NEW.vat_exempt_amount := 0; NEW.zero_rated_amount := 0;
      NEW.non_vat_amount := base;
    END IF;
    IF is_sale THEN
      NEW.grand_total_before := comp.last_grand_total;
      NEW.grand_total_after := comp.last_grand_total + COALESCE(NEW.total,0);
      UPDATE public.business_compliance SET last_grand_total = NEW.grand_total_after WHERE business_id = NEW.business_id;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- is_vat_registered must mean "charges output VAT"; only 'vat' qualifies.
UPDATE public.business_compliance SET is_vat_registered = (vat_registration_type = 'vat')
 WHERE is_vat_registered IS DISTINCT FROM (vat_registration_type = 'vat');
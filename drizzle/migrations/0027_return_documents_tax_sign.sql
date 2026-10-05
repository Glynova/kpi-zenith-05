
CREATE OR REPLACE FUNCTION public.snapshot_sale_on_post() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
END $$;

CREATE OR REPLACE FUNCTION public.after_sale_posted() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rate numeric; sg int; src text;
BEGIN
  sg := CASE WHEN NEW.document_type IN ('sale','pos_sale') THEN 1 ELSE -1 END;
  src := CASE WHEN sg = 1 THEN 'sale' ELSE 'sales_return' END;
  PERFORM set_config('app.fin_bypass','on',true);
  UPDATE public.sale_items si SET unit_cost = ROUND(m.cost / NULLIF(si.quantity,0), 4)
    FROM (SELECT product_id, variant_id, SUM(COALESCE(total_cost, unit_cost*quantity)) cost
            FROM public.inventory_movements WHERE reference_type='sale' AND reference_id=NEW.id AND type='sale'
           GROUP BY 1,2) m
   WHERE si.sale_id = NEW.id AND si.product_id = m.product_id AND si.variant_id IS NOT DISTINCT FROM m.variant_id
     AND (SELECT count(*) FROM public.sale_items x WHERE x.sale_id=NEW.id AND x.product_id=si.product_id AND x.variant_id IS NOT DISTINCT FROM si.variant_id) = 1;
  UPDATE public.sale_items si SET variant_label = COALESCE(si.variant_label, v.name)
    FROM public.product_variants v WHERE si.sale_id = NEW.id AND v.id = si.variant_id;
  PERFORM set_config('app.fin_bypass','off',true);
  rate := CASE WHEN NEW.vatable_amount > 0 THEN ROUND(NEW.vat_amount / NEW.vatable_amount * 100, 2) ELSE 0 END;
  IF NEW.vatable_amount > 0 OR NEW.vat_amount > 0 THEN
    INSERT INTO public.tax_transactions (business_id, source_type, source_id, reference, tax_type, taxable_amount, rate, tax_amount, counterparty_name, counterparty_tin, txn_date)
    VALUES (NEW.business_id, src, NEW.id, NEW.sale_number, 'VAT', sg*NEW.vatable_amount, rate, sg*NEW.vat_amount, NEW.customer_name_snapshot, NEW.customer_tin_snapshot, NEW.sale_date);
  END IF;
  IF NEW.vat_exempt_amount > 0 THEN
    INSERT INTO public.tax_transactions (business_id, source_type, source_id, reference, tax_type, taxable_amount, counterparty_name, counterparty_tin, txn_date)
    VALUES (NEW.business_id, src, NEW.id, NEW.sale_number, 'VAT_EXEMPT', sg*NEW.vat_exempt_amount, NEW.customer_name_snapshot, NEW.customer_tin_snapshot, NEW.sale_date);
  END IF;
  IF NEW.zero_rated_amount > 0 THEN
    INSERT INTO public.tax_transactions (business_id, source_type, source_id, reference, tax_type, taxable_amount, counterparty_name, counterparty_tin, txn_date)
    VALUES (NEW.business_id, src, NEW.id, NEW.sale_number, 'ZERO_RATED', sg*NEW.zero_rated_amount, NEW.customer_name_snapshot, NEW.customer_tin_snapshot, NEW.sale_date);
  END IF;
  PERFORM public._audit(NEW.business_id, CASE WHEN sg = 1 THEN 'POST' ELSE 'REFUND' END, 'sales', NEW.id::text, NULL,
    jsonb_build_object('sale_number', NEW.sale_number, 'total', NEW.total, 'cost_total', NEW.cost_total, 'original_sale_id', NEW.original_sale_id, 'grand_total_after', NEW.grand_total_after));
  RETURN NEW;
END $$;

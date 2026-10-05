
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS line_cogs numeric;

CREATE OR REPLACE FUNCTION public.after_sale_posted() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rate numeric; sg int; src text;
BEGIN
  sg := CASE WHEN NEW.document_type IN ('sale','pos_sale') THEN 1 ELSE -1 END;
  src := CASE WHEN sg = 1 THEN 'sale' ELSE 'sales_return' END;
  PERFORM set_config('app.fin_bypass','on',true);
  UPDATE public.sale_items si SET unit_cost = ROUND(m.cost / NULLIF(si.quantity,0), 4), line_cogs = m.cost
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

CREATE OR REPLACE FUNCTION public.ar_aging(_business_id uuid, _as_of date)
RETURNS TABLE(customer_id uuid, customer_name text, current_amt numeric, d1_30 numeric, d31_60 numeric, d61_90 numeric, d91_120 numeric, d121_plus numeric, total numeric, open_items int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH open_ar AS (
    SELECT ar.customer_id, GREATEST(ar.amount - COALESCE(ar.paid,0), 0) AS bal,
           (_as_of - COALESCE(ar.due_date, s.due_date, s.sale_date, ar.created_at::date)) AS days
      FROM public.accounts_receivable ar LEFT JOIN public.sales s ON s.id = ar.sale_id
     WHERE ar.business_id = _business_id AND public.is_business_member(_business_id)
       AND ar.status NOT IN ('settled','written_off') AND COALESCE(s.status,'') <> 'voided'
       AND COALESCE(s.sale_date, ar.created_at::date) <= _as_of
       AND ar.amount - COALESCE(ar.paid,0) > 0.009
  )
  SELECT o.customer_id, COALESCE(c.name, 'No customer'),
    SUM(CASE WHEN days <= 0 THEN bal ELSE 0 END), SUM(CASE WHEN days BETWEEN 1 AND 30 THEN bal ELSE 0 END),
    SUM(CASE WHEN days BETWEEN 31 AND 60 THEN bal ELSE 0 END), SUM(CASE WHEN days BETWEEN 61 AND 90 THEN bal ELSE 0 END),
    SUM(CASE WHEN days BETWEEN 91 AND 120 THEN bal ELSE 0 END), SUM(CASE WHEN days > 120 THEN bal ELSE 0 END),
    SUM(bal), count(*)::int
  FROM open_ar o LEFT JOIN public.customers c ON c.id = o.customer_id
  GROUP BY o.customer_id, c.name ORDER BY SUM(bal) DESC;
$$;

-- transfers carry the actual cost the source engine (FIFO layers or average) took out
CREATE OR REPLACE FUNCTION public.sync_transfer_cost_basis() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record;
BEGIN
  SELECT unit_cost, total_cost, quantity INTO m FROM public.inventory_movements WHERE id = NEW.id;
  UPDATE public.stock_transfer_items SET unit_cost = ROUND(m.total_cost / NULLIF(m.quantity,0), 4)
   WHERE transfer_id = NEW.reference_id AND product_id = NEW.product_id AND variant_id IS NOT DISTINCT FROM NEW.variant_id
     AND received_quantity IS NULL;
  UPDATE public.stock_transfers t SET total_value = (SELECT COALESCE(SUM(quantity*unit_cost),0) FROM public.stock_transfer_items WHERE transfer_id = t.id)
   WHERE t.id = NEW.reference_id AND t.status = 'pending_receipt';
  RETURN NEW;
END $$;
CREATE TRIGGER zz_sync_transfer_cost_basis AFTER INSERT ON public.inventory_movements FOR EACH ROW
  WHEN (NEW.type = 'transfer_out' AND NEW.reference_type = 'stock_transfer') EXECUTE FUNCTION public.sync_transfer_cost_basis();

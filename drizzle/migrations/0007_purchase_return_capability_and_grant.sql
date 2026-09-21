CREATE OR REPLACE FUNCTION public.post_purchase_return(_return_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE pr public.purchase_returns%ROWTYPE; it record; amount numeric := 0;
BEGIN
  SELECT * INTO pr FROM public.purchase_returns WHERE id = _return_id FOR UPDATE;
  IF pr.id IS NULL THEN RAISE EXCEPTION 'Return not found'; END IF;
  IF NOT public.can_write_business(pr.business_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF pr.status <> 'draft' THEN RAISE EXCEPTION 'This return was already posted'; END IF;

  PERFORM public.require_capability(pr.business_id, 'enable_returns', 'Supplier returns');
  PERFORM public.require_capability(pr.business_id, 'enable_purchasing', 'Purchasing');

  FOR it IN SELECT * FROM public.purchase_return_items WHERE return_id = _return_id LOOP
    IF it.quantity > 0 THEN
      INSERT INTO public.inventory_movements
        (business_id, product_id, variant_id, warehouse_id, type, quantity, base_quantity,
         unit_cost, total_cost, reference, reference_type, reference_id, movement_date, reason, created_by)
      VALUES (pr.business_id, it.product_id, it.variant_id, pr.warehouse_id, 'return_out',
        it.quantity, it.quantity, it.unit_cost, it.quantity * it.unit_cost,
        pr.return_number, 'purchase_return', pr.id, pr.return_date, pr.reason, pr.created_by);
      amount := amount + (it.quantity * it.unit_cost);
    END IF;
  END LOOP;

  UPDATE public.purchase_returns SET status = 'posted', total = amount WHERE id = _return_id;

  IF amount > 0 THEN
    INSERT INTO public.supplier_credits (business_id, supplier_id, purchase_return_id, amount, status, notes)
    VALUES (pr.business_id, pr.supplier_id, pr.id, amount, 'open', 'Credit from return ' || pr.return_number);
  END IF;

  INSERT INTO public.audit_logs (business_id, user_id, action, module, record_id, new_value)
  VALUES (pr.business_id, auth.uid(), 'purchase_return', 'purchasing', pr.return_number,
          jsonb_build_object('amount', amount));
END; $function$;

REVOKE ALL ON FUNCTION public.post_purchase_return(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_purchase_return(uuid) TO authenticated, service_role;
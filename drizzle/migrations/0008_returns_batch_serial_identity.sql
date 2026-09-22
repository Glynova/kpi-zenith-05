-- Exact batch / serial identity on returns.
alter table public.sale_items add column if not exists batch_id uuid references public.batches(id);
alter table public.sale_items add column if not exists serial_ids uuid[];
alter table public.purchase_return_items add column if not exists batch_id uuid references public.batches(id);
alter table public.purchase_return_items add column if not exists serial_ids uuid[];

create index if not exists sale_items_batch_idx on public.sale_items(batch_id);
create index if not exists purchase_return_items_batch_idx on public.purchase_return_items(batch_id);

-- Goods receipt now records real batch balances so batch identity is usable.
create or replace function public.confirm_goods_receipt(_receipt_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  gr public.goods_receipts%ROWTYPE;
  po public.purchase_orders%ROWTYPE;
  it record;
  bid uuid;
  batch uuid;
  terms text;
  due date;
  payable numeric := 0;
  remaining numeric;
  s text;
BEGIN
  SELECT * INTO gr FROM public.goods_receipts WHERE id = _receipt_id;
  IF gr.id IS NULL THEN RAISE EXCEPTION 'Goods receipt not found'; END IF;
  IF NOT public.can_write_business(gr.business_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF gr.status <> 'draft' THEN RAISE EXCEPTION 'Only draft receipts can be confirmed'; END IF;
  bid := gr.business_id;

  FOR it IN SELECT * FROM public.goods_receipt_items WHERE receipt_id = _receipt_id LOOP
    IF it.accepted_quantity > 0 THEN
      batch := NULL;
      IF it.batch_number IS NOT NULL AND it.batch_number <> '' THEN
        SELECT id INTO batch FROM public.batches
         WHERE business_id = bid AND product_id = it.product_id
           AND variant_id IS NOT DISTINCT FROM it.variant_id
           AND warehouse_id IS NOT DISTINCT FROM gr.warehouse_id
           AND batch_number = it.batch_number
         LIMIT 1;
        IF batch IS NULL THEN
          INSERT INTO public.batches (business_id, product_id, variant_id, warehouse_id, supplier_id,
            batch_number, manufactured_date, expiry_date, quantity, remaining_quantity, unit_cost, status)
          VALUES (bid, it.product_id, it.variant_id, gr.warehouse_id, gr.supplier_id,
            it.batch_number, it.manufactured_date, it.expiry_date,
            it.accepted_quantity, it.accepted_quantity, it.unit_cost, 'active')
          RETURNING id INTO batch;
        ELSE
          UPDATE public.batches
             SET quantity = COALESCE(quantity,0) + it.accepted_quantity,
                 remaining_quantity = COALESCE(remaining_quantity,0) + it.accepted_quantity,
                 unit_cost = it.unit_cost,
                 expiry_date = COALESCE(it.expiry_date, expiry_date),
                 updated_at = now()
           WHERE id = batch;
        END IF;
      END IF;

      INSERT INTO public.inventory_movements
        (business_id, product_id, variant_id, warehouse_id, batch_id, batch_number, type, quantity, base_quantity,
         unit, unit_cost, total_cost, reference, reference_type, reference_id, movement_date, notes, created_by)
      VALUES (bid, it.product_id, it.variant_id, gr.warehouse_id, batch, it.batch_number, 'purchase',
         it.accepted_quantity, it.accepted_quantity, it.unit, it.unit_cost,
         it.accepted_quantity * it.unit_cost, gr.receipt_number, 'goods_receipt', gr.id,
         gr.receipt_date, 'Goods receipt ' || gr.receipt_number, gr.received_by);

      payable := payable + (it.accepted_quantity * it.unit_cost);

      INSERT INTO public.supplier_price_history
        (business_id, supplier_id, product_id, variant_id, price, currency, source, reference, effective_date, created_by)
      VALUES (bid, gr.supplier_id, it.product_id, it.variant_id, it.unit_cost, NULL,
        'goods_receipt', gr.receipt_number, gr.receipt_date, gr.received_by);

      UPDATE public.supplier_products
        SET last_purchase_price = it.unit_cost, last_purchase_date = gr.receipt_date, updated_at = now()
        WHERE business_id = bid AND supplier_id = gr.supplier_id AND product_id = it.product_id;
    END IF;

    IF it.purchase_order_item_id IS NOT NULL THEN
      UPDATE public.purchase_order_items
        SET received_quantity = COALESCE(received_quantity,0) + it.accepted_quantity,
            damaged_quantity = COALESCE(damaged_quantity,0) + it.damaged_quantity,
            rejected_quantity = COALESCE(rejected_quantity,0) + it.rejected_quantity
        WHERE id = it.purchase_order_item_id;
    END IF;
  END LOOP;

  UPDATE public.goods_receipts SET status = 'confirmed', confirmed_at = now() WHERE id = _receipt_id;

  IF gr.purchase_order_id IS NOT NULL THEN
    SELECT * INTO po FROM public.purchase_orders WHERE id = gr.purchase_order_id;
    SELECT COALESCE(SUM(GREATEST(quantity - COALESCE(received_quantity,0) - COALESCE(damaged_quantity,0) - COALESCE(rejected_quantity,0), 0)), 0)
      INTO remaining FROM public.purchase_order_items WHERE purchase_order_id = po.id;
    s := CASE WHEN remaining <= 0 THEN 'received' ELSE 'partially_received' END;
    UPDATE public.purchase_orders SET status = s WHERE id = po.id;
    terms := COALESCE(po.payment_terms, (SELECT payment_terms FROM public.suppliers WHERE id = gr.supplier_id), 'due_on_receipt');
  ELSE
    terms := COALESCE((SELECT payment_terms FROM public.suppliers WHERE id = gr.supplier_id), 'due_on_receipt');
  END IF;

  IF payable > 0 THEN
    due := gr.receipt_date + public.payment_terms_days(terms);
    INSERT INTO public.accounts_payable (business_id, supplier_id, purchase_order_id, amount, paid, due_date, status, notes)
    VALUES (bid, gr.supplier_id, gr.purchase_order_id, payable, 0, due, 'open',
            'Goods receipt ' || gr.receipt_number);
  END IF;

  INSERT INTO public.audit_logs (business_id, user_id, action, module, record_id, new_value)
  VALUES (bid, auth.uid(), 'goods_received', 'purchasing', gr.receipt_number,
          jsonb_build_object('receipt', gr.receipt_number, 'amount', payable));
END; $function$;

-- Shared validation for batch / serial identity on a return line.
create or replace function public.validate_return_identity(
  _business_id uuid, _product_id uuid, _variant_id uuid, _warehouse_id uuid,
  _batch_id uuid, _serial_ids uuid[], _quantity numeric, _label text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $$
DECLARE
  p public.products%ROWTYPE;
  b public.batches%ROWTYPE;
  n integer;
BEGIN
  SELECT * INTO p FROM public.products WHERE id = _product_id;

  IF _batch_id IS NOT NULL THEN
    SELECT * INTO b FROM public.batches WHERE id = _batch_id FOR UPDATE;
    IF b.id IS NULL OR b.business_id <> _business_id THEN
      RAISE EXCEPTION '%: that batch does not belong to this business', _label;
    END IF;
    IF b.product_id <> _product_id OR b.variant_id IS DISTINCT FROM _variant_id THEN
      RAISE EXCEPTION '%: the batch belongs to a different item or variant', _label;
    END IF;
  ELSIF COALESCE(p.track_batch, false) AND public.capability_enabled(_business_id, 'track_batch') THEN
    RAISE EXCEPTION '%: this item is batch tracked — choose the batch', _label;
  END IF;

  IF _serial_ids IS NOT NULL AND array_length(_serial_ids, 1) IS NOT NULL THEN
    SELECT count(*) INTO n FROM public.serial_numbers
     WHERE id = ANY(_serial_ids) AND business_id = _business_id
       AND product_id = _product_id AND variant_id IS NOT DISTINCT FROM _variant_id;
    IF n <> array_length(_serial_ids, 1) THEN
      RAISE EXCEPTION '%: one or more serial numbers do not match this item or variant', _label;
    END IF;
    IF n <> _quantity THEN
      RAISE EXCEPTION '%: pick exactly % serial number(s)', _label, _quantity;
    END IF;
  ELSIF COALESCE(p.track_serial, false) AND public.capability_enabled(_business_id, 'track_serial') THEN
    RAISE EXCEPTION '%: this item is serial tracked — choose the serial numbers', _label;
  END IF;
END; $$;

revoke all on function public.validate_return_identity(uuid,uuid,uuid,uuid,uuid,uuid[],numeric,text) from public, anon;
grant execute on function public.validate_return_identity(uuid,uuid,uuid,uuid,uuid,uuid[],numeric,text) to authenticated, service_role;

-- Supplier return: exact identity + batch balance + serial lifecycle.
create or replace function public.post_purchase_return(_return_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE pr public.purchase_returns%ROWTYPE; it record; amount numeric := 0; bnum text;
BEGIN
  SELECT * INTO pr FROM public.purchase_returns WHERE id = _return_id FOR UPDATE;
  IF pr.id IS NULL THEN RAISE EXCEPTION 'Return not found'; END IF;
  IF NOT public.can_write_business(pr.business_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF pr.status <> 'draft' THEN RAISE EXCEPTION 'This return was already posted'; END IF;

  PERFORM public.require_capability(pr.business_id, 'enable_returns', 'Supplier returns');
  PERFORM public.require_capability(pr.business_id, 'enable_purchasing', 'Purchasing');

  FOR it IN SELECT * FROM public.purchase_return_items WHERE return_id = _return_id LOOP
    IF it.quantity > 0 THEN
      PERFORM public.validate_return_identity(pr.business_id, it.product_id, it.variant_id,
        pr.warehouse_id, it.batch_id, it.serial_ids, it.quantity, 'Return line');

      bnum := NULL;
      IF it.batch_id IS NOT NULL THEN
        SELECT batch_number INTO bnum FROM public.batches WHERE id = it.batch_id;
        UPDATE public.batches
           SET remaining_quantity = COALESCE(remaining_quantity,0) - it.quantity, updated_at = now()
         WHERE id = it.batch_id;
        IF (SELECT remaining_quantity FROM public.batches WHERE id = it.batch_id) < -0.0001 THEN
          RAISE EXCEPTION 'Batch % does not have % left to return', bnum, it.quantity;
        END IF;
      END IF;

      IF it.serial_ids IS NOT NULL THEN
        UPDATE public.serial_numbers
           SET status = 'returned', warehouse_id = NULL, updated_at = now()
         WHERE id = ANY(it.serial_ids) AND business_id = pr.business_id;
      END IF;

      INSERT INTO public.inventory_movements
        (business_id, product_id, variant_id, warehouse_id, batch_id, batch_number, type, quantity, base_quantity,
         unit_cost, total_cost, reference, reference_type, reference_id, movement_date, reason, created_by)
      VALUES (pr.business_id, it.product_id, it.variant_id, pr.warehouse_id, it.batch_id, bnum, 'return_out',
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

revoke all on function public.post_purchase_return(uuid) from public, anon;
grant execute on function public.post_purchase_return(uuid) to authenticated, service_role;
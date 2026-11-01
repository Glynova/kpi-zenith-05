ALTER TABLE public.unit_conversions
  ADD COLUMN IF NOT EXISTS variant_id uuid
    REFERENCES public.product_variants(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.unit_conversions'::regclass
       AND conname = 'unit_conversions_variant_requires_product_check'
  ) THEN
    ALTER TABLE public.unit_conversions
      ADD CONSTRAINT unit_conversions_variant_requires_product_check
      CHECK (variant_id IS NULL OR product_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS unit_conversions_item_scope_idx
  ON public.unit_conversions (business_id, product_id, variant_id);

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS entered_quantity numeric,
  ADD COLUMN IF NOT EXISTS entered_unit text;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS entered_quantity numeric,
  ADD COLUMN IF NOT EXISTS entered_unit text;

ALTER TABLE public.goods_receipt_items
  ADD COLUMN IF NOT EXISTS entered_received_quantity numeric,
  ADD COLUMN IF NOT EXISTS entered_damaged_quantity numeric,
  ADD COLUMN IF NOT EXISTS entered_rejected_quantity numeric,
  ADD COLUMN IF NOT EXISTS entered_unit text;

ALTER TABLE public.stock_count_items
  ADD COLUMN IF NOT EXISTS entered_counted_quantity numeric,
  ADD COLUMN IF NOT EXISTS entered_unit text;

ALTER TABLE public.stock_transfer_items
  ADD COLUMN IF NOT EXISTS entered_quantity numeric,
  ADD COLUMN IF NOT EXISTS entered_unit text;

ALTER TABLE public.bom_items
  ADD COLUMN IF NOT EXISTS variant_id uuid
    REFERENCES public.product_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entered_quantity numeric,
  ADD COLUMN IF NOT EXISTS entered_unit text;

CREATE OR REPLACE FUNCTION public.guard_unit_conversion_capability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  stock_unit text;
BEGIN
  IF COALESCE(current_setting('app.seeding_business_defaults', true), '') <> 'on' THEN
    PERFORM public.require_capability(NEW.business_id, 'enable_unit_conversion', 'Unit conversion');
  END IF;

  IF NEW.factor IS NULL OR NEW.factor <= 0 THEN
    RAISE EXCEPTION 'Conversion factor must be greater than zero'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.variant_id IS NOT NULL AND NEW.product_id IS NULL THEN
    RAISE EXCEPTION 'A variant conversion must belong to a product';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    NEW.business_id::text || ':' || COALESCE(NEW.product_id::text, 'global') || ':' ||
    COALESCE(NEW.variant_id::text, 'item') || ':' || lower(btrim(NEW.from_unit)),
    0
  ));

  IF NEW.product_id IS NOT NULL THEN
    SELECT p.unit
      INTO stock_unit
      FROM public.products p
     WHERE p.id = NEW.product_id
       AND p.business_id = NEW.business_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Conversion item must belong to this business';
    END IF;
    IF NEW.variant_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
        FROM public.product_variants v
       WHERE v.id = NEW.variant_id
         AND v.product_id = NEW.product_id
         AND v.business_id = NEW.business_id
    ) THEN
      RAISE EXCEPTION 'Conversion variant must belong to this item and business';
    END IF;
    IF lower(btrim(NEW.to_unit)) <> lower(btrim(stock_unit)) THEN
      RAISE EXCEPTION 'Item conversions must target the item stock unit (%)', stock_unit;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.unit_conversions c
     WHERE c.business_id = NEW.business_id
       AND c.product_id IS NOT DISTINCT FROM NEW.product_id
       AND c.variant_id IS NOT DISTINCT FROM NEW.variant_id
       AND lower(btrim(c.from_unit)) = lower(btrim(NEW.from_unit))
       AND c.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'A conversion for this unit already exists';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.item_unit_conversion_is_used(
  _business_id uuid,
  _product_id uuid,
  _variant_id uuid,
  _unit text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.bundle_components c
       WHERE c.business_id = _business_id
         AND c.component_product_id = COALESCE(_product_id, c.component_product_id)
         AND (_variant_id IS NULL OR c.variant_id = _variant_id)
         AND lower(btrim(c.entered_unit)) = lower(btrim(_unit))
    )
    OR EXISTS (
      SELECT 1 FROM public.addon_option_components c
       WHERE c.business_id = _business_id
         AND c.component_product_id = COALESCE(_product_id, c.component_product_id)
         AND (_variant_id IS NULL OR c.variant_id = _variant_id)
         AND lower(btrim(c.entered_unit)) = lower(btrim(_unit))
    )
    OR EXISTS (
      SELECT 1 FROM public.bom_items c
       WHERE c.business_id = _business_id
         AND c.component_product_id = COALESCE(_product_id, c.component_product_id)
         AND (_variant_id IS NULL OR c.variant_id = _variant_id)
         AND lower(btrim(c.entered_unit)) = lower(btrim(_unit))
    )
    OR EXISTS (
      SELECT 1 FROM public.purchase_order_items c
       WHERE c.business_id = _business_id
         AND c.product_id = COALESCE(_product_id, c.product_id)
         AND (_variant_id IS NULL OR c.variant_id = _variant_id)
         AND lower(btrim(c.entered_unit)) = lower(btrim(_unit))
    )
    OR EXISTS (
      SELECT 1 FROM public.goods_receipt_items c
       WHERE c.business_id = _business_id
         AND c.product_id = COALESCE(_product_id, c.product_id)
         AND (_variant_id IS NULL OR c.variant_id = _variant_id)
         AND lower(btrim(c.entered_unit)) = lower(btrim(_unit))
    )
    OR EXISTS (
      SELECT 1 FROM public.inventory_movements c
       WHERE c.business_id = _business_id
         AND c.product_id = COALESCE(_product_id, c.product_id)
         AND (_variant_id IS NULL OR c.variant_id = _variant_id)
         AND lower(btrim(COALESCE(c.entered_unit, c.unit))) = lower(btrim(_unit))
    )
    OR EXISTS (
      SELECT 1 FROM public.stock_count_items c
       WHERE c.business_id = _business_id
         AND c.product_id = COALESCE(_product_id, c.product_id)
         AND (_variant_id IS NULL OR c.variant_id = _variant_id)
         AND lower(btrim(c.entered_unit)) = lower(btrim(_unit))
    )
    OR EXISTS (
      SELECT 1
        FROM public.stock_transfer_items i
        JOIN public.stock_transfers t ON t.id = i.transfer_id
       WHERE t.source_business_id = _business_id
         AND i.product_id = COALESCE(_product_id, i.product_id)
         AND (_variant_id IS NULL OR i.variant_id = _variant_id)
         AND lower(btrim(i.entered_unit)) = lower(btrim(_unit))
    );
$$;

CREATE OR REPLACE FUNCTION public.guard_used_unit_conversion_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.item_unit_conversion_is_used(
    OLD.business_id, OLD.product_id, OLD.variant_id, OLD.from_unit
  ) THEN
    RAISE EXCEPTION 'This unit is already used by a BOM or transaction and cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS guard_used_unit_conversion_delete_trg
  ON public.unit_conversions;
CREATE TRIGGER guard_used_unit_conversion_delete_trg
  BEFORE DELETE ON public.unit_conversions
  FOR EACH ROW EXECUTE FUNCTION public.guard_used_unit_conversion_delete();

CREATE OR REPLACE FUNCTION public.create_stock_transfer(
  _source_business_id uuid,
  _source_warehouse_id uuid,
  _dest_business_id uuid,
  _dest_warehouse_id uuid,
  _items jsonb,
  _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cross boolean := _source_business_id IS DISTINCT FROM _dest_business_id;
  _ref text;
  _tid uuid;
  _item jsonb;
  _pid uuid;
  _qty numeric;
  _entered_qty numeric;
  _entered_unit text;
  _factor numeric;
  _cost numeric;
  _unit text;
  _avail numeric;
  _total numeric := 0;
  _lines text := '';
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.can_write_business(_source_business_id) THEN
    RAISE EXCEPTION 'not authorized for the source business';
  END IF;
  IF NOT public.can_write_business(_dest_business_id) THEN
    RAISE EXCEPTION 'not authorized for the destination business';
  END IF;
  IF _source_warehouse_id IS NULL OR _dest_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'source and destination locations are required';
  END IF;
  IF NOT _cross AND _source_warehouse_id = _dest_warehouse_id THEN
    RAISE EXCEPTION 'source and destination locations must differ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = _source_warehouse_id AND w.business_id = _source_business_id) THEN
    RAISE EXCEPTION 'source location does not belong to the source business';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = _dest_warehouse_id AND w.business_id = _dest_business_id) THEN
    RAISE EXCEPTION 'destination location does not belong to the destination business';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'add at least one product';
  END IF;

  _ref := public.next_doc_number(_source_business_id, 'TRF');
  INSERT INTO public.stock_transfers (reference, source_business_id, source_warehouse_id,
    dest_business_id, dest_warehouse_id, is_cross_business, status, notes, created_by)
  VALUES (_ref, _source_business_id, _source_warehouse_id, _dest_business_id, _dest_warehouse_id,
    _cross, CASE WHEN _cross THEN 'pending_receipt' ELSE 'received' END, _notes, auth.uid())
  RETURNING id INTO _tid;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _pid := (_item->>'product_id')::uuid;
    _qty := (_item->>'quantity')::numeric;
    _entered_qty := COALESCE(NULLIF(_item->>'entered_quantity', '')::numeric, _qty);
    IF _pid IS NULL OR _qty IS NULL OR _qty <= 0 OR _entered_qty <= 0 THEN
      RAISE EXCEPTION 'each line needs a product and a quantity greater than zero';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = _pid AND p.business_id = _source_business_id) THEN
      RAISE EXCEPTION 'product does not belong to the source business';
    END IF;

    SELECT p.unit, COALESCE(NULLIF(p.average_cost,0), p.cost_price, 0)
      INTO _unit, _cost
      FROM public.products p WHERE p.id = _pid;
    _entered_unit := COALESCE(NULLIF(_item->>'entered_unit', ''), _unit);
    IF lower(btrim(_entered_unit)) = lower(btrim(_unit)) THEN
      _factor := 1;
    ELSE
      SELECT c.factor INTO _factor
        FROM public.unit_conversions c
       WHERE c.business_id = _source_business_id
         AND lower(btrim(c.from_unit)) = lower(btrim(_entered_unit))
         AND lower(btrim(c.to_unit)) = lower(btrim(_unit))
         AND (c.product_id IS NULL OR c.product_id = _pid)
         AND c.variant_id IS NULL
       ORDER BY CASE WHEN c.product_id IS NULL THEN 1 ELSE 0 END
       LIMIT 1;
      IF _factor IS NULL THEN
        SELECT 1 / c.factor INTO _factor
          FROM public.unit_conversions c
         WHERE c.business_id = _source_business_id
           AND lower(btrim(c.to_unit)) = lower(btrim(_entered_unit))
           AND lower(btrim(c.from_unit)) = lower(btrim(_unit))
           AND (c.product_id IS NULL OR c.product_id = _pid)
           AND c.variant_id IS NULL
         ORDER BY CASE WHEN c.product_id IS NULL THEN 1 ELSE 0 END
         LIMIT 1;
      END IF;
    END IF;
    IF _factor IS NULL OR abs(round(_entered_qty * _factor, 3) - _qty) > 0.001 THEN
      RAISE EXCEPTION 'Unit conversion does not match the requested stock quantity for %', _pid;
    END IF;

    SELECT COALESCE(b.quantity,0), COALESCE(NULLIF(b.average_cost,0), _cost)
      INTO _avail, _cost
      FROM public.inventory_balances b
      WHERE b.business_id = _source_business_id AND b.product_id = _pid
        AND b.warehouse_id IS NOT DISTINCT FROM _source_warehouse_id
        AND b.variant_id IS NULL;
    _avail := COALESCE(_avail, 0);
    IF _avail < _qty THEN
      RAISE EXCEPTION 'Not enough stock at the source location: % available, % requested', _avail, _qty;
    END IF;

    INSERT INTO public.stock_transfer_items
      (transfer_id, product_id, dest_product_id, quantity, unit, unit_cost,
       batch_id, received_quantity, entered_quantity, entered_unit)
    VALUES (_tid, _pid, CASE WHEN _cross THEN NULLIF(_item->>'dest_product_id','')::uuid ELSE _pid END,
      _qty, _unit, COALESCE(_cost,0), NULLIF(_item->>'batch_id','')::uuid,
      CASE WHEN _cross THEN NULL ELSE _qty END, _entered_qty, _entered_unit);

    _total := _total + (_qty * COALESCE(_cost,0));

    INSERT INTO public.inventory_movements
      (business_id, product_id, warehouse_id, to_warehouse_id, type, quantity, base_quantity,
       unit, entered_quantity, entered_unit, unit_cost, total_cost, reference,
       reference_type, reference_id, notes, created_by, batch_id)
    VALUES (_source_business_id, _pid, _source_warehouse_id,
      CASE WHEN _cross THEN NULL ELSE _dest_warehouse_id END, 'transfer_out',
      _qty, _qty, _unit, _entered_qty, _entered_unit, COALESCE(_cost,0),
      _qty * COALESCE(_cost,0), _ref, 'stock_transfer', _tid, _notes, auth.uid(),
      NULLIF(_item->>'batch_id','')::uuid);
  END LOOP;

  UPDATE public.stock_transfers SET total_value = _total WHERE id = _tid;
  PERFORM public.log_audit_event(_source_business_id, 'transfer_created', 'inventory', _tid::text, NULL,
    jsonb_build_object('reference', _ref, 'cross_business', _cross, 'dest_business_id', _dest_business_id, 'total_value', _total));

  IF _cross THEN
    SELECT string_agg(p.name || ' x ' || (i.quantity::text), ', ')
      INTO _lines
      FROM public.stock_transfer_items i JOIN public.products p ON p.id = i.product_id
      WHERE i.transfer_id = _tid;
    INSERT INTO public.notifications (business_id, type, title, message, link, is_read)
    SELECT _dest_business_id, 'transfer',
      'Incoming stock transfer ' || _ref,
      'From ' || (SELECT name FROM public.businesses WHERE id = _source_business_id)
        || ' (' || COALESCE((SELECT name FROM public.warehouses WHERE id = _source_warehouse_id), 'source') || ')'
        || ' to ' || COALESCE((SELECT name FROM public.warehouses WHERE id = _dest_warehouse_id), 'your location')
        || '. ' || COALESCE(_lines, '') || '. Estimated value ' || round(_total, 2) || '. Review and confirm receipt.',
      '/transfers?incoming=' || _tid::text, false;
  END IF;
  RETURN _tid;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_goods_receipt(_receipt_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  stock_unit text;
  v_entered_unit text;
  factor numeric;
  entered_received numeric;
  entered_damaged numeric;
  entered_rejected numeric;
  received_base numeric;
  damaged_base numeric;
  rejected_base numeric;
  accepted_base numeric;
  stock_unit_cost numeric;
BEGIN
  SELECT * INTO gr FROM public.goods_receipts WHERE id = _receipt_id FOR UPDATE;
  IF gr.id IS NULL THEN RAISE EXCEPTION 'Goods receipt not found'; END IF;
  IF NOT public.can_write_business(gr.business_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF gr.status <> 'draft' THEN RAISE EXCEPTION 'Only draft receipts can be confirmed'; END IF;
  bid := gr.business_id;

  FOR it IN
    SELECT * FROM public.goods_receipt_items
     WHERE receipt_id = _receipt_id
     ORDER BY id
     FOR UPDATE
  LOOP
    SELECT p.unit INTO stock_unit
      FROM public.products p
     WHERE p.id = it.product_id AND p.business_id = bid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Received item does not belong to this business'; END IF;
    v_entered_unit := COALESCE(NULLIF(it.entered_unit, ''), NULLIF(it.unit, ''), stock_unit);
    entered_received := COALESCE(it.entered_received_quantity, it.received_quantity);
    entered_damaged := COALESCE(it.entered_damaged_quantity, it.damaged_quantity);
    entered_rejected := COALESCE(it.entered_rejected_quantity, it.rejected_quantity);

    IF lower(btrim(v_entered_unit)) = lower(btrim(stock_unit)) THEN
      factor := 1;
    ELSE
      SELECT c.factor INTO factor
        FROM public.unit_conversions c
       WHERE c.business_id = bid
         AND lower(btrim(c.from_unit)) = lower(btrim(v_entered_unit))
         AND lower(btrim(c.to_unit)) = lower(btrim(stock_unit))
         AND (c.product_id IS NULL OR c.product_id = it.product_id)
         AND (c.variant_id IS NULL OR c.variant_id = it.variant_id)
       ORDER BY CASE
         WHEN c.variant_id IS NOT NULL THEN 0
         WHEN c.product_id IS NOT NULL THEN 1
         ELSE 2
       END
       LIMIT 1;
      IF factor IS NULL THEN
        SELECT 1 / c.factor INTO factor
          FROM public.unit_conversions c
         WHERE c.business_id = bid
           AND lower(btrim(c.to_unit)) = lower(btrim(v_entered_unit))
           AND lower(btrim(c.from_unit)) = lower(btrim(stock_unit))
           AND (c.product_id IS NULL OR c.product_id = it.product_id)
           AND (c.variant_id IS NULL OR c.variant_id = it.variant_id)
         ORDER BY CASE
           WHEN c.variant_id IS NOT NULL THEN 0
           WHEN c.product_id IS NOT NULL THEN 1
           ELSE 2
         END
         LIMIT 1;
      END IF;
      IF factor IS NULL OR factor <= 0 THEN
        RAISE EXCEPTION 'No unit conversion from % to % for %', v_entered_unit, stock_unit, it.product_id;
      END IF;
    END IF;

    received_base := round(entered_received * factor, 3);
    damaged_base := round(entered_damaged * factor, 3);
    rejected_base := round(entered_rejected * factor, 3);
    accepted_base := round(GREATEST(entered_received - entered_damaged - entered_rejected, 0) * factor, 3);
    stock_unit_cost := it.unit_cost / factor;

    UPDATE public.goods_receipt_items
       SET entered_received_quantity = entered_received,
           entered_damaged_quantity = entered_damaged,
           entered_rejected_quantity = entered_rejected,
           entered_unit = v_entered_unit,
           received_quantity = received_base,
           damaged_quantity = damaged_base,
           rejected_quantity = rejected_base,
           accepted_quantity = accepted_base,
           unit = stock_unit,
           unit_cost = stock_unit_cost
     WHERE id = it.id;

    IF accepted_base > 0 THEN
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
            accepted_base, accepted_base, stock_unit_cost, 'active')
          RETURNING id INTO batch;
        ELSE
          UPDATE public.batches
             SET quantity = COALESCE(quantity,0) + accepted_base,
                 remaining_quantity = COALESCE(remaining_quantity,0) + accepted_base,
                 unit_cost = stock_unit_cost,
                 expiry_date = COALESCE(it.expiry_date, expiry_date),
                 updated_at = now()
           WHERE id = batch;
        END IF;
      END IF;

      INSERT INTO public.inventory_movements
        (business_id, product_id, variant_id, warehouse_id, batch_id, batch_number, type, quantity, base_quantity,
         unit, unit_cost, total_cost, reference, reference_type, reference_id, movement_date, notes, created_by)
      VALUES (bid, it.product_id, it.variant_id, gr.warehouse_id, batch, it.batch_number, 'purchase',
         accepted_base, accepted_base, stock_unit, stock_unit_cost,
         accepted_base * stock_unit_cost, gr.receipt_number, 'goods_receipt', gr.id,
         gr.receipt_date, 'Goods receipt ' || gr.receipt_number, gr.received_by);

      payable := payable + (GREATEST(entered_received - entered_damaged - entered_rejected, 0) * it.unit_cost);

      INSERT INTO public.supplier_price_history
        (business_id, supplier_id, product_id, variant_id, price, currency, source, reference, effective_date, created_by)
      VALUES (bid, gr.supplier_id, it.product_id, it.variant_id, stock_unit_cost, NULL,
        'goods_receipt', gr.receipt_number, gr.receipt_date, gr.received_by);

      UPDATE public.supplier_products
        SET last_purchase_price = stock_unit_cost, last_purchase_date = gr.receipt_date, updated_at = now()
        WHERE business_id = bid AND supplier_id = gr.supplier_id AND product_id = it.product_id;
    END IF;

    IF it.purchase_order_item_id IS NOT NULL THEN
      UPDATE public.purchase_order_items
        SET received_quantity = COALESCE(received_quantity,0) +
              GREATEST(entered_received - entered_damaged - entered_rejected, 0),
            damaged_quantity = COALESCE(damaged_quantity,0) + entered_damaged,
            rejected_quantity = COALESCE(rejected_quantity,0) + entered_rejected
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
END;
$$;

REVOKE ALL ON FUNCTION public.item_unit_conversion_is_used(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_used_unit_conversion_delete()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_unit_conversion_capability()
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

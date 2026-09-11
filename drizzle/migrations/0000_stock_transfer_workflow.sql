-- ============ Stock transfer workflow (intra + inter business) ============

CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL,
  source_business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  source_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  dest_business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  dest_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  is_cross_business boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending_receipt',
  notes text,
  total_value numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  received_by uuid,
  received_at timestamptz,
  receipt_reference text,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text
);

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  dest_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL,
  unit text,
  quantity numeric NOT NULL,
  received_quantity numeric,
  unit_cost numeric NOT NULL DEFAULT 0,
  discrepancy_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_transfers_source_idx ON public.stock_transfers(source_business_id, status);
CREATE INDEX IF NOT EXISTS stock_transfers_dest_idx ON public.stock_transfers(dest_business_id, status);
CREATE INDEX IF NOT EXISTS stock_transfer_items_transfer_idx ON public.stock_transfer_items(transfer_id);

GRANT SELECT ON public.stock_transfers TO authenticated;
GRANT SELECT ON public.stock_transfer_items TO authenticated;
GRANT ALL ON public.stock_transfers TO service_role;
GRANT ALL ON public.stock_transfer_items TO service_role;

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read transfers on either side"
ON public.stock_transfers FOR SELECT TO authenticated
USING (public.is_business_member(source_business_id) OR public.is_business_member(dest_business_id));

CREATE POLICY "Members read transfer items on either side"
ON public.stock_transfer_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.stock_transfers t
  WHERE t.id = stock_transfer_items.transfer_id
    AND (public.is_business_member(t.source_business_id) OR public.is_business_member(t.dest_business_id))
));

CREATE TRIGGER stock_transfers_updated_at BEFORE UPDATE ON public.stock_transfers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------- create ----------------
CREATE OR REPLACE FUNCTION public.create_stock_transfer(
  _source_business_id uuid,
  _source_warehouse_id uuid,
  _dest_business_id uuid,
  _dest_warehouse_id uuid,
  _items jsonb,
  _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _cross boolean := _source_business_id IS DISTINCT FROM _dest_business_id;
  _ref text;
  _tid uuid;
  _item jsonb;
  _pid uuid;
  _qty numeric;
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
    IF _pid IS NULL OR _qty IS NULL OR _qty <= 0 THEN
      RAISE EXCEPTION 'each line needs a product and a quantity greater than zero';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = _pid AND p.business_id = _source_business_id) THEN
      RAISE EXCEPTION 'product does not belong to the source business';
    END IF;

    SELECT p.unit, COALESCE(NULLIF(p.average_cost,0), p.cost_price, 0) INTO _unit, _cost
      FROM public.products p WHERE p.id = _pid;
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

    INSERT INTO public.stock_transfer_items (transfer_id, product_id, dest_product_id, quantity, unit, unit_cost,
      batch_id, received_quantity)
    VALUES (_tid, _pid, CASE WHEN _cross THEN NULLIF(_item->>'dest_product_id','')::uuid ELSE _pid END,
      _qty, _unit, COALESCE(_cost,0), NULLIF(_item->>'batch_id','')::uuid,
      CASE WHEN _cross THEN NULL ELSE _qty END);

    _total := _total + (_qty * COALESCE(_cost,0));

    -- source movement: deduct now so the same units cannot be transferred twice
    INSERT INTO public.inventory_movements (business_id, product_id, warehouse_id, to_warehouse_id, type,
      quantity, base_quantity, unit, unit_cost, total_cost, reference, reference_type, reference_id, notes, created_by, batch_id)
    VALUES (_source_business_id, _pid, _source_warehouse_id,
      CASE WHEN _cross THEN NULL ELSE _dest_warehouse_id END, 'transfer_out',
      _qty, _qty, _unit, COALESCE(_cost,0), _qty * COALESCE(_cost,0), _ref, 'stock_transfer', _tid, _notes, auth.uid(),
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
END; $$;

-- ---------------- receive ----------------
CREATE OR REPLACE FUNCTION public.receive_stock_transfer(
  _transfer_id uuid,
  _lines jsonb DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  t public.stock_transfers%ROWTYPE;
  it public.stock_transfer_items%ROWTYPE;
  _line jsonb;
  _recv numeric;
  _dest_pid uuid;
  _reason text;
  _short numeric;
  _receipt text;
  _partial boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO t FROM public.stock_transfers WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transfer not found'; END IF;
  IF NOT public.can_write_business(t.dest_business_id) THEN
    RAISE EXCEPTION 'not authorized to receive for the destination business';
  END IF;
  -- idempotent: a second confirmation returns the existing receipt without moving stock again
  IF t.status <> 'pending_receipt' THEN
    RETURN COALESCE(t.receipt_reference, t.status);
  END IF;

  _receipt := public.next_doc_number(t.dest_business_id, 'TRR');

  FOR it IN SELECT * FROM public.stock_transfer_items WHERE transfer_id = t.id LOOP
    _recv := it.quantity;
    _dest_pid := it.dest_product_id;
    _reason := NULL;

    IF _lines IS NOT NULL THEN
      SELECT l INTO _line FROM jsonb_array_elements(_lines) l WHERE (l->>'item_id')::uuid = it.id;
      IF _line IS NOT NULL THEN
        _recv := COALESCE(NULLIF(_line->>'received_quantity','')::numeric, it.quantity);
        _dest_pid := COALESCE(NULLIF(_line->>'dest_product_id','')::uuid, _dest_pid);
        _reason := NULLIF(_line->>'discrepancy_reason','');
      END IF;
    END IF;

    IF _recv < 0 OR _recv > it.quantity THEN
      RAISE EXCEPTION 'received quantity must be between 0 and %', it.quantity;
    END IF;
    IF _dest_pid IS NULL THEN
      RAISE EXCEPTION 'choose the matching product in your catalog for every line';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = _dest_pid AND p.business_id = t.dest_business_id) THEN
      RAISE EXCEPTION 'destination product does not belong to the receiving business';
    END IF;
    IF _recv < it.quantity THEN _partial := true; END IF;

    UPDATE public.stock_transfer_items
      SET received_quantity = _recv, dest_product_id = _dest_pid, discrepancy_reason = _reason
      WHERE id = it.id;

    IF _recv > 0 THEN
      INSERT INTO public.inventory_movements (business_id, product_id, warehouse_id, type, quantity, base_quantity,
        unit, unit_cost, total_cost, reference, reference_type, reference_id, notes, created_by)
      VALUES (t.dest_business_id, _dest_pid, t.dest_warehouse_id, 'transfer_in', _recv, _recv, it.unit,
        it.unit_cost, _recv * it.unit_cost, _receipt, 'stock_transfer', t.id,
        'Received from transfer ' || t.reference, auth.uid());
    END IF;

    _short := it.quantity - _recv;
    IF _short > 0 THEN
      -- shortfall goes back to the source location so both sides reconcile
      INSERT INTO public.inventory_movements (business_id, product_id, warehouse_id, type, quantity, base_quantity,
        unit, unit_cost, total_cost, reference, reference_type, reference_id, reason, notes, created_by)
      VALUES (t.source_business_id, it.product_id, t.source_warehouse_id, 'transfer_in', _short, _short, it.unit,
        it.unit_cost, _short * it.unit_cost, t.reference, 'stock_transfer', t.id,
        COALESCE(_reason, 'Transfer discrepancy'),
        'Not received on transfer ' || t.reference, auth.uid());
    END IF;
  END LOOP;

  UPDATE public.stock_transfers
    SET status = CASE WHEN _partial THEN 'partially_received' ELSE 'received' END,
        received_by = auth.uid(), received_at = now(), receipt_reference = _receipt,
        total_value = COALESCE((SELECT sum(COALESCE(i.received_quantity,0) * i.unit_cost)
                                FROM public.stock_transfer_items i WHERE i.transfer_id = t.id), 0)
    WHERE id = t.id;

  PERFORM public.log_audit_event(t.dest_business_id, CASE WHEN _partial THEN 'transfer_received_partial' ELSE 'transfer_received' END,
    'inventory', t.id::text, NULL, jsonb_build_object('reference', t.reference, 'receipt', _receipt));

  INSERT INTO public.notifications (business_id, type, title, message, link, is_read)
  VALUES (t.source_business_id, 'transfer',
    CASE WHEN _partial THEN 'Transfer ' || t.reference || ' partially received' ELSE 'Transfer ' || t.reference || ' received' END,
    (SELECT name FROM public.businesses WHERE id = t.dest_business_id) || ' confirmed receipt ' || _receipt || '.',
    '/transfers?transfer=' || t.id::text, false);

  RETURN _receipt;
END; $$;

-- ---------------- reject ----------------
CREATE OR REPLACE FUNCTION public.reject_stock_transfer(
  _transfer_id uuid,
  _reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  t public.stock_transfers%ROWTYPE;
  it public.stock_transfer_items%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) = 0 THEN RAISE EXCEPTION 'a rejection reason is required'; END IF;

  SELECT * INTO t FROM public.stock_transfers WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transfer not found'; END IF;
  IF NOT public.can_write_business(t.dest_business_id) THEN
    RAISE EXCEPTION 'not authorized to reject for the destination business';
  END IF;
  IF t.status <> 'pending_receipt' THEN RETURN; END IF;

  FOR it IN SELECT * FROM public.stock_transfer_items WHERE transfer_id = t.id LOOP
    INSERT INTO public.inventory_movements (business_id, product_id, warehouse_id, type, quantity, base_quantity,
      unit, unit_cost, total_cost, reference, reference_type, reference_id, reason, notes, created_by)
    VALUES (t.source_business_id, it.product_id, t.source_warehouse_id, 'transfer_in', it.quantity, it.quantity,
      it.unit, it.unit_cost, it.quantity * it.unit_cost, t.reference, 'stock_transfer', t.id,
      'Transfer rejected', trim(_reason), auth.uid());
    UPDATE public.stock_transfer_items SET received_quantity = 0 WHERE id = it.id;
  END LOOP;

  UPDATE public.stock_transfers
    SET status = 'rejected', rejected_by = auth.uid(), rejected_at = now(), rejection_reason = trim(_reason)
    WHERE id = t.id;

  PERFORM public.log_audit_event(t.dest_business_id, 'transfer_rejected', 'inventory', t.id::text, NULL,
    jsonb_build_object('reference', t.reference, 'reason', trim(_reason)));

  INSERT INTO public.notifications (business_id, type, title, message, link, is_read)
  VALUES (t.source_business_id, 'transfer', 'Transfer ' || t.reference || ' rejected',
    (SELECT name FROM public.businesses WHERE id = t.dest_business_id) || ' rejected the transfer: ' || trim(_reason)
      || '. Stock has been returned to the source location.',
    '/transfers?transfer=' || t.id::text, false);
END; $$;

REVOKE ALL ON FUNCTION public.create_stock_transfer(uuid,uuid,uuid,uuid,jsonb,text) FROM public, anon;
REVOKE ALL ON FUNCTION public.receive_stock_transfer(uuid,jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.reject_stock_transfer(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_stock_transfer(uuid,uuid,uuid,uuid,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_stock_transfer(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_stock_transfer(uuid,text) TO authenticated;
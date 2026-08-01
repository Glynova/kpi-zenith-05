CREATE OR REPLACE FUNCTION public.can_manage_sensitive(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_businesses ub
    WHERE ub.business_id = _business_id
      AND ub.user_id = auth.uid()
      AND ub.status = 'active'
      AND ub.role IN ('owner','admin','manager','accountant','hr')
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_po_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE approval_statuses text[] := ARRAY['approved','ordered','partially_received','received','completed'];
BEGIN
  IF NEW.status = ANY(approval_statuses)
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF public.business_role(NEW.business_id) <> 'owner' THEN
      RAISE EXCEPTION 'Only the business owner can approve purchase orders';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

REVOKE EXECUTE ON FUNCTION public.enforce_po_approval() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_po_approval_trg ON public.purchase_orders;
CREATE TRIGGER enforce_po_approval_trg
BEFORE INSERT OR UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_po_approval();
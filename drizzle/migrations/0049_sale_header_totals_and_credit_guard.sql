-- Security hardening:
-- 1. Sale header money fields must be derived from sale_items, not caller-supplied.
--    Any workspace writer could previously insert a sales header with a lowered
--    subtotal/total while keeping items at their listed prices.
-- 2. Customer credit limits may only be set by owners/admins/managers
--    (can_manage_sensitive), not by any workspace member with write access.

-- ============ 1. Sale header vs sale_items totals guard ============
CREATE OR REPLACE FUNCTION public.enforce_sale_header_totals(_sale_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  s public.sales%ROWTYPE;
  item_net numeric;
  item_disc numeric;
  item_tax numeric;
  order_disc numeric;
  scale numeric;
  exp_subtotal numeric;
  exp_discount numeric;
  exp_tax numeric;
  exp_total numeric;
  tol constant numeric := 0.02;
BEGIN
  SELECT * INTO s FROM public.sales WHERE id = _sale_id;
  IF s.id IS NULL THEN RETURN; END IF;
  -- Only revenue documents are locked; returns/quotes/orders keep their own maths.
  IF s.document_type NOT IN ('sale','pos_sale') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sale_items WHERE sale_id = _sale_id) THEN RETURN; END IF;

  -- Per line, net = total - tax holds for both tax-exclusive and tax-inclusive maths.
  SELECT COALESCE(SUM(COALESCE(total,0) - COALESCE(tax,0)), 0),
         COALESCE(SUM(COALESCE(discount,0)), 0),
         COALESCE(SUM(COALESCE(tax,0)), 0)
    INTO item_net, item_disc, item_tax
    FROM public.sale_items WHERE sale_id = _sale_id;

  exp_subtotal := ROUND(item_net, 2);
  IF s.discount_type = 'percent' THEN
    order_disc := ROUND(exp_subtotal * LEAST(GREATEST(COALESCE(s.discount_value,0),0), 100) / 100, 2);
  ELSE
    order_disc := ROUND(LEAST(GREATEST(COALESCE(s.discount_value,0),0), exp_subtotal), 2);
  END IF;
  exp_discount := ROUND(item_disc + order_disc, 2);
  scale := CASE WHEN exp_subtotal > 0 THEN (exp_subtotal - order_disc) / exp_subtotal ELSE 1 END;
  exp_tax := ROUND(item_tax * scale, 2);
  exp_total := GREATEST(ROUND(exp_subtotal - order_disc + exp_tax
                              + COALESCE(s.shipping,0) + COALESCE(s.other_charges,0), 2), 0);

  IF abs(exp_subtotal - COALESCE(s.subtotal,0)) > tol
     OR abs(exp_discount - COALESCE(s.discount,0)) > tol
     OR abs(exp_tax - COALESCE(s.tax,0)) > tol
     OR abs(exp_total - COALESCE(s.total,0)) > tol THEN
    RAISE EXCEPTION 'Sale % header totals must match its items (expected subtotal %, discount %, tax %, total %)',
      s.sale_number, exp_subtotal, exp_discount, exp_tax, exp_total;
  END IF;
END; $$;

-- Immediate check whenever a sale row is written and it already carries items.
CREATE OR REPLACE FUNCTION public.trg_enforce_sale_header_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.enforce_sale_header_totals(NEW.id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS sale_header_totals_trg ON public.sales;
CREATE TRIGGER sale_header_totals_trg BEFORE INSERT OR UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_sale_header_totals();

-- Deferred check so a sale and its batch of items (written in separate requests
-- by the app) are validated against each other once both are visible.
CREATE OR REPLACE FUNCTION public.trg_enforce_sale_header_totals_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.enforce_sale_header_totals(COALESCE(NEW.sale_id, OLD.sale_id));
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS sale_items_header_totals_ins_trg ON public.sale_items;
CREATE CONSTRAINT TRIGGER sale_items_header_totals_ins_trg AFTER INSERT ON public.sale_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_sale_header_totals_item();

DROP TRIGGER IF EXISTS sale_items_header_totals_upd_trg ON public.sale_items;
CREATE CONSTRAINT TRIGGER sale_items_header_totals_upd_trg AFTER UPDATE ON public.sale_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_sale_header_totals_item();

DROP TRIGGER IF EXISTS sale_items_header_totals_del_trg ON public.sale_items;
CREATE CONSTRAINT TRIGGER sale_items_header_totals_del_trg AFTER DELETE ON public.sale_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_sale_header_totals_item();

REVOKE ALL ON FUNCTION public.enforce_sale_header_totals(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_enforce_sale_header_totals() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_enforce_sale_header_totals_item() FROM PUBLIC, anon, authenticated;

-- ============ 2. Customer credit limit role gate ============
CREATE OR REPLACE FUNCTION public.guard_customer_credit_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF COALESCE(NEW.credit_limit, 0) > 0
     OR (TG_OP = 'UPDATE' AND COALESCE(OLD.credit_limit,0) IS DISTINCT FROM COALESCE(NEW.credit_limit,0)) THEN
    IF NOT public.can_manage_sensitive(NEW.business_id) THEN
      RAISE EXCEPTION 'Only owners, admins and managers can set a customer credit limit';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS guard_customer_credit_role_trg ON public.customers;
CREATE TRIGGER guard_customer_credit_role_trg BEFORE INSERT OR UPDATE OF credit_limit ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.guard_customer_credit_role();

REVOKE ALL ON FUNCTION public.guard_customer_credit_role() FROM PUBLIC, anon, authenticated;

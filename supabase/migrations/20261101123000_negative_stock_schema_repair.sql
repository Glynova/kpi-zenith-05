CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.business_settings
  ALTER COLUMN allow_negative_stock SET DEFAULT false,
  ADD COLUMN IF NOT EXISTS negative_stock_requires_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_negative_qty numeric(14,3),
  ADD COLUMN IF NOT EXISTS negative_stock_allowed_roles text[] NOT NULL
    DEFAULT ARRAY['owner','admin','manager','cashier']::text[];

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS negative_stock_mode text NOT NULL DEFAULT 'inherit';

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_negative_stock_mode_check,
  ADD CONSTRAINT products_negative_stock_mode_check
    CHECK (negative_stock_mode IN ('inherit', 'allow', 'block'));

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS caused_negative_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.business_settings
   SET allow_negative_stock = false
 WHERE allow_negative_stock IS NULL;

UPDATE public.business_settings
   SET negative_stock_requires_approval = false
 WHERE negative_stock_requires_approval IS NULL;

UPDATE public.business_settings
   SET negative_stock_allowed_roles = ARRAY['owner','admin','manager','cashier']::text[]
 WHERE negative_stock_allowed_roles IS NULL;

ALTER TABLE public.business_settings
  ALTER COLUMN allow_negative_stock SET NOT NULL,
  ALTER COLUMN negative_stock_requires_approval SET NOT NULL,
  ALTER COLUMN negative_stock_allowed_roles SET NOT NULL;

ALTER TABLE public.business_settings
  DROP CONSTRAINT IF EXISTS business_settings_max_negative_qty_check,
  ADD CONSTRAINT business_settings_max_negative_qty_check
    CHECK (max_negative_qty IS NULL OR max_negative_qty >= 0),
  DROP CONSTRAINT IF EXISTS business_settings_negative_stock_allowed_roles_check,
  ADD CONSTRAINT business_settings_negative_stock_allowed_roles_check
    CHECK (negative_stock_allowed_roles <@ ARRAY['owner','admin','manager','cashier']::text[]);

INSERT INTO public.business_settings (business_id)
SELECT b.id FROM public.businesses b
ON CONFLICT (business_id) DO NOTHING;

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conrelid::regclass AS table_name, con.conname
      FROM pg_constraint con
     WHERE con.contype = 'c'
       AND con.conrelid IN (
         'public.products'::regclass,
         'public.product_variants'::regclass,
         'public.inventory_balances'::regclass
       )
       AND pg_get_constraintdef(con.oid) ~* '\m(stock|quantity)\M\s*>=\s*0'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.table_name, c.conname);
  END LOOP;
END;
$$;

CREATE TABLE IF NOT EXISTS public.negative_stock_pin_credentials (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.negative_stock_pin_attempts (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  attempted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  PRIMARY KEY (business_id, attempted_by)
);

CREATE TABLE IF NOT EXISTS public.negative_stock_approvals (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  sale_id uuid PRIMARY KEY REFERENCES public.sales(id) ON DELETE CASCADE,
  approved_by uuid NOT NULL REFERENCES auth.users(id),
  approved_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.negative_stock_pin_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.negative_stock_pin_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.negative_stock_approvals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.negative_stock_pin_credentials,
              public.negative_stock_pin_attempts,
              public.negative_stock_approvals
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.negative_stock_pin_credentials,
             public.negative_stock_pin_attempts,
             public.negative_stock_approvals TO service_role;

CREATE OR REPLACE FUNCTION public.audit_negative_stock_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_values jsonb;
  new_values jsonb;
BEGIN
  old_values := jsonb_build_object(
    'allow_negative_stock', OLD.allow_negative_stock,
    'negative_stock_requires_approval', OLD.negative_stock_requires_approval,
    'max_negative_qty', OLD.max_negative_qty,
    'negative_stock_allowed_roles', OLD.negative_stock_allowed_roles
  );
  new_values := jsonb_build_object(
    'allow_negative_stock', NEW.allow_negative_stock,
    'negative_stock_requires_approval', NEW.negative_stock_requires_approval,
    'max_negative_qty', NEW.max_negative_qty,
    'negative_stock_allowed_roles', NEW.negative_stock_allowed_roles
  );
  IF old_values IS DISTINCT FROM new_values THEN
    INSERT INTO public.audit_logs
      (business_id, user_id, user_email, action, module, record_id, old_value, new_value)
    VALUES (
      NEW.business_id,
      auth.uid(),
      (SELECT email FROM auth.users WHERE id = auth.uid()),
      'negative_stock_settings_changed',
      'settings',
      NEW.business_id::text,
      old_values,
      new_values
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_negative_stock_settings_trg ON public.business_settings;
CREATE TRIGGER audit_negative_stock_settings_trg
  AFTER UPDATE ON public.business_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_negative_stock_settings();

CREATE OR REPLACE FUNCTION public.set_negative_stock_pin(_business_id uuid, _pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.user_businesses ub
     WHERE ub.business_id = _business_id
       AND ub.user_id = auth.uid()
       AND ub.status = 'active'
  ) THEN
    RAISE EXCEPTION 'You must be an active member of this business to set an approval PIN';
  END IF;

  IF public.business_role(_business_id)::text NOT IN ('owner', 'admin', 'manager') THEN
    RAISE EXCEPTION 'Only an owner, admin or manager can set an approval PIN';
  END IF;

  IF _pin IS NULL OR _pin !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'PIN must contain exactly six digits';
  END IF;

  INSERT INTO public.negative_stock_pin_credentials (business_id, user_id, pin_hash)
  VALUES (_business_id, auth.uid(), crypt(_pin, gen_salt('bf', 12)))
  ON CONFLICT (business_id, user_id) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.set_negative_stock_pin(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_negative_stock_pin(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_negative_stock_sale(_sale_id uuid, _pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  s public.sales%ROWTYPE;
  bs public.business_settings%ROWTYPE;
  attempt public.negative_stock_pin_attempts%ROWTYPE;
  approver uuid;
  seller_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in before requesting approval';
  END IF;

  SELECT * INTO s FROM public.sales WHERE id = _sale_id FOR UPDATE;
  IF s.id IS NULL OR NOT public.can_write_business(s.business_id) THEN
    RAISE EXCEPTION 'Sale not found or not permitted';
  END IF;
  IF s.inventory_posted OR s.status NOT IN ('draft', 'pending_approval') THEN
    RAISE EXCEPTION 'Only an unposted draft sale can be approved';
  END IF;

  SELECT * INTO bs
    FROM public.business_settings
   WHERE business_id = s.business_id;
  seller_role := public.business_role(s.business_id)::text;

  IF NOT COALESCE(bs.negative_stock_requires_approval, false)
     OR (
       NOT COALESCE(bs.allow_negative_stock, false)
       AND NOT EXISTS (
         SELECT 1
           FROM public.sale_items si
           JOIN public.products p
             ON p.id = si.product_id AND p.business_id = s.business_id
          WHERE si.sale_id = s.id AND p.negative_stock_mode = 'allow'
       )
     ) THEN
    RETURN jsonb_build_object('approved', false, 'message', 'Negative-stock approval is not enabled');
  END IF;

  IF NOT (seller_role = ANY(bs.negative_stock_allowed_roles)) THEN
    RETURN jsonb_build_object(
      'approved', false,
      'message', 'Your role is not allowed to sell into negative stock'
    );
  END IF;

  INSERT INTO public.negative_stock_pin_attempts (business_id, attempted_by)
  VALUES (s.business_id, auth.uid())
  ON CONFLICT DO NOTHING;

  SELECT * INTO attempt
    FROM public.negative_stock_pin_attempts
   WHERE business_id = s.business_id
     AND attempted_by = auth.uid()
   FOR UPDATE;

  IF attempt.locked_until IS NOT NULL AND attempt.locked_until > now() THEN
    RETURN jsonb_build_object('approved', false, 'message', 'PIN attempts are temporarily locked');
  END IF;

  SELECT c.user_id INTO approver
    FROM public.negative_stock_pin_credentials c
    JOIN public.user_businesses ub
      ON ub.business_id = c.business_id
     AND ub.user_id = c.user_id
     AND ub.status = 'active'
   WHERE c.business_id = s.business_id
     AND ub.role::text IN ('owner', 'admin', 'manager')
     AND c.pin_hash = crypt(COALESCE(_pin, ''), c.pin_hash)
   ORDER BY CASE ub.role::text WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END
   LIMIT 1;

  IF approver IS NULL THEN
    UPDATE public.negative_stock_pin_attempts
       SET failed_attempts = failed_attempts + 1,
           locked_until = CASE
             WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes'
             ELSE NULL
           END
     WHERE business_id = s.business_id
       AND attempted_by = auth.uid();
    RETURN jsonb_build_object('approved', false, 'message', 'Invalid manager PIN');
  END IF;

  UPDATE public.negative_stock_pin_attempts
     SET failed_attempts = 0, locked_until = NULL
   WHERE business_id = s.business_id
     AND attempted_by = auth.uid();

  INSERT INTO public.negative_stock_approvals (business_id, sale_id, approved_by)
  VALUES (s.business_id, s.id, approver)
  ON CONFLICT (sale_id) DO UPDATE
    SET business_id = EXCLUDED.business_id,
        approved_by = EXCLUDED.approved_by,
        approved_at = now();

  RETURN jsonb_build_object('approved', true, 'approved_by', approver);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_negative_stock_sale(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_negative_stock_sale(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_negative_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bs public.business_settings%ROWTYPE;
  p public.products%ROWTYPE;
  current_qty numeric := 0;
  requested_qty numeric := COALESCE(NEW.base_quantity, NEW.quantity);
  resulting_qty numeric;
  actor_role text;
  approval_user uuid;
  current_unit_cost numeric;
BEGIN
  IF public.movement_sign(NEW.type) >= 0 OR NEW.type = 'stock_count' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    NEW.business_id::text || ':' || NEW.product_id::text || ':' ||
    COALESCE(NEW.variant_id::text, '-') || ':' || COALESCE(NEW.warehouse_id::text, '-'), 0
  ));

  SELECT * INTO p
    FROM public.products
   WHERE id = NEW.product_id AND business_id = NEW.business_id;
  IF p.id IS NULL THEN
    RAISE EXCEPTION 'Product does not belong to this business';
  END IF;
  IF p.inventory_model IN ('service', 'non_stock', 'digital', 'non_stocked_item')
     OR p.item_type IN ('service', 'non_stock')
     OR NOT COALESCE(p.track_stock, true) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO current_qty
    FROM public.inventory_balances
   WHERE business_id = NEW.business_id
     AND product_id = NEW.product_id
     AND variant_id IS NOT DISTINCT FROM NEW.variant_id
     AND warehouse_id IS NOT DISTINCT FROM NEW.warehouse_id;
  resulting_qty := current_qty - requested_qty;
  IF resulting_qty >= 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO bs
    FROM public.business_settings
   WHERE business_id = NEW.business_id;

  IF NEW.type <> 'sale' THEN
    IF NOT COALESCE(bs.allow_negative_stock, false) THEN
      RAISE EXCEPTION 'Insufficient stock: % available, % requested', current_qty, requested_qty;
    END IF;
    RETURN NEW;
  END IF;

  IF p.negative_stock_mode = 'block' THEN
    IF NOT COALESCE(bs.allow_negative_stock, false) THEN
      RAISE EXCEPTION 'Insufficient stock: % available, % requested', current_qty, requested_qty;
    END IF;
    RAISE EXCEPTION 'Negative stock is blocked for %', p.name;
  END IF;
  IF p.negative_stock_mode <> 'allow' AND NOT COALESCE(bs.allow_negative_stock, false) THEN
    RAISE EXCEPTION 'Insufficient stock: % available, % requested', current_qty, requested_qty;
  END IF;

  actor_role := public.business_role(NEW.business_id)::text;
  IF actor_role IS NULL OR NOT (actor_role = ANY(bs.negative_stock_allowed_roles)) THEN
    RAISE EXCEPTION 'Your role is not allowed to sell into negative stock';
  END IF;
  IF bs.max_negative_qty IS NOT NULL AND -resulting_qty > bs.max_negative_qty THEN
    RAISE EXCEPTION 'Maximum negative stock is % units; this sale would result in %',
      bs.max_negative_qty, resulting_qty;
  END IF;

  IF NEW.reference_type IS DISTINCT FROM 'sale'
     OR NEW.reference_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.sales s
        WHERE s.id = NEW.reference_id AND s.business_id = NEW.business_id
     ) THEN
    RAISE EXCEPTION 'Sale reference is required to post negative stock';
  END IF;

  IF COALESCE(bs.negative_stock_requires_approval, false) THEN
    SELECT a.approved_by INTO approval_user
      FROM public.negative_stock_approvals a
     WHERE a.business_id = NEW.business_id AND a.sale_id = NEW.reference_id;
    IF approval_user IS NULL THEN
      RAISE EXCEPTION 'Manager approval required before completing this sale';
    END IF;
    NEW.approved_by := approval_user;
  END IF;

  NEW.caused_negative_stock := true;
  SELECT COALESCE(NULLIF(v.cost_price, 0), NULLIF(pr.cost_price, 0), pr.average_cost, 0)
    INTO current_unit_cost
    FROM public.products pr
    LEFT JOIN public.product_variants v
      ON v.id = NEW.variant_id AND v.business_id = NEW.business_id
   WHERE pr.id = NEW.product_id AND pr.business_id = NEW.business_id;
  NEW.unit_cost := current_unit_cost;
  NEW.total_cost := current_unit_cost * requested_qty;

  UPDATE public.sale_items
     SET unit_cost = current_unit_cost
   WHERE sale_id = NEW.reference_id
     AND product_id = NEW.product_id
     AND variant_id IS NOT DISTINCT FROM NEW.variant_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_negative_stock() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_negative_stock_trg ON public.inventory_movements;
CREATE TRIGGER guard_negative_stock_trg
  BEFORE INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.guard_negative_stock();

CREATE OR REPLACE FUNCTION public.alert_negative_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.products%ROWTYPE;
  total_qty numeric;
  prior_qty numeric;
BEGIN
  SELECT COALESCE(SUM(quantity), 0) INTO total_qty
    FROM public.inventory_balances
   WHERE business_id = NEW.business_id
     AND product_id = NEW.product_id
     AND variant_id IS NOT DISTINCT FROM NEW.variant_id
     AND warehouse_id IS NOT DISTINCT FROM NEW.warehouse_id;
  IF total_qty >= 0 THEN
    RETURN NEW;
  END IF;

  prior_qty := total_qty - NEW.quantity;
  IF TG_OP = 'UPDATE' THEN
    prior_qty := prior_qty + OLD.quantity;
  END IF;
  IF prior_qty < 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO p
    FROM public.products
   WHERE id = NEW.product_id AND business_id = NEW.business_id;
  IF p.id IS NULL
     OR p.inventory_model IN ('service', 'non_stock', 'digital', 'non_stocked_item')
     OR p.item_type IN ('service', 'non_stock')
     OR NOT COALESCE(p.track_stock, true) THEN
    RETURN NEW;
  END IF;

  PERFORM public.notify_business(
    NEW.business_id,
    'negative_stock',
    p.name || ' has negative stock',
    'Current balance: ' || NEW.quantity || ' ' || COALESCE(p.unit, 'units') || '.',
    '/inventory'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS alert_negative_stock_trg ON public.inventory_balances;
CREATE TRIGGER alert_negative_stock_trg
  AFTER INSERT OR UPDATE OF quantity ON public.inventory_balances
  FOR EACH ROW EXECUTE FUNCTION public.alert_negative_stock();

CREATE OR REPLACE FUNCTION public.clear_negative_stock_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.inventory_posted AND NOT OLD.inventory_posted THEN
    DELETE FROM public.negative_stock_approvals WHERE sale_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clear_negative_stock_approval_trg ON public.sales;
CREATE TRIGGER clear_negative_stock_approval_trg
  AFTER UPDATE OF inventory_posted ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.clear_negative_stock_approval();

CREATE INDEX IF NOT EXISTS inventory_movements_negative_sale_idx
  ON public.inventory_movements (business_id, product_id, created_at DESC)
  WHERE caused_negative_stock;

NOTIFY pgrst, 'reload schema';

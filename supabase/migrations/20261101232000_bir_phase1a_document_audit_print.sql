ALTER TABLE public.business_compliance
  ADD COLUMN IF NOT EXISTS statutory_discount_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tin_branch_code text;
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS statutory_eligibility_confirmed boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_software_provider_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(value, '{}'::jsonb)
    FROM public.platform_settings
   WHERE key = 'software_provider';
$$;
REVOKE ALL ON FUNCTION public.get_software_provider_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_software_provider_settings() TO authenticated;

CREATE OR REPLACE FUNCTION public.log_document_event(
  _business_id uuid,
  _action text,
  _module text,
  _record_id text,
  _details jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_id uuid;
  headers jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_write_business(_business_id) THEN
    RAISE EXCEPTION 'Not authorized to log this business event';
  END IF;
  IF _action NOT IN ('PRINT', 'REPRINT', 'EXPORT') THEN
    RAISE EXCEPTION 'Unsupported document audit action';
  END IF;
  headers := COALESCE(NULLIF(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  INSERT INTO public.audit_logs (
    business_id, user_id, user_email, action, module, record_id, new_value, ip_address, user_agent
  )
  SELECT _business_id, auth.uid(), u.email, _action, _module, _record_id, _details,
         NULLIF(split_part(headers->>'x-forwarded-for', ',', 1), ''),
         NULLIF(headers->>'user-agent', '')
    FROM (SELECT 1) AS one
    LEFT JOIN auth.users u ON u.id = auth.uid()
  RETURNING id INTO event_id;
  RETURN event_id;
END;
$$;
REVOKE ALL ON FUNCTION public.log_document_event(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_document_event(uuid, text, text, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_statutory_discount_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rule jsonb;
  jurisdiction text;
BEGIN
  IF NEW.statutory_discount_type IS NULL THEN
    IF COALESCE(NEW.statutory_discount_amount, 0) > 0 THEN
      RAISE EXCEPTION 'A statutory discount type is required';
    END IF;
    RETURN NEW;
  END IF;
  SELECT bc.jurisdiction, bc.statutory_discount_rules->NEW.statutory_discount_type
    INTO jurisdiction, rule
    FROM public.business_compliance bc
   WHERE bc.business_id = NEW.business_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business compliance settings are required for a statutory discount';
  END IF;
  IF jurisdiction <> 'PH' THEN
    RETURN NEW;
  END IF;
  IF length(btrim(COALESCE(NEW.statutory_buyer_name, ''))) < 2
     OR length(btrim(COALESCE(NEW.statutory_buyer_id, ''))) < 2
     OR COALESCE(NEW.statutory_discount_amount, 0) <= 0
     OR NOT NEW.statutory_eligibility_confirmed THEN
    RAISE EXCEPTION 'Statutory discount requires buyer name, ID, eligibility confirmation and a positive discount';
  END IF;
  IF rule IS NULL
     OR COALESCE((rule->>'rate')::numeric, 0) <= 0
     OR COALESCE(rule->>'vat_treatment', 'manual_review') = 'manual_review' THEN
    RAISE EXCEPTION 'Configure the statutory discount rate and VAT treatment before issuing';
  END IF;
  IF COALESCE((rule->>'require_tin')::boolean, true)
     AND length(btrim(COALESCE(NEW.statutory_buyer_tin, ''))) < 2 THEN
    RAISE EXCEPTION 'This statutory discount requires the buyer TIN';
  END IF;
  IF NEW.discount_type <> 'percent'
     OR ABS(COALESCE(NEW.discount_value, 0) - (rule->>'rate')::numeric) > 0.0001
     OR ABS(COALESCE(NEW.statutory_discount_amount, 0) -
       ROUND(COALESCE(NEW.subtotal, 0) * (rule->>'rate')::numeric / 100, 2)) > 0.02 THEN
    RAISE EXCEPTION 'Statutory discount amount does not match the configured rate';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_statutory_discount_snapshot_trg ON public.sales;
CREATE TRIGGER guard_statutory_discount_snapshot_trg
  BEFORE INSERT OR UPDATE OF statutory_discount_type, statutory_buyer_name,
    statutory_buyer_id, statutory_buyer_tin, statutory_discount_amount,
    statutory_eligibility_confirmed
  ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.guard_statutory_discount_snapshot();

CREATE OR REPLACE FUNCTION public.validate_statutory_line_tax_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rule jsonb;
BEGIN
  IF NEW.statutory_discount_type IS NULL THEN RETURN NEW; END IF;
  SELECT statutory_discount_rules->NEW.statutory_discount_type INTO rule
    FROM public.business_compliance
   WHERE business_id = NEW.business_id AND jurisdiction = 'PH';
  IF rule->>'vat_treatment' = 'eligible_items_exempt'
     AND EXISTS (
       SELECT 1 FROM public.sale_items si
        WHERE si.sale_id = NEW.id AND si.tax_type IS DISTINCT FROM 'VAT_EXEMPT'
     ) THEN
    RAISE EXCEPTION 'All lines for this configured statutory VAT treatment must be VAT-exempt';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS statutory_line_tax_type_check ON public.sales;
CREATE CONSTRAINT TRIGGER statutory_line_tax_type_check
  AFTER INSERT OR UPDATE ON public.sales
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_statutory_line_tax_type();

CREATE OR REPLACE FUNCTION public.guard_sale_buyer_tin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  buyer_type text;
  buyer_tin text;
  jurisdiction text;
BEGIN
  SELECT bc.jurisdiction INTO jurisdiction
    FROM public.business_compliance bc
   WHERE bc.business_id = NEW.business_id;
  IF jurisdiction IS DISTINCT FROM 'PH' OR NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT type, tax_id INTO buyer_type, buyer_tin
    FROM public.customers
   WHERE id = NEW.customer_id AND business_id = NEW.business_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Buyer does not belong to this business'; END IF;
  IF buyer_type IN ('business', 'company', 'wholesale', 'corporate')
     AND length(btrim(COALESCE(buyer_tin, ''))) < 2 THEN
    RAISE EXCEPTION 'A TIN is required for a business buyer';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_sale_buyer_tin_trg ON public.sales;
CREATE TRIGGER guard_sale_buyer_tin_trg
  BEFORE INSERT OR UPDATE OF customer_id, business_id ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.guard_sale_buyer_tin();

DO $$
DECLARE
  definition text;
  changed text;
BEGIN
  SELECT pg_get_functiondef('public.create_sale(jsonb,jsonb,jsonb)'::regprocedure)
    INTO definition;
  changed := replace(
    definition,
    'return_reason, created_by',
    'return_reason, statutory_discount_type, statutory_buyer_name, statutory_buyer_id, statutory_buyer_tin, statutory_discount_amount, statutory_eligibility_confirmed, created_by'
  );
  changed := replace(
    changed,
    'NULLIF(header->>''return_reason'', ''''),',
    'NULLIF(header->>''return_reason'', ''''), NULLIF(header->>''statutory_discount_type'', ''''), NULLIF(header->>''statutory_buyer_name'', ''''), NULLIF(header->>''statutory_buyer_id'', ''''), NULLIF(header->>''statutory_buyer_tin'', ''''), COALESCE(NULLIF(header->>''statutory_discount_amount'', '''')::numeric, 0), COALESCE(NULLIF(header->>''statutory_eligibility_confirmed'', '''')::boolean, false),'
  );
  IF changed = definition THEN
    RAISE EXCEPTION 'Could not add statutory discount snapshots to create_sale';
  END IF;
  EXECUTE changed;

  SELECT pg_get_functiondef(
    'public.create_complete_pos_sale(jsonb,jsonb,jsonb,text)'::regprocedure
  ) INTO definition;
  changed := replace(
    definition,
    'base_total, notes',
    'base_total, statutory_discount_type, statutory_buyer_name, statutory_buyer_id, statutory_buyer_tin, statutory_discount_amount, statutory_eligibility_confirmed, notes'
  );
  changed := replace(
    changed,
    'NULLIF(_sale->>''notes'', '''')',
    'COALESCE(NULLIF(_sale->>''notes'', ''''), NULL)'
  );
  changed := replace(
    changed,
    'ROUND(v_total * v_exchange_rate, 2),',
    'ROUND(v_total * v_exchange_rate, 2), NULLIF(_sale->>''statutory_discount_type'', ''''), NULLIF(_sale->>''statutory_buyer_name'', ''''), NULLIF(_sale->>''statutory_buyer_id'', ''''), NULLIF(_sale->>''statutory_buyer_tin'', ''''), COALESCE(NULLIF(_sale->>''statutory_discount_amount'', '''')::numeric, 0), COALESCE(NULLIF(_sale->>''statutory_eligibility_confirmed'', '''')::boolean, false),'
  );
  IF changed = definition THEN
    RAISE EXCEPTION 'Could not add statutory discount snapshots to POS sale creation';
  END IF;
  EXECUTE changed;
END;
$$;

ALTER TABLE public.z_readings
  ADD COLUMN IF NOT EXISTS statutory_discounts jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
DECLARE
  definition text;
  changed text;
BEGIN
  SELECT pg_get_functiondef('public.z_reading_preview(uuid,date,uuid)'::regprocedure)
    INTO definition;
  changed := replace(
    definition,
    $needle$'discounts', COALESCE(sum(discount) FILTER (WHERE status <> 'voided' AND document_type IN ('sale','pos_sale')),0),$needle$,
    $replacement$'discounts', COALESCE(sum(discount) FILTER (WHERE status <> 'voided' AND document_type IN ('sale','pos_sale')),0),
    'statutory_discounts', COALESCE((SELECT jsonb_object_agg(statutory_discount_type, amount)
      FROM (SELECT statutory_discount_type, SUM(statutory_discount_amount) AS amount
        FROM public.sales
        WHERE business_id = _business_id AND inventory_posted AND sale_date = _date
          AND status <> 'voided' AND document_type IN ('sale','pos_sale')
          AND statutory_discount_type IS NOT NULL
          AND (_register_id IS NULL OR register_id = _register_id)
        GROUP BY statutory_discount_type) d), '{}'::jsonb),$replacement$
  );
  IF changed = definition THEN
    RAISE EXCEPTION 'Could not add statutory discount subtotals to Z reading preview';
  END IF;
  EXECUTE changed;

  SELECT pg_get_functiondef('public.close_day_z(uuid,date,uuid)'::regprocedure)
    INTO definition;
  changed := replace(
    definition,
    'discounts, voids, void_count, refunds, net_sales, payment_totals',
    'discounts, statutory_discounts, voids, void_count, refunds, net_sales, payment_totals'
  );
  changed := replace(
    changed,
    '(p->>''discounts'')::numeric, (p->>''voids'')::numeric,',
    '(p->>''discounts'')::numeric, p->''statutory_discounts'', (p->>''voids'')::numeric,'
  );
  IF changed = definition THEN
    RAISE EXCEPTION 'Could not store statutory discount subtotals in closed Z readings';
  END IF;
  EXECUTE changed;
END;
$$;

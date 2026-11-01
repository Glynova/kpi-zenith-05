ALTER TABLE public.business_compliance
  ADD COLUMN IF NOT EXISTS acknowledgement_certificate_no text,
  ADD COLUMN IF NOT EXISTS acknowledgement_certificate_date date,
  ADD COLUMN IF NOT EXISTS invoice_title text NOT NULL DEFAULT 'SALES INVOICE'
    CHECK (invoice_title IN (
      'SALES INVOICE',
      'OFFICIAL RECEIPT',
      'THIS SERVES AS YOUR SALES INVOICE'
    ));

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS updated_by uuid;
INSERT INTO public.platform_settings (key, value)
VALUES (
  'software_provider',
  '{"name":"","address":"","tin":"","accreditation_details":""}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS user_agent text;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS default_tax_type text NOT NULL DEFAULT 'VAT'
    CHECK (default_tax_type IN ('VAT', 'VAT_EXEMPT', 'ZERO_RATED'));

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS tax_type text
    CHECK (tax_type IN ('VAT', 'VAT_EXEMPT', 'ZERO_RATED'));

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS statutory_discount_type text
    CHECK (statutory_discount_type IN (
      'senior_citizen', 'pwd', 'athlete', 'solo_parent', 'other'
    )),
  ADD COLUMN IF NOT EXISTS statutory_buyer_name text,
  ADD COLUMN IF NOT EXISTS statutory_buyer_id text,
  ADD COLUMN IF NOT EXISTS statutory_buyer_tin text,
  ADD COLUMN IF NOT EXISTS statutory_discount_amount numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.goods_receipt_items
  ADD COLUMN IF NOT EXISTS entered_received_quantity numeric,
  ADD COLUMN IF NOT EXISTS entered_damaged_quantity numeric,
  ADD COLUMN IF NOT EXISTS entered_rejected_quantity numeric;

CREATE TABLE IF NOT EXISTS public.tax_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id uuid,
  reference text,
  tax_type text NOT NULL CHECK (tax_type IN ('VAT', 'VAT_EXEMPT', 'ZERO_RATED', 'WITHHOLDING')),
  direction text NOT NULL DEFAULT 'output'
    CHECK (direction IN ('output', 'input', 'withheld_by_customer', 'withheld_from_supplier')),
  taxable_amount numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  counterparty_name text,
  counterparty_tin text,
  txn_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tax_transactions_biz_date
  ON public.tax_transactions (business_id, txn_date);
ALTER TABLE public.tax_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read tax transactions" ON public.tax_transactions
  FOR SELECT TO authenticated USING (public.is_business_member(business_id));
GRANT SELECT ON public.tax_transactions TO authenticated;
GRANT ALL ON public.tax_transactions TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.tax_transactions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_sale_item_tax_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  product_type text;
BEGIN
  SELECT COALESCE(p.default_tax_type, 'VAT')
    INTO product_type
    FROM public.products p
   WHERE p.id = NEW.product_id
     AND p.business_id = NEW.business_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale item product does not belong to this business'; END IF;
  NEW.tax_type := COALESCE(NEW.tax_type, product_type);
  IF NEW.tax_type IS DISTINCT FROM product_type
     AND NOT public.can_manage_sensitive(NEW.business_id) THEN
    RAISE EXCEPTION 'Only an authorized manager may override a product tax type';
  END IF;
  IF NEW.tax_type IN ('VAT_EXEMPT', 'ZERO_RATED') THEN
    NEW.tax_rate := 0;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_sale_item_tax_type_trg ON public.sale_items;
CREATE TRIGGER guard_sale_item_tax_type_trg
  BEFORE INSERT OR UPDATE OF tax_type, tax_rate, product_id ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_sale_item_tax_type();

DO $$
DECLARE
  definition text;
  changed text;
BEGIN
  SELECT pg_get_functiondef('public.create_sale(jsonb,jsonb,jsonb)'::regprocedure)
    INTO definition;
  changed := replace(
    definition,
    'COALESCE(NULLIF(line.value->>''tax_rate'', '''')::numeric, 0)',
    'CASE WHEN COALESCE(NULLIF(line.value->>''tax_type'', ''''), (SELECT p.default_tax_type FROM public.products p WHERE p.id = NULLIF(line.value->>''product_id'', '''')::uuid AND p.business_id = v_business_id), ''VAT'') IN (''VAT_EXEMPT'', ''ZERO_RATED'') OR EXISTS (SELECT 1 FROM public.business_compliance bc WHERE bc.business_id = v_business_id AND bc.jurisdiction = ''PH'' AND bc.vat_registration_type <> ''vat'') THEN 0 ELSE COALESCE(NULLIF(line.value->>''tax_rate'', '''')::numeric, 0) END'
  );
  changed := replace(
    changed,
    'COALESCE(NULLIF(item->>''tax_rate'', '''')::numeric, 0)',
    'CASE WHEN COALESCE(NULLIF(item->>''tax_type'', ''''), (SELECT p.default_tax_type FROM public.products p WHERE p.id = NULLIF(item->>''product_id'', '''')::uuid AND p.business_id = v_business_id), ''VAT'') IN (''VAT_EXEMPT'', ''ZERO_RATED'') OR EXISTS (SELECT 1 FROM public.business_compliance bc WHERE bc.business_id = v_business_id AND bc.jurisdiction = ''PH'' AND bc.vat_registration_type <> ''vat'') THEN 0 ELSE COALESCE(NULLIF(item->>''tax_rate'', '''')::numeric, 0) END'
  );
  changed := replace(
    changed,
    'discount_type, tax_rate, tax, total, condition, notes',
    'discount_type, tax_rate, tax_type, tax, total, condition, notes'
  );
  changed := replace(
    changed,
    'COALESCE(NULLIF(item->>''discount_type'', ''''), ''amount''),',
    'COALESCE(NULLIF(item->>''discount_type'', ''''), ''amount''),'
  );
  changed := replace(
    changed,
    'line_result.tax, line_result.total,',
    'COALESCE(NULLIF(item->>''tax_type'', ''''), (SELECT p.default_tax_type FROM public.products p WHERE p.id = NULLIF(item->>''product_id'', '''')::uuid AND p.business_id = v_business_id), ''VAT''), line_result.tax, line_result.total,'
  );
  IF changed = definition THEN
    RAISE EXCEPTION 'Could not add per-line tax snapshots to create_sale';
  END IF;
  EXECUTE changed;

  SELECT pg_get_functiondef(
    'public.create_complete_pos_sale(jsonb,jsonb,jsonb,text)'::regprocedure
  ) INTO definition;
  changed := replace(
    definition,
    'COALESCE(NULLIF(line.value->>''tax_rate'', '''')::numeric, 0)',
    'CASE WHEN COALESCE(NULLIF(line.value->>''tax_type'', ''''), (SELECT p.default_tax_type FROM public.products p WHERE p.id = NULLIF(line.value->>''product_id'', '''')::uuid AND p.business_id = v_business_id), ''VAT'') IN (''VAT_EXEMPT'', ''ZERO_RATED'') OR EXISTS (SELECT 1 FROM public.business_compliance bc WHERE bc.business_id = v_business_id AND bc.jurisdiction = ''PH'' AND bc.vat_registration_type <> ''vat'') THEN 0 ELSE COALESCE(NULLIF(line.value->>''tax_rate'', '''')::numeric, 0) END'
  );
  changed := replace(
    changed,
    'COALESCE(NULLIF(item->>''tax_rate'', '''')::numeric, 0)',
    'CASE WHEN COALESCE(NULLIF(item->>''tax_type'', ''''), (SELECT p.default_tax_type FROM public.products p WHERE p.id = NULLIF(item->>''product_id'', '''')::uuid AND p.business_id = v_business_id), ''VAT'') IN (''VAT_EXEMPT'', ''ZERO_RATED'') OR EXISTS (SELECT 1 FROM public.business_compliance bc WHERE bc.business_id = v_business_id AND bc.jurisdiction = ''PH'' AND bc.vat_registration_type <> ''vat'') THEN 0 ELSE COALESCE(NULLIF(item->>''tax_rate'', '''')::numeric, 0) END'
  );
  changed := replace(
    changed,
    'tax_rate, tax, total, condition, notes',
    'tax_rate, tax_type, tax, total, condition, notes'
  );
  changed := replace(
    changed,
    'line_result.tax, line_result.total,',
    'COALESCE(NULLIF(item->>''tax_type'', ''''), (SELECT p.default_tax_type FROM public.products p WHERE p.id = NULLIF(item->>''product_id'', '''')::uuid AND p.business_id = v_business_id), ''VAT''), line_result.tax, line_result.total,'
  );
  IF changed = definition THEN
    RAISE EXCEPTION 'Could not add per-line tax snapshots to POS sale creation';
  END IF;
  EXECUTE changed;
END;
$$;

DO $$
DECLARE
  definition text;
  changed text;
BEGIN
  SELECT pg_get_functiondef(
    'public.validate_sale_tax_for_items(uuid,uuid,numeric,text,numeric,numeric,boolean)'::regprocedure
  ) INTO definition;
  changed := replace(
    definition,
    'GREATEST(COALESCE(p.tax_rate, bs.tax_rate, 0), 0) / 100,',
    'CASE WHEN COALESCE(si.tax_type, ''VAT'') <> ''VAT'' OR EXISTS (SELECT 1 FROM public.business_compliance bc WHERE bc.business_id = _business_id AND bc.jurisdiction = ''PH'' AND bc.vat_registration_type <> ''vat'') THEN 0 ELSE GREATEST(COALESCE(p.tax_rate, bs.tax_rate, 0), 0) END / 100,'
  );
  IF changed = definition THEN
    RAISE EXCEPTION 'Could not align product-rate tax validation with tax types';
  END IF;
  EXECUTE changed;
END;
$$;

CREATE OR REPLACE FUNCTION public.snapshot_sale_on_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  comp public.business_compliance%ROWTYPE;
  c record;
  item_discount numeric := 0;
  order_discount numeric := 0;
  discount_scale numeric := 1;
  vat_base numeric := 0;
  exempt_base numeric := 0;
  zero_base numeric := 0;
  total_base numeric := 0;
BEGIN
  IF NEW.inventory_posted AND NOT COALESCE(OLD.inventory_posted, false) THEN
    INSERT INTO public.business_compliance (business_id)
    VALUES (NEW.business_id) ON CONFLICT DO NOTHING;
    SELECT * INTO comp
      FROM public.business_compliance
     WHERE business_id = NEW.business_id
     FOR UPDATE;

    IF NEW.customer_id IS NOT NULL THEN
      SELECT name, tax_id INTO c
        FROM public.customers
       WHERE id = NEW.customer_id AND business_id = NEW.business_id;
      NEW.customer_name_snapshot := c.name;
      NEW.customer_tin_snapshot := c.tax_id;
    END IF;

    IF comp.jurisdiction = 'PH' THEN
      SELECT
        COALESCE(SUM(COALESCE(si.discount, 0)), 0),
        COALESCE(SUM(CASE WHEN COALESCE(si.tax_type, 'VAT') = 'VAT'
          THEN GREATEST(COALESCE(si.total, 0) - COALESCE(si.tax, 0), 0) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN si.tax_type = 'VAT_EXEMPT'
          THEN GREATEST(COALESCE(si.total, 0) - COALESCE(si.tax, 0), 0) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN si.tax_type = 'ZERO_RATED'
          THEN GREATEST(COALESCE(si.total, 0) - COALESCE(si.tax, 0), 0) ELSE 0 END), 0),
        COALESCE(SUM(GREATEST(COALESCE(si.total, 0) - COALESCE(si.tax, 0), 0)), 0)
      INTO item_discount, vat_base, exempt_base, zero_base, total_base
      FROM public.sale_items si
      WHERE si.sale_id = NEW.id;

      order_discount := GREATEST(COALESCE(NEW.discount, 0) - item_discount, 0);
      discount_scale := CASE WHEN COALESCE(NEW.subtotal, 0) > 0
        THEN GREATEST(NEW.subtotal - order_discount, 0) / NEW.subtotal
        ELSE 1 END;
      IF comp.vat_registration_type = 'vat' THEN
        NEW.vatable_amount := ROUND(vat_base * discount_scale, 2);
        NEW.vat_exempt_amount := ROUND(exempt_base * discount_scale, 2);
        NEW.zero_rated_amount := ROUND(zero_base * discount_scale, 2);
        NEW.vat_amount := ROUND(COALESCE(NEW.tax, 0), 2);
        NEW.non_vat_amount := 0;
      ELSE
        NEW.vatable_amount := 0;
        NEW.vat_amount := 0;
        NEW.vat_exempt_amount := CASE
          WHEN comp.vat_registration_type = 'vat_exempt'
            THEN ROUND(total_base * discount_scale, 2)
          ELSE 0
        END;
        NEW.zero_rated_amount := 0;
        NEW.non_vat_amount := CASE
          WHEN comp.vat_registration_type = 'non_vat'
            THEN ROUND(total_base * discount_scale, 2)
          ELSE 0
        END;
      END IF;
    ELSE
      NEW.vatable_amount := 0;
      NEW.vat_amount := 0;
      NEW.vat_exempt_amount := 0;
      NEW.zero_rated_amount := 0;
      NEW.non_vat_amount := GREATEST(COALESCE(NEW.subtotal, 0) - COALESCE(NEW.discount, 0), 0);
    END IF;

    IF NEW.document_type IN ('sale', 'pos_sale') THEN
      NEW.grand_total_before := comp.last_grand_total;
      NEW.grand_total_after := comp.last_grand_total + COALESCE(NEW.total, 0);
      UPDATE public.business_compliance
         SET last_grand_total = NEW.grand_total_after
       WHERE business_id = NEW.business_id;
    END IF;

  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_snapshot_sale_on_post ON public.sales;
CREATE TRIGGER a_snapshot_sale_on_post
  BEFORE UPDATE OF inventory_posted ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_sale_on_post();

CREATE OR REPLACE FUNCTION public.goods_receipt_input_vat_totals(_receipt_id uuid)
RETURNS TABLE(taxable_amount numeric, tax_amount numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH receipt_lines AS (
    SELECT
      GREATEST(COALESCE(ri.accepted_quantity, 0), 0) * COALESCE(ri.unit_cost, 0) AS gross_amount,
      GREATEST(COALESCE(pi.unit_cost, 0) * COALESCE(pi.quantity, 0), 0) AS ordered_gross,
      GREATEST(
        COALESCE(pi.unit_cost, 0) * COALESCE(pi.quantity, 0)
          - COALESCE(pi.discount, 0),
        0
      ) AS ordered_taxable,
      COALESCE(pi.discount, 0) AS line_discount,
      COALESCE(pi.tax, 0) AS line_tax,
      COALESCE(po.tax, 0) AS order_tax,
      COALESCE(po.subtotal, 0) AS order_subtotal
    FROM public.goods_receipt_items ri
    LEFT JOIN public.purchase_order_items pi ON pi.id = ri.purchase_order_item_id
    LEFT JOIN public.purchase_orders po ON po.id = pi.purchase_order_id
    WHERE ri.receipt_id = _receipt_id
  ),
  apportioned_lines AS (
    SELECT
      GREATEST(
        gross_amount - CASE WHEN ordered_gross > 0
          THEN line_discount * gross_amount / ordered_gross ELSE 0 END,
        0
      ) AS taxable_line,
      CASE
        WHEN line_tax > 0 AND ordered_taxable > 0
          THEN line_tax / ordered_taxable
        WHEN order_subtotal > 0
          THEN order_tax / order_subtotal
        ELSE 0
      END AS tax_rate
    FROM receipt_lines
  )
  SELECT
    COALESCE(SUM(taxable_line), 0),
    COALESCE(SUM(taxable_line * tax_rate), 0)
  FROM apportioned_lines;
$$;
REVOKE ALL ON FUNCTION public.goods_receipt_input_vat_totals(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_goods_receipt_input_vat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  comp public.business_compliance%ROWTYPE;
  taxable numeric;
  input_tax numeric;
BEGIN
  IF NEW.status <> 'confirmed' OR OLD.status = 'confirmed' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO comp FROM public.business_compliance
   WHERE business_id = NEW.business_id;
  IF NOT FOUND OR comp.jurisdiction <> 'PH' OR comp.vat_registration_type <> 'vat' THEN
    RETURN NEW;
  END IF;

  SELECT totals.taxable_amount, totals.tax_amount
    INTO taxable, input_tax
    FROM public.goods_receipt_input_vat_totals(NEW.id) totals;

  IF input_tax > 0 AND NOT EXISTS (
    SELECT 1 FROM public.tax_transactions
    WHERE source_type = 'goods_receipt' AND source_id = NEW.id AND direction = 'input'
  ) THEN
    INSERT INTO public.tax_transactions (
      business_id, source_type, source_id, reference, tax_type, direction,
      taxable_amount, rate, tax_amount, txn_date, created_by
    ) VALUES (
      NEW.business_id, 'goods_receipt', NEW.id, NEW.receipt_number, 'VAT', 'input',
      ROUND(taxable, 2),
      CASE WHEN taxable > 0 THEN ROUND(input_tax / taxable * 100, 2) ELSE 0 END,
      ROUND(input_tax, 2), NEW.receipt_date, auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS goods_receipt_input_vat_trg ON public.goods_receipts;
CREATE TRIGGER goods_receipt_input_vat_trg
  AFTER UPDATE OF status ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.record_goods_receipt_input_vat();

WITH receipt_input_vat AS (
  SELECT
    gr.id,
    gr.business_id,
    gr.receipt_number,
    gr.receipt_date,
    gr.received_by,
    gr.created_by,
    s.name AS supplier_name,
    s.tax_number AS supplier_tin,
    totals.taxable_amount,
    totals.tax_amount
  FROM public.goods_receipts gr
  JOIN public.business_compliance bc
    ON bc.business_id = gr.business_id
   AND bc.jurisdiction = 'PH'
   AND bc.vat_registration_type = 'vat'
  CROSS JOIN LATERAL public.goods_receipt_input_vat_totals(gr.id) totals
  LEFT JOIN public.suppliers s ON s.id = gr.supplier_id
  WHERE gr.status = 'confirmed'
)
INSERT INTO public.tax_transactions (
  business_id, source_type, source_id, reference, tax_type, direction,
  taxable_amount, rate, tax_amount, counterparty_name, counterparty_tin,
  txn_date, created_by
)
SELECT
  r.business_id, 'goods_receipt', r.id, r.receipt_number, 'VAT', 'input',
  ROUND(r.taxable_amount, 2),
  CASE WHEN r.taxable_amount > 0
    THEN ROUND(r.tax_amount / r.taxable_amount * 100, 2) ELSE 0 END,
  ROUND(r.tax_amount, 2), r.supplier_name, r.supplier_tin, r.receipt_date,
  COALESCE(r.received_by, r.created_by)
FROM receipt_input_vat r
WHERE r.tax_amount > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.tax_transactions t
     WHERE t.business_id = r.business_id
       AND t.source_type = 'goods_receipt'
       AND t.source_id = r.id
       AND t.direction = 'input'
  );

CREATE OR REPLACE FUNCTION public.audit_phase1_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_before jsonb;
  row_after jsonb;
  bid uuid;
  rid text;
  action_name text;
  headers jsonb;
BEGIN
  row_before := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  row_after := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  bid := COALESCE(NULLIF(row_after->>'business_id', '')::uuid,
                  NULLIF(row_before->>'business_id', '')::uuid);
  rid := COALESCE(row_after->>'id', row_before->>'id');

  IF TG_TABLE_NAME IN ('products', 'product_variants') AND TG_OP = 'UPDATE'
     AND (row_before->'selling_price', row_before->'cost_price', row_before->'tax_rate',
          row_before->'default_tax_type')
         IS NOT DISTINCT FROM
         (row_after->'selling_price', row_after->'cost_price', row_after->'tax_rate',
          row_after->'default_tax_type') THEN
    RETURN NEW;
  END IF;

  action_name := CASE
    WHEN TG_OP = 'INSERT' THEN 'CREATE'
    WHEN TG_OP = 'DELETE' THEN 'DELETE'
    WHEN row_after->>'status' = 'voided' THEN 'VOID'
    WHEN row_after->>'status' = 'cancelled' THEN 'CANCEL'
    ELSE 'EDIT'
  END;
  headers := COALESCE(NULLIF(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);

  INSERT INTO public.audit_logs (
    business_id, user_id, user_email, action, module, record_id,
    old_value, new_value, ip_address, user_agent
  )
  SELECT bid, auth.uid(), u.email, action_name, TG_TABLE_NAME, rid,
         row_before, row_after,
         NULLIF(split_part(headers->>'x-forwarded-for', ',', 1), ''),
         NULLIF(headers->>'user-agent', '')
    FROM (SELECT 1) AS one
    LEFT JOIN auth.users u ON u.id = auth.uid()
   WHERE bid IS NOT NULL;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phase1_audit_sales ON public.sales;
CREATE TRIGGER phase1_audit_sales
  AFTER INSERT OR UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.audit_phase1_change();
DROP TRIGGER IF EXISTS phase1_audit_purchase_orders ON public.purchase_orders;
CREATE TRIGGER phase1_audit_purchase_orders
  AFTER INSERT OR UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_phase1_change();
DROP TRIGGER IF EXISTS phase1_audit_goods_receipts ON public.goods_receipts;
CREATE TRIGGER phase1_audit_goods_receipts
  AFTER INSERT OR UPDATE ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.audit_phase1_change();
DROP TRIGGER IF EXISTS phase1_audit_products ON public.products;
DROP TRIGGER IF EXISTS audit_price_change_trg ON public.products;
CREATE TRIGGER phase1_audit_products
  AFTER INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.audit_phase1_change();
DROP TRIGGER IF EXISTS phase1_audit_product_variants ON public.product_variants;
DROP TRIGGER IF EXISTS audit_price_change_trg ON public.product_variants;
CREATE TRIGGER phase1_audit_product_variants
  AFTER INSERT OR UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.audit_phase1_change();
DROP TRIGGER IF EXISTS phase1_audit_compliance ON public.business_compliance;
DROP TRIGGER IF EXISTS audit_compliance_trg ON public.business_compliance;
CREATE TRIGGER phase1_audit_compliance
  AFTER INSERT OR UPDATE ON public.business_compliance
  FOR EACH ROW EXECUTE FUNCTION public.audit_phase1_change();
DROP TRIGGER IF EXISTS phase1_audit_membership ON public.user_businesses;
DROP TRIGGER IF EXISTS audit_membership_trg ON public.user_businesses;
CREATE TRIGGER phase1_audit_membership
  AFTER INSERT OR UPDATE OF role OR DELETE ON public.user_businesses
  FOR EACH ROW EXECUTE FUNCTION public.audit_phase1_change();
DROP TRIGGER IF EXISTS phase1_audit_sale_items ON public.sale_items;
CREATE TRIGGER phase1_audit_sale_items
  AFTER INSERT OR UPDATE ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_phase1_change();
DROP TRIGGER IF EXISTS phase1_audit_sale_payments ON public.sale_payments;
CREATE TRIGGER phase1_audit_sale_payments
  AFTER INSERT OR UPDATE ON public.sale_payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_phase1_change();
DROP TRIGGER IF EXISTS phase1_audit_purchase_order_items ON public.purchase_order_items;
CREATE TRIGGER phase1_audit_purchase_order_items
  AFTER INSERT OR UPDATE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_phase1_change();
DROP TRIGGER IF EXISTS phase1_audit_goods_receipt_items ON public.goods_receipt_items;
CREATE TRIGGER phase1_audit_goods_receipt_items
  AFTER INSERT OR UPDATE ON public.goods_receipt_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_phase1_change();

CREATE OR REPLACE FUNCTION public.protect_audit_logs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit log records are append-only';
END;
$$;
DROP TRIGGER IF EXISTS audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.protect_audit_logs();
DROP TRIGGER IF EXISTS audit_logs_no_truncate ON public.audit_logs;
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON public.audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION public.protect_audit_logs();
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM service_role;

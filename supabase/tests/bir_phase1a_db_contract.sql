DO $$
DECLARE
  missing text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.sales'::regclass
       AND tgname = 'assign_sale_number_trg'
       AND NOT tgisinternal
  ) THEN
    missing := array_append(missing, 'database sale-number assignment trigger');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.sales'::regclass
       AND tgname = 'sale_number_immutable_trg'
       AND NOT tgisinternal
  ) THEN
    missing := array_append(missing, 'immutable sale-number trigger');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.sales'::regclass
       AND tgname = 'sale_header_totals_trg'
       AND tgconstraint <> 0
       AND tgdeferrable
       AND tginitdeferred
  ) THEN
    missing := array_append(missing, 'deferred sale-header totals constraint');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.sales'::regclass
       AND tgname = 'sales_no_delete_phase1a'
       AND NOT tgisinternal
  ) THEN
    missing := array_append(missing, 'sales DELETE guard');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.sale_items'::regclass
       AND tgname = 'sale_items_no_delete_phase1a'
       AND NOT tgisinternal
  ) THEN
    missing := array_append(missing, 'sale_items DELETE guard');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.sale_payments'::regclass
       AND tgname = 'sale_payments_no_delete_phase1a'
       AND NOT tgisinternal
  ) THEN
    missing := array_append(missing, 'sale_payments DELETE guard');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.audit_logs'::regclass
       AND tgname = 'audit_logs_immutable'
       AND NOT tgisinternal
  ) THEN
    missing := array_append(missing, 'append-only audit-log guard');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE oid = 'public.tax_transactions'::regclass
       AND relrowsecurity
  ) THEN
    missing := array_append(missing, 'tax_transactions row-level security');
  END IF;

  IF cardinality(missing) > 0 THEN
    RAISE EXCEPTION 'Phase 1A database contract failed: %', array_to_string(missing, ', ');
  END IF;
END;
$$;

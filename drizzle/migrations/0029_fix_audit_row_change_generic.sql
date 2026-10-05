
CREATE OR REPLACE FUNCTION public.audit_row_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE act text := TG_ARGV[0]; o jsonb; n jsonb;
BEGIN
  o := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  n := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  IF TG_OP = 'UPDATE' AND (o - 'updated_at' - 'last_grand_total') = (n - 'updated_at' - 'last_grand_total') THEN
    RETURN NEW;
  END IF;
  PERFORM public._audit(COALESCE(n->>'business_id', o->>'business_id')::uuid, act, TG_TABLE_NAME,
    COALESCE(n->>'id', o->>'id', n->>'business_id', o->>'business_id'), o, n);
  RETURN COALESCE(NEW, OLD);
END $$;

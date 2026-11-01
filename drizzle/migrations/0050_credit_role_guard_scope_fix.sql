CREATE OR REPLACE FUNCTION public.guard_customer_credit_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- Inserts need a manager only when a limit is actually granted; updates only
  -- when the limit changes, so editing other fields stays open to everyone.
  IF (TG_OP = 'INSERT' AND COALESCE(NEW.credit_limit, 0) > 0)
     OR (TG_OP = 'UPDATE' AND NEW.credit_limit IS DISTINCT FROM OLD.credit_limit) THEN
    IF NOT public.can_manage_sensitive(NEW.business_id) THEN
      RAISE EXCEPTION 'Only owners, admins and managers can set a customer credit limit';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
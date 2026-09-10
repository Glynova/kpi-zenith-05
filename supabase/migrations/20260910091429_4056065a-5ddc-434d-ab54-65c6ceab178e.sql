-- 1. Audit logs may no longer be inserted directly by business members.
DROP POLICY IF EXISTS "members write logs" ON public.audit_logs;
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

-- Controlled, identity-stamped write path.
CREATE OR REPLACE FUNCTION public.log_audit_event(
  _business_id uuid,
  _action text,
  _module text,
  _record_id text DEFAULT NULL,
  _old_value jsonb DEFAULT NULL,
  _new_value jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  _id uuid;
begin
  if auth.uid() is null or not public.can_write_business(_business_id) then
    raise exception 'not authorized';
  end if;

  if _action is null or length(trim(_action)) = 0 or length(_action) > 100 then
    raise exception 'invalid action';
  end if;
  if _module is null or length(trim(_module)) = 0 or length(_module) > 100 then
    raise exception 'invalid module';
  end if;
  if _record_id is not null and length(_record_id) > 200 then
    raise exception 'invalid record id';
  end if;

  insert into public.audit_logs (business_id, user_id, user_email, action, module, record_id, old_value, new_value)
  values (
    _business_id,
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    trim(_action),
    trim(_module),
    _record_id,
    _old_value,
    _new_value
  )
  returning id into _id;

  return _id;
end;
$$;

REVOKE ALL ON FUNCTION public.log_audit_event(uuid, text, text, text, jsonb, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(uuid, text, text, text, jsonb, jsonb) TO authenticated, service_role;

-- 2. Revoke signed-in execute on a SECURITY DEFINER function the app never calls directly.
REVOKE EXECUTE ON FUNCTION public.post_purchase_return(uuid) FROM authenticated, anon;

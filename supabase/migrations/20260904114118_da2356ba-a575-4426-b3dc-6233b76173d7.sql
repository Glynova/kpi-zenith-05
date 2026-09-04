-- 1) Audit logs: no forging
drop policy if exists "members write logs" on public.audit_logs;
create policy "members write logs" on public.audit_logs
  for insert to authenticated
  with check (public.can_write_business(business_id) and user_id = auth.uid());

create or replace function public.stamp_audit_log_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  new.user_email := (select email from auth.users where id = auth.uid());
  return new;
end;
$$;
revoke all on function public.stamp_audit_log_identity() from public, anon, authenticated;

drop trigger if exists stamp_audit_log_identity on public.audit_logs;
create trigger stamp_audit_log_identity
  before insert on public.audit_logs
  for each row execute function public.stamp_audit_log_identity();

-- 2) Employees / payroll: sensitive read restriction
drop policy if exists "members read" on public.employees;
create policy "sensitive read" on public.employees
  for select to authenticated
  using (public.can_manage_sensitive(business_id) or user_id = auth.uid());

drop policy if exists "members read" on public.payroll;
create policy "sensitive read" on public.payroll
  for select to authenticated
  using (
    public.can_manage_sensitive(business_id)
    or exists (
      select 1 from public.employees e
      where e.id = payroll.employee_id and e.user_id = auth.uid()
    )
  );

-- 3) SECURITY DEFINER functions: remove anon execute + trigger fn grants
revoke all on function public.close_register(uuid, numeric, text) from anon;
revoke all on function public.complete_sale(uuid) from anon;
revoke all on function public.post_sales_return(uuid) from anon;
revoke all on function public.current_partner_id() from anon;
revoke all on function public.protect_customer_delete() from public, anon, authenticated;
revoke all on function public.sync_sale_payments() from public, anon, authenticated;
revoke all on function public.track_price_change() from public, anon, authenticated;

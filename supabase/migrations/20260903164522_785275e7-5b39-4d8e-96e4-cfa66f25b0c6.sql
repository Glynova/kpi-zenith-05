-- ============ PLANS ============
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  price numeric(12,2) not null default 0,
  currency text not null default 'PHP',
  billing_interval text not null default 'month',
  trial_days integer not null default 0,
  status text not null default 'active',
  sort_order integer not null default 0,
  paymongo_plan_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.subscription_plans to anon, authenticated;
grant all on public.subscription_plans to service_role;
alter table public.subscription_plans enable row level security;
drop policy if exists "Anyone can read active plans" on public.subscription_plans;
create policy "Anyone can read active plans" on public.subscription_plans
  for select using (status = 'active');

create table if not exists public.plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.subscription_plans(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default true,
  limit_value integer,
  created_at timestamptz not null default now(),
  unique (plan_id, feature_key)
);
grant select on public.plan_entitlements to anon, authenticated;
grant all on public.plan_entitlements to service_role;
alter table public.plan_entitlements enable row level security;
drop policy if exists "Anyone can read entitlements" on public.plan_entitlements;
create policy "Anyone can read entitlements" on public.plan_entitlements
  for select using (true);

-- ============ PLATFORM ADMINS ============
create table if not exists public.platform_admins (
  user_id uuid primary key,
  created_at timestamptz not null default now()
);
grant select on public.platform_admins to authenticated;
grant all on public.platform_admins to service_role;
alter table public.platform_admins enable row level security;
drop policy if exists "See own platform admin row" on public.platform_admins;
create policy "See own platform admin row" on public.platform_admins
  for select to authenticated using (user_id = auth.uid());

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

-- ============ SUBSCRIPTIONS ============
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  paymongo_subscription_id text,
  paymongo_customer_id text,
  status text not null default 'trialing',
  start_date timestamptz not null default now(),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  pending_plan_id uuid references public.subscription_plans(id),
  pending_plan_effective_at timestamptz,
  payment_method_brand text,
  payment_method_last4 text,
  test_mode boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists subscriptions_business_uniq on public.subscriptions(business_id);
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
alter table public.subscriptions enable row level security;
drop policy if exists "Members read own subscription" on public.subscriptions;
create policy "Members read own subscription" on public.subscriptions
  for select to authenticated
  using (public.is_business_member(business_id) or public.is_platform_admin());

create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  paymongo_payment_id text unique,
  amount numeric(12,2) not null default 0,
  currency text not null default 'PHP',
  status text not null default 'pending',
  paid_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now()
);
grant select on public.subscription_payments to authenticated;
grant all on public.subscription_payments to service_role;
alter table public.subscription_payments enable row level security;
drop policy if exists "Members read own payments" on public.subscription_payments;
create policy "Members read own payments" on public.subscription_payments
  for select to authenticated
  using (public.is_business_member(business_id) or public.is_platform_admin());

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  external_invoice_id text unique,
  invoice_number text,
  amount numeric(12,2) not null default 0,
  currency text not null default 'PHP',
  due_date timestamptz,
  status text not null default 'open',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
grant select on public.billing_invoices to authenticated;
grant all on public.billing_invoices to service_role;
alter table public.billing_invoices enable row level security;
drop policy if exists "Members read own billing invoices" on public.billing_invoices;
create policy "Members read own billing invoices" on public.billing_invoices
  for select to authenticated
  using (public.is_business_member(business_id) or public.is_platform_admin());

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.subscriptions(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  event_type text not null,
  external_event_id text unique,
  payload jsonb,
  created_at timestamptz not null default now()
);
grant select on public.subscription_events to authenticated;
grant all on public.subscription_events to service_role;
alter table public.subscription_events enable row level security;
drop policy if exists "Members read own subscription events" on public.subscription_events;
create policy "Members read own subscription events" on public.subscription_events
  for select to authenticated
  using ((business_id is not null and public.is_business_member(business_id)) or public.is_platform_admin());

-- updated_at triggers
drop trigger if exists set_updated_at_subscription_plans on public.subscription_plans;
create trigger set_updated_at_subscription_plans before update on public.subscription_plans
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_subscriptions on public.subscriptions;
create trigger set_updated_at_subscriptions before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ============ SEED PLANS ============
insert into public.subscription_plans (name, slug, description, price, currency, billing_interval, trial_days, sort_order)
values
  ('Free', 'free', 'Get started with the core essentials for one small business.', 0, 'PHP', 'month', 0, 1),
  ('Pro', 'pro', 'Everything a growing business needs to run operations end to end.', 999, 'PHP', 'month', 14, 2),
  ('Business', 'business', 'Multi-branch operations, advanced controls and consolidated reporting.', 1999, 'PHP', 'month', 0, 3)
on conflict (slug) do update
  set name = excluded.name,
      description = excluded.description,
      price = excluded.price,
      trial_days = excluded.trial_days,
      sort_order = excluded.sort_order;

-- ============ SEED ENTITLEMENTS ============
with p as (select id, slug from public.subscription_plans),
free_ent(feature_key, enabled, limit_value) as (values
  ('dashboard', true, null::int), ('products', true, null), ('inventory', true, null),
  ('customers', true, null), ('suppliers', true, null), ('sales', true, null),
  ('expenses', true, null), ('basic_reports', true, null),
  ('purchase_orders', false, null), ('bom', false, null), ('invoices', false, null),
  ('cash_flow', false, null), ('ar_ap', false, null), ('advanced_reports', false, null),
  ('payroll', false, null), ('analytics', false, null), ('audit_logs', false, null),
  ('advanced_inventory', false, null), ('multi_warehouse', false, null),
  ('multi_branch', false, null), ('advanced_permissions', false, null),
  ('consolidated_reports', false, null), ('api_access', false, null), ('priority_support', false, null),
  ('max_users', true, 2), ('max_businesses', true, 1), ('max_products', true, 100),
  ('max_warehouses', true, 1)
),
pro_ent(feature_key, enabled, limit_value) as (values
  ('dashboard', true, null::int), ('products', true, null), ('inventory', true, null),
  ('customers', true, null), ('suppliers', true, null), ('sales', true, null),
  ('expenses', true, null), ('basic_reports', true, null),
  ('purchase_orders', true, null), ('bom', true, null), ('invoices', true, null),
  ('cash_flow', true, null), ('ar_ap', true, null), ('advanced_reports', true, null),
  ('payroll', true, null), ('analytics', true, null), ('audit_logs', true, null),
  ('advanced_inventory', true, null), ('multi_warehouse', true, null),
  ('multi_branch', false, null), ('advanced_permissions', false, null),
  ('consolidated_reports', false, null), ('api_access', false, null), ('priority_support', false, null),
  ('max_users', true, 10), ('max_businesses', true, 3), ('max_products', true, null),
  ('max_warehouses', true, 5)
),
biz_ent(feature_key, enabled, limit_value) as (values
  ('dashboard', true, null::int), ('products', true, null), ('inventory', true, null),
  ('customers', true, null), ('suppliers', true, null), ('sales', true, null),
  ('expenses', true, null), ('basic_reports', true, null),
  ('purchase_orders', true, null), ('bom', true, null), ('invoices', true, null),
  ('cash_flow', true, null), ('ar_ap', true, null), ('advanced_reports', true, null),
  ('payroll', true, null), ('analytics', true, null), ('audit_logs', true, null),
  ('advanced_inventory', true, null), ('multi_warehouse', true, null),
  ('multi_branch', true, null), ('advanced_permissions', true, null),
  ('consolidated_reports', true, null), ('api_access', true, null), ('priority_support', true, null),
  ('max_users', true, null), ('max_businesses', true, null), ('max_products', true, null),
  ('max_warehouses', true, null)
),
rows as (
  select (select id from p where slug='free') as plan_id, * from free_ent
  union all select (select id from p where slug='pro'), * from pro_ent
  union all select (select id from p where slug='business'), * from biz_ent
)
insert into public.plan_entitlements (plan_id, feature_key, enabled, limit_value)
select plan_id, feature_key, enabled, limit_value from rows
on conflict (plan_id, feature_key) do update
  set enabled = excluded.enabled, limit_value = excluded.limit_value;

-- ============ AUTO TRIAL ON NEW BUSINESS ============
create or replace function public.start_trial_for_business()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _pro uuid;
  _days int;
begin
  select id, trial_days into _pro, _days from public.subscription_plans where slug = 'pro';
  if _pro is null then return new; end if;
  insert into public.subscriptions (business_id, plan_id, status, trial_ends_at, current_period_start, current_period_end)
  values (new.id, _pro, 'trialing', now() + make_interval(days => coalesce(_days, 14)),
          now(), now() + make_interval(days => coalesce(_days, 14)))
  on conflict (business_id) do nothing;
  return new;
end;
$$;
drop trigger if exists start_trial_for_business_trg on public.businesses;
create trigger start_trial_for_business_trg after insert on public.businesses
  for each row execute function public.start_trial_for_business();

-- backfill: existing businesses without a subscription get a trial too
insert into public.subscriptions (business_id, plan_id, status, trial_ends_at, current_period_start, current_period_end)
select b.id, (select id from public.subscription_plans where slug='pro'), 'trialing',
       now() + interval '14 days', now(), now() + interval '14 days'
from public.businesses b
where not exists (select 1 from public.subscriptions s where s.business_id = b.id)
on conflict (business_id) do nothing;
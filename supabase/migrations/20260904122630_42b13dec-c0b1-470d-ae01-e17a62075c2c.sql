-- ============================================================
-- Billing lifecycle completion: checkouts, provider identifiers,
-- expiry sweeper and scheduled maintenance.
-- ============================================================

-- 1. Provider identifiers per mode on the plan catalogue
alter table public.subscription_plans
  add column if not exists paymongo_test_plan_id text,
  add column if not exists paymongo_synced_at timestamptz;

-- 2. Extra lifecycle columns on subscriptions
alter table public.subscriptions
  add column if not exists paymongo_plan_id text,
  add column if not exists latest_invoice_id text,
  add column if not exists latest_payment_intent_id text,
  add column if not exists payment_method_type text,
  add column if not exists payment_method_brand text,
  add column if not exists payment_method_last4 text,
  add column if not exists test_mode boolean,
  add column if not exists last_synced_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists ended_at timestamptz;

alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('trialing','active','past_due','unpaid','cancelled','suspended','incomplete','incomplete_expired'));

create unique index if not exists subscriptions_paymongo_subscription_id_key
  on public.subscriptions (paymongo_subscription_id) where paymongo_subscription_id is not null;

-- 3. Invoices / payments carry payment-intent links
alter table public.billing_invoices
  add column if not exists payment_intent_id text,
  add column if not exists description text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_retry_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.billing_invoices drop constraint if exists billing_invoices_status_check;
alter table public.billing_invoices add constraint billing_invoices_status_check
  check (status in ('draft','open','paid','payment_failed','void','uncollectible'));

drop trigger if exists set_updated_at_billing_invoices on public.billing_invoices;
create trigger set_updated_at_billing_invoices before update on public.billing_invoices
  for each row execute function public.set_updated_at();

alter table public.subscription_payments
  add column if not exists payment_intent_id text,
  add column if not exists invoice_id uuid references public.billing_invoices(id) on delete set null,
  add column if not exists method_brand text,
  add column if not exists method_last4 text,
  add column if not exists refunded_amount numeric not null default 0,
  add column if not exists description text;

create unique index if not exists subscription_payments_paymongo_payment_id_key
  on public.subscription_payments (paymongo_payment_id) where paymongo_payment_id is not null;

alter table public.subscription_events
  add column if not exists livemode boolean,
  add column if not exists processed_at timestamptz,
  add column if not exists error text;

-- 4. Checkout sessions: one row per attempt to start/upgrade a paid plan.
create table if not exists public.billing_checkouts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  created_by uuid not null,
  status text not null default 'pending'
    check (status in ('pending','awaiting_action','processing','succeeded','failed','expired','cancelled','superseded')),
  amount numeric not null,
  currency text not null default 'PHP',
  test_mode boolean not null default false,
  payment_method_type text check (payment_method_type in ('card','paymaya')),
  promo_code text,
  promo_snapshot jsonb,
  paymongo_customer_id text,
  paymongo_subscription_id text,
  paymongo_invoice_id text,
  paymongo_payment_intent_id text,
  paymongo_payment_method_id text,
  next_action_url text,
  failure_code text,
  failure_reason text,
  attempts integer not null default 0,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.billing_checkouts to authenticated;
grant all on public.billing_checkouts to service_role;

alter table public.billing_checkouts enable row level security;

drop policy if exists "Members read their business checkouts" on public.billing_checkouts;
create policy "Members read their business checkouts"
  on public.billing_checkouts for select to authenticated
  using (public.is_business_member(business_id) or public.is_platform_admin());

create index if not exists billing_checkouts_business_status_idx
  on public.billing_checkouts (business_id, status, created_at desc);
create unique index if not exists billing_checkouts_paymongo_subscription_id_key
  on public.billing_checkouts (paymongo_subscription_id) where paymongo_subscription_id is not null;
create index if not exists billing_checkouts_payment_intent_idx
  on public.billing_checkouts (paymongo_payment_intent_id) where paymongo_payment_intent_id is not null;

drop trigger if exists set_updated_at_billing_checkouts on public.billing_checkouts;
create trigger set_updated_at_billing_checkouts before update on public.billing_checkouts
  for each row execute function public.set_updated_at();

-- 5. Expiry sweeper: trial -> free, cancel-at-period-end -> cancelled,
--    stale checkouts -> expired. Runs from cron and lazily from the server.
create or replace function public.expire_subscriptions()
returns table(trials_expired integer, subscriptions_ended integer, checkouts_expired integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _free uuid;
  _trials integer := 0;
  _ended integer := 0;
  _checkouts integer := 0;
begin
  select id into _free from public.subscription_plans where slug = 'free';

  -- Trials that ran out without a paid subscription fall back to Free.
  if _free is not null then
    with moved as (
      update public.subscriptions s
         set plan_id = _free,
             status = 'active',
             trial_ends_at = null,
             cancel_at_period_end = false,
             pending_plan_id = null,
             current_period_start = now(),
             current_period_end = null,
             ended_at = coalesce(s.ended_at, now())
       where s.status = 'trialing'
         and s.trial_ends_at is not null
         and s.trial_ends_at <= now()
         and s.paymongo_subscription_id is null
      returning s.id, s.business_id
    )
    insert into public.subscription_events (subscription_id, business_id, event_type, source, payload, processed_at)
    select id, business_id, 'trial.expired', 'system', jsonb_build_object('moved_to', 'free'), now() from moved;
    get diagnostics _trials = row_count;
  end if;

  -- Subscriptions cancelled at period end whose period has now passed.
  with ended as (
    update public.subscriptions s
       set status = 'cancelled',
           cancelled_at = coalesce(s.cancelled_at, now()),
           ended_at = now(),
           cancel_at_period_end = false
     where s.cancel_at_period_end = true
       and s.status in ('active','past_due','trialing')
       and s.current_period_end is not null
       and s.current_period_end <= now()
    returning s.id, s.business_id
  )
  insert into public.subscription_events (subscription_id, business_id, event_type, source, payload, processed_at)
  select id, business_id, 'subscription.ended', 'system', jsonb_build_object('reason', 'cancel_at_period_end'), now() from ended;
  get diagnostics _ended = row_count;

  -- Abandoned checkouts.
  update public.billing_checkouts
     set status = 'expired'
   where status in ('pending','awaiting_action')
     and expires_at <= now();
  get diagnostics _checkouts = row_count;

  return query select _trials, _ended, _checkouts;
end;
$$;

revoke all on function public.expire_subscriptions() from public, anon, authenticated;
grant execute on function public.expire_subscriptions() to service_role;

-- 6. Hourly maintenance when pg_cron is available (best effort).
do $$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    begin
      create extension if not exists pg_cron;
    exception when others then
      raise notice 'pg_cron unavailable: %', sqlerrm;
    end;
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'billing-expire-subscriptions') then
      perform cron.unschedule('billing-expire-subscriptions');
    end if;
    perform cron.schedule('billing-expire-subscriptions', '17 * * * *', 'select public.expire_subscriptions()');
  end if;
end $$;
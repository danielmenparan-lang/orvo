-- ORVO Revenue Engine
-- Run in Supabase → SQL Editor (once). Safe to re-run.

-- Profiles: builder subscription plan
alter table public.profiles
  add column if not exists builder_plan text default 'free',
  add column if not exists builder_plan_until timestamptz;

-- Requests: featured boost + completion
alter table public.requests
  add column if not exists featured_until timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid references auth.users(id);

-- Payments: escrow lifecycle
alter table public.payments
  add column if not exists escrow_status text default 'none',
  add column if not exists released_at timestamptz,
  add column if not exists stripe_session_id text;

comment on column public.payments.escrow_status is 'none | held | released | refunded';

-- Builder Pro / boost purchases (audit log)
create table if not exists public.plan_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('builder_pro', 'request_boost')),
  amount_cents int not null,
  request_id uuid references public.requests(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'canceled')),
  created_at timestamptz not null default now()
);

alter table public.plan_purchases enable row level security;

drop policy if exists "plan_purchases_own_select" on public.plan_purchases;
create policy "plan_purchases_own_select" on public.plan_purchases
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "plan_purchases_own_insert" on public.plan_purchases;
create policy "plan_purchases_own_insert" on public.plan_purchases
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "plan_purchases_own_update" on public.plan_purchases;
create policy "plan_purchases_own_update" on public.plan_purchases
  for update to authenticated
  using (auth.uid() = user_id);

-- Indexes for marketplace browse
create index if not exists requests_featured_until_idx on public.requests (featured_until desc nulls last);
create index if not exists requests_status_created_idx on public.requests (status, created_at desc);
create index if not exists payments_escrow_status_idx on public.payments (escrow_status);

-- Allow clients to mark their funded requests completed
-- (existing RLS should already allow owners to update their requests;
--  this is a reminder — adjust policies if updates fail)

-- ORVO MVP schema + RLS
-- Run in Supabase SQL Editor (Project → SQL). Safe to re-run with IF NOT EXISTS patterns where noted.

-- ── ENUMS ──
do $$ begin
  create type public.builder_status as enum ('none', 'pending', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.request_status as enum (
    'open', 'in_progress', 'funded', 'delivered', 'completed', 'cancelled', 'disputed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.quote_status as enum ('pending', 'accepted', 'paid', 'rejected', 'withdrawn');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_status as enum (
    'pending', 'paid', 'held', 'released', 'refunded', 'failed'
  );
exception when duplicate_object then null;
end $$;

-- ── PROFILES ──
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  is_admin boolean not null default false,
  builder_status text not null default 'none',
  bio text,
  skills text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── BUILDER APPLICATIONS ──
create table if not exists public.builder_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  bio text,
  skills text,
  portfolio_url text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (user_id)
);

-- ── REQUESTS ──
create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text not null,
  category text,
  budget text,
  status text not null default 'open',
  assigned_builder_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists requests_status_idx on public.requests (status);
create index if not exists requests_user_idx on public.requests (user_id);

-- ── QUOTES ──
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  builder_id uuid not null references public.profiles (id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 100),
  message text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (request_id, builder_id)
);

-- ── MESSAGES ──
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  is_agent boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists messages_request_idx on public.messages (request_id, created_at);

-- ── PAYMENTS (escrow-ready) ──
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  request_id uuid not null references public.requests (id) on delete cascade,
  quote_id uuid not null references public.quotes (id),
  amount_cents integer not null,
  platform_fee_cents integer not null default 0,
  builder_payout_cents integer not null,
  status text not null default 'pending',
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  released_at timestamptz
);

-- ── HELPERS ──
create or replace function public.is_approved_builder()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.builder_status = 'approved'
  );
$$;

create or replace function public.is_orvo_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  );
$$;

create or replace function public.can_access_request(rid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.requests r
    where r.id = rid
      and (
        r.user_id = auth.uid()
        or r.assigned_builder_id = auth.uid()
        or public.is_orvo_admin()
        or exists (
          select 1 from public.quotes q
          where q.request_id = r.id and q.builder_id = auth.uid()
        )
        or (r.status = 'open' and public.is_approved_builder())
      )
  );
$$;

-- ── RLS ──
alter table public.profiles enable row level security;
alter table public.builder_applications enable row level security;
alter table public.requests enable row level security;
alter table public.quotes enable row level security;
alter table public.messages enable row level security;
alter table public.payments enable row level security;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.is_orvo_admin()
    or exists (
      select 1 from public.quotes q
      join public.requests r on r.id = q.request_id
      where (q.builder_id = profiles.id and r.user_id = auth.uid())
         or (q.builder_id = auth.uid() and r.user_id = profiles.id)
         or (r.assigned_builder_id = profiles.id and r.user_id = auth.uid())
    )
  );

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check (id = auth.uid() and coalesce(is_admin, false) = false);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_orvo_admin())
  with check (id = auth.uid() or public.is_orvo_admin());

-- Prevent privilege escalation on profiles
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.is_admin := false;
    if new.builder_status is null or new.builder_status not in ('none', 'pending') then
      new.builder_status := 'none';
    end if;
    return new;
  end if;

  if not public.is_orvo_admin() then
    new.is_admin := old.is_admin;
    -- users may only move themselves into pending (apply as builder)
    if new.builder_status is distinct from old.builder_status then
      if not (
        new.builder_status = 'pending'
        and coalesce(old.builder_status, 'none') in ('none', 'pending', 'rejected')
      ) then
        new.builder_status := old.builder_status;
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_privileges on public.profiles;
create trigger trg_protect_profile_privileges
  before insert or update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- builder_applications
drop policy if exists apps_select on public.builder_applications;
create policy apps_select on public.builder_applications for select to authenticated
  using (user_id = auth.uid() or public.is_orvo_admin());

drop policy if exists apps_insert on public.builder_applications;
create policy apps_insert on public.builder_applications for insert to authenticated
  with check (user_id = auth.uid());

-- Applicants may update their own pending application text; only admin changes status
drop policy if exists apps_update on public.builder_applications;
create policy apps_update on public.builder_applications for update to authenticated
  using (user_id = auth.uid() or public.is_orvo_admin())
  with check (user_id = auth.uid() or public.is_orvo_admin());

create or replace function public.protect_application_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_orvo_admin() then
    new.status := old.status;
    new.reviewed_at := old.reviewed_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_application_status on public.builder_applications;
create trigger trg_protect_application_status
  before update on public.builder_applications
  for each row execute function public.protect_application_status();

-- requests
drop policy if exists requests_select on public.requests;
create policy requests_select on public.requests for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_orvo_admin()
    or (status = 'open' and public.is_approved_builder())
    or assigned_builder_id = auth.uid()
    or exists (select 1 from public.quotes q where q.request_id = requests.id and q.builder_id = auth.uid())
  );

drop policy if exists requests_insert on public.requests;
create policy requests_insert on public.requests for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists requests_update on public.requests;
create policy requests_update on public.requests for update to authenticated
  using (user_id = auth.uid() or public.is_orvo_admin() or assigned_builder_id = auth.uid());

-- quotes
drop policy if exists quotes_select on public.quotes;
create policy quotes_select on public.quotes for select to authenticated
  using (
    builder_id = auth.uid()
    or public.is_orvo_admin()
    or exists (select 1 from public.requests r where r.id = quotes.request_id and r.user_id = auth.uid())
  );

drop policy if exists quotes_insert on public.quotes;
create policy quotes_insert on public.quotes for insert to authenticated
  with check (builder_id = auth.uid() and public.is_approved_builder());

drop policy if exists quotes_update on public.quotes;
create policy quotes_update on public.quotes for update to authenticated
  using (
    builder_id = auth.uid()
    or public.is_orvo_admin()
    or exists (select 1 from public.requests r where r.id = quotes.request_id and r.user_id = auth.uid())
  );

-- messages (chat)
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (public.can_access_request(request_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.can_access_request(request_id));

-- payments
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_orvo_admin()
    or exists (
      select 1 from public.quotes q
      where q.id = payments.quote_id and q.builder_id = auth.uid()
    )
  );

drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments for update to authenticated
  using (user_id = auth.uid() or public.is_orvo_admin());

-- Realtime for chat
alter publication supabase_realtime add table public.messages;

-- Bootstrap: set your admin after first signup
-- update public.profiles set is_admin = true where email = 'danielmen.paran@gmail.com';

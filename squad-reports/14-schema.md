# 14 — Schema Designer

**Role:** Schema Designer  
**Aligned with:** `app.js` field usage + escrow/trust needs (roles 03/13)  
**Also on disk:** `sql/001_mvp_schema.sql` (baseline; missing app columns / trust tables)  

**How to use:** Copy the entire SQL fence below into Supabase → SQL Editor → Run. Prefer on a fresh project, or after backup. Idempotent via `IF NOT EXISTS` / `DROP POLICY IF EXISTS` / exception guards.

---

## Inventory from `app.js`

| Table | Fields written/read |
|-------|---------------------|
| `profiles` | `id`, `full_name`, `email`, `role`, `builder_status`, `is_admin` |
| `requests` | `user_id`, `title`, `description`, `category`, `budget`, `status`, `assigned_builder_id`, `created_at` |
| `quotes` | `request_id`, `builder_id`, `amount_cents`, `message`, `status`, `created_at` |
| `messages` | `request_id`, `sender_id`, `body`, `is_agent`, `created_at` |
| `builder_applications` | `user_id`, `full_name`, `email`, `bio`, `skills`, `portfolio_url`, `linkedin_url`, `experience_years`, `status`, `reviewed_at`, `created_at` |
| `payments` | `user_id`, `request_id`, `quote_id`, `amount_cents`, `platform_fee_cents`, `builder_payout_cents`, `status` |

**Statuses in app today:** requests `open` \| `in_progress` \| `funded` \| `completed` (chat also treats funded phase); quotes `pending` \| `accepted` \| `paid`; payments `pending` \| `paid`; apps `pending` \| `approved` \| `rejected`.

**Recommended additions in SQL below:** `held`/`released` payments, `delivered`/`disputed` requests, `deliveries`, `reviews`, `disputes`, `chat_moderation_events`, `analytics_events`, `platform_settings`, signup trigger, hardened privilege triggers.

---

## Copy-paste SQL (full MVP)

```sql
-- =============================================================================
-- ORVO recommended MVP schema — tables, enums, helpers, RLS, realtime
-- Paste into Supabase SQL Editor. Safe-ish to re-run.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- ENUMS (reference vocabulary; columns stay text + CHECK for app.js compat)
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.builder_status as enum ('none', 'pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.request_status as enum (
    'open', 'in_progress', 'funded', 'delivered', 'completed',
    'disputed', 'cancelled', 'refunded'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.quote_status as enum (
    'pending', 'accepted', 'rejected', 'withdrawn', 'paid', 'superseded'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum (
    'pending', 'paid', 'held', 'released', 'refunded', 'failed', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.dispute_status as enum (
    'open', 'under_review', 'resolved_client', 'resolved_builder',
    'resolved_split', 'withdrawn'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.dispute_reason as enum (
    'not_delivered', 'not_as_described', 'unresponsive',
    'scope_change', 'payment_issue', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.moderation_reason as enum (
    'email', 'phone', 'off_platform_link', 'payment_link',
    'social', 'shortener', 'competitor', 'obfuscation', 'other'
  );
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- CORE TABLES (app.js compatible)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text,
  role text not null default 'client'
    check (role in ('client', 'builder', 'admin')),
  builder_status text default null
    check (builder_status is null
      or builder_status in ('none', 'pending', 'approved', 'rejected')),
  is_admin boolean not null default false,
  trust_hold boolean not null default false,
  avatar_url text,
  bio text,
  skills text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_builder_status_idx on public.profiles (builder_status);
create index if not exists profiles_is_admin_idx on public.profiles (is_admin) where is_admin;

create table if not exists public.builder_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  bio text not null check (char_length(bio) >= 50),
  skills text not null,
  portfolio_url text,
  linkedin_url text,
  experience_years integer not null default 0 check (experience_years >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Align live DBs that ran older 001 without these columns
alter table public.builder_applications add column if not exists full_name text;
alter table public.builder_applications add column if not exists email text;
alter table public.builder_applications add column if not exists linkedin_url text;
alter table public.builder_applications add column if not exists experience_years integer default 0;
alter table public.builder_applications add column if not exists reviewer_note text;
alter table public.builder_applications add column if not exists updated_at timestamptz default now();
alter table public.profiles add column if not exists role text default 'client';
alter table public.profiles add column if not exists trust_hold boolean default false;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists updated_at timestamptz default now();

create index if not exists builder_applications_status_idx
  on public.builder_applications (status);

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text not null,
  category text,
  budget text,
  status text not null default 'open'
    check (status in (
      'open', 'in_progress', 'funded', 'delivered', 'completed',
      'disputed', 'cancelled', 'refunded'
    )),
  assigned_builder_id uuid references public.profiles (id),
  accepted_quote_id uuid,
  delivered_at timestamptz,
  completed_at timestamptz,
  auto_release_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.requests add column if not exists accepted_quote_id uuid;
alter table public.requests add column if not exists delivered_at timestamptz;
alter table public.requests add column if not exists completed_at timestamptz;
alter table public.requests add column if not exists auto_release_at timestamptz;
alter table public.requests add column if not exists updated_at timestamptz default now();

create index if not exists requests_user_id_idx on public.requests (user_id);
create index if not exists requests_status_idx on public.requests (status);
create index if not exists requests_assigned_builder_idx on public.requests (assigned_builder_id);
create index if not exists requests_open_created_idx
  on public.requests (created_at desc) where status = 'open';

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  builder_id uuid not null references public.profiles (id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 100),
  currency text not null default 'usd',
  message text not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'withdrawn', 'paid', 'superseded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, builder_id)
);

alter table public.quotes add column if not exists currency text default 'usd';
alter table public.quotes add column if not exists updated_at timestamptz default now();

create index if not exists quotes_builder_id_idx on public.quotes (builder_id);
create index if not exists quotes_request_id_idx on public.quotes (request_id);

do $$ begin
  alter table public.requests
    add constraint requests_accepted_quote_id_fkey
    foreign key (accepted_quote_id) references public.quotes (id);
exception when duplicate_object then null; end $$;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) > 0 and char_length(body) <= 5000),
  is_agent boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists messages_request_id_created_idx
  on public.messages (request_id, created_at);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  request_id uuid not null references public.requests (id) on delete restrict,
  quote_id uuid not null references public.quotes (id) on delete restrict,
  builder_id uuid references public.profiles (id),
  amount_cents integer not null check (amount_cents >= 100),
  platform_fee_cents integer not null default 0 check (platform_fee_cents >= 0),
  builder_payout_cents integer not null check (builder_payout_cents >= 0),
  currency text not null default 'usd',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'held', 'released', 'refunded', 'failed', 'cancelled')),
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  stripe_transfer_id text,
  held_at timestamptz,
  paid_at timestamptz,
  released_at timestamptz,
  refunded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_fee_math check (platform_fee_cents + builder_payout_cents = amount_cents)
);

alter table public.payments add column if not exists builder_id uuid references public.profiles (id);
alter table public.payments add column if not exists currency text default 'usd';
alter table public.payments add column if not exists stripe_transfer_id text;
alter table public.payments add column if not exists held_at timestamptz;
alter table public.payments add column if not exists refunded_at timestamptz;
alter table public.payments add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.payments add column if not exists updated_at timestamptz default now();

create unique index if not exists payments_quote_id_uidx on public.payments (quote_id);
create unique index if not exists payments_stripe_pi_uidx
  on public.payments (stripe_payment_intent_id) where stripe_payment_intent_id is not null;
create index if not exists payments_request_id_idx on public.payments (request_id);
create index if not exists payments_user_id_idx on public.payments (user_id);
create index if not exists payments_builder_id_idx on public.payments (builder_id);
create index if not exists payments_status_idx on public.payments (status);

-- -----------------------------------------------------------------------------
-- TRUST / ESCROW PRODUCT TABLES
-- -----------------------------------------------------------------------------
create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  builder_id uuid not null references public.profiles (id),
  summary text not null,
  demo_url text,
  artifact_urls text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists deliveries_request_id_idx on public.deliveries (request_id);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  client_id uuid not null references public.profiles (id),
  builder_id uuid not null references public.profiles (id),
  rating integer not null check (rating between 1 and 5),
  body text check (body is null or char_length(body) between 20 and 1000),
  tags text[] not null default '{}',
  builder_reply text,
  builder_replied_at timestamptz,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (request_id, client_id)
);

create index if not exists reviews_builder_id_idx on public.reviews (builder_id);

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete restrict,
  payment_id uuid not null references public.payments (id) on delete restrict,
  opened_by uuid not null references public.profiles (id),
  against_user_id uuid not null references public.profiles (id),
  reason text not null
    check (reason in (
      'not_delivered', 'not_as_described', 'unresponsive',
      'scope_change', 'payment_issue', 'other'
    )),
  details text not null check (char_length(details) >= 20),
  status text not null default 'open'
    check (status in (
      'open', 'under_review', 'resolved_client', 'resolved_builder',
      'resolved_split', 'withdrawn'
    )),
  admin_note text,
  split_client_cents integer,
  split_builder_cents integer,
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists disputes_one_active_per_request
  on public.disputes (request_id)
  where status in ('open', 'under_review');

create index if not exists disputes_status_idx on public.disputes (status);

create table if not exists public.dispute_evidence (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id),
  file_path text not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_moderation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  request_id uuid references public.requests (id) on delete set null,
  reason text not null,
  snippet_hash text,
  created_at timestamptz not null default now()
);

create index if not exists chat_moderation_user_created_idx
  on public.chat_moderation_events (user_id, created_at desc);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_name_created_idx
  on public.analytics_events (event_name, created_at desc);

create table if not exists public.platform_settings (
  id int primary key default 1 check (id = 1),
  fee_percent numeric(5,2) not null default 10.00
    check (fee_percent >= 0 and fee_percent <= 30),
  auto_release_hours integer not null default 72 check (auto_release_hours >= 24),
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id, fee_percent, auto_release_hours)
values (1, 10.00, 72)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- HELPERS
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
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

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_orvo_admin();
$$;

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

grant execute on function public.is_orvo_admin() to authenticated, anon;
grant execute on function public.is_admin() to authenticated, anon;
grant execute on function public.is_approved_builder() to authenticated, anon;
grant execute on function public.can_access_request(uuid) to authenticated;

-- Signup → profile
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role, builder_status, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, 'user'), '@', 1), 'User'),
    new.email,
    'client',
    null,
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Privilege / status protection
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.is_admin := false;
    if new.builder_status is not null
       and new.builder_status not in ('none', 'pending') then
      new.builder_status := null;
    end if;
    return new;
  end if;

  if not public.is_orvo_admin() then
    new.is_admin := old.is_admin;
    new.trust_hold := old.trust_hold;
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
    new.reviewer_note := old.reviewer_note;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_protect_application_status on public.builder_applications;
create trigger trg_protect_application_status
  before update on public.builder_applications
  for each row execute function public.protect_application_status();

-- Clients may insert pending payments only; cannot self-mark held/released
create or replace function public.protect_payment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_orvo_admin() and new.status not in ('pending') then
      new.status := 'pending';
    end if;
    if new.builder_id is null then
      select q.builder_id into new.builder_id from public.quotes q where q.id = new.quote_id;
    end if;
    return new;
  end if;

  if not public.is_orvo_admin() then
    -- Allow no client-driven status transitions in production path
    new.status := old.status;
    new.stripe_payment_intent_id := old.stripe_payment_intent_id;
    new.stripe_checkout_session_id := old.stripe_checkout_session_id;
    new.stripe_transfer_id := old.stripe_transfer_id;
    new.held_at := old.held_at;
    new.paid_at := old.paid_at;
    new.released_at := old.released_at;
    new.refunded_at := old.refunded_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_protect_payment_status on public.payments;
create trigger trg_protect_payment_status
  before insert or update on public.payments
  for each row execute function public.protect_payment_status();

-- Admin RPCs for approve/reject (preferred over dual client updates)
create or replace function public.approve_builder(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_orvo_admin() then
    raise exception 'admin only';
  end if;
  update public.builder_applications
    set status = 'approved', reviewed_at = now()
    where user_id = target;
  update public.profiles
    set builder_status = 'approved'
    where id = target;
end;
$$;

create or replace function public.reject_builder(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_orvo_admin() then
    raise exception 'admin only';
  end if;
  update public.builder_applications
    set status = 'rejected', reviewed_at = now()
    where user_id = target;
  update public.profiles
    set builder_status = 'rejected'
    where id = target;
end;
$$;

grant execute on function public.approve_builder(uuid) to authenticated;
grant execute on function public.reject_builder(uuid) to authenticated;

-- Chat off-platform policy (server-side; admins bypass)
create or replace function public.message_block_reason(p_body text, p_request_status text)
returns text
language plpgsql
stable
as $$
declare
  t text := lower(regexp_replace(coalesce(p_body, ''), E'[\\u200B-\\u200D\\uFEFF]', '', 'g'));
  paid boolean := coalesce(p_request_status, 'open') in ('funded', 'delivered', 'completed');
begin
  if t ~* '[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}' then
    return 'email';
  end if;
  if t ~* '(whats?\s*app|wa\.me|t\.me/|telegram|paypal|venmo|cash\.app|zelle|discord\.gg|calendly|upwork|fiverr)' then
    return 'off_platform_link';
  end if;
  if t ~* '(mailto:|linkedin\.com/in/|instagram\.com|facebook\.com|fb\.com)' then
    return 'social';
  end if;
  if length(regexp_replace(t, '[^0-9]', '', 'g')) between 9 and 15
     and t ~* '(call|sms|whats|טלפ|וואטס)' then
    return 'phone';
  end if;
  if not paid then
    if t ~* 'https?://'
       and t !~* '(github\.com|gitlab\.com|vercel\.app|netlify\.app|pages\.dev|replit|n8n\.io|make\.com|zapier\.com|lovable|v0\.dev|bolt\.new|supabase\.co|huggingface\.co|figma\.com|loom\.com)' then
      return 'off_platform_link';
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.enforce_message_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  st text;
  reason text;
begin
  if public.is_orvo_admin() then
    return new;
  end if;
  select r.status into st from public.requests r where r.id = new.request_id;
  reason := public.message_block_reason(new.body, coalesce(st, 'open'));
  if reason is not null then
    insert into public.chat_moderation_events (user_id, request_id, reason, snippet_hash)
    values (auth.uid(), new.request_id, reason, md5(left(new.body, 200)));
    raise exception 'Message blocked by ORVO policy (%)', reason using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_enforce_policy on public.messages;
create trigger messages_enforce_policy
  before insert or update of body on public.messages
  for each row execute function public.enforce_message_policy();

drop trigger if exists requests_set_updated_at on public.requests;
create trigger requests_set_updated_at
  before update on public.requests
  for each row execute function public.set_updated_at();

drop trigger if exists quotes_set_updated_at on public.quotes;
create trigger quotes_set_updated_at
  before update on public.quotes
  for each row execute function public.set_updated_at();

drop trigger if exists disputes_set_updated_at on public.disputes;
create trigger disputes_set_updated_at
  before update on public.disputes
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.builder_applications enable row level security;
alter table public.requests enable row level security;
alter table public.quotes enable row level security;
alter table public.messages enable row level security;
alter table public.payments enable row level security;
alter table public.deliveries enable row level security;
alter table public.reviews enable row level security;
alter table public.disputes enable row level security;
alter table public.dispute_evidence enable row level security;
alter table public.chat_moderation_events enable row level security;
alter table public.analytics_events enable row level security;
alter table public.platform_settings enable row level security;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.is_orvo_admin()
    or builder_status = 'approved'
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
  with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_orvo_admin())
  with check (id = auth.uid() or public.is_orvo_admin());

-- builder_applications
drop policy if exists apps_select on public.builder_applications;
create policy apps_select on public.builder_applications for select to authenticated
  using (user_id = auth.uid() or public.is_orvo_admin());

drop policy if exists apps_insert on public.builder_applications;
create policy apps_insert on public.builder_applications for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

drop policy if exists apps_update on public.builder_applications;
create policy apps_update on public.builder_applications for update to authenticated
  using (user_id = auth.uid() or public.is_orvo_admin())
  with check (user_id = auth.uid() or public.is_orvo_admin());

-- requests
drop policy if exists requests_select on public.requests;
create policy requests_select on public.requests for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_orvo_admin()
    or (status = 'open' and public.is_approved_builder())
    or assigned_builder_id = auth.uid()
    or exists (
      select 1 from public.quotes q
      where q.request_id = requests.id and q.builder_id = auth.uid()
    )
  );

drop policy if exists requests_insert on public.requests;
create policy requests_insert on public.requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'open');

drop policy if exists requests_update on public.requests;
create policy requests_update on public.requests for update to authenticated
  using (
    user_id = auth.uid()
    or assigned_builder_id = auth.uid()
    or public.is_orvo_admin()
  );

-- quotes
drop policy if exists quotes_select on public.quotes;
create policy quotes_select on public.quotes for select to authenticated
  using (
    builder_id = auth.uid()
    or public.is_orvo_admin()
    or exists (
      select 1 from public.requests r
      where r.id = quotes.request_id and r.user_id = auth.uid()
    )
  );

drop policy if exists quotes_insert on public.quotes;
create policy quotes_insert on public.quotes for insert to authenticated
  with check (
    builder_id = auth.uid()
    and public.is_approved_builder()
    and status = 'pending'
    and exists (
      select 1 from public.requests r
      where r.id = request_id and r.status = 'open'
    )
  );

drop policy if exists quotes_update on public.quotes;
create policy quotes_update on public.quotes for update to authenticated
  using (
    builder_id = auth.uid()
    or public.is_orvo_admin()
    or exists (
      select 1 from public.requests r
      where r.id = quotes.request_id and r.user_id = auth.uid()
    )
  );

-- messages
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
    or builder_id = auth.uid()
    or public.is_orvo_admin()
    or exists (
      select 1 from public.quotes q
      where q.id = payments.quote_id and q.builder_id = auth.uid()
    )
  );

drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and exists (
      select 1 from public.requests r
      where r.id = request_id and r.user_id = auth.uid()
    )
  );

drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments for update to authenticated
  using (public.is_orvo_admin())
  with check (public.is_orvo_admin());

-- deliveries
drop policy if exists deliveries_select on public.deliveries;
create policy deliveries_select on public.deliveries for select to authenticated
  using (public.can_access_request(request_id));

drop policy if exists deliveries_insert on public.deliveries;
create policy deliveries_insert on public.deliveries for insert to authenticated
  with check (
    builder_id = auth.uid()
    and exists (
      select 1 from public.requests r
      where r.id = request_id
        and r.assigned_builder_id = auth.uid()
        and r.status in ('funded', 'in_progress', 'delivered')
    )
  );

-- reviews
drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews for select to authenticated
  using (
    is_hidden = false
    or client_id = auth.uid()
    or builder_id = auth.uid()
    or public.is_orvo_admin()
  );

drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews for insert to authenticated
  with check (
    client_id = auth.uid()
    and exists (
      select 1 from public.requests r
      where r.id = request_id
        and r.user_id = auth.uid()
        and r.assigned_builder_id = builder_id
        and r.status = 'completed'
    )
  );

drop policy if exists reviews_update on public.reviews;
create policy reviews_update on public.reviews for update to authenticated
  using (builder_id = auth.uid() or public.is_orvo_admin());

-- disputes
drop policy if exists disputes_select on public.disputes;
create policy disputes_select on public.disputes for select to authenticated
  using (
    opened_by = auth.uid()
    or against_user_id = auth.uid()
    or public.is_orvo_admin()
    or public.can_access_request(request_id)
  );

drop policy if exists disputes_insert on public.disputes;
create policy disputes_insert on public.disputes for insert to authenticated
  with check (
    opened_by = auth.uid()
    and status = 'open'
    and public.can_access_request(request_id)
  );

drop policy if exists disputes_update on public.disputes;
create policy disputes_update on public.disputes for update to authenticated
  using (public.is_orvo_admin() or opened_by = auth.uid());

drop policy if exists dispute_evidence_select on public.dispute_evidence;
create policy dispute_evidence_select on public.dispute_evidence for select to authenticated
  using (
    exists (
      select 1 from public.disputes d
      where d.id = dispute_id
        and (d.opened_by = auth.uid() or d.against_user_id = auth.uid() or public.is_orvo_admin())
    )
  );

drop policy if exists dispute_evidence_insert on public.dispute_evidence;
create policy dispute_evidence_insert on public.dispute_evidence for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.disputes d
      where d.id = dispute_id
        and d.status in ('open', 'under_review')
        and (d.opened_by = auth.uid() or d.against_user_id = auth.uid() or public.is_orvo_admin())
    )
  );

-- moderation / analytics / settings
drop policy if exists chat_mod_select on public.chat_moderation_events;
create policy chat_mod_select on public.chat_moderation_events for select to authenticated
  using (user_id = auth.uid() or public.is_orvo_admin());

drop policy if exists chat_mod_insert on public.chat_moderation_events;
create policy chat_mod_insert on public.chat_moderation_events for insert to authenticated
  with check (user_id = auth.uid() or public.is_orvo_admin());

drop policy if exists analytics_insert on public.analytics_events;
create policy analytics_insert on public.analytics_events for insert to authenticated
  with check (user_id is null or user_id = auth.uid());

drop policy if exists analytics_select_admin on public.analytics_events;
create policy analytics_select_admin on public.analytics_events for select to authenticated
  using (public.is_orvo_admin());

drop policy if exists settings_select on public.platform_settings;
create policy settings_select on public.platform_settings for select to authenticated
  using (true);

drop policy if exists settings_update_admin on public.platform_settings;
create policy settings_update_admin on public.platform_settings for update to authenticated
  using (public.is_orvo_admin());

-- -----------------------------------------------------------------------------
-- REALTIME
-- -----------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when others then
  if sqlerrm not like '%already member%' then raise; end if;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.builder_applications;
exception when others then
  if sqlerrm not like '%already member%' then raise; end if;
end $$;

-- Bootstrap admin after first signup:
-- update public.profiles set is_admin = true where email = 'danielmen.paran@gmail.com';
```

---

## App compatibility notes

| Concern | Action |
|---------|--------|
| App writes payment `paid` | Trigger forces non-admin inserts to `pending`. Update `acceptQuote` to stop writing `paid`/`funded` from the browser; use webhook/admin → `held` then `released`. |
| App inserts `role` | Column included. |
| App upserts application name/email/linkedin/years | Columns included (+ `ALTER … ADD COLUMN IF NOT EXISTS` for DBs that ran old `001`). |
| `builder_status: null` | Allowed (CHECK permits null). |
| Legacy `001` | This script extends it; privilege triggers supersede loose update policies. |
| Manual demo mode | Use service role or admin session to set `payments.status = 'held'` after fake checkout. |

---

## Post-apply checklist

1. Run SQL → confirm six core tables + trust tables exist.  
2. `update profiles set is_admin = true where email = '…'`.  
3. Smoke: signup → profile row; apply → admin approve via `approve_builder(uid)` or UI; quote → pay insert `pending`.  
4. Sync `ORVO_FEE_PERCENT` with `platform_settings.fee_percent`.  
5. Mirror this file into `sql/002_recommended_mvp.sql` when implementers promote it from the report.

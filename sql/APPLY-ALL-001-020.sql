-- ORVO: apply ALL migrations 001→020 in ONE paste
-- Supabase Dashboard → SQL Editor → paste entire file → Run
-- Project: lbfysqtnarhkoqcnaivg
-- After signup run the is_admin block at the bottom


-- ═══════════════════════════════════════════════════════════════
-- FILE: 001_mvp_schema.sql
-- ═══════════════════════════════════════════════════════════════
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


-- ═══════════════════════════════════════════════════════════════
-- FILE: 002_payments_lockdown.sql
-- ═══════════════════════════════════════════════════════════════
-- 002_payments_lockdown.sql
-- ORVO: clients cannot self-mark paid / held / released.
-- Aligns with app.js Accept & pay → awaiting_payment + payments.status = 'pending'.
--
-- Who writes what:
--   authenticated client  → INSERT only with status = 'pending' (accept quote sheet)
--   service_role / webhook → UPDATE to held / released / refunded / disputed (+ Stripe IDs)
--   is_orvo_admin()         → may update status (ops / manual hold in test)
--
-- Run AFTER 001_mvp_schema.sql in Supabase SQL Editor.
-- See docs/payments/STRIPE-CONNECT-MVP.md

-- ── Harden insert: pending only ──
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
  );

-- ── No client updates on payments (release/hold only via service role) ──
-- Admins keep update for ops; service_role bypasses RLS entirely.
drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments
  for update to authenticated
  using (public.is_orvo_admin())
  with check (public.is_orvo_admin());

-- ── Trigger: force pending on client insert; freeze money fields on client update ──
-- service_role (webhook / Edge Functions) may set held / funded path fields.
-- is_orvo_admin() may update for manual test holds.

create or replace function public.protect_payment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Webhook / Edge Function using service role JWT
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Clients (and non-admin) may only create pending rows — matches awaiting_payment flow
    if not public.is_orvo_admin() then
      if new.status is distinct from 'pending' then
        new.status := 'pending';
      end if;
      -- Never trust client-supplied Stripe IDs on insert
      new.stripe_payment_intent_id := null;
      new.stripe_checkout_session_id := null;
      new.paid_at := null;
      new.released_at := null;
    end if;
    return new;
  end if;

  -- UPDATE: non-admin authenticated cannot change status or Stripe / money timestamps
  if not public.is_orvo_admin() then
    new.status := old.status;
    new.amount_cents := old.amount_cents;
    new.platform_fee_cents := old.platform_fee_cents;
    new.builder_payout_cents := old.builder_payout_cents;
    new.stripe_payment_intent_id := old.stripe_payment_intent_id;
    new.stripe_checkout_session_id := old.stripe_checkout_session_id;
    new.paid_at := old.paid_at;
    new.released_at := old.released_at;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_payment_status on public.payments;
create trigger trg_protect_payment_status
  before insert or update on public.payments
  for each row execute function public.protect_payment_status();

-- Optional comment for operators
comment on function public.protect_payment_status() is
  'Clients insert pending only; held/released/paid written by service_role webhook or admin. Aligns with awaiting_payment in app.js.';


-- ═══════════════════════════════════════════════════════════════
-- FILE: 003_chat_and_trust.sql
-- ═══════════════════════════════════════════════════════════════
-- =============================================================================
-- ORVO 003 — Chat policy (server-side) + thin trust tables
-- =============================================================================
-- Run AFTER:
--   1. sql/001_mvp_schema.sql
--   2. sql/002_payments_lockdown.sql
-- In Supabase → SQL Editor → paste → Run.
--
-- What this adds:
--   • BEFORE INSERT (and body UPDATE) trigger on messages that rejects
--     emails, phone numbers, and WhatsApp / wa.me links.
--   • Admins bypass via profiles.is_admin (public.is_orvo_admin()).
--   • MVP-thin deliveries / reviews / disputes (+ optional moderation log).
-- =============================================================================

-- ── Optional moderation audit (kept tiny) ───────────────────────────────────
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

-- ── Thin trust tables (from 13-trust / 14-schema, MVP only) ──────────────────
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
  builder_reply text,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (request_id, client_id)
);

create index if not exists reviews_builder_id_idx on public.reviews (builder_id);

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete restrict,
  payment_id uuid references public.payments (id) on delete restrict,
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
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists disputes_one_active_per_request
  on public.disputes (request_id)
  where status in ('open', 'under_review');

create index if not exists disputes_status_idx on public.disputes (status);

-- ── Chat block detector (emails / phones / WhatsApp) ────────────────────────
-- Returns a reason code, or null if the body is allowed.
create or replace function public.message_block_reason(p_body text)
returns text
language plpgsql
immutable
as $$
declare
  t text := lower(
    regexp_replace(
      coalesce(p_body, ''),
      E'[\\u200B-\\u200D\\uFEFF]',
      '',
      'g'
    )
  );
  digits text;
begin
  -- Email
  if t ~* '[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}' then
    return 'email';
  end if;

  -- WhatsApp / wa.me (and common spellings)
  if t ~* '(whats?\s*app|wa\.me|whatsapp\.com|web\.whatsapp)' then
    return 'whatsapp';
  end if;

  -- Phones: IL mobile, US-style, or dense digit runs that look like numbers
  digits := regexp_replace(t, '[^0-9]', '', 'g');
  if t ~* '(?:\+?972|0)[-.\s]?5\d[-.\s]?\d{7}' then
    return 'phone';
  end if;
  if t ~* '(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}' then
    return 'phone';
  end if;
  if length(digits) between 9 and 15
     and t ~* '(call|sms|whats|טלפ|וואטס|phone|מספר)' then
    return 'phone';
  end if;
  -- Bare long digit runs without money context still blocked (MVP strict)
  if length(digits) between 10 and 15
     and t !~* '(usd|\$|€|₪|ils|budget|cents|price|fee)' then
    return 'phone';
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
  reason text;
begin
  -- Admin bypass (profiles.is_admin via is_orvo_admin)
  if public.is_orvo_admin() then
    return new;
  end if;

  reason := public.message_block_reason(new.body);
  if reason is not null then
    begin
      insert into public.chat_moderation_events (user_id, request_id, reason, snippet_hash)
      values (
        coalesce(auth.uid(), new.sender_id),
        new.request_id,
        reason,
        md5(left(coalesce(new.body, ''), 200))
      );
    exception when others then
      -- Never fail the block solely because logging failed
      null;
    end;
    raise exception
      'Message blocked by ORVO policy (%). No emails, phones, or WhatsApp links.',
      reason
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_enforce_policy on public.messages;
create trigger messages_enforce_policy
  before insert or update of body on public.messages
  for each row execute function public.enforce_message_policy();

comment on function public.message_block_reason is
  'ORVO: detect email / phone / WhatsApp in chat bodies';
comment on function public.enforce_message_policy is
  'ORVO: BEFORE INSERT/UPDATE on messages; admins (profiles.is_admin) bypass';

-- ── RLS for new tables ──────────────────────────────────────────────────────
alter table public.chat_moderation_events enable row level security;
alter table public.deliveries enable row level security;
alter table public.reviews enable row level security;
alter table public.disputes enable row level security;

drop policy if exists chat_mod_select on public.chat_moderation_events;
create policy chat_mod_select on public.chat_moderation_events for select to authenticated
  using (user_id = auth.uid() or public.is_orvo_admin());

drop policy if exists chat_mod_insert on public.chat_moderation_events;
create policy chat_mod_insert on public.chat_moderation_events for insert to authenticated
  with check (user_id = auth.uid() or public.is_orvo_admin());

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

-- End of 003. Next UI can wire deliveries / reviews / disputes when ready.


-- ═══════════════════════════════════════════════════════════════
-- FILE: 004_global.sql
-- ═══════════════════════════════════════════════════════════════
-- ORVO global marketplace — optional client location on requests
-- Run after 001 → 002 → 003. Safe to re-run.

alter table public.requests
  add column if not exists location text;

comment on column public.requests.location is
  'Optional free-text country/region for the client (global marketplace).';


-- ═══════════════════════════════════════════════════════════════
-- FILE: 005_invites.sql
-- ═══════════════════════════════════════════════════════════════
-- ORVO 005 — Concierge invites (admin invites builders to a request)
-- Run after 001→004.

create table if not exists public.request_invites (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  builder_id uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid not null references public.profiles (id),
  note text,
  created_at timestamptz not null default now(),
  unique (request_id, builder_id)
);

create index if not exists request_invites_builder_idx on public.request_invites (builder_id);
create index if not exists request_invites_request_idx on public.request_invites (request_id);

alter table public.request_invites enable row level security;

drop policy if exists invites_select on public.request_invites;
create policy invites_select on public.request_invites for select to authenticated
  using (
    builder_id = auth.uid()
    or invited_by = auth.uid()
    or public.is_orvo_admin()
    or exists (
      select 1 from public.requests r
      where r.id = request_invites.request_id and r.user_id = auth.uid()
    )
  );

drop policy if exists invites_insert on public.request_invites;
create policy invites_insert on public.request_invites for insert to authenticated
  with check (public.is_orvo_admin() and invited_by = auth.uid());

drop policy if exists invites_delete on public.request_invites;
create policy invites_delete on public.request_invites for delete to authenticated
  using (public.is_orvo_admin());

-- Approved builders can read open requests they were invited to even if we later demote open browse
comment on table public.request_invites is 'ORVO concierge: admin invites 1–3 builders per request';


-- ═══════════════════════════════════════════════════════════════
-- FILE: 006_connect.sql
-- ═══════════════════════════════════════════════════════════════
-- ORVO Stripe Connect fields (optional — run after 001→005)
-- Stores Connect Express account id on profiles for payouts.

alter table public.profiles
  add column if not exists stripe_connect_account_id text;

alter table public.profiles
  add column if not exists stripe_connect_onboarded_at timestamptz;

comment on column public.profiles.stripe_connect_account_id is
  'Stripe Connect Express acct_… — set by create-connect-account Edge Function only';


-- ═══════════════════════════════════════════════════════════════
-- FILE: 007_status_guards.sql
-- ═══════════════════════════════════════════════════════════════
-- ORVO status / money integrity guards (run after 001→006)
-- Fixes: document awaiting_payment; one payment per request; quote min $50.

-- Allowed request statuses used by app.js (text column — not the unused enum)
do $$ begin
  alter table public.requests
    drop constraint if exists requests_status_check;
  alter table public.requests
    add constraint requests_status_check
    check (status in (
      'open',
      'in_progress',
      'awaiting_payment',
      'funded',
      'delivered',
      'completed',
      'cancelled',
      'disputed'
    ));
exception when others then
  raise notice 'requests_status_check skipped: %', SQLERRM;
end $$;

-- One escrow row per request (retry checkout reuses it)
create unique index if not exists payments_request_id_uidx
  on public.payments (request_id);

-- Align DB min with app.js doQuote ($50)
do $$ begin
  alter table public.quotes drop constraint if exists quotes_amount_cents_check;
  alter table public.quotes
    add constraint quotes_amount_cents_check check (amount_cents >= 5000);
exception when others then
  raise notice 'quotes_amount_cents_check skipped: %', SQLERRM;
end $$;

comment on table public.requests is
  'Statuses: open → awaiting_payment → funded → delivered → completed (also disputed/cancelled).';


-- ═══════════════════════════════════════════════════════════════
-- FILE: 008_quote_eta.sql
-- ═══════════════════════════════════════════════════════════════
-- Quote delivery ETA as structured field (app.js prefers this over message prefix)

alter table public.quotes
  add column if not exists delivery_days integer;

do $$ begin
  alter table public.quotes
    drop constraint if exists quotes_delivery_days_check;
  alter table public.quotes
    add constraint quotes_delivery_days_check
    check (delivery_days is null or (delivery_days >= 1 and delivery_days <= 180));
exception when others then
  raise notice 'quotes_delivery_days_check skipped: %', SQLERRM;
end $$;

comment on column public.quotes.delivery_days is 'Builder ETA in days (1–180); set by doQuote';


-- ═══════════════════════════════════════════════════════════════
-- FILE: 009_loop_hygiene.sql
-- ═══════════════════════════════════════════════════════════════
-- Loop hygiene: quote status vocabulary + indexes for withdraw / cancel flows

do $$ begin
  alter table public.quotes drop constraint if exists quotes_status_check;
  alter table public.quotes
    add constraint quotes_status_check
    check (status in ('pending', 'accepted', 'paid', 'rejected', 'withdrawn'));
exception when others then
  raise notice 'quotes_status_check skipped: %', SQLERRM;
end $$;

create index if not exists quotes_builder_status_idx
  on public.quotes (builder_id, status);

create index if not exists requests_user_status_idx
  on public.requests (user_id, status);

comment on column public.quotes.status is
  'pending | accepted | paid | rejected | withdrawn (builder self-withdraw)';


-- ═══════════════════════════════════════════════════════════════
-- FILE: 010_payment_stripe_fields.sql
-- ═══════════════════════════════════════════════════════════════
-- Payment Stripe field alignment (docs/payments/STRIPE-CONNECT-MVP.md)
-- Safe to re-run. Webhook / Edge set these — clients never write held/released.

alter table public.payments
  add column if not exists currency text not null default 'usd';

alter table public.payments
  add column if not exists fee_percent numeric;

alter table public.payments
  add column if not exists builder_id uuid references public.profiles (id);

alter table public.payments
  add column if not exists held_at timestamptz;

alter table public.payments
  add column if not exists refunded_at timestamptz;

alter table public.payments
  add column if not exists stripe_charge_id text;

alter table public.payments
  add column if not exists stripe_transfer_id text;

alter table public.payments
  add column if not exists stripe_transfer_group text;

alter table public.payments
  add column if not exists connected_account_id text;

create index if not exists payments_status_idx on public.payments (status);
create index if not exists payments_builder_id_idx on public.payments (builder_id);

comment on column public.payments.held_at is 'Set by stripe-webhook when status → held';
comment on column public.payments.connected_account_id is 'Snapshot of builder Connect acct_… at checkout';


-- ═══════════════════════════════════════════════════════════════
-- FILE: 011_message_limits.sql
-- ═══════════════════════════════════════════════════════════════
-- Message body length guard (client also enforces 2000 chars)

do $$ begin
  alter table public.messages drop constraint if exists messages_body_len_check;
  alter table public.messages
    add constraint messages_body_len_check
    check (char_length(body) >= 1 and char_length(body) <= 2000);
exception when others then
  raise notice 'messages_body_len_check skipped: %', SQLERRM;
end $$;

comment on column public.messages.body is '1–2000 chars; off-platform filter in 003 trigger';


-- ═══════════════════════════════════════════════════════════════
-- FILE: 012_notifications.sql
-- ═══════════════════════════════════════════════════════════════
-- Thin in-app notification log (optional UI later; Realtime toasts already live)

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link_path text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = auth.uid() or public.is_orvo_admin());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Inserts: service_role / admin only (no client insert policy)

comment on table public.notifications is
  'Optional notification inbox; Edge/triggers write rows. Client reads own.';


-- ═══════════════════════════════════════════════════════════════
-- FILE: 013_request_search.sql
-- ═══════════════════════════════════════════════════════════════
-- Optional search helper for browse jobs (client also uses ilike on title/description)

create extension if not exists pg_trgm;

alter table public.requests
  add column if not exists search_tsv tsvector;

create or replace function public.requests_search_tsv_update()
returns trigger
language plpgsql
as $$
begin
  new.search_tsv :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.category, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.description, '')), 'C');
  return new;
end;
$$;

drop trigger if exists trg_requests_search_tsv on public.requests;
create trigger trg_requests_search_tsv
  before insert or update of title, category, description
  on public.requests
  for each row execute function public.requests_search_tsv_update();

update public.requests set title = title where search_tsv is null;

create index if not exists requests_search_tsv_idx on public.requests using gin (search_tsv);
create index if not exists requests_title_trgm_idx on public.requests using gin (title gin_trgm_ops);

comment on column public.requests.search_tsv is 'Full-text search vector for browse jobs (optional)';


-- ═══════════════════════════════════════════════════════════════
-- FILE: 014_quote_notify.sql
-- ═══════════════════════════════════════════════════════════════
-- When a builder sends a quote, notify the request owner (inbox + Realtime-ready).
-- Requires sql/012_notifications.sql.

create or replace function public.notify_client_on_quote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  req_title text;
begin
  select user_id, coalesce(nullif(trim(title), ''), 'your request')
    into owner_id, req_title
  from public.requests
  where id = new.request_id;

  if owner_id is null then
    return new;
  end if;

  insert into public.notifications (user_id, kind, title, body, link_path)
  values (
    owner_id,
    'quote_received',
    'New quote on “' || left(req_title, 60) || '”',
    'A builder quoted ' || coalesce(new.amount_cents, 0)::text || ' cents'
      || case when new.delivery_days is not null
           then ' · ETA ' || new.delivery_days::text || ' days'
           else '' end,
    '?view=messages&rid=' || new.request_id::text
  );
  return new;
end;
$$;

drop trigger if exists quotes_notify_client on public.quotes;
create trigger quotes_notify_client
  after insert on public.quotes
  for each row
  execute function public.notify_client_on_quote();

comment on function public.notify_client_on_quote() is
  'Inserts a notifications row for the request owner when a quote is created.';

-- When admin invites a builder, notify that builder.

create or replace function public.notify_builder_on_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  req_title text;
begin
  select coalesce(nullif(trim(title), ''), 'a job')
    into req_title
  from public.requests
  where id = new.request_id;

  insert into public.notifications (user_id, kind, title, body, link_path)
  values (
    new.builder_id,
    'invite_received',
    'Invited to “' || left(coalesce(req_title, 'a job'), 60) || '”',
    'ORVO invited you to quote on this brief.',
    '?view=invites'
  );
  return new;
end;
$$;

drop trigger if exists invites_notify_builder on public.request_invites;
create trigger invites_notify_builder
  after insert on public.request_invites
  for each row
  execute function public.notify_builder_on_invite();

comment on function public.notify_builder_on_invite() is
  'Inserts a notifications row for the builder when concierge invites them.';


-- ═══════════════════════════════════════════════════════════════
-- FILE: 015_status_notify.sql
-- ═══════════════════════════════════════════════════════════════
-- Notify parties when request status moves (needs sql/012_notifications.sql).

create or replace function public.notify_on_request_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t text;
  b text;
  link text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  link := '?rid=' || new.id::text;
  t := coalesce(nullif(trim(new.title), ''), 'your request');

  -- Client always gets status moves that matter
  if new.status in ('awaiting_payment', 'funded', 'delivered', 'completed', 'disputed', 'cancelled') then
    b := 'Status is now ' || new.status;
    insert into public.notifications (user_id, kind, title, body, link_path)
    values (
      new.user_id,
      'request_' || new.status,
      left(t, 60),
      b,
      link
    );
  end if;

  -- Assigned builder gets funded / delivered / completed / disputed
  if new.assigned_builder_id is not null
     and new.status in ('funded', 'delivered', 'completed', 'disputed', 'awaiting_payment') then
    insert into public.notifications (user_id, kind, title, body, link_path)
    values (
      new.assigned_builder_id,
      'request_' || new.status,
      left(t, 60),
      'Job status: ' || new.status,
      link
    );
  end if;

  return new;
end;
$$;

drop trigger if exists requests_status_notify on public.requests;
create trigger requests_status_notify
  after update of status on public.requests
  for each row
  execute function public.notify_on_request_status();

comment on function public.notify_on_request_status() is
  'Inbox rows for client (+ assigned builder) when request.status changes.';


-- ═══════════════════════════════════════════════════════════════
-- FILE: 016_message_notify.sql
-- ═══════════════════════════════════════════════════════════════
-- Notify chat counterparty when a new message is sent (needs sql/012_notifications.sql).

create or replace function public.notify_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  client_id uuid;
  builder_id uuid;
  req_title text;
  link text;
  snippet text;
begin
  if new.sender_id is null then
    return new;
  end if;

  select user_id, assigned_builder_id, coalesce(nullif(trim(title), ''), 'Chat')
    into client_id, builder_id, req_title
  from public.requests
  where id = new.request_id;

  if client_id is null then
    return new;
  end if;

  link := '?rid=' || new.request_id::text;
  snippet := left(regexp_replace(coalesce(new.body, ''), '\s+', ' ', 'g'), 120);

  -- Client (when someone else sent)
  if new.sender_id <> client_id then
    insert into public.notifications (user_id, kind, title, body, link_path)
    values (
      client_id,
      'message_received',
      'New message on “' || left(req_title, 50) || '”',
      snippet,
      link
    );
  end if;

  -- Assigned builder
  if builder_id is not null and new.sender_id <> builder_id then
    insert into public.notifications (user_id, kind, title, body, link_path)
    values (
      builder_id,
      'message_received',
      'New message on “' || left(req_title, 50) || '”',
      snippet,
      link
    );
  end if;

  -- Pre-assign: notify quoting builders (except sender)
  if builder_id is null then
    insert into public.notifications (user_id, kind, title, body, link_path)
    select distinct
      q.builder_id,
      'message_received',
      'New message on “' || left(req_title, 50) || '”',
      snippet,
      link
    from public.quotes q
    where q.request_id = new.request_id
      and q.builder_id <> new.sender_id
      and q.status in ('pending', 'accepted');
  end if;

  return new;
end;
$$;

drop trigger if exists messages_notify_party on public.messages;
create trigger messages_notify_party
  after insert on public.messages
  for each row
  execute function public.notify_on_message();

comment on function public.notify_on_message() is
  'Inbox row for chat counterparty when a message is inserted.';


-- ═══════════════════════════════════════════════════════════════
-- FILE: 017_stripe_webhook_events.sql
-- ═══════════════════════════════════════════════════════════════
-- Stripe webhook idempotency (docs/payments/STRIPE-CONNECT-MVP.md).
-- service_role / Edge only — no client read/write policies.

create table if not exists public.stripe_webhook_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

create index if not exists stripe_webhook_events_processed_idx
  on public.stripe_webhook_events (processed_at desc);

alter table public.stripe_webhook_events enable row level security;

comment on table public.stripe_webhook_events is
  'Dedupe Stripe evt_… ids; inserts via stripe-webhook Edge (service_role) only.';


-- ═══════════════════════════════════════════════════════════════
-- FILE: 018_builder_application_notify.sql
-- ═══════════════════════════════════════════════════════════════
-- Notify builder when application is approved or rejected (needs sql/012_notifications.sql).

create or replace function public.notify_builder_application_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if new.status = 'approved' then
    insert into public.notifications (user_id, kind, title, body, link_path)
    values (
      new.user_id,
      'builder_approved',
      'You are approved on ORVO',
      'Browse open jobs and send quotes to clients worldwide.',
      '?view=jobs'
    );
  elsif new.status = 'rejected' then
    insert into public.notifications (user_id, kind, title, body, link_path)
    values (
      new.user_id,
      'builder_rejected',
      'Application update',
      'Your builder application was not approved. Contact ORVO support if you have questions.',
      '?view=status'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists builder_apps_status_notify on public.builder_applications;
create trigger builder_apps_status_notify
  after update of status on public.builder_applications
  for each row
  execute function public.notify_builder_application_status();

comment on function public.notify_builder_application_status() is
  'Inbox row when builder application status → approved or rejected.';


-- ═══════════════════════════════════════════════════════════════
-- FILE: 019_notifications_unread_idx.sql
-- ═══════════════════════════════════════════════════════════════
-- Faster unread badge / inbox queries (needs sql/012_notifications.sql).

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

comment on index public.notifications_user_unread_idx is
  'Partial index for nav/sidebar unread counts.';


-- ═══════════════════════════════════════════════════════════════
-- FILE: 020_payment_checkout_open.sql
-- ═══════════════════════════════════════════════════════════════
-- Document Stripe Checkout intermediate payment status (no RLS change).
-- Edge create-checkout-session may set status = checkout_open before webhook → held.

comment on column public.payments.status is
  'Flow: pending (client accept) → checkout_open (session created) → held (webhook) → released. service_role only for held/released.';

-- ═══════════════════════════════════════════════════════════════
-- FOUNDER: set admin (run AFTER you sign up once on the site)
-- ═══════════════════════════════════════════════════════════════
update public.profiles set is_admin = true where email = 'danielmen.paran@gmail.com';

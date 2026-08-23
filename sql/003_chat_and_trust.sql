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

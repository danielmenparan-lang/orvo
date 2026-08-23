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

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

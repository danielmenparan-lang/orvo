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

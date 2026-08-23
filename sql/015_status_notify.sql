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

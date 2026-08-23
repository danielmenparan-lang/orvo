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

-- Faster unread badge / inbox queries (needs sql/012_notifications.sql).

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

comment on index public.notifications_user_unread_idx is
  'Partial index for nav/sidebar unread counts.';

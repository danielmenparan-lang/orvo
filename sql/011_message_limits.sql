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

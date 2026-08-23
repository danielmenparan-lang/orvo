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

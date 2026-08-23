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

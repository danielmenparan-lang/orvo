-- ORVO status / money integrity guards (run after 001→006)
-- Fixes: document awaiting_payment; one payment per request; quote min $50.

-- Allowed request statuses used by app.js (text column — not the unused enum)
do $$ begin
  alter table public.requests
    drop constraint if exists requests_status_check;
  alter table public.requests
    add constraint requests_status_check
    check (status in (
      'open',
      'in_progress',
      'awaiting_payment',
      'funded',
      'delivered',
      'completed',
      'cancelled',
      'disputed'
    ));
exception when others then
  raise notice 'requests_status_check skipped: %', SQLERRM;
end $$;

-- One escrow row per request (retry checkout reuses it)
create unique index if not exists payments_request_id_uidx
  on public.payments (request_id);

-- Align DB min with app.js doQuote ($50)
do $$ begin
  alter table public.quotes drop constraint if exists quotes_amount_cents_check;
  alter table public.quotes
    add constraint quotes_amount_cents_check check (amount_cents >= 5000);
exception when others then
  raise notice 'quotes_amount_cents_check skipped: %', SQLERRM;
end $$;

comment on table public.requests is
  'Statuses: open → awaiting_payment → funded → delivered → completed (also disputed/cancelled).';

-- Payment Stripe field alignment (docs/payments/STRIPE-CONNECT-MVP.md)
-- Safe to re-run. Webhook / Edge set these — clients never write held/released.

alter table public.payments
  add column if not exists currency text not null default 'usd';

alter table public.payments
  add column if not exists fee_percent numeric;

alter table public.payments
  add column if not exists builder_id uuid references public.profiles (id);

alter table public.payments
  add column if not exists held_at timestamptz;

alter table public.payments
  add column if not exists refunded_at timestamptz;

alter table public.payments
  add column if not exists stripe_charge_id text;

alter table public.payments
  add column if not exists stripe_transfer_id text;

alter table public.payments
  add column if not exists stripe_transfer_group text;

alter table public.payments
  add column if not exists connected_account_id text;

create index if not exists payments_status_idx on public.payments (status);
create index if not exists payments_builder_id_idx on public.payments (builder_id);

comment on column public.payments.held_at is 'Set by stripe-webhook when status → held';
comment on column public.payments.connected_account_id is 'Snapshot of builder Connect acct_… at checkout';

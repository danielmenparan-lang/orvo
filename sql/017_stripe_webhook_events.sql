-- Stripe webhook idempotency (docs/payments/STRIPE-CONNECT-MVP.md).
-- service_role / Edge only — no client read/write policies.

create table if not exists public.stripe_webhook_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

create index if not exists stripe_webhook_events_processed_idx
  on public.stripe_webhook_events (processed_at desc);

alter table public.stripe_webhook_events enable row level security;

comment on table public.stripe_webhook_events is
  'Dedupe Stripe evt_… ids; inserts via stripe-webhook Edge (service_role) only.';

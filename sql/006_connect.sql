-- ORVO Stripe Connect fields (optional — run after 001→005)
-- Stores Connect Express account id on profiles for payouts.

alter table public.profiles
  add column if not exists stripe_connect_account_id text;

alter table public.profiles
  add column if not exists stripe_connect_onboarded_at timestamptz;

comment on column public.profiles.stripe_connect_account_id is
  'Stripe Connect Express acct_… — set by create-connect-account Edge Function only';

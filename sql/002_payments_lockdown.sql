-- 002_payments_lockdown.sql
-- ORVO: clients cannot self-mark paid / held / released.
-- Aligns with app.js Accept & pay → awaiting_payment + payments.status = 'pending'.
--
-- Who writes what:
--   authenticated client  → INSERT only with status = 'pending' (accept quote sheet)
--   service_role / webhook → UPDATE to held / released / refunded / disputed (+ Stripe IDs)
--   is_orvo_admin()         → may update status (ops / manual hold in test)
--
-- Run AFTER 001_mvp_schema.sql in Supabase SQL Editor.
-- See docs/payments/STRIPE-CONNECT-MVP.md

-- ── Harden insert: pending only ──
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
  );

-- ── No client updates on payments (release/hold only via service role) ──
-- Admins keep update for ops; service_role bypasses RLS entirely.
drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments
  for update to authenticated
  using (public.is_orvo_admin())
  with check (public.is_orvo_admin());

-- ── Trigger: force pending on client insert; freeze money fields on client update ──
-- service_role (webhook / Edge Functions) may set held / funded path fields.
-- is_orvo_admin() may update for manual test holds.

create or replace function public.protect_payment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Webhook / Edge Function using service role JWT
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Clients (and non-admin) may only create pending rows — matches awaiting_payment flow
    if not public.is_orvo_admin() then
      if new.status is distinct from 'pending' then
        new.status := 'pending';
      end if;
      -- Never trust client-supplied Stripe IDs on insert
      new.stripe_payment_intent_id := null;
      new.stripe_checkout_session_id := null;
      new.paid_at := null;
      new.released_at := null;
    end if;
    return new;
  end if;

  -- UPDATE: non-admin authenticated cannot change status or Stripe / money timestamps
  if not public.is_orvo_admin() then
    new.status := old.status;
    new.amount_cents := old.amount_cents;
    new.platform_fee_cents := old.platform_fee_cents;
    new.builder_payout_cents := old.builder_payout_cents;
    new.stripe_payment_intent_id := old.stripe_payment_intent_id;
    new.stripe_checkout_session_id := old.stripe_checkout_session_id;
    new.paid_at := old.paid_at;
    new.released_at := old.released_at;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_payment_status on public.payments;
create trigger trg_protect_payment_status
  before insert or update on public.payments
  for each row execute function public.protect_payment_status();

-- Optional comment for operators
comment on function public.protect_payment_status() is
  'Clients insert pending only; held/released/paid written by service_role webhook or admin. Aligns with awaiting_payment in app.js.';

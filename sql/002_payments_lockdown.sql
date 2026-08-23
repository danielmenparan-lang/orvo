-- ORVO 002 — Payment status lockdown
-- Run AFTER sql/001_mvp_schema.sql
-- Goal: browser clients can INSERT pending payments and SELECT their rows,
-- but cannot mark paid/held/released themselves. Webhooks / service_role do that.

create or replace function public.protect_payment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Clients may only create pending rows
    if not public.is_orvo_admin() then
      new.status := 'pending';
      new.paid_at := null;
      new.released_at := null;
      new.stripe_payment_intent_id := null;
      new.stripe_checkout_session_id := coalesce(new.stripe_checkout_session_id, null);
    end if;
    return new;
  end if;

  -- UPDATE
  if public.is_orvo_admin() then
    return new;
  end if;

  -- Non-admins: freeze money fields; allow nothing that looks like settlement
  if new.status is distinct from old.status
     or new.amount_cents is distinct from old.amount_cents
     or new.platform_fee_cents is distinct from old.platform_fee_cents
     or new.builder_payout_cents is distinct from old.builder_payout_cents
     or new.paid_at is distinct from old.paid_at
     or new.released_at is distinct from old.released_at
     or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
     or new.stripe_checkout_session_id is distinct from old.stripe_checkout_session_id
  then
    raise exception 'payment settlement requires service role / admin';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_payment_status on public.payments;
create trigger trg_protect_payment_status
  before insert or update on public.payments
  for each row execute function public.protect_payment_status();

-- Tighten RLS: authenticated updates on payments only for admin
-- (service_role bypasses RLS for webhooks)
drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments for update to authenticated
  using (public.is_orvo_admin())
  with check (public.is_orvo_admin());

drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

comment on function public.protect_payment_status is
  'ORVO: only admin/service_role may settle payments; clients insert pending only';

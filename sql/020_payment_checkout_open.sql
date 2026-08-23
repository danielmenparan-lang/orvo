-- Document Stripe Checkout intermediate payment status (no RLS change).
-- Edge create-checkout-session may set status = checkout_open before webhook → held.

comment on column public.payments.status is
  'Flow: pending (client accept) → checkout_open (session created) → held (webhook) → released. service_role only for held/released.';

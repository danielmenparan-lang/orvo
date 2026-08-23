# Stripe Connect MVP — ORVO

**Status:** Scaffold / contract (Checkout not live yet)  
**Product money flow:** Accept quote → Checkout → **held** on platform → Deliver → Client **release** → Transfer to builder Connect account

## Chosen path (locked)

| Decision | Choice |
|----------|--------|
| Connect type | **Express** |
| Charge model | **Separate charges & transfers** (NOT destination charges) |
| Checkout | **Checkout Sessions** with dynamic `amount_cents` + metadata |
| Who writes `held`/`funded` | **Webhook only** (`checkout.session.completed`) |
| Who writes `released` | Admin/service after client release (Transfer API) |
| Fee | Founding **0%** → later **10–12%** of quote |

Do **not** use Payment Links for job checkout (can't bind quote metadata reliably).

## Env vars (Edge / server)

```
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_URL=
ORVO_APP_URL=https://fantastic-eclair-0b2c66.netlify.app
```

Never put `STRIPE_SECRET_KEY` or service role in `supabase-config.js`.

## Tables / fields

`payments` already has: `amount_cents`, `platform_fee_cents`, `builder_payout_cents`, `status`, `stripe_payment_intent_id`, `stripe_checkout_session_id`, `paid_at`, `released_at`.

Recommended statuses: `pending` → `held` (money captured) → `released` | `refunded`.

Request statuses: `awaiting_payment` → `funded` → `delivered` → `completed`.

Builders need `profiles.stripe_account_id` (add in a later migration when onboarding Connect).

## Edge Function outlines

### `create-checkout-session`
1. Auth user = request owner  
2. Load accepted quote + fee  
3. Create Checkout Session in **platform** mode, `payment_intent_data.transfer_group = request_id`  
4. Store `stripe_checkout_session_id` on payments (pending)  
5. Return `{ url }`

### `stripe-webhook`
1. Verify signature  
2. On `checkout.session.completed`: set payment `held`, `paid_at=now()`, request `funded`  
3. Ignore client claims

### `release-payment`
1. Auth = client owner or admin  
2. Payment must be `held`, request `delivered` or client-confirmed  
3. Create Transfer to builder Connect account for `builder_payout_cents`  
4. Set payment `released`, request `completed`

## Client UX (current)

Until functions are deployed: Accept quote → `awaiting_payment` + payment `pending`. **Never** mark `funded`/`paid` in the browser.

## IL note

Platform entity should be Stripe-supported (often US LLC). IL builders via Connect Express where enabled — confirm in Stripe Dashboard before promising payouts.

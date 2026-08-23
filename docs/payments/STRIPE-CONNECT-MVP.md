# Stripe Connect MVP — ORVO

Exact path from `squad-reports/03-payments.md`. **Decision lock:** Connect Express + separate charges & transfers + Checkout Sessions. Webhook is the **sole writer** of `held` / `funded`. Kill Payment Links and destination charges for job pay.

Founding display fee stays **0%** in the browser until GTM; server env will own the real fee when Checkout ships.

---

## Money flow (happy path)

```
Client Accept & pay sheet
  → quote accepted, siblings rejected
  → request.status = awaiting_payment
  → payments insert status = pending   (client anon/authenticated only)
  → Edge Function create-checkout-session
  → Stripe Checkout (hosted)
  → webhook checkout.session.completed / payment_intent.succeeded
  → payments.status = held (+ stripe_* ids, held_at)
  → requests.status = funded
  → quotes.status = paid
  → Builder delivers → client Release
  → Edge Function release-payment → Transfer (source_transaction)
  → payments.status = released; requests.status = completed
```

**Today (pre-Checkout):** sheet accepts quote → `awaiting_payment` + `payments.pending` only. No card charge. No `funded`.

---

## Env vars

### Browser (`supabase-config.js`)

| Var | MVP value | Notes |
|-----|-----------|--------|
| `ORVO_FEE_PERCENT` | `0` | Founding display; sheet shows **0%** |
| `STRIPE_PAYMENT_LINK` | `''` (ignore) | Dead end — do not reopen as product path |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | project | Existing |

### Supabase Edge / secrets (Dashboard → Edge Functions secrets)

| Var | Purpose |
|-----|---------|
| `STRIPE_SECRET_KEY` | Platform secret (`sk_test_…` / `sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` for signature verify |
| `ORVO_FEE_PERCENT` | Authoritative fee (e.g. `12` when monetizing) — **not** client-overridable |
| `SITE_URL` | e.g. `https://….netlify.app` for success/cancel URLs |
| `SUPABASE_SERVICE_ROLE_KEY` | Webhook + checkout writers (bypass client RLS) |
| `SUPABASE_URL` | Same project URL |

Optional later: `STRIPE_PUBLISHABLE_KEY` if you add Elements (Checkout Session MVP does not need it in the browser).

---

## Data fields

### `payments` (extend existing)

Already used by `app.js` confirm accept:

`user_id`, `request_id`, `quote_id`, `amount_cents`, `platform_fee_cents`, `builder_payout_cents`, `status` (`pending` from client).

Add for Stripe MVP:

| Field | Type | Set by |
|-------|------|--------|
| `currency` | text default `usd` | checkout fn |
| `fee_percent` | numeric | checkout fn (snapshot) |
| `stripe_checkout_session_id` | text | checkout fn |
| `stripe_payment_intent_id` | text | webhook |
| `stripe_charge_id` | text | webhook (for `source_transaction`) |
| `stripe_transfer_id` | text | release fn |
| `stripe_transfer_group` | text | `orvo_pay_<payment_uuid>` |
| `held_at` / `released_at` / `refunded_at` | timestamptz | webhook / release |
| `builder_id` | uuid | insert/trigger from quote |
| `connected_account_id` | text | snapshot `acct_…` |

**Status machine (Stripe-backed):**  
`pending` → `checkout_open` → `held` → `released`  
sides: `failed` | `canceled` | `refunded` | `disputed`

Legacy `paid` must not be set from the browser.

### `requests.status`

`open` → **`awaiting_payment`** (accept sheet) → **`funded`** (webhook only) → `delivered` → `completed`

### `profiles` (builders)

`stripe_account_id`, `stripe_onboarding_complete`, `stripe_charges_enabled`, `stripe_payouts_enabled`, `stripe_details_submitted`, `payout_country`

### Idempotency

Table `stripe_webhook_events` (`id` = Stripe `evt_…`, `type`, `processed_at`).

---

## Edge Function outlines (pseudo)

### 1. `stripe-connect-onboard`

```
auth required (builder)
create Express Account if profiles.stripe_account_id null
  type: express, capabilities: transfers
create Account Link (refresh/return → SITE_URL/?connect=…)
return { url }
```

Webhook `account.updated` → sync `stripe_*` flags on `profiles`.

### 2. `create-checkout-session`

```
auth required; caller must own request for quote_id
load quote (accepted) + request (awaiting_payment) + builder stripe_account_id
fee = round(amount * ORVO_FEE_PERCENT / 100)   // server env
upsert/update payments:
  status = checkout_open
  platform_fee_cents, builder_payout_cents, fee_percent
  stripe_transfer_group = orvo_pay_<id>
session = stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: [{ price_data: { currency: 'usd', unit_amount: amount_cents, product_data: { name } } }],
  payment_intent_data: {
    transfer_group,
    metadata: { payment_id, quote_id, request_id, builder_id }
  },
  // NO transfer_data — separate charges & transfers
  success_url: SITE_URL + '/?paid={CHECKOUT_SESSION_ID}',
  cancel_url: SITE_URL + '/?pay_canceled=1',
  metadata: { payment_id, quote_id, request_id }
})
store stripe_checkout_session_id
return { url: session.url }
```

### 3. `stripe-webhook` (sole writer of held / funded)

```
verify signature with STRIPE_WEBHOOK_SECRET
if evt.id already in stripe_webhook_events → 200
on checkout.session.completed | payment_intent.succeeded:
  service_role update payments:
    status = held
    stripe_payment_intent_id, stripe_charge_id, held_at
  service_role update requests.status = funded
  service_role update quotes.status = paid
insert stripe_webhook_events
on account.updated → sync builder flags
on charge.dispute.created → flag payment disputed + notify admin
```

### 4. `release-payment`

```
auth: request owner (or admin)
assert payments.status = held, not disputed
stripe.transfers.create({
  amount: builder_payout_cents,
  currency: 'usd',
  destination: connected_account_id,
  source_transaction: stripe_charge_id,
  transfer_group
})
service_role: payments.status = released, released_at, stripe_transfer_id
service_role: requests.status = completed
```

---

## Client contract (`app.js`)

| Step | Behavior |
|------|----------|
| `acceptQuote` | Opens Accept & pay sheet (not `window.confirm`) |
| Sheet | Amount, fee % (founding **0%**), builder net, honest checkout-coming copy |
| Confirm | quote `accepted`, siblings `rejected`, request `awaiting_payment`, payment `pending` |
| Checkout live | Call `create-checkout-session` → redirect `session.url` |
| Funded | Only after webhook — never from browser |

RLS: see `sql/002_payments_lockdown.sql` — clients insert `pending` only; service role / webhook updates `held` / `released`.

---

## Why not alternatives

| Kill | Reason |
|------|--------|
| Payment Links | Static; cannot bind quote / Connect / dynamic cents |
| Destination charges | Money leaves platform immediately — breaks hold-until-release |
| Authorize-only | Auth holds expire ~7d; agent builds take longer |

UX: say “funds held by ORVO until you approve,” not legal “escrow,” unless counsel signs off.

---

## Ship checklist

1. Run `001_mvp_schema.sql` then `002_payments_lockdown.sql`
2. Stripe Connect Express enabled; test keys in Edge secrets
3. Deploy four functions above; wire webhook endpoint
4. Flip Accept sheet CTA from “await payment” → “Continue to Stripe” when `create-checkout-session` is live
5. Set server `ORVO_FEE_PERCENT` (keep browser founding `0` until intentional GTM)

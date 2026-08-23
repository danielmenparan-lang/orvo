# ORVO Stripe Edge Functions (scaffold)

Deploy under Supabase Edge Functions when secrets are ready. See `docs/payments/STRIPE-CONNECT-MVP.md`.

Shared helpers: `supabase/functions/_shared/auth.ts` (Bearer + JSON body validation), `stripe-env.ts` (secret/site/fee helpers).

## create-checkout-session

**Input (JSON):** `{ request_id, quote_id }`  
**Auth:** Bearer user JWT (must own the request)  
**Output:** `{ url }` Checkout Session URL  

Pseudo:
1. Verify user owns request; quote is accepted/pending for that request  
2. Create Stripe Checkout Session (platform charge, `transfer_group=request_id`)  
3. Upsert `payments` row pending + `stripe_checkout_session_id`  
4. Return session.url  

### Client wiring (live)

`app.js` `confirmAcceptPay` → `tryCreateCheckoutSession({ requestId, quoteId })`:
- On `{ url }` → redirect to Stripe Checkout
- On `501` / `not_configured` / network → stay on **awaiting payment** (honest; not funded)
- Scaffold validates JSON body (`request_id`, `quote_id`) + Bearer header before secret check

No fake `funded`/`paid` from the browser.

## stripe-webhook

Verify `STRIPE_WEBHOOK_SECRET`. Scaffold rejects requests missing `stripe-signature` header (400) before 501.

On `checkout.session.completed`:
- set payment `status=held`, `paid_at=now()`, store PI id  
- set request `status=funded`  

Only the webhook writes `held`/`funded`.

## release-to-builder

**Input:** `{ request_id }`  
**Auth:** Bearer JWT — request owner or admin (scaffold validates header + body)
**Requires:** payment `held` + builder Connect account  
**Output:** `{ ok: true, transfer_id }`  

Client: `releasePayment` → `tryReleaseToBuilder`. On 501: mark request `completed` and toast that payout settles when Connect is live (no fake `released` for non-admin).

## create-connect-account

**Input:** `{}` (JWT user must be approved builder)  
**Auth:** Bearer JWT required (scaffold validates before 501)
**Output:** `{ url }` Stripe Account Link  

Client: Profile → **Set up payouts** → `tryCreateConnectAccount` (501 → toast until secrets).

Return URLs (when live): `?connect=success`, `?connect=refresh`, `?connect=cancel` — handled in `app.js` `handleConnectReturn`.

Schema: `sql/006_connect.sql` (`stripe_connect_account_id`).

### Checkout return URLs

Configure Checkout Session:
- `success_url`: `{ORVO_APP_URL}/?checkout=success`
- `cancel_url`: `{ORVO_APP_URL}/?checkout=cancel`

`app.js` `handleCheckoutReturn` toasts honestly (webhook still sole writer of `held`).

Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `ORVO_APP_URL`

# ORVO Stripe Edge Functions (scaffold)

Deploy under Supabase Edge Functions when secrets are ready. See `docs/payments/STRIPE-CONNECT-MVP.md`.

## create-checkout-session

**Input (JSON):** `{ request_id, quote_id }`  
**Auth:** Bearer user JWT (must own the request)  
**Output:** `{ url }` Checkout Session URL  

Pseudo:
1. Verify user owns request; quote is accepted/pending for that request  
2. Create Stripe Checkout Session (platform charge, `transfer_group=request_id`)  
3. Upsert `payments` row pending + `stripe_checkout_session_id`  
4. Return session.url  

## stripe-webhook

Verify `STRIPE_WEBHOOK_SECRET`. On `checkout.session.completed`:
- set payment `status=held`, `paid_at=now()`, store PI id  
- set request `status=funded`  

Only the webhook writes `held`/`funded`.

## release-to-builder

**Auth:** client owner after delivery, or admin  
**Requires:** payment `held`  
Creates Transfer to builder Connect account; sets `released`.

Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `ORVO_APP_URL`

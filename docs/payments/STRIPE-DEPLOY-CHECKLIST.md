# Stripe deploy checklist (founder)

When secrets are ready, follow this order. Until then the app stays honest: **awaiting payment**, not funded.

## 1. Supabase SQL

**Recommended:** paste [APPLY-ALL-001-020.sql](https://raw.githubusercontent.com/danielmenparan-lang/orvo/cursor/orvo-local-site-3bd5/sql/APPLY-ALL-001-020.sql) once in SQL Editor.

Or run step-by-step per `sql/README.md` **001 → 020** (includes `017_stripe_webhook_events.sql` for webhook dedupe).

Set admin:

```sql
update public.profiles set is_admin = true where email = 'your@email.com';
```

## 2. Edge secrets (Supabase → Project Settings → Edge Functions)

Or from repo (after copying template):

```bash
cp scripts/edge-secrets.template.sh scripts/edge-secrets.local.sh
# edit scripts/edge-secrets.local.sh with your keys
bash scripts/edge-secrets.local.sh
```

| Secret | Example |
|--------|---------|
| `STRIPE_SECRET_KEY` | `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
| `SUPABASE_SERVICE_ROLE_KEY` | project service role |
| `SUPABASE_URL` | `https://xxx.supabase.co` |
| `SITE_URL` or `ORVO_APP_URL` | `https://fantastic-eclair-0b2c66.netlify.app` |
| `ORVO_FEE_PERCENT` | `0` (founding) or `12` later |

## 3. Deploy functions

Functions are **implemented** (Checkout, webhook, Connect, release). From repo root (Supabase CLI linked):

```bash
bash scripts/deploy-stripe.sh
```

Or deploy individually:

```bash
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy create-connect-account
supabase functions deploy release-to-builder
```

Contract: `docs/payments/EDGE-FUNCTIONS.md` · full flow: `docs/payments/STRIPE-CONNECT-MVP.md`.

## 4. Stripe Dashboard

1. **Connect** — enable Express accounts (platform).
2. **Webhook** — endpoint `https://<project>.supabase.co/functions/v1/stripe-webhook`  
   Events: `checkout.session.completed`, `payment_intent.succeeded`, `account.updated`, `charge.dispute.created`.
3. Copy signing secret → `STRIPE_WEBHOOK_SECRET`.

## 5. Browser config

In `supabase-config.js`:

```js
window.ORVO_CHECKOUT_LIVE = true;  // only after checkout + webhook tested
```

Redeploy Netlify from branch `cursor/orvo-local-site-3bd5`.

## 6. Smoke test (test mode)

0. Profile → **Setup health** → **Re-check** — all schema rows ✓; Edge rows show **deployed** (501 = secrets pending is OK).
1. Client posts → builder quotes → client accepts → **Try checkout** redirects to Stripe.
2. Pay with test card `4242…` → webhook sets payment **held** + request **funded**.
3. Builder marks delivered → client **Release** → Transfer (when release fn implemented).
4. Confirm browser never sets `funded`/`held` without webhook.

## Honesty gates (do not skip)

- No `STRIPE_PAYMENT_LINK` fund path.
- Webhook is sole writer of `held` / `funded`.
- Client release blocked while payment `pending`.
- Flip `ORVO_CHECKOUT_LIVE` only after end-to-end test passes.

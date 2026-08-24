# Stripe smoke test (founder)

Run after SQL + admin + Edge secrets + `bash scripts/deploy-stripe.sh`.

## Preconditions

- [ ] Profile → Setup health → **Re-check**: Schema 10/10, Edge 4/4 deployed
- [ ] Stripe webhook endpoint: `https://<project>.supabase.co/functions/v1/stripe-webhook`
- [ ] Events: `checkout.session.completed`, `payment_intent.succeeded`, `account.updated`, `charge.dispute.created`

## Test accounts

1. **Client** — post a request, accept a quote
2. **Builder** — approved, quotes on the request, completes Connect (Profile → Set up payouts)

## Flow

### 1. Accept → Checkout

1. Client accepts quote → pay sheet → confirm
2. Should redirect to Stripe Checkout (test mode)
3. Card: `4242 4242 4242 4242` · any future expiry · any CVC
4. Return URL: `/?checkout=success&rid=<uuid>`
5. UI shows “Confirming payment with Stripe webhook…”
6. Within ~30s: payment **Held**, request **Funded** (webhook only — not instant)
7. Admin check (optional): open `/?view=all-requests&status=funded` or All requests → Funded chip

### 2. Deliver → Release

1. Builder marks delivered
2. Client **Release payment to builder**
3. Expect Transfer to builder Connect account; payment **Released**, request **Completed**

If release fails with “Builder has not completed Connect onboarding”, builder must finish Profile → payouts first.

## Flip live flag

Only after end-to-end pass:

```js
// supabase-config.js
window.ORVO_CHECKOUT_LIVE = true;
```

Redeploy Netlify. Copy should say “Pay with Stripe Checkout” / “Continue to Stripe Checkout”.

## Honesty checks

- [ ] Browser never sets `funded`/`held` without webhook
- [ ] `pending` accept does not show as funded
- [ ] Release blocked while payment `pending`
- [ ] Dispute freezes release

See also: `docs/payments/STRIPE-DEPLOY-CHECKLIST.md`

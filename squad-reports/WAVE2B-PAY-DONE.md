# Wave 2B — Payments DONE (Agent B)

Date: 2026-08-23

## Shipped

- **P1-4 Accept & pay sheet** — `#pay-modal` in `index.html`; `acceptQuote` opens sheet (no `window.confirm`). Shows amount, founding fee **0%**, builder net, honest checkout-coming / awaiting-payment copy. Confirm → `awaiting_payment` + `payments.pending`.
- **P1-5 Stripe scaffold doc** — `docs/payments/STRIPE-CONNECT-MVP.md` (Connect Express, Checkout Session, webhook sole writer of `held`/`funded`, env vars, Edge Function pseudo, data fields).
- **P0-7 Payments lockdown SQL** — `sql/002_payments_lockdown.sql`: client insert `pending` only; no client status → `paid`/`held`/`released`; service role / webhook / admin update.

## Founding fee

`ORVO_FEE_PERCENT = 0` unchanged; sheet labels **ORVO fee (founding) / 0%**.

## Exit gates

- [x] No `confirm()` on accept path
- [x] Fee breakdown + honest awaiting-payment state
- [x] SQL blocks client paid/held/released
- [x] Stripe MVP path documented from Role 03
- [x] Commit + push `cursor/orvo-local-site-3bd5`

## Blocked (secrets)

Live Checkout needs `STRIPE_SECRET_KEY` + webhook — documented, not deployed.

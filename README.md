# ORVO — AI Agent Marketplace

Post what you need. Vetted builders send quotes. Chat and hire through ORVO — **global**.

## Local

```bash
python3 -m http.server 5173
```

Open http://localhost:5173

Live demo: https://fantastic-eclair-0b2c66.netlify.app/  
Branch / PR: `cursor/orvo-local-site-3bd5`

## Supabase SQL (order)

See `sql/README.md` — run **001 → 014**, then:

```sql
update public.profiles set is_admin = true where email = 'your@email.com';
```

Founder checklist: `founder-checklist.html`

## Stripe (when ready)

1. Set Edge secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, service role)
2. Deploy: `create-checkout-session`, `stripe-webhook`, `create-connect-account`, `release-to-builder`
3. Set `window.ORVO_CHECKOUT_LIVE = true` in `supabase-config.js`

Docs: `docs/WINNING-PRODUCT.md`, `docs/payments/STRIPE-CONNECT-MVP.md`

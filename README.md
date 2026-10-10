# ORVO — AI Agent Marketplace

Post what you need. Vetted builders send quotes. Chat and pay through ORVO.

**New:** [ORVO Agent Launch](#) — fixed-price agents in 7 days + **ORVO Run** subscriptions (path to $10k MRR). See [`docs/path-to-10k-mrr.md`](docs/path-to-10k-mrr.md).

## Local

```bash
python3 -m http.server 5173
```

Open http://localhost:5173

Live: https://fantastic-eclair-0b2c66.netlify.app/

**ORVO24 video:** https://danielmenparan-lang.github.io/orvo/video.html (GitHub Pages)  
**Direct stream:** https://cdn.jsdelivr.net/gh/danielmenparan-lang/orvo@main/assets/orvo24/v3/orvo24-v3-web.mp4

## Monetization setup

1. Create Stripe products + Payment Links (Launch + Run).
2. Paste URLs into `supabase-config.js` → `STRIPE_LINKS`.
3. Redeploy. Buy buttons open Stripe; until then they prompt you to connect.

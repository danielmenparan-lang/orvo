# ORVO — AI Agent Marketplace

Post what you need. Vetted builders send quotes. Chat and pay through escrow on ORVO.

## Revenue model

- **15%** marketplace fee (Builder Pro: **10%**)
- **Builder Pro** — $99/mo
- **Request boost** — $49 / 7 days

See [docs/revenue-model.md](docs/revenue-model.md) for the path to ~$100k/month.

## Setup

1. Run `sql/revenue-engine.sql` in Supabase SQL Editor
2. (Optional) Add Stripe Payment Links in `supabase-config.js`
3. Serve locally:

```bash
python3 -m http.server 5173
```

Open http://localhost:5173

Live: https://fantastic-eclair-0b2c66.netlify.app/

**ORVO24 video:** https://danielmenparan-lang.github.io/orvo/video.html (GitHub Pages)  
**Direct stream:** https://cdn.jsdelivr.net/gh/danielmenparan-lang/orvo@main/assets/orvo24/v3/orvo24-v3-web.mp4

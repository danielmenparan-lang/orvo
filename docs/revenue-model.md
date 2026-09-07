# ORVO — Path to $100,000 / month

ORVO takes a cut of every AI-agent project closed on the platform, plus optional builder subscriptions and client boosts.

## Revenue mix

| Stream | Price | Role |
|--------|-------|------|
| Marketplace fee | **15%** of deal (Pro builders: **10%**) | Primary |
| Builder Pro | **$99 / month** | Priority jobs + lower fee |
| Request boost | **$49 / 7 days** | Featured at top of job board |

## Math (illustrative)

**Fee-only path**

- Need ~$666,700 GMV at 15% take rate
- Example: **222 deals × $3,000 avg** → ~$100k fees

**Hybrid path (more realistic early)**

| Line | Volume | Revenue |
|------|--------|---------|
| Deals | 150 × $2,500 × 15% | $56,250 |
| Builder Pro | 300 × $99 | $29,700 |
| Boosts | 200 × $49 | $9,800 |
| **Total** | | **~$95,750** |

## Product loop that drives GMV

1. Client posts a request (optional boost)
2. Vetted builders quote
3. Client accepts → funds held in escrow
4. Work delivered on-platform
5. Client marks complete → builder payout released; ORVO keeps the fee

Trust (vetting + escrow + chat lock) → higher close rate → more GMV → fee revenue.

## Setup

1. Run `sql/revenue-engine.sql` in Supabase SQL Editor
2. (Optional) Create Stripe Payment Links and paste into `supabase-config.js`:
   - `STRIPE_PAYMENT_LINK` — project escrow
   - `STRIPE_PRO_LINK` — Builder Pro
   - `STRIPE_BOOST_LINK` — request boost
3. Deploy / refresh the site

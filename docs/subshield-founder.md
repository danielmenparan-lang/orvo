# SubShield — founder connect checklist

**Idea (swarm round 2, non-ORVO):** COI (certificate of insurance) compliance for small general contractors.

Never let an expired sub COI stop a job. Upload certs → track expirations → auto-chase subs by email → export compliance pack.

## Pricing → ~$10k MRR

| Plan | Price | Path |
|------|-------|------|
| Solo | $79/mo | ~127 logos |
| Pro | $149/mo | ~67 logos |
| Team | $299/mo | ~34 logos |

Realistic mix: ~45 Pro + ~15 Team ≈ $10k.

## What you connect now

### 1. Stripe
Create products + **Payment Links** (monthly):

| Product | Amount | Config key |
|---------|--------|------------|
| SubShield Solo | $79 | `SUBSHIELD_STRIPE.solo` |
| SubShield Pro | $149 | `SUBSHIELD_STRIPE.pro` |
| SubShield Team | $299 | `SUBSHIELD_STRIPE.team` |

Paste URLs into `subshield/config.js`. Redeploy.

Enable Customer Portal for cancel/upgrade.

### 2. Bank
Stripe → Settings → Bank accounts → your business payout account.  
Do **not** share bank credentials with agents.

### 3. Marketing budget (month 1 ask: **$1,200**)

| Channel | $ | Job |
|---------|---|-----|
| Google Search (`certificate of insurance tracking`, `subcontractor COI compliance`, `construction insurance tracker`) | 700 | Intent |
| Facebook groups / Meta (GC office managers, construction ops) | 350 | Awareness |
| Trade newsletter / sponsorship micro | 150 | Trust |

**Wedge offer:** “Free compliance scan — send your sub list, we’ll tell you how many COIs are expired.”

### 4. Optional Supabase
When ready for multi-tenant cloud: create project, run `subshield/schema.sql`, paste URL + anon key into `config.js`. Until then the app runs in **local demo mode**.

## Kill criteria (day 14)
- <3 paid after ≥80 targeted outbounds → wrong ICP / offer
- Paid users don’t upload ≥1 real COI in week 1 → product not sticky

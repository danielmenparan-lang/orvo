# ORVO → $10k MRR (founder checklist)

Swarm consensus (marketplace strategist, micro-SaaS, GTM, devil’s advocate, productized services):

**Do not wait for open marketplace liquidity.** Sell **ORVO Agent Launch** (fixed SKU) + **ORVO Run** (subscription). Use the marketplace as fulfillment overflow.

## Math (subscription-first)

| Mix | Approx MRR |
|-----|------------|
| ~34 × Run Basic ($299) | ~$10.2k |
| ~15 × Run Pro ($699) | ~$10.5k |
| 20 × Basic + 6 × Pro | ~$10.2k |

Launch one-time fees ($1,490–$6,990) fund ads + builder bounties; **Run** is the MRR engine.

Marketplace take rate is **12%** on custom quotes (`ORVO_FEE_PERCENT`).

---

## What you must connect now (payments)

1. Create a **Stripe** account (business / individual).
2. Dashboard → **Products** — create:

| Product | Type | Amount | Config key |
|---------|------|--------|------------|
| ORVO Agent Launch — Lite | One-time | $1,490 | `STRIPE_LINKS.launch_lite` |
| ORVO Agent Launch — Pro | One-time | $3,490 | `STRIPE_LINKS.launch_pro` |
| ORVO Agent Launch — Plus | One-time | $6,990 | `STRIPE_LINKS.launch_plus` |
| ORVO Run — Basic | Monthly | $299 | `STRIPE_LINKS.run_basic` |
| ORVO Run — Pro | Monthly | $699 | `STRIPE_LINKS.run_pro` |
| ORVO Run — Team | Monthly | $1,499 | `STRIPE_LINKS.run_team` |

3. For each product, create a **Payment Link** (or Checkout link).
4. Paste URLs into `supabase-config.js` → `window.STRIPE_LINKS`.
5. Optional: set `STRIPE_PAYMENT_LINK` for marketplace quote accepts until Connect is ready.
6. Enable **Customer Portal** for Run cancellations/upgrades.
7. Later (after ~5 paid clients): **Stripe Connect** for builder payouts + application fees.

Until links are filled, Buy buttons show a toast asking you to connect Stripe (no fake charges).

---

## Marketing budget ask (month 1 test)

**$1,400** recommended:

| Channel | $ | Job |
|---------|---|-----|
| Google Search (EN: hire AI agent / custom AI agent) | 840 | Intent |
| Meta/X boost ORVO24 + retarget site visitors | 350 | Awareness → Launch |
| Indie Hackers / niche newsletter | 210 | Founder ICP |

**GTM wedge:** micro-SaaS / ops buyers — “one production agent in 7 days,” not “join a marketplace.”

Kill criteria day 7: zero qualified calls after ~40 outbounds → change vertical/offer, not the video.

---

## 14-day ops (you + agents)

1. Paste Stripe links → redeploy Netlify.
2. Pick one vertical for outbound (e.g. Shopify support triage or WhatsApp restaurant desk).
3. 20–40 targeted outreaches/day with Launch Pro as the SKU.
4. Fulfill first 3 launches high-touch; attach Run on delivery call.
5. Only then open marketplace liquidity pushes.

## Bank / payout

- Stripe payouts → your **business bank account** (set in Stripe → Settings → Bank accounts).
- No need to share bank details with agents — Stripe handles that.
- For builder payouts before Connect: PayPal/Wise manually from Launch margin.

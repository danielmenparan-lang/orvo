# ORVO 10-Hour Build Campaign

**Start:** 2026-08-23 ~01:41 UTC  
**Target duration:** ≥10 hours of continuous wave work  
**Branch:** `cursor/orvo-local-site-3bd5`  
**Strategy lock:** `docs/WINNING-PRODUCT.md` (Israel WhatsApp SMB + concierge + hold→release)

## Agent roster (parallel waves)

| ID | Role | Owns |
|----|------|------|
| A | Niche Landing | `index.html` hero, CTAs, Hebrew-ready copy, brand-first |
| B | Payments Path | Stripe scaffold docs + `acceptQuote` checkout contract, fee UI |
| C | Loop Engineer | login routing, chat relationship gate, apply edit loop |
| D | Trust/SQL | migrations beyond `001`, payment write locks, message filter SQL |
| E | Design System | CSS variables, motion, mobile, remove AI-slop look |
| F | Marketplace IA | demote browse, request-detail spine, status UX |
| G | GTM Assets | SEO page stubs, LAUNCH-KIT polish (no auto-post) |
| H | Judge | re-audit after each wave → `squad-reports/JUDGE-WAVE*.md` |
| I | Ops | backlog sync, WAVE*-DONE, PR updates |
| J | Metrics | events stub + admin KPI placeholders |

## Cadence

- Recurring timer every **30 minutes** continues next unfinished P0/P1/P2 items
- Each wave: implement → commit → push → short DONE note
- Stop condition for a wave: meaningful shipped code OR blocked on secrets (Stripe keys) — then document blocker and move to next item

## Honesty

This is continuous agent waves on one Cloud Agent run, not 20 full-time humans. Goal: maximize shipped product quality across ~10 hours.

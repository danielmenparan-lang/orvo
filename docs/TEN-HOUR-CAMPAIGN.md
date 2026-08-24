# ORVO 10-Hour Build Campaign

**Start:** 2026-08-23 ~01:41 UTC  
**Target duration:** ≥10 hours of continuous wave work  
**Branch:** `cursor/orvo-local-site-3bd5`  
**Strategy lock:** `docs/WINNING-PRODUCT.md` — **GLOBAL** clients hire vetted builders for custom AI agents (not Israel-only).

## Agent roster (parallel waves)

| ID | Role | Owns |
|----|------|------|
| A | Niche Landing | `index.html` hero, CTAs, Hebrew-ready copy, brand-first |
| B | Payments Path | ✅ Wave 2B: pay sheet + STRIPE-CONNECT-MVP + `002_payments_lockdown.sql` |
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

## Post-finale (11:42 UTC Aug 23+)

The original ~10h campaign **finished** at 11:42 UTC with the honest marketplace loop shipped. Recurring 30-minute pulses continue on **founder-unblock polish** only — schema-error CTAs, Stripe Edge scaffolding, admin UX, a11y — without reopening strategy locks in `docs/WINNING-PRODUCT.md`.

**Repo code backlog:** all P0/P1/P2 items **DONE** (`squad-reports/20-ops-backlog.md`). Remaining work is **founder execution**: APPLY-ALL SQL, admin flag, Stripe secrets + deploy, smoke test, `ORVO_CHECKOUT_LIVE=true`.

See `squad-reports/CAMPAIGN-FINALE-HE.md`, `JUDGE-WAVE-10h.md`, and `JUDGE-WAVE-POST-FINALE.md` for verdicts.

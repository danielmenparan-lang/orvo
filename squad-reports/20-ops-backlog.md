# 20 — Ops Synthesizer: Overnight Backlog

**Role:** Ops Synthesizer  
**Inputs:** Roles 01–17, 19 + `sql/001_mvp_schema.sql` + `app.js` pay/admin + `index.html`  
**Branch:** `cursor/orvo-local-site-3bd5`  
**Date:** 2026-08-23  

---

## Executive lock (do not reopen)

| Decision | Winner |
|----------|--------|
| Niche | **GLOBAL** hire vetted builders for custom AI agents (EN UI). WhatsApp/Israel = optional acquisition, not product geography. |
| Shape | **Concierge marketplace** — human match until ~20 paid txns |
| Money | **Hold → deliver → release**; Stripe Checkout + Connect Express (Role 03) |
| Honesty | No fake `funded`/`paid` in prod UX; no “via Stripe” until webhook live |
| Fee | **0% founding** → publish path to **10–12%** |
| GTM | Assets in `docs/marketing/LAUNCH-KIT.md` — **founder posts**, agents do not |

---

## Already shipped (do not re-do)

| Item | Where |
|------|--------|
| Team + launch kit | `docs/TEAM.md`, `docs/marketing/LAUNCH-KIT.md` |
| MVP schema + privilege freeze triggers | `sql/001_mvp_schema.sql` (+ RUN-NOW / FINAL-FIX mirrors) |
| No client `is_admin` self-elevate | `app.js` `loadProfile` — warn only; DB flag required |
| Honest hire-flow copy (no “via Stripe”) | `index.html` trust strip / how / builders |
| Post **title** field | `index.html` `#post-title`, `app.js` `doPost` |
| Deliver + release UI (DB status only) | `app.js` `markDelivered`, `releasePayment` |
| Winning product + this backlog + HE brief | `docs/WINNING-PRODUCT.md`, this file, `MORNING-BRIEF-HE.md` |
| Research pack | `squad-reports/01`…`17`, `19` (no 18 — covered by 04/07) |

**Honesty status (code):** Accept → `awaiting_payment` + `payments.pending` only. Client checkout calls Edge Function; without secrets → awaiting UI (not funded). Release requires `held`. Sibling quotes rejected.

**Founder still:** Apply SQL 001→019 on Supabase; set `is_admin`; add Stripe secrets + deploy functions (`STRIPE-DEPLOY-CHECKLIST.md`); flip `ORVO_CHECKOUT_LIVE` when Checkout is live.

**Next code polish:** ~~pay request title~~ · ~~thread unread~~ · ~~mark read on chat~~ · ~~Stripe env helper~~ — remaining: live Stripe implementation.

---

## Ranked backlog

### P0 — trust / money / privilege

| ID | Change | Files | Acceptance criteria |
|----|--------|-------|---------------------|
| **P0-1** | ~~Kill fake pay path~~ | `app.js` | **DONE** — pending only; no browser `funded`/`paid`. |
| **P0-2** | ~~Honest Stripe copy~~ | `index.html` | **DONE** |
| **P0-3** | ~~Stop client `is_admin` elevate~~ | `app.js` | **DONE** |
| **P0-4** | Privilege RLS live in prod | `sql/001` | **Founder:** confirm applied on Supabase. |
| **P0-5** | Apply schema in Supabase | `sql/README.md` | **Founder:** run 001→005; note date in README. |
| **P0-6** | ~~Decline sibling quotes~~ | `app.js` | **DONE** |
| **P0-7** | ~~Payments lockdown SQL~~ | `sql/002` | **DONE** in repo; founder apply. |

### P1 — core loop / integrity

| ID | Change | Files | Acceptance criteria |
|----|--------|-------|---------------------|
| **P1-1** | ~~Gate chat~~ | `app.js` + `canOpenChat` | **DONE** (+ invites). |
| **P1-2** | ~~Login routing~~ | `app.js` | **DONE** |
| **P1-3** | ~~Edit application loop~~ | `app.js` | **DONE** |
| **P1-4** | ~~Accept & pay sheet~~ | `index.html` | **DONE** |
| **P1-5** | Stripe Checkout | Edge + `tryCreateCheckoutSession` | **Scaffold + client wire DONE**; live Checkout blocked on secrets. |
| **P1-6** | ~~Release from held~~ | `app.js` | **DONE** |
| **P1-7** | Landing copy | `index.html` | **DONE** — global hire-builders hero (not Israel-only). |
| **P1-8** | ~~Server chat filter~~ | `sql/003` | **DONE** in repo; founder apply. |
| **P1-9** | ~~Human status labels~~ | `app.js` | **DONE** |
| **P1-10** | ~~Strip SQL / admin debug~~ | `app.js` | **DONE** — `sanitizePublicErr` + admin-only Profile debug. |

### P2 — liquidity / GTM / polish

| ID | Change | Files | Acceptance criteria |
|----|--------|-------|---------------------|
| **P2-1** | ~~Concierge invite~~ | sql/005 + UI | **DONE** |
| **P2-2** | ~~Structured brief~~ | post modal | **DONE** — channel chips (WA default), goal chips, USD budget bands |
| **P2-3** | ~~Quote min + ETA~~ | `doQuote` | **DONE** |
| **P2-4** | ~~Dispute flag~~ | schema + UI | **DONE** — client sheet + admin resolve sheet |
| **P2-5** | ~~Reviews~~ | schema + UI | **DONE** — star review modal (no prompt) |
| **P2-6** | ~~Legal links~~ | footer | **DONE** |
| **P2-7** | ILS + RTL prep | `money()`, docs | **PREP DONE** — `ORVO_DISPLAY_CURRENCY` + `docs/i18n-RTL-PREP.md` (no full RTL flip) |
| **P2-8** | ~~Password reset~~ | auth | **DONE** |
| **P2-9** | ~~chat-policy module~~ | `js/chat-policy.js` | **DONE** |
| **P2-10** | ~~SEO pages~~ | html + docs | **DONE** |
| **P2-11** | ~~Footer year + ToS~~ | `index.html` | **DONE** |
| **P2-12** | ~~Metrics sheet~~ | METRICS.md + `js/events.js` | **DONE** — docs + client track stub |

**Founder checklist:** `docs/FOUNDER-SQL-SMOKE.md` (also linked from admin Profile).

---

## Three overnight waves

Timers from `STATUS.md`: wave1 @30m · wave2 @90m · wave3 @3h. Commit + push `cursor/orvo-local-site-3bd5` after each wave.

### Wave 1 — Integrity freeze (~30–60 min)

**Goal:** Stop lying about money. Product may be thinner; it must be honest.

| Order | Item |
|------:|------|
| 1 | **P0-1** Kill fake pay |
| 2 | **P0-6** Decline sibling quotes |
| 3 | **P0-7** Lock payments RLS (no client `paid`/`held`/`released` writes) |
| 4 | **P1-10** Strip SQL/admin email from user Profile |
| 5 | **P1-9** Human status labels |
| 6 | **P0-4/P0-5** Confirm privilege SQL applied; note in README |

**Exit gate:** Manual path does not set `funded`/`paid` · sibling quotes rejected · non-admin Profile clean · privilege smoke pass · commit + push.

**Non-goals:** hero redesign fonts, full Hebrew RTL, Connect onboarding, disputes.

---

### Wave 2 — Loop hygiene (~90 min–2h)

**Goal:** Post → quote → chat → accept behaves like a marketplace.

| Order | Item |
|------:|------|
| 1 | **P1-2** Login / role routing |
| 2 | **P1-3** Pending edit loop |
| 3 | **P1-1** Gate chat + clean Threads |
| 4 | **P1-4** Accept & pay sheet |
| 5 | **P1-6** Release only from `held` |

**Exit gate:** Builder login → Browse jobs · pending edit works · cold Message gone · pay sheet with fee breakdown · release refuses without `held` · commit + push.

---

### Wave 3 — Niche + money path (~3h)

**Goal:** Shape matches niche; money path scaffolded (not finished Connect).

| Order | Item |
|------:|------|
| 1 | **P1-7** Niche hero / CTA declutter |
| 2 | **P1-5** Checkout Edge stub + webhook contract |
| 3 | **P1-8** Chat filter trigger |
| 4 | **P2-1** Invite table + thin admin invite |
| 5 | **P2-6** / **P2-11** Legal footer |

**Exit gate:** Landing passes niche sharpness test · webhook→`held` contract in repo · release refuses non-`held` · ≥1 server-side message validation · commit + push · update `STATUS.md`.

**Founder wake rule:** Publish from `LAUNCH-KIT.md` only if Wave 1 honesty gates are green. If P0-1 slips → waitlist + builders only — never “pay via Stripe.”

---

## Top 10 (impact ÷ effort)

1. Kill fake pay (**P0-1**)  
2. Decline sibling quotes (**P0-6**)  
3. Payments RLS lock (**P0-7**)  
4. Confirm privilege SQL live (**P0-4/5**)  
5. Fix login routing (**P1-2**)  
6. Gate chat (**P1-1**)  
7. Fix edit-application (**P1-3**)  
8. Niche landing lock (**P1-7**)  
9. Checkout/webhook scaffold (**P1-5**)  
10. Release only from `held` (**P1-6**)  

---

## Dependencies

```
P0-1 ──► P1-4, P1-5, P1-6
P0-7 ──► P1-5, P1-6
P1-1 ──► P1-8
P1-7 ──► safe GTM publish
P1-5 ──► real fee 10–12%, Connect onboard (post-overnight)
P2-1 ──► liquidity concierge (06)
```

---

## Definition of overnight success

1. Copy matches product truth (Stripe claims already honest)  
2. Privilege not client-writable (**and** applied in prod)  
3. Accept → pending money → deliver → release machine honest in UI  
4. Chat not open spam channel  
5. Founder has publish queue + decisions (`MORNING-BRIEF-HE.md`)

**— ORVO Role 20 · Ops Synthesizer**

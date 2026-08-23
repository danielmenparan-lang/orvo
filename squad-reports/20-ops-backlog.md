# 20 — Ops Synthesizer: Overnight Backlog

**Role:** Ops Synthesizer  
**Inputs:** Roles 01–17, 19 + `sql/001_mvp_schema.sql` + `app.js` pay/admin + `index.html`  
**Branch:** `cursor/orvo-local-site-3bd5`  
**Date:** 2026-08-23  

---

## Executive lock (do not reopen)

| Decision | Winner |
|----------|--------|
| Niche | **Israel WhatsApp AI agents for SMBs** (orders / booking / FAQ / leads) |
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

**Still fake:** `acceptQuote` can insert `payments.status = 'paid'` and set request `funded` with empty Stripe (`STRIPE_PAYMENT_LINK = ''`). Release updates `payments` from the browser without requiring `held`.

---

## Ranked backlog

### P0 — trust / money / privilege

| ID | Change | Files | Acceptance criteria |
|----|--------|-------|---------------------|
| **P0-1** | Kill fake pay path | `app.js` `acceptQuote`; `supabase-config.js` | Empty Stripe → **cannot** set `paid`/`funded`. Max: quote `accepted`, request `awaiting_payment` or `in_progress`, payment `pending` **or** blocked toast “Payments coming.” |
| **P0-2** | ~~Honest Stripe copy~~ | `index.html` | **DONE** (hire flow / fund → release). Keep: never re-add “via Stripe” until Checkout+webhook. |
| **P0-3** | ~~Stop client `is_admin` elevate~~ | `app.js` `loadProfile` | **DONE** (no browser write). Remaining: hide admin email from Profile debug for non-admins (**P1-10**). |
| **P0-4** | Privilege RLS live in prod | `sql/001_mvp_schema.sql` (+ migration if needed) | Triggers/RPC already in schema file — **confirm applied** on Supabase. Smoke: second user cannot self-approve / self-admin. |
| **P0-5** | Apply schema in Supabase | `sql/001_mvp_schema.sql`, `sql/README.md` | Prod has tables + RLS; no red SQL bar for core tables. Note “ran on DATE” in README. |
| **P0-6** | Decline sibling quotes on accept | `app.js` `acceptQuote` | On accept: other `pending` quotes → `rejected`. One assigned builder. |
| **P0-7** | Payments not client-writable for terminal states | RLS / Edge | Authenticated clients cannot insert `paid`/`held`/`released`. Webhook/service-role only. |

### P1 — core loop / integrity

| ID | Change | Files | Acceptance criteria |
|----|--------|-------|---------------------|
| **P1-1** | Gate chat to relationship | `app.js` `loadJobs`, `loadThreads`, `sendMsg`; RLS | Message only if quoted **or** assigned (or invited). Threads ≠ all open jobs. |
| **P1-2** | Fix login routing | `app.js` `doLogin`, `routeAfterAuth` | Approved builder → jobs. Pending → status. Client → requests. Signup intent must not override role on **login**. |
| **P1-3** | Fix pending Edit application loop | `app.js` `loadApply`, `loadStatus` | Edit opens prefilled form; save stays `pending`; no bounce status↔apply. |
| **P1-4** | Accept & pay sheet (not `confirm()`) | `app.js` + modal in `index.html` | Amount, fee %, builder net, honest Stripe/manual state. CTA matches P0-1. |
| **P1-5** | Stripe Checkout scaffold | Edge Function + `acceptQuote` | `create-checkout-session` contract in repo; webhook sole writer of `held`/`funded`. Kill `STRIPE_PAYMENT_LINK`. Align `held_at`, `stripe_*` (Role 03). |
| **P1-6** | Release = held → released only | `app.js` `releasePayment` + RPC | Requires payment `held` (or admin). Sets request `completed`. No release from fake `paid`. |
| **P1-7** | Niche landing copy lock | `index.html` hero / CTAs | Hero = WhatsApp agents for Israeli SMBs; ORVO brand-level; one primary CTA + builder text link (04/07). |
| **P1-8** | Server-side chat filter | SQL trigger or Edge Fn | Direct REST insert of phone/email/WA fails. |
| **P1-9** | Human status labels | `app.js` badges | Open / Funded / Delivered / Completed (EN; HE later). |
| **P1-10** | Strip user-facing SQL / admin debug | `app.js` Profile, empty states | Non-admin never sees `sql-*.sql` or config admin email. |

### P2 — liquidity / GTM / polish

| ID | Change | Files | Acceptance criteria |
|----|--------|-------|---------------------|
| **P2-1** | Concierge invite object | schema + admin UI | Admin invites 1–3 builders; builder home = Invited jobs. |
| **P2-2** | Structured brief fields | post modal | WhatsApp-default channel; goal chips; budget ₪3.5k / 6.5k / 12k / custom. |
| **P2-3** | Quote min + ETA | `doQuote` | Min ≥ $50 or ₪ eq; delivery days. |
| **P2-4** | Thin dispute flag | schema + chat | Dispute freezes release; admin resolve notes. |
| **P2-5** | Reviews after complete | schema + prompt | 1–5 stars post-release; one per request. |
| **P2-6** | Legal links | `index.html` footer | Terms, Privacy, fee disclosure stubs. |
| **P2-7** | ILS + RTL prep | `money()`, `index.html` | `he-IL` / ₪ behind flag; RTL shell plan (16). |
| **P2-8** | Password reset UX | auth modal | Supabase reset email. |
| **P2-9** | Extract chat-policy module | `js/chat-policy.js` (19) | Pure helpers; app imports. |
| **P2-10** | SEO pages A1/A2 | per `09-content.md` | HE restaurant WA + EN builders stubs. |
| **P2-11** | Footer year + ToS | `index.html` | © 2026; legal stubs. |
| **P2-12** | Metrics sheet | founder ops | LAUNCH-KIT §0; north stars: quote coverage, pay conversion. |

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

# 20 — Ops Synthesizer: Overnight Backlog

**Role:** Ops Synthesizer  
**Inputs:** Roles 01–14, 16–17, 19 + `docs/TEAM.md`, `docs/marketing/LAUNCH-KIT.md`, `app.js` pay/deliver/release, `sql/001_mvp_schema.sql`  
**Branch:** `cursor/orvo-local-site-3bd5`  
**Date:** 2026-08-23  

---

## Executive lock (do not reopen tonight)

| Decision | Winner |
|----------|--------|
| Niche | **Israel WhatsApp AI agents for SMBs** (orders / booking / FAQ / leads) |
| Shape | **Concierge marketplace** — human match until ~20 paid txns |
| Money | **Hold → deliver → release**; Stripe Checkout + Connect Express (path in 03) |
| Honesty | **No fake `funded` / `paid`** in production UX |
| Fee | **0% founding** → publish path to **10–12%** |
| GTM | Assets ready in `LAUNCH-KIT.md` — **founder posts**, agents do not |

---

## Already shipped (do not re-do)

| Item | Where |
|------|--------|
| Team roster | `docs/TEAM.md` |
| MVP schema + RLS draft | `sql/001_mvp_schema.sql` |
| Hebrew launch kit | `docs/marketing/LAUNCH-KIT.md` |
| Post **title** field | `index.html` `#post-title`, `app.js` `doPost` |
| Deliver + release UI (DB status only) | `app.js` `markDelivered`, `releasePayment`, chat escrow cards |
| Squad research pack | `squad-reports/01`…`14`, `16`, `17`, `19` |

**Still fake:** `acceptQuote` can mark `payments.status = 'paid'` and `requests.status = 'funded'` with no Stripe money (`STRIPE_PAYMENT_LINK = ''`).

---

## Ranked backlog

### P0 — trust / money / privilege (ship or stop marketing)

| ID | Change | Files | Acceptance criteria |
|----|--------|-------|---------------------|
| **P0-1** | Kill fake pay path | `app.js` `acceptQuote`; `supabase-config.js` | Empty Stripe → **cannot** set `paid`/`funded`. Max: quote `accepted`, request `awaiting_payment` or `in_progress`, payment `pending` **or** blocked with “Payments coming.” Manual mark-paid = admin-only or removed. |
| **P0-2** | Honest Stripe / escrow copy | `index.html` trust strip L197–210, builders section L220 | Until Checkout+webhook live: copy = “Pay through ORVO (Stripe coming)” / “Funds held until you approve” — **never** “Secure payments — via Stripe” as fact. |
| **P0-3** | Stop client `is_admin` elevation | `app.js` `loadProfile` ~236–255; `supabase-config.js` | Browser must not `update({ is_admin: true })`. Admin via Dashboard/`app_metadata` or service-role only. Profile debug must not print admin email to non-admins. |
| **P0-4** | Harden privilege RLS | `sql/001_mvp_schema.sql` (+ new migration if needed) | Trigger/RPC: non-admin cannot set `is_admin` or `builder_status ∈ {approved,rejected}`. `payments` insert/update for `held`/`released`/`paid` not writable by anon clients in prod path. Smoke: second user cannot self-approve. |
| **P0-5** | Apply schema in Supabase | `sql/001_mvp_schema.sql`, `sql/README.md` | Prod project has tables + RLS enabled; app boot has no red SQL bar for core tables. Document “ran on DATE” in README. |
| **P0-6** | Decline sibling quotes on accept | `app.js` `acceptQuote` | On accept: other `pending` quotes → `rejected` (or `withdrawn`). Only one assigned builder. |

### P1 — core loop / integrity

| ID | Change | Files | Acceptance criteria |
|----|--------|-------|---------------------|
| **P1-1** | Gate chat to relationship | `app.js` `loadJobs`, `loadThreads`, `sendMsg`; RLS messages | Builder Message only if quoted **or** assigned (or invited). Threads ≠ all open jobs. |
| **P1-2** | Fix login routing | `app.js` `doLogin`, `routeAfterAuth` | Approved builder login → jobs (not empty My requests). Pending → status. Client → requests. Signup intent must not override role on **login**. |
| **P1-3** | Fix pending Edit application loop | `app.js` `loadApply`, `loadStatus` | “Edit application” opens prefilled form; save stays `pending`; no bounce status↔apply. |
| **P1-4** | Accept & pay sheet (not `confirm()`) | `app.js` + modal in `index.html` | Sheet shows amount, fee %, builder net, honest Stripe/manual state. Primary CTA matches P0-1 rules. |
| **P1-5** | Stripe Checkout scaffold | Edge Function stub + `acceptQuote` | `create-checkout-session` contract documented; webhook sole writer of `held`/`funded`. Kill reliance on `STRIPE_PAYMENT_LINK`. Align columns with Role 03 (`held_at`, `stripe_*` ids). |
| **P1-6** | Release = held → released only | `app.js` `releasePayment` | Release requires payment `held` (or admin). Sets request `completed`. No release from client-writable fake `paid` once P0-1 lands. |
| **P1-7** | Niche landing copy lock | `index.html` hero / title / CTAs | Hero reads WhatsApp agents for Israeli SMBs; brand ORVO hero-level; remove duplicate role cards; one primary CTA + builder text link (Role 04/07). |
| **P1-8** | Server-side chat filter | SQL trigger or Edge Fn | Direct REST insert of phone/email/WA fails. Admin bypass optional at DB only with audit. |
| **P1-9** | Human status labels | `app.js` badges | `open`→Open, `funded`→Funded, `delivered`→Delivered, `completed`→Completed (EN tonight; HE later). |
| **P1-10** | Strip user-facing SQL / debug | `app.js` empty states, Profile | Non-admin never sees `sql-*.sql` filenames or config admin email. |

### P2 — liquidity / GTM / polish (after P0–P1)

| ID | Change | Files | Acceptance criteria |
|----|--------|-------|---------------------|
| **P2-1** | Concierge invite object | schema + admin UI | Admin invites 1–3 builders; builder home = Invited jobs (browse demoted). |
| **P2-2** | Structured brief fields | post modal | Channel WhatsApp-default; goal chips; budget bands ₪3.5k / 6.5k / 12k / custom. |
| **P2-3** | Quote min + ETA | `doQuote` | Min ≥ $50 or ₪ equivalent; delivery days field. |
| **P2-4** | Thin dispute flag | schema + chat UI | Client opens dispute → freeze release; admin resolve notes. |
| **P2-5** | Reviews after complete | schema + prompt | 1–5 stars post-release; one per request. |
| **P2-6** | Legal links | `index.html` footer | Terms, Privacy, fee disclosure stubs. |
| **P2-7** | ILS + RTL prep | `money()`, `index.html` | `he-IL` / `₪` path behind flag; RTL shell plan (Role 16) — ship strings pack outline. |
| **P2-8** | Password reset UX | auth modal | Forgot password via Supabase reset email. |
| **P2-9** | Extract chat-policy module | `js/chat-policy.js` (Role 19) | Pure helpers unit-testable; app imports them. |
| **P2-10** | SEO pages A1/A2 | per `09-content.md` | Hebrew restaurant WA page + EN builders page outlines implemented or stubbed. |
| **P2-11** | Footer year + ToS | `index.html` | © 2026; links to legal stubs. |
| **P2-12** | Metrics sheet | founder ops | Columns per LAUNCH-KIT §0; north stars: quote coverage, pay conversion (Role 06). |

---

## Three overnight wave plans

Timers from `STATUS.md`: wave1 @30m · wave2 @90m · wave3 @3h. Implementers commit to `cursor/orvo-local-site-3bd5` after each wave; Judge (01) re-reviews.

### Wave 1 — Integrity freeze (~30–60 min)

**Goal:** Stop lying about money and admin. Product may be thinner; it must be honest.

| Order | Item | Owner hint |
|------:|------|------------|
| 1 | **P0-1** Kill fake pay | Payments / eng |
| 2 | **P0-2** Honest landing copy | UX / landing |
| 3 | **P0-3** Remove client admin elevate | Security |
| 4 | **P0-6** Decline sibling quotes | Eng |
| 5 | **P1-10** Strip SQL/debug from user UI | UX |
| 6 | **P1-9** Human status labels | UX |

**Wave 1 exit gate**

- [ ] Manual confirm path does **not** set `funded`/`paid` for normal clients  
- [ ] Trust strip does not claim live Stripe security  
- [ ] Accepting a quote rejects other pending quotes  
- [ ] Non-admin Profile has no admin-email / SQL dump  
- [ ] Commit + push on branch  

**Explicit non-goals Wave 1:** hero redesign fonts, Hebrew RTL, Connect onboarding, disputes.

---

### Wave 2 — Loop hygiene (~90 min–2h)

**Goal:** Post → quote → chat → accept behaves like a marketplace, not a leaky CRUD demo.

| Order | Item | Owner hint |
|------:|------|------------|
| 1 | **P1-2** Login / role routing | Eng |
| 2 | **P1-3** Pending edit loop | Eng |
| 3 | **P1-1** Gate chat + clean Threads | Trust / eng |
| 4 | **P1-4** Accept & pay sheet | UX |
| 5 | **P0-4** Privilege trigger on profiles | Schema / security |
| 6 | **P0-5** Confirm SQL applied (ops note) | Founder/ops doc |

**Wave 2 exit gate**

- [ ] Builder login lands on Browse jobs  
- [ ] Pending builder can edit application  
- [ ] Cold Message on open jobs gone (or invite-only)  
- [ ] Pay UX is in-app sheet with fee breakdown  
- [ ] Privilege self-update fails under RLS/trigger  
- [ ] Commit + push  

---

### Wave 3 — Niche + money path (~3h)

**Goal:** Product shape matches winning niche; money path is scaffolded for real Stripe (not finished Connect, but no theater).

| Order | Item | Owner hint |
|------:|------|------------|
| 1 | **P1-7** Niche hero / CTA declutter | Landing / UX |
| 2 | **P1-5** Checkout Edge Function stub + webhook contract | Payments |
| 3 | **P1-6** Release only from `held` | Payments / trust |
| 4 | **P1-8** Chat filter trigger (MVP regex port) | Security |
| 5 | **P2-1** Invite table + admin “Invite builders” (thin) | Structure |
| 6 | **P2-6** / **P2-11** Legal footer stubs | Ops |

**Wave 3 exit gate**

- [ ] Landing passes niche sharpness test (WhatsApp / IL SMB without logo still obvious)  
- [ ] Written webhook → `held` contract exists in repo (even if secrets unset)  
- [ ] Release UI refuses when payment not `held`  
- [ ] At least one server-side message validation path  
- [ ] Commit + push; update `STATUS.md`  
- [ ] Morning brief still accurate  

**Hand to founder at wake:** publish from `LAUNCH-KIT.md` only if Wave 1 honesty gates are green. If P0-1/P0-2 slip, publish **waitlist + builders** only — do not push “pay via Stripe.”

---

## Top 10 for implementers (impact ÷ effort)

1. Kill fake pay (**P0-1**)  
2. Honest Stripe copy (**P0-2**)  
3. Stop client admin write (**P0-3**)  
4. Decline sibling quotes (**P0-6**)  
5. Fix login routing (**P1-2**)  
6. Gate chat (**P1-1**)  
7. Fix edit-application loop (**P1-3**)  
8. Privilege RLS trigger (**P0-4**)  
9. Niche landing lock (**P1-7**)  
10. Checkout/webhook scaffold (**P1-5**)  

---

## Dependencies map

```
P0-1 ──► P1-4, P1-5, P1-6
P0-3 ──► P0-4, P0-5
P1-1 ──► P1-8
P1-7 ──► GTM publish (LAUNCH-KIT) safe
P1-5 ──► real fee 10–12%, Connect onboard (post-overnight)
P2-1 ──► liquidity playbook (06) concierge mode
```

---

## Missing specialist reports (do not block)

| Role | Status | Ops action |
|------|--------|------------|
| 15 Metrics | Not in folder | Use LAUNCH-KIT §7 + liquidity north stars |
| 18 Landing | Covered by 04 §6 | Wave 3 uses 04/07 |

---

## Definition of “overnight success”

Not “big company.” Success = **honest niche MVP spine**:

1. Copy matches product truth  
2. Privilege not client-writable  
3. Accept → (pending money) → deliver → release state machine works in UI  
4. Chat not open spam channel  
5. Founder has publish queue + decisions list (`MORNING-BRIEF-HE.md`)

**— ORVO Role 20 · Ops Synthesizer**

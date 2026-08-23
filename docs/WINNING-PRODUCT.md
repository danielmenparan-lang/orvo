# ORVO — Winning Product

## תקציר מנהלים (עברית)

**ORVO הוא מרקטפלייס ממוקד — לא עוד פלטפורמת בוטים, ולא Upwork לכל דבר.**  
הנישה: **סוכני WhatsApp בעברית לעסקים קטנים בישראל** (הזמנות, תורים, שאלות נפוצות, לידים). לקוח מפרסם בקשה → ORVO מתאים ידנית בונים מאומתים → הצעות מחיר → צ'אט בפלטפורמה → תשלום מוחזק עד אישור מסירה.

**מה מנצח עכשיו:** אמון + התאמה אנושית (concierge) עד שיש נזילות (~20 עסקאות ששולמו).  
**מה אסור:** לספר שיש Stripe מאובטח בזמן ש־`Accept & pay` מסמן "שולם" בלי כסף אמיתי; לפתוח לוח משרות ריק לכל העולם; להתרחב לקטגוריות AI כלליות לפני שיש צפיפות בנישה.

**כסף:** Checkout של Stripe → כסף אצל ORVO (hold) → בונה מסמן נמסר → לקוח משחרר → העברה ל־Connect Express. עמלה מייסדים 0%, יעד 10–12%.  
**GTM:** וואטסאפ + לינקדאין + קוהורט בונים; נכסים מוכנים ב־`docs/marketing/LAUNCH-KIT.md` — הפרסום ידני של המייסד.

---

## 1. Niche (decisive)

**One sentence:** ORVO is where Israeli SMBs hire vetted builders to ship **custom WhatsApp AI agents**, then chat and pay on-platform.

| Lock | Detail |
|------|--------|
| Buyer | Restaurant / clinic / salon / local service owner drowning in WhatsApp |
| Job | Custom agent (not DIY SaaS template) — orders, booking, FAQ, lead capture |
| Supply | 8–15 hand-vetted builders who know Meta WA Cloud API / n8n / Hebrew UX |
| Geography | Israel beachhead; Hebrew-first demand; English OK for builders |
| Price band | ~₪3,500–₪12,000 custom builds (market anchors) |
| Out of scope (v1) | Voice agents, generic RAG apps, enterprise agents, “any AI freelance,” public builder directory |

**Sharpness test:** Remove the logo. The first screen must still say WhatsApp agents for Israeli businesses — not “AI marketplace.”

**Why this beats alternatives**

- vs **Upwork** — aisle, not mall; no Connects tax; Hebrew SMB journey  
- vs **ServedByAI / Moltify** — locale + request-first + human WA delivery, not global AI catalog / autonomous micro-tasks  
- vs **Gambot / Manychat** — they are the highway (SaaS/BSP); ORVO finds the driver for custom work  

---

## 2. Product structure

**Shape:** Concierge marketplace wearing product UI — not an open job board.

```
Client brief → Admin triage → Invite 1–3 builders → Quotes + chat
  → Pay (hold) → Deliver → Client release → Builder payout
```

| Object | Role |
|--------|------|
| Request | Spine of the journey (status, chat, pay, delivery) |
| Invite | Concierge assignment (add; demote browse-all) |
| Quote | Price + scope; one winner per request |
| Message | On-platform thread; contact leak blocked |
| Payment | Hold → release (escrow-*like*, not legal escrow) |
| Delivery | Structured handoff (URL + notes) before release |

**Roles:** Client · Builder (pending → approved) · Admin (vet + match + exceptions). Dual-role is data-ok; do not design MVP nav around it.

**Statuses (MVP truth)**

- Request: `open` → `in_progress` / awaiting payment → `funded` → `delivered` → `completed` (+ `disputed` / `cancelled`)  
- Payment: `pending` → `held` → `released` (never client-forged `paid` without Stripe)  
- Quote: `pending` → `accepted` → `paid` after hold; siblings → `rejected`

**IA rule:** One **Request detail** owns quotes, chat, pay, delivery. Lists are indexes, not the product.

---

## 3. Payments

**Architecture (locked by Role 03):** Stripe **Connect Express** + **separate charges & transfers** + **Checkout Sessions**. Platform is merchant of record; funds sit on platform until client release; then `Transfer` with `source_transaction`.

| Phase | Behavior |
|-------|----------|
| Now (honest) | No fake funded. Manual/ops path labeled clearly OR blocked |
| Next | Edge Function creates Checkout per quote; webhook writes `held` + `funded` |
| Release | Client (or auto 72h after deliver) → Transfer to builder Express account |
| Fee | Founding **0%**; publish path to **10–12%** (builder net shown before accept) |
| Currency | USD settlement MVP; **ILS display** for IL locale ASAP (agorot/`currency` column) |

**UX language:** “Funds held by ORVO until you approve.” Avoid “escrow account” unless counsel says otherwise.

**Hard rules**

- Browser never sole authority for `held` / `released` / `funded`  
- Fee percent authoritative on server  
- Kill `STRIPE_PAYMENT_LINK` as the product path  

---

## 4. UX principles

1. **Brand-first hero** — ORVO as hero signal; one headline; one supporting line; one CTA group; full-bleed scene (WhatsApp-in-business atmosphere). No role cards, no fake job card in the first viewport.  
2. **Client primary CTA** — “Post a WhatsApp agent request”; builder = quiet text link + builders section.  
3. **Quotes before chat dump** — client sees quotes + Accept sheet with fee math.  
4. **Delivery is a first-class step** — Mark delivered → Release payment (already stubbed in UI; must bind to real hold).  
5. **Chat policy** — Keep deals on ORVO; demo hosts OK pre-pay; contact/payment diversion blocked; enforce **server-side**.  
6. **Empty honesty** — “We’re matching you with 2 builders” beats a ghost board.  
7. **Israel readiness** — RTL + Hebrew pack + ₪ formatting are product requirements for the beachhead (not polish).  

---

## 5. GTM (30 days)

**North star:** 40 waitlist/signups · 8 approved builders · 12 requests · 3 deals in motion (paid when rails allow).

| Priority | Move |
|----------|------|
| 1 | Seed **builders first** (8–15), WhatsApp/IL only |
| 2 | Concierge demand via founder WhatsApp + LinkedIn |
| 3 | Founding waitlist + manual match promise (48h, 2–3 quotes) |
| 4 | Publish from `LAUNCH-KIT.md` / `10-social.md` — **founder only** |
| 5 | SEO later: HE restaurant page + EN builders page (`09-content.md`) |

**Offers that are allowed:** founding waitlist, founding builder cohort, founder-helped briefs, 0% fee on first deals.  
**Forbidden:** fake profiles/jobs, fake social proof, “guaranteed results,” pushing pay-via-Stripe before P0 honesty gates.

**Liquidity rule:** No public browse-jobs as the main loop until quote coverage ≥2 builders in 48h is real.

---

## 6. What “done” means for MVP

A shippable ORVO MVP is **not** “feature-complete vs Upwork.” It is:

1. Niche-clear landing and post form  
2. Manual vetting + concierge invite → quote  
3. Real hold payment (or explicitly pre-pay beta with no Stripe claims)  
4. Deliver → release path both sides understand  
5. Chat that cannot trivially leak the deal off-platform  
6. Admin that is not a public email hardcoded in JS  

Until item 3 is true, market **matching and waitlist**, not “secure Stripe marketplace.”

---

## 7. Decision record

| Topic | Decision |
|-------|----------|
| Niche | Israel WhatsApp / SMB AI agents |
| Model | Hire builders (marketplace), not BSP/SaaS |
| Matching | Human concierge until ~20 paid txns |
| Money | Hold then release via Connect Express + Checkout |
| Fee | 0% founding → 10–12% |
| Expansion | Only after in-niche liquidity proven |

**Sources:** `squad-reports/05`, `06`, `07`, `03`, `13`, `16`, `17`, `08`, `LAUNCH-KIT.md`.

---

*ORVO Ops Synthesizer (Role 20) · 2026-08-23*

# ORVO — Winning Product

## תקציר מנהלים (עברית)

**ORVO הוא מרקטפלייס ממוקד — לא עוד פלטפורמת בוטים, ולא Upwork לכל דבר.**  
הנישה: **סוכני WhatsApp בעברית לעסקים קטנים בישראל** (הזמנות, תורים, שאלות נפוצות, לידים). לקוח מפרסם בקשה → ORVO מתאים ידנית בונים מאומתים → הצעות מחיר → צ'אט בפלטפורמה → תשלום מוחזק עד אישור מסירה.

**מה מנצח עכשיו:** אמון + התאמה אנושית (concierge) עד שיש נזילות (~20 עסקאות ששולמו).  
**מה כבר תוקן בלילה:** העתקה באתר כבר לא טוענת "Stripe"; `is_admin` לא נכתב מהדפדפן; יש UI של delivered/release.  
**מה עדיין אסור:** `Accept & pay` עדיין יכול לסמן funded בלי כסף — **לא לפרסם תשלום מאובטח** עד ש־P0-1 בבאקלוג ירוק.

**כסף:** Checkout של Stripe → כסף אצל ORVO (hold) → בונה מסמן נמסר → לקוח משחרר → העברה ל־Connect Express. עמלה מייסדים 0%, יעד 10–12%.  
**GTM:** וואטסאפ + לינקדאין + קוהורט בונים; נכסים ב־`docs/marketing/LAUNCH-KIT.md` — הפרסום ידני של המייסד.

---

## 1. Niche (decisive)

**One sentence:** ORVO is where Israeli SMBs hire vetted builders to ship **custom WhatsApp AI agents**, then chat and pay on-platform.

| Lock | Detail |
|------|--------|
| Buyer | Restaurant / clinic / salon / local service owner drowning in WhatsApp |
| Job | Custom agent (not DIY SaaS) — orders, booking, FAQ, lead capture |
| Supply | 8–15 hand-vetted builders (Meta WA Cloud API / n8n / Hebrew UX) |
| Geography | Israel beachhead; Hebrew-first demand; English OK for builders |
| Price band | ~₪3,500–₪12,000 custom builds |
| Out of scope (v1) | Voice agents, generic RAG, enterprise, “any AI freelance,” public builder directory |

**Sharpness test:** Remove the logo. First screen still says WhatsApp agents for Israeli businesses — not “AI marketplace.”

**Why this wins**

- vs **Upwork** — aisle, not mall; no Connects tax; Hebrew SMB journey  
- vs **ServedByAI / Moltify** — locale + request-first + human WA delivery  
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
| Request | Spine (status, chat, pay, delivery) |
| Invite | Concierge assignment (add; demote browse-all) |
| Quote | Price + scope; one winner per request |
| Message | On-platform; contact leak blocked server-side |
| Payment | Hold → release (escrow-*like*, not legal escrow) |
| Delivery | Mark delivered → client release |

**Roles:** Client · Builder (pending → approved) · Admin (vet + match). Dual-role data-ok; do not design MVP nav around it.

**Statuses (MVP truth)**

- Request: `open` → `in_progress` / awaiting payment → `funded` → `delivered` → `completed` (+ `disputed`)  
- Payment: `pending` → `held` → `released` (never client-forged `paid`)  
- Quote: `pending` → `accepted` → `paid` after hold; siblings → `rejected`

**IA:** One **Request detail** owns quotes, chat, pay, delivery. Lists are indexes.

---

## 3. Payments

**Architecture (Role 03 lock):** Stripe **Connect Express** + **separate charges & transfers** + **Checkout Sessions**. Platform = merchant of record; funds on platform until client release; then `Transfer` with `source_transaction`.

| Phase | Behavior |
|-------|----------|
| Now (honest) | Landing copy OK; **still kill** fake `acceptQuote` funded path |
| Next | Edge Function Checkout per quote; webhook writes `held` + `funded` |
| Release | Client (or auto 72h after deliver) → Transfer to builder Express |
| Fee | Founding **0%** → **10–12%**; builder net shown before accept |
| Currency | USD settlement MVP; **ILS display** for IL ASAP |

**UX language:** “Funds held by ORVO until you approve.” Avoid “escrow account” unless counsel says otherwise.

**Hard rules:** Browser never sole authority for `held`/`released`/`funded` · fee authoritative on server · kill `STRIPE_PAYMENT_LINK` as product path.

---

## 4. UX principles

1. **Brand-first hero** — ORVO hero-level; one headline; one line; one CTA group; full-bleed WhatsApp-in-business scene. No role cards / fake job card in first viewport.  
2. **Client primary CTA** — “Post a WhatsApp agent request”; builder = quiet text link.  
3. **Quotes before chat dump** — Accept sheet with fee math.  
4. **Delivery first-class** — Mark delivered → Release (UI stubbed; bind to real hold).  
5. **Chat policy** — Deals on ORVO; demo hosts OK pre-pay; enforce **server-side**.  
6. **Empty honesty** — “Matching you with 2 builders” beats a ghost board.  
7. **Israel ready** — RTL + Hebrew pack + ₪ are beachhead requirements.

---

## 5. GTM (30 days)

**North star:** 40 waitlist/signups · 8 approved builders · 12 requests · 3 deals in motion.

| Priority | Move |
|----------|------|
| 1 | Seed **builders first** (8–15), WhatsApp/IL only |
| 2 | Concierge demand via founder WhatsApp + LinkedIn |
| 3 | Founding waitlist + manual match (48h, 2–3 quotes) |
| 4 | Publish from `LAUNCH-KIT.md` / `10-social.md` — **founder only** |
| 5 | SEO later: HE restaurant page + EN builders (`09-content.md`) |

**Allowed:** waitlist, founding builders, founder-helped briefs, 0% first deals.  
**Forbidden:** fake profiles/jobs, fake proof, “guaranteed results,” Stripe pay claims before P0-1 green.

**Liquidity:** No public browse-jobs as main loop until quote coverage ≥2 builders in 48h is real.

---

## 6. What “done” means for MVP

1. Niche-clear landing and post form  
2. Manual vetting + concierge invite → quote  
3. Real hold payment (or explicit pre-pay beta with no Stripe claims)  
4. Deliver → release both sides understand  
5. Chat cannot trivially leak off-platform  
6. Admin not a public email hardcoded as authority  

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

**Sources:** `squad-reports/01–08`, `11–14`, `16–17`, `19–20`, `LAUNCH-KIT.md`.

---

*ORVO Ops Synthesizer (Role 20) · 2026-08-23*

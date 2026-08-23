# ORVO Role 05 — Product Structure / IA

**Verdict:** ORVO wins as a **niche concierge for WhatsApp / messaging AI agents for local SMBs** — not a horizontal “AI agent marketplace.” Match by hand before you automate matching. Ship a complete request → quote → pay → deliver loop for one niche; kill open job-board sprawl.

---

## 1. Winning product shape

| Principle | Implication |
|-----------|-------------|
| Niche beats horizontal | One job type: **WhatsApp / chat agents for SMB ops** (orders, booking, FAQ, lead capture). Defer voice, CRM suites, generic “automation,” and “Other.” |
| Concierge before automation | Every new request is **triaged by ORVO**. Invited builders quote; clients do not shop an open feed of strangers. |
| Complete thin loop | MVP = post → match → quote → fund → deliver → release. Incomplete Stripe links and missing delivery states are product bugs, not “Phase 2 nice-to-haves.” |
| Trust is the product | Manual builder vetting stays. Escrow (or clear hold-funds behavior) before work. Delivery confirmation before payout. |

**One-line IA:** *Client describes a WhatsApp agent need → ORVO assigns vetted builders → quote & chat → pay into hold → builder delivers demo/link → client accepts → payout.*

---

## 2. Recommended MVP scope

### In (ship)

| Area | Scope |
|------|--------|
| **Audience** | SMB owners who need a WhatsApp/chat agent; small set of pre-vetted builders who ship those agents. |
| **Request** | Structured brief: business type, channel (WhatsApp-first), goal (orders / booking / FAQ / leads), languages, integrations, budget band, timeline. |
| **Concierge match** | Admin marks request `under_review` → invites 1–3 builders (or posts to a private invite pool). No public browse-all for clients. |
| **Quote** | Price, scope bullets, ETA, optional demo link. One active accepted quote per request. |
| **Chat** | Thread per request; keep off-platform contact blocked pre-pay (current filter direction is correct). |
| **Payment** | Accept quote → pay into hold (Stripe Checkout / PaymentIntent). Statuses below — no fake “paid” without money movement once Stripe is live. |
| **Delivery** | Builder submits deliverable URL + notes → client Accept / Request changes → release or dispute flag. |
| **Roles** | Client, Builder (approved), Admin (ops/concierge). Pending builder = application only. |
| **Admin ops** | Builder approve/reject; request triage & invite; payment/delivery exception view. |

### Out (explicit non-goals for MVP)

- Horizontal categories (Voice, CRM/Email, generic Automation, Other) as equal peers
- Open marketplace job board as the primary discovery loop
- Self-serve builder discovery / public profiles / SEO directory
- Bidding wars, skill tests, contests, AI auto-matching
- Multi-builder teams, milestones UI beyond one hold + one release (or fixed 2-tranche max later)
- Reviews/ratings graph, badges, leaderboards
- Native mobile apps, WhatsApp Business API hosting by ORVO
- Dispute arbitration product (manual admin flag + email is enough)
- Dual marketplace: “I am both client and builder” as a first-class UX (allow in data; don’t design for it)
- Instant payouts, Connect marketplace complexity beyond one hold → one transfer

---

## 3. Core objects

| Object | Purpose | Key fields (conceptual) |
|--------|---------|-------------------------|
| **Profile** | Identity + capability | `role` hint, `builder_status`, `is_admin`, contact |
| **BuilderApplication** | Vetting intake | bio, skills, portfolio links, `status` |
| **Request** | Client job | niche fields, `status`, `assigned_builder_id`, concierge notes |
| **Invite** *(add)* | Concierge assignment | `request_id`, `builder_id`, `status` (invited / declined / quoted) |
| **Quote** | Offer on a request | amount, message, ETA, `status` |
| **Message** | Thread on request | body, sender, timestamps |
| **Payment** | Money movement | amounts, fee, Stripe ids, `status` |
| **Delivery** *(add)* | Handoff artifact | url, notes, `status`, submitted_at |
| **Dispute** *(thin)* | Exception flag | reason, `status` open/closed — admin-only resolution |

Keep **Request** as the spine: chat, quotes, payment, and delivery hang off one request id.

---

## 4. Screens sitemap

```
Marketing
├── /                    Landing (niche: WhatsApp agents for SMBs)
├── /how                 How concierge works (optional fold of landing)
└── /builders            Apply CTA (not a public directory)

Auth
├── Sign in
└── Sign up (intent: client | builder)

Client app
├── My requests          List + status chips
├── New request          Structured brief (replace freeform-only)
├── Request detail       Spine: status · invites/quotes · chat · pay · delivery
│   ├── Quotes panel
│   ├── Chat
│   ├── Pay / funded banner
│   └── Delivery review
├── Messages             Threads = requests with activity
└── Profile

Builder app
├── Application / status Until approved
├── Invited jobs         Concierge invites only (replace Browse-all as primary)
├── My quotes
├── Active jobs          Funded / in delivery
├── Request detail       Quote · chat · submit delivery
├── Messages
└── Profile

Admin (ops)
├── Builder queue        Approve / reject
├── Request triage       Under review → invite builders
├── Live jobs            Funded / delivery / stuck
└── Exceptions           Payment + dispute flags
```

**IA rule:** One **Request detail** screen owns the journey. Do not scatter accept-pay, chat, and delivery across unrelated list views without a single spine.

---

## 5. Role permissions matrix

| Action | Guest | Client | Builder pending | Builder approved | Admin |
|--------|:-----:|:------:|:---------------:|:----------------:|:-----:|
| View landing / apply CTA | ✓ | ✓ | ✓ | ✓ | ✓ |
| Sign up / sign in | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create request | | ✓ | * | * | ✓ |
| Edit own open request | | ✓ | | | ✓ |
| Cancel own request (pre-fund) | | ✓ | | | ✓ |
| See all open requests (public board) | | | | ✗ MVP | ✓ |
| See invited requests | | | | ✓ | ✓ |
| Submit builder application | | ✓ | ✓ | | ✓ |
| Quote on invited request | | | | ✓ | |
| Chat on own / assigned request | | ✓ | | ✓ | ✓ |
| Accept quote & pay | | ✓ | | | |
| Mark payment captured (system/webhook) | | | | | ✓* |
| Submit delivery | | | | ✓ (assigned) | |
| Accept / request changes on delivery | | ✓ | | | ✓ |
| Release payout / refund flag | | | | | ✓ (+ automated rules) |
| Approve/reject builders | | | | | ✓ |
| Invite builders to request | | | | | ✓ |
| Override statuses / disputes | | | | | ✓ |

\*Webhook or trusted server path; never client-only “mark paid.”

`*` Clients who are also pending builders keep client permissions; builder job access stays locked until `approved`.

---

## 6. Status state machines

### 6.1 Request

```
draft ──(submit)──► submitted ──(admin triage)──► matching
                         │                            │
                         │                            ├─(invite builders)
                         │                            ▼
                         │                      quoting ◄── builders send quotes
                         │                            │
                         ├─(client cancel)──► cancelled │
                         │                            ├─(accept quote + pay intent)
                         │                            ▼
                         │                      awaiting_payment
                         │                            │
                         │              ┌─────────────┴─────────────┐
                         │              ▼                           ▼
                         │           funded                    payment_failed
                         │              │                           │
                         │              ▼                           └─► quoting (retry)
                         │         in_delivery
                         │              │
                         │     ┌────────┼────────┐
                         │     ▼        ▼        ▼
                         │  delivered  changes  disputed
                         │     │      requested     │
                         │     ▼        │           ▼
                         │  completed ◄─┘      (admin) → funded|cancelled|completed
                         │
                         └─► expired (no match / no quote in SLA)
```

**MVP mapping from today’s app:**  
`open` → split into `submitted` / `matching` / `quoting`.  
`in_progress` (pre-money) → prefer `awaiting_payment`.  
`funded` stays. Add `in_delivery`, `delivered`, `completed`, `cancelled`, `disputed`. Drop using `in_progress` as a catch-all.

### 6.2 Quote

```
draft ──(send)──► pending ──(client accept)──► accepted ──(payment captured)──► won
           │            │
           │            ├─(client picks other / withdraw)──► declined
           │            └─(builder withdraw)──► withdrawn
           │
           └─(request cancelled / expired)──► void
```

Rules: at most one `accepted`/`won` quote per request. On accept, other `pending` → `declined`.

### 6.3 Payment

```
created ──(Checkout started)──► pending ──(webhook paid)──► held
             │                      │
             │                      ├─(fail / abandon)──► failed
             │                      └─(expire session)──► expired
             ▼
           held ──(client accept delivery / auto-rules)──► released ──► transferred (to builder)
             │
             ├─(partial refund / full refund)──► refunded
             └─(dispute open)──► on_hold ──(admin)──► released | refunded
```

MVP: **held → released** is enough. Skip fancy Connect onboarding UI; admin can pay out manually until Connect is wired, but **client payment must be real**.

### 6.4 Delivery

```
none ──(builder submit)──► submitted ──(client accept)──► accepted
                              │
                              ├─(client request changes)──► changes_requested ──(resubmit)──► submitted
                              └─(client / admin dispute)──► disputed ──(admin)──► accepted | cancelled
```

Gate: payout `released` only from delivery `accepted` (or admin override).

---

## 7. 90-day phased roadmap (phase gates, not calendar guesses)

Phases advance only when the **gate** is met. Calendar is irrelevant; evidence is everything.

### Phase A — Niche spine + concierge
**Build:** Niche landing & copy; structured request form; request statuses `submitted → matching → quoting`; admin triage + builder invites; invited-jobs list for builders; quote + chat on request detail.  
**Kill/disable:** Public “Browse jobs” as default; multi-category parity.  
**Gate A:** ≥ N real SMB briefs triaged; ≥ M invite→quote cycles; clients never depend on an open board to get a builder.

### Phase B — Real money hold
**Build:** Stripe Checkout/PaymentIntent; payment states `pending → held`; webhook truth; request `awaiting_payment → funded`; reject client-side “mark paid.”  
**Gate B:** First live payment held in Stripe with matching DB row; accept-quote without webhook cannot show `funded`.

### Phase C — Delivery → release
**Build:** Delivery object + UI; `in_delivery → delivered → completed`; release payout (manual admin OK); thin dispute flag.  
**Gate C:** One job funded → delivered → accepted → builder paid (or explicitly marked transferred) end-to-end.

### Phase D — Tighten ops, then selective automation
**Build:** Admin live-jobs board; SLA nudges (email/WhatsApp ops); invite templates; optional second tranche; only then consider light auto-suggest of builders.  
**Gate D:** Concierge load is measurable; repeat clients or referrals without reopening category sprawl. Automation is additive, not a rewrite of matching.

**Do not start Phase D matching automation until Gates A–C are green.**

---

## 8. What to kill (or demote) in the current app

| Current | Action | Why |
|---------|--------|-----|
| Horizontal positioning (“AI Agent Marketplace” + Voice / CRM / Automation / Other) | **Narrow** to WhatsApp/chat SMB agents | Dilutes liquidity and trust; fights Upwork with no edge |
| **Browse jobs** as builder home | **Demote** → Invited jobs primary; browse only as admin-controlled overflow later | Open board before density = empty rooms + race-to-bottom |
| Freeform-only post (`title = desc.slice(0,80)`) | **Replace** with structured brief | Concierge cannot match on a paragraph blob |
| `Accept & pay` → Payment Link / confirm-without-Stripe | **Kill fake paid path** once Stripe live; until then label as **manual/ops** not product complete | False `funded` destroys trust |
| Request statuses `open` / `in_progress` / `funded` only | **Extend** machine (above) | No delivery or payment honesty |
| Missing delivery / complete / release UX | **Add** (not optional) | Marketplace without handoff is a lead form |
| Client sidebar “Become a builder” prominence | **Demote** to profile footnote | Dual-role marketing muddies MVP ICP |
| Profile “Status check” debug panel for all users | **Admin-only** or remove from client UI | Leaks ops; looks broken |
| Landing role-card clutter + inset preview-as-product | Align with niche hero (other roles own polish) | Structure: one ICP, one CTA story |
| Fee `ORVO_FEE_PERCENT = 0` with no escrow story | Decide fee + hold narrative before GTM | Pricing IA must match payment machine |
| All-requests admin list without triage actions | Upgrade to **triage + invite**, not a read-only dump | Concierge needs verbs |

**Keep:** Manual builder vetting, request-scoped chat, off-platform contact filters, admin approve queue, quote objects — these are the right bones for a concierge MVP.

---

## 9. Sitemap vs today’s dashboard (delta)

| Today | Target MVP |
|-------|------------|
| My requests / Browse jobs / My quotes / Messages / Apply / Admin review | My requests · **Request detail spine** · Invited jobs · Quotes · Messages · Apply · **Admin triage + invites** |
| Chat doubles as quote inbox | Keep, but add **Pay**, **Delivery**, clear status header |
| No invites table | Add **Invite** as first-class object |

---

## 10. Decision record

| Decision | Choice |
|----------|--------|
| Marketplace shape | **Concierge niche**, not horizontal exchange |
| Primary niche | **WhatsApp / messaging agents for SMBs** |
| Matching | **Human invite** until Gate D |
| Money | **Hold then release** tied to delivery accept |
| Primary screen | **Request detail** as journey spine |
| Explicit non-goal | Public builder directory & open job board liquidity theater |

This is the product shape subsequent roles (UX, payments, schema, journeys, ops) should implement against. Anything that re-expands category surface or skips concierge before density is a regression.

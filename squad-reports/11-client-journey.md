# 11 — Client Journey

**Scope:** Post-request → chat → hire → pay → delivery → done  
**Source of truth:** `/workspace/app.js` (dashboard / chat / quote accept / payments) + landing copy in `index.html`  
**Promise on landing:** *“Post what you need. Vetted builders send quotes. Chat privately and pay securely through ORVO.”* / *“Builder gets paid when the job is done.”*

---

## Ideal journey (step-by-step)

### Stage A — Discover & decide
1. Land on ORVO; understand niche (AI agents / automations).
2. Choose **Post a request** (`data-action="client-start"`).
3. If logged out → signup with intent `client` (or login); if logged in → open post modal immediately.

### Stage B — Account ready
4. Profile exists (`profiles` row, role client).
5. Dashboard opens to **My requests**; sidebar: Requests, Messages, Become a builder, Profile.

### Stage C — Post a job
6. Fill: description, category, optional budget hint.
7. Submit creates `requests` row: `status: 'open'`, `title` = first 80 chars of description.
8. See request on **My requests** with category, snippet, status badge, relative time.

### Stage D — Attract quotes & talk
9. Approved builders see the open job and can Message / Send quote.
10. Client opens request → **Chat** view (quotes panel + thread).
11. Chat keeps deals on-platform (block email/phone/WhatsApp/PayPal/etc.; allow agent/demo hosts pre-pay).
12. Client gets a clear signal when a new quote arrives (in-app + optional email).

### Stage E — Compare & hire
13. Quotes list on chat: builder name, amount, message, **Accept & pay** while `pending`.
14. Client can compare multiple quotes, message each builder in context of the same request.
15. Accepting one quote assigns builder, moves request into funded/working state, declines or locks other quotes.

### Stage F — Pay via ORVO
16. Confirm amount + platform fee + builder net.
17. Real Stripe Checkout (amount-specific); webhook marks payment `paid`, quote `paid`, request `funded` (or `in_progress` after funds clear).
18. Pre-pay link rules relax after paid phase (`in_progress` | `funded` | `completed`) so delivery links can flow.

### Stage G — Delivery & acceptance
19. Builder ships work in chat (repo/demo links after pay).
20. Client can **Mark complete / Accept delivery** (or request revisions).
21. Status → `completed`; payout released to builder per escrow rules.
22. Optional short review; request archived from “active.”

### Stage H — Ongoing
23. Re-open Messages for history; post another request; optionally apply as builder later.

---

## Current implementation map

| Ideal step | Current code behavior | Status |
|------------|----------------------|--------|
| A Discover | Landing CTAs `client-start` / How steps | Partial |
| B Account | `doSignup` / `doLogin` → `routeAfterAuth('client')` → `go('requests')` | OK |
| C Post | `openPost` → `doPost` inserts `requests` | OK (thin) |
| D Quotes/chat | Card click → `go('chat')`; `loadChat` loads quotes for owner; `sendMsg` + filters | Partial |
| E Hire | `acceptQuote` sets quote `accepted`, request `in_progress`, `assigned_builder_id` | Partial |
| F Pay | `confirm()` + optional generic `STRIPE_PAYMENT_LINK`; else manual `paid`/`funded` | Gap (not real escrow) |
| G Delivery | No complete / revise / release UI | Missing |
| H Ongoing | Messages = own requests; no unread/notifications | Thin |

Key handlers: `doPost`, `loadRequests`, `loadChat`, `acceptQuote`, `sendMsg`, `validateChatMessage`, `loadThreads`.

---

## Gaps vs current (`app.js`)

### Posting & request hygiene
- **No dedicated request detail** — list click jumps straight to chat; no edit, close, cancel, or reopen.
- **Title is auto-sliced description** — weak discoverability for builders; no separate title field.
- **No attachments / requirements checklist** — only free-text + category + budget string.
- **No status lifecycle UI** for client beyond badge text (`open` → later `in_progress` / `funded`).

### Quotes & hiring
- Quotes only appear inside chat for the request owner; **no “Quotes inbox”** or sort/filter.
- **No notification** when a quote is submitted (client must poll by opening chat).
- Accepting a quote does **not** reject/withdraw sibling quotes (`status` stays `pending` on others).
- Builder identity is name-only; **no portfolio/skills surface** at accept time.

### Chat
- Filters are client-side only (`validateChatMessage`); admins bypass; **no server enforcement**.
- No typing indicators, read state, or file upload — text only.
- Hint copy is good; paid-phase unlock exists in logic but **delivery UX doesn’t guide “share demo after pay.”**

### Payment (critical trust gap)
- Landing promises Stripe + “paid when job is done.”
- `acceptQuote`: fee from `ORVO_FEE_PERCENT`; if `STRIPE_PAYMENT_LINK` set → open **generic** link, leave payment `pending`, quote `accepted`, request `in_progress` — **no webhook / amount match / success return**.
- If no Stripe link → `confirm()` then immediately `payments.status = 'paid'`, quote `paid`, request `funded` (**fake payment**).
- **No escrow hold, no release on completion, no refund/dispute path.**

### Delivery & closeout
- No “Mark delivered,” “Accept work,” “Request changes,” or completion status transition in UI.
- No reviews/ratings.
- No receipt / invoice view for the client.

### Navigation / role friction
- While applying as builder (`builder_status === 'pending'`), sidebar collapses to **Application status only** — active clients mid-hire lose Requests/Messages until resolved (`openDash` → `go('status')`).
- Pending/rejected clients cannot easily continue buying.

---

## Acceptance criteria by stage

### A — Discover & decide
- [ ] Primary CTA opens signup (logged out) or post modal (logged in).
- [ ] Signup intent defaults to client when CTA is client-start.
- [ ] Landing How-it-works steps match actual product capabilities (or copy is toned until escrow ships).

### B — Account ready
- [ ] After auth, dashboard opens on **My requests** for non-builder, non-admin users.
- [ ] Profile row exists; nav shows `Client` (or Pending/Builder/Admin accurately).
- [ ] Client can always reach Requests + Messages even if they later start a builder application (ideal; currently fails when pending).

### C — Post a job
- [ ] Empty description blocked with clear error.
- [ ] Request stored as `open` with category + optional budget.
- [ ] New request appears at top of My requests without refresh failure.
- [ ] Ideal: editable title; cancel/close request; confirmation toast (toast exists today).

### D — Attract quotes & talk
- [ ] Only approved builders can message/quote open jobs (enforced by product + RLS).
- [ ] Client can open chat for a request and see message history.
- [ ] Email/phone/off-platform URLs blocked for non-admins; agent/demo hosts allowed pre-pay.
- [ ] Ideal: toast/badge when a new quote arrives; unread count on Messages.

### E — Compare & hire
- [ ] Owner sees all quotes with amount + message + Accept while `pending`.
- [ ] Accept requires explicit confirmation showing total, fee, and builder net.
- [ ] On accept: assigned builder set; request leaves pure `open` state; other quotes marked `declined` or equivalent.
- [ ] Non-owners cannot see Accept & pay controls.

### F — Pay via ORVO
- [ ] Payment creates a `payments` row tied to `user_id`, `request_id`, `quote_id`, fee, payout cents.
- [ ] Stripe path uses Checkout/PaymentIntent for the **exact** amount; success webhook (or verified return) flips quote → `paid`, request → `funded`, payment → `paid`.
- [ ] Failed/abandoned Stripe does not leave the job falsely funded.
- [ ] After paid phase, chat allows broader non-off-platform links per `chatPaidPhase`.
- [ ] Manual/`confirm()` shortcut is admin-only or clearly labeled “dev only,” not production default.

### G — Delivery & acceptance
- [ ] Client can mark work accepted → request `completed`.
- [ ] Completion triggers (or queues) builder payout release; client sees confirmation.
- [ ] Ideal: revision request keeps status `funded`/`in_progress` with a reason note in chat.
- [ ] Ideal: one-tap review after complete.

### H — Ongoing
- [ ] Messages lists all of the client’s request threads with last activity.
- [ ] Completed jobs remain readable (history).
- [ ] Client can post another request from dashboard action.

---

## Priority gaps (client)

1. **Real pay + escrow release** (Stages F–G) — trust break vs landing.
2. **Sibling quote decline + hire state machine** (Stage E).
3. **Quote notifications** (Stage D).
4. **Request manage** (edit/close) + keep client nav while builder-pending (Stages C/B).
5. **Delivery accept UI** (Stage G).

---

## Code anchors

- Post: `doPost` (~492), `loadRequests` (~516)
- Chat/hire: `loadChat` (~764), `acceptQuote` (~881), `validateChatMessage` (~139)
- Threads: `loadThreads` (~859)
- Role routing: `openDash` / `renderSidebar` (~413–456)

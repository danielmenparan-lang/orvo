# 12 — Builder Journey

**Scope:** Apply → pending → approve → browse jobs → quote → chat → deliver → payout  
**Source of truth:** `/workspace/app.js` (`loadApply`, `doApply`, `loadStatus`, `loadJobs`, `doQuote`, `loadQuotes`, `loadChat`, `acceptQuote` payment fields) + landing builder section  
**Promise on landing:** *“Apply once. Get approved. Build for real clients.”* / *“Clients pay through Stripe. You receive payment when the project is complete.”*

---

## Ideal journey (step-by-step)

### Stage A — Attract & signup
1. Land on builders section; CTA **Apply as a builder** (`builder-start` / `builder`).
2. Signup with intent `builder` (or login); route into Apply view.

### Stage B — Apply
3. Submit application: bio (≥50), skills (required), optional portfolio + LinkedIn, years of experience.
4. Persist `builder_applications` (`pending`) and `profiles.builder_status = 'pending'`.
5. Confirm success; show expected review SLA (e.g. 48h).

### Stage C — Pending / revise
6. Status page shows `pending` with clear wait messaging.
7. Builder can **edit** application while pending (bio/skills/links) without losing place in queue.
8. Ideal: email when status changes; keep limited client capabilities if they also buy.

### Stage D — Decision
9. Admin reviews in **Review builders**; Approve → `approved` + `builder_status: approved` (+ `reviewed_at`).
10. Reject → `rejected` with reason; path to re-apply or appeal.
11. On approve, builder lands on **Browse jobs** with full builder sidebar (no “sign out/in” required).

### Stage E — Browse jobs
12. List `requests` with `status = 'open'` (title, description, category, budget, age).
13. Filter/search by category/skills (ideal); hide jobs already quoted (or show “Quoted”).
14. Actions: **Message** and **Send quote**.

### Stage F — Quote
15. Modal: price (USD) + pitch message; min price enforced.
16. Insert `quotes` (`pending`); appear under **My quotes**.
17. Cannot spam-duplicate silently — unique open quote per request or explicit replace.
18. Ideal: edit/withdraw quote while still pending.

### Stage G — Chat & win
19. Message client under request thread; same on-platform filters as clients.
20. When client accepts & pays → quote `paid` / request `funded` or `in_progress`; builder sees status change on My quotes / Messages.
21. Ideal: notification “You’re hired — funds secured.”

### Stage H — Deliver
22. After paid phase, share demo/repo links in chat; optional structured **Mark delivered** with artifact URL + notes.
23. Client accepts or requests revisions; builder iterates in-thread.

### Stage I — Payout
24. On client accept / auto-complete window → payout of `builder_payout_cents` via Stripe Connect (or scheduled transfer).
25. Builder sees payout history: pending / paid / amount / job title.
26. Ideal: tax/profile payout details onboarding during Apply or first win.

---

## Current implementation map

| Ideal stage | Current behavior | Status |
|-------------|------------------|--------|
| A Signup | `builder-start` → signup intent / or `go('apply')` if logged in; `routeAfterAuth('builder')` | OK |
| B Apply | `loadApply` / `doApply` upsert + profile pending | OK |
| C Pending | `loadStatus`; sidebar only Status | Partial |
| C Edit | Status button `data-goto="apply"` but `loadApply` redirects pending → status | **Broken loop** |
| D Admin | `loadAdmin` / `approveBuilder` / `rejectBuilder` | OK (no reject reason) |
| E Jobs | `loadJobs` open requests; Message / Send quote | Partial |
| F Quote | `doQuote` → `quotes`; `loadQuotes` | Partial |
| G Chat | Shared chat; no hire toast for builder | Thin |
| H Deliver | None | Missing |
| I Payout | `payments.builder_payout_cents` written on accept; no UI / Connect | Missing |

---

## Gaps vs current (`app.js`)

### Apply & pending
- **Edit application broken while pending:** `loadStatus` offers “Edit application” → `go('apply')`, but `loadApply` does `if (isPending()) { go('status'); return; }` — infinite bounce.
- Pending users lose client dashboard (Requests/Messages) — dual-role users stuck.
- Rejected: copy points to “contact support”; **no re-apply UI** (`loadApply` only blocks builder/pending, not explicitly rejected — rejected may reach form, but upsert/`builder_status` semantics unclear for second chance).
- No email/webhook notify on approve/reject (admin gets realtime toast; builder must refresh).
- Empty jobs after approve suggests *“sign out and back in”* — implies session/profile refresh fragility.

### Jobs board
- Flat list of all `open` requests; **no filters**, no “already quoted” badge.
- Full description dumped in card; no pagination.
- Non-builders hitting jobs see apply CTA (good) but approved path is the only real browse.

### Quotes
- Min $1 (`cents < 100`); message required — OK baseline.
- **No uniqueness guard** in UI (duplicate quotes possible unless DB constraint).
- My quotes shows amount + status; click → chat — OK.
- No withdraw/edit; statuses beyond `pending`/`accepted`/`paid` not surfaced with next actions.
- Builder **never sees Accept & pay** (owner-only in `loadChat`) — correct — but also **no “awaiting client” / “hired” callouts**.

### Chat / messages
- Builder Messages = all own quotes’ requests **plus every open request** (`loadThreads`) — noisy inbox that mixes marketing browse with real threads.
- Same client-side-only contact filters; no delivery checklist.

### Delivery
- No mark delivered, artifact fields, milestone UI, or completion handshake.
- Landing promise “paid when complete” has **no completion event** for either side.

### Payout
- On client `acceptQuote`, system may insert `payments` with `builder_payout_cents` and fee math — **builder never sees this**.
- Stripe path opens a **generic payment link** (client-side); not Connect destination charges; payment can stay `pending` forever with no builder visibility.
- Manual path marks `paid`/`funded` immediately without actual money movement.
- **No payouts view, bank onboarding, or release trigger.**

### Post-hire job visibility
- `loadJobs` only shows `status = 'open'` — once hired (`in_progress`/`funded`), job **disappears from browse** (OK) but there is **no “Active jobs”** list for the assigned builder.

---

## Acceptance criteria by stage

### A — Attract & signup
- [ ] Builder CTA opens signup with intent `builder`, or Apply if already logged in.
- [ ] After signup with session, dashboard routes to Apply (`routeAfterAuth`).
- [ ] Login after builder intent still reaches Apply (note: `postSignupIntent` is in-memory — ideal: persist intent or always offer Apply in client sidebar).

### B — Apply
- [ ] Bio &lt; 50 chars blocked; empty skills blocked.
- [ ] Upsert by `user_id` succeeds; profile `builder_status` becomes `pending`.
- [ ] User sees Status view + toast confirming admin queue.
- [ ] Invalid schema surfaces actionable SQL/setup error (current toasts mention SQL fixes).

### C — Pending / revise
- [ ] Status page shows `pending` + SLA copy.
- [ ] **Edit application** loads the form **pre-filled**, allows update, stays `pending` (must fix redirect loop).
- [ ] Ideal: email on status change; dual-role access to client Requests while pending.

### D — Decision
- [ ] Approve sets application + profile to `approved` with `reviewed_at`.
- [ ] Reject sets both to `rejected`; builder sees reject state; ideal: reason + re-apply after cooldown.
- [ ] Approved builder sidebar: Browse jobs, My quotes, Messages, Profile — without forced re-login.
- [ ] Admin badge/count updates when new applications arrive (existing channel).

### E — Browse jobs
- [ ] Only `builder_status === 'approved'` can list open jobs and quote.
- [ ] Each card shows category, title, description, budget, Quote + Message.
- [ ] Empty state explains no open jobs (without requiring sign-out as the primary fix).
- [ ] Ideal: filter by category; badge if already quoted; hide own posts if dual-role.

### F — Quote
- [ ] Valid price (≥ $1) + non-empty message required.
- [ ] Quote row created `pending` with `builder_id`, `request_id`, `amount_cents`, `message`.
- [ ] My quotes lists all quotes newest first; click opens chat for that request.
- [ ] Ideal: one active pending quote per request; withdraw while pending.

### G — Chat & win
- [ ] Builder can message on open jobs and on quoted/hired jobs they participate in.
- [ ] Off-platform contact blocked; agent links allowed pre-pay.
- [ ] After client pay/fund, quote status visible as `paid` (or hired) on My quotes without hunting chat.
- [ ] Ideal: push/toast “Quote accepted — start delivery.”
- [ ] Messages inbox lists **real conversations** (quoted/hired), not every open job.

### H — Deliver
- [ ] Assigned builder has an **Active jobs** (or funded) list.
- [ ] Can mark delivered with notes/links after paid phase.
- [ ] Client accept/revise updates status visible to builder.
- [ ] Chat paid-phase rules allow sharing deployment/docs hosts beyond pre-pay allowlist (non-off-platform).

### I — Payout
- [ ] `builder_payout_cents` and fee are correct vs quote amount and `ORVO_FEE_PERCENT`.
- [ ] Builder can view payout status per job: pending escrow / released / failed.
- [ ] Release only after completion (or explicit admin override) — matches landing copy.
- [ ] Ideal: Stripe Connect onboarding before first payout; no generic shared Payment Link as the hire path.

---

## Priority gaps (builder)

1. **Fix pending Edit loop** (`loadApply` ↔ `loadStatus`).
2. **Active jobs + delivery mark** (Stages H) — without this, “get paid when complete” is fiction.
3. **Payout visibility + Connect/release** (Stage I).
4. **Hire notifications + clean Messages inbox** (Stage G).
5. **Quote hygiene** (dedupe/withdraw) + **post-approve refresh** without sign-out (Stages F/D).
6. **Reject reason / re-apply** (Stage D).

---

## Code anchors

- Apply: `loadApply` (~609), `doApply` (~623), `loadStatus` (~662)
- Admin gate: `approveBuilder` / `rejectBuilder` (~720–745)
- Jobs/quotes: `loadJobs` (~535), `doQuote` (~568), `loadQuotes` (~593)
- Threads noise: `loadThreads` builder branch (~861–865)
- Money side-effect (client-triggered): `acceptQuote` (~881–909) writes `builder_payout_cents` but no builder UI
- Roles: `isBuilder` / `isPending` (~168–169), `renderSidebar` (~430–456)

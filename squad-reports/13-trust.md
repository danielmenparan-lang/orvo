# 13 — Trust & Disputes

**Role:** Trust / Disputes  
**Source of truth:** `app.js` (chat filter, acceptQuote, statuses)  
**Scope:** Reviews, disputes, escrow release, off-platform chat policy

---

## Current state (from app.js)

| Area | Today |
|------|--------|
| Builder trust | Manual admin approve/reject via `builder_applications` |
| Payment | Client “Accept & pay” writes `payments` row; Stripe link optional; often manual `paid` |
| Escrow | Implicit only: request → `in_progress` → `funded`. No hold / release / payout states |
| Delivery / complete | `completed` referenced in chat paid-phase only — no UI to mark complete |
| Reviews | None |
| Disputes | None |
| Chat leak prevention | Client-side filter: block email, phone, WhatsApp/PayPal/social/calendly/discord; pre-pay allowlist for agent/demo hosts |

Gaps that break trust: money can be marked paid without Stripe; builders cannot prove delivery; clients cannot rate; no path when work is wrong; filter is bypassable (obfuscation, images, voice notes later).

---

## 1. Reviews

### Goals
- Signal quality after funded work
- Feed builder ranking and admin re-vetting
- Reduce “unknown builder” anxiety for first-time clients

### Rules
1. **Who:** Only the **client** who owns the request may leave a review of the **assigned builder**.
2. **When:** Request status is `completed` OR payment status is `released` (escrow paid out). One review per `(request_id, client_id)`.
3. **What:** `rating` 1–5 (required), `body` optional (20–1000 chars), optional tags (`on_time`, `communication`, `quality`, `value`).
4. **Builder reply:** One optional reply within 14 days; no rating change.
5. **Visibility:** Public aggregate on builder profile (approved builders only). Full text visible to parties + admin.
6. **Moderation:** Admin can hide (`is_hidden`). Hidden reviews excluded from averages.
7. **No review before fund:** Block if payment never reached `held`/`paid`.
8. **Retaliation guard:** Builder cannot see client’s draft; rating is immutable after submit (admin edit only).

### Ranking formula (MVP)
```
builder_score = 0.6 * avg_rating_normalized
              + 0.25 * completion_rate
              + 0.15 * response_speed_score
```
Do not show raw score publicly at launch — show stars + count only.

### Product UI (minimal)
- After client marks **Approve delivery** → prompt: “Rate your builder”
- Builder dashboard: average stars + last 5 visible reviews
- Admin: flag reviews with disputed status open

---

## 2. Disputes

### When a dispute can open
Client or assigned builder may open **one active dispute** per funded request when:
- Payment is `held` or `paid` (funds not yet fully released), **and**
- Request is `funded` or `in_progress` or `delivered` (pending acceptance), **and**
- Not already `released` / `refunded` / `cancelled`

### Reasons (enum)
| Code | Typical opener |
|------|----------------|
| `not_delivered` | Client |
| `not_as_described` | Client |
| `unresponsive` | Either |
| `scope_change` | Either |
| `payment_issue` | Either |
| `other` | Either |

### Lifecycle
```
open → under_review → resolved_client
                    → resolved_builder
                    → resolved_split
                    → withdrawn
```

### SLA
| Step | Target |
|------|--------|
| Acknowledge | 24h |
| First decision or ask for evidence | 72h |
| Hard resolve | 7 calendar days from open (extend once +7d by admin) |

### Evidence
- Parties attach: chat excerpts (auto-link `request_id`), demo URLs, screenshots (Storage bucket `dispute-evidence`, RLS party+admin).
- Freezing: while dispute `open`/`under_review`, **block escrow release** and block new “Accept & pay” on same request.

### Resolution outcomes
| Outcome | Money | Request status |
|---------|-------|----------------|
| `resolved_builder` | Full release to builder | `completed` |
| `resolved_client` | Full refund to client | `cancelled` or `refunded` |
| `resolved_split` | Admin sets split cents | `completed` or `cancelled` |
| `withdrawn` | Resume normal release path | prior status |

Admin notes required on every resolve. Notify both parties (email later; toast/in-app MVP).

### Abuse
- Cap: 3 disputes opened by same user in 30 days → auto-flag admin.
- Frivolous pattern → temporary quote/post freeze (`profiles.trust_hold`).

---

## 3. Escrow release rules

Align with future Stripe Connect / PaymentIntent hold. Until Stripe is live, treat DB statuses as the source of truth and **never** set `paid`/`released` from the browser without a webhook or admin action.

### Payment / escrow states
| Status | Meaning |
|--------|---------|
| `pending` | Checkout started |
| `held` | Client paid; ORVO holds funds |
| `released` | Builder payout executed |
| `refunded` | Returned to client |
| `failed` / `cancelled` | No hold |

### Request delivery states (add)
| Status | Meaning |
|--------|---------|
| `open` | Accepting quotes |
| `in_progress` | Quote accepted; awaiting / during payment |
| `funded` | Escrow held; work should proceed |
| `delivered` | Builder submitted delivery |
| `completed` | Client approved (or auto-approve) |
| `disputed` | Dispute open |
| `cancelled` | Closed without completion |

### Release triggers (priority order)

1. **Client approval (primary)**  
   Client clicks **Approve & release** on a `delivered` request → payment `held` → `released`, request → `completed`.

2. **Auto-release (secondary)**  
   If builder marked `delivered` and client takes **no action for 72 hours** (configurable `auto_release_hours`, default 72) **and** no open dispute → auto `released` + `completed`.  
   Notify client at T+24h and T+48h: “Approve or open a dispute.”

3. **Admin force-release**  
   After dispute resolve or ops intervention.

4. **Never auto-release if**
   - Dispute `open` or `under_review`
   - Payment not `held`
   - Builder not `assigned_builder_id`
   - `profiles.trust_hold` on either party (admin override only)

### Partial / milestone (post-MVP)
Single-hold MVP only. Milestone escrow is phase 2.

### Fee
Platform fee (`platform_fee_cents`) taken at **release**, not at hold, so refunds are clean. Mirror `ORVO_FEE_PERCENT` in server config (DB `platform_settings`), not only `supabase-config.js`.

### Manual mode (current app)
Until Stripe webhooks exist:
- Client confirm must create `payments.status = 'pending'` only.
- Admin (or webhook stub) flips to `held`.
- Remove client-writable path that sets `paid`/`funded` directly in `acceptQuote`.

---

## 4. Chat off-platform policy — improvements

### What works today
- Blocks emails, phones (incl. IL + US patterns), WhatsApp/Telegram/PayPal/Venmo/Cash App/Zelle, social, Calendly, Discord invites.
- Pre-payment: only agent/demo hosts (GitHub, Vercel, n8n, etc.).
- Post-payment (`in_progress` | `funded` | `completed`): non-off-platform URLs allowed.
- Admins bypass filter.

### Gaps & bypasses
1. **Client-only enforcement** — anyone can insert via API if RLS allows. Move validation to **DB trigger** or Edge Function.
2. **Obfuscation** — `whats app`, `w[.]a[.]me`, `pay pal`, zero-width chars, Hebrew “וואטסאפ”, `at gmail dot com`.
3. **Handle without URL** — `@username`, “DM me on IG”, “call me”.
4. **Google Docs / Drive** allowed pre-pay — often fine for specs; risk if used as contact sheet. Keep allowlist but scan body for phones/emails inside linked titles (hard); prefer post-pay for Drive.
5. **No audit** — blocked attempts not logged.
6. **Paid phase too early** — `in_progress` starts before funds held. **Tighten:** treat as paid-phase only when status ∈ `{funded, delivered, completed}` (not bare `in_progress`).

### Recommended policy matrix

| Phase | Allowed | Blocked |
|-------|---------|---------|
| Pre-fund (`open`, `in_progress` unpaid) | Agent/demo allowlist hosts; plain project chat | Contact info, payment apps, social, calendars, discord, raw emails/phones |
| Funded+ | Same blocks for **contact & payment diversion**; allow general https for delivery artifacts | Still block WhatsApp/PayPal/Venmo/phone/email forever on-platform |
| Always | — | Competing marketplace links (Upwork, Fiverr) — add to blocklist |

### Implementation upgrades
1. **Server-side** `validate_message()` SECURITY DEFINER trigger on `messages` INSERT/UPDATE.
2. **Normalize** text: NFKC, strip zero-width, collapse spaces, lowercase for checks.
3. **Strike system:** 3 blocked sends / 24h → soft lock messaging 1h + admin event.
4. **Log** `chat_moderation_events` (user_id, request_id, reason, snippet hash).
5. **UX copy:** Replace hint with: “Stay on ORVO until escrow releases. Sharing contact or off-platform payment can pause your account.”
6. **Delivery channel:** Prefer structured **Delivery** object (URL + notes) over freeform chat for final handoff — easier disputes.

### Allowlist additions (consider)
- `lovable.dev`, `stackblitz.com`, `codesandbox.io`, `figma.com/file`, `loom.com`, `youtube.com/watch` (demo)

### Blocklist additions
- `upwork.com`, `fiverr.com`, `freelancer.com`, `servedbyai.com`
- `bit.ly` / bare shorteners pre-fund (force expand or block)
- Crypto wallets / `paypal.me` already covered — add `wise.com/pay`

---

## 5. Trust checklist for implementers (priority)

1. Stop client-side-only “mark paid”; introduce `held` → `released` with delivery approval.
2. Add `reviews` + `disputes` tables (see `14-schema.md`) and minimal UI.
3. Move chat filter server-side; tighten paid-phase to post-fund.
4. Auto-release at 72h after `delivered` with reminders.
5. Admin dispute queue next to “Review builders”.

---

## Success criteria

- Client can fund → receive delivery → release or dispute without leaving ORVO.
- Builder sees clear “when I get paid” rules.
- Off-platform contact attempts drop; blocked attempts are visible to admin.
- Every funded job ends in `completed`, `refunded`, or resolved dispute — no silent `funded` forever.

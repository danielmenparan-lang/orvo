# 03 — Payments Architect: ORVO Stripe Path

**Verdict:** Ship **Stripe Connect Express + separate charges & transfers + Checkout Sessions**, with funds held on the platform until the client releases (or admin resolves a dispute). Do not use Payment Links or destination charges for MVP.

Stripe does **not** offer legal escrow. The pattern below is the standard 2025–2026 “escrow-like” services-marketplace flow Stripe documents for hold-until-delivery.

---

## Current code (what we inherit)

| Stub / behavior | Location | Problem |
|-----------------|----------|---------|
| `ORVO_FEE_PERCENT = 0` | `supabase-config.js` | No monetization; fee math already exists in `acceptQuote` |
| `STRIPE_PAYMENT_LINK = ''` | `supabase-config.js` | Static link cannot map to per-quote amount, builder, or metadata |
| Manual confirm path | `app.js` `acceptQuote` | Inserts `payments` as `paid` / `pending` without Stripe PI/session IDs; opens generic Payment Link in a new tab |
| Status model | requests / quotes / payments | `accepted` → `in_progress` before money clears; `funded` only on manual path — racey and not webhook-driven |
| Fee split | `amount_cents`, `platform_fee_cents`, `builder_payout_cents` | Correct shape; needs Stripe IDs + hold/release states |

Product promise on the landing page: *“Clients pay through Stripe. You receive payment when the project is complete.”* That requires **delayed transfer**, not instant destination charges.

---

## 1. Recommended architecture (ONE path)

### Stack

| Layer | Choice |
|-------|--------|
| Connected accounts | **Express** (Stripe-hosted KYC / Express Dashboard) |
| Charge type | **Separate charges and transfers** |
| Checkout UI | **Stripe Checkout Session** (hosted), created server-side per quote |
| Hold | Client PaymentIntent settles on **platform balance**; no transfer yet |
| Release | Create `Transfer` with `source_transaction` = charge ID, `amount` = `builder_payout_cents`, `transfer_group` = payment id |
| Platform fee | Keep remainder on platform (`amount − payout`); optionally use Balance Transfers / accounting as `platform_fee_cents` |
| Webhooks | Supabase Edge Function (or small Node API) — never secret keys in the browser |
| Currency (MVP) | **USD** settlement on platform |

### Money flow (happy path)

```
Client accepts quote
  → Edge Function creates Checkout Session (amount = quote.amount_cents)
  → Client pays on Stripe Checkout
  → webhook checkout.session.completed / payment_intent.succeeded
  → payments.status = held; requests.status = funded; quotes.status = paid
  → Builder delivers; client clicks “Release payment”
  → Edge Function creates Transfer → connected Express account
  → payments.status = released; requests.status = completed
  → Stripe pays out builder per Express payout schedule (auto)
```

### Authz rules (hard)

- Only the **request owner** can create a Checkout Session for an accepted quote.
- Only the **request owner** can release (or open a dispute).
- Only **admin** can force-release / refund / decide disputes.
- Builder must have `stripe_account_id` + `charges_enabled` / `payouts_enabled` (or at least `transfers` capability) before release; onboarding can complete anytime before release, but ideally before “Accept & pay.”
- All Stripe secret work happens in Edge Functions; frontend only receives a Checkout URL or status.

### Why this matches ORVO

- One client ↔ one builder per job (no multi-vendor cart).
- Delivery is async (days/weeks) → must **hold** funds.
- Brand is ORVO on the statement (platform is merchant of record) → trust + disputes sit with you, which is what a marketplace sells.
- Existing `payments` insert fields already model fee + payout; we extend, not rewrite.

---

## 2. Why not the alternatives

| Alternative | Reject for MVP because |
|-------------|------------------------|
| **Payment Links** (`STRIPE_PAYMENT_LINK`) | Static price/product; cannot bind quote id, builder Connect account, or dynamic cents; no reliable escrow state machine; current stub is a dead end |
| **Destination charges** | Funds **immediately** transfer to the connected account on capture — contradicts “paid when done”; refunds/chargebacks after transfer are harder; fine for instant goods, wrong for custom builds |
| **Direct charges** | Builder is merchant of record; weaker ORVO brand; fee collection and dispute UX worse for a young marketplace |
| **Authorize-only (manual capture)** | Auth holds expire (~7 days); AI agent builds often take longer → charge fails or requires re-auth |
| **Destination charge + manual payouts on Express** | Money already on connected account balance; “hold” is only delaying bank payout, not true platform control; refunds/disputes messier; still looks paid to the builder |
| **Custom Connect accounts** | Heavier compliance / UI ownership; Express is enough for MVP KYC |
| **Separate charges without `source_transaction`** | Risk of insufficient platform balance / race; always set `source_transaction` on release |
| **Funds segregation (allocated_funds preview)** | Useful later for ring-fencing; private preview / extra complexity — skip for week-1 MVP |
| **PayPal / Israeli local PSP as primary** | Possible later for IL-only buyers; don’t fork MVP off Stripe’s Connect model |

**Legal note:** Call the product “secure hold” / “funds held by ORVO until you approve” in UX — not “escrow account” — unless counsel sets up a real escrow entity.

---

## 3. Exact data model fields needed

### `profiles` (builders + clients)

| Field | Type | Notes |
|-------|------|-------|
| `stripe_customer_id` | text, nullable | Clients who pay more than once |
| `stripe_account_id` | text, nullable | Express account id (`acct_…`) — builders |
| `stripe_onboarding_complete` | boolean, default false | Derived from Account Link return + webhooks |
| `stripe_charges_enabled` | boolean, default false | Mirror Stripe account flags |
| `stripe_payouts_enabled` | boolean, default false | Mirror Stripe account flags |
| `stripe_details_submitted` | boolean, default false | Onboarding progress |
| `payout_country` | text, nullable | ISO-2 from Connect onboarding (e.g. `US`, `IL`) |

### `payments` (extend existing insert shape)

Already used: `user_id`, `request_id`, `quote_id`, `amount_cents`, `platform_fee_cents`, `builder_payout_cents`, `status`.

Add:

| Field | Type | Notes |
|-------|------|-------|
| `currency` | text, default `'usd'` | |
| `status` | text | Enum below |
| `fee_percent` | numeric | Snapshot of `ORVO_FEE_PERCENT` at pay time |
| `stripe_checkout_session_id` | text, nullable | |
| `stripe_payment_intent_id` | text, nullable | |
| `stripe_charge_id` | text, nullable | Needed for `source_transaction` |
| `stripe_transfer_id` | text, nullable | Set on release |
| `stripe_transfer_group` | text | e.g. `orvo_pay_<payment_uuid>` |
| `stripe_application_fee_cents` | int, default 0 | If you later move fee collection onto Transfer; MVP can leave 0 and keep fee as retained balance |
| `held_at` | timestamptz | When PI succeeded |
| `released_at` | timestamptz | When Transfer created |
| `refunded_at` | timestamptz | |
| `dispute_opened_at` | timestamptz | Platform dispute (not only Stripe chargeback) |
| `builder_id` | uuid | Denormalize from quote for RLS / payout |
| `connected_account_id` | text | Snapshot of builder `acct_` at pay/release |

**`payments.status` enum (MVP):**

`created` → `checkout_open` → `held` → `released`  
side paths: `refunded` | `partially_refunded` | `disputed` | `failed` | `canceled`

Deprecate loose use of `pending` / `paid` for Stripe-backed rows (keep mapping for any legacy manual rows).

### `quotes`

| Field | Type | Notes |
|-------|------|-------|
| `status` | text | Keep: `pending` \| `accepted` \| `paid` \| `rejected` — only mark `paid` after webhook `held` |
| (optional) `accepted_at` | timestamptz | |

### `requests`

| Field | Type | Notes |
|-------|------|-------|
| `status` | text | `open` → `awaiting_payment` (optional) → `funded` → `delivered` → `completed` / `disputed` |
| `assigned_builder_id` | uuid | Already used |
| `delivered_at` | timestamptz | Builder marks done |
| `completed_at` | timestamptz | After release |

Suggested status meaning:

- `funded` — money **held** on platform (work can proceed)
- `delivered` — builder claims done; waiting for client release
- `completed` — transfer sent
- `disputed` — hold frozen pending admin

### `disputes` (new)

| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid PK | |
| `payment_id` | uuid FK | |
| `request_id` | uuid FK | |
| `opened_by` | uuid | client user id |
| `reason` | text | short code: `not_delivered`, `not_as_described`, `other` |
| `details` | text | |
| `status` | text | `open` \| `resolved_refund_client` \| `resolved_pay_builder` \| `resolved_split` |
| `resolution_note` | text | admin |
| `resolved_by` | uuid | admin |
| `resolved_at` | timestamptz | |
| `stripe_dispute_id` | text, nullable | If card chargeback (`dp_…`) — separate from ORVO dispute |

### `stripe_webhook_events` (new, idempotency)

| Field | Type | Notes |
|-------|------|-------|
| `id` | text PK | Stripe event id `evt_…` |
| `type` | text | |
| `processed_at` | timestamptz | |

### Config

- Keep `ORVO_FEE_PERCENT` in `supabase-config.js` for display; **authoritative fee** must live in Edge Function env (`ORVO_FEE_PERCENT`) so clients cannot tamper.
- Remove reliance on `STRIPE_PAYMENT_LINK` (delete or ignore).

---

## 4. Step-by-step implementation plan (MVP this week)

### Day 1 — Platform & schema

1. Create Stripe account under a **supported platform country** (US / UK / EEA / CA / CH). Israeli founders typically need a foreign entity (e.g. US LLC + US bank) — Stripe still does not offer full local IL merchant onboarding for the platform itself.
2. Enable **Connect** → Express; enable countries builders will use (include **IL** if paying Israeli builders via cross-border / Express availability for your platform).
3. Add env secrets to Supabase: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ORVO_FEE_PERCENT=12`, `SITE_URL`.
4. Migrate tables/columns above; RLS: clients read own payments; builders read payouts for their jobs; only service role writes Stripe IDs.

### Day 2 — Builder onboarding

5. Edge Function `stripe-connect-onboard`: create Express Account (`type: express`, set `country` or let onboard choose where allowed), Account Link, return URL → Profile “Get paid” button.
6. Webhook `account.updated` → sync `stripe_*` flags on `profiles`.
7. Block “Accept & pay” if assigned builder lacks `stripe_account_id` (or allow pay but block release until onboarded — prefer block-at-pay for fewer stuck holds).

### Day 3 — Checkout (replace Payment Link)

8. Replace `acceptQuote` Stripe branch:
   - Update quote → `accepted`, request → `awaiting_payment` (or keep `in_progress` only after `held`).
   - Call Edge Function `create-checkout-session` with `{ quote_id }`.
   - Server recomputes fee; inserts `payments` row `status=checkout_open` with metadata.
   - Redirect to `session.url` (same tab, not a shared Payment Link).
9. Checkout Session (separate charges — **no** `transfer_data`):

```js
// conceptual
await stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: [{
    price_data: {
      currency: 'usd',
      unit_amount: amount_cents,
      product_data: { name: `ORVO: ${request.title}` },
    },
    quantity: 1,
  }],
  payment_intent_data: {
    transfer_group: `orvo_pay_${payment.id}`,
    metadata: { payment_id, quote_id, request_id, builder_id },
  },
  success_url: `${SITE_URL}/?paid={CHECKOUT_SESSION_ID}`,
  cancel_url: `${SITE_URL}/?pay_canceled=1`,
  metadata: { payment_id, quote_id, request_id },
});
```

10. Webhooks: `checkout.session.completed`, `payment_intent.succeeded` → set `held`, store PI + charge id, `requests.status=funded`, `quotes.status=paid`. Idempotent via `stripe_webhook_events`.

### Day 4 — Release + minimal dispute

11. UI: Builder “Mark delivered” → `requests.status=delivered`.
12. UI: Client “Release payment” → Edge Function `release-payment`:
    - Verify caller + status `held` + not disputed.
    - `stripe.transfers.create({ amount: builder_payout_cents, currency: 'usd', destination: acct, source_transaction: charge_id, transfer_group })`.
    - Mark `released` / `completed`.
13. UI: Client “Open dispute” within N days of delivery (e.g. 7) → `disputed`, freeze release; admin email/dashboard resolves with full refund / full release / (later) split.
14. Handle Stripe `charge.dispute.created` → flag payment, notify admin (card network dispute ≠ in-app dispute).

### Day 5 — Hardening

15. Test mode: full path pay → hold → release; cancel checkout; dispute; refund.
16. Remove/ignore `STRIPE_PAYMENT_LINK`; set `ORVO_FEE_PERCENT` display to match server.
17. Ops: Stripe Radar defaults on; statement descriptor `ORVO`; support email for disputes.

**Out of scope this week:** milestones, partial releases, ILS Checkout, auto-release timers (add 7–14 day auto-release later), funds segregation preview.

---

## 5. UX copy (pay / release / dispute)

### Pay — Accept & pay (client)

**Title:** Pay securely through ORVO  
**Body:** You’ll pay **{amount}** now. ORVO holds the funds until you approve the finished agent. The builder is paid only after you release payment.  
**Fee line (if fee > 0):** Includes ORVO service fee ({fee}%). Builder receives {payout} when you approve.  
**Primary CTA:** Continue to Stripe  
**Secondary:** Cancel  
**Success toast:** Payment received — funds are held. You can share full project links in chat now.  
**Cancel toast:** Payment canceled. Your quote is still accepted — try again when ready.

### Builder — Connect payouts

**Title:** Connect payouts  
**Body:** Add your bank details with Stripe so ORVO can pay you when the client approves the work.  
**CTA:** Set up with Stripe  
**Incomplete:** Finish payout setup before clients can fund your quotes.

### Builder — Mark delivered

**Title:** Mark as delivered  
**Body:** Confirm the agent is ready for the client to review. They’ll release payment when they’re satisfied.  
**CTA:** Mark delivered

### Release — Client

**Title:** Release payment  
**Body:** You’re about to release **{payout}** to {builder_name}. This can’t be undone. Only release after you’ve checked the delivery.  
**Primary CTA:** Release payment  
**Secondary:** Not yet  
**Success:** Payment released. Thanks for building with ORVO.

### Dispute — Client

**Title:** Open a dispute  
**Body:** Funds stay held while ORVO reviews. Describe what’s missing or incorrect. Don’t share payment details off-platform.  
**Reasons:** Not delivered / Not as described / Other  
**CTA:** Submit dispute  
**Confirmation:** Dispute opened. We paused payout. We’ll email both sides within 2 business days.

### Admin — Resolve

**Options:** Refund client in full · Pay builder in full · (Later: split)  
**Note field required.**

### Trust microcopy (landing / chat)

- “Pay through ORVO — funds held until you approve.”  
- “Builders get paid when the job is done — not before.”

Avoid the word **escrow** in customer-facing UI unless legal signed off.

---

## 6. Fee recommendation (early marketplace)

**Recommend: `ORVO_FEE_PERCENT = 12`**, taken from the quote (client pays quote price; builder net = 88%).

| Option | When |
|--------|------|
| **12% (recommended)** | Early liquidity; below Fiverr’s ~20% seller take; near Upwork’s common band; enough to cover Stripe (~2.9% + $0.30), IL cross-border (~0.5% if applicable), dispute labor, and margin |
| 10% | Acquisition promo for first 20 jobs — then step to 12% |
| 15% | After proven demand / waitlist; don’t start here cold |
| 0% (current) | OK only for closed beta; switch on before public GTM |

**Fee presentation:** Quote amount is what the **client pays**. Show builder the net on quote send and on release. Do **not** add a surprise buyer surcharge in MVP (keeps Checkout = quote amount).

**Who pays Stripe processing?** Platform balance (standard for separate charges). Price the 12% so that after Stripe fees you still clear ~8–9% contribution on average ticket sizes.

**Example:** Quote $1,000 → client pays $1,000 → fee $120 → builder transfer $880 → Stripe ~$29 from platform → ORVO net ~$91.

---

## Israel / IL considerations

| Topic | Guidance |
|-------|----------|
| **Platform entity** | Stripe Connect platforms must be in a supported country (US, UK, EEA, CA, CH, …). An IL-only company generally **cannot** be the Stripe platform merchant; founders usually operate via a foreign entity. |
| **IL builders as Express / payouts** | IL appears in Stripe’s connected-account / payout country lists; often via **cross-border payouts**. Expect extra XB fee (~0.50% to IL on some Global/XB price lists) and IBAN bank details. Confirm in Dashboard which Connect countries your platform can onboard. |
| **Funds flows** | For cross-border, Stripe docs require **destination charges or separate charges & transfers without `on_behalf_of`** — our recommended path already avoids `on_behalf_of`. |
| **Currency** | MVP stick to **USD** Checkout. Offer ILS later (FX + local expectations). Chat already mentions ₪ in filters — product can stay USD-priced. |
| **Local alternatives** | If many clients insist on Israeli cards/invoices without a foreign entity, evaluate Tranzila / Cardcom / Grow / PayPlus **later** as a parallel rail — not instead of Connect for global builders. |
| **Compliance** | Hebrew invoices (חשבונית), VAT, and Bank of Israel payment-services rules are **ops/legal**, not Stripe config. Don’t promise tax invoices from Stripe alone. |

---

## Mapping back to `app.js`

| Today | Tomorrow |
|-------|----------|
| `confirm()` + optional Payment Link | Modal with copy above → Edge Function → Checkout redirect |
| `status: stripeLink ? 'pending' : 'paid'` | `checkout_open` then webhook → `held` |
| Immediate `funded` on manual path | `funded` only after PI succeeded |
| No release UI | Client release → Transfer |
| Fee display only if `FEE() > 0` | Always show fee once set to 12 |

---

## Decision lock

**Use:** Connect Express + separate charges & transfers + Checkout Sessions + hold-until-release + 12% fee.  
**Kill:** `STRIPE_PAYMENT_LINK`, destination charges for job payments, authorize-only capture for long builds.

Coordinate with Role 13 (Trust & Disputes) on dispute SLAs and Role 14 (Schema) on the column list above.

# 15 — Metrics & Analytics

**Role:** Product metrics  
**Sources:** `app.js` flows, `sql/001_mvp_schema.sql` event surfaces  
**Date:** 2026-08-23

---

## Verdict

ORVO’s north star is **completed escrowed jobs** (client paid → builder delivered → client released). Everything else is a funnel into that. Instrument **product events** in the client first (lightweight), then mirror critical money events from Stripe webhooks + SQL when payments leave the browser.

---

## North star

| Metric | Definition | Why |
|--------|------------|-----|
| **NS: Completed funded jobs / week** | Count of `requests` where `status` became `completed` **and** linked `payments.status = 'released'` in the period | Proves marketplace value: money moved under ORVO escrow promise |

### Guardrail metrics (do not optimize NS alone)

| Guardrail | Definition | Alert if |
|-----------|------------|----------|
| Chargeback / refund rate | `payments` → `refunded` / funded | Rising after Stripe live |
| Off-platform block rate | Chat validation failures / messages attempted | Spike = UX confusion or evasion surge |
| Time-to-admin-review | `builder_applications.reviewed_at − created_at` | p50 > 48h (product copy promise) |
| Builder approval rate | approved / (approved+rejected) trailing 30d | Collapse = supply dry-up or bar too high |

### Supporting product KPIs

| KPI | Formula (SQL-friendly) |
|-----|------------------------|
| Liquidity | open requests with ≥1 quote / open requests |
| Quote→accept | quotes `accepted`+`paid` / quotes created |
| Accept→fund | payments `paid`\|`held` / quotes accepted |
| Fund→complete | requests completed / requests funded |
| GMV | sum `payments.amount_cents` where status in (`paid`,`held`,`released`) |
| Net revenue | sum `platform_fee_cents` on `released` (or `held` once Stripe) |
| Active builders | distinct `builder_id` with quote or message in 30d |
| Active clients | distinct `user_id` with request in 30d |

---

## Funnels

### A — Client acquisition → first post

```
land (marketing / home)
  → signup_intent=client | login
  → auth_success
  → request_posted          -- doPost
  → request_opened_chat     -- go('chat')
  → quote_received          -- first quotes row for request
  → quote_accepted          -- acceptQuote start
  → payment_recorded        -- payments insert (manual or Stripe)
  → delivery_marked         -- status delivered
  → payment_released        -- completed + released
```

**Primary conversion:** `auth_success (client)` → `request_posted` → `payment_released`  
**Drop-off to watch:** post→quote (supply), accept→pay (trust/Stripe), fund→release (delivery quality).

### B — Builder acquisition → first paid job

```
land
  → signup_intent=builder | apply CTA
  → auth_success
  → builder_application_submitted
  → builder_approved | builder_rejected
  → job_viewed (browse open)
  → quote_sent
  → quote_accepted (as assignee)
  → delivery_marked
  → payout_released
```

**Primary conversion:** `builder_application_submitted` → `builder_approved` → `quote_sent` → `payout_released`

### C — Admin ops

```
builder_application_submitted
  → admin_badge_seen / admin_review_opened
  → builder_approved | builder_rejected
```

Track review latency; not a growth funnel but a bottleneck for Funnel B.

### Funnel stage ownership (data)

| Stage | Source of truth |
|-------|-----------------|
| Auth / intent | Client events + `auth.users` |
| Requests / quotes / messages | Tables in `001` |
| Applications / approve | `builder_applications` + `profiles.builder_status` |
| Money | `payments` (+ Stripe webhooks later) |
| Chat policy blocks | Client-only until Edge moderation |

---

## Event catalog

Name events in `snake_case`. Properties below are minimum; always attach `user_id`, `role` (`client|builder|admin|pending`), `timestamp`.

### Auth & navigation

| Event | When (app.js) | Props |
|-------|---------------|-------|
| `session_boot` | `boot()` success | `has_session` |
| `boot_error` | `bootErr` | `message` (sanitized) |
| `auth_signup_success` | `doSignup` session | `intent` |
| `auth_signup_confirm_required` | signup without session | `intent` |
| `auth_login_success` | `doLogin` | |
| `auth_login_fail` | catch | `reason` class only |
| `auth_logout` | `doLogout` | |
| `dashboard_open` | `openDash` | `default_view` |
| `view_change` | `go(v)` | `view`, `request_id?` |

### Client

| Event | When | Props |
|-------|------|-------|
| `request_post_click` | open post modal | |
| `request_posted` | `doPost` ok | `request_id`, `category`, `has_budget` |
| `request_post_fail` | catch | `error_code` |
| `quote_accept_click` | Accept & pay | `quote_id`, `request_id`, `amount_cents` |
| `payment_manual_recorded` | accept path no Stripe | `payment` fields |
| `payment_stripe_redirect` | `STRIPE_PAYMENT_LINK` open | `quote_id` |
| `delivery_release_click` | `releasePayment` | `request_id` |
| `payment_released` | update ok | `request_id` |

### Builder

| Event | When | Props |
|-------|------|-------|
| `builder_apply_submit` | `doApply` ok | `skills_count`, `has_portfolio`, `has_linkedin`, `experience_years` |
| `builder_apply_fail` | catch | |
| `jobs_list_view` | `loadJobs` | `open_count` |
| `quote_sent` | `doQuote` ok | `request_id`, `amount_cents` |
| `delivery_marked` | `markDelivered` | `request_id` |

### Admin

| Event | When | Props |
|-------|------|-------|
| `admin_review_open` | `loadAdmin` | `pending_count` |
| `builder_approved` | `approveBuilder` | `builder_id` |
| `builder_rejected` | `rejectBuilder` | `builder_id` |

### Chat / trust

| Event | When | Props |
|-------|------|-------|
| `chat_open` | `loadChat` | `request_id`, `request_status` |
| `chat_message_sent` | `sendMsg` ok | `request_id`, `len` |
| `chat_message_blocked` | `validateChatMessage` fail | `request_id`, `reason` (`email|phone|off_platform|link_phase`) |
| `chat_message_fail_rls` | RLS error path | `request_id` |

### Derived (warehouse / SQL — no client emit required)

| Derived | SQL sketch |
|---------|------------|
| `funnel_client_ns` | requests joined payments by week |
| `time_to_first_quote` | min(quote.created_at) − request.created_at |
| `time_to_fund` | payment.created_at − request.created_at |
| `time_to_complete` | request updated to completed − funded |

---

## Instrumentation plan (vanilla, low friction)

### Phase 0 — Console / stub (same PR as modularize Phase 0)

```js
// js/analytics.js
export function track(event, props = {}) {
  const payload = { event, ...props, ts: Date.now() };
  if (window.ORVO_DEBUG_ANALYTICS) console.info('[orvo]', payload);
  window.ORVO_ANALYTICS?.track?.(event, props); // Plausible/PostHog/GA later
}
```

Call sites: wrap existing success/fail paths listed above — **do not** block UX on analytics errors.

### Phase 1 — Product analytics SaaS

Pick one:

| Option | Fit |
|--------|-----|
| **PostHog** (or Mixpanel) | Funnels + session replay for chat friction |
| **Plausible** | Privacy-light page + custom events only |

Store keys in `supabase-config.js` as `ORVO_ANALYTICS_*` (public write keys only).

### Phase 2 — Server truth for money

- Stripe webhook Edge Function emits `payment_held`, `payment_failed`, `transfer_released`  
- Never trust browser alone for GMV / revenue dashboards  

### Phase 3 — Ops dashboard

Supabase SQL views or Metabase:

- Pending applications count (already in admin badge)  
- Open jobs without quotes (>48h)  
- Funded jobs without delivery (>7d)  
- Delivered awaiting release (>3d)  

---

## Dashboard v1 (what founder opens weekly)

1. **NS:** completed+released jobs (7d / 30d)  
2. Client funnel: signup → post → funded → released  
3. Builder funnel: apply → approve → quote → released  
4. Supply: open jobs, approved builders, quotes/job  
5. Trust: chat blocks by reason; refunds when live  

---

## Anti-metrics (ignore for now)

- Raw pageviews as success  
- “Messages sent” as engagement without deal context  
- Signup count without `intent` split  
- GMV on `pending` payments  

---

## Acceptance

- [ ] `track()` stub wired on auth, post, quote, accept, apply, approve, chat block  
- [ ] One weekly SQL (or table) answering: “How many escrow completions last 7 days?”  
- [ ] Funnels A and B documented in this file stay the product language for GTM (roles 08/11/12)  

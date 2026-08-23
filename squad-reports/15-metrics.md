# 15 — Metrics

**Role:** Metrics  
**Product:** ORVO — client posts → vetted builders quote → chat & pay on-platform  
**Instrumentation target:** `analytics_events` (see `14-schema.md`) + Stripe + admin SQL views

---

## 1. North star

**Primary north star:** **Funded projects per week**  
Definition: count of distinct `payments` that reach status `held` (client money in escrow) in the week (UTC).

Why this metric:
- Proves both sides of the marketplace worked (request + approved builder + quote + trust to pay).
- Leads revenue (`sum(platform_fee_cents)` on later `released`).
- Harder to game than signups or pageviews.

**Guardrail north stars (always read with primary):**

| Guardrail | Definition | Red flag |
|-----------|------------|----------|
| **Release rate** | `released` / `held` within 30 days | < 70% → delivery/trust broken |
| **Dispute rate** | disputes opened / held payments | > 8% → quality or scope issues |
| **Take-home GMV** | sum `amount_cents` where status ∈ (`held`,`released`) | flat while signups rise → fake demand |

**Secondary business metric:** **Net platform revenue / week** = sum `platform_fee_cents` where payment `released` that week.

---

## 2. Funnel metrics

### A. Client acquisition → first fund

| Step | Event / SQL | Conversion |
|------|-------------|------------|
| 1 Land | `page_view` (landing) | — |
| 2 Signup intent client | `signup_start` `{intent:client}` | land → start |
| 3 Account created | `signup_complete` | start → complete |
| 4 First request posted | `request_created` | complete → post |
| 5 First quote received | `quote_received` (client-side on load) | post → quote |
| 6 Accept & pay started | `checkout_started` | quote → checkout |
| 7 Escrow held | `payment_held` | checkout → held |
| 8 Delivery approved / auto-release | `payment_released` | held → released |
| 9 Review submitted | `review_submitted` | released → review |

**MVP client funnel KPIs (weekly):**
- Signup → first request: target ≥ 40%
- Request → ≥1 quote within 72h: target ≥ 50% (liquidity)
- Quote → held: target ≥ 25%
- Held → released ≤14d: target ≥ 80%

### B. Builder acquisition → first payout

| Step | Event |
|------|--------|
| 1 Builder CTA | `signup_start` `{intent:builder}` |
| 2 Application submit | `builder_apply_submitted` |
| 3 Approved | `builder_approved` |
| 4 First quote sent | `quote_sent` |
| 5 Quote accepted | `quote_accepted` |
| 6 First held job | `builder_first_funded` |
| 7 First release | `builder_first_payout` |

**Builder KPIs:**
- Apply → approve (7d): track median time + rate
- Approve → first quote (7d): ≥ 60%
- Quote → accept: ≥ 15% (early market)
- Funded → payout: ≥ 85%

### C. Trust / chat funnel (leakage)

| Metric | Definition |
|--------|------------|
| Moderation block rate | `chat_moderation_events` / messages attempted |
| Off-platform intent density | blocks per funded request |
| Pre-fund link blocks | blocks where request not yet `funded` |

Rising block rate with flat held payments → filter noise. Rising blocks + falling held → leakage pressure.

---

## 3. Admin dashboard KPIs

Group for a single **Ops** screen (alongside Review builders).

### Liquidity
| KPI | Query sketch |
|-----|----------------|
| Open requests | `count(*) from requests where status = 'open'` |
| Pending builder apps | `count(*) from builder_applications where status = 'pending'` |
| Approved builders (active 14d) | approved profiles with quote or message in 14d |
| Quotes per open request (7d) | avg quotes on requests created last 7d |
| Time-to-first-quote (p50) | median hours open → first quote |

### Money
| KPI | Definition |
|-----|------------|
| GMV held (MTD) | sum amount_cents where held_at in month |
| GMV released (MTD) | sum where released_at in month |
| Fees accrued / collected | fee on held vs released |
| Pending payouts | held, not released, no open dispute |
| Auto-release due ≤24h | `auto_release_at < now() + 24h` |

### Trust
| KPI | Definition |
|-----|------------|
| Open disputes | status in (`open`,`under_review`) |
| Dispute age p50/p90 | hours since created_at |
| Avg builder rating (30d) | from reviews |
| Chat blocks (24h) | moderation events |
| Trust holds | `profiles.trust_hold = true` |

### Quality / SLA
| KPI | Target |
|-----|--------|
| Application review lag | p50 < 24h, p90 < 48h |
| Dispute resolve lag | p50 < 72h |
| Stuck funded (>14d, not delivered) | count → intervene |

### Suggested admin tiles (8)
1. Funded this week (north star)  
2. Pending applications  
3. Open disputes  
4. GMV held  
5. Release rate 30d  
6. Open requests w/ 0 quotes  
7. Chat blocks 24h  
8. Fee revenue MTD  

---

## 4. Event tracking plan

### Principles
- Emit from client for UX funnels; **confirm money events from server/webhook** (`payment_held`, `payment_released`).
- `event_name` snake_case; `properties` JSON; always include `request_id` / `quote_id` / `payment_id` when relevant.
- Do not put PII in properties (no message bodies, emails). Use ids + hashed moderation snippets server-side only.
- Idempotency: payment events keyed by `payment_id` + status (dedupe in warehouse later).

### Event catalog

| event_name | When | properties |
|------------|------|------------|
| `page_view` | Landing / key pages | `path`, `referrer` |
| `cta_click` | Hero / nav CTAs | `cta` (`client_start`\|`builder_start`\|`post`) |
| `signup_start` | Auth signup tab | `intent` |
| `signup_complete` | Session after signup | `intent` |
| `login` | Successful login | — |
| `request_created` | After insert requests | `request_id`, `category` |
| `request_opened_chat` | Client opens chat | `request_id` |
| `builder_apply_submitted` | Application upsert | `application_id` |
| `builder_approved` | Admin approve | `builder_id` |
| `builder_rejected` | Admin reject | `builder_id` |
| `jobs_viewed` | Builder loads open jobs | `count` |
| `quote_sent` | Quote insert | `quote_id`, `request_id`, `amount_cents` |
| `quote_received` | Client sees new quote | `quote_id`, `request_id` |
| `checkout_started` | Accept & pay confirm | `quote_id`, `request_id`, `amount_cents` |
| `payment_pending` | payments insert pending | `payment_id` |
| `payment_held` | Webhook/admin → held | `payment_id`, `amount_cents` |
| `payment_released` | Release | `payment_id`, `fee_cents` |
| `payment_refunded` | Refund | `payment_id` |
| `delivery_submitted` | deliveries insert | `request_id` |
| `delivery_approved` | Client approve | `request_id` |
| `auto_release_fired` | Cron/job | `request_id`, `payment_id` |
| `dispute_opened` | Dispute create | `dispute_id`, `reason` |
| `dispute_resolved` | Admin resolve | `dispute_id`, `outcome` |
| `review_submitted` | Review create | `rating`, `builder_id` |
| `chat_message_sent` | Message insert ok | `request_id`, `request_status` |
| `chat_message_blocked` | Filter/trigger reject | `request_id`, `reason` |
| `trust_hold_set` | Admin | `user_id` |

### Client helper (suggested)

```js
async function track(event_name, properties = {}) {
  if (!db || !user) return;
  await db.from('analytics_events').insert({
    user_id: user.id,
    event_name,
    properties,
  });
}
```

Wire at: signup, `doPost`, `doQuote`, `doApply`, `acceptQuote`, `approveBuilder`, `sendMsg` (success/fail), delivery/dispute/review when built.

### Server / SQL rollups (views for admin)

```sql
-- Example: weekly north star
create or replace view public.metrics_funded_weekly as
select
  date_trunc('week', coalesce(held_at, created_at)) as week,
  count(*) as funded_count,
  sum(amount_cents) as gmv_cents,
  sum(platform_fee_cents) as fees_cents
from public.payments
where status in ('held', 'released', 'refunded')
  and coalesce(held_at, created_at) is not null
group by 1
order by 1 desc;
```

(Restrict view to admin via `security_invoker` + RLS on underlying table, or query only with service role.)

### External tools (optional)
- **PostHog / Plausible** for landing funnels (`page_view`, `cta_click`) without auth.
- **Stripe Dashboard** as source of truth for cash movement; reconcile weekly vs `payments`.

---

## 5. Reporting cadence

| Cadence | Audience | Content |
|---------|----------|---------|
| Daily | Admin | Pending apps, open disputes, blocks 24h, stuck funded |
| Weekly | Founder | North star, funnel conversion, GMV, release/dispute rates |
| Monthly | Strategy | Cohort: signup week → % funded; builder quality by rating |

---

## 6. Instrumentation priority (ship order)

1. `request_created`, `quote_sent`, `checkout_started`, `payment_held`, `payment_released`  
2. Builder apply/approve events  
3. `chat_message_blocked` + admin tile  
4. Dispute/review events  
5. Landing `cta_click` / `page_view`  

Without (1), do not trust any growth narrative.

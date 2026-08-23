# 06 — Marketplace Liquidity (Cold Start)

**Verdict:** Seed the *builder* side hard, constrain supply to one category, run human concierge matching until organic density exists. Do **not** fake a full marketplace with synthetic listings.

---

## Chicken-egg answer (pick a side)

**Winner: seed builders first, then manufacture demand.**

| Side | Why this order |
|------|----------------|
| **Builders first** | Empty job board kills builder trust once; empty builder roster kills clients forever. Clients forgive “we’ll match you in 24h.” Builders leave if they open Jobs and see nothing *and* get no intros. |
| **Demand second** | Demand is bought/concierged cheaper when you can promise “2–3 vetted quotes in 48h.” That promise requires a warm bench of 8–15 approved builders in-category. |

**Rule:** Never open public browse-jobs until ≥8 approved builders can quote WhatsApp/SMB agent work in ≤48h.

---

## Category constraint (non-negotiable)

**Only category for cold start:**

> **WhatsApp AI agents for Israeli SMBs**  
> (orders, bookings, FAQ, lead capture, kitchen/staff alerts — Hebrew-first)

**Allow (v1):**
- WhatsApp Business / Cloud API agents
- Hebrew (primary) + English (secondary)
- SMB verticals: restaurants, clinics, salons, local retail, service pros, small e‑commerce

**Hard reject (v1):**
- Generic “build me a RAG / LangChain app”
- Voice agents, Slack bots, internal ops agents
- Full SaaS product builds, mobile apps, ML research
- “Anything AI” freelancing

**Why constrain:** Liquidity is density in one demand curve, not breadth. One category → same builder skills → same client language → reusable templates → faster quotes → first 20 closed deals.

Post-category UI copy: *“ORVO currently matches WhatsApp AI agents for Israeli businesses. Other agent types coming later.”*

---

## Seed builders plan

### Target bench (day 0 → day 14)

| Tier | Count | Profile |
|------|-------|---------|
| **Core** | 5 | Proven WhatsApp/n8n/Make + Meta API; Hebrew; can demo live |
| **Capable** | 5–8 | Strong automation/LLM; willing to specialize WhatsApp Israel |
| **Bench** | 3–5 | Pending / junior; shadow quotes only until first delivery |

**Cap public approved builders at ~15** until first 20 txns. Over-supply → zero jobs per builder → churn.

### Where to recruit (in order)

1. Personal network + Israeli automation Discord/Telegram/WhatsApp groups  
2. n8n / Make / WhatsApp BSP freelancer circles (IL + remote Hebrew speakers)  
3. Past agency freelancers who already ship restaurant/clinic bots  
4. Selective LinkedIn: “WhatsApp Business API” + Israel + Hebrew  

**Do not** mass-invite Upwork generalists. Quality floor > headcount.

### Vetting bar (pass/fail)

Approve only if **all** true:
1. Portfolio or Loom of a real WhatsApp (or close cousin) conversational agent  
2. Can explain Meta WA Cloud API + template messages + Hebrew edge cases in 10 min  
3. Will quote in ILS or USD with clear scope (MVP vs ongoing)  
4. Accepts ORVO chat + payment rules (no off-platform WhatsApp pay)  
5. Response SLA: first quote within 24h of match  

**Application ask:** 2 past projects + preferred verticals + sample quote for “restaurant order bot.” Reject vague “AI expert” bios.

### Seed economics

- **Founding builder rate:** 10% platform fee (vs standard later, e.g. 15%) for first 5 completed jobs  
- **Priority match:** Core tier gets first look on concierge deals  
- **No retainer to sit idle** — pay for outcomes (bonus on first closed deal OK: ₪200–500 / $50–150)

---

## Concierge matching (human liquidity engine)

Until organic density, **ORVO is a concierge desk wearing a marketplace UI.**

### Operating mode

1. Client posts (or DM / form / WhatsApp to ORVO ops)  
2. Ops triages in &lt;4 business hours: in-category? budget? Hebrew?  
3. Ops manually pings **2–3** best builders (not broadcast to all)  
4. Builders quote on-platform within 24–48h  
5. Client accepts → pay through ORVO → delivery  

**Promise to clients:** *“2–3 vetted WhatsApp-agent builders will quote within 48 hours.”*  
**Promise to builders:** *“We only ping you on fits. No spray-and-pray job spam.”*

### Concierge channels (demand intake)

- Owner/network WhatsApp + LinkedIn DMs  
- Soft launch landing: “Post a request” + Hebrew option  
- Partner intros: accountants, SMB marketers, Meta BSP account managers  
- One vertical pilot (e.g. restaurants in Tel Aviv / center) via warm intros  

### Ops cadence (until txn #20)

| Cadence | Action |
|---------|--------|
| Daily | Triage new posts; chase slow quotes; unblock chat |
| 2×/week | Builder stand-up (async): open jobs, stuck deals |
| Weekly | Kill stale posts &gt;14d with no quote; re-seed demand |

**Staffing:** one founder/ops person is enough for first 20 deals. Do not hire CS yet.

---

## Synthetic supply — risks & rules

| Synthetic tactic | Risk | Rule |
|------------------|------|------|
| Fake builder profiles | Discovery → trust collapse; legal/reputation | **Forbidden** |
| Fake open jobs to attract builders | Builders quote ghosts → churn | **Forbidden** |
| “Demo” listings on landing only | OK if labeled Example | **Allowed** — keep current hero example style |
| Founder-as-builder quotes | Conflict if undisclosed | **Allowed** only if labeled ORVO staff / clear disclosure |
| Seed deals with friends at real prices | Distorts metrics if unpaid | **Allowed** if paid through Stripe on-platform |
| Inflated review counts | Same as fake profiles | **Forbidden** until real completions |

**Honest empty states beat fake density.** Prefer: *“We’re matching you with 2 builders now”* over a ghost job board.

**Allowed “synthetic” only as process:** ops-created *structured* requests from real warm leads (not invented companies).

---

## First 20 transactions playbook

### Definition of a transaction

Client **pays through ORVO** (Stripe) for an accepted quote on a WhatsApp/SMB agent job. Chat-only or offline cash = **does not count**.

### Deal design (make #1–20 closable)

| Attribute | Target |
|-----------|--------|
| Scope | Single MVP agent (1 channel: WhatsApp), 1–2 week delivery |
| Price band | ₪3,500–₪12,000 / ~$900–$3,200 (align with IL custom-bot market) |
| Vertical mix | Aim 8+ restaurants/food, 4 clinics/salons, 4 retail/services, 4 other SMB |
| Geography | Israel first; Hebrew client or Hebrew end-users |
| Success | Bot live on WA + client confirms handoff |

### Sequence

| Txns | Focus |
|------|--------|
| **1–3** | Founder-sourced warm clients + Core builders. Over-serve. Case study rights. |
| **4–8** | Same vertical repeat (restaurants). Reuse scopes/templates. Prove 48h quote SLA. |
| **9–14** | Expand to clinics/salons. Onboard 3 more Capable builders if response lag. |
| **15–20** | Reduce concierge intensity: allow limited open browse for approved builders only. Capture reviews + 3 public case studies. |

### Per-deal checklist

1. Scope locked in chat (in/out) before pay  
2. Milestone: 50% on accept / 50% on go-live *or* full escrow release on delivery (pick one; stay consistent)  
3. Demo link or WA sandbox shared pre-release  
4. Client review solicited within 48h of release  
5. Builder tagged with vertical specialty for next match  

### Kill criteria (pause GTM, fix liquidity)

- &lt;50% of concierge matches get ≥2 quotes in 48h  
- &gt;30% builders go dark after approval  
- &gt;2 disputes in first 10 paid jobs  
- Clients repeatedly ask for out-of-category work → messaging drift; tighten landing, don’t expand category yet  

### Success criteria at txn #20

- ≥8 builders with ≥1 completed paid job  
- Median time post → first quote ≤24h  
- ≥60% paid jobs leave a review  
- 3 sharable case studies (restaurant + clinic + other)  
- Ready to loosen concierge → light self-serve browse **inside the same category only**

---

## Liquidity north stars (early)

1. **Quote coverage rate:** % of in-category posts with ≥2 quotes in 48h  
2. **Paid conversion:** accepted quote → Stripe pay  
3. **Builder utilization:** paid jobs / active builder / month (aim 1–2, not 0)  
4. **Concierge hours per closed deal** (should fall from #1→#20)

---

## Decisions locked

| Decision | Winner |
|----------|--------|
| Supply vs demand first | **Builders first** (bench of 8–15) |
| Category | **Israel WhatsApp / SMB agents only** |
| Matching model | **Concierge until ~20 paid txns** |
| Synthetic supply | **No fake profiles/jobs**; examples + real warm deals only |
| Breadth | **Reject** general AI freelance until liquidity proven |

Hand off to GTM (08) and Israel Market (16): all acquisition copy must reinforce this constraint, not “AI agent marketplace for everything.”

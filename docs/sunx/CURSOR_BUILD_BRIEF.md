# Sunx — Cursor Build Brief (Master Prompt)

> Paste this into Cursor on your machine as the **product + engineering source of truth**.
> Build Sunx as a **public SaaS**: chat → describe agent → permissions questionnaire → pay → system builds & runs the agent → connect APIs with user approval → platform buys/allocates tokens automatically.
> **No code required from the end user.**

---

## 0) How to use this brief in Cursor (your computer)

1. Open a **new empty repo** (or a `sunx/` monorepo folder). Do **not** mix with the ORVO marketing site unless explicitly migrating.
2. Add these files from this PR into that repo:
   - `docs/sunx/CURSOR_BUILD_BRIEF.md` (this file)
   - `docs/sunx/PRD.md`
   - `docs/sunx/DATA_MODEL.md`
   - `docs/sunx/API_CONTRACTS.md`
   - `docs/sunx/BUILD_PHASES.md`
   - `.cursor/skills/**`
   - `.cursor/rules/sunx.mdc`
   - `AGENTS.md`
3. In Cursor chat, start with:

```text
Read AGENTS.md, docs/sunx/CURSOR_BUILD_BRIEF.md, and all docs/sunx/*.md.
Follow .cursor/skills/* and .cursor/rules/sunx.mdc.
Build Phase 0 + Phase 1 only. Do not invent unsupported agent types.
Ship a working vertical slice: signup → chat describe → questionnaire → Stripe test pay → agent draft created → sandbox run.
```

4. After each phase: commit, run tests, update `docs/sunx/BUILD_STATUS.md`.
5. Prefer **skills** when working on billing, connectors, runtime, or chat-builder flows.

---

## 1) Product (plain language first)

**Hebrew product explainer (read this first if confused):** `docs/sunx/PRODUCT_HE.md`

**One-liner:** Sunx is a public website where a normal person (no coding) describes the AI agent they want in chat, answers a permissions questionnaire, pays, and Sunx automatically builds + hosts that agent — including buying/allocating LLM tokens and connecting APIs only after the user approves.

**Promise:** Describe → pay → running agent.  
Not an IDE. Not “bring your own OpenAI key and suffer.” Sunx runs it for them.

**What the customer experiences:**
1. Chat: “Build me a support bot for my shoe store…”
2. Questionnaire: what data it may read/write/send
3. Preview: capabilities + integrations + cost estimate
4. Pay
5. Click-to-connect Shopify/Gmail/etc.
6. Test in playground → go LIVE

**What Sunx is selling:** a finished working agent as a service — not a toolkit for developers.

---

## 2) What Sunx is / is not

### Is
- Chat-first **agent factory** + **hosted runtime**
- Template-constrained builder (support bot, lead qualifier, FAQ, inbox triage, simple CRM actions, webhook automations)
- Billing + token wallet built-in
- OAuth / connector marketplace with explicit user approval
- Multi-tenant SaaS

### Is not (v1)
- Unlimited arbitrary code generation for every crazy agent idea
- Full custom voice realtime lab (voice = later phase, limited template)
- Unrestricted browser RPA / malware-capable agents
- A general coding IDE like Cursor for end users
- “Any ERP, fully custom, zero limits”

**Hard product rule:** If the request is outside the supported capability matrix, Sunx must say so in chat and offer the closest supported template — never fake success.

---

## 3) Primary user journey (must work end-to-end)

```text
1. Land → Sign up (email/Google)
2. Chat: "I need a WhatsApp support agent for my shoe store that answers sizing and creates Shopify refund drafts"
3. Sunx clarifies goals, channels, tone, languages, business hours, escalation
4. Questionnaire: permissions + data access + connectors (Shopify, WhatsApp, email, etc.)
5. Sunx shows Agent Spec preview (tools, memory, channels, limits, monthly token estimate)
6. User pays (subscription and/or credit pack)
7. On payment success webhook → provision tenant agent:
   - create agent record from Spec
   - attach system prompt + tool policies
   - enqueue connector OAuth if needed
   - allocate token budget from wallet
   - deploy to runtime (sandbox first)
8. User approves each connector
9. User tests in playground chat
10. User toggles agent LIVE on chosen channel
11. Usage meters drain wallet; auto top-up optional
```

---

## 4) Supported agent types (v1 capability matrix)

| Template ID | Channel | Tools allowed | Notes |
|---|---|---|---|
| `support_faq` | Web chat, email | KB search, ticket create | Default |
| `lead_qualifier` | Web chat, form webhook | CRM create/update lead | HubSpot/Sheets |
| `inbox_triage` | Email IMAP/Gmail | Label, draft reply, escalate | Human approve drafts |
| `shop_helper` | Web + Shopify | Order lookup, FAQ, refund *draft* | No auto-refund money without flag |
| `webhook_ops` | Incoming webhook | HTTP tools to allowlisted APIs | Strict URL allowlist |
| `internal_qa` | Slack | KB + Notion/Drive search | Read-heavy |

**Reject / defer:** unrestricted code exec, crypto trading, medical diagnosis, unrestricted scraping, “clone Cursor”, full voice call center (Phase 4+).

---

## 5) Recommended stack (and why)

### App shell
- **Next.js 15 (App Router) + TypeScript** — one codebase for marketing, dashboard, chat UI, API routes; great DX in Cursor.
- **React + Tailwind + shadcn/ui** — fast internal UI; keep marketing brand-led (not generic purple SaaS).
- **Zod** — shared validation between chat tool calls, API, DB.

### Backend / data
- **Supabase (Postgres + Auth + Realtime + Storage + Edge Functions)** — auth, RLS multi-tenant, realtime build status, file KB uploads.
  - Why: fastest path to secure multi-tenant SaaS; Cursor already has strong Supabase skills/MCP.
- **Prisma or Drizzle** — typed schema + migrations (pick **Drizzle** if you want SQL-first; **Prisma** if team prefers Prisma).
  - Recommendation: **Drizzle + Supabase Postgres**.

### Agent brain / orchestration
- **Vercel AI SDK** (`ai`) for streaming chat with the *builder* bot and playground.
- **LLM providers via Sunx-managed keys:** OpenAI + Anthropic (abstract behind `LLMRouter`).
- **Agent runtime:** custom job worker (see below) with tool-calling loop, not “prompt only”.
- **LangGraph JS *or* custom state machine** — prefer a **small custom orchestrator** in v1 (easier to reason about, less magic). Add LangGraph later if graphs explode.

### Jobs / runtime
- **Trigger.dev** *or* **Inngest** *or* **BullMQ + Redis** for:
  - agent provision pipeline
  - scheduled agent tasks
  - usage aggregation
  - connector sync
- Recommendation for v1 speed: **Inngest** (serverless-friendly) or **Trigger.dev**.
- Long-running tool loops: worker with hard timeouts + step budgets.

### Billing / tokens
- **Stripe** Checkout + Customer Portal + Webhooks
- Internal **Token Wallet** ledger (not only Stripe metered — you need your own balance for LLM spend)
- Optional: Stripe Credits / metered billing later; v1 = subscription plan + credit packs + auto-top-up

### Connectors
- **Nango** or **Composio** or custom OAuth
  - Recommendation: **Composio** or **Nango** for OAuth token lifecycle; keep a thin `ConnectorAdapter` interface so you can swap.
- Secrets: **Supabase Vault** / encrypted columns (pgsodium) / AWS KMS — never store raw refresh tokens in plain text.

### Observability
- **Sentry** (errors)
- **PostHog** (product analytics)
- **Langfuse** or **Helicone** (LLM traces + cost)

### Hosting
- **Vercel** (Next.js)
- **Supabase** (DB)
- Workers on Trigger/Inngest cloud
- Redis: Upstash if needed

### Why this combo
Fastest Cursor-buildable public MVP with real multi-tenant auth, payments, and a hosted agent loop — without inventing infra from scratch.

---

## 6) High-level architecture

```text
[Clients]
  Marketing site | App (chat builder) | Playground | Admin
        |
        v
[Next.js API / RSC]
  Auth gateway | Builder chat API | Billing | Connectors API
        |                |                  |
        v                v                  v
  Supabase Auth    Spec Compiler      Stripe webhooks
  Postgres+RLS     (LLM -> AgentSpec) Wallet ledger
        |                |                  |
        +--------+-------+--------+---------+
                 |                |
                 v                v
           Provisioner      Connector Hub
           (Inngest job)    (OAuth adapters)
                 |
                 v
           Agent Runtime Worker
           (tool loop, memory, meters)
                 |
        +--------+--------+
        v        v        v
   Channels   Tools    LLMRouter
  (web/email) (allowlist) (OpenAI/Anthropic)
```

### Core services (logical modules)

| Module | Responsibility |
|---|---|
| `builder-chat` | Conversational intake; produces structured `AgentIntake` |
| `questionnaire` | Permissions + connector consent UI/state machine |
| `spec-compiler` | LLM+rules → validated `AgentSpec` (Zod) |
| `provisioner` | After pay: create agent, prompts, tools, deploy sandbox |
| `runtime` | Execute turns, tools, memory, guardrails |
| `connectors` | OAuth, credential vault, tool manifests |
| `wallet` | Token/credit ledger, reservations, settle on usage |
| `billing` | Stripe products, checkout, webhooks, plan entitlements |
| `channels` | Web widget, email, webhooks ingress |
| `admin` | templates, kill switches, abuse review |

---

## 7) Domain objects (mental model)

- **User / Org (tenant)**
- **Conversation (builder chat)**
- **AgentIntake** — structured answers from chat+questionnaire
- **AgentSpec** — canonical JSON the runtime understands
- **Agent** — deployed instance (draft/sandbox/live)
- **ConnectorAccount** — linked OAuth/API for org
- **ToolPolicy** — which tools agent may call + constraints
- **KnowledgeSource** — uploaded docs / URLs / Notion
- **Wallet + LedgerEntry**
- **Subscription / CreditPack**
- **Run / Trace** — one agent execution
- **ChannelBinding** — agent ↔ web widget / email / webhook

See `DATA_MODEL.md` for tables.

---

## 8) Builder chat design (the product core)

The builder is **not** a free-form coding agent. It is a **guided compiler**.

### Phases inside builder chat
1. **Discover** — goal, audience, success metric
2. **Scope** — template match or soft-reject
3. **Configure** — tone, languages, escalation, hours
4. **Permissions questionnaire** — data classes, PII, actions that write/mutate
5. **Connectors** — which integrations; each needs explicit consent
6. **Estimate** — token/cost band + plan recommendation
7. **Freeze Spec** — show human-readable Spec; require confirm
8. **Checkout**
9. **Provision + status stream** (Realtime)
10. **Playground handoff**

### Spec compiler rules
- Always output `AgentSpec` validated by Zod.
- Never enable a write tool without questionnaire approval.
- Always set: `maxStepsPerRun`, `dailyTokenCap`, `allowedDomains`, `piiPolicy`.
- Prefer retrieval over hallucinated business facts (require KB if FAQ claims).

### Example AgentSpec (shape)

```ts
type AgentSpec = {
  version: "1";
  templateId: "support_faq" | "lead_qualifier" | "inbox_triage" | "shop_helper" | "webhook_ops" | "internal_qa";
  name: string;
  locale: string[];
  persona: { tone: string; systemPrompt: string };
  channels: Array<"web_chat" | "email" | "webhook" | "slack">;
  knowledge: Array<{ type: "upload" | "url" | "notion"; ref: string }>;
  tools: Array<{
    id: string;
    connector?: string;
    mode: "read" | "draft_write" | "write";
    constraints: Record<string, unknown>;
  }>;
  escalation: { type: "email" | "ticket"; target: string };
  guardrails: {
    maxStepsPerRun: number;
    dailyTokenCap: number;
    disallow: string[];
  };
  billing: { planHint: "starter" | "growth" | "pro"; estimatedMonthlyTokens: number };
};
```

---

## 9) Permissions questionnaire (must-have)

Ask in plain language; store as structured consent.

Minimum questions:
1. What customer data can the agent read? (orders, emails, tickets, none)
2. Can it draft messages or send automatically?
3. Can it create/update CRM records?
4. Can it trigger refunds / payments / deletions? (default **no**; refunds = draft only in v1)
5. Which channels are in scope?
6. Any blocked topics?
7. Who is the human escalation contact?
8. Data retention: 30/90/365 days

UI: checklist + risk badges (“writes to Shopify”, “reads Gmail”).  
No connector write scope without this consent record.

---

## 10) Billing + automatic tokens

### Plans (suggested v1)
- **Starter** — 1 agent, X tokens/mo, web chat only
- **Growth** — 3 agents, more tokens, 2 connectors
- **Pro** — more agents, higher caps, priority runtime

Also sell **credit packs**; optional **auto top-up** when wallet < threshold.

### Wallet model
- Platform holds provider API keys.
- When agent runs, `wallet.reserve(estimate)` → execute → `wallet.settle(actual)`.
- If insufficient balance: agent pauses with user-facing “add credits”.
- Stripe webhook `checkout.session.completed` / `invoice.paid` credits wallet.

### Why not “customer brings OpenAI key” in v1
Breaks the no-friction promise. Offer BYOK only in Pro later.

---

## 11) Connector philosophy

- User never pastes provider master keys into chat.
- User clicks **Connect Shopify** → OAuth → scopes shown → approve.
- Tool manifests declare required scopes.
- Runtime tools call connector proxy with org-scoped tokens.
- Allowlist actions per AgentSpec.

v1 connectors: **Shopify**, **Gmail** (or Resend outbound), **HubSpot**, **Google Sheets**, **Slack**, **Generic HTTPS allowlist**.

---

## 12) Runtime execution rules

For each user message / trigger:
1. Load Agent + Spec + ToolPolicy + memory
2. Check wallet + plan entitlements
3. Build model messages (system + RAG chunks + history window)
4. Tool loop with `maxStepsPerRun`
5. Every tool call: authz check against ToolPolicy + consent
6. Meter tokens + tool fees to ledger
7. Persist trace (Langfuse) + Run row
8. Stream tokens to playground / channel

**Sandbox vs Live:** new agents start `sandbox` (playground only). Live requires health check + user toggle.

---

## 13) Security / abuse (non-negotiable)

- RLS on every tenant table
- Server-only service role
- Encrypt connector secrets
- SSRF protection on HTTP tools (block link-local, metadata IPs)
- Prompt-injection defenses for KB + tool outputs
- Rate limits per org/agent/IP
- Kill switch per agent + global
- Audit log for consent + tool writes
- PII redaction in traces where possible

---

## 14) Repo structure (target monorepo)

```text
sunx/
  apps/
    web/                 # Next.js app (marketing + app)
    worker/              # optional dedicated worker package
  packages/
    agent-spec/          # Zod AgentSpec + templates
    agent-runtime/       # tool loop
    connectors/          # adapter interfaces + implementations
    wallet/              # ledger logic
    llm/                 # LLMRouter
    ui/                  # shared UI
    config/              # eslint/tsconfig
  supabase/
    migrations/
    functions/
  docs/sunx/
  .cursor/skills/
  .cursor/rules/
  AGENTS.md
```

Start simpler if needed: single `apps/web` Next.js app + `supabase/` + `packages/agent-spec` only; extract runtime when it hurts.

---

## 15) Environment variables (names)

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
NANGO_SECRET_KEY=          # or COMPOSIO_API_KEY=
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
SENTRY_DSN=
NEXT_PUBLIC_POSTHOG_KEY=
ENCRYPTION_KEY=            # for secrets at rest
```

---

## 16) UX surfaces to build

1. Marketing landing (`/`) — brand **Sunx** hero-first
2. Auth
3. App home — list agents
4. **Builder chat** (`/build`) — core
5. Spec review + questionnaire
6. Checkout
7. Provisioning status
8. Playground
9. Connectors settings
10. Wallet / billing
11. Web chat widget embed snippet
12. Admin (internal)

---

## 17) Acceptance criteria for MVP

- [ ] User can sign up and complete builder chat for `support_faq`
- [ ] Questionnaire persists consent
- [ ] Stripe test payment credits wallet + creates subscription
- [ ] Agent provisioned to `sandbox` without user writing code
- [ ] Playground answers from uploaded FAQ doc
- [ ] At least 1 OAuth connector attach + read tool works
- [ ] Usage deducts wallet; hard-stop at 0
- [ ] RLS prevents cross-tenant reads
- [ ] Out-of-matrix requests get honest refusal + alternative

---

## 18) Explicit non-goals for Cursor agents

- Do not build voice call center in v1
- Do not allow arbitrary shell/code execution tools for customer agents
- Do not store secrets in frontend
- Do not skip Stripe webhooks (no “trust client paid”)
- Do not auto-enable write tools
- Do not generate fake connector integrations

---

## 19) Implementation order (summary)

See `BUILD_PHASES.md`. Short version:

0. Repo + Supabase + Auth + empty app shell  
1. AgentSpec package + templates  
2. Builder chat → Intake → Spec  
3. Questionnaire + consent records  
4. Stripe + Wallet  
5. Provisioner job  
6. Runtime playground  
7. First connectors  
8. Web widget channel  
9. Hardening + observability  
10. Growth templates  

---

## 20) Prompt seed for Cursor (copy/paste)

```text
You are building Sunx, a public SaaS agent factory.

Read and obey:
- AGENTS.md
- docs/sunx/CURSOR_BUILD_BRIEF.md
- docs/sunx/PRD.md
- docs/sunx/DATA_MODEL.md
- docs/sunx/API_CONTRACTS.md
- docs/sunx/BUILD_PHASES.md
- .cursor/rules/sunx.mdc
- relevant .cursor/skills/*

Product constraints:
- End users never write code.
- Agents are template-constrained.
- Writes require questionnaire consent.
- Platform manages LLM tokens via wallet + Stripe.
- Connectors via OAuth approval only.

Current task: implement the next unchecked phase in BUILD_PHASES.md.
Keep diffs focused. Add tests for Spec validation, wallet ledger, and RLS-sensitive paths.
Afterward update docs/sunx/BUILD_STATUS.md.
```

---

## 21) Relationship to ORVO (this GitHub repo)

This repository currently hosts ORVO marketing/demo content. **Sunx is a separate product codebase.**  
Use these docs as the brief to scaffold Sunx in a new repo (recommended) or under `/sunx` if you insist on a monorepo later.

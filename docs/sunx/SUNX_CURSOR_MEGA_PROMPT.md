# Sunx — Mega Prompt (paste into Cursor)

```text
# Mission
Build Sunx: a PUBLIC SaaS where a non-technical user describes an AI agent in chat, completes a permissions questionnaire, pays, and the system automatically provisions + hosts the agent. Sunx manages LLM tokens (wallet) and connects APIs only after user OAuth/approval. Users never write code.

# Read and obey (in order)
1. AGENTS.md
2. docs/sunx/CURSOR_BUILD_BRIEF.md
3. docs/sunx/PRD.md
4. docs/sunx/DATA_MODEL.md
5. docs/sunx/API_CONTRACTS.md
6. docs/sunx/BUILD_PHASES.md
7. .cursor/rules/sunx.mdc
8. Use skills as needed:
   - sunx-product
   - sunx-architecture
   - sunx-chat-builder
   - sunx-billing
   - sunx-connectors
   - sunx-agent-runtime

# Product constraints (hard)
- Template-constrained agents only (v1): support_faq, lead_qualifier, inbox_triage, shop_helper, webhook_ops, internal_qa
- Soft-reject unsupported / “crazy” requests; offer closest template
- Write tools require questionnaire consent_records
- Stripe webhook is source of truth before provision
- Platform wallet meters all token usage; hard-stop at 0
- Multi-tenant RLS on every org table
- No shell/code-exec tools for customer agents in v1
- No voice contact-center in v1

# Stack defaults (why)
- Next.js 15 + TS + Tailwind + shadcn: one web surface, fast Cursor DX
- Supabase Auth+Postgres+Realtime: tenancy, auth, build status streams
- Drizzle: typed SQL migrations
- Vercel AI SDK: streaming builder + playground
- Zod AgentSpec package: compiler output contract
- Stripe: plans + credit packs
- Inngest or Trigger.dev: provision / index / usage jobs
- Nango or Composio: OAuth connector lifecycle
- Langfuse + Sentry + PostHog: traces, errors, product analytics
- Hosted LLM keys via Sunx (not customer BYOK in v1)

# Architecture modules
builder-chat → questionnaire → spec-compiler → billing/wallet → provisioner → runtime → connectors → channels

# Core user journey to implement
signup → /build chat describe → questionnaire → compile/freeze AgentSpec → Stripe checkout → webhook credits wallet → provision sandbox agent → playground chat (FAQ KB) → connect 1 OAuth read tool → embed web widget → LIVE toggle

# Current task
Implement the next unchecked items in docs/sunx/BUILD_PHASES.md starting at Phase 0.
Work in a clean Sunx repo (not the ORVO marketing site).
Ship a vertical slice; add tests for Spec + wallet ledger; update docs/sunx/BUILD_STATUS.md when done.
If a choice is ambiguous, pick the brief’s default and note it in BUILD_STATUS.md.
```

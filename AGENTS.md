# AGENTS.md — Sunx (Cursor)

You are implementing **Sunx**, a public SaaS that builds and hosts AI agents from a chat description.

## Read first
1. `docs/sunx/CURSOR_BUILD_BRIEF.md`
2. `docs/sunx/BUILD_PHASES.md`
3. `docs/sunx/PRD.md`
4. `docs/sunx/DATA_MODEL.md`
5. `docs/sunx/API_CONTRACTS.md`
6. Matching skill under `.cursor/skills/` for the area you touch

## Non-negotiable product rules
- End users never write code or manage provider `.env` files.
- Only template-supported agents in v1; refuse unsupported asks.
- No write tools without questionnaire consent.
- Stripe webhooks are the source of truth for payment → provision.
- Platform wallet meters all LLM usage.
- Multi-tenant RLS always on.

## Engineering rules
- TypeScript strict.
- Zod at every boundary (API body, Spec, consent, webhook metadata).
- Prefer small vertical slices over giant refactors.
- Tests required for: AgentSpec, wallet ledger, consent gating, RLS-sensitive queries.
- Do not commit secrets.
- Update `docs/sunx/BUILD_STATUS.md` when a phase advances.

## Stack defaults
Next.js 15 App Router, Supabase Auth+Postgres, Drizzle, Vercel AI SDK, Stripe, Inngest/Trigger.dev, connector OAuth via Nango or Composio, Langfuse, Sentry, PostHog.

## When unsure
Match the closest template; ask product question in `BUILD_STATUS.md`; do not invent unrestricted agent capabilities.

---
name: sunx-architecture
description: "Use when designing or changing Sunx system architecture, repo layout, module boundaries, env vars, hosting, or choosing libraries. Triggers: monorepo structure, Next.js/Supabase/Inngest/Stripe wiring, where to put runtime vs web."
---

# Sunx Architecture Skill

## Default stack
- `apps/web`: Next.js 15 + TS + Tailwind + shadcn
- `packages/agent-spec`: Zod Spec + templates
- `packages/agent-runtime`: tool loop
- `packages/connectors`: OAuth adapters
- `packages/wallet`: ledger
- `packages/llm`: LLMRouter
- Supabase Auth/DB/Realtime; Stripe; Inngest/Trigger; Langfuse; Sentry; PostHog

## Boundaries
- Builder chat produces Intake, not production side effects (except saving messages).
- Spec compiler is pure-ish: LLM draft + deterministic validators.
- Provisioner is the only path that creates sandbox agents after payment events.
- Runtime never reads Stripe directly; only wallet entitlements.

## Start thin
Single Next app is OK until runtime/connectors need extraction. Keep Spec package separate from day one.

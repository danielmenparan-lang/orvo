# Sunx Build Phases (for Cursor)

Check boxes as you complete. One phase per Cursor session unless tiny.

## Phase 0 — Scaffold
- [ ] Create `sunx` Next.js 15 + TS + Tailwind + shadcn app
- [ ] Add Supabase project config, Auth, Drizzle schema stub
- [ ] Add `AGENTS.md`, copy all `docs/sunx/*`, `.cursor/skills`, `.cursor/rules`
- [ ] CI: typecheck + lint
- [ ] Empty pages: `/`, `/login`, `/app`

## Phase 1 — Tenancy + AgentSpec
- [ ] Tables: orgs, org_members
- [ ] Auto-create org on first login
- [ ] Package `packages/agent-spec` with Zod + templates
- [ ] Unit tests for Spec validation + template defaults

## Phase 2 — Builder chat vertical slice
- [ ] `builder_conversations` + messages
- [ ] Streaming builder chat UI (`/build`)
- [ ] Phase state machine (discover → … → freeze)
- [ ] Intake extraction tool/schema
- [ ] Soft-reject unsupported requests

## Phase 3 — Questionnaire + compile
- [ ] Questionnaire UI + `consent_records`
- [ ] `compile` endpoint → AgentSpec
- [ ] Spec review screen (human readable)
- [ ] Confirm/freeze Spec

## Phase 4 — Stripe + Wallet
- [ ] Stripe products/prices seed script
- [ ] Checkout session from frozen Spec
- [ ] Webhook credits wallet ledger
- [ ] Wallet UI
- [ ] Tests: ledger reserve/settle/release

## Phase 5 — Provisioner
- [ ] Inngest/Trigger job `agent/provision`
- [ ] Create `agents` row status=sandbox
- [ ] Attach tool policies from Spec
- [ ] Realtime status updates to UI

## Phase 6 — Runtime playground
- [ ] LLMRouter (OpenAI/Anthropic)
- [ ] Tool loop with maxSteps
- [ ] KB upload + simple retrieval for FAQ template
- [ ] Meter usage → wallet settle
- [ ] Pause on insufficient tokens

## Phase 7 — First connectors
- [ ] Connector catalog
- [ ] OAuth for 1–2 providers (Sheets or HubSpot + Slack recommended before Shopify)
- [ ] Read tool in runtime via proxy
- [ ] Consent gate before enabling

## Phase 8 — Web widget channel
- [ ] Public chat widget script
- [ ] Binding + rate limits
- [ ] LIVE toggle

## Phase 9 — Hardening
- [ ] RLS tests
- [ ] SSRF guards
- [ ] Sentry + Langfuse + PostHog
- [ ] Kill switches
- [ ] Abuse rate limits

## Phase 10 — Expand templates
- [ ] lead_qualifier, inbox_triage, shop_helper
- [ ] Auto top-up
- [ ] Hebrew UI i18n (optional)

## Definition of done (MVP)
Phases 0–8 complete with Acceptance Criteria in `CURSOR_BUILD_BRIEF.md` §17 all green.

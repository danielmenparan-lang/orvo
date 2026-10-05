# Sunx Data Model (v1)

Postgres via Supabase. Enable RLS on all tenant tables.

## Tenancy
- `orgs` — tenant
- `org_members` — user_id, org_id, role (`owner`|`admin`|`member`)

## Builder
- `builder_conversations` — org_id, status, phase
- `builder_messages` — conversation_id, role, content, meta jsonb
- `agent_intakes` — conversation_id, structured answers jsonb
- `consent_records` — org_id, conversation_id, answers jsonb, signed_at, ip

## Specs & Agents
- `agent_specs` — org_id, version, spec jsonb, checksum
- `agents` — org_id, spec_id, name, status (`draft`|`sandbox`|`live`|`paused`|`failed`), template_id
- `agent_knowledge_sources` — agent_id, type, uri, status
- `agent_channel_bindings` — agent_id, channel, config jsonb, is_live

## Connectors
- `connectors` — catalog (shopify, gmail, hubspot, ...)
- `connector_accounts` — org_id, connector_id, status, scopes[], secret_ref
- `agent_tool_policies` — agent_id, tool_id, mode, constraints jsonb

## Billing
- `plans` — starter/growth/pro entitlements jsonb
- `subscriptions` — org_id, stripe_customer_id, stripe_subscription_id, plan_id, status
- `wallets` — org_id, balance_tokens, currency_hint
- `wallet_ledger` — wallet_id, type (`credit`|`reserve`|`settle`|`release`|`adjust`), amount, ref_type, ref_id, meta jsonb
- `usage_events` — org_id, agent_id, run_id, input_tokens, output_tokens, cost_tokens

## Runtime
- `agent_runs` — agent_id, trigger, status, started_at, ended_at, trace_id
- `agent_run_steps` — run_id, idx, kind (`model`|`tool`), payload jsonb
- `memories` — agent_id, thread_id, content, embedding optional

## Audit
- `audit_logs` — org_id, actor_user_id, action, entity, meta jsonb, created_at

## Indexes (critical)
- wallet_ledger(wallet_id, created_at)
- agents(org_id, status)
- agent_runs(agent_id, created_at desc)
- builder_messages(conversation_id, created_at)

## RLS pattern
- Membership via `org_members`
- `auth.uid()` must map to member of row’s `org_id`
- Service role only in server/worker for provisioning + Stripe webhooks

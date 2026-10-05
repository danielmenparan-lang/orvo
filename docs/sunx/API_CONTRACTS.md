# Sunx API Contracts (v1)

All app APIs under `/api/*`. Auth: Supabase session cookie/JWT. Workers use service role.

## Builder

### `POST /api/builder/conversations`
Create builder conversation for current org.

### `POST /api/builder/conversations/:id/messages`
Body: `{ content: string }`  
Streams assistant tokens (AI SDK). Side effects: update phase, extract intake patches.

### `GET /api/builder/conversations/:id`
Returns messages + intake + current phase.

### `POST /api/builder/conversations/:id/questionnaire`
Body: consent answers (Zod). Writes `consent_records`.

### `POST /api/builder/conversations/:id/compile`
Runs spec-compiler → `agent_specs` row. Returns readable Spec + estimate.

### `POST /api/builder/conversations/:id/confirm-spec`
Freezes spec for checkout.

## Billing

### `POST /api/billing/checkout`
Body: `{ planId?: string, creditPackId?: string, conversationId: string }`  
Returns Stripe Checkout URL. Metadata includes `org_id`, `conversation_id`, `spec_id`.

### `POST /api/billing/webhook`
Stripe webhook. On payment success: credit wallet, enqueue `agent/provision`.

### `GET /api/billing/wallet`
Balance + recent ledger.

### `POST /api/billing/portal`
Stripe Customer Portal URL.

## Agents

### `GET /api/agents`
List org agents.

### `GET /api/agents/:id`
Agent + status + bindings.

### `POST /api/agents/:id/playground`
Body: `{ message: string }` — streaming runtime turn (sandbox).

### `POST /api/agents/:id/live`
Toggle live if health checks pass + required connectors connected.

### `POST /api/agents/:id/pause`

## Connectors

### `GET /api/connectors`
Catalog + org connection status.

### `POST /api/connectors/:key/connect`
Start OAuth (returns redirect URL).

### `GET /api/connectors/callback`
OAuth callback → store secret_ref + scopes.

### `DELETE /api/connectors/accounts/:id`
Revoke.

## Channels

### `POST /api/channels/web/:publicKey/chat`
Public widget endpoint (rate limited). Resolves agent binding.

### `POST /api/channels/webhook/:agentId/:secret`
Ingress for `webhook_ops` template.

## Internal events (Inngest)

- `billing/payment.succeeded`
- `agent/provision`
- `agent/index-knowledge`
- `usage/flush`
- `wallet/autotopup.check`

## Error shape
```json
{ "error": { "code": "INSUFFICIENT_TOKENS", "message": "..." } }
```

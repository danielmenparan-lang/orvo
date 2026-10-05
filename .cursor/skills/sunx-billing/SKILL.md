---
name: sunx-billing
description: "Use when implementing Sunx Stripe checkout, webhooks, plans, credit packs, token wallet ledger, reserves/settles, auto top-up, or entitlements. Triggers: wallet, Stripe, insufficient tokens, checkout.session.completed, ledger."
---

# Sunx Billing Skill

## Rules
- Never provision on client “success” redirect alone — wait for verified Stripe webhook.
- Wallet ledger is append-only style accounting: credit, reserve, settle, release, adjust.
- Runtime must `reserve` before LLM call and `settle` with actual usage (release leftover).
- Hard-stop agents at 0 spendable balance.

## Flow
1. Frozen Spec → Checkout (metadata: org_id, conversation_id, spec_id)
2. Webhook verifies signature
3. Upsert subscription + `ledger.credit`
4. Emit `agent/provision`

## Tests
- webhook credits once (idempotent by event id)
- reserve/settle math
- insufficient funds path

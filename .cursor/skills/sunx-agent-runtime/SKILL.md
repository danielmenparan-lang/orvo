---
name: sunx-agent-runtime
description: "Use when building the Sunx hosted agent runtime: tool loop, guardrails, memory, RAG, metering, sandbox vs live, channels ingress, traces. Triggers: playground, maxStepsPerRun, LLMRouter, agent_runs, widget chat."
---

# Sunx Agent Runtime Skill

## Execute turn
1. Load agent + Spec + policies + wallet
2. Entitlement checks
3. Retrieve KB chunks if configured
4. Model + tools loop ≤ `maxStepsPerRun`
5. Authorize each tool call
6. Meter tokens to wallet
7. Persist run/steps + Langfuse trace
8. Stream response

## Guardrails
- Template tool allowlist only
- No shell/code exec tools in v1
- Sandbox cannot bind public LIVE channels until toggle
- Daily token cap per Spec

## Channels
Playground first; then web widget; then email/webhook templates.

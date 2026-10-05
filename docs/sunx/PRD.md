# Sunx PRD (v1)

## Vision
Let any non-technical business user create a working AI agent by describing it in chat, approving permissions, and paying — with Sunx handling build, runtime, APIs, and tokens.

## Personas
1. **Owner/Operator** — wants support/leads automation this week, not a development project.
2. **Ops Manager** — cares about permissions, escalation, and cost caps.
3. **Sunx Admin** — templates, abuse, margins on token resale.

## Problem
Tools like Cursor can help *builders* create agents, but end customers still drown in APIs, keys, hosting, and glue code. Existing bot builders are either too shallow (FAQ only) or too technical.

## Solution
Chat-first agent factory + hosted runtime + managed connectors + wallet billing.

## Goals (v1)
- Time-to-first-sandbox-agent < 20 minutes for `support_faq`
- Zero customer code
- Explicit consent for every write capability
- Positive gross margin after LLM + infra

## Non-goals (v1)
- Arbitrary agent programs
- Full contact-center voice
- Marketplace of third-party builders (that’s closer to ORVO; Sunx is self-serve factory)

## Success metrics
- Signup → paid conversion
- Paid → agent LIVE within 7 days
- Weekly active agents
- Gross margin per 1k tokens
- Support tickets about “how do I connect API” (should trend down)

## UX principles
- One job per screen/section
- Always show what the agent can *do* and *not do*
- Prefer honest refusal over overpromise
- Brand name **Sunx** is first-class in marketing surfaces

## Risks
| Risk | Mitigation |
|---|---|
| Users ask for unsupported agents | Template matrix + soft reject |
| Token cost blowups | Caps, reserves, kill switch |
| OAuth scope creep | Per-tool consent + least privilege |
| Prompt injection via KB | Sanitize, tool allowlists, dual validation |
| Abuse (spam agents) | Auth, Stripe, rate limits, review queue |

## Launch scope
Hebrew + English UI copy OK later; product code/docs in English for Cursor velocity.
Ship English-first app UI; add i18n after MVP.

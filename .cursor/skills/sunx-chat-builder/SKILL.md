---
name: sunx-chat-builder
description: "Use when implementing the Sunx builder chat, intake extraction, phase state machine, questionnaire, or Spec compile/confirm flow. Triggers: /build UI, builder messages API, AgentIntake, soft-reject, freeze spec."
---

# Sunx Chat Builder Skill

## Role of builder LLM
Guided compiler, not coding agent. Collect structured Intake; map to template; call compile.

## Implementation checklist
1. Persist every message
2. Maintain explicit `phase` enum on conversation
3. Use tool/schema extraction for Intake patches (Zod)
4. Match template or refuse
5. Questionnaire writes `consent_records` before write tools exist on Spec
6. Compile → validate AgentSpec → show review
7. Confirm freezes Spec id onto checkout metadata

## Streaming
Use Vercel AI SDK. Do not block HTTP on provision — that is a later job.

## Tests
- phase transitions
- unsupported request → refusal
- compile rejects write tools without consent

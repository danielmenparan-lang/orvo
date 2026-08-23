# Pulse ~03:00 UTC — P2 polish (no more browser prompts)

## Shipped
1. Review modal (1–5 stars) replaces `prompt`
2. Shared confirm sheet for deliver, release, admin dispute resolve
3. Post channel chips (WhatsApp default) + chip `.on` states
4. Non-admin invite errors hide `sql/005_…`
5. `ORVO_DISPLAY_CURRENCY` + `docs/i18n-RTL-PREP.md`
6. stripe-webhook scaffold secret gate

## Tests
`node tests/chat-policy.test.js` — pass

## Remaining
Founder: SQL 001→005, is_admin, Stripe secrets. Code P0/P1/P2 checklist largely green.

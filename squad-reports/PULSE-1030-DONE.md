# Pulse 10:30 UTC — DONE

1. **Client post funnel** — `pendingClientPost` opens Post modal after client signup/login from hero CTA; auth subtitle + `post_modal_open` / `post_success` events
2. **Pay sheet resume** — `#pay-resume-btn` + `ORVO_CHECKOUT_LIVE`-aware awaiting copy; `awaitingPayContext` for retry
3. **My requests** — **Complete payment** CTA on `awaiting_payment` cards
4. **Admin ops** — disputes sidebar badge; clickable KPI tiles → admin views
5. **Edge auth** — UUID v4 validation in `_shared/auth.ts` + `tests/edge-auth.test.js`

Cache bust `v=36`.

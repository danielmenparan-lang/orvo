# Pulse ~04:00 UTC — release wire + checkout return + ETA

## Shipped
1. `supabase/functions/release-to-builder` + client `tryReleaseToBuilder` (501-safe)
2. `?checkout=success|cancel` return handling (honest: webhook still owns held)
3. `sql/008_quote_eta.sql` + `delivery_days` on quote insert
4. Incoming quote toast (Realtime) + `js/events.js` analytics stub

## Blocked
Live Transfer / Checkout still need Stripe + service-role secrets.

# ORVO SQL

Run in Supabase SQL Editor, **in order**:

**One-paste option:** `APPLY-ALL-001-020.sql` — entire 001→020 + admin SQL at bottom (recommended for founders).

Numbered files (if you prefer step-by-step):

1. `001_mvp_schema.sql` — tables, RLS, privilege triggers  
2. `002_payments_lockdown.sql` — clients insert `pending` only; `held`/`released` via webhook / `service_role` / admin  
3. `003_chat_and_trust.sql` — server-side chat filters + thin deliveries / reviews / disputes  
4. `004_global.sql` — `requests.location` text (optional country for global clients)
5. `005_invites.sql` — concierge `request_invites` (admin → builder)  
6. `006_connect.sql` — optional `profiles.stripe_connect_*` for Express payouts  
7. `007_status_guards.sql` — `awaiting_payment` check, one payment/request, quote min $50  
8. `008_quote_eta.sql` — `quotes.delivery_days`  
9. `009_loop_hygiene.sql` — quote status check + indexes for withdraw/cancel  
10. `010_payment_stripe_fields.sql` — `held_at`, Connect snapshot fields, currency  
11. `011_message_limits.sql` — messages.body 1–2000 chars  
12. `012_notifications.sql` — optional notifications inbox (RLS read-own)  
13. `013_request_search.sql` — optional FTS + trigram indexes for browse jobs  
14. `014_quote_notify.sql` — quote insert → notify request owner (needs 012); invite → builder  
15. `015_status_notify.sql` — request status change → client (+ assigned builder) inbox  
16. `016_message_notify.sql` — new chat message → counterparty inbox  
17. `017_stripe_webhook_events.sql` — Stripe evt idempotency (webhook only; optional until Stripe live)  
18. `018_builder_application_notify.sql` — approved/rejected → builder inbox  
19. `019_notifications_unread_idx.sql` — partial index for unread badge queries  
20. `020_payment_checkout_open.sql` — documents `checkout_open` status (comment only)  

Founder smoke checklist: `docs/FOUNDER-SQL-SMOKE.md` / `founder-checklist.html`.  
Founder setup CLI: `bash scripts/founder-setup.sh`  
Edge probe: `bash scripts/verify-edge.sh`  
Stripe MVP: `docs/payments/STRIPE-CONNECT-MVP.md` · deploy: `docs/payments/STRIPE-DEPLOY-CHECKLIST.md`.

**Prod applied (founder):** _note date after running APPLY-ALL in Supabase_

Also aliased: `sql-FINAL-FIX.sql` / `sql-RUN-NOW.sql` ≈ latest full bootstrap (prefer numbered migrations).

After first admin signup:
```sql
update public.profiles set is_admin = true where email = 'danielmen.paran@gmail.com';
```

**Prod apply status:** *not confirmed by agents — founder must run 001→020 in Supabase SQL Editor and note the date in FOUNDER-SQL-SMOKE.md.*

# ORVO SQL

Run in Supabase SQL Editor, **in order**:

1. `001_mvp_schema.sql` — tables, RLS, privilege triggers  
2. `002_payments_lockdown.sql` — clients insert `pending` only; `held`/`released` via webhook / `service_role` / admin  
3. `003_chat_and_trust.sql` — server-side chat filters + thin deliveries / reviews / disputes  
4. `004_global.sql` — `requests.location` text (optional country for global clients)
5. `005_invites.sql` — concierge `request_invites` (admin → builder)  
6. `006_connect.sql` — optional `profiles.stripe_connect_*` for Express payouts  
7. `007_status_guards.sql` — `awaiting_payment` check, one payment/request, quote min $50  
8. `008_quote_eta.sql` — `quotes.delivery_days`  

Founder smoke checklist: `docs/FOUNDER-SQL-SMOKE.md` / `founder-checklist.html`.  
Stripe MVP: `docs/payments/STRIPE-CONNECT-MVP.md`.

Also aliased: `sql-FINAL-FIX.sql` / `sql-RUN-NOW.sql` ≈ latest full bootstrap (prefer numbered migrations).

After first admin signup:
```sql
update public.profiles set is_admin = true where email = 'danielmen.paran@gmail.com';
```

**Prod apply status:** *not confirmed by agents — founder must run 001→008 in Supabase SQL Editor and note the date in FOUNDER-SQL-SMOKE.md.*

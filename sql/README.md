# ORVO SQL

Run in Supabase SQL Editor, **in order**:

1. `001_mvp_schema.sql` — tables, RLS, privilege triggers  
2. `002_payments_lockdown.sql` — clients insert `pending` only; `held`/`released` via webhook / `service_role` / admin  
3. `003_chat_and_trust.sql` — server-side chat filters + thin deliveries / reviews / disputes  
4. `004_global.sql` — `requests.location` text (optional country for global clients)  

Stripe MVP: `docs/payments/STRIPE-CONNECT-MVP.md`.

Also aliased: `sql-FINAL-FIX.sql` / `sql-RUN-NOW.sql` ≈ latest full bootstrap (prefer numbered migrations).

After first admin signup:
```sql
update public.profiles set is_admin = true where email = 'danielmen.paran@gmail.com';
```

# ORVO SQL

Run in Supabase SQL Editor, **in order**:

1. `001_mvp_schema.sql` — tables, RLS, privilege triggers  
2. `002_payments_lockdown.sql` — clients cannot settle payments (admin / `service_role` / webhook only)  
3. `003_chat_and_trust.sql` — server-side chat filters + thin deliveries / reviews / disputes  

Also aliased: `sql-FINAL-FIX.sql` / `sql-RUN-NOW.sql` ≈ latest full bootstrap (prefer numbered migrations).

After first admin signup:
```sql
update public.profiles set is_admin = true where email = 'danielmen.paran@gmail.com';
```

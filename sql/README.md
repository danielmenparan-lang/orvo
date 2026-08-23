# ORVO SQL

Run `001_mvp_schema.sql` in the Supabase SQL Editor.

Also copied as `sql-FINAL-FIX.sql` and `sql-RUN-NOW.sql` to match in-app error hints.

After first admin signup:
```sql
update public.profiles set is_admin = true where email = 'danielmen.paran@gmail.com';
```

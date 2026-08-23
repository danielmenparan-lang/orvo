# Wave 2D — Trust/SQL DONE

Date: 2026-08-23 · Agent D

## Shipped
- **`sql/003_chat_and_trust.sql`**
  - `message_block_reason` + `enforce_message_policy` BEFORE INSERT/UPDATE OF body on `messages`
  - Blocks emails, phones (IL/US + dense digit runs), WhatsApp / `wa.me`
  - Admin bypass via `public.is_orvo_admin()` → `profiles.is_admin`
  - Logs blocked attempts to `chat_moderation_events` (best-effort)
  - MVP-thin tables: `deliveries`, `reviews`, `disputes` + RLS
- **`sql/README.md`** — run order **001 → 002 → 003**
- **`002_payments_lockdown.sql`** — already on branch (settlement lock for non-admin; service_role/webhook path noted)

## Run order (Supabase SQL Editor)
1. `001_mvp_schema.sql`
2. `002_payments_lockdown.sql`
3. `003_chat_and_trust.sql`

## Exit gates
- [x] Server-side chat filter (not client-only)
- [x] Admin bypass documented + implemented
- [x] Thin trust tables without bloating MVP
- [x] README run order updated
- [x] Commit + push

## Next
Wire UI for delivery submit / review prompt / dispute open; optional Edge Function mirror of chat policy for clearer client errors.

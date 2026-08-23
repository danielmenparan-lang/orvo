# 14 — Schema Designer

**Role:** Schema Designer  
**Sources of truth:** `sql/001_mvp_schema.sql`, `app.js`  
**Also present:** `sql/sql-RUN-NOW.sql` (near-duplicate), `sql/sql-FINAL-FIX.sql` (chat/RLS patches referenced by error toasts)

---

## Verdict

`001_mvp_schema.sql` covers the six tables the app needs and enables RLS + messages realtime. It is **not yet aligned with what `app.js` writes**. Biggest blockers: missing `builder_applications` columns, unused enums (columns are `text`), no signup→profile trigger, and several RLS policies that let users mutate their own trust fields (`builder_status`, application `status`, payment `status`).

Treat `001` as the baseline to **extend**, not a greenfield redesign. Prefer additive migrations (`002_…`) over rewriting the aspirational mega-schema.

---

## What `001_mvp_schema.sql` already gets right

| Area | Notes |
|------|--------|
| Tables | `profiles`, `builder_applications`, `requests`, `quotes`, `messages`, `payments` — matches app table names |
| Money shape | `amount_cents`, `platform_fee_cents`, `builder_payout_cents` + Stripe ID columns ready |
| Quote uniqueness | `unique (request_id, builder_id)` |
| Helpers | `is_approved_builder()`, `is_orvo_admin()`, `can_access_request(rid)` — security definer + fixed `search_path` |
| RLS enabled | All six tables |
| Chat select/insert | Gated by `can_access_request` |
| Indexes | `requests(status)`, `requests(user_id)`, `messages(request_id, created_at)` |
| Idempotency | Enums/`IF NOT EXISTS` / `DROP POLICY IF EXISTS` — mostly re-runnable |

---

## Gaps vs `app.js` (priority)

### P0 — Will break or already fail at runtime

| Gap | Schema today | App expects | Fix |
|-----|--------------|-------------|-----|
| Application fields | `bio`, `skills`, `portfolio_url` only | Upserts `full_name`, `email`, `linkedin_url`, `experience_years` (`doApply`) | `ALTER TABLE … ADD COLUMN` for those four |
| Profile insert shape | No `role` column; `builder_status NOT NULL DEFAULT 'none'` | Inserts `role: 'client'`, `builder_status: null` (`loadProfile`) | Drop `role` from client insert **or** add nullable `role`; allow `null`/`'none'` consistently |
| Profile bootstrap | No `handle_new_user` trigger | Client retries 600ms then inserts; error toasts point at missing SQL | Add trigger on `auth.users` → `profiles` |
| Enum vs text | Enums created for builder/request/quote/payment status | All status columns are `text`; app strings must match manually | Either migrate columns to enums **or** add CHECK constraints matching app + enum lists |
| Realtime re-run | `alter publication … add table messages` | Second run errors if already member | Wrap in exception handler or check `pg_publication_tables` |

### P1 — Logic / security drift

| Gap | Risk | Fix |
|-----|------|-----|
| `builder_applications` UPDATE: `user_id = auth.uid() OR admin` | Applicant can set `status = 'approved'` | Split policies: user may update bio/skills only; **only admin** updates `status` / `reviewed_at` (trigger or column-level / restricted `WITH CHECK`) |
| `profiles` UPDATE: owner may set `is_admin` / `builder_status` | Self-elevation / self-approve | Deny client writes to `is_admin` and `builder_status` except via security-definer functions used by admin approve flow |
| `payments` UPDATE: payer OR admin | Client `releasePayment` updates `payments.status` from browser — spoofable without Stripe webhook | Release only via Edge Function / service role; RLS: clients **select** only; admin/service update |
| No `payments` DELETE / no revoke on status backslide | Weak audit trail | Prefer append-only status transitions; add `CHECK` or trigger state machine |
| Messages: no UPDATE/DELETE policies | Default deny (OK) | Keep deny; document intentional immutability |
| `apps_insert` does not require pending-only | Re-apply after reject OK via upsert | Fine; ensure unique `(user_id)` stays |
| Quote accept is multi-step client writes | Race: two clients accept different quotes | Server function: accept quote → assign builder → insert payment atomically |

### P2 — Product completeness (defer but note)

| Gap | Why it matters |
|-----|----------------|
| No `disputes` / moderation tables | Enum lists `disputed`; app has no UI yet (roles 03/13) |
| No `currency` on quotes/payments | Israel / ILS path (report 16) |
| No `builder_id` denormalized on `payments` | Simpler builder payout queries + RLS |
| No `unique (quote_id)` on payments | Double-pay risk on double-click accept |
| No `paid_at` written by app | Column exists; accept path never sets it |
| Status `held` unused | App uses `paid` then `released`; Stripe path wants `held` (report 03) |
| `can_access_request` allows any approved builder on `open` requests | Matches browse+message UX; OK for MVP, tighten later if spam |
| Helper name `is_orvo_admin` | Fine; keep one name in SQL + docs (draft mega-schema used `is_admin`) |

---

## Field map: schema ↔ app

### `profiles`

| Column (001) | App read/write | Notes |
|--------------|----------------|-------|
| `id` | PK = auth user | |
| `email` | read + update on admin bootstrap | |
| `full_name` | read; insert from metadata | |
| `is_admin` | read; client may set true if email matches config | Prefer server-only |
| `builder_status` | `'none'`/`null`/`pending`/`approved`/`rejected` | Align default + nullability |
| `bio`, `skills` | unused in UI flows | Optional later |
| — | App inserts `role` | **Column missing** |

### `builder_applications`

| Column (001) | App | Notes |
|--------------|-----|-------|
| `user_id`, `bio`, `skills`, `portfolio_url`, `status`, `reviewed_at` | yes | |
| — | `full_name`, `email`, `linkedin_url`, `experience_years` | **Missing — P0** |

### `requests` / `quotes` / `messages` / `payments`

Aligned on core columns. App statuses in use:

- Requests: `open` → `in_progress` → `funded` → `delivered` → `completed` (+ enum also has `cancelled`, `disputed`)
- Quotes: `pending` → `accepted` → `paid`
- Payments: `pending` \| `paid` → `released`
- Applications: `pending` \| `approved` \| `rejected`

Chat filter treats paid phase as `in_progress` \| `funded` \| `completed` (not `delivered`) — minor product inconsistency.

---

## Migration checklist

Run in order on the live Supabase project. Keep each file idempotent.

### Preflight

- [ ] Snapshot: Table Editor row counts for all six tables  
- [ ] Confirm Auth → email confirm setting matches product (app errors if confirm on)  
- [ ] Note whether `messages` is already in `supabase_realtime` publication  

### M1 — Align with current `app.js` (unblock builders)

```sql
-- 002_align_app_columns.sql (sketch)
alter table public.builder_applications
  add column if not exists full_name text,
  add column if not exists email text,
  add column if not exists linkedin_url text,
  add column if not exists experience_years integer not null default 0;

-- profiles: tolerate app insert quirks
alter table public.profiles
  alter column builder_status drop not null;  -- optional; or map null→'none' in app
-- Do NOT add role unless product needs it; prefer remove from app.js insert
```

- [ ] Apply column adds  
- [ ] Smoke: submit builder application from UI  
- [ ] Smoke: admin Review builders lists pending with name/email  

### M2 — Signup profile trigger

```sql
-- 003_handle_new_user.sql (sketch)
create or replace function public.handle_new_user() ...
create trigger on_auth_user_created after insert on auth.users ...
```

- [ ] New signup creates `profiles` row without client insert  
- [ ] Existing users unchanged (`ON CONFLICT DO NOTHING`)  

### M3 — Harden RLS (trust)

- [ ] Replace `apps_update` so non-admins cannot change `status`  
- [ ] Replace `profiles_update_own` so non-admins cannot change `is_admin` / `builder_status`  
- [ ] Add `approve_builder(uid)` / `reject_builder(uid)` security-definer functions for admin UI  
- [ ] Lock `payments` updates to admin/service role; move release to Edge Function stub  

### M4 — Status discipline

- [ ] Add CHECKs or migrate text → enums for request/quote/payment/application status  
- [ ] `unique (payments.quote_id)`  
- [ ] Optional: `payments.builder_id` + backfill from quotes  

### M5 — Stripe / escrow (with role 03)

- [ ] Prefer `held` after webhook; stop client writing `paid`/`released`  
- [ ] Write `stripe_*` IDs + `paid_at` / `released_at` from webhooks only  
- [ ] Realtime: safe add-to-publication helper  

### M6 — Housekeeping

- [ ] Collapse `sql-RUN-NOW.sql` / `sql-FINAL-FIX.sql` into numbered migrations; update `app.js` error strings to point at `001`+`002`  
- [ ] Document bootstrap admin: uncomment/update email line at bottom of `001` **or** one-time SQL after first signup  

---

## Recommended next SQL files

| File | Purpose |
|------|---------|
| `sql/002_align_app_columns.sql` | Application + profile nullability |
| `sql/003_handle_new_user.sql` | Auth trigger |
| `sql/004_harden_rls.sql` | Status / admin / payments policies + approve RPCs |
| `sql/005_payments_constraints.sql` | unique quote_id, builder_id, CHECKs |
| `sql/006_stripe_ready.sql` | held/released semantics notes + indexes on stripe ids |

Keep `001_mvp_schema.sql` as the install baseline for empty projects; new projects run `001` then `002+`.

---

## Explicit non-goals (this role)

- Do not replace `001` with a 900-line greenfield dump in the report folder as the runnable source of truth  
- Do not add disputes/moderation tables until UI + Edge Functions exist  
- Do not weaken RLS “temporarily” to unblock demos — fix columns first  

---

## Acceptance criteria for “schema green”

1. Fresh project: run `001` + `002` + `003` with no errors on second run  
2. Client signup → profile row without boot-error  
3. Builder apply → admin sees pending → approve → builder browses `open` jobs  
4. Quote → accept → payment row → deliver → release (manual path) without RLS errors  
5. Non-admin cannot UPDATE own `builder_status` to `approved` or application `status` to `approved`  
6. Chat realtime delivers inserts; poll remains fallback only  

# ORVO Role 02 — Security Auditor

**Scope:** `/workspace/index.html`, `app.js`, `supabase-config.js` (project `lbfysqtnarhkoqcnaivg`).  
**Method:** Static review of client authz, data writes, XSS escaping, payment stubs, PII exposure. **No live exploitation** beyond noting the public anon URL/key already shipped in the repo.  
**Assumption:** Referenced SQL files (`sql-RUN-NOW.sql`, etc.) are **not in this repo**. Production safety depends entirely on Supabase RLS that we cannot verify from code. Treat “RLS unknown / missing” as the default risk.

---

## Executive verdict

The UI implements roles (`isAdmin`, `isBuilder`) and chat filters **only in the browser**. Every sensitive write (`is_admin`, `builder_status`, quote/payment/request status) goes through the **anon key + user JWT**. If RLS does not hard-block privilege columns and admin mutations, a signed-in user can self-approve as builder, self-elevate to admin, mark deals funded without Stripe, and read other users’ requests/applications. XSS hygiene is generally good (`esc()` on rendered fields). Payment is a **manual confirm stub**, not escrow.

---

## Critical

### C1 — Privilege columns are client-writable (admin + builder bypass)

**Where:** `loadProfile` sets `is_admin` via client `profiles.update` / `insert`; `doApply` / `approveBuilder` / `rejectBuilder` update `profiles.builder_status` and `builder_applications.status` from the browser; `isAdmin()` / `isBuilder()` trust `profile.is_admin` / `builder_status`.

**Risk:** With typical “users can update own profile” RLS (no column restrictions), any authenticated user can:

```js
// Illustrative — do not run against prod; shows the client attack surface
supabase.from('profiles').update({ is_admin: true, builder_status: 'approved' }).eq('id', myId)
supabase.from('builder_applications').update({ status: 'approved' }).eq('user_id', myId)
```

UI gates (`loadAdmin`, `loadJobs`) are cosmetic. `approveBuilder(uid)` does **not** re-check `isAdmin()` before writing — RLS is the only real gate.

**Recommend:** Move elevation to server-only paths (Edge Function + `service_role`, or SECURITY DEFINER RPC callable only by admins). Strip client ability to set `is_admin` / `builder_status` / application `status`. Store admin in `auth.users.raw_app_meta_data` (not `user_metadata`).

### C2 — Assumed / unverified RLS (entire marketplace)

**Where:** App expects tables `profiles`, `requests`, `quotes`, `messages`, `builder_applications`, `payments` + Realtime on `messages` / `builder_applications`. No migrations in repo.

**Risk:** Open or permissive policies leak all open (and possibly all) requests, applications (emails/bios), messages, quotes, and payment rows to `anon`/`authenticated`. Realtime subscriptions amplify leakage.

**Recommend:** Enable RLS on every public table tonight; apply policies in “Assumed RLS” below; run Supabase Advisors; revoke broad `SELECT` for `anon`.

### C3 — Payment stub marks deals `paid` / `funded` without money movement

**Where:** `acceptQuote` — `confirm()` → update quote/request → `payments.insert` with `status: 'paid'` when `STRIPE_PAYMENT_LINK` is empty; otherwise opens a **generic** Payment Link (not quote-bound) and leaves `pending` without webhook verification.

**Risk:** Fake “funded” state unlocks post-pay chat rules; builders/clients may deliver under false payment; fee/`amount_cents` are client-influenced; no idempotency, no Stripe signature check, no escrow hold/release.

**Recommend:** Never write `paid`/`funded` from the browser. Checkout Session (or PaymentIntent) created by Edge Function; webhook (`checkout.session.completed`) is the sole writer of payment/request status. Disable manual confirm path in production.

---

## High

### H1 — Admin identity is public client config

**Where:** `supabase-config.js` `ORVO_ADMIN_EMAIL`; duplicate hardcode `ADMIN_EMAIL` in `app.js`; non-admin `loadAdmin` / Profile view reveal the admin address.

**Risk:** Targeted phishing / account takeover of the sole admin; anyone who registers that mailbox (if unowned) becomes admin via `makeAdmin` email match.

**Recommend:** Remove email from public UI and from hardcodes; use `app_metadata.role = 'admin'` set only in Dashboard/service role; rotate if this address was exposed as a soft secret.

### H2 — Chat / contact filters are client-only (and skipped for admins)

**Where:** `validateChatMessage` before `messages.insert`; `if (!isAdmin()) { … }`.

**Risk:** Direct REST/Realtime inserts bypass email/phone/off-platform URL filters. Admin bypass is intentional UX but widens abuse if admin JWT leaks. Filter regexes are incomplete (obfuscation, Unicode, `bit.ly`, SMS gateways, etc.).

**Recommend:** Postgres `BEFORE INSERT` trigger or Edge Function enforcing the same rules; never trust the client. Log violations.

### H3 — Sensitive actions lack server-side role checks

**Where:** `doQuote` (no `isBuilder()`), `loadAllRequests` (no `isAdmin()`), `acceptQuote` (no ownership check in JS), `go('admin'|'all-requests')` reachable without sidebar.

**Risk:** Attackers call the same Supabase writes the UI uses. Without RLS matching intent, unapproved users quote, anyone lists all requests, anyone accepts/pays any quote.

**Recommend:** RLS + RPC that asserts: quote only if `builder_status = 'approved'`; accept only if `requests.user_id = auth.uid()` and quote belongs to request; admin list only if `is_admin` from trusted claim.

### H4 — Auth hardening gaps encouraged by the app

**Where:** Login path tells ops to turn **off** “Confirm email”; client password minimum is **6** characters; session relies on standard Supabase JWT in local storage (XSS → session theft).

**Risk:** Unverified emails, weak passwords, stolen sessions = account takeover of clients/builders/admin.

**Recommend:** Keep email confirmation **on** (or magic link); raise password policy in Supabase Auth; short JWT expiry; consider MFA for admin; CSP to reduce XSS→token risk.

---

## Medium

### M1 — XSS: mostly mitigated; a few attribute / process gaps

**Good:** User-controlled text in lists/chat/admin cards generally runs through `esc()` before `innerHTML`. Toasts/auth messages use `textContent`.

**Gaps:**

- `data-uid`, `data-rid`, `data-qid`, `data-click` interpolate IDs without `esc()` (UUID-safe today; break if IDs ever become attacker-controlled strings).
- `r.description.slice(0, 120)` assumes `description` is a string (DoS/error, not XSS).
- Future “linkify” of chat URLs would reintroduce XSS/`javascript:` risks — keep rendering as escaped text or use strict allowlists + `rel="noopener noreferrer"`.

**Recommend:** Escape all attribute interpolations; prefer `textContent` / DOM APIs over template `innerHTML` for new UI.

### M2 — PII in client-readable tables

**Where:** `builder_applications` stores `email`, LinkedIn, portfolio; profiles expose `email` / `full_name`; Profile debug panel shows emails; admin UI lists applicant emails.

**Risk:** Broad `SELECT` policies expose applicant PII to other authenticated users; marketing/scraping; GDPR-style retention issues.

**Recommend:** Applicants read own row only; admins via privileged policy/RPC; minimize email copies (join `auth.users` server-side); drop debug admin-email panel from production builds.

### M3 — Fee and Stripe link are attacker-influenced globals

**Where:** `window.ORVO_FEE_PERCENT`, `window.STRIPE_PAYMENT_LINK`.

**Risk:** Console override → wrong fee lines / phishing Payment Link domain if UI ever trusts a mutable link without allowlisting.

**Recommend:** Fee and checkout URL only from server; pin Payment Link host to `buy.stripe.com` / your domain if kept temporarily.

### M4 — CDN Supabase UMD without SRI

**Where:** `index.html` loads `@supabase/supabase-js@2` from jsDelivr without integrity hash / pinned version lock in HTML beyond major.

**Risk:** Supply-chain compromise of CDN build → full account takeover via malicious client.

**Recommend:** Pin exact version + SRI, or self-host the bundle.

### M5 — Open redirect / tab abuse on payment

**Where:** `window.open(stripeLink, '_blank')` with config-controlled URL.

**Risk:** Low while config is yours; high if config is ever user-influenced or compromised deploy.

---

## Assumed Supabase RLS policies needed

Apply only after reviewing existing policies (drop conflicting permissive ones). Use **app_metadata** or a locked `profiles.is_admin` that clients **cannot** update.

```sql
-- 0) Lockdown helpers (recommended)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

create or replace function public.is_approved_builder()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.builder_status = 'approved'
  );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_approved_builder() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_approved_builder() to authenticated;

-- 1) profiles
alter table public.profiles enable row level security;

-- read: self; builders’ public names for chats they join can be narrowed later
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- insert: own row only; force non-admin defaults (trigger preferred)
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (
    id = auth.uid()
    and coalesce(is_admin, false) = false
    and builder_status is null
  );

-- update: own row but NEVER privilege columns (column-level via trigger below)
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_admin_all on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.is_admin := old.is_admin;
    -- users may set pending via apply RPC only; block self-approve/reject
    if new.builder_status is distinct from old.builder_status then
      if new.builder_status in ('approved', 'rejected') then
        raise exception 'builder_status change not allowed';
      end if;
      if new.builder_status = 'pending' and old.builder_status is not null
         and old.builder_status not in ('pending') then
        raise exception 'invalid builder_status transition';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_privileges on public.profiles;
create trigger trg_protect_profile_privileges
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- 2) builder_applications
alter table public.builder_applications enable row level security;

create policy apps_select_own_or_admin on public.builder_applications
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy apps_insert_own on public.builder_applications
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

create policy apps_update_own_pending on public.builder_applications
  for update to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'pending');

create policy apps_admin_review on public.builder_applications
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Prefer: approve/reject only via RPC that also sets profiles.builder_status

-- 3) requests
alter table public.requests enable row level security;

create policy requests_select on public.requests
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or (status = 'open' and public.is_approved_builder())
    or assigned_builder_id = auth.uid()
    or exists (
      select 1 from public.quotes q
      where q.request_id = requests.id and q.builder_id = auth.uid()
    )
  );

create policy requests_insert_own on public.requests
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'open');

create policy requests_update_owner on public.requests
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- Block clients from setting funded/in_progress without payment webhook (trigger/RPC)

-- 4) quotes
alter table public.quotes enable row level security;

create policy quotes_select on public.quotes
  for select to authenticated
  using (
    builder_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.requests r
      where r.id = quotes.request_id and r.user_id = auth.uid()
    )
  );

create policy quotes_insert_builder on public.quotes
  for insert to authenticated
  with check (
    builder_id = auth.uid()
    and public.is_approved_builder()
    and status = 'pending'
  );

create policy quotes_update_parties on public.quotes
  for update to authenticated
  using (
    builder_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.requests r
      where r.id = quotes.request_id and r.user_id = auth.uid()
    )
  )
  with check (true); -- tighten with trigger: only pending→accepted by owner; paid only via webhook

-- 5) messages
alter table public.messages enable row level security;

create policy messages_select_participants on public.messages
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.requests r
      where r.id = messages.request_id
        and (
          r.user_id = auth.uid()
          or r.assigned_builder_id = auth.uid()
          or exists (
            select 1 from public.quotes q
            where q.request_id = r.id and q.builder_id = auth.uid()
          )
        )
    )
  );

create policy messages_insert_participants on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.requests r
      where r.id = messages.request_id
        and (
          r.user_id = auth.uid()
          or r.assigned_builder_id = auth.uid()
          or exists (
            select 1 from public.quotes q
            where q.request_id = r.id and q.builder_id = auth.uid()
          )
        )
    )
  );

-- Add BEFORE INSERT validate_chat_message(body, request_id) trigger (server-side filter)

-- 6) payments — clients insert forbidden in prod; webhook/service_role only
alter table public.payments enable row level security;

create policy payments_select_own on public.payments
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- no insert/update/delete for authenticated in production
revoke insert, update, delete on public.payments from authenticated, anon;

-- 7) Realtime: only tables/policies above; ensure replication respects RLS
```

**Admin bootstrap (Dashboard / service role — not client):**

```sql
-- Example: set admin claim (Auth Admin API preferred)
-- update auth.users set raw_app_meta_data =
--   coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
-- where email = 'ADMIN_EMAIL_HERE';
```

---

## Hardening checklist for tonight

1. **Verify RLS** on `profiles`, `requests`, `quotes`, `messages`, `builder_applications`, `payments` — all enabled; no `USING (true)` for authenticated.
2. **Block self-elevation:** trigger or column grants so clients cannot set `is_admin` or `builder_status ∈ {approved,rejected}`.
3. **Approve builders only via admin RPC / Edge Function** (service role); remove client `approveBuilder` direct table updates or keep UI but fail closed without policy.
4. **Set admin via `app_metadata`**, remove `ORVO_ADMIN_EMAIL` / hardcode from public JS and Profile debug UI.
5. **Disable manual “record payment as paid”** path; leave Stripe unset ⇒ show “payments coming soon”, do not write `funded`/`paid`.
6. **Add chat filter trigger** (email/phone/off-platform); stop skipping enforcement for privilege roles at the DB layer.
7. **Re-enable email confirmation** (ignore in-app advice to turn it off); raise Auth password minimum.
8. **Confirm anon key only** in frontend (no `service_role` anywhere in Netlify/static host).
9. **Pin supabase-js + SRI** (or self-host); deploy CSP (`default-src 'self'`, allow Supabase origins).
10. **Smoke-test as a second throwaway user** (read-only checks): attempt select all applications/requests/messages; attempt update own `is_admin` / `builder_status`; attempt insert payment `paid` — all must fail. Do not automate destructive probes against production beyond these authz negatives if data is live.

---

## XSS `esc()` summary

| Surface | Escaped? |
|--------|----------|
| Request/quote/application text fields | Yes (`esc`) |
| Chat message bodies / names | Yes |
| Auth/toast/boot errors | `textContent` (good) |
| Sidebar chrome | Static HTML (ok) |
| `data-*` IDs | Not escaped (UUID-assumed) |
| Money / `ago()` | Numeric/derived (ok) |

---

## Out of scope / not done

- No authenticated probing of project `lbfysqtnarhkoqcnaivg` APIs.
- Supabase MCP unavailable (`needsAuth`); live policy dump not retrieved.
- No Stripe webhook or Edge Function code present to review.

---

*ORVO Role 02 — Security Auditor · recommend-only · 2026-08-23*

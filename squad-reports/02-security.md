# ORVO Role 02 — Security Auditor

**Scope:** `/workspace/index.html`, `app.js`, `supabase-config.js`, and shipped `sql/001_mvp_schema.sql` (project URL `https://lbfysqtnarhkoqcnaivg.supabase.co`).  
**Method:** Static review of client authz, RLS SQL, XSS escaping, payment stubs, PII. **No live exploitation** of production beyond noting the public anon URL/key already in-repo.  
**Note:** Whether `001_mvp_schema.sql` is fully applied in prod is unverified (Supabase MCP not authenticated). Findings treat the shipped SQL + client as the intended security model.

---

## Executive verdict

**Critical privilege escalation is designed into the current RLS + client combo.** `profiles` updates allow any user to set `is_admin` / `builder_status`; helpers `is_orvo_admin()` / `is_approved_builder()` trust those columns; therefore self-approve and self-admin unlock quotes, open jobs, applications, and admin policies. Payments can be inserted as `paid` from the browser. XSS escaping is generally solid. Treat tonight’s priority as **locking privilege columns + killing client-side “paid” writes**.

---

## Critical

### C1 — Self-admin / self-approve via `profiles` (RLS + client)

**SQL (`001_mvp_schema.sql`):**

```181:183:sql/001_mvp_schema.sql
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_orvo_admin())
  with check (id = auth.uid() or public.is_orvo_admin());
```

No column restriction. Insert policy only checks `id = auth.uid()`.

**Helpers trust the same mutable flags:**

```127:137:sql/001_mvp_schema.sql
create or replace function public.is_orvo_admin()
...
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  );
```

**Client reinforces the pattern:** `loadProfile` writes `is_admin: true` when email matches public `ORVO_ADMIN_EMAIL`; `isAdmin()` trusts `profile?.is_admin`; `approveBuilder` updates another user’s `builder_status` with no server role check beyond RLS.

**Impact if this SQL is live:** Any authenticated user can set `is_admin` / `builder_status = 'approved'` on their row → `is_orvo_admin()` / `is_approved_builder()` become true → admin read/update policies and builder quote/job access unlock. Circular trust: admin flag grants broader `profiles` updates for others.

**Recommend:** Privilege changes only via `service_role` / SECURITY DEFINER RPC; BEFORE UPDATE trigger freezing `is_admin` and blocking self-set `approved`/`rejected`; prefer `auth.jwt() → app_metadata.role = 'admin'` for `is_orvo_admin()`.

### C2 — Builder application status self-approval

**SQL:** `apps_update` allows `user_id = auth.uid() OR is_orvo_admin()` with no `WITH CHECK` on `status`. `apps_insert` does not force `status = 'pending'`.

**Client:** `doApply` upserts application; `approveBuilder` sets `status: 'approved'` + `profiles.builder_status`.

**Impact:** Applicant can set own application to `approved` (and, with C1, profile to match). Manual vetting is bypassable at the API layer.

**Recommend:** Applicants: insert/update only while `status = 'pending'` and cannot change `status` away from `pending`. Approve/reject RPC for admins only (updates application + profile atomically).

### C3 — Client-written “paid” / “funded” without Stripe

**Client `acceptQuote`:** `confirm()` → updates quote/request → `payments.insert` with `status: 'paid'` when `STRIPE_PAYMENT_LINK` is empty; generic Payment Link (not amount/quote-bound) when set; no webhook.

**SQL:** `payments_insert` / `payments_update` allow the paying user to insert/update their rows with arbitrary `status` / amounts. `quotes_update` / `requests_update` allow request owner (and assigned builder on requests) to flip statuses.

**Impact:** Fake funding; post-pay chat rules unlock; no escrow integrity; fee computed from `window.ORVO_FEE_PERCENT` (client-overridable).

**Recommend:** Revoke authenticated insert/update on `payments`; webhook/Edge Function only. Status transitions `accepted` → `paid` / `funded` only from that path. Disable manual confirm in production builds.

### C4 — `profiles` readable by every authenticated user

```173:174:sql/001_mvp_schema.sql
create policy profiles_select on public.profiles for select to authenticated
  using (true);
```

**Impact:** Full PII/recon dump: emails, names, `is_admin`, `builder_status` for all users. Helps target the admin account and map who is approved.

**Recommend:** Select self + limited public fields for chat counterparts (id, full_name) via view or narrow policy; admins get broader select.

---

## High

### H1 — Admin email is a public client constant

**Where:** `supabase-config.js` `ORVO_ADMIN_EMAIL`; hardcode in `app.js`; Profile / non-admin Admin view disclose it.

**Impact:** Phishing / takeover target; signup as that address (if free) becomes admin via `makeAdmin`.

**Recommend:** Remove from frontend; set admin only in Auth `app_metadata` or one-time service-role SQL (comment at bottom of schema is fine for bootstrap, not for shipping email in JS).

### H2 — Chat filters are browser-only (admins skip)

**Where:** `validateChatMessage` before insert; skipped when `isAdmin()`.

**SQL:** `messages_insert` only checks `sender_id` + `can_access_request` — no body validation.

**Impact:** Direct REST inserts bypass email/phone/off-platform rules. Open-request access for “approved” builders (C1) widens who can spam/phish in threads.

**Recommend:** BEFORE INSERT trigger / Edge Function with the same rules; keep admin override auditable if needed.

### H3 — UI role checks are not enforcement

**Where:** `doQuote` does not call `isBuilder()` (RLS does via `is_approved_builder` — but see C1); `loadAllRequests` has no `isAdmin()` guard; `approveBuilder` / `acceptQuote` assume honest UI; `go('admin')` reachable without sidebar.

**Impact:** Defense in depth missing; any RLS mistake is immediately exploitable from DevTools.

**Recommend:** Keep UI checks for UX; enforce in RLS/RPC. Add ownership checks in payment accept RPC (`requests.user_id = auth.uid()`).

### H4 — Auth posture weakened by product copy

**Where:** Login error suggests turning **off** email confirmation; password min **6** chars.

**Impact:** Unverified accounts, weak passwords, easier takeover of high-value admin/builder identities.

**Recommend:** Keep confirmation on; strengthen Auth password settings; MFA for admin.

### H5 — Assigned builder can update requests

**SQL:** `requests_update` `using (user_id = auth.uid() or is_orvo_admin() or assigned_builder_id = auth.uid())` with no status transition rules.

**Impact:** Assigned builder may alter status/assignment fields depending on column grants — dispute/funding integrity risk.

**Recommend:** Narrow builder updates (e.g. delivery markers only) via RPC; freeze payment-related statuses.

---

## Medium

### M1 — XSS: mostly good; attribute edge cases

**Good:** Request/quote/app/chat text uses `esc()`; toasts/auth use `textContent`.

**Gaps:** `data-uid` / `data-rid` / `data-qid` / `data-click` unescaped (OK while UUIDs); don’t linkify chat without strict allowlists; pin future HTML changes to `esc` or DOM APIs.

### M2 — Application PII + LinkedIn/portfolio

Stored on `builder_applications`; select limited to own/admin in SQL (good) **if** policies applied. Client still uploads email copies. Profile-wide select (C4) remains the larger PII leak.

### M3 — Fee / Stripe globals

`ORVO_FEE_PERCENT`, `STRIPE_PAYMENT_LINK` on `window` — overrideable; Payment Link not bound to quote amount.

### M4 — CDN `supabase-js` without SRI

`index.html` jsDelivr UMD `@2` — supply-chain risk. Pin version + integrity or self-host.

### M5 — Realtime on `messages`

Publication added; access follows `can_access_request`. After C1 fix, re-validate Realtime does not broaden beyond SELECT policies.

---

## Assumed / replacement RLS snippets (tonight)

Ship as a follow-up migration; drop conflicting policies from `001_mvp_schema.sql` first. Goal: break C1–C3.

```sql
-- Admin from JWT app_metadata (set only via Dashboard / service_role)
create or replace function public.is_orvo_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

-- Freeze privilege columns for non-admins
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_orvo_admin() then
    new.is_admin := old.is_admin;
    if tg_op = 'UPDATE'
       and new.builder_status is distinct from old.builder_status
       and new.builder_status in ('approved', 'rejected') then
      raise exception 'builder_status elevation not allowed';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_privileges on public.profiles;
create trigger trg_protect_profile_privileges
  before insert or update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- On INSERT, force non-admin defaults when not admin
create or replace function public.profiles_insert_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_orvo_admin() then
    new.is_admin := false;
    if new.builder_status is null or new.builder_status in ('approved', 'rejected') then
      new.builder_status := 'none';
    end if;
  end if;
  return new;
end;
$$;
-- (merge into protect trigger for INSERT if preferred)

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_orvo_admin());

-- Optional: public name map for chat (id, full_name only) via security_invoker view

drop policy if exists apps_insert on public.builder_applications;
create policy apps_insert on public.builder_applications for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

drop policy if exists apps_update on public.builder_applications;
create policy apps_update_own_content on public.builder_applications for update to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'pending');

create policy apps_update_admin on public.builder_applications for update to authenticated
  using (public.is_orvo_admin()) with check (public.is_orvo_admin());

-- Payments: no client writes in production
drop policy if exists payments_insert on public.payments;
drop policy if exists payments_update on public.payments;
revoke insert, update, delete on public.payments from authenticated, anon;

-- Chat body filter (sketch)
create or replace function public.messages_enforce_chat_rules()
returns trigger
language plpgsql
as $$
begin
  if new.body ~* '([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})' then
    raise exception 'email not allowed in chat';
  end if;
  -- extend: phone + off-platform URL denylist matching app.js
  return new;
end;
$$;

drop trigger if exists trg_messages_chat_rules on public.messages;
create trigger trg_messages_chat_rules
  before insert on public.messages
  for each row execute function public.messages_enforce_chat_rules();
```

**Approve builder RPC (admin only):**

```sql
create or replace function public.admin_set_builder_status(target uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_orvo_admin() then
    raise exception 'not admin';
  end if;
  if new_status not in ('approved', 'rejected', 'pending') then
    raise exception 'bad status';
  end if;
  update public.builder_applications
    set status = new_status, reviewed_at = now()
    where user_id = target;
  update public.profiles
    set builder_status = new_status
    where id = target;
end;
$$;

revoke all on function public.admin_set_builder_status(uuid, text) from public;
grant execute on function public.admin_set_builder_status(uuid, text) to authenticated;
```

---

## Hardening checklist for tonight

1. Confirm in Supabase Dashboard whether `001_mvp_schema.sql` (or older `sql-*.sql`) is applied; dump current policies.
2. **Patch C1:** trigger + stop client `profiles` writes of `is_admin` / approved status; move admin to `app_metadata`.
3. **Patch C2:** application update policies cannot change `status` except admin RPC.
4. **Patch C3:** revoke client payment writes; disable manual `paid`/`funded` in `acceptQuote` for prod.
5. Replace `profiles_select using (true)` with self/admin (or safe name view).
6. Remove admin email from `supabase-config.js` / UI debug panels.
7. Add DB chat filter trigger; keep email confirmation **on**; raise password minimum.
8. Pin `supabase-js` + SRI; ensure no `service_role` in Netlify/static assets.
9. Negative tests as a second throwaway user (read-only authz checks only): update own `is_admin`, set `builder_status=approved`, select others’ applications, insert `payments` with `paid` — all must fail.
10. After fixes, re-check Realtime + `can_access_request` with a non-approved account.

---

## XSS `esc()` scorecard

| Surface | Status |
|--------|--------|
| Titles, bios, skills, chat bodies | `esc()` |
| Auth / toast / boot | `textContent` |
| Sidebar labels | Static |
| `data-*` ids | Unescaped UUIDs |
| Money / relative time | Derived safe |

---

## Out of scope

- No authenticated API probing of the live project.
- Supabase MCP `needsAuth` — live advisors/policies not pulled.
- Stripe webhook / Edge Functions not present in repo.

---

*ORVO Role 02 — Security Auditor · recommend-only · 2026-08-23*

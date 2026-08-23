# Founder SQL smoke checklist

Run in Supabase **SQL Editor** after deploying migrations. Check each box in ops notes.

## One paste (recommended)

Supabase → **SQL Editor** → paste entire file → **Run** once.

- Raw file: [APPLY-ALL-001-020.sql](https://raw.githubusercontent.com/danielmenparan-lang/orvo/cursor/orvo-local-site-3bd5/sql/APPLY-ALL-001-020.sql)
- Repo path: `sql/APPLY-ALL-001-020.sql` (includes 001→020 + admin SQL at bottom)
- Interactive checklist: `founder-checklist.html` (copy button + saved checkboxes)

## Apply order (step-by-step alternative)

- [ ] `sql/001_mvp_schema.sql`
- [ ] `sql/002_payments_lockdown.sql`
- [ ] `sql/003_chat_and_trust.sql`
- [ ] `sql/004_global.sql`
- [ ] `sql/005_invites.sql`
- [ ] `sql/006_connect.sql` (optional until Connect)
- [ ] `sql/007_status_guards.sql` (`awaiting_payment` + payment unique + quote ≥ $50)
- [ ] `sql/008_quote_eta.sql` (`quotes.delivery_days`)
- [ ] `sql/009_loop_hygiene.sql` (quote status + indexes)
- [ ] `sql/010_payment_stripe_fields.sql` (held_at + Connect fields)
- [ ] `sql/011_message_limits.sql` (body ≤ 2000)
- [ ] `sql/012_notifications.sql` (optional inbox)
- [ ] `sql/013_request_search.sql` (optional FTS indexes)
- [ ] `sql/014_quote_notify.sql` (quote → notification; needs 012)
- [ ] `sql/015_status_notify.sql` (status change → inbox)
- [ ] `sql/016_message_notify.sql` (chat message → inbox)
- [ ] `sql/017_stripe_webhook_events.sql` (optional until Stripe webhook live)
- [ ] `sql/018_builder_application_notify.sql` (approve/reject → inbox)
- [ ] `sql/019_notifications_unread_idx.sql` (unread partial index)
- [ ] `sql/020_payment_checkout_open.sql` (checkout_open status comment)

## Privilege

```sql
update public.profiles set is_admin = true where email = 'danielmen.paran@gmail.com';
```

- [ ] Founder can open **Review builders**
- [ ] Second account **cannot** set `is_admin` via client (Profile shows Client)

## Money honesty

- [ ] Accept quote → request `awaiting_payment`, payment `pending` only
- [ ] No `funded` without webhook
- [ ] Release blocked while payment `pending`
- [ ] Dispute freezes release

## Chat

- [ ] Message with email/phone rejected (client + SQL 003)
- [ ] Cold Message gone — only after quote / invite / assign

## Invites

- [ ] Admin All requests → Invite builder
- [ ] Builder sees **Invited jobs**

## Stripe (when secrets ready)

- [ ] Edge secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, service role
- [ ] Deploy `create-checkout-session`, `stripe-webhook`, `create-connect-account`
- [ ] Test Checkout → payment `held`, request `funded`

**Applied on (date):** ________________

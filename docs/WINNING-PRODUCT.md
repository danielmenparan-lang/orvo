# ORVO — Winning Product (GLOBAL)

## תקציר מנהלים

**ORVO הוא מרקטפלייס גלובלי** להעסקת בנאים מאושרים לבניית סוכני AI מותאמים. לקוחות מכל העולם.

זרימה: בקשה → הצעות → צ'אט → מימון → מסירה → שחרור תשלום.

אסור לסמן funded בלי Stripe אמיתי. עמלה מייסדים 0% → יעד 10–12%.

## Positioning

ORVO = hire vetted builders for **custom AI agents**, worldwide.

| Lock | Detail |
|------|--------|
| Buyer | Anyone who needs a custom agent (SMB, startup, operator) |
| Supply | Manually vetted builders |
| Geography | **Global** (English UI) |
| Channels | WhatsApp, voice, automation, CRM, other |

See `docs/payments/STRIPE-CONNECT-MVP.md` for money path.

## Campaign shipped (~10h, 2026-08-23)

Branch `cursor/orvo-local-site-3bd5` · PR #2 · Demo on Netlify.

| Area | Shipped |
|------|---------|
| Integrity | No fake pay; chat gate; sibling quote decline; payments RLS in repo |
| Loop | Login routing; apply edit; accept & pay sheet; release from `held` only |
| Notifications | Inbox + unread badge + Realtime toasts (sql/012–019) |
| Stripe | Edge scaffolds (checkout, webhook, connect, release) + deploy checklist |
| Polish | Form counters, thread unread, search filters, status spine, offline banner |
| SEO | hire / for-builders pages + redirects |

**Founder unblock:** Apply sql/001→020 · Stripe secrets · flip `ORVO_CHECKOUT_LIVE` after smoke test.

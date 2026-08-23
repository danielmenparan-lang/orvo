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

**Start** ~01:41 UTC · **Finale** ~11:42 UTC  
Branch `cursor/orvo-local-site-3bd5` · [PR #2](https://github.com/danielmenparan-lang/orvo/pull/2) · [Demo](https://fantastic-eclair-0b2c66.netlify.app/)

| Area | Shipped |
|------|---------|
| Integrity | No fake pay; chat gate; sibling quote decline; payments RLS (sql/002) |
| Loop | Role routing; apply edit; accept & pay sheet; deliver/release/dispute/review |
| SQL | Migrations **001→020** in repo (notifications, invites, guards, webhook dedupe) |
| Notifications | Inbox + unread badge + Realtime toasts (012–019) |
| Stripe | Edge scaffolds (checkout, webhook, connect, release) + deploy checklist + UUID auth |
| UX | Status spine, skeletons, form counters, search, offline banner, post funnel |
| Payments UX | Pay resume, Complete payment CTAs, checkout `rid` deep link, `checkout_open` |
| Admin | KPI drill-down, disputes badge + Realtime, status filter chips |
| Builder | Invited jobs, active jobs strip, withdraw quote |
| SEO | hire / for-builders pages, sitemap, OG meta |
| Tests | chat-policy, events, status-spine, edge-auth |

**Judge:** `squad-reports/JUDGE-WAVE-10h.md` — integrity **PASS**, Stripe **BLOCKED** (secrets).

**Founder brief (HE):** `squad-reports/CAMPAIGN-FINALE-HE.md`

**Founder unblock:** Apply sql/001→020 · set `is_admin` · Stripe secrets + Edge deploy · flip `ORVO_CHECKOUT_LIVE` after smoke test.

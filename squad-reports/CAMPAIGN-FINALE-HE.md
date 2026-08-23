# תדריך סיום קמפיין — ORVO (~10 שעות)

**למייסד · 2026-08-23 · סיום ~11:42 UTC**  
**התחלה:** ~01:41 UTC · **משך:** ~10 שעות רצופות של pulses  
**אתר:** https://fantastic-eclair-0b2c66.netlify.app/  
**ענף:** `cursor/orvo-local-site-3bd5` · **PR:** https://github.com/danielmenparan-lang/orvo/pull/2

---

## מה נבנה (GLOBAL — לא ישראל בלבד)

ORVO = **מרקטפלייס גלובלי** להעסקת בנאים מאושרים לסוכני AI מותאמים. UI באנגלית; לקוחות מכל העולם.

### גלים ראשונים (Wave 1–2)

| גל | תוכן |
|----|------|
| **Wave 1** | ביטול fake pay; דחיית הצעות אחיות; תוויות סטטוס; RLS payments |
| **Wave 2B** | Pay sheet; Stripe MVP doc; `awaiting_payment` + `pending` בלבד |
| **Wave 2C** | Login routing; chat gate; edit application |
| **Wave 2D** | sql/003 — פילטר צ'אט, disputes, reviews, deliveries |
| **Wave 2A/E/G** | Landing גלובלי; design system; SEO + LAUNCH-KIT |

### Pulses 03:00–11:30 (סיכום)

| אזור | מה נשלח |
|------|---------|
| **SQL** | migrations **001→020** (notifications, invites, guards, webhook dedupe) |
| **יושרה** | אין fake funded/paid; release רק מ-`held`; אין self-admin |
| **לולאה** | post → quote → chat → accept → deliver → release/dispute/review |
| **התראות** | inbox + badge + Realtime + sql/014–016 triggers |
| **Stripe** | 4 Edge Functions **implemented** (checkout, webhook, connect, release) + checklists |
| **UX** | status spine, skeletons, counters, search, offline banner |
| **Conversion** | hero → signup → Post modal; Complete payment / pay resume |
| **Admin** | KPI tiles, disputes badge+Realtime, status filters, invites |
| **Builder** | Invited jobs, active jobs strip, withdraw quote |
| **SEO** | hire / for-builders pages, sitemap, OG meta |

### Tests (repo)

```bash
node tests/chat-policy.test.js
node tests/events.test.js
node tests/status-spine.test.js
node tests/edge-auth.test.js
```

---

## פסק דין (Judge)

**Integrity PASS · Stripe BLOCKED**

| שער | סטטוס |
|-----|--------|
| No fake funded/paid | ✅ |
| Chat relationship gate | ✅ |
| Release requires held | ✅ |
| Notifications spine | ✅ |
| Edge scaffolds + validation | ✅ |
| Live Stripe Checkout | ❌ secrets |
| SQL 001→020 בפרוד | ❓ founder |

פירוט: `squad-reports/JUDGE-WAVE-10h.md`

---

## האמת הקשה (אל תפתחו מחדש)

- **אין Checkout Stripe חי** עד secrets + deploy + smoke test.
- **אין** `STRIPE_PAYMENT_LINK` — נתיב מת.
- **אסור** Israel-only hero — positioning **גלובלי**.
- Accept → `awaiting_payment` + payment `pending` — **לא** funded.
- Webhook בלבד כותב `held` / `funded`.

---

## חסמים שנותרו (Founder-only)

| # | חסם | פעולה |
|---|-----|--------|
| 1 | SQL לא בפרוד | **הדבקה אחת:** `sql/APPLY-ALL-001-020.sql` · Profile → Copy APPLY-ALL SQL · `founder-checklist.html` |
| 2 | אין admin | Profile → **Copy is_admin SQL** (אחרי signup) |
| 3 | Stripe secrets | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, service role |
| 4 | Edge deploy | `bash scripts/deploy-stripe.sh` · Profile → Setup health → Re-check |
| 5 | `ORVO_CHECKOUT_LIVE` | `false` — flip רק **אחרי** smoke test |

מדריך: `docs/payments/STRIPE-DEPLOY-CHECKLIST.md`

---

## פעולות למחר (סדר מומלץ)

### בוקר — תשתית (2–3 שעות)

1. **Supabase SQL** — הדבקה אחת: `APPLY-ALL-001-020.sql` (או 001→020), סמן תאריך ב-`docs/FOUNDER-SQL-SMOKE.md`
2. **Admin** — וודא Review builders + All requests + Disputes
3. **Smoke ידני** — post → quote → accept → וודא `awaiting_payment` (לא funded)

### צהריים — Stripe test mode (אם מוכן)

4. Edge secrets + `bash scripts/deploy-stripe.sh`
5. Webhook endpoint ב-Stripe Dashboard
6. Smoke: Checkout test card → webhook → `held` + `funded`
7. Release Transfer (implemented — needs Connect onboarding on builder)
8. Connect Express onboarding לבונה אחד
9. Flip `ORVO_CHECKOUT_LIVE=true` + redeploy Netlify

### אחר הצהריים — GTM (רק אם יושרה ירוקה)

10. פרסום מ-`docs/marketing/LAUNCH-KIT.md` — **מסר כנה**:

> Post a brief · vetted builders quote worldwide · Checkout holds funds until delivery (when live)

| סדר | ערוץ |
|-----|------|
| 1 | LinkedIn — global AI agent marketplace |
| 2 | X / IG — לינק לדמו |
| 3 | WhatsApp status — acquisition אופציונלי, לא product geo |

**CTA אחד.** אל תבטיחו "תשלום מאובטח בסטרייפ" עד webhook live.

### ערב — concierge

11. Review builder applications (2× ביום)
12. Invite 3–5 בונים מאושרים לבקשות פתוחות
13. עקוב אחרי disputes / notifications inbox

---

## מה **לא** לעשות מחר

- לא לפתוח מחדש Israel-only positioning
- לא להוסיף fake pay paths בדפדפן
- לא לפרסם "pay via Stripe" לפני webhook
- לא לבזבז זמן על פיצ'רים חדשים לפני SQL + Stripe

---

## קישורים

| מסמך | תפקיד |
|------|--------|
| `docs/WINNING-PRODUCT.md` | אסטרטגיה + סיכום קמפיין |
| `squad-reports/JUDGE-WAVE-10h.md` | פסק דין סופי |
| `squad-reports/CAMPAIGN-LOG.md` | יומן pulses מלא |
| `squad-reports/20-ops-backlog.md` | backlog (P0/P1 DONE) |
| `founder-checklist.html#stripe` | smoke + Stripe |
| `docs/payments/STRIPE-DEPLOY-CHECKLIST.md` | deploy Stripe |
| `docs/marketing/LAUNCH-KIT.md` | פרסום |

---

## Verdict

**הקמפיין הושלם.** המוצר כנה, הלולאה שלמה, וה-scaffolds מוכנים. השלב הבא הוא **founder execution** — SQL, secrets, smoke, פרסום כנה.

קפה → SQL → admin → Stripe test → פרסום (אם ירוק) → concierge.

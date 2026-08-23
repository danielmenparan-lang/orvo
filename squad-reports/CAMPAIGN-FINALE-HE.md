# תדריך סיום קמפיין — ORVO (~10 שעות)

**למייסד · 2026-08-23 ~11:00 UTC**  
אתר: https://fantastic-eclair-0b2c66.netlify.app/  
ענף: `cursor/orvo-local-site-3bd5` · PR #2

---

## מה נבנה (GLOBAL — לא ישראל בלבד)

ORVO = **מרקטפלייס גלובלי** להעסקת בנאים מאושרים לסוכני AI מותאמים. UI באנגלית; לקוחות מכל העולם.

| אזור | מה נשלח |
|------|---------|
| יושרה | אין fake funded/paid; צ'אט רק אחרי quote/invite; release רק מ-held |
| לולאה | routing לפי תפקיד; accept & pay sheet; decline sibling quotes |
| התראות | inbox + badge + Realtime (sql/012–019) |
| Stripe | Edge scaffolds + checklist — **חסום על secrets** |
| פולish | counters, חיפוש, post funnel, pay resume, admin KPI |

---

## האמת הקשה (אל תפתחו מחדש)

- **אין Checkout Stripe חי** עד secrets + deploy + smoke test.
- **אין STRIPE_PAYMENT_LINK** — נתיב מת.
- **אסור** Israel-only hero — positioning גלובלי.
- Accept → `awaiting_payment` + `pending` בלבד — לא funded.

---

## 3 פעולות מייסד (P0)

1. **SQL** — הרץ `sql/001` → `sql/020` ב-Supabase; סמן תאריך ב-`docs/FOUNDER-SQL-SMOKE.md`.
2. **Admin** — `update public.profiles set is_admin = true where email = '…';`
3. **Stripe** — עקוב אחרי `docs/payments/STRIPE-DEPLOY-CHECKLIST.md`:
   - secrets ב-Edge
   - deploy 4 functions
   - webhook test mode
   - רק אז: `ORVO_CHECKOUT_LIVE = true` ב-`supabase-config.js`

---

## פרסום (רק אם יושרה ירוקה)

מתוך `docs/marketing/LAUNCH-KIT.md` — **מסר כנה**:

> "Post a brief · vetted builders quote · Checkout coming soon for held payments"

| סדר | ערוץ |
|-----|------|
| 1 | LinkedIn — global hire AI agent builders |
| 2 | X / IG — לינק לדמו |
| 3 | WhatsApp status — אופציונלי ( acquisition, לא product geo ) |

**CTA אחד.** אל תבטיחו "תשלום מאובטח בסטרייפ" עד webhook live.

---

## קישורים

| מסמך | תפקיד |
|------|--------|
| `docs/WINNING-PRODUCT.md` | אסטרטגיה + סיכום קמפיין |
| `squad-reports/JUDGE-WAVE-10h.md` | פסק דין סופי |
| `squad-reports/20-ops-backlog.md` | backlog |
| `founder-checklist.html` | smoke gates |
| `docs/payments/STRIPE-DEPLOY-CHECKLIST.md` | Stripe |

---

## Verdict

**Integrity PASS · Stripe BLOCKED.** המוצר כנה ודק — השלב הבא הוא secrets + SQL בפרוד, לא עוד פיצ'רים בדפדפן.

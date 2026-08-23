# תדריך בוקר — ORVO

**למייסד שמתעורר · 2026-08-23**  
אתר חי: https://fantastic-eclair-0b2c66.netlify.app/  
ענף: `cursor/orvo-local-site-3bd5`

---

## מה נעשה בלילה

- צוות overnight + דוחות `01`–`17`, `19`, `20` תחת `squad-reports/`.
- סכמת MVP + RLS + נעילות privilege: `sql/001_mvp_schema.sql`.
- ערכת השקה HE: `docs/marketing/LAUNCH-KIT.md` — **לא פורסם אוטומטית**.
- מוצר: כותרת לבקשה; Mark delivered / Release; **אין יותר טענת "via Stripe"** באתר; `is_admin` לא נכתב מהדפדפן.
- **Wave 1:** `Accept` כבר **לא** מסמן `funded`/`paid` — סטטוס `awaiting_payment` + דחיית הצעות אחיות (`WAVE1-DONE.md`).
- אסטרטגיה: `docs/WINNING-PRODUCT.md` · באקלוג: `squad-reports/20-ops-backlog.md`.

---

## האמת הקשה

עדיין **אין Checkout Stripe חי**.  
אבל גם **אין יותר שקר של "שולם" בלי כסף** — אחרי Accept הסטטוס הוא המתנה לתשלום. אפשר לגייס בונים/המתנה; אל תבטיחו "תשלום מאובטח בסטרייפ" עד Connect+webhook.

---

## 3 החלטות להיום

1. **נישה** — לאשר: סוכני WhatsApp לעסקים בישראל בלבד.  
2. **פרסום** — אפשר המתנה+בונים היום (עם מסר כנה על תשלומים).  
3. **אדמין** — לוודא `is_admin=true` ב־Supabase לחשבון שלך; להריץ `sql/001_mvp_schema.sql` אם עוד לא.

---

## מה לפרסם (אם יוצאים)

מתוך `docs/marketing/LAUNCH-KIT.md`:

| סדר | ערוץ | מה |
|-----|------|-----|
| 1 | LinkedIn | פוסט המתנה מ־`10-social.md` |
| 2 | X / IG Story | אותו מסר + לינק |
| 3 | סטטוס וואטסאפ | שורה קצרה + לינק |
| 4 | 10 דמאים לעסקים + 10 לבונים | LAUNCH-KIT §3 |

**CTA אחד ליום.** יעדי 30 יום: 40 נרשמים · 8 בונים · 12 בקשות · 3 עסקאות בתנועה.

---

## למפתחים אחרי אישור

גל 1: חסימת fake-pay, דחיית הצעות אחים, נעילת payments RLS, ניקוי Profile debug.  
פירוט: `squad-reports/20-ops-backlog.md`.

---

## קישורים

| מסמך | תפקיד |
|------|--------|
| `docs/WINNING-PRODUCT.md` | אסטרטגיה |
| `docs/marketing/LAUNCH-KIT.md` | פרסום |
| `squad-reports/20-ops-backlog.md` | P0/P1/P2 + 3 גלים |
| `squad-reports/07-positioning.md` | נישה |
| `squad-reports/03-payments.md` | Stripe |
| `squad-reports/01-judge.md` | פסק דין |

קפה → החלטות → פרסום כנה → סקירת בונים פעמיים ביום.

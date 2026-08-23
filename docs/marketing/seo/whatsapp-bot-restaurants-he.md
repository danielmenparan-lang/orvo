# SEO draft — סוכן / בוט וואטסאפ למסעדה (עברית)

> **Product note (2026-08-23):** ORVO is a **global** marketplace (English-first). This HE page is an **optional regional acquisition channel**, not a geography lock on the product. Homepage + EN builders page stay global.

**Slug (static SPA):** `/whatsapp-restaurants.html`  
**Canonical intent:** commercial — בעל/ת מסעדה או קפה שרוצים סוכן AI לוואטסאפ (הזמנות / תפריט / מטבח).  
**Primary CTA:** פרסמו בקשה → `index.html?utm_source=seo&utm_medium=landing&utm_campaign=wa_restaurant`  
**Secondary CTA:** רשימת מייסדים / הרשמה  
**Source outlines:** `squad-reports/09-content.md` § A1 · `08-gtm.md` (global-first)  
**Live HTML:** `whatsapp-restaurants.html` (שורש האתר — ראו `pages/README.md`)

---

## Meta

| Field | Copy |
|-------|------|
| **Title** (≤60) | סוכן AI לוואטסאפ למסעדה \| ORVO |
| **Meta description** (≤155) | סוכן AI לוואטסאפ למסעדה. מפרסמים בקשה ב־ORVO, בונים מאומתים שולחים הצעות, צ'אט ותשלום בפלטפורמה. |
| **H1** | ORVO — סוכן AI לוואטסאפ למסעדה |
| **lang / dir** | `he` / `rtl` |
| **hreflang** | `he` self; `x-default` → homepage עד שיש מראה EN |

**Primary keywords:** בוט וואטסאפ למסעדה · סוכן AI לוואטסאפ · הזמנות וואטסאפ אוטומטי · בוט וואטסאפ מחיר  
**Internal links:** דף הבית · לבונים (`#builders`) · איך זה עובד (`#how`)

---

## Page outline (publish-ready)

### 1. Hero (מסך ראשון — מותג דומיננטי)
- **Brand:** ORVO (Playfair / לוגו)
- **Headline:** סוכן AI לוואטסאפ למסעדה — בונים מאומתים
- **Lead:** הלקוח כותב ב־23:40. אתם ישנים. ההזמנה מתה. מפרסמים בקשה אחת ב־ORVO ומקבלים הצעות מבונים שמדברים עברית ובונים על WhatsApp.
- **CTA primary:** פרסמו בקשה  
- **CTA secondary:** איך ORVO עובד  
- **אין** סטטיסטיקות / תגיות צפות / כרטיסי מחיר ב־hero

### 2. מה הסוכן עושה (עבודה אחת לסקשן)
- מענה על תפריט, שעות, אלרגיות
- קבלת הזמנה לאיסוף / משלוח
- התראה למטבח / קופה
- עברית טבעית — לא תבנית אנגלית מתורגמת

### 3. מתי DIY לא מספיק
- SaaS / BSP (~₪97–₪500 לחודש) מצוין לזרימות פשוטות
- מותאם (~₪3,500–₪12,000) כשיש CRM מוזר, התראות מטבח, עברית מדויקת, API רשמי
- ORVO = לגייס **בונה** למותאם — לא עוד כלי גרירה

### 4. איך ORVO עובד
1. מפרסמים בקשה (תקציב + מה חייב לעבוד)
2. בונים מאומתים שולחים הצעות (יעד ~48 שעות; בחודש השקה גם התאמה ידנית)
3. צ'אט בפלטפורמה → תשלום דרך ORVO → שחרור אחרי מסירה

### 5. מי בונה
- אימות ידני (תיק / Loom)
- Meta WhatsApp Cloud API / WABA, n8n/Make, UX בעברית
- בלי ספאם בפיד ציבורי — הזמנות ממוקדות

### 6. תמחור (מסגרת, לא מחיר מזויף)
- שבבי תקציב להצעה: ₪3,500 · ₪6,500 · ₪12,000 · מותאם
- ב־ORVO מפרסמים תקציב ומקבלים הצעות — בלי “מחיר קסם” בדף

### 7. FAQ (Schema FAQPage כשמוכנים)

**כמה זמן עד הצעות?**  
בדרך כלל תוך 48 שעות. בחודש ההשקה מתאימים גם ידנית.

**האם משלמים דרך ORVO?**  
כן — מדברים ומשלמים בפלטפורמה (מסלול Stripe). בלי להעביר כסף בוואטסאפ פרטי.

**בוט תבניות מול סוכן AI?**  
תבניות = זרימות קבועות. סוכן מותאם = הקשר, עברית, חיבור תפריט/מטבח/CRM.

**צריך WhatsApp Business API?**  
לרוב כן לפרודקשן. הבונים יודעים להנחות API רשמי מול לא רשמי.

**כמה זה עולה?**  
בשוק: ~₪3,500–₪12,000+ לפי מורכבות. מפרסמים תקציב ב־ORVO.

### 8. CTA חוזר
פרסמו בקשה למסעדה · או הצטרפו לרשימת המייסדים

---

## Brief template (להדבקה במוצר)

> בוט וואטסאפ למסעדה: מענה על תפריט ושעות, קבלת הזמנה לאיסוף/משלוח, התראה למטבח. עברית. תקציב משוער ₪6,500.

---

## Ship checklist

- [x] Draft markdown (this file)
- [x] Static HTML landing `whatsapp-restaurants.html`
- [ ] Netlify/indexable confirm after deploy
- [ ] FAQ JSON-LD (optional follow-up)
- [ ] Clinic sibling page (Priority B)

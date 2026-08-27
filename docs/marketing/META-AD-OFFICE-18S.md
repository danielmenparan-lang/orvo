# ORVO24 — Meta ad 18s (office skit)

**Format:** 9:16 vertical · 15–20s · Reels / Stories / Feed  
**Domain:** https://orvo24.com  
**Tone:** קליל, משרד סטארטאפ, punchline על marketplace — לא מלודרמה.

---

## תסריט (עברית — קול + כתוביות)

| זמן | ויזואל | דיאלוג | כתובית על המסך |
|-----|--------|--------|----------------|
| 0:00–0:02 | משרד בהיר, 4 אנשים במחשבים | — | — |
| 0:02–0:05 | אישה סוגרת לaptop, קמה, הולכת לדלת | — | — |
| 0:05–0:07 | בחור מהשולחן מסתכל | **גיא:** "רגע, לא מוקדם?" | רגע, לא מוקדם? |
| 0:07–0:10 | היא עוצרת ליד הדלת, חיוך | **נועה:** "הסוכן שלי סיים לי את המשימות." | הסוכן שלי סיים לי את המשימות |
| 0:10–0:12 | גיא מבולבל | **גיא:** "אבל את לא יודעת לבנות סוכן…" | אבל את לא יודעת לבנות סוכן… |
| 0:12–0:14 | היא מרימה טלפון | **נועה:** "נכנסתי ל-orvo24.com" | orvo24.com |
| 0:14–0:18 | מסך מלא: mock האתר + CTA | VO (קריינות): | **ORVO** — מרקטפלייס לסוכני AI. בונים מאומתים. אתה מפרסם, הם בונים. |

**Hook ל-3 שניות הראשונות:** מישהי עוזבת בארבע — כולם עדיין עובדים. עוצר את הגלילה.

---

## גרסה EN (אם קהל גלובלי)

| Line | Copy |
|------|------|
| Guy | "Leaving already?" |
| Her | "My agent finished my tasks." |
| Guy | "But you can't build an agent…" |
| Her | "orvo24.com" |
| End card | ORVO — Hire vetted AI agent builders. Post. Quote. Pay on-platform. |

---

## Meta specs

| Placement | Ratio | Resolution | Max length |
|-----------|-------|------------|------------|
| Reels / Stories | 9:16 | 1080×1920 | 15–30s |
| Feed | 4:5 or 1:1 | 1080×1350 / 1080×1080 | same |

**Safe zone:** טקסט ולוגו ב-80% המרכזי (לא למטה/למעלה קיצוני).

**CTA button in Ads Manager:** Learn More → orvo24.com  
**UTM:** `?utm_source=meta&utm_medium=paid&utm_campaign=office_skit_v1`

---

## איך להפיק (רמות)

### A — מה שיש ב-repo (היום)

1. פתח `marketing/meta-ad-office/index.html` בדפדפן מלא מסך.
2. הקלט 18 שניות ב-1080×1920 (OBS / QuickTime / ShareX).
3. הוסף קול ב-CapCut / Premiere:
   - 2 קולות (גיא + נועה) או קריינות אחת + כתוביות.
   - מוזיקה: lo-fi office, `-18 LUFS` approx, duck מתחת לדיאלוג.

### B — רמה גבוהה (מומלץ ל-Meta)

- **Remotion** (React + timeline בקוד) — אותו תסריט, export MP4 אוטומטי.
- **ElevenLabs / Play.ht** — VO עברית.
- **Blender / After Effects** — אם רוצים דמויות 3D (לא GTA; זה שבועות עבודה).

### C — מה *לא* realistic בבקשה אחת

"GTA אמיתי" = מנוע AAA (Rockstar) · rigging · mocap · VO · shaders · physics.  
**מה שיש ב-repo:** `gta-style-3d.html` = סצנה Three.js low-poly בסגנון third-person — דמו טכני, לא משחק.

| רמה | דוגמה |
|-----|--------|
| CSS 2D | `index.html` |
| 3D web (GTA-*inspired*) | `gta-style-3d.html` |
| AAA GTA | לא — צוות + חודשים + Unreal/Custom engine |

---

## Checklist לפני העלאה

- [ ] כתוביות burned-in (80% צופים בלי סאund)
- [ ] לוגו ORVO + orvo24.com ב-2 שניות האחרונות
- [ ] ללא הבטחות "תשלום מובטח" / Stripe אם עדיין לא live
- [ ] A/B: גרסה עם כתוביות בלבד vs VO

---

## קבצים

| File | Purpose |
|------|---------|
| `marketing/meta-ad-office/index.html` | Animated storyboard (record → MP4) |
| `marketing/meta-ad-office/README.md` | Record & export steps |

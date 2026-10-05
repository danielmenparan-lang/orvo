# איך להריץ את זה ב-Cursor במחשב שלך

המסמכים האלה הם **הוראות בנייה ל-Cursor** — לא האפליקציה עצמה.

## שלב 1 — ריפו חדש ל-Sunx
אל תבנה את Sunx בתוך אתר ORVO. צור ריפו חדש (מומלץ `sunx`).

העתק לריפו החדש:
- `AGENTS.md`
- `docs/sunx/` (כל התיקייה)
- `.cursor/skills/`
- `.cursor/rules/sunx.mdc`

## שלב 2 — פתח ב-Cursor
פתח את ריפו `sunx` ב-Cursor Desktop.

## שלב 3 — הדבק את הפרומפט הזה

```text
Read AGENTS.md, docs/sunx/CURSOR_BUILD_BRIEF.md, and all docs/sunx/*.md.
Follow .cursor/skills/* and .cursor/rules/sunx.mdc.
Build Phase 0 + Phase 1 only from BUILD_PHASES.md.
Do not invent unsupported agent types.
Afterward update docs/sunx/BUILD_STATUS.md.
```

## שלב 4 — התקדם לפי פאזות
כל סשן = פאזה אחת מ-`BUILD_PHASES.md`.  
כשאתה נוגע בבילינג / קונקטורים / ראנטיים / צ׳אט — Cursor אמור להשתמש בסקילים המתאימים אוטומטית (או תגיד לו במפורש: "use sunx-billing skill").

## שלב 5 — מה מצפים לקבל בסוף MVP
Signup → צ׳אט בונה → שאלון → תשלום Stripe טסט → סוכן sandbox → playground עם FAQ → קונקטור אחד → וידג׳ט ווב.

## מסמך המאסטר באנגלית
`docs/sunx/CURSOR_BUILD_BRIEF.md` — זה מה ש-Cursor צריך לקרוא לעומק.

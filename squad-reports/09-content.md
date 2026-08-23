# 09 — Content / SEO: Page Outline + Keyword Clusters

**Niche focus (locked):** WhatsApp / ops AI agents for Israeli SMBs + vetted builder marketplace (ORVO).  
**Languages:** Hebrew primary for demand pages; English for builders + international founders.  
**Goal (30d):** 2 indexable landing pages live + site metadata aligned; not a content farm.  
**Positioning handoff:** Hero = WhatsApp agents for Israeli businesses — never generic “AI marketplace” as H1.

---

## 1. SEO strategy (MVP)

| Principle | Application |
|-----------|-------------|
| One job per page | Each URL answers one intent (e.g. restaurant WhatsApp agent) |
| Niche > generic | Rank for “בוט וואטסאפ למסעדה” / “WhatsApp AI agent מסעדה” not “AI marketplace” |
| Product-led | Every page CTA → Post request / Apply builder / Waitlist |
| Bilingual | `he` pages for SMBs; `en` mirrors for builders & SEO diversity |
| Trust | Vetted builders, private chat, pay via ORVO/Stripe, ILS framing |
| Coopetition | Educate Meta API vs unofficial; position ORVO as hire layer on top of Gambot/Manychat |

**Do not:** thin synonym pages, AI-generated spam blogs, competing H1s for “Upwork alternative” without substance, BSP claim wars.

---

## 2. Site IA — pages to ship

### Priority A (ship week 2)

#### A1. `/he/whatsapp-ai-agent-misada` (or `/he/סוכן-ai-וואטסאפ-מסעדה`)
**Intent:** Commercial — restaurant/café owner wants a WhatsApp order/FAQ agent.  
**H1:** סוכן AI לוואטסאפ למסעדה — בונים מאומתים ב־ORVO  
**Title:** סוכן AI לוואטסאפ למסעדה | ORVO  
**Meta:** סוכן AI לוואטסאפ למסעדה. מפרסמים בקשה ב־ORVO, בונים מאומתים שולחים הצעות, צ'אט ותשלום מאובטח בשקלים.

**Outline:**
1. Hero — brand **ORVO** dominant + one sentence + CTA “פרסמו בקשה”  
2. What it does — orders, menu FAQ, kitchen alert (match live landing example)  
3. Market reality — DIY SaaS (~₪97–₪500/mo) vs custom (~₪3,500–₪12,000); when custom wins  
4. How ORVO works — post → quotes → chat → pay  
5. Who builds — vetted only; Hebrew + Meta API / n8n  
6. Pricing framing — get quotes; show budget chips ₪3.5k / ₪6.5k / ₪12k (no fake fixed prices)  
7. FAQ (5 — answers below)  
8. CTA repeat  

**Primary CTA:** Post a request  
**Secondary:** Join waitlist  

#### A2. `/en/whatsapp-ai-agent-builders` (or `/builders/whatsapp`)
**Intent:** Builder acquisition.  
**H1:** Build WhatsApp AI agents. Get hired on ORVO.  
**Title:** WhatsApp AI Agent Builder Jobs | ORVO  
**Meta:** Apply as a vetted ORVO builder. Browse WhatsApp and ops AI agent jobs for Israeli SMBs, send quotes, get paid through the platform.

**Outline:**
1. Hero — ORVO + “clients post jobs; you quote”  
2. What jobs look like (restaurant, clinic, support) + ILS AOV bands  
3. Vetting process (48h)  
4. How you get paid (Stripe via ORVO)  
5. Skills we want (Meta Cloud API, Hebrew UX, n8n/Make, CRM hooks)  
6. CTA Apply as builder  

### Priority B (ship week 3–4)

| Slug | Language | Intent |
|------|----------|--------|
| `/he/סוכן-ai-לקליניקה` | HE | Clinic appointment / FAQ WhatsApp agent |
| `/he/איך-עובד-orvo` | HE | Informational → branded |
| `/en/ai-agent-marketplace` | EN | Category + differentiation (narrow positioning) |
| `/en/hire-ai-agent-developer` | EN | Hire intent |
| `/he/בניית-בוט-וואטסאפ-לעסקים` | HE | Broad SMB WhatsApp bot |

### Priority C (later)
- Case studies (`/he/case/...`) after real deliveries  
- Compare pages only with honest data (Upwork / Fiverr / local freelancers / DIY SaaS)  
- Glossary: WABA, agent vs chatbot, API רשמי vs לא רשמי  

---

## 3. On-page template (all niche pages)

```
Title (≤60): [Primary keyword] | ORVO
Meta (≤155): [Promise] + vetted builders + CTA phrase + ILS when HE
H1: keyword-natural, brand ORVO visible (not overpowered by generic AI speak)
Lead: 1–2 sentences, language consistent with page
Sections: Problem → Solution → How ORVO → Proof/example → Pricing frame → FAQ → CTA
Internal links: Home, How it works, For builders, sibling niche page
Schema: FAQPage + Organization when ready
```

**Homepage metadata refresh:**
- EN Title: `ORVO — WhatsApp AI Agents for Israeli Businesses`
- EN Description: `Post the WhatsApp AI agent you need. Vetted builders send quotes. Chat and pay securely through ORVO.`
- HE Title (when RTL ships): `ORVO — סוכני AI לוואטסאפ לעסקים בישראל`
- HE Description: `מפרסמים איזה סוכן AI לוואטסאפ צריך. בונים מאומתים שולחים הצעות. צ'אט ותשלום מאובטח ב־ORVO.`
- Add `hreflang` alternates when Hebrew homepage/partial ships.

---

## 4. Keyword clusters

### Cluster 1 — WhatsApp AI / bots for business (Demand — HE heavy)

| Keyword / phrase | Lang | Intent | Page target |
|------------------|------|--------|-------------|
| סוכן AI לוואטסאפ | HE | Commercial | A1 + clinic |
| בוט וואטסאפ למסעדה | HE | Commercial | A1 |
| הזמנות וואטסאפ אוטומטי | HE | Commercial | A1 |
| צ'אטבוט וואטסאפ לעסק | HE | Commercial | B SMB page |
| בוט תורים לקליניקה וואטסאפ | HE | Commercial | Clinic page |
| בוט וואטסאפ מחיר | HE | Commercial research | A1 FAQ |
| WhatsApp AI agent for restaurant | EN | Commercial | EN mirror of A1 |
| WhatsApp order bot | EN | Commercial | EN mirror |
| WhatsApp Business API bot Israel | EN | Commercial | EN SMB |
| סוכן AI לעסק קטן | HE | Broad commercial | Home / SMB page |

### Cluster 2 — Hire / marketplace (Demand — mixed)

| Keyword / phrase | Lang | Intent | Page target |
|------------------|------|--------|-------------|
| לגייס בונה סוכני AI | HE | Hire | HE hire page |
| hire AI agent developer | EN | Hire | `/en/hire-ai-agent-developer` |
| AI agent marketplace | EN | Category | `/en/ai-agent-marketplace` (narrow copy) |
| vetted AI freelancers | EN | Trust | Marketplace EN |
| מפתח בוטים וואטסאפ | HE | Hire | HE hire / A1 |
| מצאו פרילנסר AI מאומת | HE | Hire | Marketplace HE |

### Cluster 3 — Builder supply (EN + HE)

| Keyword / phrase | Lang | Intent | Page target |
|------------------|------|--------|-------------|
| get hired building AI agents | EN | Supply | A2 |
| WhatsApp bot freelance jobs | EN | Supply | A2 |
| עבודות בניית בוטים | HE | Supply | HE builders |
| פרילנס AI ישראל | HE | Supply | HE builders |
| n8n WhatsApp jobs | EN | Supply | A2 skills section |
| LangChain freelance Israel | EN | Supply | A2 |

### Cluster 4 — Problem / informational (support SEO → convert)

| Keyword / phrase | Lang | Intent | Page / asset |
|------------------|------|--------|--------------|
| איך בונים בוט וואטסאפ לעסק | HE | Informational | Guide → CTA ORVO |
| WhatsApp vs website chatbot | EN | Informational | Short guide |
| כמה עולה בוט וואטסאפ | HE | Commercial research | FAQ on A1 |
| API רשמי מול לא רשמי וואטסאפ | HE | Informational | How ORVO / FAQ |
| agent vs chatbot | EN | Informational | Glossary later |
| אבטחת תשלום לפרילנסר AI | HE | Trust | How ORVO works |

### Cluster 5 — Brand / competitors (light touch)

| Keyword / phrase | Lang | Notes |
|------------------|------|-------|
| ORVO AI | EN/HE | Brand SERP — homepage |
| ORVO marketplace | EN | Brand |
| חלופה ל־Upwork לסוכני AI | HE | Only after real differentiation page |
| ServedByAI alternative | EN | Competitive intel dependent — don’t invent claims |
| Gambot vs custom builder | EN/HE | Coopetition: DIY vs hire |

---

## 5. Content calendar (supporting SEO, not replacing it)

| Week | Asset | Cluster | CTA |
|------|-------|---------|-----|
| 1 | Social only + meta tags | Brand | Waitlist |
| 2 | Page A1 HE + A2 EN | 1 + 3 | Post / Apply |
| 3 | Clinic HE page + FAQ expansion | 1 + 4 | Post |
| 4 | “How ORVO works” HE + 1 short guide (API traps) | 4 | Signup |

Repurpose each page into 1 LinkedIn carousel + 1 IG Reel script (see `10-social.md`).

---

## 6. FAQ seeds with ready answers

### HE (A1 / clinic)

**1. כמה זמן לוקח לקבל הצעות מבונים מאומתים?**  
בדרך כלל תוך 48 שעות אחרי פרסום הבקשה. בחודש ההשקה אנחנו גם מתאימים ידנית.

**2. האם התשלום עובר דרך ORVO?**  
כן. מדברים ומשלמים בפלטפורמה (מסלול Stripe) — בלי להעביר כסף בוואטסאפ פרטי.

**3. מה ההבדל בין בוט פשוט לסוכן AI?**  
בוט תבניות עונה על זרימות קבועות. סוכן AI מותאם מבין הקשר, עברית טבעית, ומתחבר לתפריט/CRM/מטבח לפי הצורך.

**4. האם צריך WhatsApp Business API?**  
לרוב כן לפרודקשן רציני. הבונים ב־ORVO יודעים להנחות API רשמי מול פתרונות לא רשמיים — ואתם מקבלים הצעות שקופות.

**5. מה קורה אם הבונה לא מספק?**  
העסקה נשארת בפלטפורמה; משחררים תשלום רק לפי כללי השחרור של ORVO. בחודש הראשון גם ליווי מייסד על עסקאות פיילוט.

**6. כמה זה עולה?**  
בשוק הישראלי בוטים מותאמים נעים לרוב בין ₪3,500 ל־₪12,000+ לפי מורכבות. ב־ORVO מפרסמים תקציב ומקבלים הצעות — בלי מחיר מזויף בדף.

### EN (A2 / hire)

**1. How does builder vetting work?**  
Manual review of portfolio or Loom. Typical response within 48 hours. Unvetted accounts don’t see jobs.

**2. Do I pay the builder directly?**  
No. Pay through ORVO so scope and payment stay on-platform.

**3. What should I put in my request?**  
Channel (WhatsApp), vertical, must-have behaviors, budget band, and success metric (e.g. “take orders after hours”).

**4. Is ORVO only for WhatsApp agents?**  
That’s the beachhead. Other agent types come after we clear liquidity in-niche.

**5. How do builders get paid?**  
Via ORVO’s Stripe path after agreed delivery/release steps.

---

## 7. Measurement (lightweight)

| Metric | Target 30d |
|--------|------------|
| Niche pages indexed | 2+ |
| Organic sessions | Baseline only — expect low |
| CTA clicks from niche pages | Track UTM `utm_source=seo` |
| Keyword → signup assisted | Qualitative via form “how heard” |

**Success in month 1 = pages exist + on-message, not traffic vanity.**

---

## 8. Copy snippets ready for implementers

**A1 meta (HE):**  
`סוכן AI לוואטסאפ למסעדה. מפרסמים בקשה ב־ORVO, בונים מאומתים שולחים הצעות, צ'אט ותשלום מאובטח.`

**A2 meta (EN):**  
`Apply as a vetted ORVO builder. Browse WhatsApp and ops AI agent jobs, send quotes, and get paid through the platform.`

**Hero supporting (HE):**  
`מפרסמים מה שהעסק צריך בוואטסאפ. בונים מאומתים שולחים הצעות. צ'אט ותשלום ב־ORVO — בלי רולטת פרילנסרים.`

**Hero supporting (EN):**  
`Post what your business needs on WhatsApp. Approved builders quote. Chat and pay through ORVO — no DIY platform, no Upwork lottery.`

**Out-of-niche reject (product):**  
`ORVO currently matches WhatsApp AI agents for Israeli businesses. Other agent types are on the waitlist.`

**Internal link anchors:** “איך ORVO עובד” · “לבונים” · “פרסמו בקשה” · “Apply as a builder” · “סוכן למסעדה” · “סוכן לקליניקה”

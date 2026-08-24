# LinkedIn builder outreach — 50 founding builders

**Who sends:** founder, by hand.  
**Who does not send:** agents, scrapers, browser bots, “auto-connect” Chrome extensions.  
**Why:** LinkedIn forbids automated scraping and unsolicited bulk InMail. ORVO GTM lock: founder posts/DMs; agents draft copy only.

**Apply URL (founding builders):**  
https://fantastic-eclair-0b2c66.netlify.app/for-builders.html?utm_source=linkedin&utm_medium=dm&utm_campaign=founding_builders

**Tracker:** `docs/marketing/linkedin-builder-tracker.csv` (50 slots).

**Pace:** 10–15 connection requests / day. 50 people ≈ 4–5 working days. Do not blast 50 notes in one hour.

---

## 1. Who to add (ICP)

**In** — profile shows they *ship* agents/automations, not just talk:

| Signal (headline / about / featured) | Why |
|--------------------------------------|-----|
| AI Automation Engineer | Direct skill match |
| AI agent builder / AI Agent Engineer | Direct skill match |
| n8n, Make.com, Zapier + LLMs | Delivery stack ORVO jobs use |
| LangChain / CrewAI / Voiceflow / Retell / Vapi | Agent builders |
| WhatsApp bot / RAG / custom GPT for clients | Product-shaped work |
| Freelance / independent / studio / “I build for clients” | They can quote |

**Out**

- Recruiters, SDR/BDR, “open to work” with no shipped work  
- Pure researchers / students with no client or repo proof  
- Big-tech ICs who never freelance (unless About says side projects for clients)  
- People whose last post is “AI will replace jobs” with no build proof  

**Proof bar (30-second scan):** one of GitHub, Loom, client logo, n8n screenshot, or a case study sentence.

---

## 2. LinkedIn search (paste into LinkedIn search → People)

Use **People** tab. Add 2nd+ degree. Location = worldwide (English-first). Optional extra filter: Open to services / freelance if Sales Nav.

### Boolean A — titles (primary)

```
("AI Automation Engineer" OR "AI Agent Builder" OR "AI Agent Engineer" OR "AI Agents" OR "LLM Engineer") AND (freelance OR consultant OR contractor OR independent OR founder OR studio)
```

### Boolean B — stack

```
(n8n OR "Make.com" OR LangChain OR CrewAI OR Voiceflow OR Retell OR Vapi) AND ("AI agent" OR "AI automation" OR chatbot OR WhatsApp) AND (freelance OR consultant OR "I help")
```

### Boolean C — Hebrew/IL optional (regional, not product geography)

```
("מהנדס אוטומציה" OR "בונה סוכני AI" OR n8n OR "Make.com") AND (פרילנסר OR יועץ OR סטודיו)
```

**How to fill 50**

1. Run A → save 20 who pass the proof bar.  
2. Run B → save 20 more (skip duplicates).  
3. Run C only if you want a Hebrew-speaking pocket → up to 10.  
4. Stop at 50. Quality over volume.

Paste name, headline, profile URL, city into the CSV **before** you send.

---

## 3. How to send (manual)

1. Open their profile. Confirm proof bar.  
2. **Connect** with a note if LinkedIn still allows notes on your account; otherwise Connect first, message after they accept.  
3. One ask: apply as founding builder. No “quick call?” unless they reply.  
4. Log row in the CSV: `sent` date + variant (EN-A / EN-B / HE).  
5. If no reply in 7 days: **one** follow-up, then stop.

Do not: email-finder tools against LinkedIn, fake “mutual friend” openers, or claim live Stripe escrow.

---

## 4. Message copy (connection note ≤ 200–300 chars)

Replace `[name]`, keep the link.

### EN-A — title match (default)

> Hi [name] — saw you ship AI automations / agents.  
> ORVO is a vetted marketplace: clients post custom agent jobs, you quote in USD, chat + pay on-platform. Founding builder cohort, manual review ~48h.  
> Apply: https://fantastic-eclair-0b2c66.netlify.app/for-builders.html?utm_source=linkedin&utm_medium=dm&utm_campaign=founding_builders

### EN-B — stack match (n8n / LangChain / voice)

> Hi [name] — your n8n / agent stack is exactly what ORVO clients hire for (WhatsApp, CRM, voice).  
> Founding vetted builders get first briefs. Apply once, quote jobs worldwide:  
> https://fantastic-eclair-0b2c66.netlify.app/for-builders.html?utm_source=linkedin&utm_medium=dm&utm_campaign=founding_builders

### HE — optional if they write Hebrew

> היי [name], ראיתי שאת/ה בונה סוכני AI / אוטומציות.  
> ORVO פתוח לקוהורט ראשון של בונים מאומתים — לקוחות מפרסמים ג'ובים, אתה שולח הצעת מחיר ב־USD.  
> הגשה: https://fantastic-eclair-0b2c66.netlify.app/for-builders.html?utm_source=linkedin&utm_medium=dm&utm_campaign=founding_builders

### Follow-up (day 7, one time)

> [name] — bumping this once. If you ship agents for clients, the founding builder apply is here (manual vet, ~48h):  
> https://fantastic-eclair-0b2c66.netlify.app/for-builders.html?utm_source=linkedin&utm_medium=dm&utm_campaign=founding_builders_fu

---

## 5. After they apply

1. ORVO Dashboard → Review builders.  
2. Approve only if bio ≥ 50 chars + a real URL/proof.  
3. Reply on LinkedIn: “Approved — browse jobs / wait for invite.” Do not promise a job.

---

## 6. Cursor agent you *can* run (draft only)

Paste this as a Cloud Agent / chat prompt **after** you filled the CSV yourself:

```
You are helping the ORVO founder personalize LinkedIn DMs.
Input: rows from docs/marketing/linkedin-builder-tracker.csv (name, headline, notes).
Rules:
- Do not scrape LinkedIn. Do not invent profile facts.
- For each row with name + headline, pick EN-A, EN-B, or HE from docs/marketing/LINKEDIN-BUILDER-OUTREACH.md.
- Personalize the first sentence with ONE fact from headline/notes only.
- Output a table: name | variant | message ready to paste.
- Stop after 15 rows per run (daily cap).
```

That agent drafts. You still click Connect / Send.

---

## Honesty / legal

| Allowed | Not allowed |
|---------|-------------|
| Manual LinkedIn search + notes | Scraping, Sales Nav export bots, PhantomBuster-style tools we ship |
| Founder DMs from this pack | Agent-sent InMail |
| CSV you type | Harvesting emails from LinkedIn |
| “Founding vetted cohort” | “Unlimited jobs” / live escrow until Stripe smoke is green |

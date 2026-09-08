# Invite ORVO builders to quote

Email **approved builders** an invite to send a quote on an open request.
This is for marketplace outreach to people already on ORVO — not cold spam lists.

## Files
- `scripts/invite-builders.js` — agent / CLI invite sender (Gmail API)
- `builders.example.csv` — list format (`email,name,skills`)
- `invite.example.txt` — message template
- `netlify/functions/gmail-invite-builders.js` — admin dashboard batch API
- `gmail-secrets.json` / `gmail-tokens.json` — gitignored credentials

## One-time Google allow
1. Google Cloud → Credentials → OAuth client → add redirect:
   `https://fantastic-eclair-0b2c66.netlify.app/gmail-oauth-code.html`
2. Put Client Secret in `gmail-secrets.json` (see `gmail-secrets.example.json`) **or** Netlify env `GMAIL_CLIENT_SECRET`
3. Run:
   ```bash
   node scripts/invite-builders.js auth-url
   ```
4. Open link → Allow → copy `code=` →  
   `node scripts/invite-builders.js exchange CODE`

## Export builders, then invite

1. From ORVO admin / Supabase, export approved builders to `builders.csv`:
   ```csv
   email,name,skills
   alex@example.com,Alex,WhatsApp
   ```
2. Send invites for a request:
   ```bash
   node scripts/invite-builders.js invite \
     --builders builders.csv \
     --title "WhatsApp booking bot" \
     --category "WhatsApp / Chat" \
     --budget "$800" \
     --link "https://fantastic-eclair-0b2c66.netlify.app/"
   ```

Dry-run (no send):
```bash
node scripts/invite-builders.js invite --builders builders.csv --title "Test job" --dry-run
```

## Admin dashboard
After Gmail is connected: **Review builders** → **Invite builders to quote**.
Pick an open request (or type a title), preview, dry-run, then send in batches.

## API
`POST /api/gmail/invite-builders`
```json
{
  "builders": [{ "email": "a@x.com", "name": "Alex" }],
  "title": "Job title",
  "category": "WhatsApp / Chat",
  "budget": "$800",
  "link": "https://fantastic-eclair-0b2c66.netlify.app/",
  "subject": "ORVO: new request — {{title}}",
  "body": "Hi {{name}}, ... {{link}}",
  "dryRun": false
}
```
Max 25 builders per request (UI batches automatically).

## Limits
Gmail personal accounts ~100–500 sends/day. For larger volume use Google Workspace or Resend/SendGrid.

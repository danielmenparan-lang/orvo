# Bulk email agent (what you actually asked for)

Send **one message template to hundreds of people** — no writing each email by hand.

## Files
- `scripts/bulk-mail.js` — bulk sender
- `recipients.example.csv` — list format (`email,name`)
- `message.example.txt` — message template (`{{name}}`, `{{email}}`)
- `gmail-secrets.json` — your Google API credentials (gitignored)
- `gmail-tokens.json` — created after one-time Google approve (gitignored)

## One-time Google approve
Gmail requires one permission click so the agent can send as you.

1. Add this Redirect URI in Google Cloud → Credentials → your OAuth client:
   `https://fantastic-eclair-0b2c66.netlify.app/gmail-oauth-code.html`
2. Ask the agent for the auth link (or run `node scripts/bulk-mail.js auth-url`)
3. Open → Allow → copy `code=` from the browser URL → send it to the agent

## Send hundreds of emails

1. Put your list in `recipients.csv`:
   ```csv
   email,name
   a@x.com,Dana
   b@y.com,Noam
   ```
2. Put your text in `message.txt` (use `{{name}}` if you want personalization)
3. Run:
   ```bash
   node scripts/bulk-mail.js send --list recipients.csv --subject "שלום {{name}}" --body-file message.txt
   ```

Dry run (no sending):
```bash
node scripts/bulk-mail.js send --list recipients.csv --subject "Test" --body "Hi {{name}}" --dry-run
```

## Limits
Normal Gmail accounts are usually capped around ~100–500 sends/day. For larger volume use Google Workspace or a bulk provider (Resend/SendGrid).

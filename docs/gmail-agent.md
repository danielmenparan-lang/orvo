# ORVO Gmail Email Agent

This is for an **agent that writes/sends emails**, not for a website button.

## One-time connect (phone OK)

1. In Google Cloud → Credentials → your OAuth client, add this **Authorized redirect URI**:
   ```
   https://fantastic-eclair-0b2c66.netlify.app/gmail-oauth-code.html
   ```
   (Also keep existing origins/URIs if present.)

2. Ask the Cursor agent: `תן לי קישור חיבור Gmail`
   Or run:
   ```bash
   node scripts/gmail-agent.js auth-url
   ```

3. Open the link on your phone → choose Google account → Allow.

4. You’ll land on a page with a **code**. Copy it and send it to the agent
   (or run `node scripts/gmail-agent.js exchange CODE`).

5. Done. The agent can now draft/send mail as you.

## Commands

```bash
node scripts/gmail-agent.js status
node scripts/gmail-agent.js inbox --max 5
node scripts/gmail-agent.js draft --to a@b.com --subject "Hi" --body "Hello"
node scripts/gmail-agent.js send  --to a@b.com --subject "Hi" --body "Hello"
```

Secrets/tokens stay in gitignored files:
- `gmail-secrets.json`
- `gmail-tokens.json`

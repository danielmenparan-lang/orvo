# Automatic bulk email — ready

The system is built: `scripts/bulk-mail.js`

You already provided Client ID + Client Secret. Those are saved.

## Why it still can't send yet
Google will not let any app send mail with only Client ID/Secret.
It needs **one** of these:

### Option A (recommended, 1 minute on phone): App Password
1. Open https://myaccount.google.com/apppasswords
2. Create password named `ORVO`
3. Send the 16 characters to the agent
4. Give your recipient list + message text
5. Agent runs bulk send

### Option B: OAuth Allow
Finish External + Allow, paste `code=` once.

## Send command (after auth)
```bash
node scripts/bulk-mail.js send \
  --list recipients.csv \
  --subject "שלום {{name}}" \
  --body-file message.txt
```

Dry-run:
```bash
node scripts/bulk-mail.js send --list recipients.csv --subject "Test" --body "Hi {{name}}" --dry-run
```

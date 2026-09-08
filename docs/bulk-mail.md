# Automatic bulk email system — READY

The sender is built: `scripts/bulk-mail.js`

## Fastest way to send (skip Google Cloud)

Google OAuth got stuck on your Cloud project (Internal / Branding).  
Use **Resend** instead — one API key, then mass send works.

1. Open https://resend.com/signup (sign up with Google is fine)
2. Create API key: https://resend.com/api-keys
3. Send the key to the agent (starts with `re_`)
4. Send your recipient list + message text
5. Agent runs bulk send

Free tier works for testing. Default from-address: `onboarding@resend.dev`  
(For your own domain later: verify domain in Resend, set `from_email`)

## Command
```bash
node scripts/bulk-mail.js send \
  --list recipients.csv \
  --subject "שלום {{name}}" \
  --body-file message.txt
```

## Also kept (optional)
- Gmail Client ID/Secret you already provided
- Gmail App Password / OAuth paths (blocked on your account right now)

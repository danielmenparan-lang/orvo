# Gmail integration (ORVO)

## What you already have
- **Client ID** (safe to share): set as `GMAIL_CLIENT_ID` or leave default in code
- **Client Secret**: keep private — only in Netlify env

## 1. Netlify environment variables
Site configuration → Environment variables → Add:

| Name | Value |
|------|--------|
| `GMAIL_CLIENT_ID` | `303519877691-obt1ji4ranubn6l83jn1ra58v1068j28.apps.googleusercontent.com` |
| `GMAIL_CLIENT_SECRET` | *(paste your secret from Google Cloud — never commit)* |
| `GMAIL_REDIRECT_URI` | `https://fantastic-eclair-0b2c66.netlify.app/oauth2callback` |

Then **redeploy** the site.

## 2. Google Cloud redirect (must match)
In Google Cloud → Credentials → your OAuth client:

**Authorized JavaScript origins**
```
https://fantastic-eclair-0b2c66.netlify.app
```

**Authorized redirect URIs**
```
https://fantastic-eclair-0b2c66.netlify.app/oauth2callback
```

## 3. Connect Gmail
1. Deploy this branch
2. Sign in to ORVO as admin (`danielmen.paran@gmail.com`)
3. Dashboard → Review builders (or Profile)
4. Click **Connect Gmail**
5. Approve Google consent

## 4. API endpoints (after deploy)
- `GET /api/gmail/auth` — start OAuth
- `GET /oauth2callback` — Google redirect target
- `GET /api/gmail/status` — connection status
- `GET /api/gmail/inbox` — recent inbox messages
- `POST /api/gmail/send` — `{ "to", "subject", "body" }`

Tokens are stored in Netlify Blobs (`gmail-tokens`). Optional fallback: set `GMAIL_REFRESH_TOKEN` manually.

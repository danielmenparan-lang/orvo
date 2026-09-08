#!/usr/bin/env node
/**
 * ORVO Gmail Agent — draft/send mail via Gmail API.
 *
 * Usage:
 *   node scripts/gmail-agent.mjs auth-url
 *   node scripts/gmail-agent.mjs exchange <CODE>
 *   node scripts/gmail-agent.mjs status
 *   node scripts/gmail-agent.mjs send --to a@b.com --subject "Hi" --body "Hello"
 *   node scripts/gmail-agent.mjs draft --to a@b.com --subject "Hi" --body "Hello"
 *   node scripts/gmail-agent.mjs inbox [--max 5]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SECRETS_PATH = path.join(ROOT, 'gmail-secrets.json');
const TOKENS_PATH = path.join(ROOT, 'gmail-tokens.json');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
].join(' ');

function loadJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
}

function secrets() {
  const s = loadJson(SECRETS_PATH);
  if (!s?.client_id || !s?.client_secret || s.client_secret === 'PASTE_SECRET_HERE') {
    throw new Error('Missing gmail-secrets.json (client_id / client_secret)');
  }
  return s;
}

function redirectUri() {
  const s = secrets();
  return (
    process.env.GMAIL_REDIRECT_URI ||
    s.redirect_uri_code ||
    s.redirect_uri ||
    'https://fantastic-eclair-0b2c66.netlify.app/gmail-oauth-code.html'
  );
}

function authUrl() {
  const s = secrets();
  const params = new URLSearchParams({
    client_id: s.client_id,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: 'orvo-agent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCode(code) {
  const s = secrets();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: s.client_id,
      client_secret: s.client_secret,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'exchange failed');
  const tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: Date.now() + (data.expires_in || 3600) * 1000,
    scope: data.scope,
    token_type: data.token_type,
    saved_at: new Date().toISOString(),
  };
  const prev = loadJson(TOKENS_PATH, {});
  if (!tokens.refresh_token && prev.refresh_token) tokens.refresh_token = prev.refresh_token;
  if (!tokens.refresh_token) throw new Error('No refresh_token returned. Revoke app access and retry with prompt=consent.');
  saveJson(TOKENS_PATH, tokens);
  return tokens;
}

async function refreshIfNeeded() {
  const s = secrets();
  let tokens = loadJson(TOKENS_PATH);
  if (!tokens?.refresh_token) throw new Error('Not connected. Run auth-url, then exchange <CODE>.');
  if (tokens.access_token && tokens.expiry_date > Date.now() + 60_000) return tokens;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: s.client_id,
      client_secret: s.client_secret,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'refresh failed');
  tokens = {
    ...tokens,
    access_token: data.access_token,
    expiry_date: Date.now() + (data.expires_in || 3600) * 1000,
    scope: data.scope || tokens.scope,
    saved_at: new Date().toISOString(),
  };
  saveJson(TOKENS_PATH, tokens);
  return tokens;
}

async function gmail(pathname, { method = 'GET', body } = {}) {
  const tokens = await refreshIfNeeded();
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error?.message || JSON.stringify(data) || `HTTP ${res.status}`);
  return data;
}

function encodeSubject(subject) {
  return `=?UTF-8?B?${Buffer.from(subject || '', 'utf8').toString('base64')}?=`;
}

function rawEmail({ to, subject, body, from }) {
  const lines = [
    `To: ${to}`,
    from ? `From: ${from}` : null,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    body || '',
  ].filter((x) => x !== null);
  return Buffer.from(lines.join('\r\n'), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      out[a.slice(2)] = argv[i + 1] ?? true;
      i++;
    } else out._.push(a);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  if (!cmd || cmd === 'help') {
    console.log(`ORVO Gmail Agent
  auth-url              Print Google consent URL (open on phone)
  exchange <CODE>       Save tokens from auth code
  status                Show connected Gmail address
  inbox [--max 5]       List recent inbox messages
  draft --to --subject --body   Create Gmail draft
  send  --to --subject --body   Send email now`);
    return;
  }

  if (cmd === 'auth-url') {
    const url = authUrl();
    console.log(url);
    console.log('\nRedirect URI must be registered in Google Cloud:');
    console.log(redirectUri());
    return;
  }

  if (cmd === 'exchange') {
    const code = args._[1];
    if (!code) throw new Error('Usage: exchange <CODE>');
    await exchangeCode(code.trim());
    const profile = await gmail('/users/me/profile');
    console.log(JSON.stringify({ ok: true, emailAddress: profile.emailAddress }, null, 2));
    return;
  }

  if (cmd === 'status') {
    const profile = await gmail('/users/me/profile');
    console.log(JSON.stringify({ ok: true, connected: true, emailAddress: profile.emailAddress, messagesTotal: profile.messagesTotal }, null, 2));
    return;
  }

  if (cmd === 'inbox') {
    const max = Math.min(Number(args.max || 5), 20);
    const list = await gmail(`/users/me/messages?maxResults=${max}&labelIds=INBOX`);
    const messages = [];
    for (const item of list.messages || []) {
      const full = await gmail(`/users/me/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
      const headers = Object.fromEntries((full.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value]));
      messages.push({ id: full.id, from: headers.from || '', subject: headers.subject || '', date: headers.date || '', snippet: full.snippet });
    }
    console.log(JSON.stringify({ ok: true, messages }, null, 2));
    return;
  }

  if (cmd === 'send' || cmd === 'draft') {
    const to = args.to;
    const subject = args.subject;
    const body = args.body || '';
    if (!to || !subject) throw new Error(`${cmd} requires --to and --subject`);
    const raw = rawEmail({ to, subject, body });
    if (cmd === 'send') {
      const sent = await gmail('/users/me/messages/send', { method: 'POST', body: { raw } });
      console.log(JSON.stringify({ ok: true, sent: true, id: sent.id, threadId: sent.threadId }, null, 2));
    } else {
      const draft = await gmail('/users/me/drafts', { method: 'POST', body: { message: { raw } } });
      console.log(JSON.stringify({ ok: true, draft: true, id: draft.id, messageId: draft.message?.id }, null, 2));
    }
    return;
  }

  throw new Error(`Unknown command: ${cmd}`);
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err) }));
  process.exit(1);
});

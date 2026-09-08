#!/usr/bin/env node
/**
 * ORVO bulk mailer — send one template to many recipients.
 *
 * Setup (once):
 *   node scripts/bulk-mail.js auth-url
 *   node scripts/bulk-mail.js exchange <CODE>
 *
 * Send:
 *   node scripts/bulk-mail.js send --list recipients.csv --subject "Hello {{name}}" --body-file message.txt
 *   node scripts/bulk-mail.js send --list recipients.csv --subject "Hi" --body "Hello {{name}}" --dry-run
 *   node scripts/bulk-mail.js send --list recipients.csv --subject "Hi" --body "Hello" --limit 10
 *
 * recipients.csv columns: email,name  (name optional)
 * Placeholders in subject/body: {{email}} {{name}}
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SECRETS_PATH = path.join(ROOT, 'gmail-secrets.json');
const TOKENS_PATH = path.join(ROOT, 'gmail-tokens.json');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
].join(' ');

function loadJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
}

function secrets() {
  const s = loadJson(SECRETS_PATH);
  if (!s?.client_id || !s?.client_secret || s.client_secret === 'PASTE_SECRET_HERE') {
    throw new Error('Missing gmail-secrets.json');
  }
  return s;
}

function redirectUri() {
  const s = secrets();
  return process.env.GMAIL_REDIRECT_URI || s.redirect_uri_code ||
    'https://fantastic-eclair-0b2c66.netlify.app/gmail-oauth-code.html';
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fill(template, row) {
  return String(template || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    return row[key] != null ? String(row[key]) : '';
  });
}

function parseList(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  const raw = fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, '');
  if (abs.endsWith('.json')) {
    const data = JSON.parse(raw);
    const rows = Array.isArray(data) ? data : data.recipients;
    return rows.map((r) => ({
      email: String(r.email || r.to || '').trim(),
      name: String(r.name || r.full_name || '').trim(),
      ...r,
    })).filter((r) => r.email);
  }

  // CSV / TSV / one-email-per-line
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];

  const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(',') ? ',' : null;
  if (!delim) {
    return lines.map((email) => ({ email, name: '' }));
  }

  const headers = lines[0].split(delim).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  const hasHeader = headers.includes('email') || headers.includes('mail') || headers.includes('to');
  const start = hasHeader ? 1 : 0;
  const emailIdx = hasHeader
    ? Math.max(headers.indexOf('email'), headers.indexOf('mail'), headers.indexOf('to'))
    : 0;
  const nameIdx = hasHeader ? headers.indexOf('name') : 1;

  const rows = [];
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(delim).map((c) => c.trim().replace(/^"|"$/g, ''));
    const email = cols[emailIdx] || '';
    if (!email || !email.includes('@')) continue;
    const row = { email, name: nameIdx >= 0 ? (cols[nameIdx] || '') : '' };
    if (hasHeader) {
      headers.forEach((h, idx) => { if (h) row[h] = cols[idx] || ''; });
    }
    rows.push(row);
  }
  return rows;
}

async function exchangeCode(code) {
  const s = secrets();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: code.trim(),
      client_id: s.client_id,
      client_secret: s.client_secret,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'exchange failed');
  const prev = loadJson(TOKENS_PATH, {});
  const tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || prev.refresh_token,
    expiry_date: Date.now() + (data.expires_in || 3600) * 1000,
    scope: data.scope,
    saved_at: new Date().toISOString(),
  };
  if (!tokens.refresh_token) throw new Error('No refresh_token. Revoke ORVO access in Google account and retry.');
  saveJson(TOKENS_PATH, tokens);
  return tokens;
}

async function accessToken() {
  const s = secrets();
  let tokens = loadJson(TOKENS_PATH);
  if (!tokens?.refresh_token) throw new Error('Not connected yet. Run auth-url, then exchange <CODE>.');
  if (tokens.access_token && tokens.expiry_date > Date.now() + 60_000) return tokens.access_token;

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
    saved_at: new Date().toISOString(),
  };
  saveJson(TOKENS_PATH, tokens);
  return tokens.access_token;
}

function encodeSubject(subject) {
  return `=?UTF-8?B?${Buffer.from(subject || '', 'utf8').toString('base64')}?=`;
}

function toRaw({ to, subject, body }) {
  const lines = [
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    body || '',
  ];
  return Buffer.from(lines.join('\r\n'), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sendOne({ to, subject, body }) {
  const token = await accessToken();
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: toRaw({ to, subject, body }) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || JSON.stringify(data));
  return data;
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
    state: 'bulk-mail',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  if (!cmd || cmd === 'help') {
    console.log(`Bulk mailer
  auth-url
  exchange <CODE>
  send --list recipients.csv --subject "Hi {{name}}" --body "Hello {{name}}"
  send --list recipients.csv --subject "Hi" --body-file message.txt [--dry-run] [--limit N] [--delay 1200]`);
    return;
  }

  if (cmd === 'auth-url') {
    console.log(authUrl());
    console.log('\nAdd this Redirect URI in Google Cloud if needed:');
    console.log(redirectUri());
    console.log('\nAfter Allow: copy code= from the browser URL and run exchange <CODE>');
    return;
  }

  if (cmd === 'exchange') {
    const code = args._[1];
    if (!code) throw new Error('Usage: exchange <CODE>');
    await exchangeCode(code);
    console.log(JSON.stringify({ ok: true, connected: true }, null, 2));
    return;
  }

  if (cmd === 'send') {
    if (!args.list) throw new Error('--list recipients.csv (or .json) is required');
    const subjectTpl = args.subject;
    if (!subjectTpl) throw new Error('--subject is required');
    let bodyTpl = args.body || '';
    if (args['body-file']) {
      const p = path.isAbsolute(args['body-file']) ? args['body-file'] : path.join(ROOT, args['body-file']);
      bodyTpl = fs.readFileSync(p, 'utf8');
    }
    if (!bodyTpl) throw new Error('--body or --body-file is required');

    let recipients = parseList(args.list);
    const limit = args.limit ? Number(args.limit) : recipients.length;
    recipients = recipients.slice(0, limit);
    const delay = Number(args.delay || 1200);
    const dryRun = Boolean(args['dry-run']);

    console.log(JSON.stringify({
      ok: true,
      mode: dryRun ? 'dry-run' : 'send',
      total: recipients.length,
      delay_ms: delay,
    }));

    let sent = 0;
    let failed = 0;
    for (let i = 0; i < recipients.length; i++) {
      const row = recipients[i];
      const payload = {
        to: row.email,
        subject: fill(subjectTpl, row),
        body: fill(bodyTpl, row),
      };
      try {
        if (dryRun) {
          console.log(JSON.stringify({ i: i + 1, dryRun: true, to: payload.to, subject: payload.subject }));
        } else {
          const res = await sendOne(payload);
          sent++;
          console.log(JSON.stringify({ i: i + 1, ok: true, to: payload.to, id: res.id }));
          if (i < recipients.length - 1) await sleep(delay);
        }
      } catch (err) {
        failed++;
        console.error(JSON.stringify({ i: i + 1, ok: false, to: row.email, error: String(err.message || err) }));
      }
    }
    console.log(JSON.stringify({ done: true, sent, failed, total: recipients.length }));
    return;
  }

  throw new Error(`Unknown command: ${cmd}`);
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err) }));
  process.exit(1);
});

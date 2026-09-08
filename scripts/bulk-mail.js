#!/usr/bin/env node
/**
 * ORVO automatic bulk email system
 *
 * Preferred (works now, no Google OAuth):
 *   resend_api_key + from_email in gmail-secrets.json
 *
 * Also supported:
 *   - Gmail App Password (SMTP)
 *   - Gmail OAuth client_id/client_secret + tokens
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const tls = require('tls');

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
  const s = loadJson(SECRETS_PATH, {});
  if (!s) throw new Error('Missing gmail-secrets.json');
  return s;
}

function hasAppPassword(s = secrets()) {
  const pass = (s.app_password || '').replace(/\s+/g, '');
  return Boolean(pass && pass !== 'PASTE_APP_PASSWORD_HERE' && (s.email || s.user));
}

function hasResend(s = secrets()) {
  const key = s.resend_api_key || s.RESEND_API_KEY || '';
  return Boolean(key && key !== 'PASTE_RESEND_API_KEY_HERE' && key.startsWith('re_'));
}

function hasOAuth(s = secrets()) {
  return Boolean(
    s.client_id &&
    s.client_secret &&
    s.client_secret !== 'PASTE_SECRET_HERE'
  );
}

function sendReady(s = secrets()) {
  return hasResend(s) || hasAppPassword(s) || Boolean(loadJson(TOKENS_PATH)?.refresh_token);
}

function redirectUri() {
  const s = secrets();
  return process.env.GMAIL_REDIRECT_URI || s.redirect_uri_code || s.redirect_uri ||
    'https://fantastic-eclair-0b2c66.netlify.app/oauth2callback';
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
  return String(template || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => (
    row[key] != null ? String(row[key]) : ''
  ));
}

function parseList(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  if (!fs.existsSync(abs)) throw new Error(`List not found: ${filePath}`);
  const raw = fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, '');
  if (abs.endsWith('.json')) {
    const data = JSON.parse(raw);
    const rows = Array.isArray(data) ? data : data.recipients;
    return rows.map((r) => ({
      email: String(r.email || r.to || '').trim(),
      name: String(r.name || r.full_name || '').trim(),
      ...r,
    })).filter((r) => r.email && r.email.includes('@'));
  }

  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(',') ? ',' : null;
  if (!delim) return lines.filter((e) => e.includes('@')).map((email) => ({ email, name: '' }));

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
    if (!email.includes('@')) continue;
    const row = { email, name: nameIdx >= 0 ? (cols[nameIdx] || '') : '' };
    if (hasHeader) headers.forEach((h, idx) => { if (h) row[h] = cols[idx] || ''; });
    rows.push(row);
  }
  return rows;
}

function encodeSubject(subject) {
  return `=?UTF-8?B?${Buffer.from(subject || '', 'utf8').toString('base64')}?=`;
}

function buildMime({ from, to, subject, body }) {
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    body || '',
  ].join('\r\n');
}

function toRaw(mime) {
  return Buffer.from(mime, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ── SMTP (App Password) ───────────────────────────────────────────
class SmtpClient {
  constructor({ host, port, user, pass }) {
    this.host = host;
    this.port = port;
    this.user = user;
    this.pass = pass;
    this.socket = null;
    this.buffer = '';
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = net.connect(this.port, this.host, () => resolve());
      this.socket.setEncoding('utf8');
      this.socket.on('error', reject);
      this.socket.on('data', (chunk) => { this.buffer += chunk; });
    });
  }

  async upgradeTls() {
    return new Promise((resolve, reject) => {
      const secure = tls.connect({
        socket: this.socket,
        servername: this.host,
      }, () => {
        this.socket = secure;
        this.socket.setEncoding('utf8');
        this.socket.on('data', (chunk) => { this.buffer += chunk; });
        resolve();
      });
      secure.on('error', reject);
    });
  }

  readResponse() {
    return new Promise((resolve, reject) => {
      const tryRead = () => {
        const parts = this.buffer.split(/\r?\n/);
        // Keep last incomplete line in buffer
        let complete = parts;
        if (!this.buffer.endsWith('\n')) {
          this.buffer = parts.pop() || '';
        } else {
          this.buffer = '';
          complete = parts.filter((p) => p !== '');
        }
        // SMTP multi-line: lines like 250-... then 250 ...
        for (let i = 0; i < complete.length; i++) {
          const line = complete[i];
          if (/^\d{3} /.test(line)) {
            const code = Number(line.slice(0, 3));
            const text = complete.slice(0, i + 1).join('\n');
            // leftover lines after this response go back
            const rest = complete.slice(i + 1).join('\n');
            if (rest) this.buffer = rest + (this.buffer ? '\n' + this.buffer : '');
            if (code >= 400) reject(new Error(text));
            else resolve({ code, text });
            return;
          }
        }
        // put back unused
        if (complete.length) this.buffer = complete.join('\n') + (this.buffer ? '\n' + this.buffer : '');
      };

      const onData = () => {
        try {
          tryRead();
        } catch (e) {
          cleanup();
          reject(e);
        }
      };
      const onError = (err) => { cleanup(); reject(err); };
      const cleanup = () => {
        this.socket.off('data', onData);
        this.socket.off('error', onError);
        clearInterval(timer);
      };

      // If already buffered
      try {
        const before = this.buffer;
        if (before) {
          const fakeResolve = (v) => { cleanup(); resolve(v); };
          const fakeReject = (e) => { cleanup(); reject(e); };
          // reuse tryRead against current buffer via temporary hooks
        }
      } catch (_) { /* continue */ }

      this.socket.on('data', onData);
      this.socket.on('error', onError);
      const timer = setInterval(() => {
        try { onData(); } catch (_) { /* wait */ }
      }, 20);

      // immediate check
      onData();
    });
  }

  async cmd(line, expect) {
    this.socket.write(line + '\r\n');
    const res = await this.readResponse();
    if (expect && res.code !== expect && !(Array.isArray(expect) && expect.includes(res.code))) {
      throw new Error(`SMTP expected ${expect}, got: ${res.text}`);
    }
    return res;
  }

  async sendMail({ from, to, subject, body }) {
    await this.connect();
    await this.readResponse(); // banner
    await this.cmd(`EHLO localhost`, 250);
    await this.cmd('STARTTLS', 220);
    await this.upgradeTls();
    await this.cmd('EHLO localhost', 250);
    await this.cmd('AUTH LOGIN', 334);
    await this.cmd(Buffer.from(this.user).toString('base64'), 334);
    await this.cmd(Buffer.from(this.pass).toString('base64'), 235);
    await this.cmd(`MAIL FROM:<${from}>`, 250);
    await this.cmd(`RCPT TO:<${to}>`, 250);
    await this.cmd('DATA', 354);
    const mime = buildMime({ from, to, subject, body }) + '\r\n.';
    this.socket.write(mime + '\r\n');
    await this.readResponse();
    await this.cmd('QUIT', 221);
    this.socket.end();
  }
}

async function sendViaSmtp({ to, subject, body }) {
  const s = secrets();
  const user = s.email || s.user;
  const pass = String(s.app_password || '').replace(/\s+/g, '');
  const from = s.from || user;
  const client = new SmtpClient({
    host: 'smtp.gmail.com',
    port: 587,
    user,
    pass,
  });
  await client.sendMail({ from, to, subject, body });
  return { id: `smtp-${Date.now()}`, to };
}

// ── Gmail API OAuth ───────────────────────────────────────────────
function authUrl() {
  const s = secrets();
  if (!hasOAuth(s)) throw new Error('Missing client_id/client_secret in gmail-secrets.json');
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
  if (!tokens.refresh_token) throw new Error('No refresh_token returned');
  saveJson(TOKENS_PATH, tokens);
  return tokens;
}

async function accessToken() {
  const s = secrets();
  let tokens = loadJson(TOKENS_PATH);
  if (!tokens?.access_token && !tokens?.refresh_token) {
    throw new Error('OAuth not connected. Paste refresh/access token or use Resend.');
  }
  if (tokens.access_token && tokens.expiry_date > Date.now() + 30_000) {
    return tokens.access_token;
  }
  if (!tokens.refresh_token) {
    throw new Error('Access token expired and no refresh_token. Re-authorize in OAuth Playground.');
  }
  const clientId = tokens.oauth_client_id || s.client_id;
  const clientSecret = tokens.oauth_client_secret || s.client_secret;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
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

async function sendViaGmailApi({ to, subject, body }) {
  const s = secrets();
  const from = s.email || 'danielmen.paran@gmail.com';
  const token = await accessToken();
  const mime = buildMime({ from, to, subject, body });
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: toRaw(mime) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || JSON.stringify(data));
  return data;
}

async function sendViaResend({ to, subject, body }) {
  const s = secrets();
  const replyTo = s.reply_to || s.email || null;
  const fromName = s.from_name || 'Daniel';
  const fromAddr = s.from_email || s.from || 'onboarding@resend.dev';
  const from = fromAddr.includes('<') ? fromAddr : `${fromName} <${fromAddr}>`;
  const payload = {
    from,
    to: [to],
    subject,
    text: body,
  };
  if (replyTo) payload.reply_to = replyTo;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${s.resend_api_key || s.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
  return { id: data.id, to };
}

function hasGmailToken() {
  const tokens = loadJson(TOKENS_PATH);
  return Boolean(tokens?.access_token || tokens?.refresh_token);
}

async function sendOne(payload) {
  // Prefer Gmail so mail is sent FROM the user's Gmail address
  if (hasGmailToken()) return sendViaGmailApi(payload);
  if (hasResend()) return sendViaResend(payload);
  if (hasAppPassword()) return sendViaSmtp(payload);
  throw new Error(
    'Not ready to send. Add Gmail OAuth tokens, resend_api_key, or app_password.'
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  if (!cmd || cmd === 'help') {
    console.log(`ORVO bulk mail
  status
  auth-url
  exchange <CODE>
  send --list recipients.csv --subject "Hi {{name}}" --body-file message.txt
       [--dry-run] [--limit N] [--delay 1500]`);
    return;
  }

  if (cmd === 'status') {
    const s = secrets();
    const tokens = loadJson(TOKENS_PATH);
    console.log(JSON.stringify({
      ok: true,
      email: s.email || s.user || s.from_email || null,
      has_client_id: Boolean(s.client_id),
      has_client_secret: hasOAuth(s),
      has_resend: hasResend(s),
      has_app_password: hasAppPassword(s),
      oauth_connected: Boolean(tokens?.refresh_token),
      send_ready: sendReady(s),
      mode: hasResend(s)
        ? 'resend'
        : hasAppPassword(s)
          ? 'smtp-app-password'
          : tokens?.refresh_token
            ? 'gmail-api-oauth'
            : 'not-ready',
    }, null, 2));
    return;
  }

  if (cmd === 'auth-url') {
    console.log(authUrl());
    return;
  }

  if (cmd === 'exchange') {
    const code = args._[1];
    if (!code) throw new Error('Usage: exchange <CODE>');
    await exchangeCode(code);
    console.log(JSON.stringify({ ok: true, connected: true, mode: 'gmail-api-oauth' }, null, 2));
    return;
  }

  if (cmd === 'send') {
    if (!args.list) throw new Error('--list recipients.csv required');
    if (!args.subject) throw new Error('--subject required');
    let bodyTpl = args.body || '';
    if (args['body-file']) {
      const p = path.isAbsolute(args['body-file']) ? args['body-file'] : path.join(ROOT, args['body-file']);
      bodyTpl = fs.readFileSync(p, 'utf8');
    }
    if (!bodyTpl) throw new Error('--body or --body-file required');

    let recipients = parseList(args.list);
    const limit = args.limit ? Number(args.limit) : recipients.length;
    recipients = recipients.slice(0, limit);
    const delay = Number(args.delay || 1500);
    const dryRun = Boolean(args['dry-run']);

    if (!dryRun && !sendReady()) {
      throw new Error('Send blocked: add resend_api_key (from resend.com) to gmail-secrets.json, then retry.');
    }

    console.log(JSON.stringify({
      ok: true,
      mode: dryRun
        ? 'dry-run'
        : hasGmailToken()
          ? 'gmail-api'
          : hasResend()
            ? 'resend'
            : hasAppPassword()
              ? 'smtp'
              : 'unknown',
      total: recipients.length,
      delay_ms: delay,
    }));

    let sent = 0;
    let failed = 0;
    for (let i = 0; i < recipients.length; i++) {
      const row = recipients[i];
      const payload = {
        to: row.email,
        subject: fill(args.subject, row),
        body: fill(bodyTpl, row),
      };
      try {
        if (dryRun) {
          console.log(JSON.stringify({ i: i + 1, dryRun: true, to: payload.to, subject: payload.subject }));
        } else {
          const res = await sendOne(payload);
          sent++;
          console.log(JSON.stringify({ i: i + 1, ok: true, to: payload.to, id: res.id || null }));
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

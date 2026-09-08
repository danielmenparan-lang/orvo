/**
 * Shared Gmail OAuth helpers for Netlify Functions.
 * Secrets stay in Netlify env / gmail-secrets.json / Blobs — never in the frontend.
 */

const fs = require('fs');
const path = require('path');

function loadFileSecrets() {
  const candidates = [
    path.join(process.cwd(), 'gmail-secrets.json'),
    path.join(__dirname, '..', '..', '..', 'gmail-secrets.json'),
    path.join(__dirname, 'gmail-secrets.json'),
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (raw && (raw.client_secret || raw.client_id)) return raw;
    } catch {
      /* try next */
    }
  }
  return {};
}

const fileSecrets = loadFileSecrets();

const CLIENT_ID =
  process.env.GMAIL_CLIENT_ID ||
  fileSecrets.client_id ||
  '303519877691-obt1ji4ranubn6l83jn1ra58v1068j28.apps.googleusercontent.com';

const CLIENT_SECRET_RAW =
  process.env.GMAIL_CLIENT_SECRET ||
  fileSecrets.client_secret ||
  '';

const CLIENT_SECRET =
  !CLIENT_SECRET_RAW ||
  CLIENT_SECRET_RAW === 'PASTE_SECRET_HERE' ||
  CLIENT_SECRET_RAW === 'YOUR_CLIENT_SECRET_HERE'
    ? ''
    : CLIENT_SECRET_RAW;

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ');

function siteOrigin(event) {
  const proto = event.headers['x-forwarded-proto'] || 'https';
  const host = event.headers['x-forwarded-host'] || event.headers.host;
  return `${proto}://${host}`;
}

function redirectUri(event) {
  return (
    process.env.GMAIL_REDIRECT_URI ||
    fileSecrets.redirect_uri ||
    `${siteOrigin(event)}/oauth2callback`
  );
}

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function html(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    body,
  };
}

async function getTokenStore() {
  try {
    const { getStore } = await import('@netlify/blobs');
    return getStore({ name: 'gmail-tokens', consistency: 'strong' });
  } catch {
    return null;
  }
}

async function saveTokens(tokens) {
  const store = await getTokenStore();
  if (!store) throw new Error('Token store unavailable. Set Netlify Blobs or GMAIL_REFRESH_TOKEN.');
  const payload = {
    ...tokens,
    updated_at: new Date().toISOString(),
  };
  await store.setJSON('admin', payload);
  return payload;
}

async function loadTokens() {
  const store = await getTokenStore();
  if (store) {
    try {
      const saved = await store.get('admin', { type: 'json' });
      if (saved?.refresh_token || saved?.access_token) return saved;
    } catch {
      /* fall through */
    }
  }
  if (process.env.GMAIL_REFRESH_TOKEN) {
    return {
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      access_token: process.env.GMAIL_ACCESS_TOKEN || null,
      expiry_date: 0,
    };
  }
  return null;
}

function authUrl(event, state = 'orvo') {
  if (!CLIENT_SECRET) {
    throw new Error('Missing GMAIL_CLIENT_SECRET in Netlify environment variables.');
  }
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(event),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCode(event, code) {
  if (!CLIENT_SECRET) {
    throw new Error('Missing GMAIL_CLIENT_SECRET in Netlify environment variables.');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri(event),
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Token exchange failed');
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: Date.now() + (data.expires_in || 3600) * 1000,
    scope: data.scope,
    token_type: data.token_type,
  };
}

async function refreshAccessToken(tokens) {
  if (!CLIENT_SECRET) {
    throw new Error('Missing GMAIL_CLIENT_SECRET in Netlify environment variables.');
  }
  if (!tokens?.refresh_token) {
    throw new Error('No refresh token. Reconnect Gmail from the admin dashboard.');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Refresh failed');
  }
  const next = {
    ...tokens,
    access_token: data.access_token,
    expiry_date: Date.now() + (data.expires_in || 3600) * 1000,
    scope: data.scope || tokens.scope,
  };
  try {
    await saveTokens(next);
  } catch {
    /* env-only mode: continue with in-memory token */
  }
  return next;
}

async function getValidAccessToken() {
  let tokens = await loadTokens();
  if (!tokens) throw new Error('Gmail not connected yet.');
  if (tokens.access_token && tokens.expiry_date && tokens.expiry_date > Date.now() + 60_000) {
    return tokens.access_token;
  }
  tokens = await refreshAccessToken(tokens);
  return tokens.access_token;
}

async function gmailFetch(path, options = {}) {
  const accessToken = await getValidAccessToken();
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(data?.error?.message || data?.error || `Gmail API ${res.status}`);
  }
  return data;
}

function encodeSubject(subject) {
  return `=?UTF-8?B?${Buffer.from(subject || '', 'utf8').toString('base64')}?=`;
}

function buildRawEmail({ to, subject, body, from }) {
  const lines = [
    `To: ${to}`,
    from ? `From: ${from}` : null,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    body || '',
  ].filter((line) => line !== null);
  return Buffer.from(lines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

module.exports = {
  CLIENT_ID,
  CLIENT_SECRET,
  json,
  html,
  authUrl,
  exchangeCode,
  saveTokens,
  loadTokens,
  gmailFetch,
  buildRawEmail,
  redirectUri,
};

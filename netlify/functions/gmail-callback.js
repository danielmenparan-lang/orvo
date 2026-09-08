const { exchangeCode, saveTokens, html } = require('./lib/gmail');

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const err = params.error;
  const code = params.code;

  if (err) {
    return html(
      400,
      page('Connection cancelled', `Google returned: <code>${escapeHtml(err)}</code>`, false)
    );
  }
  if (!code) {
    return html(400, page('Missing code', 'No authorization code in the callback URL.', false));
  }

  try {
    const tokens = await exchangeCode(event, code);
    try {
      await saveTokens(tokens);
      return html(
        200,
        page(
          'Gmail connected',
          'ORVO can now read and send mail for the connected Google account. You can close this tab and return to the admin dashboard.',
          true
        )
      );
    } catch (storeErr) {
      if (tokens.refresh_token) {
        return html(
          200,
          page(
            'Almost done',
            `<p>OAuth worked, but automatic token storage failed (${escapeHtml(storeErr.message)}).</p>
             <p>Add this in Netlify → Environment variables as <code>GMAIL_REFRESH_TOKEN</code>, then redeploy:</p>
             <p><code style="word-break:break-all">${escapeHtml(tokens.refresh_token)}</code></p>
             <p>Then delete this tab — do not share that token.</p>`,
            true
          )
        );
      }
      throw storeErr;
    }
  } catch (e) {
    const msg = String(e.message || e);
    const hint = msg.includes('CLIENT_SECRET')
      ? '<p>Add <code>GMAIL_CLIENT_SECRET</code> in Netlify env vars and redeploy, then try Connect again.</p>'
      : '';
    return html(500, page('Connect failed', `<p>${escapeHtml(msg)}</p>${hint}`, false));
  }
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function page(title, body, ok) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(title)} — ORVO</title>
  <style>
    body{font-family:Inter,system-ui,sans-serif;background:#F9F9F7;color:#0A0A0A;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
    .card{background:#fff;border:1px solid rgba(0,0,0,.07);border-radius:16px;padding:32px;max-width:480px;box-shadow:0 20px 60px rgba(0,0,0,.06)}
    h1{font-size:22px;margin:0 0 12px}
    p{color:#6B6B6B;line-height:1.6;margin:0 0 12px}
    a{color:#FF6B35;font-weight:600;text-decoration:none}
    .ok{color:#15803D}.bad{color:#B91C1C}
    code{background:#F9F9F7;padding:2px 6px;border-radius:4px;font-size:13px}
  </style>
</head>
<body>
  <div class="card">
    <h1 class="${ok ? 'ok' : 'bad'}">${escapeHtml(title)}</h1>
    ${body}
    <p style="margin-top:24px"><a href="/">← Back to ORVO</a></p>
  </div>
</body>
</html>`;
}

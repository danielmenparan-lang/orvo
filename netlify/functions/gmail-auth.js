const { authUrl, json, html } = require('./lib/gmail');

exports.handler = async (event) => {
  try {
    const url = authUrl(event);
    return {
      statusCode: 302,
      headers: { Location: url, 'Cache-Control': 'no-store' },
      body: '',
    };
  } catch (err) {
    if (event.headers.accept?.includes('text/html')) {
      return html(
        500,
        `<!doctype html><html lang="he" dir="rtl"><body style="font-family:sans-serif;padding:40px">
        <h1>Gmail connect failed</h1>
        <p>${String(err.message || err)}</p>
        <p>Set <code>GMAIL_CLIENT_SECRET</code> in Netlify → Site configuration → Environment variables, then redeploy.</p>
        <p><a href="/">Back to ORVO</a></p>
        </body></html>`
      );
    }
    return json(500, { ok: false, error: String(err.message || err) });
  }
};

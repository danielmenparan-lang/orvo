const { loadTokens, gmailFetch, json, CLIENT_SECRET } = require('./lib/gmail');

exports.handler = async () => {
  try {
    if (!CLIENT_SECRET) {
      return json(200, {
        ok: false,
        connected: false,
        configured: false,
        error: 'GMAIL_CLIENT_SECRET not set in Netlify env',
      });
    }
    const tokens = await loadTokens();
    if (!tokens?.refresh_token && !tokens?.access_token) {
      return json(200, { ok: true, connected: false, configured: true });
    }
    const profile = await gmailFetch('/users/me/profile');
    return json(200, {
      ok: true,
      connected: true,
      configured: true,
      emailAddress: profile.emailAddress,
      messagesTotal: profile.messagesTotal,
      threadsTotal: profile.threadsTotal,
    });
  } catch (err) {
    return json(200, {
      ok: false,
      connected: false,
      configured: Boolean(CLIENT_SECRET),
      error: String(err.message || err),
    });
  }
};

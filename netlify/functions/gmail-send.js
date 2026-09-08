const { gmailFetch, buildRawEmail, json } = require('./lib/gmail');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed' });
  }
  try {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, { ok: false, error: 'Invalid JSON body' });
    }
    const to = String(body.to || '').trim();
    const subject = String(body.subject || '').trim();
    const text = String(body.body || body.text || '');
    if (!to || !subject) {
      return json(400, { ok: false, error: 'to and subject are required' });
    }
    const raw = buildRawEmail({ to, subject, body: text });
    const sent = await gmailFetch('/users/me/messages/send', {
      method: 'POST',
      body: JSON.stringify({ raw }),
    });
    return json(200, { ok: true, id: sent.id, threadId: sent.threadId });
  } catch (err) {
    return json(500, { ok: false, error: String(err.message || err) });
  }
};

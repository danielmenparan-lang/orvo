const { gmailFetch, json } = require('./lib/gmail');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return json(405, { ok: false, error: 'Method not allowed' });
  }
  try {
    const max = Math.min(Number(event.queryStringParameters?.max || 10), 25);
    const list = await gmailFetch(`/users/me/messages?maxResults=${max}&labelIds=INBOX`);
    const messages = [];
    for (const item of list.messages || []) {
      const full = await gmailFetch(
        `/users/me/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
      );
      const headers = Object.fromEntries(
        (full.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value])
      );
      messages.push({
        id: full.id,
        snippet: full.snippet,
        from: headers.from || '',
        subject: headers.subject || '(no subject)',
        date: headers.date || '',
      });
    }
    return json(200, { ok: true, messages });
  } catch (err) {
    return json(500, { ok: false, error: String(err.message || err) });
  }
};

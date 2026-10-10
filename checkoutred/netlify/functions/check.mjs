/**
 * Server-side checkout pulse (avoids browser CORS).
 * GET /.netlify/functions/check?url=https://store.myshopify.com
 * Optional: &telegram_token=...&chat_id=...  → alert only on failure
 */
export async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    const params = event.queryStringParameters || {};
    let raw = (params.url || '').trim();
    if (!raw) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Missing url' }) };
    }
    if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
    const base = new URL(raw);
    if (!['http:', 'https:'].includes(base.protocol)) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Invalid protocol' }) };
    }

    // Prefer Shopify cart.js — lightweight + proves storefront JS commerce path
    const targets = [
      new URL('/cart.js', base.origin).href,
      new URL('/cart', base.origin).href,
      base.href,
    ];

    let last = { ok: false, status: 0, probed: '' };
    for (const target of targets) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      try {
        const res = await fetch(target, {
          method: 'GET',
          redirect: 'follow',
          signal: ctrl.signal,
          headers: { 'User-Agent': 'CheckoutRed/1.0 (+https://checkoutred.app)' },
        });
        clearTimeout(t);
        last = { ok: res.ok, status: res.status, probed: target };
        if (res.ok) break;
      } catch (e) {
        clearTimeout(t);
        last = { ok: false, status: 0, probed: target, error: String(e.message || e) };
      }
    }

    if (!last.ok && params.telegram_token && params.chat_id) {
      const text = `🔴 CheckoutRed: store may be broken\n${base.origin}\nHTTP ${last.status || 'fail'} on ${last.probed}`;
      await fetch(`https://api.telegram.org/bot${params.telegram_token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: params.chat_id, text }),
      }).catch(() => {});
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: last.ok,
        status: last.status,
        origin: base.origin,
        probed: last.probed,
        checked_at: new Date().toISOString(),
        error: last.error || null,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: String(e.message || e) }),
    };
  }
}

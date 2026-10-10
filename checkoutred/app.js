(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  function fnBase() {
    // Local: use Netlify Dev path; production: same origin functions
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      return '/.netlify/functions/check';
    }
    return '/.netlify/functions/check';
  }

  function updateCron() {
    const url = $('url').value.trim();
    const token = $('tg-token').value.trim();
    const chat = $('tg-chat').value.trim();
    if (!url) {
      $('cron').textContent = 'הקישור יופיע אחרי שתמלאו חנות + טלגרם';
      return;
    }
    const u = new URL(fnBase(), location.origin);
    u.searchParams.set('url', url.startsWith('http') ? url : 'https://' + url);
    if (token && chat) {
      u.searchParams.set('telegram_token', token);
      u.searchParams.set('chat_id', chat);
    }
    // On Netlify the path is absolute to site root — document both
    const prodHint = 'https://YOUR-SITE.netlify.app/.netlify/functions/check?' + u.searchParams.toString();
    $('cron').textContent = prodHint;
  }

  ['url', 'tg-token', 'tg-chat'].forEach(id => {
    $(id).addEventListener('input', updateCron);
  });

  async function checkDirect(storeUrl) {
    // Fallback when Netlify functions aren't running locally: try cart.js (often CORS-blocked)
    const base = storeUrl.startsWith('http') ? storeUrl : 'https://' + storeUrl;
    const origin = new URL(base).origin;
    const targets = [origin + '/cart.js', origin + '/cart', origin];
    for (const t of targets) {
      try {
        const res = await fetch(t, { method: 'GET', mode: 'cors' });
        if (res.ok) return { ok: true, status: res.status, probed: t, origin };
      } catch {
        // try next / opaque
      }
    }
    // no-cors opaque probe — can only prove network reachability weakly
    try {
      await fetch(origin + '/cart.js', { mode: 'no-cors' });
      return { ok: null, status: 0, probed: origin + '/cart.js', origin, note: 'cors_blocked_use_netlify_function' };
    } catch (e) {
      return { ok: false, status: 0, probed: origin, error: String(e.message || e), origin };
    }
  }

  $('go').addEventListener('click', async () => {
    const store = $('url').value.trim();
    if (!store) { alert('צריך כתובת חנות'); return; }
    const btn = $('go');
    const st = $('status');
    btn.disabled = true;
    st.className = 'status show';
    st.textContent = 'בודק…';
    st.classList.remove('ok', 'bad');

    let result;
    try {
      const u = new URL(fnBase(), location.origin);
      u.searchParams.set('url', store.startsWith('http') ? store : 'https://' + store);
      const token = $('tg-token').value.trim();
      const chat = $('tg-chat').value.trim();
      if (token && chat) {
        u.searchParams.set('telegram_token', token);
        u.searchParams.set('chat_id', chat);
      }
      const res = await fetch(u.href);
      if (res.ok) {
        result = await res.json();
      } else {
        result = await checkDirect(store);
      }
    } catch {
      result = await checkDirect(store);
    }

    btn.disabled = false;
    updateCron();

    if (result.ok === true) {
      st.classList.add('ok');
      st.textContent = 'ירוק — הקופה מגיבה (' + (result.status || 200) + ')';
    } else if (result.ok === null) {
      st.classList.add('bad');
      st.textContent = 'לא ניתן לבדוק מהדפדפן (CORS). אחרי Deploy ל־Netlify — הפונקציה תבדוק מהשרת. בינתיים השתמש בקישור הקרון.';
    } else {
      st.classList.add('bad');
      st.textContent = 'אדום — הקופה לא נראית תקינה' + (result.status ? ' (HTTP ' + result.status + ')' : '');
    }
  });

  updateCron();
})();

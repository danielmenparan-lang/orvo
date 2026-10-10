(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  function digitsPhone(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (d.startsWith('0')) d = '972' + d.slice(1);
    return d;
  }

  function buildMsg() {
    const amount = ($('amount').value || '').trim() || '___';
    const cur = $('currency').value;
    const what = ($('what').value || '').trim() || 'העבודה';
    const from = ($('from').value || '').trim() || 'אני';
    const pay = ($('pay').value || '').trim();
    const tone = $('tone').value;
    const money = cur === '₪' ? `${amount}₪` : `${cur}${amount}`;

    let msg;
    if (tone === 'soft') {
      msg = `היי, כאן ${from} 🙂\nרציתי לבדוק לגבי התשלום על ${what} (${money}).\nנוח לעדכן מתי אפשר לסגור? תודה!`;
    } else if (tone === 'last') {
      msg = `היי, כאן ${from}.\nלקראת סוף השבוע — נשמח לסגור את התשלום על ${what} (${money}).\nאפשר לעדכן היום?`;
    } else {
      msg = `היי, כאן ${from}.\nעדיין מחכים לתשלום על ${what} — ${money}.\nאפשר לעדכן מתי משולם?`;
    }
    if (pay) msg += `\n\nלינק לתשלום:\n${pay}`;
    return msg;
  }

  function showPreview() {
    const el = $('preview');
    el.textContent = buildMsg();
    el.classList.add('show');
  }

  $('send').addEventListener('click', () => {
    const phone = digitsPhone($('phone').value);
    if (phone.length < 10) {
      alert('צריך מספר טלפון עם קידומת (למשל 97250...)');
      return;
    }
    const msg = buildMsg();
    showPreview();
    const url = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(msg);
    window.open(url, '_blank', 'noopener');
  });

  $('copy').addEventListener('click', async () => {
    const msg = buildMsg();
    showPreview();
    try {
      await navigator.clipboard.writeText(msg);
      alert('ההודעה הועתקה');
    } catch {
      prompt('העתק ידנית:', msg);
    }
  });

  $('pro').addEventListener('click', (e) => {
    e.preventDefault();
    const u = (window.SHILAMTA_LS?.pro || '').trim();
    if (!u) {
      alert('Lemon Squeezy עדיין לא מחובר.\n\nצור מוצר Pro → הדבק ב־shilamta/config.js\nPayout → לאומי / PayPal\nבלי עוסק אפשר להתחיל.');
      return;
    }
    window.open(u, '_blank', 'noopener');
  });

  ['amount', 'what', 'from', 'pay', 'tone', 'currency'].forEach(id => {
    $(id).addEventListener('input', () => {
      if ($('preview').classList.contains('show')) showPreview();
    });
    $(id).addEventListener('change', () => {
      if ($('preview').classList.contains('show')) showPreview();
    });
  });
})();

(function () {
  'use strict';
  const KEY = 'subshield_cois_v1';
  const $ = (id) => document.getElementById(id);

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch { return []; }
  }
  function save(rows) {
    localStorage.setItem(KEY, JSON.stringify(rows));
  }

  function daysUntil(iso) {
    if (!iso) return null;
    const end = new Date(iso + 'T23:59:59');
    const now = new Date();
    return Math.ceil((end - now) / 86400000);
  }

  function statusOf(iso) {
    if (!iso) return { key: 'miss', label: 'Missing' };
    const d = daysUntil(iso);
    if (d < 0) return { key: 'bad', label: 'Expired' };
    if (d <= 14) return { key: 'warn', label: d + 'd left' };
    if (d <= 30) return { key: 'warn', label: d + 'd left' };
    return { key: 'ok', label: 'Valid' };
  }

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2800);
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function render() {
    const rows = load().sort((a, b) => (a.expires || '9999').localeCompare(b.expires || '9999'));
    let ok = 0, warn = 0, bad = 0, miss = 0;
    rows.forEach(r => {
      const s = statusOf(r.expires);
      if (s.key === 'ok') ok++;
      else if (s.key === 'warn') warn++;
      else if (s.key === 'bad') bad++;
      else miss++;
    });
    $('stats').innerHTML = `
      <div class="stat"><b>${rows.length}</b><span>Subs tracked</span></div>
      <div class="stat"><b style="color:#6EE7B7">${ok}</b><span>Valid</span></div>
      <div class="stat"><b style="color:#FCD34D">${warn}</b><span>Expiring ≤30d</span></div>
      <div class="stat"><b style="color:#FCA5A5">${bad + miss}</b><span>Expired / missing</span></div>`;

    if (!rows.length) {
      $('table-wrap').innerHTML = '<p class="empty">No COIs yet — add your first sub.</p>';
      return;
    }
    $('table-wrap').innerHTML = `
      <table>
        <thead><tr><th>Project</th><th>Sub</th><th>Expires</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${rows.map(r => {
            const s = statusOf(r.expires);
            return `<tr>
              <td>${esc(r.project)}</td>
              <td>${esc(r.sub)}<br><span style="color:var(--muted);font-size:12px">${esc(r.email || '')}</span></td>
              <td>${esc(r.expires || '—')}</td>
              <td><span class="pill ${s.key}">${s.label}</span></td>
              <td><button class="btn btn-ghost" data-del="${r.id}" style="margin:0;padding:6px 10px;font-size:12px">Remove</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
    $('table-wrap').querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        save(load().filter(r => r.id !== btn.dataset.del));
        render();
        toast('Removed');
      });
    });
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s ?? '';
    return d.innerHTML;
  }

  $('btn-add').addEventListener('click', () => {
    const project = $('f-project').value.trim();
    const sub = $('f-sub').value.trim();
    const email = $('f-email').value.trim();
    const expires = $('f-exp').value;
    const carrier = $('f-carrier').value.trim();
    if (!project || !sub) { toast('Project and subcontractor required'); return; }
    const rows = load();
    rows.push({ id: uid(), project, sub, email, expires, carrier, created: Date.now() });
    save(rows);
    $('f-sub').value = '';
    $('f-email').value = '';
    $('f-exp').value = '';
    $('f-carrier').value = '';
    render();
    toast('COI saved');
  });

  $('btn-seed').addEventListener('click', () => {
    const today = new Date();
    const iso = (offset) => {
      const d = new Date(today); d.setDate(d.getDate() + offset);
      return d.toISOString().slice(0, 10);
    };
    save([
      { id: uid(), project: 'Harbor Lot B', sub: 'Apex Electric LLC', email: 'ops@apex.example', expires: iso(45), carrier: 'Hartford GL $1M', created: Date.now() },
      { id: uid(), project: 'Harbor Lot B', sub: 'Northwind HVAC', email: 'billing@northwind.example', expires: iso(9), carrier: 'Travelers', created: Date.now() },
      { id: uid(), project: 'Riverfront Phase 2', sub: 'Summit Concrete', email: 'coi@summit.example', expires: iso(-3), carrier: 'Zurich', created: Date.now() },
      { id: uid(), project: 'Riverfront Phase 2', sub: 'ClearView Glazing', email: 'office@clearview.example', expires: '', carrier: '', created: Date.now() },
    ]);
    render();
    toast('Sample GC data loaded');
  });

  $('btn-chase').addEventListener('click', () => {
    const due = load().filter(r => {
      const s = statusOf(r.expires);
      return s.key === 'warn' || s.key === 'bad' || s.key === 'miss';
    });
    if (!due.length) { toast('Everyone is green — no chase needed'); return; }
    const lines = due.map(r => `• ${r.sub} (${r.project}) → ${r.email || 'no email'} [${statusOf(r.expires).label}]`);
    alert('Would send chase emails (connect Resend later):\n\n' + lines.join('\n'));
    toast(`Queued ${due.length} chase email(s)`);
  });

  $('btn-export').addEventListener('click', () => {
    const rows = load();
    if (!rows.length) { toast('Nothing to export'); return; }
    const header = 'project,subcontractor,email,expires,carrier,status\n';
    const body = rows.map(r => {
      const s = statusOf(r.expires).label;
      return [r.project, r.sub, r.email, r.expires, r.carrier, s]
        .map(x => `"${String(x || '').replace(/"/g, '""')}"`).join(',');
    }).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'subshield-compliance.csv';
    a.click();
    toast('CSV downloaded');
  });

  render();
})();

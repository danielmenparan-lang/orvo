(function () {
  'use strict';
  const CUR = 'shoppingred_current_v1';
  const PREV = 'shoppingred_prev_v1';
  const FIXED = 'shoppingred_fixed_v1';
  const $ = (id) => document.getElementById(id);

  function toast(m) {
    const el = $('toast');
    el.textContent = m;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2600);
  }
  function load(k) {
    try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; }
  }
  function save(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s ?? '';
    return d.innerHTML;
  }

  function parseCSV(text) {
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const split = (line) => {
      const out = []; let cur = ''; let q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { q = !q; continue; }
        if (c === ',' && !q) { out.push(cur); cur = ''; continue; }
        cur += c;
      }
      out.push(cur);
      return out.map(s => s.trim());
    };
    const headers = split(lines[0]).map(h => h.toLowerCase());
    const idx = (names) => headers.findIndex(h => names.some(n => h.includes(n)));
    const iId = idx(['item id', 'offer id', 'id', 'product id']);
    const iIssue = idx(['issue', 'title', 'description', 'problem']);
    const iSev = idx(['severity', 'level']);
    if (iId < 0 || iIssue < 0) throw new Error('Need columns for Item ID and Issue/Title');
    const rows = [];
    for (let r = 1; r < lines.length; r++) {
      const cols = split(lines[r]);
      if (!cols[iId] && !cols[iIssue]) continue;
      rows.push({
        id: cols[iId] || 'unknown',
        issue: cols[iIssue] || 'Unknown issue',
        severity: (iSev >= 0 ? cols[iSev] : 'error') || 'error',
      });
    }
    return rows;
  }

  function keyOf(r) { return r.id + '||' + r.issue; }

  function classify(current, previous, fixedSet) {
    const prevKeys = new Set((previous || []).map(keyOf));
    return current.map(r => {
      const k = keyOf(r);
      let tag = 'new';
      if (fixedSet.has(k)) tag = 'fix';
      else if (prevKeys.has(k)) tag = 'rec';
      const pb = window.shoppingredLookupFix(r.issue);
      return { ...r, tag, fix: pb.fix, field: pb.field, k };
    }).sort((a, b) => {
      const rank = { new: 0, rec: 1, fix: 2 };
      return rank[a.tag] - rank[b.tag];
    });
  }

  function render() {
    const current = load(CUR) || [];
    const previous = load(PREV) || [];
    const fixedSet = new Set(load(FIXED) || []);
    const rows = classify(current, previous, fixedSet);
    const nNew = rows.filter(r => r.tag === 'new').length;
    const nRec = rows.filter(r => r.tag === 'rec').length;
    const nFix = rows.filter(r => r.tag === 'fix').length;
    $('stats').innerHTML = `
      <div class="stat"><b>${current.length}</b><span>Open issues</span></div>
      <div class="stat"><b style="color:#FCA5A5">${nNew}</b><span>New vs last week</span></div>
      <div class="stat"><b style="color:#FCD34D">${nRec}</b><span>Recurring</span></div>
      <div class="stat"><b style="color:#6EE7B7">${nFix}</b><span>Marked fixed</span></div>`;

    if (!rows.length) {
      $('table').innerHTML = '<p class="empty">No upload yet.</p>';
      return;
    }
    $('table').innerHTML = `
      <table>
        <thead><tr><th>Status</th><th>Item</th><th>Issue</th><th>Shopify fix</th><th></th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><span class="pill ${r.tag}">${r.tag === 'new' ? 'New' : r.tag === 'rec' ? 'Recurring' : 'Fixed'}</span></td>
              <td>${esc(r.id)}</td>
              <td>${esc(r.issue)}<div class="fix">${esc(r.severity)} · field: ${esc(r.field)}</div></td>
              <td class="fix">${esc(r.fix)}</td>
              <td>${r.tag === 'fix'
                ? `<button class="btn btn-ghost" data-unfix="${esc(r.k)}" type="button">Undo</button>`
                : `<button class="btn btn-ghost" data-fix="${esc(r.k)}" type="button">Mark fixed</button>`}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
    $('table').querySelectorAll('[data-fix]').forEach(btn => {
      btn.addEventListener('click', () => {
        const arr = load(FIXED) || [];
        if (!arr.includes(btn.dataset.fix)) arr.push(btn.dataset.fix);
        save(FIXED, arr);
        render();
        toast('Marked fixed — confirm next week’s export');
      });
    });
    $('table').querySelectorAll('[data-unfix]').forEach(btn => {
      btn.addEventListener('click', () => {
        save(FIXED, (load(FIXED) || []).filter(x => x !== btn.dataset.unfix));
        render();
      });
    });
  }

  function ingest(rows, label) {
    const cur = load(CUR);
    if (cur && cur.length) save(PREV, cur);
    save(CUR, rows);
    render();
    toast(label || `Loaded ${rows.length} issues`);
  }

  function onFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCSV(String(reader.result));
        if (!rows.length) throw new Error('No rows found');
        ingest(rows, `Parsed ${rows.length} issues from ${file.name}`);
      } catch (e) {
        toast(e.message || 'Parse failed');
      }
    };
    reader.readAsText(file);
  }

  $('file').addEventListener('change', (e) => onFile(e.target.files?.[0]));
  const drop = $('drop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); });
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    onFile(e.dataTransfer?.files?.[0]);
  });

  $('btn-sample').addEventListener('click', () => {
    // Simulate "last week" then "this week" for demo diff
    const lastWeek = [
      { id: 'SKU-100', issue: 'Missing GTIN', severity: 'error' },
      { id: 'SKU-220', issue: 'Image too small', severity: 'error' },
      { id: 'SKU-330', issue: 'Price mismatch', severity: 'warning' },
    ];
    const thisWeek = [
      { id: 'SKU-100', issue: 'Missing GTIN', severity: 'error' },
      { id: 'SKU-220', issue: 'Image too small', severity: 'error' },
      { id: 'SKU-440', issue: 'Product landing page is unavailable', severity: 'error' },
      { id: 'SKU-550', issue: 'Insufficient product identifiers', severity: 'error' },
    ];
    save(PREV, lastWeek);
    save(CUR, thisWeek);
    save(FIXED, []);
    render();
    toast('Sample: 2 recurring, 2 new (price issue resolved)');
  });

  $('btn-clear').addEventListener('click', () => {
    localStorage.removeItem(CUR);
    localStorage.removeItem(PREV);
    localStorage.removeItem(FIXED);
    render();
    toast('Cleared');
  });

  render();
})();

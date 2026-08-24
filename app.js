/**
 * ORVO Marketplace — clean rewrite
 * Client posts → Builder quotes → Pay via ORVO
 */
(function () {
  'use strict';

  // ── STATE ──
  let db = null;
  let user = null;
  let profile = null;
  let view = 'requests';
  let chatRequestId = null;
  let chatRequestStatus = 'open';
  let quoteRequestId = null;
  let pendingPay = null; // { qid, rid, amountCents, fee, builderNet }
  let awaitingPayContext = null; // { rid, qid, checkoutOpen }
  let chatSub = null;
  let paySub = null;
  let chatPoll = null;
  let postSignupIntent = 'client';
  let pendingClientPost = false;
  let adminChannel = null;
  let disputesChannel = null;
  let quotesChannel = null;
  let notifChannel = null;
  let checkoutPollTimer = null;

  const $ = (id) => document.getElementById(id);
  const FEE = () => window.ORVO_FEE_PERCENT || 0;
  // Fallback if supabase-config.js cached/old
  const ADMIN_EMAIL = 'danielmen.paran@gmail.com';
  const APPLY_ALL_SQL_URL = 'https://raw.githubusercontent.com/danielmenparan-lang/orvo/cursor/orvo-local-site-3bd5/sql/APPLY-ALL-001-020.sql';

  function track(event, props) {
    try { window.ORVO_EVENTS?.track(event, props); } catch (_) { /* stub */ }
  }

  function myEmail() {
    return (user?.email || profile?.email || '').toLowerCase().trim();
  }

  function cfgAdminEmail() {
    const c = (window.ORVO_ADMIN_EMAIL || ADMIN_EMAIL).toLowerCase().trim();
    return c && c !== 'your@email.com' ? c : ADMIN_EMAIL.toLowerCase();
  }

  // ── UTILS ──
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s ?? '';
    return d.innerHTML;
  }

  /** Format cents for display. Default settlement currency is USD (global marketplace). */
  function formatMoney(cents, currency = 'USD') {
    const amount = (Number(cents) || 0) / 100;
    const cur = String(currency || 'USD').toUpperCase();
    try {
      return new Intl.NumberFormat(cur === 'ILS' ? 'he-IL' : 'en-US', {
        style: 'currency',
        currency: cur,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      const sym = cur === 'ILS' ? '₪' : '$';
      return sym + amount.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
  }

  function money(c) {
    return formatMoney(c, window.ORVO_DISPLAY_CURRENCY || 'USD');
  }

  function statusLabel(s) {
    const map = {
      open: 'Open',
      in_progress: 'In progress',
      awaiting_payment: 'Awaiting payment',
      funded: 'Funded',
      delivered: 'Delivered',
      completed: 'Completed',
      cancelled: 'Cancelled',
      disputed: 'Disputed',
      pending: 'Pending',
      checkout_open: 'Checkout open',
      accepted: 'Accepted',
      approved: 'Approved',
      paid: 'Paid',
      rejected: 'Declined',
      withdrawn: 'Withdrawn',
      held: 'Held',
      released: 'Released',
      none: 'None',
    };
    return map[s] || s || 'Unknown';
  }

  function sanitizePublicErr(msg) {
    return String(msg || 'Something went wrong')
      .replace(/sql-[\w.-]+\.sql/gi, 'database setup')
      .replace(/run\s+[\w./-]+\.sql[^.!]*/gi, 'complete database setup')
      .replace(/Supabase/gi, 'database')
      .replace(/danielmen\.paran@gmail\.com/gi, 'ORVO support');
  }

  function userFacingErr(msg) {
    if (isAdmin()) return msg;
    return sanitizePublicErr(msg);
  }

  /** Surface Edge Function JSON errors in toasts (public-safe). */
  function edgeErrMessage(body, fallback = 'Request failed') {
    const msg = body?.message || body?.error || fallback;
    return userFacingErr(typeof msg === 'string' ? msg : fallback);
  }

  /** Honest copy when Checkout Edge returns not_configured / network / auth. */
  function checkoutUnavailableMessage(checkout, fallback = 'Checkout unavailable — still awaiting payment') {
    if (checkout?.reason === 'not_configured') {
      return 'Stripe Checkout not configured yet — no card charged. Job stays awaiting payment.';
    }
    if (checkout?.reason === 'network') {
      return 'Could not reach checkout — try again. No card charged.';
    }
    if (checkout?.reason === 'auth') {
      return 'Sign in again to start checkout.';
    }
    return checkout?.message || fallback;
  }

  /** Honest copy when Connect Edge returns not_configured / network / auth. */
  function connectUnavailableMessage(result, fallback = 'Could not start payout onboarding') {
    if (result?.reason === 'not_configured') {
      return 'Payout onboarding not configured — set Stripe secrets + deploy create-connect-account';
    }
    if (result?.reason === 'network') {
      return 'Could not reach Connect — try again from Profile.';
    }
    if (result?.reason === 'auth') {
      return 'Sign in again to set up payouts.';
    }
    return result?.message || fallback;
  }

  /** Honest copy when release Edge returns errors (not the 501 fallback path). */
  function releaseUnavailableMessage(result, fallback = 'Release failed') {
    if (result?.reason === 'not_configured') {
      return 'Release not configured — deploy release-to-builder + Stripe secrets';
    }
    if (result?.reason === 'network') {
      return 'Could not reach release — try again.';
    }
    if (result?.reason === 'auth') {
      return 'Sign in again to release payment.';
    }
    return result?.message || fallback;
  }

  function parseMoney(s) {
    const m = String(s || '').replace(/,/g, '').match(/\d+(\.\d+)?/);
    return m ? Math.round(parseFloat(m[0]) * 100) : 0;
  }

  function ago(d) {
    const m = Math.floor((Date.now() - new Date(d)) / 60000);
    if (m < 1) return 'now';
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    return h < 24 ? h + 'h' : Math.floor(h / 24) + 'd';
  }

  function timeAgoHtml(d) {
    if (!d) return esc(ago(d));
    return `<time datetime="${esc(d)}">${esc(ago(d))}</time>`;
  }

  function toast(msg, ok) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.style.background = ok ? '#15803D' : '#B91C1C';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', ok ? 'polite' : 'assertive');
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 3500);
  }

  function loadingSkeleton(n) {
    const lines = Array.from({ length: n || 3 }, (_, i) =>
      `<div class="skel-line ${i === 0 ? 'lg' : (i === (n || 3) - 1 ? 'sm' : '')}"></div>`
    ).join('');
    return `<div class="skel" role="status" aria-busy="true" aria-label="Loading">${lines}</div>`;
  }

  function showMsg(id, text, ok) {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'msg ' + (ok ? 'ok' : 'err');
    el.classList.remove('hidden');
  }

  function showSchemaMsg(id, text, hint) {
    const el = $(id);
    if (!el) return;
    const msg = userFacingErr(text);
    if (isDbSchemaErr(text)) {
      el.innerHTML = `<span>${esc(msg)}</span>${founderSchemaFixHtml(hint || 'Schema missing? Run APPLY-ALL SQL.')}`;
      wireFounderSchemaFix(el);
    } else {
      el.textContent = msg;
    }
    el.className = 'msg err';
    el.classList.remove('hidden');
  }

  function hideMsg(id) { $(id)?.classList.add('hidden'); }

  function bootErr(msg, { setupHint = false } = {}) {
    const el = $('boot-error');
    el.textContent = sanitizePublicErr(msg);
    el.classList.remove('hidden');
    document.body.classList.add('boot-error-on');
    const actions = $('boot-error-actions');
    if (actions) actions.classList.toggle('hidden', !setupHint);
    console.warn('ORVO boot:', msg);
  }

  async function copyApplyAllSql() {
    try {
      const res = await fetch(APPLY_ALL_SQL_URL);
      if (!res.ok) throw new Error('fetch failed');
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      toast('Copied APPLY-ALL SQL — Supabase SQL Editor → paste → Run once', true);
      return true;
    } catch {
      toast('Could not copy — opening raw SQL in new tab', false);
      window.open(APPLY_ALL_SQL_URL, '_blank', 'noopener');
      return false;
    }
  }

  async function copyDeployCmd() {
    try {
      await navigator.clipboard.writeText('bash scripts/deploy-stripe.sh');
      toast('Copied: bash scripts/deploy-stripe.sh', true);
    } catch {
      toast('bash scripts/deploy-stripe.sh', true);
    }
  }

  async function copyVerifyCmd() {
    try {
      await navigator.clipboard.writeText('bash scripts/verify-edge.sh');
      toast('Copied: bash scripts/verify-edge.sh', true);
    } catch {
      toast('bash scripts/verify-edge.sh', true);
    }
  }

  async function copyFounderSetupCmd() {
    try {
      await navigator.clipboard.writeText('bash scripts/founder-setup.sh');
      toast('Copied: bash scripts/founder-setup.sh', true);
    } catch {
      toast('bash scripts/founder-setup.sh', true);
    }
  }

  async function copySecretsTemplateCmd() {
    const cmd = 'cp scripts/edge-secrets.template.sh scripts/edge-secrets.local.sh';
    try {
      await navigator.clipboard.writeText(cmd);
      toast('Copied secrets template cmd — edit local file, then run it', true);
    } catch {
      toast(cmd, true);
    }
  }

  /** Founder/admin hint when a table/migration is missing. */
  function founderSchemaFixHtml(hint) {
    if (!(isAdmin() || isConfiguredFounder())) return '';
    return `<p class="empty" style="font-size:12px;padding-top:8px">${esc(hint)}
      <button type="button" class="btn btn-ghost btn-copy-apply-err" style="padding:6px 10px;font-size:12px">Copy APPLY-ALL SQL</button>
      · <button type="button" class="btn btn-ghost" data-goto="profile" style="padding:6px 10px;font-size:12px">Setup health</button></p>`;
  }

  function wireFounderSchemaFix(root) {
    (root || document).querySelectorAll('.btn-copy-apply-err').forEach((btn) => {
      btn.addEventListener('click', () => copyApplyAllSql());
    });
  }

  function wireActivate(el, fn) {
    el.addEventListener('click', fn);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); }
    });
  }

  function isDbSchemaErr(msg) {
    return /relation|does not exist|schema|42P01|column.*does not exist/i.test(msg || '');
  }

  function toastSchemaErr(msg, hint) {
    const text = userFacingErr(msg);
    if (isDbSchemaErr(msg) && (isAdmin() || isConfiguredFounder())) {
      toast(text + ' — Copy APPLY-ALL from Profile → Setup health.', false);
    } else {
      toast(text, false);
    }
  }

  let modalFocusReturn = null;
  function focusModal(modalEl, focusSel) {
    if (!modalEl) return;
    modalFocusReturn = document.activeElement;
    const target = focusSel
      ? modalEl.querySelector(focusSel)
      : modalEl.querySelector('input:not([type=hidden]), textarea, select, button.btn-black, button:not(.modal-close)');
    setTimeout(() => target?.focus?.(), 40);
    syncPageAriaHidden();
  }
  function blurModal(modalEl) {
    if (!modalEl) return;
    const ret = modalFocusReturn;
    modalFocusReturn = null;
    if (ret && typeof ret.focus === 'function' && document.contains(ret)) {
      setTimeout(() => ret.focus(), 0);
    }
    setTimeout(syncPageAriaHidden, 0);
  }
  function syncPageAriaHidden() {
    const modalOpen = !!document.querySelector('.modal-bg.open');
    const dashOpen = $('dashboard')?.classList.contains('open');
    const hideLanding = modalOpen || dashOpen;
    document.querySelectorAll('main, nav, footer, #boot-error, #boot-error-actions').forEach((el) => {
      if (!el) return;
      if (hideLanding) el.setAttribute('aria-hidden', 'true');
      else el.removeAttribute('aria-hidden');
    });
    const dash = $('dashboard');
    if (dash) {
      if (modalOpen && dashOpen) dash.setAttribute('aria-hidden', 'true');
      else dash.removeAttribute('aria-hidden');
    }
  }

  let dashFocusReturn = null;
  function focusDashOpen() {
    dashFocusReturn = document.activeElement;
    syncPageAriaHidden();
    setTimeout(() => $('dashboard')?.querySelector('[data-action="close-dash"]')?.focus?.(), 40);
  }
  function blurDashClose() {
    const ret = dashFocusReturn;
    dashFocusReturn = null;
    if (ret && typeof ret.focus === 'function' && document.contains(ret)) {
      setTimeout(() => ret.focus(), 0);
    }
    syncPageAriaHidden();
  }

  function focusableIn(root) {
    if (!root) return [];
    return [...root.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((el) => el.offsetParent !== null);
  }

  function trapFocusCycle(e, root) {
    const nodes = focusableIn(root);
    if (nodes.length < 2) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function trapModalTab(e) {
    if (e.key !== 'Tab') return;
    const modal = document.querySelector('.modal-bg.open');
    if (!modal) return;
    trapFocusCycle(e, modal);
  }

  function trapDashTab(e) {
    if (e.key !== 'Tab') return;
    if (document.querySelector('.modal-bg.open')) return;
    const dash = $('dashboard');
    if (!dash?.classList.contains('open')) return;
    trapFocusCycle(e, dash);
  }

  function setViewTitle(label) {
    const text = label || 'Dashboard';
    if ($('view-title')) $('view-title').textContent = text;
    syncDocTitle(text);
  }

  function refreshViewBtnHtml() {
    return '<button type="button" class="btn btn-ghost" id="btn-refresh-view" style="padding:8px 12px;font-size:12px" title="Refresh this view">Refresh</button>';
  }

  function wireRefreshView() {
    $('btn-refresh-view')?.addEventListener('click', () => {
      refreshActiveDashView({ reason: 'manual' });
      toast('Refreshed', true);
    });
  }

  function followNotificationLink(link) {
    if (!link) return false;
    let qs = String(link).trim();
    if (qs.includes('?')) qs = qs.split('?').pop();
    else if (qs.startsWith('?')) qs = qs.slice(1);
    const params = new URLSearchParams(qs);
    const rid = params.get('rid');
    if (rid) { go('chat', rid); return true; }
    const status = params.get('status');
    const allowedStatus = new Set(['open', 'awaiting_payment', 'funded', 'delivered', 'completed', 'disputed']);
    if (status && allowedStatus.has(status)) window.__orvoAllReqsStatus = status;
    let v = params.get('view');
    if (!v && status && allowedStatus.has(status) && isAdmin()) v = 'all-requests';
    if (!v) return false;
    const allowed = new Set([
      'requests', 'jobs', 'invites', 'quotes', 'messages', 'apply', 'status',
      'profile', 'admin', 'all-requests', 'disputes', 'notifications',
    ]);
    if (!allowed.has(v)) return false;
    if ((v === 'all-requests' || v === 'admin' || v === 'disputes') && !isAdmin()) return false;
    if ((v === 'jobs' || v === 'invites' || v === 'quotes') && !(isBuilder() || isAdmin())) return false;
    go(v);
    return true;
  }

  function isConfiguredFounder() {
    const logged = myEmail();
    const cfg = cfgAdminEmail();
    return !!(cfg && logged && cfg === logged);
  }

  // ── CHAT FILTER (js/chat-policy.js) ──
  function validateChatMessage(body, requestStatus) {
    if (window.ORVO_CHAT?.validateChatMessage) {
      return window.ORVO_CHAT.validateChatMessage(body, requestStatus);
    }
    return { ok: true };
  }

  // ── ROLES ──
  function isAdmin() {
    return !!profile?.is_admin;
  }
  function isBuilder() { return profile?.builder_status === 'approved'; }
  function isPending() { return profile?.builder_status === 'pending'; }
  function adminEmail() { return cfgAdminEmail(); }

  async function refreshDisputesBadge() {
    if (!isAdmin() || !db) return;
    try {
      const { count } = await needDb().from('disputes')
        .select('*', { count: 'exact', head: true })
        .in('status', ['open', 'under_review']);
      const n = count || 0;
      const side = $('sidebar')?.querySelector('[data-view="disputes"]');
      if (side) {
        side.innerHTML = n
          ? `Disputes<span class="badge-dot">${n > 9 ? '9+' : n}</span>`
          : 'Disputes';
      }
    } catch { /* disputes table optional */ }
  }

  async function refreshAdminBadge() {
    if (!isAdmin() || !db) return;
    try {
      const { count } = await needDb().from('builder_applications')
        .select('*', { count: 'exact', head: true }).eq('status', 'pending');
      const btn = $('nav-main-btn');
      if (btn) btn.textContent = count ? `Review builders (${count})` : 'Review builders';
    } catch { /* SQL not ready */ }
  }

  async function refreshInviteBadge() {
    if (!isBuilder() || !db) return;
    try {
      const { count } = await needDb().from('request_invites')
        .select('*', { count: 'exact', head: true }).eq('builder_id', user.id);
      const btn = $('nav-main-btn');
      if (btn && btn.dataset.action === 'invites') {
        btn.textContent = count ? `Invited jobs (${count})` : 'Invited jobs';
      }
      const side = $('sidebar')?.querySelector('[data-view="invites"]');
      if (side) side.textContent = count ? `Invited jobs (${count})` : 'Invited jobs';
    } catch { /* table missing */ }
  }

  let __orvoUnread = 0;
  const BASE_TITLE = 'ORVO — Hire vetted builders for custom AI agents';

  function syncDocTitle(viewLabel) {
    const prefix = __orvoUnread ? `(${__orvoUnread > 9 ? '9+' : __orvoUnread}) ` : '';
    if (viewLabel) {
      document.title = prefix + viewLabel + ' · ORVO';
    } else {
      document.title = prefix + BASE_TITLE;
    }
  }

  async function refreshNotifBadge() {
    if (!user || !db) return;
    try {
      const { count } = await needDb().from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id).is('read_at', null);
      const n = count || 0;
      __orvoUnread = n;
      syncDocTitle($('dashboard')?.classList.contains('open') ? ($('view-title')?.textContent || null) : null);
      const label = n ? (n > 9 ? '9+' : String(n)) : '';
      const side = $('sidebar')?.querySelector('[data-view="notifications"]');
      if (side) {
        const base = 'Notifications';
        side.innerHTML = n
          ? `${base}<span class="badge-dot">${label}</span>`
          : base;
      }
      const navBtn = $('nav-notif-btn');
      if (navBtn) {
        navBtn.innerHTML = n
          ? `Alerts<span class="badge-dot">${label}</span>`
          : 'Alerts';
      }
    } catch { /* sql/012 not applied */ }
  }

  function watchBuilderApplications() {
    if (!db || !isAdmin() || adminChannel) return;
    adminChannel = needDb().channel('admin-apps')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'builder_applications' }, () => {
        refreshAdminBadge();
        toast('New builder application — Review builders', true);
        if ($('dashboard').classList.contains('open') && view === 'admin') loadAdmin();
      })
      .subscribe();
  }

  // ── SUPABASE ──
  function connect() {
    const lib = window.supabase;
    if (!lib?.createClient) return null;
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return null;
    try {
      return lib.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    } catch { return null; }
  }

  function needDb() {
    if (db) return db;
    throw new Error('No connection — check internet and refresh');
  }

  async function loadProfile() {
    if (!user) { profile = null; return; }

    const { data: { user: freshUser }, error: authErr } = await needDb().auth.getUser();
    if (authErr || !freshUser) {
      profile = null;
      return;
    }
    user = freshUser;

    let { data, error } = await needDb().from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) {
      bootErr('Database error — complete database setup, then refresh. ' + error.message, { setupHint: true });
      return;
    }

    // New signups: wait for trigger to create profile
    if (!data) {
      await new Promise((r) => setTimeout(r, 600));
      ({ data, error } = await needDb().from('profiles').select('*').eq('id', user.id).maybeSingle());
      if (error) {
        bootErr('Database error — complete database setup, then refresh. ' + error.message, { setupHint: true });
        return;
      }
    }

    const cfg = cfgAdminEmail();
    const my = myEmail();
    // Admin is granted only in Supabase SQL — never self-elevate from the client
    const isConfiguredAdmin = !!(cfg && my && cfg === my);

    if (data) {
      profile = { ...data, email: data.email || user.email };
      if (isConfiguredAdmin && !data.is_admin) {
        console.warn('ORVO: set is_admin=true in Supabase for', my, '(client cannot self-elevate)');
      }
      return;
    }

    const row = {
      id: user.id,
      full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
      email: user.email,
      role: 'client',
      builder_status: 'none',
      is_admin: false,
    };
    const { data: inserted, error: insErr } = await needDb().from('profiles').insert(row).select().single();
    if (insErr) {
      if (insErr.code === '23505') {
        const { data: again } = await needDb().from('profiles').select('*').eq('id', user.id).maybeSingle();
        if (again) { profile = again; return; }
      }
      if (insErr.code === '23503') {
        bootErr('Session out of sync — sign out, then sign in again after database setup.', { setupHint: true });
        return;
      }
      bootErr('Profile error — complete database setup, then refresh. ' + insErr.message, { setupHint: true });
      return;
    }
    profile = inserted;
  }

  function stopPayWatch() {
    if (paySub && db) {
      db.removeChannel(paySub);
      paySub = null;
    }
  }

  function stopCheckoutPoll() {
    if (checkoutPollTimer) {
      clearInterval(checkoutPollTimer);
      checkoutPollTimer = null;
    }
  }

  /** After Checkout return, poll DB for webhook-written held/funded (honest — no client-side funded). */
  function pollPaymentAfterCheckout(rid, maxAttempts = 10) {
    if (!rid || !db || !user) return;
    stopCheckoutPoll();
    let n = 0;
    checkoutPollTimer = setInterval(async () => {
      n += 1;
      if (n > maxAttempts) {
        stopCheckoutPoll();
        toast('Still confirming payment — webhook may be delayed. Open the project and refresh.', false);
        if (view === 'chat' && chatRequestId === rid) loadChat();
        else if (rid) go('chat', rid);
        return;
      }
      try {
        const { data: pay } = await needDb().from('payments')
          .select('status').eq('request_id', rid).maybeSingle();
        const { data: req } = await needDb().from('requests')
          .select('status').eq('id', rid).maybeSingle();
        if (pay?.status === 'held' || req?.status === 'funded') {
          stopCheckoutPoll();
          track('checkout_webhook_confirmed', { request_id: rid, payment_status: pay?.status });
          toast('Payment held — funds secured until you approve delivery.', true);
          if (view !== 'chat' || chatRequestId !== rid) go('chat', rid);
          else loadChat();
        }
      } catch { /* payments optional */ }
    }, 3000);
  }

  function handleCheckoutReturn() {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout') || params.get('paid');
    if (!checkout) return;
    const rid = params.get('rid');
    const clean = () => {
      const u = new URL(window.location.href);
      u.searchParams.delete('checkout');
      u.searchParams.delete('paid');
      u.searchParams.delete('session_id');
      u.searchParams.delete('rid');
      window.history.replaceState({}, '', u.pathname + u.search + u.hash);
    };
    if (checkout === 'success' || checkout === '1' || checkout === 'true') {
      track('checkout_return_success', { request_id: rid || null });
      toast('Checkout returned — funding confirms when the webhook marks funds held (not instant).', true);
      if (rid) {
        try { sessionStorage.setItem('orvo_checkout_poll_rid', rid); } catch { /* private mode */ }
      }
      clean();
      if (user) {
        ensureDashOpen();
        if (rid) {
          go('chat', rid);
          pollPaymentAfterCheckout(rid);
        } else go('requests');
      } else {
        openAuth('login');
      }
      return;
    }
    if (checkout === 'cancel' || checkout === '0') {
      track('checkout_return_cancel', { request_id: rid || null });
      toast('Checkout cancelled — job stays awaiting payment until you try again.', false);
      if (rid) {
        try { sessionStorage.setItem('orvo_checkout_poll_rid', rid); } catch { /* private mode */ }
      }
      clean();
      if (user && rid) {
        ensureDashOpen();
        go('chat', rid);
      } else if (!user) {
        openAuth('login');
      }
    }
  }

  function handleConnectReturn() {
    const params = new URLSearchParams(window.location.search);
    const connect = params.get('connect');
    if (!connect) return;
    const clean = () => {
      const u = new URL(window.location.href);
      u.searchParams.delete('connect');
      window.history.replaceState({}, '', u.pathname + u.search + u.hash);
    };
    const openProfileAfterConnect = () => {
      ensureDashOpen();
      go('profile');
      refreshUser().then(() => {
        if (view === 'profile') loadProfileView();
      });
    };
    if (connect === 'success' || connect === 'refresh') {
      track('connect_return', { status: connect });
      toast(connect === 'success'
        ? 'Payout onboarding returned — Connect status syncs via webhook (account.updated).'
        : 'Continue payout setup from Profile — Connect onboarding may need another step.', true);
      try { sessionStorage.setItem('orvo_connect_return', '1'); } catch { /* private mode */ }
      clean();
      if (user) openProfileAfterConnect();
      else openAuth('login');
      return;
    }
    if (connect === 'cancel') {
      track('connect_return_cancel', {});
      toast('Payout setup cancelled — you can retry from Profile or the payout banner.', false);
      clean();
      if (user) {
        ensureDashOpen();
        go('profile');
      } else {
        openAuth('login');
      }
    }
  }

  function watchIncomingQuotes() {
    if (!db || !user || quotesChannel) return;
    // Client hears new quotes on their requests (best-effort; needs Realtime enabled)
    quotesChannel = needDb().channel('quotes-in')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'quotes' }, async (payload) => {
        const q = payload.new;
        if (!q?.request_id || q.builder_id === user.id) return;
        const { data: req } = await needDb().from('requests').select('id,user_id,title').eq('id', q.request_id).maybeSingle();
        if (!req || req.user_id !== user.id) return;
        track('quote_received', { request_id: req.id, amount_cents: q.amount_cents });
        toast('New quote on “' + (req.title || 'your request') + '”', true);
        if ($('dashboard').classList.contains('open') && view === 'chat' && chatRequestId === req.id) {
          loadChat();
        }
      })
      .subscribe();
  }

  function watchDisputes() {
    if (!db || !isAdmin() || disputesChannel) return;
    disputesChannel = needDb().channel('admin-disputes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'disputes' }, () => {
        refreshDisputesBadge();
        if ($('dashboard').classList.contains('open') && view === 'disputes') loadDisputes();
      })
      .subscribe();
  }

  async function refreshUser() {
    if (!db) return;
    const { data: { session } } = await db.auth.getSession();
    user = session?.user || null;
    if (user) await loadProfile();
    else profile = null;
    updateNav();
    if (user && isAdmin()) {
      refreshAdminBadge();
      watchBuilderApplications();
      watchDisputes();
    }
    if (user) {
      watchIncomingQuotes();
      watchNotifications();
      refreshNotifBadge();
      try {
        const pollRid = sessionStorage.getItem('orvo_checkout_poll_rid');
        if (pollRid) {
          sessionStorage.removeItem('orvo_checkout_poll_rid');
          ensureDashOpen();
          go('chat', pollRid);
          pollPaymentAfterCheckout(pollRid);
        } else if (sessionStorage.getItem('orvo_connect_return')) {
          sessionStorage.removeItem('orvo_connect_return');
          ensureDashOpen();
          go('profile');
          if (view === 'profile') loadProfileView();
        }
      } catch { /* storage blocked */ }
    } else {
      if (quotesChannel && db) {
        db.removeChannel(quotesChannel);
        quotesChannel = null;
      }
      if (notifChannel && db) {
        db.removeChannel(notifChannel);
        notifChannel = null;
      }
      if (adminChannel && db) {
        db.removeChannel(adminChannel);
        adminChannel = null;
      }
      if (disputesChannel && db) {
        db.removeChannel(disputesChannel);
        disputesChannel = null;
      }
    }
  }

  function watchNotifications() {
    if (!db || !user || notifChannel) return;
    notifChannel = needDb().channel('notif-in')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: 'user_id=eq.' + user.id,
      }, (payload) => {
        const n = payload.new;
        if (!n) return;
        track('notification_received', { kind: n.kind });
        toast(n.title || 'New notification', true);
        refreshNotifBadge();
        if ($('dashboard').classList.contains('open') && view === 'notifications') {
          loadNotifications();
        }
      })
      .subscribe();
  }

  // ── NAV ──
  function updateNav() {
    $('nav-out').classList.toggle('hidden', !!user);
    $('nav-in').classList.toggle('hidden', !user);
    if (user) {
      const role = isAdmin() ? 'Admin' : isBuilder() ? 'Builder' : isPending() ? 'Pending' : 'Client';
      $('nav-name').textContent = (profile?.full_name || 'Account') + ' · ' + role;
      $('nav-name').title = user.email ? ('Signed in as: ' + user.email) : '';
      const btn = $('nav-main-btn');
      if (isAdmin()) {
        btn.textContent = 'Review builders';
        btn.dataset.action = 'admin';
      } else if (isBuilder()) {
        btn.textContent = 'Invited jobs';
        btn.dataset.action = 'invites';
        refreshInviteBadge();
      } else {
        btn.textContent = 'Post request';
        btn.dataset.action = 'post';
      }
    }
  }

  // ── MODALS ──
  function openPasswordResetModal() {
    hideMsg('reset-msg');
    if ($('reset-pass')) $('reset-pass').value = '';
    if ($('reset-pass2')) $('reset-pass2').value = '';
    const el = $('reset-modal');
    el?.classList.add('open');
    focusModal(el, '#reset-pass');
  }
  function closePasswordReset() {
    const el = $('reset-modal');
    el?.classList.remove('open');
    blurModal(el);
  }
  async function submitPasswordReset() {
    const p1 = ($('reset-pass')?.value || '');
    const p2 = ($('reset-pass2')?.value || '');
    if (p1.length < 6) {
      showMsg('reset-msg', 'Password must be at least 6 characters', false);
      return;
    }
    if (p1 !== p2) {
      showMsg('reset-msg', 'Passwords do not match', false);
      return;
    }
    const btn = $('reset-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; }
    try {
      const { error } = await needDb().auth.updateUser({ password: p1 });
      if (error) throw error;
      closePasswordReset();
      track('password_updated', {});
      toast('Password updated — you are signed in', true);
      routeAfterLogin();
    } catch (e) {
      showMsg('reset-msg', userFacingErr(e.message), false);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Update password'; }
    }
  }

  function consumeViewDeepLink() {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const rid = params.get('rid');
    if (rid) {
      ensureDashOpen();
      go('chat', rid);
      return;
    }
    const status = params.get('status');
    const allowedStatus = new Set(['open', 'awaiting_payment', 'funded', 'delivered', 'completed', 'disputed']);
    if (status && allowedStatus.has(status)) {
      window.__orvoAllReqsStatus = status;
    }
    let v = params.get('view');
    if (!v && status && allowedStatus.has(status) && isAdmin()) v = 'all-requests';
    if (!v) return;
    const allowed = new Set([
      'requests', 'jobs', 'invites', 'quotes', 'messages', 'apply', 'status',
      'profile', 'admin', 'all-requests', 'disputes', 'notifications',
    ]);
    if (!allowed.has(v)) return;
    if ((v === 'all-requests' || v === 'admin' || v === 'disputes') && !isAdmin()) return;
    if ((v === 'jobs' || v === 'invites' || v === 'quotes') && !(isBuilder() || isAdmin())) return;
    ensureDashOpen();
    go(v);
  }

  function syncDashUrl() {
    try {
      const u = new URL(window.location.href);
      const dashOpen = $('dashboard')?.classList.contains('open');
      if (!dashOpen) {
        u.searchParams.delete('view');
        u.searchParams.delete('rid');
        u.searchParams.delete('status');
      } else if (view === 'chat' && chatRequestId) {
        u.searchParams.set('rid', chatRequestId);
        u.searchParams.delete('view');
        u.searchParams.delete('status');
      } else if (view) {
        u.searchParams.set('view', view);
        u.searchParams.delete('rid');
        if (view === 'all-requests' && window.__orvoAllReqsStatus) {
          u.searchParams.set('status', window.__orvoAllReqsStatus);
        } else {
          u.searchParams.delete('status');
        }
      }
      const q = u.searchParams.toString();
      const next = u.pathname + (q ? '?' + q : '') + u.hash;
      const cur = window.location.pathname + window.location.search + window.location.hash;
      if (next !== cur) window.history.replaceState({}, '', next);
    } catch { /* ignore */ }
  }

  function wireNavScroll() {
    const nav = document.querySelector('nav');
    if (!nav) return;
    const onScroll = () => {
      nav.classList.toggle('scrolled', window.scrollY > 28);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function wireOfflineBanner() {
    const el = $('offline-banner');
    if (!el) return;
    const sync = () => {
      const backOnline = el.classList.contains('show') && navigator.onLine;
      el.classList.toggle('show', !navigator.onLine);
      if (navigator.onLine) {
        track('online', {});
        if (backOnline) {
          toast('Back online — refreshing ORVO', true);
          refreshActiveDashView({ reason: 'online' });
        }
      } else track('offline', {});
    };
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    sync();
  }

  function refreshActiveDashView({ reason } = {}) {
    if (!$('dashboard')?.classList.contains('open') || !user) return;
    refreshNotifBadge();
    if (view === 'chat' && chatRequestId) {
      if (reason === 'visibility') renderMsgs();
      else loadChat();
      return;
    }
    if (view === 'notifications') return loadNotifications();
    if (view === 'messages') return loadThreads();
    if (view === 'requests') return loadRequests();
    if (view === 'jobs') return loadJobs();
    if (view === 'invites') return loadInvites();
    if (view === 'quotes') return loadQuotes();
    if (view === 'status') return loadStatus();
    if (view === 'apply') return loadApply();
    if (view === 'profile') return loadProfileView();
    if (view === 'admin') return loadAdmin();
    if (view === 'all-requests') return loadAllRequests();
    if (view === 'disputes') return loadDisputes();
  }

  function wireVisibilityRefresh() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || !user) return;
      refreshActiveDashView({ reason: 'visibility' });
    });
  }
  function openAuth(tab) {
    hideMsg('login-msg'); hideMsg('signup-msg');
    const el = $('auth-modal');
    el.classList.add('open');
    setAuthTab(tab || 'login');
    const sub = $('auth-sub');
    if (sub) {
      sub.textContent = pendingClientPost
        ? 'Sign in or create an account to post your agent brief.'
        : 'Sign in or create your account';
    }
    focusModal(el, tab === 'signup' ? '#signup-name' : '#login-email');
  }
  function closeAuth() {
    const el = $('auth-modal');
    el.classList.remove('open');
    blurModal(el);
  }
  function setAuthTab(t) {
    const login = t === 'login';
    $('tab-login').classList.toggle('active', login);
    $('tab-signup').classList.toggle('active', !login);
    $('panel-login').classList.toggle('hidden', !login);
    $('panel-signup').classList.toggle('hidden', login);
  }
  function wireFieldCounter(inputId, metaId, max, opts) {
    const input = $(inputId);
    const meta = $(metaId);
    if (!input || !meta) return;
    const min = opts?.min || 0;
    const sync = () => {
      const n = (input.value || '').length;
      if (min > 0 && n < min) {
        meta.textContent = n + ' / ' + max + ' (need ' + (min - n) + ' more)';
        meta.classList.add('warn');
      } else {
        meta.textContent = n + ' / ' + max + (min > 0 ? ' ✓' : '');
        meta.classList.toggle('warn', n > max * 0.9);
      }
    };
    input.addEventListener('input', sync);
    sync();
  }

  function openPost() {
    if (!user) { openAuth('login'); showMsg('login-msg', 'Sign in first', false); return; }
    hideMsg('post-msg');
    wireFieldCounter('post-desc', 'post-count', 4000);
    wireFieldCounter('post-title', 'post-title-count', 80);
    track('post_modal_open', {});
    const el = $('post-modal');
    el.classList.add('open');
    focusModal(el, '#post-title');
  }
  function closePost() {
    const el = $('post-modal');
    el.classList.remove('open');
    blurModal(el);
  }
  function openQuoteModal(reqId) {
    quoteRequestId = reqId;
    hideMsg('quote-msg');
    $('quote-price').value = '';
    if ($('quote-eta')) $('quote-eta').value = '';
    $('quote-text').value = '';
    wireFieldCounter('quote-text', 'quote-count', 2000);
    const el = $('quote-modal');
    el.classList.add('open');
    focusModal(el, '#quote-price');
  }
  function closeQuote() {
    const el = $('quote-modal');
    el.classList.remove('open');
    quoteRequestId = null;
    blurModal(el);
  }

  function openPaySheet({ qid, rid, amountCents, fee, builderNet, builderName, etaDays, requestTitle }) {
    pendingPay = { qid, rid, amountCents, fee, builderNet };
    const sheet = $('pay-sheet');
    sheet.classList.remove('done');
    $('pay-title').textContent = 'Accept & pay';
    $('pay-sub').textContent = requestTitle
      ? `“${requestTitle.slice(0, 72)}${requestTitle.length > 72 ? '…' : ''}”`
      : 'Review the quote before locking in this builder';
    const bl = $('pay-builder-line');
    if (bl) {
      const bits = [];
      if (builderName) bits.push('Builder: ' + builderName);
      if (etaDays) bits.push('ETA ' + etaDays + ' days');
      bl.textContent = bits.join(' · ');
      bl.style.display = bits.length ? '' : 'none';
    }
    $('pay-amount').textContent = money(amountCents);
    const pct = FEE();
    if (pct > 0) {
      $('pay-fee-label').textContent = `ORVO fee (${pct}%)`;
      $('pay-fee').textContent = money(fee);
    } else {
      $('pay-fee-label').textContent = 'ORVO fee (founding)';
      $('pay-fee').textContent = '0%';
    }
    $('pay-builder-net').textContent = money(builderNet);
    if ($('pay-total')) $('pay-total').textContent = money(amountCents);
    const checkoutLive = !!window.ORVO_CHECKOUT_LIVE;
    if (checkoutLive) {
      $('pay-note').innerHTML =
        'You will continue to Stripe Checkout. Funds are <strong>held by ORVO</strong> until you approve delivery — not paid out immediately.';
      $('pay-confirm-btn').textContent = 'Continue to Stripe Checkout';
    } else {
      $('pay-note').innerHTML =
        'Accepting locks this builder as <strong>awaiting payment</strong> (not funded). ' +
        'ORVO will try Stripe Checkout automatically if configured — otherwise the job stays awaiting payment.';
      $('pay-confirm-btn').textContent = 'Accept quote — try checkout';
    }
    const msg = $('pay-msg');
    msg.className = 'msg hidden';
    msg.textContent = '';
    $('pay-confirm-btn').disabled = false;
    $('pay-cancel-btn').textContent = 'Cancel';
    const payEl = $('pay-modal');
    payEl.classList.add('open');
    focusModal(payEl, '#pay-confirm-btn');
  }

  function closePay() {
    const payEl = $('pay-modal');
    payEl.classList.remove('open');
    pendingPay = null;
    awaitingPayContext = null;
    const sheet = $('pay-sheet');
    if (sheet) sheet.classList.remove('done');
    $('pay-resume-btn')?.classList.add('hidden');
    blurModal(payEl);
  }

  function showPayAwaitingState(opts) {
    const extraNote = typeof opts === 'string' ? opts : opts?.extraNote;
    const rid = typeof opts === 'object' ? opts?.rid : null;
    const qid = typeof opts === 'object' ? opts?.qid : null;
    const checkoutOpen = typeof opts === 'object' ? !!opts?.checkoutOpen : false;
    awaitingPayContext = rid && qid ? { rid, qid, checkoutOpen } : null;

    const checkoutLive = !!window.ORVO_CHECKOUT_LIVE;
    const sheet = $('pay-sheet');
    sheet.classList.add('done');
    $('pay-title').textContent = 'Awaiting payment';
    $('pay-sub').textContent = checkoutOpen
      ? 'Checkout started — finish payment to hold funds'
      : (checkoutLive ? 'Complete checkout to hold funds' : 'Builder locked — awaiting payment');
    if (checkoutLive) {
      $('pay-note').innerHTML = checkoutOpen
        ? 'You started Stripe Checkout. Complete payment to hold funds until delivery — not funded until the webhook confirms.'
        : 'Continue to Stripe Checkout. Funds are <strong>held by ORVO</strong> until you approve delivery.';
    } else {
      $('pay-note').innerHTML =
        'Quote accepted. Status is <strong>awaiting payment</strong>, not funded. ' +
        'ORVO will try Checkout if configured — otherwise the job stays awaiting payment (not funded).';
    }
    showMsg('pay-msg', extraNote || (checkoutLive ? 'Complete checkout to hold funds' : 'No card charged yet — awaiting payment'), true);
    $('pay-cancel-btn').textContent = 'Close';
    const resumeBtn = $('pay-resume-btn');
    if (resumeBtn) {
      if (awaitingPayContext) {
        resumeBtn.classList.remove('hidden');
        resumeBtn.textContent = checkoutOpen
          ? (checkoutLive ? 'Continue to Stripe Checkout' : 'Resume checkout')
          : (checkoutLive ? 'Pay with Stripe Checkout' : 'Try checkout again');
        setTimeout(() => resumeBtn.focus(), 40);
      } else {
        resumeBtn.classList.add('hidden');
      }
    }
  }

  async function resumeCheckoutFromSheet() {
    const ctx = awaitingPayContext;
    if (!ctx?.rid || !ctx?.qid) return;
    const btn = $('pay-resume-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Starting…'; }
    const checkout = await tryCreateCheckoutSession({ requestId: ctx.rid, quoteId: ctx.qid });
    if (checkout.ok && checkout.url) {
      window.location.href = checkout.url;
      return;
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = ctx.checkoutOpen ? 'Resume checkout' : 'Try checkout again';
    }
    toast(checkoutUnavailableMessage(checkout), false);
  }

  /** Call Edge Function; 501/not_configured → caller shows awaiting state. */
  async function tryCreateCheckoutSession({ requestId, quoteId }) {
    const base = window.SUPABASE_URL;
    if (!base || !db) return { ok: false, reason: 'not_configured' };
    try {
      const { data: { session } } = await needDb().auth.getSession();
      if (!session?.access_token) return { ok: false, reason: 'auth' };
      const res = await fetch(`${base}/functions/v1/create-checkout-session`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: window.SUPABASE_ANON_KEY || '',
        },
        body: JSON.stringify({ request_id: requestId, quote_id: quoteId }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 501 || body.error === 'not_configured') {
        return { ok: false, reason: 'not_configured', message: body.message };
      }
      if (!res.ok || !body.url) {
        return {
          ok: false,
          reason: body.error || 'checkout_failed',
          message: edgeErrMessage(body, 'Checkout failed'),
        };
      }
      return { ok: true, url: body.url };
    } catch {
      return { ok: false, reason: 'network' };
    }
  }

  function maybeOpenClientPost() {
    if (!pendingClientPost) return;
    pendingClientPost = false;
    if (isAdmin() || isBuilder() || isPending()) return;
    setTimeout(() => openPost(), 150);
  }

  /** Signup only: honor intent. Login always uses role via openDash(). */
  function routeAfterSignup(intent) {
    if (intent !== 'client') pendingClientPost = false;
    openDash(intent === 'client' ? 'requests' : undefined);
    if (intent === 'builder' && !isBuilder() && !isPending()) go('apply');
    else if (intent === 'client') {
      go('requests');
      maybeOpenClientPost();
    }
    maybeRouteFounderToProfile();
  }

  /** Login / session restore: role home — never signup intent. */
  function routeAfterLogin() {
    const wantPost = pendingClientPost;
    postSignupIntent = 'client';
    openDash(wantPost && !isAdmin() && !isBuilder() && !isPending() ? 'requests' : homeViewForRole());
    if (wantPost) maybeOpenClientPost();
    maybeRouteFounderToProfile();
  }

  /** Send founder/admin to Profile while SQL, admin, Edge, or Checkout still pending. */
  async function maybeRouteFounderToProfile() {
    if (!user || (!isConfiguredFounder() && !isAdmin())) return;
    try {
      const [schema, edge] = await Promise.all([probeSchemaHealth(), probeEdgeHealth()]);
      const schemaOk = schema.length > 0 && schema.every((c) => c.ok);
      const edgeOk = edge.length > 0 && edge.every((c) => c.ok);
      if (!schemaOk || !isAdmin() || !edgeOk || !window.ORVO_CHECKOUT_LIVE) {
        ensureDashOpen();
        go('profile');
      }
    } catch {
      ensureDashOpen();
      go('profile');
    }
  }

  /** True if user owns the request, quoted it, is assigned, invited, or is admin. */
  async function canChatOnRequest(req) {
    if (!user || !req) return false;
    if (isAdmin()) return true;
    if (req.user_id === user.id) return true;
    if (req.assigned_builder_id === user.id) return true;
    const { data: q } = await needDb().from('quotes')
      .select('id').eq('request_id', req.id).eq('builder_id', user.id).limit(1).maybeSingle();
    const { data: inv } = await needDb().from('request_invites')
      .select('id').eq('request_id', req.id).eq('builder_id', user.id).limit(1).maybeSingle();
    if (window.ORVO_CHAT?.canOpenChat) {
      return window.ORVO_CHAT.canOpenChat(req, {
        myId: user.id,
        isAdmin: isAdmin(),
        hasQuoted: !!q,
        hasInvite: !!inv,
      }).ok;
    }
    return !!(q || inv);
  }

  // ── AUTH ACTIONS ──
  async function doSignup() {
    const btn = $('signup-btn');
    btn.disabled = true;
    btn.textContent = 'Creating...';
    try {
      const email = $('signup-email').value.trim();
      const pass = $('signup-pass').value;
      const name = $('signup-name').value.trim();
      if (!email || pass.length < 6) throw new Error('Email + password (6+ chars) required');
      const { data, error } = await needDb().auth.signUp({
        email, password: pass,
        options: { data: { full_name: name } },
      });
      if (error) throw error;
      if (data.session) {
        const intent = $('signup-intent')?.value || 'client';
        postSignupIntent = 'client';
        await refreshUser();
        closeAuth();
        routeAfterSignup(intent);
        toast('Welcome!', true);
        return;
      }
      setAuthTab('login');
      postSignupIntent = 'client';
      showMsg('login-msg', 'Account created! Sign in to continue.', true);
    } catch (e) {
      showMsg('signup-msg', userFacingErr(e?.message || String(e)), false);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create account';
    }
  }

  async function doForgotPassword() {
    const email = ($('login-email').value || '').trim();
    if (!email) {
      showMsg('login-msg', 'Enter your email above, then click Forgot password', false);
      return;
    }
    try {
      const redirectTo = window.location.origin + window.location.pathname;
      const { error } = await needDb().auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      showMsg('login-msg', 'Password reset email sent — check your inbox', true);
    } catch (e) {
      showMsg('login-msg', userFacingErr(e?.message || String(e)), false);
    }
  }

  async function doLogin() {
    const btn = $('login-btn');
    btn.disabled = true;
    btn.textContent = 'Signing in...';
    try {
      const email = $('login-email').value.trim();
      const pass = $('login-pass').value;
      if (!email || !pass) throw new Error('Enter email and password');
      const { data, error } = await needDb().auth.signInWithPassword({ email, password: pass });
      if (error) {
        if (/email not confirmed/i.test(error.message)) {
          const cfg = cfgAdminEmail();
          const isFounderEmail = !!(cfg && email.toLowerCase() === cfg);
          throw new Error(isFounderEmail
            ? 'Email not confirmed — Supabase Auth → turn OFF Confirm email for MVP, or confirm via inbox'
            : 'Confirm your email from the message we sent, then sign in again.');
        }
        throw error;
      }
      if (!data.session) throw new Error('No session');
      await refreshUser();
      closeAuth();
      routeAfterLogin();
      toast('Signed in!', true);
    } catch (e) {
      showMsg('login-msg', userFacingErr(e.message), false);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  }

  async function doLogout() {
    const ans = await askConfirm({
      title: 'Sign out?',
      sub: 'You can sign back in anytime with the same email.',
      okLabel: 'Sign out',
    });
    if (!ans.ok) return;
    await needDb().auth.signOut();
    user = null; profile = null;
    closeDash();
    updateNav();
    toast('Signed out', true);
  }

  // ── DASHBOARD ──
  function homeViewForRole() {
    if (isAdmin()) return 'admin';
    if (isBuilder()) return 'invites'; // concierge-first: invited before browse
    if (isPending()) return 'status';
    return 'requests';
  }

  function openDash(preferredView) {
    if (!user) { openAuth('login'); return; }
    const dash = $('dashboard');
    dash.classList.add('open');
    dash.setAttribute('role', 'dialog');
    dash.setAttribute('aria-modal', 'true');
    document.body.style.overflow = 'hidden';
    renderSidebar();
    refreshFounderSetupBanner();
    refreshBuilderPayoutBanner();
    focusDashOpen();
    go(preferredView || homeViewForRole());
  }

  function closeDash() {
    const dash = $('dashboard');
    dash.classList.remove('open');
    dash.removeAttribute('role');
    dash.removeAttribute('aria-modal');
    document.body.style.overflow = '';
    stopChat();
    stopCheckoutPoll();
    syncDashUrl();
    syncDocTitle(null);
    blurDashClose();
  }

  function closeDashFromButton() {
    if (window.history.state?.orvoView && window.history.length > 1) {
      __orvoPushNav = false;
      window.history.back();
      return;
    }
    closeDash();
  }

  function renderSidebar() {
    let h = '';
    if (isAdmin()) {
      h += `<div class="side-label">Admin</div>
        <button class="side-item" data-view="admin">Review builders</button>
        <button class="side-item" data-view="all-requests">All requests</button>
        <button class="side-item" data-view="disputes">Disputes</button>
        <a class="side-item" href="founder-checklist.html" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">Founder setup ↗</a>`;
    }
    if (isBuilder()) {
      h += `<div class="side-label">Builder</div>
        <button class="side-item" data-view="invites">Invited jobs</button>
        <button class="side-item" data-view="jobs">Browse jobs</button>
        <button class="side-item" data-view="quotes">My quotes</button>
        <button class="side-item" data-view="messages">Messages</button>`;
    } else if (isPending()) {
      h += `<button class="side-item" data-view="status">Application status</button>`;
    } else {
      h += `<div class="side-label">Client</div>
        <button class="side-item" data-view="requests">My requests</button>
        <button class="side-item" data-view="messages">Messages</button>
        <button class="side-item" data-view="apply">Become a builder</button>`;
    }
    h += `<div class="side-label">Account</div>
      <button class="side-item" data-view="notifications">Notifications</button>
      <button class="side-item" data-view="profile">Profile</button>`;
    $('sidebar').innerHTML = h;
    $('sidebar').querySelectorAll('[data-view]').forEach(el => {
      el.addEventListener('click', () => go(el.dataset.view));
    });
    if (isBuilder()) refreshInviteBadge();
    if (isAdmin()) {
      refreshDisputesBadge();
    }
    refreshNotifBadge();
  }

  function bindKpiCards() {
    $('view-body')?.querySelectorAll('.kpi-card[data-goto]').forEach((el) => {
      wireActivate(el, () => {
        if (el.dataset.status !== undefined) {
          window.__orvoAllReqsStatus = el.dataset.status || '';
        }
        go(el.dataset.goto);
      });
    });
  }

  let __orvoLastNav = { v: null, rid: null };
  let __orvoPushNav = true;

  function go(v, id) {
    if (v !== 'chat') {
      if (chatSub && db) db.removeChannel(chatSub);
      chatSub = null;
      stopPayWatch();
      if (chatPoll) clearInterval(chatPoll);
      chatPoll = null;
    }
    view = v;
    chatRequestId = v === 'chat' ? id : null;
    $('sidebar').querySelectorAll('.side-item[data-view]').forEach(el => {
      const on = el.dataset.view === v;
      el.classList.toggle('active', on);
      if (on) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
    $('view-action').innerHTML = '';
    const titles = {
      requests: 'My requests', jobs: 'Browse jobs', quotes: 'My quotes',
      messages: 'Messages', chat: 'Chat', apply: 'Become a builder',
      status: 'Application status', profile: 'Profile',
      admin: 'Review builders', 'all-requests': 'All requests',
      invites: 'Invited jobs', disputes: 'Disputes',
      notifications: 'Notifications',
    };
    $('view-title').textContent = titles[v] || 'Dashboard';
    syncDocTitle(titles[v] || null);
    syncDashUrl();

    if (v === 'requests') {
      $('view-action').innerHTML = `<button class="btn btn-primary" data-action="post">+ Post request</button>${refreshViewBtnHtml()}${copyViewBtnHtml()}`;
      wireRefreshView();
      loadRequests();
    }
    else if (v === 'jobs') { $('view-action').innerHTML = `${refreshViewBtnHtml()}${copyViewBtnHtml()}`; wireRefreshView(); loadJobs(); }
    else if (v === 'invites') { $('view-action').innerHTML = `${refreshViewBtnHtml()}${copyViewBtnHtml()}`; wireRefreshView(); loadInvites(); }
    else if (v === 'quotes') { $('view-action').innerHTML = `${refreshViewBtnHtml()}${copyViewBtnHtml()}`; wireRefreshView(); loadQuotes(); }
    else if (v === 'messages') { $('view-action').innerHTML = `${refreshViewBtnHtml()}${copyViewBtnHtml()}`; wireRefreshView(); loadThreads(); }
    else if (v === 'chat') {
      $('view-action').innerHTML = `<button type="button" class="btn btn-ghost" id="btn-chat-back" style="padding:8px 12px;font-size:12px">← Messages</button>${refreshViewBtnHtml()}${copyViewBtnHtml()}`;
      wireCopyViewLink();
      wireRefreshView();
      $('btn-chat-back')?.addEventListener('click', () => go('messages'));
      loadChat();
    }
    else if (v === 'apply') { $('view-action').innerHTML = copyViewBtnHtml(); loadApply(); }
    else if (v === 'status') { $('view-action').innerHTML = `${refreshViewBtnHtml()}${copyViewBtnHtml()}`; wireRefreshView(); loadStatus(); }
    else if (v === 'profile') { $('view-action').innerHTML = `${refreshViewBtnHtml()}${copyViewBtnHtml()}`; wireRefreshView(); loadProfileView(); }
    else if (v === 'admin') {
      // loadAdmin sets its own view-action (events + refresh)
      loadAdmin();
    }
    else if (v === 'all-requests') { $('view-action').innerHTML = `${refreshViewBtnHtml()}${copyViewBtnHtml()}`; wireRefreshView(); loadAllRequests(); }
    else if (v === 'disputes') { $('view-action').innerHTML = `${refreshViewBtnHtml()}${copyViewBtnHtml()}`; wireRefreshView(); loadDisputes(); }
    else if (v === 'notifications') {
      $('view-action').innerHTML = `<button class="btn btn-ghost" id="btn-mark-all-read" style="padding:8px 12px;font-size:12px">Mark all read</button>${refreshViewBtnHtml()}${copyViewBtnHtml()}`;
      wireRefreshView();
      $('btn-mark-all-read')?.addEventListener('click', async () => {
        try {
          await needDb().from('notifications').update({ read_at: new Date().toISOString() })
            .eq('user_id', user.id).is('read_at', null);
          toast('All caught up', true);
          refreshNotifBadge();
          loadNotifications();
        } catch (e) {
          toast(userFacingErr(e.message), false);
        }
      });
      loadNotifications();
    }
    if (v !== 'chat') wireCopyViewLink();
    if ($('dashboard')?.classList.contains('open') && __orvoPushNav) {
      syncDashUrl();
      const navRid = v === 'chat' ? id : null;
      if (__orvoLastNav.v !== v || __orvoLastNav.rid !== navRid) {
        __orvoLastNav = { v, rid: navRid };
        try {
          window.history.pushState({ orvoView: v, orvoRid: navRid }, '', window.location.href);
        } catch { /* ignore */ }
      }
    }
  }

  // ── CLIENT ──
  async function doPost() {
    const btn = $('post-btn');
    btn.disabled = true;
    try {
      const title = ($('post-title')?.value || '').trim();
      const desc = $('post-desc').value.trim();
      const country = ($('post-country')?.value || '').trim().slice(0, 80);
      if (!title) throw new Error('Add a short title');
      if (!desc) throw new Error('Describe your project');
      const row = {
        user_id: user.id,
        title: title.slice(0, 80),
        description: desc,
        category: $('post-cat').value,
        budget: $('post-budget').value.trim() || null,
        status: 'open',
      };
      if (country) row.location = country;
      let { error } = await needDb().from('requests').insert(row);
      // If location column missing (004 not applied), fall back to description prefix
      if (error && country && /location|column|schema/i.test(error.message || '')) {
        delete row.location;
        row.description = 'Country: ' + country + '\n\n' + desc;
        ({ error } = await needDb().from('requests').insert(row));
      }
      if (error) throw error;
      if ($('post-country')) $('post-country').value = '';
      closePost();
      track('post_success', { category: row.category });
      openDash();
      go('requests');
      toast('Request posted!', true);
    } catch (e) {
      showSchemaMsg('post-msg', e?.message || String(e), 'Requests need APPLY-ALL SQL (001–020).');
    } finally { btn.disabled = false; }
  }

  async function loadNotifications() {
    const body = $('view-body');
    body.innerHTML = loadingSkeleton(4);
    try {
      const { data, error } = await needDb().from('notifications')
        .select('*').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(40);
      if (error) throw error;
      if (!(data || []).length) {
        const founderFix = founderSchemaFixHtml('Inbox needs APPLY-ALL SQL (notifications 012–019).');
        body.innerHTML = `<p class="empty">No notifications yet.</p>${
          founderFix || '<p class="empty" style="padding-top:8px;font-size:13px">You’ll see quote and message alerts here once the marketplace inbox is live.</p>'
        }`;
        wireFounderSchemaFix(body);
        return;
      }
      const qText = (window.__orvoNotifQuery || '').trim().toLowerCase();
      const rows = qText
        ? data.filter((n) => ((n.title || '') + ' ' + (n.body || '')).toLowerCase().includes(qText))
        : data;
      const searchBar = `<input class="admin-search" id="notif-search" type="search" placeholder="Search notifications…" value="${esc(window.__orvoNotifQuery || '')}" autocomplete="off"/>`;
      const emptyMatch = `<p class="empty">No notifications match that search.</p>
        <button type="button" class="btn btn-ghost" id="btn-clear-notif-search" style="margin-top:12px;padding:8px 12px;font-size:12px">Clear search</button>`;
      body.innerHTML = searchBar + (rows.length ? rows.map((n) => {
        const unread = !n.read_at;
        return `<div class="card ${unread ? 'notif-unread' : ''}" data-nid="${n.id}" data-link="${esc(n.link_path || '')}" tabindex="0" role="button" aria-label="${esc(n.title)}" style="cursor:pointer">
          <h3>${esc(n.title)}</h3>
          ${n.body ? `<p>${esc(n.body)}</p>` : ''}
          <span class="badge">${unread ? 'New · ' : ''}${timeAgoHtml(n.created_at)}</span>
        </div>`;
      }).join('') : emptyMatch);
      $('notif-search')?.addEventListener('input', (e) => {
        window.__orvoNotifQuery = e.target.value || '';
        clearTimeout(window.__orvoNotifSearchT);
        window.__orvoNotifSearchT = setTimeout(loadNotifications, 280);
      });
      $('btn-clear-notif-search')?.addEventListener('click', () => {
        window.__orvoNotifQuery = '';
        loadNotifications();
      });
      body.querySelectorAll('[data-nid]').forEach((el) => {
        const open = async () => {
          const id = el.dataset.nid;
          const link = el.dataset.link || '';
          try {
            await needDb().from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id);
          } catch (_) { /* ignore */ }
          refreshNotifBadge();
          if (followNotificationLink(link)) return;
          loadNotifications();
        };
        wireActivate(el, open);
      });
      refreshNotifBadge();
    } catch (e) {
      const founderFix = founderSchemaFixHtml('Missing notifications tables?');
      body.innerHTML = `<p class="empty err">${esc(userFacingErr(e.message))}</p>${
        founderFix || '<p class="empty" style="font-size:12px;padding-top:8px">Notifications are not available yet.</p>'
      }`;
      wireFounderSchemaFix(body);
    }
  }

  async function loadRequests() {
    const body = $('view-body');
    body.innerHTML = loadingSkeleton(3);
    const showAll = !!window.__orvoShowAllRequests;
    const qText = (window.__orvoRequestsQuery || '').trim().toLowerCase();
    let q = needDb().from('requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (!showAll) q = q.neq('status', 'cancelled');
    const { data, error } = await q;
    if (error) {
      body.innerHTML = `<p class="empty err">${esc(userFacingErr(error.message))}</p>${founderSchemaFixHtml('Schema missing?')}`;
      wireFounderSchemaFix(body);
      return;
    }
    let rows = data || [];
    if (qText) {
      rows = rows.filter((r) => {
        const hay = ((r.title || '') + ' ' + (r.description || '') + ' ' + (r.category || '') + ' ' + (r.status || '')).toLowerCase();
        return hay.includes(qText);
      });
    }
    const openIds = rows.filter((r) => r.status === 'open').map((r) => r.id);
    const quoteCounts = {};
    if (openIds.length) {
      const { data: qrows } = await needDb().from('quotes')
        .select('request_id').in('request_id', openIds).eq('status', 'pending');
      (qrows || []).forEach((q) => {
        quoteCounts[q.request_id] = (quoteCounts[q.request_id] || 0) + 1;
      });
    }
    const awaitingIds = rows.filter((r) => r.status === 'awaiting_payment').map((r) => r.id);
    const payByReq = {};
    if (awaitingIds.length) {
      try {
        const { data: pays } = await needDb().from('payments')
          .select('request_id,quote_id,status').in('request_id', awaitingIds);
        (pays || []).forEach((p) => { payByReq[p.request_id] = p; });
      } catch { /* payments optional */ }
    }
    if (!rows.length) {
      body.innerHTML = `<input class="admin-search" id="requests-search" type="search" placeholder="Search your requests…" value="${esc(qText)}" autocomplete="off"/>
        <p class="empty">${qText ? 'No requests match that search.' : 'No requests yet.'}</p>
        <p class="empty" style="padding-top:8px;font-size:13px">${qText ? 'Try another term or clear the search.' : 'Post your first agent brief — vetted builders worldwide reply with quotes in USD.'}</p>
        ${!qText ? '<button class="btn btn-primary" style="margin-top:16px;padding:12px 24px" data-action="post">+ Post request</button>' : '<button type="button" class="btn btn-ghost" id="btn-clear-req-search" style="margin-top:12px;padding:8px 12px;font-size:12px">Clear search</button>'}
        ${showAll || qText ? '' : '<p class="empty" style="padding-top:12px;font-size:12px"><button type="button" class="hero-secondary" id="btn-show-cancelled" style="color:var(--gray)">Show cancelled</button></p>'}`;
      $('requests-search')?.addEventListener('input', (e) => {
        window.__orvoRequestsQuery = e.target.value;
        clearTimeout(window.__orvoReqSearchT);
        window.__orvoReqSearchT = setTimeout(loadRequests, 280);
      });
      $('btn-clear-req-search')?.addEventListener('click', () => {
        window.__orvoRequestsQuery = '';
        loadRequests();
      });
      $('btn-show-cancelled')?.addEventListener('click', () => {
        window.__orvoShowAllRequests = true;
        loadRequests();
      });
      return;
    }
    const filterBar = `<input class="admin-search" id="requests-search" type="search" placeholder="Search your requests…" value="${esc(qText)}" autocomplete="off"/>
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
      <button type="button" class="btn btn-ghost" id="btn-toggle-cancelled" style="padding:8px 12px;font-size:12px">
        ${showAll ? 'Hide cancelled' : 'Show cancelled'}
      </button>
    </div>`;
    body.innerHTML = filterBar + rows.map(r => {
      const qc = quoteCounts[r.id] || 0;
      const quoteBadge = qc ? ` · ${qc} quote${qc > 1 ? 's' : ''}` : '';
      const payHint = r.status === 'awaiting_payment' && payByReq[r.id]
        ? ` · Pay: ${statusLabel(payByReq[r.id].status)}` : '';
      const reqLabel = esc(r.title || 'Request');
      return `
      <div class="card" data-click="${r.id}" tabindex="0" role="button" aria-label="Open request: ${reqLabel}">
        <span class="tag">${esc(r.category || 'Project')}</span>
        <h3>${reqLabel}</h3>
        <p>${esc(r.description.slice(0, 120))}</p>
        <span class="badge">${esc(statusLabel(r.status))}${quoteBadge}${payHint} · ${timeAgoHtml(r.created_at)}</span>
        <div class="row">
          <button class="btn btn-primary btn-open-req" data-rid="${r.id}">Open</button>
          ${r.status === 'awaiting_payment' ? `<button class="btn btn-primary btn-pay-req" data-rid="${r.id}" data-qid="${esc(payByReq[r.id]?.quote_id || '')}" data-checkout-open="${payByReq[r.id]?.status === 'checkout_open' ? '1' : ''}">${payByReq[r.id]?.status === 'checkout_open' ? 'Continue checkout' : 'Complete payment'}</button>` : ''}
          ${r.status === 'open' ? `<button class="btn btn-ghost btn-cancel-req" data-rid="${r.id}">Cancel</button>` : ''}
          <button class="btn btn-ghost btn-share-req" data-rid="${r.id}">Copy link</button>
        </div>
      </div>`;
    }).join('');
    $('btn-toggle-cancelled')?.addEventListener('click', () => {
      window.__orvoShowAllRequests = !window.__orvoShowAllRequests;
      loadRequests();
    });
    $('requests-search')?.addEventListener('input', (e) => {
      window.__orvoRequestsQuery = e.target.value;
      clearTimeout(window.__orvoReqSearchT);
      window.__orvoReqSearchT = setTimeout(loadRequests, 280);
    });
    body.querySelectorAll('[data-click]').forEach((el) => {
      wireActivate(el, (e) => {
        if (e?.target?.closest?.('button')) return;
        go('chat', el.dataset.click);
      });
    });
    body.querySelectorAll('.btn-open-req').forEach(el => {
      el.addEventListener('click', () => go('chat', el.dataset.rid));
    });
    body.querySelectorAll('.btn-cancel-req').forEach(el => {
      el.addEventListener('click', () => cancelRequest(el.dataset.rid));
    });
    body.querySelectorAll('.btn-share-req').forEach(el => {
      el.addEventListener('click', () => copyRequestLink(el.dataset.rid));
    });
    body.querySelectorAll('.btn-pay-req').forEach(el => {
      el.addEventListener('click', async () => {
        const rid = el.dataset.rid;
        const qid = el.dataset.qid;
        if (!qid) { go('chat', rid); return; }
        el.disabled = true;
        el.textContent = 'Starting…';
        const checkout = await tryCreateCheckoutSession({ requestId: rid, quoteId: qid });
        if (checkout.ok && checkout.url) {
          window.location.href = checkout.url;
          return;
        }
        el.disabled = false;
        el.textContent = el.dataset.checkoutOpen ? 'Continue checkout' : 'Complete payment';
        toast(checkoutUnavailableMessage(checkout, 'Checkout unavailable — open request for details'), false);
        go('chat', rid);
      });
    });
  }

  async function copyRequestLink(rid) {
    const url = `${window.location.origin}${window.location.pathname}?rid=${encodeURIComponent(rid)}`;
    try {
      await navigator.clipboard.writeText(url);
      track('request_link_copied', { request_id: rid });
      toast('Link copied — open it while signed in', true);
    } catch {
      toast(url, true);
    }
  }

  function copyViewBtnHtml() {
    return '<button type="button" class="btn btn-ghost" id="btn-copy-view-link" style="padding:8px 12px;font-size:12px" title="Copy link to this dashboard view">Copy link</button>';
  }

  async function copyDashViewLink() {
    syncDashUrl();
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      track('view_link_copied', { view: view || null });
      toast('View link copied — open while signed in', true);
    } catch {
      toast(url, true);
    }
  }

  function wireCopyViewLink() {
    $('btn-copy-view-link')?.addEventListener('click', () => copyDashViewLink());
  }

  async function cancelRequest(rid) {
    const ans = await askConfirm({
      title: 'Cancel this request?',
      sub: 'Only open requests with no accepted builder can be cancelled. Quotes will stay declined.',
      okLabel: 'Cancel request',
    });
    if (!ans.ok) return;
    try {
      const { data: req, error } = await needDb().from('requests').select('status,user_id').eq('id', rid).single();
      if (error) throw error;
      if (req.user_id !== user.id && !isAdmin()) throw new Error('Not your request');
      if (req.status !== 'open') throw new Error('Only open requests can be cancelled');
      const { error: e2 } = await needDb().from('requests').update({ status: 'cancelled' }).eq('id', rid);
      if (e2) throw e2;
      await needDb().from('quotes').update({ status: 'withdrawn' }).eq('request_id', rid).eq('status', 'pending');
      track('request_cancelled', { request_id: rid });
      toast('Request cancelled', true);
      loadRequests();
    } catch (e) { toastSchemaErr(e?.message || String(e)); }
  }

  // ── BUILDER ──
  async function loadJobs() {
    const body = $('view-body');
    if (!isBuilder()) {
      body.innerHTML = `<p class="empty">Builder access requires ORVO approval.</p>
        <button class="btn btn-primary" style="margin-top:16px;padding:12px 24px" data-goto="apply">Apply as a builder</button>
        <p class="empty" style="padding-top:12px;font-size:12px">Or wait for admin approval if you already applied.</p>`;
      return;
    }
    const qText = (window.__orvoJobsQuery || '').trim().replace(/[%_,]/g, ' ').slice(0, 80);
    body.innerHTML = loadingSkeleton(3);
    const { data: activeJobs } = await needDb().from('requests')
      .select('*')
      .eq('assigned_builder_id', user.id)
      .in('status', ['awaiting_payment', 'funded', 'delivered', 'in_progress', 'disputed'])
      .order('updated_at', { ascending: false });
    let query = needDb().from('requests').select('*').eq('status', 'open').order('created_at', { ascending: false });
    if (qText) {
      query = query.or(`title.ilike.%${qText}%,description.ilike.%${qText}%,category.ilike.%${qText}%`);
    }
    const { data, error } = await query;
    if (error) {
      body.innerHTML = `<p class="empty err">${esc(userFacingErr(error.message))}</p>${founderSchemaFixHtml('Jobs query failed — schema may be incomplete.')}`;
      wireFounderSchemaFix(body);
      return;
    }
    const searchBar = `<input class="admin-search" id="jobs-search" type="search" placeholder="Search jobs by title, category…" value="${esc(window.__orvoJobsQuery || '')}" autocomplete="off"/>`;
    const payoutNudge = !profile?.stripe_connect_account_id
      ? `<div class="card" style="border-color:var(--o);background:#FFF8F4;margin-bottom:16px;cursor:default">
        <b>Payout setup</b>
        <p style="font-size:13px;margin:8px 0 12px">Complete Stripe Connect before release transfers — ORVO needs a connected account on file.</p>
        <div class="row" style="gap:8px">
          <button type="button" class="btn btn-primary" id="btn-jobs-payout-connect" data-default-label="Set up payouts">Set up payouts</button>
          <button type="button" class="btn btn-ghost" data-goto="profile">Profile</button>
        </div>
      </div>` : '';
    const activeHtml = (activeJobs || []).length ? `
      <h3 style="font-size:15px;margin:0 0 12px">Your active jobs</h3>
      ${(activeJobs || []).map((r) => {
        const title = esc(r.title || 'Project');
        return `
      <div class="card" data-click="${r.id}" tabindex="0" role="button" aria-label="Open active job: ${title}" style="border-left:3px solid var(--o);margin-bottom:12px">
        <h3>${title}</h3>
        <p style="font-size:13px;color:var(--gray);margin:6px 0 10px">${esc((r.description || '').slice(0, 100))}${(r.description || '').length > 100 ? '…' : ''}</p>
        <div class="row">
          <span class="badge">${esc(statusLabel(r.status))} · ${timeAgoHtml(r.updated_at || r.created_at)}</span>
          <button class="btn btn-primary btn-open-active" data-rid="${r.id}">Open project</button>
        </div>
      </div>`;
      }).join('')}
      <hr style="border:none;border-top:1px solid var(--border);margin:20px 0 16px"/>
      <h3 style="font-size:15px;margin:0 0 12px">Browse open jobs</h3>` : '';
    const bindJobsSearch = () => {
      $('jobs-search')?.addEventListener('input', (e) => {
        window.__orvoJobsQuery = e.target.value || '';
        clearTimeout(window.__orvoJobsSearchT);
        window.__orvoJobsSearchT = setTimeout(loadJobs, 280);
      });
    };
    const bindActiveBtns = () => {
      body.querySelectorAll('[data-click]').forEach((el) => {
        wireActivate(el, (e) => {
          if (e?.target?.closest?.('button')) return;
          go('chat', el.dataset.click);
        });
      });
      body.querySelectorAll('.btn-open-active').forEach((b) => {
        b.addEventListener('click', () => go('chat', b.dataset.rid));
      });
    };
    const bindJobsPayoutNudge = () => {
      $('btn-jobs-payout-connect')?.addEventListener('click', (e) => startConnectOnboarding(e.currentTarget));
    };
    if (!data?.length) {
      body.innerHTML = searchBar + payoutNudge + activeHtml + `<p class="empty">No open jobs${qText ? ' matching that search' : ' right now'}.</p>
        <p class="empty" style="padding-top:8px;font-size:13px">Check back soon — new client briefs from anywhere appear here. Quotes are in USD.</p>
        ${qText ? '<button type="button" class="btn btn-ghost" id="btn-clear-jobs-search" style="margin-top:12px;padding:8px 12px;font-size:12px">Clear search</button>' : ''}`;
      bindJobsSearch();
      bindActiveBtns();
      bindJobsPayoutNudge();
      $('btn-clear-jobs-search')?.addEventListener('click', () => {
        window.__orvoJobsQuery = '';
        loadJobs();
      });
      return;
    }
    const { data: myQuotes } = await needDb().from('quotes').select('request_id,status').eq('builder_id', user.id);
    const quotedIds = new Set((myQuotes || []).map(q => q.request_id));
    const pendingIds = new Set((myQuotes || []).filter(q => q.status === 'pending').map(q => q.request_id));
    body.innerHTML = searchBar + payoutNudge + activeHtml + data.map(r => {
      const canMsg = isAdmin() || quotedIds.has(r.id) || r.assigned_builder_id === user.id;
      const already = pendingIds.has(r.id);
      const title = esc(r.title || 'Job');
      const action = canMsg || already ? 'chat' : 'quote';
      const aria = action === 'quote' ? `Send quote: ${title}` : `Open job: ${title}`;
      return `
      <div class="card" data-job-card="${r.id}" data-job-action="${action}" tabindex="0" role="button" aria-label="${aria}">
        <span class="tag">${esc(r.category || 'Project')}</span>
        <h3>${title}</h3>
        <p>${esc(r.description)}</p>
        <p>Budget: ${esc(r.budget || 'Not specified')}${r.location ? ' · ' + esc(r.location) : ''}</p>
        <div class="row">
          ${already
            ? `<span class="badge">Quote pending</span><button class="btn btn-ghost btn-chat" data-rid="${r.id}">Message</button>`
            : `<button class="btn btn-primary btn-quote" data-rid="${r.id}">Send quote</button>${canMsg ? `<button class="btn btn-ghost btn-chat" data-rid="${r.id}">Message</button>` : ''}`}
        </div>
      </div>`;
    }).join('');
    bindJobsSearch();
    bindActiveBtns();
    bindJobsPayoutNudge();
    body.querySelectorAll('[data-job-card]').forEach((el) => {
      wireActivate(el, (e) => {
        if (e?.target?.closest?.('button')) return;
        const rid = el.dataset.jobCard;
        if (el.dataset.jobAction === 'quote') openQuoteModal(rid);
        else go('chat', rid);
      });
    });
    body.querySelectorAll('.btn-quote').forEach(b => b.addEventListener('click', () => openQuoteModal(b.dataset.rid)));
    body.querySelectorAll('.btn-chat').forEach(b => b.addEventListener('click', () => go('chat', b.dataset.rid)));
  }

  async function doQuote() {
    if (!quoteRequestId) return;
    const btn = $('quote-btn');
    btn.disabled = true;
    try {
      const cents = parseMoney($('quote-price').value);
      const eta = parseInt(($('quote-eta')?.value || '').trim(), 10);
      let msg = $('quote-text').value.trim();
      if (cents < 5000) throw new Error('Minimum quote is $50 USD');
      if (!msg) throw new Error('Add a message');
      if (!eta || eta < 1) throw new Error('Add delivery estimate in days');
      const row = {
        request_id: quoteRequestId,
        builder_id: user.id,
        amount_cents: cents,
        message: msg,
        status: 'pending',
        delivery_days: eta,
      };
      let { error } = await needDb().from('quotes').insert(row);
      // If delivery_days column missing (008 not applied), prefix message
      if (error && /delivery_days|column|schema/i.test(error.message || '')) {
        delete row.delivery_days;
        row.message = `ETA: ${eta} day${eta === 1 ? '' : 's'}\n\n` + msg;
        ({ error } = await needDb().from('quotes').insert(row));
      }
      if (error) throw error;
      closeQuote();
      go('quotes');
      track('quote_sent', { request_id: quoteRequestId, amount_cents: cents, delivery_days: eta });
      toast('Quote sent!', true);
    } catch (e) {
      showSchemaMsg('quote-msg', e?.message || String(e), 'Quotes need APPLY-ALL SQL (001–020).');
    } finally { btn.disabled = false; }
  }

  async function loadQuotes() {
    const body = $('view-body');
    body.innerHTML = loadingSkeleton(3);
    const { data, error } = await needDb().from('quotes').select('*, requests(title)').eq('builder_id', user.id).order('created_at', { ascending: false });
    if (error) {
      body.innerHTML = `<p class="empty err">${esc(userFacingErr(error.message))}</p>${founderSchemaFixHtml('Schema missing?')}`;
      wireFounderSchemaFix(body);
      return;
    }
    if (!data?.length) {
      const payoutNudge = !profile?.stripe_connect_account_id
        ? `<div class="card" style="border-color:var(--o);background:#FFF8F4;margin-bottom:16px;cursor:default">
          <b>Payout setup</b>
          <p style="font-size:13px;margin:8px 0 12px">Set up Connect before funded jobs release — ORVO needs a connected account.</p>
          <button type="button" class="btn btn-primary" id="btn-quotes-payout-connect" data-default-label="Set up payouts">Set up payouts</button>
        </div>` : '';
      body.innerHTML = `${payoutNudge}<p class="empty">No quotes yet.</p>
        <p class="empty" style="padding-top:8px;font-size:13px">Browse open jobs and send your first quote in USD.</p>
        <button class="btn btn-primary" style="margin-top:16px;padding:12px 24px" data-goto="jobs">Browse jobs</button>`;
      $('btn-quotes-payout-connect')?.addEventListener('click', (e) => startConnectOnboarding(e.currentTarget));
      return;
    }
    const payoutNudge = !profile?.stripe_connect_account_id
      ? `<div class="card" style="border-color:var(--o);background:#FFF8F4;margin-bottom:16px;cursor:default">
        <b>Payout setup</b>
        <p style="font-size:13px;margin:8px 0 12px">Complete Connect so releases can transfer when clients pay.</p>
        <button type="button" class="btn btn-primary" id="btn-quotes-payout-connect" data-default-label="Set up payouts">Set up payouts</button>
      </div>` : '';
    const qText = (window.__orvoQuotesQuery || '').trim().toLowerCase();
    const rows = qText
      ? data.filter((q) => ((q.requests?.title || '') + ' ' + (q.message || '') + ' ' + (q.status || '')).toLowerCase().includes(qText))
      : data;
    const searchBar = `<input class="admin-search" id="quotes-search" type="search" placeholder="Search your quotes…" value="${esc(window.__orvoQuotesQuery || '')}" autocomplete="off"/>`;
    const emptyMatch = `<p class="empty">No quotes match that search.</p>
      <button type="button" class="btn btn-ghost" id="btn-clear-quotes-search" style="margin-top:12px;padding:8px 12px;font-size:12px">Clear search</button>`;
    body.innerHTML = searchBar + payoutNudge + (rows.length ? rows.map(q => {
      const title = esc(q.requests?.title || 'Project');
      return `
      <div class="card" data-click="${q.request_id}" tabindex="0" role="button" aria-label="Open quote: ${title}">
        <h3>${title}</h3>
        <p>${esc(q.message)}</p>
        <span class="badge">${money(q.amount_cents)} · ${esc(statusLabel(q.status))}${q.delivery_days ? ' · ' + q.delivery_days + 'd' : ''} · ${timeAgoHtml(q.created_at)}</span>
        <div class="row">
          <button class="btn btn-primary btn-open-quote" data-rid="${q.request_id}">Open</button>
          ${q.status === 'pending' ? `<button class="btn btn-ghost btn-withdraw-quote" data-qid="${q.id}">Withdraw</button>` : ''}
        </div>
      </div>`;
    }).join('') : emptyMatch);
    $('quotes-search')?.addEventListener('input', (e) => {
      window.__orvoQuotesQuery = e.target.value || '';
      clearTimeout(window.__orvoQuotesSearchT);
      window.__orvoQuotesSearchT = setTimeout(loadQuotes, 280);
    });
    $('btn-clear-quotes-search')?.addEventListener('click', () => {
      window.__orvoQuotesQuery = '';
      loadQuotes();
    });
    $('btn-quotes-payout-connect')?.addEventListener('click', (e) => startConnectOnboarding(e.currentTarget));
    body.querySelectorAll('[data-click]').forEach((el) => {
      wireActivate(el, (e) => {
        if (e?.target?.closest?.('button')) return;
        go('chat', el.dataset.click);
      });
    });
    body.querySelectorAll('.btn-open-quote').forEach(el => {
      el.addEventListener('click', () => go('chat', el.dataset.rid));
    });
    body.querySelectorAll('.btn-withdraw-quote').forEach(el => {
      el.addEventListener('click', () => withdrawQuote(el.dataset.qid));
    });
  }

  async function withdrawQuote(qid) {
    const ans = await askConfirm({
      title: 'Withdraw this quote?',
      sub: 'The client will no longer see it as pending. You can quote again later if the job is still open.',
      okLabel: 'Withdraw quote',
    });
    if (!ans.ok) return;
    try {
      const { data: q, error } = await needDb().from('quotes').select('id,builder_id,status').eq('id', qid).single();
      if (error) throw error;
      if (q.builder_id !== user.id) throw new Error('Not your quote');
      if (q.status !== 'pending') throw new Error('Only pending quotes can be withdrawn');
      const { error: e2 } = await needDb().from('quotes').update({ status: 'withdrawn' }).eq('id', qid);
      if (e2) throw e2;
      track('quote_withdrawn', { quote_id: qid });
      toast('Quote withdrawn', true);
      loadQuotes();
    } catch (e) { toastSchemaErr(e?.message || String(e)); }
  }

  async function loadApply() {
    // Approved builders belong on jobs — pending builders may edit a prefilled form (no bounce to status).
    if (isBuilder()) { go('jobs'); return; }
    const editing = isPending();
    let existing = null;
    const applySchemaErr = (err) => {
      setViewTitle(editing ? 'Edit application' : 'Become a builder');
      const body = $('view-body');
      body.innerHTML = `<p class="empty err">${esc(userFacingErr(err.message))}</p>${founderSchemaFixHtml('Builder applications need APPLY-ALL SQL (001–020).')}`;
      wireFounderSchemaFix(body);
    };
    if (editing) {
      const { data, error } = await needDb().from('builder_applications').select('*').eq('user_id', user.id).maybeSingle();
      if (error) { applySchemaErr(error); return; }
      existing = data;
    } else {
      const { error: probeErr } = await needDb().from('builder_applications').select('id', { count: 'exact', head: true });
      if (probeErr) { applySchemaErr(probeErr); return; }
    }
    setViewTitle(editing ? 'Edit application' : 'Become a builder');
    const btnLabel = editing ? 'Save changes' : 'Submit application';
    const skillsStr = Array.isArray(existing?.skills)
      ? existing.skills.join(', ')
      : (existing?.skills || '');
    $('view-body').innerHTML = `
      <p style="color:var(--gray);font-size:14px;margin-bottom:20px">${editing
        ? 'Update your application below. Status stays pending until ORVO reviews.'
        : 'ORVO reviews every builder manually. Once approved, you can browse jobs and send quotes.'}</p>
      <div class="field"><label>Bio (min 50 characters)</label><textarea id="apply-bio" placeholder="Your experience building AI agents — tools, projects, what you can deliver..." maxlength="2000"></textarea><p class="chat-meta" id="apply-bio-count">0 / 2000 (min 50)</p></div>
      <div class="field"><label>Skills (comma separated)</label><input id="apply-skills" placeholder="Cursor, n8n, WhatsApp bots, Voice AI"/></div>
      <div class="field"><label>Portfolio URL <span style="font-weight:400;color:var(--gray)">(optional)</span></label><input id="apply-portfolio" placeholder="GitHub, website, or leave empty"/></div>
      <div class="field"><label>LinkedIn <span style="font-weight:400;color:var(--gray)">(optional)</span></label><input id="apply-linkedin" placeholder="https://linkedin.com/in/..."/></div>
      <div class="field"><label>Years of experience</label><input id="apply-years" type="number" min="0" value="0"/></div>
      <button class="btn-black" id="apply-btn">${btnLabel}</button>
      ${editing ? '<button class="btn btn-ghost" id="apply-cancel" style="margin-top:10px;width:100%;padding:12px">Back to status</button>' : ''}`;
    if (existing) {
      $('apply-bio').value = existing.bio || '';
      $('apply-skills').value = skillsStr;
      $('apply-portfolio').value = existing.portfolio_url || '';
      $('apply-linkedin').value = existing.linkedin_url || '';
      $('apply-years').value = String(existing.experience_years ?? 0);
    } else if (editing) {
      toast('Could not load your application to edit. Try again or contact support.', false);
    }
    $('apply-btn').addEventListener('click', doApply);
    $('apply-cancel')?.addEventListener('click', () => go('status'));
    wireFieldCounter('apply-bio', 'apply-bio-count', 2000, { min: 50 });
  }

  async function doApply() {
    const bio = $('apply-bio').value.trim();
    if (bio.length < 50) { toast('Bio must be at least 50 characters', false); return; }
    const skills = $('apply-skills').value.trim();
    if (!skills) { toast('Add at least one skill', false); return; }
    const btn = $('apply-btn');
    const wasPending = isPending();
    btn.disabled = true;
    btn.textContent = wasPending ? 'Saving...' : 'Submitting...';
    try {
      const row = {
        user_id: user.id,
        full_name: profile?.full_name || user.user_metadata?.full_name || 'Builder',
        email: user.email || profile?.email || '',
        bio,
        skills,
        portfolio_url: $('apply-portfolio').value.trim() || null,
        linkedin_url: $('apply-linkedin').value.trim() || null,
        experience_years: parseInt($('apply-years').value, 10) || 0,
        status: 'pending',
      };
      const { data: saved, error: e1 } = await needDb().from('builder_applications')
        .upsert(row, { onConflict: 'user_id' }).select().single();
      if (e1) throw e1;
      const { error: e2 } = await needDb().from('profiles')
        .update({ builder_status: 'pending' }).eq('id', user.id);
      if (e2) throw e2;
      await refreshUser();
      renderSidebar();
      go('status');
      toast(wasPending ? 'Application updated — still pending review.' : 'Application sent! Admin will see it in Review builders.', true);
      if (!saved) console.warn('ORVO: application saved but no row returned');
    } catch (e) {
      const msg = e?.message || String(e);
      if (isDbSchemaErr(msg)) {
        const body = $('view-body');
        body.innerHTML = `<p class="empty err">${esc(userFacingErr(msg))}</p>${founderSchemaFixHtml('Builder applications need APPLY-ALL SQL (001–020).')}`;
        wireFounderSchemaFix(body);
      } else {
        toast(userFacingErr(msg), false);
      }
    } finally {
      btn.disabled = false;
      btn.textContent = wasPending ? 'Save changes' : 'Submit application';
    }
  }

  async function loadStatus() {
    const { data: app, error } = await needDb().from('builder_applications').select('*').eq('user_id', user.id).maybeSingle();
    if (error) {
      const body = $('view-body');
      body.innerHTML = `<p class="empty err">${esc(userFacingErr(error.message))}</p>${founderSchemaFixHtml('Application status needs APPLY-ALL SQL.')}`;
      wireFounderSchemaFix(body);
      return;
    }
    if (!app) {
      $('view-body').innerHTML = '<p class="empty">No application yet.</p><button class="btn btn-primary" style="margin-top:16px" data-goto="apply">Apply now</button>';
      return;
    }
    const msgs = {
      pending: 'Your application is under review. ORVO typically responds within 48 hours.',
      approved: 'You are approved! Browse open jobs and send quotes to clients.',
      rejected: 'Your application was not approved. Contact support if you believe this is an error.',
    };
    $('view-body').innerHTML = `
      <p><strong>Status:</strong> <span class="badge">${esc(statusLabel(app.status))}</span></p>
      <p style="color:var(--gray);margin:12px 0 20px;font-size:14px">${msgs[app.status] || ''}</p>
      <p style="font-size:13px;color:var(--gray)">Submitted ${timeAgoHtml(app.created_at)}</p>
      ${app.status === 'approved' ? '<button class="btn btn-primary" style="margin-top:20px;padding:12px 28px" data-goto="jobs">Browse jobs</button>' : ''}
      ${app.status === 'pending' ? '<button class="btn btn-ghost" style="margin-top:12px;padding:12px 28px" data-goto="apply">Edit application</button>' : ''}`;
  }

  // ── ADMIN ──
  async function loadAdmin() {
    if (!isAdmin()) {
      $('view-body').innerHTML = `<p class="empty">Admin access required.</p>`;
      return;
    }
    refreshAdminBadge();
    $('view-action').innerHTML = `
      <button class="btn btn-ghost" id="admin-events" title="Copy client analytics buffer">Copy events</button>
      <button class="btn btn-ghost" id="admin-refresh">Refresh</button>
      ${copyViewBtnHtml()}`;
    wireCopyViewLink();
    $('admin-refresh')?.addEventListener('click', loadAdmin);
    $('admin-events')?.addEventListener('click', async () => {
      const rows = window.ORVO_EVENTS?.dump?.() || [];
      const text = JSON.stringify(rows, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        toast('Copied ' + rows.length + ' session events', true);
      } catch {
        toast(rows.length ? 'Events in console' : 'No events yet', true);
        console.info('[ORVO] events dump', rows);
      }
      track('admin_events_copied', { n: rows.length });
    });

    $('view-body').innerHTML = loadingSkeleton(4);

    const countOf = async (table, filter) => {
      let q = needDb().from(table).select('*', { count: 'exact', head: true });
      if (filter) q = filter(q);
      const { count } = await q;
      return count || 0;
    };

    let kpiHtml = '';
    try {
      const [
        pendingBuilders,
        openReqs,
        awaitingPay,
        funded,
        completed,
        openDisputes,
        approvedBuilders,
      ] = await Promise.all([
        countOf('builder_applications', (q) => q.eq('status', 'pending')),
        countOf('requests', (q) => q.eq('status', 'open')),
        countOf('requests', (q) => q.eq('status', 'awaiting_payment')),
        countOf('requests', (q) => q.eq('status', 'funded')),
        countOf('requests', (q) => q.eq('status', 'completed')),
        countOf('disputes', (q) => q.in('status', ['open', 'under_review'])),
        countOf('profiles', (q) => q.eq('builder_status', 'approved')),
      ]);
      kpiHtml = `
        <div class="row" style="margin-bottom:20px">
          <div class="card kpi-card" style="flex:1;min-width:120px;cursor:pointer" data-goto="admin" tabindex="0" role="button" aria-label="Pending builders: ${pendingBuilders}"><p style="font-size:12px;color:var(--gray)">Pending builders</p><h3>${pendingBuilders}</h3></div>
          <div class="card kpi-card" style="flex:1;min-width:120px;cursor:pointer" data-goto="all-requests" data-status="open" tabindex="0" role="button" aria-label="Open requests: ${openReqs}"><p style="font-size:12px;color:var(--gray)">Open requests</p><h3>${openReqs}</h3></div>
          <div class="card kpi-card" style="flex:1;min-width:120px;cursor:pointer" data-goto="all-requests" data-status="awaiting_payment" tabindex="0" role="button" aria-label="Awaiting payment: ${awaitingPay}"><p style="font-size:12px;color:var(--gray)">Awaiting pay</p><h3>${awaitingPay}</h3></div>
          <div class="card kpi-card" style="flex:1;min-width:120px;cursor:pointer" data-goto="all-requests" data-status="funded" tabindex="0" role="button" aria-label="Funded requests: ${funded}"><p style="font-size:12px;color:var(--gray)">Funded</p><h3>${funded}</h3></div>
          <div class="card kpi-card" style="flex:1;min-width:120px;cursor:pointer" data-goto="all-requests" data-status="completed" tabindex="0" role="button" aria-label="Completed requests: ${completed}"><p style="font-size:12px;color:var(--gray)">Completed</p><h3>${completed}</h3></div>
          <div class="card kpi-card" style="flex:1;min-width:120px;cursor:pointer" data-goto="disputes" tabindex="0" role="button" aria-label="Open disputes: ${openDisputes}"><p style="font-size:12px;color:var(--gray)">Disputes</p><h3>${openDisputes}</h3></div>
          <div class="card kpi-card" style="flex:1;min-width:120px;cursor:pointer" data-goto="admin" tabindex="0" role="button" aria-label="Approved builders: ${approvedBuilders}"><p style="font-size:12px;color:var(--gray)">Approved builders</p><h3>${approvedBuilders}</h3></div>
        </div>
        <h3 style="margin:8px 0 12px;font-size:16px">Pending builder applications</h3>`;
    } catch (_) {
      kpiHtml = '';
    }

    const { data, error } = await needDb().from('builder_applications')
      .select('*').eq('status', 'pending').order('created_at', { ascending: false });
    if (error) {
      $('view-body').innerHTML = kpiHtml + `<p class="empty err">${esc(userFacingErr(error.message))}</p>${founderSchemaFixHtml('Admin query failed — schema may be incomplete.')}`;
      wireFounderSchemaFix($('view-body'));
      bindKpiCards();
      return;
    }
    if (!data?.length) {
      $('view-body').innerHTML = kpiHtml + `<p class="empty">No pending applications yet.</p>
        <p class="empty" style="padding-top:12px;font-size:13px;color:var(--gray)">
          Builders submit via Apply (bio 50+ chars). Use <b>All requests</b> to invite approved builders.
        </p>`;
      bindKpiCards();
      return;
    }
    const searchHtml = `<input class="admin-search" id="admin-app-search" type="search" placeholder="Filter by name, email, or skills…" autocomplete="off"/>`;
    const renderApps = (list) => list.map(a => `
      <div class="card admin-app-card" data-search="${esc((a.full_name || '') + ' ' + (a.email || '') + ' ' + (a.skills || '')).toLowerCase()}">
        <h3>${esc(a.full_name)}</h3>
        <p style="font-size:13px;color:var(--gray);margin-bottom:8px">${esc(a.email || '')}</p>
        <p><b>Skills:</b> ${esc(a.skills)}</p>
        <p>${esc(a.bio)}</p>
        <div class="row">
          <button class="btn btn-primary btn-approve" data-uid="${a.user_id}">Approve</button>
          <button class="btn btn-ghost btn-reject" data-uid="${a.user_id}">Reject</button>
        </div>
      </div>`).join('');
    $('view-body').innerHTML = kpiHtml + searchHtml + `<div id="admin-app-list">${renderApps(data)}</div>`;
    bindKpiCards();
    const bindApprove = () => {
      $('view-body').querySelectorAll('.btn-approve').forEach(b => b.addEventListener('click', () => approveBuilder(b.dataset.uid)));
      $('view-body').querySelectorAll('.btn-reject').forEach(b => b.addEventListener('click', () => rejectBuilder(b.dataset.uid)));
    };
    bindApprove();
    $('admin-app-search')?.addEventListener('input', (e) => {
      const q = (e.target.value || '').trim().toLowerCase();
      $('view-body').querySelectorAll('.admin-app-card').forEach((card) => {
        const hay = card.getAttribute('data-search') || '';
        card.style.display = !q || hay.includes(q) ? '' : 'none';
      });
    });
  }

  async function approveBuilder(uid) {
    const ans = await askConfirm({
      title: 'Approve this builder?',
      sub: 'They can browse jobs and send quotes immediately.',
      okLabel: 'Approve builder',
    });
    if (!ans.ok) return;
    try {
      const { error: e1 } = await needDb().from('builder_applications')
        .update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('user_id', uid);
      if (e1) throw new Error('Approve failed: ' + e1.message);
      const { error: e2 } = await needDb().from('profiles')
        .update({ builder_status: 'approved' }).eq('id', uid);
      if (e2) throw new Error('Profile update failed: ' + e2.message);
      if (uid === user.id) await refreshUser();
      toast('Builder approved!', true);
      track('builder_approved', { user_id: uid });
      loadAdmin();
    } catch (e) { toastSchemaErr(e?.message || String(e)); }
  }

  async function rejectBuilder(uid) {
    const ans = await askConfirm({
      title: 'Reject this application?',
      sub: 'The builder will see a rejected status. You can re-invite later if needed.',
      okLabel: 'Reject application',
    });
    if (!ans.ok) return;
    try {
      const { error: e1 } = await needDb().from('builder_applications')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('user_id', uid);
      if (e1) throw e1;
      const { error: e2 } = await needDb().from('profiles')
        .update({ builder_status: 'rejected' }).eq('id', uid);
      if (e2) throw e2;
      toast('Rejected', true);
      loadAdmin();
    } catch (e) { toastSchemaErr(e?.message || String(e)); }
  }

  async function loadInvites() {
    const body = $('view-body');
    if (!isBuilder()) {
      body.innerHTML = '<p class="empty">Approved builders only.</p>';
      return;
    }
    body.innerHTML = loadingSkeleton(3);
    const { data, error } = await needDb().from('request_invites')
      .select('id,note,created_at,request_id, requests(id,title,description,category,budget,status,location)')
      .eq('builder_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      const founderFix = founderSchemaFixHtml('Missing invites table?');
      body.innerHTML = `<p class="empty err">${esc(userFacingErr(error.message))}</p>${
        founderFix || `<p class="empty" style="font-size:12px;padding-top:8px">Invites are not available yet — browse open jobs instead.</p>
           <button class="btn btn-primary" style="margin-top:12px;padding:12px 24px" data-goto="jobs">Browse jobs</button>`
      }`;
      wireFounderSchemaFix(body);
      return;
    }
    if (!data?.length) {
      body.innerHTML = `<p class="empty">No invited jobs yet.</p>
        <p class="empty" style="padding-top:8px;font-size:13px">ORVO admin will invite you to matching briefs. You can also browse open jobs.</p>
        <button class="btn btn-primary" style="margin-top:16px;padding:12px 24px" data-goto="jobs">Browse jobs</button>`;
      return;
    }
    body.innerHTML = data.map(inv => {
      const r = inv.requests || {};
      const rid = r.id || inv.request_id;
      const title = esc(r.title || 'Request');
      return `
      <div class="card" data-click="${rid}" tabindex="0" role="button" aria-label="Open invite: ${title}">
        <span class="tag">${esc(r.category || 'Invite')}</span>
        <h3>${title}</h3>
        <p>${esc((r.description || '').slice(0, 160))}</p>
        <p>Budget: ${esc(r.budget || 'Not specified')}${r.location ? ' · ' + esc(r.location) : ''}</p>
        ${inv.note ? `<p style="font-size:12px;color:var(--gray)">Note: ${esc(inv.note)}</p>` : ''}
        <p style="font-size:12px;color:var(--gray)">${timeAgoHtml(inv.created_at)}</p>
        <div class="row">
          <button class="btn btn-primary btn-quote" data-rid="${rid}">Send quote</button>
          <button class="btn btn-ghost btn-chat" data-rid="${rid}">Message</button>
        </div>
      </div>`;
    }).join('');
    body.querySelectorAll('[data-click]').forEach((el) => {
      wireActivate(el, (e) => {
        if (e?.target?.closest?.('button')) return;
        go('chat', el.dataset.click);
      });
    });
    body.querySelectorAll('.btn-quote').forEach(b => b.addEventListener('click', () => openQuoteModal(b.dataset.rid)));
    body.querySelectorAll('.btn-chat').forEach(b => b.addEventListener('click', () => go('chat', b.dataset.rid)));
  }

  async function loadAllRequests() {
    if (!isAdmin()) {
      $('view-body').innerHTML = '<p class="empty">Admin only</p>';
      return;
    }
    $('view-body').innerHTML = loadingSkeleton(4);
    const qText = (window.__orvoAllReqsQuery || '').trim().toLowerCase();
    const statusFilter = window.__orvoAllReqsStatus || '';
    const { data, error } = await needDb().from('requests').select('*').order('created_at', { ascending: false }).limit(40);
    if (error) {
      $('view-body').innerHTML = `<p class="empty err">${esc(userFacingErr(error.message))}</p>${founderSchemaFixHtml('Schema missing?')}`;
      wireFounderSchemaFix($('view-body'));
      return;
    }
    let rows = data || [];
    if (statusFilter) rows = rows.filter((r) => r.status === statusFilter);
    if (qText) {
      rows = rows.filter((r) => {
        const hay = ((r.title || '') + ' ' + (r.description || '') + ' ' + (r.status || '') + ' ' + (r.location || '')).toLowerCase();
        return hay.includes(qText);
      });
    }
    const { data: builders } = await needDb().from('profiles')
      .select('id,full_name,email').eq('builder_status', 'approved').limit(50);
    const payIds = rows
      .filter((r) => ['awaiting_payment', 'funded', 'delivered', 'completed'].includes(r.status))
      .map((r) => r.id);
    const payMap = {};
    if (payIds.length) {
      try {
        const { data: pays } = await needDb().from('payments')
          .select('request_id,status,amount_cents').in('request_id', payIds);
        (pays || []).forEach((p) => { payMap[p.request_id] = p; });
      } catch { /* optional */ }
    }
    const builderOpts = (builders || []).map(b =>
      `<option value="${b.id}">${esc(b.full_name || b.email || b.id)}</option>`
    ).join('');
    const allRows = data || [];
    const countFor = (key) => (key === '' ? allRows.length : allRows.filter((r) => r.status === key).length);
    const statusChips = [
      { key: '', label: 'All' },
      { key: 'open', label: 'Open' },
      { key: 'awaiting_payment', label: 'Awaiting pay' },
      { key: 'funded', label: 'Funded' },
      { key: 'delivered', label: 'Delivered' },
      { key: 'completed', label: 'Completed' },
      { key: 'disputed', label: 'Disputed' },
    ];
    const chipHtml = `<div class="row" style="margin-bottom:12px;flex-wrap:wrap;gap:8px;align-items:center">${
      statusChips.map((c) =>
        `<button type="button" class="btn btn-ghost channel-chip${statusFilter === c.key ? ' on' : ''}" data-status="${c.key}" style="padding:6px 12px;font-size:12px">${c.label} (${countFor(c.key)})</button>`
      ).join('')
    }${statusFilter ? '<button type="button" class="btn btn-ghost" id="btn-copy-filter-link" style="padding:6px 12px;font-size:12px">Copy filtered link</button>' : ''}</div>`;
    const searchHtml = `${chipHtml}<input class="admin-search" id="all-reqs-search" type="search" placeholder="Filter requests…" value="${esc(qText)}" autocomplete="off"/>`;
    const emptyMsg = !rows.length
      ? `<p class="empty">No requests${qText ? ' match that search' : (statusFilter ? ' with that status' : '')}.</p>
         ${statusFilter || qText ? '<button type="button" class="btn btn-ghost" id="btn-clear-all-reqs-filter" style="margin-top:8px;padding:8px 12px;font-size:12px">Clear filters</button>' : ''}`
      : '';
    $('view-body').innerHTML = searchHtml + ((rows || []).map(r => {
      const pay = payMap[r.id];
      const payLine = pay ? ` · Pay: ${statusLabel(pay.status)}${pay.amount_cents ? ' ' + money(pay.amount_cents) : ''}` : '';
      const title = esc(r.title || 'Request');
      return `
      <div class="card" data-click="${r.id}" tabindex="0" role="button" aria-label="Open request: ${title}">
        <h3>${title}</h3>
        <p>${esc(statusLabel(r.status))}${payLine} · ${timeAgoHtml(r.created_at)}${r.location ? ' · ' + esc(r.location) : ''}</p>
        <p style="font-size:13px;color:var(--gray);margin:8px 0">${esc((r.description || '').slice(0, 140))}</p>
        <div class="row" style="align-items:center">
          <select class="invite-builder" data-rid="${r.id}" style="flex:1;min-width:160px;padding:10px;border:1px solid var(--border);border-radius:8px">
            <option value="">Invite builder…</option>
            ${builderOpts}
          </select>
          <button class="btn btn-primary btn-invite" data-rid="${r.id}">Invite</button>
          <button class="btn btn-ghost btn-open-req" data-rid="${r.id}">Open</button>
        </div>
      </div>`;
    }).join('') || emptyMsg);
    $('view-body').querySelectorAll('[data-click]').forEach((el) => {
      wireActivate(el, (e) => {
        if (e?.target?.closest?.('button, select')) return;
        go('chat', el.dataset.click);
      });
    });
    $('btn-clear-all-reqs-filter')?.addEventListener('click', () => {
      window.__orvoAllReqsStatus = '';
      window.__orvoAllReqsQuery = '';
      loadAllRequests();
    });
    $('btn-copy-filter-link')?.addEventListener('click', async () => {
      const url = `${window.location.origin}${window.location.pathname}?view=all-requests&status=${encodeURIComponent(statusFilter)}`;
      try {
        await navigator.clipboard.writeText(url);
        toast('Copied filtered admin link', true);
      } catch {
        toast(url, true);
      }
    });
    $('all-reqs-search')?.addEventListener('input', (e) => {
      window.__orvoAllReqsQuery = e.target.value;
      clearTimeout(window.__orvoAllReqsSearchT);
      window.__orvoAllReqsSearchT = setTimeout(loadAllRequests, 280);
    });
    $('view-body').querySelectorAll('[data-status]').forEach((btn) => {
      wireActivate(btn, () => {
        window.__orvoAllReqsStatus = btn.dataset.status || '';
        syncDashUrl();
        loadAllRequests();
      });
    });
    $('view-body').querySelectorAll('.btn-invite').forEach(b => {
      b.addEventListener('click', () => {
        const sel = $('view-body').querySelector(`select.invite-builder[data-rid="${b.dataset.rid}"]`);
        inviteBuilder(b.dataset.rid, sel?.value);
      });
    });
    $('view-body').querySelectorAll('.btn-open-req').forEach(b => {
      b.addEventListener('click', () => go('chat', b.dataset.rid));
    });
  }

  async function inviteBuilder(requestId, builderId) {
    if (!builderId) { toast('Pick a builder', false); return; }
    const ans = await askConfirm({
      title: 'Invite this builder?',
      sub: 'They will see this brief under Invited jobs and can quote or message.',
      okLabel: 'Send invite',
    });
    if (!ans.ok) return;
    try {
      const { error } = await needDb().from('request_invites').insert({
        request_id: requestId,
        builder_id: builderId,
        invited_by: user.id,
        note: 'Concierge invite from ORVO admin',
      });
      if (error) throw error;
      toast('Builder invited', true);
    } catch (e) { toastSchemaErr(e?.message || String(e)); }
  }

  async function loadDisputes() {
    if (!isAdmin()) {
      $('view-body').innerHTML = '<p class="empty">Admin only</p>';
      return;
    }
    $('view-body').innerHTML = loadingSkeleton(3);
    const { data, error } = await needDb().from('disputes')
      .select('*').in('status', ['open', 'under_review']).order('created_at', { ascending: false });
    if (error) {
      $('view-body').innerHTML = `<p class="empty err">${esc(userFacingErr(error.message))}</p>${founderSchemaFixHtml('Missing disputes table?')}`;
      wireFounderSchemaFix($('view-body'));
      return;
    }
    if (!data?.length) {
      $('view-body').innerHTML = `<p class="empty">No open disputes</p>
        <p class="empty" style="padding-top:8px;font-size:13px">When clients open disputes, they appear here for review.</p>
        <button class="btn btn-ghost" data-goto="all-requests" style="margin-top:12px">View all requests</button>`;
      $('view-body').querySelector('[data-goto="all-requests"]')?.addEventListener('click', () => go('all-requests'));
      refreshDisputesBadge();
      return;
    }
    $('view-body').innerHTML = data.map(d => `
      <div class="card" data-click="${d.request_id}" tabindex="0" role="button" aria-label="Open disputed request" style="cursor:pointer">
        <h3>Dispute · ${esc(d.reason)}</h3>
        <p>${esc(d.details)}</p>
        <p style="font-size:12px;color:var(--gray)">${esc(statusLabel(d.status))} · ${timeAgoHtml(d.created_at)}</p>
        <div class="row">
          <button class="btn btn-ghost btn-goto-req" data-rid="${d.request_id}">Open request</button>
          <button class="btn btn-primary btn-resolve" data-id="${d.id}" data-rid="${d.request_id}" data-how="resolved_client">Resolve → client</button>
          <button class="btn btn-primary btn-resolve" data-id="${d.id}" data-rid="${d.request_id}" data-how="resolved_builder">Resolve → builder</button>
        </div>
      </div>`).join('');
    $('view-body').querySelectorAll('[data-click]').forEach((el) => {
      wireActivate(el, (e) => {
        if (e?.target?.closest?.('button')) return;
        go('chat', el.dataset.click);
      });
    });
    $('view-body').querySelectorAll('.btn-goto-req').forEach(b => b.addEventListener('click', () => go('chat', b.dataset.rid)));
    $('view-body').querySelectorAll('.btn-resolve').forEach(b => {
      b.addEventListener('click', () => resolveDispute(b.dataset.id, b.dataset.rid, b.dataset.how));
    });
    refreshDisputesBadge();
  }

  async function resolveDispute(disputeId, requestId, how) {
    const ans = await askConfirm({
      title: how === 'resolved_client' ? 'Resolve for client?' : 'Resolve for builder?',
      sub: 'Request returns to Delivered so the parties can continue.',
      okLabel: 'Resolve dispute',
      withNote: true,
    });
    if (!ans.ok) return;
    try {
      const { error } = await needDb().from('disputes').update({
        status: how,
        admin_note: ans.note || null,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      }).eq('id', disputeId);
      if (error) throw error;
      await needDb().from('requests').update({ status: 'delivered' }).eq('id', requestId);
      toast('Dispute resolved', true);
      loadDisputes();
    } catch (e) { toastSchemaErr(e?.message || String(e)); }
  }

  // ── CHAT ──
  function stopChat() {
    if (chatSub && db) db.removeChannel(chatSub);
    chatSub = null;
    stopPayWatch();
    if (chatPoll) clearInterval(chatPoll);
    chatPoll = null;
    chatRequestId = null;
    chatRequestStatus = 'open';
  }

  function requestSpineSteps(status) {
    if (window.ORVO_STATUS?.requestSpineSteps) {
      return window.ORVO_STATUS.requestSpineSteps(status);
    }
    const order = ['open', 'awaiting_payment', 'funded', 'delivered', 'completed'];
    const labels = {
      open: 'Open',
      awaiting_payment: 'Awaiting pay',
      funded: 'Funded',
      delivered: 'Delivered',
      completed: 'Done',
    };
    let s = status || 'open';
    if (s === 'in_progress') s = 'funded';
    if (s === 'cancelled') {
      return [
        { key: 'open', label: 'Open', cls: 'done' },
        { key: 'cancelled', label: 'Cancelled', cls: 'now' },
      ];
    }
    if (s === 'disputed') {
      return order.map((k) => ({
        key: k,
        label: labels[k],
        cls: k === 'delivered' ? 'now' : (order.indexOf(k) < order.indexOf('delivered') ? 'done' : ''),
      })).concat([{ key: 'disputed', label: 'Disputed', cls: 'now' }]);
    }
    const idx = Math.max(0, order.indexOf(s));
    return order.map((k, i) => ({
      key: k,
      label: labels[k],
      cls: i < idx ? 'done' : (i === idx ? 'now' : ''),
    }));
  }

  async function markThreadNotificationsRead(rid) {
    if (!user || !rid) return;
    try {
      const { data } = await needDb().from('notifications')
        .select('id,link_path').eq('user_id', user.id).is('read_at', null);
      const ids = (data || [])
        .filter((n) => (n.link_path || '').includes(String(rid)))
        .map((n) => n.id);
      if (!ids.length) return;
      await needDb().from('notifications')
        .update({ read_at: new Date().toISOString() })
        .in('id', ids).eq('user_id', user.id);
      refreshNotifBadge();
    } catch (_) { /* inbox optional */ }
  }

  async function loadChat() {
    if (!chatRequestId) { go('messages'); return; }
    const rid = chatRequestId;
    if (chatSub && db) db.removeChannel(chatSub);
    chatSub = null;
    stopPayWatch();
    if (chatPoll) clearInterval(chatPoll);
    chatPoll = null;
    chatRequestId = rid;

    const { data: req, error: reqErr } = await needDb().from('requests').select('*').eq('id', rid).single();
    if (reqErr) {
      $('view-body').innerHTML = `<p class="empty err">${esc(userFacingErr(reqErr.message))}</p>${founderSchemaFixHtml('Project chat needs APPLY-ALL SQL.')}`;
      wireFounderSchemaFix($('view-body'));
      return;
    }
    if (!req) {
      toast('Request not found', false);
      go('messages');
      return;
    }
    if (!(await canChatOnRequest(req))) {
      toast('Message only after you quote or are assigned to this job.', false);
      go(isBuilder() ? 'jobs' : 'messages');
      return;
    }
    markThreadNotificationsRead(rid);
    chatRequestStatus = req?.status || 'open';
    setViewTitle((req.title || 'Chat').slice(0, 48));

    const { data: payRow } = await needDb().from('payments').select('*').eq('request_id', rid).maybeSingle();

    let builderSnip = '';
    if (req?.assigned_builder_id) {
      const { data: bp } = await needDb().from('profiles')
        .select('id,full_name,bio,skills').eq('id', req.assigned_builder_id).maybeSingle();
      const { data: app } = await needDb().from('builder_applications')
        .select('portfolio_url,bio,skills').eq('user_id', req.assigned_builder_id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      const name = bp?.full_name || 'Assigned builder';
      const skills = (bp?.skills || app?.skills || '').toString().slice(0, 120);
      const port = app?.portfolio_url || '';
      builderSnip = `<p class="builder-snip"><strong>${esc(name)}</strong>${skills ? ' · ' + esc(skills) : ''}${port ? ` · <a href="${esc(port)}" target="_blank" rel="noopener">Portfolio</a>` : ''}</p>`;
    }

    let quotesHtml = '';
    if (req?.user_id === user.id) {
      const { data: quotes } = await needDb().from('quotes').select('*').eq('request_id', rid);
      const ids = [...new Set((quotes || []).map(q => q.builder_id))];
      const { data: profs } = ids.length ? await needDb().from('profiles').select('id,full_name').in('id', ids) : { data: [] };
      const names = Object.fromEntries((profs || []).map(p => [p.id, p.full_name]));
      let ratings = {};
      if (ids.length) {
        try {
          const { data: revs } = await needDb().from('reviews').select('builder_id,rating').in('builder_id', ids);
          const acc = {};
          (revs || []).forEach((r) => {
            if (!acc[r.builder_id]) acc[r.builder_id] = { sum: 0, n: 0 };
            acc[r.builder_id].sum += Number(r.rating) || 0;
            acc[r.builder_id].n += 1;
          });
          Object.keys(acc).forEach((id) => {
            ratings[id] = { avg: acc[id].sum / acc[id].n, n: acc[id].n };
          });
        } catch (_) { /* reviews table optional */ }
      }
      quotesHtml = (quotes || []).length ? (quotes || []).map(q => {
        const rt = ratings[q.builder_id];
        const rateLabel = rt ? ` · ★ ${rt.avg.toFixed(1)} (${rt.n})` : '';
        return `
        <div class="card" style="cursor:default">
          <h3>${esc(names[q.builder_id] || 'Builder')} — ${money(q.amount_cents)}</h3>
          <p>${esc(q.message)}</p>
          ${q.delivery_days ? `<p style="font-size:12px;color:var(--muted)">ETA ${esc(String(q.delivery_days))} days${rateLabel}</p>` : (rateLabel ? `<p style="font-size:12px;color:var(--muted)">${rateLabel.slice(3)}</p>` : '')}
          ${q.status === 'pending' ? `<button class="btn btn-primary btn-pay" data-qid="${q.id}" data-rid="${rid}">Accept & pay</button>` : `<span class="badge">${esc(statusLabel(q.status))}</span>`}
        </div>`;
      }).join('') : `<p class="empty">Waiting for quotes...</p>
          <p class="empty" style="padding-top:8px;font-size:13px">Vetted builders worldwide will reply here with USD quotes.</p>`;
    }

    let escrowHtml = '';
    if (req?.status === 'disputed') {
      escrowHtml = `<div class="card" style="cursor:default;margin-bottom:16px"><b>Dispute open</b><p>Release is frozen until ORVO admin reviews.</p></div>`;
    } else if (req && ['awaiting_payment', 'funded', 'delivered', 'in_progress'].includes(req.status)) {
      const isClient = req.user_id === user.id;
      const isAssigned = req.assigned_builder_id === user.id;
      if (isClient && req.status === 'awaiting_payment') {
        const payStatus = payRow?.status || 'pending';
        const payBadge = payRow ? statusLabel(payRow.status) : 'No payment row';
        const checkoutOpen = payStatus === 'checkout_open';
        const checkoutLive = !!window.ORVO_CHECKOUT_LIVE;
        const payNote = checkoutOpen
          ? 'You started checkout but did not finish. Complete payment to hold funds until delivery — not funded until Checkout succeeds.'
          : 'Quote accepted. Checkout holds funds until you approve delivery — not funded until Checkout completes.';
        const btnLabel = checkoutOpen
          ? (checkoutLive ? 'Continue to Stripe Checkout' : 'Resume checkout')
          : (checkoutLive ? 'Pay with Stripe Checkout' : 'Try checkout again');
        const confirming = checkoutPollTimer && payStatus !== 'held';
        escrowHtml = `<div class="card" style="cursor:default;margin-bottom:16px"><b>Payment</b>
          ${confirming ? '<p class="pay-confirming" style="font-size:12px;margin:0 0 8px" role="status" aria-live="polite">Confirming payment with Stripe webhook…</p>' : ''}
          <p>${payNote}</p>
          <p style="font-size:12px;color:var(--muted);margin:8px 0">Payment: <span class="badge">${esc(payBadge)}</span>
            ${payRow ? ' · ' + money(payRow.amount_cents) : ''}</p>
          <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:4px">
            <button class="btn btn-primary" id="btn-retry-checkout" data-rid="${rid}" data-qid="${payRow?.quote_id || ''}" data-label="${esc(btnLabel)}">${esc(btnLabel)}</button>
            <button type="button" class="btn btn-ghost" id="btn-refresh-pay" data-rid="${rid}">Refresh status</button>
          </div>
          </div>`;
      }
      if (isAssigned && req.status === 'funded') {
        escrowHtml = `<div class="card" style="cursor:default;margin-bottom:16px"><b>Delivery</b>
          <p>Share a demo link (optional) and mark delivered when the client can test.</p>
          <div class="field" style="margin:12px 0"><input id="deliver-url" placeholder="https://demo.example.com"/></div>
          <button class="btn btn-primary" id="btn-mark-delivered" data-rid="${rid}">Mark delivered</button></div>`;
      }
      if (isClient && (req.status === 'funded' || req.status === 'delivered')) {
        const builderNeedsConnect = payRow?.status === 'held' && !payRow?.connected_account_id;
        escrowHtml += `<div class="card" style="cursor:default;margin-bottom:16px"><b>Release</b><p>Status: <span class="badge">${esc(statusLabel(req.status))}</span>. Release when you're satisfied.</p>
          ${builderNeedsConnect ? '<p style="font-size:12px;color:var(--o);margin:8px 0 0">Builder payout onboarding pending — release may fail until they complete Connect setup in Profile.</p>' : ''}
          <div class="escrow-actions" style="margin-top:12px">
          <button class="btn btn-primary" id="btn-release-pay" data-rid="${rid}">Release payment to builder</button>
          <button class="btn btn-ghost" id="btn-open-dispute" data-rid="${rid}">Open dispute</button>
          </div></div>`;
      }
    }
    if (req?.status === 'completed' && req.user_id === user.id) {
      escrowHtml += `<div class="card" style="cursor:default;margin-bottom:16px"><b>Review</b>
        <p>How was this builder? Leave a 1–5 star review.</p>
        <button class="btn btn-primary" id="btn-leave-review" data-rid="${rid}" data-builder="${req.assigned_builder_id || ''}">Leave review</button></div>`;
    }

    const steps = requestSpineSteps(req?.status);
    const rail = steps.map((s) => `<span class="step-dot ${s.cls}">${esc(s.label)}</span>`).join('');
    const metaBits = [
      req?.category ? `<span><b>Channel</b> ${esc(req.category)}</span>` : '',
      req?.location ? `<span><b>Country</b> ${esc(req.location)}</span>` : '',
      req?.budget ? `<span><b>Budget</b> ${esc(req.budget)}</span>` : '',
      payRow ? `<span><b>Pay</b> ${esc(statusLabel(payRow.status))}</span>` : '',
    ].filter(Boolean).join('');

    $('view-body').innerHTML = `
      <div class="req-spine">
        <h3>${esc(req?.title || 'Request')}</h3>
        <div class="status-rail">${rail}</div>
        <div class="req-meta">${metaBits}</div>
        ${builderSnip}
        ${req?.description ? `<p style="font-size:13px;color:var(--gray);line-height:1.55;margin:0 0 10px">${esc(req.description.slice(0, 280))}${req.description.length > 280 ? '…' : ''}</p>` : ''}
        <button type="button" class="btn btn-ghost" id="btn-copy-req-link" style="padding:8px 12px;font-size:12px">Copy request link</button>
      </div>
      ${req?.user_id === user.id ? `<div style="margin-bottom:16px"><b>Quotes</b>${quotesHtml}</div>` : ''}
      ${escrowHtml}
      <p class="chat-hint" id="chat-hint">No emails or phone numbers. Off-platform contact links blocked. Agent/demo links (GitHub, Vercel, n8n…) are OK.</p>
      <div class="chat">
        <div class="chat-msgs" id="chat-msgs" role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation"></div>
        <form class="chat-send" id="chat-form">
          <label class="sr-only" for="chat-input">Message</label>
          <input id="chat-input" placeholder="Type a message..." autocomplete="off" maxlength="2000" aria-describedby="chat-count chat-hint"/>
          <button class="btn btn-primary" type="submit">Send</button>
        </form>
        <p class="chat-meta" id="chat-count" aria-live="polite">0 / 2000</p>
      </div>`;

    $('view-body').querySelectorAll('.btn-pay').forEach(b => {
      b.addEventListener('click', () => acceptQuote(b.dataset.qid, b.dataset.rid));
    });
    $('btn-mark-delivered')?.addEventListener('click', () => markDelivered(rid));
    $('btn-release-pay')?.addEventListener('click', () => releasePayment(rid));
    $('btn-open-dispute')?.addEventListener('click', () => openDispute(rid));
    $('btn-leave-review')?.addEventListener('click', () => {
      leaveReview(rid, $('btn-leave-review').dataset.builder);
    });
    $('btn-retry-checkout')?.addEventListener('click', async () => {
      const qid = $('btn-retry-checkout').dataset.qid;
      if (!qid) { toast('No quote linked to payment yet', false); return; }
      const btn = $('btn-retry-checkout');
      btn.disabled = true;
      btn.textContent = 'Starting…';
      const checkout = await tryCreateCheckoutSession({ requestId: rid, quoteId: qid });
      if (checkout.ok && checkout.url) {
        window.location.href = checkout.url;
        return;
      }
      btn.disabled = false;
      btn.textContent = btn.dataset.label || 'Try checkout again';
      toast(checkoutUnavailableMessage(checkout), false);
    });
    $('btn-refresh-pay')?.addEventListener('click', () => {
      const btn = $('btn-refresh-pay');
      if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
      pollPaymentAfterCheckout(rid, 6);
      loadChat().finally(() => {
        const b = $('btn-refresh-pay');
        if (b) { b.disabled = false; b.textContent = 'Refresh status'; }
      });
    });
    $('btn-copy-req-link')?.addEventListener('click', () => copyRequestLink(rid));
    $('chat-form').addEventListener('submit', sendMsg);
    const chatInput = $('chat-input');
    const chatCount = $('chat-count');
    const updateCount = () => {
      if (!chatInput || !chatCount) return;
      const n = chatInput.value.length;
      chatCount.textContent = n + ' / 2000';
      chatCount.classList.toggle('warn', n > 1800);
    };
    chatInput?.addEventListener('input', updateCount);
    updateCount();
    if (req?.status === 'cancelled' || req?.status === 'disputed') {
      const closedHint = req.status === 'disputed'
        ? 'Dispute open — messaging stays for facts only; release is frozen.'
        : 'Request cancelled — messaging closed.';
      if (chatInput) {
        chatInput.disabled = true;
        chatInput.placeholder = closedHint;
      }
      $('chat-form')?.querySelector('button[type="submit"]')?.setAttribute('disabled', 'true');
    }
    await renderMsgs();
    stopPayWatch();
    chatSub = needDb().channel('c-' + rid)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'request_id=eq.' + rid }, renderMsgs)
      .subscribe();
    paySub = needDb().channel('pay-' + rid)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'payments', filter: 'request_id=eq.' + rid,
      }, (payload) => {
        const st = payload.new?.status;
        if (st === 'held' || st === 'released') {
          stopCheckoutPoll();
          track('payment_realtime_update', { request_id: rid, status: st });
          toast(st === 'held' ? 'Payment held — funds secured until delivery.' : 'Payment released.', true);
          loadChat();
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'requests', filter: 'id=eq.' + rid,
      }, (payload) => {
        if (payload.new?.status === 'funded') {
          stopCheckoutPoll();
          track('request_funded_realtime', { request_id: rid });
          toast('Project funded — builder can deliver.', true);
          loadChat();
        }
      })
      .subscribe();
    if (chatPoll) clearInterval(chatPoll);
    chatPoll = setInterval(renderMsgs, 4000);
  }

  async function renderMsgs() {
    const box = $('chat-msgs');
    if (!box || !chatRequestId) return;
    const { data, error } = await needDb().from('messages').select('*').eq('request_id', chatRequestId).order('created_at');
    if (error) {
      box.innerHTML = `<p class="empty err">${esc(userFacingErr(error.message))}</p>${founderSchemaFixHtml('Messages table missing?')}`;
      wireFounderSchemaFix(box);
      return;
    }
    const ids = [...new Set((data || []).map(m => m.sender_id).filter(Boolean))];
    const { data: profs } = ids.length ? await needDb().from('profiles').select('id,full_name').in('id', ids) : { data: [] };
    const names = Object.fromEntries((profs || []).map(p => [p.id, p.full_name]));
    box.innerHTML = (data || []).map(m => {
      const mine = m.sender_id === user.id;
      return `<div class="chat-bubble ${mine ? 'me' : 'them'}"><small>${mine ? 'You' : esc(names[m.sender_id] || 'User')}</small>${esc(m.body)}<span class="chat-time"><time datetime="${esc(m.created_at || '')}">${ago(m.created_at)}</time></span></div>`;
    }).join('') || (() => {
      const st = chatRequestStatus || 'open';
      let hint = 'Start chatting — keep scope, quotes, and delivery links on ORVO.';
      if (st === 'open') hint = 'No messages yet. Clients: wait for quotes. Builders: message after you send a quote.';
      else if (st === 'awaiting_payment') hint = 'No messages yet — finish checkout to hold funds, then align on delivery here.';
      else if (st === 'cancelled') hint = 'This request was cancelled — messaging stays for history only.';
      else if (st === 'disputed') hint = 'Dispute open — keep messages factual; ORVO admin is reviewing.';
      else if (st === 'funded' || st === 'in_progress') hint = 'Funds are held. Align on delivery here — mark delivered when the client can test.';
      else if (st === 'delivered') hint = 'Work marked delivered. Client can release payment or open a dispute.';
      else if (st === 'completed') hint = 'Project completed. You can still message for wrap-up notes.';
      return `<p class="empty" style="padding:20px">${esc(hint)}</p>`;
    })();
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    if (nearBottom) box.scrollTop = box.scrollHeight;
  }

  async function sendMsg(e) {
    e.preventDefault();
    const input = $('chat-input');
    const body = input.value.trim();
    if (!body || !chatRequestId) return;
    if (body.length > 2000) {
      toast('Message too long (max 2000 characters)', false);
      return;
    }
    if (!isAdmin()) {
      const { data: req } = await needDb().from('requests').select('id,user_id,assigned_builder_id,status').eq('id', chatRequestId).maybeSingle();
      if (!(await canChatOnRequest(req))) {
        toast('Message only after you quote or are assigned to this job.', false);
        return;
      }
      const check = validateChatMessage(body, req?.status || chatRequestStatus);
      if (!check.ok) { toast(check.msg, false); return; }
    }
    input.value = '';
    try {
      const { error } = await needDb().from('messages').insert({
        request_id: chatRequestId, sender_id: user.id, body, is_agent: false,
      });
      if (error) {
        if (/row-level security|permission denied/i.test(error.message)) {
          throw new Error('Cannot send message right now. Please try again.');
        }
        throw error;
      }
      await renderMsgs();
    } catch (err) {
      input.value = body;
      toastSchemaErr(err?.message || String(err));
    }
  }

  async function loadThreads() {
    const body = $('view-body');
    body.innerHTML = loadingSkeleton(4);
    const byId = new Map();
    try {
      const { data: own, error: ownErr } = await needDb().from('requests')
        .select('id,title,created_at,status').eq('user_id', user.id);
      if (ownErr) throw ownErr;
      (own || []).forEach(r => byId.set(r.id, { id: r.id, title: r.title, t: r.created_at, status: r.status }));

      if (isBuilder() || isAdmin()) {
        const { data: quotes, error: qErr } = await needDb().from('quotes')
          .select('request_id, requests(title,created_at,status)').eq('builder_id', user.id);
        if (qErr) throw qErr;
        (quotes || []).forEach(q => {
          if (!q.request_id || byId.has(q.request_id)) return;
          byId.set(q.request_id, {
            id: q.request_id,
            title: q.requests?.title,
            t: q.requests?.created_at,
            status: q.requests?.status,
          });
        });
        const { data: assigned, error: aErr } = await needDb().from('requests')
          .select('id,title,created_at,status').eq('assigned_builder_id', user.id);
        if (aErr) throw aErr;
        (assigned || []).forEach(r => {
          if (!byId.has(r.id)) byId.set(r.id, { id: r.id, title: r.title, t: r.created_at, status: r.status });
          else {
            const cur = byId.get(r.id);
            cur.status = r.status;
          }
        });
      }
    } catch (e) {
      body.innerHTML = `<p class="empty err">${esc(userFacingErr(e.message))}</p>${founderSchemaFixHtml('Messages need APPLY-ALL SQL.')}`;
      wireFounderSchemaFix(body);
      return;
    }

    const list = [...byId.values()].sort((a, b) => new Date(b.t || 0) - new Date(a.t || 0));
    const ids = list.map((r) => r.id);
    const previews = {};
    if (ids.length) {
      const { data: msgs } = await needDb().from('messages')
        .select('request_id,body,created_at,sender_id')
        .in('request_id', ids)
        .order('created_at', { ascending: false });
      (msgs || []).forEach((m) => {
        if (!previews[m.request_id]) previews[m.request_id] = m;
      });
    }
    const unreadRids = new Set();
    try {
      const { data: unread } = await needDb().from('notifications')
        .select('link_path').eq('user_id', user.id).is('read_at', null);
      (unread || []).forEach((n) => {
        const m = (n.link_path || '').match(/rid=([0-9a-f-]{36})/i);
        if (m) unreadRids.add(m[1]);
      });
    } catch (_) { /* inbox optional */ }
    if (!list.length) {
      const emptyCta = isBuilder() || isAdmin()
        ? '<button class="btn btn-primary" style="margin-top:16px;padding:12px 24px" data-goto="jobs">Browse jobs</button>'
        : '<button class="btn btn-primary" style="margin-top:16px;padding:12px 24px" data-action="post">Post a request</button>';
      body.innerHTML = `<p class="empty">No conversations yet.</p>
        <p class="empty" style="padding-top:8px;font-size:13px">${isBuilder() || isAdmin() ? 'Send a quote on an open job to start messaging on ORVO.' : 'Post a brief and accept a quote to unlock chat.'}</p>
        ${emptyCta}`;
      return;
    }
    const qText = (window.__orvoThreadsQuery || '').trim().toLowerCase();
    const filtered = qText
      ? list.filter((r) => {
        const prev = previews[r.id];
        const hay = ((r.title || '') + ' ' + (r.status || '') + ' ' + (prev?.body || '')).toLowerCase();
        return hay.includes(qText);
      })
      : list;
    const searchBar = `<input class="admin-search" id="threads-search" type="search" placeholder="Search conversations…" value="${esc(window.__orvoThreadsQuery || '')}" autocomplete="off"/>`;
    const emptyMatch = `<p class="empty">No conversations match that search.</p>
      <button type="button" class="btn btn-ghost" id="btn-clear-threads-search" style="margin-top:12px;padding:8px 12px;font-size:12px">Clear search</button>`;
    body.innerHTML = searchBar + (filtered.length ? filtered.map(r => {
      const prev = previews[r.id];
      const snippet = prev
        ? ((prev.sender_id === user.id ? 'You: ' : '') + prev.body).slice(0, 100) + (prev.body.length > 100 ? '…' : '')
        : 'No messages yet — open to chat';
      const t = prev?.created_at || r.t;
      const isUnread = unreadRids.has(r.id);
      const label = esc(r.title || 'Chat');
      return `
      <div class="card ${isUnread ? 'thread-unread' : ''}" data-click="${r.id}" tabindex="0" role="button" aria-label="Open chat: ${label}">
        <h3>${label}</h3>
        <p class="thread-snippet">${esc(snippet)}</p>
        <div class="thread-meta">
          ${isUnread ? '<span class="badge-new">New</span>' : ''}
          ${r.status ? `<span class="badge">${esc(statusLabel(r.status))}</span>` : ''}
          <span class="badge">${timeAgoHtml(t)}</span>
        </div>
      </div>`;
    }).join('') : emptyMatch);
    $('threads-search')?.addEventListener('input', (e) => {
      window.__orvoThreadsQuery = e.target.value || '';
      clearTimeout(window.__orvoThreadsSearchT);
      window.__orvoThreadsSearchT = setTimeout(loadThreads, 280);
    });
    $('btn-clear-threads-search')?.addEventListener('click', () => {
      window.__orvoThreadsQuery = '';
      loadThreads();
    });
    body.querySelectorAll('[data-click]').forEach(el => {
      wireActivate(el, () => go('chat', el.dataset.click));
    });
  }

  async function leaveReview(rid, builderId) {
    if (!builderId) { toast('No builder on this project', false); return; }
    openReviewSheet(rid, builderId);
  }

  let pendingReview = null; // { rid, builderId, rating }
  function openReviewSheet(rid, builderId) {
    pendingReview = { rid, builderId, rating: 0 };
    hideMsg('review-msg');
    if ($('review-body')) $('review-body').value = '';
    wireFieldCounter('review-body', 'review-count', 500);
    document.querySelectorAll('.star-btn').forEach((b) => b.classList.remove('on'));
    const el = $('review-modal');
    el?.classList.add('open');
    focusModal(el, '.star-btn[data-rating="1"]');
  }
  function closeReview() {
    const el = $('review-modal');
    el?.classList.remove('open');
    pendingReview = null;
    blurModal(el);
  }
  function setReviewRating(n) {
    if (!pendingReview) return;
    pendingReview.rating = n;
    document.querySelectorAll('.star-btn').forEach((b) => {
      const r = parseInt(b.dataset.rating, 10);
      b.classList.toggle('on', r <= n);
    });
  }
  async function submitReview() {
    if (!pendingReview) return;
    const { rid, builderId, rating } = pendingReview;
    if (!(rating >= 1 && rating <= 5)) {
      showMsg('review-msg', 'Choose a rating from 1 to 5 stars', false);
      return;
    }
    const body = ($('review-body')?.value || '').trim();
    const btn = $('review-confirm-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
    try {
      const row = {
        request_id: rid,
        client_id: user.id,
        builder_id: builderId,
        rating,
        body: body.length >= 20 ? body : null,
      };
      const { error } = await needDb().from('reviews').insert(row);
      if (error) throw error;
      closeReview();
      toast('Thanks for the review!', true);
      loadChat();
    } catch (e) {
      const msg = e?.message || String(e);
      showSchemaMsg('review-msg', msg, 'Reviews need APPLY-ALL SQL (010+).');
      if (!isDbSchemaErr(msg)) toast(userFacingErr(msg), false);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Submit review'; }
    }
  }

  let confirmResolver = null;
  function askConfirm({ title, sub, okLabel, withNote }) {
    return new Promise((resolve) => {
      confirmResolver = resolve;
      hideMsg('confirm-msg');
      if ($('confirm-title')) $('confirm-title').textContent = title || 'Confirm';
      if ($('confirm-sub')) $('confirm-sub').textContent = sub || '';
      if ($('confirm-ok-btn')) $('confirm-ok-btn').textContent = okLabel || 'Confirm';
      const wrap = $('confirm-note-wrap');
      if (wrap) wrap.classList.toggle('hidden', !withNote);
      if ($('confirm-note')) $('confirm-note').value = '';
      if (withNote) wireFieldCounter('confirm-note', 'confirm-note-count', 500);
      const el = $('confirm-modal');
      el?.classList.add('open');
      focusModal(el, withNote ? '#confirm-note' : '#confirm-ok-btn');
    });
  }
  function closeConfirm(ok) {
    const note = ($('confirm-note')?.value || '').trim();
    const el = $('confirm-modal');
    el?.classList.remove('open');
    blurModal(el);
    const r = confirmResolver;
    confirmResolver = null;
    if (r) r(ok ? { ok: true, note } : { ok: false });
  }

  async function markDelivered(rid) {
    const url = ($('deliver-url')?.value || '').trim();
    const ans = await askConfirm({
      title: 'Mark as delivered?',
      sub: 'The client will review your delivery and can release payment when funds are held.',
      okLabel: 'Mark delivered',
    });
    if (!ans.ok) return;
    try {
      const { error } = await needDb().from('requests').update({ status: 'delivered' }).eq('id', rid);
      if (error) throw error;
      try {
        await needDb().from('deliveries').insert({
          request_id: rid,
          builder_id: user.id,
          summary: url ? ('Demo: ' + url) : 'Marked delivered for client review',
          demo_url: url || null,
        });
      } catch (_) { /* optional */ }
      if (url) {
        await needDb().from('messages').insert({
          request_id: rid, sender_id: user.id,
          body: 'Delivery ready for review: ' + url,
          is_agent: false,
        });
      }
      toast('Marked delivered — waiting for client release', true);
      loadChat();
    } catch (e) { toastSchemaErr(e?.message || String(e)); }
  }

  let pendingDisputeRid = null;

  function openDisputeSheet(rid) {
    pendingDisputeRid = rid;
    hideMsg('dispute-msg');
    if ($('dispute-details')) $('dispute-details').value = '';
    wireFieldCounter('dispute-details', 'dispute-count', 2000);
    const el = $('dispute-modal');
    el?.classList.add('open');
    focusModal(el, '#dispute-details');
  }

  function closeDispute() {
    const el = $('dispute-modal');
    el?.classList.remove('open');
    pendingDisputeRid = null;
    blurModal(el);
  }

  async function submitDispute() {
    const rid = pendingDisputeRid;
    if (!rid) return;
    const details = ($('dispute-details')?.value || '').trim();
    if (details.length < 20) {
      showMsg('dispute-msg', 'Please write at least 20 characters', false);
      return;
    }
    const btn = $('dispute-confirm-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
    try {
      const { data: req, error: re } = await needDb().from('requests').select('*').eq('id', rid).single();
      if (re) throw re;
      if (req.user_id !== user.id && !isAdmin()) throw new Error('Only the client can open a dispute');
      const against = req.assigned_builder_id;
      if (!against) throw new Error('No assigned builder');
      const { data: pay } = await needDb().from('payments').select('id').eq('request_id', rid).maybeSingle();
      const { error: de } = await needDb().from('disputes').insert({
        request_id: rid,
        payment_id: pay?.id || null,
        opened_by: user.id,
        against_user_id: against,
        reason: 'other',
        details,
        status: 'open',
      });
      if (de) throw de;
      await needDb().from('requests').update({ status: 'disputed' }).eq('id', rid);
      closeDispute();
      toast('Dispute opened — release frozen', true);
      loadChat();
    } catch (e) {
      const msg = e?.message || String(e);
      showSchemaMsg('dispute-msg', msg, 'Disputes need APPLY-ALL SQL (009+).');
      if (!isDbSchemaErr(msg)) toast(userFacingErr(msg), false);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Open dispute'; }
    }
  }

  async function openDispute(rid) {
    openDisputeSheet(rid);
  }

  async function tryReleaseToBuilder(requestId) {
    const base = window.SUPABASE_URL;
    if (!base || !db) return { ok: false, reason: 'not_configured' };
    try {
      const { data: { session } } = await needDb().auth.getSession();
      if (!session?.access_token) return { ok: false, reason: 'auth' };
      const res = await fetch(`${base}/functions/v1/release-to-builder`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: window.SUPABASE_ANON_KEY || '',
        },
        body: JSON.stringify({ request_id: requestId }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 501 || body.error === 'not_configured') {
        return { ok: false, reason: 'not_configured', code: body.error, message: body.message };
      }
      if (!res.ok) {
        return {
          ok: false,
          reason: body.error || 'release_failed',
          code: body.error,
          message: edgeErrMessage(body, 'Release failed'),
        };
      }
      return { ok: true, transferId: body.transfer_id || null };
    } catch {
      return { ok: false, reason: 'network' };
    }
  }

  async function releasePayment(rid) {
    const ans = await askConfirm({
      title: 'Accept delivery & complete?',
      sub: 'This completes the project once funds were held. Pending/unfunded jobs cannot release.',
      okLabel: 'Complete project',
    });
    if (!ans.ok) return;
    try {
      const { data: req } = await needDb().from('requests').select('status').eq('id', rid).single();
      if (req?.status === 'disputed') throw new Error('Dispute open — release is frozen');
      const { data: pay, error: pe } = await needDb().from('payments').select('*').eq('request_id', rid).maybeSingle();
      if (pe) throw pe;
      if (!pay) throw new Error('No payment record for this project.');
      if (pay.status === 'pending') {
        throw new Error('Project is not funded yet — checkout must complete before release.');
      }
      if (pay.status !== 'held' && !isAdmin()) {
        throw new Error('Release requires held funds (Stripe Checkout).');
      }

      if (pay.status === 'held') {
        const released = await tryReleaseToBuilder(rid);
        if (released.ok) {
          track('payment_released', { request_id: rid, via: 'edge' });
          toast('Payment released to builder', true);
          loadChat();
          return;
        }
        if (released.reason !== 'not_configured') {
          toast(releaseUnavailableMessage(released), false);
          loadChat();
          return;
        }
        // 501 / not live: mark request completed; payout settlement stays server-side later
        const { error: e1 } = await needDb().from('requests').update({ status: 'completed' }).eq('id', rid);
        if (e1) throw e1;
        if (isAdmin()) {
          const { error: e2 } = await needDb().from('payments')
            .update({ status: 'released', released_at: new Date().toISOString() })
            .eq('request_id', rid);
          if (e2) throw e2;
          toast('Payment marked released (admin)', true);
        } else {
          toast('Delivery accepted — payout settles when release-to-builder + Connect are deployed', true);
        }
        track('payment_release_pending', { request_id: rid, reason: released.reason });
        loadChat();
        return;
      }

      const { error: e1 } = await needDb().from('requests').update({ status: 'completed' }).eq('id', rid);
      if (e1) throw e1;
      toast('Project completed', true);
      loadChat();
    } catch (e) { toastSchemaErr(e?.message || String(e)); }
  }

  async function acceptQuote(qid, rid) {
    const { data: q } = await needDb().from('quotes').select('*').eq('id', qid).single();
    if (!q) return;
    const fee = FEE() > 0 ? Math.round(q.amount_cents * FEE() / 100) : 0;
    let builderName = '';
    let requestTitle = '';
    try {
      const { data: bp } = await needDb().from('profiles').select('full_name').eq('id', q.builder_id).maybeSingle();
      builderName = bp?.full_name || '';
      const { data: req } = await needDb().from('requests').select('title').eq('id', rid).maybeSingle();
      requestTitle = req?.title || '';
    } catch (_) { /* ignore */ }
    openPaySheet({
      qid,
      rid,
      amountCents: q.amount_cents,
      fee,
      builderNet: q.amount_cents - fee,
      builderName,
      etaDays: q.delivery_days || null,
      requestTitle,
    });
  }

  async function confirmAcceptPay() {
    if (!pendingPay || !user) return;
    const { qid, rid, amountCents, fee, builderNet } = pendingPay;
    const btn = $('pay-confirm-btn');
    btn.disabled = true;
    btn.textContent = 'Accepting…';
    try {
      const { data: q, error: qe } = await needDb().from('quotes').select('*').eq('id', qid).single();
      if (qe) throw qe;
      if (!q) throw new Error('Quote not found');
      const { error: e1 } = await needDb().from('quotes').update({ status: 'accepted' }).eq('id', qid);
      if (e1) throw e1;
      // Decline sibling pending quotes
      await needDb().from('quotes')
        .update({ status: 'rejected' })
        .eq('request_id', rid)
        .eq('status', 'pending')
        .neq('id', qid);
      const { error: e2 } = await needDb().from('requests').update({
        status: 'awaiting_payment',
        assigned_builder_id: q.builder_id,
      }).eq('id', rid);
      if (e2) throw e2;
      // Client may only insert pending — webhook/service role sets held/funded later
      // Reuse existing payment row if accept was retried
      const { data: existingPay } = await needDb().from('payments').select('id,quote_id').eq('request_id', rid).maybeSingle();
      if (!existingPay) {
        const { error: e3 } = await needDb().from('payments').insert({
          user_id: user.id, request_id: rid, quote_id: qid,
          amount_cents: amountCents, platform_fee_cents: fee,
          builder_payout_cents: builderNet,
          status: 'pending',
        });
        if (e3) throw e3;
      }
      // Ignore STRIPE_PAYMENT_LINK — try Checkout Edge Function; 501 → awaiting state
      btn.textContent = 'Starting checkout…';
      const checkout = await tryCreateCheckoutSession({ requestId: rid, quoteId: qid });
      if (checkout.ok && checkout.url) {
        toast('Redirecting to secure checkout…', true);
        pendingPay = null;
        window.location.href = checkout.url;
        return;
      }
      const note = checkoutUnavailableMessage(checkout, 'Checkout unavailable — job is awaiting payment');
      const { data: payAfter } = await needDb().from('payments').select('status').eq('request_id', rid).maybeSingle();
      showPayAwaitingState({
        extraNote: note,
        rid,
        qid,
        checkoutOpen: payAfter?.status === 'checkout_open',
      });
      toast('Quote accepted — awaiting payment (not funded yet)', true);
      track('quote_accepted', { request_id: rid, quote_id: qid, checkout: checkout.reason || 'redirect' });
      pendingPay = null;
      loadChat();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Accept quote — try checkout';
      const msg = e?.message || String(e);
      showSchemaMsg('pay-msg', msg, 'Payments need APPLY-ALL SQL (002+).');
      if (!isDbSchemaErr(msg)) toast(userFacingErr(msg), false);
    }
  }

  async function startConnectOnboarding(btnEl) {
    const btn = btnEl || $('btn-connect-payouts');
    if (!btn) return;
    const defaultLabel = btn.dataset.defaultLabel || btn.textContent || 'Set up payouts';
    btn.disabled = true;
    btn.textContent = 'Opening…';
    const r = await tryCreateConnectAccount();
    if (r.ok && r.url) {
      window.location.href = r.url;
      return;
    }
    btn.disabled = false;
    btn.textContent = defaultLabel;
    toast(connectUnavailableMessage(r), false);
  }

  async function tryCreateConnectAccount() {
    const base = window.SUPABASE_URL;
    if (!base || !db) return { ok: false, reason: 'not_configured' };
    try {
      const { data: { session } } = await needDb().auth.getSession();
      if (!session?.access_token) return { ok: false, reason: 'auth' };
      const res = await fetch(`${base}/functions/v1/create-connect-account`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: window.SUPABASE_ANON_KEY || '',
        },
        body: '{}',
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 501 || body.error === 'not_configured') {
        return { ok: false, reason: 'not_configured', message: body.message };
      }
      if (!res.ok || !body.url) {
        return {
          ok: false,
          reason: body.error || 'connect_failed',
          message: edgeErrMessage(body, 'Connect onboarding failed'),
        };
      }
      return { ok: true, url: body.url };
    } catch {
      return { ok: false, reason: 'network' };
    }
  }

  async function probeSchemaHealth() {
    const checks = [];
    const probe = async (label, fn) => {
      try {
        const r = await fn();
        if (r?.error) throw r.error;
        checks.push({ label, ok: true });
      } catch (e) {
        checks.push({ label, ok: false, hint: userFacingErr(e.message || String(e)) });
      }
    };
    await probe('Core profiles (001)', () => needDb().from('profiles').select('id', { head: true, count: 'exact' }));
    await probe('Requests (001)', () => needDb().from('requests').select('id', { head: true, count: 'exact' }));
    await probe('Quotes (001)', () => needDb().from('quotes').select('id', { head: true, count: 'exact' }));
    await probe('Payments (001)', () => needDb().from('payments').select('id', { head: true, count: 'exact' }));
    await probe('Messages (001)', () => needDb().from('messages').select('id', { head: true, count: 'exact' }));
    await probe('Builder apps (001)', () => needDb().from('builder_applications').select('id', { head: true, count: 'exact' }));
    await probe('Notifications (012)', () => needDb().from('notifications').select('id', { head: true, count: 'exact' }));
    await probe('Invites (005)', () => needDb().from('request_invites').select('id', { head: true, count: 'exact' }));
    await probe('Disputes (003)', () => needDb().from('disputes').select('id', { head: true, count: 'exact' }));
    await probe('Reviews (003)', () => needDb().from('reviews').select('id', { head: true, count: 'exact' }));
    return checks;
  }

  async function probeEdgeHealth() {
    const base = window.SUPABASE_URL;
    const key = window.SUPABASE_ANON_KEY || '';
    const checks = [];
    const ping = async (label, fnPath, body = '{}') => {
      if (!base) {
        checks.push({ label, ok: false, hint: 'no supabase url' });
        return;
      }
      try {
        const res = await fetch(`${base}/functions/v1/${fnPath}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', apikey: key },
          body,
        });
        if (res.status === 404) {
          checks.push({ label, ok: false, hint: 'not deployed' });
          return;
        }
        if ([401, 400, 501, 405].includes(res.status)) {
          const hint = res.status === 501 ? 'deployed · secrets pending' : 'deployed';
          checks.push({ label, ok: true, hint });
          return;
        }
        checks.push({ label, ok: true, hint: `HTTP ${res.status}` });
      } catch {
        checks.push({ label, ok: false, hint: 'unreachable' });
      }
    };
    await ping('Edge checkout', 'create-checkout-session');
    await ping('Edge webhook', 'stripe-webhook');
    await ping('Edge connect', 'create-connect-account');
    await ping('Edge release', 'release-to-builder');
    return checks;
  }

  function renderHealthCheckRows(checks) {
    return (checks || []).map((c) => {
      const status = c.ok
        ? (c.hint
          ? `<span style="color:var(--green);font-size:11px">${esc(c.hint)}</span>`
          : '<span style="color:var(--green)">OK</span>')
        : `<span style="color:var(--red);font-size:11px">${esc((c.hint || '').slice(0, 48))}</span>`;
      return `<div style="display:flex;justify-content:space-between;gap:8px;margin:4px 0">
        <span>${c.ok ? '✓' : '✗'} ${esc(c.label)}</span>
        ${status}
      </div>`;
    }).join('');
  }

  async function refreshFounderSetupBanner() {
    const el = $('founder-setup-banner');
    if (!el || !user) {
      el?.classList.add('hidden');
      return;
    }
    if (!isConfiguredFounder() && !isAdmin()) {
      el.classList.add('hidden');
      return;
    }
    const adminOk = isAdmin();
    let schemaChecks = [];
    let edgeChecks = [];
    try {
      [schemaChecks, edgeChecks] = await Promise.all([probeSchemaHealth(), probeEdgeHealth()]);
    } catch { /* optional */ }
    const schemaOk = schemaChecks.length > 0 && schemaChecks.every((c) => c.ok);
    const edgeOk = edgeChecks.length > 0 && edgeChecks.every((c) => c.ok);
    const checkoutLive = !!window.ORVO_CHECKOUT_LIVE;

    if (schemaOk && adminOk && edgeOk && checkoutLive) {
      el.classList.add('hidden');
      return;
    }

    if (!schemaOk || !adminOk) {
      const failN = schemaChecks.filter((c) => !c.ok).length;
      const steps = [
        !schemaOk ? `Run APPLY-ALL SQL${failN ? ` (${failN} table${failN === 1 ? '' : 's'} missing)` : ''}` : null,
        !adminOk ? 'Copy is_admin SQL in Profile → run after signup' : null,
      ].filter(Boolean);
      el.classList.remove('hidden');
      el.innerHTML = `
        <div class="founder-banner-inner">
          <div>
            <b>Founder setup — database</b>
            <span class="founder-banner-steps">${esc(steps.join(' · '))}</span>
          </div>
          <div class="founder-banner-actions">
            <button type="button" class="btn btn-primary" id="btn-banner-copy-sql">Copy APPLY-ALL SQL</button>
            <button type="button" class="btn btn-ghost" id="btn-banner-founder-setup">Copy setup steps</button>
            <button type="button" class="btn btn-ghost" id="btn-banner-profile">Setup health</button>
            <a href="founder-checklist.html" target="_blank" rel="noopener" class="btn btn-ghost">Checklist</a>
          </div>
        </div>`;
      $('btn-banner-copy-sql')?.addEventListener('click', () => copyApplyAllSql());
      $('btn-banner-founder-setup')?.addEventListener('click', () => copyFounderSetupCmd());
      $('btn-banner-profile')?.addEventListener('click', () => go('profile'));
      return;
    }

    const stripeSteps = [
      !edgeOk ? 'Deploy Edge: bash scripts/deploy-stripe.sh' : null,
      edgeOk && !checkoutLive ? 'Stripe secrets + smoke test → ORVO_CHECKOUT_LIVE=true' : null,
    ].filter(Boolean);
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="founder-banner-inner">
        <div>
          <b>Founder setup — Stripe</b>
          <span class="founder-banner-steps">${esc(stripeSteps.join(' · '))}</span>
        </div>
        <div class="founder-banner-actions">
          <button type="button" class="btn btn-primary" id="btn-banner-deploy-cmd">Copy deploy command</button>
          <button type="button" class="btn btn-ghost" id="btn-banner-secrets-cmd">Copy secrets template</button>
          <button type="button" class="btn btn-ghost" id="btn-banner-verify-cmd">Copy verify-edge</button>
          <button type="button" class="btn btn-ghost" id="btn-banner-founder-setup-stripe">Copy setup steps</button>
          <button type="button" class="btn btn-ghost" id="btn-banner-profile">Setup health</button>
          <a href="founder-checklist.html#stripe" target="_blank" rel="noopener" class="btn btn-ghost">Stripe checklist</a>
          <a href="https://github.com/danielmenparan-lang/orvo/blob/cursor/orvo-local-site-3bd5/docs/payments/STRIPE-SMOKE-TEST.md" target="_blank" rel="noopener" class="btn btn-ghost">Smoke test</a>
        </div>
      </div>`;
    $('btn-banner-deploy-cmd')?.addEventListener('click', () => copyDeployCmd());
    $('btn-banner-secrets-cmd')?.addEventListener('click', () => copySecretsTemplateCmd());
    $('btn-banner-verify-cmd')?.addEventListener('click', () => copyVerifyCmd());
    $('btn-banner-founder-setup-stripe')?.addEventListener('click', () => copyFounderSetupCmd());
    $('btn-banner-profile')?.addEventListener('click', () => go('profile'));
  }

  function refreshBuilderPayoutBanner() {
    const el = $('builder-payout-banner');
    if (!el || !user || !isBuilder()) {
      el?.classList.add('hidden');
      return;
    }
    const connectId = profile?.stripe_connect_account_id || '';
    if (connectId) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="founder-banner-inner">
        <div>
          <b>Payout setup</b>
          <span class="founder-banner-steps">Connect Express required before ORVO can transfer held funds to you</span>
        </div>
        <div class="founder-banner-actions">
          <button type="button" class="btn btn-primary" id="btn-builder-payout-connect" data-default-label="Set up payouts">Set up payouts</button>
          <button type="button" class="btn btn-ghost" id="btn-builder-payout-profile">Profile</button>
        </div>
      </div>`;
    $('btn-builder-payout-connect')?.addEventListener('click', (e) => startConnectOnboarding(e.currentTarget));
    $('btn-builder-payout-profile')?.addEventListener('click', () => go('profile'));
  }

  function renderHealthPanel(schemaChecks, edgeChecks, { adminOk, configuredFounder }) {
    const schemaOkN = (schemaChecks || []).filter((c) => c.ok).length;
    const schemaTotal = (schemaChecks || []).length;
    const edgeOkN = (edgeChecks || []).filter((c) => c.ok).length;
    const edgeTotal = (edgeChecks || []).length;
    const summary = `<div style="font-size:12px;color:var(--muted);margin:6px 0 8px">Schema ${schemaOkN}/${schemaTotal} · Edge ${edgeOkN}/${edgeTotal}</div>`;
    const rows = renderHealthCheckRows(schemaChecks);
    const edgeRows = (edgeChecks || []).length
      ? `<hr style="border:none;border-top:1px solid var(--border);margin:10px 0"/>
        <div style="font-size:11px;color:var(--muted);margin-bottom:6px">Edge functions (401/501 = deployed)</div>
        ${renderHealthCheckRows(edgeChecks)}`
      : '';
    const stripeLine = window.ORVO_CHECKOUT_LIVE
      ? '<span style="color:var(--green)">ORVO_CHECKOUT_LIVE = true</span>'
      : '<span style="color:var(--muted)">Checkout off — Edge handlers ready; set secrets + deploy + smoke test</span>';
    const adminLine = adminOk
      ? '<span style="color:var(--green)">is_admin = yes</span>'
      : (configuredFounder
        ? '<span style="color:var(--o)">Founder email — set is_admin in Supabase SQL</span>'
        : '<span style="color:var(--muted)">Not admin</span>');
    const allSchemaOk = (schemaChecks || []).every((c) => c.ok);
    const edgeMissing = (edgeChecks || []).some((c) => !c.ok);
    const fixBlock = !allSchemaOk
      ? `<p style="color:var(--o);font-size:12px;margin:8px 0 0">Missing tables? Supabase SQL Editor → paste <a href="${APPLY_ALL_SQL_URL}" target="_blank" rel="noopener" style="color:var(--o)">APPLY-ALL-001-020.sql</a> → Run once.</p>`
      : '';
    const edgeFixBlock = allSchemaOk && edgeMissing
      ? `<p style="color:var(--o);font-size:12px;margin:8px 0 0">Edge not deployed? Run <code>scripts/deploy-stripe.sh</code> · <a href="https://github.com/danielmenparan-lang/orvo/blob/cursor/orvo-local-site-3bd5/docs/payments/STRIPE-DEPLOY-CHECKLIST.md" target="_blank" rel="noopener" style="color:var(--o)">Stripe checklist →</a></p>`
      : '';
    const infraReady = allSchemaOk && !edgeMissing && adminOk;
    const readyBlock = infraReady && !window.ORVO_CHECKOUT_LIVE
      ? `<p style="color:var(--green);font-size:12px;margin:8px 0 0">Infra ready — run <a href="https://github.com/danielmenparan-lang/orvo/blob/cursor/orvo-local-site-3bd5/docs/payments/STRIPE-SMOKE-TEST.md" target="_blank" rel="noopener" style="color:var(--green)">smoke test</a> then flip ORVO_CHECKOUT_LIVE</p>`
      : (infraReady && window.ORVO_CHECKOUT_LIVE
        ? '<p style="color:var(--green);font-size:12px;margin:8px 0 0">All green — checkout live</p>'
        : '');
    return `
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:16px;font-size:13px;line-height:1.6">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px">
          <b>Setup health</b>
          <button type="button" class="btn btn-ghost" id="btn-recheck-health" style="padding:4px 10px;font-size:11px">Re-check</button>
        </div>
        <span style="font-size:11px;color:var(--muted)">(live probes)</span>
        ${summary}
        ${rows}
        ${edgeRows}
        ${fixBlock}
        ${edgeFixBlock}
        ${readyBlock}
        <hr style="border:none;border-top:1px solid var(--border);margin:10px 0"/>
        <div>${adminLine}</div>
        <div>${stripeLine}</div>
        <div style="margin-top:10px">
          <button type="button" class="btn btn-ghost" id="btn-copy-verify-cmd" style="padding:8px 12px;font-size:12px;margin-right:8px">Copy verify-edge</button>
          <button type="button" class="btn btn-ghost" id="btn-copy-deploy-cmd" style="padding:8px 12px;font-size:12px;margin-right:8px">Copy deploy cmd</button>
          <button type="button" class="btn btn-ghost" id="btn-copy-secrets-cmd" style="padding:8px 12px;font-size:12px;margin-right:8px">Copy secrets template</button>
          <button type="button" class="btn btn-primary" id="btn-copy-apply-all" style="padding:8px 12px;font-size:12px;margin-right:8px">Copy APPLY-ALL SQL</button>
          <button type="button" class="btn btn-ghost" id="btn-copy-admin-sql" style="padding:8px 12px;font-size:12px;margin-right:8px">Copy is_admin SQL</button>
          <a href="founder-checklist.html" target="_blank" rel="noopener" style="color:var(--o)">Founder checklist →</a>
          · <a href="https://github.com/danielmenparan-lang/orvo/blob/cursor/orvo-local-site-3bd5/docs/payments/STRIPE-SMOKE-TEST.md" target="_blank" rel="noopener" style="color:var(--o)">Smoke test →</a>
        </div>
      </div>`;
  }

  async function loadProfileView() {
    $('view-body').innerHTML = loadingSkeleton(3);
    const logged = (user?.email || '').toLowerCase().trim();
    const adminOk = isAdmin();
    const configuredFounder = isConfiguredFounder();
    const showHealth = adminOk || configuredFounder;
    let healthHtml = '';
    if (showHealth) {
      const [schemaChecks, edgeChecks] = await Promise.all([
        probeSchemaHealth(),
        probeEdgeHealth(),
      ]);
      healthHtml = renderHealthPanel(schemaChecks, edgeChecks, { adminOk, configuredFounder });
    }
    const connectId = profile?.stripe_connect_account_id || '';
    const bs = profile?.builder_status || 'none';
    const role = adminOk ? 'ORVO Admin' : isBuilder() ? 'Approved builder' : isPending() ? 'Application pending' : 'Client';
    const opsBlock = showHealth ? `
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:16px;font-size:13px;line-height:1.8">
        <b>${adminOk ? 'Admin' : 'Founder'} ops</b><br>
        ${adminOk ? `Logged in: <code>${esc(logged)}</code><br>Builder status: <b>${esc(bs)}</b><br>DB is_admin: <b>yes</b><br>` : `Signed in as founder · run is_admin SQL after signup<br>`}
        <a href="https://github.com/danielmenparan-lang/orvo/blob/cursor/orvo-local-site-3bd5/docs/payments/STRIPE-DEPLOY-CHECKLIST.md" target="_blank" rel="noopener" style="color:var(--o)">Stripe deploy checklist →</a><br>
        <span style="font-size:12px;color:var(--muted)">CLI: <code>bash scripts/founder-setup.sh</code> · <code>bash scripts/deploy-stripe.sh</code></span>
        <div style="margin-top:8px">
          <button type="button" class="btn btn-ghost" id="btn-copy-founder-setup" style="padding:6px 10px;font-size:11px;margin-right:6px">Copy founder-setup</button>
          <button type="button" class="btn btn-ghost" id="btn-copy-deploy-inline" style="padding:6px 10px;font-size:11px">Copy deploy cmd</button>
        </div>
      </div>` : '';
    const connectBlock = isBuilder() ? `
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:16px;font-size:13px;line-height:1.6">
        <b>Payouts (Stripe Connect)</b><br>
        ${connectId
          ? `Connected account on file (<code>${esc(connectId.slice(0, 12))}…</code>).`
          : 'Connect Express is required before ORVO can transfer held funds to you.'}
        <button class="btn btn-primary" id="btn-connect-payouts" data-default-label="${connectId ? 'Update payout onboarding' : 'Set up payouts'}" style="width:100%;margin-top:12px;padding:12px">
          ${connectId ? 'Update payout onboarding' : 'Set up payouts'}
        </button>
        <p style="font-size:12px;color:var(--muted);margin-top:8px">Connect Express onboarding — required before release transfers. Needs Stripe secrets deployed.</p>
      </div>` : '';
    $('view-body').innerHTML = `
      <p><b>${esc(profile?.full_name)}</b></p>
      <p style="color:var(--gray);margin:4px 0 16px">${esc(logged)} · ${role}</p>
      ${healthHtml}
      ${opsBlock}
      ${connectBlock}
      ${adminOk ? '<button class="btn btn-primary" style="width:100%;margin-bottom:10px;padding:12px" data-goto="admin">Review builder applications</button>' : ''}
      ${isBuilder() ? '<button class="btn btn-primary" style="width:100%;margin-bottom:10px;padding:12px" data-goto="jobs">Browse jobs</button>' : ''}
      ${!isBuilder() && !isPending() && !adminOk ? '<button class="btn btn-ghost" style="width:100%;margin-bottom:10px;padding:12px" data-goto="apply">Apply as a builder</button>' : ''}
      <button class="btn btn-ghost" id="logout-btn" style="width:100%;padding:12px">Sign out</button>`;
    $('logout-btn').addEventListener('click', doLogout);
    $('btn-recheck-health')?.addEventListener('click', () => loadProfileView());
    $('btn-copy-deploy-cmd')?.addEventListener('click', () => copyDeployCmd());
    $('btn-copy-verify-cmd')?.addEventListener('click', () => copyVerifyCmd());
    $('btn-copy-secrets-cmd')?.addEventListener('click', () => copySecretsTemplateCmd());
    $('btn-copy-apply-all')?.addEventListener('click', () => copyApplyAllSql());
    $('btn-copy-admin-sql')?.addEventListener('click', async () => {
      const safeEmail = logged.replace(/'/g, "''");
      const sql = `update public.profiles set is_admin = true where email = '${safeEmail}';`;
      try {
        await navigator.clipboard.writeText(sql);
        toast('Copied is_admin SQL — run in Supabase after signup', true);
      } catch {
        toast(sql, true);
      }
    });
    $('btn-copy-founder-setup')?.addEventListener('click', () => copyFounderSetupCmd());
    $('btn-copy-deploy-inline')?.addEventListener('click', () => copyDeployCmd());
    $('btn-connect-payouts')?.addEventListener('click', (e) => startConnectOnboarding(e.currentTarget));
    if (showHealth) refreshFounderSetupBanner();
    refreshBuilderPayoutBanner();
  }

  function ensureDashOpen() {
    if ($('dashboard').classList.contains('open')) return;
    const dash = $('dashboard');
    dash.classList.add('open');
    dash.setAttribute('role', 'dialog');
    dash.setAttribute('aria-modal', 'true');
    document.body.style.overflow = 'hidden';
    renderSidebar();
    focusDashOpen();
  }

  // ── EVENT ROUTER ──
  document.body.addEventListener('click', (e) => {
    const goto = e.target.closest('[data-goto]');
    if (goto) {
      e.preventDefault();
      if (!user) { openAuth('login'); return; }
      ensureDashOpen();
      go(goto.dataset.goto);
      return;
    }
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const a = t.dataset.action;
    if (a === 'login') { e.preventDefault(); openAuth('login'); }
    else if (a === 'signup') {
      e.preventDefault();
      postSignupIntent = $('signup-intent')?.value || 'client';
      openAuth('signup');
    }
    else if (a === 'close-auth') closeAuth();
    else if (a === 'close-reset') closePasswordReset();
    else if (a === 'tab-login') setAuthTab('login');
    else if (a === 'tab-signup') setAuthTab('signup');
    else if (a === 'home') {
      e.preventDefault();
      closeDash(); closeAuth(); closePost(); closeQuote(); closePay(); closeDispute(); closeReview(); closeConfirm(false); closePasswordReset();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    else if (a === 'dashboard') {
      e.preventDefault();
      if (user) {
        if ($('dashboard').classList.contains('open')) return;
        openDash();
      } else openAuth('login');
    }
    else if (a === 'post') { e.preventDefault(); openPost(); }
    else if (a === 'client-start') {
      e.preventDefault();
      if (user) openPost();
      else {
        postSignupIntent = 'client';
        pendingClientPost = true;
        openAuth('signup'); setAuthTab('signup');
        if ($('signup-intent')) $('signup-intent').value = 'client';
      }
    }
    else if (a === 'builder-start' || a === 'builder') {
      e.preventDefault();
      if (user) { openDash(); go('apply'); }
      else {
        postSignupIntent = 'builder';
        openAuth('signup'); setAuthTab('signup');
        if ($('signup-intent')) $('signup-intent').value = 'builder';
      }
    }
    else if (a === 'jobs') { e.preventDefault(); user ? (openDash('jobs'), go('jobs')) : openAuth('login'); }
    else if (a === 'invites') { e.preventDefault(); user ? (openDash('invites'), go('invites')) : openAuth('login'); }
    else if (a === 'notifications') { e.preventDefault(); user ? (openDash('notifications'), go('notifications')) : openAuth('login'); }
    else if (a === 'admin') { e.preventDefault(); user ? (openDash('admin'), go('admin')) : openAuth('login'); }
    else if (a === 'close-dash') { e.preventDefault(); closeDashFromButton(); }
    else if (a === 'close-quote') closeQuote();
    else if (a === 'close-post') closePost();
    else if (a === 'close-pay') closePay();
    else if (a === 'close-dispute') closeDispute();
    else if (a === 'close-review') closeReview();
    else if (a === 'close-confirm') closeConfirm(false);
  });

  document.querySelectorAll('.modal-bg').forEach((bg) => {
    bg.addEventListener('click', (e) => {
      if (e.target !== bg) return;
      const id = bg.id;
      if (id === 'auth-modal') closeAuth();
      else if (id === 'reset-modal') closePasswordReset();
      else if (id === 'post-modal') closePost();
      else if (id === 'quote-modal') closeQuote();
      else if (id === 'pay-modal') closePay();
      else if (id === 'dispute-modal') closeDispute();
      else if (id === 'review-modal') closeReview();
      else if (id === 'confirm-modal') closeConfirm(false);
    });
  });

  $('login-btn').addEventListener('click', doLogin);
  $('forgot-btn')?.addEventListener('click', doForgotPassword);
  $('signup-btn').addEventListener('click', doSignup);
  $('quote-btn').addEventListener('click', doQuote);
  $('post-btn').addEventListener('click', doPost);
  $('pay-confirm-btn').addEventListener('click', confirmAcceptPay);
  $('pay-resume-btn')?.addEventListener('click', resumeCheckoutFromSheet);
  $('dispute-confirm-btn')?.addEventListener('click', submitDispute);
  $('review-confirm-btn')?.addEventListener('click', submitReview);
  $('confirm-ok-btn')?.addEventListener('click', () => closeConfirm(true));
  document.querySelectorAll('.star-btn').forEach((b) => {
    b.addEventListener('click', () => setReviewRating(parseInt(b.dataset.rating, 10)));
  });

  document.querySelectorAll('.budget-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const budget = btn.getAttribute('data-budget') || '';
      if ($('post-budget')) $('post-budget').value = budget === 'Custom / TBD' ? '' : budget;
      document.querySelectorAll('.budget-chip').forEach((x) => x.classList.toggle('on', x === btn));
    });
  });
  document.querySelectorAll('.goal-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const goal = btn.getAttribute('data-goal') || '';
      const ta = $('post-desc');
      if (!ta || !goal) return;
      const cur = ta.value.trim();
      ta.value = cur ? (cur.endsWith(goal) ? cur : cur + '\n\nGoal: ' + goal) : ('Goal: ' + goal + '\n\n');
      ta.focus();
      document.querySelectorAll('.goal-chip').forEach((x) => x.classList.toggle('on', x === btn));
    });
  });
  document.querySelectorAll('.channel-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ch = btn.getAttribute('data-channel') || '';
      if ($('post-cat') && ch) $('post-cat').value = ch;
      document.querySelectorAll('.channel-chip').forEach((x) => x.classList.toggle('on', x === btn));
    });
  });
  // Default channel highlight
  document.querySelector('.channel-chip[data-channel="WhatsApp / Chat"]')?.classList.add('on');

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      if (document.querySelector('.modal-bg.open')) trapModalTab(e);
      else trapDashTab(e);
      return;
    }
    if (e.key !== 'Escape') return;
    if ($('confirm-modal')?.classList.contains('open')) closeConfirm(false);
    else if ($('reset-modal')?.classList.contains('open')) closePasswordReset();
    else if ($('review-modal')?.classList.contains('open')) closeReview();
    else if ($('dispute-modal')?.classList.contains('open')) closeDispute();
    else if ($('pay-modal').classList.contains('open')) closePay();
    else if ($('quote-modal').classList.contains('open')) closeQuote();
    else if ($('post-modal').classList.contains('open')) closePost();
    else if ($('auth-modal').classList.contains('open')) closeAuth();
    else if ($('dashboard').classList.contains('open')) closeDashFromButton();
  });

  window.addEventListener('popstate', () => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const hasDashParams = params.get('view') || params.get('rid') || (params.get('status') && isAdmin());
    if ($('dashboard')?.classList.contains('open')) {
      if (!hasDashParams) {
        __orvoPushNav = false;
        closeDash();
        __orvoLastNav = { v: null, rid: null };
        __orvoPushNav = true;
        return;
      }
      __orvoPushNav = false;
      consumeViewDeepLink();
      __orvoLastNav = { v: view, rid: chatRequestId };
      __orvoPushNav = true;
      return;
    }
    if (hasDashParams) consumeViewDeepLink();
  });

  // Enter key on login
  $('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('signup-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doSignup(); });
  $('reset-pass2')?.addEventListener('keydown', e => { if (e.key === 'Enter') submitPasswordReset(); });
  $('reset-btn')?.addEventListener('click', submitPasswordReset);

  function wireLandingHonesty() {
    const live = !!window.ORVO_CHECKOUT_LIVE;
    const trust = $('trust-pay-copy');
    if (trust) {
      trust.textContent = live
        ? 'quote → Stripe Checkout (held) → release when done'
        : 'quote → try Checkout when configured → release when done';
    }
    const how = $('how-step3-copy');
    if (how) {
      how.textContent = live
        ? 'Accept a quote, pay via Stripe Checkout — funds held until you approve delivery — then release to the builder.'
        : 'Accept a quote; ORVO tries Checkout when configured (funds held until you approve delivery), then release.';
    }
    const builderPaid = $('builder-paid-copy');
    if (builderPaid) {
      builderPaid.textContent = live
        ? 'Client pays via Stripe Checkout; funds held until they release. Connect payouts in Profile. Founding fee 0%.'
        : 'Client funds on ORVO when Checkout is configured. You mark delivered; they release. Founding fee 0%.';
    }
  }

  // ── BOOT ──
  $('boot-copy-sql')?.addEventListener('click', () => copyApplyAllSql());
  $('boot-copy-founder-setup')?.addEventListener('click', () => copyFounderSetupCmd());

  async function boot() {
    if (!window.supabase?.createClient) {
      bootErr('Supabase failed to load. Connect to internet and refresh (Ctrl+F5).');
      return;
    }
    db = connect();
    if (!db) {
      bootErr('Check supabase-config.js — URL and key required.');
      return;
    }
    await refreshUser();
    db.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        user = session?.user || null;
        if (user) await loadProfile();
        updateNav();
        openPasswordResetModal();
        track('password_recovery_opened', {});
        return;
      }
      await refreshUser();
      if (event === 'SIGNED_IN') consumeViewDeepLink();
    });
    handleCheckoutReturn();
    handleConnectReturn();
    consumeViewDeepLink();
    wireNavScroll();
    wireOfflineBanner();
    wireVisibilityRefresh();
    wireLandingHonesty();
    track('app_boot', { authed: !!user });
  }

  // Design: gate hero entrance motion (CSS .ui-ready)
  requestAnimationFrame(() => document.body.classList.add('ui-ready'));

  // Section reveal on scroll (trust / how / builders / cta)
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
  } else {
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
  }

  boot();
})();

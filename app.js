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
    return `<div class="skel" aria-busy="true" aria-label="Loading">${lines}</div>`;
  }

  function showMsg(id, text, ok) {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'msg ' + (ok ? 'ok' : 'err');
    el.classList.remove('hidden');
  }

  function hideMsg(id) { $(id)?.classList.add('hidden'); }

  function bootErr(msg) {
    const el = $('boot-error');
    // Banner is always public-safe (P1-10); detail stays in console for ops
    el.textContent = sanitizePublicErr(msg);
    el.classList.remove('hidden');
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

  async function refreshNotifBadge() {
    if (!user || !db) return;
    try {
      const { count } = await needDb().from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id).is('read_at', null);
      const n = count || 0;
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
      bootErr('Database error — complete database setup, then refresh. ' + error.message);
      return;
    }

    // New signups: wait for trigger to create profile
    if (!data) {
      await new Promise((r) => setTimeout(r, 600));
      ({ data, error } = await needDb().from('profiles').select('*').eq('id', user.id).maybeSingle());
      if (error) {
        bootErr('Database error — complete database setup, then refresh. ' + error.message);
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
        bootErr('Session out of sync — sign out, then sign in again after database setup.');
        return;
      }
      bootErr('Profile error — complete database setup, then refresh. ' + insErr.message);
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
          if (view === 'chat' && chatRequestId === rid) loadChat();
          else if (view === 'requests') loadRequests();
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
      }
      return;
    }
    if (checkout === 'cancel' || checkout === '0') {
      track('checkout_return_cancel', { request_id: rid || null });
      toast('Checkout cancelled — job stays awaiting payment until you try again.', false);
      clean();
      if (user && rid) {
        ensureDashOpen();
        go('chat', rid);
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
    if (connect === 'success' || connect === 'refresh') {
      track('connect_return', { status: connect });
      toast(connect === 'success'
        ? 'Payout onboarding returned — ORVO syncs Connect status when webhooks are live.'
        : 'Continue payout setup from Profile when Connect is live.', true);
      clean();
      if (user) {
        ensureDashOpen();
        go('profile');
        refreshUser().then(() => {
          if (view === 'profile') loadProfileView();
        });
      }
      return;
    }
    if (connect === 'cancel') {
      track('connect_return_cancel', {});
      toast('Payout setup cancelled — you can retry from Profile.', false);
      clean();
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
          pollPaymentAfterCheckout(pollRid);
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
    $('reset-modal')?.classList.add('open');
  }
  function closePasswordReset() {
    $('reset-modal')?.classList.remove('open');
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
      params.delete('rid');
      params.delete('view');
      const u = new URL(window.location.href);
      u.search = params.toString();
      window.history.replaceState({}, '', u.pathname + (u.search ? '?' + u.search : '') + u.hash);
      return;
    }
    const v = params.get('view');
    if (!v) return;
    const allowed = new Set([
      'requests', 'jobs', 'invites', 'quotes', 'messages', 'apply', 'status',
      'profile', 'admin', 'all-requests', 'disputes', 'notifications',
    ]);
    if (!allowed.has(v)) return;
    ensureDashOpen();
    go(v);
    params.delete('view');
    const u = new URL(window.location.href);
    u.search = params.toString();
    window.history.replaceState({}, '', u.pathname + (u.search ? '?' + u.search : '') + u.hash);
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
      el.classList.toggle('show', !navigator.onLine);
      if (navigator.onLine) track('online', {});
      else track('offline', {});
    };
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    sync();
  }
  function openAuth(tab) {
    hideMsg('login-msg'); hideMsg('signup-msg');
    $('auth-modal').classList.add('open');
    setAuthTab(tab || 'login');
    const sub = $('auth-sub');
    if (sub) {
      sub.textContent = pendingClientPost
        ? 'Sign in or create an account to post your agent brief.'
        : 'Sign in or create your account';
    }
  }
  function closeAuth() { $('auth-modal').classList.remove('open'); }
  function setAuthTab(t) {
    const login = t === 'login';
    $('tab-login').classList.toggle('active', login);
    $('tab-signup').classList.toggle('active', !login);
    $('panel-login').classList.toggle('hidden', !login);
    $('panel-signup').classList.toggle('hidden', login);
  }
  function wireFieldCounter(inputId, metaId, max) {
    const input = $(inputId);
    const meta = $(metaId);
    if (!input || !meta) return;
    const sync = () => {
      const n = (input.value || '').length;
      meta.textContent = n + ' / ' + max;
      meta.classList.toggle('warn', n > max * 0.9);
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
    $('post-modal').classList.add('open');
  }
  function closePost() { $('post-modal').classList.remove('open'); }
  function openQuoteModal(reqId) {
    quoteRequestId = reqId;
    hideMsg('quote-msg');
    $('quote-price').value = '';
    if ($('quote-eta')) $('quote-eta').value = '';
    $('quote-text').value = '';
    wireFieldCounter('quote-text', 'quote-count', 2000);
    $('quote-modal').classList.add('open');
  }
  function closeQuote() { $('quote-modal').classList.remove('open'); quoteRequestId = null; }

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
        'Card checkout is not live yet. Accepting locks this builder and marks the job ' +
        '<strong>awaiting payment</strong> — not funded. Stripe Checkout is coming next.';
      $('pay-confirm-btn').textContent = 'Accept quote — await payment';
    }
    const msg = $('pay-msg');
    msg.className = 'msg hidden';
    msg.textContent = '';
    $('pay-confirm-btn').disabled = false;
    $('pay-cancel-btn').textContent = 'Cancel';
    $('pay-modal').classList.add('open');
  }

  function closePay() {
    $('pay-modal').classList.remove('open');
    pendingPay = null;
    awaitingPayContext = null;
    const sheet = $('pay-sheet');
    if (sheet) sheet.classList.remove('done');
    $('pay-resume-btn')?.classList.add('hidden');
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
        'When Stripe Checkout goes live, you will pay here and funds will be held until you release.';
    }
    showMsg('pay-msg', extraNote || (checkoutLive ? 'Complete checkout to hold funds' : 'Checkout coming — no card charged yet'), true);
    $('pay-cancel-btn').textContent = 'Close';
    const resumeBtn = $('pay-resume-btn');
    if (resumeBtn) {
      if (awaitingPayContext) {
        resumeBtn.classList.remove('hidden');
        resumeBtn.textContent = checkoutOpen
          ? (checkoutLive ? 'Continue to Stripe Checkout' : 'Resume checkout')
          : (checkoutLive ? 'Pay with Stripe Checkout' : 'Try checkout again');
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
    toast(checkout.reason === 'not_configured'
      ? 'Checkout not live yet — no card charged'
      : 'Checkout unavailable — still awaiting payment', false);
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
        return { ok: false, reason: 'not_configured' };
      }
      if (!res.ok || !body.url) {
        return { ok: false, reason: body.message || body.error || 'checkout_failed' };
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
  }

  /** Login / session restore: role home — never signup intent. */
  function routeAfterLogin() {
    const wantPost = pendingClientPost;
    postSignupIntent = 'client';
    openDash(wantPost && !isAdmin() && !isBuilder() && !isPending() ? 'requests' : homeViewForRole());
    if (wantPost) maybeOpenClientPost();
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
      showMsg('signup-msg', e.message, false);
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
      showMsg('login-msg', e.message, false);
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
        if (/email not confirmed/i.test(error.message))
          throw new Error('Turn OFF "Confirm email" in Supabase → Authentication → Email');
        throw error;
      }
      if (!data.session) throw new Error('No session');
      await refreshUser();
      closeAuth();
      routeAfterLogin();
      toast('Signed in!', true);
    } catch (e) {
      showMsg('login-msg', e.message, false);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  }

  async function doLogout() {
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
    $('dashboard').classList.add('open');
    document.body.style.overflow = 'hidden';
    renderSidebar();
    refreshFounderSetupBanner();
    go(preferredView || homeViewForRole());
  }

  function closeDash() {
    $('dashboard').classList.remove('open');
    document.body.style.overflow = '';
    stopChat();
    stopCheckoutPoll();
  }

  function renderSidebar() {
    let h = '';
    if (isAdmin()) {
      h += `<div class="side-label">Admin</div>
        <button class="side-item" data-view="admin">Review builders</button>
        <button class="side-item" data-view="all-requests">All requests</button>
        <button class="side-item" data-view="disputes">Disputes</button>`;
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
      el.addEventListener('click', () => go(el.dataset.goto));
    });
  }

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
    $('sidebar').querySelectorAll('.side-item').forEach(el => {
      el.classList.toggle('active', el.dataset.view === v);
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

    if (v === 'requests') { $('view-action').innerHTML = '<button class="btn btn-primary" data-action="post">+ Post request</button>'; loadRequests(); }
    else if (v === 'jobs') loadJobs();
    else if (v === 'invites') loadInvites();
    else if (v === 'quotes') loadQuotes();
    else if (v === 'messages') loadThreads();
    else if (v === 'chat') loadChat();
    else if (v === 'apply') loadApply();
    else if (v === 'status') loadStatus();
    else if (v === 'profile') loadProfileView();
    else if (v === 'admin') loadAdmin();
    else if (v === 'all-requests') loadAllRequests();
    else if (v === 'disputes') loadDisputes();
    else if (v === 'notifications') {
      $('view-action').innerHTML = '<button class="btn btn-ghost" id="btn-mark-all-read" style="padding:8px 12px;font-size:12px">Mark all read</button>';
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
      showMsg('post-msg', e.message, false);
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
        body.innerHTML = `<p class="empty">No notifications yet.</p>
          <p class="empty" style="padding-top:8px;font-size:13px">You’ll see quote alerts here after sql/012 + sql/014 are applied.</p>`;
        return;
      }
      body.innerHTML = data.map((n) => {
        const unread = !n.read_at;
        return `<div class="card ${unread ? 'notif-unread' : ''}" data-nid="${n.id}" data-link="${esc(n.link_path || '')}" style="cursor:pointer">
          <h3>${esc(n.title)}</h3>
          ${n.body ? `<p>${esc(n.body)}</p>` : ''}
          <span class="badge">${unread ? 'New · ' : ''}${ago(n.created_at)}</span>
        </div>`;
      }).join('');
      body.querySelectorAll('[data-nid]').forEach((el) => {
        el.addEventListener('click', async () => {
          const id = el.dataset.nid;
          const link = el.dataset.link || '';
          try {
            await needDb().from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id);
          } catch (_) { /* ignore */ }
          refreshNotifBadge();
          if (link.includes('rid=')) {
            const rid = new URLSearchParams(link.replace(/^\?/, '')).get('rid');
            if (rid) { go('chat', rid); return; }
          }
          if (link.includes('view=invites')) { go('invites'); return; }
          if (link.includes('view=messages')) { go('messages'); return; }
          loadNotifications();
        });
      });
      refreshNotifBadge();
    } catch (e) {
      body.innerHTML = `<p class="empty err">${esc(userFacingErr(e.message))}</p>
        <p class="empty" style="font-size:12px;padding-top:8px">${isAdmin() ? 'Run sql/012_notifications.sql (and 014) in Supabase.' : 'Notifications are not available yet.'}</p>`;
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
    if (error) { body.innerHTML = `<p class="empty err">${esc(error.message)}</p>`; return; }
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
        ${!qText ? '<button class="btn btn-primary" style="margin-top:16px;padding:12px 24px" data-action="post">+ Post request</button>' : ''}
        ${showAll || qText ? '' : '<p class="empty" style="padding-top:12px;font-size:12px"><button type="button" class="hero-secondary" id="btn-show-cancelled" style="color:var(--gray)">Show cancelled</button></p>'}`;
      $('requests-search')?.addEventListener('input', (e) => {
        window.__orvoRequestsQuery = e.target.value;
        clearTimeout(window.__orvoReqSearchT);
        window.__orvoReqSearchT = setTimeout(loadRequests, 280);
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
      return `
      <div class="card">
        <span class="tag">${esc(r.category || 'Project')}</span>
        <h3>${esc(r.title)}</h3>
        <p>${esc(r.description.slice(0, 120))}</p>
        <span class="badge">${esc(statusLabel(r.status))}${quoteBadge}${payHint} · ${ago(r.created_at)}</span>
        <div class="row">
          <button class="btn btn-primary btn-open-req" data-rid="${r.id}">Open</button>
          ${r.status === 'awaiting_payment' ? `<button class="btn btn-primary btn-pay-req" data-rid="${r.id}" data-qid="${esc(payByReq[r.id]?.quote_id || '')}">Complete payment</button>` : ''}
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
        el.textContent = 'Complete payment';
        toast(checkout.reason === 'not_configured'
          ? 'Checkout not live yet — open request to retry'
          : 'Checkout unavailable — open request for details', false);
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
    } catch (e) { toast(userFacingErr(e.message), false); }
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
      body.innerHTML = `<p class="empty err">${esc(userFacingErr(error.message))}</p>`;
      return;
    }
    const searchBar = `<input class="admin-search" id="jobs-search" type="search" placeholder="Search jobs by title, category…" value="${esc(window.__orvoJobsQuery || '')}" autocomplete="off"/>`;
    const activeHtml = (activeJobs || []).length ? `
      <h3 style="font-size:15px;margin:0 0 12px">Your active jobs</h3>
      ${(activeJobs || []).map((r) => `
      <div class="card" style="border-left:3px solid var(--o);margin-bottom:12px">
        <h3>${esc(r.title)}</h3>
        <p style="font-size:13px;color:var(--gray);margin:6px 0 10px">${esc((r.description || '').slice(0, 100))}${(r.description || '').length > 100 ? '…' : ''}</p>
        <div class="row">
          <span class="badge">${esc(statusLabel(r.status))}</span>
          <button class="btn btn-primary btn-open-active" data-rid="${r.id}">Open project</button>
        </div>
      </div>`).join('')}
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
      body.querySelectorAll('.btn-open-active').forEach((b) => {
        b.addEventListener('click', () => go('chat', b.dataset.rid));
      });
    };
    if (!data?.length) {
      body.innerHTML = searchBar + activeHtml + `<p class="empty">No open jobs${qText ? ' matching that search' : ' right now'}.</p>
        <p class="empty" style="padding-top:8px;font-size:13px">Check back soon — new client briefs from anywhere appear here. Quotes are in USD.</p>`;
      bindJobsSearch();
      bindActiveBtns();
      return;
    }
    const { data: myQuotes } = await needDb().from('quotes').select('request_id,status').eq('builder_id', user.id);
    const quotedIds = new Set((myQuotes || []).map(q => q.request_id));
    const pendingIds = new Set((myQuotes || []).filter(q => q.status === 'pending').map(q => q.request_id));
    body.innerHTML = searchBar + activeHtml + data.map(r => {
      const canMsg = isAdmin() || quotedIds.has(r.id) || r.assigned_builder_id === user.id;
      const already = pendingIds.has(r.id);
      return `
      <div class="card">
        <span class="tag">${esc(r.category || 'Project')}</span>
        <h3>${esc(r.title)}</h3>
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
      showMsg('quote-msg', e.message, false);
    } finally { btn.disabled = false; }
  }

  async function loadQuotes() {
    const body = $('view-body');
    body.innerHTML = loadingSkeleton(3);
    const { data, error } = await needDb().from('quotes').select('*, requests(title)').eq('builder_id', user.id).order('created_at', { ascending: false });
    if (error) { body.innerHTML = `<p class="empty err">${esc(error.message)}</p>`; return; }
    if (!data?.length) {
      body.innerHTML = `<p class="empty">No quotes yet.</p>
        <p class="empty" style="padding-top:8px;font-size:13px">Browse open jobs and send your first quote in USD.</p>
        <button class="btn btn-primary" style="margin-top:16px;padding:12px 24px" data-goto="jobs">Browse jobs</button>`;
      return;
    }
    body.innerHTML = data.map(q => `
      <div class="card">
        <h3>${esc(q.requests?.title || 'Project')}</h3>
        <p>${esc(q.message)}</p>
        <span class="badge">${money(q.amount_cents)} · ${esc(statusLabel(q.status))}${q.delivery_days ? ' · ' + q.delivery_days + 'd' : ''}</span>
        <div class="row">
          <button class="btn btn-primary btn-open-quote" data-rid="${q.request_id}">Open</button>
          ${q.status === 'pending' ? `<button class="btn btn-ghost btn-withdraw-quote" data-qid="${q.id}">Withdraw</button>` : ''}
        </div>
      </div>`).join('');
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
    } catch (e) { toast(userFacingErr(e.message), false); }
  }

  async function loadApply() {
    // Approved builders belong on jobs — pending builders may edit a prefilled form (no bounce to status).
    if (isBuilder()) { go('jobs'); return; }
    const editing = isPending();
    let existing = null;
    if (editing) {
      const { data, error } = await needDb().from('builder_applications').select('*').eq('user_id', user.id).maybeSingle();
      if (error) {
        toast(userFacingErr(error.message), false);
      }
      existing = data;
    }
    $('view-title').textContent = editing ? 'Edit application' : 'Become a builder';
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
    wireFieldCounter('apply-bio', 'apply-bio-count', 2000);
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
      if (e1) throw new Error('Could not save application. Please try again.');
      const { error: e2 } = await needDb().from('profiles')
        .update({ builder_status: 'pending' }).eq('id', user.id);
      if (e2) throw new Error('Profile update failed: ' + e2.message);
      await refreshUser();
      renderSidebar();
      go('status');
      toast(wasPending ? 'Application updated — still pending review.' : 'Application sent! Admin will see it in Review builders.', true);
      if (!saved) console.warn('ORVO: application saved but no row returned');
    } catch (e) {
      toast(e.message, false);
    } finally {
      btn.disabled = false;
      btn.textContent = wasPending ? 'Save changes' : 'Submit application';
    }
  }

  async function loadStatus() {
    const { data: app } = await needDb().from('builder_applications').select('*').eq('user_id', user.id).maybeSingle();
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
      <p style="font-size:13px;color:var(--gray)">Submitted ${ago(app.created_at)}</p>
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
      <button class="btn btn-ghost" id="admin-refresh">Refresh</button>`;
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
          <div class="card kpi-card" style="flex:1;min-width:120px;cursor:pointer" data-goto="admin"><p style="font-size:12px;color:var(--gray)">Pending builders</p><h3>${pendingBuilders}</h3></div>
          <div class="card kpi-card" style="flex:1;min-width:120px;cursor:pointer" data-goto="all-requests"><p style="font-size:12px;color:var(--gray)">Open requests</p><h3>${openReqs}</h3></div>
          <div class="card kpi-card" style="flex:1;min-width:120px;cursor:pointer" data-goto="all-requests"><p style="font-size:12px;color:var(--gray)">Awaiting pay</p><h3>${awaitingPay}</h3></div>
          <div class="card kpi-card" style="flex:1;min-width:120px;cursor:pointer" data-goto="all-requests"><p style="font-size:12px;color:var(--gray)">Funded</p><h3>${funded}</h3></div>
          <div class="card kpi-card" style="flex:1;min-width:120px;cursor:pointer" data-goto="all-requests"><p style="font-size:12px;color:var(--gray)">Completed</p><h3>${completed}</h3></div>
          <div class="card kpi-card" style="flex:1;min-width:120px;cursor:pointer" data-goto="disputes"><p style="font-size:12px;color:var(--gray)">Disputes</p><h3>${openDisputes}</h3></div>
          <div class="card kpi-card" style="flex:1;min-width:120px;cursor:pointer" data-goto="admin"><p style="font-size:12px;color:var(--gray)">Approved builders</p><h3>${approvedBuilders}</h3></div>
        </div>
        <h3 style="margin:8px 0 12px;font-size:16px">Pending builder applications</h3>`;
    } catch (_) {
      kpiHtml = '';
    }

    const { data, error } = await needDb().from('builder_applications')
      .select('*').eq('status', 'pending').order('created_at', { ascending: false });
    if (error) {
      $('view-body').innerHTML = kpiHtml + `<p class="empty err">${esc(userFacingErr(error.message))}</p>`;
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
    } catch (e) { toast(e.message, false); }
  }

  async function rejectBuilder(uid) {
    try {
      const { error: e1 } = await needDb().from('builder_applications')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('user_id', uid);
      if (e1) throw e1;
      const { error: e2 } = await needDb().from('profiles')
        .update({ builder_status: 'rejected' }).eq('id', uid);
      if (e2) throw e2;
      toast('Rejected', true);
      loadAdmin();
    } catch (e) { toast(e.message, false); }
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
      body.innerHTML = `<p class="empty err">${esc(userFacingErr(error.message))}</p>
        <p class="empty" style="font-size:12px;padding-top:8px">${isAdmin() ? 'Run sql/005_invites.sql in Supabase if invites are not set up yet.' : 'Invites are not available yet — browse open jobs instead.'}</p>`;
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
      return `
      <div class="card">
        <span class="tag">${esc(r.category || 'Invite')}</span>
        <h3>${esc(r.title || 'Request')}</h3>
        <p>${esc((r.description || '').slice(0, 160))}</p>
        <p>Budget: ${esc(r.budget || 'Not specified')}${r.location ? ' · ' + esc(r.location) : ''}</p>
        ${inv.note ? `<p style="font-size:12px;color:var(--gray)">Note: ${esc(inv.note)}</p>` : ''}
        <div class="row">
          <button class="btn btn-primary btn-quote" data-rid="${r.id || inv.request_id}">Send quote</button>
          <button class="btn btn-ghost btn-chat" data-rid="${r.id || inv.request_id}">Message</button>
        </div>
      </div>`;
    }).join('');
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
    if (error) { $('view-body').innerHTML = `<p class="empty err">${esc(error.message)}</p>`; return; }
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
    const statusChips = [
      { key: '', label: 'All' },
      { key: 'open', label: 'Open' },
      { key: 'awaiting_payment', label: 'Awaiting pay' },
      { key: 'funded', label: 'Funded' },
      { key: 'disputed', label: 'Disputed' },
    ];
    const chipHtml = `<div class="row" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">${
      statusChips.map((c) =>
        `<button type="button" class="btn btn-ghost channel-chip${statusFilter === c.key ? ' on' : ''}" data-status="${c.key}" style="padding:6px 12px;font-size:12px">${c.label}</button>`
      ).join('')
    }</div>`;
    const searchHtml = `${chipHtml}<input class="admin-search" id="all-reqs-search" type="search" placeholder="Filter requests…" value="${esc(qText)}" autocomplete="off"/>`;
    $('view-body').innerHTML = searchHtml + ((rows || []).map(r => {
      const pay = payMap[r.id];
      const payLine = pay ? ` · Pay: ${statusLabel(pay.status)}${pay.amount_cents ? ' ' + money(pay.amount_cents) : ''}` : '';
      return `
      <div class="card" style="cursor:default">
        <h3>${esc(r.title)}</h3>
        <p>${esc(statusLabel(r.status))}${payLine} · ${ago(r.created_at)}${r.location ? ' · ' + esc(r.location) : ''}</p>
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
    }).join('') || '<p class="empty">No requests' + (qText ? ' match that filter' : '') + '</p>');
    $('all-reqs-search')?.addEventListener('input', (e) => {
      window.__orvoAllReqsQuery = e.target.value;
      clearTimeout(window.__orvoAllReqsSearchT);
      window.__orvoAllReqsSearchT = setTimeout(loadAllRequests, 280);
    });
    $('view-body').querySelectorAll('[data-status]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.__orvoAllReqsStatus = btn.dataset.status || '';
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
    try {
      const { error } = await needDb().from('request_invites').insert({
        request_id: requestId,
        builder_id: builderId,
        invited_by: user.id,
        note: 'Concierge invite from ORVO admin',
      });
      if (error) throw error;
      toast('Builder invited', true);
    } catch (e) { toast(e.message, false); }
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
      $('view-body').innerHTML = `<p class="empty err">${esc(userFacingErr(error.message))}</p>`;
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
      <div class="card" style="cursor:default">
        <h3>Dispute · ${esc(d.reason)}</h3>
        <p>${esc(d.details)}</p>
        <p style="font-size:12px;color:var(--gray)">${esc(statusLabel(d.status))} · ${ago(d.created_at)}</p>
        <div class="row">
          <button class="btn btn-ghost btn-goto-req" data-rid="${d.request_id}">Open request</button>
          <button class="btn btn-primary btn-resolve" data-id="${d.id}" data-rid="${d.request_id}" data-how="resolved_client">Resolve → client</button>
          <button class="btn btn-primary btn-resolve" data-id="${d.id}" data-rid="${d.request_id}" data-how="resolved_builder">Resolve → builder</button>
        </div>
      </div>`).join('');
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
    } catch (e) { toast(userFacingErr(e.message), false); }
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

    const { data: req } = await needDb().from('requests').select('*').eq('id', rid).single();
    if (!(await canChatOnRequest(req))) {
      toast('Message only after you quote or are assigned to this job.', false);
      go(isBuilder() ? 'jobs' : 'messages');
      return;
    }
    markThreadNotificationsRead(rid);
    chatRequestStatus = req?.status || 'open';

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
          ${confirming ? '<p style="font-size:12px;color:var(--o);margin:0 0 8px">Confirming payment with Stripe webhook…</p>' : ''}
          <p>${payNote}</p>
          <p style="font-size:12px;color:var(--muted);margin:8px 0">Payment: <span class="badge">${esc(payBadge)}</span>
            ${payRow ? ' · ' + money(payRow.amount_cents) : ''}</p>
          <button class="btn btn-primary" id="btn-retry-checkout" data-rid="${rid}" data-qid="${payRow?.quote_id || ''}" data-label="${esc(btnLabel)}">${esc(btnLabel)}</button>
          </div>`;
      }
      if (isAssigned && req.status === 'funded') {
        escrowHtml = `<div class="card" style="cursor:default;margin-bottom:16px"><b>Delivery</b>
          <p>Share a demo link (optional) and mark delivered when the client can test.</p>
          <div class="field" style="margin:12px 0"><input id="deliver-url" placeholder="https://demo.example.com"/></div>
          <button class="btn btn-primary" id="btn-mark-delivered" data-rid="${rid}">Mark delivered</button></div>`;
      }
      if (isClient && (req.status === 'funded' || req.status === 'delivered')) {
        escrowHtml += `<div class="card" style="cursor:default;margin-bottom:16px"><b>Release</b><p>Status: <span class="badge">${esc(statusLabel(req.status))}</span>. Release when you're satisfied.</p>
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
      <p class="chat-hint">No emails or phone numbers. Off-platform contact links blocked. Agent/demo links (GitHub, Vercel, n8n…) are OK.</p>
      <div class="chat">
        <div class="chat-msgs" id="chat-msgs"></div>
        <form class="chat-send" id="chat-form">
          <input id="chat-input" placeholder="Type a message..." autocomplete="off" maxlength="2000"/>
          <button class="btn btn-primary" type="submit">Send</button>
        </form>
        <p class="chat-meta" id="chat-count">0 / 2000</p>
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
      toast(checkout.reason === 'not_configured'
        ? 'Checkout not live yet — no card charged'
        : 'Checkout unavailable — still awaiting payment', false);
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
      box.innerHTML = `<p class="empty err">${esc(userFacingErr(error.message))}</p>`;
      return;
    }
    const ids = [...new Set((data || []).map(m => m.sender_id).filter(Boolean))];
    const { data: profs } = ids.length ? await needDb().from('profiles').select('id,full_name').in('id', ids) : { data: [] };
    const names = Object.fromEntries((profs || []).map(p => [p.id, p.full_name]));
    box.innerHTML = (data || []).map(m => {
      const mine = m.sender_id === user.id;
      return `<div class="chat-bubble ${mine ? 'me' : 'them'}"><small>${mine ? 'You' : esc(names[m.sender_id] || 'User')}</small>${esc(m.body)}<span class="chat-time">${ago(m.created_at)}</span></div>`;
    }).join('') || '<p class="empty" style="padding:20px">Start chatting...</p>';
    box.scrollTop = box.scrollHeight;
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
          throw new Error(userFacingErr('Cannot send message right now. Please try again.'));
        }
        throw error;
      }
      await renderMsgs();
    } catch (err) {
      input.value = body;
      toast(err.message, false);
    }
  }

  async function loadThreads() {
    const body = $('view-body');
    body.innerHTML = loadingSkeleton(4);
    const byId = new Map();
    // Own requests (client relationship)
    const { data: own } = await needDb().from('requests')
      .select('id,title,created_at,status').eq('user_id', user.id);
    (own || []).forEach(r => byId.set(r.id, { id: r.id, title: r.title, t: r.created_at, status: r.status }));

    if (isBuilder() || isAdmin()) {
      const { data: quotes } = await needDb().from('quotes')
        .select('request_id, requests(title,created_at,status)').eq('builder_id', user.id);
      (quotes || []).forEach(q => {
        if (!q.request_id || byId.has(q.request_id)) return;
        byId.set(q.request_id, {
          id: q.request_id,
          title: q.requests?.title,
          t: q.requests?.created_at,
          status: q.requests?.status,
        });
      });
      const { data: assigned } = await needDb().from('requests')
        .select('id,title,created_at,status').eq('assigned_builder_id', user.id);
      (assigned || []).forEach(r => {
        if (!byId.has(r.id)) byId.set(r.id, { id: r.id, title: r.title, t: r.created_at, status: r.status });
        else {
          const cur = byId.get(r.id);
          cur.status = r.status;
        }
      });
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
      $('view-body').innerHTML = `<p class="empty">No conversations yet.</p>
        <p class="empty" style="padding-top:8px;font-size:13px">Post a request or send a quote to start messaging on ORVO.</p>`;
      return;
    }
    $('view-body').innerHTML = list.map(r => {
      const prev = previews[r.id];
      const snippet = prev
        ? ((prev.sender_id === user.id ? 'You: ' : '') + prev.body).slice(0, 100) + (prev.body.length > 100 ? '…' : '')
        : 'No messages yet — open to chat';
      const t = prev?.created_at || r.t;
      const isUnread = unreadRids.has(r.id);
      return `
      <div class="card ${isUnread ? 'thread-unread' : ''}" data-click="${r.id}">
        <h3>${esc(r.title || 'Chat')}</h3>
        <p class="thread-snippet">${esc(snippet)}</p>
        <div class="thread-meta">
          ${isUnread ? '<span class="badge-new">New</span>' : ''}
          ${r.status ? `<span class="badge">${esc(statusLabel(r.status))}</span>` : ''}
          <span class="badge">${ago(t)}</span>
        </div>
      </div>`;
    }).join('');
    $('view-body').querySelectorAll('[data-click]').forEach(el => {
      el.addEventListener('click', () => go('chat', el.dataset.click));
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
    $('review-modal')?.classList.add('open');
  }
  function closeReview() {
    $('review-modal')?.classList.remove('open');
    pendingReview = null;
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
      showMsg('review-msg', userFacingErr(e.message), false);
      toast(userFacingErr(e.message), false);
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
      $('confirm-modal')?.classList.add('open');
    });
  }
  function closeConfirm(ok) {
    const note = ($('confirm-note')?.value || '').trim();
    $('confirm-modal')?.classList.remove('open');
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
    } catch (e) { toast(userFacingErr(e.message), false); }
  }

  let pendingDisputeRid = null;

  function openDisputeSheet(rid) {
    pendingDisputeRid = rid;
    hideMsg('dispute-msg');
    if ($('dispute-details')) $('dispute-details').value = '';
    wireFieldCounter('dispute-details', 'dispute-count', 2000);
    $('dispute-modal')?.classList.add('open');
  }

  function closeDispute() {
    $('dispute-modal')?.classList.remove('open');
    pendingDisputeRid = null;
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
      showMsg('dispute-msg', userFacingErr(e.message), false);
      toast(userFacingErr(e.message), false);
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
        return { ok: false, reason: 'not_configured' };
      }
      if (!res.ok) {
        return { ok: false, reason: body.message || body.error || 'release_failed' };
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
          toast('Delivery accepted — ORVO will settle payout when Connect is live', true);
        }
        track('payment_release_pending', { request_id: rid, reason: released.reason });
        loadChat();
        return;
      }

      const { error: e1 } = await needDb().from('requests').update({ status: 'completed' }).eq('id', rid);
      if (e1) throw e1;
      toast('Project completed', true);
      loadChat();
    } catch (e) { toast(userFacingErr(e.message), false); }
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
      const note = checkout.reason === 'not_configured' || checkout.reason === 'network'
        ? 'Checkout not live yet — no card charged'
        : `Checkout unavailable (${checkout.reason}) — job is awaiting payment`;
      showPayAwaitingState({ extraNote: note, rid, qid, checkoutOpen: false });
      toast('Quote accepted — awaiting payment (not funded yet)', true);
      track('quote_accepted', { request_id: rid, quote_id: qid, checkout: checkout.reason || 'redirect' });
      pendingPay = null;
      loadChat();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Accept quote — await payment';
      showMsg('pay-msg', userFacingErr(e.message), false);
      toast(e.message, false);
    }
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
        return { ok: false, reason: 'not_configured' };
      }
      if (!res.ok || !body.url) {
        return { ok: false, reason: body.message || body.error || 'connect_failed' };
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
    let checks = [];
    try {
      checks = await probeSchemaHealth();
    } catch {
      checks = [];
    }
    const schemaOk = checks.length > 0 && checks.every((c) => c.ok);
    if (schemaOk && adminOk) {
      el.classList.add('hidden');
      return;
    }
    const failN = checks.filter((c) => !c.ok).length;
    const steps = [
      !schemaOk ? `Run APPLY-ALL SQL${failN ? ` (${failN} table${failN === 1 ? '' : 's'} missing)` : ''}` : null,
      !adminOk ? 'Copy is_admin SQL in Profile → run after signup' : null,
    ].filter(Boolean);
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="founder-banner-inner">
        <div>
          <b>Founder setup</b>
          <span class="founder-banner-steps">${esc(steps.join(' · '))}</span>
        </div>
        <div class="founder-banner-actions">
          <button type="button" class="btn btn-primary" id="btn-banner-copy-sql">Copy APPLY-ALL SQL</button>
          <button type="button" class="btn btn-ghost" id="btn-banner-profile">Setup health</button>
          <a href="founder-checklist.html" target="_blank" rel="noopener" class="btn btn-ghost">Checklist</a>
        </div>
      </div>`;
    $('btn-banner-copy-sql')?.addEventListener('click', () => copyApplyAllSql());
    $('btn-banner-profile')?.addEventListener('click', () => go('profile'));
  }

  function renderHealthPanel(checks, { adminOk, configuredFounder }) {
    const rows = (checks || []).map((c) =>
      `<div style="display:flex;justify-content:space-between;gap:8px;margin:4px 0">
        <span>${c.ok ? '✓' : '✗'} ${esc(c.label)}</span>
        ${c.ok ? '<span style="color:var(--green)">OK</span>' : `<span style="color:var(--red);font-size:11px">${esc((c.hint || '').slice(0, 48))}</span>`}
      </div>`
    ).join('');
    const stripeLine = window.ORVO_CHECKOUT_LIVE
      ? '<span style="color:var(--green)">ORVO_CHECKOUT_LIVE = true</span>'
      : '<span style="color:var(--muted)">Checkout off (flip after Stripe smoke test)</span>';
    const adminLine = adminOk
      ? '<span style="color:var(--green)">is_admin = yes</span>'
      : (configuredFounder
        ? '<span style="color:var(--o)">Founder email — set is_admin in Supabase SQL</span>'
        : '<span style="color:var(--muted)">Not admin</span>');
    const allOk = (checks || []).every((c) => c.ok);
    const fixBlock = !allOk ? `<p style="color:var(--o);font-size:12px;margin:8px 0 0">Missing tables? Supabase SQL Editor → paste <a href="https://raw.githubusercontent.com/danielmenparan-lang/orvo/cursor/orvo-local-site-3bd5/sql/APPLY-ALL-001-020.sql" target="_blank" rel="noopener" style="color:var(--o)">APPLY-ALL-001-020.sql</a> → Run once.</p>` : '';
    return `
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:16px;font-size:13px;line-height:1.6">
        <b>Setup health</b> <span style="font-size:11px;color:var(--muted)">(live probes)</span>
        ${rows}
        ${fixBlock}
        <hr style="border:none;border-top:1px solid var(--border);margin:10px 0"/>
        <div>${adminLine}</div>
        <div>${stripeLine}</div>
        <div style="margin-top:10px">
          <button type="button" class="btn btn-primary" id="btn-copy-apply-all" style="padding:8px 12px;font-size:12px;margin-right:8px">Copy APPLY-ALL SQL</button>
          <button type="button" class="btn btn-ghost" id="btn-copy-admin-sql" style="padding:8px 12px;font-size:12px;margin-right:8px">Copy is_admin SQL</button>
          <a href="founder-checklist.html" target="_blank" rel="noopener" style="color:var(--o)">Founder checklist →</a>
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
      const checks = await probeSchemaHealth();
      healthHtml = renderHealthPanel(checks, { adminOk, configuredFounder });
    }
    const bs = profile?.builder_status || 'none';
    const role = adminOk ? 'ORVO Admin' : isBuilder() ? 'Approved builder' : isPending() ? 'Application pending' : 'Client';
    const connectId = profile?.stripe_connect_account_id || '';
    const debugBlock = adminOk ? `
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:16px;font-size:13px;line-height:1.8">
        <b>Admin status</b><br>
        Logged in: <code>${esc(logged)}</code><br>
        Builder status: <b>${esc(bs)}</b><br>
        DB is_admin: <b>yes</b><br>
        <a href="https://github.com/danielmenparan-lang/orvo/blob/cursor/orvo-local-site-3bd5/docs/payments/STRIPE-DEPLOY-CHECKLIST.md" target="_blank" rel="noopener" style="color:var(--o)">Stripe deploy checklist →</a>
      </div>` : '';
    const connectBlock = isBuilder() ? `
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:16px;font-size:13px;line-height:1.6">
        <b>Payouts (Stripe Connect)</b><br>
        ${connectId
          ? `Connected account on file (<code>${esc(connectId.slice(0, 12))}…</code>).`
          : 'Connect Express is required before ORVO can transfer held funds to you.'}
        <button class="btn btn-primary" id="btn-connect-payouts" style="width:100%;margin-top:12px;padding:12px">
          ${connectId ? 'Update payout onboarding' : 'Set up payouts'}
        </button>
        <p style="font-size:12px;color:var(--muted);margin-top:8px">Scaffolded — live onboarding needs Stripe secrets.</p>
      </div>` : '';
    $('view-body').innerHTML = `
      <p><b>${esc(profile?.full_name)}</b></p>
      <p style="color:var(--gray);margin:4px 0 16px">${esc(logged)} · ${role}</p>
      ${healthHtml}
      ${debugBlock}
      ${connectBlock}
      ${adminOk ? '<button class="btn btn-primary" style="width:100%;margin-bottom:10px;padding:12px" data-goto="admin">Review builder applications</button>' : ''}
      ${isBuilder() ? '<button class="btn btn-primary" style="width:100%;margin-bottom:10px;padding:12px" data-goto="jobs">Browse jobs</button>' : ''}
      ${!isBuilder() && !isPending() && !adminOk ? '<button class="btn btn-ghost" style="width:100%;margin-bottom:10px;padding:12px" data-goto="apply">Apply as a builder</button>' : ''}
      <button class="btn btn-ghost" id="logout-btn" style="width:100%;padding:12px">Sign out</button>`;
    $('logout-btn').addEventListener('click', doLogout);
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
    $('btn-connect-payouts')?.addEventListener('click', async () => {
      const btn = $('btn-connect-payouts');
      btn.disabled = true;
      btn.textContent = 'Opening…';
      const r = await tryCreateConnectAccount();
      if (r.ok && r.url) {
        window.location.href = r.url;
        return;
      }
      btn.disabled = false;
      btn.textContent = connectId ? 'Update payout onboarding' : 'Set up payouts';
      toast(r.reason === 'not_configured'
        ? 'Payout onboarding not live yet — Stripe Connect coming next'
        : 'Could not start Connect onboarding', false);
    });
    if (showHealth) refreshFounderSetupBanner();
  }

  function ensureDashOpen() {
    if ($('dashboard').classList.contains('open')) return;
    $('dashboard').classList.add('open');
    document.body.style.overflow = 'hidden';
    renderSidebar();
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
    else if (a === 'close-dash') { e.preventDefault(); closeDash(); }
    else if (a === 'close-quote') closeQuote();
    else if (a === 'close-post') closePost();
    else if (a === 'close-pay') closePay();
    else if (a === 'close-dispute') closeDispute();
    else if (a === 'close-review') closeReview();
    else if (a === 'close-confirm') closeConfirm(false);
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
    if (e.key !== 'Escape') return;
    if ($('confirm-modal')?.classList.contains('open')) closeConfirm(false);
    else if ($('reset-modal')?.classList.contains('open')) closePasswordReset();
    else if ($('review-modal')?.classList.contains('open')) closeReview();
    else if ($('dispute-modal')?.classList.contains('open')) closeDispute();
    else if ($('pay-modal').classList.contains('open')) closePay();
    else if ($('quote-modal').classList.contains('open')) closeQuote();
    else if ($('post-modal').classList.contains('open')) closePost();
    else if ($('auth-modal').classList.contains('open')) closeAuth();
    else if ($('dashboard').classList.contains('open')) closeDash();
  });

  // Enter key on login
  $('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('signup-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doSignup(); });
  $('reset-pass2')?.addEventListener('keydown', e => { if (e.key === 'Enter') submitPasswordReset(); });
  $('reset-btn')?.addEventListener('click', submitPasswordReset);

  // ── BOOT ──
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

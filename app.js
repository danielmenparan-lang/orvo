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
  let chatSub = null;
  let chatPoll = null;
  let postSignupIntent = 'client';
  let adminChannel = null;

  const $ = (id) => document.getElementById(id);
  const FEE = () => window.ORVO_FEE_PERCENT || 0;
  // Fallback if supabase-config.js cached/old
  const ADMIN_EMAIL = 'danielmen.paran@gmail.com';

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
    el.textContent = msg;
    el.style.background = ok ? '#15803D' : '#B91C1C';
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 3500);
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

  async function refreshAdminBadge() {
    if (!isAdmin() || !db) return;
    try {
      const { count } = await needDb().from('builder_applications')
        .select('*', { count: 'exact', head: true }).eq('status', 'pending');
      const btn = $('nav-main-btn');
      if (btn) btn.textContent = count ? `Review builders (${count})` : 'Review builders';
    } catch { /* SQL not ready */ }
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
    }
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
        btn.textContent = 'Browse jobs';
        btn.dataset.action = 'jobs';
      } else {
        btn.textContent = 'Post request';
        btn.dataset.action = 'post';
      }
    }
  }

  // ── MODALS ──
  function openAuth(tab) {
    hideMsg('login-msg'); hideMsg('signup-msg');
    $('auth-modal').classList.add('open');
    setAuthTab(tab || 'login');
  }
  function closeAuth() { $('auth-modal').classList.remove('open'); }
  function setAuthTab(t) {
    const login = t === 'login';
    $('tab-login').classList.toggle('active', login);
    $('tab-signup').classList.toggle('active', !login);
    $('panel-login').classList.toggle('hidden', !login);
    $('panel-signup').classList.toggle('hidden', login);
  }
  function openPost() {
    if (!user) { openAuth('login'); showMsg('login-msg', 'Sign in first', false); return; }
    hideMsg('post-msg');
    $('post-modal').classList.add('open');
  }
  function closePost() { $('post-modal').classList.remove('open'); }
  function openQuoteModal(reqId) {
    quoteRequestId = reqId;
    hideMsg('quote-msg');
    $('quote-price').value = '';
    if ($('quote-eta')) $('quote-eta').value = '';
    $('quote-text').value = '';
    $('quote-modal').classList.add('open');
  }
  function closeQuote() { $('quote-modal').classList.remove('open'); quoteRequestId = null; }

  function openPaySheet({ qid, rid, amountCents, fee, builderNet }) {
    pendingPay = { qid, rid, amountCents, fee, builderNet };
    const sheet = $('pay-sheet');
    sheet.classList.remove('done');
    $('pay-title').textContent = 'Accept & pay';
    $('pay-sub').textContent = 'Review the quote before locking in this builder';
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
    $('pay-note').innerHTML =
      'Card checkout is not live yet. Accepting locks this builder and marks the job ' +
      '<strong>awaiting payment</strong> — not funded. Stripe Checkout is coming next.';
    const msg = $('pay-msg');
    msg.className = 'msg hidden';
    msg.textContent = '';
    $('pay-confirm-btn').disabled = false;
    $('pay-confirm-btn').textContent = 'Accept quote — await payment';
    $('pay-cancel-btn').textContent = 'Cancel';
    $('pay-modal').classList.add('open');
  }

  function closePay() {
    $('pay-modal').classList.remove('open');
    pendingPay = null;
    const sheet = $('pay-sheet');
    if (sheet) sheet.classList.remove('done');
  }

  function showPayAwaitingState(extraNote) {
    const sheet = $('pay-sheet');
    sheet.classList.add('done');
    $('pay-title').textContent = 'Awaiting payment';
    $('pay-sub').textContent = 'Builder locked — checkout coming soon';
    $('pay-note').innerHTML =
      'Quote accepted. Status is <strong>awaiting payment</strong>, not funded. ' +
      'When Stripe Checkout goes live, you will pay here and funds will be held until you release.';
    showMsg('pay-msg', extraNote || 'Checkout coming — no card charged yet', true);
    $('pay-cancel-btn').textContent = 'Close';
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

  /** Signup only: honor intent. Login always uses role via openDash(). */
  function routeAfterSignup(intent) {
    openDash();
    if (intent === 'builder' && !isBuilder() && !isPending()) go('apply');
  }

  /** Login / session restore: role only — never signup intent. */
  function routeAfterLogin() {
    postSignupIntent = 'client';
    openDash();
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
  function openDash() {
    if (!user) { openAuth('login'); return; }
    $('dashboard').classList.add('open');
    document.body.style.overflow = 'hidden';
    renderSidebar();
    if (isAdmin()) go('admin');
    else if (isBuilder()) go('jobs');
    else if (isPending()) go('status');
    else go('requests');
  }

  function closeDash() {
    $('dashboard').classList.remove('open');
    document.body.style.overflow = '';
    stopChat();
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
      <button class="side-item" data-view="profile">Profile</button>`;
    $('sidebar').innerHTML = h;
    $('sidebar').querySelectorAll('[data-view]').forEach(el => {
      el.addEventListener('click', () => go(el.dataset.view));
    });
  }

  function go(v, id) {
    if (v !== 'chat') {
      if (chatSub && db) db.removeChannel(chatSub);
      chatSub = null;
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
      openDash();
      go('requests');
      toast('Request posted!', true);
    } catch (e) {
      showMsg('post-msg', e.message, false);
    } finally { btn.disabled = false; }
  }

  async function loadRequests() {
    const body = $('view-body');
    body.innerHTML = '<p class="empty">Loading...</p>';
    const { data, error } = await needDb().from('requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (error) { body.innerHTML = `<p class="empty err">${esc(error.message)}</p>`; return; }
    if (!data?.length) {
      body.innerHTML = `<p class="empty">No requests yet.</p>
        <p class="empty" style="padding-top:8px;font-size:13px">Post your first agent brief — vetted builders worldwide reply with quotes in USD.</p>
        <button class="btn btn-primary" style="margin-top:16px;padding:12px 24px" data-action="post">+ Post request</button>`;
      return;
    }
    body.innerHTML = data.map(r => `
      <div class="card" data-click="${r.id}">
        <span class="tag">${esc(r.category || 'Project')}</span>
        <h3>${esc(r.title)}</h3>
        <p>${esc(r.description.slice(0, 120))}</p>
        <span class="badge">${esc(statusLabel(r.status))} · ${ago(r.created_at)}</span>
      </div>`).join('');
    body.querySelectorAll('[data-click]').forEach(el => {
      el.addEventListener('click', () => go('chat', el.dataset.click));
    });
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
    const { data, error } = await needDb().from('requests').select('*').eq('status', 'open').order('created_at', { ascending: false });
    if (error) {
      body.innerHTML = `<p class="empty err">${esc(userFacingErr(error.message))}</p>`;
      return;
    }
    if (!data?.length) {
      body.innerHTML = `<p class="empty">No open jobs right now.</p>
        <p class="empty" style="padding-top:8px;font-size:13px">Check back soon — new client briefs from anywhere appear here. Quotes are in USD.</p>`;
      return;
    }
    const { data: myQuotes } = await needDb().from('quotes').select('request_id').eq('builder_id', user.id);
    const quotedIds = new Set((myQuotes || []).map(q => q.request_id));
    body.innerHTML = data.map(r => {
      const canMsg = isAdmin() || quotedIds.has(r.id) || r.assigned_builder_id === user.id;
      return `
      <div class="card">
        <span class="tag">${esc(r.category || 'Project')}</span>
        <h3>${esc(r.title)}</h3>
        <p>${esc(r.description)}</p>
        <p>Budget: ${esc(r.budget || 'Not specified')}</p>
        <div class="row">
          <button class="btn btn-primary btn-quote" data-rid="${r.id}">Send quote</button>
          ${canMsg ? `<button class="btn btn-ghost btn-chat" data-rid="${r.id}">Message</button>` : ''}
        </div>
      </div>`;
    }).join('');
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
      msg = `ETA: ${eta} day${eta === 1 ? '' : 's'}\n\n` + msg;
      const { error } = await needDb().from('quotes').insert({
        request_id: quoteRequestId,
        builder_id: user.id,
        amount_cents: cents,
        message: msg,
        status: 'pending',
      });
      if (error) throw error;
      closeQuote();
      go('quotes');
      toast('Quote sent!', true);
    } catch (e) {
      showMsg('quote-msg', e.message, false);
    } finally { btn.disabled = false; }
  }

  async function loadQuotes() {
    const body = $('view-body');
    const { data, error } = await needDb().from('quotes').select('*, requests(title)').eq('builder_id', user.id).order('created_at', { ascending: false });
    if (error) { body.innerHTML = `<p class="empty err">${esc(error.message)}</p>`; return; }
    if (!data?.length) {
      body.innerHTML = `<p class="empty">No quotes yet.</p>
        <p class="empty" style="padding-top:8px;font-size:13px">Browse open jobs and send your first quote in USD.</p>
        <button class="btn btn-primary" style="margin-top:16px;padding:12px 24px" data-goto="jobs">Browse jobs</button>`;
      return;
    }
    body.innerHTML = data.map(q => `
      <div class="card" data-click="${q.request_id}">
        <h3>${esc(q.requests?.title || 'Project')}</h3>
        <p>${esc(q.message)}</p>
        <span class="badge">${money(q.amount_cents)} · ${esc(statusLabel(q.status))}</span>
      </div>`).join('');
    body.querySelectorAll('[data-click]').forEach(el => {
      el.addEventListener('click', () => go('chat', el.dataset.click));
    });
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
      <div class="field"><label>Bio (min 50 characters)</label><textarea id="apply-bio" placeholder="Your experience building AI agents — tools, projects, what you can deliver..."></textarea></div>
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
    $('view-action').innerHTML = '<button class="btn btn-ghost" id="admin-refresh">Refresh</button>';
    $('admin-refresh')?.addEventListener('click', loadAdmin);

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
          <div class="card" style="flex:1;min-width:120px;cursor:default"><p style="font-size:12px;color:var(--gray)">Pending builders</p><h3>${pendingBuilders}</h3></div>
          <div class="card" style="flex:1;min-width:120px;cursor:default"><p style="font-size:12px;color:var(--gray)">Open requests</p><h3>${openReqs}</h3></div>
          <div class="card" style="flex:1;min-width:120px;cursor:default"><p style="font-size:12px;color:var(--gray)">Awaiting pay</p><h3>${awaitingPay}</h3></div>
          <div class="card" style="flex:1;min-width:120px;cursor:default"><p style="font-size:12px;color:var(--gray)">Funded</p><h3>${funded}</h3></div>
          <div class="card" style="flex:1;min-width:120px;cursor:default"><p style="font-size:12px;color:var(--gray)">Completed</p><h3>${completed}</h3></div>
          <div class="card" style="flex:1;min-width:120px;cursor:default"><p style="font-size:12px;color:var(--gray)">Disputes</p><h3>${openDisputes}</h3></div>
          <div class="card" style="flex:1;min-width:120px;cursor:default"><p style="font-size:12px;color:var(--gray)">Approved builders</p><h3>${approvedBuilders}</h3></div>
        </div>
        <h3 style="margin:8px 0 12px;font-size:16px">Pending builder applications</h3>`;
    } catch (_) {
      kpiHtml = '';
    }

    const { data, error } = await needDb().from('builder_applications')
      .select('*').eq('status', 'pending').order('created_at', { ascending: false });
    if (error) {
      $('view-body').innerHTML = kpiHtml + `<p class="empty err">${esc(userFacingErr(error.message))}</p>`;
      return;
    }
    if (!data?.length) {
      $('view-body').innerHTML = kpiHtml + `<p class="empty">No pending applications yet.</p>
        <p class="empty" style="padding-top:12px;font-size:13px;color:var(--gray)">
          Builders submit via Apply (bio 50+ chars). Use <b>All requests</b> to invite approved builders.
        </p>`;
      return;
    }
    $('view-body').innerHTML = kpiHtml + data.map(a => `
      <div class="card">
        <h3>${esc(a.full_name)}</h3>
        <p style="font-size:13px;color:var(--gray);margin-bottom:8px">${esc(a.email || '')}</p>
        <p><b>Skills:</b> ${esc(a.skills)}</p>
        <p>${esc(a.bio)}</p>
        <div class="row">
          <button class="btn btn-primary btn-approve" data-uid="${a.user_id}">Approve</button>
          <button class="btn btn-ghost btn-reject" data-uid="${a.user_id}">Reject</button>
        </div>
      </div>`).join('');
    $('view-body').querySelectorAll('.btn-approve').forEach(b => b.addEventListener('click', () => approveBuilder(b.dataset.uid)));
    $('view-body').querySelectorAll('.btn-reject').forEach(b => b.addEventListener('click', () => rejectBuilder(b.dataset.uid)));
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
    body.innerHTML = '<p class="empty">Loading...</p>';
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
    const { data, error } = await needDb().from('requests').select('*').order('created_at', { ascending: false }).limit(40);
    if (error) { $('view-body').innerHTML = `<p class="empty err">${esc(error.message)}</p>`; return; }
    const { data: builders } = await needDb().from('profiles')
      .select('id,full_name,email').eq('builder_status', 'approved').limit(50);
    const builderOpts = (builders || []).map(b =>
      `<option value="${b.id}">${esc(b.full_name || b.email || b.id)}</option>`
    ).join('');
    $('view-body').innerHTML = (data || []).map(r => `
      <div class="card" style="cursor:default">
        <h3>${esc(r.title)}</h3>
        <p>${esc(statusLabel(r.status))} · ${ago(r.created_at)}${r.location ? ' · ' + esc(r.location) : ''}</p>
        <p style="font-size:13px;color:var(--gray);margin:8px 0">${esc((r.description || '').slice(0, 140))}</p>
        <div class="row" style="align-items:center">
          <select class="invite-builder" data-rid="${r.id}" style="flex:1;min-width:160px;padding:10px;border:1px solid var(--border);border-radius:8px">
            <option value="">Invite builder…</option>
            ${builderOpts}
          </select>
          <button class="btn btn-primary btn-invite" data-rid="${r.id}">Invite</button>
          <button class="btn btn-ghost btn-open-req" data-rid="${r.id}">Open</button>
        </div>
      </div>`).join('') || '<p class="empty">No requests</p>';
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
    const { data, error } = await needDb().from('disputes')
      .select('*').in('status', ['open', 'under_review']).order('created_at', { ascending: false });
    if (error) {
      $('view-body').innerHTML = `<p class="empty err">${esc(userFacingErr(error.message))}</p>`;
      return;
    }
    if (!data?.length) {
      $('view-body').innerHTML = '<p class="empty">No open disputes</p>';
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
    if (chatPoll) clearInterval(chatPoll);
    chatPoll = null;
    chatRequestId = null;
    chatRequestStatus = 'open';
  }

  async function loadChat() {
    if (!chatRequestId) { go('messages'); return; }
    const rid = chatRequestId;
    if (chatSub && db) db.removeChannel(chatSub);
    chatSub = null;
    if (chatPoll) clearInterval(chatPoll);
    chatPoll = null;
    chatRequestId = rid;

    const { data: req } = await needDb().from('requests').select('*').eq('id', rid).single();
    if (!(await canChatOnRequest(req))) {
      toast('Message only after you quote or are assigned to this job.', false);
      go(isBuilder() ? 'jobs' : 'messages');
      return;
    }
    chatRequestStatus = req?.status || 'open';
    let quotesHtml = '';

    if (req?.user_id === user.id) {
      const { data: quotes } = await needDb().from('quotes').select('*').eq('request_id', rid);
      const ids = [...new Set((quotes || []).map(q => q.builder_id))];
      const { data: profs } = ids.length ? await needDb().from('profiles').select('id,full_name').in('id', ids) : { data: [] };
      const names = Object.fromEntries((profs || []).map(p => [p.id, p.full_name]));
      quotesHtml = (quotes || []).length ? (quotes || []).map(q => `
        <div class="card" style="cursor:default">
          <h3>${esc(names[q.builder_id] || 'Builder')} — ${money(q.amount_cents)}</h3>
          <p>${esc(q.message)}</p>
          ${q.status === 'pending' ? `<button class="btn btn-primary btn-pay" data-qid="${q.id}" data-rid="${rid}">Accept & pay</button>` : `<span class="badge">${esc(statusLabel(q.status))}</span>`}
        </div>`).join('') : `<p class="empty">Waiting for quotes...</p>
          <p class="empty" style="padding-top:8px;font-size:13px">Vetted builders worldwide will reply here with USD quotes.</p>`;
    }

    let escrowHtml = '';
    if (req?.status === 'disputed') {
      escrowHtml = `<div class="card" style="cursor:default;margin-bottom:16px"><b>Dispute open</b><p>Release is frozen until ORVO admin reviews.</p></div>`;
    } else if (req && ['awaiting_payment', 'funded', 'delivered', 'in_progress'].includes(req.status)) {
      const isClient = req.user_id === user.id;
      const isAssigned = req.assigned_builder_id === user.id;
      if (isClient && req.status === 'awaiting_payment') {
        escrowHtml = `<div class="card" style="cursor:default;margin-bottom:16px"><b>Payment</b>
          <p>Quote accepted. Card checkout is coming soon — ORVO will hold funds until you approve delivery.</p>
          <span class="badge">${esc(statusLabel(req.status))}</span></div>`;
      }
      if (isAssigned && req.status === 'funded') {
        escrowHtml = `<div class="card" style="cursor:default;margin-bottom:16px"><b>Delivery</b>
          <p>Share a demo link (optional) and mark delivered when the client can test.</p>
          <div class="field" style="margin:12px 0"><input id="deliver-url" placeholder="https://demo.example.com"/></div>
          <button class="btn btn-primary" id="btn-mark-delivered" data-rid="${rid}">Mark delivered</button></div>`;
      }
      if (isClient && (req.status === 'funded' || req.status === 'delivered')) {
        escrowHtml += `<div class="card" style="cursor:default;margin-bottom:16px"><b>Release</b><p>Status: <span class="badge">${esc(statusLabel(req.status))}</span>. Release when you're satisfied.</p>
          <button class="btn btn-primary" id="btn-release-pay" data-rid="${rid}">Release payment to builder</button>
          <button class="btn btn-ghost" id="btn-open-dispute" data-rid="${rid}" style="margin-left:8px">Open dispute</button></div>`;
      }
    }
    if (req?.status === 'completed' && req.user_id === user.id) {
      escrowHtml += `<div class="card" style="cursor:default;margin-bottom:16px"><b>Review</b>
        <p>How was this builder? Leave a 1–5 star review.</p>
        <button class="btn btn-primary" id="btn-leave-review" data-rid="${rid}" data-builder="${req.assigned_builder_id || ''}">Leave review</button></div>`;
    }

    $('view-body').innerHTML = `
      <h3 style="margin-bottom:12px">${esc(req?.title || 'Chat')}</h3>
      ${req?.user_id === user.id ? `<div style="margin-bottom:16px"><b>Quotes</b>${quotesHtml}</div>` : ''}
      ${escrowHtml}
      <p class="chat-hint">No emails or phone numbers. Off-platform contact links blocked. Agent/demo links (GitHub, Vercel, n8n…) are OK.</p>
      <div class="chat">
        <div class="chat-msgs" id="chat-msgs"></div>
        <form class="chat-send" id="chat-form">
          <input id="chat-input" placeholder="Type a message..." autocomplete="off"/>
          <button class="btn btn-primary" type="submit">Send</button>
        </form>
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
    $('chat-form').addEventListener('submit', sendMsg);
    await renderMsgs();
    chatSub = needDb().channel('c-' + rid)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'request_id=eq.' + rid }, renderMsgs)
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
      return `<div class="chat-bubble ${mine ? 'me' : 'them'}"><small>${mine ? 'You' : esc(names[m.sender_id] || 'User')}</small>${esc(m.body)}</div>`;
    }).join('') || '<p class="empty" style="padding:20px">Start chatting...</p>';
    box.scrollTop = box.scrollHeight;
  }

  async function sendMsg(e) {
    e.preventDefault();
    const input = $('chat-input');
    const body = input.value.trim();
    if (!body || !chatRequestId) return;
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
    const byId = new Map();
    // Own requests (client relationship)
    const { data: own } = await needDb().from('requests')
      .select('id,title,created_at').eq('user_id', user.id);
    (own || []).forEach(r => byId.set(r.id, { id: r.id, title: r.title, t: r.created_at }));

    if (isBuilder() || isAdmin()) {
      const { data: quotes } = await needDb().from('quotes')
        .select('request_id, requests(title,created_at)').eq('builder_id', user.id);
      (quotes || []).forEach(q => {
        if (!q.request_id || byId.has(q.request_id)) return;
        byId.set(q.request_id, { id: q.request_id, title: q.requests?.title, t: q.requests?.created_at });
      });
      const { data: assigned } = await needDb().from('requests')
        .select('id,title,created_at').eq('assigned_builder_id', user.id);
      (assigned || []).forEach(r => {
        if (!byId.has(r.id)) byId.set(r.id, { id: r.id, title: r.title, t: r.created_at });
      });
    }

    const list = [...byId.values()].sort((a, b) => new Date(b.t || 0) - new Date(a.t || 0));
    if (!list.length) {
      $('view-body').innerHTML = `<p class="empty">No conversations yet.</p>
        <p class="empty" style="padding-top:8px;font-size:13px">Post a request or send a quote to start messaging on ORVO.</p>`;
      return;
    }
    $('view-body').innerHTML = list.map(r => `
      <div class="card" data-click="${r.id}">
        <h3>${esc(r.title || 'Chat')}</h3>
        <span class="badge">${ago(r.t)}</span>
      </div>`).join('');
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
      const { error: e1 } = await needDb().from('requests').update({ status: 'completed' }).eq('id', rid);
      if (e1) throw e1;
      if (isAdmin() && pay.status === 'held') {
        const { error: e2 } = await needDb().from('payments')
          .update({ status: 'released', released_at: new Date().toISOString() })
          .eq('request_id', rid);
        if (e2) throw e2;
        toast('Payment released to builder', true);
      } else if (pay.status === 'held') {
        toast('Delivery accepted — ORVO will settle payout to the builder', true);
      } else {
        toast('Project completed', true);
      }
      loadChat();
    } catch (e) { toast(userFacingErr(e.message), false); }
  }

  async function acceptQuote(qid, rid) {
    const { data: q } = await needDb().from('quotes').select('*').eq('id', qid).single();
    if (!q) return;
    const fee = FEE() > 0 ? Math.round(q.amount_cents * FEE() / 100) : 0;
    openPaySheet({
      qid,
      rid,
      amountCents: q.amount_cents,
      fee,
      builderNet: q.amount_cents - fee,
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
      const { error: e3 } = await needDb().from('payments').insert({
        user_id: user.id, request_id: rid, quote_id: qid,
        amount_cents: amountCents, platform_fee_cents: fee,
        builder_payout_cents: builderNet,
        status: 'pending',
      });
      if (e3) throw e3;
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
      showPayAwaitingState(note);
      toast('Quote accepted — awaiting payment (not funded yet)', true);
      pendingPay = null;
      loadChat();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Accept quote — await payment';
      showMsg('pay-msg', userFacingErr(e.message), false);
      toast(e.message, false);
    }
  }

  async function loadProfileView() {
    const logged = (user?.email || '').toLowerCase().trim();
    const adminOk = isAdmin();
    const bs = profile?.builder_status || 'none';
    const role = adminOk ? 'ORVO Admin' : isBuilder() ? 'Approved builder' : isPending() ? 'Application pending' : 'Client';
    const debugBlock = adminOk ? `
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:16px;font-size:13px;line-height:1.8">
        <b>Admin status</b><br>
        Logged in: <code>${esc(logged)}</code><br>
        Builder status: <b>${esc(bs)}</b><br>
        DB is_admin: <b>yes</b>
      </div>` : '';
    $('view-body').innerHTML = `
      <p><b>${esc(profile?.full_name)}</b></p>
      <p style="color:var(--gray);margin:4px 0 16px">${esc(logged)} · ${role}</p>
      ${debugBlock}
      ${adminOk ? '<button class="btn btn-primary" style="width:100%;margin-bottom:10px;padding:12px" data-goto="admin">Review builder applications</button>' : ''}
      ${isBuilder() ? '<button class="btn btn-primary" style="width:100%;margin-bottom:10px;padding:12px" data-goto="jobs">Browse jobs</button>' : ''}
      ${!isBuilder() && !isPending() && !adminOk ? '<button class="btn btn-ghost" style="width:100%;margin-bottom:10px;padding:12px" data-goto="apply">Apply as a builder</button>' : ''}
      <button class="btn btn-ghost" id="logout-btn" style="width:100%;padding:12px">Sign out</button>`;
    $('logout-btn').addEventListener('click', doLogout);
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
    else if (a === 'tab-login') setAuthTab('login');
    else if (a === 'tab-signup') setAuthTab('signup');
    else if (a === 'home') {
      e.preventDefault();
      closeDash(); closeAuth(); closePost(); closeQuote(); closePay(); closeDispute(); closeReview(); closeConfirm(false);
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
    else if (a === 'jobs') { e.preventDefault(); user ? (openDash(), go('jobs')) : openAuth('login'); }
    else if (a === 'admin') { e.preventDefault(); user ? (openDash(), go('admin')) : openAuth('login'); }
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
    db.auth.onAuthStateChange(refreshUser);
  }

  // Design: gate hero entrance motion (CSS .ui-ready)
  requestAnimationFrame(() => document.body.classList.add('ui-ready'));

  boot();
})();

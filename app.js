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

  function money(c) {
    return '$' + (c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 });
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
      paid: 'Paid',
      rejected: 'Declined',
      withdrawn: 'Withdrawn',
      held: 'Held',
      released: 'Released',
    };
    return map[s] || s || 'Unknown';
  }

  function userFacingErr(msg) {
    if (isAdmin()) return msg;
    return String(msg || 'Something went wrong').replace(/sql-[\w.-]+\.sql/gi, 'database setup').replace(/Supabase/gi, 'database');
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
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  // ── CHAT FILTER (keep deals on ORVO; allow agent/demo links) ──
  const CHAT_OFF_PLATFORM = [
    /whatsapp\.com|wa\.me|web\.whatsapp/i,
    /t\.me\/|telegram\.(me|org)/i,
    /paypal\.(com|me)|venmo\.com|cash\.app|zellepay/i,
    /linkedin\.com\/in\//i,
    /facebook\.com|fb\.com|messenger\.com/i,
    /instagram\.com|twitter\.com|x\.com/i,
    /mailto:/i,
    /calendly\.com|calendar\.app/i,
    /discord\.gg|discord\.com\/invite/i,
  ];
  const CHAT_AGENT_HOST = [
    /github\.com|gitlab\.com|bitbucket\.org/i,
    /vercel\.app|netlify\.app|pages\.dev|cloudflare\.com|workers\.dev/i,
    /replit\.app|repl\.co|render\.com|railway\.app|fly\.dev|herokuapp\.com/i,
    /bubble\.io|glide\.page|softr\.app|webflow\.io/i,
    /supabase\.co/i,
    /n8n\.io|make\.com|zapier\.com/i,
    /lovable\.app|v0\.dev|bolt\.new|cursor\.com/i,
    /notion\.site|airtable\.com/i,
    /docs\.google\.com|drive\.google\.com/i,
    /openai\.com\/g\//i,
    /huggingface\.co/i,
  ];
  const CHAT_EMAIL = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/;
  const CHAT_URL = /(?:https?:\/\/|www\.)[^\s<>"']+|(?:[a-zA-Z0-9-]+\.)+(?:com|io|app|dev|co|net|org|ai|me)\/[^\s]*/gi;

  function chatUrls(text) {
    return text.match(CHAT_URL) || [];
  }

  function chatOffPlatform(url) {
    return CHAT_OFF_PLATFORM.some((re) => re.test(url));
  }

  function chatAgentLink(url) {
    if (chatOffPlatform(url)) return false;
    return CHAT_AGENT_HOST.some((re) => re.test(url));
  }

  function chatPaidPhase(status) {
    return status === 'in_progress' || status === 'funded' || status === 'completed';
  }

  function chatHasPhone(text) {
    const t = text
      .replace(/\$\s?[\d,]+(?:\.\d+)?/g, ' ')
      .replace(/\b[\d,]+\s*(?:usd|dollars?|€|eur|₪|ils)\b/gi, ' ');
    if (/(?:\+972|972|0)[-.\s]?5\d[-.\s]?\d{7}/.test(t)) return true;
    if (/(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(t)) return true;
    const digits = t.replace(/\D/g, '');
    return digits.length >= 9 && digits.length <= 15;
  }

  function validateChatMessage(body, requestStatus) {
    if (CHAT_EMAIL.test(body)) {
      return { ok: false, msg: 'Email addresses are blocked. Keep communication on ORVO.' };
    }
    if (chatHasPhone(body)) {
      return { ok: false, msg: 'Phone numbers are blocked. Keep communication on ORVO.' };
    }
    for (const raw of chatUrls(body)) {
      const url = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
      if (chatOffPlatform(url)) {
        return { ok: false, msg: 'WhatsApp, PayPal, social, and similar links are not allowed.' };
      }
      if (!chatPaidPhase(requestStatus) && !chatAgentLink(url)) {
        return {
          ok: false,
          msg: 'Before payment: agent/demo links only (GitHub, Vercel, n8n, etc.). After payment, more links are allowed.',
        };
      }
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
      bootErr('Database error — run sql-fix-profiles.sql in Supabase. ' + error.message);
      return;
    }

    // New signups: wait for trigger to create profile
    if (!data) {
      await new Promise((r) => setTimeout(r, 600));
      ({ data, error } = await needDb().from('profiles').select('*').eq('id', user.id).maybeSingle());
      if (error) {
        bootErr('Database error — run sql-fix-profiles.sql in Supabase. ' + error.message);
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
        bootErr('Session out of sync — Sign out, run sql-fix-profiles.sql in Supabase, then Sign in again.');
        return;
      }
      bootErr('Profile error — run sql-fix-profiles.sql in Supabase. ' + insErr.message);
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
    $('quote-text').value = '';
    $('quote-modal').classList.add('open');
  }
  function closeQuote() { $('quote-modal').classList.remove('open'); quoteRequestId = null; }

  function routeAfterAuth(intent) {
    openDash();
    if (intent === 'builder') go('apply');
    else go('requests');
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
        postSignupIntent = $('signup-intent')?.value || 'client';
        await refreshUser();
        closeAuth();
        routeAfterAuth(postSignupIntent);
        toast('Welcome!', true);
        return;
      }
      setAuthTab('login');
      postSignupIntent = $('signup-intent')?.value || 'client';
      showMsg('login-msg', 'Account created! Sign in to continue.', true);
    } catch (e) {
      showMsg('signup-msg', e.message, false);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create account';
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
      routeAfterAuth(postSignupIntent);
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
        <button class="side-item" data-view="all-requests">All requests</button>`;
    }
    if (isBuilder()) {
      h += `<div class="side-label">Builder</div>
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
    };
    $('view-title').textContent = titles[v] || 'Dashboard';

    if (v === 'requests') { $('view-action').innerHTML = '<button class="btn btn-primary" data-action="post">+ Post request</button>'; loadRequests(); }
    else if (v === 'jobs') loadJobs();
    else if (v === 'quotes') loadQuotes();
    else if (v === 'messages') loadThreads();
    else if (v === 'chat') loadChat();
    else if (v === 'apply') loadApply();
    else if (v === 'status') loadStatus();
    else if (v === 'profile') loadProfileView();
    else if (v === 'admin') loadAdmin();
    else if (v === 'all-requests') loadAllRequests();
  }

  // ── CLIENT ──
  async function doPost() {
    const btn = $('post-btn');
    btn.disabled = true;
    try {
      const title = ($('post-title')?.value || '').trim();
      const desc = $('post-desc').value.trim();
      if (!title) throw new Error('Add a short title');
      if (!desc) throw new Error('Describe your project');
      const { error } = await needDb().from('requests').insert({
        user_id: user.id,
        title: title.slice(0, 80),
        description: desc,
        category: $('post-cat').value,
        budget: $('post-budget').value.trim() || null,
        status: 'open',
      });
      if (error) throw error;
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
    if (!data?.length) { body.innerHTML = '<p class="empty">No requests yet. Click <b>+ Post request</b></p>'; return; }
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
        <p class="empty" style="padding-top:8px;font-size:12px">Clients must post with status "open". If you were just approved, sign out and back in.</p>`;
      return;
    }
    body.innerHTML = data.map(r => `
      <div class="card">
        <span class="tag">${esc(r.category || 'Project')}</span>
        <h3>${esc(r.title)}</h3>
        <p>${esc(r.description)}</p>
        <p>Budget: ${esc(r.budget || 'Not specified')}</p>
        <div class="row">
          <button class="btn btn-primary btn-quote" data-rid="${r.id}">Send quote</button>
          <button class="btn btn-ghost btn-chat" data-rid="${r.id}">Message</button>
        </div>
      </div>`).join('');
    body.querySelectorAll('.btn-quote').forEach(b => b.addEventListener('click', () => openQuoteModal(b.dataset.rid)));
    body.querySelectorAll('.btn-chat').forEach(b => b.addEventListener('click', () => go('chat', b.dataset.rid)));
  }

  async function doQuote() {
    if (!quoteRequestId) return;
    const btn = $('quote-btn');
    btn.disabled = true;
    try {
      const cents = parseMoney($('quote-price').value);
      const msg = $('quote-text').value.trim();
      if (cents < 100) throw new Error('Enter valid price (min $1)');
      if (!msg) throw new Error('Add a message');
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
    if (!data?.length) { body.innerHTML = '<p class="empty">No quotes yet</p>'; return; }
    body.innerHTML = data.map(q => `
      <div class="card" data-click="${q.request_id}">
        <h3>${esc(q.requests?.title || 'Project')}</h3>
        <p>${esc(q.message)}</p>
        <span class="badge">${money(q.amount_cents)} · ${esc(q.status)}</span>
      </div>`).join('');
    body.querySelectorAll('[data-click]').forEach(el => {
      el.addEventListener('click', () => go('chat', el.dataset.click));
    });
  }

  async function loadApply() {
    if (isBuilder()) { go('jobs'); return; }
    if (isPending()) { go('status'); return; }
    $('view-body').innerHTML = `
      <p style="color:var(--gray);font-size:14px;margin-bottom:20px">ORVO reviews every builder manually. Once approved, you can browse jobs and send quotes.</p>
      <div class="field"><label>Bio (min 50 characters)</label><textarea id="apply-bio" placeholder="Your experience building AI agents — tools, projects, what you can deliver..."></textarea></div>
      <div class="field"><label>Skills (comma separated)</label><input id="apply-skills" placeholder="Cursor, n8n, WhatsApp bots, Voice AI"/></div>
      <div class="field"><label>Portfolio URL <span style="font-weight:400;color:var(--gray)">(optional)</span></label><input id="apply-portfolio" placeholder="GitHub, website, or leave empty"/></div>
      <div class="field"><label>LinkedIn <span style="font-weight:400;color:var(--gray)">(optional)</span></label><input id="apply-linkedin" placeholder="https://linkedin.com/in/..."/></div>
      <div class="field"><label>Years of experience</label><input id="apply-years" type="number" min="0" value="0"/></div>
      <button class="btn-black" id="apply-btn">Submit application</button>`;
    $('apply-btn').addEventListener('click', doApply);
  }

  async function doApply() {
    const bio = $('apply-bio').value.trim();
    if (bio.length < 50) { toast('Bio must be at least 50 characters', false); return; }
    const skills = $('apply-skills').value.trim();
    if (!skills) { toast('Add at least one skill', false); return; }
    const btn = $('apply-btn');
    btn.disabled = true;
    btn.textContent = 'Submitting...';
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
      toast('Application sent! Admin will see it in Review builders.', true);
      if (!saved) console.warn('ORVO: application saved but no row returned');
    } catch (e) {
      toast(e.message, false);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Submit application';
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
      <p><strong>Status:</strong> <span class="badge">${esc(app.status)}</span></p>
      <p style="color:var(--gray);margin:12px 0 20px;font-size:14px">${msgs[app.status] || ''}</p>
      <p style="font-size:13px;color:var(--gray)">Submitted ${ago(app.created_at)}</p>
      ${app.status === 'approved' ? '<button class="btn btn-primary" style="margin-top:20px;padding:12px 28px" data-goto="jobs">Browse jobs</button>' : ''}
      ${app.status === 'pending' ? '<button class="btn btn-ghost" style="margin-top:12px;padding:12px 28px" data-goto="apply">Edit application</button>' : ''}`;
  }

  // ── ADMIN ──
  async function loadAdmin() {
    if (!isAdmin()) {
      $('view-body').innerHTML = `<p class="empty">Admin: sign in as <b>${esc(adminEmail())}</b><br>Then run <b>sql-RUN-NOW.sql</b> in Supabase</p>`;
      return;
    }
    refreshAdminBadge();
    $('view-action').innerHTML = '<button class="btn btn-ghost" id="admin-refresh">Refresh</button>';
    $('admin-refresh')?.addEventListener('click', loadAdmin);
    const { data, error } = await needDb().from('builder_applications')
      .select('*').eq('status', 'pending').order('created_at', { ascending: false });
    if (error) {
      $('view-body').innerHTML = `<p class="empty err">${esc(error.message)}<br><br>Run <b>sql-RUN-NOW.sql</b> in Supabase SQL Editor</p>`;
      return;
    }
    if (!data?.length) {
      $('view-body').innerHTML = `<p class="empty">No pending applications yet.</p>
        <p class="empty" style="padding-top:12px;font-size:13px;color:var(--gray)">
          Builder must click <b>Submit application</b> (bio 50+ chars).<br>
          Check Supabase → Table Editor → builder_applications.<br>
          Click <b>Refresh</b> above after a builder applies.
        </p>`;
      return;
    }
    $('view-body').innerHTML = data.map(a => `
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
      if (e1) throw new Error('Approve failed: ' + e1.message + ' — run sql-fix-jobs.sql');
      const { error: e2 } = await needDb().from('profiles')
        .update({ builder_status: 'approved' }).eq('id', uid);
      if (e2) throw new Error('Profile update failed: ' + e2.message + ' — run sql-fix-jobs.sql');
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

  async function loadAllRequests() {
    const { data, error } = await needDb().from('requests').select('*').order('created_at', { ascending: false }).limit(30);
    if (error) { $('view-body').innerHTML = `<p class="empty err">${esc(error.message)}</p>`; return; }
    $('view-body').innerHTML = (data || []).map(r => `
      <div class="card"><h3>${esc(r.title)}</h3><p>${esc(r.status)} · ${ago(r.created_at)}</p></div>`).join('') || '<p class="empty">No requests</p>';
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
          ${q.status === 'pending' ? `<button class="btn btn-primary btn-pay" data-qid="${q.id}" data-rid="${rid}">Accept & pay</button>` : `<span class="badge">${esc(q.status)}</span>`}
        </div>`).join('') : '<p class="empty">Waiting for quotes...</p>';
    }

    let escrowHtml = '';
    if (req && ['awaiting_payment', 'funded', 'delivered', 'in_progress'].includes(req.status)) {
      const isClient = req.user_id === user.id;
      const isAssigned = req.assigned_builder_id === user.id;
      if (isClient && req.status === 'awaiting_payment') {
        escrowHtml = `<div class="card" style="cursor:default;margin-bottom:16px"><b>Payment</b>
          <p>Quote accepted. Card checkout is coming soon — ORVO will hold funds until you approve delivery.</p>
          <span class="badge">${esc(statusLabel(req.status))}</span></div>`;
      }
      if (isAssigned && req.status === 'funded') {
        escrowHtml = `<div class="card" style="cursor:default;margin-bottom:16px"><b>Delivery</b><p>Mark the agent as delivered when the client can test it.</p>
          <button class="btn btn-primary" id="btn-mark-delivered" data-rid="${rid}">Mark delivered</button></div>`;
      }
      if (isClient && (req.status === 'funded' || req.status === 'delivered')) {
        escrowHtml += `<div class="card" style="cursor:default;margin-bottom:16px"><b>Release</b><p>Status: <span class="badge">${esc(statusLabel(req.status))}</span>. Release payment when you're satisfied.</p>
          <button class="btn btn-primary" id="btn-release-pay" data-rid="${rid}">Release payment to builder</button></div>`;
      }
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
      const check = validateChatMessage(body, chatRequestStatus);
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
    let list = [];
    if (isBuilder()) {
      const { data: quotes } = await needDb().from('quotes').select('request_id, requests(title,created_at)').eq('builder_id', user.id);
      list = (quotes || []).map(q => ({ id: q.request_id, title: q.requests?.title, t: q.requests?.created_at }));
      const { data: open } = await needDb().from('requests').select('id,title,created_at').eq('status', 'open');
      (open || []).forEach(r => { if (!list.find(x => x.id === r.id)) list.push({ id: r.id, title: r.title, t: r.created_at }); });
    } else {
      const { data } = await needDb().from('requests').select('id,title,created_at').eq('user_id', user.id);
      list = (data || []).map(r => ({ id: r.id, title: r.title, t: r.created_at }));
    }
    if (!list.length) { $('view-body').innerHTML = '<p class="empty">No conversations yet</p>'; return; }
    $('view-body').innerHTML = list.map(r => `
      <div class="card" data-click="${r.id}">
        <h3>${esc(r.title || 'Chat')}</h3>
        <span class="badge">${ago(r.t)}</span>
      </div>`).join('');
    $('view-body').querySelectorAll('[data-click]').forEach(el => {
      el.addEventListener('click', () => go('chat', el.dataset.click));
    });
  }

  async function markDelivered(rid) {
    if (!confirm('Mark this project as delivered for client review?')) return;
    try {
      const { error } = await needDb().from('requests').update({ status: 'delivered' }).eq('id', rid);
      if (error) throw error;
      toast('Marked delivered — waiting for client release', true);
      loadChat();
    } catch (e) { toast(e.message, false); }
  }

  async function releasePayment(rid) {
    if (!confirm('Release funds to the builder? This confirms the work is accepted.')) return;
    try {
      const { data: pay, error: pe } = await needDb().from('payments').select('*').eq('request_id', rid).maybeSingle();
      if (pe) throw pe;
      if (!pay || !['held', 'paid'].includes(pay.status)) {
        throw new Error('Nothing to release yet — payment must be held first.');
      }
      if (pay.status === 'paid' && !isAdmin()) {
        throw new Error('This project is not funded yet.');
      }
      const { error: e1 } = await needDb().from('requests').update({ status: 'completed' }).eq('id', rid);
      if (e1) throw e1;
      const { error: e2 } = await needDb().from('payments')
        .update({ status: 'released', released_at: new Date().toISOString() })
        .eq('request_id', rid);
      if (e2) throw e2;
      toast('Payment released to builder', true);
      loadChat();
    } catch (e) { toast(e.message, false); }
  }

  async function acceptQuote(qid, rid) {
    const { data: q } = await needDb().from('quotes').select('*').eq('id', qid).single();
    if (!q) return;
    const fee = FEE() > 0 ? Math.round(q.amount_cents * FEE() / 100) : 0;
    const stripeLink = (window.STRIPE_PAYMENT_LINK || '').trim();
    const feeLine = fee > 0 ? `\n\nORVO fee (${FEE()}%): ${money(fee)}\nBuilder receives: ${money(q.amount_cents - fee)}` : '\n\nFounding fee: 0%';
    const msg = stripeLink
      ? `Accept this quote for ${money(q.amount_cents)} and continue to checkout?${feeLine}`
      : `Accept this quote for ${money(q.amount_cents)}?${feeLine}\n\nCard checkout is not live yet — accepting locks the builder and marks the job awaiting payment (not funded).`;
    if (!confirm(msg)) return;
    try {
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
      const { error: e3 } = await needDb().from('payments').insert({
        user_id: user.id, request_id: rid, quote_id: qid,
        amount_cents: q.amount_cents, platform_fee_cents: fee,
        builder_payout_cents: q.amount_cents - fee,
        status: 'pending',
      });
      if (e3) throw e3;
      if (stripeLink) {
        window.open(stripeLink, '_blank');
        toast('Complete checkout to fund the project', true);
      } else {
        toast('Quote accepted — awaiting payment (not funded yet)', true);
      }
      loadChat();
    } catch (e) { toast(e.message, false); }
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
      closeDash(); closeAuth(); closePost(); closeQuote();
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
  });

  $('login-btn').addEventListener('click', doLogin);
  $('signup-btn').addEventListener('click', doSignup);
  $('quote-btn').addEventListener('click', doQuote);
  $('post-btn').addEventListener('click', doPost);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('quote-modal').classList.contains('open')) closeQuote();
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

  boot();
})();

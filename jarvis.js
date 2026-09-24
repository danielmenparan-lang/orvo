/**
 * ORVO Jarvis — Morning wake agent (v1)
 * Arms an alarm, speaks a Hebrew briefing, surfaces ORVO priorities.
 */
(function () {
  'use strict';

  const cfg = window.JARVIS || {};
  const STORAGE_KEY = 'orvo.jarvis.wake.v1';

  const $ = (id) => document.getElementById(id);

  const state = {
    armed: false,
    alarming: false,
    wakeTime: cfg.wakeTime || '07:00',
    name: cfg.name || 'דניאל',
    firedForKey: null,
    tickTimer: null,
    escalateTimer: null,
    priorities: null,
    utt: null,
  };

  function loadSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.wakeTime) state.wakeTime = data.wakeTime;
      if (data.name) state.name = data.name;
      if (data.armed) state.armed = true;
      if (data.firedForKey) state.firedForKey = data.firedForKey;
    } catch (_) { /* ignore */ }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      wakeTime: state.wakeTime,
      name: state.name,
      armed: state.armed,
      firedForKey: state.firedForKey,
    }));
  }

  function tzNow() {
    const tz = cfg.timezone || 'Asia/Jerusalem';
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value || '';
    return {
      hhmm: `${get('hour')}:${get('minute')}`,
      hhmmss: `${get('hour')}:${get('minute')}:${get('second')}`,
      label: `${get('weekday')}, ${get('day')} ${get('month')} ${get('year')}`,
      dayKey: `${get('year')}-${get('month')}-${get('day')}-${state.wakeTime}`,
    };
  }

  function hebrewGreeting() {
    const hour = Number(tzNow().hhmm.slice(0, 2));
    if (hour < 12) return 'בוקר טוב';
    if (hour < 17) return 'צהריים טובים';
    return 'ערב טוב';
  }

  function buildSpeech() {
    const open = state.priorities?.today?.filter((t) => !t.done) || [];
    const top = open.slice(0, 3).map((t, i) => `${i + 1}. ${t.title}`).join('. ');
    const mission = state.priorities?.mission || 'לבנות את ORVO';
    return (
      `${hebrewGreeting()} ${state.name}. ` +
      `אני ג׳ארוויס. הגיע הזמן לקום. ` +
      `המשימה שלנו היום: ${mission}. ` +
      (top ? `מה שצריך לסגור עכשיו: ${top}. ` : '') +
      `קום. אני כאן איתך.`
    );
  }

  function pickVoice() {
    const voices = speechSynthesis.getVoices();
    const want = (cfg.voiceLang || 'he-IL').toLowerCase();
    return (
      voices.find((v) => v.lang.toLowerCase() === want) ||
      voices.find((v) => v.lang.toLowerCase().startsWith('he')) ||
      voices.find((v) => /hebrew|עברית/i.test(v.name)) ||
      voices[0] ||
      null
    );
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = cfg.voiceLang || 'he-IL';
    u.rate = 0.95;
    u.pitch = 0.95;
    const voice = pickVoice();
    if (voice) u.voice = voice;
    state.utt = u;
    speechSynthesis.speak(u);
  }

  function playChime(loud) {
    const audio = $('chime');
    if (!audio) return;
    audio.volume = loud ? 0.85 : 0.35;
    const p = audio.play();
    if (p && p.catch) p.catch(() => {});
  }

  function stopChime() {
    const audio = $('chime');
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }

  function notify(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, { body, tag: 'jarvis-wake', renotify: true });
      } catch (_) { /* ignore */ }
    }
  }

  /** Ask only after a clear user gesture; never block the alarm UI. */
  function ensureNotifyPermission() {
    if (!('Notification' in window)) return Promise.resolve();
    if (Notification.permission !== 'default') return Promise.resolve();
    // Defer so click handlers (arm / wake) finish painting first
    return new Promise((resolve) => {
      setTimeout(() => {
        Notification.requestPermission().then(() => resolve()).catch(() => resolve());
      }, 400);
    });
  }

  function setStatus(text) {
    const el = $('status-text');
    if (el) el.textContent = text;
  }

  function renderClock() {
    const n = tzNow();
    $('live-clock').textContent = n.hhmm;
    $('live-date').textContent = n.label + ' · ישראל';
  }

  function renderBrief() {
    const open = state.priorities?.today?.filter((t) => !t.done) || [];
    $('brief-greeting').textContent =
      `${hebrewGreeting()}, ${state.name}. היום נזיז את ORVO קדימה.`;
    const box = $('brief-tasks');
    if (!open.length) {
      box.innerHTML = '<p class="hint">אין משימות פתוחות בקובץ העדיפויות.</p>';
      return;
    }
    box.innerHTML = open.map((t, i) => `
      <div class="task">
        <div class="n">${String(i + 1).padStart(2, '0')}</div>
        <div>
          <strong>${escapeHtml(t.title)}</strong>
          <span>${escapeHtml(t.why || '')}</span>
        </div>
      </div>
    `).join('');
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showAlarmUI(active) {
    document.body.classList.toggle('alarming', active);
    $('alarm-panel').hidden = !active;
    $('setup-panel').hidden = active;
    if (active) {
      $('alarm-title').textContent = `קום, ${state.name}`;
      setStatus('מעיר אותך עכשיו');
    }
  }

  function startAlarm({ test } = {}) {
    if (state.alarming) return;
    state.alarming = true;
    showAlarmUI(true);
    playChime(false);
    notify('Jarvis', `${state.name} — הגיע הזמן לקום. ORVO מחכה.`);
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);

    const speech = buildSpeech();
    // Short delay so chime starts first
    setTimeout(() => speak(speech), 900);

    clearTimeout(state.escalateTimer);
    state.escalateTimer = setTimeout(() => {
      if (!state.alarming) return;
      playChime(true);
      speak(`${state.name}. עדיין במיטה? בוא נקום. יש מה לסגור ב־ORVO.`);
    }, (cfg.escalateSeconds || 45) * 1000);

    if (!test) {
      state.firedForKey = tzNow().dayKey;
      save();
    }
  }

  function stopAlarm() {
    state.alarming = false;
    clearTimeout(state.escalateTimer);
    stopChime();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    showAlarmUI(false);
    if (state.armed) setStatus(`השכמה פעילה ל־${state.wakeTime}`);
    else setStatus('מוכן להעיר אותך');
  }

  function arm() {
    state.wakeTime = $('wake-time').value || state.wakeTime;
    state.name = ($('owner-name').value || state.name).trim() || cfg.name;
    state.armed = true;
    // Allow re-fire tomorrow; if same-day already fired, keep key
    save();
    // Unlock audio for iOS by playing muted once
    const audio = $('chime');
    if (audio) {
      audio.volume = 0.01;
      audio.play().then(() => { audio.pause(); audio.currentTime = 0; }).catch(() => {});
    }
    // Warm speech voices
    if ('speechSynthesis' in window) speechSynthesis.getVoices();
    setStatus(`השכמה פעילה ל־${state.wakeTime}`);
  }

  function disarm() {
    state.armed = false;
    stopAlarm();
    save();
    setStatus('השכמה בוטלה');
  }

  function snooze() {
    const mins = cfg.snoozeMinutes || 5;
    stopAlarm();
    state.armed = true;
    const now = new Date();
    now.setMinutes(now.getMinutes() + mins);
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: cfg.timezone || 'Asia/Jerusalem',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const get = (t) => parts.find((p) => p.type === t)?.value || '00';
    state.wakeTime = `${get('hour')}:${get('minute')}`;
    state.firedForKey = null;
    $('wake-time').value = state.wakeTime;
    save();
    setStatus(`נודניק — מעיר שוב ב־${state.wakeTime}`);
    speak(`בסדר ${state.name}. מעיר אותך שוב בעוד ${mins} דקות.`);
  }

  function tick() {
    renderClock();
    if (!state.armed || state.alarming) return;
    const n = tzNow();
    if (n.hhmm === state.wakeTime && state.firedForKey !== n.dayKey) {
      startAlarm({ test: false });
    }
  }

  async function loadPriorities() {
    try {
      const res = await fetch('data/jarvis-priorities.json?v=' + Date.now());
      if (!res.ok) throw new Error('fetch failed');
      state.priorities = await res.json();
    } catch (_) {
      state.priorities = {
        mission: 'לבנות את ORVO',
        today: [
          { id: 'wake', title: 'קום ולהתחיל את היום', why: 'Jarvis מעיר אותך', done: false },
          { id: 'orvo', title: 'קדם את ORVO צעד אחד', why: 'העסק זז רק כשאתה זז', done: false },
        ],
      };
    }
    renderBrief();
  }

  function bind() {
    $('wake-time').value = state.wakeTime;
    $('owner-name').value = state.name;

    $('arm-btn').addEventListener('click', () => {
      arm();
      ensureNotifyPermission();
      speak(`השכמה הוגדרה ל־${state.wakeTime}, ${state.name}. אני אעיר אותך.`);
    });
    $('disarm-btn').addEventListener('click', disarm);
    $('test-btn').addEventListener('click', () => {
      // Test wake: no permission prompt competing with the alarm UI
      state.wakeTime = $('wake-time').value || state.wakeTime;
      state.name = ($('owner-name').value || state.name).trim() || cfg.name;
      const audio = $('chime');
      if (audio) {
        audio.volume = 0.01;
        audio.play().then(() => { audio.pause(); audio.currentTime = 0; }).catch(() => {});
      }
      if ('speechSynthesis' in window) speechSynthesis.getVoices();
      startAlarm({ test: true });
    });
    function onAwake() {
      if (!state.alarming && $('alarm-panel').hidden) return;
      stopAlarm();
      state.armed = false;
      save();
      setStatus('בוקר טוב — אתה ער');
      const open = state.priorities?.today?.filter((t) => !t.done && t.id !== 'wake') || [];
      const next = open[0];
      speak(
        `יופי ${state.name}. אתה ער. ` +
        (next ? `הצעד הבא: ${next.title}.` : 'בוא נזיז את ORVO.')
      );
      renderBrief();
    }
    $('awake-btn').addEventListener('click', onAwake);
    $('awake-btn').addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') onAwake();
    });
    $('snooze-btn').addEventListener('click', snooze);
    $('repeat-btn').addEventListener('click', () => speak(buildSpeech()));

    if ('speechSynthesis' in window) {
      speechSynthesis.addEventListener('voiceschanged', () => pickVoice());
    }
  }

  async function init() {
    loadSaved();
    bind();
    await loadPriorities();
    renderClock();
    if (state.armed) setStatus(`השכמה פעילה ל־${state.wakeTime}`);
    state.tickTimer = setInterval(tick, 1000);
    tick();
  }

  init();
})();

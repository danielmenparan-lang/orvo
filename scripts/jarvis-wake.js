#!/usr/bin/env node
/**
 * ORVO Jarvis — wake / morning briefing CLI
 *
 *   node scripts/jarvis-wake.js now
 *   node scripts/jarvis-wake.js briefing
 *   node scripts/jarvis-wake.js status
 *   node scripts/jarvis-wake.js open
 *
 * "now" prints (and optionally speaks via macOS `say` / espeak) the wake script.
 * Open jarvis.html on your phone overnight for the real alarm.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PRIORITIES = path.join(ROOT, 'data', 'jarvis-priorities.json');

const PROFILE = {
  name: 'דניאל',
  agent: 'Jarvis',
  timezone: 'Asia/Jerusalem',
  jarvisUrl: 'jarvis.html',
};

function loadPriorities() {
  try {
    return JSON.parse(fs.readFileSync(PRIORITIES, 'utf8'));
  } catch {
    return { mission: 'לבנות את ORVO', today: [], reminders: [] };
  }
}

function israelNow() {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: PROFILE.timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: PROFILE.timezone,
      hour: '2-digit',
      hour12: false,
    }).format(new Date())
  );
  if (hour < 12) return 'בוקר טוב';
  if (hour < 17) return 'צהריים טובים';
  return 'ערב טוב';
}

function buildBriefing() {
  const p = loadPriorities();
  const open = (p.today || []).filter((t) => !t.done);
  const lines = [];
  lines.push(`${greeting()} ${PROFILE.name}.`);
  lines.push(`אני ${PROFILE.agent}. הגיע הזמן לקום.`);
  lines.push(`שעה בישראל: ${israelNow()}.`);
  if (p.mission) lines.push(`המשימה: ${p.mission}.`);
  if (open.length) {
    lines.push('מה שצריך לסגור היום:');
    open.forEach((t, i) => lines.push(`${i + 1}. ${t.title} — ${t.why || ''}`));
  }
  (p.reminders || []).forEach((r) => lines.push(`• ${r}`));
  lines.push('קום. אני כאן איתך.');
  return { text: lines.join('\n'), open, mission: p.mission };
}

function speak(text) {
  // Best-effort local TTS for agent/dev machines
  const flat = text.replace(/\n/g, ' ');
  if (process.platform === 'darwin') {
    spawn('say', ['-v', 'Carmit', flat], { stdio: 'ignore', detached: true }).unref();
    return 'say (Carmit)';
  }
  const espeak = spawn('espeak-ng', ['-v', 'he', flat], { stdio: 'ignore', detached: true });
  espeak.on('error', () => {});
  espeak.unref();
  return 'espeak-ng (if installed)';
}

function cmdNow() {
  const { text } = buildBriefing();
  console.log('\n—— Jarvis wake ——\n');
  console.log(text);
  console.log('\n———————————————\n');
  const engine = speak(text);
  console.log(`Voice attempt: ${engine}`);
  console.log(`Phone alarm UI: open ${PROFILE.jarvisUrl} and tap «הער אותי עכשיו» / arm overnight.`);
}

function cmdBriefing() {
  const { text, open, mission } = buildBriefing();
  console.log(JSON.stringify({ ok: true, mission, openCount: open.length, text, at: israelNow() }, null, 2));
}

function cmdStatus() {
  const p = loadPriorities();
  const open = (p.today || []).filter((t) => !t.done);
  console.log(JSON.stringify({
    ok: true,
    agent: PROFILE.agent,
    owner: PROFILE.name,
    timezone: PROFILE.timezone,
    now: israelNow(),
    mission: p.mission,
    openTasks: open.map((t) => t.id),
    wakePage: PROFILE.jarvisUrl,
    next: 'Open jarvis.html on your phone → set time → «הפעל השכמה» → leave tab open',
  }, null, 2));
}

function cmdOpen() {
  const file = path.join(ROOT, 'jarvis.html');
  console.log(`file://${file}`);
  if (process.platform === 'darwin') spawn('open', [file], { stdio: 'ignore', detached: true }).unref();
  else if (process.platform === 'linux') spawn('xdg-open', [file], { stdio: 'ignore', detached: true }).unref();
}

const cmd = process.argv[2] || 'status';
const map = { now: cmdNow, briefing: cmdBriefing, status: cmdStatus, open: cmdOpen };
if (!map[cmd]) {
  console.error('Usage: node scripts/jarvis-wake.js <now|briefing|status|open>');
  process.exit(1);
}
map[cmd]();

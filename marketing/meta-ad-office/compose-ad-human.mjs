#!/usr/bin/env node
/**
 * Human-motion Meta ad — AI frame sequences + voice-synced cuts + premium EN VO.
 * Output: output/orvo24-meta-ad-human-en-18s.mp4
 */
import { chromium } from 'playwright';
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AI = join(__dirname, 'assets-ai-en');
const MOTION = join(AI, 'motion');
const AUDIO = join(__dirname, 'audio-en-premium');
const OUT = join(__dirname, 'output');
const TMP = join(OUT, 'tmp-human');
const SITE_URL = process.env.SITE_URL || 'https://fantastic-eclair-0b2c66.netlify.app/';
const FINAL = join(OUT, 'orvo24-meta-ad-human-en-18s.mp4');

mkdirSync(TMP, { recursive: true });

function run(cmd, args, label) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`${label || cmd} failed`);
    process.exit(r.status || 1);
  }
}

function probeDur(path) {
  const r = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path,
  ], { encoding: 'utf8' });
  return parseFloat(r.stdout.trim());
}

const GRADE =
  'eq=brightness=0.05:saturation=1.4:contrast=1.08,' +
  'colorbalance=rs=0.14:gs=0.05:bs=-0.1:rm=0.08:gm=0.02:bm=-0.06,' +
  'noise=alls=2:allf=t+u,vignette=angle=PI/5';

/** Build clip from 2-3 frames with dissolve = human micro-motion */
function framesToClip(frames, seconds, out, shake = true) {
  const fps = 30;
  const n = frames.length;
  const segDur = seconds / n;
  const base = out.split('/').pop().replace('.mp4', '');
  const parts = [];
  for (let i = 0; i < n; i++) {
    const seg = join(TMP, `seg_${base}_${i}.mp4`);
    const shakeF = shake
      ? `zoompan=z='1.06+0.012*sin(on/7+${i})':x='iw/2-(iw/zoom/2)+4*sin(on/11+${i * 2})':y='ih/2-(ih/zoom/2)+3*sin(on/9+${i})':d=${Math.round(segDur * fps)}:s=1080x1920:fps=${fps}`
      : `zoompan=z='1.04':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.round(segDur * fps)}:s=1080x1920:fps=${fps}`;
    run('ffmpeg', [
      '-y', '-loop', '1', '-i', frames[i],
      '-vf', [
        'scale=1280:2276:force_original_aspect_ratio=increase', 'crop=1080:1920',
        GRADE, shakeF, 'format=yuv420p',
      ].join(','),
      '-t', String(segDur), '-an',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', seg,
    ], `frame ${i} of ${out}`);
    parts.push(seg);
  }
  if (parts.length === 1) {
    run('ffmpeg', ['-y', '-i', parts[0], '-c', 'copy', out], 'copy single');
    return;
  }
  const XF = 0.22;
  let filter = '';
  let prev = '0:v';
  let offset = segDur - XF;
  for (let i = 1; i < parts.length; i++) {
    const label = i === parts.length - 1 ? 'vout' : `x${i}`;
    filter += `[${prev}][${i}:v]xfade=transition=dissolve:duration=${XF}:offset=${offset.toFixed(3)}[${label}];`;
    prev = label;
    offset += segDur - XF;
  }
  filter = filter.replace(/;$/, '');
  run('ffmpeg', [
    '-y', ...parts.flatMap((p) => ['-i', p]),
    '-filter_complex', filter, '-map', '[vout]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', '30', out,
  ], `dissolve ${out}`);
}

// ── Voice timeline (sync visuals to dialogue) ──
const voiceFiles = ['g1', 'h1', 'g2', 'h2', 'end-vo'].map((f) => join(AUDIO, `${f}.mp3`));
for (const f of voiceFiles) {
  if (!existsSync(f)) {
    console.error('Run: npm run voice:premium');
    process.exit(1);
  }
}
const vDur = Object.fromEntries(
  ['g1', 'h1', 'g2', 'h2', 'end-vo'].map((k) => [k, probeDur(join(AUDIO, `${k}.mp3`))]),
);

const T = {
  g1: 3.8,
  h1: 3.8 + vDur.g1 + 0.35,
  g2: 0,
  h2: 0,
  end: 0,
};
T.g2 = T.h1 + vDur.h1 + 0.35;
T.h2 = T.g2 + vDur.g2 + 0.35;
T.end = T.h2 + vDur.h2 + 0.25;
const siteStart = T.end + vDur['end-vo'] + 0.15;

// ── Visual scenes (motion frame sequences) ──
const clips = [];
clips.push({
  out: join(TMP, '01-meeting.mp4'),
  frames: [join(AI, 'orvo_meeting_wide.png'), join(MOTION, 'motion_meeting_2.png'), join(AI, 'orvo_meeting_wide.png')],
  dur: T.g1,
});
clips.push({
  out: join(TMP, '02-leave.mp4'),
  frames: [join(AI, 'orvo_woman_leaving.png'), join(MOTION, 'motion_woman_walk.png'), join(AI, 'orvo_woman_leaving.png')],
  dur: 0.5,
});
clips.push({
  out: join(TMP, '03-guy.mp4'),
  frames: [join(AI, 'orvo_guy_reacts.png'), join(MOTION, 'motion_guy_speak.png'), join(AI, 'orvo_guy_reacts.png')],
  dur: vDur.g1 + 0.5,
});
clips.push({
  out: join(TMP, '04-her.mp4'),
  frames: [join(AI, 'orvo_woman_leaving.png'), join(MOTION, 'motion_woman_walk.png')],
  dur: vDur.h1 + 0.4,
});
clips.push({
  out: join(TMP, '05-guy2.mp4'),
  frames: [join(AI, 'orvo_guy_reacts.png'), join(MOTION, 'motion_guy_speak.png')],
  dur: vDur.g2 + 0.4,
});
clips.push({
  out: join(TMP, '06-phone.mp4'),
  frames: [join(AI, 'orvo_woman_phone.png'), join(MOTION, 'motion_phone_up.png'), join(AI, 'orvo_woman_phone.png')],
  dur: vDur.h2 + 0.3,
});
clips.push({
  out: join(TMP, '07-nods.mp4'),
  frames: [join(AI, 'orvo_team_nods.png'), join(MOTION, 'motion_team_nod.png')],
  dur: vDur['end-vo'] * 0.55,
});

for (const c of clips) {
  for (const f of c.frames) {
    if (!existsSync(f)) { console.error('Missing', f); process.exit(1); }
  }
  framesToClip(c.frames, c.dur, c.out);
}

// Site scroll
async function recordSite() {
  const dest = join(TMP, '08-site.mp4');
  const siteDur = Math.max(3.5, 18.5 - siteStart);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    recordVideo: { dir: TMP, size: { width: 1080, height: 1920 } },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  });
  const page = await context.newPage();
  await page.goto(SITE_URL, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    for (let y = 0; y <= 2000; y += 300) {
      window.scrollTo({ top: y, behavior: 'smooth' });
      await new Promise((r) => setTimeout(r, 500));
    }
  });
  await page.waitForTimeout(800);
  const video = page.video();
  await context.close();
  await browser.close();
  const webm = await video.path();
  run('ffmpeg', [
    '-y', '-i', webm, '-t', String(siteDur),
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p',
    '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', dest,
  ], 'site');
  return dest;
}
const siteClip = await recordSite();

// Concat with fast cuts
const allClips = [...clips.map((c) => c.out), siteClip];
const list = join(TMP, 'concat.txt');
writeFileSync(list, allClips.map((p) => `file '${p}'`).join('\n'));
const silent = join(TMP, 'silent.mp4');
run('ffmpeg', [
  '-y', '-f', 'concat', '-safe', '0', '-i', list,
  '-t', '18.5', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', '30',
  silent,
], 'concat');

// Subtitles synced to voice
const ass = join(TMP, 'subs.ass');
const fmt = (s) => {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2).padStart(5, '0');
  return `0:${String(m).padStart(2, '0')}:${sec}`;
};
writeFileSync(ass, `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,DejaVu Sans,52,&H00FFFFFF,&H000000FF,&H00000000,&H90000000,1,0,0,0,100,100,0,0,1,3,1,2,40,40,200,1
Style: Brand,DejaVu Sans,46,&H00556BFF,&H000000FF,&H00000000,&H90000000,1,0,0,0,100,100,0,0,1,3,1,2,40,40,120,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,${fmt(T.g1)},${fmt(T.g1 + vDur.g1)},Sub,,0,0,0,,Wait… you're leaving already?
Dialogue: 0,${fmt(T.h1)},${fmt(T.h1 + vDur.h1)},Sub,,0,0,0,,My agent finished all my tasks.
Dialogue: 0,${fmt(T.g2)},${fmt(T.g2 + vDur.g2)},Sub,,0,0,0,,But… you can't build an agent…
Dialogue: 0,${fmt(T.h2)},${fmt(T.h2 + vDur.h2)},Sub,,0,0,0,,I just use orvo24.com.
Dialogue: 0,${fmt(T.end)},${fmt(T.end + vDur['end-vo'])},Brand,,0,0,0,,ORVO · orvo24.com
`);

const withSubs = join(TMP, 'with-subs.mp4');
run('ffmpeg', [
  '-y', '-i', silent, '-vf', `ass=${ass.replace(/:/g, '\\:')}`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-an', withSubs,
], 'subs');

// Mix voice — exact sync
const voiceMap = [
  { f: 'g1.mp3', ms: Math.round(T.g1 * 1000) },
  { f: 'h1.mp3', ms: Math.round(T.h1 * 1000) },
  { f: 'g2.mp3', ms: Math.round(T.g2 * 1000) },
  { f: 'h2.mp3', ms: Math.round(T.h2 * 1000) },
  { f: 'end-vo.mp3', ms: Math.round(T.end * 1000) },
];
const filterA = [
  ...voiceMap.map((v, i) => `[${i}:a]adelay=${v.ms}|${v.ms},volume=2.8,aresample=48000[a${i}]`),
  `${voiceMap.map((_, i) => `[a${i}]`).join('')}amix=inputs=${voiceMap.length}:duration=longest:dropout_transition=3[mix]`,
  '[mix]loudnorm=I=-11:TP=-0.5:LRA=5,apad=pad_dur=19[aout]',
].join(';');

run('ffmpeg', [
  '-y', ...voiceMap.flatMap((v) => ['-i', join(AUDIO, v.f)]),
  '-filter_complex', filterA, '-map', '[aout]',
  '-t', '19', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', join(TMP, 'audio.m4a'),
], 'audio');

run('ffmpeg', [
  '-y', '-i', withSubs, '-i', join(TMP, 'audio.m4a'),
  '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', FINAL,
], 'mux');

console.log('Voice sync:', T);
console.log('Done:', FINAL);

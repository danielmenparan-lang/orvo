#!/usr/bin/env node
/**
 * Premium Meta ad — AI orange ORVO office, max motion, English VO.
 * Output: output/orvo24-meta-ad-premium-en-18s.mp4
 */
import { chromium } from 'playwright';
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AI = join(__dirname, 'assets-ai-en');
const AUDIO = join(__dirname, 'audio-en');
const OUT = join(__dirname, 'output');
const TMP = join(OUT, 'tmp-premium');
const SITE_URL = process.env.SITE_URL || 'https://fantastic-eclair-0b2c66.netlify.app/';
const FINAL = join(OUT, 'orvo24-meta-ad-premium-en-18s.mp4');

mkdirSync(TMP, { recursive: true });

function run(cmd, args, label) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`${label || cmd} failed`);
    process.exit(r.status || 1);
  }
}

// ORVO brand warm orange grade (#FF6B35 feel)
const GRADE =
  'eq=brightness=0.05:saturation=1.42:contrast=1.1,' +
  'colorbalance=rs=0.14:gs=0.05:bs=-0.1:rm=0.08:gm=0.02:bm=-0.06,' +
  'vignette=angle=PI/5:mode=forward';

const MOTION = {
  push_in: (f) =>
    `zoompan=z='min(1.0+0.0028*on,1.22)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+on*0.15':d=${f}:s=1080x1920:fps=30`,
  pull_out: (f) =>
    `zoompan=z='max(1.22-0.0025*on,1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${f}:s=1080x1920:fps=30`,
  pan_right: (f) =>
    `zoompan=z='1.14':x='max(iw/2-(iw/zoom/2)-on*2.2,0)':y='ih/2-(ih/zoom/2)+on*0.08':d=${f}:s=1080x1920:fps=30`,
  pan_left: (f) =>
    `zoompan=z='1.14':x='min(on*2.2,iw-iw/zoom)':y='ih/2-(ih/zoom/2)':d=${f}:s=1080x1920:fps=30`,
  drift_up: (f) =>
    `zoompan=z='min(1.0+0.002*on,1.16)':x='iw/2-(iw/zoom/2)+sin(on/25)*12':y='max(ih/2-(ih/zoom/2)-on*0.9,0)':d=${f}:s=1080x1920:fps=30`,
  punch: (f) =>
    `zoompan=z='min(1.08+0.004*on,1.28)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)-on*0.4':d=${f}:s=1080x1920:fps=30`,
};

function imageToVideo(img, seconds, out, motion = 'push_in') {
  const frames = Math.round(seconds * 30);
  const zp = (MOTION[motion] || MOTION.push_in)(frames);
  run('ffmpeg', [
    '-y', '-loop', '1', '-i', img,
    '-vf', [
      'scale=1280:2276:force_original_aspect_ratio=increase',
      'crop=1080:1920',
      GRADE,
      zp,
      'format=yuv420p',
    ].join(','),
    '-t', String(seconds), '-an',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', out,
  ], `motion ${out}`);
}

const SCENES = [
  { img: 'orvo_meeting_wide.png', t: 2.4, out: '01.mp4', motion: 'pull_out' },
  { img: 'orvo_woman_leaving.png', t: 2.2, out: '02.mp4', motion: 'pan_right' },
  { img: 'orvo_guy_reacts.png', t: 2.5, out: '03.mp4', motion: 'punch' },
  { img: 'orvo_woman_leaving.png', t: 2.5, out: '04.mp4', motion: 'drift_up' },
  { img: 'orvo_guy_reacts.png', t: 2.4, out: '05.mp4', motion: 'push_in' },
  { img: 'orvo_woman_phone.png', t: 2.2, out: '06.mp4', motion: 'punch' },
  { img: 'orvo_team_nods.png', t: 1.5, out: '07.mp4', motion: 'pan_left' },
];

for (const s of SCENES) {
  const src = join(AI, s.img);
  if (!existsSync(src)) {
    console.error('Missing', src);
    process.exit(1);
  }
  imageToVideo(src, s.t, join(TMP, s.out), s.motion);
}

async function recordSite() {
  const dest = join(TMP, '08-site.mp4');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    recordVideo: { dir: TMP, size: { width: 1080, height: 1920 } },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  });
  const page = await context.newPage();
  await page.goto(SITE_URL, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(500);
  await page.addStyleTag({
    content: 'html{scroll-behavior:smooth} body{background:#F9F9F7!important}',
  });
  await page.evaluate(async () => {
    for (let y = 0; y <= 2000; y += 280) {
      window.scrollTo({ top: y, behavior: 'smooth' });
      await new Promise((r) => setTimeout(r, 480));
    }
  });
  await page.waitForTimeout(900);
  const video = page.video();
  await context.close();
  await browser.close();
  const webm = await video.path();
  run('ffmpeg', [
    '-y', '-i', webm, '-t', '5.2',
    '-vf', [
      'scale=1080:1920:force_original_aspect_ratio=increase',
      'crop=1080:1920',
      'eq=saturation=1.15:brightness=0.03',
      'fps=30', 'format=yuv420p',
    ].join(','),
    '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', dest,
  ], 'site');
}

await recordSite();

// xfade chain — cinematic cuts between segments
const XFADE = 0.35;
const segPaths = [...SCENES.map((s) => join(TMP, s.out)), join(TMP, '08-site.mp4')];
const durations = [...SCENES.map((s) => s.t), 5.2];

const parts = [];
let prev = '0:v';
let offset = 0;
for (let i = 1; i < segPaths.length; i++) {
  offset += durations[i - 1] - XFADE;
  const out = i === segPaths.length - 1 ? 'vout' : `x${i}`;
  parts.push(
    `[${prev}][${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset.toFixed(3)}[${out}]`,
  );
  prev = out;
}
const filterComplex = parts.join(';');

const silent = join(TMP, 'silent-premium.mp4');
run('ffmpeg', [
  '-y', ...segPaths.flatMap((p) => ['-i', p]),
  '-filter_complex', filterComplex,
  '-map', '[vout]', '-t', '18',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', '30',
  silent,
], 'xfade concat');

const ass = join(TMP, 'subs-en.ass');
writeFileSync(ass, `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,DejaVu Sans,54,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,1,2,40,40,200,1
Style: Brand,DejaVu Sans,48,&H00556BFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,1,2,40,40,120,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:04.20,0:00:06.50,Sub,,0,0,0,,Leaving already?
Dialogue: 0,0:00:06.60,0:00:09.20,Sub,,0,0,0,,My agent finished my tasks.
Dialogue: 0,0:00:09.30,0:00:11.80,Sub,,0,0,0,,But you can't build an agent…
Dialogue: 0,0:00:11.90,0:00:13.40,Sub,,0,0,0,,I use orvo24.com.
Dialogue: 0,0:00:13.60,0:00:18.00,Brand,,0,0,0,,ORVO · orvo24.com
`);

const withSubs = join(TMP, 'with-subs-premium.mp4');
run('ffmpeg', [
  '-y', '-i', silent, '-vf', `ass=${ass.replace(/:/g, '\\:')}`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-an', withSubs,
], 'subs');

const voices = [
  { f: 'g1.mp3', delay: 4200 },
  { f: 'h1.mp3', delay: 6600 },
  { f: 'g2.mp3', delay: 9300 },
  { f: 'h2.mp3', delay: 11900 },
  { f: 'end-vo.mp3', delay: 13200, vol: 1.6 },
];
for (const v of voices) {
  if (!existsSync(join(AUDIO, v.f))) {
    console.error('Missing', join(AUDIO, v.f), '— run: npm run voice:en');
    process.exit(1);
  }
}

const filterA = [
  ...voices.map((v, i) => {
    const vol = v.vol ?? 3.0;
    return `[${i}:a]adelay=${v.delay}|${v.delay},volume=${vol},aresample=48000,asetpts=PTS-STARTPTS[a${i}]`;
  }),
  `${voices.map((_, i) => `[a${i}]`).join('')}amix=inputs=${voices.length}:duration=longest:dropout_transition=2[mix]`,
  '[mix]loudnorm=I=-10:TP=-0.5:LRA=5[aout]',
].join(';');

run('ffmpeg', [
  '-y', ...voices.flatMap((v) => ['-i', join(AUDIO, v.f)]),
  '-filter_complex', filterA, '-map', '[aout]', '-t', '18',
  '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', join(TMP, 'audio-premium.m4a'),
], 'audio');

run('ffmpeg', [
  '-y', '-i', withSubs, '-i', join(TMP, 'audio-premium.m4a'),
  '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', FINAL,
], 'mux');

console.log('Done:', FINAL);

#!/usr/bin/env node
/**
 * Meta ad with Replicate i2v clips + premium EN voice + site scroll.
 * Prereq: npm run i2v && npm run voice:premium
 */
import { chromium } from 'playwright';
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPL = join(__dirname, 'assets-ai-en', 'replicate');
const AUDIO = join(__dirname, 'audio-en-premium');
const OUT = join(__dirname, 'output');
const TMP = join(OUT, 'tmp-replicate');
const SITE_URL = process.env.SITE_URL || 'https://fantastic-eclair-0b2c66.netlify.app/';
const FINAL = join(OUT, 'orvo24-meta-ad-replicate-en-18s.mp4');

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

function trimClip(src, dur, out) {
  run('ffmpeg', [
    '-y', '-i', src,
    '-t', String(dur),
    '-vf', [
      'scale=1280:2276:force_original_aspect_ratio=increase', 'crop=1080:1920',
      GRADE, 'fps=30', 'format=yuv420p',
    ].join(','),
    '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', out,
  ], `trim ${out}`);
}

// Voice
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

const T = { g1: 3.8, h1: 0, g2: 0, h2: 0, end: 0 };
T.h1 = T.g1 + vDur.g1 + 0.35;
T.g2 = T.h1 + vDur.h1 + 0.35;
T.h2 = T.g2 + vDur.g2 + 0.35;
T.end = T.h2 + vDur.h2 + 0.25;
const siteStart = T.end + vDur['end-vo'] + 0.15;

const clipMap = [
  { id: 'meeting', dur: T.g1 },
  { id: 'leave', dur: 0.55 },
  { id: 'guy', dur: vDur.g1 + 0.45 },
  { id: 'guy', dur: vDur.h1 + 0.4 },
  { id: 'guy', dur: vDur.g2 + 0.4 },
  { id: 'phone', dur: vDur.h2 + 0.3 },
  { id: 'nods', dur: vDur['end-vo'] * 0.55 },
];

const manifestPath = join(REPL, 'manifest.json');
if (!existsSync(manifestPath)) {
  console.error('Run: npm run i2v');
  process.exit(1);
}

const clips = [];
let idx = 0;
for (const c of clipMap) {
  const src = join(REPL, `${c.id}.mp4`);
  if (!existsSync(src)) {
    console.error(`Missing i2v clip: ${src} — run npm run i2v`);
    process.exit(1);
  }
  const out = join(TMP, `${String(++idx).padStart(2, '0')}-${c.id}.mp4`);
  trimClip(src, c.dur, out);
  clips.push(out);
}

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
const allClips = [...clips, siteClip];
const list = join(TMP, 'concat.txt');
writeFileSync(list, allClips.map((p) => `file '${p}'`).join('\n'));
const silent = join(TMP, 'silent.mp4');
run('ffmpeg', [
  '-y', '-f', 'concat', '-safe', '0', '-i', list,
  '-t', '18.5', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', '30',
  silent,
], 'concat');

const fmt = (s) => {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2).padStart(5, '0');
  return `0:${String(m).padStart(2, '0')}:${sec}`;
};
const ass = join(TMP, 'subs.ass');
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

// Copy to artifacts
const artifact = '/opt/cursor/artifacts/orvo24_meta_ad_replicate_en.mp4';
run('cp', ['-f', FINAL, artifact], 'artifact');

const manifest = JSON.parse(readFileSync(join(REPL, 'manifest.json'), 'utf8'));
console.log('Replicate est. spend:', manifest.spentUsd);
console.log('Done:', FINAL);
console.log('Artifact:', artifact);

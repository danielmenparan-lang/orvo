#!/usr/bin/env node
/**
 * Meta ad — AI-generated meeting room scenes + VO + site.
 * Output: output/orvo24-meta-ad-ai-18s.mp4
 */
import { chromium } from 'playwright';
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AI = join(__dirname, 'assets-ai');
const AUDIO = join(__dirname, 'audio');
const OUT = join(__dirname, 'output');
const TMP = join(OUT, 'tmp-ai');
const SITE_URL = process.env.SITE_URL || 'https://fantastic-eclair-0b2c66.netlify.app/';
const FINAL = join(OUT, 'orvo24-meta-ad-ai-18s.mp4');

mkdirSync(TMP, { recursive: true });

function run(cmd, args, label) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`${label || cmd} failed`);
    process.exit(r.status || 1);
  }
}

/** Ken Burns zoom on AI still → video segment */
function imageToVideo(img, seconds, out, pan = 'in') {
  const frames = Math.round(seconds * 30);
  const zoom = pan === 'in'
    ? `zoompan=z='min(1.0+0.0018*on,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`
    : `zoompan=z='max(1.12-0.0018*on,1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
  run('ffmpeg', [
    '-y', '-loop', '1', '-i', img,
    '-vf', [
      'scale=1080:1920:force_original_aspect_ratio=increase',
      'crop=1080:1920',
      'eq=brightness=0.06:saturation=1.2:contrast=1.04',
      `${zoom}:d=${frames}:s=1080x1920:fps=30`,
      'format=yuv420p',
    ].join(','),
    '-t', String(seconds), '-an',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', out,
  ], `zoom ${out}`);
}

const SCENES = [
  { img: 'meeting_wide.png', t: 2.2, out: '01-meeting.mp4', pan: 'in' },
  { img: 'woman_packing.png', t: 2.3, out: '02-pack.mp4', pan: 'in' },
  { img: 'guy_speaks_nods.png', t: 2.5, out: '03-guy.mp4', pan: 'out' },
  { img: 'woman_packing.png', t: 2.5, out: '04-her.mp4', pan: 'in' },
  { img: 'guy_speaks_nods.png', t: 2.5, out: '05-guy2.mp4', pan: 'in' },
  { img: 'woman_phone_smile.png', t: 2.0, out: '06-phone.mp4', pan: 'in' },
];

for (const s of SCENES) {
  const src = join(AI, s.img);
  if (!existsSync(src)) {
    console.error('Missing', src);
    process.exit(1);
  }
  imageToVideo(src, s.t, join(TMP, s.out), s.pan);
}

async function recordSite() {
  const dest = join(TMP, '07-site.mp4');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    recordVideo: { dir: TMP, size: { width: 1080, height: 1920 } },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  });
  const page = await context.newPage();
  await page.goto(SITE_URL, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(600);
  await page.evaluate(async () => {
    for (let y = 0; y <= 1600; y += 320) {
      window.scrollTo({ top: y, behavior: 'smooth' });
      await new Promise((r) => setTimeout(r, 500));
    }
  });
  await page.waitForTimeout(1000);
  const video = page.video();
  await context.close();
  await browser.close();
  const webm = await video.path();
  run('ffmpeg', [
    '-y', '-i', webm, '-t', '4.0',
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p',
    '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', dest,
  ], 'site');
}

await recordSite();

const list = join(TMP, 'concat-ai.txt');
writeFileSync(
  list,
  [...SCENES.map((s) => join(TMP, s.out)), join(TMP, '07-site.mp4')]
    .map((p) => `file '${p}'`)
    .join('\n'),
);

const silent = join(TMP, 'silent-ai.mp4');
run('ffmpeg', [
  '-y', '-f', 'concat', '-safe', '0', '-i', list,
  '-t', '18', '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', '30',
  silent,
], 'concat');

const ass = join(TMP, 'subs-ai.ass');
writeFileSync(ass, `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,DejaVu Sans,56,&H00FFFFFF,&H000000FF,&H00000000,&H96000000,1,0,0,0,100,100,0,0,1,4,2,2,48,48,220,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:04.50,0:00:07.00,Sub,,0,0,0,,רגע, לא מוקדם?
Dialogue: 0,0:00:07.20,0:00:09.90,Sub,,0,0,0,,הסוכן שלי סיים לי את המשימות.
Dialogue: 0,0:00:10.20,0:00:12.70,Sub,,0,0,0,,אבל את לא יודעת לבנות סוכן…
Dialogue: 0,0:00:12.80,0:00:13.60,Sub,,0,0,0,,נכנסתי ל-orvo24.com
Dialogue: 0,0:00:13.80,0:00:18.00,Sub,,0,0,0,,{\\fs44}ORVO · orvo24.com
`);

const withSubs = join(TMP, 'with-subs-ai.mp4');
run('ffmpeg', [
  '-y', '-i', silent, '-vf', `ass=${ass.replace(/:/g, '\\:')}`,
  '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-an', withSubs,
], 'subs');

const voices = [
  { f: 'g1-loud.mp3', delay: 4500 },
  { f: 'h1-loud.mp3', delay: 7200 },
  { f: 'g2-loud.mp3', delay: 10200 },
  { f: 'h2-loud.mp3', delay: 12800 },
  { f: 'end-vo-short.mp3', delay: 13600 },
];
const filter = [
  ...voices.map((v, i) => `[${i}:a]adelay=${v.delay}|${v.delay},volume=2.2,aresample=48000[a${i}]`),
  `${voices.map((_, i) => `[a${i}]`).join('')}amix=inputs=${voices.length}:duration=longest:dropout_transition=0[mix]`,
  '[mix]loudnorm=I=-12:TP=-1:LRA=7[aout]',
].join(';');

run('ffmpeg', [
  '-y', ...voices.flatMap((v) => ['-i', join(AUDIO, v.f)]),
  '-filter_complex', filter, '-map', '[aout]', '-t', '18',
  '-c:a', 'aac', '-b:a', '256k', join(TMP, 'audio-ai.m4a'),
], 'audio');

run('ffmpeg', [
  '-y', '-i', withSubs, '-i', join(TMP, 'audio-ai.m4a'),
  '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', FINAL,
], 'mux');

console.log('Done:', FINAL);

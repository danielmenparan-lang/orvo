#!/usr/bin/env node
/**
 * Meta ad v3 — real stock B-roll + loud Hebrew VO + site scroll.
 * Fixes: movement, audible voice, bright/fun grade, correct script.
 */
import { chromium } from 'playwright';
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STOCK = join(__dirname, 'stock');
const AUDIO = join(__dirname, 'audio');
const OUT = join(__dirname, 'output');
const TMP = join(OUT, 'tmp');
const SITE_URL = process.env.SITE_URL || 'https://fantastic-eclair-0b2c66.netlify.app/';
const FINAL = join(OUT, 'orvo24-meta-ad-pro-18s.mp4');

mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });

function run(cmd, args, label) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`${label || cmd} failed`);
    process.exit(r.status || 1);
  }
}

const VF =
  'scale=1080:1920:force_original_aspect_ratio=increase,' +
  'crop=1080:1920,' +
  'eq=brightness=0.10:saturation=1.35:contrast=1.06,' +
  'fps=30,format=yuv420p';

/** @param {{ file: string, ss: number, t: number, out: string }} seg */
function cutSegment({ file, ss, t, out }) {
  run('ffmpeg', [
    '-y', '-ss', String(ss), '-t', String(t), '-i', file,
    '-vf', VF, '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', out,
  ], `segment ${out}`);
}

const SEGMENTS = [
  { file: join(STOCK, 'clip5.mp4'), ss: 0, t: 1.8, out: join(TMP, '01-office.mp4') },
  { file: join(STOCK, 'clip5.mp4'), ss: 3, t: 1.8, out: join(TMP, '02-walk.mp4') },
  { file: join(STOCK, 'v42648.mp4'), ss: 0, t: 2.5, out: join(TMP, '03-guy.mp4') },
  { file: join(STOCK, 'bw1.mp4'), ss: 0, t: 2.8, out: join(TMP, '04-her.mp4') },
  { file: join(STOCK, 'v42648.mp4'), ss: 1.5, t: 2.5, out: join(TMP, '05-guy2.mp4') },
  { file: join(STOCK, 'bw1.mp4'), ss: 2, t: 2.4, out: join(TMP, '06-phone.mp4') },
];

for (const seg of SEGMENTS) {
  if (!existsSync(seg.file)) {
    console.error('Missing stock clip:', seg.file);
    process.exit(1);
  }
  cutSegment(seg);
}

async function recordSite() {
  const dest = join(TMP, '07-site.mp4');
  console.log('Recording site', SITE_URL);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
    recordVideo: { dir: TMP, size: { width: 1080, height: 1920 } },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  await page.goto(SITE_URL, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(600);
  await page.addStyleTag({
    content: `html{font-size:18px!important} .hero{min-height:auto!important;padding-top:100px!important}`,
  });
  await page.evaluate(async () => {
    for (let y = 0; y <= 1800; y += 300) {
      window.scrollTo({ top: y, behavior: 'smooth' });
      await new Promise((r) => setTimeout(r, 550));
    }
  });
  await page.waitForTimeout(1200);
  const video = page.video();
  await context.close();
  await browser.close();
  const webm = await video.path();
  run('ffmpeg', [
    '-y', '-i', webm, '-t', '4.2', '-vf', VF,
    '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', dest,
  ], 'site segment');
  return dest;
}

await recordSite();

// Concat all video segments (~18.8s → trim to 18)
const listFile = join(TMP, 'concat.txt');
writeFileSync(
  listFile,
  [...SEGMENTS.map((s) => s.out), join(TMP, '07-site.mp4')]
    .map((p) => `file '${p}'`)
    .join('\n'),
);
const silent = join(TMP, 'silent.mp4');
run('ffmpeg', [
  '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
  '-t', '18', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30',
  silent,
], 'concat video');

// ASS subtitles (burned-in for muted Meta views)
const ass = join(TMP, 'subs.ass');
writeFileSync(ass, `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,DejaVu Sans,58,&H00FFFFFF,&H000000FF,&H00000000,&H96000000,1,0,0,0,100,100,0,0,1,4,2,2,48,48,220,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:04.50,0:00:07.00,Sub,,0,0,0,,רגע, לא מוקדם?
Dialogue: 0,0:00:07.20,0:00:09.90,Sub,,0,0,0,,הסוכן שלי סיים לי את המשימות.
Dialogue: 0,0:00:10.20,0:00:12.70,Sub,,0,0,0,,אבל את לא יודעת לבנות סוכן…
Dialogue: 0,0:00:12.80,0:00:13.60,Sub,,0,0,0,,נכנסתי ל-orvo24.com
Dialogue: 0,0:00:13.80,0:00:18.00,Sub,,0,0,0,,{\\fs44}ORVO · orvo24.com
`);

const withSubs = join(TMP, 'with-subs.mp4');
run('ffmpeg', [
  '-y', '-i', silent, '-vf', `ass=${ass.replace(/:/g, '\\:')}`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-an', withSubs,
], 'burn subtitles');

// Loud dialogue mix (stereo 48kHz)
const voices = [
  { f: 'g1-loud.mp3', delay: 4500 },
  { f: 'h1-loud.mp3', delay: 7200 },
  { f: 'g2-loud.mp3', delay: 10200 },
  { f: 'h2-loud.mp3', delay: 12800 },
  { f: 'end-vo-short.mp3', delay: 13600 },
];
for (const v of voices) {
  const p = join(AUDIO, v.f);
  if (!existsSync(p)) {
    console.error('Missing', p, '— run: npm run voice');
    process.exit(1);
  }
}

const filter = [
  ...voices.map((v, i) => `[${i}:a]adelay=${v.delay}|${v.delay},volume=2.2,aresample=48000[a${i}]`),
  `${voices.map((_, i) => `[a${i}]`).join('')}amix=inputs=${voices.length}:duration=longest:dropout_transition=0[mix]`,
  '[mix]loudnorm=I=-12:TP=-1:LRA=7[aout]',
].join(';');

run('ffmpeg', [
  '-y',
  ...voices.flatMap((v) => ['-i', join(AUDIO, v.f)]),
  '-filter_complex', filter,
  '-map', '[aout]', '-t', '18', '-c:a', 'aac', '-b:a', '256k', join(TMP, 'audio.m4a'),
], 'mix audio');

run('ffmpeg', [
  '-y', '-i', withSubs, '-i', join(TMP, 'audio.m4a'),
  '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', FINAL,
], 'mux final');

const probe = spawnSync('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration,size',
  '-show_entries', 'stream=codec_type,codec_name,sample_rate,channels',
  '-of', 'default=noprint_wrappers=1', FINAL,
], { encoding: 'utf8' });
console.log(probe.stdout || '');
console.log('Done:', FINAL);

#!/usr/bin/env node
/**
 * Full Meta ad v2: cinematic scenes + real site + Hebrew TTS voices.
 * Output: output/orvo24-meta-ad-pro-18s.mp4
 */
import { chromium } from 'playwright';
import { spawnSync } from 'child_process';
import { mkdirSync, renameSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'output');
const AUDIO = join(__dirname, 'audio');
const HTML = join(__dirname, 'ad-pro.html');
const SCENES_WEBM = join(OUT, 'scenes.webm');
const SITE_WEBM = join(OUT, 'site-scroll.webm');
const SCENES_MP4 = join(OUT, 'scenes.mp4');
const SITE_MP4 = join(OUT, 'site.mp4');
const SILENT_MP4 = join(OUT, 'visual-only.mp4');
const MIXED_AUDIO = join(OUT, 'dialogue.wav');
const FINAL = join(OUT, 'orvo24-meta-ad-pro-18s.mp4');

const SITE_URL = process.env.SITE_URL || 'https://fantastic-eclair-0b2c66.netlify.app/';
const SCENES_MS = 14500;
const SITE_MS = 4500;

mkdirSync(OUT, { recursive: true });
mkdirSync(AUDIO, { recursive: true });

function run(cmd, args, label) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`${label || cmd} failed`);
    process.exit(r.status || 1);
  }
}

async function recordScenes() {
  const url = pathToFileURL(HTML).href + '?render=1';
  console.log('Recording scenes', url);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: { width: 1080, height: 1920 } },
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(900);
  await page.waitForTimeout(SCENES_MS);
  const video = page.video();
  await context.close();
  await browser.close();
  const p = await video.path();
  if (p !== SCENES_WEBM) renameSync(p, SCENES_WEBM);
}

async function recordSite() {
  console.log('Recording site', SITE_URL);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: { width: 1080, height: 1920 } },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  await page.goto(SITE_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(700);
  await page.evaluate(async () => {
    const step = 380;
    const max = Math.min(document.body.scrollHeight - innerHeight, 2400);
    for (let y = 0; y <= max; y += step) {
      window.scrollTo({ top: y, behavior: 'smooth' });
      await new Promise(r => setTimeout(r, 600));
    }
  });
  await page.waitForTimeout(1200);
  const video = page.video();
  await context.close();
  await browser.close();
  const p = await video.path();
  if (p !== SITE_WEBM) renameSync(p, SITE_WEBM);
}

function webmToMp4(src, dest, trimSec) {
  const args = ['-y', '-i', src, '-t', String(trimSec), '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', dest];
  run('ffmpeg', args, 'ffmpeg webm');
}

function buildAudio() {
  const g1 = join(AUDIO, 'g1.mp3');
  const h1 = join(AUDIO, 'h1.mp3');
  const g2 = join(AUDIO, 'g2.mp3');
  const h2 = join(AUDIO, 'h2.mp3');
  const end = join(AUDIO, 'end-vo.mp3');
  for (const f of [g1, h1, g2, h2, end]) {
    if (!existsSync(f)) {
      console.error('Missing audio:', f, '— run: bash generate-voice.sh');
      process.exit(1);
    }
  }
  // Delays match ad-pro.html timeline (ms)
  const filter = [
    '[0:a]adelay=5000|5000,volume=1.0[a0]',
    '[1:a]adelay=7800|7800,volume=1.0[a1]',
    '[2:a]adelay=10850|10850,volume=1.0[a2]',
    '[3:a]adelay=13830|13830,volume=1.0[a3]',
    '[4:a]adelay=14000|14000,atrim=0:4,volume=0.85[a4]',
    '[a0][a1][a2][a3][a4]amix=inputs=5:duration=longest:dropout_transition=0[aout]',
  ].join(';');
  run('ffmpeg', [
    '-y',
    '-i', g1, '-i', h1, '-i', g2, '-i', h2, '-i', end,
    '-filter_complex', filter,
    '-map', '[aout]', '-t', '18', MIXED_AUDIO,
  ], 'ffmpeg audio mix');
}

function muxFinal() {
  run('ffmpeg', [
    '-y', '-i', SILENT_MP4, '-i', MIXED_AUDIO,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest',
    '-movflags', '+faststart', FINAL,
  ], 'ffmpeg mux');
}

// ── Main ──
await recordScenes();
await recordSite();

webmToMp4(SCENES_WEBM, SCENES_MP4, SCENES_MS / 1000);
webmToMp4(SITE_WEBM, SITE_MP4, SITE_MS / 1000);

run('ffmpeg', [
  '-y', '-i', SCENES_MP4, '-i', SITE_MP4,
  '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0,format=yuv420p[v]',
  '-map', '[v]', '-t', '18', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-r', '30',
  '-movflags', '+faststart', SILENT_MP4,
], 'ffmpeg concat');

buildAudio();
muxFinal();

const probe = spawnSync('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration,size',
  '-of', 'default=noprint_wrappers=1', FINAL,
], { encoding: 'utf8' });
console.log(probe.stdout || '');
console.log('Done:', FINAL);

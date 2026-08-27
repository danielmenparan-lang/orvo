#!/usr/bin/env node
/**
 * Renders 18s Meta ad MP4 from index.html (2D CSS) via Playwright + ffmpeg.
 * Output: output/orvo24-meta-ad-18s.mp4 (1080×1920, 30fps)
 */
import { chromium } from 'playwright';
import { spawnSync } from 'child_process';
import { mkdirSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'output');
const HTML = join(__dirname, 'index.html');
const MP4 = join(OUT_DIR, 'orvo24-meta-ad-18s.mp4');
const DURATION_MS = 19000;

mkdirSync(OUT_DIR, { recursive: true });

const url = pathToFileURL(HTML).href + '?render=1';
console.log('Recording', url);

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-dev-shm-usage', '--no-sandbox'],
});

const context = await browser.newContext({
  viewport: { width: 1080, height: 1920 },
  deviceScaleFactor: 1,
  recordVideo: {
    dir: OUT_DIR,
    size: { width: 1080, height: 1920 },
  },
});

const page = await context.newPage();
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('.ad-stage', { timeout: 15000 });
await page.waitForTimeout(1200);
await page.waitForTimeout(DURATION_MS);

const video = page.video();
await context.close();
await browser.close();

if (!video) {
  console.error('No video recorded');
  process.exit(1);
}

const webmPath = await video.path();
const webmFinal = join(OUT_DIR, 'orvo24-meta-ad-18s.webm');
if (webmPath !== webmFinal) renameSync(webmPath, webmFinal);

console.log('Converting to MP4…');
const ff = spawnSync('ffmpeg', [
  '-y', '-i', webmFinal,
  '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
  '-pix_fmt', 'yuv420p', '-r', '30',
  '-movflags', '+faststart',
  MP4,
], { stdio: 'inherit' });

if (ff.status !== 0) {
  console.error('ffmpeg failed');
  process.exit(ff.status || 1);
}

const probe = spawnSync('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration,size',
  '-of', 'default=noprint_wrappers=1', MP4,
], { encoding: 'utf8' });
console.log(probe.stdout || '');
console.log('Done:', MP4);

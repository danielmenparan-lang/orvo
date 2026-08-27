#!/usr/bin/env node
/** Record mobile orvo24.com scroll for ad end card */
import { chromium } from 'playwright';
import { mkdirSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'output');
const SITE = process.env.SITE_URL || 'https://orvo24.com';
const DURATION_MS = 5000;

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({
  viewport: { width: 1080, height: 1920 },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: 1080, height: 1920 } },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});

const page = await context.newPage();
await page.goto(SITE, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(800);

// Smooth scroll through hero + marketplace section
await page.evaluate(async () => {
  const step = 420;
  const max = Math.min(document.body.scrollHeight - innerHeight, 2200);
  for (let y = 0; y <= max; y += step) {
    window.scrollTo({ top: y, behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 650));
  }
});

await page.waitForTimeout(Math.max(0, DURATION_MS - 3500));

const video = page.video();
await context.close();
await browser.close();

const webm = await video.path();
const dest = join(OUT, 'site-scroll.webm');
if (webm !== dest) renameSync(webm, dest);
console.log('Site recording:', dest);

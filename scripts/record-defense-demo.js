/**
 * Record defense-demo.html → MP4 (Playwright video + ffmpeg)
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'defense');
const TMP_DIR = path.join(OUT_DIR, '_rec');
const OUT_MP4 = path.join(OUT_DIR, 'zigzag-defense-demo.mp4');
const OUT_WEB = path.join(OUT_DIR, 'zigzag-defense-demo-web.mp4');
const DEMO_MS = 32500;
const W = 1280;
const H = 720;
const PORT = 5188;

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css';
  if (file.endsWith('.js')) return 'application/javascript';
  return 'application/octet-stream';
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(cmd + ' exit ' + code))));
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const server = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    const rel = url === '/' ? '/defense-demo.html' : url;
    const file = path.join(ROOT, decodeURIComponent(rel));
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
      res.writeHead(404);
      res.end('missing');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType(file) });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(PORT, r));
  console.log(`Serving on :${PORT}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--font-render-hinting=none'],
  });

  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    recordVideo: { dir: TMP_DIR, size: { width: W, height: H } },
  });

  const page = await context.newPage();

  // Warm fonts
  await page.goto(`http://127.0.0.1:${PORT}/defense-demo.html`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await page.waitForTimeout(1500);

  // Restart animation cleanly (new video page would be cleaner — close & reopen)
  await page.close();
  const page2 = await context.newPage();
  await page2.goto(`http://127.0.0.1:${PORT}/defense-demo.html`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  console.log(`Recording ${DEMO_MS}ms…`);
  await page2.waitForTimeout(DEMO_MS + 500);

  const video = page2.video();
  await page2.close();
  const webmPath = await video.path();
  await context.close();
  await browser.close();
  server.close();

  console.log('Raw video:', webmPath);
  console.log('Encoding MP4…');

  await run('ffmpeg', [
    '-y', '-i', webmPath,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium',
    '-movflags', '+faststart',
    OUT_MP4,
  ]);
  await run('ffmpeg', [
    '-y', '-i', OUT_MP4,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-preset', 'fast',
    '-vf', 'scale=1280:720', '-movflags', '+faststart',
    '-an',
    OUT_WEB,
  ]);

  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  const st = fs.statSync(OUT_MP4);
  const stw = fs.statSync(OUT_WEB);
  console.log(`Done: ${OUT_MP4} (${Math.round(st.size / 1024)} KB)`);
  console.log(`Web:  ${OUT_WEB} (${Math.round(stw.size / 1024)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

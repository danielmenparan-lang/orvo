/* Jarvis PWA — keep wake page cached for offline open on phone */
const CACHE = 'jarvis-wake-v1';
const ASSETS = [
  './jarvis.html',
  './jarvis.js',
  './jarvis-config.js',
  './jarvis.manifest.webmanifest',
  './data/jarvis-priorities.json',
  './assets/jarvis/wake-tone.wav',
  './assets/jarvis/icon-192.png',
  './assets/jarvis/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => hit);
      return hit || fresh;
    })
  );
});

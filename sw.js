// Hog Creek Lease offline helper: keeps the app and saved map tiles on the phone.
const SHELL = 'hc-shell-v15', TILES = 'hc-tiles-v1';
const SHELL_FILES = ['./', './index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/suncalc/1.9.0/suncalc.min.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.allSettled(SHELL_FILES.map(f => c.add(f)))));
  self.skipWaiting();
});
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('hc-shell') && k !== SHELL) await caches.delete(k);
  await self.clients.claim();
})()));
const tileKey = u => u.replace(/[?&]retry=\d+/, '');
self.addEventListener('fetch', e => {
  const req = e.request, u = req.url;
  if (req.method !== 'GET') return;
  if (/script\.google|googleusercontent|open-meteo/.test(u)) return;          // always live
  if (/arcgisonline\.com|nationalmap\.gov/.test(u)) {                          // map tiles: saved copy first
    e.respondWith((async () => {
      const c = await caches.open(TILES), k = tileKey(u);
      const hit = await c.match(k);
      if (hit) return hit;
      try { const r = await fetch(u, { mode: 'cors' }); if (r.ok) c.put(k, r.clone()); return r; }
      catch (err) { return new Response('', { status: 504 }); }
    })());
    return;
  }
  e.respondWith((async () => {                                                  // app files: live, else saved
    try {
      const r = await fetch(req);
      if (r.ok) { const c = await caches.open(SHELL); c.put(req, r.clone()); }
      return r;
    } catch (err) {
      return (await caches.match(req)) || (await caches.match('./index.html')) || new Response('Offline', { status: 503 });
    }
  })());
});

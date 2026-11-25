// Hog Creek Lease offline helper: keeps the app and saved map tiles on the phone.
const SHELL = 'hc-shell-v25', TILES = 'hc-tiles-v1', MEDIA = 'hc-media-v1';
const SHELL_FILES = ['./', './index.html', './guide.html', './manifest.json',
  './icons/logo.svg', './icons/apple-touch-icon.png', './icons/favicon-32.png', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  'https://cdn.jsdelivr.net/npm/leaflet-rotate@0.2.8/dist/leaflet-rotate-src.js',
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

// The intro video is NOT precached. The page adds it to MEDIA after it has played once;
// from then on it is served from there, honoring Range requests (iOS Safari needs 206 replies to play video).
async function media(req) {
  const hit = await (await caches.open(MEDIA)).match(req.url, { ignoreSearch: true });
  if (!hit) return fetch(req);
  const range = req.headers.get('range');
  if (!range) return hit;
  const blob = await hit.blob(), size = blob.size;
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start, end;
  if (!m) { start = 0; end = size - 1; }
  else if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }   // suffix range: last N bytes
  else { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; }
  if (start >= size || start > end) return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(blob.slice(start, end + 1), { status: 206, statusText: 'Partial Content', headers: {
    'Content-Type': hit.headers.get('Content-Type') || 'video/mp4',
    'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' } });
}

self.addEventListener('fetch', e => {
  const req = e.request, u = req.url;
  if (req.method !== 'GET') return;
  if (/script\.google|googleusercontent|open-meteo/.test(u)) return;          // always live
  if (/\.mp4(\?|$)/.test(u)) { e.respondWith(media(req)); return; }          // intro video
  if (/arcgisonline\.com|maptiles\.arcgis\.com|nationalmap\.gov/.test(u)) {    // map tiles (incl. Esri Clarity): saved copy first
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
      return (await caches.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await caches.match('./index.html') : null) || new Response('Offline', { status: 503 });
    }
  })());
});

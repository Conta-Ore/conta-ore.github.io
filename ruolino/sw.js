/* Ruolino istituzionale — service worker: la pagina si apre anche senza rete, gli aggiornamenti arrivano alla prima apertura con la rete. */
const CACHE = 'ruolino-ist-2026.10.28-3';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './portale.js', '../config.js', '../nucleo.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.indexOf('ruolino-ist-') === 0 && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  let u; try { u = new URL(r.url); } catch (err) { return; }
  if (u.origin !== self.location.origin) return;          // font e risorse esterne passano dritte
  e.respondWith(
    fetch(r).then(res => {                                   // prima la rete: così gli aggiornamenti arrivano subito
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); }
      return res;
    }).catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || (r.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});

/* W10: офлайн-работа установленной игры. Страница — «сначала сеть» (обновления приходят сразу после публикации),
   файлы сборки с хешем в имени — «сначала кэш» (они не меняются). Сохранения игры хранятся в IndexedDB, не здесь. */
const CACHE = 'gamemr-v1';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Музыка (AUDIO v1): браузер запрашивает её частями (Range), такие ответы нельзя класть в кэш — отдаём напрямую из сети.
  if (req.headers.has('range') || /\.(mp3|ogg|m4a)$/.test(url.pathname)) return;
  const hashed = /\/assets\/[^/]+-[\w-]{8}\.\w+$/.test(url.pathname);
  if (hashed) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || caches.match('./'))));
});

/* CatCare AI — Service Worker v4 (network-first for app code) */
const CACHE = 'catcare-v25';
const ASSETS = [
  './',
  './index.html',
  './app.js?v=25',
  './symptoms.js?v=25',
  './manifest.json',
  './version.json',
  './icon-192.png',
  './icon-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;            // ปล่อยให้ CDN/AI โหลดจากเน็ตตรง ๆ
  const isCode = e.request.mode === 'navigate'
    || e.request.destination === 'document'
    || url.pathname.endsWith('/')
    || /\.(js|json|html)$/.test(url.pathname);
  if (isCode) {
    // network-first: เอาของใหม่ก่อนเสมอเมื่อออนไลน์ ถ้าออฟไลน์ค่อยใช้แคช
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
  } else {
    // cache-first สำหรับรูป/ไอคอน
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }))
    );
  }
});

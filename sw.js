const CACHE_NAME = 'smart-schedule-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// ติดตั้งและแคชไฟล์หลัก
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// ลบแคชเวอร์ชันเก่าเมื่ออัปเดต
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-First: ดึงข้อมูลใหม่จากเน็ตก่อน ถ้าออฟไลน์ค่อยใช้แคช
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        const cloned = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, cloned);
        });
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});

const CACHE_NAME = 'smart-schedule-v3';
const CORE_ASSETS = [
  './',
  './index.html'
];

// ติดตั้งและแคชไฟล์หลักสำหรับใช้งานแบบ Offline
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// ลบแคชเวอร์ชันเก่าออกเมื่อมีการอัปเดตโค้ดใหม่
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Network-First: ดึงเวอร์ชันล่าสุดจาก GitHub ก่อน หากออฟไลน์ค่อยดึงจากแคชในเครื่อง
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cloned);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});

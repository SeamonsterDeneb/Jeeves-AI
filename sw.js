const CACHE_NAME = 'v3';
const ASSETS = ['/', '/index.html', '/css/jeeves.css', '/js/jeeves.js'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('firestore.googleapis.com') || event.request.url.includes('googleapis.com')) {
    return; // Let browser handle network request natively
  }
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

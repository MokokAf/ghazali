// ============================================
// GHAZALI — Service Worker
// ============================================

const CACHE_NAME = 'ghazali-v12';
const SHELL_ASSETS = [
  '/app.html',
  '/onboarding.html',
  '/ghazali.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
  '/icon.svg',
  '/notification-logo.png',
  '/data/daily-content.json',
];

// Install — cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — cache-first for shell, network-first for API, stale-while-revalidate for CDN
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and API requests
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;

  // CDN fonts — stale-while-revalidate
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Same-origin — cache-first, fallback to network
  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached || fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
    )
  );
});

// Push notification
self.addEventListener('push', (event) => {
  let data = { title: 'Ghazali', body: 'Ta lecture du jour est prête.' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    // Use defaults
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Ghazali', {
      body: data.body || 'Ta lecture du jour est prête.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/app' },
    })
  );
});

// Notification click — open app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/app';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if open
      for (const client of clients) {
        if (new URL(client.url).pathname === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      return self.clients.openWindow(targetUrl);
    })
  );
});

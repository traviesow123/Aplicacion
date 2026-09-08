// ═══════════════════════════════════════════════════════════════
// Service Worker — Calendario Inteligente
// Push notifications, offline caching, background sync
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'calendario-ia-v3';
const ASSETS_TO_CACHE = [
  './index.html',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap',
];

// ─── Install: Cache essential assets ───
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[SW] Some assets could not be cached:', err);
      });
    })
  );
  self.skipWaiting();
});

// ─── Activate: Clean old caches ───
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// ─── Fetch: Network-first with cache fallback ───
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests and external API calls
  if (request.method !== 'GET') return;
  if (request.url.includes('supabase.co')) return;
  if (request.url.includes('cdn.jsdelivr.net')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, cloned);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          if (request.mode === 'navigate') {
            return caches.match('./index.html').then(c => c || caches.match('/index.html'));
          }
          return new Response('', { status: 408, statusText: 'Offline' });
        });
      })
  );
});

// ─── Push: Display notification from server ───
self.addEventListener('push', (event) => {
  let data = { title: 'Calendario Inteligente', body: 'Tienes un recordatorio.' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || 'Tienes una cita próxima.',
    icon: data.icon || './icon-192.svg',
    badge: './icon-192.svg',
    vibrate: [100, 50, 100, 50, 200],
    tag: data.tag || 'appointment-reminder',
    renotify: true,
    requireInteraction: true,
    data: {
      url: data.url || './index.html',
      appointmentId: data.appointmentId || null,
    },
    actions: [
      { action: 'confirm', title: '✅ Confirmar' },
      { action: 'dismiss', title: '❌ Descartar' },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// ─── Notification Click: Open app or focus existing tab ───
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || './index.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

// ─── Background Sync: Retry failed operations ───
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-appointments') {
    event.waitUntil(syncPendingAppointments());
  }
});

async function syncPendingAppointments() {
  console.log('[SW] Background sync triggered for appointments.');
}

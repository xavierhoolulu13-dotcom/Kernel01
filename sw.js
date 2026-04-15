// ═══════════════════════════════════════════════
// KERNEL-01 SERVICE WORKER v1.0
// XKSH808 Digital Services Hawaii
// Handles: offline caching, app shell, sync
// ═══════════════════════════════════════════════

const CACHE  = 'kernel01-v1.0';
const SHELL  = ['./', './index.html', './manifest.json'];
const FONTS  = 'https://fonts.googleapis.com';

// ── INSTALL: Cache app shell ──────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())  // Don't block on font failure
  );
});

// ── ACTIVATE: Clean old caches ────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH: Smart caching strategy ────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // ① Gemini API — network only, return offline error if fails
  if (url.hostname.includes('googleapis.com') && url.pathname.includes('generateContent')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ error: { message: 'Offline — message will be queued' }, status: 503 }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // ② Google Fonts — cache first, then network
  if (url.hostname.includes('fonts.gstatic.com') || url.hostname.includes('fonts.googleapis.com')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone)).catch(()=>{});
          return res;
        }).catch(() => new Response('', { status: 408 }));
      })
    );
    return;
  }

  // ③ App shell — cache first, network fallback
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request)
        .then(response => {
          // Cache valid responses
          if (response && response.status === 200 && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE).then(c => c.put(request, clone)).catch(()=>{});
          }
          return response;
        })
        .catch(() => {
          // Navigation fallback — serve index.html
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Offline', { status: 503 });
        });
    })
  );
});

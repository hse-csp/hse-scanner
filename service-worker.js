// ============================================
// HSE CSP Service Worker
// ============================================

var CACHE_NAME = 'hse-csp-v2';
var STATIC_ASSETS = [
  './',
  './index.html',
  './checklist.html',
  './dashboard.html',
  './history.html',
  './logs.html',
  './users.html',
  './equipment.html',
  './report.html',
  './manifest.json',
  './pwa.js',
  './offline.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.all(
        STATIC_ASSETS.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('Failed to cache: ' + url, err);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // Never cache Apps Script API calls
  if (url.indexOf('script.google.com') !== -1 ||
      url.indexOf('googleusercontent.com') !== -1) {
    return;
  }

  // Ignore non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // CACHE-FIRST for HTML pages (fast navigation)
  if (event.request.mode === 'navigate' ||
      url.indexOf('.html') !== -1 ||
      url.endsWith('/')) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) {
          // Serve from cache immediately
          // Update cache in background (stale-while-revalidate)
          fetch(event.request).then(function(response) {
            if (response && response.status === 200) {
              caches.open(CACHE_NAME).then(function(cache) {
                cache.put(event.request, response);
              });
            }
          }).catch(function() {});
          return cached;
        }
        // Not in cache - fetch and cache
        return fetch(event.request).then(function(response) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, copy);
          });
          return response;
        }).catch(function() {
          return caches.match('./index.html');
        });
      })
    );
    return;
  }

  // Cache-first for other assets
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, copy);
          });
        }
        return response;
      });
    })
  );
});

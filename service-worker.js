// ============================================
// HSE CSP Service Worker  v3
// ============================================
var VERSION = 'hse-csp-v3.3.0';
var PRECACHE = [
  './', './index.html', './login.html', './checklist.html', './dashboard.html', './history.html',
  './fire.html', './equipment-list.html', './forms.html', './form-fill.html', './forms-admin.html', './equipment.html', './report.html', './users.html', './logs.html', './offline.html',
  './common.js', './queue.js', './pwa.js', './manifest.json',
  './assets/html5-qrcode.min.js',
  './assets/fa/css/all.min.css', './assets/fa/webfonts/fa-solid-900.woff2', './assets/fa/webfonts/fa-regular-400.woff2',
  './assets/vazirmatn/Vazirmatn.css',
  './assets/vazirmatn/fonts/webfonts/Vazirmatn-Regular.woff2', './assets/vazirmatn/fonts/webfonts/Vazirmatn-Medium.woff2',
  './assets/vazirmatn/fonts/webfonts/Vazirmatn-Bold.woff2', './assets/vazirmatn/fonts/webfonts/Vazirmatn-ExtraBold.woff2',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png', './icons/icon.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return Promise.all(PRECACHE.map(function (u) { return c.add(u).catch(function (err) { console.warn('precache failed', u); }); }));
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.hostname.indexOf('script.google') !== -1 || url.hostname.indexOf('googleusercontent') !== -1) return;   // API: هرگز کش نشود
  if (url.origin !== location.origin) return;

  // stale-while-revalidate (نادیده گرفتن query)
  e.respondWith(caches.open(VERSION).then(function (cache) {
    return cache.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      }).catch(function () { return null; });
      if (hit) { e.waitUntil(net); return hit; }
      return net.then(function (res) {
        if (res) return res;
        if (req.mode === 'navigate') return cache.match('./offline.html');
        return new Response('', { status: 504, statusText: 'offline' });
      });
    });
  }));
});

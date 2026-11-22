// ============================================
// PWA: ثبت Service Worker + اعلان نسخه‌ی جدید + نشانگر آنلاین/آفلاین
// ============================================
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./service-worker.js', { scope: './' }).then(function (reg) {
        function offerUpdate(worker) {
          if (document.getElementById('updateBar')) return;
          var bar = document.createElement('div');
          bar.id = 'updateBar';
          bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2000;background:#1e3c72;color:#fff;padding:10px 14px;text-align:center;font-size:13px;font-family:inherit';
          bar.innerHTML = 'نسخه‌ی جدید برنامه آماده است. <button style="margin-right:8px;padding:4px 12px;border:0;border-radius:8px;background:#fff;color:#1e3c72;font-family:inherit;font-weight:bold;cursor:pointer">به‌روزرسانی</button>';
          bar.querySelector('button').onclick = function () { worker.postMessage('SKIP_WAITING'); };
          document.body.appendChild(bar);
        }
        if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
        reg.addEventListener('updatefound', function () {
          var nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', function () {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(nw);
          });
        });
      }).catch(function (e) { console.warn('SW registration failed', e); });
      var reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () { if (reloaded) return; reloaded = true; location.reload(); });
    });
  }
  window.addEventListener('online', function () { document.documentElement.classList.remove('offline'); });
  window.addEventListener('offline', function () { document.documentElement.classList.add('offline'); });
  if (!navigator.onLine) document.documentElement.classList.add('offline');
})();

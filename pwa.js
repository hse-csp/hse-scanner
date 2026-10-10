// ============================================
// PWA Registration and Helper
// ============================================

(function() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('./service-worker.js', { scope: './' })
        .then(function(reg) {
          console.log('Service Worker registered:', reg.scope);
        })
        .catch(function(err) {
          console.warn('Service Worker registration failed:', err);
        });
    });
  }

  // Online/offline indicator
  window.addEventListener('online', function() {
    document.documentElement.classList.remove('offline');
  });

  window.addEventListener('offline', function() {
    document.documentElement.classList.add('offline');
  });

  if (!navigator.onLine) {
    document.documentElement.classList.add('offline');
  }
})();
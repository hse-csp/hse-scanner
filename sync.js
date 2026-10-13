// ============================================
// Auto Sync Manager
// ============================================

var SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
var _syncTimer = null;

function startAutoSync(execUrl) {
  if (_syncTimer) clearInterval(_syncTimer);

  _syncTimer = setInterval(function() {
    if (!navigator.onLine) return;

    if (typeof syncPendingInspections === 'function') {
      syncPendingInspections(execUrl).then(function(res) {
        if (res.synced > 0 || res.failed > 0) {
          console.log('Auto-sync:', res);
        }
      });
    }
  }, SYNC_INTERVAL_MS);
}

function stopAutoSync() {
  if (_syncTimer) {
    clearInterval(_syncTimer);
    _syncTimer = null;
  }
}

// ============================================
// Banner for pending items
// ============================================

function showPendingBanner() {
  if (typeof getPendingCount !== 'function') return;

  getPendingCount().then(function(count) {
    var existing = document.getElementById('pendingBanner');
    if (count === 0) {
      if (existing) existing.remove();
      return;
    }

    if (existing) {
      existing.querySelector('.pb-text').textContent =
        '📤 ' + count + ' بازرسی در انتظار ارسال';
      return;
    }

    var bar = document.createElement('div');
    bar.id = 'pendingBanner';
    bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#ff9800;color:#fff;text-align:center;padding:12px;font-size:14px;font-weight:bold;z-index:9998;cursor:pointer;';
    bar.innerHTML = '<span class="pb-text">📤 ' + count + ' بازرسی در انتظار ارسال</span>';
    bar.onclick = function() {
      window.location.href = 'offline.html';
    };
    document.body.appendChild(bar);
    document.body.style.paddingBottom = '50px';
  });
}

// ============================================
// Init on any page
// ============================================

function initSyncSystem(execUrl) {
  if (!execUrl) return;

  startAutoSync(execUrl);
  showPendingBanner();

  // Refresh banner every 30 seconds
  setInterval(showPendingBanner, 30000);
}

// ============================================
// Helper: is app running as PWA?
// ============================================

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}

// ============================================
// Expose for other scripts
// ============================================

window.HSEOffline = {
  initSyncSystem: initSyncSystem,
  syncNow: function(execUrl) {
    if (typeof syncPendingInspections === 'function') {
      return syncPendingInspections(execUrl);
    }
  }
};

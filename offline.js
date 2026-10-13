// ============================================
// Offline Logic for HSE Inspection System
// ============================================

var OFFLINE_MODE_KEY = 'hse_offline_mode';
var LAST_SYNC_KEY = 'hse_last_sync';

// ============================================
// Online/Offline detection
// ============================================

function isOnline() {
  return navigator.onLine;
}

function updateOnlineIndicator() {
  var existing = document.getElementById('offlineIndicator');
  if (!navigator.onLine) {
    if (!existing) {
      var bar = document.createElement('div');
      bar.id = 'offlineIndicator';
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#d32f2f;color:#fff;text-align:center;padding:6px;font-size:13px;font-weight:bold;z-index:9999;';
      bar.textContent = '📡 حالت آفلاین - داده‌ها روی گوشی ذخیره می‌شوند';
      document.body.appendChild(bar);
      document.body.style.paddingTop = '32px';
    }
  } else {
    if (existing) {
      existing.remove();
      document.body.style.paddingTop = '';
    }
  }
}

window.addEventListener('online', function() {
  updateOnlineIndicator();
  if (typeof onBackOnline === 'function') onBackOnline();
});

window.addEventListener('offline', function() {
  updateOnlineIndicator();
});

// ============================================
// Equipment Cache Sync
// ============================================

function syncEquipmentCache(token, execUrl) {
  return fetch(execUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'equipment.getAll',
      token: token,
      payload: { includeInactive: false }
    }),
    redirect: 'follow'
  }).then(function(r) { return r.json(); }).then(function(res) {
    if (!res.success) return { success: false };

    var all = [];
    (res.data.cylinders || []).forEach(function(c) {
      c._kind = 'cylinder';
      all.push(c);
    });
    (res.data.fireboxes || []).forEach(function(f) {
      f._kind = 'firebox';
      all.push(f);
    });

    return dbSaveAllEquipment(all).then(function(count) {
      return dbSetMeta(LAST_SYNC_KEY, new Date().toISOString()).then(function() {
        return { success: true, count: count };
      });
    });
  });
}

// ============================================
// Lookup Equipment (cache-first)
// ============================================

function lookupEquipment(barcode, token, execUrl) {
  return dbGetEquipmentByBarcode(barcode).then(function(cached) {
    // If online, refresh from server
    if (navigator.onLine) {
      return fetch(execUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'inspection.prepare',
          token: token,
          payload: { barcode: barcode }
        }),
        redirect: 'follow'
      }).then(function(r) { return r.json(); });
    }

    // Offline: use cache
    if (!cached) {
      return { success: false, error: 'تجهیز در حافظه گوشی یافت نشد. لطفاً اتصال اینترنت را بررسی کنید.' };
    }
    return { success: false, error: 'offline_fallback', cachedData: cached };
  });
}

// ============================================
// Save Inspection (offline-aware)
// ============================================

function saveInspectionOffline(payload, token, execUrl) {
  if (navigator.onLine) {
    // Try online first
    return fetch(execUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'inspection.save',
        token: token,
        payload: payload
      }),
      redirect: 'follow'
    }).then(function(r) { return r.json(); }).catch(function() {
      // Failed - fall back to offline
      return saveToOfflineQueue(payload);
    });
  }

  return saveToOfflineQueue(payload);
}

function saveToOfflineQueue(payload) {
  var localId = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

  var inspection = {
    localId: localId,
    createdAt: Date.now(),
    status: 'pending',
    attempts: 0,
    lastError: '',
    barcode: payload.barcode,
    items: payload.items || [],
    finalStatus: payload.finalStatus,
    notes: payload.notes || '',
    photoData: payload.photoData || null,
    mimeType: payload.mimeType || 'image/jpeg',
    token: (typeof currentToken !== 'undefined' ? currentToken : localStorage.getItem('token'))
  };

  return dbSavePendingInspection(inspection).then(function() {
    return { success: true, data: { offline: true, localId: localId } };
  });
}

// ============================================
// Sync Pending Inspections
// ============================================

var _isSyncing = false;

function syncPendingInspections(execUrl) {
  if (_isSyncing) return Promise.resolve({ skipped: true });
  if (!navigator.onLine) return Promise.resolve({ offline: true });

  _isSyncing = true;

  return dbGetAllPending().then(function(pending) {
    if (pending.length === 0) {
      _isSyncing = false;
      return { synced: 0, failed: 0 };
    }

    var synced = 0;
    var failed = 0;

    return pending.reduce(function(chain, item) {
      return chain.then(function() {
        if (item.status === 'syncing') return;
        return dbUpdatePending(item.localId, { status: 'syncing' }).then(function() {
          return fetch(execUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'inspection.save',
              token: item.token,
              payload: {
                barcode: item.barcode,
                items: item.items,
                finalStatus: item.finalStatus,
                notes: item.notes,
                photoData: item.photoData,
                mimeType: item.mimeType
              }
            }),
            redirect: 'follow'
          }).then(function(r) { return r.json(); }).then(function(res) {
            if (res.success) {
              synced++;
              return dbDeletePending(item.localId);
            } else {
              failed++;
              return dbUpdatePending(item.localId, {
                status: 'failed',
                attempts: (item.attempts || 0) + 1,
                lastError: res.error || 'خطای ناشناخته'
              });
            }
          }).catch(function(err) {
            failed++;
            return dbUpdatePending(item.localId, {
              status: 'pending',
              attempts: (item.attempts || 0) + 1,
              lastError: err.message || 'خطای شبکه'
            });
          });
        });
      });
    }, Promise.resolve()).then(function() {
      _isSyncing = false;
      return { synced: synced, failed: failed };
    });
  }).catch(function(err) {
    _isSyncing = false;
    return { error: err.message };
  });
}

// ============================================
// Auto-sync on startup and reconnect
// ============================================

function initOfflineSystem(token, execUrl) {
  updateOnlineIndicator();

  if (!token) return;

  // Sync equipment cache on startup (if online)
  if (navigator.onLine) {
    syncEquipmentCache(token, execUrl).then(function(res) {
      if (res.success) {
        console.log('Equipment cache synced:', res.count);
      }
    });

    // Sync any pending inspections
    syncPendingInspections(execUrl).then(function(res) {
      console.log('Sync result:', res);
    });
  }
}

function onBackOnline() {
  if (typeof EXEC_URL !== 'undefined' && typeof currentToken !== 'undefined') {
    syncPendingInspections(EXEC_URL).then(function(res) {
      console.log('Auto-sync result:', res);
    });
  }
}

// ============================================
// Helpers
// ============================================

function getPendingCount() {
  return dbGetAllPending().then(function(items) {
    return items.length;
  });
}

function formatOfflineTime(timestamp) {
  var d = new Date(timestamp);
  var y = d.getFullYear();
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  var hh = ('0' + d.getHours()).slice(-2);
  var mm = ('0' + d.getMinutes()).slice(-2);
  return y + '/' + m + '/' + day + ' - ' + hh + ':' + mm;
}

// ============================================
// IndexedDB Wrapper for Offline Storage
// ============================================

var HSE_DB_NAME = 'hse-csp-db';
var HSE_DB_VERSION = 1;

var HSE_STORES = {
  equipment: 'equipment',   // cache of all equipment
  inspections: 'inspections', // pending offline inspections
  meta: 'meta'              // key-value store
};

var hseDb = null;

function openDb() {
  return new Promise(function(resolve, reject) {
    if (hseDb) {
      resolve(hseDb);
      return;
    }

    var request = indexedDB.open(HSE_DB_NAME, HSE_DB_VERSION);

    request.onupgradeneeded = function(event) {
      var db = event.target.result;

      if (!db.objectStoreNames.contains(HSE_STORES.equipment)) {
        db.createObjectStore(HSE_STORES.equipment, { keyPath: 'Barcode' });
      }

      if (!db.objectStoreNames.contains(HSE_STORES.inspections)) {
        var inspStore = db.createObjectStore(HSE_STORES.inspections, { keyPath: 'localId' });
        inspStore.createIndex('status', 'status', { unique: false });
        inspStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(HSE_STORES.meta)) {
        db.createObjectStore(HSE_STORES.meta, { keyPath: 'key' });
      }
    };

    request.onsuccess = function(event) {
      hseDb = event.target.result;
      resolve(hseDb);
    };

    request.onerror = function(event) {
      reject(event.target.error);
    };
  });
}

// ---------- Equipment Cache ----------

function dbSaveAllEquipment(items) {
  return openDb().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(HSE_STORES.equipment, 'readwrite');
      var store = tx.objectStore(HSE_STORES.equipment);
      store.clear();
      items.forEach(function(item) { store.put(item); });
      tx.oncomplete = function() { resolve(items.length); };
      tx.onerror = function() { reject(tx.error); };
    });
  });
}

function dbGetEquipmentByBarcode(barcode) {
  return openDb().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(HSE_STORES.equipment, 'readonly');
      var store = tx.objectStore(HSE_STORES.equipment);
      var req = store.get(barcode);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror = function() { reject(req.error); };
    });
  });
}

function dbGetAllEquipment() {
  return openDb().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(HSE_STORES.equipment, 'readonly');
      var store = tx.objectStore(HSE_STORES.equipment);
      var req = store.getAll();
      req.onsuccess = function() { resolve(req.result || []); };
      req.onerror = function() { reject(req.error); };
    });
  });
}

// ---------- Pending Inspections ----------

function dbSavePendingInspection(inspection) {
  return openDb().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(HSE_STORES.inspections, 'readwrite');
      var store = tx.objectStore(HSE_STORES.inspections);
      store.put(inspection);
      tx.oncomplete = function() { resolve(inspection.localId); };
      tx.onerror = function() { reject(tx.error); };
    });
  });
}

function dbGetAllPending() {
  return openDb().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(HSE_STORES.inspections, 'readonly');
      var store = tx.objectStore(HSE_STORES.inspections);
      var req = store.getAll();
      req.onsuccess = function() {
        var all = req.result || [];
        all.sort(function(a, b) { return b.createdAt - a.createdAt; });
        resolve(all);
      };
      req.onerror = function() { reject(req.error); };
    });
  });
}

function dbDeletePending(localId) {
  return openDb().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(HSE_STORES.inspections, 'readwrite');
      var store = tx.objectStore(HSE_STORES.inspections);
      store.delete(localId);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  });
}

function dbUpdatePending(localId, changes) {
  return openDb().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(HSE_STORES.inspections, 'readwrite');
      var store = tx.objectStore(HSE_STORES.inspections);
      var req = store.get(localId);
      req.onsuccess = function() {
        var item = req.result;
        if (!item) {
          resolve(null);
          return;
        }
        Object.keys(changes).forEach(function(k) {
          item[k] = changes[k];
        });
        store.put(item);
      };
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  });
}

// ---------- Meta ----------

function dbSetMeta(key, value) {
  return openDb().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(HSE_STORES.meta, 'readwrite');
      var store = tx.objectStore(HSE_STORES.meta);
      store.put({ key: key, value: value });
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  });
}

function dbGetMeta(key) {
  return openDb().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(HSE_STORES.meta, 'readonly');
      var store = tx.objectStore(HSE_STORES.meta);
      var req = store.get(key);
      req.onsuccess = function() {
        resolve(req.result ? req.result.value : null);
      };
      req.onerror = function() { reject(req.error); };
    });
  });
}

// ============================================
// Offline Queue - IndexedDB Helper
// ============================================

var DB_NAME = 'hse_pending';
var DB_VERSION = 1;
var STORE_NAME = 'inspections';

function openDB() {
  return new Promise(function(resolve, reject) {
    var request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = function() { reject(request.error); };
    request.onsuccess = function() { resolve(request.result); };
    request.onupgradeneeded = function(event) {
      var db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

function savePendingSubmission(payload) {
  return openDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      var store = tx.objectStore(STORE_NAME);
      var record = {
        payload: payload,
        timestamp: new Date().toISOString(),
        retries: 0
      };
      var req = store.add(record);
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { reject(req.error); };
    });
  });
}

function getPendingSubmissions() {
  return openDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readonly');
      var store = tx.objectStore(STORE_NAME);
      var req = store.getAll();
      req.onsuccess = function() { resolve(req.result || []); };
      req.onerror = function() { reject(req.error); };
    });
  });
}

function deletePendingSubmission(id) {
  return openDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      var store = tx.objectStore(STORE_NAME);
      var req = store.delete(id);
      req.onsuccess = function() { resolve(); };
      req.onerror = function() { reject(req.error); };
    });
  });
}

function incrementRetry(id) {
  return openDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      var store = tx.objectStore(STORE_NAME);
      var getReq = store.get(id);
      getReq.onsuccess = function() {
        var record = getReq.result;
        if (record) {
          record.retries = (record.retries || 0) + 1;
          var putReq = store.put(record);
          putReq.onsuccess = function() { resolve(); };
          putReq.onerror = function() { reject(putReq.error); };
        } else {
          resolve();
        }
      };
      getReq.onerror = function() { reject(getReq.error); };
    });
  });
}

// ============================================
// queue.js — صف آفلاین واحد (IndexedDB) + کش تجهیزات/چک‌لیست
// جایگزین db.js / sync.js / offline.js و صف localStorage
// ============================================
(function (w) {
  var DB_NAME = 'hse-csp-v3', DB_VER = 1;
  var CACHE_TTL_MS = 6 * 3600 * 1000;
  var PERMANENT = ['VALIDATION', 'NOT_FOUND', 'TOO_SOON', 'NOT_ACTIVE', 'FORBIDDEN'];
  var dbp = null, syncing = false, inited = false;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      var rq = indexedDB.open(DB_NAME, DB_VER);
      rq.onupgradeneeded = function () {
        var db = rq.result;
        db.createObjectStore('equipment', { keyPath: 'barcode' });
        db.createObjectStore('checklists', { keyPath: 'type' });
        db.createObjectStore('inspections', { keyPath: 'localId' });
        db.createObjectStore('meta', { keyPath: 'key' });
      };
      rq.onsuccess = function () { resolve(rq.result); };
      rq.onerror = function () { dbp = null; reject(rq.error); };
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, mode), s = t.objectStore(store), out = fn(s);
        t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : undefined); };
        t.onerror = t.onabort = function () { reject(t.error); };
      });
    });
  }
  function getAll(store) { return tx(store, 'readonly', function (s) { return s.getAll(); }); }
  function get(store, key) { return tx(store, 'readonly', function (s) { return s.get(key); }); }
  function put(store, val) { return tx(store, 'readwrite', function (s) { return s.put(val); }); }
  function del(store, key) { return tx(store, 'readwrite', function (s) { return s.delete(key); }); }

  function uid() { return (w.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2); }

  // ---------- صف ----------
  function addPending(payload, meta) {
    var item = {
      localId: uid(), createdAt: Date.now(), username: localStorage.getItem('username') || '',
      action: (meta && meta.action) || 'inspection.save',
      barcode: payload.barcode || (meta && meta.label) || '', finalStatus: payload.finalStatus, payload: payload,
      attempts: 0, status: 'pending', lastError: '', label: (meta && meta.label) || '', finalLabel: (meta && meta.finalLabel) || ''
    };
    return put('inspections', item).then(function () { refreshBanner(); return item.localId; });
  }
  function list() { return getAll('inspections').then(function (a) { return a.sort(function (x, y) { return x.createdAt - y.createdAt; }); }); }
  function remove(id) { return del('inspections', id).then(refreshBanner); }
  function update(id, ch) { return get('inspections', id).then(function (it) { if (!it) return; Object.assign(it, ch); return put('inspections', it); }); }
  function count() { return list().then(function (a) { return { total: a.length, failed: a.filter(function (x) { return x.status === 'failed'; }).length }; }); }
  function retry(id) { return update(id, { status: 'pending', lastError: '' }).then(refreshBanner); }

  // ارسال یک آیتم. خروجی: ok | permanent | retry | auth
  function sendItem(it) {
    var token = localStorage.getItem('token');
    if (!token) return Promise.resolve({ result: 'auth', error: 'نشست منقضی شده' });
    return update(it.localId, { status: 'syncing', attempts: (it.attempts || 0) + 1 }).then(function () {
      return rawPost({ action: it.action || 'inspection.save', token: token, payload: it.payload }, 120000);
    }).then(function (res) {
      if (res && res.success) return remove(it.localId).then(function () { return { result: 'ok' }; });
      var code = res && res.code, err = (res && res.error) || 'خطای نامشخص';
      if (code === 'AUTH') return update(it.localId, { status: 'pending', lastError: err }).then(function () { return { result: 'auth', error: err }; });
      if (PERMANENT.indexOf(code) !== -1) return update(it.localId, { status: 'failed', lastError: err }).then(function () { return { result: 'permanent', error: err }; });
      return update(it.localId, { status: 'pending', lastError: err }).then(function () { return { result: 'retry', error: err }; });
    }, function (e) {
      return update(it.localId, { status: 'pending', lastError: 'خطای شبکه' }).then(function () { return { result: 'retry', error: 'خطای شبکه' }; });
    });
  }
  function sendNow(localId) { return get('inspections', localId).then(function (it) { return it ? sendItem(it) : { result: 'ok' }; }); }

  // همگام‌سازی کل صف (فقط آیتم‌های کاربر فعلی)
  function sync() {
    if (syncing || !navigator.onLine || !localStorage.getItem('token')) return Promise.resolve({ synced: 0 });
    syncing = true;
    var me = localStorage.getItem('username'), synced = 0, failed = 0, authLost = false;
    return list().then(function (items) {
      var chain = Promise.resolve();
      items.forEach(function (it) {
        chain = chain.then(function () {
          if (authLost || it.status === 'failed' || (it.username && it.username !== me)) return;
          return sendItem(it).then(function (r) {
            if (r.result === 'ok') synced++;
            else if (r.result === 'permanent') failed++;
            else if (r.result === 'auth') authLost = true;
            else authLost = true;           // شبکه/سرور مشغول: بقیه بعداً
          });
        });
      });
      return chain;
    }).then(function () { syncing = false; refreshBanner(); if (synced) { try { w.dispatchEvent(new CustomEvent('hse-synced', { detail: { synced: synced } })); } catch (e) {} } return { synced: synced, failed: failed }; },
      function (e) { syncing = false; return { synced: synced }; });
  }

  // ---------- کش آفلاین ----------
  function refreshCache(force) {
    if (!navigator.onLine || !localStorage.getItem('token')) return Promise.resolve(false);
    return get('meta', 'cacheTime').then(function (m) {
      if (!force && m && Date.now() - m.value < CACHE_TTL_MS) return false;
      return rawPost({ action: 'sync.bootstrap', token: localStorage.getItem('token') }).then(function (res) {
        if (!res || !res.success) return false;
        return open().then(function (db) {
          return new Promise(function (resolve, reject) {
            var t = db.transaction(['equipment', 'checklists', 'meta'], 'readwrite');
            t.objectStore('equipment').clear();
            res.data.equipment.forEach(function (e) { t.objectStore('equipment').put(e); });
            t.objectStore('checklists').clear();
            Object.keys(res.data.checklists).forEach(function (k) { t.objectStore('checklists').put({ type: k, items: res.data.checklists[k] }); });
            if (res.data.forms) {
              t.objectStore('meta').put({ key: 'forms_list', value: res.data.forms.forms });
              Object.keys(res.data.forms.items).forEach(function (k) { t.objectStore('meta').put({ key: 'forms_items_' + k, value: res.data.forms.items[k] }); });
              Object.keys(res.data.forms.fields).forEach(function (k) { t.objectStore('meta').put({ key: 'forms_fields_' + k, value: res.data.forms.fields[k] }); });
            }
            t.objectStore('meta').put({ key: 'cacheTime', value: Date.now() });
            t.oncomplete = function () { resolve(true); };
            t.onerror = t.onabort = function () { reject(t.error); };
          });
        });
      });
    }).catch(function () { return false; });
  }
  function getAllEquipment() { return getAll('equipment').catch(function () { return []; }); }
  function getEquipment(barcode) { return get('equipment', String(barcode)).catch(function () { return null; }); }
  function getChecklist(type) { return get('checklists', type).then(function (r) { return r ? r.items : null; }).catch(function () { return null; }); }
  // ---------- کش فرم‌ها (بهداشتی / ایمنی) برای حالت آفلاین ----------
  function getForms(category) {
    return get('meta', 'forms_list').then(function (r) {
      var l = r ? r.value : [];
      return category ? l.filter(function (f) { return f.category === category; }) : l;
    }).catch(function () { return []; });
  }
  function getFormItems(formId) { return get('meta', 'forms_items_' + formId).then(function (r) { return r ? r.value : null; }).catch(function () { return null; }); }
  function getFormFields(formId) { return get('meta', 'forms_fields_' + formId).then(function (r) { return r ? r.value : []; }).catch(function () { return []; }); }
  function cacheForm(form, items, fields) {
    return get('meta', 'forms_list').then(function (r) {
      var l = (r ? r.value : []).filter(function (f) { return f.formId !== form.formId; }); l.push(form);
      return put('meta', { key: 'forms_list', value: l });
    }).then(function () { return put('meta', { key: 'forms_items_' + form.formId, value: items }); })
      .then(function () { return put('meta', { key: 'forms_fields_' + form.formId, value: fields || [] }); }).catch(function () {});
  }
  // لیست فرم‌های یک دسته را جایگزین می‌کند (فرم‌های دسته‌های دیگر دست‌نخورده می‌مانند)
  function cacheFormsList(category, forms) {
    return get('meta', 'forms_list').then(function (r) {
      var l = (r ? r.value : []).filter(function (f) { return f.category !== category; }).concat(forms);
      return put('meta', { key: 'forms_list', value: l });
    }).catch(function () {});
  }
  function cacheInfo() { return Promise.all([get('meta', 'cacheTime'), getAll('equipment')]).then(function (r) { return { time: r[0] ? r[0].value : null, equipment: r[1].length }; }); }

  // ---------- انتقال صف قدیمی localStorage (hse_pending_*) ----------
  function migrateLegacy() {
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('hse_pending_') === 0) keys.push(k); }
    return keys.reduce(function (p, k) {
      return p.then(function () {
        try {
          var o = JSON.parse(localStorage.getItem(k)), pl = o && (o.payload || (o.request && o.request.payload) || o);
          if (pl && pl.barcode && pl.items) return addPending(pl, { label: 'منتقل‌شده از صف قدیمی' }).then(function () { localStorage.removeItem(k); });
        } catch (e) {}
        localStorage.removeItem(k);
      });
    }, Promise.resolve());
  }

  // ---------- نوار هشدار ----------
  function refreshBanner() {
    if (!w.document || !document.body) return;
    if (/offline\.html$/.test(location.pathname)) return;
    count().then(function (c) {
      var b = document.getElementById('pendingBanner');
      if (!c.total) { if (b) b.remove(); var bd = document.getElementById('pendingBadge'); if (bd) bd.style.display = 'none'; return; }
      if (!b) {
        b = document.createElement('a'); b.id = 'pendingBanner'; b.href = 'offline.html';
        b.style.cssText = 'position:fixed;bottom:76px;left:12px;right:12px;z-index:900;background:#E67E22;color:#fff;padding:10px 14px;border-radius:12px;text-align:center;text-decoration:none;font-size:13px;font-weight:bold;box-shadow:0 4px 14px rgba(0,0,0,.25)';
        document.body.appendChild(b);
      }
      b.textContent = (c.failed ? '⚠️ ' : '⏳ ') + toFa(c.total) + ' بازرسی ارسال‌نشده' + (c.failed ? ' (' + toFa(c.failed) + ' نیازمند بررسی)' : '') + ' — برای مشاهده بزنید';
      var badge = document.getElementById('pendingBadge');
      if (badge) { badge.textContent = toFa(c.total); badge.style.display = 'inline-block'; }
    }).catch(function () {});
  }

  function init(opts) {
    if (inited) return; inited = true;
    opts = opts || {};
    migrateLegacy().then(function () { return sync(); }).then(function () { return opts.cache ? refreshCache(false) : null; }).then(refreshBanner);
    w.addEventListener('online', function () { sync().then(function () { if (opts.cache) refreshCache(false); }); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) sync(); });
    setInterval(function () { if (!document.hidden) sync(); }, 120000);
  }

  w.HSEQ = { init: init, addPending: addPending, list: list, remove: remove, update: update, retry: retry, count: count,
    sync: sync, sendNow: sendNow, refreshCache: refreshCache, getEquipment: getEquipment, getAllEquipment: getAllEquipment, getChecklist: getChecklist,
    cacheInfo: cacheInfo, getForms: getForms, getFormItems: getFormItems, getFormFields: getFormFields, cacheForm: cacheForm, cacheFormsList: cacheFormsList, refreshBanner: refreshBanner, migrateLegacy: migrateLegacy };
})(window);

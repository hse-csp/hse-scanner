// ============================================
// common.js — توابع مشترک همه‌ی صفحات (نسخه ۳)
// ============================================
var EXEC_URL = 'https://script.google.com/macros/s/AKfycbyh8ccieztX3ZkFF0IozE_beRcZja0BH8ieYbQ9qCL1tLDxkq2QB0Pz3JD4v0IRY6eo/exec';
var AUTH_KEYS = ['token', 'username', 'role', 'fullName', 'expiresAt'];
var API_TIMEOUT_MS = 45000;

// ---------- امن‌سازی خروجی HTML ----------
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"'`]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c];
  });
}

// ---------- اعداد و تاریخ فارسی ----------
function toFa(n) { return String(n == null ? '' : n).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[d]; }); }

function formatDate(v) {
  if (!v) return '-';
  var d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  try {
    return d.toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' }) + ' - ' +
      d.toLocaleTimeString('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hour12: false });
  } catch (e) { return d.toLocaleString(); }
}

// ---------- احراز هویت سمت کلاینت ----------
function getToken() { return localStorage.getItem('token') || ''; }
function clearAuth() { AUTH_KEYS.forEach(function (k) { localStorage.removeItem(k); }); }
function goToLogin() { location.replace('login.html'); }

// ---------- ارتباط با سرور ----------
// ارسال خام (بدون تغییر مسیر خودکار) — برای صف آفلاین هم استفاده می‌شود
function rawPost(request, timeoutMs) {
  var ctrl = ('AbortController' in window) ? new AbortController() : null;
  var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || API_TIMEOUT_MS) : null;
  return fetch(EXEC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(request),
    signal: ctrl ? ctrl.signal : undefined
  }).then(function (r) { return r.text(); }).then(function (t) {
    if (timer) clearTimeout(timer);
    try { return JSON.parse(t); }
    catch (e) { var err = new Error('پاسخ نامعتبر از سرور (احتمالاً سهمیه‌ی Apps Script تمام شده)'); err.kind = 'bad_response'; throw err; }
  }, function (e) { if (timer) clearTimeout(timer); e.kind = 'network'; throw e; });
}

// خطای شبکه → reject ؛ پاسخ سرور (حتی خطا) → resolve. کد AUTH → خروج خودکار
function apiCall(request) {
  if (!request.token) request.token = getToken();
  return rawPost(request).then(function (res) {
    if (res && res.code === 'AUTH' && request.action !== 'auth.login') {
      clearAuth(); goToLogin();
    }
    return res;
  });
}

function doLogout(ask) {
  if (ask && !confirm('آیا می‌خواهید از حساب کاربری خارج شوید؟')) return;
  var t = getToken();
  clearAuth();                       // صف بازرسی‌های ارسال‌نشده (IndexedDB) حفظ می‌شود
  try { sessionStorage.clear(); } catch (e) {}
  if (t) { try { rawPost({ action: 'auth.logout', token: t }, 4000).catch(function () {}); } catch (e) {} }
  goToLogin();
}

// ---------- عکس (از طریق API، چون فایل‌ها خصوصی‌اند) ----------
var _photoCache = {};
function loadPhoto(imgEl, inspectionId, index) {
  index = index || 0;
  var ck = inspectionId + ':' + index;
  imgEl.removeAttribute('src');
  imgEl.alt = 'در حال بارگذاری عکس...';
  if (_photoCache[ck]) { imgEl.src = _photoCache[ck]; return; }
  apiCall({ action: 'photo.get', payload: { inspectionId: inspectionId, index: index } }).then(function (res) {
    if (res && res.success) { _photoCache[ck] = res.data.dataUrl; imgEl.src = res.data.dataUrl; }
    else imgEl.alt = (res && res.error) || 'عکس در دسترس نیست';
  }).catch(function () { imgEl.alt = 'خطا در بارگذاری عکس'; });
}

// ---------- پیام‌های شناور ----------
function showToast(message, type) {
  type = type || 'success';
  var box = document.getElementById('toast-container');
  if (!box) { box = document.createElement('div'); box.id = 'toast-container'; box.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:999;display:flex;flex-direction:column;gap:8px'; document.body.appendChild(box); }
  var el = document.createElement('div');
  el.className = 'toast ' + type;
  var icon = type === 'success' ? 'fa-circle-check' : (type === 'error' ? 'fa-circle-xmark' : 'fa-circle-info');
  el.innerHTML = '<i class="fa-solid ' + icon + '"></i> ';
  el.appendChild(document.createTextNode(message));
  box.appendChild(el);
  setTimeout(function () { el.style.opacity = '0'; el.style.transform = 'translateY(-10px)'; setTimeout(function () { el.remove(); }, 300); }, 3000);
}

function debounce(fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; }

// فاصله‌ی روزها تا یک تاریخ
function daysSince(v) { var d = new Date(v); return isNaN(d) ? null : Math.floor((Date.now() - d.getTime()) / 86400000); }


// ---------- نمایش مشترک بازرسی‌ها (تجهیزات + فرم‌های بهداشتی/ایمنی) ----------
var FINAL_LABELS_EQ = { salem: 'سالم', defective: 'معیوب', needsRepair: 'نیاز به اصلاح' };
var FINAL_LABELS_FORM = { salem: 'مطلوب', defective: 'نامطلوب', needsRepair: 'نیاز به اصلاح' };
var ITEM_LABELS = { salem: 'سالم', defective: 'معیوب', needsRepair: 'نیاز به اصلاح', confirmed: 'تأیید', not_confirmed: 'عدم تأیید' };
var ITEM_CLASS = { confirmed: 'salem', not_confirmed: 'defective' };

function finalLabelFor(item) {
  if (item.finalLabel) return item.finalLabel;                       // برچسب ثبت‌شده‌ی فرم (مثلاً «قبول» / «مردود»)
  var m = item.source === 'form' ? FINAL_LABELS_FORM : FINAL_LABELS_EQ;
  return m[item.finalStatus] || item.finalStatus || '-';
}
function typeLabelFor(item) {
  if (item.source === 'form') return item.categoryLabel || 'فرم';
  if (item.source === 'firebox') return 'فایر باکس';
  return item.cylinderType || 'سیلندر';
}

// ردیف‌های آیتم داخل مودال (برای فرم‌ها: فیلدهای سرتیتر + گروه‌بندی بر اساس بخش)
function renderInspectionItems(el, data) {
  el.innerHTML = '';
  if (data && data.fields && data.fields.length) {
    var box = document.createElement('div');
    box.style.cssText = 'background:#FEF5E7;border-radius:10px;padding:10px 12px;margin-bottom:10px;font-size:12px;line-height:2';
    data.fields.forEach(function (f) {
      var r = document.createElement('div');
      var l = document.createElement('b'); l.textContent = f.label + ': ';
      r.appendChild(l); r.appendChild(document.createTextNode(f.value || '-')); box.appendChild(r);
    });
    el.appendChild(box);
  }
  if (!data || !data.items || !data.items.length) {
    var e = document.createElement('div'); e.style.cssText = 'text-align:center; color:#999; font-size:12px; padding:10px;'; e.textContent = 'آیتمی یافت نشد.';
    el.appendChild(e);
    return;
  }
  var lastSection = null;
  data.items.forEach(function (it) {
    if (data.form && it.section !== lastSection) {
      lastSection = it.section;
      var h = document.createElement('div');
      h.style.cssText = 'font-size:12px;font-weight:800;color:#C0611A;margin:12px 0 6px;padding-bottom:4px;border-bottom:1px dashed #FAD7A8';
      h.textContent = it.section; el.appendChild(h);
    }
    var row = document.createElement('div');
    row.className = 'item-row ' + (ITEM_CLASS[it.status] || it.status || '');
    var a = document.createElement('span'); a.textContent = it.name;
    var b = document.createElement('span'); b.textContent = ITEM_LABELS[it.status] || it.status; b.style.flexShrink = '0'; b.style.marginRight = '8px';
    row.appendChild(a); row.appendChild(b); el.appendChild(row);
  });
}

// عکس اول بلافاصله؛ بقیه با دکمه (برای صرفه‌جویی در درخواست‌ها)
function showInspectionPhotos(imgEl, emptyEl, item) {
  var holder = document.getElementById('extraPhotos');
  if (!holder) {
    holder = document.createElement('div'); holder.id = 'extraPhotos'; holder.style.cssText = 'display:grid;gap:8px;margin-bottom:12px';
    imgEl.parentNode.insertBefore(holder, imgEl.nextSibling);
  }
  holder.innerHTML = '';
  var n = item.source === 'form' ? (item.photoCount || 0) : (item.photoUrl ? 1 : 0);
  if (!n) { imgEl.style.display = 'none'; emptyEl.style.display = 'block'; return; }
  emptyEl.style.display = 'none'; imgEl.style.display = 'block';
  loadPhoto(imgEl, item.inspectionId, 0);
  if (n > 1) {
    var btn = document.createElement('button');
    btn.style.cssText = 'padding:10px;border:0;border-radius:8px;background:#f0f0f0;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer';
    btn.textContent = 'نمایش ' + toFa(n - 1) + ' عکس دیگر';
    btn.onclick = function () {
      btn.remove();
      for (var i = 1; i < n; i++) {
        var img = document.createElement('img'); img.className = imgEl.className; img.style.cssText = 'width:100%;border-radius:8px';
        holder.appendChild(img); loadPhoto(img, item.inspectionId, i);
      }
    };
    holder.appendChild(btn);
  }
}

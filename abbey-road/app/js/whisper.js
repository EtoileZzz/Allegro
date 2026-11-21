/* Whisper 模块 */
(function () {
  'use strict';
  if (document.getElementById('whRoot')) { return; }
  var tpl = "<div class=\"wh-root\" id=\"whRoot\" hidden>\n\n  <section class=\"screen lock\" id=\"s-lock\" hidden>\n    <div class=\"icn\">✦</div>\n    <div style=\"text-align:center\"><h2 id=\"lockTitle\">输入 PIN</h2><p id=\"lockSub\">Whisper 已上锁</p></div>\n    <div class=\"pin\" id=\"pinDots\"></div>\n    <div class=\"pad\" id=\"pad\"></div>\n    <button class=\"linkrow\" id=\"bioBtn\">使用生物识别</button>\n    <button class=\"linkrow\" id=\"skipBtn\" style=\"color:var(--w-mid)\">先不设锁，直接进入</button>\n  </section>\n\n  <section class=\"screen\" id=\"s-shelf\" hidden>\n    <div class=\"topbar\">\n      <button class=\"btn\" id=\"shBack\">‹</button>\n      <span style=\"width:68px;flex:0 0 auto\"></span>\n      <div class=\"title\"><b id=\"shTitle\" style=\"font-family:var(--font-serif);font-size:17px;letter-spacing:.6px\">Whisper</b><span id=\"shSub\"></span></div>\n      <button class=\"btn\" id=\"shSearch\">⌕</button>\n      <button class=\"btn\" id=\"shRecall\" title=\"回顾\">◷</button>\n      <button class=\"btn\" id=\"shNew\">＋</button>\n    </div>\n    <div class=\"scroll\"><div class=\"shelf\" id=\"shelfList\"></div></div>\n  </section>\n\n  <section class=\"screen\" id=\"s-whisper\" hidden>\n    <div class=\"topbar\">\n      <button class=\"btn\" id=\"wBack\">‹</button>\n      <div class=\"title\"><b id=\"wTitle\" style=\"font-family:var(--font-serif);font-size:21px;letter-spacing:.5px;max-width:250px\">—</b><span id=\"wSub\" style=\"display:none\"></span></div>\n      <button class=\"btn\" id=\"wMenu\">⋯</button>\n    </div>\n    <div class=\"pullhint\" id=\"pullHint\">下拉写一条</div>\n    <div class=\"scroll\" id=\"wBody\"></div>\n    <button class=\"fab\" id=\"wWrite\">✎</button>\n  </section>\n\n  <section class=\"screen composer\" id=\"s-composer\" hidden>\n    <div class=\"topbar\">\n      <button class=\"btn\" id=\"cCancel\">✕</button>\n      <div class=\"title\"><b>写一条</b><span id=\"cWhen\"></span></div>\n      <button class=\"btn\" id=\"cSave\">✓</button>\n    </div>\n    <div class=\"body\">\n      <textarea id=\"cText\"></textarea>\n      <div class=\"md-preview md-body\" id=\"cMdPrev\" hidden></div>\n      <div class=\"md-bar\" id=\"cMdBar\"></div>\n      <div class=\"media-bar\"><button class=\"media-pick\" type=\"button\" id=\"cImgBtn\">添加图片</button><input type=\"file\" id=\"cImgIn\" accept=\"image/*\" multiple style=\"display:none\"></div>\n      <div class=\"media-draft\" id=\"cMediaList\"></div>\n      <div class=\"meta\">\n        <div class=\"field\" style=\"margin-top:0\">Persona</div>\n        <div class=\"personachips\" id=\"cPersona\"></div>\n        <div class=\"field\">写进</div>\n        <div class=\"personachips\" id=\"cBook\"></div>\n        <button class=\"save\" id=\"cSave2\">保存</button>\n      </div>\n    </div>\n  </section>\n\n  <section class=\"screen\" id=\"s-search\" hidden>\n    <div class=\"topbar\"><button class=\"btn\" id=\"srBack\">‹</button><div class=\"title\"><b>搜索</b><span id=\"srSub\">当前本</span></div><button class=\"btn\" id=\"srScope\" style=\"width:auto;padding:0 8px;font-size:11.5px;color:var(--w-a2)\">当前本</button></div>\n    <div class=\"searchbar\"><input id=\"srInput\" placeholder=\"搜标题或正文…\" autocomplete=\"off\"><button class=\"x\" id=\"srClear\">✕</button></div>\n    <div class=\"scroll\"><div class=\"sres\" id=\"srBody\"></div></div>\n  </section>\n\n  <section class=\"screen\" id=\"s-trash\" hidden>\n    <div class=\"topbar\"><button class=\"btn\" id=\"trBack\">‹</button><div class=\"title\"><b>回收站</b><span id=\"trSub\"></span></div><button class=\"btn\" id=\"trClear\">清空</button></div>\n    <div class=\"scroll\"><div class=\"trash\" id=\"trBody\"></div></div>\n  </section>\n\n  <section class=\"screen\" id=\"s-recall\" hidden>\n    <div class=\"topbar\"><button class=\"btn\" id=\"rcBack\">‹</button><div class=\"title\"><b style=\"font-size:24px;letter-spacing:.6px\">回顾</b><span style=\"display:none\"></span></div><span style=\"width:30px\"></span></div>\n    <div class=\"scroll\"><div class=\"recall\" id=\"rcBody\"></div></div>\n  </section>\n\n  <div class=\"toc-mask\" id=\"tocMask\"></div>\n  <div class=\"toc from-right\" id=\"toc\"><div class=\"th\"><div class=\"tt\"><b>目录</b><span id=\"tocSub\"></span></div><button class=\"tc\" id=\"tocClose\">✕</button></div><div class=\"tl\" id=\"tocList\"></div></div>\n\n  <div class=\"sheet-mask\" id=\"mask\"></div>\n  <div class=\"sheet\" id=\"sheet\"></div>\n  <div class=\"wh-lightbox\" id=\"whLightbox\" hidden><div class=\"wh-lb-top\"><span id=\"lbTitle\"></span><button type=\"button\" id=\"lbSave\">保存原图</button><button type=\"button\" id=\"lbClose\">关闭</button></div><div class=\"wh-lb-stage\"><img id=\"lbImg\" alt=\"\"></div><div class=\"wh-lb-nav\"><button type=\"button\" id=\"lbPrev\">‹ 上一张</button><button type=\"button\" id=\"lbNext\">下一张 ›</button></div></div>\n  <div class=\"toast\" id=\"toast\"></div></div>";
  var holder = document.createElement('div');
  holder.innerHTML = tpl;
  var node = holder.firstChild;
  if (node) { document.body.appendChild(node); }
})();

(function () {
  'use strict';
  var LS = 'abbeyroad.whisper.v1';
  var SERIF = 'Georgia,"Songti SC","Noto Serif SC","Source Han Serif SC","STSong","SimSun",serif';
  var UI_FONT_STACK = '"PingFang SC","HarmonyOS Sans SC","Source Han Sans SC","Noto Sans SC","Microsoft YaHei UI",system-ui,-apple-system,sans-serif';
  var DEFAULT_CARD_OPTS = {
    showDate: true,
    showTime: false,
    showFooter: false,
    showPersona: false,
    showComments: true,
    showMedia: true,
    ratio: 'auto',
    frame: false,
    renderMd: true
  };
  function cloneCardDefaults() {
    var out = {}, k;
    for (k in DEFAULT_CARD_OPTS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_CARD_OPTS, k)) { out[k] = DEFAULT_CARD_OPTS[k]; }
    }
    return out;
  }
  function getCardOpts() {
    var base = cloneCardDefaults();
    var cur = (S && S.opts && S.opts.card && typeof S.opts.card === 'object') ? S.opts.card : null;
    if (cur) {
      var k;
      for (k in base) {
        if (Object.prototype.hasOwnProperty.call(cur, k) && cur[k] !== undefined) { base[k] = cur[k]; }
      }
    }
    if (base.ratio !== '3:4' && base.ratio !== '1:1') { base.ratio = 'auto'; }
    return base;
  }
  var PRESETS = {
    claudePaper: { name: 'Claude 纸', mode: 'paper', base: { dark: '#141413', light: '#faf9f5', mid: '#b0aea5', subtle: '#e8e6dc' }, accent: { a1: '#d97757', a2: '#6a9bcc', a3: '#788c5d' } },
    claudeNight: { name: 'Claude 夜', mode: 'night', base: { dark: '#141413', light: '#faf9f5', mid: '#b0aea5', subtle: '#e8e6dc' }, accent: { a1: '#d97757', a2: '#6a9bcc', a3: '#788c5d' } },
    oldPaper: { name: '旧纸感', mode: 'paper', base: { dark: '#2b2620', light: '#f4efe4', mid: '#8b7f6a', subtle: '#ddd2bd' }, accent: { a1: '#b4654a', a2: '#6a8fb0', a3: '#7d8f5d' } }
  };

  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function dkey(off) { var d = new Date(); d.setDate(d.getDate() - (off || 0)); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function nowAtSec() {
    var d = new Date();
    return dkey(0) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
  }
  function normAtSortKey(s) {
    var str = String(s || '').trim();
    return str.length === 16 ? (str + ':00') : str;
  }
  function fmtClockHM(atStr) { return String(atStr || '').slice(11, 16); }
  function fmtDateHM(atStr) { return String(atStr || '').slice(0, 16); }
  function fmtShortMDHM(atStr) {
    var s = String(atStr || '');
    return s.length >= 16 ? s.slice(5, 16) : s;
  }
  function uid(p) { return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; } return String(h); }
  function hexBytes(buf) {
    var b = new Uint8Array(buf), out = '';
    for (var i = 0; i < b.length; i++) { var v = b[i].toString(16); out += (v.length === 1 ? '0' : '') + v; }
    return out;
  }
  function hashPinSecure(pinStr) {
    if (window.crypto && crypto.subtle && crypto.subtle.digest && crypto.getRandomValues) {
      var salt = new Uint8Array(8);
      crypto.getRandomValues(salt);
      var saltHex = hexBytes(salt);
      var bytes = new TextEncoder().encode(saltHex + ':' + String(pinStr));
      return crypto.subtle.digest('SHA-256', bytes).then(function (dig) {
        return 'sha256$' + saltHex + '$' + hexBytes(dig);
      }).catch(function () { return hash(String(pinStr)); });
    }
    return Promise.resolve(hash(String(pinStr)));
  }
  function verifyPin(pinStr, storedHash) {
    if (!storedHash) { return Promise.resolve({ ok: false, legacy: false }); }
    var s = String(storedHash);
    if (s.indexOf('sha256$') === 0) {
      var parts = s.split('$');
      if (parts.length !== 3 || !(window.crypto && crypto.subtle && crypto.subtle.digest)) {
        return Promise.resolve({ ok: false, legacy: false });
      }
      var bytes = new TextEncoder().encode(parts[1] + ':' + String(pinStr));
      return crypto.subtle.digest('SHA-256', bytes).then(function (dig) {
        return { ok: hexBytes(dig) === parts[2], legacy: false };
      }).catch(function () { return { ok: false, legacy: false }; });
    }
    return Promise.resolve({ ok: hash(String(pinStr)) === s, legacy: true });
  }
  function stampNow(rec) {
    if (!rec) { return rec; }
    var ms = Date.now();
    rec.updatedMs = ms;
    rec.updatedAt = new Date(ms).toISOString();
    return rec;
  }
  function parseTimeMs(s) {
    if (typeof s === 'number' && isFinite(s)) { return s; }
    if (!s) { return 0; }
    var str = String(s).trim();
    if (!str) { return 0; }
    if (/^\d+$/.test(str)) { return Number(str) || 0; }
    var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(str);
    if (m) {
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0)).getTime() || 0;
    }
    var t = Date.parse(str);
    return isNaN(t) ? 0 : t;
  }
  function stampMs(rec) {
    if (!rec) { return 0; }
    if (typeof rec.updatedMs === 'number' && isFinite(rec.updatedMs)) { return rec.updatedMs; }
    return Math.max(parseTimeMs(rec.updatedAt), parseTimeMs(rec.deletedAt), parseTimeMs(rec.at));
  }
  function addTombstone(entity, id, ms) {
    if (!S || !id) { return; }
    S.tombstones = S.tombstones || [];
    var now = ms || Date.now();
    for (var i = 0; i < S.tombstones.length; i++) {
      var tb = S.tombstones[i];
      if (tb && tb.entity === entity && tb.id === id) {
        if ((Number(tb.deletedMs) || 0) < now) { tb.deletedMs = now; }
        return;
      }
    }
    S.tombstones.push({ entity: entity, id: id, deletedMs: now });
    pruneTombstones();
  }
  function pruneTombstones() {
    if (!S || !Array.isArray(S.tombstones)) { return; }
    var cutoff = Date.now() - 180 * 86400000;
    S.tombstones = S.tombstones.filter(function (t) { return t && t.id && (Number(t.deletedMs) || 0) >= cutoff; });
    if (S.tombstones.length > 2000) {
      S.tombstones.sort(function (a, b) { return (Number(b.deletedMs) || 0) - (Number(a.deletedMs) || 0); });
      S.tombstones = S.tombstones.slice(0, 2000);
    }
  }
  function aliveBooks() {
    return (S && Array.isArray(S.books)) ? S.books.filter(function (b) { return b && !b.deletedAt; }) : [];
  }
  function visibleBooks() {
    return aliveBooks().filter(function (b) { return session.secretUnlocked || !b.hidden; });
  }
  function bookByIdAny(id) {
    if (!S || !Array.isArray(S.books)) { return null; }
    for (var i = 0; i < S.books.length; i++) { if (S.books[i] && S.books[i].id === id) { return S.books[i]; } }
    return null;
  }

  function seed() {
    return {
      books: [],
      personas: [],
      entries: [],
      tombstones: [],
      theme: (function () { var t = JSON.parse(JSON.stringify(PRESETS.claudePaper)); t.mode = 'app'; t.name = 'claudePaper'; return t; })(),
      opts: { layout: 'A', grouped: true, filter: 'all', shelf: 'hero', menu: 'grid', composer: 'sheet', sort: 'recent', enterFx: true, font: 'ui', copyWithMeta: false, dblTapAction: 'edit', mdEnabled: true, mdToolbar: true, card: cloneCardDefaults() },
      lock: { enabled: true, hash: '', bio: true, optional: true },
      last: { view: 'shelf', bid: '' }
    };
  }
  /* ── 加密存储 ───────────────────────────────────────────
     整份 JSON 用 AES-GCM 加密后落盘；密钥为设备随机 256bit（只在这台设备上），
     PIN 不参与派生 —— 忘记 PIN 可以清 PIN 恢复，数据不丢。
     旧版明文（abbeyroad.whisper.v1）首次启动自动迁移并删除。
     ──────────────────────────────────────────────────── */
  var S = null;
  var ready = false;
  var corruptLocked = false;
  var saveGen = 0;
  var writeChain = Promise.resolve();
  var waiters = [];
  var LS_ENC = LS + '.enc';
  var LS_KEY = 'abbeyroad.whisper.key';
  function whenReady(fn) { if (ready) { try { fn(); } catch (e) { } } else { waiters.push(fn); } }
  function fireReady() {
    ready = true;
    var q = waiters.slice(); waiters.length = 0;
    for (var i = 0; i < q.length; i++) { try { q[i](); } catch (e) { } }
  }
  function b64(buf) {
    var b = new Uint8Array(buf), s2 = '';
    for (var i = 0; i < b.length; i++) { s2 += String.fromCharCode(b[i]); }
    return btoa(s2);
  }
  function unb64(str) {
    var raw = atob(str), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) { out[i] = raw.charCodeAt(i); }
    return out;
  }
  var keyPromise = null;
  function getKey() {
    if (keyPromise) { return keyPromise; }
    keyPromise = new Promise(function (resolve, reject) {
      if (!(window.crypto && crypto.subtle)) { reject(new Error('no webcrypto')); return; }
      var raw = null;
      try { var stored = localStorage.getItem(LS_KEY); if (stored) { raw = unb64(stored); } } catch (e) { }
      if (!raw || raw.length !== 32) {
        raw = new Uint8Array(32);
        crypto.getRandomValues(raw);
        try { localStorage.setItem(LS_KEY, b64(raw)); } catch (e2) { }
      }
      crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']).then(resolve, reject);
    });
    return keyPromise;
  }
  function encryptText(txt) {
    return getKey().then(function (key) {
      var iv = new Uint8Array(12);
      crypto.getRandomValues(iv);
      var data = new TextEncoder().encode(txt);
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, data).then(function (ct) {
        return b64(iv) + '.' + b64(ct);
      });
    });
  }
  function decryptText(packed) {
    return getKey().then(function (key) {
      var parts = String(packed).split('.');
      if (parts.length !== 2) { throw new Error('bad blob'); }
      var iv = unb64(parts[0]);
      var ct = unb64(parts[1]);
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct).then(function (pt) {
        return new TextDecoder().decode(pt);
      });
    });
  }
  function readRaw() {
    try { return localStorage.getItem(LS_ENC); } catch (e) { return null; }
  }
  function readLegacy() {
    try { return localStorage.getItem(LS); } catch (e) { return null; }
  }
  function writeEncQueue(jsonStr, clearLegacy) {
    writeChain = writeChain.then(function () {
      return encryptText(jsonStr).then(function (blob) {
        try {
          localStorage.setItem(LS_ENC, blob);
          if (clearLegacy) { localStorage.removeItem(LS); }
        } catch (e) { }
      });
    }).catch(function () { });
    return writeChain;
  }
  function load() {
    return new Promise(function (resolve) {
      var finish = function (d) { S = normalize(d || seed()); try { applyTheme(); applyAppHeat(); } catch (eInit) { } fireReady(); resolve(S); };
      var enc = readRaw();
      if (enc) {
        decryptText(enc).then(function (txt) {
          var d = null; try { d = JSON.parse(txt); } catch (e) { d = null; }
          if (!d || typeof d !== 'object') {
            corruptLocked = true;
            finish(null);
            return;
          }
          corruptLocked = false;
          finish(d);
        }).catch(function () {
          /* 本地存在密文但无法解密：锁死写盘，绝不覆盖原密文 */
          corruptLocked = true;
          finish(null);
        });
        return;
      }
      var legacy = readLegacy();
      if (legacy) {
        var d2 = null; try { d2 = JSON.parse(legacy); } catch (e2) { d2 = null; }
        corruptLocked = false;
        S = normalize(d2 || seed());
        writeEncQueue(JSON.stringify(S), true).then(function () {
          fireReady(); resolve(S);
        }, function () { fireReady(); resolve(S); });
        return;
      }
      corruptLocked = false;
      finish(null);
    });
  }
  function save() {
    if (!ready || !S || corruptLocked) { return; }
    saveGen++;
    S.syncDirty = true;
    scheduleBlobSync();
    writeEncQueue(JSON.stringify(S), true);
  }
  function normalize(d) {
    var def = { opts: { layout: 'A', grouped: true, filter: 'all', shelf: 'hero', menu: 'grid', composer: 'sheet', sort: 'recent', enterFx: true, font: 'ui', copyWithMeta: false, dblTapAction: 'edit', mdEnabled: true, mdToolbar: true, card: cloneCardDefaults() } }, k;
    d.books = Array.isArray(d.books) ? d.books : [];
    d.entries = Array.isArray(d.entries) ? d.entries : [];
    d.personas = Array.isArray(d.personas) ? d.personas : [];
    d.tombstones = Array.isArray(d.tombstones) ? d.tombstones : [];
    var o = d.opts || {};
    for (k in def.opts) { if (o[k] === undefined) { o[k] = def.opts[k]; } }
    if (!o.card || typeof o.card !== 'object') {
      o.card = cloneCardDefaults();
    } else {
      for (k in DEFAULT_CARD_OPTS) {
        if (Object.prototype.hasOwnProperty.call(DEFAULT_CARD_OPTS, k) && o.card[k] === undefined) {
          o.card[k] = DEFAULT_CARD_OPTS[k];
        }
      }
      if (o.card.ratio !== '3:4' && o.card.ratio !== '1:1') { o.card.ratio = 'auto'; }
    }
    if (['edit', 'comment', 'copy', 'menu', 'off'].indexOf(o.dblTapAction) < 0) { o.dblTapAction = 'edit'; }
    d.opts = o;
    if (!d.theme || !d.theme.base || !d.theme.accent) {
      d.theme = { mode: (d.theme && d.theme.mode) || 'app', base: { dark: '#141413', light: '#faf9f5', mid: '#b0aea5', subtle: '#e8e6dc' }, accent: { a1: '#d97757', a2: '#6a9bcc', a3: '#788c5d' } };
    }
    if (!d.lock) { d.lock = { enabled: true, hash: '', bio: true, optional: true }; }
    if (!d.last) { d.last = { view: 'shelf', bid: '' }; }
    return d;
  }
  load();
  var themeBound = false;
  function bindThemeWatch() {
    if (themeBound) { return; }
    themeBound = true;
    try {
      var mo = new MutationObserver(function () { try { applyTheme(); } catch (e0) { } });
      mo.observe(document.body, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    } catch (e1) { }
    if (window.matchMedia) {
      try {
        var mq = window.matchMedia('(prefers-color-scheme: dark)');
        var fn = function () { try { applyTheme(); } catch (e2) { } };
        if (mq.addEventListener) { mq.addEventListener('change', fn); } else if (mq.addListener) { mq.addListener(fn); }
      } catch (e3) { }
    }
  }

  var $ = function (id) { return document.getElementById(id); };
  var stage = $('whRoot');
  var session = { unlocked: false, secretUnlocked: false };

  /* ── 图片附件：本机存原图（IndexedDB 设备加密），云同步时再按需压缩 ── */
  var mediaCache = {};
  var memMediaDb = {};
  var mediaIdbPromise = null;
  var MAX_LOCAL_IMAGE_BYTES = 15 * 1024 * 1024;
  var MAX_MEDIA_PER_ENTRY = 4;

  function openMediaDb() {
    if (typeof indexedDB === 'undefined') { return Promise.resolve(null); }
    if (mediaIdbPromise) { return mediaIdbPromise; }
    mediaIdbPromise = new Promise(function (resolve) {
      try {
        var req = indexedDB.open('abbeyroad_whisper_media', 1);
        req.onupgradeneeded = function () {
          try {
            var db = req.result;
            if (!db.objectStoreNames.contains('media')) {
              db.createObjectStore('media', { keyPath: 'id' });
            }
          } catch (eUp) { }
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { resolve(null); };
      } catch (eOpen) { resolve(null); }
    });
    return mediaIdbPromise;
  }

  function idbGetMediaRaw(id) {
    return openMediaDb().then(function (db) {
      if (!db) { return memMediaDb[id] || null; }
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction('media', 'readonly');
          var st = tx.objectStore('media');
          var req = st.get(id);
          req.onsuccess = function () { resolve(req.result || memMediaDb[id] || null); };
          req.onerror = function () { resolve(memMediaDb[id] || null); };
        } catch (eG) { resolve(memMediaDb[id] || null); }
      });
    });
  }

  function idbPutMediaRaw(rec) {
    memMediaDb[rec.id] = rec;
    return openMediaDb().then(function (db) {
      if (!db) { return true; }
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction('media', 'readwrite');
          tx.objectStore('media').put(rec);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
        } catch (eP) { resolve(false); }
      });
    });
  }

  function idbDelMediaRaw(id) {
    delete memMediaDb[id];
    return openMediaDb().then(function (db) {
      if (!db) { return true; }
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction('media', 'readwrite');
          tx.objectStore('media').delete(id);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
        } catch (eD) { resolve(false); }
      });
    });
  }

  function clearAllMediaLocal() {
    mediaCache = {};
    memMediaDb = {};
    return openMediaDb().then(function (db) {
      if (!db) { return true; }
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction('media', 'readwrite');
          tx.objectStore('media').clear();
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
        } catch (eC) { resolve(false); }
      });
    });
  }

  function saveMediaLocal(id, rec) {
    mediaCache[id] = rec;
    var rawJson = JSON.stringify(rec);
    return encryptText(rawJson).then(function (encBlob) {
      return idbPutMediaRaw({ id: id, enc: encBlob }).then(function () { return rec; });
    }, function () {
      return idbPutMediaRaw({ id: id, plain: rawJson }).then(function () { return rec; });
    });
  }

  function loadMediaLocal(id) {
    if (!id) { return Promise.resolve(null); }
    if (mediaCache[id]) { return Promise.resolve(mediaCache[id]); }
    return idbGetMediaRaw(id).then(function (row) {
      if (!row) { return null; }
      if (row.plain) {
        try { var r0 = JSON.parse(row.plain); mediaCache[id] = r0; return r0; } catch (e0) { return null; }
      }
      if (!row.enc) { return null; }
      return decryptText(row.enc).then(function (txt) {
        var r = JSON.parse(txt);
        mediaCache[id] = r;
        return r;
      }, function () { return null; });
    });
  }

  function deleteMediaLocal(id) {
    delete mediaCache[id];
    return idbDelMediaRaw(id);
  }

  function measureDataUrl(dataUrl) {
    return new Promise(function (resolve) {
      if (typeof Image === 'undefined') { resolve({ w: 0, h: 0 }); return; }
      var img = new Image();
      img.onload = function () { resolve({ w: img.naturalWidth || 0, h: img.naturalHeight || 0 }); };
      img.onerror = function () { resolve({ w: 0, h: 0 }); };
      img.src = dataUrl;
    });
  }

  function readImageFileOriginal(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error('空文件')); return; }
      if (file.size && file.size > MAX_LOCAL_IMAGE_BYTES) {
        reject(new Error('单张图片超过 15 MB 限制'));
        return;
      }
      var fr = new FileReader();
      fr.onload = function () {
        var dataUrl = String(fr.result || '');
        if (dataUrl.indexOf('data:image/') !== 0) {
          reject(new Error('不是有效的图片格式'));
          return;
        }
        measureDataUrl(dataUrl).then(function (dim) {
          var id = uid('m');
          var rec = {
            id: id,
            dataUrl: dataUrl,
            w: dim.w,
            h: dim.h,
            mime: file.type || 'image/png',
            size: file.size || dataUrl.length,
            orig: true,
            updatedMs: Date.now()
          };
          saveMediaLocal(id, rec).then(function () {
            resolve({ id: id, w: dim.w, h: dim.h, mime: rec.mime, size: rec.size });
          });
        });
      };
      fr.onerror = function () { reject(new Error('读取图片失败')); };
      fr.readAsDataURL(file);
    });
  }

  var TARGET_MEDIA_DATAURL_LEN = 480000;
  var mediaPulling = {};

  function compressMediaForCloud(rec) {
    if (!rec || !rec.dataUrl) { return Promise.reject(new Error('图片数据无效')); }
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      if (String(rec.dataUrl).length > TARGET_MEDIA_DATAURL_LEN) {
        return Promise.reject(new Error('当前环境不支持图片压缩'));
      }
      return Promise.resolve(rec);
    }
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        try {
          var nw = img.naturalWidth || rec.w || 1280;
          var nh = img.naturalHeight || rec.h || 960;
          var steps = [
            { side: 1280, mime: 'image/webp', q: 0.80 },
            { side: 1280, mime: 'image/jpeg', q: 0.78 },
            { side: 1280, mime: 'image/jpeg', q: 0.60 },
            { side: 1024, mime: 'image/webp', q: 0.70 },
            { side: 1024, mime: 'image/jpeg', q: 0.55 },
            { side: 800, mime: 'image/jpeg', q: 0.48 },
            { side: 640, mime: 'image/jpeg', q: 0.38 }
          ];
          var best = null;
          for (var si = 0; si < steps.length; si++) {
            var st = steps[si];
            var scale = Math.min(1, st.side / Math.max(1, Math.max(nw, nh)));
            var tw = Math.max(1, Math.round(nw * scale));
            var th = Math.max(1, Math.round(nh * scale));
            var cv = document.createElement('canvas');
            if (!cv || !cv.getContext) {
              if (String(rec.dataUrl).length <= TARGET_MEDIA_DATAURL_LEN) { resolve(rec); return; }
              reject(new Error('当前环境不支持图片压缩'));
              return;
            }
            cv.width = tw; cv.height = th;
            var ctx = cv.getContext('2d');
            if (!ctx) { continue; }
            if (st.mime === 'image/jpeg') {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, tw, th);
            } else {
              ctx.clearRect(0, 0, tw, th);
            }
            ctx.drawImage(img, 0, 0, tw, th);
            var outUrl = '';
            try { outUrl = cv.toDataURL(st.mime, st.q); } catch (eW) { outUrl = ''; }
            if (!outUrl || outUrl.indexOf('data:' + st.mime) !== 0) { continue; }
            var cand = {
              id: rec.id,
              dataUrl: outUrl,
              w: tw,
              h: th,
              mime: st.mime,
              size: outUrl.length,
              compressed: true,
              updatedMs: rec.updatedMs || Date.now()
            };
            if (!best || cand.size < best.size) { best = cand; }
            if (cand.size <= TARGET_MEDIA_DATAURL_LEN) { resolve(cand); return; }
          }
          if (best && best.size <= 680000) { resolve(best); return; }
          reject(new Error('图片压缩后仍超出云同步体积上限'));
        } catch (eC) {
          reject(new Error((eC && eC.message) || '图片压缩失败'));
        }
      };
      img.onerror = function () { reject(new Error('图片解码失败，无法压缩上传')); };
      img.src = rec.dataUrl;
    });
  }

  function hexToRgba(hex, a, fallback) {
    var h = String(hex || '').trim().replace('#', '');
    if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
    if (!/^[0-9a-fA-F]{6}$/.test(h)) { return fallback || ('rgba(217,119,87,' + a + ')'); }
    return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
  }

  /* ── 主题 ── */
  function applyFont() {
    if (!S || !stage) { return; }
    var f = (S.opts && S.opts.font === 'serif') ? 'serif' : 'ui';
    stage.setAttribute('data-font', f);
  }
  function applyTheme() {
    if (!S) { return; }
    applyFont();
    var t = S.theme || PRESETS.claudePaper;
    var mode = t.mode || 'app';
    if (mode === 'app') {
      var at = 'light';
      try {
        var bt = document.body.getAttribute('data-theme');
        if (bt === 'dark' || bt === 'light') { at = bt; }
      } catch (e0) { }
      try {
        var ap = (window.AR && AR.Store && AR.Store.get) ? ((AR.Store.get().settings || {}).appearance || null) : null;
        if (ap && ap.theme) { at = ap.theme === 'system' ? 'system' : ap.theme; }
      } catch (e1) { }
      if (at === 'system') {
        mode = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'night' : 'paper';
      } else {
        mode = at === 'dark' ? 'night' : 'paper';
      }
    }
    var night = mode === 'night';
    var bg = night ? t.base.dark : t.base.light;
    var fg = night ? t.base.light : t.base.dark;
    var subtle = night ? 'rgba(250,249,245,.10)' : t.base.subtle;
    stage.style.setProperty('--w-bg', bg);
    stage.style.setProperty('--w-fg', fg);
    stage.style.setProperty('--w-mid', t.base.mid);
    stage.style.setProperty('--w-subtle', subtle);
    stage.style.setProperty('--w-a1', t.accent.a1);
    stage.style.setProperty('--w-a2', t.accent.a2);
    stage.style.setProperty('--w-a3', t.accent.a3);
    stage.style.setProperty('--w-a1-10', hexToRgba(t.accent.a1, 0.10));
    stage.style.setProperty('--w-a1-22', hexToRgba(t.accent.a1, 0.22));
    stage.style.setProperty('--w-a1-26', hexToRgba(t.accent.a1, 0.26));
  }

  /* ── 单色线性 SVG 图标（Windows / Android 外观一致） ── */
  var WH_ICONS = {
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    comment: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    persona: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6"/>',
    move: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>',
    'export': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    palette: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" fill-opacity=".28"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
  };
  function svgIco(name) {
    var b = WH_ICONS[name] || '';
    return '<svg class="wh-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + b + '</svg>';
  }
  if ($('cImgBtn')) { $('cImgBtn').innerHTML = svgIco('image') + '<span>添加图片</span>'; }

  /* ── 屏幕 ── */
  var SC = { lock: 's-lock', shelf: 's-shelf', whisper: 's-whisper', composer: 's-composer', search: 's-search', recall: 's-recall', trash: 's-trash' };
  function show(name) {
    var rt = $('whRoot');
    if (rt) {
      rt.classList.remove('wh-sheet-only');
      rt.removeAttribute('hidden');
      document.body.classList.add('wh-open');
    }
    Object.keys(SC).forEach(function (k) {
      var el = $(SC[k]);
      if (k === name) { el.hidden = false; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); }
      else { el.hidden = true; el.classList.remove('in'); }
    });
  }
  function toast(m) {
    var rt = $('whRoot');
    var t = $('toast');
    if (t && rt && !rt.hasAttribute('hidden') && !rt.classList.contains('wh-sheet-only')) {
      t.innerHTML = '';
      t.textContent = m;
      t.classList.add('on');
      clearTimeout(toast._t);
      toast._t = setTimeout(function () { t.classList.remove('on'); }, 1600);
      return;
    }
    if (window.AR && AR.UI && AR.UI.toast) { AR.UI.toast(m); }
  }
  function toastAction(m, label, cb) {
    var t = $('toast');
    if (!t) { return; }
    t.innerHTML = '';
    t.appendChild(document.createTextNode(m));
    var b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'margin-left:10px;border:0;background:transparent;color:var(--w-a1);font:inherit;font-size:12px;font-weight:600;text-decoration:underline;cursor:pointer';
    b.onclick = function (ev) { ev.stopPropagation(); try { cb(); } catch (e) { } t.classList.remove('on'); };
    t.appendChild(b);
    t.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('on'); }, 3500);
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* ── Markdown 解析、安全渲染与去符号 ── */
  function cloneRunFlags(flags, text) {
    return {
      text: text,
      bold: !!(flags && flags.bold),
      italic: !!(flags && flags.italic),
      strike: !!(flags && flags.strike),
      hl: !!(flags && flags.hl),
      code: !!(flags && flags.code)
    };
  }
  function parseMdStyledText(str, flags, depth) {
    var out = [];
    if (!str) { return out; }
    if ((depth || 0) >= 3) { out.push(cloneRunFlags(flags, str)); return out; }
    var pos = 0;
    var pats = [
      { kind: 'bi', open: '***', close: '***', bold: true, italic: true },
      { kind: 'b', open: '**', close: '**', bold: true },
      { kind: 'b2', open: '__', close: '__', bold: true },
      { kind: 'hl', open: '==', close: '==', hl: true },
      { kind: 's', open: '~~', close: '~~', strike: true },
      { kind: 'i', open: '*', close: '*', italic: true }
    ];
    while (pos < str.length) {
      var bestIdx = -1, bestEnd = -1, bestPat = null;
      for (var pi = 0; pi < pats.length; pi++) {
        var pat = pats[pi];
        var searchFrom = pos;
        while (searchFrom < str.length) {
          var oi = str.indexOf(pat.open, searchFrom);
          if (oi < 0) { break; }
          if (bestIdx >= 0 && oi >= bestIdx) { break; }
          if (pat.open === '*' && str.charAt(oi + 1) === '*') {
            searchFrom = oi + 2;
            continue;
          }
          if (pat.open === '__' && oi > 0 && /[A-Za-z0-9_.]/.test(str.charAt(oi - 1))) {
            searchFrom = oi + 2;
            continue;
          }
          var afterOpen = oi + pat.open.length;
          if (afterOpen >= str.length || /\s/.test(str.charAt(afterOpen))) {
            searchFrom = oi + 1;
            continue;
          }
          var ci = str.indexOf(pat.close, afterOpen);
          while (ci >= 0) {
            if (ci === afterOpen || /\s/.test(str.charAt(ci - 1))) {
              ci = str.indexOf(pat.close, ci + 1);
              continue;
            }
            if (pat.close === '*' && str.charAt(ci + 1) === '*') {
              ci = str.indexOf(pat.close, ci + 2);
              continue;
            }
            if (pat.close === '__' && ci + 2 < str.length && /[A-Za-z0-9_]/.test(str.charAt(ci + 2))) {
              ci = str.indexOf(pat.close, ci + 2);
              continue;
            }
            break;
          }
          if (ci >= 0) {
            bestIdx = oi;
            bestEnd = ci;
            bestPat = pat;
            break;
          }
          searchFrom = oi + 1;
        }
      }
      if (bestIdx < 0 || !bestPat) {
        out.push(cloneRunFlags(flags, str.slice(pos)));
        break;
      }
      if (bestIdx > pos) {
        out.push(cloneRunFlags(flags, str.slice(pos, bestIdx)));
      }
      var innerStr = str.slice(bestIdx + bestPat.open.length, bestEnd);
      var subFlags = {
        bold: !!(flags && flags.bold) || !!bestPat.bold,
        italic: !!(flags && flags.italic) || !!bestPat.italic,
        strike: !!(flags && flags.strike) || !!bestPat.strike,
        hl: !!(flags && flags.hl) || !!bestPat.hl,
        code: false
      };
      var subRuns = parseMdStyledText(innerStr, subFlags, (depth || 0) + 1);
      for (var si = 0; si < subRuns.length; si++) { out.push(subRuns[si]); }
      pos = bestEnd + bestPat.close.length;
    }
    return out;
  }
  function parseMdInline(str) {
    var out = [], s = String(str == null ? '' : str);
    var reCode = /`([^`\n]+)`/g;
    var last = 0, m;
    while ((m = reCode.exec(s)) !== null) {
      if (m.index > last) {
        var pre = parseMdStyledText(s.slice(last, m.index), {}, 0);
        for (var i = 0; i < pre.length; i++) { out.push(pre[i]); }
      }
      out.push(cloneRunFlags({ code: true }, m[1]));
      last = m.index + m[0].length;
    }
    if (last < s.length) {
      var tail = parseMdStyledText(s.slice(last), {}, 0);
      for (var j = 0; j < tail.length; j++) { out.push(tail[j]); }
    }
    if (!out.length) { out.push(cloneRunFlags({}, '')); }
    return out;
  }
  function parseMarkdownBlocks(raw, useMd) {
    var lines = String(raw == null ? '' : raw).replace(/\r\n/g, '\n').split('\n');
    if (!useMd) {
      return lines.map(function (ln) {
        return { type: 'para', lines: [{ runs: [{ text: ln, bold: false, italic: false, strike: false, hl: false, code: false }] }] };
      });
    }
    var blocks = [];
    var curPara = null, curQuote = null, curUl = null, curOl = null;
    function flushAll() {
      if (curPara) { blocks.push(curPara); curPara = null; }
      if (curQuote) { blocks.push(curQuote); curQuote = null; }
      if (curUl) { blocks.push(curUl); curUl = null; }
      if (curOl) { blocks.push(curOl); curOl = null; }
    }
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (/^\s*$/.test(ln)) { flushAll(); continue; }
      if (/^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(ln)) {
        flushAll();
        blocks.push({ type: 'hr' });
        continue;
      }
      var mh = /^\s{0,3}(#{1,3})\s+(.+?)\s*$/.exec(ln);
      if (mh) {
        flushAll();
        blocks.push({ type: 'heading', level: mh[1].length, lines: [{ runs: parseMdInline(mh[2].replace(/\s+#+\s*$/, '')) }] });
        continue;
      }
      var mq = /^\s{0,3}>\s?(.*)$/.exec(ln);
      if (mq) {
        if (curPara) { blocks.push(curPara); curPara = null; }
        if (curUl) { blocks.push(curUl); curUl = null; }
        if (curOl) { blocks.push(curOl); curOl = null; }
        if (!curQuote) { curQuote = { type: 'quote', lines: [] }; }
        curQuote.lines.push({ runs: parseMdInline(mq[1]) });
        continue;
      }
      var mul = /^\s{0,3}[-*+]\s+(.*)$/.exec(ln);
      if (mul) {
        if (curPara) { blocks.push(curPara); curPara = null; }
        if (curQuote) { blocks.push(curQuote); curQuote = null; }
        if (curOl) { blocks.push(curOl); curOl = null; }
        if (!curUl) { curUl = { type: 'ul', items: [] }; }
        curUl.items.push({ runs: parseMdInline(mul[1]) });
        continue;
      }
      var mol = /^\s{0,3}(\d+)\.\s+(.*)$/.exec(ln);
      if (mol) {
        if (curPara) { blocks.push(curPara); curPara = null; }
        if (curQuote) { blocks.push(curQuote); curQuote = null; }
        if (curUl) { blocks.push(curUl); curUl = null; }
        if (!curOl) { curOl = { type: 'ol', start: Number(mol[1]) || 1, items: [] }; }
        curOl.items.push({ num: mol[1], runs: parseMdInline(mol[2]) });
        continue;
      }
      if (curQuote || curUl || curOl) { flushAll(); }
      if (!curPara) { curPara = { type: 'para', lines: [] }; }
      curPara.lines.push({ runs: parseMdInline(ln) });
    }
    flushAll();
    return blocks;
  }
  function renderMdRunsHtml(runs) {
    var h = '';
    for (var i = 0; i < runs.length; i++) {
      var r = runs[i];
      if (r.code) {
        h += '<code class="md-code">' + esc(r.text) + '</code>';
        continue;
      }
      var s = esc(r.text);
      if (r.hl) { s = '<mark class="md-hl">' + s + '</mark>'; }
      if (r.strike) { s = '<del>' + s + '</del>'; }
      if (r.italic) { s = '<em>' + s + '</em>'; }
      if (r.bold) { s = '<strong>' + s + '</strong>'; }
      h += s;
    }
    return h;
  }
  function renderMarkdownHTML(raw) {
    var blocks = parseMarkdownBlocks(raw, true);
    if (!blocks.length) { return ''; }
    var h = '';
    for (var i = 0; i < blocks.length; i++) {
      var blk = blocks[i];
      if (blk.type === 'hr') {
        h += '<hr class="md-hr">';
      } else if (blk.type === 'heading') {
        var tag = blk.level === 1 ? 'h2' : (blk.level === 2 ? 'h3' : 'h4');
        h += '<' + tag + '>' + renderMdRunsHtml(blk.lines[0].runs) + '</' + tag + '>';
      } else if (blk.type === 'quote') {
        h += '<blockquote class="md-q">' + blk.lines.map(function (ln) { return renderMdRunsHtml(ln.runs); }).join('<br>') + '</blockquote>';
      } else if (blk.type === 'ul') {
        h += '<ul class="md-ul">' + blk.items.map(function (it) { return '<li>' + renderMdRunsHtml(it.runs) + '</li>'; }).join('') + '</ul>';
      } else if (blk.type === 'ol') {
        var stAttr = blk.start && blk.start !== 1 ? (' start="' + blk.start + '"') : '';
        h += '<ol class="md-ol"' + stAttr + '>' + blk.items.map(function (it) { return '<li>' + renderMdRunsHtml(it.runs) + '</li>'; }).join('') + '</ol>';
      } else {
        h += '<p>' + blk.lines.map(function (ln) { return renderMdRunsHtml(ln.runs); }).join('<br>') + '</p>';
      }
    }
    return h;
  }
  function renderEntryBodyHTML(raw) {
    if (S && S.opts && S.opts.mdEnabled === false) { return esc(raw || ''); }
    return renderMarkdownHTML(raw || '');
  }
  function stripMarkdown(raw) {
    var blocks = parseMarkdownBlocks(raw, true);
    var lines = [];
    blocks.forEach(function (blk) {
      if (blk.type === 'hr') { return; }
      if (blk.type === 'quote' || blk.type === 'para' || blk.type === 'heading') {
        var txt = blk.lines.map(function (ln) {
          return ln.runs.map(function (r) { return r.text; }).join('');
        }).join('\n');
        if (txt) { lines.push(txt); }
      } else if (blk.type === 'ul' || blk.type === 'ol') {
        blk.items.forEach(function (it) {
          var txt = it.runs.map(function (r) { return r.text; }).join('');
          if (txt) { lines.push(txt); }
        });
      }
    });
    return lines.join('\n').replace(/^\n+|\n+$/g, '');
  }
  function previewText(raw) {
    return (S && S.opts && S.opts.mdEnabled !== false) ? stripMarkdown(raw || '') : String(raw || '');
  }

  /* ── 数据 ── */
  function bookById(id) { for (var i = 0; i < S.books.length; i++) { if (S.books[i].id === id && !S.books[i].deletedAt) { return S.books[i]; } } return null; }
  function isBookVisible(b) { return !!(b && !b.deletedAt && (session.secretUnlocked || !b.hidden)); }
  function personaById(id) {
    if (!id) { return { id: '', n: '', c: '' }; }
    for (var i = 0; i < S.personas.length; i++) { if (S.personas[i].id === id) { return S.personas[i]; } }
    if (String(id).indexOf('tmp:') === 0) { return { id: id, n: decodeURIComponent(String(id).slice(4)), c: '#9a948a', tmp: true }; }
    return { id: id, n: '', c: '' };
  }
  function entriesOf(bid) {
    var bk = bookByIdAny(bid);
    var asc = !!(bk && bk.sortDir === 'asc');
    return S.entries.filter(function (e) { return e.bid === bid && !e.deletedAt; }).sort(function (a, b) {
      var ka = normAtSortKey(a.at), kb = normAtSortKey(b.at);
      if (ka === kb) { return 0; }
      return asc ? (ka < kb ? -1 : 1) : (ka < kb ? 1 : -1);
    });
  }
  function deletedEntries() { return S.entries.filter(function (e) { return e.deletedAt; }); }
  function deletedBooks() { return S.books.filter(function (b) { return b.deletedAt; }); }
  function weekday(k) { var w = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']; var d = new Date(k + 'T00:00:00'); return isNaN(d.getTime()) ? '' : w[d.getDay()]; }
  function dayLabel(k) { var p = k.split('-'); return Number(p[1]) + ' 月 ' + Number(p[2]) + ' 日'; }
  function groupByDay(list) { var out = [], map = {}; list.forEach(function (e) { var d = e.at.slice(0, 10); if (!map[d]) { map[d] = { d: d, items: [] }; out.push(map[d]); } map[d].items.push(e); }); return out; }


  function enter() {
    if (!S.lock.enabled || session.unlocked) { afterUnlock(); return; }
    openLock();
  }
  function afterUnlock() {
    session.unlocked = true;
    if (lockPurpose === 'secret' || lockPurpose === 'secret-set') {
      var prevPurpose = lockPurpose;
      lockPurpose = 'main';
      session.secretUnlocked = true;
      var scb = pendingSecretCb;
      pendingSecretCb = null;
      renderShelf();
      show('shelf');
      if (typeof scb === 'function') {
        try { scb(); } catch (eSec) { }
      } else {
        toast(prevPurpose === 'secret-set' ? 'PIN 已设好，已进入私密模式' : '私密笔记本已显现');
      }
      return;
    }
    if (typeof pendingExternalCb === 'function') {
      var extCb = pendingExternalCb;
      pendingExternalCb = null;
      pendingInternalCb = null;
      hideRootOnly();
      try { extCb(); } catch (eExt) { }
      return;
    }
    if (typeof pendingInternalCb === 'function') {
      var intCb = pendingInternalCb;
      pendingInternalCb = null;
      try { intCb(); } catch (eInt) { }
      return;
    }
    var lastBk = bookById(S.last.bid);
    if (S.last.view === 'read' && lastBk && isBookVisible(lastBk)) { renderWhisper(); show('whisper'); playEnterFx('s-whisper'); }
    else { renderShelf(); show('shelf'); playEnterFx('s-shelf'); }
  }
  function requireUnlock(fn) {
    whenReady(function () {
      if (!S.lock.enabled || session.unlocked) { fn(); return; }
      lockPurpose = 'main';
      pendingSecretCb = null;
      pendingExternalCb = null;
      pendingInternalCb = fn;
      pinStage = S.lock.hash ? 'verify' : 'set';
      pendChange = false;
      openLock();
    });
  }

  /* ── 锁 ── */
  var pin = '';
  var pendChange = false;
  var pinStage = 'verify';
  var lockPurpose = 'main';
  var pendingSecretCb = null;
  var pendingExternalCb = null;
  var pendingInternalCb = null;
  var bioTried = false;
  function canBio() {
    return !!(window.AR && AR.Bridge && AR.Bridge.canBiometric && AR.Bridge.canBiometric());
  }
  function openLock(onSuccess) {
    if (typeof onSuccess === 'function') {
      whenReady(function () {
        if (!S.lock.enabled || session.unlocked) {
          try { onSuccess(); } catch (e0) { }
          return;
        }
        lockPurpose = 'main';
        pendingSecretCb = null;
        pendingInternalCb = null;
        pendingExternalCb = onSuccess;
        pinStage = S.lock.hash ? 'verify' : 'set';
        pendChange = false;
        openLock();
      });
      return;
    }
    bioTried = false;
    pin = '';
    var hasPin = !!S.lock.hash;
    var isSetting = (pinStage === 'set') || !hasPin;
    var bioAvail = canBio() && S.lock.bio;
    if (lockPurpose === 'secret' || lockPurpose === 'secret-set') {
      $('lockTitle').textContent = lockPurpose === 'secret-set' ? '设置 6 位 PIN' : '解锁私密笔记本';
      $('lockSub').textContent = lockPurpose === 'secret-set' ? '私密笔记本需要设 PIN 保护' : (bioAvail ? '验证 PIN 或生物识别后显现' : '输入 PIN 查看隐藏笔记本');
    } else if (pinStage === 'set' && hasPin) {
      $('lockTitle').textContent = '输入新 6 位 PIN';
      $('lockSub').textContent = '设置后将替换原 PIN';
    } else {
      $('lockTitle').textContent = hasPin ? '输入 PIN' : '设置一个 6 位 PIN';
      $('lockSub').textContent = hasPin ? (bioAvail ? '可用生物识别或 PIN' : 'Whisper 已上锁') : (bioAvail ? 'PIN 可选：也可以只用生物识别' : '设置 6 位 PIN 保护隐私');
    }
    $('bioBtn').style.display = (!isSetting && hasPin && bioAvail) ? '' : 'none';
    $('skipBtn').style.display = (!hasPin && pinStage !== 'set' && lockPurpose === 'main') ? '' : 'none';
    var padBio = $('pad').querySelector('[data-k="bio"]');
    if (padBio) { padBio.style.visibility = (!isSetting && bioAvail) ? '' : 'hidden'; }
    renderPin();
    show('lock');
    if (!isSetting && S.lock.enabled && bioAvail && !bioTried) {
      bioTried = true;
      setTimeout(function () { tryBio(); }, 90);
    }
  }
  function renderPin() { var h = ''; for (var i = 0; i < 6; i++) { h += '<i' + (i < pin.length ? ' class="on"' : '') + '></i>'; } $('pinDots').innerHTML = h; }
  $('pad').innerHTML = (function () {
    return ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'].map(function (k) {
      if (k === 'bio') { return '<button class="ghost" data-k="bio">指纹</button>'; }
      if (k === 'del') { return '<button class="ghost" data-k="del">⌫</button>'; }
      return '<button data-k="' + k + '">' + k + '</button>';
    }).join('');
  })();
  $('pad').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) { return; }
    var k = b.getAttribute('data-k');
    if (k === 'del') { pin = pin.slice(0, -1); renderPin(); return; }
    if (k === 'bio') { tryBio(); return; }
    if (pin.length >= 6) { return; }
    pin += k; renderPin();
    if (pin.length === 6) { setTimeout(commitPin, 90); }
  });
  function commitPin() {
    var entered = pin;
    pin = '';
    renderPin();
    if (pinStage === 'set' || !S.lock.hash) {
      hashPinSecure(entered).then(function (h) {
        S.lock.hash = h;
        S.lock.enabled = true;
        pendChange = false;
        pinStage = 'verify';
        save();
        toast('PIN 已设置');
        afterUnlock();
      });
      return;
    }
    verifyPin(entered, S.lock.hash).then(function (res) {
      if (!res.ok) {
        $('pinDots').classList.add('shake');
        setTimeout(function () { $('pinDots').classList.remove('shake'); }, 340);
        toast('PIN 不对');
        return;
      }
      if (pendChange) {
        pendChange = false;
        pinStage = 'set';
        openLock();
        toast('请输入新 PIN');
        return;
      }
      if (res.legacy) {
        hashPinSecure(entered).then(function (h2) {
          if (h2 !== S.lock.hash) { S.lock.hash = h2; save(); }
        });
      }
      afterUnlock();
    });
  }
  $('bioBtn').addEventListener('click', tryBio);
  $('skipBtn').addEventListener('click', function () {
    S.lock.optional = true;
    S.lock.enabled = !!(canBio() && S.lock.bio);
    pendChange = false;
    pinStage = 'verify';
    save(); toast(S.lock.enabled ? '没有 PIN，将只用生物识别' : '已关闭锁屏'); afterUnlock();
  });
  function tryBio() {
    if (pinStage === 'set') { return; }
    if (!S.lock.hash && !(canBio() && S.lock.bio)) { toast('先设置 PIN'); return; }
    if (!canBio()) {
      if (!S.lock.hash) { S.lock.enabled = false; save(); afterUnlock(); return; }
      toast('此设备不支持生物识别，请输入 PIN');
      return;
    }
    try {
      var r = AR.Bridge.biometricVerify();
      var onBioPass = function () {
        if (pendChange) {
          pendChange = false;
          pinStage = 'set';
          openLock();
          toast('请输入新 PIN');
          return;
        }
        afterUnlock();
      };
      if (r && typeof r.then === 'function') {
        r.then(function (ok) {
          if (ok === true || ok === 'true' || (ok && (ok.ok === true || ok.success === true))) { onBioPass(); }
          else { toast('没有通过'); }
        }).catch(function () { toast('生物识别失败'); });
        return;
      }
      if (r === true || r === 'true') { onBioPass(); return; }
    } catch (e0) { toast('生物识别失败'); }
  }

  /* ── 列表 ── */
  function recentEntryOf(bid) {
    return S.entries.filter(function (e) { return e.bid === bid && !e.deletedAt; })
      .sort(function (a, b) {
        var ka = normAtSortKey(a.at), kb = normAtSortKey(b.at);
        if (ka === kb) { return 0; }
        return ka < kb ? 1 : -1;
      })[0] || null;
  }
  function renderShelf() {
    S.books.forEach(function (b) { if (b.archived == null) { b.archived = false; } });
    var list = $('shelfList');
    var vis = visibleBooks();
    var secretBar = session.secretUnlocked
      ? '<div class="secret-bar"><span>私密模式已开启（退出后自动重新隐藏）</span><button type="button" id="secHideBtn">立即隐藏</button></div>'
      : '';
    if (!vis.length) {
      list.className = 'shelf';
      list.innerHTML = secretBar + '<div class="shelf-empty"><div class="k">W H I S P E R</div>'
        + '<div class="t"></div>'
        + '<div class="s"></div>'
        + '<button class="b" id="seNew">新建一本</button>'
        + '<div style="margin-top:8px"><button class="linkrow" id="seImport">从备份文件导入 ›</button></div></div>';
      $('seNew').onclick = function () { newBookSheet(); };
      if ($('seImport')) { $('seImport').onclick = function () { openImportSheet(); }; }
      if ($('secHideBtn')) { $('secHideBtn').onclick = function () { hideSecretMode(); }; }
      $('shSub').textContent = '0 本';
      return;
    }
    var style = S.opts.shelf || 'hero';
    list.className = 'shelf';
    var active = vis.filter(function (b) { return !b.archived; });
    var arch = vis.filter(function (b) { return b.archived; });
    var sort = S.opts.sort || 'recent';
    if (sort === 'name') { active = active.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'zh'); }); }
    else if (sort === 'count') { active = active.slice().sort(function (a, b) { return entriesOf(b.id).length - entriesOf(a.id).length; }); }
    else { active = active.slice().sort(function (a, b) { var la = recentEntryOf(a.id), lb = recentEntryOf(b.id); return normAtSortKey(lb ? lb.at : '').localeCompare(normAtSortKey(la ? la.at : '')); }); }

    var h = secretBar;
    if (style !== 'min') {
      var heroBook = active[0], heroEntry = heroBook ? recentEntryOf(heroBook.id) : null;
      if (heroEntry) {
        var hp = personaById(heroEntry.pid);
        h += '<button class="hero" data-hero="' + heroBook.id + '"><div class="k">继 续 写</div>'
          + '<div class="d">' + dayLabel(heroEntry.at.slice(0, 10)) + '<span>' + weekday(heroEntry.at.slice(0, 10)) + '</span></div>'
          + '<div class="x">' + esc(previewText(heroEntry.x)) + '</div>'
          + '<div class="m">' + esc(heroBook.name) + ' · ' + entriesOf(heroBook.id).length + ' 条' + (hp.n ? ' · ' + esc(hp.n) : '') + '</div></button>';
      }
    }
    var visEntryCount = 0;
    h += '<div class="books' + (style === 'grid2' ? ' grid2' : (style === 'min' ? ' min' : '')) + '">';
    active.forEach(function (b) {
      var es = entriesOf(b.id);
      visEntryCount += es.length;
      var last = recentEntryOf(b.id), pds = '', seen = {};
      es.slice(0, 12).forEach(function (e) { if (!seen[e.pid]) { seen[e.pid] = 1; var p = personaById(e.pid); if (p.c) { pds += '<i style="background:' + p.c + '"></i>'; } } });
      var meta = last ? dayLabel(last.at.slice(0, 10)) + ' · ' + es.length + ' 条' : '空';
      h += '<button class="book" data-bid="' + b.id + '">'
        + '<span class="spine" style="background:linear-gradient(180deg,' + (b.spine || S.theme.accent.a1) + ',rgba(0,0,0,.18))"></span>'
        + '<span class="meta"><span class="name">' + esc(b.name) + (b.hidden ? ' <em class="book-lock">私密</em>' : '') + '</span>'
        + '<span class="ex">' + (last ? esc(previewText(last.x)) : '') + '</span>'
        + '<span class="foot"><span>' + meta + '</span><span class="pds">' + pds + '</span></span></span></button>';
    });
    h += '</div>';
    if (arch.length) {
      h += '<div class="arch">已归档 · ' + arch.length + '</div>';
      h += '<div class="books min">';
      arch.forEach(function (b) {
        visEntryCount += entriesOf(b.id).length;
        h += '<button class="book" data-bid="' + b.id + '" style="opacity:.6"><span class="spine" style="background:var(--w-mid)"></span>'
          + '<span class="meta"><span class="name">' + esc(b.name) + (b.hidden ? ' <em class="book-lock">私密</em>' : '') + '</span></span></button>';
      });
      h += '</div>';
    }
    list.innerHTML = h;
    $('shSub').textContent = vis.length + ' 本 · ' + visEntryCount + ' 条';
    if ($('secHideBtn')) { $('secHideBtn').onclick = function () { hideSecretMode(); }; }
    var hv = list.querySelector('[data-hero]');
    if (hv) { hv.onclick = function () { S.last = { view: 'read', bid: hv.getAttribute('data-hero') }; save(); renderWhisper(); show('whisper'); playEnterFx(); }; }
  }
  function openSecretUnlock(cb) {
    pendingSecretCb = cb || null;
    if (!S.lock.hash && !(canBio() && S.lock.bio)) {
      lockPurpose = 'secret-set'; pendChange = false; pinStage = 'set';
      openLock();
      toast('请先设置 6 位 PIN 以保护私密笔记本');
      return;
    }
    lockPurpose = 'secret'; pendChange = false; pinStage = 'verify';
    openLock();
  }
  function hideSecretMode() {
    session.secretUnlocked = false;
    var cur = bookById(S.last.bid);
    if (cur && cur.hidden) {
      S.last = { view: 'shelf', bid: (visibleBooks()[0] || {}).id || '' };
    }
    renderShelf();
    toast('私密笔记本已隐藏');
  }
  function newBookSheet(cb) {
    var secRow = session.secretUnlocked
      ? '<label class="row" style="cursor:pointer;margin-top:8px;border-top:0"><span>设为私密日记本</span><input type="checkbox" id="nbHidden" style="margin-left:auto"></label>'
      : '';
    openSheet('<h3>新建日记本</h3><input class="inp" id="nbName">' + secRow
      + '<div class="btns"><button id="nbCancel">取消</button><button class="primary" id="nbOk">创建</button></div>'
      + '<div style="text-align:center;margin-top:8px"><button class="linkrow" id="nbImport">从 .md / .json 导入 ›</button></div>', function () {
      $('nbName').focus();
      $('nbCancel').onclick = closeSheet;
      if ($('nbImport')) { $('nbImport').onclick = function () { openImportSheet(); }; }
      $('nbOk').onclick = function () {
        var nm = ($('nbName').value || '').trim();
        if (!nm) { toast('起个名字'); return; }
        var id = uid('b');
        var isHidden = !!($('nbHidden') && $('nbHidden').checked);
        var bk = { id: id, name: nm, sortDir: 'desc', hidden: isHidden, spine: ['#d97757', '#6a9bcc', '#788c5d', '#b0aea5'][S.books.length % 4] };
        stampNow(bk);
        S.books.push(bk);
        S.last = { view: 'shelf', bid: id };
        save(); closeSheet(); renderShelf();
        if (cb) { cb(id); }
      };
    });
  }
  /* ── 阅读 ── */
  var efxTimer = null;
  function playEnterFx(which) {
    if (S.opts.enterFx === false) { return; }
    var scr = $(which || 's-whisper');
    if (!scr) { return; }
    scr.classList.remove('enterfx');
    void scr.offsetWidth;
    scr.classList.add('enterfx');
    if (efxTimer) { clearTimeout(efxTimer); }
    efxTimer = setTimeout(function () { scr.classList.remove('enterfx'); }, 460);
  }

  function aliveCommentsOf(e) {
    if (!e || !Array.isArray(e.comments)) { return []; }
    return e.comments.filter(function (c) { return c && !c.deletedAt; })
      .sort(function (a, b) {
        var ka = normAtSortKey(a.at), kb = normAtSortKey(b.at);
        if (ka === kb) { return 0; }
        return ka < kb ? -1 : 1;
      });
  }
  function entryMediaHTML(e) {
    if (!e || !Array.isArray(e.media) || !e.media.length) { return ''; }
    var n = Math.min(4, e.media.length);
    var h = '<div class="entry-media n' + n + '">';
    e.media.forEach(function (m, idx) {
      if (!m || !m.id) { return; }
      var cached = mediaCache[m.id];
      var inner = (cached && cached.dataUrl)
        ? '<img src="' + cached.dataUrl + '" alt="">'
        : '<div class="m-miss" data-miss="' + m.id + '">加载图片…</div>';
      h += '<button type="button" class="m-thumb" data-eid="' + e.id + '" data-mid="' + m.id + '" data-idx="' + idx + '">' + inner + '</button>';
    });
    h += '</div>';
    return h;
  }
  function entryCommentsHTML(e) {
    var cs = aliveCommentsOf(e);
    if (!cs.length) { return ''; }
    var h = '<div class="entry-cmts">';
    cs.forEach(function (c) {
      var cp = personaById(c.pid);
      var when = fmtShortMDHM(c.at);
      h += '<div class="cmt-item" data-eid="' + e.id + '" data-cid="' + c.id + '">'
        + '<div class="cmt-hd">' + (cp.n ? '<span class="dot" style="background:' + cp.c + '"></span><span>' + esc(cp.n) + '</span>' : '')
        + '<span>' + esc(when) + '</span></div>'
        + '<div class="cmt-x">' + esc(c.x) + '</div></div>';
    });
    h += '<button type="button" class="cmt-add" data-addcmt="' + e.id + '">＋ 追记</button></div>';
    return h;
  }
  function pullMediaFromCloud(mid) {
    if (!mid || !mediaSyncReady()) {
      return Promise.resolve({ ok: false, reason: 'disabled' });
    }
    if (mediaPulling[mid]) { return mediaPulling[mid]; }
    mediaPulling[mid] = AR.Sync.blobMediaPull(mid).then(function (pulled) {
      if (pulled && pulled.dataUrl) {
        return saveMediaLocal(mid, pulled).then(function () {
          return { ok: true, rec: pulled };
        });
      }
      return { ok: false, reason: 'empty' };
    }, function (err) {
      return { ok: false, reason: 'error', message: (err && err.message) || '' };
    }).then(function (res) {
      delete mediaPulling[mid];
      var btns = document.querySelectorAll('#wBody .m-thumb[data-mid]');
      Array.prototype.forEach.call(btns, function (b) {
        if (b.getAttribute('data-mid') !== mid) { return; }
        if (res.ok && res.rec && res.rec.dataUrl) {
          b.innerHTML = '<img src="' + res.rec.dataUrl + '" alt="">';
          return;
        }
        var ms = b.querySelector('.m-miss');
        if (ms) {
          ms.textContent = res.reason === 'error' ? '拉取失败，点击重试' : '云端暂无此图，点击重试';
        }
      });
      return res;
    });
    return mediaPulling[mid];
  }
  function hydrateMediaDom(container) {
    if (!container) { return; }
    var nodes = container.querySelectorAll('.m-thumb[data-mid]');
    Array.prototype.forEach.call(nodes, function (btn) {
      var mid = btn.getAttribute('data-mid');
      if (!mid || btn.querySelector('img')) { return; }
      loadMediaLocal(mid).then(function (rec) {
        if (rec && rec.dataUrl) {
          btn.innerHTML = '<img src="' + rec.dataUrl + '" alt="">';
          return;
        }
        var ms = btn.querySelector('.m-miss');
        if (mediaSyncReady()) {
          if (ms) { ms.textContent = '正在拉取云端配图…'; }
          pullMediaFromCloud(mid);
        } else if (ms) {
          ms.textContent = '附图未在本机（已关闭图片同步）';
        }
      });
    });
  }
  function renderWhisper() {
    var b = bookById(S.last.bid);
    if (!b || !isBookVisible(b)) { b = visibleBooks()[0] || null; }
    if (!b) { renderShelf(); show('shelf'); return; }
    $('wTitle').innerHTML = esc(b.name) + (b.hidden ? ' <span class="wh-lock-ic">' + svgIco('lock') + '</span>' : '');
    var all = entriesOf(b.id);
    var list = all.filter(function (e) { return S.opts.filter === 'all' || e.pid === S.opts.filter; });
    $('wSub').textContent = (b.sortDir === 'asc' ? '正序 · 旧→新' : '');
    $('wSub').style.display = b.sortDir === 'asc' ? '' : 'none';
    var body = $('wBody');
    if (S.opts.layout === 'C') { body.className = 'scroll cards' + (S.opts.grouped ? '' : ' flat'); body.innerHTML = renderCards(list); }
    else { body.className = 'scroll paper' + (S.opts.grouped ? '' : ' flat'); body.innerHTML = renderPaper(list); }
    hydrateMediaDom(body);
  }
  function renderPaper(list) {
    var gs = groupByDay(list), h = '<div class="inner">';
    var mdCls = !(S && S.opts && S.opts.mdEnabled === false) ? ' md-body' : '';
    if (!gs.length) { return '<div class="inner"><p style="color:var(--w-mid)">暂无</p></div>'; }
    gs.forEach(function (g) {
      h += '<div class="dayhead" data-day="' + g.d + '"><span class="d">' + dayLabel(g.d) + '</span><span class="w">' + weekday(g.d) + '</span></div>';
      g.items.forEach(function (e) {
        var p = personaById(e.pid);
        h += '<div class="entry" data-eid="' + e.id + '"><div class="t">' + fmtClockHM(e.at) + '</div>'
          + '<div class="x' + mdCls + '">' + renderEntryBodyHTML(e.x) + '</div>'
          + entryMediaHTML(e)
          + (p.n ? '<div class="sig"><span class="dot" style="background:' + p.c + '"></span>' + esc(p.n) + '</div>' : '')
          + entryCommentsHTML(e)
          + '</div>';
      });
    });
    return h + '</div>';
  }
  function renderCards(list) {
    var gs = groupByDay(list), h = '';
    var mdCls = !(S && S.opts && S.opts.mdEnabled === false) ? ' md-body' : '';
    if (!gs.length) { return '<p style="color:var(--w-mid);font-size:12px">暂无</p>'; }
    gs.forEach(function (g) {
      h += '<div class="dayhead" data-day="' + g.d + '"><span class="d">' + dayLabel(g.d) + '</span><span class="w">' + weekday(g.d) + '</span></div>';
      g.items.forEach(function (e) {
        var p = personaById(e.pid);
        h += '<div class="entry" data-eid="' + e.id + '"><div class="hd">' + (p.n ? '<span class="dot" style="background:' + p.c + '"></span>' + esc(p.n) : '')
          + '<span style="margin-left:auto">' + fmtClockHM(e.at) + '</span></div>'
          + '<div class="x' + mdCls + '">' + renderEntryBodyHTML(e.x) + '</div>'
          + entryMediaHTML(e)
          + entryCommentsHTML(e)
          + '</div>';
      });
    });
    return h;
  }
  /* ── 设置跳转（统一走主应用设置 → Whisper） ── */
  function openAppSettings() {
    closeRoot();
    try {
      if (window.AR && AR.UI && AR.UI.show) { AR.UI.show('settings'); }
      if (window.AR && AR.Panels && AR.Panels.openSettingsCat) { AR.Panels.openSettingsCat('whisper'); }
    } catch (e0) { }
  }
  /* 取色统一走 app 的取色器（不要再实现第二套） */
  function pickColor(initialHex, onPick) {
    if (window.AR && AR.UI && AR.UI.openColorPicker) {
      AR.UI.openColorPicker(initialHex || '#000000', function (hex) { onPick(hex); });
      return;
    }
    onPick(initialHex || '#000000');
  }
  function getPath(path) { var p = path.split('.'), v = S.theme; for (var i = 0; i < p.length; i++) { v = v[p[i]]; } return v; }
  function setPath(path, val) { var p = path.split('.'), v = S.theme; for (var i = 0; i < p.length - 1; i++) { v = v[p[i]]; } v[p[p.length - 1]] = val; }

  /* ── 目录抽屉 ── */
  var tocState = { open: false, dir: 'right', day: '' };
  function tocList() {
    var curB = bookById(S.last.bid);
    var b = (curB && isBookVisible(curB)) ? curB : visibleBooks()[0];
    if (!b) {
      $('tocSub').textContent = '0 本';
      return '<div class="m">还没有日记本</div>';
    }
    var list = entriesOf(b.id).filter(function (e) { return S.opts.filter === 'all' || e.pid === S.opts.filter; });
    var gs = groupByDay(list), h = '', lastM = '';
    $('tocSub').textContent = b.name + ' · ' + gs.length + ' 天 · ' + list.length + ' 条';
    var todayKey = new Date().getFullYear() + '-' + p2(new Date().getMonth() + 1) + '-' + p2(new Date().getDate());
    gs.forEach(function (g) {
      var m = g.d.slice(0, 7);
      if (m !== lastM) {
        lastM = m;
        h += '<div class="m">' + m.slice(0, 4) + ' 年 ' + Number(m.slice(5, 7)) + ' 月</div>';
      }
      var dd = Number(g.d.slice(8, 10));
      var cls = 'day' + (tocState.day === g.d ? ' cur' : '') + (g.d === todayKey ? ' today' : '');
      h += '<button class="' + cls + '" data-day="' + g.d + '">'
        + '<span class="dd">' + dd + ' 日</span><span class="w">' + weekday(g.d) + '</span>'
        + '<span class="n">' + g.items.length + ' 条</span></button>';
    });
    return h || '<div class="m">这本还没有内容</div>';
  }
  function tocWidth() { return Math.min(214, Math.round(window.innerWidth * 0.52)); }
  var tocRaf = 0, tocPending = null;
  function setTocProgress(dir, p) {
    tocPending = { dir: dir, p: p };
    if (tocRaf) { return; }
    tocRaf = requestAnimationFrame(function () {
      tocRaf = 0;
      var v = tocPending;
      if (!v) { return; }
      var el = $('toc');
      var off = (1 - v.p) * (tocWidth() + 10);
      el.style.transform = v.dir === 'right' ? 'translateX(' + off + 'px)' : 'translateX(' + (-off) + 'px)';
      $('tocMask').style.opacity = String(Math.max(0, Math.min(1, v.p)));
    });
  }
  function openToc(dir) {
    var el = $('toc');
    /* 换边时先关掉过渡并强制回流，否则会从上一侧"飞"到另一侧 */
    var m = $('tocMask');
    el.classList.add('noanim');
    el.classList.remove('from-left', 'from-right', 'dragging', 'on');
    el.style.transform = '';
    m.classList.remove('on');
    m.style.transition = 'none';
    m.style.opacity = '0';
    el.classList.add(dir === 'left' ? 'from-left' : 'from-right');
    void el.offsetWidth;
    el.classList.remove('noanim');
    void el.offsetWidth;
    m.style.transition = '';
    tocState.dir = dir === 'left' ? 'left' : 'right';
    /* 当前读到的日期高亮 */
    tocState.day = '';
    var days = $('wBody').querySelectorAll('[data-day]');
    for (var i = 0; i < days.length; i++) {
      var r = days[i].getBoundingClientRect();
      if (r.bottom > 120) { tocState.day = days[i].getAttribute('data-day'); break; }
    }
    $('tocList').innerHTML = tocList();
    requestAnimationFrame(function () {
      el.classList.add('on');
      m.style.opacity = '';
      m.classList.add('on');
    });
    tocState.open = true;
    var cur = $('tocList').querySelector('.day.cur');
    if (cur) {
      var tl = $('tocList');
      var cr = cur.getBoundingClientRect();
      var tr = tl.getBoundingClientRect();
      tl.scrollTop += (cr.top - tr.top) - (tl.clientHeight - cr.height) / 2;
    }
    var stageEl = $('whRoot');
    stageEl.scrollLeft = 0; stageEl.scrollTop = 0;
    Array.prototype.forEach.call($('tocList').querySelectorAll('[data-day]'), function (b) {
      b.onclick = function () { gotoDay(b.getAttribute('data-day')); };
    });
  }
  function gotoDay(day) {
    closeToc();
    var target = $('wBody').querySelector('[data-day="' + day + '"]');
    if (!target) { return; }
    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    try { $('whRoot').scrollLeft = 0; $('whRoot').scrollTop = 0; } catch (e2) { }
    var nx = target.nextElementSibling;
    var ent = nx && (nx.classList && nx.classList.contains('entry') ? nx : (nx.querySelector ? nx.querySelector('.entry') : null));
    if (ent) { ent.classList.add('hl'); setTimeout(function () { ent.classList.remove('hl'); }, 1400); }
  }
  function closeToc() {
    var el = $('toc');
    el.classList.remove('dragging');
    el.style.transform = '';
    el.classList.remove('on');
    $('tocMask').classList.remove('on');
    $('tocMask').style.opacity = '';
    tocState.open = false;
  }
  $('tocMask').addEventListener('click', closeToc);
  $('tocClose').addEventListener('click', closeToc);

  /* 横滑：跟手拖，往哪滑就从哪侧出来；松手按进度决定开/收 */
  (function () {
    var body = $('wBody'), sx = 0, sy = 0, t0 = 0, tracking = false;
    body.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) { return; }
      if (e.target.closest('textarea,input')) { return; }
      if (tocState.open) { return; }
      tracking = true; sx = e.clientX; sy = e.clientY; t0 = Date.now();
    });
    body.addEventListener('pointerup', function (e) {
      if (!tracking) { return; }
      tracking = false;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.25) { return; }
      var fast = Math.abs(dx) / Math.max(1, Date.now() - t0) > 0.55;
      if (Math.abs(dx) >= 72 || fast) { openToc(dx < 0 ? 'right' : 'left'); }
    });
    body.addEventListener('pointercancel', function () { tracking = false; });
  })();

  /* ── 单条纯文本与排版卡片图片生成 ── */
  function formatEntryPlainText(e, book, withMeta) {
    var bodyTxt = previewText(e.x || '');
    var includeMeta = (withMeta === undefined) ? !!(S && S.opts && S.opts.copyWithMeta) : !!withMeta;
    if (!includeMeta) { return bodyTxt; }
    var p = personaById(e.pid);
    var d = String(e.at || '').slice(0, 10);
    var tm = fmtClockHM(e.at);
    var out = dayLabel(d) + ' ' + weekday(d) + (tm ? ' ' + tm : '') + (book ? ' · ' + book.name : '') + '\n\n' + bodyTxt;
    if (e.media && e.media.length) {
      out += '\n\n[附 ' + e.media.length + ' 张图片]';
    }
    if (p.n) { out += '\n\n—— ' + p.n; }
    var cmts = aliveCommentsOf(e);
    if (cmts.length) {
      out += '\n\n追记：';
      cmts.forEach(function (c) {
        var cp = personaById(c.pid);
        out += '\n· ' + (cp.n ? '[' + cp.n + '] ' : '') + fmtShortMDHM(c.at) + '：' + c.x;
      });
    }
    return out;
  }

  function copyEntryPlain(e) {
    if (!e) { return; }
    var bk = bookById(e.bid) || bookByIdAny(e.bid);
    var tx = formatEntryPlainText(e, bk);
    if (window.AR && AR.Bridge && AR.Bridge.copy) { AR.Bridge.copy(tx); }
    else { try { navigator.clipboard.writeText(tx); toast('已复制纯文本'); } catch (err) { toast('复制失败'); } }
  }

  function wrapCanvasLines(ctx, text, maxW) {
    var paras = String(text || '').split(/\r?\n/);
    var out = [];
    paras.forEach(function (para) {
      if (!para) { out.push(''); return; }
      var line = '';
      for (var i = 0; i < para.length; i++) {
        var ch = para[i];
        var test = line + ch;
        if (ctx.measureText(test).width > maxW && line.length > 0) {
          out.push(line);
          line = ch;
        } else {
          line = test;
        }
      }
      if (line) { out.push(line); }
    });
    return out;
  }

  function loadHtmlImage(src) {
    return new Promise(function (resolve) {
      if (!src || typeof Image === 'undefined') { resolve(null); return; }
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function hexLuminance(hex) {
    var h = String(hex || '').trim().replace('#', '');
    if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
    if (!/^[0-9a-fA-F]{6}$/.test(h)) { return 245; }
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  function fillRoundRect(ctx, x, y, w, h, r) {
    var rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  }

  function canvasFontSpec(seg, fs, bodyFontFamily, forceBold) {
    if (seg && seg.code) {
      return '400 ' + Math.max(16, Math.round(fs * 0.88)) + 'px "Cascadia Mono",Consolas,"SF Mono",monospace';
    }
    var style = (seg && seg.italic) ? 'italic ' : '';
    var weight = ((seg && seg.bold) || forceBold) ? '700 ' : '';
    return style + weight + fs + 'px ' + bodyFontFamily;
  }

  function wrapRichRuns(ctx, runs, fs, bodyFontFamily, maxW, forceBold) {
    var lines = [];
    var curSegs = [], curW = 0;
    var flushLine = function () {
      lines.push({ segs: curSegs, w: curW });
      curSegs = [];
      curW = 0;
    };
    if (!runs || !runs.length) { flushLine(); return lines; }
    for (var ri = 0; ri < runs.length; ri++) {
      var run = runs[ri];
      var txt = String(run.text || '');
      if (!txt) { continue; }
      ctx.font = canvasFontSpec(run, fs, bodyFontFamily, forceBold);
      var pad = run.code ? 10 : 0;
      var buf = '', bufW = 0;
      for (var ci = 0; ci < txt.length; ci++) {
        var code = txt.charCodeAt(ci);
        var ch = txt[ci];
        if (code >= 0xD800 && code <= 0xDBFF && ci + 1 < txt.length) {
          ch += txt[ci + 1];
          ci++;
        }
        var cw = ctx.measureText(ch).width;
        var needW = curW + bufW + cw + (buf ? 0 : pad);
        if (needW > maxW && (curSegs.length > 0 || buf.length > 0)) {
          if (buf) {
            curSegs.push({ text: buf, bold: run.bold, italic: run.italic, strike: run.strike, hl: run.hl, code: run.code, w: bufW + pad });
            curW += bufW + pad;
            buf = ''; bufW = 0;
          }
          flushLine();
        }
        buf += ch;
        bufW += cw;
      }
      if (buf) {
        curSegs.push({ text: buf, bold: run.bold, italic: run.italic, strike: run.strike, hl: run.hl, code: run.code, w: bufW + pad });
        curW += bufW + pad;
      }
    }
    flushLine();
    return lines;
  }

  function layoutCardBody(ctx, rawText, useMd, innerW, bodyFontFamily) {
    var blocks = parseMarkdownBlocks(rawText, useMd);
    var rows = [], quoteSpans = [];
    var yOff = 0;
    for (var bi = 0; bi < blocks.length; bi++) {
      var blk = blocks[bi];
      if (bi > 0) { yOff += (blk.type === 'heading' ? 14 : 10); }
      if (blk.type === 'hr') {
        rows.push({ kind: 'hr', yOff: yOff + 10 });
        yOff += 26;
      } else if (blk.type === 'heading') {
        var fs = blk.level === 1 ? 38 : (blk.level === 2 ? 34 : 31);
        var lh = Math.round(fs * 1.55);
        var wLines = wrapRichRuns(ctx, blk.lines[0].runs, fs, bodyFontFamily, innerW, true);
        for (var hi = 0; hi < wLines.length; hi++) {
          rows.push({ kind: 'line', segs: wLines[hi].segs, xOff: 0, yOff: yOff, fs: fs, forceBold: true, isQuote: false });
          yOff += lh;
        }
        yOff += 4;
      } else if (blk.type === 'quote') {
        var qTop = yOff - 22;
        for (var qi = 0; qi < blk.lines.length; qi++) {
          var qLines = wrapRichRuns(ctx, blk.lines[qi].runs, 30, bodyFontFamily, innerW - 26, false);
          for (var qli = 0; qli < qLines.length; qli++) {
            rows.push({ kind: 'line', segs: qLines[qli].segs, xOff: 26, yOff: yOff, fs: 30, forceBold: false, isQuote: true });
            yOff += 48;
          }
        }
        quoteSpans.push({ top: qTop, bot: yOff - 36 });
      } else if (blk.type === 'ul' || blk.type === 'ol') {
        for (var li = 0; li < blk.items.length; li++) {
          var it = blk.items[li];
          var marker = blk.type === 'ol' ? (String(it.num) + '.') : '•';
          var mLines = wrapRichRuns(ctx, it.runs, 31, bodyFontFamily, innerW - 36, false);
          for (var mli = 0; mli < mLines.length; mli++) {
            rows.push({ kind: 'line', segs: mLines[mli].segs, xOff: 36, yOff: yOff, fs: 31, forceBold: false, isQuote: false, bullet: mli === 0 ? marker : '' });
            yOff += 49;
          }
        }
      } else {
        for (var pi = 0; pi < blk.lines.length; pi++) {
          var pLines = wrapRichRuns(ctx, blk.lines[pi].runs, 32, bodyFontFamily, innerW, false);
          for (var pli = 0; pli < pLines.length; pli++) {
            rows.push({ kind: 'line', segs: pLines[pli].segs, xOff: 0, yOff: yOff, fs: 32, forceBold: false, isQuote: false });
            yOff += 52;
          }
        }
      }
    }
    if (!blocks.length) { yOff = 52; }
    return { rows: rows, quoteSpans: quoteSpans, totalH: yOff };
  }

  function buildEntryCardDataUrl(e, book, overrideOpts, metaOut) {
    var opt = getCardOpts();
    if (overrideOpts && typeof overrideOpts === 'object') {
      var okK;
      for (okK in overrideOpts) {
        if (Object.prototype.hasOwnProperty.call(overrideOpts, okK) && overrideOpts[okK] !== undefined) { opt[okK] = overrideOpts[okK]; }
      }
    }
    var cs = stage ? getComputedStyle(stage) : null;
    var cBg = (cs && cs.getPropertyValue('--w-bg').trim()) || '#faf9f5';
    var cFg = (cs && cs.getPropertyValue('--w-fg').trim()) || '#141413';
    var cMid = (cs && cs.getPropertyValue('--w-mid').trim()) || '#8a867c';
    var cSub = (cs && cs.getPropertyValue('--w-subtle').trim()) || '#e8e6dc';
    var cA1 = (cs && cs.getPropertyValue('--w-a1').trim()) || '#d97757';
    var useSerif = (S.opts && S.opts.font === 'serif');
    var bodyFontFamily = useSerif ? SERIF : UI_FONT_STACK;

    var W = 900;
    var outerPad = opt.frame ? 36 : 0;
    var padX = opt.frame ? 56 : 68;
    var padTop = opt.frame ? 64 : 70;
    var padBot = opt.frame ? 54 : 60;
    var contentLeft = outerPad + padX;
    var innerW = W - contentLeft * 2;
    var tmp = document.createElement('canvas');
    var tctx = tmp.getContext('2d');
    if (!tctx) { return Promise.reject(new Error('当前环境不支持生成图片')); }

    var useMd = !!(opt.renderMd && !(S.opts && S.opts.mdEnabled === false));
    var bodyLayout = layoutCardBody(tctx, e.x || '', useMd, innerW, bodyFontFamily);

    var cmts = opt.showComments ? aliveCommentsOf(e) : [];
    tctx.font = '24px ' + bodyFontFamily;
    var cmtBlocks = cmts.map(function (c) {
      var ls = wrapCanvasLines(tctx, c.x || '', innerW - 28);
      return { c: c, p: personaById(c.pid), lines: ls };
    });

    var mediaList = (opt.showMedia && Array.isArray(e.media)) ? e.media.slice(0, 4) : [];
    return Promise.all(mediaList.map(function (m) {
      return loadMediaLocal(m.id).then(function (rec) {
        return rec && rec.dataUrl ? loadHtmlImage(rec.dataUrl) : null;
      });
    })).then(function (imgs) {
      var validImgs = imgs.filter(Boolean);
      var mediaH = 0;
      var imgLayouts = [];
      if (validImgs.length === 1) {
        var im0 = validImgs[0];
        var drawW = innerW;
        var drawH = Math.min(540, Math.max(180, Math.round(drawW * (im0.height / Math.max(1, im0.width)))));
        imgLayouts.push({ img: im0, x: contentLeft, yOff: 0, w: drawW, h: drawH });
        mediaH = drawH + 24;
      } else if (validImgs.length > 1) {
        var gap = 14, colW = Math.floor((innerW - gap) / 2), cellH = 220;
        validImgs.forEach(function (im, idx) {
          var col = idx % 2, row = Math.floor(idx / 2);
          imgLayouts.push({ img: im, x: contentLeft + col * (colW + gap), yOff: row * (cellH + gap), w: colW, h: cellH });
        });
        var rows = Math.ceil(validImgs.length / 2);
        mediaH = rows * cellH + (rows - 1) * gap + 24;
      }

      var p = opt.showPersona ? personaById(e.pid) : { n: '', c: '' };
      var hasHead = !!(opt.showDate || opt.showTime);
      var headH = hasHead ? (56 + 12) : 20;
      var cmtH = 0;
      if (cmtBlocks.length) {
        cmtH += 26;
        cmtBlocks.forEach(function (b) { cmtH += 34 + b.lines.length * 36 + 14; });
      }
      var footerH = opt.showFooter ? 56 : 16;
      var naturalCardH = padTop + headH + bodyLayout.totalH + mediaH + (p.n ? 46 : 6) + cmtH + footerH + padBot;
      var naturalH = outerPad * 2 + naturalCardH;
      var minH = opt.ratio === '3:4' ? 1200 : (opt.ratio === '1:1' ? 900 : 0);
      var H = Math.max(naturalH, minH);
      var vPad = (minH > naturalH) ? Math.round((minH - naturalH) / 2) : 0;
      if (metaOut && typeof metaOut === 'object') {
        metaOut.extended = (minH > 0 && naturalH > minH);
      }

      var cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      var ctx = cv.getContext('2d');
      if (opt.frame) {
        var isDarkCard = hexLuminance(cBg) < 128;
        ctx.fillStyle = isDarkCard ? '#0a0a09' : cSub;
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        ctx.shadowColor = isDarkCard ? 'rgba(0,0,0,0.45)' : 'rgba(20,20,19,0.14)';
        ctx.shadowBlur = 28;
        ctx.shadowOffsetY = 10;
        fillRoundRect(ctx, outerPad, outerPad, W - outerPad * 2, H - outerPad * 2, 26);
        ctx.fillStyle = cBg;
        ctx.fill();
        ctx.restore();
        fillRoundRect(ctx, outerPad, outerPad, W - outerPad * 2, H - outerPad * 2, 26);
        ctx.strokeStyle = isDarkCard ? 'rgba(255,255,255,0.10)' : 'rgba(20,20,19,0.08)';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = cBg;
        ctx.fillRect(0, 0, W, H);
      }

      var y = outerPad + padTop + vPad;
      if (hasHead) {
        var d = String(e.at || '').slice(0, 10);
        var tm = fmtClockHM(e.at);
        var metaParts = [];
        if (opt.showDate) { metaParts.push(weekday(d)); }
        if (opt.showTime && tm) { metaParts.push(tm); }
        var xCursor = contentLeft;
        if (opt.showDate) {
          ctx.fillStyle = cFg;
          ctx.font = '600 40px ' + SERIF;
          var dayTxt = dayLabel(d);
          ctx.fillText(dayTxt, xCursor, y);
          xCursor += ctx.measureText(dayTxt).width + 16;
        }
        if (metaParts.length) {
          ctx.fillStyle = opt.showDate ? cMid : cFg;
          ctx.font = (opt.showDate ? '22px ' : '600 28px ') + bodyFontFamily;
          ctx.fillText(metaParts.join(' · '), xCursor, y);
        }
        y += 22;
        ctx.fillStyle = cSub;
        ctx.fillRect(contentLeft, y, innerW, 2);
        y += 46;
      } else {
        y += 12;
      }

      var bodyStartY = y;
      ctx.fillStyle = cA1;
      bodyLayout.quoteSpans.forEach(function (qs) {
        ctx.fillRect(contentLeft + 6, bodyStartY + qs.top, 4, Math.max(20, qs.bot - qs.top));
      });
      bodyLayout.rows.forEach(function (row) {
        var ry = bodyStartY + row.yOff;
        if (row.kind === 'hr') {
          ctx.fillStyle = cSub;
          ctx.fillRect(contentLeft, ry, innerW, 2);
          return;
        }
        if (row.bullet) {
          ctx.fillStyle = cMid;
          ctx.font = row.fs + 'px ' + bodyFontFamily;
          ctx.fillText(row.bullet, contentLeft + 4, ry);
        }
        var cx = contentLeft + row.xOff;
        for (var si = 0; si < row.segs.length; si++) {
          var seg = row.segs[si];
          ctx.font = canvasFontSpec(seg, row.fs, bodyFontFamily, row.forceBold);
          if (seg.hl) {
            ctx.fillStyle = hexToRgba(cA1, 0.24);
            fillRoundRect(ctx, cx - 2, ry - row.fs * 0.84, seg.w + 4, row.fs * 1.06, 6);
            ctx.fill();
          }
          if (seg.code) {
            ctx.fillStyle = cSub;
            fillRoundRect(ctx, cx, ry - row.fs * 0.82, seg.w, row.fs * 1.02, 6);
            ctx.fill();
          }
          ctx.fillStyle = row.isQuote ? cMid : cFg;
          ctx.fillText(seg.text, seg.code ? (cx + 5) : cx, ry);
          if (seg.strike) {
            ctx.strokeStyle = row.isQuote ? cMid : cFg;
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.moveTo(cx, ry - row.fs * 0.30);
            ctx.lineTo(cx + seg.w, ry - row.fs * 0.30);
            ctx.stroke();
          }
          cx += seg.w;
        }
      });
      y += bodyLayout.totalH;

      if (imgLayouts.length) {
        y += 8;
        imgLayouts.forEach(function (it) {
          var iy = y + it.yOff;
          ctx.save();
          fillRoundRect(ctx, it.x, iy, it.w, it.h, 14);
          ctx.clip();
          var sr = Math.max(it.w / Math.max(1, it.img.width), it.h / Math.max(1, it.img.height));
          var dw2 = it.img.width * sr, dh2 = it.img.height * sr;
          ctx.drawImage(it.img, it.x + (it.w - dw2) / 2, iy + (it.h - dh2) / 2, dw2, dh2);
          ctx.restore();
        });
        y += mediaH;
      }

      if (p.n) {
        y += 8;
        ctx.fillStyle = p.c || cA1;
        ctx.beginPath();
        ctx.arc(contentLeft + 7, y - 8, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = cMid;
        ctx.font = '24px ' + bodyFontFamily;
        ctx.fillText(p.n, contentLeft + 24, y);
        y += 38;
      }

      if (cmtBlocks.length) {
        y += 14;
        var cStart = y - 16;
        cmtBlocks.forEach(function (blk) {
          ctx.fillStyle = (blk.p && blk.p.c) || cMid;
          ctx.font = '20px ' + bodyFontFamily;
          var headTxt = (blk.p && blk.p.n ? blk.p.n + ' · ' : '') + fmtShortMDHM(blk.c.at);
          ctx.fillText(headTxt, contentLeft + 24, y);
          y += 32;
          ctx.fillStyle = cFg;
          ctx.font = '24px ' + bodyFontFamily;
          blk.lines.forEach(function (ln) {
            if (ln) { ctx.fillText(ln, contentLeft + 24, y); }
            y += 36;
          });
          y += 14;
        });
        ctx.fillStyle = cSub;
        ctx.fillRect(contentLeft + 4, cStart, 4, Math.max(20, y - cStart - 16));
      }

      if (opt.showFooter) {
        y = H - outerPad - padBot;
        ctx.fillStyle = cSub;
        ctx.fillRect(contentLeft, y - 36, innerW, 1);
        ctx.fillStyle = cMid;
        ctx.font = '20px ' + SERIF;
        ctx.fillText('Whisper' + (book ? '  ·  ' + book.name : ''), contentLeft, y);
      }

      return cv.toDataURL('image/png');
    });
  }

  function openEntryImageSheet(e) {
    var bk = bookById(e.bid) || bookByIdAny(e.bid);
    openSheet('<h3>导出日记卡片图片</h3>'
      + '<div class="card-preview-wrap" id="cardPrevBox"><p class="muted" style="font-size:12px">正在排版生成…</p></div>'
      + '<div class="card-opt-note" id="cardExtNote" hidden>内容较长，卡片已按正文自动顺延高度</div>'
      + '<button type="button" class="card-opt-toggle" id="ciOptToggle"><span>自定义样式与显示项</span><span id="ciOptArrow">▾</span></button>'
      + '<div class="card-opt-panel" id="ciOptPanel" hidden></div>'
      + '<div class="btns"><button id="ciClose">关闭</button><button id="ciSave">保存图片</button><button class="primary" id="ciShare">分享图片</button></div>', function () {
      var generated = '';
      var renderSeq = 0;
      var fname = 'whisper-' + safe((e.at || '').slice(0, 10) || 'card') + '.png';
      var renderPreview = function () {
        var mySeq = ++renderSeq;
        var metaOut = { extended: false };
        buildEntryCardDataUrl(e, bk, null, metaOut).then(function (dataUrl) {
          if (mySeq !== renderSeq) { return; }
          generated = dataUrl;
          var box = $('cardPrevBox');
          if (box) { box.innerHTML = '<img src="' + dataUrl + '" alt="">'; }
          var noteEl = $('cardExtNote');
          if (noteEl) { noteEl.hidden = !metaOut.extended; }
        }, function (err) {
          if (mySeq !== renderSeq) { return; }
          var box = $('cardPrevBox');
          if (box) { box.textContent = (err && err.message) || '生成图片失败'; }
        });
      };
      var paintOptsPanel = function () {
        var panel = $('ciOptPanel');
        if (!panel) { return; }
        var opt = getCardOpts();
        var toggles = [
          ['showDate', '日期星期'],
          ['showTime', '具体时间'],
          ['showFooter', '底部标识'],
          ['showPersona', 'Persona 署名'],
          ['showComments', '追记评论'],
          ['showMedia', '附带配图']
        ];
        var ratios = [['auto', '自适应长图'], ['3:4', '3:4 竖卡'], ['1:1', '1:1 方卡']];
        panel.innerHTML = '<div class="card-opt-grp">显示内容</div><div class="pick">'
          + toggles.map(function (t) {
            return '<button type="button" data-copt="' + t[0] + '"' + (opt[t[0]] ? ' class="on"' : '') + '>' + t[1] + '</button>';
          }).join('')
          + '</div><div class="card-opt-grp">比例与外观</div><div class="pick">'
          + ratios.map(function (r) {
            return '<button type="button" data-crat="' + r[0] + '"' + (opt.ratio === r[0] ? ' class="on"' : '') + '>' + r[1] + '</button>';
          }).join('')
          + '<button type="button" data-copt="frame"' + (opt.frame ? ' class="on"' : '') + '>外框阴影</button>'
          + '<button type="button" data-copt="renderMd"' + (opt.renderMd ? ' class="on"' : '') + '>Markdown 排版</button>'
          + '</div>';
        Array.prototype.forEach.call(panel.querySelectorAll('[data-copt]'), function (btn) {
          btn.onclick = function () {
            var k = btn.getAttribute('data-copt');
            S.opts.card = getCardOpts();
            S.opts.card[k] = !S.opts.card[k];
            save();
            paintOptsPanel();
            renderPreview();
          };
        });
        Array.prototype.forEach.call(panel.querySelectorAll('[data-crat]'), function (btn) {
          btn.onclick = function () {
            S.opts.card = getCardOpts();
            S.opts.card.ratio = btn.getAttribute('data-crat');
            save();
            paintOptsPanel();
            renderPreview();
          };
        });
      };
      $('ciOptToggle').onclick = function () {
        var panel = $('ciOptPanel');
        var arw = $('ciOptArrow');
        if (!panel) { return; }
        panel.hidden = !panel.hidden;
        if (arw) { arw.textContent = panel.hidden ? '▾' : '▴'; }
      };
      paintOptsPanel();
      $('ciClose').onclick = closeSheet;
      $('ciSave').onclick = function () {
        if (!generated) { return; }
        if (window.AR && AR.Bridge && AR.Bridge.saveImage) { AR.Bridge.saveImage(fname, generated); }
      };
      $('ciShare').onclick = function () {
        if (!generated) { return; }
        if (window.AR && AR.Bridge && AR.Bridge.shareImage) { AR.Bridge.shareImage(fname, generated, 'Whisper 日记卡片'); }
      };
      renderPreview();
    });
  }

  /* ── 评论抽屉与操作 ── */
  function openCommentSheet(e, editCmt) {
    var pid = editCmt ? editCmt.pid : ((S.personas[0] || {}).id || null);
    var txtVal = editCmt ? (editCmt.x || '') : '';
    function chips() {
      var ch = '<button data-cp=""' + (!pid ? ' class="on"' : '') + '>—</button>';
      S.personas.forEach(function (pp) {
        ch += '<button data-cp="' + pp.id + '"' + (pp.id === pid ? ' class="on"' : '') + '><span class="dot" style="background:' + pp.c + '"></span>' + esc(pp.n) + '</button>';
      });
      return ch;
    }
    var h = '<h3>' + (editCmt ? '编辑评论' : '写追记 / 评论') + '</h3>'
      + '<textarea id="cmText" placeholder="写下此刻的想法…">' + esc(txtVal) + '</textarea>'
      + '<div class="field">Persona</div><div class="pick" id="cmP">' + chips() + '</div>'
      + '<div class="btns"><button id="cmCancel">取消</button><button class="primary" id="cmSave">保存</button></div>';
    openSheet(h, function () {
      function bindChips() {
        Array.prototype.forEach.call($('cmP').querySelectorAll('[data-cp]'), function (b) {
          b.onclick = function () {
            pid = b.getAttribute('data-cp') || null;
            $('cmP').innerHTML = chips();
            bindChips();
          };
        });
      }
      bindChips();
      $('cmCancel').onclick = closeSheet;
      $('cmSave').onclick = function () {
        var v = ($('cmText').value || '').replace(/\s+$/, '');
        if (!v) { toast('评论不能为空'); return; }
        e.comments = Array.isArray(e.comments) ? e.comments : [];
        if (editCmt) {
          editCmt.x = v; editCmt.pid = pid; stampNow(editCmt);
        } else {
          var c = { id: uid('c'), pid: pid, at: nowAtSec(), x: v };
          stampNow(c);
          e.comments.push(c);
        }
        stampNow(e); save(); closeSheet(); renderWhisper();
        toast(editCmt ? '已更新评论' : '已添加评论');
      };
      setTimeout(function () { var t = $('cmText'); if (t) { try { t.focus(); } catch (e0) { } } }, 60);
    });
  }

  function commentActionSheet(e, c) {
    var cp = personaById(c.pid);
    var h = '<div class="acthead"><span class="dot" style="background:' + (cp.c || 'var(--w-a1)') + ';width:7px;height:7px;border-radius:50%;display:block"></span>'
      + '<div class="m"><div class="l">评论 · ' + esc(fmtDateHM(c.at)) + (cp.n ? ' · ' + esc(cp.n) : '') + '</div>'
      + '<div class="x">' + esc(c.x) + '</div></div></div>'
      + '<button class="row" data-ca="edit">编辑评论<span class="r">›</span></button>'
      + '<button class="row danger" data-ca="del">删除评论<span class="r">可撤销</span></button>';
    openSheet(h, function () {
      Array.prototype.forEach.call(sheet.querySelectorAll('[data-ca]'), function (b) {
        b.onclick = function () {
          var act = b.getAttribute('data-ca');
          if (act === 'edit') { closeSheet(); openCommentSheet(e, c); }
          else if (act === 'del') {
            var cmEid = e.id, cmCid = c.id;
            c.deletedAt = new Date().toISOString(); stampNow(c); addTombstone('comments', c.id);
            stampNow(e); save(); closeSheet(); renderWhisper();
            toastAction('已删除评论', '撤销', function () {
              var liveE = S.entries.filter(function (x) { return x && x.id === cmEid; })[0] || e;
              var liveC = (liveE.comments || []).filter(function (x) { return x && x.id === cmCid; })[0] || c;
              liveC.deletedAt = null; stampNow(liveC);
              S.tombstones = (S.tombstones || []).filter(function (tb) { return !(tb.entity === 'comments' && tb.id === cmCid); });
              stampNow(liveE); save(); renderWhisper(); toast('已恢复评论');
            });
          }
        };
      });
    });
  }

  /* ── 全屏原图查看器 ── */
  var lbState = { open: false, items: [], idx: 0 };
  function showLightbox(items, idx) {
    if (!items || !items.length) { return; }
    lbState.open = true;
    lbState.items = items;
    lbState.idx = Math.max(0, Math.min(items.length - 1, idx || 0));
    renderLightbox();
    $('whLightbox').hidden = false;
  }
  function closeLightbox() {
    lbState.open = false;
    $('whLightbox').hidden = true;
    $('lbImg').src = '';
  }
  function renderLightbox() {
    var cur = lbState.items[lbState.idx];
    $('lbTitle').textContent = (lbState.idx + 1) + ' / ' + lbState.items.length;
    $('lbPrev').style.visibility = lbState.items.length > 1 ? '' : 'hidden';
    $('lbNext').style.visibility = lbState.items.length > 1 ? '' : 'hidden';
    $('lbImg').src = '';
    if (!cur) { return; }
    loadMediaLocal(cur.id).then(function (rec) {
      if (rec && rec.dataUrl) { $('lbImg').src = rec.dataUrl; }
    });
  }
  $('lbClose').addEventListener('click', closeLightbox);
  $('lbPrev').addEventListener('click', function () {
    if (lbState.items.length < 2) { return; }
    lbState.idx = (lbState.idx - 1 + lbState.items.length) % lbState.items.length;
    renderLightbox();
  });
  $('lbNext').addEventListener('click', function () {
    if (lbState.items.length < 2) { return; }
    lbState.idx = (lbState.idx + 1) % lbState.items.length;
    renderLightbox();
  });
  $('lbSave').addEventListener('click', function () {
    var cur = lbState.items[lbState.idx];
    if (!cur) { return; }
    loadMediaLocal(cur.id).then(function (rec) {
      if (!rec || !rec.dataUrl) { toast('本机没有这张图片'); return; }
      if (window.AR && AR.Bridge && AR.Bridge.saveImage) {
        AR.Bridge.saveImage('whisper-' + cur.id + '.png', rec.dataUrl);
      }
    });
  });

  /* ── 行内操作：长按动作表 + 双击编辑 ── */
  function entryActionSheet(e) {
    var p = personaById(e.pid);
    var bk = bookById(e.bid) || bookByIdAny(e.bid);
    var cmtN = aliveCommentsOf(e).length;
    var imgN = Array.isArray(e.media) ? e.media.length : 0;
    var extraMeta = (imgN ? ' · ' + imgN + ' 图' : '') + (cmtN ? ' · ' + cmtN + ' 评论' : '');
    var h = '<div class="acthead"><span class="dot" style="background:' + p.c + ';width:7px;height:7px;border-radius:50%;display:block"></span>'
      + '<div class="m"><div class="l">' + esc(e.at.slice(0, 10)) + ' ' + fmtClockHM(e.at) + (p.n ? ' · ' + esc(p.n) : '') + extraMeta + '</div>'
      + '<div class="x">' + esc(previewText(e.x)) + '</div></div></div>'
      + '<div class="ea-grid">'
      + '<button type="button" data-ea="edit"><i>' + svgIco('edit') + '</i><span>编辑</span></button>'
      + '<button type="button" data-ea="comment"><i>' + svgIco('comment') + '</i><span>评论</span></button>'
      + '<button type="button" data-ea="image"><i>' + svgIco('image') + '</i><span>生成图片</span></button>'
      + '<button type="button" data-ea="copy"><i>' + svgIco('copy') + '</i><span>复制纯文本</span></button>'
      + '</div>'
      + '<button class="row" data-ea="persona"><span class="ico">' + svgIco('persona') + '</span>换 Persona<span class="r">' + esc(p.n || '无') + ' ›</span></button>'
      + '<button class="row" data-ea="move"><span class="ico">' + svgIco('move') + '</span>移到其他日记本<span class="r">' + esc(bk ? bk.name : '') + ' ›</span></button>'
      + '<button class="row" data-ea="retime"><span class="ico">' + svgIco('clock') + '</span>修改记录时间<span class="r">' + esc(fmtDateHM(e.at)) + ' ›</span></button>'
      + '<button class="row" data-ea="exportTxt"><span class="ico">' + svgIco('export') + '</span>导出单条纯文本 (.txt)<span class="r">›</span></button>'
      + '<button class="row danger" data-ea="delete"><span class="ico">' + svgIco('trash') + '</span>删除<span class="r">可撤销</span></button>';
    openSheet(h, function () {
      Array.prototype.forEach.call(sheet.querySelectorAll('[data-ea]'), function (b) {
        b.onclick = function () {
          var k = b.getAttribute('data-ea');
          if (k === 'edit') { closeSheet(); editEntry(e); }
          else if (k === 'comment') { closeSheet(); openCommentSheet(e); }
          else if (k === 'image') { closeSheet(); openEntryImageSheet(e); }
          else if (k === 'persona') { closeSheet(); personaForEntry(e); }
          else if (k === 'move') {
            closeSheet();
            var mh = '<h3>移到日记本</h3>';
            visibleBooks().forEach(function (ob) {
              mh += '<button class="row" data-mv="' + ob.id + '">' + esc(ob.name) + '<span class="r">' + (ob.id === e.bid ? '当前' : '›') + '</span></button>';
            });
            openSheet(mh, function () {
              Array.prototype.forEach.call(sheet.querySelectorAll('[data-mv]'), function (mb) {
                mb.onclick = function () {
                  e.bid = mb.getAttribute('data-mv'); stampNow(e); save(); closeSheet(); renderWhisper(); toast('已移动');
                };
              });
            });
          } else if (k === 'retime') {
            closeSheet();
            var dVal = String(e.at || dkey(0)).slice(0, 10);
            var tVal = String(e.at || '12:00').slice(11, 16) || '12:00';
            openSheet('<h3>修改时间</h3><input class="inp" type="date" id="rtDate" value="' + esc(dVal) + '"><input class="inp" type="time" id="rtTime" style="margin-top:8px" value="' + esc(tVal) + '"><div class="btns"><button id="rtC">取消</button><button class="primary" id="rtO">保存</button></div>', function () {
              $('rtC').onclick = closeSheet;
              $('rtO').onclick = function () {
                var nd = ($('rtDate').value || '').trim();
                var nt = ($('rtTime').value || '').trim().slice(0, 5);
                if (!nd || !nt) { toast('请填写日期与时间'); return; }
                var oldSec = String(e.at || '').slice(17, 19);
                e.at = nd + ' ' + nt + ':' + (/^\d{2}$/.test(oldSec) ? oldSec : '00');
                stampNow(e); save(); closeSheet(); renderWhisper(); toast('已修改时间');
              };
            });
          } else if (k === 'copy') {
            copyEntryPlain(e);
            closeSheet();
          } else if (k === 'exportTxt') {
            var txt2 = formatEntryPlainText(e, bk, true);
            nativeExport('whisper-' + safe(String(e.at || 'entry').slice(0, 10)) + '.txt', txt2, 'text/plain');
            closeSheet();
          } else if (k === 'delete') {
            var delEid = e.id;
            e.deletedAt = new Date().toISOString(); stampNow(e); save(); closeSheet(); renderWhisper();
            toastAction('已删除', '撤销', function () {
              var liveE = S.entries.filter(function (x) { return x && x.id === delEid; })[0] || e;
              liveE.deletedAt = null; stampNow(liveE); save(); renderWhisper(); toast('已恢复');
            });
          }
        };
      });
    });
  }

  function renderDraftMediaStrip(container, list, onRemove) {
    if (!container) { return; }
    container.innerHTML = '';
    list.forEach(function (m, idx) {
      var item = document.createElement('div');
      item.className = 'md-item';
      var img = document.createElement('img');
      item.appendChild(img);
      loadMediaLocal(m.id).then(function (rec) { if (rec && rec.dataUrl) { img.src = rec.dataUrl; } });
      var del = document.createElement('button');
      del.type = 'button'; del.className = 'md-del'; del.textContent = '×';
      del.onclick = function (ev) { ev.stopPropagation(); onRemove(idx); };
      item.appendChild(del);
      container.appendChild(item);
    });
  }

  function bindMediaPicker(btn, input, textEl, listRef, onRefresh) {
    if (btn && input) {
      btn.onclick = function () { input.click(); };
      input.onchange = function () {
        var files = input.files ? Array.prototype.slice.call(input.files) : [];
        input.value = '';
        if (!files.length) { return; }
        var room = MAX_MEDIA_PER_ENTRY - listRef.length;
        if (room <= 0) { toast('单条最多附 ' + MAX_MEDIA_PER_ENTRY + ' 张图片'); return; }
        Promise.all(files.slice(0, room).map(function (f) { return readImageFileOriginal(f); }))
          .then(function (metas) {
            metas.forEach(function (m) { listRef.push(m); });
            onRefresh();
          }, function (err) { toast((err && err.message) || '图片处理失败'); });
      };
    }
    if (textEl) {
      textEl.addEventListener('paste', function (ev) {
        var cd = ev.clipboardData || window.clipboardData;
        if (!cd || !cd.items) { return; }
        for (var i = 0; i < cd.items.length; i++) {
          var it = cd.items[i];
          if (it && it.type && it.type.indexOf('image/') === 0) {
            var file = it.getAsFile();
            if (!file) { continue; }
            if (listRef.length >= MAX_MEDIA_PER_ENTRY) { toast('单条最多附 ' + MAX_MEDIA_PER_ENTRY + ' 张图片'); break; }
            readImageFileOriginal(file).then(function (m) { listRef.push(m); onRefresh(); }, function () { });
          }
        }
      });
    }
  }

  function mdWrapSelection(ta, before, after, placeholder) {
    if (!ta) { return; }
    var v = String(ta.value || '');
    var s = typeof ta.selectionStart === 'number' ? ta.selectionStart : v.length;
    var e = typeof ta.selectionEnd === 'number' ? ta.selectionEnd : v.length;
    var sel = v.slice(s, e);
    var mid = sel || placeholder || '';
    ta.value = v.slice(0, s) + before + mid + after + v.slice(e);
    ta.focus();
    try {
      if (sel) {
        ta.setSelectionRange(s + before.length, s + before.length + sel.length);
      } else {
        var pos = s + before.length;
        ta.setSelectionRange(pos, pos + mid.length);
      }
    } catch (err) { }
  }
  function mdToggleLinePrefix(ta, prefix) {
    if (!ta) { return; }
    var v = String(ta.value || '');
    var s = typeof ta.selectionStart === 'number' ? ta.selectionStart : v.length;
    var e = typeof ta.selectionEnd === 'number' ? ta.selectionEnd : v.length;
    var lineStart = v.lastIndexOf('\n', Math.max(0, s - 1)) + 1;
    var nextNl = v.indexOf('\n', e);
    var lineEnd = nextNl < 0 ? v.length : nextNl;
    var block = v.slice(lineStart, lineEnd);
    var lines = block.split('\n');
    var allHave = lines.every(function (ln) { return ln.indexOf(prefix) === 0; });
    var updated = lines.map(function (ln) {
      return allHave ? ln.slice(prefix.length) : (prefix + ln);
    }).join('\n');
    ta.value = v.slice(0, lineStart) + updated + v.slice(lineEnd);
    ta.focus();
    try { ta.setSelectionRange(lineStart, lineStart + updated.length); } catch (err) { }
  }
  function mountMdBar(barEl, prevEl, taEl) {
    if (!barEl || !taEl) { return; }
    var mdOn = !(S && S.opts && S.opts.mdEnabled === false);
    var barOn = !(S && S.opts && S.opts.mdToolbar === false);
    if (prevEl) { prevEl.hidden = true; prevEl.innerHTML = ''; }
    taEl.hidden = false;
    if (!mdOn || !barOn) {
      barEl.hidden = true;
      barEl.innerHTML = '';
      return;
    }
    barEl.hidden = false;
    var tools = [
      { k: 'b', label: 'B', title: '加粗', wrap: ['**', '**', '加粗文字'] },
      { k: 'i', label: 'I', title: '斜体', wrap: ['*', '*', '斜体'] },
      { k: 's', label: 'S', title: '删除线', wrap: ['~~', '~~', '删除'] },
      { k: 'hl', label: '==', title: '高亮', wrap: ['==', '==', '高亮'] },
      { k: 'code', label: '<>', title: '行内代码', wrap: ['`', '`', 'code'] },
      { k: 'h', label: 'H', title: '标题', prefix: '## ' },
      { k: 'q', label: '>', title: '引用', prefix: '> ' },
      { k: 'ul', label: '•', title: '列表', prefix: '- ' },
      { k: 'ol', label: '1.', title: '有序列表', prefix: '1. ' },
      { k: 'hr', label: '—', title: '分割线', hr: true }
    ];
    barEl.innerHTML = tools.map(function (t) {
      return '<button type="button" data-mdk="' + t.k + '" title="' + esc(t.title) + '">' + esc(t.label) + '</button>';
    }).join('') + '<button type="button" class="md-prev-btn" data-mdk="preview">预览</button>';

    var prevBtn = barEl.querySelector('[data-mdk="preview"]');
    var exitPrev = function () {
      if (prevEl && !prevEl.hidden) {
        prevEl.hidden = true;
        taEl.hidden = false;
        if (prevBtn) { prevBtn.classList.remove('on'); prevBtn.textContent = '预览'; }
      }
    };
    Array.prototype.forEach.call(barEl.querySelectorAll('button'), function (btn) {
      btn.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
      btn.onclick = function () {
        var k = btn.getAttribute('data-mdk');
        if (k === 'preview') {
          if (!prevEl) { return; }
          if (prevEl.hidden) {
            var html = renderMarkdownHTML(taEl.value || '');
            prevEl.innerHTML = html || '<p style="color:var(--w-mid)">暂无内容</p>';
            taEl.hidden = true;
            prevEl.hidden = false;
            btn.classList.add('on');
            btn.textContent = '编辑';
          } else {
            exitPrev();
            taEl.focus();
          }
          return;
        }
        exitPrev();
        if (k === 'hr') {
          var v = String(taEl.value || '');
          var s = typeof taEl.selectionStart === 'number' ? taEl.selectionStart : v.length;
          var e = typeof taEl.selectionEnd === 'number' ? taEl.selectionEnd : v.length;
          var pre = (s > 0 && v.charAt(s - 1) !== '\n') ? '\n' : '';
          var post = (e < v.length && v.charAt(e) !== '\n') ? '\n' : '';
          var ins = pre + '---\n' + post;
          taEl.value = v.slice(0, s) + ins + v.slice(e);
          taEl.focus();
          try { taEl.setSelectionRange(s + ins.length, s + ins.length); } catch (err) { }
          return;
        }
        for (var ti = 0; ti < tools.length; ti++) {
          if (tools[ti].k === k) {
            if (tools[ti].wrap) { mdWrapSelection(taEl, tools[ti].wrap[0], tools[ti].wrap[1], tools[ti].wrap[2]); }
            else if (tools[ti].prefix) { mdToggleLinePrefix(taEl, tools[ti].prefix); }
            break;
          }
        }
      };
    });
  }

  function runEntryDoubleTap(ent) {
    if (!ent) { return; }
    var act = (S && S.opts && S.opts.dblTapAction) || 'edit';
    if (act === 'off') { return; }
    if (act === 'comment') { openCommentSheet(ent); return; }
    if (act === 'copy') { copyEntryPlain(ent); return; }
    if (act === 'menu') { entryActionSheet(ent); return; }
    editEntry(ent);
  }

  function editEntry(e) {
    var edMedia = Array.isArray(e.media) ? e.media.slice() : [];
    var h = '<h3>编辑</h3><textarea id="edText">' + esc(e.x) + '</textarea>'
      + '<div class="md-preview md-body" id="edMdPrev" hidden></div>'
      + '<div class="md-bar" id="edMdBar"></div>'
      + '<div class="media-bar"><button class="media-pick" type="button" id="edImgBtn">' + svgIco('image') + '<span>添加图片</span></button><input type="file" id="edImgIn" accept="image/*" multiple style="display:none"></div>'
      + '<div class="media-draft" id="edMediaList"></div>'
      + '<div class="btns"><button id="edCancel">取消</button><button class="primary" id="edSave">保存</button></div>';
    openSheet(h, function () {
      function paintEdMedia() {
        renderDraftMediaStrip($('edMediaList'), edMedia, function (idx) {
          var removed = edMedia.splice(idx, 1)[0];
          if (removed && removed.id) { addTombstone('media', removed.id); }
          paintEdMedia();
        });
      }
      mountMdBar($('edMdBar'), $('edMdPrev'), $('edText'));
      paintEdMedia();
      bindMediaPicker($('edImgBtn'), $('edImgIn'), $('edText'), edMedia, paintEdMedia);
      $('edCancel').onclick = closeSheet;
      $('edSave').onclick = function () {
        var v = ($('edText').value || '').replace(/\s+$/, '');
        if (!v && !edMedia.length) { toast('不能为空'); return; }
        e.x = v || '[图片]';
        e.media = edMedia.length ? edMedia : [];
        stampNow(e); save(); closeSheet(); renderWhisper(); toast('已保存');
      };
    });
  }
  function personaForEntry(e) {
    var h = '<h3>换 Persona</h3><div class="pick" style="margin-top:0">';
    S.personas.forEach(function (p) { h += '<button data-ep="' + p.id + '"' + (p.id === e.pid ? ' class="on"' : '') + '><span class="dot" style="background:' + p.c + '"></span>' + esc(p.n) + '</button>'; });
    h += '</div>';
    openSheet(h, function () {
      Array.prototype.forEach.call(sheet.querySelectorAll('[data-ep]'), function (b) {
        b.onclick = function () { e.pid = b.getAttribute('data-ep'); stampNow(e); save(); closeSheet(); renderWhisper(); toast('已换 Persona'); };
      });
    });
  }
  (function () {
    var body = $('wBody'), timer = null, lp = null, sx = 0, sy = 0, lpFired = false, lastEditAt = 0;
    var downTap = { id: '', x: 0, y: 0, moved: false, type: '' };
    var lastTap = { t: 0, x: 0, y: 0, id: '' };
    function triggerDblOnce(ent) {
      if (!ent) { return; }
      var now = Date.now();
      if (now - lastEditAt < 350) { return; }
      lastEditAt = now;
      runEntryDoubleTap(ent);
    }
    body.addEventListener('click', function (e) {
      var thumb = e.target.closest('.m-thumb[data-mid]');
      if (thumb) {
        e.stopPropagation();
        var eid = thumb.getAttribute('data-eid');
        var mid = thumb.getAttribute('data-mid');
        var idx = Number(thumb.getAttribute('data-idx')) || 0;
        var ent = S.entries.filter(function (x) { return x.id === eid; })[0];
        if (!ent || !Array.isArray(ent.media)) { return; }
        loadMediaLocal(mid).then(function (rec) {
          if (rec && rec.dataUrl) { showLightbox(ent.media, idx); return; }
          if (mediaSyncReady()) {
            var ms = thumb.querySelector('.m-miss');
            if (ms) { ms.textContent = '正在拉取云端配图…'; }
            toast('正在拉取云端配图…');
            pullMediaFromCloud(mid).then(function (res) {
              if (res && res.ok) { showLightbox(ent.media, idx); }
              else if (res && res.reason === 'error') { toast('拉取图片失败：' + (res.message || '网络异常')); }
              else { toast('云端暂无此图片'); }
            });
          } else {
            toast('本机无此图，且当前未开启图片同步');
          }
        });
        return;
      }
      var addCmt = e.target.closest('[data-addcmt]');
      if (addCmt) {
        e.stopPropagation();
        var entA = S.entries.filter(function (x) { return x.id === addCmt.getAttribute('data-addcmt'); })[0];
        if (entA) { openCommentSheet(entA); }
        return;
      }
      var cmt = e.target.closest('.cmt-item[data-cid]');
      if (cmt) {
        e.stopPropagation();
        var entC = S.entries.filter(function (x) { return x.id === cmt.getAttribute('data-eid'); })[0];
        var cObj = entC && Array.isArray(entC.comments) ? entC.comments.filter(function (x) { return x.id === cmt.getAttribute('data-cid'); })[0] : null;
        if (entC && cObj) { commentActionSheet(entC, cObj); }
      }
    });
    body.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.m-thumb, .cmt-item, .cmt-add')) { downTap.id = ''; return; }
      var row = e.target.closest('.entry');
      if (!row) { downTap.id = ''; return; }
      sx = e.clientX; sy = e.clientY;
      lpFired = false;
      lp = row.getAttribute('data-eid');
      downTap = { id: lp, x: e.clientX, y: e.clientY, moved: false, type: e.pointerType || '' };
      timer = setTimeout(function () {
        timer = null; lpFired = true; downTap.id = '';
        var ent = S.entries.filter(function (x) { return x.id === lp; })[0];
        if (ent) { entryActionSheet(ent); }
      }, 520);
    });
    body.addEventListener('pointermove', function (e) {
      if (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8) {
        downTap.moved = true;
        if (timer) { clearTimeout(timer); timer = null; }
      }
    });
    body.addEventListener('pointerup', function (e) {
      if (timer) { clearTimeout(timer); timer = null; }
      if (lpFired) { lpFired = false; downTap.id = ''; return; }
      if (e.pointerType !== 'mouse' && downTap.id && !downTap.moved) {
        var now = Date.now();
        var curId = downTap.id;
        downTap.id = '';
        if (lastTap.id === curId && (now - lastTap.t) < 380 && Math.abs(e.clientX - lastTap.x) < 28 && Math.abs(e.clientY - lastTap.y) < 28) {
          lastTap = { t: 0, x: 0, y: 0, id: '' };
          var ent2 = S.entries.filter(function (x) { return x.id === curId; })[0];
          if (ent2) { setTimeout(function () { triggerDblOnce(ent2); }, 0); }
          return;
        }
        lastTap = { t: now, x: e.clientX, y: e.clientY, id: curId };
        return;
      }
      downTap.id = '';
    });
    body.addEventListener('pointercancel', function () {
      if (timer) { clearTimeout(timer); timer = null; }
      downTap.id = '';
    });
    body.addEventListener('dblclick', function (e) {
      if (e.target.closest('.m-thumb, .cmt-item, .cmt-add')) { return; }
      var row = e.target.closest('.entry');
      if (!row || lpFired) { return; }
      e.preventDefault();
      e.stopPropagation();
      try { var sel = window.getSelection(); if (sel) { sel.removeAllRanges(); } } catch (err) { }
      var ent = S.entries.filter(function (x) { return x.id === row.getAttribute('data-eid'); })[0];
      triggerDblOnce(ent);
    });
  })();

  /* ── 阅读页顶栏双击返回顶部 ── */
  (function () {
    var bar = null;
    if (!bar) { return; }
    var lastTopTap = { t: 0, x: 0, y: 0 }, downTop = { ok: false, x: 0, y: 0, moved: false }, lastScrollAt = 0;
    var goTop = function () {
      var now = Date.now();
      if (now - lastScrollAt < 350) { return; }
      lastScrollAt = now;
      var wb = $('wBody');
      if (!wb) { return; }
      try { wb.scrollTo({ top: 0, behavior: 'smooth' }); }
      catch (e0) { wb.scrollTop = 0; }
    };
    bar.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button')) { downTop.ok = false; return; }
      downTop = { ok: e.pointerType !== 'mouse', x: e.clientX, y: e.clientY, moved: false };
    });
    bar.addEventListener('pointermove', function (e) {
      if (downTop.ok && (Math.abs(e.clientX - downTop.x) > 10 || Math.abs(e.clientY - downTop.y) > 10)) { downTop.moved = true; }
    });
    bar.addEventListener('pointerup', function (e) {
      if (!downTop.ok || downTop.moved || e.target.closest('button')) { downTop.ok = false; return; }
      downTop.ok = false;
      var now = Date.now();
      if (now - lastTopTap.t < 380 && Math.abs(e.clientX - lastTopTap.x) < 28 && Math.abs(e.clientY - lastTopTap.y) < 28) {
        lastTopTap = { t: 0, x: 0, y: 0 };
        setTimeout(goTop, 0);
        return;
      }
      lastTopTap = { t: now, x: e.clientX, y: e.clientY };
    });
    bar.addEventListener('pointercancel', function () { downTop.ok = false; });
    bar.addEventListener('dblclick', function (e) {
      if (e.target.closest('button')) { return; }
      e.preventDefault();
      try { var sel = window.getSelection(); if (sel) { sel.removeAllRanges(); } } catch (err) { }
      goTop();
    });
  })();

  /* ── 搜索 ── */
  var search = { scope: 'book', q: '' };
  function openSearch() {
    search.q = ''; $('srInput').value = ''; $('srSub').textContent = search.scope === 'book' ? '当前本' : '全部本';
    renderSearch(); show('search');
    setTimeout(function () { $('srInput').focus(); }, 60);
  }
  function allEntriesFor(scope) {
    if (scope === 'book') {
      var curB = bookById(S.last.bid);
      var b = (curB && isBookVisible(curB)) ? curB : visibleBooks()[0];
      if (!b) { return []; }
      return entriesOf(b.id).map(function (e) { return { e: e, b: b }; });
    }
    var out = [];
    visibleBooks().forEach(function (b) { entriesOf(b.id).forEach(function (e) { out.push({ e: e, b: b }); }); });
    return out;
  }
  function renderSearch() {
    var q = search.q.trim().toLowerCase();
    var body = $('srBody');
    if (!q) { body.innerHTML = '<p style="font-size:11.5px;color:var(--w-mid)">搜索</p>'; return; }
    var rows = allEntriesFor(search.scope).filter(function (x) {
      var rawS = String(x.e.x || '');
      var cleanS = previewText(rawS);
      return (x.b.name + ' ' + rawS + ' ' + cleanS).toLowerCase().indexOf(q) >= 0;
    });
    if (!rows.length) { body.innerHTML = '<p style="font-size:11.5px;color:var(--w-mid)">没找到「' + esc(search.q) + '」。</p>'; return; }
    var h = '', lastB = '';
    rows.slice(0, 60).forEach(function (x) {
      if (x.b.id !== lastB) { lastB = x.b.id; h += '<div class="bg">' + esc(x.b.name) + '</div>'; }
      var text = previewText(x.e.x);
      var idx = text.toLowerCase().indexOf(q);
      var start = idx >= 0 ? Math.max(0, idx - 16) : 0;
      var pre = text.slice(start, start + 70);
      var hl;
      if (idx < 0) {
        hl = esc(pre);
      } else {
        var rel = idx - start;
        hl = esc(pre.slice(0, rel)) + '<mark>' + esc(pre.slice(rel, rel + q.length)) + '</mark>' + esc(pre.slice(rel + q.length));
      }
      h += '<button class="r" data-sr="' + x.e.id + '" data-sb="' + x.b.id + '">' + (start ? '…' : '') + hl
        + '<div class="meta">' + x.e.at.slice(0, 10) + ' · ' + fmtClockHM(x.e.at) + ' · ' + esc(personaById(x.e.pid).n) + '</div></button>';
    });
    body.innerHTML = h;
    Array.prototype.forEach.call(body.querySelectorAll('[data-sr]'), function (b) {
      b.onclick = function () {
        var bid = b.getAttribute('data-sb'), eid = b.getAttribute('data-sr');
        S.last = { view: 'read', bid: bid }; save(); renderWhisper(); show('whisper');
        var row = $('wBody').querySelector('[data-eid="' + eid + '"]');
        if (row) { row.scrollIntoView({ block: 'center' }); try { $('whRoot').scrollLeft = 0; $('whRoot').scrollTop = 0; } catch (e2) { } row.classList.add('hl'); setTimeout(function () { row.classList.remove('hl'); }, 1400); }
      };
    });
  }
  $('srBack').addEventListener('click', function () { show(S.last.view === 'read' ? 'whisper' : 'shelf'); });
  $('srInput').addEventListener('input', function () { search.q = $('srInput').value; renderSearch(); });
  $('srClear').addEventListener('click', function () { $('srInput').value = ''; search.q = ''; renderSearch(); });
  $('srScope').addEventListener('click', function () {
    search.scope = search.scope === 'book' ? 'all' : 'book';
    $('srSub').textContent = search.scope === 'book' ? '当前本' : '全部本';
    $('srScope').textContent = search.scope === 'book' ? '当前本' : '全部本';
    renderSearch();
  });

  /* ── 回顾：片刻 + 随机漫步 ── */
  function globalHeatSize() {
    try {
      var ap = (window.AR && AR.Store && AR.Store.get) ? ((AR.Store.get().settings || {}).appearance || null) : null;
      if (ap && ap.heatSize) { return ap.heatSize === 'lg' ? 'lg' : 'sm'; }
    } catch (e0) { }
    try {
      var st = JSON.parse(localStorage.getItem('abbeyroad.state.v1') || '{}');
      return (st.settings && st.settings.appearance && st.settings.appearance.heatSize) === 'lg' ? 'lg' : 'sm';
    } catch (e) { return 'sm'; }
  }
  function heatCard(mine) {
    var byDay = {};
    mine.forEach(function (x) { var k = x.e.at.slice(0, 10); byDay[k] = (byDay[k] || 0) + 1; });
    var accent = S.theme.accent.a2;
    var today = new Date();
    var heatSize = globalHeatSize();
    var weeks = heatSize === 'lg' ? 39 : 26;
    var end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var start = new Date(end); start.setDate(start.getDate() - (weeks * 7 - 1));
    while (start.getDay() !== 1) { start.setDate(start.getDate() - 1); }
    var cols = [], cur = new Date(start);
    while (cur <= end) {
      var col = [];
      for (var d = 0; d < 7; d++) {
        var k = cur.getFullYear() + '-' + p2(cur.getMonth() + 1) + '-' + p2(cur.getDate());
        col.push({ k: k, n: byDay[k] || 0, future: cur > end, today: k === (today.getFullYear() + '-' + p2(today.getMonth() + 1) + '-' + p2(today.getDate())) });
        cur.setDate(cur.getDate() + 1);
      }
      cols.push(col);
    }
    var h = '<div class="card"><div class="k">最近 ' + weeks + ' 周</div><div class="heat"><div class="grid">';
    cols.forEach(function (col) {
      h += '<div class="col">';
      col.forEach(function (c) {
        if (c.future) {
          h += '<span class="c" style="visibility:hidden"></span>';
          return;
        }
        var lv = c.n === 0 ? 0 : (c.n <= 1 ? 1 : (c.n <= 3 ? 2 : (c.n <= 5 ? 3 : 4)));
        var bg = lv === 0 ? 'var(--w-subtle)' : hexToRgba(accent, [0, .22, .42, .66, .95][lv]);
        h += '<span class="c' + (c.today ? ' today' : '') + '" data-hd="' + c.k + '" style="background:' + bg + '"></span>';
      });
      h += '</div>';
    });
    h += '</div><div class="legend">少 <span class="c" style="width:9px;height:9px"></span><span class="c" style="width:9px;height:9px;background:' + hexToRgba(accent, .42) + '"></span><span class="c" style="width:9px;height:9px;background:' + hexToRgba(accent, .95) + '"></span> 多</div></div></div>';
    return h;
  }
  function openRecall() { renderRecall(); show('recall'); }
  function renderRecall() {
    var today = new Date();
    var md = '-' + p2(today.getMonth() + 1) + '-' + p2(today.getDate());
    var mine = [];
    visibleBooks().forEach(function (b) { entriesOf(b.id).forEach(function (e) { mine.push({ e: e, b: b }); }); });
    var same = mine.filter(function (x) { return x.e.at.slice(4, 10) === md && Number(x.e.at.slice(0, 4)) < today.getFullYear(); });
    same.sort(function (a, b) {
      var ka = normAtSortKey(a.e.at), kb = normAtSortKey(b.e.at);
      return ka === kb ? 0 : (ka < kb ? 1 : -1);
    });
    var h = '';
    h += heatCard(mine);
    /* 统计：条数 / 写了多少天 / 当前连续 / 最常写时段 + Persona 分布 */
    var daysSet = {}, hours = {}, pCount = {}, total = 0;
    mine.forEach(function (x) {
      total++;
      daysSet[x.e.at.slice(0, 10)] = 1;
      var hh = Number(x.e.at.slice(11, 13));
      if (!isNaN(hh)) { hours[hh] = (hours[hh] || 0) + 1; }
      pCount[x.e.pid] = (pCount[x.e.pid] || 0) + 1;
    });
    var dayList = Object.keys(daysSet).sort();
    var streak = 0, cursor = new Date();
    for (var si = 0; si < 400; si++) {
      var k2 = cursor.getFullYear() + '-' + p2(cursor.getMonth() + 1) + '-' + p2(cursor.getDate());
      if (daysSet[k2]) { streak++; cursor.setDate(cursor.getDate() - 1); }
      else if (si === 0) { cursor.setDate(cursor.getDate() - 1); }
      else { break; }
    }
    var peakH = '', peakN = 0;
    Object.keys(hours).forEach(function (k3) { if (hours[k3] > peakN) { peakN = hours[k3]; peakH = k3; } });
    h += '<div class="stats4">'
      + '<div class="s"><div class="k">总条数</div><div class="v">' + total + '<i>条</i></div></div>'
      + '<div class="s"><div class="k">写了多少天</div><div class="v">' + dayList.length + '<i>天</i></div></div>'
      + '<div class="s"><div class="k">当前连续</div><div class="v">' + streak + '<i>天</i></div></div>'
      + '<div class="s"><div class="k">最常写</div><div class="v">' + (peakH === '' ? '—' : (peakH + ':00')) + '</div></div>'
      + '</div>';
    var ps = S.personas.map(function (p) { return { p: p, n: pCount[p.id] || 0 }; }).sort(function (a, b) { return b.n - a.n; });
    var mxP = 1;
    ps.forEach(function (x) { if (x.n > mxP) { mxP = x.n; } });
    if (ps.length) {
      h += '<div class="card"><div class="k">Persona 分布</div><div class="pdist">';
      ps.forEach(function (x) {
        h += '<div class="p"><span class="n">' + esc(x.p.n) + '</span><span class="t"><i style="width:' + Math.round(x.n / mxP * 100) + '%;background:' + x.p.c + '"></i></span><span class="c">' + x.n + '</span></div>';
      });
      h += '</div></div>';
    }
    h += '<div class="card"><div class="k">片刻 · ' + (today.getMonth() + 1) + ' 月 ' + today.getDate() + ' 日</div>';
    if (!same.length) {
      h += '<div class="x" style="color:var(--w-mid)">暂无</div>';
    } else {
      var s0 = same[0];
      h += '<div class="d">' + esc(s0.b.name) + ' · ' + s0.e.at.slice(0, 7) + '</div>';
      h += '<div class="x">' + esc(previewText(s0.e.x)) + '</div>';
      h += '<div class="s"><span class="dot" style="background:' + personaById(s0.e.pid).c + '"></span>' + esc(personaById(s0.e.pid).n) + ' · ' + fmtClockHM(s0.e.at) + '</div>';
      h += '<button class="btnline" id="rcOpen" style="margin-top:10px">打开那天</button>';
    }
    h += '</div>';
    if (same.length > 1) {
      h += '<div class="card"><div class="k">更早的同一天</div>';
      same.slice(1, 6).forEach(function (x) {
        h += '<div class="x" style="border-top:1px solid var(--w-subtle);padding-top:8px;margin-top:8px">'
          + '<div style="font-size:10.5px;color:var(--w-mid)">' + x.e.at.slice(0, 10) + ' · ' + esc(x.b.name) + '</div>'
          + esc(previewText(x.e.x)) + '</div>';
      });
      h += '</div>';
    }
    h += '<div class="card"><div class="k">随机漫步</div>'
      + '<div style="color:var(--w-mid);font-size:12px;margin-top:6px">' + (mine.length ? '从全部日记里随机翻到一条' : '暂无') + '</div>'
      + '<button class="btnline" id="rcRandom" style="margin-top:10px">抽一条</button></div>';
    h += '<div class="card"><div class="k">最近写的</div>';
    mine.sort(function (a, b) {
      var ka = normAtSortKey(a.e.at), kb = normAtSortKey(b.e.at);
      return ka === kb ? 0 : (ka < kb ? 1 : -1);
    }).slice(0, 4).forEach(function (x) {
      h += '<div class="x" style="border-top:1px solid var(--w-subtle);padding-top:8px;margin-top:8px">'
        + '<div style="font-size:10.5px;color:var(--w-mid)">' + x.e.at.slice(0, 10) + ' · ' + esc(x.b.name) + '</div>'
        + esc(previewText(x.e.x)) + '</div>';
    });
    h += '</div>';
    $('rcBody').innerHTML = h;
    if ($('rcOpen')) {
      $('rcOpen').onclick = function () { var s1 = same[0]; S.last = { view: 'read', bid: s1.b.id }; save(); renderWhisper(); show('whisper'); };
    }
    $('rcRandom').onclick = function () {
      if (!mine.length) { toast('还没有日记'); return; }
      var pick = mine[Math.floor(Math.random() * mine.length)];
      S.last = { view: 'read', bid: pick.b.id }; save(); renderWhisper(); show('whisper');
      var row = $('wBody').querySelector('[data-eid="' + pick.e.id + '"]');
      if (row) { row.scrollIntoView({ block: 'center' }); try { $('whRoot').scrollLeft = 0; $('whRoot').scrollTop = 0; } catch (e2) { } row.classList.add('hl'); setTimeout(function () { row.classList.remove('hl'); }, 1400); }
      toast('随机漫步：' + pick.e.at.slice(0, 10));
    };
  }
  $('rcBack').addEventListener('click', function () { show(S.last.view === 'read' ? 'whisper' : 'shelf'); });
  $('rcBody').addEventListener('click', function (e) {
    var c = e.target.closest('[data-hd]');
    if (!c) { return; }
    var day = c.getAttribute('data-hd');
    if (!day) { return; }
    var hit = null;
    visibleBooks().forEach(function (b) { entriesOf(b.id).forEach(function (en) { if (!hit && en.at.slice(0, 10) === day) { hit = { b: b, e: en }; } }); });
    if (!hit) { return; }
    S.last = { view: 'read', bid: hit.b.id }; save(); renderWhisper(); show('whisper');
    var row = $('wBody').querySelector('[data-eid="' + hit.e.id + '"]');
    if (row) { row.scrollIntoView({ block: 'center' }); row.classList.add('hl'); setTimeout(function () { row.classList.remove('hl'); }, 1400); }
    try { $('whRoot').scrollLeft = 0; $('whRoot').scrollTop = 0; } catch (err) { }
  });

  /* ── 回收站 ── */
  var trashReturnTo = '';
  function openTrash(returnTo) {
    trashReturnTo = returnTo || (currentScreen() === 'whisper' ? 'whisper' : 'shelf');
    renderTrash();
    show('trash');
  }
  function renderTrash() {
    var es = deletedEntries(), bs = deletedBooks();
    $('trSub').textContent = (es.length + bs.length) + ' 项';
    var h = '';
    h += '<div class="sec">日记条目 · ' + es.length + '</div>';
    if (!es.length) { h += '<div class="empty">没有待清理的条目</div>'; }
    es.forEach(function (e) {
      var b = null;
      for (var i = 0; i < S.books.length; i++) { if (S.books[i].id === e.bid) { b = S.books[i]; } }
      h += '<div class="trow"><div class="m"><div class="l">' + e.at.slice(0, 10) + ' · ' + esc(personaById(e.pid).n) + (b ? ' · ' + esc(b.name) : '') + '</div>'
        + '<div class="x">' + esc(previewText(e.x)) + '</div></div><div class="acts">'
        + '<button data-re="' + e.id + '">恢复</button><button class="del" data-de="' + e.id + '">彻底删除</button></div></div>';
    });
    h += '<div class="sec">日记本 · ' + bs.length + '</div>';
    if (!bs.length) { h += '<div class="empty">没有待清理的日记本</div>'; }
    bs.forEach(function (b) {
      h += '<div class="trow"><div class="m"><div class="l">' + entriesOf(b.id).length + ' 条 · 已删除</div>'
        + '<div class="x">' + esc(b.name) + '</div></div><div class="acts">'
        + '<button data-rb="' + b.id + '">恢复</button><button class="del" data-db="' + b.id + '">彻底删除</button></div></div>';
    });
    $('trBody').innerHTML = h;
    Array.prototype.forEach.call($('trBody').querySelectorAll('[data-re]'), function (btn) {
      btn.onclick = function () { var id = btn.getAttribute('data-re'); S.entries.forEach(function (e) { if (e.id === id) { e.deletedAt = null; stampNow(e); } }); save(); renderTrash(); toast('已恢复'); };
    });
    Array.prototype.forEach.call($('trBody').querySelectorAll('[data-de]'), function (btn) {
      btn.onclick = function () { var id = btn.getAttribute('data-de'); addTombstone('entries', id); S.entries = S.entries.filter(function (e) { return e.id !== id; }); save(); renderTrash(); toast('已彻底删除'); };
    });
    Array.prototype.forEach.call($('trBody').querySelectorAll('[data-rb]'), function (btn) {
      btn.onclick = function () { var id = btn.getAttribute('data-rb'); S.books.forEach(function (b) { if (b.id === id) { b.deletedAt = null; stampNow(b); } }); save(); renderTrash(); toast('已恢复'); };
    });
    Array.prototype.forEach.call($('trBody').querySelectorAll('[data-db]'), function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-db');
        addTombstone('books', id);
        S.entries.forEach(function (e) { if (e.bid === id) { addTombstone('entries', e.id); } });
        S.books = S.books.filter(function (b) { return b.id !== id; });
        S.entries = S.entries.filter(function (e) { return e.bid !== id; });
        save(); renderTrash(); toast('已彻底删除');
      };
    });
  }
  $('trBack').addEventListener('click', function () {
    var ret = trashReturnTo;
    trashReturnTo = '';
    if (ret === 'close') { closeRoot(); return; }
    if (ret === 'whisper') {
      var curB = bookById(S.last.bid);
      if (curB && isBookVisible(curB)) { renderWhisper(); show('whisper'); return; }
    }
    renderShelf();
    show('shelf');
  });
  $('trClear').addEventListener('click', function () {
    if (!deletedEntries().length && !deletedBooks().length) { toast('回收站是空的'); return; }
    openSheet('<h3>清空回收站？</h3><div class="btns"><button id="tcc">取消</button><button class="primary" id="tco" style="background:var(--w-a1)">清空</button></div>', function () {
      $('tcc').onclick = closeSheet;
      $('tco').onclick = function () {
        var deadB = {};
        S.books.forEach(function (b) { if (b.deletedAt) { deadB[b.id] = 1; addTombstone('books', b.id); } });
        S.entries.forEach(function (e) { if (e.deletedAt || deadB[e.bid]) { addTombstone('entries', e.id); } });
        S.books = S.books.filter(function (b) { return !b.deletedAt; });
        S.entries = S.entries.filter(function (e) { return !e.deletedAt && !deadB[e.bid]; });
        save(); closeSheet(); renderTrash(); toast('回收站已清空');
      };
    });
  });

  /* ── 下拉即写（在顶部的下拉） ── */
  (function () {
    var body = $('wBody'), hint = $('pullHint');
    var st = { on: false, x0: 0, y0: 0, dy: 0, active: false };
    function setPull(dy) {
      st.dy = dy;
      var tb = document.querySelector('#s-whisper .topbar');
      if (tb) { hint.style.top = Math.round(tb.getBoundingClientRect().height) + 'px'; }
      var k = Math.min(96, dy * 0.55);
      var inner = body.querySelector('.inner') || body;
      if (inner === body) { body.classList.add('pulling'); body.style.transform = 'translateY(' + k + 'px)'; }
      else { body.classList.add('pulling'); inner.style.transform = 'translateY(' + k + 'px)'; }
      hint.classList.add('on');
      hint.textContent = dy > 72 ? '松手写一条' : '下拉写一条';
    }
    function resetPull() {
      var inner = body.querySelector('.inner') || body;
      body.classList.remove('pulling');
      if (inner === body) { body.style.transition = 'transform .18s ease-out'; body.style.transform = ''; }
      else { inner.style.transition = 'transform .18s ease-out'; inner.style.transform = ''; }
      setTimeout(function () {
        if (!st.active) {
          if (inner === body) { body.style.transition = ''; }
          else { inner.style.transition = ''; }
        }
      }, 200);
      hint.classList.remove('on');
      st.dy = 0; st.active = false;
    }
    function canPull() { return body.scrollTop <= 0; }
    body.addEventListener('touchstart', function (e) {
      if (!canPull() || tocState.open) { return; }
      st.on = true; st.x0 = e.touches[0].clientX; st.y0 = e.touches[0].clientY; st.dy = 0;
    }, { passive: true });
    body.addEventListener('touchmove', function (e) {
      if (!st.on) { return; }
      var dy = e.touches[0].clientY - st.y0;
      var dx = e.touches[0].clientX - st.x0;
      if (dy <= 0 || !canPull()) { if (st.active) { resetPull(); } st.on = false; return; }
      if (!st.active) {
        /* 必须是明确的纵向下拉，横向滑动（调目录）不触发，避免页面被带动 */
        if (dy < 12 || Math.abs(dy) < Math.abs(dx) * 1.2) { if (Math.abs(dx) > 24) { st.on = false; } return; }
        st.active = true;
      }
      if (e.cancelable) { e.preventDefault(); }
      setPull(dy);
    }, { passive: false });
    body.addEventListener('touchend', function () {
      if (!st.on) { return; }
      st.on = false;
      if (st.dy > 72) { resetPull(); openComposer(); } else { resetPull(); }
    });
    /* 桌面/鼠标也能试出来 */
    body.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') { return; }
      if (!canPull() || tocState.open) { return; }
      st.on = true; st.x0 = e.clientX; st.y0 = e.clientY; st.dy = 0;
    });
    body.addEventListener('pointermove', function (e) {
      if (!st.on || e.pointerType === 'touch') { return; }
      var dy = e.clientY - st.y0;
      var dx = e.clientX - st.x0;
      if (!st.active) {
        if (dy < 12 || Math.abs(dy) < Math.abs(dx) * 1.2) { if (Math.abs(dx) > 24) { st.on = false; } return; }
        st.active = true;
      }
      setPull(dy);
    });
    body.addEventListener('pointerup', function (e) {
      if (!st.on || e.pointerType === 'touch') { return; }
      st.on = false;
      if (st.dy > 72) { resetPull(); openComposer(); } else if (st.active) { resetPull(); }
    });
  })();

  /* ── 热力图尺寸同步（跟随主应用外观设置） ── */
  function applyAppHeat() {
    if (!S) { return; }
    var st = $('whRoot');
    if (st) { st.setAttribute('data-heat', globalHeatSize()); }
  }

  /* ── 事件 ── */
  $('shBack').addEventListener('click', function () { closeRoot(); });
  $('wBack').addEventListener('click', function () { S.last.view = 'shelf'; save(); renderShelf(); show('shelf'); });
  /* 长按书架顶部「Whisper」标题：验证 PIN/生物识别显现私密日记本；已显现则再次隐藏 */
  (function () {
    var titleEl = $('shTitle');
    if (!titleEl) { return; }
    var st = { t: null, x: 0, y: 0 };
    function cancel() { if (st.t) { clearTimeout(st.t); st.t = null; } }
    titleEl.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) { return; }
      cancel(); st.x = e.clientX; st.y = e.clientY;
      st.t = setTimeout(function () {
        st.t = null;
        if (session.secretUnlocked) { hideSecretMode(); }
        else { openSecretUnlock(); }
      }, 520);
    });
    titleEl.addEventListener('pointermove', function (e) {
      if (st.t && (Math.abs(e.clientX - st.x) > 10 || Math.abs(e.clientY - st.y) > 10)) { cancel(); }
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { titleEl.addEventListener(ev, cancel); });
  })();
  var shelfHold = { t: null, x: 0, y: 0, bid: '' };
  $('shelfList').addEventListener('pointerdown', function (e) {
    var b = e.target.closest('.book'); if (!b) { return; }
    shelfHold.x = e.clientX; shelfHold.y = e.clientY; shelfHold.bid = b.getAttribute('data-bid');
    clearTimeout(shelfHold.t);
    shelfHold.t = setTimeout(function () { shelfHold.t = null; bookActionSheet(bookById(shelfHold.bid)); }, 520);
  });
  $('shelfList').addEventListener('pointermove', function (e) {
    if (shelfHold.t && (Math.abs(e.clientX - shelfHold.x) > 8 || Math.abs(e.clientY - shelfHold.y) > 8)) { clearTimeout(shelfHold.t); shelfHold.t = null; }
  });
  ['pointerup', 'pointercancel'].forEach(function (evt) { $('shelfList').addEventListener(evt, function () { if (shelfHold.t) { clearTimeout(shelfHold.t); shelfHold.t = null; } }); });
  $('shelfList').addEventListener('click', function (e) {
    var b = e.target.closest('.book'); if (!b) { return; }
    var bk = bookById(b.getAttribute('data-bid'));
    if (bk && bk.archived) { bk.archived = false; stampNow(bk); save(); renderShelf(); toast('已还原'); return; }
    S.last = { view: 'read', bid: b.getAttribute('data-bid') }; save(); renderWhisper(); show('whisper'); playEnterFx();
  });
  function bookActionSheet(b) {
    if (!b) { return; }
    var isAsc = b.sortDir === 'asc';
    var h = '<h3>' + esc(b.name) + '</h3>'
      + '<button class="row" data-ba="rename">重命名<span class="r">›</span></button>'
      + '<button class="row" data-ba="sortDir">阅读顺序<span class="r">' + (isAsc ? '正序（旧→新）' : '倒序（新→旧）') + ' ›</span></button>'
      + '<button class="row" data-ba="secret">' + (b.hidden ? '取消私密隐藏' : '设为私密笔记本') + '<span class="r">' + (b.hidden ? '<span class="wh-lock-ic">' + svgIco('lock') + '</span>' : '›') + '</span></button>'
      + '<button class="row" data-ba="export">导出这本<span class="r">›</span></button>'
      + '<button class="row" data-ba="archive">' + (b.archived ? '取消归档' : '归档') + '<span class="r">›</span></button>'
      + '<button class="row" data-ba="delete">删除这本<span class="r" style="color:var(--w-a1)">›</span></button>';
    openSheet(h, function () {
      Array.prototype.forEach.call(sheet.querySelectorAll('[data-ba]'), function (btn) {
        btn.onclick = function () {
          var k = btn.getAttribute('data-ba');
          if (k === 'rename') {
            openSheet('<h3>重命名</h3><input class="inp" id="rnx" value="' + esc(b.name) + '"><div class="btns"><button id="rc">取消</button><button class="primary" id="ro">保存</button></div>', function () {
              $('rnx').focus(); $('rc').onclick = closeSheet;
              $('ro').onclick = function () { var v = ($('rnx').value || '').trim(); if (!v) { return; } b.name = v; stampNow(b); save(); closeSheet(); renderShelf(); };
            });
          } else if (k === 'sortDir') {
            b.sortDir = b.sortDir === 'asc' ? 'desc' : 'asc';
            stampNow(b); save(); closeSheet(); renderShelf();
            toast('阅读顺序：' + (b.sortDir === 'asc' ? '正序（旧→新）' : '倒序（新→旧）'));
          } else if (k === 'secret') {
            if (!b.hidden && !S.lock.hash && !(canBio() && S.lock.bio)) {
              closeSheet();
              openSecretUnlock(function () {
                b.hidden = true; stampNow(b); save(); renderShelf(); toast('已设为私密笔记本');
              });
              return;
            }
            b.hidden = !b.hidden;
            stampNow(b); save(); closeSheet(); renderShelf();
            toast(b.hidden ? (session.secretUnlocked ? '已设为私密' : '已隐藏，长按顶部 Whisper 标题可解锁') : '已设为普通日记本');
          } else if (k === 'export') {
            S.last.bid = b.id; closeSheet(); sheetExport();
          } else if (k === 'archive') { b.archived = !b.archived; stampNow(b); save(); closeSheet(); renderShelf(); toast(b.archived ? '已归档' : '已取消归档'); }
          else if (k === 'delete') {
            openSheet('<h3>删除「' + esc(b.name) + '」？</h3><p style="font-size:11.5px;color:var(--w-mid);line-height:1.7">里面的 ' + entriesOf(b.id).length + ' 条日记会一起删掉。</p><div class="btns"><button id="dc">取消</button><button class="primary" id="do" style="background:var(--w-a1)">删除</button></div>', function () {
              $('dc').onclick = closeSheet;
              $('do').onclick = function () {
                var delBid = b.id;
                b.deletedAt = new Date().toISOString(); stampNow(b); save(); closeSheet(); renderShelf();
                if (S.last.bid === b.id) { var vis = visibleBooks(); S.last = { view: 'shelf', bid: (vis[0] || {}).id || '' }; }
                toastAction('已删除日记本', '撤销', function () {
                  var liveB = S.books.filter(function (x) { return x && x.id === delBid; })[0] || b;
                  liveB.deletedAt = null; stampNow(liveB); save(); renderShelf();
                });
              };
            });
          }
        };
      });
    });
  }
  $('shSearch').addEventListener('click', function () { openSearch(); });
  $('shNew').addEventListener('click', function () { newBookSheet(); });
  $('shRecall').addEventListener('click', function () { openRecall(); });

  /* sheet */
  var mask = $('mask'), sheet = $('sheet'), sheetExitT = null, sheetOpenedAt = 0;
  function openSheet(html, after) {
    clearTimeout(sheetExitT); sheetExitT = null;
    sheetOpenedAt = Date.now();
    var rt = $('whRoot');
    if (rt && rt.hasAttribute('hidden')) {
      rt.removeAttribute('hidden');
      document.body.classList.add('wh-open');
      rt.classList.add('wh-sheet-only');
    }
    sheet.innerHTML = html;
    sheet.classList.add('on');
    mask.classList.add('on');
    if (after) { after(); }
  }
  function closeSheet() {
    sheet.classList.remove('on');
    mask.classList.remove('on');
    var rt = $('whRoot');
    if (rt && rt.classList.contains('wh-sheet-only')) {
      clearTimeout(sheetExitT);
      sheetExitT = setTimeout(function () {
        sheetExitT = null;
        if (!sheet.classList.contains('on') && rt.classList.contains('wh-sheet-only')) {
          closeRoot();
        }
      }, 180);
    }
  }
  function hideAllScreens() {
    Object.keys(SC).forEach(function (k) {
      var el = $(SC[k]);
      if (el) { el.hidden = true; el.classList.remove('in'); }
    });
  }
  function openStandaloneAction(fn) {
    var fromOutside = !currentScreen();
    requireUnlock(function () {
      if (fromOutside) {
        var rt = $('whRoot');
        hideAllScreens();
        if (rt) {
          rt.removeAttribute('hidden');
          document.body.classList.add('wh-open');
          rt.classList.add('wh-sheet-only');
        }
      }
      fn();
    });
  }
  mask.addEventListener('click', function () {
    if (Date.now() - sheetOpenedAt < 380) { return; }
    closeSheet();
  });

  /* 菜单 */
  $('wMenu').addEventListener('click', openMenu);
  function openMenu() {
    var curB = bookById(S.last.bid);
    var b = (curB && isBookVisible(curB)) ? curB : visibleBooks()[0];
    if (!b) {
      openSheet('<h3>Whisper</h3><button class="row" data-act="search">搜索<span class="r">›</span></button><button class="row" data-act="recall">回顾<span class="r">›</span></button><button class="row" data-act="import">导入日记本<span class="r">›</span></button><button class="row" data-act="settings">设置<span class="r">›</span></button>', function () {
        Array.prototype.forEach.call(sheet.querySelectorAll('[data-act]'), function (el) { el.onclick = function () { menuAct(el.getAttribute('data-act')); }; });
      });
      return;
    }
    var acts = [
      { k: 'search', t: '搜索', d: '全文 · 当前本或全部' },
      { k: 'recall', t: '回顾', d: '片刻 / 随机漫步' },
      { k: 'sortDir', t: '阅读顺序', d: b.sortDir === 'asc' ? '正序（旧→新）' : '倒序（新→旧）' },
      { k: 'settings', t: '设置', d: '外观 / 列表 / 阅读 / 安全' },
      { k: 'switch', t: '切换日记本', d: b.name },
      { k: 'filter', t: '只看 Persona', d: S.opts.filter === 'all' ? '全部' : personaById(S.opts.filter).n },
      { k: 'export', t: '导出', d: 'Markdown / 备份' },
      { k: 'import', t: '导入日记', d: '.md / .json' }
    ];
    var h = '';
    if (S.opts.menu === 'grid') {
      h += '<div class="gridacts">';
      acts.forEach(function (a) { h += '<button data-act="' + a.k + '">' + a.t + '<span>' + esc(a.d || '') + '</span></button>'; });
      h += '</div>';
    } else {
      acts.forEach(function (a) { h += '<button class="row" data-act="' + a.k + '">' + a.t + '<span class="r">' + esc(a.d || '') + ' ›</span></button>'; });
    }
    openSheet('<h3>' + esc(b.name) + '</h3>' + h, function () {
      Array.prototype.forEach.call(sheet.querySelectorAll('[data-act]'), function (el) { el.onclick = function () { menuAct(el.getAttribute('data-act')); }; });
    });
  }
  function menuAct(k) {
    closeSheet();
    if (k === 'settings') { openAppSettings(); return; }
    if (k === 'switch') { sheetBooks(); return; }
    if (k === 'filter') { sheetFilter(); return; }
    if (k === 'layout') { S.opts.layout = S.opts.layout === 'A' ? 'C' : 'A'; save(); renderWhisper(); return; }
    if (k === 'grouped') { S.opts.grouped = !S.opts.grouped; save(); renderWhisper(); return; }
    if (k === 'sortDir') {
      var cb = bookById(S.last.bid) || visibleBooks()[0];
      if (cb) { cb.sortDir = cb.sortDir === 'asc' ? 'desc' : 'asc'; stampNow(cb); save(); renderWhisper(); toast('阅读顺序：' + (cb.sortDir === 'asc' ? '正序（旧→新）' : '倒序（新→旧）')); }
      return;
    }
    if (k === 'import') { openImportSheet(); return; }
    if (k === 'export') { sheetExport(); return; }
    if (k === 'shelf') { S.last.view = 'shelf'; save(); renderShelf(); show('shelf'); return; }
    if (k === 'search') { openSearch(); return; }
    if (k === 'recall') { openRecall(); return; }
    if (k === 'sort') { var order = ['recent', 'name', 'count']; var cur = S.opts.sort || 'recent'; S.opts.sort = order[(order.indexOf(cur) + 1) % 3]; save(); renderShelf(); toast('排序：' + ({ recent: '最近', name: '名称', count: '条数' })[S.opts.sort]); return; }
  }
  function sheetBooks() {
    var h = '<h3>切换日记本</h3>';
    var vis = visibleBooks();
    if (!vis.length) { h += '<p style="font-size:12px;color:var(--w-mid)">还没有日记本</p>'; }
    vis.forEach(function (b) { h += '<button class="row" data-bid="' + b.id + '">' + esc(b.name) + (b.hidden ? ' <span class="wh-lock-ic">' + svgIco('lock') + '</span>' : '') + '<span class="r">' + (b.id === S.last.bid ? '当前' : entriesOf(b.id).length + ' 条') + '</span></button>'; });
    openSheet(h, function () {
      Array.prototype.forEach.call(sheet.querySelectorAll('[data-bid]'), function (b) {
        b.onclick = function () { S.last = { view: 'read', bid: b.getAttribute('data-bid') }; save(); closeSheet(); renderWhisper(); };
      });
    });
  }
  function sheetFilter() {
    var h = '<h3>只看 Persona</h3><div class="pick" style="margin-top:0"><button data-f="all"' + (S.opts.filter === 'all' ? ' class="on"' : '') + '>全部</button>';
    S.personas.forEach(function (p) { h += '<button data-f="' + p.id + '"' + (S.opts.filter === p.id ? ' class="on"' : '') + '><span class="dot" style="background:' + p.c + '"></span>' + esc(p.n) + '</button>'; });
    h += '</div>';
    openSheet(h, function () {
      Array.prototype.forEach.call(sheet.querySelectorAll('[data-f]'), function (b) {
        b.onclick = function () { S.opts.filter = b.getAttribute('data-f'); save(); closeSheet(); renderWhisper(); };
      });
    });
  }
  function sheetExport() {
    var h = '<h3>导出日记</h3>'
      + '<div class="pick" id="xRange" style="margin:0 0 8px"><button data-xr="all" class="on">当前本</button><button data-xr="filter">当前筛选</button><button data-xr="allbooks">全部可见本</button></div>'
      + '<button class="row" data-x="single">保存为单个 Markdown (.md)<span class="r">›</span></button>'
      + '<button class="row" data-x="save">保存到…（按月份汇总文本）<span class="r">›</span></button>'
      + '<button class="row" data-x="share">分享给其它应用<span class="r">›</span></button>'
      + '<button class="row" data-x="json">导出完整备份（含图片 .json）<span class="r">›</span></button>';
    openSheet(h, function () {
      var range = 'all';
      Array.prototype.forEach.call(sheet.querySelectorAll('[data-xr]'), function (b) {
        b.onclick = function () { range = b.getAttribute('data-xr'); Array.prototype.forEach.call(sheet.querySelectorAll('[data-xr]'), function (x) { x.classList.toggle('on', x === b); }); };
      });
      Array.prototype.forEach.call(sheet.querySelectorAll('[data-x]'), function (b) { b.onclick = function () { S._exportRange = range; doExport(b.getAttribute('data-x')); }; });
    });
  }
  function formatEntryCommentsMd(e) {
    var cmts = aliveCommentsOf(e);
    if (!cmts.length) { return ''; }
    return '\n' + cmts.map(function (c) {
      return '> 追记 · ' + c.at + ' · ' + personaById(c.pid).n + '：' + String(c.x || '').replace(/\n/g, ' ');
    }).join('\n') + '\n';
  }
  function buildMdForBook(b) {
    var list = entriesOf(b.id);
    if (S._exportRange === 'filter') {
      list = list.filter(function (e) { return S.opts.filter === 'all' || e.pid === S.opts.filter; });
    }
    list = list.slice().sort(function (a, c) {
      var ka = normAtSortKey(a.at), kb = normAtSortKey(c.at);
      return ka === kb ? 0 : (ka < kb ? -1 : 1);
    });
    var out = '# ' + b.name + '\n\n', curD = '';
    list.forEach(function (e) {
      var d = e.at.slice(0, 10);
      if (d !== curD) { curD = d; out += '\n## ' + d + ' · ' + dayLabel(d) + ' · ' + weekday(d) + '\n\n'; }
      out += '**' + e.at.slice(11) + ' · ' + personaById(e.pid).n + '**\n\n' + e.x + '\n' + formatEntryCommentsMd(e) + '\n';
    });
    return { name: safe(b.name) + '.md', text: out, count: list.length };
  }
  function buildMd(mode) {
    var vis = visibleBooks();
    if (S._exportRange === 'allbooks') {
      var multi = [];
      vis.forEach(function (bk) {
        var r = buildMdForBook(bk);
        if (r.count > 0 || vis.length === 1) { multi.push({ name: r.name, text: r.text }); }
      });
      return multi;
    }
    var cur = bookById(S.last.bid);
    var b = (cur && isBookVisible(cur)) ? cur : vis[0];
    if (!b) { return []; }
    if (mode === 'single') {
      var sb = buildMdForBook(b);
      if (!sb.count && S._exportRange === 'filter') { return []; }
      return [{ name: sb.name, text: sb.text }];
    }
    var list = entriesOf(b.id);
    if (S._exportRange === 'filter') {
      list = list.filter(function (e) { return S.opts.filter === 'all' || e.pid === S.opts.filter; });
    }
    list = list.slice().sort(function (a, c) {
      var ka = normAtSortKey(a.at), kb = normAtSortKey(c.at);
      return ka === kb ? 0 : (ka < kb ? -1 : 1);
    });
    var byM = {};
    list.forEach(function (e) { var m = e.at.slice(0, 7); (byM[m] = byM[m] || []).push(e); });
    return Object.keys(byM).sort().map(function (m) {
      return { name: safe(b.name) + '/' + m.slice(0, 4) + '/' + m.slice(5, 7) + '.md',
        text: '# ' + b.name + ' · ' + m + '\n\n' + byM[m].map(function (e) {
          return '### ' + e.at.slice(0, 10) + ' · ' + dayLabel(e.at.slice(0, 10)) + ' · ' + e.at.slice(11) + ' · ' + personaById(e.pid).n + '\n\n' + e.x + '\n' + formatEntryCommentsMd(e);
        }).join('\n') };
    });
  }
  function safe(s) { return String(s).replace(/[\\/:*?"<>|]/g, '_'); }
  function exportFullBackupJson() {
    var vis = visibleBooks();
    var visIds = {};
    vis.forEach(function (b) { visIds[b.id] = 1; });
    var entries = S.entries.filter(function (e) { return !e.deletedAt && visIds[e.bid]; });
    var mediaIds = {};
    entries.forEach(function (e) {
      (e.media || []).forEach(function (m) { if (m && m.id) { mediaIds[m.id] = 1; } });
    });
    var keys = Object.keys(mediaIds);
    return Promise.all(keys.map(function (id) { return loadMediaLocal(id); })).then(function (recs) {
      var mediaMap = {};
      recs.forEach(function (r) { if (r && r.id && r.dataUrl) { mediaMap[r.id] = r; } });
      var payload = {
        v: 2,
        type: 'whisper-backup',
        exportedAt: new Date().toISOString(),
        books: vis,
        personas: S.personas,
        entries: entries,
        media: mediaMap
      };
      var fname = 'whisper-backup-' + dkey(0) + '.json';
      nativeExport(fname, JSON.stringify(payload, null, 2), 'application/json');
    });
  }
  function doExport(mode) {
    if (mode === 'json') {
      closeSheet();
      exportFullBackupJson().catch(function () { toast('导出备份失败'); });
      return;
    }
    var files = buildMd(mode === 'single' ? 'single' : 'month');
    if (!files || !files.length) { toast('还没有可导出的内容'); closeSheet(); return; }
    window.__lastExport = files;
    if (mode === 'single') {
      var singleName = files.length === 1 ? files[0].name : ('whisper-' + dkey(0) + '.md');
      var singleText = files.length === 1 ? files[0].text : files.map(function (f) { return '<<<FILE ' + f.name + '>>>\n' + f.text; }).join('\n\n');
      nativeExport(singleName, singleText, 'text/markdown');
    } else if (mode === 'save') {
      saveAs(files);
    } else {
      share(files);
    }
    closeSheet();
  }
  function nativeExport(name, text, mime) {
    var cleanName = String(name || 'whisper.md').split('/').pop();
    var mtype = mime || 'text/markdown';
    if (window.AR && AR.Bridge && AR.Bridge.isNative && AR.Bridge.isNative() && AR.Bridge.exportText) {
      try {
        var r = AR.Bridge.exportText(cleanName, text, mtype);
        if (r && typeof r.then === 'function') {
          r.then(function (res) {
            if (res === false) { download(cleanName, text, mtype); }
            else if (typeof res === 'string' && res !== 'cancelled' && !AR.Bridge.hasAndroid) { toast('已保存：' + cleanName); }
          }).catch(function () { download(cleanName, text, mtype); });
          return;
        }
        return;
      } catch (e0) { }
    }
    download(cleanName, text, mtype);
    toast('已导出 ' + cleanName);
  }
  function share(files) {
    var joined = files.length === 1 ? files[0].text : files.map(function (f) { return '<<<FILE ' + f.name + '>>>\n' + f.text; }).join('\n\n');
    var fname = files.length === 1 ? files[0].name.split('/').pop() : 'whisper-export.md';
    if (window.AR && AR.Bridge) {
      if (AR.Bridge.shareFile) {
        try { AR.Bridge.shareFile(fname, joined, 'text/markdown', 'Whisper 日记'); return; } catch (e0) { }
      }
      if (AR.Bridge.share) {
        try { AR.Bridge.share('Whisper 日记', joined); return; } catch (e1) { }
      }
    }
    if (navigator.share) {
      var payload = { title: 'Whisper 导出', text: joined };
      try {
        if (navigator.canShare && window.File) {
          var fs2 = files.slice(0, 5).map(function (f) { return new File([f.text], f.name.split('/').pop(), { type: 'text/markdown' }); });
          if (navigator.canShare({ files: fs2 })) { payload = { files: fs2, title: 'Whisper 导出' }; }
        }
        navigator.share(payload).then(function () { toast('已分享'); }).catch(function () { download(fname, joined, 'text/markdown'); });
        return;
      } catch (e) { }
    }
    download(fname, joined, 'text/markdown'); toast('已改为下载 ' + fname);
  }
  function saveAs(files) {
    var text = files.length === 1 ? files[0].text : files.map(function (f) { return '<<<FILE ' + f.name + '>>>\n' + f.text; }).join('\n\n');
    var fname = files.length === 1 ? files[0].name.split('/').pop() : 'whisper-export.md';
    if (window.AR && AR.Bridge && AR.Bridge.isNative && AR.Bridge.isNative() && AR.Bridge.exportText) {
      nativeExport(fname, text, 'text/markdown');
      return;
    }
    if (window.showSaveFilePicker) {
      window.showSaveFilePicker({ suggestedName: fname, types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }] })
        .then(function (h) { return h.createWritable().then(function (w) { return w.write(text).then(function () { return w.close(); }); }); })
        .then(function () { toast('已保存'); }).catch(function () { });
      return;
    }
    download(fname, text, 'text/markdown'); toast('已导出 ' + fname);
  }
  function download(name, text, mime) {
    try {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: (mime || 'text/markdown') + ';charset=utf-8' }));
      a.download = name.split('/').pop();
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 1500);
    } catch (e) { }
  }

  /* ── 导入日记本（支持 Whisper .md 与 .json 备份） ── */
  var pendingImport = { active: false, until: 0 };
  function prepareFileImport() {
    pendingImport.active = true;
    pendingImport.until = Date.now() + 120000;
    if (window.AR && AR.Bridge && AR.Bridge.importText) {
      AR.Bridge.importText();
    } else {
      toast('当前环境不支持选文件，请改用粘贴导入');
    }
  }
  function consumePendingImport(text, name) {
    if (!pendingImport.active || Date.now() > pendingImport.until) { return false; }
    pendingImport.active = false;
    importWhisperText(text, name);
    return true;
  }
  function ensureImportedBook(name) {
    var clean = String(name || '').trim() || '导入的日记';
    var found = aliveBooks().filter(function (b) { return b.name === clean; })[0];
    if (found) { return { book: found, created: false }; }
    var nb = { id: uid('b'), name: clean, sortDir: 'desc', hidden: false, spine: ['#d97757', '#6a9bcc', '#788c5d', '#b0aea5'][S.books.length % 4] };
    stampNow(nb);
    S.books.push(nb);
    return { book: nb, created: true };
  }
  function ensureImportedPersona(name) {
    var clean = String(name || '').trim();
    if (!clean) { return null; }
    var found = S.personas.filter(function (p) { return p.n === clean; })[0];
    if (found) { return found.id; }
    var palette = [S.theme.accent.a1, S.theme.accent.a2, S.theme.accent.a3, '#8b7f6a'];
    var np = { id: uid('p'), n: clean, c: palette[S.personas.length % palette.length] };
    stampNow(np);
    S.personas.push(np);
    return np.id;
  }
  function inferDateFromLabel(mo, day, wkName) {
    var m2 = p2(Number(mo)), d2 = p2(Number(day));
    var y = new Date().getFullYear();
    if (wkName) {
      for (var off = 0; off < 6; off++) {
        var cand = (y - off) + '-' + m2 + '-' + d2;
        if (weekday(cand) === wkName) { return cand; }
      }
    }
    return y + '-' + m2 + '-' + d2;
  }
  function importWhisperMarkdown(text, fallbackBookName) {
    var lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    var curBook = null, curDay = dkey(0), curEntry = null;
    var booksAdded = 0, entriesAdded = 0, cmtsAdded = 0;
    var existingMap = {};
    S.entries.forEach(function (e) { if (!e.deletedAt) { existingMap[e.bid + '|' + e.at + '|' + String(e.x || '').trim()] = e; } });

    function flushEntry() {
      if (!curEntry) { return; }
      curEntry.x = curEntry.lines.join('\n').replace(/^\n+|\n+$/g, '');
      if (!curEntry.x && !curEntry.comments.length) { curEntry = null; return; }
      var bkInfo = ensureImportedBook(curEntry.bookName);
      if (bkInfo.created) { booksAdded++; }
      var sig = bkInfo.book.id + '|' + curEntry.at + '|' + curEntry.x.trim();
      var target = existingMap[sig];
      if (!target) {
        target = { id: uid('e'), bid: bkInfo.book.id, pid: ensureImportedPersona(curEntry.persona), at: curEntry.at, x: curEntry.x };
        if (curEntry.comments.length) { target.comments = []; }
        stampNow(target);
        S.entries.push(target);
        existingMap[sig] = target;
        entriesAdded++;
      }
      curEntry.comments.forEach(function (cm) {
        target.comments = Array.isArray(target.comments) ? target.comments : [];
        var dup = target.comments.some(function (x) { return !x.deletedAt && x.at === cm.at && String(x.x || '').trim() === cm.x.trim(); });
        if (!dup) {
          var nc = { id: uid('c'), pid: ensureImportedPersona(cm.persona), at: cm.at, x: cm.x };
          stampNow(nc);
          target.comments.push(nc);
          cmtsAdded++;
        }
      });
      curEntry = null;
    }

    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      var mFile = /^<<<FILE\s+(.+?)>>>$/.exec(ln.trim());
      if (mFile) { flushEntry(); continue; }
      var mBook = /^#\s+(.+?)(?:\s+·\s+\d{4}-\d{2})?\s*$/.exec(ln);
      if (mBook) {
        flushEntry();
        curBook = mBook[1].trim();
        continue;
      }
      var mDayIso = /^##\s+(\d{4}-\d{2}-\d{2})(?:\s+·\s+.*)?$/.exec(ln);
      if (mDayIso) {
        flushEntry();
        curDay = mDayIso[1];
        continue;
      }
      var mDayCn = /^##\s+(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*·\s*(周[一二三四五六日]))?/.exec(ln);
      if (mDayCn) {
        flushEntry();
        curDay = inferDateFromLabel(mDayCn[1], mDayCn[2], mDayCn[3] || '');
        continue;
      }
      var mH3Iso = /^###\s+(\d{4}-\d{2}-\d{2})\s+·\s+[^·]+·\s+(\d{1,2}:\d{2}(?::\d{2})?)\s+·\s*(.*)$/.exec(ln);
      if (mH3Iso) {
        flushEntry();
        curDay = mH3Iso[1];
        curEntry = { bookName: curBook || fallbackBookName, at: curDay + ' ' + mH3Iso[2], persona: mH3Iso[3].trim(), lines: [], comments: [] };
        continue;
      }
      var mH3Cn = /^###\s+(\d{1,2})\s*月\s*(\d{1,2})\s*日\s+·\s+(\d{1,2}:\d{2}(?::\d{2})?)\s+·\s*(.*)$/.exec(ln);
      if (mH3Cn) {
        flushEntry();
        curDay = inferDateFromLabel(mH3Cn[1], mH3Cn[2], '');
        curEntry = { bookName: curBook || fallbackBookName, at: curDay + ' ' + mH3Cn[3], persona: mH3Cn[4].trim(), lines: [], comments: [] };
        continue;
      }
      var mBold = /^\*\*(?:(\d{4}-\d{2}-\d{2})\s+)?(\d{1,2}:\d{2}(?::\d{2})?)\s+·\s*([^*]*)\*\*\s*$/.exec(ln.trim());
      if (mBold) {
        flushEntry();
        if (mBold[1]) { curDay = mBold[1]; }
        curEntry = { bookName: curBook || fallbackBookName, at: curDay + ' ' + mBold[2], persona: mBold[3].trim(), lines: [], comments: [] };
        continue;
      }
      var mCmt = /^>\s*追记\s+·\s+([\d\-: ]+)\s+·\s*(.*?)：(.*)$/.exec(ln);
      if (mCmt && curEntry) {
        curEntry.comments.push({ at: mCmt[1].trim(), persona: mCmt[2].trim(), x: mCmt[3] });
        continue;
      }
      if (curEntry) { curEntry.lines.push(ln); }
    }
    flushEntry();
    if (entriesAdded === 0 && booksAdded === 0 && cmtsAdded === 0) {
      throw new Error('没有识别到可导入的 Whisper 日记格式');
    }
    save();
    refreshCurrentView();
    return { booksAdded: booksAdded, entriesAdded: entriesAdded, commentsAdded: cmtsAdded, mediaAdded: 0 };
  }

  function importWhisperText(text, filename) {
    var raw = String(text == null ? '' : text);
    while (raw.charCodeAt(0) === 0xFEFF) { raw = raw.slice(1); }
    var trimmed = raw.replace(/^\s+/, '');
    if (!trimmed) { toast('内容为空'); return Promise.resolve({ booksAdded: 0, entriesAdded: 0 }); }
    if (trimmed.charAt(0) === '{') {
      try {
        var obj = JSON.parse(trimmed);
        if (!obj || !Array.isArray(obj.books) || !Array.isArray(obj.entries)) {
          toast('这不是有效的 Whisper JSON 备份');
          return Promise.resolve(null);
        }
        var bBefore = S.books.length, eBefore = S.entries.length;
        mergeBlob(obj);
        var mediaObj = obj.media && typeof obj.media === 'object' ? obj.media : {};
        var mIds = Object.keys(mediaObj);
        return Promise.all(mIds.map(function (mid) {
          var rec = mediaObj[mid];
          return (rec && rec.dataUrl) ? saveMediaLocal(mid, rec) : Promise.resolve(null);
        })).then(function () {
          save();
          refreshCurrentView();
          var res = {
            booksAdded: Math.max(0, S.books.length - bBefore),
            entriesAdded: Math.max(0, S.entries.length - eBefore),
            mediaAdded: mIds.length
          };
          toast('已导入 Whisper 备份：' + obj.books.length + ' 本 / ' + obj.entries.length + ' 条' + (mIds.length ? ' / ' + mIds.length + ' 图' : ''));
          return res;
        });
      } catch (eJ) {
        toast('JSON 解析失败：' + (eJ && eJ.message));
        return Promise.resolve(null);
      }
    }
    try {
      var fallbackName = String(filename || '导入的日记').replace(/\.[^.]+$/, '');
      var resMd = importWhisperMarkdown(trimmed, fallbackName);
      toast('已导入：' + resMd.booksAdded + ' 新本 · ' + resMd.entriesAdded + ' 条' + (resMd.commentsAdded ? ' · ' + resMd.commentsAdded + ' 追记' : ''));
      return Promise.resolve(resMd);
    } catch (eMd) {
      toast((eMd && eMd.message) || '导入失败');
      return Promise.resolve(null);
    }
  }

  function openImportSheet() {
    openSheet('<h3>导入日记本</h3><p style="font-size:11.5px;color:var(--w-mid);line-height:1.6">支持导入 Whisper 导出的 Markdown (.md) 或完整备份 (.json)，自动按时间与内容去重合并。</p><button class="row" id="impPick">从文件导入 (.md / .json)<span class="r">›</span></button><textarea id="impPaste" placeholder="或直接把 .md / .json 内容粘贴到这里…" style="margin-top:8px;min-height:96px"></textarea><div class="btns"><button id="impCancel">取消</button><button class="primary" id="impDo">解析并导入</button></div>', function () {
      $('impCancel').onclick = closeSheet;
      $('impPick').onclick = function () { closeSheet(); prepareFileImport(); };
      $('impDo').onclick = function () {
        var val = $('impPaste').value || '';
        if (!val.trim()) { toast('先选择文件或粘贴内容'); return; }
        closeSheet();
        importWhisperText(val, '粘贴导入');
      };
    });
  }

  /* 写作 */
  $('wWrite').addEventListener('click', openComposer);
  var draft = { pid: null, bid: null, text: '', media: [] };
  function paintComposerMedia() {
    renderDraftMediaStrip($('cMediaList'), draft.media, function (idx) {
      draft.media.splice(idx, 1);
      paintComposerMedia();
    });
  }
  bindMediaPicker($('cImgBtn'), $('cImgIn'), $('cText'), draft.media, paintComposerMedia);
  function openComposer() {
    var vis = visibleBooks();
    if (!vis.length) { newBookSheet(function () { openComposer(); }); return; }
    draft.text = '';
    draft.media.length = 0;
    draft.pid = (S.personas[0] || {}).id;
    var curB = bookById(S.last.bid);
    if (!curB || !isBookVisible(curB)) { curB = vis[0]; }
    draft.bid = curB ? curB.id : '';
    if (S.opts.composer === 'full') {
      $('cWhen').textContent = dayLabel(dkey(0)) + ' · ' + weekday(dkey(0));
      $('cText').value = '';
      mountMdBar($('cMdBar'), $('cMdPrev'), $('cText'));
      paintComposerMedia();
      renderComposerChips();
      show('composer');
      return;
    }
    renderWriteSheet();
  }

  /* Persona 选择：已有 + 新建 + 临时（临时不入库） */
  function personaChipsHTML() {
    var h = '';
    if (draft.pid && String(draft.pid).indexOf('tmp:') === 0) {
      var tp = personaById(draft.pid);
      h += '<button data-p="' + draft.pid + '" class="on dashed">' + esc(tp.n) + '</button>';
    }
    h += '<button data-p=""' + (!draft.pid ? ' class="on"' : '') + '>—</button>';
    S.personas.forEach(function (p) {
      h += '<button data-p="' + p.id + '"' + (p.id === draft.pid ? ' class="on"' : '') + '><span class="dot" style="background:' + p.c + '"></span>' + esc(p.n) + '</button>';
    });
    h += '<button data-pnew="1" class="dashed">＋ 新建</button>';
    h += '<button data-ptmp="1" class="dashed">临时</button>';
    return h;
  }
  function bookChipsHTML() {
    return visibleBooks().map(function (b) {
      return '<button data-b="' + b.id + '"' + (b.id === draft.bid ? ' class="on"' : '') + '>' + esc(b.name) + (b.hidden ? ' <span class="wh-lock-ic">' + svgIco('lock') + '</span>' : '') + '</button>';
    }).join('');
  }
  function bindPersonaChips(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-p]'), function (b) {
      var pid = b.getAttribute('data-p');
      b.onclick = function () { draft.pid = pid || null; refreshChips(root); };
      if (!pid) { return; }
      var t = null, sx = 0, sy = 0;
      b.addEventListener('pointerdown', function (e) {
        sx = e.clientX; sy = e.clientY;
        t = setTimeout(function () { t = null; personaActions(pid); }, 520);
      });
      b.addEventListener('pointermove', function (e) {
        if (t && (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8)) { clearTimeout(t); t = null; }
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
        b.addEventListener(ev, function () { if (t) { clearTimeout(t); t = null; } });
      });
    });
    var nb = root.querySelector('[data-pnew]');
    if (nb) { nb.onclick = function () { stashWriteText(); personForm('new'); }; }
    var tb = root.querySelector('[data-ptmp]');
    if (tb) { tb.onclick = function () { stashWriteText(); personForm('tmp'); }; }
  }
  function personaActions(pid) {
    var pp = personaById(pid);
    if (pp.tmp) { toast('临时 Persona 用完即弃'); return; }
    var h = '<div class="acthead"><span class="dot" style="background:' + pp.c + ';width:7px;height:7px;border-radius:50%;display:block"></span>'
      + '<div class="m"><div class="l">Persona</div><div class="x">' + esc(pp.n) + '</div></div></div>'
      + '<button class="row" data-pa="rename"><span class="ico">' + svgIco('edit') + '</span>改名</button>'
      + '<button class="row" data-pa="color"><span class="ico">' + svgIco('palette') + '</span>换颜色</button>'
      + '<button class="row danger" data-pa="delete"><span class="ico">' + svgIco('trash') + '</span>删除</button>';
    openSheet(h, function () {
      Array.prototype.forEach.call(sheet.querySelectorAll('[data-pa]'), function (b) {
        b.onclick = function () {
          var k = b.getAttribute('data-pa');
          if (k === 'rename') {
            closeSheet();
            openSheet('<h3>改名</h3><input class="inp" id="pnName" value="' + esc(pp.n) + '"><div class="btns"><button id="pnC">取消</button><button class="primary" id="pnO">保存</button></div>', function () {
              $('pnName').focus();
              $('pnC').onclick = closeSheet;
              $('pnO').onclick = function () {
                var v = ($('pnName').value || '').trim(); if (!v) { return; }
                pp.n = v; stampNow(pp); save(); closeSheet(); renderWhisper();
              };
            });
          } else if (k === 'color') {
            closeSheet();
            pickColor(pp.c || '#b0aea5', function (v) { pp.c = v; stampNow(pp); save(); closeSheet(); renderWhisper(); });
          } else if (k === 'delete') {
            addTombstone('personas', pp.id);
            S.personas = S.personas.filter(function (x) { return x.id !== pp.id; });
            S.entries.forEach(function (e) { if (e.pid === pp.id) { e.pid = null; stampNow(e); } });
            if (S.opts.filter === pp.id) { S.opts.filter = 'all'; }
            save(); closeSheet(); renderWhisper(); toast('已删除，相关条目变为无署名');
          }
        };
      });
    });
  }
  function stashWriteText() { var t = $('wText'); if (t) { draft.text = t.value; } else { var t2 = $('cText'); if (t2) { draft.text = t2.value; } } }
  function refreshChips(root) {
    if (!root) { return; }
    if (root.id === 'wP') { root.innerHTML = personaChipsHTML(); bindPersonaChips(root); }
    else if (root.id === 'cPersona') { renderComposerChips(); }
  }

  function renderWriteSheet() {
    var h = '<h3>写一条</h3><textarea id="wText">' + esc(draft.text || '') + '</textarea>'
      + '<div class="md-preview md-body" id="wsMdPrev" hidden></div>'
      + '<div class="md-bar" id="wsMdBar"></div>'
      + '<div class="media-bar"><button class="media-pick" type="button" id="wsImgBtn">' + svgIco('image') + '<span>添加图片</span></button><input type="file" id="wsImgIn" accept="image/*" multiple style=\"display:none\"></div>'
      + '<div class="media-draft" id="wsMediaList"></div>'
      + '<div class="field">Persona</div><div class="pick" id="wP">' + personaChipsHTML() + '</div>'
      + '<div class="field">写进</div><div class="pick" id="wB">' + bookChipsHTML() + '</div>'
      + '<div class="btns"><button id="wCancel">取消</button><button class="primary" id="wSave">保存</button></div>';
    openSheet(h, function () {
      function paintWsMedia() {
        renderDraftMediaStrip($('wsMediaList'), draft.media, function (idx) {
          draft.media.splice(idx, 1);
          paintWsMedia();
        });
      }
      mountMdBar($('wsMdBar'), $('wsMdPrev'), $('wText'));
      paintWsMedia();
      bindMediaPicker($('wsImgBtn'), $('wsImgIn'), $('wText'), draft.media, paintWsMedia);
      bindPersonaChips($('wP'));
      Array.prototype.forEach.call(sheet.querySelectorAll('#wB button'), function (b) {
        b.onclick = function () { draft.bid = b.getAttribute('data-b'); Array.prototype.forEach.call(sheet.querySelectorAll('#wB button'), function (x) { x.classList.toggle('on', x === b); }); };
      });
      $('wCancel').onclick = closeSheet;
      $('wSave').onclick = function () { stashWriteText(); commitDraft(); };
      setTimeout(function () { var t = $('wText'); if (t) { try { t.focus({ preventScroll: true }); } catch (e) { } } }, 60);
    });
  }

  var pForm = { mode: 'new', name: '', color: '#6a9bcc' };
  function personForm(mode) {
    pForm = { mode: mode, name: '', color: '#6a9bcc' };
    renderPersonForm();
  }
  function renderPersonForm() {
    var h = '<h3>' + (pForm.mode === 'new' ? '新建 Persona' : '临时 Persona') + '</h3>'
      + '<input class="inp" id="npName" value="' + esc(pForm.name) + '">';
    if (pForm.mode === 'new') {
      h += '<button class="row" id="npColor">颜色<span class="r"><span class="chip" style="background:' + pForm.color + '"></span>' + pForm.color.toUpperCase() + ' ›</span></button>';
    }
    h += '<div class="btns"><button id="npBack">返回</button><button class="primary" id="npOk">确定</button></div>';
    openSheet(h, function () {
      $('npName').focus();
      if (pForm.mode === 'new') {
        $('npColor').onclick = function () {
          var nm = $('npName').value;
          pickColor(pForm.color, function (v) { pForm.color = v; pForm.name = nm; renderPersonForm(); });
        };
      }
      $('npBack').onclick = function () { renderWriteSheet(); };
      $('npOk').onclick = function () {
        var nm = ($('npName').value || '').trim();
        if (!nm) { toast('先起个名字'); return; }
        if (pForm.mode === 'new') { var id = uid('p'); var np2 = { id: id, n: nm, c: pForm.color }; stampNow(np2); S.personas.push(np2); draft.pid = id; save(); }
        else { draft.pid = 'tmp:' + encodeURIComponent(nm); }
        if (S.opts.composer === 'full') { closeSheet(); renderComposerChips(); } else { renderWriteSheet(); }
      };
    });
  }
  function renderComposerChips() {
    $('cPersona').innerHTML = personaChipsHTML();
    $('cBook').innerHTML = bookChipsHTML();
    bindPersonaChips($('cPersona'));
    Array.prototype.forEach.call($('cBook').querySelectorAll('button'), function (b) {
      b.onclick = function () { draft.bid = b.getAttribute('data-b'); renderComposerChips(); };
    });
  }

  function commitDraft() {
    var tx = String(draft.text || '').replace(/\s+$/, '');
    if (!tx && !draft.media.length) { toast('还没写内容'); return; }
    var newId = uid('e');
    var ne = { id: newId, bid: draft.bid, pid: draft.pid, at: nowAtSec(), x: tx || '[图片]' };
    if (draft.media.length) { ne.media = draft.media.slice(); }
    draft.media.length = 0;
    stampNow(ne);
    S.entries.push(ne);
    S.last = { view: 'read', bid: draft.bid };
    save(); closeSheet(); renderWhisper(); show('whisper');
    var fab = $('wWrite');
    if (fab) { fab.classList.add('pulse'); setTimeout(function () { fab.classList.remove('pulse'); }, 520); }
    setTimeout(function () {
      var row = $('wBody').querySelector('[data-eid="' + newId + '"]');
      if (!row) { return; }
      var target = row.scrollHeight;
      row.style.height = '0px';
      row.style.overflow = 'hidden';
      row.classList.add('new');
      void row.offsetHeight;
      row.style.transition = 'height .62s cubic-bezier(.16,1,.3,1)';
      row.style.height = target + 'px';
      setTimeout(function () {
        row.style.transition = '';
        row.style.height = '';
        row.style.overflow = '';
        try { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { row.scrollIntoView(); }
      try { $('whRoot').scrollLeft = 0; $('whRoot').scrollTop = 0; } catch (e3) { }
      }, 660);
      setTimeout(function () { row.classList.remove('new'); }, 2800);
    }, 90);
  }
  $('cCancel').addEventListener('click', function () { show('whisper'); });
  $('cSave').addEventListener('click', function () { draft.text = $('cText').value; commitDraft(); });
  $('cSave2').addEventListener('click', function () { draft.text = $('cText').value; commitDraft(); });

  function openNow() {
    bindThemeWatch();
    try { applyTheme(); applyAppHeat(); } catch (e0) { }
    var rt = $('whRoot');
    if (rt) { rt.removeAttribute('hidden'); document.body.classList.add('wh-open'); }
    if (corruptLocked) {
      renderShelf();
      show('shelf');
      openSheet('<h3>无法读取加密日记</h3><p style="font-size:12px;color:var(--w-mid);line-height:1.7">本地密钥缺失或密文损坏，已开启只读保护以免覆盖原数据。</p><div class="btns"><button id="crClose">关闭</button><button class="primary" id="crReset">清空并重新开始</button></div>', function () {
        $('crClose').onclick = function () { closeSheet(); closeRoot(); };
        $('crReset').onclick = function () { closeSheet(); resetAll({ bypassLock: true, clearCloud: false }); };
      });
      return;
    }
    try { syncBlob(false); } catch (eS) { }
    enter();
  }
  function hideRootOnly() {
    clearTimeout(sheetExitT); sheetExitT = null;
    var rt = $('whRoot');
    var wasOpen = !!(rt && !rt.hasAttribute('hidden'));
    hideAllScreens();
    if (rt) {
      rt.classList.remove('wh-sheet-only');
      rt.setAttribute('hidden', 'hidden');
    }
    sheet.classList.remove('on');
    mask.classList.remove('on');
    document.body.classList.remove('wh-open');
    return wasOpen;
  }
  function relock() {
    session.unlocked = false;
    session.secretUnlocked = false;
    lockPurpose = 'main';
    pendChange = false;
    pinStage = 'verify';
    pendingSecretCb = null;
    pendingExternalCb = null;
    pendingInternalCb = null;
  }
  function closeRoot() {
    var wasOpen = hideRootOnly();
    relock();
    if (wasOpen) { animAppIn(); }
  }
  /* 退出 Whisper 回到应用：复用应用的页面入场动画 */
  function animAppIn() {
    try {
      var v = document.querySelector('.view:not([hidden])') || document.getElementById('view-today');
      if (!v) { return; }
      if (window.AR && AR.UI && AR.UI.enterRise) { AR.UI.enterRise(v); }
    } catch (e) { }
  }

  /* ── 云同步（口令派生，独立 salt） ─────────────────────
     只在 App 已配置同步且设了口令时启用；失败静默，不影响本地。 */
  var blobTimer = null;
  var blobBusy = false;
  var activeSyncPromise = null;

  function syncReady() {
    if (!(window.AR && AR.Sync && AR.Sync.blobPull && AR.Sync.blobPush && AR.Sync.status)) { return false; }
    var st = AR.Sync.status();
    return !!(st && st.configured && st.syncWhisperEnabled !== false);
  }
  function mediaSyncReady() {
    if (!syncReady()) { return false; }
    return !!(AR.Sync.blobMediaList && AR.Sync.blobMediaPull && AR.Sync.blobMediaPush && AR.Sync.isWhisperMediaSyncEnabled && AR.Sync.isWhisperMediaSyncEnabled());
  }
  function scheduleBlobSync() {
    if (!syncReady() || blobBusy || corruptLocked) { return; }
    if (blobTimer) { clearTimeout(blobTimer); }
    blobTimer = setTimeout(function () { blobTimer = null; syncBlob(false); }, 1200);
  }
  /* 落盘但**不**标脏：同步跑完后把 syncRev / syncDirty=false 记下来，
     否则每次重启都从 rev 0 开始推，白白撞一次 409。 */
  function persistQuiet() {
    if (!ready || !S || corruptLocked) { return Promise.resolve(); }
    return writeEncQueue(JSON.stringify(S), false);
  }
  function mergeListLWW(localList, remoteList, entity, tombMap) {
    var map = {}, i, item, id;
    var rList = Array.isArray(remoteList) ? remoteList : [];
    var lList = Array.isArray(localList) ? localList : [];
    for (i = 0; i < rList.length; i++) {
      item = rList[i];
      if (item && item.id) { map[item.id] = item; }
    }
    for (i = 0; i < lList.length; i++) {
      item = lList[i];
      if (!item || !item.id) { continue; }
      var r = map[item.id];
      if (!r || stampMs(item) >= stampMs(r)) {
        if (entity === 'entries' && r) {
          var mergedC = mergeListLWW(item.comments, r.comments, 'comments', tombMap);
          if (mergedC.length) { item.comments = mergedC; }
        }
        map[item.id] = item;
      } else if (entity === 'entries' && r) {
        var rCopy = JSON.parse(JSON.stringify(r));
        var mergedC2 = mergeListLWW(item.comments, r.comments, 'comments', tombMap);
        if (mergedC2.length) { rCopy.comments = mergedC2; }
        map[item.id] = rCopy;
      }
    }
    var out = [];
    for (id in map) {
      if (!Object.prototype.hasOwnProperty.call(map, id)) { continue; }
      item = map[id];
      var tKey = entity + ':' + id;
      var tb = tombMap[tKey];
      var itemMs = stampMs(item);
      if (tb && (Number(tb.deletedMs) || 0) >= itemMs) { continue; }
      if (tb && itemMs > (Number(tb.deletedMs) || 0)) { delete tombMap[tKey]; }
      if (entity === 'entries' && Array.isArray(item.comments)) {
        item.comments = mergeListLWW(item.comments, [], 'comments', tombMap);
        if (!item.comments.length) { delete item.comments; }
      }
      if (entity === 'entries' && Array.isArray(item.media)) {
        item.media = item.media.filter(function (m) { return m && m.id && !tombMap['media:' + m.id]; });
      }
      out.push(item);
    }
    return out;
  }
  function mergeBlob(remote) {
    if (!remote || typeof remote !== 'object') { return false; }
    var beforeTombs = JSON.stringify(S.tombstones || []);
    var tombMap = {};
    var i, tb;
    var lTombs = Array.isArray(S.tombstones) ? S.tombstones : [];
    var rTombs = Array.isArray(remote.tombstones) ? remote.tombstones : [];
    for (i = 0; i < rTombs.length; i++) {
      tb = rTombs[i];
      if (tb && tb.entity && tb.id) {
        var k1 = tb.entity + ':' + tb.id;
        if (!tombMap[k1] || (Number(tb.deletedMs) || 0) > (Number(tombMap[k1].deletedMs) || 0)) {
          tombMap[k1] = { entity: tb.entity, id: tb.id, deletedMs: Number(tb.deletedMs) || 0 };
        }
      }
    }
    for (i = 0; i < lTombs.length; i++) {
      tb = lTombs[i];
      if (tb && tb.entity && tb.id) {
        var k2 = tb.entity + ':' + tb.id;
        if (!tombMap[k2] || (Number(tb.deletedMs) || 0) > (Number(tombMap[k2].deletedMs) || 0)) {
          tombMap[k2] = { entity: tb.entity, id: tb.id, deletedMs: Number(tb.deletedMs) || 0 };
        }
      }
    }
    var beforeP = JSON.stringify(S.personas || []);
    var beforeB = JSON.stringify(S.books || []);
    var beforeE = JSON.stringify(S.entries || []);
    S.personas = mergeListLWW(S.personas, remote.personas, 'personas', tombMap);
    S.books = mergeListLWW(S.books, remote.books, 'books', tombMap);
    S.entries = mergeListLWW(S.entries, remote.entries, 'entries', tombMap);
    var nextTombs = [], tk;
    for (tk in tombMap) {
      if (Object.prototype.hasOwnProperty.call(tombMap, tk)) { nextTombs.push(tombMap[tk]); }
    }
    S.tombstones = nextTombs;
    pruneTombstones();
    var changed = (JSON.stringify(S.personas) !== beforeP)
      || (JSON.stringify(S.books) !== beforeB)
      || (JSON.stringify(S.entries) !== beforeE)
      || (JSON.stringify(S.tombstones) !== beforeTombs);
    if (changed) {
      S.last = S.last || { view: 'shelf', bid: '' };
    }
    return changed;
  }
  function refreshCurrentView() {
    var cur = currentScreen();
    try {
      if (cur === 'shelf') { renderShelf(); }
      else if (cur === 'whisper') { renderWhisper(); }
      else if (cur === 'trash') { renderTrash(); }
      else if (cur === 'recall') { renderRecall(); }
      else if (cur === 'search') { renderSearch(); }
    } catch (eR) { }
  }
  function syncMediaStep(report) {
    if (!mediaSyncReady()) { return Promise.resolve({ uploaded: 0, downloaded: 0, failedUp: 0, failedDown: 0, error: '' }); }
    var needed = {};
    (S.entries || []).forEach(function (e) {
      if (!e || e.deletedAt || !Array.isArray(e.media)) { return; }
      e.media.forEach(function (m) { if (m && m.id) { needed[m.id] = 1; } });
    });
    var mediaIds = Object.keys(needed);
    var delTombs = (S.tombstones || []).filter(function (tb) { return tb && tb.entity === 'media' && tb.id; }).map(function (tb) { return tb.id; });
    if (!mediaIds.length && !delTombs.length) { return Promise.resolve({ uploaded: 0, downloaded: 0, failedUp: 0, failedDown: 0, error: '' }); }
    return AR.Sync.blobMediaList().then(function (rList) {
      var remoteSet = {};
      (rList.ids || []).forEach(function (id) { remoteSet[id] = 1; });
      var toUp = mediaIds.filter(function (id) { return !remoteSet[id]; });
      var toDown = mediaIds.filter(function (id) { return !!remoteSet[id]; });
      var toDel = delTombs.filter(function (id) { return !!remoteSet[id]; });
      var upCount = 0, downCount = 0, failedUp = 0, failedDown = 0, lastErr = '';

      var checkDown = [];
      return Promise.all(toDown.map(function (id) {
        return loadMediaLocal(id).then(function (loc) { if (!loc) { checkDown.push(id); } });
      })).then(function () {
        var totalOps = toUp.length + checkDown.length + toDel.length;
        if (!totalOps) { return { uploaded: 0, downloaded: 0, failedUp: 0, failedDown: 0, error: '' }; }
        var doneOps = 0;
        function bump(label) {
          doneOps++;
          var pct = 55 + Math.round((doneOps / totalOps) * 28);
          report(pct, label + ' (' + doneOps + '/' + totalOps + ')…');
        }
        var chain = Promise.resolve();
        toUp.forEach(function (id) {
          chain = chain.then(function () {
            return loadMediaLocal(id).then(function (rec) {
              if (!rec || !rec.dataUrl) {
                failedUp++;
                if (!lastErr) { lastErr = '本机缺少原图数据'; }
                bump('跳过缺失原图');
                return;
              }
              return compressMediaForCloud(rec).then(function (comp) {
                return AR.Sync.blobMediaPush(id, comp).then(function () { upCount++; bump('压缩上传配图'); });
              });
            }).catch(function (errUp) {
              failedUp++;
              if (!lastErr) { lastErr = (errUp && errUp.message) || '配图上传失败'; }
              bump('配图上传失败');
            });
          });
        });
        checkDown.forEach(function (id) {
          chain = chain.then(function () {
            return AR.Sync.blobMediaPull(id).then(function (rec) {
              if (rec && rec.dataUrl) {
                return saveMediaLocal(id, rec).then(function () { downCount++; bump('拉取配图'); });
              }
              bump('拉取配图');
            }).catch(function (errDown) {
              failedDown++;
              if (!lastErr) { lastErr = (errDown && errDown.message) || '配图拉取失败'; }
              bump('配图拉取失败');
            });
          });
        });
        toDel.forEach(function (id) {
          chain = chain.then(function () {
            return AR.Sync.blobMediaDelete(id).then(function () { bump('清理云端旧图'); }).catch(function () { bump('清理云端旧图'); });
          });
        });
        return chain.then(function () {
          if (downCount > 0) { refreshCurrentView(); }
          return { uploaded: upCount, downloaded: downCount, failedUp: failedUp, failedDown: failedDown, error: lastErr };
        });
      });
    }).catch(function (errList) {
      return { uploaded: 0, downloaded: 0, failedUp: mediaIds.length, failedDown: 0, error: (errList && errList.message) || '获取云端图片清单失败' };
    });
  }

  function syncBlob(explicit, onProgress) {
    function report(pct, msg) {
      if (typeof onProgress === 'function') { try { onProgress(pct, msg); } catch (eP) { } }
    }
    if (!S || !ready || corruptLocked) {
      return explicit ? Promise.reject(new Error('Whisper 尚未就绪')) : Promise.resolve({ skipped: true });
    }
    if (!syncReady()) {
      var st = (window.AR && AR.Sync && AR.Sync.status) ? AR.Sync.status() : null;
      var reason = (st && st.configured && st.syncWhisperEnabled === false) ? '已在设置中关闭日记云同步' : '未配置云同步';
      return explicit ? Promise.reject(new Error(reason)) : Promise.resolve({ skipped: true });
    }
    if (blobBusy && activeSyncPromise) { return activeSyncPromise; }
    if (blobTimer) { clearTimeout(blobTimer); blobTimer = null; }
    blobBusy = true;
    var ns = 'whisper';
    var attempt = 0;
    var genAtPush = saveGen;
    function one() {
      attempt++;
      report(15, '拉取云端日记…');
      return AR.Sync.blobPull(ns).then(function (remote) {
        report(45, '合并日记记录…');
        var remoteRev = 0;
        if (remote && remote.data) {
          remoteRev = Number(remote.rev) || 0;
          var changed = mergeBlob(remote.data);
          if (changed) { refreshCurrentView(); }
        }
        return syncMediaStep(report).then(function (mediaRes) {
          var rev = Math.max(Number(S.syncRev) || 0, remoteRev);
          var localHas = !!((S.books && S.books.length) || (S.entries && S.entries.length) || (S.personas && S.personas.length) || (S.tombstones && S.tombstones.length));
          var needPush = !!S.syncDirty || (remoteRev === 0 && localHas);
          if (!needPush) {
            report(100, '同步完成');
            return { rev: rev, pushed: false, media: mediaRes };
          }
          report(86, '加密上传日记…');
          genAtPush = saveGen;
          var payload = { v: 2, books: S.books, entries: S.entries, personas: S.personas, tombstones: S.tombstones || [], at: Date.now() };
          return AR.Sync.blobPush(ns, payload, rev).then(function (r) {
            report(100, '同步完成');
            return { rev: (r && r.rev) || rev + 1, pushed: true, media: mediaRes };
          });
        });
      });
    }
    function step() {
      return one().then(function (r) {
        if (r && r.rev) { S.syncRev = r.rev; }
        if (r && r.pushed && saveGen === genAtPush) { S.syncDirty = false; }
        blobBusy = false;
        activeSyncPromise = null;
        return persistQuiet().then(function () {
          if (r && r.media && r.media.failedUp > 0) {
            toast('文字已同步，' + r.media.failedUp + ' 张配图上传失败：' + (r.media.error || '请稍后重试'));
          }
          /* 同步途中又存了盘（dirty 还挂着）→ 再排一次，别把最后一条丢在半路 */
          if (S.syncDirty) { scheduleBlobSync(); }
          return r;
        });
      }).catch(function (err) {
        if (err && err.code === 'CONFLICT' && attempt < 3) {
          var rr = err.remote && err.remote.rev;
          if (rr != null) { S.syncRev = Number(rr) || 0; }
          return step();
        }
        blobBusy = false;
        activeSyncPromise = null;
        return persistQuiet().then(function () {
          if (explicit) { throw err; }
          return { error: err };
        });
      });
    }
    activeSyncPromise = step();
    return activeSyncPromise;
  }
  function pushCloudWipe() {
    if (!syncReady()) { return Promise.resolve({ skipped: true }); }
    var ns = 'whisper';
    var attempt = 0;
    function collectTombs(remoteData) {
      var map = {}, now = Date.now(), i;
      function put(entity, id, ms) {
        if (!id) { return; }
        var k = entity + ':' + id;
        if (!map[k] || map[k].deletedMs < ms) { map[k] = { entity: entity, id: id, deletedMs: ms }; }
      }
      if (S) {
        (S.tombstones || []).forEach(function (t) { if (t) { put(t.entity, t.id, Number(t.deletedMs) || now); } });
        (S.books || []).forEach(function (b) { if (b) { put('books', b.id, now); } });
        (S.entries || []).forEach(function (e) { if (e) { put('entries', e.id, now); } });
        (S.personas || []).forEach(function (p) { if (p) { put('personas', p.id, now); } });
      }
      if (remoteData && typeof remoteData === 'object') {
        (remoteData.tombstones || []).forEach(function (t) { if (t) { put(t.entity, t.id, Number(t.deletedMs) || now); } });
        (remoteData.books || []).forEach(function (b) { if (b) { put('books', b.id, now); } });
        (remoteData.entries || []).forEach(function (e) { if (e) { put('entries', e.id, now); } });
        (remoteData.personas || []).forEach(function (p) { if (p) { put('personas', p.id, now); } });
      }
      var list = [];
      for (i in map) { if (Object.prototype.hasOwnProperty.call(map, i)) { list.push(map[i]); } }
      return list;
    }
    function attemptWipe() {
      attempt++;
      return AR.Sync.blobPull(ns).then(function (remote) {
        var rev = remote ? (Number(remote.rev) || 0) : (Number(S && S.syncRev) || 0);
        var tombs = collectTombs(remote && remote.data);
        var payload = { v: 2, books: [], entries: [], personas: [], tombstones: tombs, at: Date.now(), resetAt: Date.now() };
        return AR.Sync.blobPush(ns, payload, rev);
      }).catch(function (err) {
        if (err && err.code === 'CONFLICT' && attempt < 3) { return attemptWipe(); }
        throw err;
      });
    }
    return attemptWipe();
  }
  function resetAll(opts) {
    opts = opts || {};
    if (S && S.lock && S.lock.enabled && !session.unlocked && !corruptLocked && !opts.bypassLock) {
      return Promise.reject(new Error('Whisper 已上锁，请先解锁'));
    }
    var canClearCloud = !!(opts.clearCloud && window.AR && AR.Sync && AR.Sync.status && AR.Sync.status().configured);
    var pre = canClearCloud ? pushCloudWipe().then(function () {
      return AR.Sync.blobMediaDelete ? AR.Sync.blobMediaDelete('*').catch(function () { }) : null;
    }) : Promise.resolve();
    return pre.then(function () {
      if (blobTimer) { clearTimeout(blobTimer); blobTimer = null; }
      return clearAllMediaLocal().catch(function () { }).then(function () {
        try { localStorage.removeItem(LS_ENC); localStorage.removeItem(LS); } catch (e) { }
      corruptLocked = false;
        ready = false;
        S = null;
        relock();
        return load().then(function () { renderShelf(); toast('已重置'); return true; });
      });
    });
  }

  /* ── 返回：侧滑 / 返回键 / Esc ────────────────────────────
     逐级退：弹层 → 目录 → 当前屏自己的返回按钮 → 书架 → 关掉日记回到应用。
     任何一级都在日记内部消化掉，不会把 App 一起退出。 */
  var BACK_BTN = {
    shelf: 'shBack', whisper: 'wBack',
    composer: 'cCancel', search: 'srBack', recall: 'rcBack', trash: 'trBack'
  };
  function currentScreen() {
    var rt = $('whRoot');
    if (!rt || rt.hasAttribute('hidden')) { return ''; }
    for (var k in SC) {
      if (!Object.prototype.hasOwnProperty.call(SC, k)) { continue; }
      var el = $(SC[k]);
      if (el && !el.hidden) { return k; }
    }
    return '';
  }
  /* true = 这次返回被日记吃掉了；false = 日记没开，交给应用 */
  function backStep() {
    var rt = $('whRoot');
    if (!rt || rt.hasAttribute('hidden')) { return false; }
    if (lbState.open) { closeLightbox(); return true; }
    if (mask && mask.classList.contains('on')) { closeSheet(); return true; }
    if (tocState.open) { closeToc(); return true; }
    var cur = currentScreen();
    if (cur === 'lock') {
      if (lockPurpose === 'secret' || lockPurpose === 'secret-set') {
        lockPurpose = 'main'; pendingSecretCb = null; show('shelf'); return true;
      }
      closeRoot();
      return true;
    }
    var btn = BACK_BTN[cur] ? $(BACK_BTN[cur]) : null;
    if (btn) { btn.click(); return true; }
    closeRoot();
    return true;
  }

  /* 调试出口 */
  window.__whisper = {
    state: function () { return S; },
    theme: function () { return S ? S.theme : null; },
    setTheme: function (p) { S.theme = JSON.parse(JSON.stringify(PRESETS[p])); S.theme.name = p; applyTheme(); save(); },
    setColor: function (path, v) { setPath(path, v); applyTheme(); save(); },
    opts: function (k, v) { if (v === undefined) { return S.opts[k]; } S.opts[k] = v; save(); },
    open: function () {
      try { localStorage.setItem('abbeyroad.whisper.seen', '1'); } catch (e0) { }
      whenReady(function () { openNow(); });
    },
    close: function () { closeRoot(); },
    enter: enter,
    unlock: function () { session.unlocked = true; afterUnlock(); },
    relock: relock,
    whenReady: whenReady,
    openShelf: function () { requireUnlock(function () { S.last.view = 'shelf'; save(); renderShelf(); show('shelf'); }); },
    openBook: function (bid) { requireUnlock(function () { S.last = { view: 'read', bid: bid }; save(); renderWhisper(); show('whisper'); playEnterFx(); }); },
    toc: function (dir) { openToc(dir || 'right'); },
    closeToc: closeToc,
    lockState: function () {
      if (!S || !S.lock) { return { enabled: true, hasPin: false, bio: false, unlocked: false }; }
      return { enabled: S.lock.enabled, hasPin: !!S.lock.hash, bio: !!(canBio() && S.lock.bio), unlocked: session.unlocked };
    },
    persist: save,
    setState: function (o) { if (!o) { return; } S = normalize(o); save(); try { applyTheme(); } catch (e0) { } },
    trash: function () {
      var fromOutside = !currentScreen();
      requireUnlock(function () { openTrash(fromOutside ? 'close' : ''); });
    },
    exportSheet: function () { openStandaloneAction(sheetExport); },
    exportCurrent: function () {
      requireUnlock(function () {
        try {
          var files = buildMd('single');
          if (!files || !files.length) { toast('还没有内容'); return; }
          var text = files.map(function (f) { return '# ' + f.name + '\n\n' + f.text; }).join('\n\n');
          if (window.AR && AR.Bridge) {
            if (AR.Bridge.shareFile) { AR.Bridge.shareFile(files[0].name, files[0].text); return; }
            if (AR.Bridge.share) { AR.Bridge.share(text); return; }
          }
          download(files[0].name, files[0].text);
          toast('已导出 ' + files[0].name);
        } catch (e) { }
      });
    },
    resetAll: resetAll,
    applyAll: function () { applyTheme(); applyAppHeat(); if (currentScreen()) { refreshCurrentView(); } },
    consumePendingImport: consumePendingImport,
    importText: importWhisperText,
    openImport: function () { openStandaloneAction(openImportSheet); },
    unlockSecret: openSecretUnlock,
    hideSecret: hideSecretMode,
    entryCardImage: function (eid, overrideOpts, metaOut) {
      var ent = S.entries.filter(function (x) { return x.id === eid; })[0];
      if (!ent) { return Promise.reject(new Error('not found')); }
      return buildEntryCardDataUrl(ent, bookByIdAny(ent.bid), overrideOpts, metaOut);
    },
    entryPlainText: function (eid, withMeta) {
      var ent = S.entries.filter(function (x) { return x.id === eid; })[0];
      return ent ? formatEntryPlainText(ent, bookByIdAny(ent.bid), withMeta) : '';
    },
    lock: function (onSuccess) {
      if (typeof onSuccess === 'function') { openLock(onSuccess); return; }
      var rt = $('whRoot'); if (rt) { rt.removeAttribute('hidden'); document.body.classList.add('wh-open'); }
      lockPurpose = 'main'; pendingSecretCb = null; pendingExternalCb = null; pendingInternalCb = null;
      pinStage = (S && S.lock && S.lock.hash) ? 'verify' : 'set'; pendChange = false;
      openLock();
    },
    changePin: function () {
      whenReady(function () {
        var rt = $('whRoot'); if (rt) { rt.removeAttribute('hidden'); document.body.classList.add('wh-open'); }
        lockPurpose = 'main'; pendingSecretCb = null; pendingExternalCb = null; pendingInternalCb = null;
        pendChange = !!(S && S.lock && S.lock.hash);
        pinStage = pendChange ? 'verify' : 'set';
        openLock();
      });
    },
    syncNow: function (onProgress) { return syncBlob(true, onProgress); },
    handleBack: backStep,
    exportMd: buildMd
  };

  applyTheme();
  applyAppHeat();
  closeRoot();
})();


/* 对外 API */
window.AR = window.AR || {};
window.AR.Whisper = {
  open: function () { try { window.__whisper.open(); } catch (e) { } },
  close: function () { try { window.__whisper.close(); } catch (e) { } },
  data: function () { try { return window.__whisper.state(); } catch (e) { return null; } },
  state: function () { try { return window.__whisper.state(); } catch (e) { return null; } },
  save: function (o) {
    try {
      var ls = window.__whisper && window.__whisper.lockState && window.__whisper.lockState();
      if (ls && ls.enabled && !ls.unlocked && (ls.hasPin || ls.bio)) { return; }
      if (o && typeof o === 'object' && window.__whisper && window.__whisper.setState) { window.__whisper.setState(o); return; }
      if (window.__whisper && window.__whisper.persist) { window.__whisper.persist(); }
    } catch (e) { }
  },
  apply: function () { try { window.__whisper.applyAll(); } catch (e) { } },
  openLock: function (onSuccess) { try { window.__whisper.lock(onSuccess); } catch (e) { } },
  changePin: function () { try { window.__whisper.changePin(); } catch (e) { } },
  relock: function () { try { window.__whisper.relock(); } catch (e) { } },
  lockState: function () { try { return window.__whisper.lockState(); } catch (e) { return { enabled: true, hasPin: false, bio: false, unlocked: false }; } },
  whenReady: function (fn) { try { window.__whisper.whenReady(fn); } catch (e) { } },
  openTrash: function () { try { window.__whisper.trash(); } catch (e) { } },
  openExport: function () { try { window.__whisper.exportSheet(); } catch (e) { } },
  syncNow: function (onProgress) {
    try { return window.__whisper.syncNow(onProgress); }
    catch (e) { return Promise.reject(e); }
  },
  consumePendingImport: function (text, name) {
    try { return !!(window.__whisper && window.__whisper.consumePendingImport && window.__whisper.consumePendingImport(text, name)); }
    catch (e) { return false; }
  },
  importText: function (text, name) {
    try { return window.__whisper.importText(text, name); }
    catch (e) { return Promise.reject(e); }
  },
  openImport: function () { try { window.__whisper.openImport(); } catch (e) { } },
  /** 返回一步；true 表示日记把这次返回吃掉了（应用就别再处理） */
  handleBack: function () { try { return !!window.__whisper.handleBack(); } catch (e) { return false; } },
  exportCurrent: function () { try { window.__whisper.exportCurrent(); } catch (e) { } },
  reset: function (opts) {
    try { return window.__whisper.resetAll(opts); }
    catch (e) { return Promise.reject(e); }
  }
};

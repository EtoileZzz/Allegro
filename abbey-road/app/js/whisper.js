/* 由 demo 自动生成；改结构请改 demo 再生成 */
(function () {
  'use strict';
  if (document.getElementById('whRoot')) { return; }
  var tpl = "<div class=\"wh-root\" id=\"whRoot\" hidden>\n\n  <section class=\"screen lock\" id=\"s-lock\" hidden>\n    <div class=\"icn\">✦</div>\n    <div style=\"text-align:center\"><h2 id=\"lockTitle\">输入 PIN</h2><p id=\"lockSub\">Whisper 已上锁</p></div>\n    <div class=\"pin\" id=\"pinDots\"></div>\n    <div class=\"pad\" id=\"pad\"></div>\n    <button class=\"linkrow\" id=\"bioBtn\">使用生物识别（原型模拟）</button>\n    <button class=\"linkrow\" id=\"skipBtn\" style=\"color:var(--w-mid)\">先不设锁，直接进入</button>\n  </section>\n\n  <section class=\"screen\" id=\"s-shelf\" hidden>\n    <div class=\"topbar\">\n      <button class=\"btn\" id=\"shBack\">‹</button>\n      <span style=\"width:68px;flex:0 0 auto\"></span>\n      <div class=\"title\"><b style=\"font-family:var(--font-serif);font-size:17px;letter-spacing:.6px\">Whisper</b><span id=\"shSub\"></span></div>\n      <button class=\"btn\" id=\"shSearch\">⌕</button>\n      <button class=\"btn\" id=\"shRecall\" title=\"回顾\">◷</button>\n      <button class=\"btn\" id=\"shNew\">＋</button>\n    </div>\n    <div class=\"scroll\"><div class=\"shelf\" id=\"shelfList\"></div></div>\n  </section>\n\n  <section class=\"screen\" id=\"s-whisper\" hidden>\n    <div class=\"topbar\">\n      <button class=\"btn\" id=\"wBack\">‹</button>\n      <div class=\"title\"><b id=\"wTitle\" style=\"font-family:var(--font-serif);font-size:21px;letter-spacing:.5px;max-width:250px\">—</b><span id=\"wSub\" style=\"display:none\"></span></div>\n      <button class=\"btn\" id=\"wMenu\">⋯</button>\n    </div>\n    <div class=\"pullhint\" id=\"pullHint\">下拉写一条</div>\n    <div class=\"scroll\" id=\"wBody\"></div>\n    <button class=\"fab\" id=\"wWrite\">✎</button>\n  </section>\n\n  <section class=\"screen\" id=\"s-appset\" hidden>\n    <div class=\"topbar\"><button class=\"btn\" id=\"asBack\">‹</button><div class=\"title\"><b>设置</b><span>应用</span></div><span style=\"width:30px\"></span></div>\n    <div class=\"scroll\"><div class=\"appset\" id=\"appsetList\"></div></div>\n  </section>\n\n  <section class=\"screen\" id=\"s-settings\" hidden>\n    <div class=\"topbar\">\n      <button class=\"btn\" id=\"stBack\">‹</button>\n      <div class=\"title\"><b>Whisper 设置</b><span>只影响 Whisper 内部</span></div>\n      <span style=\"width:30px\"></span>\n    </div>\n    <div class=\"scroll\"><div class=\"settings\" id=\"settingsList\"></div></div>\n  </section>\n\n  <section class=\"screen composer\" id=\"s-composer\" hidden>\n    <div class=\"topbar\">\n      <button class=\"btn\" id=\"cCancel\">✕</button>\n      <div class=\"title\"><b>写一条</b><span id=\"cWhen\"></span></div>\n      <button class=\"btn\" id=\"cSave\">✓</button>\n    </div>\n    <div class=\"body\">\n      <textarea id=\"cText\"></textarea>\n      <div class=\"meta\">\n        <div class=\"field\" style=\"margin-top:0\">Persona</div>\n        <div class=\"personachips\" id=\"cPersona\"></div>\n        <div class=\"field\">写进</div>\n        <div class=\"personachips\" id=\"cBook\"></div>\n        <button class=\"save\" id=\"cSave2\">保存</button>\n      </div>\n    </div>\n  </section>\n\n  <section class=\"screen\" id=\"s-search\" hidden>\n    <div class=\"topbar\"><button class=\"btn\" id=\"srBack\">‹</button><div class=\"title\"><b>搜索</b><span id=\"srSub\">当前本</span></div><button class=\"btn\" id=\"srScope\" style=\"width:auto;padding:0 8px;font-size:11.5px;color:var(--w-a2)\">当前本</button></div>\n    <div class=\"searchbar\"><input id=\"srInput\" placeholder=\"搜标题或正文…\" autocomplete=\"off\"><button class=\"x\" id=\"srClear\">✕</button></div>\n    <div class=\"scroll\"><div class=\"sres\" id=\"srBody\"></div></div>\n  </section>\n\n  <section class=\"screen\" id=\"s-trash\" hidden>\n    <div class=\"topbar\"><button class=\"btn\" id=\"trBack\">‹</button><div class=\"title\"><b>回收站</b><span id=\"trSub\"></span></div><button class=\"btn\" id=\"trClear\">清空</button></div>\n    <div class=\"scroll\"><div class=\"trash\" id=\"trBody\"></div></div>\n  </section>\n\n  <section class=\"screen\" id=\"s-recall\" hidden>\n    <div class=\"topbar\"><button class=\"btn\" id=\"rcBack\">‹</button><div class=\"title\"><b style=\"font-size:24px;letter-spacing:.6px\">回顾</b><span style=\"display:none\"></span></div><span style=\"width:30px\"></span></div>\n    <div class=\"scroll\"><div class=\"recall\" id=\"rcBody\"></div></div>\n  </section>\n\n  <div class=\"toc-mask\" id=\"tocMask\"></div>\n  <div class=\"toc from-right\" id=\"toc\"><div class=\"th\"><div class=\"tt\"><b>目录</b><span id=\"tocSub\"></span></div><button class=\"tc\" id=\"tocClose\">✕</button></div><div class=\"tl\" id=\"tocList\"></div></div>\n\n  <div class=\"sheet-mask\" id=\"mask\"></div>\n  <div class=\"sheet\" id=\"sheet\"></div>\n  <div class=\"toast\" id=\"toast\"></div></div>";
  var holder = document.createElement('div');
  holder.innerHTML = tpl;
  var node = holder.firstChild;
  if (node) { document.body.appendChild(node); }
})();

(function () {
  'use strict';
  var LS = 'abbeyroad.whisper.v1';
  var SERIF = 'Georgia,"Songti SC","Noto Serif SC",serif';
  var SWATCHES = ['#141413', '#2b2620', '#5a5750', '#b0aea5', '#e8e6dc', '#f4efe4', '#faf9f5', '#ffffff',
    '#d97757', '#e8843c', '#d9a22b', '#788c5d', '#2fb37a', '#1fa8a0', '#6a9bcc', '#5b8def',
    '#7c6ee6', '#d9649b', '#e5484d', '#c0504a', '#5a6072', '#8fa68e', '#a98d91', '#c2703c'];
  var PRESETS = {
    claudePaper: { name: 'Claude 纸', mode: 'paper', base: { dark: '#141413', light: '#faf9f5', mid: '#b0aea5', subtle: '#e8e6dc' }, accent: { a1: '#d97757', a2: '#6a9bcc', a3: '#788c5d' } },
    claudeNight: { name: 'Claude 夜', mode: 'night', base: { dark: '#141413', light: '#faf9f5', mid: '#b0aea5', subtle: '#e8e6dc' }, accent: { a1: '#d97757', a2: '#6a9bcc', a3: '#788c5d' } },
    oldPaper: { name: '旧纸感', mode: 'paper', base: { dark: '#2b2620', light: '#f4efe4', mid: '#8b7f6a', subtle: '#ddd2bd' }, accent: { a1: '#b4654a', a2: '#6a8fb0', a3: '#7d8f5d' } }
  };
  var COLORS = ['#7aa2f7', '#9ece6a', '#e0af68', '#bb9af7', '#7dcfff', '#f7768e', '#2ac3de', '#c0caf5'];

  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function dkey(off) { var d = new Date(); d.setDate(d.getDate() - (off || 0)); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function uid(p) { return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; } return String(h); }

  function seed() {
    return {
      books: [],
      personas: [],
      entries: [],
      theme: (function () { var t = JSON.parse(JSON.stringify(PRESETS.claudePaper)); t.mode = 'app'; t.name = 'claudePaper'; return t; })(),
      opts: { layout: 'A', grouped: true, filter: 'all', shelf: 'hero', menu: 'grid', composer: 'sheet', sort: 'recent', enterFx: true },
      appTheme: 'light',
      appHeat: { size: 'sm' },
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
  function load() {
    return new Promise(function (resolve) {
      var finish = function (d) { S = normalize(d || seed()); fireReady(); resolve(S); };
      var enc = readRaw();
      if (enc) {
        decryptText(enc).then(function (txt) {
          var d = null; try { d = JSON.parse(txt); } catch (e) { d = null; }
          finish(d);
        }).catch(function () { finish(null); });
        return;
      }
      var legacy = readLegacy();
      if (legacy) {
        var d2 = null; try { d2 = JSON.parse(legacy); } catch (e2) { d2 = null; }
        S = normalize(d2 || seed());
        encryptText(JSON.stringify(S)).then(function (blob) {
          try { localStorage.setItem(LS_ENC, blob); localStorage.removeItem(LS); } catch (e3) { }
          fireReady(); resolve(S);
        }).catch(function () { fireReady(); resolve(S); });
        return;
      }
      finish(null);
    });
  }
  function save() {
    if (!ready || !S) { return; }
    S.syncDirty = true;
    scheduleBlobSync();
    encryptText(JSON.stringify(S)).then(function (blob) {
      try { localStorage.setItem(LS_ENC, blob); localStorage.removeItem(LS); } catch (e) { }
    }).catch(function () { });
  }
  function normalize(d) {
    var def = { opts: { layout: 'A', grouped: true, filter: 'all', shelf: 'hero', menu: 'grid', composer: 'sheet', sort: 'recent', enterFx: true } }, k;
    d.books = d.books || [];
    d.entries = d.entries || [];
    d.personas = d.personas || [];
    var o = d.opts || {};
    for (k in def.opts) { if (o[k] === undefined) { o[k] = def.opts[k]; } }
    d.opts = o;
    if (!d.theme) { d.theme = { mode: 'app', base: { dark: '#141413', light: '#faf9f5', mid: '#b0aea5', subtle: '#e8e6dc' }, accent: { a1: '#d97757', a2: '#6a9bcc', a3: '#788c5d' } }; }
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
  var session = { unlocked: false };

  /* ── 主题 ── */
  function applyTheme() {
    if (!S) { return; }
    var t = S.theme || PRESETS.claudePaper;
    var mode = t.mode || 'app';
    if (mode === 'app') {
      var at = S.appTheme || 'light';
      try {
        var bt = document.body.getAttribute('data-theme');
        if (bt === 'dark' || bt === 'light') { at = bt; }
      } catch (e0) { }
      try {
        var ap = (window.AR && AR.Store && AR.Store.data && AR.Store.data.settings && AR.Store.data.settings.appearance) || null;
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
  }

  /* ── 屏幕 ── */
  var SC = { lock: 's-lock', shelf: 's-shelf', whisper: 's-whisper', settings: 's-settings', composer: 's-composer', search: 's-search', recall: 's-recall', trash: 's-trash', appset: 's-appset' };
  function show(name) {
    var rt = $('whRoot');
    if (rt) { rt.removeAttribute('hidden'); }
    Object.keys(SC).forEach(function (k) {
      var el = $(SC[k]);
      if (k === name) { el.hidden = false; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); }
      else { el.hidden = true; el.classList.remove('in'); }
    });
  }
  function toast(m) {
    if (window.AR && AR.UI && AR.UI.toast) { AR.UI.toast(m); return; }
    var t = $('toast');
    if (!t) { return; }
    t.textContent = m;
    t.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('on'); }, 1600);
  }
  function toastAction(m, label, cb) {
    var t = $('toast');
    t.textContent = m;
    var b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'margin-left:10px;border:0;background:transparent;color:#fff;font:inherit;font-size:12px;text-decoration:underline;cursor:pointer';
    b.onclick = function (ev) { ev.stopPropagation(); try { cb(); } catch (e) { } t.classList.remove('on'); };
    t.appendChild(b);
    t.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('on'); }, 3500);
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* ── 数据 ── */
  function bookById(id) { for (var i = 0; i < S.books.length; i++) { if (S.books[i].id === id && !S.books[i].deletedAt) { return S.books[i]; } } return null; }
  function personaById(id) {
    if (!id) { return { id: '', n: '', c: '' }; }
    for (var i = 0; i < S.personas.length; i++) { if (S.personas[i].id === id) { return S.personas[i]; } }
    if (String(id).indexOf('tmp:') === 0) { return { id: id, n: decodeURIComponent(String(id).slice(4)), c: '#9a948a', tmp: true }; }
    return { id: id, n: '', c: '' };
  }
  function entriesOf(bid) { return S.entries.filter(function (e) { return e.bid === bid && !e.deletedAt; }).sort(function (a, b) { return a.at < b.at ? 1 : -1; }); }
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
    if (S.last.view === 'read' && bookById(S.last.bid)) { renderWhisper(); show('whisper'); playEnterFx('s-whisper'); }
    else { renderShelf(); show('shelf'); playEnterFx('s-shelf'); }
  }

  /* ── 锁 ── */
  var pin = '';
  var pendChange = false;
  var bioTried = false;
  function openLock() {
    bioTried = false;
    pin = '';
    var hasPin = !!S.lock.hash;
    $('lockTitle').textContent = hasPin ? '输入 PIN' : '设置一个 6 位 PIN';
    $('lockSub').textContent = hasPin ? (S.lock.bio ? '可用生物识别或 PIN' : 'Whisper 已上锁') : 'PIN 可选：也可以只用指纹 / 面容';
    $('bioBtn').style.display = (hasPin && S.lock.bio) ? '' : 'none';
    $('skipBtn').style.display = hasPin ? 'none' : '';
    renderPin();
    show('lock');
    if (S.lock.enabled && S.lock.bio && !bioTried) {
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
    if (!S.lock.hash) { S.lock.hash = hash(pin); save(); pin = ''; renderPin(); toast('PIN 已设置'); pendChange = false; afterUnlock(); return; }
    if (hash(pin) === S.lock.hash) {
      if (pendChange) { pendChange = false; S.lock.hash = ''; save(); pin = ''; renderPin(); openLock(); toast('请输入新 PIN'); return; }
      pin = ''; renderPin(); afterUnlock();
    }
    else { $('pinDots').classList.add('shake'); setTimeout(function () { $('pinDots').classList.remove('shake'); }, 340); pin = ''; renderPin(); toast('PIN 不对'); }
  }
  $('bioBtn').addEventListener('click', tryBio);
  $('skipBtn').addEventListener('click', function () {
    S.lock.optional = true;
    S.lock.enabled = S.lock.bio;   // 没 PIN 就只靠生物识别；设备不支持则等于不上锁
    save(); toast(S.lock.enabled ? '没有 PIN，将只用生物识别' : '已关闭锁屏'); afterUnlock();
  });
  function tryBio() {
    if (!S.lock.hash && !S.lock.bio) { toast('先设置 PIN'); return; }
    if (!(window.AR && AR.Bridge && AR.Bridge.biometricVerify)) {
      if (!S.lock.hash) { S.lock.enabled = false; save(); afterUnlock(); return; }
      toast('此设备不支持生物识别，请输入 PIN');
      return;
    }
    try {
      var r = AR.Bridge.biometricVerify();
      if (r && typeof r.then === 'function') {
        r.then(function (ok) {
          if (ok === true || ok === 'true' || (ok && (ok.ok === true || ok.success === true))) { afterUnlock(); }
          else { toast('没有通过'); }
        }).catch(function () { toast('生物识别失败'); });
        return;
      }
      if (r === true || r === 'true') { afterUnlock(); return; }
    } catch (e0) { toast('生物识别失败'); }
  }

  /* ── 列表 ── */
  function renderShelf() {
    S.books.forEach(function (b) { if (b.archived == null) { b.archived = false; } });
    var list = $('shelfList');
    var alive = S.books.filter(function (b) { return !b.deletedAt; });
    if (!alive.length) {
      list.className = 'shelf';
      list.innerHTML = '<div class="shelf-empty"><div class="k">W H I S P E R</div>'
        + '<div class="t"></div>'
        + '<div class="s"></div>'
        + '<button class="b" id="seNew">新建一本</button></div>';
      $('seNew').onclick = function () { newBookSheet(); };
      $('shSub').textContent = '0 本';
      return;
    }
    var style = S.opts.shelf || 'hero';
    list.className = 'shelf';
    var active = alive.filter(function (b) { return !b.archived; });
    var arch = alive.filter(function (b) { return b.archived; });
    var sort = S.opts.sort || 'recent';
    if (sort === 'name') { active = active.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'zh'); }); }
    else if (sort === 'count') { active = active.slice().sort(function (a, b) { return entriesOf(b.id).length - entriesOf(a.id).length; }); }
    else { active = active.slice().sort(function (a, b) { var la = entriesOf(a.id)[0], lb = entriesOf(b.id)[0]; return String(lb ? lb.at : '').localeCompare(String(la ? la.at : '')); }); }

    var h = '';
    if (style !== 'min') {
      var heroBook = active[0], heroEntry = heroBook ? entriesOf(heroBook.id)[0] : null;
      if (heroEntry) {
        var hp = personaById(heroEntry.pid);
        h += '<button class="hero" data-hero="' + heroBook.id + '"><div class="k">继 续 写</div>'
          + '<div class="d">' + dayLabel(heroEntry.at.slice(0, 10)) + '<span>' + weekday(heroEntry.at.slice(0, 10)) + '</span></div>'
          + '<div class="x">' + esc(heroEntry.x) + '</div>'
          + '<div class="m">' + esc(heroBook.name) + ' · ' + entriesOf(heroBook.id).length + ' 条' + (hp.n ? ' · ' + esc(hp.n) : '') + '</div></button>';
      }
    }
    h += '<div class="books' + (style === 'grid2' ? ' grid2' : (style === 'min' ? ' min' : '')) + '">';
    active.forEach(function (b) {
      var es = entriesOf(b.id), last = (heroBook && heroBook.id === b.id && es.length > 1) ? es[1] : es[0], pds = '', seen = {};
      es.slice(0, 12).forEach(function (e) { if (!seen[e.pid]) { seen[e.pid] = 1; var p = personaById(e.pid); if (p.c) { pds += '<i style="background:' + p.c + '"></i>'; } } });
      var meta = last ? dayLabel(last.at.slice(0, 10)) + ' · ' + es.length + ' 条' : '空';
      h += '<button class="book" data-bid="' + b.id + '">'
        + '<span class="spine" style="background:linear-gradient(180deg,' + (b.spine || S.theme.accent.a1) + ',rgba(0,0,0,.18))"></span>'
        + '<span class="meta"><span class="name">' + esc(b.name) + '</span>'
        + '<span class="ex">' + (last ? esc(last.x) : '') + '</span>'
        + '<span class="foot"><span>' + meta + '</span><span class="pds">' + pds + '</span></span></span></button>';
    });
    h += '</div>';
    if (arch.length) {
      h += '<div class="arch">已归档 · ' + arch.length + '</div>';
      h += '<div class="books min">';
      arch.forEach(function (b) {
        h += '<button class="book" data-bid="' + b.id + '" style="opacity:.6"><span class="spine" style="background:var(--w-mid)"></span>'
          + '<span class="meta"><span class="name">' + esc(b.name) + '</span></span></button>';
      });
      h += '</div>';
    }
    list.innerHTML = h;
    $('shSub').textContent = alive.length + ' 本 · ' + S.entries.filter(function (e) { return !e.deletedAt; }).length + ' 条';
    var hv = list.querySelector('[data-hero]');
    if (hv) { hv.onclick = function () { S.last = { view: 'read', bid: hv.getAttribute('data-hero') }; save(); renderWhisper(); show('whisper'); playEnterFx(); }; }
  }
  function newBookSheet(cb) {
    openSheet('<h3>新建日记本</h3><input class="inp" id="nbName"><div class="btns"><button id="nbCancel">取消</button><button class="primary" id="nbOk">创建</button></div>', function () {
      $('nbName').focus();
      $('nbCancel').onclick = closeSheet;
      $('nbOk').onclick = function () {
        var nm = ($('nbName').value || '').trim();
        if (!nm) { toast('起个名字'); return; }
        var id = uid('b');
        S.books.push({ id: id, name: nm, spine: ['#d97757', '#6a9bcc', '#788c5d', '#b0aea5'][S.books.length % 4] });
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

  function renderWhisper() {
    var b = bookById(S.last.bid);
    if (!b) { var al = S.books.filter(function (x) { return !x.deletedAt; }); b = al[0]; }
    if (!b) { renderShelf(); show('shelf'); return; }
    $('wTitle').textContent = b.name;
    var all = entriesOf(b.id);
    var list = all.filter(function (e) { return S.opts.filter === 'all' || e.pid === S.opts.filter; });
    $('wSub').textContent = '';
    var body = $('wBody');
    if (S.opts.layout === 'C') { body.className = 'scroll cards' + (S.opts.grouped ? '' : ' flat'); body.innerHTML = renderCards(list); }
    else { body.className = 'scroll paper' + (S.opts.grouped ? '' : ' flat'); body.innerHTML = renderPaper(list); }
  }
  function renderPaper(list) {
    var gs = groupByDay(list), h = '<div class="inner">';
    if (!gs.length) { return '<div class="inner"><p style="color:var(--w-mid)">暂无</p></div>'; }
    gs.forEach(function (g) {
      h += '<div class="dayhead" data-day="' + g.d + '"><span class="d">' + dayLabel(g.d) + '</span><span class="w">' + weekday(g.d) + '</span></div>';
      g.items.forEach(function (e) {
        var p = personaById(e.pid);
        h += '<div class="entry" data-eid="' + e.id + '"><div class="t">' + e.at.slice(11) + '</div>'
          + '<div class="x">' + esc(e.x) + '</div>'
          + (p.n ? '<div class="sig"><span class="dot" style="background:' + p.c + '"></span>' + esc(p.n) + '</div>' : '') + '</div>';
      });
    });
    return h + '</div>';
  }
  function renderCards(list) {
    var gs = groupByDay(list), h = '';
    if (!gs.length) { return '<p style="color:var(--w-mid);font-size:12px">暂无</p>'; }
    gs.forEach(function (g) {
      h += '<div class="dayhead"><span class="d">' + dayLabel(g.d) + '</span><span class="w">' + weekday(g.d) + '</span></div>';
      g.items.forEach(function (e) {
        var p = personaById(e.pid);
        h += '<div class="entry"><div class="hd">' + (p.n ? '<span class="dot" style="background:' + p.c + '"></span>' + esc(p.n) : '')
          + '<span style="margin-left:auto">' + e.at.slice(11) + '</span></div>'
          + '<div class="x">' + esc(e.x) + '</div></div>';
      });
    });
    return h;
  }
  /* ── 设置页 ── */
  function openSettings() { renderSettings(); show('settings'); }
  function openAppSettings() {
    closeRoot();
    try { var tab = document.querySelector('.tabbar .nav-btn[data-nav="settings"]'); if (tab) { tab.click(); } } catch (e0) { }
    setTimeout(function () {
      try {
        var back = document.getElementById('setBackBtn');
        if (back) { back.click(); }
        setTimeout(function () {
          try { var h = document.querySelector('#set-whisper .set-cat-head'); if (h) { h.click(); } } catch (e2) { }
        }, 220);
      } catch (e1) { }
    }, 320);
  }
  function renderSettings() {
    var t = S.theme;
    var h = '';
    h += '<div class="sec">外观</div>';
    h += rowSeg('模式', 'mode', t.mode === 'night' ? 2 : (t.mode === 'app' ? 0 : 1), ['跟随应用', '纸', '夜']);
    h += rowAction('主题预设', PRESETS[t.name] ? PRESETS[t.name].name : '自定义', 'preset');
    h += colorRow('主文字 / 深色', t.base.dark, 'base.dark');
    h += colorRow('浅色背景', t.base.light, 'base.light');
    h += colorRow('次级灰', t.base.mid, 'base.mid');
    h += colorRow('微妙背景', t.base.subtle, 'base.subtle');
    h += colorRow('主强调', t.accent.a1, 'accent.a1');
    h += colorRow('次强调', t.accent.a2, 'accent.a2');
    h += colorRow('第三强调', t.accent.a3, 'accent.a3');
    h += '<div class="sec">列表与阅读</div>';
    h += rowSeg('列表样式', 'shelf', ({ hero: 0, grid2: 1, min: 2 })[S.opts.shelf] || 0, ['书架', '双列', '极简']);
    h += rowSeg('排版', 'layout', S.opts.layout === 'C' ? 1 : 0, ['纸感', '卡片流']);
    h += rowSeg('按日期分组', 'grouped', S.opts.grouped ? 0 : 1, ['开', '关']);
    h += rowSeg('菜单样式', 'menu', S.opts.menu === 'grid' ? 1 : 0, ['列表', '动作格']);
    h += rowSeg('写作样式', 'composer', S.opts.composer === 'full' ? 1 : 0, ['sheet', '全屏']);
    h += '<div class="sec">Persona与安全</div>';
    h += rowAction('管理 Persona', S.personas.length + ' 位', 'personas');
    h += rowAction('锁屏', S.lock.enabled ? (S.lock.hash ? 'PIN + 生物识别' : '仅生物识别') : '关闭', 'lock');
    h += rowSeg('进入动效', 'enterFx', S.opts.enterFx === false ? 1 : 0, ['开', '关']);
    h += rowSeg('热力图', 'heat', (S.appHeat && S.appHeat.size) === 'lg' ? 1 : 0, ['小', '大']);
    h += rowAction('回收站', deletedEntries().length + deletedBooks().length ? (deletedEntries().length + deletedBooks().length) + ' 项' : '空', 'trash');
    h += rowAction('导出 Markdown', '', 'export');
    h += '<div class="sec">其它</div>';
    h += rowAction('重置 demo 数据', '', 'reset');
    h += '';
    $('settingsList').innerHTML = h;
    Array.prototype.forEach.call($('settingsList').querySelectorAll('[data-act]'), function (el) {
      el.onclick = function () { onSetting(el.getAttribute('data-act'), el.getAttribute('data-arg')); };
    });
    Array.prototype.forEach.call($('settingsList').querySelectorAll('[data-seg]'), function (el) {
      Array.prototype.forEach.call(el.querySelectorAll('span'), function (sp, idx) {
        sp.onclick = function (ev) {
          ev.stopPropagation();
          onSeg(el.getAttribute('data-seg'), idx);
        };
      });
    });
  }
  function rowAction(label, right, act, arg) {
    return '<button class="row" data-act="' + act + '"' + (arg ? ' data-arg="' + arg + '"' : '') + '>' + label
      + '<span class="r">' + esc(right || '') + ' ›</span></button>';
  }
  function rowSeg(label, key, idx, opts) {
    var s = '<span class="seg" data-seg="' + key + '">';
    opts.forEach(function (o, i) { s += '<span class="' + (i === idx ? 'on' : '') + '">' + o + '</span>'; });
    s += '</span>';
    return '<div class="row" style="cursor:default">' + label + '<span class="r">' + s + '</span></div>';
  }
  function colorRow(label, hex, act) {
    return '<button class="row" data-act="color" data-arg="' + act + '">' + label
      + '<span class="r"><span class="chip" style="background:' + hex + '"></span>' + hex.toUpperCase() + ' ›</span></button>';
  }
  function onSeg(key, idx) {
    if (key === 'mode') { S.theme.mode = ['app', 'paper', 'night'][idx]; delete PRESETS[S.theme.name]; S.theme.name = ''; applyTheme(); save(); renderSettings(); return; }
    if (key === 'shelf') { S.opts.shelf = ['hero', 'grid2', 'min'][idx]; save(); renderShelf(); renderSettings(); return; }
    if (key === 'layout') { S.opts.layout = idx === 1 ? 'C' : 'A'; save(); renderSettings(); return; }
    if (key === 'grouped') { S.opts.grouped = idx === 0; save(); renderSettings(); return; }
    if (key === 'menu') { S.opts.menu = idx === 1 ? 'grid' : 'list'; save(); renderSettings(); return; }
    if (key === 'composer') { S.opts.composer = idx === 1 ? 'full' : 'sheet'; save(); renderSettings(); return; }
    if (key === 'heat') { S.appHeat = { size: idx === 1 ? 'lg' : 'sm' }; save(); applyAppHeat(); renderSettings(); return; }
    if (key === 'enterFx') { S.opts.enterFx = idx === 0; save(); renderSettings(); return; }
  }
  function onSetting(act, arg) {
    if (act === 'preset') { sheetPreset(); return; }
    if (act === 'color') {
      pickColor(getPath(arg), function (v) {
        setPath(arg, v);
        if (S.theme.name) { delete PRESETS[S.theme.name]; S.theme.name = ''; }
        applyTheme(); save(); renderSettings();
      });
      return;
    }
    if (act === 'personas') { sheetPersonas(); return; }
    if (act === 'lock') { sheetLock(); return; }
    if (act === 'trash') { openTrash(); return; }
    if (act === 'export') { sheetExport(); return; }
    if (act === 'reset') { try { localStorage.removeItem(LS); } catch (e) { } location.reload(); return; }
  }
  function sheetPreset() {
    var h = '<h3>主题预设</h3>';
    Object.keys(PRESETS).forEach(function (k) {
      h += '<button class="row" data-pk="' + k + '">' + PRESETS[k].name
        + '<span class="r"><span class="chip" style="background:' + PRESETS[k].base.light + '"></span>'
        + '<span class="chip" style="background:' + PRESETS[k].accent.a1 + '"></span>'
        + '<span class="chip" style="background:' + PRESETS[k].accent.a2 + '"></span>'
        + '<span class="chip" style="background:' + PRESETS[k].accent.a3 + '"></span></span></button>';
    });
    openSheet(h, function () {
      Array.prototype.forEach.call(sheet.querySelectorAll('[data-pk]'), function (b) {
        b.onclick = function () {
          S.theme = JSON.parse(JSON.stringify(PRESETS[b.getAttribute('data-pk')]));
          S.theme.name = b.getAttribute('data-pk');
          applyTheme(); save(); closeSheet(); renderSettings(); toast('已切换：' + S.theme.name);
        };
      });
    });
  }
  /* 取色器：仿 app 的 HSV 方块 + 色相条 + hex + 最近使用（支持任意颜色） */
  function h2r(h) { h = String(h || '').replace('#', ''); return { r: parseInt(h.slice(0, 2), 16) || 0, g: parseInt(h.slice(2, 4), 16) || 0, b: parseInt(h.slice(4, 6), 16) || 0 }; }
  function r2h(r, g, b) { function f(v) { var n = Math.max(0, Math.min(255, Math.round(v))).toString(16); return n.length === 1 ? '0' + n : n; } return '#' + f(r) + f(g) + f(b); }
  function rgb2hsv(r, g, b) { r /= 255; g /= 255; b /= 255; var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d) { if (mx === r) { h = ((g - b) / d) % 6; } else if (mx === g) { h = (b - r) / d + 2; } else { h = (r - g) / d + 4; } h *= 60; if (h < 0) { h += 360; } }
    return { h: h, s: mx ? d / mx : 0, v: mx }; }
  function hsv2rgb(h, s, v) { h = ((h % 360) + 360) % 360; var c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }; }
  var RECENT = 'whisper.recentColors';
  function recentList() { try { var r = localStorage.getItem(RECENT); return r ? JSON.parse(r) : []; } catch (e) { return []; } }
  function pushRecent(hex) { var l = recentList().filter(function (h) { return h.toLowerCase() !== hex.toLowerCase(); }); l.unshift(hex); try { localStorage.setItem(RECENT, JSON.stringify(l.slice(0, 8))); } catch (e) { } }
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
    var b = bookById(S.last.bid);
    if (!b) { var al = S.books.filter(function (x) { return !x.deletedAt; }); b = al[0]; }
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
    $('tocList').innerHTML = tocList();
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
    var ent = target.nextElementSibling && target.nextElementSibling.querySelector('.entry');
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

  /* ── 行内操作：长按动作表 + 双击编辑 ── */
  function entryActionSheet(e) {
    var p = personaById(e.pid);
    var h = '<div class="acthead"><span class="dot" style="background:' + p.c + ';width:7px;height:7px;border-radius:50%;display:block"></span>'
      + '<div class="m"><div class="l">' + esc(e.at.slice(0, 10)) + ' ' + e.at.slice(11) + ' · ' + esc(p.n) + '</div>'
      + '<div class="x">' + esc(e.x) + '</div></div></div>'
      + '<h3 style="display:none"></h3>'
      + '<button class="row" data-ea="edit"><span class="ico">✎</span>编辑文字<span class="r">›</span></button>'
      + '<button class="row" data-ea="persona"><span class="ico">◉</span>换 Persona<span class="r">' + esc(p.n) + ' ›</span></button>'
      + '<button class="row" data-ea="copy"><span class="ico">⧉</span>复制这条<span class="r">Markdown</span></button>'
      + '<button class="row danger" data-ea="delete"><span class="ico">🗑</span>删除<span class="r">可撤销</span></button>';
    openSheet(h, function () {
      Array.prototype.forEach.call(sheet.querySelectorAll('[data-ea]'), function (b) {
        b.onclick = function () {
          var k = b.getAttribute('data-ea');
          if (k === 'edit') { closeSheet(); editEntry(e); }
          else if (k === 'persona') { closeSheet(); personaForEntry(e); }
          else if (k === 'copy') {
            var tx = '**' + e.at + ' · ' + p.n + '**\n' + e.x;
            try { navigator.clipboard.writeText(tx); toast('已复制'); } catch (err) { toast('复制失败'); }
            closeSheet();
          } else if (k === 'delete') {
            e.deletedAt = new Date().toISOString(); save(); closeSheet(); renderWhisper();
            toastAction('已删除', '撤销', function () { e.deletedAt = null; save(); renderWhisper(); toast('已恢复'); });
          }
        };
      });
    });
  }
  function editEntry(e) {
    var h = '<h3>编辑</h3><textarea id="edText">' + esc(e.x) + '</textarea>'
      + '<div class="btns"><button id="edCancel">取消</button><button class="primary" id="edSave">保存</button></div>';
    openSheet(h, function () {
      $('edCancel').onclick = closeSheet;
      $('edSave').onclick = function () {
        var v = ($('edText').value || '').replace(/\s+$/, '');
        if (!v) { toast('不能为空'); return; }
        e.x = v; e.updatedAt = new Date().toISOString(); save(); closeSheet(); renderWhisper(); toast('已保存');
      };
    });
  }
  function personaForEntry(e) {
    var h = '<h3>换 Persona</h3><div class="pick" style="margin-top:0">';
    S.personas.forEach(function (p) { h += '<button data-ep="' + p.id + '"' + (p.id === e.pid ? ' class="on"' : '') + '><span class="dot" style="background:' + p.c + '"></span>' + esc(p.n) + '</button>'; });
    h += '</div>';
    openSheet(h, function () {
      Array.prototype.forEach.call(sheet.querySelectorAll('[data-ep]'), function (b) {
        b.onclick = function () { e.pid = b.getAttribute('data-ep'); save(); closeSheet(); renderWhisper(); toast('已换 Persona'); };
      });
    });
  }
  (function () {
    var body = $('wBody'), timer = null, lp = null, sx = 0, sy = 0, lpFired = false;
    var lastTap = { t: 0, x: 0, y: 0, id: '' };
    body.addEventListener('pointerdown', function (e) {
      var row = e.target.closest('.entry');
      if (!row) { return; }
      sx = e.clientX; sy = e.clientY;
      lpFired = false;
      lp = row.getAttribute('data-eid');
      var now = Date.now();
      if (lastTap.id === lp && now - lastTap.t < 360 && Math.abs(e.clientX - lastTap.x) < 16 && Math.abs(e.clientY - lastTap.y) < 16) {
        lastTap = { t: 0, x: 0, y: 0, id: '' };
        var ent2 = S.entries.filter(function (x) { return x.id === lp; })[0];
        if (ent2) { editEntry(ent2); return; }
      }
      lastTap = { t: now, x: e.clientX, y: e.clientY, id: lp };
      timer = setTimeout(function () {
        timer = null; lpFired = true;
        var ent = S.entries.filter(function (x) { return x.id === lp; })[0];
        if (ent) { entryActionSheet(ent); }
      }, 520);
    });
    body.addEventListener('pointermove', function (e) {
      if (timer && (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8)) { clearTimeout(timer); timer = null; }
    });
    body.addEventListener('pointerup', function () {
      if (timer) { clearTimeout(timer); timer = null; }
      if (lpFired) { lpFired = false; }
    });
    body.addEventListener('pointercancel', function () { if (timer) { clearTimeout(timer); timer = null; } });
    body.addEventListener('click', function (e) {
      if (e.detail < 2) { return; }
      var el2 = document.elementFromPoint(e.clientX, e.clientY);
      var row2 = el2 && el2.closest ? el2.closest('.entry') : null;
      if (!row2) { return; }
      var ent3 = S.entries.filter(function (x) { return x.id === row2.getAttribute('data-eid'); })[0];
      if (ent3) { editEntry(ent3); }
    });
    body.addEventListener('dblclick', function (e) {
      var row = e.target.closest('.entry');
      if (!row) { return; }
      e.preventDefault();
      e.stopPropagation();
      try { var sel = window.getSelection(); if (sel) { sel.removeAllRanges(); } } catch (err) { }
      var ent = S.entries.filter(function (x) { return x.id === row.getAttribute('data-eid'); })[0];
      if (ent) { editEntry(ent); }
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
    if (scope === 'book') { var b = bookById(S.last.bid) || S.books[0]; return entriesOf(b.id).map(function (e) { return { e: e, b: b }; }); }
    var out = [];
    S.books.forEach(function (b) { entriesOf(b.id).forEach(function (e) { out.push({ e: e, b: b }); }); });
    return out;
  }
  function renderSearch() {
    var q = search.q.trim().toLowerCase();
    var body = $('srBody');
    if (!q) { body.innerHTML = '<p style="font-size:11.5px;color:var(--w-mid)">搜索</p>'; return; }
    var rows = allEntriesFor(search.scope).filter(function (x) {
      return (x.b.name + ' ' + x.e.x).toLowerCase().indexOf(q) >= 0;
    });
    if (!rows.length) { body.innerHTML = '<p style="font-size:11.5px;color:var(--w-mid)">没找到「' + esc(search.q) + '」。</p>'; return; }
    var h = '', lastB = '';
    rows.slice(0, 60).forEach(function (x) {
      if (x.b.id !== lastB) { lastB = x.b.id; h += '<div class="bg">' + esc(x.b.name) + '</div>'; }
      var text = x.e.x;
      var idx = text.toLowerCase().indexOf(q);
      var start = Math.max(0, idx - 16);
      var pre = text.slice(start, start + 70);
      var hl = pre.replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>');
      var rel = idx - start;
      var hl = pre.slice(0, rel) + '<mark>' + pre.slice(rel, rel + q.length) + '</mark>' + pre.slice(rel + q.length);
      h += '<button class="r" data-sr="' + x.e.id + '" data-sb="' + x.b.id + '">' + (start ? '…' : '') + hl
        + '<div class="meta">' + x.e.at.slice(0, 10) + ' · ' + x.e.at.slice(11) + ' · ' + esc(personaById(x.e.pid).n) + '</div></button>';
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
  function heatCard(mine) {
    var byDay = {};
    mine.forEach(function (x) { var k = x.e.at.slice(0, 10); byDay[k] = (byDay[k] || 0) + 1; });
    var accent = S.theme.accent.a2;
    function rgba(hex, a) {
      var h = String(hex).replace('#', '');
      return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
    }
    var today = new Date();
    var heatSize = 'sm';
    try {
      var st = JSON.parse(localStorage.getItem('abbeyroad.state.v1') || '{}');
      heatSize = (st.settings && st.settings.appearance && st.settings.appearance.heatSize) || 'sm';
    } catch (e) { }
    var weeks = heatSize === 'lg' ? 39 : 26;
    var end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var start = new Date(end); start.setDate(start.getDate() - (weeks * 7 - 1));
    while (start.getDay() !== 1) { start.setDate(start.getDate() - 1); }
    var cols = [], cur = new Date(start), lastMonth = -1, labels = [];
    while (cur <= end) {
      var col = [];
      for (var d = 0; d < 7; d++) {
        var k = cur.getFullYear() + '-' + p2(cur.getMonth() + 1) + '-' + p2(cur.getDate());
        col.push({ k: k, n: byDay[k] || 0, future: cur > end, today: k === (today.getFullYear() + '-' + p2(today.getMonth() + 1) + '-' + p2(today.getDate())) });
        cur.setDate(cur.getDate() + 1);
      }
      var mm = cur.getMonth();
      if (mm !== lastMonth) { lastMonth = mm; labels.push('<span style="width:' + (11) + 'px">' + (mm + 1) + '月</span>'); }
      cols.push(col);
    }
    var h = '<div class="card"><div class="k">最近 ' + weeks + ' 周</div><div class="heat"><div class="grid">';
    cols.forEach(function (col) {
      h += '<div class="col">';
      col.forEach(function (c) {
        var lv = c.n === 0 ? 0 : (c.n <= 1 ? 1 : (c.n <= 3 ? 2 : (c.n <= 5 ? 3 : 4)));
        var bg = lv === 0 ? 'var(--w-subtle)' : rgba(accent, [0, .22, .42, .66, .95][lv]);
        h += '<span class="c' + (c.today ? ' today' : '') + '" data-hd="' + (c.future ? '' : c.k) + '" style="background:' + bg + '"></span>';
      });
      h += '</div>';
    });
    h += '</div><div class="legend">少 <span class="c" style="width:9px;height:9px"></span><span class="c" style="width:9px;height:9px;background:' + rgba(accent, .42) + '"></span><span class="c" style="width:9px;height:9px;background:' + rgba(accent, .95) + '"></span> 多</div></div></div>';
    return h;
  }
  function openRecall() { renderRecall(); show('recall'); }
  function renderRecall() {
    var today = new Date();
    var md = '-' + p2(today.getMonth() + 1) + '-' + p2(today.getDate());
    var mine = [];
    S.books.forEach(function (b) { entriesOf(b.id).forEach(function (e) { mine.push({ e: e, b: b }); }); });
    var same = mine.filter(function (x) { return x.e.at.slice(4, 10) === md && Number(x.e.at.slice(0, 4)) < today.getFullYear(); });
    same.sort(function (a, b) { return a.e.at < b.e.at ? 1 : -1; });
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
      h += '<div class="d">' + s0.b.name + ' · ' + s0.e.at.slice(0, 7) + '</div>';
      h += '<div class="x">' + esc(s0.e.x) + '</div>';
      h += '<div class="s"><span class="dot" style="background:' + personaById(s0.e.pid).c + '"></span>' + esc(personaById(s0.e.pid).n) + ' · ' + s0.e.at.slice(11) + '</div>';
      h += '<button class="btnline" id="rcOpen" style="margin-top:10px">打开那天</button>';
    }
    h += '</div>';
    if (same.length > 1) {
      h += '<div class="card"><div class="k">更早的同一天</div>';
      same.slice(1, 6).forEach(function (x) {
        h += '<div class="x" style="border-top:1px solid var(--w-subtle);padding-top:8px;margin-top:8px">'
          + '<div style="font-size:10.5px;color:var(--w-mid)">' + x.e.at.slice(0, 10) + ' · ' + esc(x.b.name) + '</div>'
          + esc(x.e.x) + '</div>';
      });
      h += '</div>';
    }
    var rp = mine.length ? mine[Math.floor(Math.random() * mine.length)] : null;
    h += '<div class="card"><div class="k">随机漫步</div>'
      + '<div id="rcRandBox">' + (rp
        ? '<div style="font-size:10.5px;color:var(--w-mid);margin-top:6px">' + rp.e.at.slice(0, 10) + ' · ' + esc(rp.b.name) + '</div>'
          + '<div style="font-family:var(--font-serif);font-size:14px;line-height:1.85;margin-top:4px">' + esc(rp.e.x) + '</div>'
        : '<div style="color:var(--w-mid);font-size:12px">暂无</div>') + '</div>'
      + '<button class="btnline" id="rcRandom" style="margin-top:10px">抽一条</button></div>';
    h += '<div class="card"><div class="k">最近写的</div>';
    mine.sort(function (a, b) { return a.e.at < b.e.at ? 1 : -1; }).slice(0, 4).forEach(function (x) {
      h += '<div class="x" style="border-top:1px solid var(--w-subtle);padding-top:8px;margin-top:8px">'
        + '<div style="font-size:10.5px;color:var(--w-mid)">' + x.e.at.slice(0, 10) + ' · ' + esc(x.b.name) + '</div>'
        + esc(x.e.x) + '</div>';
    });
    h += '</div>';
    $('rcBody').innerHTML = h;
    if ($('rcOpen')) {
      $('rcOpen').onclick = function () { var s1 = same[0]; S.last = { view: 'read', bid: s1.b.id }; save(); renderWhisper(); show('whisper'); };
    }
    $('rcRandom').onclick = function () {
      if (mine.length) {
        var rp2 = mine[Math.floor(Math.random() * mine.length)];
        var box = $('rcRandBox');
        if (box) {
          box.innerHTML = '<div style="font-size:10.5px;color:var(--w-mid);margin-top:6px">' + rp2.e.at.slice(0, 10) + ' · ' + esc(rp2.b.name) + '</div>'
            + '<div style="font-family:var(--font-serif);font-size:14px;line-height:1.85;margin-top:4px">' + esc(rp2.e.x) + '</div>';
        }
      }

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
    S.books.forEach(function (b) { if (b.deletedAt) { return; } entriesOf(b.id).forEach(function (en) { if (!hit && en.at.slice(0, 10) === day) { hit = { b: b, e: en }; } }); });
    if (!hit) { return; }
    S.last = { view: 'read', bid: hit.b.id }; save(); renderWhisper(); show('whisper');
    var row = $('wBody').querySelector('[data-eid="' + hit.e.id + '"]');
    if (row) { row.scrollIntoView({ block: 'center' }); row.classList.add('hl'); setTimeout(function () { row.classList.remove('hl'); }, 1400); }
    try { $('whRoot').scrollLeft = 0; $('whRoot').scrollTop = 0; } catch (err) { }
  });

  /* ── 回收站 ── */
  function openTrash() { renderTrash(); show('trash'); }
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
        + '<div class="x">' + esc(e.x) + '</div></div><div class="acts">'
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
      btn.onclick = function () { var id = btn.getAttribute('data-re'); S.entries.forEach(function (e) { if (e.id === id) { e.deletedAt = null; } }); save(); renderTrash(); toast('已恢复'); };
    });
    Array.prototype.forEach.call($('trBody').querySelectorAll('[data-de]'), function (btn) {
      btn.onclick = function () { var id = btn.getAttribute('data-de'); S.entries = S.entries.filter(function (e) { return e.id !== id; }); save(); renderTrash(); toast('已彻底删除'); };
    });
    Array.prototype.forEach.call($('trBody').querySelectorAll('[data-rb]'), function (btn) {
      btn.onclick = function () { var id = btn.getAttribute('data-rb'); S.books.forEach(function (b) { if (b.id === id) { b.deletedAt = null; } }); save(); renderTrash(); toast('已恢复'); };
    });
    Array.prototype.forEach.call($('trBody').querySelectorAll('[data-db]'), function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-db');
        S.books = S.books.filter(function (b) { return b.id !== id; });
        S.entries = S.entries.filter(function (e) { return e.bid !== id; });
        save(); renderTrash(); toast('已彻底删除');
      };
    });
  }
  $('trBack').addEventListener('click', function () { openSettings(); });
  $('trClear').addEventListener('click', function () {
    if (!deletedEntries().length && !deletedBooks().length) { toast('回收站是空的'); return; }
    openSheet('<h3>清空回收站？</h3><div class="btns"><button id="tcc">取消</button><button class="primary" id="tco" style="background:var(--w-a1)">清空</button></div>', function () {
      $('tcc').onclick = closeSheet;
      $('tco').onclick = function () {
        var deadB = {};
        S.books.forEach(function (b) { if (b.deletedAt) { deadB[b.id] = 1; } });
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

  /* ── 应用设置（含 Whisper 分区） ── */
  function applyAppHeat() {
    if (!S) { return; }
    var st = $('whRoot');
    st.setAttribute('data-heat', (S.appHeat && S.appHeat.size) || 'sm');
  }
  function renderAppSet() {
    var h = '';
    h += '<div class="sec">外观</div>';
    h += '<button class="row" data-as="theme">主题<span class="r">' + ({ light: '浅色', dark: '深色', system: '跟随系统' })[S.appTheme || 'light'] + ' ›</span></button>';
    h += '<button class="row" data-as="heat">热力图大小<span class="r">' + ((S.appHeat && S.appHeat.size) === 'lg' ? '大' : '小') + ' ›</span></button>';
    h += '<div class="sec">Whisper</div>';
    h += '<button class="row" data-as="whisper">Whisper<span class="r">外观 / 列表 / 阅读 / 安全 ›</span></button>';
    h += '<button class="row" data-as="open">打开 Whisper<span class="r">›</span></button>';
    $('appsetList').innerHTML = h;
    Array.prototype.forEach.call($('appsetList').querySelectorAll('[data-as]'), function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-as');
        if (k === 'whisper') { openSettings(); return; }
        if (k === 'open') { enter(); return; }
        if (k === 'theme') { S.appTheme = S.appTheme === 'light' ? 'dark' : (S.appTheme === 'dark' ? 'system' : 'light'); save(); applyTheme(); renderAppSet(); return; }
        if (k === 'heat') { S.appHeat = { size: ((S.appHeat && S.appHeat.size) === 'lg' ? 'sm' : 'lg') }; save(); applyAppHeat(); renderAppSet(); renderSettings(); return; }
      };
    });
  }
  $('asBack').addEventListener('click', function () { closeRoot(); });
  $('tabbar').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]');
    if (!b) { return; }
    if (b.getAttribute('data-tab') === 'set') { renderAppSet(); show('appset'); }
  });

  /* ── 事件 ── */
  $('shBack').addEventListener('click', function () { closeRoot(); });
  $('wBack').addEventListener('click', function () { S.last.view = 'shelf'; save(); renderShelf(); show('shelf'); });
  $('stBack').addEventListener('click', function () { show(S.last.view === 'read' ? 'whisper' : 'shelf'); });
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
    if (bk && bk.archived) { bk.archived = false; save(); renderShelf(); toast('已还原'); return; }
    S.last = { view: 'read', bid: b.getAttribute('data-bid') }; save(); renderWhisper(); show('whisper'); playEnterFx();
  });
  function bookActionSheet(b) {
    if (!b) { return; }
    var h = '<h3>' + esc(b.name) + '</h3>'
      + '<button class="row" data-ba="rename">重命名<span class="r">›</span></button>'
      + '<button class="row" data-ba="archive">' + (b.archived ? '取消归档' : '归档') + '<span class="r">›</span></button>'
      + '<button class="row" data-ba="delete">删除这本<span class="r" style="color:var(--w-a1)">›</span></button>';
    openSheet(h, function () {
      Array.prototype.forEach.call(sheet.querySelectorAll('[data-ba]'), function (btn) {
        btn.onclick = function () {
          var k = btn.getAttribute('data-ba');
          if (k === 'rename') {
            openSheet('<h3>重命名</h3><input class="inp" id="rnx" value="' + esc(b.name) + '"><div class="btns"><button id="rc">取消</button><button class="primary" id="ro">保存</button></div>', function () {
              $('rnx').focus(); $('rc').onclick = closeSheet;
              $('ro').onclick = function () { var v = ($('rnx').value || '').trim(); if (!v) { return; } b.name = v; save(); closeSheet(); renderShelf(); };
            });
          } else if (k === 'archive') { b.archived = !b.archived; save(); closeSheet(); renderShelf(); toast(b.archived ? '已归档' : '已取消归档'); }
          else if (k === 'delete') {
            openSheet('<h3>删除「' + esc(b.name) + '」？</h3><p style="font-size:11.5px;color:var(--w-mid);line-height:1.7">里面的 ' + entriesOf(b.id).length + ' 条日记会一起删掉。</p><div class="btns"><button id="dc">取消</button><button class="primary" id="do" style="background:var(--w-a1)">删除</button></div>', function () {
              $('dc').onclick = closeSheet;
              $('do').onclick = function () {
                b.deletedAt = new Date().toISOString(); save(); closeSheet(); renderShelf();
                if (S.last.bid === b.id) { var alive = S.books.filter(function (x) { return !x.deletedAt; }); S.last = { view: 'shelf', bid: (alive[0] || {}).id }; }
                toastAction('已删除日记本', '撤销', function () { b.deletedAt = null; save(); renderShelf(); });
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
  var mask = $('mask'), sheet = $('sheet');
  function openSheet(html, after) { sheet.innerHTML = html; sheet.classList.add('on'); mask.classList.add('on'); if (after) { after(); } }
  function closeSheet() { sheet.classList.remove('on'); mask.classList.remove('on'); }
  mask.addEventListener('click', closeSheet);

  /* 菜单 */
  $('wMenu').addEventListener('click', openMenu);
  function openMenu() {
    var b = bookById(S.last.bid);
    if (!b) { var al = S.books.filter(function (x) { return !x.deletedAt; }); b = al[0]; }
    var acts = [
      { k: 'search', t: '搜索', d: '全文 · 当前本或全部' },
      { k: 'recall', t: '回顾', d: '片刻 / 随机漫步' },
      { k: 'settings', t: '设置', d: '外观 / 列表 / 阅读 / 安全' },
      { k: 'switch', t: '切换日记本', d: b.name },
      { k: 'filter', t: '只看 Persona', d: S.opts.filter === 'all' ? '全部' : personaById(S.opts.filter).n },
      { k: 'export', t: '导出 Markdown', d: '' },

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
    if (k === 'export') { sheetExport(); return; }
    if (k === 'shelf') { S.last.view = 'shelf'; save(); renderShelf(); show('shelf'); return; }
    if (k === 'search') { openSearch(); return; }
    if (k === 'recall') { openRecall(); return; }
    if (k === 'sort') { var order = ['recent', 'name', 'count']; var cur = S.opts.sort || 'recent'; S.opts.sort = order[(order.indexOf(cur) + 1) % 3]; save(); renderShelf(); toast('排序：' + ({ recent: '最近', name: '名称', count: '条数' })[S.opts.sort]); return; }
  }
  function sheetBooks() {
    var h = '<h3>切换日记本</h3>';
    S.books.forEach(function (b) { h += '<button class="row" data-bid="' + b.id + '">' + esc(b.name) + '<span class="r">' + (b.id === S.last.bid ? '当前' : entriesOf(b.id).length + ' 条') + '</span></button>'; });
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

  /* Persona */
  function sheetPersonas() {
    var h = '<h3>Persona</h3>';
    S.personas.forEach(function (p) {
      h += '<div class="row" style="cursor:default"><span class="dot" style="background:' + p.c + '"></span>' + esc(p.n)
        + '<span class="r"><button data-edit="' + p.id + '" style="border:0;background:transparent;color:var(--w-a2);font:inherit;font-size:11px;cursor:pointer">改名/换色</button>'
        + (S.personas.length > 1 ? ' <button data-del="' + p.id + '" style="border:0;background:transparent;color:var(--w-a1);font:inherit;font-size:11px;cursor:pointer">删除</button>' : '')
        + '</span></div>';
    });
    h += '<div class="btns"><button id="pAdd" class="primary">＋ 新建 Persona</button></div>';
    openSheet(h, function () {
      $('pAdd').onclick = function () { editPersona(null); };
      Array.prototype.forEach.call(sheet.querySelectorAll('[data-edit]'), function (b) { b.onclick = function () { editPersona(b.getAttribute('data-edit')); }; });
      Array.prototype.forEach.call(sheet.querySelectorAll('[data-del]'), function (b) {
        b.onclick = function () {
          var id = b.getAttribute('data-del');
          S.personas = S.personas.filter(function (p) { return p.id !== id; });
          S.entries.forEach(function (e) { if (e.pid === id) { e.pid = null; } });
          if (S.opts.filter === id) { S.opts.filter = 'all'; }
          save(); closeSheet(); renderWhisper(); toast('已删除');
        };
      });
    });
  }
  function editPersona(id) {
    var p = id ? personaById(id) : { id: '', n: '', c: S.theme.accent.a2 };
    function renderForm(name, color) {
      var h = '<h3>' + (id ? '编辑 Persona' : '新建 Persona') + '</h3><input class="inp" id="pName" value="' + esc(name) + '">'
        + '<button class="row" id="pColor">颜色<span class="r"><span class="chip" style="background:' + color + '"></span>' + color.toUpperCase() + ' ›</span></button>'
        + '<div class="btns"><button id="pCancel">取消</button><button class="primary" id="pOk">保存</button></div>';
      openSheet(h, function () {
        $('pColor').onclick = function () {
          var nm = $('pName').value;
          pickColor(color, function (v) { renderForm(nm, v); });
        };
        $('pCancel').onclick = closeSheet;
        $('pOk').onclick = function () {
          var nm = ($('pName').value || '').trim();
          if (!nm) { toast('先起个名字'); return; }
          if (id) { p.n = nm; p.c = color; } else { S.personas.push({ id: uid('p'), n: nm, c: color }); }
          save(); closeSheet(); renderWhisper(); renderSettings(); toast('已保存');
        };
      });
    }
    renderForm(p.n, p.c);
  }
  function sheetExport() {
    var h = '<h3>导出 Markdown</h3>'
      + '<div class="pick" id="xRange" style="margin:0 0 8px"><button data-xr="all" class="on">整本</button><button data-xr="filter">当前筛选</button></div>'
      + '<button class="row" data-x="share">系统分享（按月份拆分）<span class="r">›</span></button>'
      + '<button class="row" data-x="save">保存到…（自己选位置）<span class="r">›</span></button>'
      + '<button class="row" data-x="single">合并成一个文件<span class="r">›</span></button>';
    openSheet(h, function () {
      var range = 'all';
      Array.prototype.forEach.call(sheet.querySelectorAll('[data-xr]'), function (b) {
        b.onclick = function () { range = b.getAttribute('data-xr'); Array.prototype.forEach.call(sheet.querySelectorAll('[data-xr]'), function (x) { x.classList.toggle('on', x === b); }); };
      });
      Array.prototype.forEach.call(sheet.querySelectorAll('[data-x]'), function (b) { b.onclick = function () { S._exportRange = range; doExport(b.getAttribute('data-x')); }; });
    });
  }
  function buildMd(mode) {
    var b = bookById(S.last.bid);
    if (!b) { var al = S.books.filter(function (x) { return !x.deletedAt; }); b = al[0]; }
    var list = entriesOf(b.id);
    if (S._exportRange === 'filter') {
      list = list.filter(function (e) { return S.opts.filter === 'all' || e.pid === S.opts.filter; });
    }
    list = list.sort(function (a, c) { return a.at < c.at ? -1 : 1; });
    if (mode === 'single') {
      var out = '# ' + b.name + '\n\n', curD = '';
      list.forEach(function (e) {
        var d = e.at.slice(0, 10);
        if (d !== curD) { curD = d; out += '\n## ' + dayLabel(d) + ' · ' + weekday(d) + '\n\n'; }
        out += '**' + e.at.slice(11) + ' · ' + personaById(e.pid).n + '**\n\n' + e.x + '\n\n';
      });
      return [{ name: safe(b.name) + '.md', text: out }];
    }
    var byM = {};
    list.forEach(function (e) { var m = e.at.slice(0, 7); (byM[m] = byM[m] || []).push(e); });
    return Object.keys(byM).sort().map(function (m) {
      return { name: safe(b.name) + '/' + m.slice(0, 4) + '/' + m.slice(5, 7) + '.md',
        text: '# ' + b.name + ' · ' + m + '\n\n' + byM[m].map(function (e) {
          return '### ' + dayLabel(e.at.slice(0, 10)) + ' · ' + e.at.slice(11) + ' · ' + personaById(e.pid).n + '\n\n' + e.x + '\n';
        }).join('\n') };
    });
  }
  function safe(s) { return String(s).replace(/[\\/:*?"<>|]/g, '_'); }
  function doExport(mode) {
    var files = buildMd(mode === 'single' ? 'single' : 'month');
    window.__lastExport = files;
    if (mode === 'single') { download(files[0].name, files[0].text); }
    else if (mode === 'save') { saveAs(files); }
    else { share(files); }
    closeSheet();
  }
  function share(files) {
    if (window.AR && AR.Bridge && AR.Bridge.shareText) {
      var joined = files.map(function (f) { return '### ' + f.name + '\n' + f.text; }).join('\n\n');
      try { AR.Bridge.shareText('Whisper 导出', joined); return; } catch (e0) { }
    }
    var text = files.map(function (f) { return '### ' + f.name + '\n' + f.text; }).join('\n\n');
    if (navigator.share) {
      var payload = { title: 'Whisper 导出', text: text };
      try {
        if (navigator.canShare && window.File) {
          var fs2 = files.slice(0, 5).map(function (f) { return new File([f.text], f.name.split('/').pop(), { type: 'text/markdown' }); });
          if (navigator.canShare({ files: fs2 })) { payload = { files: fs2, title: 'Whisper 导出' }; }
        }
        navigator.share(payload).then(function () { toast('已分享'); }).catch(function () { download('whisper-export.md', text); });
        return;
      } catch (e) { }
    }
    download('whisper-export.md', text); toast('此环境不支持系统分享，已改为下载');
  }
  function saveAs(files) {
    if (window.AR && AR.Bridge && AR.Bridge.saveTextFile) {
      var joined2 = files.map(function (f) { return '<<<FILE ' + f.name + '>>>\n' + f.text; }).join('\n\n');
      try { AR.Bridge.saveTextFile('whisper.md', joined2); return; } catch (e0) { }
    }
    var text = files.map(function (f) { return '<<<FILE ' + f.name + '>>>\n' + f.text; }).join('\n\n');
    if (window.showSaveFilePicker) {
      window.showSaveFilePicker({ suggestedName: 'whisper.md', types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }] })
        .then(function (h) { return h.createWritable().then(function (w) { return w.write(text).then(function () { return w.close(); }); }); })
        .then(function () { toast('已保存'); }).catch(function () { });
      return;
    }
    download('whisper.md', text); toast('此环境不支持选目录，已改为下载');
  }
  function download(name, text) {
    try {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
      a.download = name.split('/').pop(); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    } catch (e) { }
  }
  function sheetLock() {
    var h = '<h3>锁定与解锁</h3>'
      + '<button class="row" data-l="toggle">锁屏<span class="r">' + (S.lock.enabled ? '开' : '关') + ' ›</span></button>'
      + '<button class="row" data-l="bio">生物识别<span class="r">' + (S.lock.bio ? '开' : '关') + ' ›</span></button>'
      + '<button class="row" data-l="pin">' + (S.lock.hash ? '修改 PIN' : '设置 PIN') + '<span class="r">›</span></button>'
      + '<p style="font-size:10.5px;color:var(--w-mid);line-height:1.6;margin:10px 2px 0">PIN 可选，没设时只走生物识别。</p>';
    openSheet(h, function () {
      Array.prototype.forEach.call(sheet.querySelectorAll('[data-l]'), function (b) {
        b.onclick = function () {
          var k = b.getAttribute('data-l');
          if (k === 'toggle') { S.lock.enabled = !S.lock.enabled; save(); closeSheet(); renderSettings(); toast(S.lock.enabled ? '已上锁' : '已关闭锁屏'); }
          else if (k === 'bio') { S.lock.bio = !S.lock.bio; save(); closeSheet(); renderSettings(); }
          else if (k === 'pin') { S.lock.hash = ''; save(); closeSheet(); session.unlocked = false; openLock(); }
        };
      });
    });
  }

  /* 写作 */
  $('wWrite').addEventListener('click', openComposer);
  var draft = { pid: null, bid: null, text: '' };
  function openComposer() {
    if (!S.books.filter(function (b) { return !b.deletedAt; }).length) { newBookSheet(function () { openComposer(); }); return; }
    draft.text = '';
    draft.pid = (S.personas[0] || {}).id;
    draft.bid = S.last.bid || (S.books[0] || {}).id;
    if (S.opts.composer === 'full') {
      $('cWhen').textContent = dayLabel(dkey(0)) + ' · ' + weekday(dkey(0));
      $('cText').value = '';
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
    return S.books.filter(function (b) { return !b.deletedAt; }).map(function (b) {
      return '<button data-b="' + b.id + '"' + (b.id === draft.bid ? ' class="on"' : '') + '>' + esc(b.name) + '</button>';
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
      + '<button class="row" data-pa="rename"><span class="ico">✎</span>改名</button>'
      + '<button class="row" data-pa="color"><span class="ico">◐</span>换颜色</button>'
      + '<button class="row danger" data-pa="delete"><span class="ico">🗑</span>删除</button>';
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
                pp.n = v; save(); closeSheet(); renderWhisper();
              };
            });
          } else if (k === 'color') {
            closeSheet();
            pickColor(pp.c || '#b0aea5', function (v) { pp.c = v; save(); closeSheet(); renderWhisper(); });
          } else if (k === 'delete') {
            S.personas = S.personas.filter(function (x) { return x.id !== pp.id; });
            S.entries.forEach(function (e) { if (e.pid === pp.id) { e.pid = null; } });
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
      + '<div class="field">Persona</div><div class="pick" id="wP">' + personaChipsHTML() + '</div>'
      + '<div class="field">写进</div><div class="pick" id="wB">' + bookChipsHTML() + '</div>'
      + '<div class="btns"><button id="wCancel">取消</button><button class="primary" id="wSave">保存</button></div>';
    openSheet(h, function () {
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
        if (pForm.mode === 'new') { var id = uid('p'); S.personas.push({ id: id, n: nm, c: pForm.color }); draft.pid = id; save(); }
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
    if (!tx) { toast('还没写内容'); return; }
    var d = new Date();
    var newId = uid('e');
    S.entries.push({ id: newId, bid: draft.bid, pid: draft.pid, at: dkey(0) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()), x: tx });
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
    try { syncBlob(); } catch (eS) { }
    try { applyTheme(); } catch (e0) { }
    var rt = $('whRoot');
    if (rt) { rt.removeAttribute('hidden'); }
    enter();
  }
  function closeRoot() {
    var rt = $('whRoot');
    var wasOpen = !!(rt && !rt.hasAttribute('hidden'));
    if (rt) { rt.setAttribute('hidden', 'hidden'); }
    session.unlocked = false;
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

  function syncReady() {
    return !!(window.AR && AR.Sync && AR.Sync.blobPull && AR.Sync.blobPush && AR.Sync.status && AR.Sync.status().configured);
  }
  function scheduleBlobSync() {
    if (!syncReady() || blobBusy) { return; }
    if (blobTimer) { clearTimeout(blobTimer); }
    blobTimer = setTimeout(function () { blobTimer = null; syncBlob(); }, 1200);
  }
  function entryStamp(e) { return String(e.updatedAt || e.at || ''); }
  function mergeEntries(localList, remoteList) {
    var map = {}, out = [], id, i, e;
    for (i = 0; i < remoteList.length; i++) { e = remoteList[i]; if (e && e.id) { map[e.id] = e; } }
    for (i = 0; i < localList.length; i++) {
      e = localList[i];
      if (!e || !e.id) { continue; }
      var r = map[e.id];
      if (!r) { map[e.id] = e; continue; }
      /* 本地更新的覆盖远端；时间相同保留本地 */
      if (entryStamp(e) >= entryStamp(r)) { map[e.id] = e; }
    }
    for (id in map) { if (Object.prototype.hasOwnProperty.call(map, id)) { out.push(map[id]); } }
    return out;
  }
  /* 落盘但**不**标脏：同步跑完后把 syncRev / syncDirty=false 记下来，
     否则每次重启都从 rev 0 开始推，白白撞一次 409。 */
  function persistQuiet() {
    if (!ready || !S) { return; }
    encryptText(JSON.stringify(S)).then(function (blob) {
      try { localStorage.setItem(LS_ENC, blob); } catch (e) { }
    }).catch(function () { });
  }
  function mergeBlob(remote) {
    if (!remote) { return false; }
    var changed = false;
    var rEntries = (remote.entries || []);
    if (rEntries.length) { S.entries = mergeEntries(S.entries, rEntries); changed = true; }
    var rBooks = (remote.books || []);
    if (rBooks.length) {
      var byId = {};
      for (var i = 0; i < rBooks.length; i++) { byId[rBooks[i].id] = rBooks[i]; }
      for (var j = 0; j < S.books.length; j++) { byId[S.books[j].id] = S.books[j]; }
      var merged = [];
      for (var k in byId) { if (Object.prototype.hasOwnProperty.call(byId, k)) { merged.push(byId[k]); } }
      S.books = merged;
      changed = true;
    }
    if (rEntries.length || rBooks.length) {
      S.last = S.last || { view: 'shelf', bid: '' };
      changed = true;
    }
    return changed;
  }
  function syncBlob() {
    if (!syncReady() || blobBusy || !S || !ready) { return; }
    blobBusy = true;
    var ns = 'whisper';
    var attempt = 0;
    function one() {
      attempt++;
      return AR.Sync.blobPull(ns).then(function (remote) {
        var remoteRev = 0;
        if (remote && remote.data) {
          remoteRev = Number(remote.rev) || 0;
          var changed = mergeBlob(remote.data);
          if (changed) {
            /* 用本机设备密钥重新落盘（云端是口令密文，本机是设备密文） */
            encryptText(JSON.stringify(S)).then(function (blob) {
              try { localStorage.setItem(LS_ENC, blob); localStorage.removeItem(LS); } catch (e) { }
            });
            try { renderShelf(); } catch (e2) { }
          }
        }
        var rev = Math.max(Number(S.syncRev) || 0, remoteRev);
        var localHas = !!((S.books && S.books.length) || (S.entries && S.entries.length));
        /* 云端还空着（rev 0、没有密文）而本机已经有内容 → 必须推一次，
           否则「装好同步之前写的日记」永远上不了云。 */
        var needPush = !!S.syncDirty || (remoteRev === 0 && localHas);
        if (!needPush) {
          return { rev: rev, pushed: false };
        }
        var payload = { books: S.books, entries: S.entries, personas: S.personas, at: Date.now() };
        return AR.Sync.blobPush(ns, payload, rev).then(function (r) { return { rev: (r && r.rev) || rev + 1, pushed: true }; });
      });
    }
    function step() {
      return one().then(function (r) {
        if (r && r.rev) { S.syncRev = r.rev; }
        if (r && r.pushed) { S.syncDirty = false; }
        blobBusy = false;
        persistQuiet();
        /* 同步途中又存了盘（dirty 还挂着）→ 再排一次，别把最后一条丢在半路 */
        if (S.syncDirty) { scheduleBlobSync(); }
      }).catch(function (err) {
        if (err && err.code === 'CONFLICT' && attempt < 3) {
          var rr = err.remote && err.remote.rev;
          if (rr != null) { S.syncRev = Number(rr) || 0; }
          return step();
        }
        blobBusy = false;
        persistQuiet();
      });
    }
    step();
  }

  /* ── 返回：侧滑 / 返回键 / Esc ────────────────────────────
     逐级退：弹层 → 目录 → 当前屏自己的返回按钮 → 书架 → 关掉日记回到应用。
     任何一级都在日记内部消化掉，不会把 App 一起退出。 */
  var BACK_BTN = {
    shelf: 'shBack', whisper: 'wBack', settings: 'stBack', appset: 'asBack',
    composer: 'cCancel', search: 'srBack', recall: 'rcBack', trash: 'trBack'
  };
  function currentScreen() {
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
    if (mask && mask.classList.contains('on')) { closeSheet(); return true; }
    if (tocState.open) { closeToc(); return true; }
    var cur = currentScreen();
    if (cur === 'lock') { closeRoot(); return true; }
    var btn = BACK_BTN[cur] ? $(BACK_BTN[cur]) : null;
    if (btn) { btn.click(); return true; }
    closeRoot();
    return true;
  }

  /* 调试出口 */
  window.__whisper = {
    state: function () { return S; },
    theme: function () { return S ? S.theme : null; },
    setTheme: function (p) { S.theme = JSON.parse(JSON.stringify(PRESETS[p])); S.theme.name = p; applyTheme(); save(); renderSettings(); },
    setColor: function (path, v) { setPath(path, v); applyTheme(); save(); renderSettings(); },
    opts: function (k, v) { if (v === undefined) { return S.opts[k]; } S.opts[k] = v; save(); },
    open: function () {
      try { localStorage.setItem('abbeyroad.whisper.seen', '1'); } catch (e0) { }
      whenReady(function () { openNow(); });
    },
    close: function () { closeRoot(); },
    enter: enter,
    unlock: function () { session.unlocked = true; afterUnlock(); },
    openShelf: function () { S.last.view = 'shelf'; save(); renderShelf(); show('shelf'); },
    openBook: function (bid) { S.last = { view: 'read', bid: bid }; save(); renderWhisper(); show('whisper'); playEnterFx(); },
    openSettings: openSettings,
    toc: function (dir) { openToc(dir || 'right'); },
    closeToc: closeToc,
    lockState: function () { return { enabled: S.lock.enabled, hasPin: !!S.lock.hash, bio: S.lock.bio, unlocked: session.unlocked }; },
    persist: save,
    setState: function (o) { if (!o) { return; } S = normalize(o); save(); try { applyTheme(); } catch (e0) { } },
    trash: openTrash,
    exportSheet: function () { sheetExport(); },
    exportCurrent: function () {
      whenReady(function () {
        try {
          var files = buildMd('single');
          if (!files || !files.length) { toast('还没有内容'); return; }
          var text = files.map(function (f) { return '# ' + f.name + '\n\n' + f.text; }).join('\n\n');
          if (window.AR && AR.Bridge && AR.Bridge.shareText) { AR.Bridge.shareText('Whisper 导出', text); return; }
          toast('已生成 ' + text.length + ' 字符的 Markdown');
        } catch (e) { }
      });
    },
    resetAll: function () {
      try { localStorage.removeItem(LS_ENC); localStorage.removeItem(LS); } catch (e) { }
      ready = false; S = null;
      load().then(function () { renderShelf(); toast('已重置'); });
    },
    applyAll: function () { applyTheme(); applyAppHeat(); },
    lock: function () { var rt = $('whRoot'); if (rt) { rt.removeAttribute('hidden'); } openLock(); },
    changePin: function () { pendChange = true; var rt = $('whRoot'); if (rt) { rt.removeAttribute('hidden'); } openLock(); },
    syncNow: function () { try { syncBlob(); } catch (e) { } },
    handleBack: backStep,
    exportMd: buildMd
  };

  applyTheme();
  applyAppHeat();
  var at = $('appTheme');
  if (at) {
    Array.prototype.forEach.call(at.querySelectorAll('button'), function (b) {
      b.onclick = function () {
        S.appTheme = b.getAttribute('data-at'); save();
        Array.prototype.forEach.call(at.querySelectorAll('button'), function (x) { x.classList.toggle('on', x === b); });
        applyTheme(); toast('应用主题：' + ({ light: '浅色', dark: '深色', system: '跟随系统' })[S.appTheme]);
      };
    });
    Array.prototype.forEach.call(at.querySelectorAll('button'), function (x) { x.classList.toggle('on', x.getAttribute('data-at') === (S.appTheme || 'light')); });
  }

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
      if (o && typeof o === 'object' && window.__whisper && window.__whisper.setState) { window.__whisper.setState(o); return; }
      if (window.__whisper && window.__whisper.persist) { window.__whisper.persist(); }
    } catch (e) { }
  },
  apply: function () { try { window.__whisper.applyAll(); } catch (e) { } },
  openLock: function () { try { window.__whisper.lock(); } catch (e) { } },
  changePin: function () { try { window.__whisper.changePin(); } catch (e) { } },
  openTrash: function () { try { window.__whisper.trash(); } catch (e) { } },
  openExport: function () { try { window.__whisper.exportSheet(); } catch (e) { } },
  syncNow: function () { try { window.__whisper.syncNow(); } catch (e) { } },
  /** 返回一步；true 表示日记把这次返回吃掉了（应用就别再处理） */
  handleBack: function () { try { return !!window.__whisper.handleBack(); } catch (e) { return false; } },
  exportCurrent: function () { try { window.__whisper.exportCurrent(); } catch (e) { } },
  reset: function () { try { window.__whisper.resetAll(); } catch (e) { } }
};

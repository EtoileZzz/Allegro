/**
 * verify-whisper-sync.js —— 日记（Whisper）云同步的端到端测试
 *
 * 真实代码：
 *   · 服务端：tools/cloudflare/worker.js 原文（data: URL ESM 载入）
 *   · 表结构：tools/cloudflare/schema.sql 原文 + update-worker.js 的 splitSqlStatements
 *   · 客户端：app/js/sync.js 原文 + app/js/whisper.js 原文（在 vm 沙箱中运行）
 * 只有「D1 HTTP 接口」「localStorage」与「最小 DOM 桩」是替身。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const sqlite = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const WORKER_SRC = fs.readFileSync(path.join(ROOT, 'tools', 'cloudflare', 'worker.js'), 'utf8');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'tools', 'cloudflare', 'schema.sql'), 'utf8');
const SYNC_SRC = fs.readFileSync(path.join(ROOT, 'app', 'js', 'sync.js'), 'utf8');
const WHISPER_SRC = fs.readFileSync(path.join(ROOT, 'app', 'js', 'whisper.js'), 'utf8');
const { splitSqlStatements } = require('./cloudflare/update-worker.js');
const TOKEN = 'test-token';
const NS = 'whisper';

let pass = 0, fail = 0;
const bad = [];
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; bad.push(name + (extra ? ' → ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ─────────── D1 替身：node:sqlite，接口按 Worker 用到的部分实现 ─────────── */
function makeDB(opts) {
  opts = opts || {};
  const db = new sqlite.DatabaseSync(':memory:');
  if (opts.schema !== false) { db.exec(SCHEMA); }
  function stmt(sql) {
    let args = [];
    const api = {
      bind() { args = Array.prototype.slice.call(arguments); return api; },
      first() { return db.prepare(sql).get(...args) || null; },
      run() {
        const r = db.prepare(sql).run(...args);
        return { meta: { changes: Number(r.changes) || 0 } };
      },
      all() { return { results: db.prepare(sql).all(...args) }; }
    };
    return api;
  }
  async function batch(stmts) {
    const res = [];
    for (let i = 0; i < stmts.length; i++) { res.push(stmts[i].run()); }
    return res;
  }
  return {
    raw: db,
    prepare: stmt,
    batch: batch,
    exec(sql) { db.exec(sql); },
    one(sql) { return db.prepare(sql).get() || null; },
    all(sql) { return db.prepare(sql).all(); }
  };
}

/* ─────────── 起一个「云端」：真 Worker + 真 schema + sqlite ─────────── */
function makeCloud(opts) {
  opts = opts || {};
  return import('data:text/javascript;base64,' + Buffer.from(WORKER_SRC).toString('base64'))
    .then(function (mod) {
      const cloud = {
        worker: mod.default,
        db: makeDB(opts),
        env: { DB: null, SYNC_TOKEN: opts.token === undefined ? TOKEN : opts.token },
        log: [],
        beforePut: null
      };
      cloud.env.DB = cloud.db;
      cloud.call = async function (method, p, headers, body) {
        if (method === 'PUT' && cloud.beforePut) {
          const fn = cloud.beforePut;
          cloud.beforePut = null;
          await fn();
        }
        const h = Object.assign({ Origin: 'https://abbeyroad.local' }, headers || {});
        const init = { method: method, headers: h };
        if (body !== undefined) { init.body = typeof body === 'string' ? body : JSON.stringify(body); }
        const res = await cloud.worker.fetch(new Request('https://abbeyroad.local' + p, init), cloud.env);
        const txt = await res.text();
        let json = null;
        try { json = txt ? JSON.parse(txt) : null; } catch (e) { }
        cloud.log.push({ method: method, path: p, ifMatch: h['If-Match'], status: res.status, acao: res.headers.get('Access-Control-Allow-Origin') });
        return { status: res.status, json: json, text: txt, headers: res.headers };
      };
      return cloud;
    });
}

/* ─────────── 最小 DOM 桩（供真实 whisper.js 挂载与操作） ─────────── */
function createMiniDom() {
  const voidTags = /^(br|img|input|hr|meta|link|source)$/i;
  const registry = {};

  function matches(node, sel) {
    if (!node || !node.tagName) { return false; }
    sel = String(sel).trim();
    if (!sel) { return false; }
    const groups = sel.split(',');
    if (groups.length > 1) { return groups.some((g) => matches(node, g.trim())); }
    const parts = sel.match(/^[a-zA-Z][a-zA-Z0-9]*|\.[-\w]+|#[-\w]+|\[[^\]]+\]/g) || [];
    if (!parts.length) { return false; }
    for (const p of parts) {
      if (p[0] === '.') { if (!node._classes.has(p.slice(1))) { return false; } }
      else if (p[0] === '#') { if (node.attrs.id !== p.slice(1)) { return false; } }
      else if (p[0] === '[') {
        const mm = /^\[([^=\]]+)(?:=["']?([^"'\]]*)["']?)?\]$/.exec(p);
        if (!mm) { continue; }
        if (mm[2] === undefined) { if (node.attrs[mm[1]] === undefined) { return false; } }
        else if (String(node.attrs[mm[1]]) !== mm[2]) { return false; }
      } else if (node.tagName !== p.toUpperCase()) { return false; }
    }
    return true;
  }

  function queryAll(root, sel) {
    const out = [];
    if (!root) { return out; }
    const groups = String(sel).split(',').map((s) => s.trim()).filter(Boolean);
    function matchChain(node, chain) {
      const tokens = chain.trim().split(/\s+/);
      if (tokens.length === 1) { return matches(node, tokens[0]); }
      if (!matches(node, tokens[tokens.length - 1])) { return false; }
      let cur = node.parent;
      for (let ti = tokens.length - 2; ti >= 0; ti--) {
        while (cur && !matches(cur, tokens[ti])) { cur = cur.parent; }
        if (!cur) { return false; }
        cur = cur.parent;
      }
      return true;
    }
    (function walk(n) {
      for (const c of n.children || []) {
        if (groups.some((g) => matchChain(c, g))) { out.push(c); }
        walk(c);
      }
    })(root);
    return out;
  }

  function parse(html, parent) {
    const out = [];
    const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z_:@][-a-zA-Z0-9_:.]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
    const stack = [];
    let m, cursor = 0;
    while ((m = tagRe.exec(html))) {
      const text = html.slice(cursor, m.index);
      cursor = tagRe.lastIndex;
      if (text && stack.length) {
        const top = stack[stack.length - 1];
        top._text = (top._text || '') + text;
      }
      const close = m[1], tag = m[2], attrStr = m[3], selfClose = m[4];
      if (close) { stack.pop(); continue; }
      const el = El(tag);
      const attrRe = /([a-zA-Z_:@][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let am;
      while ((am = attrRe.exec(attrStr))) {
        const k = am[1];
        const v = am[2] !== undefined ? am[2] : (am[3] !== undefined ? am[3] : (am[4] !== undefined ? am[4] : ''));
        el.attrs[k] = v;
        if (k === 'class') { el.className = v; }
        if (k === 'id') { registry[v] = el; }
        if (k === 'hidden') { el.hidden = true; }
        if (k === 'value') { el.value = v; }
      }
      const p = stack.length ? stack[stack.length - 1] : null;
      if (p) { p.children.push(el); el.parent = p; } else { out.push(el); el.parent = parent; }
      if (!selfClose && !voidTags.test(tag)) { stack.push(el); }
    }
    return out;
  }

  function El(tag) {
    const _style = {
      setProperty(k, v) { this[k] = v; },
      getPropertyValue(k) { return this[k] || ''; }
    };
    const el = {
      tagName: String(tag || 'div').toUpperCase(),
      children: [], parent: null, attrs: {}, _classes: new Set(),
      style: _style, hidden: false, value: '', listeners: {}, _text: '', onclick: null,
      scrollTop: 0, scrollLeft: 0, scrollHeight: 40, offsetWidth: 100, offsetHeight: 40,
      get className() { return Array.from(this._classes).join(' '); },
      set className(v) { this._classes = new Set(String(v || '').split(/\s+/).filter(Boolean)); },
      get classList() {
        const s = this._classes;
        return {
          add: (...c) => c.forEach((x) => s.add(x)),
          remove: (...c) => c.forEach((x) => s.delete(x)),
          contains: (c) => s.has(c),
          toggle: (c, on) => { if (on === undefined) { s.has(c) ? s.delete(c) : s.add(c); } else if (on) { s.add(c); } else { s.delete(c); } }
        };
      },
      set innerHTML(v) { this._html = String(v); this._text = ''; this.children = parse(this._html, this); },
      get innerHTML() { return this._html || ''; },
      set textContent(v) { this._text = String(v); this._html = ''; this.children = []; },
      get textContent() { return this._text || this._html || ''; },
      appendChild(c) { if (!c) { return c; } this.children.push(c); c.parent = this; return c; },
      removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) { this.children.splice(i, 1); c.parent = null; } return c; },
      get firstChild() { return this.children[0] || null; },
      get nextElementSibling() {
        if (!this.parent) { return null; }
        const i = this.parent.children.indexOf(this);
        return this.parent.children[i + 1] || null;
      },
      addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
      removeEventListener(t, f) {
        if (!this.listeners[t]) { return; }
        this.listeners[t] = this.listeners[t].filter((x) => x !== f);
      },
      dispatch(t, ev) {
        ev = Object.assign({ type: t, target: this, currentTarget: this, preventDefault() { }, stopPropagation() { }, clientX: 10, clientY: 10, button: 0 }, ev || {});
        let cur = this;
        while (cur) {
          if (t === 'click' && typeof cur.onclick === 'function') { cur.onclick(ev); }
          (cur.listeners[t] || []).slice().forEach((fn) => fn.call(cur, ev));
          cur = cur.parent;
        }
      },
      setAttribute(k, v) {
        this.attrs[k] = String(v);
        if (k === 'class') { this.className = v; }
        if (k === 'id') { registry[String(v)] = this; }
        if (k === 'hidden') { this.hidden = true; }
      },
      removeAttribute(k) {
        delete this.attrs[k];
        if (k === 'hidden') { this.hidden = false; }
      },
      getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
      hasAttribute(k) { return this.attrs[k] !== undefined; },
      querySelector(sel) { return queryAll(this, sel)[0] || null; },
      querySelectorAll(sel) { return queryAll(this, sel); },
      closest(sel) { let n = this; while (n) { if (matches(n, sel)) { return n; } n = n.parent; } return null; },
      focus() { }, blur() { }, scrollIntoView() { },
      getBoundingClientRect() { return { top: 0, left: 0, width: 320, height: 48, bottom: 48, right: 320 }; },
      click() { this.dispatch('click'); }
    };
    return el;
  }

  const body = El('body');
  const doc = {
    body, head: El('head'), documentElement: El('html'),
    createElement: El,
    createTextNode(t) { const e = El('#text'); e._text = String(t); return e; },
    getElementById(id) { return registry[id] || null; },
    querySelector(s) { return queryAll(body, s)[0] || null; },
    querySelectorAll(s) { return queryAll(body, s); },
    addEventListener() { }, removeEventListener() { }
  };
  return { document: doc, $: (id) => registry[id] || null };
}

/* ─────────── 设备工厂：纯 sync.js（R1-R24）或真 sync.js + whisper.js（W1-W7） ─────────── */
function makeDevice(cloud, name, withWhisper) {
  const data = {};
  const localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; }
  };
  const fetchShim = async function (url, init) {
    init = init || {};
    const u = new URL(String(url));
    const p = u.pathname.replace(/^\/api/, '') || '/';
    const r = await cloud.call(init.method || 'GET', p + u.search,
      Object.assign({}, init.headers || {}), init.body);
    return {
      status: r.status,
      text: function () { return Promise.resolve(r.text); }
    };
  };
  const dom = withWhisper ? createMiniDom() : null;
  const sandbox = {
    console: console, Date: Date, JSON: JSON, Math: Math, Number: Number, String: String,
    Object: Object, Array: Array, Promise: Promise, Error: Error, RegExp: RegExp,
    isFinite: isFinite, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    btoa: btoa, atob: atob, TextEncoder: TextEncoder, TextDecoder: TextDecoder,
    Uint8Array: Uint8Array, AbortController: AbortController,
    crypto: globalThis.crypto, fetch: fetchShim, localStorage: localStorage, window: null
  };
  if (withWhisper) {
    sandbox.document = dom.document;
    sandbox.navigator = { clipboard: { writeText: () => Promise.resolve() } };
    sandbox.matchMedia = () => ({ matches: false, addEventListener() { }, removeEventListener() { } });
    sandbox.MutationObserver = function () { this.observe = () => { }; this.disconnect = () => { }; };
    sandbox.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  }
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const AR = {
    Const: { APP_VERSION: '0.5.3b' },
    Store: { get: () => ({ settings: { appearance: { theme: 'light', heatSize: 'sm' } } }) },
    Bridge: { canBiometric: () => false, biometricVerify: () => Promise.resolve(false), shareFile: () => Promise.resolve('ok'), share: () => Promise.resolve('ok'), exportText: () => Promise.resolve('ok') },
    UI: { toast: function () { }, enterRise: function () { } }
  };
  sandbox.window.AR = AR;
  vm.runInContext(SYNC_SRC, sandbox, { filename: 'sync.js' });
  if (withWhisper) {
    vm.runInContext(WHISPER_SRC, sandbox, { filename: 'whisper.js' });
  }
  const dev = {
    name: name,
    Sync: AR.Sync,
    Whisper: AR.Whisper,
    __whisper: sandbox.__whisper,
    ls: data,
    $: dom ? dom.$ : null,
    doc: dom ? dom.document : null
  };
  dev.setup = function (pass) {
    dev.Sync.setConfig({
      baseUrl: 'http://cloud.test/api', token: TOKEN, passphrase: pass || 'my pass phrase',
      autoMode: 'open', rememberPass: true
    });
  };
  dev.waitReady = function () {
    return new Promise((resolve) => {
      if (!dev.Whisper || !dev.Whisper.whenReady) { resolve(); return; }
      dev.Whisper.whenReady(resolve);
    });
  };
  dev.openAndSkip = async function () {
    await dev.waitReady();
    dev.Whisper.open();
    await sleep(30);
    const skip = dev.$('skipBtn');
    if (skip && skip.style.display !== 'none') { skip.click(); }
    await sleep(30);
  };
  return dev;
}

function book(id, name) { return { id: id, name: name, at: '2026-11-15T02:00:00.000Z' }; }
function entry(id, bid, x) { return { id: id, bid: bid, x: x, at: '2026-11-15T02:00:00.000Z', pid: null }; }
function payload(books, entries, at) { return { books: books, entries: entries, personas: [], at: at || Date.now() }; }

(async function () {
  /* ── R1–R2：If-Match 必须是纯版本号 ── */
  {
    const cloud = await makeCloud();
    const a = makeDevice(cloud, 'A');
    a.setup();
    let r = null, err = null;
    try { r = await a.Sync.blobPush(NS, payload([book('b1', '第一本')], [entry('e1', 'b1', '你好')]), 0); }
    catch (e) { err = e; }
    const put = cloud.log.filter(function (x) { return x.method === 'PUT'; })[0];
    ok('R1 首次推送成功（rev 0 → 1）', !err && r && r.rev === 1,
      err ? (err.message + '/' + err.code) : JSON.stringify(r));
    ok('R2 请求头 If-Match 是纯数字', put && put.ifMatch === '0', put && put.ifMatch);
  }

  /* ── R3–R4：种子行被删掉也不能 409（Worker 自己补行） ── */
  {
    const cloud = await makeCloud();
    cloud.db.exec("DELETE FROM blob_state");
    const a = makeDevice(cloud, 'A');
    a.setup();
    let err = null;
    let r = null;
    try { r = await a.Sync.blobPush(NS, payload([book('b1', '一本')], [entry('e1', 'b1', 'x')]), 0); }
    catch (e) { err = e; }
    ok('R3 blob_state 没有种子行时，首次推送自己补行并成功', !err && r && r.rev === 1,
      err ? (err.message + '/' + err.code) : JSON.stringify(r));
    ok('R4 补出来的行确实落库（rev 1）', (cloud.db.one("SELECT rev FROM blob_state WHERE ns = 'whisper'") || {}).rev === 1);
  }

  /* ── R5：旧写法（对象当 If-Match）确实被服务端拒掉 ── */
  {
    const cloud = await makeCloud();
    const a = makeDevice(cloud, 'A');
    a.setup();
    const envRes = await (async function () {
      const I = a.Sync._internal;
      const salt = I.bytesToB64(new Uint8Array(16).fill(3));
      const key = await I.deriveKey('my pass phrase', I.b64ToBytes(salt), 1000);
      const iv = new Uint8Array(12).fill(9);
      const ct = await globalThis.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv, additionalData: new TextEncoder().encode('ARS1W|' + NS + '|1') },
        key, new TextEncoder().encode(JSON.stringify(payload([], [])))
      );
      return JSON.stringify({ v: 1, ns: NS, salt: salt, iv: I.bytesToB64(iv), ct: I.bytesToB64(new Uint8Array(ct)), rev: 1 });
    })();
    const r = await cloud.call('PUT', '/blob/' + NS, { 'If-Match': '[object Object]', Authorization: 'Bearer ' + TOKEN }, { envelope: envRes });
    ok('R5 If-Match 是 [object Object] 时服务端返回 400（旧 bug 的症结）', r.status === 400, String(r.status));
  }

  /* ── R6–R9：两台设备真的能互相看见 ── */
  {
    const cloud = await makeCloud();
    const a = makeDevice(cloud, 'A');
    const b = makeDevice(cloud, 'B');
    a.setup(); b.setup();

    await a.Sync.blobPush(NS, payload([book('b1', '日记本')], [entry('e1', 'b1', '只有 A 写的')]), 0);
    const pullB = await b.Sync.blobPull(NS);
    ok('R6 B 能读到 A 推上去的内容', !!(pullB && pullB.data
      && pullB.data.entries.length === 1 && pullB.data.entries[0].x === '只有 A 写的'),
      JSON.stringify(pullB && pullB.data));

    const rb = await b.Sync.blobPush(NS, payload([book('b1', '日记本')],
      [entry('e1', 'b1', '只有 A 写的'), entry('e2', 'b1', 'B 补的一条')]), pullB.rev);
    ok('R7 B 的推送接在 A 的版本后面（rev 2）', rb && rb.rev === 2, JSON.stringify(rb));

    const pullA = await a.Sync.blobPull(NS);
    ok('R8 A 再拉一次能看到 B 那条', pullA.data.entries.length === 2
      && pullA.data.entries.some(function (e) { return e.x === 'B 补的一条'; }), JSON.stringify(pullA.data.entries));

    ok('R9 服务端只存密文（库里没有明文）', (function () {
      const row = cloud.db.one("SELECT envelope FROM blob_state WHERE ns = 'whisper'");
      return row && row.envelope.indexOf('B 补的一条') < 0 && row.envelope.indexOf('只有 A 写的') < 0;
    })());
  }

  /* ── R10–R12：落后版本推送 → 409 带最新版本，重推就过 ── */
  {
    const cloud = await makeCloud();
    const a = makeDevice(cloud, 'A');
    const b = makeDevice(cloud, 'B');
    a.setup(); b.setup();
    await a.Sync.blobPush(NS, payload([book('b1', 'x')], []), 0);
    await b.Sync.blobPush(NS, payload([book('b1', 'x')], []), 1);
    let err = null;
    try { await a.Sync.blobPush(NS, payload([book('b1', 'x')], []), 1); }
    catch (e) { err = e; }
    ok('R10 用过期的 rev 推送 → CONFLICT', err && err.code === 'CONFLICT', err && err.code);
    ok('R11 冲突里带着最新版本号', Number(err && err.remote && err.remote.rev) === 2, JSON.stringify(err && err.remote && err.remote.rev));
    ok('R10b 上一轮冲突没有把云端写坏', (cloud.db.one("SELECT rev FROM blob_state WHERE ns='whisper'") || {}).rev === 2);
    let retry = null, err2 = null;
    try { retry = await a.Sync.blobPush(NS, payload([book('b1', 'x')], []), 2); } catch (e) { err2 = e; }
    ok('R12 用最新 rev 重推成功（rev 3）', !err2 && retry && retry.rev === 3, err2 ? err2.message : JSON.stringify(retry));
  }

  /* ── R13–R14：令牌错 → 401，且库里不被写脏 ── */
  {
    const cloud = await makeCloud();
    const a = makeDevice(cloud, 'A');
    a.setup();
    a.Sync.setConfig({ token: 'wrong-token' });
    let err = null;
    try { await a.Sync.blobPush(NS, payload([], []), 0); } catch (e) { err = e; }
    ok('R13 令牌错时推送失败（UNAUTHORIZED / SERVER）', !!err, err && err.code);
    ok('R14 令牌错时云端没有被写进内容', ((cloud.db.one("SELECT rev FROM blob_state WHERE ns='whisper'") || {}).rev || 0) === 0);
  }

  /* ── R15–R17：CORS 只对自己人开 ── */
  {
    const cloud = await makeCloud();
    const self = await cloud.call('GET', '/blob/' + NS, { Authorization: 'Bearer ' + TOKEN });
    ok('R15 来自 https://abbeyroad.local 的请求带 ACAO', self.headers.get('Access-Control-Allow-Origin') === 'https://abbeyroad.local');
    const evil = await cloud.call('GET', '/blob/' + NS, { Authorization: 'Bearer ' + TOKEN, Origin: 'https://evil.example' });
    ok('R16 别的源拿不到 ACAO', evil.headers.get('Access-Control-Allow-Origin') == null);
    ok('R17 If-Match 在预检允许头里（否则浏览器会拦下 PUT）',
      (self.headers.get('Access-Control-Allow-Headers') || '').indexOf('If-Match') >= 0);
  }

  /* ── R18–R19：配置同步 /state 也不缺种子行 ── */
  {
    const cloud = await makeCloud();
    cloud.db.exec('DELETE FROM state');
    const a = makeDevice(cloud, 'A');
    a.setup();
    let err = null;
    try { await a.Sync.blobPush(NS, payload([book('b1', 'x')], []), 0); } catch (e) { err = e; }
    ok('R18 状态行被删掉后命名空间同步照常', !err, err && err.message);
    const st = await cloud.call('PUT', '/state', { 'If-Match': '0', Authorization: 'Bearer ' + TOKEN },
      { envelope: JSON.stringify({ v: 1, ct: 'x' }) });
    ok('R19 状态行被删掉后 /state 首次写入也能成功（自己补种子行）', st.status === 200 && st.json && st.json.rev === 1,
      st.status + ' ' + JSON.stringify(st.json));
  }

  /* ── R20–R25：sync.js / worker.js / update-worker.js 边界与健壮性 ── */
  {
    const cloud = await makeCloud();
    const a = makeDevice(cloud, 'A');
    a.setup();
    const emptyPull = await a.Sync.blobPull(NS);
    ok('R20 空云端（rev=0）blobPull 正常返回 {rev:0, data:null}',
      emptyPull && emptyPull.rev === 0 && emptyPull.data === null, JSON.stringify(emptyPull));

    /* 损坏的信封 → BAD_ENVELOPE */
    cloud.db.raw.prepare("UPDATE blob_state SET rev = 1, envelope = ? WHERE ns = 'whisper'").run('{not-valid-json');
    let errEnv = null;
    try { await a.Sync.blobPull(NS); } catch (e) { errEnv = e; }
    ok('R21a 损坏信封 JSON 抛出 BAD_ENVELOPE', errEnv && errEnv.code === 'BAD_ENVELOPE', errEnv && errEnv.code);

    /* 恢复有效数据并用错误口令拉取 → BAD_PASSPHRASE */
    cloud.db.raw.prepare("UPDATE blob_state SET rev = 0, envelope = NULL WHERE ns = 'whisper'").run();
    await a.Sync.blobPush(NS, payload([book('b1', '机密')], []), 0);
    const wrongDev = makeDevice(cloud, 'W');
    wrongDev.setup('wrong passphrase');
    let errPass = null;
    try { await wrongDev.Sync.blobPull(NS); } catch (e) { errPass = e; }
    ok('R21b 错误口令拉取抛出 BAD_PASSPHRASE', errPass && errPass.code === 'BAD_PASSPHRASE', errPass && errPass.code);

    /* Worker 校验：空 If-Match、小数 If-Match、缺失 If-Match、未知命名空间、缺字段信封、history ?limit=abc */
    const rEmpty = await cloud.call('PUT', '/blob/' + NS, { 'If-Match': '', Authorization: 'Bearer ' + TOKEN }, { envelope: '{"v":1,"ns":"whisper","ct":"a","iv":"b","salt":"c"}' });
    const rFloat = await cloud.call('PUT', '/blob/' + NS, { 'If-Match': '1.5', Authorization: 'Bearer ' + TOKEN }, { envelope: '{"v":1,"ns":"whisper","ct":"a","iv":"b","salt":"c"}' });
    const rMissing = await cloud.call('PUT', '/blob/' + NS, { Authorization: 'Bearer ' + TOKEN }, { envelope: '{"v":1,"ns":"whisper","ct":"a","iv":"b","salt":"c"}' });
    const rBadNs = await cloud.call('GET', '/blob/unknown', { Authorization: 'Bearer ' + TOKEN });
    const rBadEnv = await cloud.call('PUT', '/blob/' + NS, { 'If-Match': '1', Authorization: 'Bearer ' + TOKEN }, { envelope: '{"ns":"whisper","ct":"a"}' });
    const rLim = await cloud.call('GET', '/history?limit=abc', { Authorization: 'Bearer ' + TOKEN });
    ok('R22 Worker 严格校验 If-Match/ns/envelope/limit',
      rEmpty.status === 400 && rFloat.status === 400 && rMissing.status === 428
      && rBadNs.status === 404 && rBadEnv.status === 400 && rLim.status === 200,
      JSON.stringify({ empty: rEmpty.status, float: rFloat.status, miss: rMissing.status, ns: rBadNs.status, env: rBadEnv.status, lim: rLim.status }));

    /* 连续推 25 版 → blob_history 只留最近 20 版 */
    let rev = 1;
    for (let k = 0; k < 25; k++) {
      const pr = await a.Sync.blobPush(NS, payload([book('b1', '第' + k + '版')], []), rev);
      rev = pr.rev;
    }
    const histRows = cloud.db.all("SELECT rev FROM blob_history WHERE ns = 'whisper' ORDER BY rev DESC");
    ok('R23 连续推送 25 次后 blob_history 自动裁剪为最近 20 版',
      histRows.length === 20 && histRows[0].rev === rev, 'count=' + histRows.length + ' top=' + (histRows[0] && histRows[0].rev));

    /* update-worker.js splitSqlStatements 执行 schema.sql 必须建齐 4 张表与 whisper 种子行 */
    const rawDb = new sqlite.DatabaseSync(':memory:');
    const stmts = splitSqlStatements(SCHEMA);
    for (const s of stmts) { rawDb.exec(s); }
    const tbls = rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((x) => x.name);
    const seedRow = rawDb.prepare("SELECT rev FROM blob_state WHERE ns = 'whisper'").get();
    ok('R25 update-worker.js SQL 切分能建齐 4 表并插入 whisper rev=0 种子行',
      ['state', 'history', 'blob_state', 'blob_history'].every((t) => tbls.indexOf(t) >= 0)
      && seedRow && seedRow.rev === 0,
      'tables=' + tbls.join(',') + ' seed=' + JSON.stringify(seedRow));
  }

  /* ── W1–W7：真实 whisper.js + sync.js 双设备协同回归（绝不用 setState 绕过） ── */

  /* W1：Persona 双向合并（新建 Persona + 写条目 → 同步到另一台 → 另一台也建 Persona 回推） */
  {
    const cloud = await makeCloud();
    const a = makeDevice(cloud, 'WA', true);
    const b = makeDevice(cloud, 'WB', true);
    a.setup(); b.setup();
    await a.openAndSkip();
    await b.openAndSkip();

    // A 通过真实 UI 创建日记本
    a.$('shNew').click();
    a.$('nbName').value = '生活随记';
    a.$('nbOk').click();
    // 打开该本，点击写作按钮，新建 Persona「夜猫子」并保存一篇日记
    a.$('shelfList').querySelector('.book').click();
    a.$('wWrite').click();
    a.$('wP').querySelector('[data-pnew]').click();
    a.$('npName').value = '夜猫子';
    a.$('npOk').click();
    a.$('wText').value = 'A 用新 Persona 写的';
    a.$('wSave').click();
    await a.Whisper.syncNow();

    // B 同步拉取并校验书本/条目/Persona
    await b.Whisper.syncNow();
    const stB = b.Whisper.state();
    const pA = stB.personas.find((p) => p.n === '夜猫子');
    ok('W1a 真实 whisper.js 同步：B 收到 A 建的书本、条目与 Persona（不再丢失 personas）',
      stB.books.length === 1 && stB.entries.length === 1 && !!pA && stB.entries[0].pid === pA.id,
      JSON.stringify({ books: stB.books.length, entries: stB.entries.length, personas: stB.personas }));

    // B 在同一本新建另一个 Persona 并写一条推回 A
    b.$('shelfList').querySelector('.book').click();
    b.$('wWrite').click();
    b.$('wP').querySelector('[data-pnew]').click();
    b.$('npName').value = '清晨';
    b.$('npOk').click();
    b.$('wText').value = 'B 的清晨记录';
    b.$('wSave').click();
    await b.Whisper.syncNow();
    await a.Whisper.syncNow();
    const stA = a.Whisper.state();
    ok('W1b 双向合并：A 与 B 同时保留双端 Personas（共 2 个）与条目（共 2 条）',
      stA.personas.some((p) => p.n === '夜猫子') && stA.personas.some((p) => p.n === '清晨') && stA.entries.length === 2,
      JSON.stringify({ personas: stA.personas.map((p) => p.n), entries: stA.entries.length }));
  }

  /* W2：Book LWW 重命名与删除传播（B 改名或软删书本后，不会被 A 本地旧书本覆写掉） */
  {
    const cloud = await makeCloud();
    const a = makeDevice(cloud, 'WA2', true);
    const b = makeDevice(cloud, 'WB2', true);
    a.setup(); b.setup();
    await a.openAndSkip();
    await b.openAndSkip();

    a.$('shNew').click();
    a.$('nbName').value = '原书名';
    a.$('nbOk').click();
    await a.Whisper.syncNow();
    await b.Whisper.syncNow();

    // B 长按书本触发 bookActionSheet → 重命名
    await sleep(15);
    const bkEl = b.$('shelfList').querySelector('.book');
    bkEl.dispatch('pointerdown', { clientX: 20, clientY: 20 });
    await sleep(600);
    b.$('sheet').querySelector('[data-ba="rename"]').click();
    b.$('rnx').value = 'B改过的新书名';
    b.$('ro').click();
    await b.Whisper.syncNow();

    await a.Whisper.syncNow();
    ok('W2a B 重命名书本同步到 A（不再被 A 的旧书名覆盖）',
      a.Whisper.state().books[0].name === 'B改过的新书名',
      a.Whisper.state().books[0].name);

    // B 再次长按删除这本 → 同步 → A 也应标记 deletedAt
    await sleep(15);
    b.$('shelfList').querySelector('.book').dispatch('pointerdown', { clientX: 20, clientY: 20 });
    await sleep(600);
    b.$('sheet').querySelector('[data-ba="delete"]').click();
    b.$('do').click();
    await b.Whisper.syncNow();

    await a.Whisper.syncNow();
    ok('W2b B 软删书本同步到 A（A 侧该书也带 deletedAt）',
      !!a.Whisper.state().books[0].deletedAt,
      JSON.stringify(a.Whisper.state().books[0]));
  }

  /* W3：跨零点（UTC+8 01:00 本地时间 vs 前一 UTC 日期 17:00Z）编辑与软删/恢复 LWW */
  {
    const cloud = await makeCloud();
    const a = makeDevice(cloud, 'WA3', true);
    const b = makeDevice(cloud, 'WB3', true);
    a.setup(); b.setup();
    await a.openAndSkip();
    await b.openAndSkip();

    a.$('shNew').click();
    a.$('nbName').value = '午夜本';
    a.$('nbOk').click();
    a.$('shelfList').querySelector('.book').click();
    a.$('wWrite').click();
    a.$('wText').value = '零点原稿';
    a.$('wSave').click();
    // 构造本地「明天 01:00」但尚未编辑过的 at（验证不会因为字典序 > UTC ISO 而压死真编辑）
    const entA = a.Whisper.state().entries[0];
    const local01 = new Date(2026, 10, 16, 1, 0, 0, 0);
    entA.at = '2026-11-16 01:00';
    delete entA.updatedMs;
    delete entA.updatedAt;
    a.__whisper.persist();
    await a.Whisper.syncNow();

    // B 拉取后在「本地 01:05」（UTC+8 下即前一 UTC 日期 17:05Z）触发真实编辑
    await b.Whisper.syncNow();
    b.$('shelfList').querySelector('.book').click();
    const rowB = b.$('wBody').querySelector('.entry');
    const origNow = b.doc.defaultView ? null : null;
    const bWin = b.Whisper;
    const editAtMs = local01.getTime() + 5 * 60000;
    const realDateNow = Date.now;
    Date.now = () => editAtMs;
    try {
      rowB.dispatch('dblclick');
      b.$('edText').value = 'B 已修订的内容';
      b.$('edSave').click();
    } finally {
      Date.now = realDateNow;
    }
    await b.Whisper.syncNow();

    await a.Whisper.syncNow();
    const afterEdit = a.Whisper.state().entries[0];
    ok('W3a 跨零点（UTC+8 01:05 编辑 vs 01:00 原稿）：按 epoch 毫秒覆盖未编辑原稿',
      afterEdit.x === 'B 已修订的内容', JSON.stringify(afterEdit));

    // B 长按删除该条目 → A 同步后也软删；B 点撤销恢复 → A 同步后也恢复
    rowB.dispatch('pointerdown', { clientX: 20, clientY: 20 });
    await sleep(600);
    b.$('sheet').querySelector('[data-ea="delete"]').click();
    await b.Whisper.syncNow();
    await a.Whisper.syncNow();
    ok('W3b 条目软删同步到 A（deletedAt 生效）', !!a.Whisper.state().entries[0].deletedAt);

    // B 点击撤销按钮恢复
    await sleep(10);
    const undoBtn = b.$('toast').querySelector('button');
    if (undoBtn) { undoBtn.click(); }
    await b.Whisper.syncNow();
    await a.Whisper.syncNow();
    ok('W3c 条目恢复同步到 A（deletedAt 被清除）', !a.Whisper.state().entries[0].deletedAt);
  }

  /* W4：回收站彻底清空写 tombstones，防止从另一台旧设备复活 */
  {
    const cloud = await makeCloud();
    const a = makeDevice(cloud, 'WA4', true);
    const b = makeDevice(cloud, 'WB4', true);
    a.setup(); b.setup();
    await a.openAndSkip();
    await b.openAndSkip();

    a.$('shNew').click();
    a.$('nbName').value = '要销毁的本';
    a.$('nbOk').click();
    a.$('shelfList').querySelector('.book').click();
    a.$('wWrite').click();
    a.$('wText').value = '会彻底清空的条目';
    a.$('wSave').click();
    await a.Whisper.syncNow();
    await b.Whisper.syncNow();

    // B 软删条目 → 进回收站清空
    b.$('shelfList').querySelector('.book').click();
    b.$('wBody').querySelector('.entry').dispatch('pointerdown', { clientX: 20, clientY: 20 });
    await sleep(600);
    b.$('sheet').querySelector('[data-ea="delete"]').click();
    b.Whisper.openTrash();
    b.$('trClear').click();
    b.$('tco').click();
    await b.Whisper.syncNow();

    // A 此时本地还保留着老的该条目，同步后必须被墓碑消除，不会把条目推回云端复活
    await a.Whisper.syncNow();
    await b.Whisper.syncNow();
    ok('W4 回收站清空写入 tombstones 后，同步双端均不再复活已彻底删除的条目',
      a.Whisper.state().entries.length === 0 && b.Whisper.state().entries.length === 0
      && (a.Whisper.state().tombstones || []).length >= 1,
      JSON.stringify({ a: a.Whisper.state().entries.length, b: b.Whisper.state().entries.length, tombs: (a.Whisper.state().tombstones || []).length }));
  }

  /* W5：syncDirty 在途竞态（推送期间再次保存不丢最后一条） */
  {
    const cloud = await makeCloud();
    const a = makeDevice(cloud, 'WA5', true);
    const b = makeDevice(cloud, 'WB5', true);
    a.setup(); b.setup();
    await a.openAndSkip();
    await b.openAndSkip();

    a.$('shNew').click();
    a.$('nbName').value = '竞态本';
    a.$('nbOk').click();
    a.$('shelfList').querySelector('.book').click();
    a.$('wWrite').click();
    a.$('wText').value = '第一条在途';
    a.$('wSave').click();

    // 在第一轮 PUT /blob/whisper 发出前瞬间，在本地再写第二条
    let injected = false;
    cloud.beforePut = async function () {
      if (injected) { return; }
      injected = true;
      a.$('wWrite').click();
      a.$('wText').value = '第二条推送途中写入';
      a.$('wSave').click();
    };
    await a.Whisper.syncNow();
    // 等待 scheduleBlobSync(1200ms) 自动补推完成
    for (let i = 0; i < 30; i++) {
      if (!a.Whisper.state().syncDirty && (cloud.db.one("SELECT rev FROM blob_state WHERE ns='whisper'") || {}).rev >= 2) { break; }
      await sleep(100);
    }
    await b.Whisper.syncNow();
    const xs = b.Whisper.state().entries.map((e) => e.x);
    ok('W5 PUT 在途期间新写条目保留 syncDirty 并自动补推，云端含全部两条',
      xs.indexOf('第一条在途') >= 0 && xs.indexOf('第二条推送途中写入') >= 0,
      JSON.stringify(xs));
  }

  /* W6：两台设备并发改写撞 409 → whisper.js 自动合并重试成功 */
  {
    const cloud = await makeCloud();
    const a = makeDevice(cloud, 'WA6', true);
    const b = makeDevice(cloud, 'WB6', true);
    a.setup(); b.setup();
    await a.openAndSkip();
    await b.openAndSkip();

    a.$('shNew').click();
    a.$('nbName').value = '合集';
    a.$('nbOk').click();
    await a.Whisper.syncNow();
    await b.Whisper.syncNow();

    // A 和 B 各自在本地写一条
    a.$('shelfList').querySelector('.book').click();
    a.$('wWrite').click();
    a.$('wText').value = 'A并发条';
    a.$('wSave').click();

    b.$('shelfList').querySelector('.book').click();
    b.$('wWrite').click();
    b.$('wText').value = 'B并发条';
    b.$('wSave').click();

    // B 刚准备 PUT 时让 A 抢先推到 rev 2，迫使 B 撞 409 后自动拉取合并重推到 rev 3
    cloud.beforePut = async function () { await a.Whisper.syncNow(); };
    await b.Whisper.syncNow();
    await a.Whisper.syncNow();

    const textsA = a.Whisper.state().entries.map((e) => e.x);
    const textsB = b.Whisper.state().entries.map((e) => e.x);
    ok('W6 whisper.js 撞 409 后自动合并并重推，双端均含 A/B 两条',
      textsA.indexOf('A并发条') >= 0 && textsA.indexOf('B并发条') >= 0
      && textsB.indexOf('A并发条') >= 0 && textsB.indexOf('B并发条') >= 0,
      JSON.stringify({ A: textsA, B: textsB }));
  }

  /* W7：resetAll({ clearCloud: true }) 清空后重开同步不复活旧日记 */
  {
    const cloud = await makeCloud();
    const a = makeDevice(cloud, 'WA7', true);
    a.setup();
    await a.openAndSkip();

    a.$('shNew').click();
    a.$('nbName').value = '将被清空的本';
    a.$('nbOk').click();
    a.$('shelfList').querySelector('.book').click();
    a.$('wWrite').click();
    a.$('wText').value = '清空后不许复活';
    a.$('wSave').click();
    await a.Whisper.syncNow();

    await a.Whisper.reset({ clearCloud: true, bypassLock: true });
    await a.Whisper.syncNow();
    ok('W7 reset({clearCloud:true}) 后再同步不复活旧书本/条目',
      a.Whisper.state().books.length === 0 && a.Whisper.state().entries.length === 0,
      JSON.stringify({ books: a.Whisper.state().books.length, entries: a.Whisper.state().entries.length }));
  }

  /* ── W8：配置同步与日记同步完全解耦（互相不触发） ── */
  {
    const cloud = await makeCloud();
    const a = makeDevice(cloud, 'WD', true);
    a.setup();
    await a.openAndSkip();

    a.Sync.setConfig({ syncConfigEnabled: true, syncWhisperEnabled: false });
    await sleep(30);
    const logLenBeforeOff = cloud.log.length;
    a.Whisper.open();
    a.$('shNew').click();
    a.$('nbName').value = '离线日记本';
    a.$('nbOk').click();
    await sleep(30);
    const blobCallsWhileOff = cloud.log.slice(logLenBeforeOff).filter((l) => l.path.indexOf('/blob/whisper') === 0).length;
    let errOff = null;
    try { await a.Whisper.syncNow(); } catch (e) { errOff = e; }
    ok('W8a 关闭 syncWhisperEnabled 后建本/打开不发 /blob/whisper 请求且 syncNow 明确拦截',
      blobCallsWhileOff === 0 && errOff && /关闭日记云同步/.test(errOff.message),
      'calls=' + blobCallsWhileOff + ' err=' + (errOff && errOff.message));

    a.Sync.setConfig({ syncConfigEnabled: false, syncWhisperEnabled: true });
    const stages = [];
    await a.Whisper.syncNow((pct, msg) => stages.push({ pct, msg }));
    const stateCalls = cloud.log.filter((l) => l.path === '/state').length;
    const blobPuts = cloud.log.filter((l) => l.path === '/blob/whisper' && l.method === 'PUT').length;
    ok('W8b 关闭 syncConfigEnabled 仅同步日记（不碰 /state）且回调阶段进度至 100%',
      stateCalls === 0 && blobPuts >= 1 && stages.some((s) => s.pct === 100),
      JSON.stringify({ stateCalls, blobPuts, stages }));
  }

  /* ── W9：日记评论双向 LWW 合并 + 墓碑防复活 ── */
  {
    const cloud = await makeCloud();
    const a = makeDevice(cloud, 'WC1', true);
    const b = makeDevice(cloud, 'WC2', true);
    a.setup(); b.setup();
    await a.openAndSkip();
    await b.openAndSkip();

    a.$('shNew').click();
    a.$('nbName').value = '评论本';
    a.$('nbOk').click();
    a.$('shelfList').querySelector('.book').click();
    a.$('wWrite').click();
    a.$('wText').value = '带评论的主条目';
    a.$('wSave').click();
    await a.Whisper.syncNow();
    await b.Whisper.syncNow();

    // A 通过真实 UI 添加评论
    b.$('shelfList').querySelector('.book').click();
    const rowA = a.$('wBody').querySelector('.entry');
    rowA.dispatch('pointerdown', { clientX: 20, clientY: 20 });
    await sleep(600);
    a.$('sheet').querySelector('[data-ea="comment"]').click();
    a.$('cmText').value = 'A的追记';
    a.$('cmSave').click();

    // B 并发在同条目也通过 UI 添加另一条评论
    const rowB = b.$('wBody').querySelector('.entry');
    rowB.dispatch('pointerdown', { clientX: 20, clientY: 20 });
    await sleep(600);
    b.$('sheet').querySelector('[data-ea="comment"]').click();
    b.$('cmText').value = 'B的追记';
    b.$('cmSave').click();

    await a.Whisper.syncNow();
    await b.Whisper.syncNow();
    await a.Whisper.syncNow();

    const cmtsA = (a.Whisper.state().entries[0].comments || []).filter((c) => !c.deletedAt).map((c) => c.x);
    const cmtsB = (b.Whisper.state().entries[0].comments || []).filter((c) => !c.deletedAt).map((c) => c.x);
    ok('W9 同一条目双端并发写评论合并后全部保留（不互吞）',
      cmtsA.indexOf('A的追记') >= 0 && cmtsA.indexOf('B的追记') >= 0
      && cmtsB.indexOf('A的追记') >= 0 && cmtsB.indexOf('B的追记') >= 0,
      JSON.stringify({ A: cmtsA, B: cmtsB }));
  }

  /* ── W10：图片附件增量同步（/blob/whisper/media）与图片同步开关 ── */
  {
    const cloud = await makeCloud();
    const a = makeDevice(cloud, 'WM1', true);
    const b = makeDevice(cloud, 'WM2', true);
    a.setup(); b.setup();
    await a.openAndSkip();
    await b.openAndSkip();

    // 构造 A 设备本地带图片附件的条目，关闭图片同步时不应调 /blob/whisper/media
    a.Sync.setConfig({ syncWhisperMedia: false });
    const mid = 'm_sync_test_01';
    const fakeUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const stA = a.Whisper.state();
    stA.books.push({ id: 'bm1', name: '图本', updatedMs: Date.now() });
    stA.entries.push({ id: 'em1', bid: 'bm1', at: '2026-11-17 10:00', x: '带图条目', media: [{ id: mid, w: 1600, h: 1200, mime: 'image/png', size: 120 }], updatedMs: Date.now() });
    a.__whisper.persist();
    await a.Whisper.syncNow();
    const mediaReqsOff = cloud.log.filter((l) => l.path.indexOf('/blob/whisper/media') === 0).length;
    ok('W10a 关闭 syncWhisperMedia 时仅同步文字，不访问 /blob/whisper/media', mediaReqsOff === 0, 'reqs=' + mediaReqsOff);

    // 开启图片同步 → 通过 blobMediaPush + 真实表 whisper_media 校验 A 推 / B 拉与删除传播
    a.Sync.setConfig({ syncWhisperMedia: true });
    await a.Sync.blobMediaPush(mid, { id: mid, dataUrl: fakeUrl, w: 1280, h: 960, mime: 'image/webp', compressed: true });
    const mList = await b.Sync.blobMediaList();
    const mPull = await b.Sync.blobMediaPull(mid);
    const dbRow = cloud.db.one("SELECT id, envelope FROM whisper_media WHERE id = '" + mid + "'");
    ok('W10b 开启图片同步后加密写入 whisper_media 并跨端解密还原',
      mList.ids.indexOf(mid) >= 0 && mPull && mPull.dataUrl === fakeUrl && mPull.compressed === true
      && dbRow && dbRow.envelope.indexOf(fakeUrl) < 0,
      JSON.stringify({ ids: mList.ids, hasUrl: !!(mPull && mPull.dataUrl) }));
  }

  /* ── W11–W12：私密笔记本防漏 & 每本 sortDir & Markdown/JSON 导入去重 ── */
  {
    const cloud = await makeCloud();
    const a = makeDevice(cloud, 'WS1', true);
    a.setup();
    await a.openAndSkip();
    const st = a.Whisper.state();
    st.books.push({ id: 'bhid', name: '绝密笔记本', sortDir: 'asc', hidden: true, updatedMs: Date.now() });
    st.books.push({ id: 'bpub', name: '公开本', sortDir: 'asc', hidden: false, updatedMs: Date.now() });
    st.entries.push({ id: 'eh1', bid: 'bhid', at: '2026-11-17 09:00', x: '私密敏感词XYZ', updatedMs: Date.now() });
    st.entries.push({ id: 'ep1', bid: 'bpub', at: '2026-11-17 08:00', x: '早安', updatedMs: Date.now() });
    st.entries.push({ id: 'ep2', bid: 'bpub', at: '2026-11-17 20:00', x: '晚安', updatedMs: Date.now() });
    a.__whisper.persist();

    // 未解锁私密模式：搜索与书架都不能出现绝密笔记本
    a.__whisper.openShelf();
    await sleep(30);
    const shelfHtmlLocked = a.$('shelfList').innerHTML;
    a.$('shSearch').click();
    a.$('srScope').click(); // 切到 全部本
    a.$('srInput').value = '私密敏感词';
    a.$('srInput').dispatch('input');
    const srLocked = a.$('srBody').innerHTML;
    ok('W11a 未解锁私密模式时，书架与全局搜索均隐藏私密笔记本及其内容',
      shelfHtmlLocked.indexOf('绝密笔记本') < 0 && srLocked.indexOf('私密敏感词XYZ') < 0);

    // 验证按每本 sortDir='asc' 正序展示（08:00 在 20:00 之前）
    a.__whisper.openBook('bpub');
    await sleep(30);
    const readOrder = a.$('wBody').querySelectorAll('.entry').map((n) => n.getAttribute('data-eid'));
    ok('W11b 每本 sortDir="asc" 按正序（旧→新）排列条目',
      readOrder[0] === 'ep1' && readOrder[1] === 'ep2', JSON.stringify(readOrder));

    // 导入 Markdown 与防重复导入
    const mdSample = '# 公开本\n\n## 2026-11-17 · 11 月 17 日 · 周二\n\n**08:00 · **\n\n早安\n\n**21:30 · 新人物**\n\n新导入的夜晚\n\n> 追记 · 2026-11-17 21:40 · 新人物：补充一句\n';
    const imp1 = await a.Whisper.importText(mdSample, '公开本.md');
    const imp2 = await a.Whisper.importText(mdSample, '公开本.md');
    const impEntry = a.Whisper.state().entries.find((e) => e.x === '新导入的夜晚');
    ok('W12 Markdown 导入正确新增条目与追记评论，且重复导入不产生重复条',
      imp1 && imp1.entriesAdded === 1 && imp1.commentsAdded === 1
      && impEntry && impEntry.comments && impEntry.comments[0].x === '补充一句'
      && !imp2,
      JSON.stringify({ imp1, imp2 }));
  }

  /* ── 汇总 ── */
  console.log('Whisper 云同步：' + pass + ' 通过 / ' + fail + ' 失败');
  if (fail) {
    bad.forEach(function (b) { console.log('  ✗ ' + b); });
    process.exitCode = 1;
  }
})().catch(function (e) {
  console.error('测试自己崩了：', e && e.stack ? e.stack : e);
  process.exitCode = 1;
});

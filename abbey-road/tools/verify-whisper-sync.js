/**
 * verify-whisper-sync.js —— 日记（Whisper）云同步的端到端测试
 *
 * 三样东西都是真的：
 *   · 服务端：tools/cloudflare/worker.js 原文（用 data: URL 当 ESM 载入）
 *   · 表结构：tools/cloudflare/schema.sql 原文，用 node:sqlite 真跑
 *   · 客户端：app/js/sync.js 原文（在 vm 沙箱里跑，WebCrypto 是 Node 自带的）
 * 只有「D1 的 HTTP 接口」和「localStorage」是替身。
 *
 * 这个文件存在的原因：v0.5.3a 的日记同步一次都没成功过 ——
 *   ① blob_state 表里没有 whisper 这个种子行，Worker 的 CAS UPDATE 永远 0 行 → 409
 *   ② 客户端把 If-Match 传成对象，被 String() 成 "[object Object]" → 400
 * 两条都有对应用例，改回去就会红。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const sqlite = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const WORKER_SRC = fs.readFileSync(path.join(ROOT, 'tools', 'cloudflare', 'worker.js'), 'utf8');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'tools', 'cloudflare', 'schema.sql'), 'utf8');
const CLIENT_SRC = fs.readFileSync(path.join(ROOT, 'app', 'js', 'sync.js'), 'utf8');
const TOKEN = 'test-token';
const NS = 'whisper';

let pass = 0, fail = 0;
const bad = [];
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; bad.push(name + (extra ? ' → ' + extra : '')); }
}

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
  return {
    raw: db,
    prepare: stmt,
    exec(sql) { db.exec(sql); },
    one(sql) { return db.prepare(sql).get() || null; }
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
        log: []
      };
      cloud.env.DB = cloud.db;
      cloud.call = async function (method, p, headers, body) {
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

/* ─────────── 一个「设备」：独立 localStorage + 真 sync.js ─────────── */
function makeDevice(cloud, name) {
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
  const sandbox = {
    console: console, Date: Date, JSON: JSON, Math: Math, Number: Number, String: String,
    Object: Object, Array: Array, Promise: Promise, Error: Error,
    encodeURIComponent: encodeURIComponent, setTimeout: setTimeout, clearTimeout: clearTimeout,
    btoa: btoa, atob: atob, TextEncoder: TextEncoder, TextDecoder: TextDecoder,
    Uint8Array: Uint8Array, AbortController: AbortController,
    crypto: globalThis.crypto, fetch: fetchShim, localStorage: localStorage, window: null
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const AR = { Const: { APP_VERSION: 'test' }, UI: { toast: function () { } } };
  sandbox.window.AR = AR;
  vm.runInContext(CLIENT_SRC, sandbox, { filename: 'sync.js' });
  const dev = { name: name, Sync: AR.Sync, ls: data };
  dev.setup = function (pass) {
    dev.Sync.setConfig({
      baseUrl: 'http://cloud.test/api', token: TOKEN, passphrase: pass || 'my pass phrase',
      autoMode: 'open', rememberPass: true
    });
  };
  return dev;
}

function book(id, name) { return { id: id, name: name, at: '2026-11-15T02:00:00.000Z' }; }
function entry(id, bid, x) { return { id: id, bid: bid, x: x, at: '2026-11-15T02:00:00.000Z', pid: null }; }
function payload(books, entries, at) { return { books: books, entries: entries, personas: [], at: at || Date.now() }; }

(async function () {
  /* ── R1：If-Match 必须是纯版本号（v0.5.3a 这里传的是对象 → 400） ── */
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

  /* ── R3：种子行被删掉也不能 409（Worker 自己补行） ── */
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

  /* ── R5：旧写法（对象当 If-Match）确实被服务端拒掉 —— 这就是它从来没通过的原因 ── */
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

  /* ── R6：两台设备真的能互相看见 ── */
  {
    const cloud = await makeCloud();
    const a = makeDevice(cloud, 'A');
    const b = makeDevice(cloud, 'B');
    a.setup(); b.setup();

    const ra = await a.Sync.blobPush(NS, payload([book('b1', '日记本')], [entry('e1', 'b1', '只有 A 写的')]), 0);
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

  /* ── R10：落后版本推送 → 409 带最新版本，重推就过 ── */
  {
    const cloud = await makeCloud();
    const a = makeDevice(cloud, 'A');
    const b = makeDevice(cloud, 'B');
    a.setup(); b.setup();
    await a.Sync.blobPush(NS, payload([book('b1', 'x')], []), 0);       // rev 1
    await b.Sync.blobPush(NS, payload([book('b1', 'x')], []), 1);       // rev 2
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

  /* ── R13：令牌错 → 401，且库里不被写脏 ── */
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

  /* ── R15：CORS 只对自己人开 ── */
  {
    const cloud = await makeCloud();
    const self = await cloud.call('GET', '/blob/' + NS, { Authorization: 'Bearer ' + TOKEN });
    ok('R15 来自 https://abbeyroad.local 的请求带 ACAO', self.headers.get('Access-Control-Allow-Origin') === 'https://abbeyroad.local');
    const evil = await cloud.call('GET', '/blob/' + NS, { Authorization: 'Bearer ' + TOKEN, Origin: 'https://evil.example' });
    ok('R16 别的源拿不到 ACAO', evil.headers.get('Access-Control-Allow-Origin') == null);
    ok('R17 If-Match 在预检允许头里（否则浏览器会拦下 PUT）',
      (self.headers.get('Access-Control-Allow-Headers') || '').indexOf('If-Match') >= 0);
  }

  /* ── R18：配置同步的 /state 也不会因为缺种子行卡死 ── */
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

  /* ── 汇总 ── */
  console.log('Whisper 云同步：' + pass + ' 通过 / ' + fail + ' 失败');
  if (fail) {
    bad.forEach(function (b) { console.log('  ✗ ' + b); });
    process.exitCode = 1;
  }
})().catch(function (e) {
  console.error('测试自己崩了：', e);
  process.exitCode = 1;
});

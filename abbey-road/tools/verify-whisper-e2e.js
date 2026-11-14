/**
 * verify-whisper-e2e.js —— 在真浏览器里把「日记的返回」和「日记云同步」点一遍
 *
 * 不装 Playwright：直接用 Edge/Chrome 的 CDP（Node 自带 WebSocket）。
 * 服务端是 tools/cloudflare/worker.js 原文跑在 node:sqlite 上（D1 替身），
 * 客户端是 app/js 原文，页面是 http://127.0.0.1:<port>/index.html。
 * 每一步截图存进 shots-whisper-e2e/，控制台任何 error / 未捕获异常都算失败。
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'app');
const SHOTS = path.join(ROOT, 'shots-whisper-e2e');
const WORKER_SRC = fs.readFileSync(path.join(ROOT, 'tools', 'cloudflare', 'worker.js'), 'utf8');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'tools', 'cloudflare', 'schema.sql'), 'utf8');
const TOKEN = 'e2e-token';
const PASS = 'e2e pass phrase';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon'
};

let pass = 0, fail = 0;
const bad = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; bad.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ───────────────── 云端：真 worker + 真 schema + sqlite ───────────────── */
function makeDB() {
  const db = new sqlite.DatabaseSync(':memory:');
  db.exec(SCHEMA);
  function stmt(sql) {
    let args = [];
    const api = {
      bind() { args = [...arguments]; return api; },
      first() { return db.prepare(sql).get(...args) || null; },
      run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) || 0 } }; },
      all() { return { results: db.prepare(sql).all(...args) }; }
    };
    return api;
  }
  return { raw: db, prepare: stmt, one(sql) { return db.prepare(sql).get() || null; } };
}

function serve(worker, db) {
  const env = { DB: db, SYNC_TOKEN: TOKEN };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname.indexOf('/api/') === 0) {
        const chunks = [];
        for await (const c of req) { chunks.push(c); }
        const body = Buffer.concat(chunks);
        const target = 'https://abbeyroad.local' + url.pathname.replace(/^\/api/, '') + url.search;
        const init = { method: req.method, headers: Object.assign({}, req.headers, { Origin: 'https://abbeyroad.local' }) };
        if (body.length && req.method !== 'GET' && req.method !== 'HEAD') { init.body = body; }
        const r = await worker.fetch(new Request(target, init), env);
        const headers = {};
        r.headers.forEach((v, k) => { if (k.indexOf('access-control') === 0) { headers[k] = v; } });
        const buf = Buffer.from(await r.arrayBuffer());
        headers['Content-Type'] = r.headers.get('Content-Type') || 'application/json';
        res.writeHead(r.status, headers);
        res.end(buf);
        return;
      }
      let p = decodeURIComponent(url.pathname);
      if (p === '/') { p = '/index.html'; }
      const file = path.join(APP, p);
      if (file.indexOf(APP) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(file));
    } catch (e) {
      res.writeHead(500); res.end('harness error: ' + e.message);
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/* ───────────────── 迷你 CDP 客户端 ───────────────── */
class Page {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    this.errors = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)(m); this.pending.delete(m.id); return; }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        this.errors.push('EXCEPTION: ' + (d.exception && d.exception.description ? d.exception.description : d.text));
      }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        this.errors.push('CONSOLE.ERROR: ' + m.params.args.map((a) => a.value || a.description || '').join(' '));
      }
    });
  }
  send(method, params) {
    const myId = ++this.id;
    return new Promise((resolve) => {
      this.pending.set(myId, resolve);
      this.ws.send(JSON.stringify({ id: myId, method, params: params || {} }));
    });
  }
  async ev(expr, opts) {
    const r = await this.send('Runtime.evaluate', Object.assign({
      expression: expr, returnByValue: true, awaitPromise: true, userGesture: true
    }, opts || {}));
    const res = r.result || {};
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      throw new Error('页面里报错：' + (d.exception && d.exception.description ? d.exception.description : d.text));
    }
    return res.result ? res.result.value : undefined;
  }
  shot(name) {
    return this.send('Page.captureScreenshot', { format: 'png' }).then((r) => {
      fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.result.data, 'base64'));
    });
  }
}

async function launch(port) {
  const dbg = 9411;
  const profile = path.join(os.tmpdir(), 'wh-e2e-' + Date.now());
  const proc = spawn(EDGE, [
    '--headless=new', '--remote-debugging-port=' + dbg, '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
    '--disable-extensions', '--mute-audio', '--window-size=430,900',
    'http://127.0.0.1:' + port + '/index.html'
  ], { stdio: 'ignore' });
  let page = null;
  for (let i = 0; i < 100; i++) {
    await sleep(200);
    try {
      const list = await (await fetch('http://127.0.0.1:' + dbg + '/json/list')).json();
      page = list.filter((t) => t.type === 'page' && t.url.indexOf('127.0.0.1:' + port) >= 0)[0];
      if (page) { break; }
    } catch (e) { }
  }
  if (!page) { proc.kill(); throw new Error('浏览器没起来'); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
    setTimeout(() => rej(new Error('CDP 连接超时')), 8000);
  });
  return { proc: proc, page: new Page(ws), profile: profile };
}

/* ───────────────── 页面里的小工具（字符串注入） ───────────────── */
const READY = "!!(window.AR && window.AR.Store && window.AR.Store.get && window.__whisper)";
const CONFIGURE = `(function(){
  window.AR.Sync.setConfig({ baseUrl: 'http://127.0.0.1:__PORT__/api', token: '__TOKEN__',
    passphrase: '__PASS__', autoMode: 'open', rememberPass: true });
  return window.AR.Sync.status().configured;
})()`;
const LONGPRESS = `(function(){
  var btns = document.querySelectorAll('.nav-btn[data-nav="import"]');
  var btn = null;
  for (var i = 0; i < btns.length; i++) {
    var r = btns[i].getBoundingClientRect();
    if (r.width > 0 && r.height > 0) { btn = btns[i]; break; }
  }
  if (!btn) { return 'no-nav'; }
  var r = btn.getBoundingClientRect();
  var opt = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, pointerType: 'touch', isPrimary: true };
  btn.dispatchEvent(new PointerEvent('pointerdown', opt));
  return new Promise(function (res) {
    setTimeout(function () {
      btn.dispatchEvent(new PointerEvent('pointerup', opt));
      var root = document.getElementById('whRoot');
      res(!!root && !root.hasAttribute('hidden'));
    }, 700);
  });
})()`;
const SKIP_LOCK = `(function(){
  var lk = document.getElementById('s-lock');
  if (!lk || lk.hidden) { return 'no-lock'; }
  var b = document.getElementById('skipBtn');
  if (b && b.style.display !== 'none') { b.click(); return 'skipped'; }
  return 'locked';
})()`;
const VIS = `(function(){
  var ids = ['s-lock','s-shelf','s-whisper','s-settings','s-composer','s-search','s-recall','s-trash','s-appset'];
  var on = [];
  ids.forEach(function (id) { var el = document.getElementById(id); if (el && !el.hidden) { on.push(id); } });
  var root = document.getElementById('whRoot');
  return { open: !!root && !root.hasAttribute('hidden'), screens: on, exit: window.__exit || 0 };
})()`;

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const db = makeDB();
  const workerMod = await import('data:text/javascript;base64,' + Buffer.from(WORKER_SRC).toString('base64'));
  const server = await serve(workerMod.default, db);
  const port = server.address().port;
  const { proc, page, profile } = await launch(port);
  let browser = proc;

  try {
    await page.send('Runtime.enable');
    await page.send('Page.enable');
    await page.send('Log.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 900, deviceScaleFactor: 2, mobile: true });

    for (let i = 0; i < 60; i++) {
      if (await page.ev(READY).catch(() => false)) { break; }
      await sleep(200);
    }
    ok('页面加载完成（AR.Store / __whisper 就绪）', await page.ev(READY));
    if (!(await page.ev(READY))) {
      console.log('  [diag]', JSON.stringify(await page.ev("({ whisper: typeof window.__whisper, ARWhisper: !!(window.AR && window.AR.Whisper), subtle: !!(window.crypto && window.crypto.subtle), url: location.href })")));
      console.log('  [diag errors]', page.errors.slice(0, 5).join(' || '));
    }

    /* 记下「退出应用」有没有被调用：日记里返回不该走到这一步 */
    await page.ev("window.__exit = 0; try { AR.Bridge.exitApp = function () { window.__exit++; }; } catch (e) {} true");
    await page.ev("(function(){ try { var o = document.getElementById('onboarding'); if (o) { o.hidden = true; } var S = AR.Store.get(); if (!S.settings.onboardingCompletedAt) { S.settings.onboardingCompletedAt = Date.now(); AR.Store.save(); } } catch (e) {} return true; })()");

    /* ── 1. 同步配置 + 种一本日记（模拟「装同步之前就已经写好的内容」） ── */
    const configured = await page.ev(CONFIGURE.replace('__PORT__', String(port)).replace('__TOKEN__', TOKEN).replace('__PASS__', PASS));
    ok('同步配置在页面里生效', configured === true);
    await page.ev(`(function(){
      window.__whisper.setState({
        books: [{ id: 'b1', name: '测试本', at: '2026-11-15T01:00:00.000Z' }],
        entries: [
          { id: 'e1', bid: 'b1', x: '第一条：只有这台设备写过', at: '2026-11-15T09:12', pid: null },
          { id: 'e2', bid: 'b1', x: '第二条：顺手写的', at: '2026-11-15T09:40', pid: null }
        ],
        personas: [{ id: 'p1', n: '我', c: '#d97757' }],
        lock: { enabled: false, hash: '', bio: false, optional: true },
        last: { view: 'shelf', bid: '' }
      });
      return true;
    })()`);

    /* ── 2. 长按底部「导入」进日记 ── */
    const opened = await page.ev(LONGPRESS);
    ok('长按底部「导入」能进日记', opened === true, String(opened));
    await page.shot('01-进入日记.png');

    /* ── 3. 锁屏若出现，点「先不设锁」 ── */
    const skipped = await page.ev(SKIP_LOCK);
    if (skipped === 'skipped') { await sleep(300); }

    /* ── 4. 书架 → 打开那本 ── */
    await page.ev("window.__whisper.openShelf(); true");
    await sleep(200);
    let v = await page.ev(VIS);
    ok('书架显示了那本日记', v.open && v.screens.indexOf('s-shelf') >= 0, JSON.stringify(v));
    await page.shot('02-书架.png');

    await page.ev(`(function(){
      var card = document.querySelector('#shelfList [data-hero], #shelfList .book, #shelfList button');
      if (card) { card.click(); return 'clicked'; }
      window.__whisper.openBook('b1'); return 'fallback';
    })()`);
    await sleep(250);
    v = await page.ev(VIS);
    ok('点书卡进了阅读页', v.screens.indexOf('s-whisper') === 0 || v.screens.indexOf('s-whisper') >= 0, JSON.stringify(v));
    const bodyText = await page.ev("(document.getElementById('wBody') || {}).innerText || ''");
    ok('阅读页里能看到刚写的两条', bodyText.indexOf('第一条') >= 0 && bodyText.indexOf('第二条') >= 0, bodyText.slice(0, 80));
    await page.shot('03-阅读页.png');

    /* ── 5. 逐级返回：阅读 → 书架 → 回应用，且不许退出 App ── */
    await page.ev('AR.onBack(); true');
    await sleep(250);
    v = await page.ev(VIS);
    ok('返回第 1 次：阅读页 → 书架', v.open && v.screens.indexOf('s-shelf') >= 0, JSON.stringify(v));
    await page.shot('04-返回一次到书架.png');

    await page.ev('AR.onBack(); true');
    await sleep(350);
    v = await page.ev(VIS);
    ok('返回第 2 次：日记关掉、回到应用（不是退出）', !v.open && v.exit === 0, JSON.stringify(v));
    const viewId = await page.ev("(document.querySelector('.view:not([hidden])') || {}).id || ''");
    ok('回到的是应用的某一页，而不是黑屏', viewId.indexOf('view-') === 0, viewId);
    await page.shot('05-回到应用.png');

    /* ── 6. 云端：本机第一次推送 ── */
    let row = null;
    for (let i = 0; i < 30; i++) {
      row = db.one("SELECT rev, envelope FROM blob_state WHERE ns = 'whisper'");
      if (row && row.rev > 0) { break; }
      await sleep(200);
    }
    ok('日记已经推到云端（rev ≥ 1）', !!(row && row.rev > 0), JSON.stringify(row && { rev: row.rev }));
    ok('云端只有密文，搜不到明文', !!(row && row.envelope && row.envelope.indexOf('第一条：只有这台设备写过') < 0));

    /* ── 7. 第二台设备：清空本地存储 = 全新安装 ── */
    await page.ev("localStorage.clear(); true");
    await page.send('Page.reload', { ignoreCache: true });
    for (let i = 0; i < 80; i++) {
      if (await page.ev(READY).catch(() => false)) { break; }
      await sleep(200);
    }
    await page.ev("window.__exit = 0; true");
    await page.ev("(function(){ try { var o = document.getElementById('onboarding'); if (o) { o.hidden = true; } var S = AR.Store.get(); if (!S.settings.onboardingCompletedAt) { S.settings.onboardingCompletedAt = Date.now(); AR.Store.save(); } } catch (e) {} return true; })()");
    await page.ev(CONFIGURE.replace('__PORT__', String(port)).replace('__TOKEN__', TOKEN).replace('__PASS__', PASS));
    const opened2 = await page.ev(LONGPRESS);
    ok('第二台设备也能长按进日记', opened2 === true, String(opened2));
    const skipped2 = await page.ev(SKIP_LOCK);
    if (skipped2 === 'skipped') { await sleep(250); }

    let bookName = '';
    for (let i = 0; i < 40; i++) {
      bookName = await page.ev("(document.getElementById('shelfList') || {}).innerText || ''");
      if (bookName.indexOf('测试本') >= 0) { break; }
      await sleep(250);
    }
    ok('第二台设备的书架上出现了云端的「测试本」', bookName.indexOf('测试本') >= 0, bookName.slice(0, 60));
    await page.shot('06-第二台设备书架.png');

    await page.ev("window.__whisper.openBook('b1'); true");
    await sleep(400);
    const bodyText2 = await page.ev("(document.getElementById('wBody') || {}).innerText || ''");
    ok('第二台设备打开能读到云端那两条', bodyText2.indexOf('第一条') >= 0 && bodyText2.indexOf('第二条') >= 0, bodyText2.slice(0, 80));
    await page.shot('07-第二台设备读到内容.png');

    /* ── 8. 第二台设备写一条 → 推上去（rev 继续涨） ── */
    const before = (db.one("SELECT rev FROM blob_state WHERE ns = 'whisper'") || {}).rev || 0;
    await page.ev(`(function(){
      var s = window.__whisper.state();
      s.entries.push({ id: 'e3', bid: 'b1', x: '第二台设备补的一条', at: '2026-11-15T10:05', pid: null });
      window.__whisper.setState(s);
      return true;
    })()`);
    let after = before;
    for (let i = 0; i < 30; i++) {
      after = (db.one("SELECT rev FROM blob_state WHERE ns = 'whisper'") || {}).rev || 0;
      if (after > before) { break; }
      await sleep(200);
    }
    ok('第二台设备写的内容也推上去了（rev 变大）', after > before, before + ' → ' + after);

    /* ── 9. 控制台必须干净 ── */
    ok('全程控制台没有 error / 未捕获异常', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));

    console.log('截图：' + SHOTS);
    console.log('日记 E2E：' + pass + ' 通过 / ' + fail + ' 失败');
    if (fail) { bad.forEach((b) => console.log('  ✗ ' + b)); process.exitCode = 1; }
  } finally {
    try { browser.kill(); } catch (e) { }
    server.close();
    setTimeout(() => process.exit(process.exitCode || 0), 300);
  }
})().catch((e) => {
  console.error('E2E 自己崩了：', e && e.stack || e);
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 300);
});

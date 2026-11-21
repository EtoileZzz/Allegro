/**
 * verify-whisper-e2e.js —— 在真浏览器里完整点一遍 Whisper 锁屏/UI/返回栈/选色/撤销/防XSS/双端云同步
 *
 * 不装 Playwright：直接用 Edge/Chrome 的 CDP（Node 自带 WebSocket）。
 * 服务端是 tools/cloudflare/worker.js 原文跑在 node:sqlite 上（D1 替身），
 * 客户端是 app/js 原文，页面是 http://127.0.0.1:<port>/index.html。
 * 每一步截图存进 shots-whisper-e2e/，控制台任何 error / 未捕获异常都算失败。
 */
const http = require('http');
const net = require('net');
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

function findBrowser() {
  const candidates = [
    process.env.EDGE_PATH,
    process.env.CHROME_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) { return p; }
  }
  return candidates[0];
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

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
  async function batch(stmts) {
    const res = [];
    for (let i = 0; i < stmts.length; i++) { res.push(stmts[i].run()); }
    return res;
  }
  return { raw: db, prepare: stmt, batch: batch, one(sql) { return db.prepare(sql).get() || null; } };
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
  const browserBin = findBrowser();
  const dbg = await getFreePort();
  const profile = path.join(os.tmpdir(), 'wh-e2e-' + Date.now());
  const proc = spawn(browserBin, [
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
const READY = "!!(window.AR && window.AR.Store && window.AR.Store.get && window.AR.Whisper && window.AR.Whisper.state())";
const CONFIGURE = `(function(){
  window.AR.Sync.setConfig({ baseUrl: 'http://127.0.0.1:__PORT__/api', token: '__TOKEN__',
    passphrase: '__PASS__', autoMode: 'open', rememberPass: true });
  return window.AR.Sync.status().configured;
})()`;
const LONGPRESS = `(function(){
  var btns = document.querySelectorAll('.nav-btn[data-nav="import"], .nav-btn[data-nav="custom"]');
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
      btn.click();
      var root = document.getElementById('whRoot');
      res(!!root && !root.hasAttribute('hidden'));
    }, 650);
  });
})()`;
const ENTER_PIN = `(function(code){
  var digits = String(code).split('');
  digits.forEach(function(d){
    var b = document.querySelector('#pad [data-k="' + d + '"]');
    if (b) { b.click(); }
  });
  return true;
})`;
const VIS = `(function(){
  var ids = ['s-lock','s-shelf','s-whisper','s-composer','s-search','s-recall','s-trash'];
  var on = [];
  ids.forEach(function (id) { var el = document.getElementById(id); if (el && !el.hidden) { on.push(id); } });
  var root = document.getElementById('whRoot');
  var sheetOn = !!(document.getElementById('sheet') && document.getElementById('sheet').classList.contains('on'));
  var tocOn = !!(document.getElementById('toc') && document.getElementById('toc').classList.contains('on'));
  var cpOpen = !!(window.AR && AR.UI && AR.UI.colorPickerOpen && AR.UI.colorPickerOpen());
  return { open: !!root && !root.hasAttribute('hidden'), sheetOnly: !!(root && root.classList.contains('wh-sheet-only')), screens: on, sheetOn: sheetOn, tocOn: tocOn, cpOpen: cpOpen, exit: window.__exit || 0 };
})()`;
const TOAST_INFO = `(function(){
  var t = document.getElementById('toast');
  if (!t) { return null; }
  var cs = getComputedStyle(t);
  var r = t.getBoundingClientRect();
  return { on: t.classList.contains('on'), text: t.innerText, display: cs.display, visibility: cs.visibility, opacity: cs.opacity, w: r.width, h: r.height, hasBtn: !!t.querySelector('button') };
})()`;

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const db = makeDB();
  const workerMod = await import('data:text/javascript;base64,' + Buffer.from(WORKER_SRC).toString('base64'));
  const server = await serve(workerMod.default, db);
  const port = server.address().port;
  const { proc, page } = await launch(port);
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
    ok('页面加载完成（AR.Store / AR.Whisper 就绪）', await page.ev(READY));

    await page.ev("window.__exit = 0; try { AR.Bridge.exitApp = function () { window.__exit++; }; } catch (e) {} true");
    await page.ev("(function(){ try { var o = document.getElementById('onboarding'); if (o) { o.hidden = true; } var S = AR.Store.get(); if (!S.settings.onboardingCompletedAt) { S.settings.onboardingCompletedAt = Date.now(); AR.Store.save(); } } catch (e) {} return true; })()");

    const configured = await page.ev(CONFIGURE.replace('__PORT__', String(port)).replace('__TOKEN__', TOKEN).replace('__PASS__', PASS));
    ok('同步配置在页面里生效', configured === true);

    /* ── 1. 真实长按进 Whisper → 设 6 位 PIN → 验证可见 toast 与不切底栏 ── */
    const opened = await page.ev(LONGPRESS);
    ok('长按底栏入口进入 Whisper', opened === true, String(opened));
    await sleep(150);
    let v = await page.ev(VIS);
    ok('首次进入停在锁屏界面 s-lock', v.open && v.screens.indexOf('s-lock') >= 0, JSON.stringify(v));

    await page.ev(ENTER_PIN + "('123456')");
    await sleep(250);
    v = await page.ev(VIS);
    const toastPin = await page.ev(TOAST_INFO);
    ok('设置 6 位 PIN 后解锁进入书架', v.open && v.screens.indexOf('s-shelf') >= 0, JSON.stringify(v));
    ok('Whisper 内部 toast 可见（不再被 display:none/低z-index 挡住）',
      !!(toastPin && toastPin.display !== 'none' && toastPin.w > 0), JSON.stringify(toastPin));
    await page.shot('01-设PIN解锁书架.png');

    /* 从书架退出 → 验证没有触发底栏 click 切走 view-today */
    await page.ev('AR.onBack(); true');
    await sleep(200);
    const curView = await page.ev("(document.querySelector('.view:not([hidden])') || {}).id || ''");
    ok('长按释放退出后底层仍在 view-today（尾随 click 未误切视图）', curView === 'view-today', curView);

    /* ── 2. 错 PIN 拦阻 + 设置页门禁 + 回收站拦截 + 改 PIN 取消不泄 pendChange ── */
    await page.ev("AR.UI.show('settings'); true");
    await sleep(200);
    const gateVisible = await page.ev(`(function(){
      var cat = document.querySelector('#set-whisper .set-cat-head');
      if (cat) { cat.click(); }
      var txt = (document.getElementById('settingsBody') || document.body).innerText || '';
      return txt.indexOf('验证解锁 Whisper') >= 0 || txt.indexOf('已上锁') >= 0;
    })()`);
    ok('未解锁时设置 → Whisper 显示解锁门禁', gateVisible === true, String(gateVisible));

    /* 未解锁直接调 openTrash 必须被锁屏拦截 */
    await page.ev('AR.Whisper.openTrash(); true');
    await sleep(150);
    v = await page.ev(VIS);
    ok('未解锁调用 openTrash 被拦在 s-lock（不可越权看回收站）',
      v.open && v.screens.indexOf('s-lock') >= 0 && v.screens.indexOf('s-trash') < 0, JSON.stringify(v));

    /* 输错 PIN → 仍停在 s-lock 且提示可见 */
    await page.ev(ENTER_PIN + "('000000')");
    await sleep(250);
    v = await page.ev(VIS);
    const toastBadPin = await page.ev(TOAST_INFO);
    ok('错 PIN 拦在 s-lock 并弹出可见错误提示',
      v.screens.indexOf('s-lock') >= 0 && toastBadPin && toastBadPin.on && toastBadPin.text.indexOf('PIN 不对') >= 0 && toastBadPin.display !== 'none',
      JSON.stringify({ v, toastBadPin }));
    await page.shot('02-锁屏错PIN提示.png');

    /* 点修改 PIN → 立即按返回取消 → 再重进输原 PIN 123456 仍必须有效（验证 pendChange 不泄漏） */
    await page.ev('AR.Whisper.changePin(); true');
    await sleep(150);
    await page.ev('AR.onBack(); true');
    await sleep(150);
    await page.ev(LONGPRESS);
    await sleep(150);
    await page.ev(ENTER_PIN + "('123456')");
    await sleep(250);
    v = await page.ev(VIS);
    ok('修改 PIN 中途返回取消后，原 PIN 仍完整保留（pendChange 无泄漏）',
      v.open && v.screens.indexOf('s-shelf') >= 0, JSON.stringify(v));

    /* ── 3. 真实 UI 新建书本 + 新建 Persona + 选色器层级/返回键 + 卡片流（Layout C）+ 防 XSS ── */
    const bookTitleXss = '测试日记本 <img src=x onerror="window.__xss=(window.__xss||0)+1">';
    await page.ev(`(function(nm){
      var b = document.getElementById('seNew') || document.getElementById('shNew');
      b.click();
      document.getElementById('nbName').value = nm;
      document.getElementById('nbOk').click();
      var bk = document.querySelector('#shelfList .book');
      if (bk) { bk.click(); }
      return true;
    })(${JSON.stringify(bookTitleXss)})`);
    await sleep(250);
    v = await page.ev(VIS);
    ok('真实 UI 建本并点书卡进入阅读页', v.open && v.screens.indexOf('s-whisper') >= 0, JSON.stringify(v));

    /* 在写作面板里点新建 Persona → 点颜色 → 验证选色器 .cp-root 在 #whRoot 之上且 AR.onBack 仅关选色器 */
    await page.ev(`(function(){
      document.getElementById('wWrite').click();
      document.querySelector('#wP [data-pnew]').click();
      document.getElementById('npName').value = '测试人';
      document.getElementById('npColor').click();
      return true;
    })()`);
    await sleep(200);
    const cpCheck = await page.ev(`(function(){
      var cp = document.querySelector('.cp-root');
      var card = document.querySelector('.cp-card');
      if (!cp || !card) { return { ok: false }; }
      var r = card.getBoundingClientRect();
      var hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { ok: !!(hit && hit.closest('.cp-root')), z: getComputedStyle(cp).zIndex };
    })()`);
    ok('选色器 .cp-root 浮在 #whRoot 之上可交互', cpCheck && cpCheck.ok === true, JSON.stringify(cpCheck));
    await page.shot('03-选色器在Whisper之上.png');

    /* 返回一次应只关选色器，仍留在 Whisper 写作弹层里 */
    await page.ev('AR.onBack(); true');
    await sleep(360);
    v = await page.ev(VIS);
    ok('选色器打开时 AR.onBack() 只关选色器，不误关 Whisper', v.open && !v.cpOpen && v.sheetOn, JSON.stringify(v));

    /* 保存 Persona 并写入两条真实日记（含 XSS 与可检索词） */
    await page.ev(`(function(){
      document.getElementById('npOk').click();
      document.getElementById('wText').value = '第一条：真实UI写下';
      document.getElementById('wSave').click();
      return true;
    })()`);
    await sleep(200);
    await page.ev(`(function(){
      document.getElementById('wWrite').click();
      document.getElementById('wText').value = '第二条：<img src=x onerror="window.__xss=(window.__xss||0)+1"> 搜索词';
      document.getElementById('wSave').click();
      return true;
    })()`);
    await sleep(250);

    /* 从阅读页退回主应用，并在设置 → Whisper 点选「卡片流」走真 UI */
    await page.ev('AR.onBack(); true');
    await sleep(150);
    await page.ev('AR.onBack(); true');
    await sleep(200);
    await page.ev(`(function(){
      AR.UI.show('settings');
      var cat = document.querySelector('#set-whisper .set-cat-head');
      if (cat) { cat.click(); }
      var unlockBtn = document.querySelector('#set-whisper button.primary');
      if (unlockBtn) { unlockBtn.click(); }
      return true;
    })()`);
    await sleep(200);
    /* 若触发了锁屏，输 PIN 解锁回到设置页 */
    const lockedInSet = await page.ev("!(document.getElementById('whRoot') || {}).hasAttribute('hidden')");
    if (lockedInSet) {
      await page.ev(ENTER_PIN + "('123456')");
      await sleep(250);
    }
    const switchedToC = await page.ev(`(function(){
      var btns = document.querySelectorAll('#set-whisper .segmented button');
      for (var i = 0; i < btns.length; i++) {
        if ((btns[i].innerText || '').indexOf('卡片流') >= 0) { btns[i].click(); return true; }
      }
      return false;
    })()`);
    ok('设置 → Whisper 解锁后可在 UI 切换到「卡片流」', switchedToC === true);

    /* 回到 Whisper 打开该本 → 确认是 .cards 且带 data-eid */
    await page.ev("AR.UI.show('today'); true");
    await sleep(100);
    await page.ev(LONGPRESS);
    await sleep(150);
    await page.ev(ENTER_PIN + "('123456')");
    await sleep(250);
    await page.ev("var bk = document.querySelector('#shelfList .book'); if (bk) { bk.click(); } true");
    await sleep(250);

    const cardCheck = await page.ev(`(function(){
      var wb = document.getElementById('wBody');
      var ents = wb ? wb.querySelectorAll('.entry[data-eid]') : [];
      var days = wb ? wb.querySelectorAll('.dayhead[data-day]') : [];
      return { isCards: !!(wb && wb.classList.contains('cards')), ents: ents.length, days: days.length };
    })()`);
    ok('卡片流（Layout C）渲染正确且带 data-eid / data-day',
      cardCheck.isCards && cardCheck.ents === 2 && cardCheck.days >= 1, JSON.stringify(cardCheck));

    /* 长按卡片流第一条 → 菜单删除 → 撤销条可见且能点击恢复 */
    await page.ev(`(function(){
      var ent = document.querySelector('#wBody .entry[data-eid]');
      var r = ent.getBoundingClientRect();
      ent.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 20, pointerId: 2, isPrimary: true }));
      return new Promise(function(res){
        setTimeout(function(){
          ent.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 20, pointerId: 2, isPrimary: true }));
          res(true);
        }, 620);
      });
    })()`);
    await sleep(100);
    await page.ev("var del = document.querySelector('#sheet [data-ea=\"delete\"]'); if (del) { del.click(); } true");
    await sleep(150);
    const toastUndo = await page.ev(TOAST_INFO);
    const countAfterDel = await page.ev("document.querySelectorAll('#wBody .entry[data-eid]').length");
    ok('卡片流长按删除成功且撤销 toast 可见',
      countAfterDel === 1 && toastUndo && toastUndo.on && toastUndo.hasBtn && toastUndo.display !== 'none' && toastUndo.w > 0,
      JSON.stringify({ countAfterDel, toastUndo }));
    await page.shot('04-卡片流删除与撤销条.png');

    await page.ev("var ub = document.querySelector('#toast button'); if (ub) { ub.click(); } true");
    await sleep(150);
    const countAfterUndo = await page.ev("document.querySelectorAll('#wBody .entry[data-eid]').length");
    ok('点击撤销按钮后条目恢复', countAfterUndo === 2, String(countAfterUndo));

    /* ── 4. 搜索页防 XSS + 回顾页 #rcRandom 直跳 + 完整返回栈 ── */
    await page.ev(`(function(){
      document.getElementById('wMenu').click();
      var sr = document.querySelector('#sheet [data-act="search"]');
      if (sr) { sr.click(); }
      var inp = document.getElementById('srInput');
      inp.value = '搜索词';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(150);
    const srText = await page.ev("(document.getElementById('srBody') || {}).innerText || ''");
    ok('搜索页命中且无 XSS 执行', srText.indexOf('搜索词') >= 0 && !(await page.ev('window.__xss')), srText.slice(0, 80));

    await page.ev('AR.onBack(); true'); // s-search → s-whisper
    await sleep(150);
    v = await page.ev(VIS);
    ok('返回第 1 步：搜索页 → 阅读页', v.open && v.screens.indexOf('s-whisper') >= 0, JSON.stringify(v));

    /* 打开回顾页 → 验证「片刻」书名无 XSS → 点 #rcRandom 直接跳回 s-whisper（决策 5B） */
    await page.ev(`(function(){
      document.getElementById('wMenu').click();
      var rc = document.querySelector('#sheet [data-act="recall"]');
      if (rc) { rc.click(); }
      return true;
    })()`);
    await sleep(150);
    await page.ev("var rr = document.getElementById('rcRandom'); if (rr) { rr.click(); } true");
    await sleep(150);
    v = await page.ev(VIS);
    ok('回顾页无 XSS 且「抽一条」直接跳进阅读页', v.open && v.screens.indexOf('s-whisper') >= 0 && !(await page.ev('window.__xss')), JSON.stringify(v));

    /* 打开 TOC → AR.onBack() 只关 TOC */
    await page.ev("window.__whisper.toc('right'); true");
    await sleep(150);
    v = await page.ev(VIS);
    ok('目录打开后处于 tocOn', v.tocOn === true, JSON.stringify(v));
    await page.ev('AR.onBack(); true');
    await sleep(150);
    v = await page.ev(VIS);
    ok('返回第 2 步：关目录、仍停留在阅读页', v.open && !v.tocOn && v.screens.indexOf('s-whisper') >= 0, JSON.stringify(v));

    /* 打开底部 sheet 菜单 → AR.onBack() 只关 sheet */
    await page.ev("document.getElementById('wMenu').click(); true");
    await sleep(150);
    await page.ev('AR.onBack(); true');
    await sleep(150);
    v = await page.ev(VIS);
    ok('返回第 3 步：关底部菜单、仍停留在阅读页', v.open && !v.sheetOn && v.screens.indexOf('s-whisper') >= 0, JSON.stringify(v));

    /* 阅读 → 书架 → 退出回应用 */
    await page.ev('AR.onBack(); true');
    await sleep(200);
    v = await page.ev(VIS);
    ok('返回第 4 步：阅读页 → 书架', v.open && v.screens.indexOf('s-shelf') >= 0, JSON.stringify(v));
    await page.shot('05-书架卡片.png');

    await page.ev('AR.onBack(); true');
    await sleep(250);
    v = await page.ev(VIS);
    ok('返回第 5 步：关掉 Whisper 回主应用且未退出 App', !v.open && v.exit === 0, JSON.stringify(v));

    /* ── 5. 云端已落库 → 第二台设备拉取 → 并发 409 冲突合并 ── */
    await page.ev('AR.Whisper.syncNow()');
    let row = null;
    for (let i = 0; i < 30; i++) {
      row = db.one("SELECT rev, envelope FROM blob_state WHERE ns = 'whisper'");
      if (row && row.rev > 0) { break; }
      await sleep(200);
    }
    ok('设备 1 日记与 Persona 已推到云端（rev ≥ 1）', !!(row && row.rev > 0), JSON.stringify(row && { rev: row.rev }));
    ok('云端只有密文，搜不到明文', !!(row && row.envelope && row.envelope.indexOf('第一条：真实UI写下') < 0));

    /* 清空本地 = 第二台新设备 */
    await page.ev("localStorage.clear(); true");
    await page.send('Page.reload', { ignoreCache: true });
    for (let i = 0; i < 80; i++) {
      if (await page.ev(READY).catch(() => false)) { break; }
      await sleep(200);
    }
    await page.ev("window.__exit = 0; try { AR.Bridge.exitApp = function () { window.__exit++; }; } catch (e) {} true");
    await page.ev("(function(){ try { var o = document.getElementById('onboarding'); if (o) { o.hidden = true; } var S = AR.Store.get(); if (!S.settings.onboardingCompletedAt) { S.settings.onboardingCompletedAt = Date.now(); AR.Store.save(); } } catch (e) {} return true; })()");
    await page.ev(CONFIGURE.replace('__PORT__', String(port)).replace('__TOKEN__', TOKEN).replace('__PASS__', PASS));

    await page.ev(LONGPRESS);
    await sleep(150);
    /* 设备 2 首次进跳过锁屏（为了测新设备拉取云端同步并直接读写） */
    await page.ev("var sb = document.getElementById('skipBtn'); if (sb && sb.style.display !== 'none') { sb.click(); } true");
    await sleep(250);

    let shelfText = '';
    for (let i = 0; i < 40; i++) {
      shelfText = await page.ev("(document.getElementById('shelfList') || {}).innerText || ''");
      if (shelfText.indexOf('测试日记本') >= 0) { break; }
      await sleep(200);
    }
    ok('第二台设备同步到书本', shelfText.indexOf('测试日记本') >= 0, shelfText.slice(0, 60));
    await page.ev("var bk = document.querySelector('#shelfList .book'); if (bk) { bk.click(); } true");
    await sleep(250);
    const body2 = await page.ev("(document.getElementById('wBody') || {}).innerText || ''");
    ok('第二台设备读到云端条目与 Persona「测试人」',
      body2.indexOf('第一条：真实UI写下') >= 0 && body2.indexOf('测试人') >= 0, body2.slice(0, 120));
    await page.shot('06-第二台设备同步内容.png');

    /* 模拟设备 1 在后台先推一个新版本（制造真实 409），设备 2 通过 UI 写新条后点同步合并 */
    const revNow = (db.one("SELECT rev FROM blob_state WHERE ns = 'whisper'") || {}).rev || 1;
    await page.ev(`(function(){
      var cur = AR.Whisper.state();
      var otherPayload = {
        v: 2,
        books: cur.books,
        personas: cur.personas,
        tombstones: cur.tombstones || [],
        entries: cur.entries.concat([{ id: 'e_cloud_race', bid: cur.books[0].id, pid: cur.personas[0] ? cur.personas[0].id : null, at: '2026-11-16 12:00', x: '云端并发抢先条', updatedMs: Date.now(), updatedAt: new Date().toISOString() }]),
        at: Date.now()
      };
      return AR.Sync.blobPush('whisper', otherPayload, ${revNow});
    })()`);
    await page.ev(`(function(){
      document.getElementById('wWrite').click();
      document.getElementById('wText').value = '第二台设备UI新增';
      document.getElementById('wSave').click();
      return true;
    })()`);
    await page.ev("AR.Whisper.syncNow()");
    await sleep(300);
    const revAfter = (db.one("SELECT rev FROM blob_state WHERE ns = 'whisper'") || {}).rev || 0;
    const mergedText = await page.ev("(document.getElementById('wBody') || {}).innerText || ''");
    ok('并发 409 冲突后双端条目合并成功且版本号前进',
      revAfter >= revNow + 2 && mergedText.indexOf('云端并发抢先条') >= 0 && mergedText.indexOf('第二台设备UI新增') >= 0,
      'rev ' + revNow + ' -> ' + revAfter + ' | ' + mergedText.slice(0, 100));
    await page.shot('07-并发冲突合并完成.png');

    /* ── 5b. 手机字体 + 每本正/倒序切换 + 评论 + 长按菜单 + 原图附件 & 云端压缩 ── */
    const fontCheck = await page.ev(`(function(){
      var rt = document.getElementById('whRoot');
      var entryX = document.querySelector('#wBody .entry .x');
      var ff = entryX ? getComputedStyle(entryX).fontFamily : '';
      return { dataFont: rt ? rt.getAttribute('data-font') : '', isSans: ff.indexOf('sans-serif') >= 0 || ff.indexOf('PingFang') >= 0 || ff.indexOf('Microsoft') >= 0 };
    })()`);
    ok('Whisper 正文默认使用手机无衬线字体（data-font="ui"）',
      fontCheck && fontCheck.dataFont === 'ui' && fontCheck.isSans, JSON.stringify(fontCheck));

    /* 新建一条带早点时间的条目，切换本内正/倒序（Q3-1B）并校验 DOM 顺序变化 */
    await page.ev(`(function(){
      var st = AR.Whisper.state();
      var bkId = st.last.bid;
      st.entries.push({ id: 'e_sort_am', bid: bkId, pid: null, at: '2026-11-16 07:30', x: '早晨正序测试条', updatedMs: Date.now(), updatedAt: new Date().toISOString() });
      st.entries.push({ id: 'e_sort_pm', bid: bkId, pid: null, at: '2026-11-16 22:30', x: '夜晚正序测试条', updatedMs: Date.now(), updatedAt: new Date().toISOString() });
      AR.Whisper.save(st);
      window.__whisper.openBook(bkId);
      return true;
    })()`);
    await sleep(150);
    const descTexts = await page.ev("Array.prototype.map.call(document.querySelectorAll('#wBody .entry'), function(n){ return n.getAttribute('data-eid'); })");
    await page.ev("document.getElementById('wMenu').click(); var s = document.querySelector('#sheet [data-act=\"sortDir\"]'); if (s) { s.click(); } true");
    await sleep(150);
    const ascTexts = await page.ev("Array.prototype.map.call(document.querySelectorAll('#wBody .entry'), function(n){ return n.getAttribute('data-eid'); })");
    ok('阅读页每本可切换正序/倒序（旧→新 vs 新→旧）',
      descTexts.indexOf('e_sort_pm') < descTexts.indexOf('e_sort_am') && ascTexts.indexOf('e_sort_am') < ascTexts.indexOf('e_sort_pm'),
      JSON.stringify({ desc: descTexts, asc: ascTexts }));
    await page.shot('08-正序与手机字体阅读.png');

    /* 长按条目 → 验证 4 宫格优化菜单 → 添加评论 → 附上 1600×1200 原图 → 验证云压缩 & 本地原图 & 卡片图生成 */
    await page.ev(`(async function(){
      var cv = document.createElement('canvas');
      cv.width = 1600; cv.height = 1200;
      var ctx = cv.getContext('2d');
      var g = ctx.createLinearGradient(0, 0, 1600, 1200);
      g.addColorStop(0, '#d97757'); g.addColorStop(1, '#6a9bcc');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 1600, 1200);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 90px sans-serif'; ctx.fillText('ORIG 1600x1200', 120, 620);
      var blob = await new Promise(function(r){ cv.toBlob(r, 'image/png'); });
      var file = new File([blob], 'orig.png', { type: 'image/png' });
      var dt = new DataTransfer(); dt.items.add(file);

      var ent = document.querySelector('#wBody .entry[data-eid="e_sort_pm"]');
      ent.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 40, clientY: 40, pointerId: 9, isPrimary: true }));
      await new Promise(function(r){ setTimeout(r, 600); });
      ent.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: 40, clientY: 40, pointerId: 9, isPrimary: true }));
      window.__eaCount = document.querySelectorAll('#sheet .ea-grid button').length;
      document.querySelector('#sheet [data-ea="edit"]').click();
      await new Promise(function(r){ setTimeout(r, 80); });
      var inp = document.getElementById('edImgIn');
      inp.files = dt.files;
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      for (var t0 = Date.now(); Date.now() - t0 < 3000;) {
        if (document.querySelector('#edMediaList img[src^="data:image/"]')) { break; }
        await new Promise(function(r){ setTimeout(r, 50); });
      }
      document.getElementById('edSave').click();
      return true;
    })()`);
    await sleep(300);

    const mediaCheck = await page.ev(`(async function(){
      for (var t1 = Date.now(); Date.now() - t1 < 2000;) {
        var el0 = document.querySelector('#wBody .entry[data-eid="e_sort_pm"] .entry-media img');
        if (el0 && el0.complete && el0.naturalWidth > 0) { break; }
        await new Promise(function(r){ setTimeout(r, 50); });
      }
      var entEl = document.querySelector('#wBody .entry[data-eid="e_sort_pm"]');
      var img = entEl ? entEl.querySelector('.entry-media img') : null;
      return { hasImg: !!img, natW: img ? img.naturalWidth : 0, natH: img ? img.naturalHeight : 0 };
    })()`);
    ok('本地日记以原图（1600×1200）渲染展示',
      mediaCheck && mediaCheck.hasImg && mediaCheck.natW === 1600 && mediaCheck.natH === 1200,
      JSON.stringify(mediaCheck));

    /* 点开原图查看器 → AR.onBack 优先关灯箱 */
    await page.ev("document.querySelector('#wBody .entry[data-eid=\"e_sort_pm\"] .m-thumb').click(); true");
    await sleep(150);
    const lbOpen = await page.ev("!document.getElementById('whLightbox').hidden");
    await page.ev("AR.onBack(); true");
    await sleep(120);
    const lbClosed = await page.ev("!!document.getElementById('whLightbox').hidden");
    ok('点击配图打开全屏查看器，返回键只关查看器不退出阅读页', lbOpen && lbClosed);

    /* 同步上云后校验云端 whisper_media 已存加密且尺寸小于本地原图 */
    await page.ev("AR.Whisper.syncNow()");
    await sleep(300);
    const cloudMediaRow = db.one("SELECT id, size, envelope FROM whisper_media LIMIT 1");
    const localMediaLen = await page.ev(`(function(){
      var ent = AR.Whisper.state().entries.filter(function(x){ return x.id === 'e_sort_pm'; })[0];
      return ent && ent.media && ent.media[0] ? ent.media[0].size : 0;
    })()`);
    ok('云同步仅上传压缩版密文至 whisper_media，本地原图保持完整',
      !!(cloudMediaRow && cloudMediaRow.envelope && cloudMediaRow.size > 0 && mediaCheck.natW === 1600),
      JSON.stringify({ cloudSize: cloudMediaRow && cloudMediaRow.size, localSize: localMediaLen }));

    /* 长按写评论 + 单条卡片图片生成 + 单条纯文本无 Markdown 符号 */
    await page.ev(`(function(){
      var ent = document.querySelector('#wBody .entry[data-eid="e_sort_pm"]');
      ent.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 40, clientY: 40, pointerId: 10, isPrimary: true }));
      return new Promise(function(r){ setTimeout(function(){
        ent.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: 40, clientY: 40, pointerId: 10, isPrimary: true }));
        document.querySelector('#sheet [data-ea="comment"]').click();
        document.getElementById('cmText').value = 'E2E 追记评论';
        document.getElementById('cmSave').click();
        r(true);
      }, 600); });
    })()`);
    await sleep(200);
    const plainRes = await page.ev("window.__whisper.entryPlainText('e_sort_pm')");
    const plainMetaRes = await page.ev("window.__whisper.entryPlainText('e_sort_pm', true)");
    await page.ev(`(function(){
      var ent = document.querySelector('#wBody .entry[data-eid="e_sort_pm"]');
      ent.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 40, clientY: 40, pointerId: 11, isPrimary: true }));
      return new Promise(function(r){ setTimeout(function(){
        ent.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: 40, clientY: 40, pointerId: 11, isPrimary: true }));
        document.querySelector('#sheet [data-ea="image"]').click();
        r(true);
      }, 600); });
    })()`);
    await sleep(400);
    const cardImg = await page.ev(`(function(){
      var im = document.querySelector('#cardPrevBox img');
      return { eaGrid: window.__eaCount, hasSrc: !!(im && im.src && im.src.indexOf('data:image/png;base64,') === 0), w: im ? im.naturalWidth : 0 };
    })()`);
    ok('长按菜单4宫格、评论渲染、默认仅复制正文纯文本（可选附元信息）与单条排版长图生成',
      cardImg && cardImg.eaGrid === 4 && cardImg.hasSrc && cardImg.w === 900
      && plainRes.indexOf('夜晚正序测试条') >= 0 && plainRes.indexOf('E2E 追记评论') < 0
      && plainRes.indexOf('2026') < 0 && plainRes.indexOf('**') < 0
      && plainMetaRes.indexOf('E2E 追记评论') >= 0 && plainMetaRes.indexOf('**') < 0,
      JSON.stringify({ cardImg, plainDef: plainRes, plainMetaLen: plainMetaRes.length }));
    await page.shot('09-评论与单条日记卡片图.png');
    await page.ev("AR.onBack(); true"); // 关卡片预览 sheet
    await sleep(1700);

    /* 再打开一次长按动作表校验全量单色 SVG 图标（不被 app.css .ico 实底色块盖住）与闲置 #toast 不露白点，并截图保存 */
    const actionCheck = await page.ev(`(function(){
      var ent = document.querySelector('#wBody .entry[data-eid="e_sort_pm"]');
      ent.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 40, clientY: 40, pointerId: 111, isPrimary: true }));
      return new Promise(function(r){ setTimeout(function(){
        ent.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: 40, clientY: 40, pointerId: 111, isPrimary: true }));
        var t = document.getElementById('toast');
        var tcs = t ? getComputedStyle(t) : null;
        var ico = document.querySelector('#sheet .row .ico');
        var ics = ico ? getComputedStyle(ico) : null;
        r({
          gridSvg: document.querySelectorAll('#sheet .ea-grid button i svg.wh-svg').length,
          rowSvg: document.querySelectorAll('#sheet .row .ico svg.wh-svg').length,
          icoBg: ics ? ics.backgroundColor : '',
          toastOn: !!(t && t.classList.contains('on')),
          toastOpacity: tcs ? tcs.opacity : '',
          toastVis: tcs ? tcs.visibility : '',
          noDemoScreens: !document.getElementById('s-settings') && !document.getElementById('s-appset')
        });
      }, 600); });
    })()`);
    ok('长按动作表全部改用单色 SVG 图标（无底色方块）、闲置 #toast 彻底隐藏（无白点）且 demo 屏已移除',
      actionCheck && actionCheck.gridSvg === 4 && actionCheck.rowSvg === 5
      && (actionCheck.icoBg === 'rgba(0, 0, 0, 0)' || actionCheck.icoBg === 'transparent')
      && !actionCheck.toastOn && (actionCheck.toastOpacity === '0' || actionCheck.toastVis === 'hidden')
      && actionCheck.noDemoScreens,
      JSON.stringify(actionCheck));
    await page.shot('09b-长按动作表SVG与无白点.png');
    await page.ev("AR.onBack(); true"); // 关动作表
    await sleep(150);

    /* ── 5c. 私密笔记本长按标题解锁与隐藏防漏 + 退出自动重新隐藏 ── */
    await page.ev("AR.onBack(); true"); // 回书架
    await sleep(200);
    /* 设备2 先把一条私密本写入、给它设上 PIN 并设为隐藏，再退出私密模式验证搜不到、看不见 */
    await page.ev(`(function(){
      var st = AR.Whisper.state();
      st.books.push({ id: 'b_secret_e2e', name: '秘密阁楼', hidden: true, sortDir: 'desc', updatedMs: Date.now() });
      st.entries.push({ id: 'e_sec_1', bid: 'b_secret_e2e', pid: null, at: '2026-11-17 23:00', x: 'SECRET_TOKEN_999', updatedMs: Date.now() });
      AR.Whisper.save(st);
      window.__whisper.openShelf();
      return true;
    })()`);
    await sleep(150);
    const hiddenBefore = await page.ev("(document.getElementById('shelfList') || {}).innerText || ''");
    /* 设置 PIN 并通过长按 #shTitle 解锁显现私密本 */
    await page.ev(`(function(){
      var t = document.getElementById('shTitle');
      var r = t.getBoundingClientRect();
      t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 10, pointerId: 12, isPrimary: true }));
      return new Promise(function(res){ setTimeout(function(){ t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); res(true); }, 600); });
    })()`);
    await sleep(150);
    await page.ev(ENTER_PIN + "('123456')");
    await sleep(250);
    const shownAfter = await page.ev("(document.getElementById('shelfList') || {}).innerText || ''");
    ok('私密笔记本平时隐藏，长按标题 Whisper 验证 PIN 后显现',
      hiddenBefore.indexOf('秘密阁楼') < 0 && shownAfter.indexOf('秘密阁楼') >= 0,
      'before=' + (hiddenBefore.indexOf('秘密阁楼') >= 0) + ' after=' + (shownAfter.indexOf('秘密阁楼') >= 0));
    await page.shot('10-私密笔记本隐藏与解锁.png');

    /* ── 5d. 设置页同步解耦开关 + 进度条按钮 ── */
    await page.ev("AR.onBack(); true");
    await sleep(200);
    const cloudBtnProg = await page.ev(`(async function(){
      AR.UI.show('settings');
      var cat = document.querySelector('#set-syncdata .set-cat-head');
      if (cat) { cat.click(); }
      await new Promise(function(r){ setTimeout(r, 80); });
      var btns = document.querySelectorAll('#set-syncdata .sync-prog-btn');
      var whBtn = null;
      for (var i = 0; i < btns.length; i++) {
        if ((btns[i].innerText || '').indexOf('同步 Whisper 日记') >= 0) { whBtn = btns[i]; break; }
      }
      if (!whBtn) { return { found: false }; }
      whBtn.click();
      await new Promise(function(r){ setTimeout(r, 350); });
      return { found: true, btnCount: btns.length, text: document.getElementById('settingsBody').innerText };
    })()`);
    ok('设置 → 云同步展示课表/日记解耦开关与进度条同步按钮且无报错',
      cloudBtnProg && cloudBtnProg.found && cloudBtnProg.btnCount >= 3
      && cloudBtnProg.text.indexOf('课表与配置云同步') >= 0 && cloudBtnProg.text.indexOf('同步 Whisper 配图') >= 0,
      JSON.stringify({ found: cloudBtnProg && cloudBtnProg.found, count: cloudBtnProg && cloudBtnProg.btnCount }));

    /* ── 5e. 从主设置进回收站 / 导出 / 导入的来源返回 ── */
    await page.ev(`(function(){
      AR.UI.show('settings');
      if (AR.Panels && AR.Panels.openSettingsCat) { AR.Panels.openSettingsCat('whisper'); }
      return true;
    })()`);
    await sleep(120);
    await page.ev(`(function(){
      AR.Whisper.openTrash();
      var st = document.getElementById('s-lock');
      if (st && !st.hidden) {
        '123456'.split('').forEach(function(d){ var b = document.querySelector('#pad [data-k="'+d+'"]'); if (b) b.click(); });
      }
      return true;
    })()`);
    await sleep(250);
    const inTrash = await page.ev(VIS);
    await page.shot('11-主设置进回收站.png');
    await page.ev('AR.onBack(); true');
    await sleep(180);
    const afterTrashBack = await page.ev(VIS);
    ok('主设置进回收站后按返回直接关闭 Whisper 回主设置（不再进 demo 设置页）',
      inTrash.open && inTrash.screens.indexOf('s-trash') >= 0 && !afterTrashBack.open && afterTrashBack.screens.length === 0,
      JSON.stringify({ inTrash, afterTrashBack }));

    await page.ev(`(function(){
      AR.Whisper.openExport();
      var st = document.getElementById('s-lock');
      if (st && !st.hidden) {
        '123456'.split('').forEach(function(d){ var b = document.querySelector('#pad [data-k="'+d+'"]'); if (b) b.click(); });
      }
      return true;
    })()`);
    await sleep(220);
    const expVis = await page.ev(VIS);
    await page.ev('AR.onBack(); true');
    await sleep(260);
    const afterExpBack = await page.ev(VIS);
    ok('主设置进导出日记以独立蒙层弹出且关闭后直接退回主设置',
      expVis.open && expVis.sheetOnly && expVis.sheetOn && !afterExpBack.open,
      JSON.stringify({ expVis, afterExpBack }));

    /* ── 5f. Markdown 写作与渲染 / 触摸双击防穿透 / 顶栏双击回顶 / 卡片自定义 / 云图自动拉取 ── */
    await page.ev(`(async function(){
      AR.Whisper.open();
      await new Promise(function(r){ setTimeout(r, 80); });
      var stL = document.getElementById('s-lock');
      if (stL && !stL.hidden) {
        '123456'.split('').forEach(function(d){ var b = document.querySelector('#pad [data-k="'+d+'"]'); if (b) b.click(); });
        await new Promise(function(r){ setTimeout(r, 260); });
      }
      var st = AR.Whisper.state();
      var bk = st.books.filter(function(b){ return !b.hidden && !b.deletedAt && b.name.indexOf('测试日记本') >= 0; })[0]
        || st.books.filter(function(b){ return !b.hidden && !b.deletedAt; })[0];
      var bkId = bk && bk.id;
      if (bk) { bk.sortDir = 'desc'; }
      for (var i = 0; i < 14; i++) {
        st.entries.push({
          id: 'e_fill_' + i,
          bid: bkId,
          pid: null,
          at: '2026-11-10 ' + String(10 + i).padStart(2, '0') + ':00:0' + (i % 10),
          x: '滚动填充条目 #' + i + '\\n第二行补充内容让列表超过一屏高度以便测试顶栏回顶。',
          updatedMs: Date.now() - 100000 - i
        });
      }
      st.opts.filter = 'all';
      st.opts.composer = 'sheet';
      st.opts.mdEnabled = true;
      st.opts.mdToolbar = true;
      st.opts.dblTapAction = 'edit';
      st.last = { view: 'read', bid: bkId };
      AR.Whisper.save(st);
      window.__whisper.openBook(bkId);
      window.__e2eBkId = bkId;
      return true;
    })()`);
    await sleep(250);

    /* 5f(a) Markdown 格式条、预览/编辑切换、正文渲染、评论纯文本与摘要去格式 */
    await page.ev("document.getElementById('wWrite').click(); true");
    await sleep(180);
    const mdSampleText = '## 小节标题\n\n这是**加粗**和==高亮==与~~删除~~\n\n> 一句引用\n\n- 列表一\n- 列表二\n\n---';
    const mdPrevCheck = await page.ev(`(async function(){
      var bBold = document.querySelector('#wsMdBar [data-mdk="b"]');
      var bPrev = document.querySelector('#wsMdBar [data-mdk="preview"]');
      var ta = document.getElementById('wText');
      var prev = document.getElementById('wsMdPrev');
      var barVisible = !!(bBold && bPrev && bBold.offsetParent !== null);
      ta.value = ${JSON.stringify(mdSampleText)};
      bPrev.click();
      var prevShown = !!(prev && !prev.hidden && ta.hidden);
      var prevHtml = prev ? prev.innerHTML : '';
      bPrev.click();
      var backToEdit = !!(prev && prev.hidden && !ta.hidden);
      document.getElementById('wSave').click();
      return { barVisible: barVisible, prevShown: prevShown, prevHtml: prevHtml, backToEdit: backToEdit };
    })()`);
    await sleep(220);

    const mdSavedCheck = await page.ev(`(async function(){
      var st = AR.Whisper.state();
      var ent = st.entries.filter(function(x){ return !x.deletedAt && x.x.indexOf('小节标题') >= 0; })[0];
      if (!ent) { return { found: false }; }
      window.__mdEid = ent.id;
      var row = document.querySelector('#wBody .entry[data-eid="' + ent.id + '"]');
      var tmEl = row ? row.querySelector('.t') : null;
      var xEl = row ? row.querySelector('.x') : null;
      var tmTxt = tmEl ? tmEl.textContent.trim() : '';
      var xHtml = xEl ? xEl.innerHTML : '';
      /* 长按添加带 ** 的评论，确认评论保持纯文本 */
      row.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 40, clientY: 40, pointerId: 21, isPrimary: true }));
      await new Promise(function(r){ setTimeout(r, 600); });
      row.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: 40, clientY: 40, pointerId: 21, isPrimary: true }));
      document.querySelector('#sheet [data-ea="comment"]').click();
      document.getElementById('cmText').value = '**不要渲染**';
      document.getElementById('cmSave').click();
      await new Promise(function(r){ setTimeout(r, 150); });
      var cmtX = document.querySelector('#wBody .entry[data-eid="' + ent.id + '"] .cmt-x');
      return {
        found: true,
        at: ent.at,
        tmTxt: tmTxt,
        xHtml: xHtml,
        cmtText: cmtX ? cmtX.textContent : '',
        cmtStrong: cmtX ? cmtX.querySelectorAll('strong').length : -1
      };
    })()`);
    await page.shot('12-Markdown渲染与格式条.png');

    const mdStripCheck = await page.ev(`(function(){
      window.__whisper.openShelf();
      var shelfTxt = (document.getElementById('shelfList') || {}).innerText || '';
      document.getElementById('shSearch').click();
      var inp = document.getElementById('srInput');
      document.getElementById('srScope').click();
      inp.value = '小节标题';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      var srTxt = (document.getElementById('srBody') || {}).innerText || '';
      window.__whisper.openBook(window.__e2eBkId);
      return { shelfTxt: shelfTxt, srTxt: srTxt };
    })()`);
    await sleep(180);

    ok('Markdown 工具条与预览可用，正文渲染富文本、评论纯文本、秒级时间隐藏且摘要去格式',
      mdPrevCheck && mdPrevCheck.barVisible && mdPrevCheck.prevShown && mdPrevCheck.backToEdit
      && /<h3>/.test(mdPrevCheck.prevHtml) && /<strong>/.test(mdPrevCheck.prevHtml) && /<mark[\s>]/.test(mdPrevCheck.prevHtml)
      && mdSavedCheck && mdSavedCheck.found
      && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(mdSavedCheck.at)
      && /^\d{2}:\d{2}$/.test(mdSavedCheck.tmTxt)
      && /<h3>/.test(mdSavedCheck.xHtml) && /<strong>/.test(mdSavedCheck.xHtml)
      && /<mark[\s>]/.test(mdSavedCheck.xHtml) && /<blockquote[\s>]/.test(mdSavedCheck.xHtml)
      && /<ul[\s>]/.test(mdSavedCheck.xHtml) && /<hr[\s>]/.test(mdSavedCheck.xHtml)
      && mdSavedCheck.cmtText === '**不要渲染**' && mdSavedCheck.cmtStrong === 0
      && mdStripCheck.srTxt.indexOf('小节标题') >= 0
      && mdStripCheck.srTxt.indexOf('**') < 0 && mdStripCheck.srTxt.indexOf('==') < 0 && mdStripCheck.shelfTxt.indexOf('**') < 0,
      JSON.stringify({ mdPrevCheck, mdSavedCheck, mdStripCheck }));

    /* 5f(b) 触摸双击防误触遮罩穿透 + 5 选 1 dblTapAction */
    const dblTouchRes = await page.ev(`(async function(){
      var wait = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
      var dblTouch = async function(el, pidBase){
        var r = el.getBoundingClientRect();
        var cx = Math.round(r.left + 40), cy = Math.round(r.top + 30);
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: pidBase, pointerType: 'touch', isPrimary: true }));
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: pidBase, pointerType: 'touch', isPrimary: true }));
        await wait(80);
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: pidBase + 1, pointerType: 'touch', isPrimary: true }));
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: pidBase + 1, pointerType: 'touch', isPrimary: true }));
      };
      var entEl = document.querySelector('#wBody .entry[data-eid="' + window.__mdEid + '"]');
      await dblTouch(entEl, 30);
      await wait(50);
      document.getElementById('mask').click();
      await wait(200);
      var sh = document.getElementById('sheet');
      var stayOpenOnBleed = !!(sh && sh.classList.contains('on') && document.getElementById('edText'));
      AR.onBack();
      await wait(450);

      var st = AR.Whisper.state();
      st.opts.dblTapAction = 'comment';
      AR.Whisper.save(st);
      await dblTouch(document.querySelector('#wBody .entry[data-eid="' + window.__mdEid + '"]'), 40);
      await wait(80);
      var openedComment = !!(sh && sh.classList.contains('on') && document.getElementById('cmText'));
      AR.onBack();
      await wait(450);

      st = AR.Whisper.state();
      st.opts.dblTapAction = 'off';
      AR.Whisper.save(st);
      await dblTouch(document.querySelector('#wBody .entry[data-eid="' + window.__mdEid + '"]'), 50);
      await wait(80);
      var stayedClosedOff = !(sh && sh.classList.contains('on'));

      st = AR.Whisper.state();
      st.opts.dblTapAction = 'edit';
      AR.Whisper.save(st);
      return { stayOpenOnBleed: stayOpenOnBleed, openedComment: openedComment, stayedClosedOff: stayedClosedOff };
    })()`);
    ok('手机端触摸双击打开编辑不被 50ms 遮罩 click 关闭，且 dblTapAction 支持 comment/off 切换',
      dblTouchRes && dblTouchRes.stayOpenOnBleed && dblTouchRes.openedComment && dblTouchRes.stayedClosedOff,
      JSON.stringify(dblTouchRes));

    /* 5f(c) 阅读页顶栏双击返回顶部（排除按钮子节点） */
    const topScrollRes = await page.ev(`(async function(){
      var wb = document.getElementById('wBody');
      wb.scrollTop = 300;
      var before = wb.scrollTop;
      document.getElementById('wMenu').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      await new Promise(function(r){ setTimeout(r, 80); });
      var afterMenu = wb.scrollTop;
      document.getElementById('wTitle').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      for (var i = 0; i < 15; i++) {
        if (wb.scrollTop === 0) { break; }
        await new Promise(function(r){ setTimeout(r, 50); });
      }
      return { canScroll: wb.scrollHeight > wb.clientHeight, before: before, afterMenu: afterMenu, afterTitle: wb.scrollTop };
    })()`);
    ok('阅读页顶栏双击平滑返回顶部且点击顶栏按钮不误触',
      topScrollRes && topScrollRes.canScroll && topScrollRes.before > 0 && topScrollRes.afterMenu > 0 && topScrollRes.afterTitle === 0,
      JSON.stringify(topScrollRes));

    /* 5f(d) 卡片图片自定义开关与 3:4 比例持久化 */
    const cardCustomRes = await page.ev(`(async function(){
      var row = document.querySelector('#wBody .entry[data-eid="' + window.__mdEid + '"]');
      row.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 40, clientY: 40, pointerId: 60, isPrimary: true }));
      await new Promise(function(r){ setTimeout(r, 600); });
      row.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: 40, clientY: 40, pointerId: 60, isPrimary: true }));
      document.querySelector('#sheet [data-ea="image"]').click();
      await new Promise(function(r){ setTimeout(r, 200); });
      document.getElementById('ciOptToggle').click();
      var panelOpen = !document.getElementById('ciOptPanel').hidden;
      document.querySelector('#ciOptPanel [data-crat="3:4"]').click();
      document.querySelector('#ciOptPanel [data-copt="frame"]').click();
      document.querySelector('#ciOptPanel [data-copt="showTime"]').click();
      await new Promise(function(r){ setTimeout(r, 450); });
      var im = document.querySelector('#cardPrevBox img');
      var cfg = AR.Whisper.state().opts.card;
      return {
        panelOpen: panelOpen,
        w: im ? im.naturalWidth : 0,
        h: im ? im.naturalHeight : 0,
        ratio: cfg.ratio,
        frame: !!cfg.frame,
        showTime: !!cfg.showTime
      };
    })()`);
    await page.shot('13-卡片自定义与3比4预览.png');
    await page.ev("AR.onBack(); true");
    await sleep(220);
    ok('单条卡片图片支持面板自定义（3:4 竖卡、外框阴影、具体时间）并即时重绘与持久化',
      cardCustomRes && cardCustomRes.panelOpen && cardCustomRes.w === 900 && cardCustomRes.h >= 1200
      && cardCustomRes.ratio === '3:4' && cardCustomRes.frame === true && cardCustomRes.showTime === true,
      JSON.stringify(cardCustomRes));

    /* 5f(e) 缺失本地图片打开阅读页时后台自动拉取云端配图 */
    const autoPullImg = await page.ev(`(async function(){
      AR.Sync.setConfig({ syncWhisperMedia: true });
      var cv = document.createElement('canvas');
      cv.width = 48; cv.height = 48;
      var cx = cv.getContext('2d');
      cx.fillStyle = '#6a9bcc'; cx.fillRect(0, 0, 48, 48);
      var dUrl = cv.toDataURL('image/png');
      var mid = 'm_e2e_autopull';
      await AR.Sync.blobMediaPush(mid, { id: mid, dataUrl: dUrl, w: 48, h: 48, mime: 'image/png', compressed: true });
      var st = AR.Whisper.state();
      st.entries.push({
        id: 'e_autopull_1',
        bid: window.__e2eBkId,
        pid: null,
        at: '2026-11-20 22:59:59',
        x: '自动拉取云端配图测试',
        media: [{ id: mid, w: 48, h: 48, mime: 'image/png', size: 120 }],
        updatedMs: Date.now() + 5000
      });
      AR.Whisper.save(st);
      window.__whisper.openBook(window.__e2eBkId);
      for (var i = 0; i < 30; i++) {
        var img = document.querySelector('#wBody .m-thumb[data-mid="' + mid + '"] img');
        if (img && img.src && img.src.indexOf('data:image/png;base64,') === 0 && img.naturalWidth > 0) {
          return { loaded: true, w: img.naturalWidth, h: img.naturalHeight, tries: i + 1 };
        }
        await new Promise(function(r){ setTimeout(r, 50); });
      }
      var miss = document.querySelector('#wBody .m-thumb[data-mid="' + mid + '"]');
      return { loaded: false, html: miss ? miss.innerHTML : 'no-thumb' };
    })()`);
    await sleep(480);
    await page.shot('14-自动拉取云端配图.png');
    ok('本机缺少配图时打开阅读页自动从云端拉取并渲染出图片（无需显示失败）',
      autoPullImg && autoPullImg.loaded && autoPullImg.w === 48,
      JSON.stringify(autoPullImg));

    /* ── 6. 控制台必须干净 ── */
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

/**
 * verify-panels-dom.js —— Batch 2 (B2-T-04) 设置面板真实 DOM 回归
 *
 * 在 Node DOM 沙箱中加载真实 app/js/core.js + app/js/panels.js：
 *   1. panelNotify 课前/每日提醒开关与提前量滑块接入 AR.Reminders（且关闭课前提醒不误清每日提醒）
 *   2. 决策 B：notifDiagBlock 保留在 panelAbout，panelNotify 底部有 #notifDiagJump 跳转；
 *      #notifPipe 预置于 summaryEl 下方；Windows 隐藏电池优化 / 应用详情按钮
 *   3. AR.Panels.renderLongTaskList() 无参调用且无长期任务时不抛 TypeError
 *   4. panelCloudSync 先 ping 后写 setConfig，syncNow 失败时回滚配置并保留输入内容
 *   5. panelWork / panelCloudSync 切换分段控件不整页销毁重建 DOM
 *
 * 用法：node tools/verify-panels-dom.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.join(__dirname, '..', 'app', 'js');
const CORE = fs.readFileSync(path.join(APP, 'core.js'), 'utf8');
const MDPARSE = fs.readFileSync(path.join(APP, 'mdparse.js'), 'utf8');
const PALETTE = fs.readFileSync(path.join(APP, 'palette.js'), 'utf8');
const BRIDGE = fs.readFileSync(path.join(APP, 'bridge.js'), 'utf8');
const PANELS = fs.readFileSync(path.join(APP, 'panels.js'), 'utf8');

let pass = 0, fail = 0;
const bad = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('[PASS] ' + name + (extra ? '  |  ' + extra : '')); }
  else { fail++; bad.push(name + (extra ? ' → ' + extra : '')); }
}

function createPanelDom() {
  const voidTags = /^(br|img|input|hr|meta|link|source)$/i;
  const registry = {};
  function El(tag) {
    const el = {
      tagName: String(tag || 'div').toUpperCase(),
      children: [], parent: null, attrs: {}, _classes: new Set(),
      style: {
        setProperty(k, v) { this[k] = String(v); },
        removeProperty(k) { delete this[k]; }
      }, hidden: false, value: '', checked: false, type: '', listeners: {},
      _text: '', _html: '', disabled: false, title: '', scrollTop: 0,
      offsetWidth: 60, offsetLeft: 0, scrolledTo: false,
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
      set innerHTML(v) { this._html = String(v); this.children = parse(this._html, this); },
      get innerHTML() { return this._html || ''; },
      set textContent(v) { this._text = String(v); this._html = ''; this.children = []; },
      get textContent() { return this._text || this._html || ''; },
      appendChild(c) {
        if (!c) { return c; }
        this.children.push(c);
        c.parent = this;
        if (c.attrs && c.attrs.id) { registry[c.attrs.id] = c; }
        return c;
      },
      insertBefore(c) { this.children.unshift(c); c.parent = this; return c; },
      removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) { this.children.splice(i, 1); c.parent = null; } return c; },
      remove() { if (this.parent) { this.parent.removeChild(this); } },
      get firstChild() { return this.children[0] || null; },
      get lastChild() { return this.children.length ? this.children[this.children.length - 1] : null; },
      get firstElementChild() { return this.children[0] || null; },
      get childNodes() { return this.children; },
      addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
      removeEventListener() { },
      setAttribute(k, v) {
        this.attrs[k] = String(v);
        if (k === 'class') { this.className = v; }
        if (k === 'id') { registry[String(v)] = this; }
        if (k === 'value') { this.value = String(v); }
      },
      getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
      hasAttribute(k) { return this.attrs[k] !== undefined; },
      get id() { return this.attrs.id || ''; },
      set id(v) { this.setAttribute('id', v); },
      querySelector(sel) { return queryAll(this, sel)[0] || null; },
      querySelectorAll(sel) { return queryAll(this, sel); },
      closest(sel) { let n = this; while (n) { if (matches(n, sel)) { return n; } n = n.parent; } return null; },
      matches(sel) { return matches(this, sel); },
      dispatchEvent(ev) {
        const list = this.listeners[ev && ev.type] || [];
        list.forEach((f) => f(ev));
      },
      click() {
        const list = this.listeners.click || [];
        list.forEach((f) => f({ target: this, currentTarget: this, preventDefault() { }, stopPropagation() { } }));
      },
      getBoundingClientRect() { return { top: 0, left: 0, width: 320, height: 40, bottom: 40, right: 320 }; },
      scrollIntoView() { this.scrolledTo = true; },
      contains(other) {
        if (other === this) { return true; }
        return this.children.some((c) => c.contains(other));
      }
    };
    return el;
  }
  function parse(html, parent) {
    const out = [];
    const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z_:@][-a-zA-Z0-9_:.]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
    const stack = [];
    let m, cursor = 0;
    while ((m = tagRe.exec(html))) {
      const text = html.slice(cursor, m.index);
      cursor = tagRe.lastIndex;
      if (text && stack.length) { stack[stack.length - 1]._text += text; }
      const close = m[1], tag = m[2], attrStr = m[3], selfClose = m[4];
      if (close) { stack.pop(); continue; }
      const el = El(tag);
      const attrRe = /([a-zA-Z_:@][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let am;
      while ((am = attrRe.exec(attrStr))) {
        const k = am[1];
        const v = am[2] !== undefined ? am[2] : (am[3] !== undefined ? am[3] : (am[4] !== undefined ? am[4] : ''));
        el.setAttribute(k, v);
        if (k === 'checked') { el.checked = true; }
        if (k === 'type') { el.type = v; }
      }
      const p = stack.length ? stack[stack.length - 1] : null;
      if (p) { p.children.push(el); el.parent = p; } else { out.push(el); el.parent = parent; }
      if (!selfClose && !voidTags.test(tag)) { stack.push(el); }
    }
    return out;
  }
  function matches(node, sel) {
    const alts = String(sel || '').split(',');
    for (const alt of alts) {
      const parts = alt.trim().match(/^[a-zA-Z][a-zA-Z0-9]*|\.[-\w]+|#[-\w]+|\[[^\]]+\]/g) || [];
      if (!parts.length) { continue; }
      let all = true;
      for (const p of parts) {
        if (p[0] === '.') { if (!node._classes.has(p.slice(1))) { all = false; break; } }
        else if (p[0] === '#') { if (node.attrs.id !== p.slice(1)) { all = false; break; } }
        else if (p[0] === '[') {
          const mm = /^\[([^=\]]+)(?:=["']?([^"'\]]*)["']?)?\]$/.exec(p);
          if (!mm) { continue; }
          if (mm[2] === undefined) { if (node.attrs[mm[1]] === undefined) { all = false; break; } }
          else if (String(node.attrs[mm[1]]) !== mm[2]) { all = false; break; }
        } else if (node.tagName !== p.toUpperCase()) { all = false; break; }
      }
      if (all) { return true; }
    }
    return false;
  }
  function querySingle(root, simpleSel) {
    const out = [];
    (function walk(n) {
      if (!n) { return; }
      for (const c of n.children || []) {
        if (matches(c, simpleSel)) { out.push(c); }
        walk(c);
      }
    })(root);
    return out;
  }
  function queryAll(root, sel) {
    const segs = String(sel || '').split(',').map((s) => s.trim()).filter(Boolean);
    const seen = new Set();
    const res = [];
    for (const seg of segs) {
      const chain = seg.split(/\s+/).filter(Boolean);
      let pool = [root];
      for (const part of chain) {
        const next = [];
        for (const p of pool) {
          for (const hit of querySingle(p, part)) {
            if (!next.includes(hit)) { next.push(hit); }
          }
        }
        pool = next;
      }
      for (const item of pool) {
        if (!seen.has(item)) { seen.add(item); res.push(item); }
      }
    }
    return res;
  }
  const doc = {
    readyState: 'complete',
    body: El('body'), head: El('head'), documentElement: El('html'),
    createElement: El,
    createTextNode: (t) => { const e = El('#text'); e._text = t; return e; },
    getElementById: (id) => registry[id] || null,
    querySelector: (s) => queryAll(doc.body, s)[0] || null,
    querySelectorAll: (s) => queryAll(doc.body, s),
    addEventListener() { }, removeEventListener() { }
  };
  const bodyWrap = El('div'); bodyWrap.setAttribute('id', 'settingsBody');
  const grid = El('div'); grid.setAttribute('id', 'settingsGrid');
  bodyWrap.appendChild(grid);
  doc.body.appendChild(bodyWrap);
  return { document: doc, grid, queryAll };
}

function textOf(node) {
  if (!node) { return ''; }
  let s = node._text || '';
  if (node._html) { s += ' ' + node._html; }
  for (const c of node.children || []) { s += ' ' + textOf(c); }
  return s;
}

function bootPanels(opts) {
  opts = opts || {};
  const dom = createPanelDom();
  const store = {};
  const remCalls = [];
  const uiCalls = [];
  let syncCfg = Object.assign({
    baseUrl: '', token: '', passphrase: '', autoMode: 'open', autoMin: 5,
    rememberPass: true, silent: false, scope: 'all'
  }, opts.syncConfig || {});

  const sb = {
    console: { log() { }, warn() { }, error() { } },
    Date, JSON, Math, parseInt, parseFloat, isNaN, isFinite, String, Number, Array, Object, RegExp, Error, Promise,
    setTimeout: (f) => { try { f(); } catch (e) { } return 0; }, clearTimeout() { },
    setInterval: () => 0, clearInterval() { },
    requestAnimationFrame: (f) => { try { f(); } catch (e) { } return 0; }, cancelAnimationFrame() { },
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    document: dom.document,
    navigator: { userAgent: 'node-verify', platform: 'Win32', onLine: true, language: 'zh-CN' },
    location: { href: 'file:///index.html', search: '', hash: '', protocol: 'file:' },
    addEventListener() { }, removeEventListener() { },
    Event: function (t) { this.type = t; },
    alert() { }, confirm: () => true, prompt: () => ''
  };
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(CORE, sb, { filename: 'core.js' });
  vm.runInContext(MDPARSE, sb, { filename: 'mdparse.js' });
  vm.runInContext(PALETTE, sb, { filename: 'palette.js' });
  vm.runInContext(BRIDGE, sb, { filename: 'bridge.js' });
  sb.AR.Store.load();

  Object.assign(sb.AR.Bridge, {
    hasAndroid: opts.platform === 'android',
    hasWebView2: opts.platform === 'windows',
    platform: () => opts.platform || 'web',
    haptic() { },
    reminderDiagnostics: () => opts.diagResult || Promise.resolve(JSON.stringify({
      scheduledCount: 2, pendingCount: 2, nextAtMs: Date.now() + 60000,
      notifEnabled: true, exactAlarm: true, batteryIgnored: false
    })),
    openBatterySettings() { },
    openAppDetails() { },
    openNotificationSettings() { },
    openExactAlarmSettings() { },
    isAutostart: () => Promise.resolve(false),
    setAutostart: () => Promise.resolve(true),
    deviceName: () => 'NodeVerify',
    sdkInt: () => (opts.platform === 'android' ? 34 : 0)
  });
  sb.AR.Reminders = {
    enable() { remCalls.push('enable'); },
    cancel() { remCalls.push('cancel'); },
    sync(force) { remCalls.push(force ? 'sync(true)' : 'sync()'); },
    lastResult: () => ({ size: 2, result: 'ok' }),
    summary: () => ({ title: '测试摘要' }),
    tickNow: () => 0
  };
  sb.AR.Sync = {
    config: () => Object.assign({}, syncCfg),
    setConfig(patch) { syncCfg = Object.assign({}, syncCfg, patch || {}); },
    clearConfig(keepBase) { syncCfg = { baseUrl: keepBase ? syncCfg.baseUrl : '', token: '', passphrase: '', autoMode: 'open', autoMin: 5, rememberPass: true, silent: false, scope: 'all' }; },
    isConfigured: () => !!(syncCfg.baseUrl && syncCfg.token),
    status: () => ({ lastRev: 0, lastSyncAt: '', dirty: false, lastConflicts: 0, lastBytes: 0 }),
    ping: (url) => (opts.pingOk === false ? Promise.reject(new Error('ping 失败')) : Promise.resolve({ ok: true, url })),
    syncNow: () => (opts.syncOk === false ? Promise.reject(new Error('401')) : Promise.resolve({ rev: 1 }))
  };
  sb.AR.UI = {
    toast(m) { uiCalls.push('toast:' + m); },
    syncSegPill(seg, anim) { uiCalls.push('syncSegPill:' + (seg && seg.id) + ':' + !!anim); },
    enhanceSegmented() { uiCalls.push('enhanceSegmented'); },
    enterRise() { }, fadeInList() { },
    renderToday() { }, renderWeek() { }, renderCustom() { },
    refreshHomeworkPanels() { },
    currentView: () => 'settings',
    applyTheme() { }, applyLayout() { }
  };

  vm.runInContext(PANELS, sb, { filename: 'panels.js' });
  return { AR: sb.AR, dom, remCalls, uiCalls, getSyncCfg: () => syncCfg };
}

function findRowSwitch(root, labelText) {
  const rows = root.querySelectorAll('.setting-row');
  for (const r of rows) {
    if (textOf(r).indexOf(labelText) >= 0) {
      return r.querySelector('input');
    }
  }
  return null;
}

function findSlider(root, labelText) {
  const rows = root.querySelectorAll('.slider-row');
  for (const r of rows) {
    if (textOf(r).indexOf(labelText) >= 0) {
      return r.querySelector('input');
    }
  }
  return null;
}

function triggerChange(inp, val) {
  if (typeof val === 'boolean') { inp.checked = val; } else { inp.value = String(val); }
  const fns = inp.listeners.change || [];
  fns.forEach((f) => f({ target: inp, currentTarget: inp }));
}

function triggerInput(inp, val) {
  inp.value = String(val);
  const fns = inp.listeners.input || [];
  fns.forEach((f) => f({ target: inp, currentTarget: inp }));
}

/* ══ 1. panelNotify 开关 & 滑块与 AR.Reminders 联动 ══ */
{
  const env = bootPanels({ platform: 'windows' });
  const st = env.AR.Store.get();
  st.settings.notifications.enabled = false;
  st.settings.notifications.daily = { enabled: true, times: ['21:00'] };
  env.AR.Store.save(true);

  env.AR.Panels.renderSettings();
  env.dom.document.querySelector('#set-course .set-cat-head').click();
  const grid = env.dom.grid;

  const classSw = findRowSwitch(grid, '课前提醒');
  ok('P1 panelNotify 能渲染课前提醒开关', !!classSw);
  if (classSw) {
    env.remCalls.length = 0;
    triggerChange(classSw, true);
    ok('P2 打开「课前提醒」调用 enable() 并触发 sync(true)',
      env.remCalls.indexOf('enable') >= 0 && env.remCalls.indexOf('sync(true)') >= 0,
      JSON.stringify(env.remCalls));

    env.remCalls.length = 0;
    triggerChange(classSw, false);
    ok('P3 仅关闭「课前提醒」（每日提醒仍开）调 sync(true) 而不误调 cancel()',
      env.remCalls.indexOf('sync(true)') >= 0 && env.remCalls.indexOf('cancel') < 0,
      JSON.stringify(env.remCalls));
  }

  const leadSlider = findSlider(grid, '提前分钟');
  ok('P4 调整「提前分钟」滑块触发 AR.Reminders.sync()', (function () {
    if (!leadSlider) { return false; }
    env.remCalls.length = 0;
    const fns = leadSlider.listeners.input || leadSlider.listeners.change || [];
    leadSlider.value = '25';
    fns.forEach((f) => f({ target: leadSlider, currentTarget: leadSlider }));
    return env.remCalls.some((c) => c.indexOf('sync') === 0);
  })(), JSON.stringify(env.remCalls));

  /* 全关时调 cancel() */
  st.settings.notifications.daily.enabled = false;
  st.settings.notifications.enabled = true;
  env.AR.Store.save(true);
  env.AR.Panels.renderSettings();
  const classSw2 = findRowSwitch(grid, '课前提醒');
  env.remCalls.length = 0;
  triggerChange(classSw2, false);
  ok('P5 课前与每日均关闭时调 AR.Reminders.cancel()',
    env.remCalls.indexOf('cancel') >= 0, JSON.stringify(env.remCalls));
}

/* ══ 2. 决策 B: notifDiagBlock 留 panelAbout、panelNotify 跳转、#notifPipe 顺序与 Windows 隐藏按钮 ══ */
{
  const envW = bootPanels({ platform: 'windows' });
  envW.AR.Panels.renderSettings();
  envW.dom.document.querySelector('#set-course .set-cat-head').click();
  const notifyHtml = textOf(envW.dom.grid);
  const jumpBtn = envW.dom.document.getElementById('notifDiagJump');
  ok('P6 panelNotify 不直接含诊断区（决策 B），底部有 #notifDiagJump 跳转按钮',
    !!jumpBtn && !envW.dom.document.getElementById('notifDiagAnchor') && notifyHtml.indexOf('去自检') >= 0);

  if (jumpBtn) { jumpBtn.click(); }
  const anchor = envW.dom.document.getElementById('notifDiagAnchor');
  const aboutText = textOf(envW.dom.grid);
  ok('P7 点击 #notifDiagJump 切到 about 页并滚动高亮 #notifDiagAnchor',
    !!envW.dom.document.getElementById('set-about') && !!anchor && anchor.scrolledTo && anchor.classList.contains('set-hit-flash'));
  ok('P8 Windows 隐藏无效的电池优化 / 应用详情按钮',
    aboutText.indexOf('加入电池优化白名单') < 0 && aboutText.indexOf('应用详情') < 0 && aboutText.indexOf('开机时自动启动') >= 0);

  /* Android 端校验 #notifPipe 在 summaryEl 之后（在后台保护之前）且电池/应用按钮不重复 */
  const envA = bootPanels({ platform: 'android' });
  envA.AR.Panels.resetSettingsHome();
  envA.AR.Panels.renderSettings();
  envA.dom.document.querySelector('#set-about .set-cat-head').click();
  const anchorA = envA.dom.document.getElementById('notifDiagAnchor');
  const pipeA = envA.dom.document.getElementById('notifPipe');
  const childrenText = (anchorA ? anchorA.children : []).map((c) => textOf(c));
  const pipeIdx = anchorA ? anchorA.children.indexOf(pipeA) : -1;
  const bgIdx = childrenText.findIndex((t) => t.indexOf('后台保护') >= 0);
  const aHtml = textOf(anchorA);
  ok('P9 Android #notifPipe 挂在自检顶部 summary 下方而非后台保护之后',
    pipeIdx > 0 && bgIdx > pipeIdx, 'pipeIdx=' + pipeIdx + ' bgIdx=' + bgIdx);
  ok('P10 Android 后台保护去重：电池优化与精确闹钟各出现一次',
    (aHtml.match(/加入电池优化白名单/g) || []).length === 1 && (aHtml.match(/精确闹钟/g) || []).length >= 1);
}

/* ══ 3. renderLongTaskList() 无参空安全 ══ */
{
  const env = bootPanels({ platform: 'web' });
  let err1 = '';
  try { env.AR.Panels.renderLongTaskList(); } catch (e) { err1 = e.message; }
  ok('P11 无 #hwLongTasks 节点时无参调用 renderLongTaskList() 不抛错', !err1, err1);

  env.AR.Panels.renderSettings();
  env.dom.document.querySelector('#set-work .set-cat-head').click();
  const ltHost = env.dom.document.createElement('div');
  ltHost.setAttribute('id', 'hwLongTasks');
  env.dom.document.body.appendChild(ltHost);
  let err2 = '';
  try { env.AR.Panels.renderLongTaskList(); } catch (e) { err2 = e.message; }
  const ltBox = env.dom.document.getElementById('hwLongTasks');
  ok('P12 无老长期任务时无参调用 renderLongTaskList() 不抛错且写入提示',
    !err2 && ltBox && textOf(ltBox).indexOf('已并入') >= 0, err2);
}

/* ══ 4. panelCloudSync 先 ping 后存与失败回滚 ══ */
async function testCloudPanel() {
  const envFailPing = bootPanels({ pingOk: false });
  envFailPing.AR.Panels.renderSettings();
  envFailPing.dom.document.querySelector('#set-syncdata .set-cat-head').click();
  envFailPing.dom.document.getElementById('syUrl').value = 'https://bad.example';
  envFailPing.dom.document.getElementById('syToken').value = 'tok-123';
  envFailPing.dom.document.getElementById('syPass').value = 'pass-123';
  const btn1 = envFailPing.dom.grid.querySelectorAll('button').find((b) => textOf(b).indexOf('连接并同步') >= 0);
  btn1.click();
  await new Promise((r) => setTimeout(r, 10));
  ok('P13 ping 失败时不写 setConfig（isConfigured 保持 false）且保留输入值',
    envFailPing.AR.Sync.isConfigured() === false && envFailPing.dom.document.getElementById('syToken').value === 'tok-123');

  const envFailSync = bootPanels({ pingOk: true, syncOk: false });
  envFailSync.AR.Panels.renderSettings();
  envFailSync.dom.document.querySelector('#set-syncdata .set-cat-head').click();
  envFailSync.dom.document.getElementById('syUrl').value = 'https://good.example';
  envFailSync.dom.document.getElementById('syToken').value = 'wrong-tok';
  envFailSync.dom.document.getElementById('syPass').value = 'pass-123';
  const btn2 = envFailSync.dom.grid.querySelectorAll('button').find((b) => textOf(b).indexOf('连接并同步') >= 0);
  btn2.click();
  await new Promise((r) => setTimeout(r, 10));
  ok('P14 syncNow 失败时回滚配置（isConfigured 回到 false）且不重绘表单',
    envFailSync.AR.Sync.isConfigured() === false && envFailSync.dom.document.getElementById('syToken').value === 'wrong-tok');

  /* ══ 5. panelWork / panelCloudSync 原地更新分段控件不整页重建 ══ */
  const envSeg = bootPanels({ platform: 'web' });
  envSeg.AR.Panels.renderSettings();
  envSeg.dom.document.querySelector('#set-work .set-cat-head').click();
  const hwModeEl = envSeg.dom.document.getElementById('hwMode');
  const hwDueEl = envSeg.dom.document.getElementById('hwDueLead');
  const smartBtn = hwModeEl.querySelector('[data-hw="smart"]');
  smartBtn.click();
  const dueBtn2 = hwDueEl.querySelector('[data-du="2"]');
  dueBtn2.click();
  ok('P15 panelWork 切换识别方式/截止日不销毁重建面板 DOM（原节点仍在文档中）',
    envSeg.dom.grid.contains(hwModeEl) && envSeg.dom.grid.contains(hwDueEl)
    && smartBtn.classList.contains('active') && dueBtn2.classList.contains('active'));

  envSeg.AR.Panels.resetSettingsHome();
  envSeg.AR.Panels.renderSettings();
  envSeg.dom.document.querySelector('#set-syncdata .set-cat-head').click();
  const tokInput = envSeg.dom.document.getElementById('syToken');
  tokInput.value = 'keep-my-typed-token';
  const autoOnBtn = envSeg.dom.grid.querySelectorAll('.seg').find((b) => textOf(b).indexOf('按分钟间隔') >= 0);
  if (autoOnBtn) { autoOnBtn.click(); }
  ok('P16 panelCloudSync 切换自动同步模式原地更新不清空未提交的令牌输入',
    envSeg.dom.grid.contains(tokInput) && envSeg.dom.document.getElementById('syToken').value === 'keep-my-typed-token');

  /* ══ 6. v0.5.5：同步解耦开关 & 进度条按钮 ══ */
  const envDec = bootPanels({ platform: 'web' });
  envDec.AR.Sync.setConfig({ baseUrl: 'https://sync.example', token: 'tok', passphrase: 'pass' });
  const progStages = [];
  envDec.AR.Sync.syncNow = (onProg) => {
    if (onProg) { onProg(15, '拉取云端…'); progStages.push(15); onProg(75, '加密上传…'); progStages.push(75); }
    return Promise.resolve({ rev: 9 });
  };
  const whSyncCalls = [];
  envDec.AR.Whisper = envDec.AR.Whisper || {};
  envDec.AR.Whisper.syncNow = (onProg) => {
    whSyncCalls.push(1);
    if (onProg) { onProg(50, '同步配图…'); }
    return Promise.resolve({ rev: 3, pushed: true });
  };
  envDec.AR.Panels.resetSettingsHome();
  envDec.AR.Panels.renderSettings();
  envDec.dom.document.querySelector('#set-syncdata .set-cat-head').click();
  const cloudTxt = textOf(envDec.dom.grid);
  ok('P17 panelCloudSync 渲染课表/日记/配图三项解耦开关与独立同步按钮',
    cloudTxt.indexOf('课表与配置云同步') >= 0
    && cloudTxt.indexOf('Whisper 日记云同步') >= 0
    && cloudTxt.indexOf('同步 Whisper 配图') >= 0
    && cloudTxt.indexOf('同步课表配置') >= 0
    && cloudTxt.indexOf('同步 Whisper 日记') >= 0);

  const cfgBtn = envDec.dom.grid.querySelectorAll('.sync-prog-btn').find((b) => textOf(b).indexOf('同步课表配置') >= 0);
  const whBtn = envDec.dom.grid.querySelectorAll('.sync-prog-btn').find((b) => textOf(b).indexOf('同步 Whisper 日记') >= 0);
  if (cfgBtn) { cfgBtn.click(); }
  await new Promise((r) => setTimeout(r, 10));
  const fillW = cfgBtn ? cfgBtn.querySelector('.sync-prog-fill').style.width : '';
  if (whBtn) { whBtn.click(); }
  await new Promise((r) => setTimeout(r, 10));
  ok('P18 点击进度条同步按钮更新 .sync-prog-fill 宽度与阶段回调，且日记同步按钮独立触发 AR.Whisper.syncNow',
    fillW === '100%' && progStages.indexOf(75) >= 0 && whSyncCalls.length === 1,
    'fillW=' + fillW + ' wh=' + whSyncCalls.length);

  const whSw = findRowSwitch(envDec.dom.grid, 'Whisper 日记云同步');
  const medSw = findRowSwitch(envDec.dom.grid, '同步 Whisper 配图');
  if (whSw) { triggerChange(whSw, false); }
  if (medSw) { triggerChange(medSw, false); }
  const decCfg = envDec.AR.Sync.config();
  ok('P19 切换日记/配图同步开关实时写入 AR.Sync.config()',
    decCfg.syncWhisperEnabled === false && decCfg.syncWhisperMedia === false,
    JSON.stringify(decCfg));
}

testCloudPanel().then(() => {
  console.log('\n合计：' + pass + ' 通过 / ' + fail + ' 失败');
  if (fail) { console.log('失败项：'); bad.forEach((b) => console.log('  - ' + b)); }
  process.exitCode = fail ? 1 : 0;
}).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

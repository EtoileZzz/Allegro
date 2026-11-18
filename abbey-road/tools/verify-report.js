/**
 * verify-report.js —— 年度 / 月度报告（v0.5.3）
 *
 * 覆盖：
 *   · 报告聚合口径：作业（布置完成率 / 按时率含过期未做 / 平均用时 / 课程维度）
 *     任务（计划达成率按条目、无计划任务不进分母、达标天数、按任务）
 *     日程（上课节数按课表展开 + 事件数）
 *   · 范围裁剪、月份分桶、连续与空窗
 *   · UI 接线：长按入口 ×3、固定高度、任务总览全局热力图、设置面板长按
 *
 * 用法：node tools/verify-report.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.join(__dirname, '..', 'app', 'js');
const CORE = fs.readFileSync(path.join(APP, 'core.js'), 'utf8');
const UI = fs.readFileSync(path.join(APP, 'ui.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'app', 'css', 'app.css'), 'utf8');
const PN = fs.readFileSync(path.join(APP, 'panels.js'), 'utf8');

let pass = 0, fail = 0;
const bad = [];
function ok(name, cond, extra) {
  if (cond) { pass++; } else { fail++; bad.push(name + (extra ? ' → ' + extra : '')); }
}

function p2(n) { return n < 10 ? '0' + n : String(n); }
function dateKey(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
function addDays(d, n) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
function weekdayOf(d) { return ((d.getDay() + 6) % 7) + 1; }
function iso(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).toISOString(); }

function makeEnv() {
  const store = {};
  const sb = {
    console: { log() { }, warn() { }, error() { } },
    Date, JSON, Math, Number, String, Object, Array, Promise, Error, isFinite, parseInt, parseFloat, RegExp,
    setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent, btoa, atob,
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    }
  };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(CORE, sb, { filename: 'core.js' });
  const S = sb.window.AR.Store;
  S.load();
  return { AR: sb.window.AR, S, st: S.get() };
}

const env = makeEnv();
const { AR, S, st } = env;
const TODAY = new Date();
const K = (d) => dateKey(d);
const TODAY_K = K(TODAY);

/* ── 造数据 ─────────────────────────────────────────────── */
st.semesters[0].startDate = K(addDays(TODAY, -70));
st.semesters[0].weekCount = 20;
st.courses = [
  { id: 'c1', name: '高等数学', semesterId: st.semesters[0].id, colorKey: 'blue', teacherIds: [], updatedAt: iso(TODAY) },
  { id: 'c2', name: '大学物理', semesterId: st.semesters[0].id, colorKey: 'green', teacherIds: [], updatedAt: iso(TODAY) }
];
st.blocks = [{
  id: 'b1', courseId: 'c1', semesterId: st.semesters[0].id,
  weekday: 1, periodStart: 1, periodEnd: 2, startTime: '08:00', endTime: '09:40',
  weekMode: 'all', weeks: [], locationIds: [], teacherIds: [], updatedAt: iso(TODAY)
}];
st.events = [
  { id: 'e1', date: K(addDays(TODAY, -2)), title: '社团活动', updatedAt: iso(TODAY) },
  { id: 'e2', date: K(addDays(TODAY, -1)), title: '小组会', updatedAt: iso(TODAY) }
];
st.tasks = [
  { id: 't1', text: 'A', date: K(addDays(TODAY, -10)), done: true, doneAt: iso(addDays(TODAY, -9)), due: '', courseId: 'c1' },
  { id: 't2', text: 'B', date: K(addDays(TODAY, -5)), done: true, doneAt: iso(addDays(TODAY, -4)), due: K(addDays(TODAY, -2)), courseId: 'c1' },
  { id: 't3', text: 'C', date: K(addDays(TODAY, -3)), done: false, due: K(addDays(TODAY, -1)), courseId: 'c2' },
  { id: 't4', text: 'D', date: K(addDays(TODAY, -40)), done: true, doneAt: iso(addDays(TODAY, -40)), due: '', courseId: 'c2' },
  { id: 't5', text: 'E', date: TODAY_K, done: false, due: K(addDays(TODAY, 3)), courseId: 'c1' }
];
function entry(id, dayOff) {
  return { id: id, amount: 1, at: iso(addDays(TODAY, dayOff)), src: 'count' };
}
st.tasks2 = [
  { id: 'k1', text: '背单词', cadence: { type: 'daily', times: 1 }, createdAt: iso(addDays(TODAY, -60)),
    entries: [entry('x1', -1), entry('x2', -2), entry('x3', -3), entry('x4', -6)] },
  { id: 'k2', text: '跑步', cadence: { type: 'weekdays', times: 1, weekdays: [1, 3, 5] }, createdAt: iso(addDays(TODAY, -60)),
    entries: [entry('y1', -7)] },
  { id: 'k3', text: '无计划', cadence: null, createdAt: iso(addDays(TODAY, -60)),
    entries: [entry('z1', -1)] }
];
S.save(true);

/* ══ 1. 作业报告 ══ */
const HW = AR.Store.reportStats('hw');
ok('R1 默认范围从第一笔记录算起', HW.from === K(addDays(TODAY, -40)) && HW.to === TODAY_K,
  HW.from + ' → ' + HW.to);
ok('R2 布置条数 = 范围内有布置日的条目', HW.hw.assigned === 5, '实际 ' + HW.hw.assigned);
ok('R3 布置完成率分子只算「期间布置且已完成」', HW.hw.assignedDone === 3, '实际 ' + HW.hw.assignedDone);
ok('R4 热力图按完成日计数', HW.hw.done === 3 && HW.byDay[K(addDays(TODAY, -9))] === 1
  && HW.byDay[K(addDays(TODAY, -4))] === 1 && HW.byDay[K(addDays(TODAY, -40))] === 1);
ok('R5 按时率分母含「已过期未做」', HW.hw.total === 2, '实际 ' + HW.hw.total);
ok('R6 按时完成只算完成日 ≤ 截止日', HW.hw.ok === 1, '实际 ' + HW.hw.ok);
ok('R7 逾期未完成单独计数', HW.hw.overdue === 1, '实际 ' + HW.hw.overdue);
ok('R8 平均用时 = 布置→完成的天数均值', HW.hw.spendSum === 2 && HW.hw.spendN === 3,
  HW.hw.spendSum + '/' + HW.hw.spendN);
const c1 = HW.byCourse.find((c) => c.id === 'c1');
const c2 = HW.byCourse.find((c) => c.id === 'c2');
ok('R9 课程维度：布置 / 完成 / 完成率', c1 && c1.a === 3 && c1.d === 2 && c1.rate === 67,
  c1 ? JSON.stringify(c1) : 'none');
ok('R10 课程维度第二门课', c2 && c2.a === 2 && c2.d === 1, c2 ? JSON.stringify(c2) : 'none');
ok('R11 月份分桶存在且带完成数', HW.monthOrder.length >= 2
  && HW.months[K(addDays(TODAY, -4)).slice(0, 7)].d >= 1);
const HW5 = AR.Store.reportStats('hw', { from: K(addDays(TODAY, -6)), to: TODAY_K });
ok('R12 范围裁剪：只算最近 7 天布置的', HW5.hw.assigned === 3, '实际 ' + HW5.hw.assigned);
ok('R13 范围裁剪：完成数也跟着裁', HW5.hw.done === 1, '实际 ' + HW5.hw.done);
ok('R14 连续天数：最早那天不算断档', HW.streak.best >= 1 && HW.streak.cur === 0,
  'best=' + HW.streak.best + ' cur=' + HW.streak.cur);
ok('R15 空窗：40 天前那条与现在之间至少 30 天', HW.gap.max >= 30, '实际 ' + HW.gap.max);

/* ══ 2. 任务报告 ══ */
const TD = AR.Store.reportStats('todo');
/* 期望值：直接按 entries 与 cadence 手算（不调用被测函数） */
let expReq = 0, expCount = 0, expOkDays = 0;
const cntBy = {}, reqBy = {};
const offsetOf = (k) => Math.round((new Date(k + "T00:00:00") - new Date(K(TODAY) + "T00:00:00")) / 86400000);
const stEntries = [];
st.tasks2.forEach((t) => { (t.entries || []).forEach((e) => { stEntries.push(e.at.slice(0, 10)); }); });
stEntries.forEach((k) => { cntBy[k] = (cntBy[k] || 0) + 1; });
const fromK2 = TD.from;
for (let off = offsetOf(fromK2); off <= 0; off++) {
  const d = addDays(TODAY, off);
  const wd = weekdayOf(d);
  const k = K(d);
  let req = 1;                                  /* 背单词：每天 1 条 */
  if ([1, 3, 5].indexOf(wd) >= 0) { req += 1; } /* 跑步：指定星期 1/3/5，每次 1 条 */
  reqBy[k] = req;
  expReq += req;
  expCount += (cntBy[k] || 0);
  if ((cntBy[k] || 0) >= req) { expOkDays++; }
}
ok('R16 打卡次数 = 全部记录数（含无计划任务）', TD.todo.count === expCount,
  TD.todo.count + ' vs ' + expCount);
ok('R17 计划条目按条目累加（每天/指定星期），无计划不进分母', TD.todo.req === expReq,
  TD.todo.req + ' vs ' + expReq);
ok('R18 达成率分子分母自洽', TD.todo.count === 6, '实际 ' + TD.todo.count);
ok('R19 达标天数 = 当天次数 ≥ 当天计划', TD.todo.okDays === expOkDays,
  TD.todo.okDays + ' vs ' + expOkDays);
ok('R20 参与任务数 = 有记录的项数', TD.todo.activeTasks === 3, '实际 ' + TD.todo.activeTasks);
ok('R21 按任务：无计划任务 rate 为 0 且不进分母', (function () {
  const r = TD.byTask.find((x) => x.id === 'k3');
  return r && r.req === 0 && r.rate === 0;
})());
ok('R22 按任务：每天型任务达成率 = 记录数 / 天数', (function () {
  const r = TD.byTask.find((x) => x.id === 'k1');
  return r && r.count === 4 && r.req >= 4;
})());
const TD7 = AR.Store.reportStats('todo', { from: K(addDays(TODAY, -3)), to: TODAY_K });
ok('R23 范围裁剪后计划条目变少', TD7.todo.req < TD.todo.req, TD7.todo.req + ' < ' + TD.todo.req);

/* ══ 3. 日程报告 ══ */
const AG = AR.Store.reportStats('agenda', { from: K(addDays(TODAY, -14)), to: TODAY_K });
let expCls = 0;
for (let off = -14; off <= 0; off++) { if (weekdayOf(addDays(TODAY, off)) === 1) { expCls++; } }
ok('R24 上课节数按课表展开（周一那节）', AG.agenda.cls === expCls, AG.agenda.cls + ' vs ' + expCls);
ok('R25 事件数按日期统计', AG.agenda.ev === 2, '实际 ' + AG.agenda.ev);
ok('R26 热力图 = 上课 + 事件', AG.byDay[K(addDays(TODAY, -1))] === 1
  || AG.byDay[K(addDays(TODAY, -1))] >= 1);
ok('R27 范围裁剪生效', AG.from === K(addDays(TODAY, -14)) && AG.days === 15, AG.from + ' days=' + AG.days);

/* ══ 4. UI 接线 ══ */
ok('R28 长按助手存在且吞点击', UI.indexOf('function bindTapHold(') >= 0
  && UI.indexOf('if (fired) { fired = false;') >= 0);
ok('R29 三个入口都接了长按报告',
  (UI.match(/openYearReport\('(hw|todo|agenda)'\)/g) || []).length >= 3);
ok('R30 固定高度类已挂到 openModal', UI.indexOf("classList[opts.fixed ? 'add' : 'remove']('modal-fixed')") >= 0);
ok('R31 报告弹窗用 fixed 打开', UI.indexOf('body: body, fixed: true') >= 0);
ok('R32 任务总览插了全局热力图', UI.indexOf('tkGhAllHTML()') >= 0 && UI.indexOf('function tkGhAllHTML(') >= 0);
ok('R33 报告入口已导出', UI.indexOf('openYearReport: openYearReport') >= 0);
ok('R34 CSS 有固定高度与报告样式', CSS.indexOf('.modal-card.modal-fixed') >= 0
  && CSS.indexOf('.tk-yr-kpis') >= 0 && CSS.indexOf('body[data-heat="lg"] .tk-yr-cell') >= 0);
ok('R35 设置面板的作业统计按钮也能长按', PN.indexOf("openYearReport('hw')") >= 0);
const verM = /APP_VERSION\s*=\s*'(\d+)\.(\d+)\.(\d+)([a-z]*)'/.exec(CORE);
const verOk = !!(verM && (
  Number(verM[1]) > 0
  || (Number(verM[1]) === 0 && (Number(verM[2]) > 5 || (Number(verM[2]) === 5 && Number(verM[3]) >= 3)))
));
ok('R36 版本已升到 0.5.3+', verOk, verM ? verM[0] : '未找到 APP_VERSION');

/* ══ 5. Batch 2 (B2-T-02): weekly / createdAt / archived / everyN 口径 ══ */
{
  const e2 = makeEnv();
  const S2 = e2.S, st2 = e2.st;
  const from28 = K(addDays(TODAY, -27)); /* 连续 28 天（跨 4-5 个自然周，远小于 28） */
  const bornLate = addDays(TODAY, -9);   /* 仅包含最近 10 天 */
  st2.tasks2 = [
    {
      id: 'w1', text: '每周总结', cadence: { type: 'weekly', times: 1 },
      createdAt: iso(addDays(TODAY, -40)), entries: [entry('we1', -2)]
    },
    {
      id: 'c_late', text: '十天前新建', cadence: { type: 'daily', times: 1 },
      createdAt: iso(bornLate), entries: [entry('le1', 0)]
    },
    {
      id: 'arch1', text: '已归档日报', cadence: { type: 'daily', times: 1 },
      archived: true, createdAt: iso(addDays(TODAY, -40)), entries: [entry('ae1', -3)]
    },
    {
      id: 'en1', text: '每3天一次', cadence: { type: 'everyN', intervalDays: 3, times: 1 },
      createdAt: iso(addDays(TODAY, -27)), entries: []
    }
  ];
  S2.save(true);
  const R28 = e2.AR.Store.reportStats('todo', { from: from28, to: TODAY_K });
  const rowW = R28.byTask.find((x) => x.id === 'w1');
  const rowLate = R28.byTask.find((x) => x.id === 'c_late');
  const rowArch = R28.byTask.find((x) => x.id === 'arch1');
  const rowEn = R28.byTask.find((x) => x.id === 'en1');
  ok('R37 weekly 28天窗口不按7倍膨胀（req <= 5）', rowW && rowW.req >= 4 && rowW.req <= 5,
    rowW ? ('req=' + rowW.req) : 'missing');
  ok('R38 窗内第19天新建 daily 任务只算建后10天', rowLate && rowLate.req === 10,
    rowLate ? ('req=' + rowLate.req) : 'missing');
  ok('R39 archived 任务保留历史打卡 count 但计划 req=0', rowArch && rowArch.count === 1 && rowArch.req === 0,
    rowArch ? JSON.stringify(rowArch) : 'missing');
  ok('R40 everyN 每3天在28天内按真实间隔天数计（约9-10次）', rowEn && rowEn.req === 10,
    rowEn ? ('req=' + rowEn.req) : 'missing');
}

/* ══ 6. Batch 2 (B2-T-02): 真 ui.js DOM 沙箱执行 openYearReport ══ */
{
  function createReportDom() {
    const voidTags = /^(br|img|input|hr|meta|link|source|polyline|polygon)$/i;
    const registry = {};
    function El(tag) {
      const el = {
        tagName: String(tag || 'div').toUpperCase(),
        children: [], parent: null, attrs: {}, _classes: new Set(),
        style: {}, hidden: false, value: '', checked: false, listeners: {},
        _text: '', _html: '', disabled: false, title: '',
        offsetWidth: 60, offsetLeft: 0,
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
        appendChild(c) { if (!c) { return c; } this.children.push(c); c.parent = this; return c; },
        insertBefore(c) { this.children.unshift(c); c.parent = this; return c; },
        removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) { this.children.splice(i, 1); } return c; },
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
          if (k === 'title') { this.title = String(v); }
        },
        getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
        hasAttribute(k) { return this.attrs[k] !== undefined; },
        querySelector(sel) { return queryAll(this, sel)[0] || null; },
        querySelectorAll(sel) { return queryAll(this, sel); },
        closest(sel) { let n = this; while (n) { if (matches(n, sel)) { return n; } n = n.parent; } return null; },
        matches(sel) { return matches(this, sel); },
        click() {
          (this.listeners.click || []).forEach((f) => f({ target: this, currentTarget: this, preventDefault() { }, stopPropagation() { } }));
        },
        getBoundingClientRect() { return { top: 0, left: 0, width: 320, height: 40, bottom: 40, right: 320 }; },
        scrollIntoView() { },
        contains(o) {
          if (o === this) { return true; }
          return this.children.some((c) => c.contains(o));
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
        }
        const p = stack.length ? stack[stack.length - 1] : null;
        if (p) { p.children.push(el); el.parent = p; } else { out.push(el); el.parent = parent; }
        if (!selfClose && !voidTags.test(tag)) { stack.push(el); }
      }
      return out;
    }
    function matches(node, sel) {
      const parts = String(sel || '').trim().match(/^[a-zA-Z][a-zA-Z0-9]*|\.[-\w]+|#[-\w]+|\[[^\]]+\]/g) || [];
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
      (function walk(n) {
        if (!n) { return; }
        for (const c of n.children || []) {
          if (matches(c, sel)) { out.push(c); }
          walk(c);
        }
      })(root);
      return out;
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
    const modalRoot = El('div'); modalRoot.setAttribute('id', 'modalRoot');
    const modalScrim = El('div'); modalScrim.setAttribute('id', 'modalScrim');
    const modalCard = El('div'); modalCard.setAttribute('id', 'modalCard');
    const toastHost = El('div'); toastHost.setAttribute('id', 'toastHost');
    modalRoot.appendChild(modalScrim);
    modalRoot.appendChild(modalCard);
    doc.body.appendChild(modalRoot);
    doc.body.appendChild(toastHost);
    return { document: doc, modalCard, queryAll };
  }

  function runUiReport(seedFn) {
    const dom = createReportDom();
    const store = {};
    const sb = {
      console: { log() { }, warn() { }, error() { } },
      Date, JSON, Math, parseInt, parseFloat, isNaN, isFinite, String, Number, Array, Object, RegExp, Error,
      setTimeout: (f) => { try { f(); } catch (e) { } return 0; }, clearTimeout() { },
      setInterval: () => 0, clearInterval() { },
      requestAnimationFrame: (f) => { try { f(); } catch (e) { } return 0; }, cancelAnimationFrame() { },
      localStorage: {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; }
      },
      document: dom.document,
      navigator: { userAgent: 'node-verify', platform: 'Win32', onLine: true, language: 'zh-CN', vibrate() { } },
      location: { href: 'file:///index.html', search: '', hash: '', protocol: 'file:' },
      matchMedia: () => ({ matches: false, addEventListener() { }, removeEventListener() { } }),
      getComputedStyle: () => ({ getPropertyValue: () => '', width: '320px' }),
      fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('') }),
      alert() { }, confirm: () => true, prompt: () => '',
      performance: { now: () => Date.now() },
      addEventListener() { }, removeEventListener() { },
      innerWidth: 390, innerHeight: 844, devicePixelRatio: 2, scrollTo() { }, scrollY: 0
    };
    sb.window = sb; sb.globalThis = sb; sb.self = sb;
    vm.createContext(sb);
    vm.runInContext(CORE, sb, { filename: 'core.js' });
    vm.runInContext(fs.readFileSync(path.join(APP, 'palette.js'), 'utf8'), sb, { filename: 'palette.js' });
    vm.runInContext(fs.readFileSync(path.join(APP, 'bridge.js'), 'utf8'), sb, { filename: 'bridge.js' });
    sb.AR.Store.load();
    if (seedFn) { seedFn(sb.AR, sb.AR.Store.get()); sb.AR.Store.save(true); }
    vm.runInContext(UI, sb, { filename: 'ui.js' });
    try { sb.AR.UI.init(); } catch (e) { }
    return { AR: sb.AR, dom };
  }

  /* Case A: 跨 13 个月的日程报告（-363 天严格落在 yrRange -364 窗口内且横跨 13 个自然月） */
  const m13AgoDate = addDays(TODAY, -363);
  const key13Ago = dateKey(m13AgoDate);
  const ym13Ago = key13Ago.slice(0, 7);
  const ymThis = TODAY_K.slice(0, 7);

  const uiA = runUiReport((ARx, sx) => {
    sx.events = [
      { id: 'ag_old', date: key13Ago, title: '去年活动', updatedAt: iso(TODAY) },
      { id: 'ag_now', date: TODAY_K, title: '本月活动', updatedAt: iso(TODAY) }
    ];
  });
  uiA.AR.UI.openYearReport('agenda');
  const yrPageA = uiA.dom.document.getElementById('yrPage');
  const barsA = yrPageA.querySelectorAll('.tk-yr-m');
  const firstBarTitle = barsA[0] ? barsA[0].getAttribute('title') : '';
  const hasNonZeroAgendaBar = barsA.some((b) => /[·]\s*[1-9]\d*\s*项/.test(b.getAttribute('title') || ''));
  ok('R41 真 ui.js 日程年度柱状图非全 0（反映真实 cls+ev）',
    barsA.length >= 13 && hasNonZeroAgendaBar,
    'bars=' + barsA.length + ' first=' + firstBarTitle);
  ok('R42 真 ui.js 柱状图带 data-yr-ymkey="YYYY-MM" 属性',
    barsA[0] && barsA[0].getAttribute('data-yr-ymkey') === ym13Ago
    && barsA[barsA.length - 1].getAttribute('data-yr-ymkey') === ymThis,
    'first=' + (barsA[0] && barsA[0].getAttribute('data-yr-ymkey')) + ' last=' + (barsA[barsA.length - 1] && barsA[barsA.length - 1].getAttribute('data-yr-ymkey')));

  /* 点击第 13 根柱子（以前 YR.month=12 会显示 "13 月"） */
  barsA[barsA.length - 1].click();
  const afterLastHtml = yrPageA.innerHTML;
  const expectThisLabel = Number(ymThis.slice(0, 4)) + ' 年 ' + Number(ymThis.slice(5, 7)) + ' 月';
  ok('R43 点击跨第 13 根柱子绝不显示「13 月」且切到准确年月',
    afterLastHtml.indexOf('13 月') < 0 && afterLastHtml.indexOf('0 月') < 0
    && afterLastHtml.indexOf(expectThisLabel) >= 0,
    'expect=' + expectThisLabel);

  /* 回年度后再点第 1 根去年柱子（验证跨年月份不落到今年） */
  const yearSegBtn = uiA.dom.modalCard.querySelector('[data-yr-page="year"]');
  if (yearSegBtn) { yearSegBtn.click(); }
  const barsA2 = yrPageA.querySelectorAll('.tk-yr-m');
  if (barsA2[0]) { barsA2[0].click(); }
  const afterFirstHtml = yrPageA.innerHTML;
  const expectOldLabel = Number(ym13Ago.slice(0, 4)) + ' 年 ' + Number(ym13Ago.slice(5, 7)) + ' 月';
  ok('R44 点击去年柱子准确切回去年月份（不落到今年）',
    afterFirstHtml.indexOf(expectOldLabel) >= 0,
    'expect=' + expectOldLabel);

  /* Case B: 空报告与稀疏单月报告不输出空 polyline / 11-11 月 / 超宽块 */
  const uiEmpty = runUiReport((ARx, sx) => { sx.events = []; sx.tasks = []; sx.tasks2 = []; });
  uiEmpty.AR.UI.openYearReport('hw');
  const emptyHtml = uiEmpty.dom.document.getElementById('yrPage').innerHTML;
  ok('R45 空报告时不生成非法空 <polyline points="">',
    emptyHtml.indexOf('points=""') < 0 && emptyHtml.indexOf('还没有') >= 0);

  const sparseOld = dateKey(new Date(TODAY.getFullYear(), 0, 15));
  const sparseLate = dateKey(new Date(TODAY.getFullYear(), Math.max(1, TODAY.getMonth()), 1));
  const uiSparse = runUiReport((ARx, sx) => {
    sx.tasks = [
      { id: 'sp1', text: 'A', date: sparseOld, done: true, doneAt: iso(new Date(TODAY.getFullYear(), 0, 15)) },
      { id: 'sp2', text: 'B', date: sparseLate, done: true, doneAt: iso(new Date(TODAY.getFullYear(), Math.max(1, TODAY.getMonth()), 1)) }
    ];
  });
  uiSparse.AR.UI.openYearReport('hw');
  const sparsePage = uiSparse.dom.document.getElementById('yrPage');
  const qBlocks = sparsePage.querySelectorAll('.tk-yr-q');
  const overWide = qBlocks.some((q) => {
    const hd = q.querySelector('.tk-yr-qh');
    return hd && /\b(\d+)–\1\s*月/.test(hd.textContent || '');
  });
  ok('R46 稀疏月份热力图正确分块且不出现「N–N 月」标题',
    qBlocks.length >= 1 && !overWide && sparsePage.innerHTML.indexOf('points=""') < 0);
}

console.log('\n合计：' + pass + ' 通过 / ' + fail + ' 失败');
if (fail) { console.log('失败项：'); bad.forEach((b) => console.log('  - ' + b)); }
process.exitCode = fail ? 1 : 0;

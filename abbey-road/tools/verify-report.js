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
ok('R36 版本已升到 0.5.3', CORE.indexOf("APP_VERSION = '0.5.3'") >= 0);

console.log('\n合计：' + pass + ' 通过 / ' + fail + ' 失败');
if (fail) { console.log('失败项：'); bad.forEach((b) => console.log('  - ' + b)); }
process.exitCode = fail ? 1 : 0;

/**
 * Abbey Road · 调课 / 借课 回归测试（v0.5）
 *
 * 背景：调课（move）之后，再打开那节「调到课」编辑并保存，会让这节课从
 * 来源日和目标日同时消失。根因在编辑器把星期选择器初始化成了**模板**星期
 * （ui.js 的 ebWeekday），保存时算出 moved=true，把 move 记录改回模板日，
 * 而 kind==='moved-in' 又不会补 cancel —— 两天都没有记录。
 *
 * 这个套件同时守两层：
 *   ① store 层：cancel/move/makeup 组合下 dayItems 到底算出什么（矩阵）
 *   ② ui.js 静态契约：星期选择器必须用「这天实际生效的星期」，
 *      不能再用 block.weekday（这是那条 bug 的直接来源）
 *
 * 用法：node tools/verify-shift.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const appJs = path.join(root, 'app', 'js');
const store = {};

const sandbox = {
  console: console,
  Date: Date,
  JSON: JSON,
  Math: Math,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  localStorage: {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(appJs, 'core.js'), 'utf8'), sandbox, { filename: 'core.js' });

const AR = sandbox.AR;
const S = AR.Store;
const U = AR.Util;
const dayItems = AR.Schedule.dayItems;

let pass = 0;
let fail = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; return; }
  fail++;
  failures.push(name + (extra ? '  →  ' + extra : ''));
}
function eq(name, actual, expected) {
  ok(name, actual === expected, '实际 ' + JSON.stringify(actual) + '，期望 ' + JSON.stringify(expected));
}

/* ── 搭一个干净学期：开学日 2026-09-07（周一），周一 3-4 节一门课 ── */
const st = S.load();
const sem = st.semesters[0];
sem.startDate = '2026-09-07';
sem.weekCount = 20;
st.courses.length = 0;
st.blocks.length = 0;
st.overrides.length = 0;
if (st.tasks2) { st.tasks2.length = 0; }
st.courses.push({ id: 'c1', name: '高等数学', colorKey: 'blue', semesterId: sem.id, note: '', teacherIds: [], track: '' });
st.blocks.push({
  id: 'b1', courseId: 'c1', weekday: 1, periodStart: 3, periodEnd: 4,
  weekMode: 'all', weeks: [], locationIds: [], teacherIds: [], startTime: '', endTime: '', note: ''
});
S.save(true);

const MON = '2026-09-14';
const WED = '2026-09-16';
const THU = '2026-09-17';

/** 某天的条目摘要：kind + 节次 */
function kinds(dateKey) {
  return dayItems(U.parseDateKey(dateKey)).map((i) => i.kind + '@' + i.periodLabel);
}
function only(dateKey, kind) {
  const items = dayItems(U.parseDateKey(dateKey));
  return items.length === 1 && items[0].kind === kind ? items[0] : null;
}

/* ── 1. 基线：模板课在周一 ── */
eq('S1 基线：周一有 normal 课', kinds(MON).join(','), 'normal@3-4节');
eq('S2 基线：周三没有课', kinds(WED).length, 0);

/* ── 2. 调课 move：周一 → 周三 ── */
S.upsertOverride('b1', 'c1', MON, { type: 'cancel', newDate: null, reason: '调课' });
S.upsertOverride('b1', 'c1', WED, { type: 'move', newDate: WED, newWeekday: 3, newPeriodStart: 3, newPeriodEnd: 4, newStartTime: '', newEndTime: '', reason: '调课' });
eq('S3 调课后周一不再有课', kinds(MON).length, 0);
eq('S4 调课后周三出现 moved-in', kinds(WED).join(','), 'moved-in@3-4节');

/* ── 3. 对「调到课」做「仅这次」修改：节次 3-4 → 5-6 ──
   这里刻意照 ui.js doSave(scope='once') 的写法走：
   取 item.override 原地改字段（existOv 分支），不新建记录。 */
let it = only(WED, 'moved-in');
let ov = S.overrideById(it.override.id);
ov.newPeriodStart = 5;
ov.newPeriodEnd = 6;
ov.updatedAt = new Date().toISOString();
S.save(true);
eq('S5 改节次后仍在周三且节次生效', kinds(WED).join(','), 'moved-in@5-6节');
eq('S6 改节次没有把课搬回周一', kinds(MON).length, 0);

/* ── 4. 对「调到课」改备注：必须落在目标日这一条记录上 ── */
S.upsertOverride('b1', 'c1', WED, { newNote: '带计算器', newNoteCleared: false });
it = only(WED, 'moved-in');
eq('S7 调到课的本次备注能显示出来', it && it.note, '带计算器');
eq('S8 写备注没有生成第二条记录', S.overridesOfBlock('b1').filter((o) => !o.deletedAt).length, 2);

/* ── 5. 再调课：周三（moved-in）→ 周四 ──
   store 层只验证"一条 date=THU、newDate=THU 的 move 记录会让周四认领它"。
   ui.js 里 applyCourseShift 对 moved-in 的处理见 S10b 的静态断言
   （历史上它先写来源日 cancel，会把这条记录自己改成 cancel → 两天都消失）。 */
const cur = S.overrideById(it.override.id);
cur.date = THU;
cur.newDate = THU;
cur.newWeekday = 4;
cur.type = 'move';
cur.updatedAt = new Date().toISOString();
S.save(true);
eq('S9 再调课后周三清空', kinds(WED).length, 0);
eq('S10 再调课后周四出现 moved-in', kinds(THU).join(','), 'moved-in@5-6节');
eq('S11 再调课后周一仍是空的', kinds(MON).length, 0);

/* ── 6. 借课 copy：目标日加一节，来源日保留 ── */
const st2 = S.get();
st2.overrides.length = 0;
S.save(true);
S.upsertOverride('b1', 'c1', WED, { type: 'makeup', newWeekday: null, newDate: null, newPeriodStart: 3, newPeriodEnd: 4, newStartTime: '', newEndTime: '', reason: '调课' });
eq('S12 借课：周一模板课还在', kinds(MON).join(','), 'normal@3-4节');
eq('S13 借课：周三多出 makeup', kinds(WED).join(','), 'makeup@3-4节');
/* 借课条目改节次，不能影响模板课 */
it = only(WED, 'makeup');
ov = S.overrideById(it.override.id);
ov.newPeriodStart = 7;
ov.newPeriodEnd = 8;
ov.updatedAt = new Date().toISOString();
S.save(true);
eq('S14 借课改节次后周三变 7-8 节', kinds(WED).join(','), 'makeup@7-8节');
eq('S15 借课改节次不影响周一的模板课', kinds(MON).join(','), 'normal@3-4节');

/* ── 7. cancel 与 move 同时挂在同一天时的顺序鲁棒性 ──
   记录顺序若因导入/合并被重排，不能让已经取消的课又冒出来。 */
st2.overrides.length = 0;
S.upsertOverride('b1', 'c1', WED, { type: 'move', newDate: WED, newWeekday: 3, newPeriodStart: 3, newPeriodEnd: 4, newStartTime: '', newEndTime: '', reason: '调课' });
S.upsertOverride('b1', 'c1', MON, { type: 'cancel', newDate: null, reason: '调课' });
eq('S16 move 在前、cancel 在后：周一仍然没课', kinds(MON).length, 0);
eq('S17 周三正常显示 moved-in', kinds(WED).join(','), 'moved-in@3-4节');

/* ══════════════════════════════════════════════════════════
   8. ui.js 静态契约：这几条是 bug 的直接来源，必须钉死
   ══════════════════════════════════════════════════════════ */
const ui = fs.readFileSync(path.join(appJs, 'ui.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'app', 'css', 'app.css'), 'utf8');

/* 星期选择器必须按「这天实际生效的星期」初始化 */
ok('S18 ebWeekday 存在且用 U.weekdayOf(day) 初始化（不能再用 block.weekday）',
  ui.indexOf("id: 'ebWeekday', value: String(U.weekdayOf(day)") >= 0);
ok('S19 星期选择器不再单以 block.weekday 作初值',
  !/id: 'ebWeekday', value: String\(block\.weekday \|\| 1\)/.test(ui));
/* 节次回显同理（v0.4.1a 就修过，别回退） */
ok('S21 节次回显用 override 后的实际值', ui.indexOf('var effPeriodStart = (item.override && item.override.newPeriodStart)') >= 0);

/* applyCourseShift：对「已经是调到这天的课」再调课时，不能先写来源日 cancel。
   那条 cancel 会以 (blockId,date) 命中同一条 move 记录并把它改成 cancel，
   导致来源日与目标日同时查不到这节课。 */
const shiftBody = (function () {
  var i = ui.indexOf('function applyCourseShift');
  if (i < 0) { return ''; }
  var j = ui.indexOf('function openMoveDialog', i);
  return ui.slice(i, j > i ? j : i + 6000);
})();
const cancelCallIdx = shiftBody.indexOf("sourceKey, { type: 'cancel'");
const selfIdx = shiftBody.indexOf('var self = AR.Store.overrideById');
ok('S10b applyCourseShift 的 cancel 写在 moved-in 判断之后（否则记录会被自己改成 cancel）',
  shiftBody.length > 0 && (cancelCallIdx < 0 || (selfIdx >= 0 && cancelCallIdx > selfIdx)),
  'len=' + shiftBody.length + ' cancel@' + cancelCallIdx + ' self@' + selfIdx);

/* 作用域不能因为「这天有单次记录」就强制降级成仅这次 */
ok('S22 hasOneOff 只认补课/加课/无模板',
  /var hasOneOff = !realBlock \|\| item\.kind === 'makeup' \|\| item\.kind === 'add';/.test(ui) &&
  ui.indexOf('!!item.override && item.kind !== \'normal\') || !realBlock') < 0);

/* 流畅模式的 zoom 关键帧不能被后面的 var frames = null 清掉 */
const zoomIdx = ui.indexOf("if (fx === 'zoom' || fx === 'zoomOut')");
const framesNullIdx = ui.indexOf('var frames = null;');
ok('S23 zoom 关键帧赋值在 var frames = null 之后执行（不会被清空）',
  zoomIdx >= 0 && framesNullIdx >= 0 && framesNullIdx < zoomIdx,
  'zoom@' + zoomIdx + ' frames-null@' + framesNullIdx);

/* 任务条目不能 flyOut（超量要二次确认） */
ok('S24 任务条目 swipe 用 flyOut:false',
  ui.indexOf('bindSwipeRow(row, { flyOut: false, onCommit: function () { tkPunch(t); } })') >= 0);

/* 今日页事件必须在 if/else 之外：以前塞在「今天有课」的 else 分支里，
   当天 0 节课时考试/讲座全都不显示。用缩进做结构断言最稳：
   4 空格 = 函数体语句层级（在外面）；6 空格 = 还在 else 里面。 */
ok('S25 今日页事件渲染在 if/else 之外（4 空格级别，不在 else 分支里）',
  /(?:^|\n)    var dayEvents = AR\.Store\.eventsOf/.test(ui) &&
  !/(?:^|\n)      var dayEvents = AR\.Store\.eventsOf/.test(ui));

/* 颜色进 style 之前要过白名单 */
ok('S26 存在 cssColor 白名单工具', typeof U.cssColor === 'function');
if (typeof U.cssColor === 'function') {
  eq('S27 cssColor 放行合法 hex', U.cssColor('#5B8DEF'), '#5B8DEF');
  eq('S28 cssColor 拦截属性逃逸', U.cssColor('#fff"><img src=x>'), '#5B8DEF');
  eq('S29 cssColor 空值兜底', U.cssColor(null), '#5B8DEF');
}

/* 暗色 + 流畅模式不能把贡献图刷成亮色 */
ok('S30 data-perf 覆盖暗色时不再用 !important',
  !/body\[data-perf\] \.tk-gh-cell[^{]*\{[^}]*!important/.test(css));

/* ══════════════════════════════════════════════════════ */
console.log('');
if (fail) {
  console.log('失败项：');
  failures.forEach((f) => console.log('  ✗ ' + f));
  console.log('');
}
console.log('合计：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);

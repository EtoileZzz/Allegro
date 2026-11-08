/**
 * verify-homework.js —— 作业条目可编辑（v0.5.2）
 *
 * 覆盖：
 *   · 备注条目的默认截止日（下次上课日 - N 天 / 不自动 / 算不出来留空 / 钳到布置日）
 *   · 改文字：能唯一定位到备注那一行就回写（id 不变、勾掉状态不丢）；定不准就脱钩
 *   · 改布置日 / 改课程 → 脱钩，且备注重建不会又长一条（override.hwSkip）
 *   · 删掉的备注作业不会因为「刷新作业」复活
 *   · 手动添加：写当前学期、source=manual、未来布置日当天也看得见
 *   · 截止日展示（逾期 / 今天 / 明天 / 剩 N 天 / 挂 N 天）、统计口径、下次上课日推算
 *
 * 用法：node tools/verify-homework.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.join(__dirname, '..', 'app', 'js');
const CORE = fs.readFileSync(path.join(APP, 'core.js'), 'utf8');

let pass = 0, fail = 0;
const bad = [];
function ok(name, cond, extra) {
  if (cond) { pass++; } else { fail++; bad.push(name + (extra ? ' → ' + extra : '')); }
}

function p2(n) { return n < 10 ? '0' + n : String(n); }
function dateKey(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
function addDays(d, n) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
function weekdayOf(d) { return ((d.getDay() + 6) % 7) + 1; }   // 周一 = 1

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
  const st = S.get();

  /* 学期：3 周前那个周一开始，20 周 —— 保证「今天 + 1」落在第 4 周里 */
  const TODAY = new Date();
  const mondayThis = addDays(TODAY, -((weekdayOf(TODAY) - 1)));
  st.semesters[0].startDate = dateKey(addDays(mondayThis, -21));
  st.semesters[0].weekCount = 20;

  /* 一门课 + 一个时段：星期 = 明天，1-2 节 */
  const TOMORROW = addDays(TODAY, 1);
  st.courses.push({
    id: 'c1', name: '高等数学', semesterId: st.semesters[0].id,
    colorKey: 'blue', teacherIds: [], defaultLocationId: '', updatedAt: new Date().toISOString()
  });
  st.blocks.push({
    id: 'b1', courseId: 'c1', semesterId: st.semesters[0].id,
    weekday: weekdayOf(TOMORROW), periodStart: 1, periodEnd: 2,
    startTime: '08:00', endTime: '09:40', weekMode: 'all', weeks: [],
    locationIds: [], teacherIds: [], updatedAt: new Date().toISOString()
  });
  S.save(true);
  return { AR: sb.window.AR, S: S, st: st, TODAY: TODAY, TOMORROW: TOMORROW };
}

const env = makeEnv();
const { AR, S, st } = env;
const U = AR.Util;
const TODAY_K = dateKey(env.TODAY);
const TOMORROW_K = dateKey(env.TOMORROW);
const K = (d) => dateKey(d);

function setLead(n) {
  st.settings.schedule.homework = st.settings.schedule.homework || { on: true, mode: 'line' };
  st.settings.schedule.homework.dueLeadDays = n;
  S.save(true);
}
function note(blockId, courseId, dk, text) {
  return S.syncTasksFor(blockId, courseId, dk, text);
}
function liveTasks() {
  return (st.tasks || []).filter((t) => !t.deletedAt);
}
function resetTasks() {
  st.tasks = [];
  st.overrides = [];
  S.save(true);
}
function clearTasks() { resetTasks(); }

/* ══ 1. 默认截止日 ══ */
{
  setLead(1);
  const list = note('b1', 'c1', TODAY_K, '习题 3-5');
  ok('H1 备注行会生成条目', list.length === 1 && liveTasks().length === 1);
  ok('H2 默认截止日 = 下次上课日 - 1 天',
    list[0].due === K(addDays(env.TOMORROW, -1)), '实际 ' + list[0].due);

  clearTasks();
  setLead(0);
  const l0 = note('b1', 'c1', TODAY_K, '当天的作业');
  ok('H3 N=0 → 截止日就是下次上课日', l0[0].due === TOMORROW_K, '实际 ' + l0[0].due);

  clearTasks();
  setLead(2);
  const l2 = note('b1', 'c1', TODAY_K, '提前两天');
  ok('H4 算出来早于布置日 → 钳到布置日', l2[0].due === TODAY_K, '实际 ' + l2[0].due);

  clearTasks();
  setLead(-1);
  const lno = note('b1', 'c1', TODAY_K, '不自动');
  ok('H5 设置「不自动」→ 截止日留空', lno[0].due === '', '实际 ' + JSON.stringify(lno[0].due));

  clearTasks();
  setLead(1);
  const lnoCourse = note('b1', '', TODAY_K, '没有课程的作业');
  ok('H6 没有课程 → 截止日留空（不猜）', lnoCourse[0].due === '', '实际 ' + lnoCourse[0].due);

  clearTasks();
  setLead(1);
  const lBad = note('b1', 'c-missing', TODAY_K, '课表里没这门课');
  ok('H7 课表里没这门课 → 截止日留空', lBad[0].due === '', '实际 ' + lBad[0].due);
}

/* ══ 2. 截止日不会被重扫抹掉 / 手动改 ══ */
{
  clearTasks();
  setLead(1);
  const t = note('b1', 'c1', TODAY_K, '会被重扫的作业')[0];
  const t0 = t.due;
  t.due = K(addDays(env.TODAY, 5));
  S.save(true);
  S.rebuildTasks();
  const after = liveTasks()[0];
  ok('H8 重建备注不会抹掉手动改过的截止日',
    after && after.due === K(addDays(env.TODAY, 5)), '实际 ' + (after && after.due) + '，原 ' + t0);
}

/* ══ 3. 改文字：双向回写备注 ══ */
{
  clearTasks();
  setLead(1);
  const ov = S.upsertOverride('b1', 'c1', TODAY_K, { newNote: '- 习题 3-5\n- 复习第四章' });
  note('b1', 'c1', TODAY_K, ov.newNote);
  const first = liveTasks().filter((x) => x.text === '习题 3-5')[0];
  S.setTaskDone(first.id, true);
  const r = S.taskRename(first.id, '习题 3-5 + 6');
  const ov2 = S.overrideOf('b1', TODAY_K);
  ok('H9 改文字：备注里那一行跟着改（前缀保留）', ov2.newNote === '- 习题 3-5 + 6\n- 复习第四章',
    JSON.stringify(ov2.newNote));
  ok('H10 改文字：id 不变、勾掉状态不丢',
    r.mode === 'note' && liveTasks().filter((x) => x.text === '习题 3-5 + 6')[0].id === first.id
    && liveTasks().filter((x) => x.id === first.id)[0].done === true, JSON.stringify(r));
  ok('H11 改文字：没有多出第二条', liveTasks().length === 2, '条数 ' + liveTasks().length);
}

/* ══ 4. 改文字：定不准就脱钩 ══ */
{
  clearTasks();
  setLead(1);
  const ov = S.upsertOverride('b1', 'c1', TODAY_K, { newNote: '- 同一行\n- 同一行' });
  const list = note('b1', 'c1', TODAY_K, ov.newNote);
  const r = S.taskRename(list[0].id, '改过的同一行');
  const ov2 = S.overrideOf('b1', TODAY_K);
  ok('H12 两行同文字 → 脱钩，备注一个字节都不动',
    r.mode === 'detached' && ov2.newNote === '- 同一行\n- 同一行', JSON.stringify(r) + ' ' + JSON.stringify(ov2.newNote));
  ok('H13 脱钩后条目标了 detached', liveTasks().filter((x) => x.id === list[0].id)[0].detached === true);
  const before = liveTasks().length;
  S.rebuildTasks();
  ok('H14 脱钩后重建备注：那条原名不会又长出来', liveTasks().length === before,
    '前后 ' + before + ' / ' + liveTasks().length);
}

/* ══ 5. 改布置日 / 改课程 → 脱钩，且重建不重复 ══ */
{
  clearTasks();
  setLead(1);
  const t = note('b1', 'c1', TODAY_K, '要挪走的作业')[0];
  const other = K(addDays(env.TODAY, 3));
  const r = S.taskEdit(t.id, { date: other });
  ok('H15 改布置日 → 脱钩', r.mode === 'detached', JSON.stringify(r));
  ok('H16 改布置日后日期真的变了', liveTasks().filter((x) => x.id === t.id)[0].date === other);
  const n0 = liveTasks().length;
  S.rebuildTasks();
  ok('H17 改布置日后重建：不会在原备注下多长一条', liveTasks().length === n0,
    '前后 ' + n0 + ' / ' + liveTasks().length);

  clearTasks();
  setLead(1);
  const t2 = note('b1', 'c1', TODAY_K, '要换课的作业')[0];
  const r2 = S.taskEdit(t2.id, { courseId: '' });
  ok('H18 改课程 → 脱钩', r2.mode === 'detached', JSON.stringify(r2));
  ok('H19 改课程后课程字段生效', liveTasks().filter((x) => x.id === t2.id)[0].courseId === '');
}

/* ══ 6. 删除不复活 / 可撤销 ══ */
{
  clearTasks();
  setLead(1);
  const t = note('b1', 'c1', TODAY_K, '删掉就别再回来')[0];
  S.removeTask(t.id);
  ok('H20 删除后列表里没了', liveTasks().length === 0);
  S.rebuildTasks();
  ok('H21 删掉后点「刷新作业」不会复活', liveTasks().length === 0, '条数 ' + liveTasks().length);
  S.restore('tasks', t.id);
  ok('H22 回收站能恢复', liveTasks().length === 1);
}

/* ══ 7. 脱钩条目不被备注删行带走 ══ */
{
  clearTasks();
  setLead(1);
  const t = note('b1', 'c1', TODAY_K, '脱钩后归自己管')[0];
  S.taskDetach(t.id);
  S.syncTasksFor('b1', 'c1', TODAY_K, '');
  ok('H23 备注清空后，脱钩条目还在', liveTasks().filter((x) => x.id === t.id).length === 1,
    '条数 ' + liveTasks().length);
}

/* ══ 8. 手动添加 ══ */
{
  clearTasks();
  const m = S.taskUpsert({ text: '手写的一条', courseId: 'c1', date: TOMORROW_K, due: '' });
  ok('H24 手动添加写 source=manual', m.source === 'manual');
  ok('H25 手动添加写当前学期', m.semesterId === st.semesters[0].id);
  ok('H26 手动添加默认已脱钩（不跟备注抢位置）', m.detached === true);
  const board = S.taskBoard(TODAY_K);
  ok('H27 未来布置日的手动作业，今天也看得见',
    board.open.filter((x) => x.id === m.id).length === 1, 'open=' + board.open.length);
  const m2 = S.taskUpsert({ text: '没选课程', date: TODAY_K });
  ok('H28 没选课程 → courseId 空（归未分类）', m2.courseId === '');
  /* 手动条目不会被备注重建删掉 */
  S.rebuildTasks();
  ok('H29 手动条目不会被备注重建删掉',
    liveTasks().filter((x) => x.id === m.id || x.id === m2.id).length === 2);
}

/* ══ 9. 截止日展示 ══ */
{
  const t = { id: 'x', text: 'x', date: K(addDays(env.TODAY, -3)), done: false };
  ok('H30 无截止日 → 不显示任何标签（「挂账」表述已删）',
    S.taskDueInfo(t, TODAY_K).kind === 'none' && S.taskDueInfo(t, TODAY_K).label === '',
    JSON.stringify(S.taskDueInfo(t, TODAY_K)));
  const t2 = { id: 'y', text: 'y', date: TODAY_K, done: false, due: K(addDays(env.TODAY, -2)) };
  ok('H31 截止日过了 → 逾期 2 天', S.taskDueInfo(t2, TODAY_K).kind === 'overdue'
    && S.taskDueInfo(t2, TODAY_K).label === '逾期 2 天', JSON.stringify(S.taskDueInfo(t2, TODAY_K)));
  const t3 = { id: 'z', text: 'z', date: TODAY_K, done: false, due: TODAY_K };
  ok('H32 截止日就是今天 → 今天', S.taskDueInfo(t3, TODAY_K).kind === 'today');
  const t4 = { id: 'w', text: 'w', date: TODAY_K, done: false, due: TOMORROW_K };
  ok('H33 截止日是明天 → 明天', S.taskDueInfo(t4, TODAY_K).label === '明天');
  const t5 = { id: 'v', text: 'v', date: TODAY_K, done: false, due: K(addDays(env.TODAY, 4)) };
  ok('H34 还早 → 剩 4 天', S.taskDueInfo(t5, TODAY_K).label === '剩 4 天');
  const t6 = { id: 'u', text: 'u', date: TODAY_K, done: false };
  ok('H35 今天布置、没截止日 → 不显示标签', S.taskDueInfo(t6, TODAY_K).kind === 'none');
}

/* ══ 10. 下次上课日 / 统计 ══ */
{
  const nx = S.nextLessonOfCourse('c1', TODAY_K);
  ok('H36 下次上课日 = 明天（从布置日第二天起算）', nx && nx.date === TOMORROW_K, JSON.stringify(nx && nx.date));
  ok('H37 已经过去的那节课不算「下次」', (function () {
    const r = S.nextLessonOfCourse('c1', TOMORROW_K);
    return r && r.date > TOMORROW_K;
  })());
  ok('H38 没有这门课 → null', S.nextLessonOfCourse('nope', TODAY_K) === null);

  clearTasks();
  setLead(1);
  const two = note('b1', 'c1', TODAY_K, '作业甲\n作业乙');
  const a = two.filter((x) => x.text === '作业甲')[0];
  S.setTaskDone(a.id, true);
  const s = S.taskStats();
  ok('H39 统计：本周完成率按「本周布置的」算', s.weekTotal === 2 && s.weekDone === 1 && s.weekRate === 50,
    JSON.stringify({ t: s.weekTotal, d: s.weekDone, r: s.weekRate }));
  ok('H40 统计：按课程分组（课程已删 / 未分类兜底）', s.byCourse.length >= 1
    && s.byCourse[0].id === 'c1' && s.byCourse[0].open === 1 && s.byCourse[0].done === 1,
    JSON.stringify(s.byCourse));
  ok('H41 统计：趋势正好 30 天', s.trend.length === 30, '天数 ' + s.trend.length);
  ok('H42 统计：今天完成 1 条', s.doneToday === 1, '实际 ' + s.doneToday);
  ok('H43 统计：逾期 / 按时 / 12 周时间轴字段齐全',
    typeof s.overdue === 'number' && s.onTime && typeof s.onTime.total === 'number'
    && Array.isArray(s.daily) && s.daily.length === 84);
}

/* ══ 11. 统计弹窗口径：按时率 / 12 周时间轴 / 洞察（v0.5.2）══ */
{
  clearTasks();
  setLead(1);
  const TODAY = env.TODAY;
  function seed(o) {
    const t = S.taskUpsert({ text: o.text, courseId: 'c1', date: o.date || TODAY_K, due: o.due || '' });
    if (o.doneAt) {
      t.done = true;
      t.doneAt = new Date(o.doneAt + 'T09:00:00').toISOString();
      S.save(true);
    }
    return t;
  }
  const d = (n) => K(addDays(TODAY, n));

  seed({ text: '按时完成', date: d(-1), due: TODAY_K, doneAt: TODAY_K });
  seed({ text: '迟到完成', date: d(-3), due: d(-2), doneAt: d(-1) });
  seed({ text: '过期没做', date: d(-4), due: d(-1) });
  seed({ text: '还没到期', due: d(5) });
  seed({ text: '没有截止日', date: d(-2), doneAt: d(-1) });

  const st = S.taskStats();
  /* 分母 = 有截止日 且（已完成 或 已过期）= 按时 / 迟到 / 过期 → 3；分子 = 1 */
  ok('H44 按时率分母只收「已完成 + 已过期」，未到期不进分母',
    st.onTime.total === 3 && st.onTime.ok === 1 && st.onTimeRate === 33,
    JSON.stringify(st.onTime) + ' rate=' + st.onTimeRate);
  ok('H45 12 周时间轴长度固定 84、最后一天是今天',
    st.daily.length === 84 && st.daily[83].day === TODAY_K,
    st.daily.length + ' / ' + (st.daily[83] && st.daily[83].day));
  const todayCell = st.daily[83];
  ok('H46 今天完成的条数进热力图的最后一格', todayCell.done >= 1, 'done=' + todayCell.done);
  const debtDays = st.daily.filter((x) => x.debt > 0).length;
  ok('H47 逾期未完成的条目会记到它布置日那天的欠账里', debtDays >= 1 && st.debtDays >= 1,
    'debtDays=' + st.debtDays);
  ok('H48 平均勾掉天数只算有布置日 + 完成日的样本',
    st.avgSpend === 1.3, 'avgSpend=' + st.avgSpend);
  ok('H49 积压峰值 / 连续 / 空窗 / 星期分布都在合理范围',
    st.peak.count >= 0 && typeof st.streak.cur === 'number' && typeof st.streak.best === 'number'
    && typeof st.gap.max === 'number' && st.wd.length === 7 && st.busyWd >= 1 && st.busyWd <= 7,
    JSON.stringify({ peak: st.peak, cur: st.streak.cur, gap: st.gap.max, busy: st.busyWd }));
  ok('H50 洞察要用的极值：拖得最久的那门课被算出来',
    st.worstHang && st.worstHang.id === 'c1' && st.worstHang.avgHang > 0,
    JSON.stringify(st.worstHang && { id: st.worstHang.id, avgHang: st.worstHang.avgHang }));
  ok('H51 洞察要用的极值：按时率最高/最低的课（只有一个样本时二者相同）',
    st.bestOnTime && st.worstOnTime && st.bestOnTime.onTimeRate === 33 && st.worstOnTime.onTimeRate === 33,
    JSON.stringify([st.bestOnTime && st.bestOnTime.onTimeRate, st.worstOnTime && st.worstOnTime.onTimeRate]));
  ok('H52 按课程里的按时率有正确分母',
    st.byCourse[0] && st.byCourse[0].onTimeOk === 1 && st.byCourse[0].onTimeTotal === 3,
    JSON.stringify(st.byCourse[0] && { ok: st.byCourse[0].onTimeOk, total: st.byCourse[0].onTimeTotal }));
}

console.log('');
console.log('合计：' + pass + ' 通过 / ' + fail + ' 失败');
bad.forEach((b) => console.log('  ✗ ' + b));
if (fail) { process.exitCode = 1; }

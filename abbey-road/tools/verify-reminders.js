/**
 * verify-reminders.js —— 提醒调度与内容（v0.5.1c）
 *
 * 覆盖：课程提醒（按课提前量）、每日提醒三种形式（汇总/按类型/每条单独）、
 * 任务专属时间点、作业「布置日起每天提醒」、目标量口径、各种开关语义、预览。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.join(__dirname, '..', 'app', 'js');
const CORE = fs.readFileSync(path.join(APP, 'core.js'), 'utf8');
const REM = fs.readFileSync(path.join(APP, 'reminders.js'), 'utf8');

let pass = 0, fail = 0;
const bad = [];
function ok(name, cond, extra) {
  if (cond) { pass++; } else { fail++; bad.push(name + (extra ? ' → ' + extra : '')); }
}

function p2(n) { return n < 10 ? '0' + n : String(n); }
function dateKey(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
function addDays(d, n) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

function makeEnv(opts) {
  opts = opts || {};
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
  const AR = sb.window.AR;
  AR.Util = { dateKey, addDays, startOfDay };
  AR.Schedule = {
    dayItems: function () {
      if (opts.noCourses) { return []; }
      return [{ blockId: 'b1', courseId: 'c1', start: '08:00', course: { id: 'c1', name: '高等数学' }, location: { raw: '305' } }];
    }
  };
  AR.Bridge = { hasAndroid: false, hasWebView2: false, notifyNow() { return Promise.resolve('ok'); }, scheduleReminders() { }, cancelReminders() { }, requestNotificationPermission() { return null; } };
  vm.runInContext(REM, sb, { filename: 'reminders.js' });
  const S = AR.Store;
  S.load();
  return { AR, S, R: AR.Reminders };
}

const TODAY = new Date();
const BASE_T = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate(), 0, 5, 0);
const KEY_T = dateKey(BASE_T);

function setDaily(env, patch) {
  const st = env.S.get();
  st.settings.notifications.daily = Object.assign({
    enabled: true, times: ['21:00'], mode: 'pending', skipWhenDone: true,
    includeEvents: false, weekdaysOnly: false, form: 'summary',
    includeUnplanned: false, maxPerNotify: 3, maxEachItems: 8
  }, patch || {});
  env.S.save(true);
}
function dailyOnly(env) { return env.R.build(BASE_T).filter((x) => x.channel === 'daily'); }
/** 只取「今天」那一天的每日提醒（build 一次排 7 天） */
function todayOnly(env) {
  const from = new Date(BASE_T.getFullYear(), BASE_T.getMonth(), BASE_T.getDate()).getTime();
  const to = from + 86400000;
  return dailyOnly(env).filter((x) => x.atMs >= from && x.atMs < to);
}
function newTask(env, text, goalTarget, unit) {
  const t = env.S.todoUpsert({ text: text, goal: goalTarget ? { target: goalTarget, unit: unit || '' } : null, cadence: { type: 'daily', times: 1 } });
  return (t && t.id) || env.S.todoList()[0].id;
}

/* ══ 1. 目标量口径（以前分母是「次数」）══ */
{
  const env = makeEnv({ noCourses: true });
  setDaily(env);
  const id = newTask(env, '背单词', 30, '页');
  env.S.todoAddEntry(id, 12, '');
  const list = todayOnly(env);
  ok('N1 正文分母是目标量：12/30 页', list[0] && /12\/30 页/.test(list[0].text), list[0] && list[0].text);
  ok('N2 未达目标仍算未完成', list[0] && list[0].title.indexOf('还有 1 项') >= 0, list[0] && list[0].title);
  env.S.todoAddEntry(id, 18, '');
  const list2 = todayOnly(env);
  ok('N3 累计到 30 后判为完成', !list2.some((x) => String(x.title).indexOf('还有') >= 0),
    JSON.stringify(list2.map((x) => x.title)));
}

/* ══ 2. 无目标任务：分母 = 当天次数 ══ */
{
  const env = makeEnv({ noCourses: true });
  setDaily(env, { times: ['21:00'] });
  const id = newTask(env, '跑步', 0);
  ok('N4 没打时显示 0/1', (todayOnly(env)[0] || {}).text === '跑步 0/1', (todayOnly(env)[0] || {}).text);
  env.S.todoAddEntry(id, 1, '');
  ok('N5 打 1 次后不再提醒', todayOnly(env).length === 0);
}

/* ══ 3. 无计划任务默认不通知 ══ */
{
  const env = makeEnv({ noCourses: true });
  setDaily(env, { includeUnplanned: false });
  env.S.todoUpsert({ text: '随手记', cadence: { type: 'unlimited' } });
  ok('N6 includeUnplanned=false → 无计划任务不出现', todayOnly(env).length === 0);
  setDaily(env, { includeUnplanned: true });
  ok('N7 打开后出现', todayOnly(env).length >= 1, '实际 ' + todayOnly(env).length);
}

/* ══ 4. 三种形式 ══ */
{
  const env = makeEnv();
  setDaily(env, { times: ['21:00'], form: 'summary', includeEvents: true });
  newTask(env, '背单词', 30, '页');
  newTask(env, '数学', 3, '题');
  env.S.get().events.push({ id: 'e1', title: '班会', date: KEY_T, start: '10:00' });
  env.S.save(true);
  const sum = todayOnly(env);
  ok('N8 汇总一条：每个时间点只 1 条', sum.length === 1, '实际 ' + sum.length);
  ok('N9 汇总正文含任务、课程、日程', /背单词/.test(sum[0].text) && /1 节课/.test(sum[0].text) && /1 条日程/.test(sum[0].text), sum[0].text);

  setDaily(env, { times: ['21:00'], form: 'byType', includeEvents: true });
  const byType = todayOnly(env);
  ok('N10 按类型分条：任务 + 课程 + 日程 = 3 条', byType.length === 3, JSON.stringify(byType.map((x) => x.title)));
  ok('N11 不同类型标题不同', new Set(byType.map((x) => x.title)).size === 3);

  setDaily(env, { times: ['21:00'], form: 'each', includeEvents: false });
  const each = todayOnly(env);
  ok('N12 每条单独：2 个任务 = 2 条', each.length === 2, JSON.stringify(each.map((x) => x.title)));
  ok('N13 每条标题是任务名', each.some((x) => x.title === '背单词') && each.some((x) => x.title === '数学'));
}

/* ══ 5. 每条单单独的上限与「还有 N 项」══ */
{
  const env = makeEnv({ noCourses: true });
  setDaily(env, { times: ['21:00'], form: 'each', maxEachItems: 2 });
  for (let i = 0; i < 5; i++) { newTask(env, '任务' + i, 10); }
  const each = todayOnly(env);
  ok('N14 最多 2 条 + 1 条「还有 N 项」', each.length === 3, JSON.stringify(each.map((x) => x.title)));
  ok('N15 汇总条目标题是「还有 3 项任务」', each.some((x) => x.title === '还有 3 项任务'), JSON.stringify(each.map((x) => x.title)));
}

/* ══ 6. maxPerNotify 生效 ══ */
{
  const env = makeEnv({ noCourses: true });
  setDaily(env, { times: ['21:00'], form: 'summary', maxPerNotify: 2 });
  for (let i = 0; i < 4; i++) { newTask(env, 'T' + i, 10); }
  const line = todayOnly(env)[0].text;
  ok('N16 最多列 2 项且带「等 4 项」', /T\d/.test(line) && /等 4 项/.test(line), line);
}

/* ══ 7. 作业：布置日起每天提醒，直到勾掉（选项 B）══ */
{
  const env = makeEnv({ noCourses: true });
  setDaily(env, { times: ['21:00'], form: 'summary' });
  const yday = dateKey(addDays(BASE_T, -1));
  env.S.get().tasks.push({ id: 'hw1', text: '线性代数作业', date: yday, done: false });
  env.S.save(true);
  const list = todayOnly(env);
  ok('N17 昨天布置、今天还没做 → 今天提醒', list.some((x) => /作业/.test(String(x.text)) || /作业/.test(String(x.title))),
    JSON.stringify(list.map((x) => x.title + '|' + x.text)));
  const tomorrowKey = dateKey(addDays(BASE_T, 1));
  env.S.get().tasks.push({ id: 'hw2', text: '明天的作业', date: tomorrowKey, done: false });
  env.S.save(true);
  const all = todayOnly(env);
  ok('N18 还没布置的作业不提醒', !all.some((x) => String(x.text).indexOf('明天的作业') >= 0),
    JSON.stringify(all.map((x) => x.text)));
  const hw = env.S.get().tasks.filter((x) => x.id === 'hw1')[0];
  hw.done = true;
  env.S.save(true);
  ok('N19 勾掉后不再提醒', !todayOnly(env).some((x) => String(x.text).indexOf('线性代数作业') >= 0),
    JSON.stringify(todayOnly(env).map((x) => x.text)));
  setDaily(env, { times: ['08:00', '21:00'], form: 'each' });
  hw.done = false; env.S.save(true);
  const eachHw = todayOnly(env).filter((x) => String(x.id).indexOf('hw-hw1') === 0);
  ok('N20 each 形式里作业当天只出现一次（第一个时间点）', eachHw.length === 1, JSON.stringify(eachHw.map((x) => x.atMs)));
}

/* ══ 8. 开关语义 ══ */
{
  const env = makeEnv({ noCourses: true });
  setDaily(env, { times: ['21:00'], mode: 'always', skipWhenDone: true });
  const id = newTask(env, '唯一任务', 1);
  env.S.todoAddEntry(id, 1, '');
  ok('N21 mode=always：完成也提醒', todayOnly(env).length === 1);
  ok('N22 标题变「今天的任务都完成了」', todayOnly(env)[0].title.indexOf('都完成了') >= 0, todayOnly(env)[0].title);

  setDaily(env, { times: ['21:00'], mode: 'pending', skipWhenDone: true });
  ok('N23 mode=pending + skipWhenDone：完成就不发', todayOnly(env).length === 0);
}
{
  const env = makeEnv({ noCourses: true });
  setDaily(env, { times: ['21:00'], weekdaysOnly: true });
  newTask(env, 'X', 1);
  const list = todayOnly(env);
  const weekendHit = list.some((x) => {
    const d = new Date(x.atMs);
    return d.getDay() === 0 || d.getDay() === 6;
  });
  ok('N24 weekdaysOnly：周末不发', !weekendHit && list.length > 0, '条数 ' + list.length);
}

/* ══ 9. 课程提前量 / 关闭某课 ══ */
{
  const env = makeEnv();
  env.S.get().settings.notifications.enabled = true;
  env.S.get().settings.notifications.defaultOffset = 15;
  env.S.save(true);
  let c = env.R.build(BASE_T).filter((x) => x.channel === 'class');
  const startMs = new Date(BASE_T.getFullYear(), BASE_T.getMonth(), BASE_T.getDate(), 8, 0, 0, 0).getTime();
  ok('N25 课前提醒默认提前 15 分', c[0] && c[0].atMs === startMs - 15 * 60000, c[0] && (startMs - c[0].atMs) / 60000);
  env.S.notifOverrides().courses['c1'] = { leadMin: 30 };
  env.S.save(true);
  c = env.R.build(BASE_T).filter((x) => x.channel === 'class');
  ok('N26 课程覆盖 30 分', c[0] && c[0].atMs === startMs - 30 * 60000);
  env.S.notifOverrides().courses['c1'] = { leadMin: -1 };
  env.S.save(true);
  ok('N27 leadMin=-1 → 该课不排', env.R.build(BASE_T).filter((x) => x.channel === 'class').length === 0);
}

/* ══ 10. 任务专属时间点 ══ */
{
  const env = makeEnv({ noCourses: true });
  setDaily(env, { times: [], form: 'summary' });
  const id = newTask(env, '背单词', 30, '页');
  env.S.notifOverrides().tasks[id] = { times: ['09:00'], mute: false, onlyWhenPending: true };
  env.S.save(true);
  const own = dailyOnly(env);
  ok('N28 专属时间点产生条目', own.length >= 1, '实际 ' + own.length);
  ok('N29 标题是任务名、正文带进度', own[0].title === '背单词' && /0\/30 页/.test(own[0].text), own[0].title + '|' + own[0].text);
  env.S.notifOverrides().tasks[id] = { times: ['09:00'], mute: true, onlyWhenPending: true };
  env.S.save(true);
  ok('N30 mute 后不再出现', dailyOnly(env).length === 0);
}

/* ══ 11. 预览 ══ */
{
  const env = makeEnv({ noCourses: true });
  setDaily(env, { times: ['21:00'], form: 'byType' });
  newTask(env, '背单词', 30, '页');
  const pv = env.R.preview(BASE_T.getTime());
  ok('N31 preview 返回同一时刻的条目', Array.isArray(pv) && pv.length === 1, JSON.stringify(pv && pv.length));
  ok('N32 preview 条目形状正确', pv[0] && pv[0].title && typeof pv[0].atMs === 'number' && pv[0].text !== undefined);
}

console.log('');
console.log('合计：' + pass + ' 通过 / ' + fail + ' 失败');
bad.forEach((b) => console.log('  ✗ ' + b));
if (fail) { process.exitCode = 1; }

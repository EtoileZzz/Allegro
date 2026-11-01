/**
 * verify-reminders.js —— 提醒调度（v0.5.1）
 *
 * 真跑 core.js + reminders.js，用假的 Schedule / Bridge 提供课程和桥接，
 * 验证四类提醒的生成：课程（按课覆盖）、每日汇总、任务专属、作业到期。
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
  if (cond) { pass++; }
  else { fail++; bad.push(name + (extra ? ' → ' + extra : '')); }
}

/* ── 小工具（AR.Util 的最小实现）── */
function p2(n) { return n < 10 ? '0' + n : String(n); }
function dateKey(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
function addDays(d, n) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

/** 造一个环境：core 的存档 + reminders 的桥 */
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
  sb.window = sb;
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(CORE, sb, { filename: 'core.js' });

  const AR = sb.window.AR;
  AR.Util = { dateKey, addDays, startOfDay };
  AR.Schedule = {
    dayItems: function (day) {
      if (opts.noCourses) { return []; }
      return [{
        blockId: 'b1', courseId: 'c1', start: '08:00',
        course: { id: 'c1', name: '高等数学' },
        location: { raw: '信息楼 305' }
      }];
    }
  };
  AR.Bridge = { hasAndroid: false, scheduleReminders() { }, cancelReminders() { }, requestNotificationPermission() { return null; } };
  vm.runInContext(REM, sb, { filename: 'reminders.js' });

  const S = AR.Store;
  S.load();
  return { AR, S, R: AR.Reminders };
}

/* 固定基准：某天 00:05（当天的提醒时间点都还没到） */
const BASE = new Date(2026, 2, 4, 0, 5, 0);   // 2026-03-04 周三
const BASE_KEY = dateKey(BASE);
/* 打卡记录落在「真实今天」，所以凡是依赖当天完成度的用例都用这个基准 */
const TODAY0 = new Date();
const BASE_T = new Date(TODAY0.getFullYear(), TODAY0.getMonth(), TODAY0.getDate(), 0, 5, 0);
const BASE_T_KEY = dateKey(BASE_T);

function setDaily(env, patch) {
  const st = env.S.get();
  st.settings.notifications.daily = Object.assign({
    enabled: true, times: ['07:30', '21:00'], mode: 'pending',
    skipWhenDone: true, includeEvents: true, weekdaysOnly: false
  }, patch || {});
  env.S.save(true);
}

/* ══ 1. 关闭时什么都不排 ══ */
{
  const env = makeEnv();
  env.S.get().settings.notifications.daily.enabled = false;
  env.S.save(true);
  const list = env.R.build(BASE);
  ok('R1 关闭每日提醒且无课程提醒 → 空数组', list.length === 0, '实际 ' + list.length);
}

/* ══ 2. 每日汇总：7 天 × 2 个时间点 ══ */
{
  const env = makeEnv();
  setDaily(env, {});
  const list = env.R.build(BASE);
  const daily = list.filter((x) => x.channel === 'daily');
  ok('R2 7 天 × 2 个时间点 = 14 条每日汇总', daily.length === 14, '实际 ' + daily.length);
  const first = daily[0];
  ok('R3 id 形如 daily-YYYYMMDD-HHMM',
    /^daily-\d{4}-\d{2}-\d{2}-0730$/.test(first.id), first.id);
  const d0 = new Date(2026, 2, 4, 7, 30, 0, 0).getTime();
  ok('R4 atMs 等于当天 07:30（本地时区）', first.atMs === d0, first.atMs + ' vs ' + d0);
  ok('R5 全部条目的 atMs 递增（已排序）',
    list.every((x, i) => i === 0 || list[i - 1].atMs <= x.atMs));
}

/* ══ 3. 任务专属时间点 ══ */
{
  const env = makeEnv({ noCourses: true });
  setDaily(env, { times: [] });                       // 关掉全局汇总，只看任务专属
  const t = env.S.todoUpsert({ text: '背单词', goal: { target: 30, unit: '页' }, cadence: { type: 'daily', times: 1 } });
  const id = (t && t.id) || env.S.todoList()[0].id;
  const o = env.S.notifOverrides();
  o.tasks[id] = { times: ['09:00', '22:00'], mute: false, onlyWhenPending: true };
  env.S.save(true);
  const list = env.R.build(BASE_T).filter((x) => x.channel === 'daily');
  ok('R6 任务专属：7 天 × 2 个时间点 = 14 条', list.length === 14, '实际 ' + list.length);
  ok('R7 标题是任务名', list[0] && list[0].title === '背单词', list[0] && list[0].title);
  ok('R8 正文带当天进度（0/1）', list[0] && /0\/1/.test(list[0].text), list[0] && list[0].text);

  /* 静音 → 一条都不排 */
  o.tasks[id] = { times: ['09:00', '22:00'], mute: true, onlyWhenPending: true };
  env.S.save(true);
  ok('R9 mute 的任务不产生任何条目', env.R.build(BASE_T).filter((x) => x.channel === 'daily').length === 0);

  /* 达标后 onlyWhenPending → 当天不排（未来几天仍排） */
  o.tasks[id] = { times: ['09:00'], mute: false, onlyWhenPending: true };
  env.S.save(true);
  env.S.todoAddEntry(id, 1, '');
  const after = env.R.build(BASE_T).filter((x) => x.channel === 'daily');
  const todayHit = after.filter((x) => x.id.indexOf('task-' + id + '-' + BASE_T_KEY.replace(/-/g, '')) === 0);
  ok('R10 今天已达标 → 今天的专属提醒消失', todayHit.length === 0, '实际 ' + todayHit.length);
  ok('R11 但未来几天仍然排', after.length >= 6, '实际 ' + after.length);
}

/* ══ 4. skipWhenDone / mode=always ══ */
{
  const env = makeEnv({ noCourses: true });
  setDaily(env, { times: ['21:00'], skipWhenDone: true, mode: 'pending' });
  const tk = env.S.todoUpsert({ text: '唯一任务', goal: { target: 1 }, cadence: { type: 'daily', times: 1 } });
  const id = (tk && tk.id) || env.S.todoList()[0].id;
  env.S.todoAddEntry(id, 1, '');                     // 今天达标
  const list = env.R.build(BASE_T).filter((x) => x.channel === 'daily');
  const todayId = 'daily-' + BASE_T_KEY + '-2100';
  ok('R12 全部完成 + skipWhenDone → 今天不排', !list.some((x) => x.id === todayId),
    JSON.stringify(list.map((x) => x.id).slice(0, 3)));
  ok('R13 但其它天照排', list.length === 6, '实际 ' + list.length);

  /* mode=always：完成也要提醒 */
  setDaily(env, { times: ['21:00'], skipWhenDone: true, mode: 'always' });
  const list2 = env.R.build(BASE_T).filter((x) => x.channel === 'daily');
  const today2 = list2.filter((x) => x.id === todayId);
  ok('R14 mode=always → 今天仍然提醒', today2.length === 1);
  ok('R15 标题变成「都完成了」', today2[0] && today2[0].title.indexOf('都完成了') >= 0, today2[0] && today2[0].title);
}

/* ══ 5. 只在周一到周五 ══ */
{
  const env = makeEnv({ noCourses: true });
  setDaily(env, { times: ['21:00'], weekdaysOnly: true });
  const list = env.R.build(BASE).filter((x) => x.channel === 'daily');
  /* 2026-03-04 是周三，未来 7 天含周六(7)、周日(8) → 只有 5 天 */
  ok('R16 weekdaysOnly → 7 天里只排 5 天', list.length === 5, '实际 ' + list.length);
}

/* ══ 6. 时间点规范化 ══ */
{
  const env = makeEnv({ noCourses: true });
  const nt = env.R.normTimes(['9:00', '09:00', '25:00', 'abc', '', '21:30', '07:00', '23:59', '12:00']);
  ok('R17 去重 + 过滤非法 + 排序 + 截断到 4 个',
    JSON.stringify(nt) === JSON.stringify(['07:00', '09:00', '12:00', '21:30']), JSON.stringify(nt));
}

/* ══ 7. 课程提醒：按课覆盖提前量 / 关闭某门课 ══ */
{
  const env = makeEnv();
  env.S.get().settings.notifications.enabled = true;
  env.S.get().settings.notifications.defaultOffset = 15;
  env.S.save(true);
  let list = env.R.build(BASE).filter((x) => x.channel === 'class');
  const startMs = new Date(2026, 2, 4, 8, 0, 0, 0).getTime();
  ok('R18 默认提前 15 分', list[0] && list[0].atMs === startMs - 15 * 60000,
    list[0] && (startMs - list[0].atMs) / 60000 + ' 分');

  env.S.notifOverrides().courses['c1'] = { leadMin: 30 };
  env.S.save(true);
  list = env.R.build(BASE).filter((x) => x.channel === 'class');
  ok('R19 课程覆盖 30 分生效', list[0] && list[0].atMs === startMs - 30 * 60000,
    list[0] && (startMs - list[0].atMs) / 60000 + ' 分');

  env.S.notifOverrides().courses['c1'] = { leadMin: -1 };
  env.S.save(true);
  list = env.R.build(BASE).filter((x) => x.channel === 'class');
  ok('R20 leadMin=-1 → 这门课不排', list.length === 0, '实际 ' + list.length);
}

/* ══ 8. 作业到期 ══ */
{
  const env = makeEnv({ noCourses: true });
  setDaily(env, { times: [] });
  const st = env.S.get();
  st.tasks.push({ id: 'lt1', text: '线性代数作业', date: dateKey(addDays(BASE, 1)), done: false });
  env.S.save(true);
  const list = env.R.build(BASE).filter((x) => x.channel === 'daily');
  const due = list.filter((x) => x.id === 'due-lt1');
  ok('R21 作业到期产生 1 条', due.length === 1, '实际 ' + list.length);
  /* 到期日 2026-03-05 23:59 − 24h = 2026-03-04 23:59 */
  const want = new Date(2026, 2, 4, 23, 59, 0, 0).getTime();
  ok('R22 atMs = 到期 23:59 前 24 小时', due[0] && due[0].atMs === want, due[0] && due[0].atMs);
  ok('R23 标题是「明天到期」', due[0] && due[0].title.indexOf('明天到期') === 0, due[0] && due[0].title);

  env.S.notifOverrides().taskDates['lt1'] = { leadHours: 0 };
  env.S.save(true);
  ok('R24 leadHours=0 → 不提醒',
    env.R.build(BASE).filter((x) => x.id === 'due-lt1').length === 0);
}

/* ══ 9. 汇总文案带课程数 ══ */
{
  const env = makeEnv();
  setDaily(env, { times: ['21:00'], includeEvents: true });
  const st = env.S.get();
  st.events.push({ id: 'e1', title: '班会', date: BASE_KEY, start: '10:00' });
  env.S.save(true);
  const sum = env.R.summary(BASE);
  ok('R25 includeEvents → 文案里有「节课」', sum.text.indexOf('节课') >= 0, sum.text);
  ok('R26 没有待办时标题是「没有待办」或「都完成了」',
    sum.title.indexOf('没有待办') >= 0 || sum.title.indexOf('都完成了') >= 0, sum.title);
}

console.log('');
console.log('合计：' + pass + ' 通过 / ' + fail + ' 失败');
bad.forEach((b) => console.log('  ✗ ' + b));
if (fail) { process.exitCode = 1; }

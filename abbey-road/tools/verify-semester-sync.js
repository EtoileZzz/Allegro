/**
 * verify-semester-sync.js —— 学期同步不重复（v0.5.1a）
 *
 * 背景（真 bug）：学期以前只按「开学日期」配对，而空状态会自动补一个
 * 「我的学期」（开学日 = 当周周一）。两台设备生成的日期不同 → 永远配不上 →
 * 每次同步都多出一个空的「我的学期」。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CORE = fs.readFileSync(path.join(__dirname, '..', 'app/js/core.js'), 'utf8');

let pass = 0, fail = 0;
const bad = [];
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; bad.push(name + (extra ? ' → ' + extra : '')); }
}

function makeDevice() {
  const data = {};
  const sb = {
    console: { log() { }, warn() { }, error() { } },
    Date, JSON, Math, Number, String, Object, Array, Promise, Error, isFinite, parseInt, parseFloat, RegExp,
    setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent, btoa, atob,
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
      setItem: (k, v) => { data[k] = String(v); },
      removeItem: (k) => { delete data[k]; }
    }
  };
  sb.window = sb;
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(CORE, sb, { filename: 'core.js' });
  const dev = { AR: sb.window.AR, Store: sb.window.AR.Store };
  dev.Store.load();
  return dev;
}
const liveSems = (dev) => (dev.Store.get().semesters || []).filter((x) => !x.deletedAt);

/* ── 1. 两台设备各有一个默认学期（开学日不同）→ 合并后不能变成两个 ── */
{
  const A = makeDevice();
  const B = makeDevice();
  const semA = liveSems(A)[0];
  const semB = liveSems(B)[0];
  ok('S1 两台设备初始各有 1 个学期', !!semA && !!semB);

  /* 把 B 的开学日改到下一周，模拟「不同设备在不同时间首次启动」 */
  const d = new Date(semB.startDate + 'T00:00:00');
  d.setDate(d.getDate() + 7);
  const p2 = (n) => (n < 10 ? '0' + n : '' + n);
  semB.startDate = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  B.Store.save(true);
  ok('S2 两台设备的学期开学日已经不同', liveSems(A)[0].startDate !== liveSems(B)[0].startDate,
    liveSems(A)[0].startDate + ' vs ' + liveSems(B)[0].startDate);

  /* A 在这个学期下加一门课 */
  A.Store.get().courses.push({ id: 'cA1', name: '高等数学', semesterId: semA.id, updatedAt: '2026-10-01T00:00:00Z' });
  A.Store.save(true);

  /* A → B 同步 */
  B.Store.applyMerge(A.Store.exportPayload(), {});

  const sems = liveSems(B);
  ok('S3 合并后仍然只有 1 个学期（不再多出空的「我的学期」）', sems.length === 1,
    JSON.stringify(sems.map((x) => x.id + ':' + x.name)));
  const course = (B.Store.get().courses || []).filter((x) => !x.deletedAt && x.id === 'cA1')[0];
  ok('S4 课程同步过来了', !!course);
  ok('S5 课程的学期引用被重映射到本机学期', !!course && course.semesterId === sems[0].id,
    course && (course.semesterId + ' vs ' + sems[0].id));
}

/* ── 2. 多出来的空默认学期会被清理，但不动用户自己起的名字 ── */
{
  const dev = makeDevice();
  const S = dev.Store;
  const st = S.get();
  const keepId = 'sem-keep';
  const dup1 = 'sem-dup1';
  const dup2 = 'sem-dup2';
  const named = 'sem-named';
  st.semesters = [
    { id: keepId, name: '我的学期', startDate: '2026-09-07' },
    { id: dup1, name: '我的学期', startDate: '2026-09-14' },
    { id: dup2, name: '我的学期', startDate: '2026-09-21' },
    { id: named, name: '2026 秋', startDate: '2026-08-31' }
  ];
  st.settings.schedule.currentSemesterId = keepId;
  st.courses = [];
  S.save(true);
  ok('S6 清理前有 4 个学期', liveSems(dev).length === 4, '实际 ' + liveSems(dev).length);

  const removed = S.pruneEmptySemesters();
  const left = liveSems(dev);
  ok('S7 清掉了 2 个多余的空默认学期', removed === 2, '实际 ' + removed);
  ok('S8 当前选中的学期没被删', left.some((x) => x.id === keepId),
    JSON.stringify(left.map((x) => x.id)));
  ok('S9 用户自己命名的空学期没被删', left.some((x) => x.id === named),
    JSON.stringify(left.map((x) => x.id)));
  ok('S10 清理后剩 2 个', left.length === 2, '实际 ' + left.length);
}

/* ── 3. 有课程挂着的默认学期不能被当成空学期删掉 ── */
{
  const dev = makeDevice();
  const S = dev.Store;
  const st = S.get();
  st.semesters = [
    { id: 'sem-a', name: '我的学期', startDate: '2026-09-07' },
    { id: 'sem-b', name: '我的学期', startDate: '2026-09-14' }
  ];
  st.settings.schedule.currentSemesterId = 'sem-a';
  st.courses = [{ id: 'c1', name: '线性代数', semesterId: 'sem-b' }];
  S.save(true);
  const removed = S.pruneEmptySemesters();
  ok('S11 有课程挂着的学期不删', removed === 0 &&
    liveSems(dev).some((x) => x.id === 'sem-b'), 'removed=' + removed);
}

/* ── 4. 只剩一个学期时不动（不能把唯一的一个删掉）── */
{
  const dev = makeDevice();
  const S = dev.Store;
  const st = S.get();
  st.semesters = [{ id: 'only', name: '我的学期', startDate: '2026-09-07' }];
  st.courses = [];
  S.save(true);
  ok('S12 只有一个学期时不删', S.pruneEmptySemesters() === 0 && liveSems(dev).length === 1);
}

console.log('');
console.log('合计：' + pass + ' 通过 / ' + fail + ' 失败');
bad.forEach((b) => console.log('  ✗ ' + b));
if (fail) { process.exitCode = 1; }

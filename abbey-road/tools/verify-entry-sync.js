/**
 * verify-entry-sync.js —— 打卡记录的删除/撤销能不能同步（v0.4.7 回归）
 *
 * 背景（真 bug）：
 *   `todoRemoveEntry` / `todoUndoLast` / `longTaskRemoveEntry` 以前只更新了**任务**的
 *   updatedAt，没有更新那一笔记录自己的；而 entry 又没有 createdAt，于是
 *   stampOf(entry) 恒为空串，合并比较永远为假 → 条目永远本机优先 →
 *   删除和撤销完全传不到另一台设备。
 *
 * 这里用两个独立的 core.js 实例（各自一份 localStorage）模拟两台设备，
 * 通过 exportPayload → applyMerge 交换数据，直接验证同步结果。
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
  const sandbox = {
    console: { log() { }, warn() { }, error() { } },
    Date, JSON, Math, Number, String, Object, Array, Promise, Error, isFinite, parseInt, parseFloat, RegExp,
    setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent, btoa, atob,
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
      setItem: (k, v) => { data[k] = String(v); },
      removeItem: (k) => { delete data[k]; }
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(CORE, sandbox, { filename: 'core.js' });
  const dev = { AR: sandbox.window.AR, Store: sandbox.window.AR.Store };
  dev.Store.load();          // 初始化 state（首次运行会用默认值并写一份存档）
  return dev;
}

/** 把 A 的状态合并进 B（等价于一次云同步的合并步骤） */
function syncInto(from, to) {
  const payload = from.Store.exportPayload();
  to.Store.applyMerge(payload, {});
}

function entryOf(dev, taskId, entryId) {
  const t = dev.Store.todoById(taskId);
  const arr = (t && t.entries) || [];
  for (let i = 0; i < arr.length; i++) { if (arr[i].id === entryId) { return arr[i]; } }
  return null;
}

/* ── 准备两台设备，先让它们有一模一样的任务与一笔打卡 ── */
const A = makeDevice();
const B = makeDevice();
const t = A.Store.todoUpsert({ text: '背单词', cadence: { type: 'daily', times: 1 }, goal: { target: 100, unit: '页' } });
const taskId = (t && t.id) || (A.Store.todoList()[0] || {}).id;
const entry = A.Store.todoAddEntry(taskId, 3, '');
const entryId = entry.id;
syncInto(A, B);

ok('E1 两台设备拿到同一条任务', !!(B.Store.todoById(taskId)));
ok('E2 两台设备拿到同一笔打卡', !!entryOf(B, taskId, entryId));

/* ── 1. 新增的打卡自带 updatedAt（合并的前提） ── */
ok('E3 新增打卡写入了 updatedAt', !!(entryOf(A, taskId, entryId) || {}).updatedAt,
  JSON.stringify(entryOf(A, taskId, entryId)));

/* ── 2. A 删掉这一笔 → B 合并后也应该是删掉的 ── */
const beforeDel = entryOf(A, taskId, entryId);
A.Store.todoRemoveEntry(taskId, entryId);
const afterDel = entryOf(A, taskId, entryId);
ok('E4 删除时写了 deletedAt', !!afterDel.deletedAt);
ok('E5 删除时**也**更新了条目自己的 updatedAt（关键修复）',
  afterDel.updatedAt && afterDel.updatedAt >= beforeDel.at,
  'updatedAt=' + afterDel.updatedAt + ' at=' + beforeDel.at);

syncInto(A, B);
const bAfterDel = entryOf(B, taskId, entryId);
ok('E6 删除同步到了另一台设备', !!(bAfterDel && bAfterDel.deletedAt),
  JSON.stringify(bAfterDel && { deletedAt: bAfterDel.deletedAt }));
ok('E7 另一台设备的累计不把删掉的那笔算进去',
  B.Store.todoTotal(B.Store.todoById(taskId)) === 0,
  '实际 ' + B.Store.todoTotal(B.Store.todoById(taskId)));

/* ── 3. A 撤销（恢复）→ B 合并后应该又是活的 ── */
const delStamp = afterDel.deletedAt;   // ★ 先存字符串快照：restore 会删掉原对象的 deletedAt
A.Store.restore('taskEntries', entryId, taskId);
const aRestored = entryOf(A, taskId, entryId);
ok('E8 撤销后 deletedAt 清掉', !aRestored.deletedAt);
ok('E9 撤销后 updatedAt 严格晚于删除时间（同毫秒也会 +1ms）',
  !!aRestored.updatedAt && aRestored.updatedAt > delStamp,
  'restored=' + aRestored.updatedAt + ' deleted=' + delStamp);

syncInto(A, B);
const bRestored = entryOf(B, taskId, entryId);
ok('E10 撤销同步到了另一台设备（又活了）', !!(bRestored && !bRestored.deletedAt),
  JSON.stringify(bRestored && { deletedAt: bRestored.deletedAt }));
ok('E11 另一台设备累计恢复为 3',
  B.Store.todoTotal(B.Store.todoById(taskId)) === 3,
  '实际 ' + B.Store.todoTotal(B.Store.todoById(taskId)));

/* ── 4. 老数据（条目没有 updatedAt）：删除也要能传过去 ── */
{
  const C = makeDevice();
  const D = makeDevice();
  const tk = C.Store.todoUpsert({ text: '老数据任务' });
  const id2 = (tk && tk.id) || C.Store.todoList()[0].id;
  C.Store.todoAddEntry(id2, 1, '');
  const e2 = (C.Store.todoById(id2).entries || [])[0];
  syncInto(C, D);
  // 抹掉 updatedAt，模拟老版本存下来的数据
  delete e2.updatedAt;
  const dEntry = entryOf(D, id2, e2.id);
  delete dEntry.updatedAt;
  D.Store.save(true);
  C.Store.save(true);
  // C 现在只写 deletedAt（老版本行为）
  e2.deletedAt = new Date(Date.now() + 1000).toISOString();
  C.Store.save(true);
  syncInto(C, D);
  const dAfter = entryOf(D, id2, e2.id);
  ok('E12 老数据（无 updatedAt）的删除也能通过「打平删除方胜」传过去',
    !!(dAfter && dAfter.deletedAt), JSON.stringify(dAfter && { deletedAt: dAfter.deletedAt }));
}

/* ── 5. 非回归：两边各加一笔不同的打卡 → 合并后两笔都在（并集） ── */
{
  const E = makeDevice();
  const F = makeDevice();
  const tk = E.Store.todoUpsert({ text: '并集任务' });
  const id3 = (tk && tk.id) || E.Store.todoList()[0].id;
  syncInto(E, F);
  E.Store.todoAddEntry(id3, 1, 'E 的');
  F.Store.todoAddEntry(id3, 2, 'F 的');
  syncInto(E, F);
  syncInto(F, E);
  const cnt = (E.Store.todoById(id3).entries || []).filter((x) => !x.deletedAt).length;
  const sum = E.Store.todoTotal(E.Store.todoById(id3));
  ok('E13 两边各加一笔 → 合并后两笔都在', cnt === 2, '实际 ' + cnt + ' 笔');
  ok('E14 累计相加（1+2=3），没有丢次数', sum === 3, '实际 ' + sum);
}

console.log('');
console.log('合计：' + pass + ' 通过 / ' + fail + ' 失败');
bad.forEach((b) => console.log('  ✗ ' + b));
if (fail) { process.exitCode = 1; }

/**
 * verify-mutations.js —— 把修过的错「放回去」，确认测试真的会红
 *
 *   node tools/verify-mutations.js          # 只跑快的（客户端 If-Match / Worker 补种子行）
 *   node tools/verify-mutations.js --e2e    # 再加上真浏览器那条（返回键分层）
 *
 * 一个从没红过的检查等于没加。这个脚本就是用来证明它红得起来。
 */
const fs = require('fs');
const cp = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SYNC = path.join(ROOT, 'app/js/sync.js');
const WORKER = path.join(ROOT, 'tools/cloudflare/worker.js');
const BOOT = path.join(ROOT, 'app/js/boot.js');
const PANELS = path.join(ROOT, 'app/js/panels.js');
const WHISPER = path.join(ROOT, 'app/js/whisper.js');
const withE2E = process.argv.indexOf('--e2e') >= 0;

function run(script) {
  const r = cp.spawnSync(process.execPath, ['tools/' + script], { cwd: ROOT, encoding: 'utf8' });
  return { out: (r.stdout || '') + (r.stderr || ''), code: r.status };
}
function summarize(out) {
  const lines = out.split(/\r?\n/);
  return (lines.filter((l) => /通过 \/ .*失败/.test(l))[0] || lines[0] || '（没有输出）').trim();
}
let allGood = true;
function expect(label, file, broken, script) {
  const orig = fs.readFileSync(file, 'utf8');
  if (broken === orig) { console.log('RED?  ' + label + ' → 变异没打上（找不到要改的片段）'); allGood = false; fs.writeFileSync(file, orig); return; }
  fs.writeFileSync(file, broken);
  const r = run(script);
  fs.writeFileSync(file, orig);
  const red = r.code !== 0;
  console.log((red ? 'RED   ' : 'GREEN ') + label + ' → ' + summarize(r.out) + (red ? '' : '  ← 没红，检查是假的'));
  if (!red) { allGood = false; }
}

const syncOrig = fs.readFileSync(SYNC, 'utf8');
const workerOrig = fs.readFileSync(WORKER, 'utf8');
const bootOrig = fs.readFileSync(BOOT, 'utf8');
const panelsOrig = fs.readFileSync(PANELS, 'utf8');
const whisperOrig = fs.readFileSync(WHISPER, 'utf8');

expect('If-Match 传回对象（0.5.3a 的写法）',
  SYNC,
  syncOrig.replace(
    "return apiCall('PUT', '/blob/' + encodeURIComponent(ns), { envelope: JSON.stringify(env) }, rev);",
    "return apiCall('PUT', '/blob/' + encodeURIComponent(ns), { envelope: JSON.stringify(env) }, { 'If-Match': String(rev) });"
  ),
  'verify-whisper-sync.js');

expect('Worker 不再给命名空间补种子行',
  WORKER,
  workerOrig.replace(/\n\s*await env\.DB\.prepare\(\s*\n\s*'INSERT OR IGNORE INTO blob_state[^;]*?\.run\(\);/, ''),
  'verify-whisper-sync.js');

/* v0.5.4b：「立即同步」是一条链，任何一环断了日记都不再同步。
   下面三个变异分别对应链上的三环：总入口 → 按钮 → 日记注册。 */
expect('syncEverything 不再跑注册的命名空间（日记）',
  SYNC,
  syncOrig.replace(
    "  function runSyncers(summary, kind) {\n    var chain = Promise.resolve();",
    "  function runSyncers(summary, kind) {\n    return Promise.resolve();\n    var chain = Promise.resolve();"
  ),
  'verify-whisper-sync.js');

expect('pull 模式退回普通同步器（只拉取会顺手推日记）',
  SYNC,
  syncOrig.replace("        else if (kind === 'pull' && s.pull) { fn = s.pull; }\n", ''),
  'verify-whisper-sync.js');

if (withE2E) {
  expect('boot.js 不再把返回交给日记',
    BOOT,
    bootOrig.replace(/\n\s*if \(AR\.Whisper && AR\.Whisper\.handleBack && AR\.Whisper\.handleBack\(\)\) \{ return; \}/, ''),
    'verify-whisper-e2e.js');

  expect('客户端 If-Match 传回对象（真浏览器）',
    SYNC,
    syncOrig.replace(
      "return apiCall('PUT', '/blob/' + encodeURIComponent(ns), { envelope: JSON.stringify(env) }, rev);",
      "return apiCall('PUT', '/blob/' + encodeURIComponent(ns), { envelope: JSON.stringify(env) }, { 'If-Match': String(rev) });"
    ),
    'verify-whisper-e2e.js');

  expect('设置页「立即同步」退回只同步课表（0.5.3b 的写法）',
    PANELS,
    panelsOrig.replace("AR.Sync.syncEverything({ kind: kind || 'up' })", 'AR.Sync.syncNow()'),
    'verify-whisper-e2e.js');

  expect('日记不再注册给「立即同步」',
    WHISPER,
    whisperOrig.replace(
      "      AR.Sync.registerSyncer('whisper', function () { return syncBlob(); }, '日记', {\n        pull: function () { return syncBlob({ push: false }); },\n        force: forceBlobSync\n      });",
      '      /* 变异：不再注册 */'
    ),
    'verify-whisper-e2e.js');

  expect('彻底删除不再写墓碑（云端会把条目带回来）',
    WHISPER,
    whisperOrig.replace(
      "        var id = btn.getAttribute('data-de');\n        addTombstone(id);\n",
      "        var id = btn.getAttribute('data-de');\n"
    ),
    'verify-whisper-e2e.js');
}

/* 复原后必须全绿 */
const back = run('verify-whisper-sync.js');
const green = back.code === 0;
console.log((green ? 'GREEN ' : 'RED   ') + '复原后 → ' + summarize(back.out));
if (!green) { allGood = false; }
process.exitCode = allGood ? 0 : 1;

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
}

/* 复原后必须全绿 */
const back = run('verify-whisper-sync.js');
const green = back.code === 0;
console.log((green ? 'GREEN ' : 'RED   ') + '复原后 → ' + summarize(back.out));
if (!green) { allGood = false; }
process.exitCode = allGood ? 0 : 1;

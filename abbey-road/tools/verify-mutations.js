/**
 * verify-mutations.js —— 把修过的错「放回去」，确认测试真的会红
 *
 *   node tools/verify-mutations.js          # 只跑快的（客户端/服务端/Whisper合并/静态/SQL切分）
 *   node tools/verify-mutations.js --e2e    # 再加上真浏览器 E2E 变异（返回栈/锁门禁/卡片流/层级）
 *
 * 一个从没红过的检查等于没加。这个脚本就是用来证明它红得起来。
 * 所有变异都包在 try/finally + 进程信号兜底里，任何异常/中断都会还原原文件。
 */
const fs = require('fs');
const cp = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SYNC = path.join(ROOT, 'app/js/sync.js');
const WORKER = path.join(ROOT, 'tools/cloudflare/worker.js');
const UPD_WORKER = path.join(ROOT, 'tools/cloudflare/update-worker.js');
const BOOT = path.join(ROOT, 'app/js/boot.js');
const WHISPER = path.join(ROOT, 'app/js/whisper.js');
const WHISPER_CSS = path.join(ROOT, 'app/css/whisper.css');
const APP_CSS = path.join(ROOT, 'app/css/app.css');
const CORE = path.join(ROOT, 'app/js/core.js');
const UI_JS = path.join(ROOT, 'app/js/ui.js');
const PANELS = path.join(ROOT, 'app/js/panels.js');
const WIDGET = path.join(ROOT, 'app/js/widgetdata.js');
const MAIN_JAVA = path.join(ROOT, 'android/src/com/etoilezzz/allegro/MainActivity.java');
const withE2E = process.argv.indexOf('--e2e') >= 0;

/* 进程级还原兜底：防止 Ctrl+C 或异常中断把变异代码留在工作区 */
const activeBackups = new Map();
function restoreAllBackups() {
  for (const [file, orig] of activeBackups.entries()) {
    try { fs.writeFileSync(file, orig); } catch (e) { }
  }
  activeBackups.clear();
}
process.on('SIGINT', () => { restoreAllBackups(); process.exit(130); });
process.on('SIGTERM', () => { restoreAllBackups(); process.exit(143); });
process.on('uncaughtException', (err) => { restoreAllBackups(); console.error(err); process.exit(1); });

function run(script) {
  const r = cp.spawnSync(process.execPath, ['tools/' + script], { cwd: ROOT, encoding: 'utf8' });
  return { out: (r.stdout || '') + (r.stderr || ''), code: r.status };
}
function summarize(out) {
  const lines = out.split(/\r?\n/);
  return (lines.filter((l) => /通过 \/ .*失败|通过\s+\d+\s+项，失败\s+\d+\s+项/.test(l))[0] || lines[0] || '（没有输出）').trim();
}

let allGood = true;
function expect(label, file, broken, script) {
  const orig = fs.readFileSync(file, 'utf8');
  if (broken === orig) {
    console.log('RED?  ' + label + ' → 变异没打上（找不到要改的片段）');
    allGood = false;
    return;
  }
  activeBackups.set(file, orig);
  let r;
  try {
    fs.writeFileSync(file, broken);
    r = run(script);
  } finally {
    fs.writeFileSync(file, orig);
    activeBackups.delete(file);
  }
  const red = r.code !== 0;
  console.log((red ? 'RED   ' : 'GREEN ') + label + ' → ' + summarize(r.out) + (red ? '' : '  ← 没红，检查是假的'));
  if (!red) { allGood = false; }
}

const syncOrig = fs.readFileSync(SYNC, 'utf8');
const workerOrig = fs.readFileSync(WORKER, 'utf8');
const updWorkerOrig = fs.readFileSync(UPD_WORKER, 'utf8');
const bootOrig = fs.readFileSync(BOOT, 'utf8');
const whisperOrig = fs.readFileSync(WHISPER, 'utf8');
const whisperCssOrig = fs.readFileSync(WHISPER_CSS, 'utf8');
const appCssOrig = fs.readFileSync(APP_CSS, 'utf8');
const coreOrig = fs.readFileSync(CORE, 'utf8');
const uiOrig = fs.readFileSync(UI_JS, 'utf8');
const panelsOrig = fs.readFileSync(PANELS, 'utf8');
const widgetOrig = fs.readFileSync(WIDGET, 'utf8');
const javaOrig = fs.readFileSync(MAIN_JAVA, 'utf8');

expect('M1  If-Match 传回对象（0.5.3a 的写法）',
  SYNC,
  syncOrig.replace(
    "return apiCall('PUT', '/blob/' + encodeURIComponent(ns), { envelope: JSON.stringify(env) }, rev);",
    "return apiCall('PUT', '/blob/' + encodeURIComponent(ns), { envelope: JSON.stringify(env) }, { 'If-Match': String(rev) });"
  ),
  'verify-whisper-sync.js');

expect('M2  Worker 不再给命名空间补种子行',
  WORKER,
  workerOrig.replace(/\n\s*await env\.DB\.prepare\(\s*\n\s*'INSERT OR IGNORE INTO blob_state[^;]*?\.run\(\);/, ''),
  'verify-whisper-sync.js');

expect('M3  whisper.js mergeBlob 忽略 remote.personas',
  WHISPER,
  whisperOrig.replace(
    "S.personas = mergeListLWW(S.personas, remote.personas, 'personas', tombMap);",
    "/* mutated: drop personas merge */"
  ),
  'verify-whisper-sync.js');

expect('M4  whisper.js mergeBlob 用本地 books 无条件覆盖远端',
  WHISPER,
  whisperOrig.replace(
    "S.books = mergeListLWW(S.books, remote.books, 'books', tombMap);",
    "var _bm = {}; (remote.books || []).forEach(function (b) { _bm[b.id] = b; }); (S.books || []).forEach(function (b) { _bm[b.id] = b; }); S.books = Object.keys(_bm).map(function (k) { return _bm[k]; });"
  ),
  'verify-whisper-sync.js');

expect('M5  whisper.js stampNow 不再写 updatedMs / updatedAt',
  WHISPER,
  whisperOrig.replace(
    "function stampNow(rec) {\n    if (!rec) { return rec; }",
    "function stampNow(rec) {\n    return rec;"
  ),
  'verify-whisper-sync.js');

expect('M6  whisper.css 重新引入 color-mix()',
  WHISPER_CSS,
  whisperCssOrig.replace(
    'var(--w-a1-22,rgba(217,119,87,.22))',
    'color-mix(in srgb,var(--w-a1) 22%,transparent)'
  ),
  'verify-compat-static.js');

expect('M7  update-worker.js 退回会丢建表语句的 indexOf("--") !== 0 切分',
  UPD_WORKER,
  updWorkerOrig.replace(
    "  const clean = String(sql || '')\n    .split(/\\r?\\n/)\n    .filter((l) => !/^\\s*--/.test(l))\n    .join('\\n');\n  return clean.split(';').map((s) => s.trim()).filter(Boolean);",
    "  return String(sql || '').split(';').map((s) => s.trim()).filter((s) => s && s.indexOf('--') !== 0);"
  ),
  'verify-whisper-sync.js');

expect('M8  whisper.js resetAll 清空时不再调用 pushCloudWipe()',
  WHISPER,
  whisperOrig.replace(
    "var canClearCloud = !!(opts.clearCloud && window.AR && AR.Sync && AR.Sync.status && AR.Sync.status().configured);",
    "var canClearCloud = false;"
  ),
  'verify-whisper-sync.js');

expect('M9  sync.js blobDecrypt 错口令不再标注 BAD_PASSPHRASE',
  SYNC,
  syncOrig.replace(
    "          e.code = 'BAD_PASSPHRASE';\n          throw e;",
    "          throw e;"
  ),
  'verify-whisper-sync.js');

if (withE2E) {
  expect('M10 boot.js 不再把返回交给日记',
    BOOT,
    bootOrig.replace(/\n\s*if \(AR\.Whisper && AR\.Whisper\.handleBack && AR\.Whisper\.handleBack\(\)\) \{ return; \}/, ''),
    'verify-whisper-e2e.js');

  expect('M11 客户端 If-Match 传回对象（真浏览器）',
    SYNC,
    syncOrig.replace(
      "return apiCall('PUT', '/blob/' + encodeURIComponent(ns), { envelope: JSON.stringify(env) }, rev);",
      "return apiCall('PUT', '/blob/' + encodeURIComponent(ns), { envelope: JSON.stringify(env) }, { 'If-Match': String(rev) });"
    ),
    'verify-whisper-e2e.js');

  expect('M12 whisper.js renderCards 去掉 data-eid',
    WHISPER,
    whisperOrig.replace(
      "h += '<div class=\"entry\" data-eid=\"' + e.id + '\"><div class=\"hd\">'",
      "h += '<div class=\"entry\"><div class=\"hd\">'"
    ),
    'verify-whisper-e2e.js');

  expect('M13 app.css 把 .cp-root z-index 降回 66（被 #whRoot 遮挡）',
    APP_CSS,
    appCssOrig.replace(
      'position: fixed; inset: 0; z-index: 9600;',
      'position: fixed; inset: 0; z-index: 66;'
    ),
    'verify-compat-static.js');

  expect('M14 whisper.js openTrash 绕过解锁门禁',
    WHISPER,
    whisperOrig.replace(
      "    trash: function () {\n      var fromOutside = !currentScreen();\n      requireUnlock(function () { openTrash(fromOutside ? 'close' : ''); });\n    },",
      "    trash: function () { openTrash(); },"
    ),
    'verify-whisper-e2e.js');
}

/* ── Batch 2 (M15–M22)：五大修复域变异反证 ── */
expect('M15 core.js applyMerge 把 return state; 移回清理逻辑之前（死代码回归）',
  CORE,
  coreOrig.replace(
    "    /* v0.5.1：合并可能给记录换 id（冲突副本），个性化通知的 key 要跟着搬，并清掉孤儿 */\n    try {\n      if (plan.maps && plan.maps.course) { remapCourseOverrides(plan.maps.course); }\n      pruneEmptySemesters();   // v0.5.1a：合并可能带进空学期\n      cleanOrphanOverrides();\n    } catch (e) { }\n    save(true);\n    return state;",
    "    save(true);\n    return state;\n    try {\n      if (plan.maps && plan.maps.course) { remapCourseOverrides(plan.maps.course); }\n      pruneEmptySemesters();\n      cleanOrphanOverrides();\n    } catch (e) { }"
  ),
  'test-logic.js');

expect('M16 core.js semesterList 不再过滤 deletedAt 软删学期',
  CORE,
  coreOrig.replace(
    "  function semesterList() {\n    var list = liveOnly(state.semesters || []);",
    "  function semesterList() {\n    var list = (state.semesters || []).slice();"
  ),
  'test-logic.js');

expect('M17 core.js reportStats(todo) 让 weekly 任务回退按每日 7x 累加',
  CORE,
  coreOrig.replace(
    "        if (cad.type === 'weekly') {",
    "        if (false && cad.type === 'weekly') {"
  ),
  'verify-report.js');

expect('M18 ui.js 日程年度柱状图退回读取 m0.count（恒为 0）',
  UI_JS,
  uiOrig.replace(
    "    return (m0.cls || 0) + (m0.ev || 0) + (m0.d || 0);",
    "    return m0.count || 0;"
  ),
  'verify-report.js');

expect('M19 core.js planMerge 不再检查本地 state.tombstones（清空回收站后旧备份复活）',
  CORE,
  coreOrig.replace(
    "          var ltDel = hadExplicitId ? localTomb[table + ':' + rec.id] : '';",
    "          var ltDel = '';"
  ),
  'verify-tasks-compat.js');

expect('M20 panels.js panelNotify 课前提醒开关脱钩 AR.Reminders',
  PANELS,
  panelsOrig.replace(
    "    box.appendChild(rowSwitch('课前提醒', '在每节课开始前提醒（需要系统通知权限）', n.enabled, function (v) {\n      n.enabled = v;\n      AR.Store.save(true);",
    "    box.appendChild(rowSwitch('课前提醒', '在每节课开始前提醒（需要系统通知权限）', n.enabled, function (v) {\n      n.enabled = v;\n      AR.Store.save(true);\n      return;"
  ),
  'verify-panels-dom.js');

expect('M21 widgetdata.js 模式 B 退回按原始下标 i < 4 截断',
  WIDGET,
  widgetOrig.replace(
    "    for (var i = 0; i < items.length && payload.today.length < 4; i++) {",
    "    for (var i = 0; i < items.length && i < 4; i++) {"
  ),
  'test-logic.js');

expect('M22 MainActivity.java 移除 1 参 beep(String kind) 重载',
  MAIN_JAVA,
  javaOrig.replace(/\r?\n\s*\/\*\*[^\n]*call\('beep'[^\n]*\r?\n\s*@JavascriptInterface\r?\n\s*public void beep\(final String kind\)\s*\{\r?\n\s*beep\(\);\r?\n\s*\}/, ''),
  'verify-compat-static.js');

/* ── v0.5.5 变异反证（M23–M26） ── */
expect('M23 sync.js onLocalSave 忽略 syncConfigEnabled === false（同步未真正解耦）',
  SYNC,
  syncOrig.replace(
    "if (!isConfigured() || cfg.syncConfigEnabled === false) { return; }",
    "if (!isConfigured()) { return; }"
  ),
  'verify-sync.js');

expect('M24 whisper.js mergeListLWW 丢失并发条目评论合并（r.comments 被覆盖）',
  WHISPER,
  whisperOrig.replace(
    "var mergedC = mergeListLWW(item.comments, r.comments, 'comments', tombMap);",
    "var mergedC = item.comments || [];"
  ),
  'verify-whisper-sync.js');

expect('M25 whisper.js visibleBooks 退回全量 aliveBooks（未解锁私密本泄漏）',
  WHISPER,
  whisperOrig.replace(
    "return aliveBooks().filter(function (b) { return session.secretUnlocked || !b.hidden; });",
    "return aliveBooks();"
  ),
  'verify-whisper-sync.js');

expect('M26 sync.js 忽略 syncWhisperMedia === false 开关',
  SYNC,
  syncOrig.replace(
    "function isWhisperMediaSyncEnabled() { return isWhisperSyncEnabled() && cfg.syncWhisperMedia !== false; }",
    "function isWhisperMediaSyncEnabled() { return isWhisperSyncEnabled(); }"
  ),
  'verify-whisper-sync.js');

expect('M30 MainActivity.java 破坏 WebChromeClient.onShowFileChooser 桥接（重现安卓选图失效）',
  MAIN_JAVA,
  javaOrig.replace(
    "public boolean onShowFileChooser(",
    "public boolean _brokenShowFileChooser("
  ),
  'verify-compat-static.js');

expect('M31 whisper.js 吞掉配图上传失败计数与错误信息',
  WHISPER,
  whisperOrig.replace(
    /failedUp\+\+;\r?\n\s+if \(!lastErr\) \{ lastErr = \(errUp && errUp\.message\) \|\| '配图上传失败'; \}/,
    "/* swallowed */"
  ),
  'verify-whisper-sync.js');

expect('M32 whisper.js 新建条目退回仅保存到分（丢秒）',
  WHISPER,
  whisperOrig.replace(
    "at: nowAtSec(), x: tx || '[图片]'",
    "at: nowAtSec().slice(0, 16), x: tx || '[图片]'"
  ),
  'verify-whisper-sync.js');

expect('M33 whisper.js AR.Whisper.save 忽略 hasPin/bio 直接拦截未解锁（重现无锁机改字体不落盘）',
  WHISPER,
  whisperOrig.replace(
    "if (ls && ls.enabled && !ls.unlocked && (ls.hasPin || ls.bio)) { return; }",
    "if (ls && ls.enabled && !ls.unlocked) { return; }"
  ),
  'verify-whisper-sync.js');

if (withE2E) {
  expect('M27 whisper.js trBack 不再在 trashReturnTo === close 时关闭（重现退回内部屏bug）',
    WHISPER,
    whisperOrig.replace(
      "if (ret === 'close') { closeRoot(); return; }",
      "if (ret === '__never__') { closeRoot(); return; }"
    ),
    'verify-whisper-e2e.js');

  expect('M28 whisper.css 去掉 .wh-root .toast 的 animation:none!important 与 visibility:hidden（重现中下方白点）',
    WHISPER_CSS,
    whisperCssOrig.replace(
      "visibility:hidden;pointer-events:none;transition:.2s;animation:none!important;",
      "pointer-events:none;transition:.2s;"
    ),
    'verify-whisper-e2e.js');

  expect('M29 whisper.css 去掉 .wh-root .sheet .row .ico 透明背景隔离（重现图标变色块）',
    WHISPER_CSS,
    whisperCssOrig.replace(
      "background:transparent!important;color:var(--w-mid)",
      "color:var(--w-mid)"
    ),
    'verify-whisper-e2e.js');

  expect('M34 whisper.js 去掉 mask 380ms 防误触穿透保护（重现手机端双击编辑瞬关）',
    WHISPER,
    whisperOrig.replace(
      "if (Date.now() - sheetOpenedAt < 380) { return; }",
      "/* no guard */"
    ),
    'verify-whisper-e2e.js');

  expect('M35 whisper.js 默认复制纯文本强行退回附带元信息与追记',
    WHISPER,
    whisperOrig.replace(
      "if (!includeMeta) { return bodyTxt; }",
      "/* always include meta */"
    ),
    'verify-whisper-e2e.js');

  expect('M36 whisper.js renderEntryBodyHTML 不再渲染 Markdown 格式',
    WHISPER,
    whisperOrig.replace(
      "return renderMarkdownHTML(raw || '');",
      "return esc(raw || '');"
    ),
    'verify-whisper-e2e.js');

  expect('M37 whisper.js 移除阅读页顶栏双击返回顶部绑定',
    WHISPER,
    whisperOrig.replace(
      /var bar = document\.querySelector\('#s-whisper \.topbar'\);\r?\n\s+if \(!bar\) \{ return; \}/,
      "var bar = null;\n    if (!bar) { return; }"
    ),
    'verify-whisper-e2e.js');
}

/* 复原后必须全绿 */
for (const chk of ['verify-compat-static.js', 'verify-sync.js', 'verify-whisper-sync.js', 'verify-report.js', 'verify-reminders.js', 'verify-tasks-compat.js', 'test-logic.js', 'verify-panels-dom.js']) {
  const back = run(chk);
  const green = back.code === 0;
  console.log((green ? 'GREEN ' : 'RED   ') + '复原后 (' + chk + ') → ' + summarize(back.out));
  if (!green) { allGood = false; }
}
process.exitCode = allGood ? 0 : 1;

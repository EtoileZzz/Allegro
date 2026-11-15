/**
 * Abbey Road → Allegro 重命名（一次性脚本，跑完可删）
 *
 * 原则：
 *   · 改「用户看得见的品牌」和「应用身份」：应用名、包名、进程名、窗口标题、导出文件名
 *   · 不改「内部标识」，否则会丢数据或破坏协议：
 *       abbeyroad.local      ← WebView 的 origin，改了等于换 App，localStorage 全丢
 *                               而且同步后端的 CORS 白名单也是它
 *       abbeyroad.state.v1   ← localStorage 存档键
 *       abbeyroad.sync       ← 配置文件的 kind
 *       abbeyroad-import: v1 ← 导出的 md 里的格式标记
 *       ABBEYROAD_*          ← 构建脚本的环境变量名
 *       abbeyroad.ico / abbeyroad.keystore ← 物理文件名
 *
 * 用法：node tools/rename-to-allegro.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let changed = 0;
const report = [];

function sub(file, pairs) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) { return; }
  let s = fs.readFileSync(p, 'utf8');
  const before = s;
  let n = 0;
  for (const [from, to] of pairs) {
    const parts = s.split(from);
    if (parts.length > 1) { n += parts.length - 1; s = parts.join(to); }
  }
  if (s !== before) {
    fs.writeFileSync(p, s, 'utf8');
    changed++;
    report.push(file + '  (' + n + ' 处)');
  }
}

function walk(dir, exts, skip) {
  const out = [];
  const stack = [path.join(root, dir)];
  while (stack.length) {
    const cur = stack.pop();
    for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
      const fp = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (skip && skip.test(fp)) { continue; }
        if (/[\\/\\\\](build|dist|node_modules|_build)([\\/\\\\]|$)/.test(fp)) { continue; }
        stack.push(fp);
      } else if (exts.test(e.name)) {
        out.push(path.relative(root, fp).replace(/\\/g, '/'));
      }
    }
  }
  return out;
}

/* ── 1) 应用身份：包名 ── */
const PKG = [['com.ganxing.abbeyroad', 'com.etoilezzz.allegro']];
for (const f of walk('android/src', /\.java$/)) { sub(f, PKG); }
sub('android/AndroidManifest.xml', PKG);
sub('android/tools/adb-cdp.ps1', PKG);
sub('android/build.ps1', [['com.ganxing.abbeyroad', 'com.etoilezzz.allegro']]);

/* ── 2) 品牌名：Abbey Road / AbbeyRoad → Allegro（只改这两个大小写形态）── */
const BRAND = [
  ['Abbey Road', 'Allegro'],   // 显示名（含 "Abbey Road 课表" 之类）
  ['AbbeyRoad', 'Allegro'],    // exe 名 / 备份文件名 / 命名空间 / 目录名
  ['ABBEY ROAD', 'ALLEGRO']    // 自检标题那种全大写
];

/* 2a. 网页端（全小写标识不受影响）*/
for (const f of walk('app', /\.(js|html|css)$/)) { sub(f, BRAND); }

/* 2b. Windows 端（保留 abbeyroad.local / abbeyroad.ico / @abbeyroad / ABBEYROAD_*）*/
for (const f of walk('windows/src', /\.cs$/)) { sub(f, BRAND); }
sub('windows/installer/Installer.cs', BRAND);
sub('windows/README.txt', BRAND);
sub('windows/build.ps1', BRAND);

/* 2c. Android 资源里的显示名 */
sub('android/res/values/strings.xml', BRAND);

/* 2d. 构建脚本产出的文件名 */
sub('android/build.ps1', [['AbbeyRoad-v', 'Allegro-v']]);
sub('android/build.ps1', BRAND);
sub('android/tools/ApkBuilder.java', BRAND);

/* ── 3) 输出文件名里的 app 前缀（APK / Setup / portable）── */
sub('windows/build.ps1', [
  ['Allegro-v$version-portable.zip', 'Allegro-v$version-portable.zip']
]);

console.log('改动文件数：' + changed);
report.forEach((r) => console.log('  ' + r));

/* ── 4) 自检：确认该保留的还在、该改的都改了 ── */
const mustKeep = [
  ['app/js/core.js', "abbeyroad.state.v1"],
  ['app/js/core.js', "abbeyroad.sync"],
  ['app/js/panels.js', "abbeyroad-import: v1"],
  ['android/src/com/etoilezzz/allegro/MainActivity.java', "abbeyroad.local"],
  ['android/build.ps1', "ABBEYROAD_KS_PASS"],
  ['windows/src/AppPaths.cs', "abbeyroad.local"]
];
let bad = 0;
for (const [f, needle] of mustKeep) {
  const s = fs.readFileSync(path.join(root, f), 'utf8');
  if (s.indexOf(needle) < 0) { console.log('  ✗ 应该保留但没了: ' + f + ' :: ' + needle); bad++; }
}
const mustChange = [
  ['android/AndroidManifest.xml', 'com.etoilezzz.allegro'],
  ['android/res/values/strings.xml', '<string name="app_name">Allegro</string>'],
  ['windows/src/AppPaths.cs', 'public const string Product = "Allegro"'],
  ['app/index.html', 'Allegro · 课表与日程'],
  ['app/js/core.js', "'Allegro-backup-'"]
];
for (const [f, needle] of mustChange) {
  const s = fs.readFileSync(path.join(root, f), 'utf8');
  if (s.indexOf(needle) < 0) { console.log('  ✗ 应该改掉却没有: ' + f + ' :: ' + needle); bad++; }
}
/* 不该再有残留的品牌名（排除注释里的历史说明由下面人工看）*/
const leftovers = [];
for (const f of walk('app', /\.(js|html|css)$/).concat(walk('windows', /\.(cs|ps1|txt)$/), walk('android/src', /\.java$/))) {
  const s = fs.readFileSync(path.join(root, f), 'utf8');
  if (/Abbey Road|AbbeyRoad|ABBEY ROAD/.test(s)) { leftovers.push(f); }
}
if (leftovers.length) { console.log('\n仍有品牌残留的文件：'); leftovers.forEach((f) => console.log('  ' + f)); }
console.log(bad ? '\n自检失败 ' + bad + ' 项' : '\n自检通过');
process.exitCode = bad ? 1 : 0;


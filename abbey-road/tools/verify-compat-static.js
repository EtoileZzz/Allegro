/**
 * 旧 Android WebView 兼容 · 静态检查（v0.4.2 起）
 *
 * 背景：老 WebView（Android 7/8 的 System WebView）不认识 light-dark() / color-mix() /
 * :has() / @container，遇到未知函数会**整条声明作废**——v0.4.1a 之前弹窗卡片因此变透明。
 * 原来这件事靠 CDP 驱动真浏览器验证（tools/verify-compat.js）。本机 CDP 已不可用，
 * 这里改成**纯静态扫描**：不依赖浏览器，仍能守住"别再引入这些特性"这条线。
 *
 * 用法：node tools/verify-compat-static.js
 */
const fs = require('fs');
const path = require('path');

const appDir = path.join(__dirname, '..', 'app');
const cssFiles = ['css/tokens.css', 'css/app.css'].map((f) => path.join(appDir, f));
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('[PASS] ' + name + (detail ? '  |  ' + detail : '')); }
  else { fail++; console.log('[FAIL] ' + name + (detail ? '  |  ' + detail : '')); }
  return !!cond;
}

/* ── 1. 禁用特性：这些会让整条声明在老 WebView 上失效 ── */
const BANNED = [
  { re: /light-dark\s*\(/g, name: 'light-dark()' },
  { re: /color-mix\s*\(/g, name: 'color-mix()' },
  { re: /:has\s*\(/g, name: ':has()' },
  { re: /@container/g, name: '@container' },
  { re: /oklch\s*\(/g, name: 'oklch()' }
];
/** 去掉 CSS 注释：说明性文字里提到这些特性名不算使用（app.css 顶部就有这种说明） */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ');
}
for (const f of cssFiles) {
  const raw = fs.readFileSync(f, 'utf8');
  const css = stripComments(raw);
  const short = path.basename(f);
  for (const b of BANNED) {
    const hits = css.match(b.re);
    ok(short + ' 不使用 ' + b.name, !hits, hits ? ('出现 ' + hits.length + ' 次') : '');
  }
}

/* ── 2. 弹窗卡片：模糊必须由卡片自己承担 + 必须有降级 ── */
const appRaw = fs.readFileSync(path.join(appDir, 'css', 'app.css'), 'utf8');
const app = stripComments(appRaw);
const cardBlock = (/\.modal-card\s*\{[\s\S]*?\n\}/.exec(app) || [''])[0];
ok('C1 .modal-card 存在', !!cardBlock);
ok('C2 卡片自带 backdrop-filter 模糊', /backdrop-filter\s*:\s*blur\(/.test(cardBlock),
  (cardBlock.match(/backdrop-filter[^;]*/) || ['（无）'])[0].trim());
ok('C3 卡片同时写了 -webkit- 前缀', /-webkit-backdrop-filter\s*:\s*blur\(/.test(cardBlock));
/* 底色要么是纯 rgba，要么走一个（在任何主题下都）为纯 rgba 的自定义属性 */
const cardBg = (cardBlock.match(/background\s*:\s*([^;]+)/) || [])[1] || '';
const bgVar = (/var\((--[\w-]+)/.exec(cardBg) || [])[1];
let bgOk = /^rgba?\(/.test(cardBg.trim());
let bgDetail = cardBg.trim();
if (bgVar) {
  // 变量可能定义在 tokens.css（且每种主题各一份），逐份检查都必须是纯 rgba
  const allDefs = [];
  for (const f of ['css/tokens.css', 'css/app.css']) {
    const css2 = stripComments(fs.readFileSync(path.join(appDir, f), 'utf8'));
    const re = new RegExp('\\' + bgVar + '\\s*:\\s*([^;]+)', 'g');
    let mm;
    while ((mm = re.exec(css2))) { allDefs.push(mm[1].trim()); }
  }
  const badDefs = allDefs.filter((v) => !/^rgba?\(/.test(v) && !/^var\(/.test(v));
  bgOk = /^rgba?\(/.test(cardBg.trim()) || (allDefs.length > 0 && badDefs.length === 0);
  bgDetail = bgVar + ' → ' + (allDefs.length ? allDefs.join(' | ') : '（未找到定义）');
}
ok('C4 卡片底色最终落在纯 rgba 上（旧内核认得的写法）', bgOk, bgDetail);
/* 深色主题有没有单独给卡片一份不透明底 */
const darkCardBg = (/body\[data-theme="dark"\][^{]*\.modal-card[\s\S]{0,240}?background\s*:\s*([^;]+)/.exec(app) || [])[1];
ok('C4b 深色主题给了卡片自己的底色（纯 rgba）', !!darkCardBg && /^rgba?\(/.test(darkCardBg.trim()),
  darkCardBg ? darkCardBg.trim() : '（没找到）');

/* 深色主题覆盖 */
const darkCard = /body\[data-theme="dark"\][^{]*\.modal-card[\s\S]{0,240}/.exec(app);
ok('C5 深色主题对卡片有覆盖', !!darkCard);

/* 不支持 backdrop-filter 时的降级（@supports not ...） */
ok('C6 有 @supports not ((-webkit-backdrop-filter…) or (backdrop-filter…)) 的降级块',
  /@supports\s+not\s*\(\s*\(\s*-webkit-backdrop-filter/.test(app));

/* 性能模式兜底：不透明底色 */
ok('C7 body[data-perf] 下有实底兜底', /body\[data-perf\]/.test(app));

/* ── 3. 新增的任务样式：只允许老 WebView 认识的东西 ── */
const tkBlock = stripComments((/\/\* ══════════ 任务[\s\S]*$/.exec(appRaw) || [''])[0]);
ok('C8 任务样式块存在（tk- 前缀）', /\.tk-card/.test(tkBlock), '长度 ' + tkBlock.length);
for (const b of BANNED) {
  ok('C9 任务样式不使用 ' + b.name, !b.re.test(tkBlock));
}
ok('C10 任务样式没写死主题色（用变量）', /var\(--/.test(tkBlock) && !/#000\b|#fff\b(?!f)/.test(tkBlock.replace(/color:\s*#fff/g, '')));

/* ── 4. index.html 资源版本串与 APP_VERSION 一致（版本号不写死，跟随源码） ── */
const core = fs.readFileSync(path.join(appDir, 'js', 'core.js'), 'utf8');
const ver = (/var APP_VERSION = '([^']+)'/.exec(core) || [])[1];
ok('C11 APP_VERSION 能读到', !!ver, 'ver=' + ver);
const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
const badV = (html.match(/\?v=(?![\d.]+[a-z]?)/g) || []);
const versions = Array.from(new Set((html.match(/\?v=([\d.]+[a-z]?)/g) || []).map(function (s) { return s.replace('?v=', ''); })));
ok('C12 index.html 所有 ?v= 都指向 ' + ver,
  versions.length > 0 && versions.every(function (v) { return v === ver; }),
  versions.join(', '));
/* 原生壳的版本号也不能掉队 */
const mf = fs.readFileSync(path.join(appDir, '..', 'android', 'AndroidManifest.xml'), 'utf8');
const mName = (/android:versionName="([^"]+)"/.exec(mf) || [])[1];
const mCode = (/android:versionCode="(\d+)"/.exec(mf) || [])[1];
ok('C13 AndroidManifest 的 versionName 与 APP_VERSION 一致', mName === ver, 'manifest=' + mName + ' app=' + ver);
const bp = fs.readFileSync(path.join(appDir, '..', 'android', 'build.ps1'), 'utf8');
const bpCode = (/\$versionCode = (\d+)/.exec(bp) || [])[1];
ok('C14 build.ps1 的 versionCode 与 manifest 一致', bpCode === mCode, 'build=' + bpCode + ' manifest=' + mCode);

console.log('\n合计：' + pass + ' 通过 / ' + fail + ' 失败');
process.exitCode = fail ? 1 : 0;

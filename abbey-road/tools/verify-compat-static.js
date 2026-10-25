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


/* ═══════════ 13. 任务模块的样式与入口（v0.4.2 补） ═══════════ */
{
  const css = fs.readFileSync(path.join(appDir, 'css/app.css'), 'utf8');
  const ui = fs.readFileSync(path.join(appDir, 'js/ui.js'), 'utf8');
  const panels = fs.readFileSync(path.join(appDir, 'js/panels.js'), 'utf8');

  /* 卡片必须和全项目统一的模块外壳 .hw-card 一致（描边 + 底色 + 圆角） */
  const shell = (sel) => {
    const m = new RegExp('(?:^|\\n)\\s*\\' + sel + '\\s*\\{[^}]*\\}').exec(css);
    return m ? m[0] : '';
  };
  const hw = shell('.hw-card');
  ['tk-card', 'tk-mine-card', 'tk-sumcard', 'tk-tcard', 'tk-empty-card'].forEach((sel) => {
    const v = shell('.' + sel);
    ok('C30 卡 .' + sel + ' 与 .hw-card 同样有高光描边',
      v.indexOf('--glass-stroke') >= 0, v ? '有' : '没找到规则');
    ok('C31 卡 .' + sel + ' 底色用 glass-surface（不是更暗的 glass-card）',
      v.indexOf('--glass-surface') >= 0 && v.indexOf('--glass-card') < 0);
  });
  ok('C32 .hw-card 参照本身含描边与 glass-surface',
    hw.indexOf('--glass-stroke') >= 0 && hw.indexOf('--glass-surface') >= 0);

  /* 类名撞车：.tk-bar 不能既做条目色条又做柱状图 */
  const barRules = (css.match(/(?:^|\n)\s*\.tk-bar\s*\{[^}]*\}/g) || []);
  ok('C33 .tk-bar 只有一条规则（条目左侧色条），不与柱状图撞车',
    barRules.length === 1 && barRules[0].indexOf('width: 3px') >= 0,
    '规则数=' + barRules.length);
  ok('C34 柱状图用独立的 .tk-cbar 类', css.indexOf('.tk-cbar') >= 0 && ui.indexOf('tk-cbar') >= 0);

  /* 设置里必须能管理「任务」，不能只剩长期任务 */
  ok('C35 设置里注册了任务管理面板', /panels: \[panelWork, panelTasks/.test(panels));
  ok('C35b 设置里已移除「长期任务」面板（任务已统一）',
    panels.indexOf('panelTasks, panelLongTasks') < 0 && !/panels: \[[^\]]*panelLongTasks/.test(panels));
  ok('C36 设置里的任务清单能增删改（+1 / 编辑 / 删除）',
    panels.indexOf('function renderTaskList') >= 0 &&
    panels.indexOf('todoAddEntry') >= 0 && panels.indexOf('todoRemove') >= 0);
  ok('C37 面板已导出给保存后局部刷新用', panels.indexOf('renderTaskList: renderTaskList') >= 0);

  /* 划动效果与「划掉」提示对齐作业 */
  /**
   * v0.5 改：任务条目**不再 flyOut**。
   * 已达标后再划会弹「再记一次」确认框（openModal 会过滤掉「取消」），
   * 若先把行飞出去（opacity 0）再弹框，用户点 ✕/遮罩取消后没有任何 refresh，
   * 这一行会永久停在不可见状态（仍占布局位）。所以改成先滑回原位再处置。
   * 作业 / 速记条目没有这个二次确认，保持 flyOut 不变。
   */
  ok('C38 任务条目划动不 flyOut（二次确认前必须滑回原位）',
    /bindSwipeRow\(row, \{ flyOut: false, onCommit: function \(\) \{ tkPunch\(t\); \} \}\)/.test(ui));
  ok('C38b 作业与速记条目仍然 flyOut（划掉手感不变）',
    (ui.match(/bindSwipeRow\(\w+, \{\s*flyOut: true,/g) || []).length >= 2);
  const tkHint = /(?:^|\n)\s*\.tk-hint \{[^}]*\}/.exec(css);
  const hwHint = /\.hw-swipe-hint \{[^}]*\}/.exec(css);
  ok('C39 「划掉」提示与作业同款（绝对定位右侧 + 主题色 + 平时透明）',
    !!tkHint && !!hwHint &&
    tkHint[0].indexOf('position: absolute') >= 0 &&
    tkHint[0].indexOf('var(--accent)') >= 0 &&
    tkHint[0].indexOf('opacity: 0') >= 0);
  ok('C40 划动达标态与作业一致（划动 .85 / 达标加粗）',
    css.indexOf('.tk-row.swiping .tk-hint { opacity: .85; }') >= 0 &&
    css.indexOf('.tk-row.swipe-ok .tk-hint { opacity: 1; font-weight: 600; }') >= 0);
}


/* ═══════════ 14. 导入必须立刻迁移 + 模块卡间距（v0.4.2 补） ═══════════ */
{
  const core = fs.readFileSync(path.join(appDir, 'js/core.js'), 'utf8');
  const cio = fs.readFileSync(path.join(appDir, 'js/configio.js'), 'utf8');
  const css2 = fs.readFileSync(path.join(appDir, 'css/app.css'), 'utf8');

  /* 导入走 mergePayload → applyMerge，不走 load()；迁移必须在这里显式跑，
     否则导入老配置后老「长期任务」不会被并进「任务」，而且不重启就永远不转。 */
  const ci = cio.replace(/\/\*[\s\S]*?\*\//g, ' ');
  ok('C41 mergePayload 里显式调用了迁移', ci.indexOf('migrateNow') >= 0);
  ok('C42 core 导出了 migrateNow', core.indexOf('migrateNow: migrateNow') >= 0);
  ok('C43 migrateNow 会归档老 longTasks（复用同一迁移函数）',
    /function migrateNow\(\)[\s\S]{0,400}migrateLongTasksIntoToDos/.test(core));

  /* 「我的」是 flex 纵向布局，卡片间距靠 margin-top（.hw-card 就是这套）；
     任务大卡必须并入同一套，否则会贴住/叠在别的模块卡上。 */
  ok('C44 任务大卡并入 .custom-modules 的 margin-top 间距机制',
    /\.custom-modules \.tk-mine-card \{[^}]*margin-top: 10px/.test(css2));
  ok('C45 任务大卡作为首张时上间距归零（与 .hw-card 一致）',
    /\.custom-modules \.tk-mine-card:first-child \{[^}]*margin-top: 0/.test(css2));
  ok('C46 任务大卡自带 margin-top（任何容器里都不会贴住上一张）',
    /(?:^|\n)\s*\.tk-mine-card \{[^}]*margin-top: 10px/.test(css2));
}


/* ═══════════ 15. 「我的」任务条目的按钮与展开动画（v0.4.4 补） ═══════════ */
{
  const ui2 = fs.readFileSync(path.join(appDir, 'js/ui.js'), 'utf8');
  const css3 = fs.readFileSync(path.join(appDir, 'css/app.css'), 'utf8');

  /* 按钮要显眼：编辑按钮走主题色（描边 + 淡底），不是原来的灰底小按钮 */
  ok('C47 编辑按钮用主题色描边 + 淡底（醒目）',
    /(?:^|\n)\s*\.tk-edit-btn \{[^}]*border: 1px solid var\(--accent\)[^}]*background: var\(--accent-soft\)/.test(css3));
  ok('C48 展开按钮是带底色的胶囊，且展开时高亮 + 箭头旋转',
    /\.tk-exp-btn \{[^}]*border-radius: 999px/.test(css3) &&
    /\.tk-exp-btn\.open \{[^}]*var\(--accent\)/.test(css3) &&
    /\.tk-exp-btn\.open i \{[^}]*rotate\(90deg\)/.test(css3));
  ok('C49 展开按钮带「展开/收起」文字',
    ui2.indexOf("(open ? '收起' : '展开')") >= 0);
  ok('C50 展开按钮可点（与点标题行同效）',
    ui2.indexOf("line.querySelector('.tk-exp-btn')") >= 0);

  /* 展开动画：JS 触发 + CSS 兜底，两条都要有 */
  ok('C51 展开时触发动画（tkAnimateExpand）',
    /tkAnimateExpand\(body\)/.test(ui2) && ui2.indexOf('function tkAnimateExpand') >= 0);
  ok('C52 展开动画有 CSS 兜底（老 WebView 也生效）',
    /\.tk-t2body\.tk-expand \{[^}]*animation: tkExpandIn/.test(css3) &&
    css3.indexOf('@keyframes tkExpandIn') >= 0 &&
    css3.indexOf('@keyframes tkFadeUp') >= 0);
  ok('C53 展开动画尊重 reduce-motion 与性能模式',
    /\.tk-t2body\.tk-expand, \.tk-t2body\.tk-expand > \* \{ animation: none !important; \}/.test(css3) &&
    /body\[data-perf\] \.tk-t2body\.tk-expand/.test(css3));
}


/* ═══════════ 16. 最近记录的展开口径与编辑页记录（v0.4.2 补） ═══════════ */
{
  const ui3 = fs.readFileSync(path.join(appDir, 'js/ui.js'), 'utf8');
  const css4 = fs.readFileSync(path.join(appDir, 'css/app.css'), 'utf8');

  /* 点开展开时，「最近记录」要一起展开；收起时才折叠。
     两条展开路径（标题行 / 展开按钮）都得处理。 */
  /* 「展开」现在打开详情弹窗，卡内不再内联展开 */
  ok('C54 条目「展开」调用 openTaskDetail', /openTaskDetail\(t\)/.test(ui3));
  ok('C55 卡内内联展开区已移除（tk-t2body 不再出现）', ui3.indexOf('tk-t2body') < 0);

  /* 编辑页也能看最近记录 */
  ok('C56 任务编辑页显示最近记录', ui3.indexOf('tk-edit-recs') >= 0 && ui3.indexOf('paintRecs') >= 0);
  ok('C57 编辑页记录区可逐笔撤销', /tkRecList\(cur\)/.test(ui3) && /todoRemoveEntry\(cur\.id/.test(ui3));
  ok('C58 编辑页记录区有样式', css4.indexOf('.tk-edit-recs') >= 0);
}


/* ═══════════ 17. v0.4.3 收尾项 ═══════════ */
{
  const core2 = fs.readFileSync(path.join(appDir, 'js/core.js'), 'utf8');
  const ui4 = fs.readFileSync(path.join(appDir, 'js/ui.js'), 'utf8');
  const panels4 = fs.readFileSync(path.join(appDir, 'js/panels.js'), 'utf8');
  const css5 = fs.readFileSync(path.join(appDir, 'css/app.css'), 'utf8');

  /* 长期任务残留：清单里不该再有 longterm，且有老配置迁移 */
  ok('C59 模块清单已删掉 longterm', ui4.indexOf("{ k: 'longterm'") < 0);
  ok('C60 默认模块不再含 longterm', ui4.indexOf("'homework', 'longterm'") < 0);
  ok('C61 有「我的」模块清单迁移（longterm → tasks）',
    core2.indexOf('function migrateCustomModules') >= 0 && /migrateCustomModules\(s\)/.test(core2));

  /* 周期词：每隔 N 天走「本周」 */
  ok('C62 周期词按计划类型给「今天/本周」', ui4.indexOf('function tkPeriodInfo') >= 0 && ui4.indexOf('function tkPeriodText') >= 0);
  ok('C63 core 提供周维度计算（everyN → 本周 n 次）',
    core2.indexOf('function todoWeekGoal') >= 0 && core2.indexOf('function todoWeekDone') >= 0);
  ok('C64 weekly 不逐天累加（有特判）', /if \(c\.type === 'weekly'\) \{ return c\.times \|\| 1; \}/.test(core2));

  /* 目标滑块 */
  ok('C65 编辑页目标用滑块（两档 .segmented）',
    ui4.indexOf('data-segkey="tk-edit-goal"') >= 0 && ui4.indexOf("'不做目标'") >= 0 && ui4.indexOf("'设置总目标'") >= 0);
  ok('C66 目标旧按钮已移除', ui4.indexOf('tkGoalToggle') < 0);

  /* 学期关键时间点 */
  ok('C67 core 有关键时间点 API（增删改 + daysUntil）',
    core2.indexOf('function semesterKeyDates') >= 0 && core2.indexOf('function semesterKeyDateUpsert') >= 0 &&
    core2.indexOf('function semesterKeyDateRemove') >= 0 && core2.indexOf('function daysUntil') >= 0);
  ok('C68 设置 → 课程与课表 注册了「关键时间点」面板',
    /panels: \[panelSchedule, panelKeyDates/.test(panels4));
  ok('C69 学期进度卡片会显示关键时间点', ui4.indexOf('cm-sem-kd') >= 0);

  /* 日程：卡底两个按钮 + 总览 A/B */
  ok('C70 日程模块卡底有「日程总览」与「添加日程」',
    ui4.indexOf('function openAgendaOverview') >= 0 && ui4.indexOf('日程总览') >= 0 &&
    /tk-fbtn tk-fbtn-p" type="button">＋ 添加日程/.test(ui4));
  ok('C71 日程总览有月视图 + 时间轴（滑块切换）',
    ui4.indexOf('function agvMonthView') >= 0 && ui4.indexOf('function agvTimeline') >= 0 &&
    ui4.indexOf("data-segkey=\"agv-tab\"") >= 0 &&
    ui4.indexOf("'月视图'") >= 0 && ui4.indexOf("'时间轴'") >= 0);
  ok('C72 顶部那颗「添加日程」chip 已移除（只剩卡底那颗）',
    ui4.indexOf('margin:2px 2px 8px">＋ 添加日程') < 0);
}


/* ═══════════ 18. 文案与窄屏排版（v0.4.3 补） ═══════════ */
{
  const ui5 = fs.readFileSync(path.join(appDir, 'js/ui.js'), 'utf8');
  const css6 = fs.readFileSync(path.join(appDir, 'css/app.css'), 'utf8');

  /* 「每隔 N 天」统一成「每 N 天」 */
  ok('C73 计划文案用「每 N 天」（不再有「每隔」）',
    ui5.indexOf('每 N 天') >= 0 && ui5.indexOf('每隔') < 0);

  /* 「已完成」名称在窄屏不被挤没：最小宽度 + 可换行 */
  ok('C74 已完成行的名称有最小宽度（窄屏不会被挤成 0）',
    /(?:^|\n)\s*\.tk-done \.tk-dtext \{[^}]*min-width: 7em/.test(css6));
  ok('C75 已完成行可换行（放不下时尾部整组换行）',
    /(?:^|\n)\s*\.tk-done \{[^}]*flex-wrap: wrap/.test(css6) &&
    /\.tk-done \.tk-dtail \{[^}]*flex: 0 0 auto/.test(css6));
  ok('C76 已完成行尾部已拆成 .tk-dtail', ui5.indexOf('tk-dtail') >= 0);

  /* 卡底按钮不能压住 .hw-card 的圆角边框 */
  ok('C77 .hw-card 里的卡底按钮有下外边距（不压边框）',
    css6.indexOf('.hw-card > .tk-foot') >= 0);

  /* 月历条点阵：星期表头 + 数字与点上下分行 */
  ok('C78 月历条有点阵的星期表头', ui5.indexOf('agv-wk') >= 0 && css6.indexOf('.agv-wk') >= 0);
  ok('C79 月历格子是竖排（数字在上、点在下），点不再绝对定位压数字',
    /\.agv-gd \{[^}]*flex-direction: column/.test(css6) &&
    css6.indexOf('.agv-pks') >= 0 && css6.indexOf('.agv-pk {') < 0);
}


/* ═══════════ 19. 月视图（一次一个月 + 点天筛时间轴） ═══════════ */
{
  const ui6 = fs.readFileSync(path.join(appDir, 'js/ui.js'), 'utf8');
  const css7 = fs.readFileSync(path.join(appDir, 'css/app.css'), 'utf8');

  ok('C80 月视图一次只画一个月（有 ‹ › 切月）',
    /function agvMonthView\(byDay, todayK, ym, selDay\)/.test(ui6) &&
    ui6.indexOf('data-nav') >= 0 && ui6.indexOf('AGV_MONTH') >= 0);
  ok('C81 月视图有星期表头', ui6.indexOf('agv-wk') >= 0 && css7.indexOf('.agv-wk') >= 0);
  ok('C82 格子自适应列宽（1fr）不靠横向滚动',
    /\.agv-grid \{[^}]*repeat\(7, 1fr\)/.test(css7) && css7.indexOf('.agv-strip') < 0);
  ok('C83 事件点不再绝对定位（数字与点上下分行）',
    /\.agv-gd \{[^}]*flex-direction: column/.test(css7) &&
    /\.agv-gd \.agv-pks \{/.test(css7) && css7.indexOf('.agv-pk {') < 0);
  ok('C84 点某一天会切到时间轴并按那天筛（带清除）',
    ui6.indexOf('AGV_DAY') >= 0 && ui6.indexOf('data-clear') >= 0 && ui6.indexOf('agv-chip') >= 0);
}


/* ═══════════ 20. 撤回可用 / 记几次 / 色盘 / 速记重构 ═══════════ */
{
  const core7 = fs.readFileSync(path.join(appDir, 'js/core.js'), 'utf8');
  const ui7 = fs.readFileSync(path.join(appDir, 'js/ui.js'), 'utf8');
  const panels7 = fs.readFileSync(path.join(appDir, 'js/panels.js'), 'utf8');
  const css8 = fs.readFileSync(path.join(appDir, 'css/app.css'), 'utf8');

  /* 撤回按钮：toast-host 是 pointer-events:none，带按钮的那条必须开回来 */
  ok('C85 带「撤销」的气泡能点（pointer-events 开回来）',
    /\.toast-host \{[^}]*pointer-events: none/.test(css8) &&
    /\.toast-undo \{ pointer-events: auto; \}/.test(css8));

  /* 记几次：只留自定义输入、支持小数、在最近记录之前 */
  ok('C86 只有自定义次数输入（快捷 +1/+2 按钮已去掉）',
    ui7.indexOf('function tkCountInput') >= 0 &&
    ui7.indexOf("inputmode=\"decimal\"") >= 0 &&
    ui7.indexOf("data-add") < 0);
  ok('C87 手动添加的按钮文案跟单位走（有单位显示单位，无单位显示次）',
    ui7.indexOf("var word = hasUnit ? unit : '次';") >= 0 &&
    ui7.indexOf("btn.textContent = '记 ' + txt + ' ' + word") >= 0);
  ok('C88 次数输入在最近记录之前（编辑页与详情弹窗都插在记录标题前）',
    ui7.indexOf('tkCountInput(src,') >= 0 && ui7.indexOf('tkCountInput(cur,') >= 0);
  ok('C89 底部小字提示左右划都 +N（数字跟着设置变）',
    /\.tk-count-tip/.test(css8) &&
    ui7.indexOf('往左划或往右划都可以 +') >= 0);
  ok('C90 最近记录按单位显示（+1.6 小时 / +1 次）',
    ui7.indexOf('function amtText') >= 0 && ui7.indexOf('amtText(byDay[k])') >= 0);

  /* 色盘三处 */
  ok('C91 任务编辑 / 日程类型 / 主题色 都能打开色盘',
    (ui7.match(/openColorPicker\(/g) || []).length >= 6 &&
    panels7.indexOf('AR.UI.openColorPicker') >= 0 &&
    ui7.indexOf('打开色盘') >= 0 && panels7.indexOf('打开色盘') >= 0);

  /* 速记重构：照作业 */
  ok('C92 速记右滑划掉（作业同款 .hw-row + 划掉提示）',
    ui7.indexOf('function qtRow') >= 0 &&
    /class=\"hw-row\" data-id/.test(ui7) && ui7.indexOf('hw-swipe-hint') >= 0);
  ok('C93 速记有「已完成」折叠分组（长按找回）',
    ui7.indexOf('function qtDoneRow') >= 0 && ui7.indexOf('hw-done-head') >= 0 &&
    ui7.indexOf('长按找回') >= 0);
  ok('C94 速记「我的」里有清掉已完成；今日日程里不渲染卡底',
    /清掉已完成/.test(ui7) && /if \(!opts\.inToday\) \{/.test(ui7) &&
    ui7.indexOf('＋ 新建速记') < 0);
  ok('C95 速记不再用圆圈/✕ 那套老写法',
    ui7.indexOf('cm-todo-check') < 0 && ui7.indexOf('cm-todo-row') < 0);

  /* 设置开关 + 数据同步 */
  ok('C96 设置里有「在今日日程显示待办速记」开关，且读取同一个键',
    panels7.indexOf('showQuickTodoInToday') < 0 &&
    panels7.indexOf('quickTodo') >= 0 && panels7.indexOf('inToday') >= 0 &&
    /sc\.quickTodo && sc\.quickTodo\.inToday === true/.test(ui7));
  ok('C97 今日日程会在开关打开时挂速记卡',
    (ui7.match(/appendChild\(qtTodayCard\(\)\)/g) || []).length >= 3 &&
    ui7.indexOf('function qtInToday') >= 0);
  ok('C98 速记纳入合并表（否则导入配置会丢）',
    /MERGE_TABLES = \[[^\]]*'quickTodos'/.test(core7) &&
    /table === 'quickTodos'/.test(core7));

  /* 新 API 已导出 */
  ok('C99 core 导出速记的增改与勾选',
    core7.indexOf('quickTodoUpsert: quickTodoUpsert') >= 0 &&
    core7.indexOf('quickTodoToggle: quickTodoToggle') >= 0);
}


/* ═══════════ 21. 手动添加 / 滑动一次算几次 / 引导重做 ═══════════ */
{
  const core8 = fs.readFileSync(path.join(appDir, 'js/core.js'), 'utf8');
  const ui8 = fs.readFileSync(path.join(appDir, 'js/ui.js'), 'utf8');
  const panels8 = fs.readFileSync(path.join(appDir, 'js/panels.js'), 'utf8');
  const css9 = fs.readFileSync(path.join(appDir, 'css/app.css'), 'utf8');

  ok('C100 「记几次」已改名为「手动添加」',
    ui8.indexOf('手动添加') >= 0 && ui8.indexOf('记几次') < 0);
  ok('C101 可编辑「滑动一次算几次」，默认 1 并写进任务',
    ui8.indexOf('滑动一次算几次') >= 0 && ui8.indexOf('function tkSwipeTimes') >= 0 &&
    /swipeTimes: n/.test(ui8) && /todoUpsert\(\{ id: cur\.id, swipeTimes/.test(ui8) &&
    core8.indexOf("'swipeTimes'") >= 0);
  ok('C102 滑动按 N 记（不再写死 1）',
    /AR\.Store\.todoAddEntry\(t\.id, n, ''/.test(ui8) &&
    ui8.indexOf("'<span class=\"tk-hint\">+' + tkSwipeTimes(t) + '</span>") >= 0);
  ok('C103 步进器有样式', css9.indexOf('.tk-swipe-row') >= 0 && css9.indexOf('.tk-step') >= 0);

  /* 引导重做 */
  ok('C104 引导改成 7 步', /var OB_STEPS = 7;/.test(panels8));
  ok('C105 引导第 2 步讲「导入 / 我的」而不是旧的四入口',
    panels8.indexOf('导入 / 我的') >= 0);
  ok('C106 引导新增「任务与打卡」一步（含左右划与滑动次数）',
    panels8.indexOf('任务与打卡') >= 0 && panels8.indexOf('往左划或往右划都可以') >= 0 &&
    panels8.indexOf('滑动一次算几次') >= 0);
  ok('C107 引导末尾提到我的模块 / 日程总览 / 关键时间点 / 色盘',
    panels8.indexOf('我的模块') >= 0 && panels8.indexOf('日程总览') >= 0 &&
    panels8.indexOf('关键时间点') >= 0 && panels8.indexOf('色盘') >= 0);
  ok('C108 引导不再提「导入 → 手动添加」登记考试（已并入日程类型）',
    panels8.indexOf('在「导入 → 手动添加」登记') < 0);
}


/* ═══════════ 22. 速记添加样式 / 今日日程干净 / 设置顺序 / 引导 ═══════════ */
{
  const ui9 = fs.readFileSync(path.join(appDir, 'js/ui.js'), 'utf8');
  const panels9 = fs.readFileSync(path.join(appDir, 'js/panels.js'), 'utf8');

  ok('C109 速记添加恢复成原来的内联输入框样式',
    ui9.indexOf('class=\"cm-todo-add\"') >= 0 && ui9.indexOf('id=\"qtAdd\"') >= 0 &&
    ui9.indexOf('id=\"qtText\"') >= 0);
  ok('C110 今日日程里的速记不显示卡底按钮（传给 qtCard 的 inToday 标记）',
    ui9.indexOf('inToday: true') >= 0);
  ok('C111 设置里「待办速记」块挪到「作业与日程」面板最下面',
    (function () {
      var iQt = panels9.indexOf('待办速记是否进今日日程');
      var iRet = panels9.indexOf("return panel('作业与日程'");
      return iQt > 0 && iRet > iQt && (iRet - iQt) < 900;
    })());
  ok('C112 引导 7 步且新增「任务与打卡」', /var OB_STEPS = 7;/.test(panels9) && panels9.indexOf('任务与打卡') >= 0);
  ok('C113 引导讲了左右划都可以、滑动次数、手动添加小数',
    panels9.indexOf('往左划或往右划都可以') >= 0 && panels9.indexOf('滑动一次算几次') >= 0 &&
    panels9.indexOf('手动添加') >= 0);
}

/* ── C114+：v0.5 这一轮的契约（课前提醒真实现 / 宽屏设置 / 一批修复）──
   这些断言的目的不是"代码长什么样"，而是钉住"功能真的接上了"，
   因为上一轮的假功能就是"开关有、实现没有"，静态断言能防它复发。 */
{
  const root5 = path.join(__dirname, '..');
  const idx5 = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
  const ui5 = fs.readFileSync(path.join(appDir, 'js/ui.js'), 'utf8');
  const panels5 = fs.readFileSync(path.join(appDir, 'js/panels.js'), 'utf8');
  const bridge5 = fs.readFileSync(path.join(appDir, 'js/bridge.js'), 'utf8');
  const css5 = fs.readFileSync(path.join(appDir, 'css/app.css'), 'utf8');
  const remindJs = fs.readFileSync(path.join(appDir, 'js/reminders.js'), 'utf8');

  /* 网页侧：提醒模块存在、在 ui.js 之前加载、桥已暴露 */
  ok('C114 reminders.js 存在且在 ui.js 之前加载',
    idx5.indexOf('js/reminders.js') >= 0 && idx5.indexOf('js/reminders.js') < idx5.indexOf('js/ui.js'));
  ok('C115 桥暴露了 scheduleReminders / cancelReminders / requestNotificationPermission',
    bridge5.indexOf('scheduleReminders: scheduleReminders') >= 0 &&
    bridge5.indexOf('cancelReminders: cancelReminders') >= 0 &&
    bridge5.indexOf('requestNotificationPermission: requestNotificationPermission') >= 0);
  ok('C116 AR.Reminders 会算出提醒并整批下发（含 7 天范围与去抖）',
    remindJs.indexOf('AR.Reminders') >= 0 && remindJs.indexOf('scheduleReminders') >= 0 &&
    /DAYS_AHEAD\s*=\s*7/.test(remindJs) && remindJs.indexOf('setTimeout') >= 0);
  ok('C117 设置页开关真的排/取消提醒（不再是只写布尔）',
    panels5.indexOf('AR.Reminders.enable()') >= 0 && panels5.indexOf('AR.Reminders.cancel()') >= 0);
  ok('C118 「修改提醒」与回前台都会重排',
    ui5.indexOf('AR.Reminders.enable()') >= 0 && ui5.indexOf('AR.Reminders.sync()') >= 0);
  /* Android 侧：通知渠道/闹钟/权限请求必须真的存在。
     分工：渠道与发通知在 ReminderReceiver，AlarmManager 排程在 ReminderScheduler。 */
  const schedPath = path.join(root5, 'android/src/com/etoilezzz/allegro/ReminderScheduler.java');
  const recvPath = path.join(root5, 'android/src/com/etoilezzz/allegro/ReminderReceiver.java');
  const hasSched = fs.existsSync(schedPath);
  const hasRecv = fs.existsSync(recvPath);
  const schedSrc = hasSched ? fs.readFileSync(schedPath, 'utf8') : '';
  const recvSrc = hasRecv ? fs.readFileSync(recvPath, 'utf8') : '';
  const bothAndroid = schedSrc + recvSrc;
  ok('C119 Android 侧真的有通知实现（渠道 + AlarmManager + receiver）',
    hasSched && hasRecv &&
    bothAndroid.indexOf('NotificationChannel') >= 0 &&
    bothAndroid.indexOf('class_reminders') >= 0 &&
    bothAndroid.indexOf('AlarmManager') >= 0 &&
    recvSrc.indexOf('BroadcastReceiver') >= 0 &&
    schedSrc.indexOf('setExactAndAllowWhileIdle') >= 0);

  /* 宽屏设置页：不再被多列网格拆成左右两半 */
  ok('C120 设置页根栅格改成单列（不再 auto-fill 拆栏）',
    /\.settings-body \.settings-grid \{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(css5));
  ok('C121 宽屏断点存在且放宽了设置页宽度',
    /@media \(min-width: 900px\)/.test(css5) && /\.settings-body \{[^}]*max-width:\s*11\d\dpx/.test(css5));
  ok('C122 .settings-nav 死规则已清掉（只在注释里）',
    !/(?:^|\n)\s*\.settings-nav\s*\{/.test(css5));

  /* 其余本轮修复的静态契约 */
  ok('C123 :focus-visible 不再改元素圆角',
    !/:focus-visible \{[^}]*border-radius/.test(css5));
  ok('C124 搜索命中行用专用 .hit-go（不再复用 .set-cat-go）',
    css5.indexOf('.hit-go') >= 0 && panels5.indexOf('class="set-cat-go"') < 0 ||
    (css5.indexOf('.hit-go') >= 0 && panels5.indexOf('hit-go') >= 0));
  ok('C125 暗色 + 流畅模式下贡献图不再被 !important 刷成亮色',
    !/body\[data-perf\] \.tk-gh-cell[^{]*\{[^}]*!important/.test(css5));

  /* ── 云同步（v0.4.6）───────────────────────────────────────── */
  const syncSrc = fs.readFileSync(path.join(appDir, 'js/sync.js'), 'utf8');
  const coreSync = fs.readFileSync(path.join(appDir, 'js/core.js'), 'utf8');
  const htmlSync = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
  const uiSync = fs.readFileSync(path.join(appDir, 'js/ui.js'), 'utf8');
  const panelsSync = fs.readFileSync(path.join(appDir, 'js/panels.js'), 'utf8');
  const workerSrc = fs.readFileSync(path.join(root5, 'tools/cloudflare/worker.js'), 'utf8');

  ok('C130 sync.js 在 ui.js 之前加载', htmlSync.indexOf('js/sync.js') > 0
    && htmlSync.indexOf('js/sync.js') < htmlSync.indexOf('js/ui.js'));
  ok('C131 设置页注册了「云同步」面板', panelsSync.indexOf('panelSync, panelCloudSync, panelIntegration') >= 0);
  ok('C132 本地存盘后会通知同步（core.save 挂钩）', coreSync.indexOf('AR.Sync.onLocalSave') >= 0);
  ok('C133 回到前台会按频率自动同步', uiSync.indexOf('AR.Sync.maybeAuto') >= 0);
  ok('C134 合并过程有防递归闸门（applying）', syncSrc.indexOf('if (applying) { return; }') >= 0);
  ok('C135 用 AES-256-GCM + PBKDF2 310k，且 AAD 绑版本号',
    syncSrc.indexOf("name: 'AES-GCM'") >= 0
    && syncSrc.indexOf('310000') >= 0
    && syncSrc.indexOf("AAD_PREFIX + rev") >= 0);
  ok('C136 服务端 CORS 白名单与 App 的 origin 一致（abbeyroad.local）',
    workerSrc.indexOf("const ALLOWED_ORIGIN = 'https://abbeyroad.local'") >= 0
    && fs.readFileSync(path.join(root5, 'windows/src/AppPaths.cs'), 'utf8').indexOf('abbeyroad.local') >= 0);
  ok('C137 planMerge 已导出（同步要精确计数）', coreSync.indexOf('planMerge: planMerge') >= 0);
  ok('C138 仓库地址正确（没有 Allegro----ScheduleApp 这种改名残留）',
    panelsSync.indexOf('EtoileZzz/Allegro') >= 0 && panelsSync.indexOf('----ScheduleApp') < 0);
  ok('C139 未连接时也能看到「自动同步」（两种状态都渲染）',
    (panelsSync.match(/appendAutoSync\(\);/g) || []).length >= 2);
  const bootSync = fs.readFileSync(path.join(appDir, 'js/boot.js'), 'utf8');
  ok('C146 打卡记录用自分时间戳合并（否则删除/撤销同步不出去）',
    coreSync.indexOf('function entryStamp') >= 0 && coreSync.indexOf('entryStamp(e) > entryStamp(out[at])') >= 0);
  ok('C147 删除/撤销打卡都会写条目自己的 updatedAt',
    (coreSync.match(/t\.entries\[i\]\.updatedAt = /g) || []).length >= 3);
  ok('C148 恢复时间严格晚于删除时间（同毫秒 +1ms）',
    coreSync.indexOf('function stampAfter') >= 0 && coreSync.indexOf('stampAfter(rec.deletedAt)') >= 0);
  ok('C142 冷启动会按频率自动同步（不只挂在回前台）',
    bootSync.indexOf('AR.Sync.maybeAuto') >= 0);
  ok('C143 自动同步有「每次改动后」模式，且是一排直接可见的按钮（不再是下拉框）',
    panelsSync.indexOf("{ v: 'every', t: '每次改动后' }") >= 0
    && syncSrc.indexOf('DEBOUNCE_FAST_MS') >= 0
    && panelsSync.indexOf('<select class="input" id="syAuto">') < 0);
  ok('C144 每次同步（含自动）都会提示一次',
    /AR\.UI\.toast\(msg\)/.test(syncSrc) && syncSrc.indexOf('已同步 · 云端 rev') >= 0);
  ok('C145 云端只保留 1 份当前 + 20 版历史（不会无限增长）',
    workerSrc.indexOf('HISTORY_KEEP = 20') >= 0);
  ok('C141 「数据与同步」的显式面板清单里包含云同步（否则永远不显示）',
    panelsSync.indexOf('SYNC_PANELS = [panelSync, panelCloudSync') >= 0);
  ok('C140 还没发过 Release（404）时不报「检查更新失败」',
    panelsSync.indexOf('r.status === 404') >= 0 && panelsSync.indexOf('还没有发布过版本') >= 0);
  /* 回收站必须收「统一任务」：删除任务走 softDelete('tasks2')，界面上承诺过可恢复 */
  const core5 = fs.readFileSync(path.join(appDir, 'js/core.js'), 'utf8');
  ok('C126 回收站清单包含统一任务（tasks2）',
    core5.indexOf("collect('tasks2', '任务'") >= 0);
  const entsArrays = (core5.match(/var ents = \['events'[^\]]*\]/g) || []);
  ok('C127 清空/按期限清理两张名单都含 tasks2',
    entsArrays.length >= 2 && entsArrays.every((a) => a.indexOf("'tasks2'") >= 0),
    '实际 ' + entsArrays.length + ' 处：' + entsArrays.join(' | ').slice(0, 120));
  ok('C128 打卡记录能单独恢复（restore 支持 taskEntries）',
    core5.indexOf("entity === 'taskEntries'") >= 0);
  ok('C129 大资源走流式（不再把每个资源整读进内存）',
    fs.readFileSync(path.join(root5, 'android/src/com/etoilezzz/allegro/MainActivity.java'), 'utf8')
      .indexOf('getAssets().openFd') >= 0);
}

console.log('\n合计：' + pass + ' 通过 / ' + fail + ' 失败');
process.exitCode = fail ? 1 : 0;


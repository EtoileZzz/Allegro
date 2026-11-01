/* ──────────────────────────────────────────────────────────────
   Allegro · 提醒调度（真实系统通知）

   v0.5.1 起支持四类提醒，合并成一个数组下发，原生不关心来源：
     ① 课程提醒    —— 每门课可单独设提前量（-1 = 关闭）
     ② 每日定时    —— 每天 1~4 个时间点，汇总今天还差多少
     ③ 任务专属    —— 某个任务单独的时间点（单任务卡）
     ④ 作业到期    —— 旧作业条目（带日期）到期前 N 小时

   分工：
     · 本文件只做纯计算 + 一次下发给 AR.Bridge.scheduleReminders
     · 原生侧负责权限、渠道、闹钟、点开跳转
     · 排程范围：未来 7 天（重启后系统清空闹钟，开机广播会重新拉起）

   注意：只有 Android 才有这套桥；Windows / 纯网页静默跳过。
   ────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  var DAYS_AHEAD = 7;
  var DEBOUNCE_MS = 600;
  var MAX_ENTRIES = 512;
  var MIN_LEAD_MS = 30 * 1000;
  var MAX_DAILY_TIMES = 4;
  var DEFAULT_DUE_HOURS = 24;

  var timer = null;
  var lastResult = '';        // 上一次 scheduleReminders 的原生返回值
  var lastResultAt = 0;
  var tickTimer = null;            // Windows：前台轮询（Android 用系统闹钟，不需要）
  var FIRED_KEY = 'allegro.reminders.fired.v1';
  var FIRED_KEEP_MS = 3 * 86400000;

  /** 读「已弹过」的记录（只留最近 3 天，防存档无限涨） */
  function loadFired() {
    try {
      var raw = localStorage.getItem(FIRED_KEY);
      var o = raw ? JSON.parse(raw) : {};
      var now = Date.now();
      var cut = now - FIRED_KEEP_MS;
      var out = {};
      for (var k in o) {
        if (Object.prototype.hasOwnProperty.call(o, k) && Number(o[k]) > cut) { out[k] = Number(o[k]); }
      }
      return out;
    } catch (e) { return {}; }
  }
  function saveFired(o) {
    try { localStorage.setItem(FIRED_KEY, JSON.stringify(o)); } catch (e) { }
  }

  function notifSettings() {
    try {
      var s = AR.Store.get();
      return (s && s.settings && s.settings.notifications) || {};
    } catch (e) { return {}; }
  }

  function enabled() { return notifSettings().enabled === true; }

  function dailyCfg() {
    try {
      if (AR.Store.notifDaily) { return AR.Store.notifDaily(); }
    } catch (e) { }
    return { enabled: false, times: [], mode: 'pending', skipWhenDone: true, includeEvents: true, weekdaysOnly: false };
  }

  function anyEnabled() { return enabled() || dailyCfg().enabled; }

  function leadMinutes() {
    var n = Number(notifSettings().defaultOffset);
    if (!isFinite(n) || n <= 0) { return 15; }
    return Math.max(5, Math.min(60, Math.round(n)));
  }

  /** 'HH:MM' → 当天 epoch 毫秒；解析失败返回 0 */
  function msOf(day, hm) {
    if (!day || !hm) { return 0; }
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hm));
    if (!m) { return 0; }
    var h = Number(m[1]), mi = Number(m[2]);
    if (!isFinite(h) || !isFinite(mi) || h > 23 || mi > 59) { return 0; }
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, mi, 0, 0).getTime();
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  /** 时间点规范化：去重、排序、最多 MAX_DAILY_TIMES 个 */
  function normTimes(list) {
    var out = [], seen = {};
    var arr = Array.isArray(list) ? list : [];
    for (var i = 0; i < arr.length; i++) {
      var m = /^(\d{1,2}):(\d{2})$/.exec(String(arr[i] || ''));
      if (!m) { continue; }
      var h = Number(m[1]), mi = Number(m[2]);
      if (!isFinite(h) || !isFinite(mi) || h > 23 || mi > 59) { continue; }
      var key = pad2(h) + ':' + pad2(mi);
      if (seen[key]) { continue; }
      seen[key] = 1;
      out.push(key);
    }
    out.sort();
    return out.slice(0, MAX_DAILY_TIMES);
  }

  /** 任务是否「有计划」（有目标或有节奏）—— 用于「没有计划的任务是否通知」 */
  function isPlannedTask(t) {
    if (!t) { return false; }
    if (t.goal && Number(t.goal.target) > 0) { return true; }
    var c = t.cadence || {};
    return !!c.type && c.type !== 'unlimited';
  }

  /**
   * 某任务在某天的进度（v0.5.1c 修正口径）。
   *
   * 以前分母取的是「当天要做几次」，于是「目标 30 页、每天 1 次」会显示 0/1，
   * 而且打 1 页就判完成。现在的口径：
   *   · 周任务 → 本周已完成 / 本周目标
   *   · 有 goal.target → 当天累计 / 目标量
   *   · 都没有 → 当天累计 / 当天要求的次数（Infinity 记作 1）
   */
  function taskProgress(t, day) {
    var key = AR.Util.dateKey(day);
    var sum = 0;
    try { sum = AR.Store.todoDaySum(t, key); } catch (e) { sum = 0; }
    var unit = (t && t.goal && t.goal.unit) || '';
    var goalTarget = (t && t.goal && Number(t.goal.target)) || 0;
    var pr = null;
    try { pr = AR.Store.todoProgress ? AR.Store.todoProgress(t, day) : null; } catch (e) { pr = null; }
    if (pr && pr.periodUnit === '本周') {
      var pt = Number(pr.periodGoal) || goalTarget || 1;
      var pd = Number(pr.periodDone) || 0;
      return { done: pd, target: pt, unit: unit, pending: pd < pt, weekly: true };
    }
    if (goalTarget > 0) {
      return { done: sum, target: goalTarget, unit: unit, pending: sum < goalTarget, weekly: false };
    }
    var req = (pr && isFinite(pr.required)) ? Number(pr.required) : 1;
    if (!(req > 0)) { req = 1; }
    return { done: sum, target: req, unit: unit, pending: sum < req, weekly: false };
  }

  /** 当天有几条日程 */
  function dayEventCount(day) {
    var key = AR.Util.dateKey(day);
    var s = null;
    try { s = AR.Store.get(); } catch (e) { return 0; }
    var list = (s && s.events) || [];
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      var ev = list[i];
      if (!ev || ev.deletedAt || ev.archived) { continue; }
      if (String(ev.date || '') === key) { n++; }
    }
    return n;
  }

  /** 当天作业：从布置日起每天提醒，直到勾掉（v0.5.1c 按用户选择 B） */
  function assignmentsFor(day) {
    var key = AR.Util.dateKey(day);
    var floorKey = AR.Util.dateKey(AR.Util.addDays(day, -30));
    var list = [];
    try { list = AR.Store.taskList() || []; } catch (e) { list = []; }
    var out = [];
    for (var i = 0; i < list.length && i < 300; i++) {
      var a = list[i];
      if (!a || a.deletedAt || a.done) { continue; }
      var dk = String(a.date || '');
      if (!dk || dk > key || dk < floorKey) { continue; }
      out.push({ id: a.id, text: a.text || '作业', day: dk });
    }
    return out;
  }

  /** 当天的课（真实课程，不是日程） */
  function dayClasses(day) {
    try {
      if (!AR.Schedule || !AR.Schedule.dayItems) { return []; }
      var sem = null;
      try { sem = AR.Store.currentSemester(); } catch (e) { }
      return AR.Schedule.dayItems(day, sem) || [];
    } catch (e) { return []; }
  }

  /** 当天手动加的日程 */
  function dayEvents(day) {
    var key = AR.Util.dateKey(day);
    var st = null;
    try { st = AR.Store.get(); } catch (e) { return []; }
    var list = (st && st.events) || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var ev = list[i];
      if (!ev || ev.deletedAt || ev.archived) { continue; }
      if (String(ev.date || '') !== key) { continue; }
      out.push({ text: ev.title || '日程', start: ev.start || '' });
    }
    out.sort(function (a, b) { return String(a.start).localeCompare(String(b.start)); });
    return out;
  }

  /** 当天快照：待办任务（按完成比例升序）/ 已完成数 / 作业 / 课 / 日程 */
  function daySnapshot(day) {
    var dl = dailyCfg();
    var tasks = [];
    try { tasks = AR.Store.todoList() || []; } catch (e) { tasks = []; }
    var pend = [], doneCount = 0, muted = 0, unplanned = 0;
    for (var i = 0; i < tasks.length && i < 80; i++) {
      var t = tasks[i];
      if (!t || t.archived) { continue; }
      var nf = { times: [], mute: false, onlyWhenPending: true };
      try { if (AR.Store.taskNotif) { nf = AR.Store.taskNotif(t.id); } } catch (e) { }
      if (nf.mute) { muted++; continue; }
      if (!isPlannedTask(t) && !dl.includeUnplanned) { unplanned++; continue; }
      var pr = taskProgress(t, day);
      var item = {
        id: t.id,
        text: t.text || '任务',
        done: pr.done,
        target: pr.target,
        unit: pr.unit,
        pending: pr.pending,
        ratio: pr.target > 0 ? (pr.done / pr.target) : 0,
        hasOwnTimes: !!(nf.times && nf.times.length)
      };
      if (pr.pending) { pend.push(item); } else { doneCount++; }
    }
    pend.sort(function (a, b) { return a.ratio - b.ratio; });
    return {
      tasks: pend, doneCount: doneCount, muted: muted, unplanned: unplanned,
      assignments: assignmentsFor(day), classes: dayClasses(day), events: dayEvents(day)
    };
  }

  /** 「背单词 12/30 页 · 数学 0/3 · 等 5 项」 */
  function linesOf(list, maxN) {
    var parts = [];
    var top = (list || []).filter(function (x) { return !x.hasOwnTimes; });
    for (var i = 0; i < top.length && i < maxN; i++) {
      var x = top[i];
      parts.push(x.text + ' ' + x.done + '/' + x.target + (x.unit ? ' ' + x.unit : ''));
    }
    if (top.length > maxN) { parts.push('等 ' + top.length + ' 项'); }
    return parts.join(' · ');
  }

  /** 兼容旧接口：面板的「下次提醒」预览用 */
  function summary(day) {
    var snap = daySnapshot(day);
    var title, text;
    if (snap.tasks.length) {
      title = '今天还有 ' + snap.tasks.length + ' 项任务';
      text = linesOf(snap.tasks, 3);
    } else if (snap.assignments.length) {
      title = '今天 ' + snap.assignments.length + ' 项作业';
      text = snap.assignments.slice(0, 3).map(function (x) { return x.text; }).join(' · ');
    } else if (snap.classes.length) {
      title = '今天 ' + snap.classes.length + ' 节课';
      text = '今天没有待办';
    } else {
      title = '今天没有待办';
      text = '轻松一天';
    }
    if (dailyCfg().includeEvents) {
      var extra = [];
      if (snap.classes.length) { extra.push(snap.classes.length + ' 节课'); }
      if (snap.events.length) { extra.push(snap.events.length + ' 条日程'); }
      if (extra.length) { text += ' · 今天 ' + extra.join(' · '); }
    }
    return { title: title, text: text, pending: snap.tasks.length, total: snap.tasks.length + snap.doneCount };
  }

  /** 单个任务的进度文案 */
  function taskLine(t, day) {
    var pr = taskProgress(t, day);
    var u = pr.unit ? (' ' + pr.unit) : '';
    if (!pr.pending) { return '今天已完成 ' + pr.done + '/' + pr.target + u; }
    var left = pr.target - pr.done;
    return '今天 ' + pr.done + '/' + pr.target + u + (left > 0 ? (' · 还差 ' + left + u) : '');
  }

  /** 到期日 23:59 提前 leadHours 小时 */
  function dueAtMs(dateK, leadHours) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateK || ''));
    if (!m) { return 0; }
    var due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 0, 0).getTime();
    if (!isFinite(due)) { return 0; }
    return due - Math.abs(Number(leadHours) || 0) * 3600000;
  }

  /**
   * 算出要排的提醒（纯函数，方便测试）。
   * @returns {Array<{id:string, atMs:number, title:string, text:string, channel:string}>}
   */
  function build(now) {
    var U = AR.Util;
    now = now || new Date();
    var out = [];
    var floor = now.getTime() + MIN_LEAD_MS;
    var dl = dailyCfg();
    var dailyOn = dl && dl.enabled === true;
    var classOn = enabled();

    /* ① 课程提醒 */
    if (classOn && AR.Schedule && AR.Schedule.dayItems) {
      var sem = null;
      try { sem = AR.Store.currentSemester(); } catch (e) { }
      var defLead = leadMinutes();
      for (var d = 0; d < DAYS_AHEAD; d++) {
        var day = U.addDays(U.startOfDay(now), d);
        var items = [];
        try { items = AR.Schedule.dayItems(day, sem) || []; } catch (e) { items = []; }
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          var startMs = msOf(day, it.start);
          if (!startMs) { continue; }
          var courseId = it.courseId || (it.course && it.course.id) || '';
          var lead = defLead;
          try { if (AR.Store.courseLeadMin && courseId) { lead = AR.Store.courseLeadMin(courseId); } } catch (e) { }
          if (lead < 0) { continue; }
          var atMs = startMs - lead * 60000;
          if (atMs <= floor) { continue; }
          out.push({
            id: String(it.blockId || courseId || 'x') + '-' + U.dateKey(day),
            atMs: atMs,
            title: (it.course && it.course.name) ? it.course.name : '上课提醒',
            text: it.start + (it.location && it.location.raw ? (' · ' + it.location.raw) : ''),
            channel: 'class'
          });
        }
      }
    }

    /* ②③④ 每日提醒：汇总 / 按类型 / 每条单独（v0.5.1c） */
    if (dailyOn) {
      var times = normTimes(dl.times);
      var form = dl.form || 'summary';
      var maxLines = Math.max(1, dl.maxPerNotify || 3);
      var maxEach = Math.max(1, dl.maxEachItems || 8);
      if (times.length) {
        for (var dd = 0; dd < DAYS_AHEAD; dd++) {
          var dday = U.addDays(U.startOfDay(now), dd);
          var dow = dday.getDay();
          var weekend = dl.weekdaysOnly && (dow === 0 || dow === 6);
          var dayKey = U.dateKey(dday);
          var snap = daySnapshot(dday);
          var pend = snap.tasks;
          var hw = snap.assignments;
          /* 任务类要不要发：周末不发；全完成且 skipWhenDone 时不发（mode=always 除外） */
          var allDone = pend.length === 0 && snap.doneCount > 0;
          var skipTasks = weekend || (dl.mode !== 'always' && dl.skipWhenDone && allDone);
          for (var ti = 0; ti < times.length; ti++) {
            var hm = times[ti];
            var at2 = msOf(dday, hm);
            if (!at2 || at2 <= floor) { continue; }
            var stamp = hm.replace(':', '');
            var base = 'daily-' + dayKey + '-' + stamp;

            if (form === 'each') {
              /* 每条单独：任务逐项（跳过有专属时间点的），作业在当天第一个时间点逐项 */
              if (!skipTasks) {
                var shown = 0;
                for (var q = 0; q < pend.length && shown < maxEach; q++) {
                  var it = pend[q];
                  if (it.hasOwnTimes) { continue; }
                  var uu = it.unit ? (' ' + it.unit) : '';
                  var left = it.target - it.done;
                  out.push({
                    id: 'task-' + it.id + '-' + dayKey + '-' + stamp,
                    atMs: at2,
                    title: it.text,
                    text: '今天 ' + it.done + '/' + it.target + uu + (left > 0 ? (' · 还差 ' + left + uu) : ''),
                    channel: 'daily'
                  });
                  shown++;
                }
                var rest = pend.length - shown;
                if (rest > 0) {
                  out.push({ id: base + '-more', atMs: at2, title: '还有 ' + rest + ' 项任务', text: '打开 App 查看完整列表', channel: 'daily' });
                }
              }
              if (ti === 0) {
                for (var w = 0; w < hw.length && w < maxEach; w++) {
                  out.push({ id: 'hw-' + hw[w].id + '-' + dayKey, atMs: at2, title: '作业：' + hw[w].text, text: '布置于 ' + hw[w].day + ' · 还没完成', channel: 'daily' });
                }
              }
            } else if (form === 'byType') {
              if (!skipTasks && pend.length) {
                out.push({ id: base + '-t', atMs: at2, title: '今天还有 ' + pend.length + ' 项任务', text: linesOf(pend, maxLines), channel: 'daily' });
              }
              if (hw.length) {
                out.push({ id: base + '-a', atMs: at2, title: '今天 ' + hw.length + ' 项作业', text: hw.slice(0, maxLines).map(function (x) { return x.text; }).join(' · '), channel: 'daily' });
              }
              if (dl.includeEvents && snap.classes.length) {
                out.push({ id: base + '-c', atMs: at2, title: '今天 ' + snap.classes.length + ' 节课', text: snap.classes.slice(0, maxLines).map(function (c) { return String(c.start || '') + ' ' + ((c.course && c.course.name) || ''); }).join(' · '), channel: 'daily' });
              }
              if (dl.includeEvents && snap.events.length) {
                out.push({ id: base + '-e', atMs: at2, title: '今天 ' + snap.events.length + ' 条日程', text: snap.events.slice(0, maxLines).map(function (e2) { return String(e2.start || '') + ' ' + e2.text; }).join(' · '), channel: 'daily' });
              }
            } else {
              /* 汇总一条 */
              /* 什么都没有的一天（无待办/无作业/无课/无日程）就别发了 */
              var nothingAtAll = !pend.length && !hw.length && !snap.classes.length && !snap.events.length && snap.doneCount === 0;
              if (nothingAtAll) { continue; }
              if (skipTasks && !hw.length) { continue; }
              var title, text;
              if (!skipTasks) {
                if (pend.length) {
                  title = '今天还有 ' + pend.length + ' 项任务';
                  text = linesOf(pend, maxLines);
                  if (hw.length) { text += ' · 作业 ' + hw.length + ' 项'; }
                } else if (hw.length) {
                  title = '今天 ' + hw.length + ' 项作业';
                  text = hw.slice(0, maxLines).map(function (x) { return x.text; }).join(' · ');
                } else if (allDone && dl.mode === 'always') {
                  /* 全部完成但用户选了「每天都提醒」→ 改成报喜 */
                  title = '今天的任务都完成了';
                  text = '继续保持';
                } else if (dl.includeEvents && snap.classes.length) {
                  title = '今天 ' + snap.classes.length + ' 节课';
                  text = '今天没有待办';
                } else {
                  title = '今天没有待办';
                  text = '轻松一天';
                }
              } else {
                title = '今天 ' + hw.length + ' 项作业';
                text = hw.slice(0, maxLines).map(function (x) { return x.text; }).join(' · ');
              }
              if (dl.includeEvents) {
                var extra2 = [];
                if (snap.classes.length) { extra2.push(snap.classes.length + ' 节课'); }
                if (snap.events.length) { extra2.push(snap.events.length + ' 条日程'); }
                if (extra2.length) { text += ' · 今天 ' + extra2.join(' · '); }
              }
              out.push({ id: base, atMs: at2, title: title, text: text, channel: 'daily' });
            }
          }
        }
      }
    }

    /* 任务专属时间点（与形式无关，仍然单独发） */
    if (dailyOn) {
      var tasksOwn = [];
      try { tasksOwn = AR.Store.todoList() || []; } catch (e) { tasksOwn = []; }
      var dlw = dailyCfg();
      for (var dt = 0; dt < DAYS_AHEAD; dt++) {
        var dday2 = U.addDays(U.startOfDay(now), dt);
        var keyT = U.dateKey(dday2);
        for (var tk = 0; tk < tasksOwn.length && tk < 40; tk++) {
          var t2 = tasksOwn[tk];
          if (!t2 || t2.archived) { continue; }
          var nf2 = { times: [], mute: false, onlyWhenPending: true };
          try { if (AR.Store.taskNotif) { nf2 = AR.Store.taskNotif(t2.id); } } catch (e) { }
          if (nf2.mute || !nf2.times || !nf2.times.length) { continue; }
          if (!isPlannedTask(t2) && !dlw.includeUnplanned) { continue; }
          var tTimes = normTimes(nf2.times);
          if (!tTimes.length) { continue; }
          var pr2 = taskProgress(t2, dday2);
          if (nf2.onlyWhenPending && !pr2.pending) { continue; }
          for (var tj = 0; tj < tTimes.length; tj++) {
            var at3 = msOf(dday2, tTimes[tj]);
            if (!at3 || at3 <= floor) { continue; }
            out.push({
              id: 'task-' + t2.id + '-' + keyT + '-' + tTimes[tj].replace(':', ''),
              atMs: at3,
              title: t2.text || '任务提醒',
              text: taskLine(t2, dday2),
              channel: 'daily'
            });
          }
        }
      }
    }

    out.sort(function (a, b) { return a.atMs - b.atMs; });
    if (out.length > MAX_ENTRIES) { out = out.slice(0, MAX_ENTRIES); }
    return out;
  }

  /**
   * Windows 端没有 AlarmManager，也没有后台进程（关掉窗口只是进托盘，进程还在），
   * 所以用一个 20 秒的前台轮询：到点的条目直接调系统通知桥弹出来。
   * —— v0.5.1 之前 Windows 完全没有提醒引擎，这也是「提醒不响」的一个原因。
   */
  /**
   * v0.5.1b：把「到点补发」抽成与平台无关的 tickNow。
   * Windows 自动轮询它（没有 AlarmManager）；Android 只在用户手动点「立即检查并补发」时调它，
   * 避免和系统闹钟重复弹同一条。
   */
  function tickNow(now) {
    if (!AR.Bridge || !AR.Bridge.notifyNow) { return 0; }
    now = now || Date.now();
    var list = [];
    /**
     * 关键：build() 会滤掉「atMs <= now + 30s」的条目（Android 侧不需要补发过去的时间），
     * 但前台轮询恰恰要在「刚好到点」那一刻看到它。所以把基准时间往前挪 2.5 分钟，
     * 让窗口覆盖 [now-2min, now+1min]，再用下面的 2 分钟窗口过滤。
     */
    try { list = build(new Date(now - 150000)); } catch (e) { return 0; }
    var fired = loadFired();
    var hit = 0;
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (!it || !it.atMs) { continue; }
      /* 只弹「刚刚到点」的：2 分钟窗口，避免打开 App 时把一堆旧提醒全弹出来 */
      if (it.atMs > now || it.atMs < now - 120000) { continue; }
      if (fired[it.id]) { continue; }
      try { AR.Bridge.notifyNow(it.title, it.text); } catch (e) { }
      fired[it.id] = now;
      hit++;
    }
    if (hit) { saveFired(fired); }
    return hit;
  }

  /** 只在 Windows 自动跑（Android 用系统闹钟，不自动补发，免得重复） */
  function tickWindows(now) {
    if (!AR.Bridge || !AR.Bridge.hasWebView2) { return 0; }
    return tickNow(now);
  }

  /** 前台轮询启停（只在 Windows 用；重复调用安全） */
  function ensureTick() {
    if (!AR.Bridge || !AR.Bridge.hasWebView2) { return; }
    if (tickTimer) { return; }
    tickTimer = setInterval(function () {
      try { tickWindows(); } catch (e) { }
    }, 20000);
    try { tickWindows(); } catch (e) { }
  }

  function stopTick() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  function pushNow() {
    if (!AR.Bridge || !AR.Bridge.hasAndroid || !AR.Bridge.scheduleReminders) { return; }
    if (!anyEnabled()) {
      try { AR.Bridge.cancelReminders(); } catch (e) { }
      return;
    }
    var list = build();
    /**
     * v0.5.1b：原生返回值以前被丢掉（scheduleReminders 会返回 "ok" 或 "error: ..."）。
     * 现在记下来：排障时能看到「到底排上了没有、报什么错」。
     */
    try {
      var p = AR.Bridge.scheduleReminders(JSON.stringify(list));
      if (p && p.then) {
        p.then(function (res) {
          lastResult = (res == null ? 'null' : String(res));
          lastResultAt = Date.now();
          if (lastResult.indexOf('error') === 0) {
            try { if (AR.UI && AR.UI.toast) { AR.UI.toast('提醒排程失败：' + lastResult); } } catch (e2) { }
          }
        }, function (err) {
          lastResult = 'reject: ' + (err && err.message ? err.message : err);
          lastResultAt = Date.now();
        });
      }
    } catch (e) { lastResult = 'throw: ' + (e && e.message ? e.message : e); }
  }

  function sync(immediate) {
    if (timer) { clearTimeout(timer); timer = null; }
    if (AR.Bridge && AR.Bridge.hasWebView2) { ensureTick(); }
    if (immediate) { pushNow(); return; }
    timer = setTimeout(function () { timer = null; pushNow(); }, DEBOUNCE_MS);
  }

  function enable() {
    if (!AR.Bridge || !AR.Bridge.hasAndroid) { return; }
    var ask = (AR.Bridge.requestNotificationPermission ? AR.Bridge.requestNotificationPermission() : null);
    if (ask && ask.then) { ask.then(function () { sync(true); }, function () { sync(true); }); }
    else { sync(true); }
  }

  function cancel() {
    if (!AR.Bridge || !AR.Bridge.hasAndroid) { return; }
    try { AR.Bridge.cancelReminders(); } catch (e) { }
  }

  AR.Reminders = {
    enabled: enabled,
    anyEnabled: anyEnabled,
    leadMinutes: leadMinutes,
    dailyCfg: dailyCfg,
    normTimes: normTimes,
    summary: summary,
    taskLine: taskLine,
    build: build,
    /** v0.5.1c：预览「下一条会发什么」——和真实发送同一套 build() */
    preview: function (now) {
      var t = (now == null) ? Date.now() : Number(now);
      var list = build(new Date(t));
      var out = [];
      for (var i = 0; i < list.length && out.length < 12; i++) {
        if (list[i].atMs >= t - 1000) { out.push(list[i]); }
      }
      if (!out.length) { return []; }
      var firstAt = out[0].atMs;
      var same = [];
      for (var j = 0; j < out.length; j++) { if (out[j].atMs === firstAt) { same.push(out[j]); } }
      return same;
    },
    sync: sync,
    enable: enable,
    cancel: cancel,
    MAX_DAILY_TIMES: MAX_DAILY_TIMES,
    lastResult: function () { return { result: lastResult, at: lastResultAt, size: (function () { try { return build().length; } catch (e) { return -1; } })() }; },
    tickWindows: tickWindows,      // 手动跑一次前台检查（排障/测试用）
    tickNow: tickNow,              // 平台无关的「到点补发」，Android 手动排障用
    ensureTick: ensureTick,
    stopTick: stopTick,
    clearFired: function () { try { localStorage.removeItem(FIRED_KEY); } catch (e) { } }
  };
})();

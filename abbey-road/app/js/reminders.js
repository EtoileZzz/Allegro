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

  /** 某任务在某天「还差多少」 */
  function taskNeed(t, day) {
    var sum = 0, required = 0;
    try { sum = AR.Store.todoDaySum(t, AR.Util.dateKey(day)); } catch (e) { sum = 0; }
    try { required = AR.Store.todoRequired(t, day); } catch (e) { required = 0; }
    var goalTarget = (t && t.goal && Number(t.goal.target)) || 0;
    var unit = (t && t.goal && t.goal.unit) || '';
    if (!isFinite(required)) {
      return { pending: sum <= 0, done: sum, target: goalTarget, unit: unit };
    }
    var target = Number(required) || 0;
    return { pending: sum < target, done: sum, target: target, unit: unit };
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

  /** 每日汇总文案（设置页也用它做预览） */
  function summary(day) {
    var tasks = [];
    try { tasks = AR.Store.todoList() || []; } catch (e) { tasks = []; }
    var pendingLines = [], doneLines = [], pending = 0;
    for (var i = 0; i < tasks.length && i < 40; i++) {
      var t = tasks[i];
      if (!t || t.archived) { continue; }
      var nf = { times: [], mute: false, onlyWhenPending: true };
      try { if (AR.Store.taskNotif) { nf = AR.Store.taskNotif(t.id); } } catch (e) { }
      if (nf.mute) { continue; }
      var need = taskNeed(t, day);
      var unit = need.unit ? (' ' + need.unit) : '';
      var line = (t.text || '任务') + ' ' + need.done + '/' + (need.target || 1) + unit;
      if (need.pending) { pending++; if (pendingLines.length < 3) { pendingLines.push(line); } }
      else if (doneLines.length < 3) { doneLines.push(line); }
    }
    var dl = dailyCfg();
    var evN = dl.includeEvents ? dayEventCount(day) : 0;
    var title, text;
    if (pending > 0) {
      title = '今天还有 ' + pending + ' 项任务';
      text = pendingLines.join(' · ') + (evN ? (' · 今天 ' + evN + ' 节课') : '');
    } else if (tasks.length > 0) {
      title = '今天的任务都完成了';
      text = (doneLines.join(' · ') || '继续保持') + (evN ? (' · 今天 ' + evN + ' 节课') : '');
    } else {
      title = '今天没有待办';
      text = evN ? ('今天 ' + evN + ' 节课') : '轻松一天';
    }
    return { title: title, text: text, pending: pending, total: tasks.length };
  }

  function taskLine(t, day) {
    var need = taskNeed(t, day);
    var unit = need.unit ? (' ' + need.unit) : '';
    if (!need.pending) { return '今天已完成 ' + need.done + '/' + (need.target || need.done) + unit; }
    var left = need.target ? (need.target - need.done) : 0;
    return '今天 ' + need.done + '/' + (need.target || 1) + unit + (left > 0 ? (' · 还差 ' + left + unit) : '');
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

    /* ②③ 每日汇总 + 任务专属 */
    if (dailyOn) {
      var times = normTimes(dl.times);
      var tasks = [];
      try { tasks = AR.Store.todoList() || []; } catch (e) { tasks = []; }
      for (var dd = 0; dd < DAYS_AHEAD; dd++) {
        var dday = U.addDays(U.startOfDay(now), dd);
        var dow = dday.getDay();
        var weekdaySkip = dl.weekdaysOnly && (dow === 0 || dow === 6);
        if (!weekdaySkip && times.length) {
          var sum = summary(dday);
          var allDone = sum.pending === 0 && sum.total > 0;   // 没有任何任务时不算「都完成」
          if (!(dl.mode === 'pending' && dl.skipWhenDone && allDone)) {
            for (var ti = 0; ti < times.length; ti++) {
              var at2 = msOf(dday, times[ti]);
              if (!at2 || at2 <= floor) { continue; }
              out.push({
                id: 'daily-' + U.dateKey(dday) + '-' + times[ti].replace(':', ''),
                atMs: at2,
                title: sum.title,
                text: sum.text,
                channel: 'daily'
              });
            }
          }
        }
        for (var tk = 0; tk < tasks.length && tk < 40; tk++) {
          var t = tasks[tk];
          if (!t || t.archived) { continue; }
          var nf = { times: [], mute: false, onlyWhenPending: true };
          try { if (AR.Store.taskNotif) { nf = AR.Store.taskNotif(t.id); } } catch (e) { }
          if (nf.mute || !nf.times || !nf.times.length) { continue; }
          var tTimes = normTimes(nf.times);
          if (!tTimes.length) { continue; }
          var need = taskNeed(t, dday);
          if (nf.onlyWhenPending && !need.pending) { continue; }
          for (var tj = 0; tj < tTimes.length; tj++) {
            var at3 = msOf(dday, tTimes[tj]);
            if (!at3 || at3 <= floor) { continue; }
            out.push({
              id: 'task-' + t.id + '-' + U.dateKey(dday) + '-' + tTimes[tj].replace(':', ''),
              atMs: at3,
              title: t.text || '任务提醒',
              text: taskLine(t, dday),
              channel: 'daily'
            });
          }
        }
      }
    }

    /* ④ 作业到期 */
    if (dailyOn) {
      var legacy = [];
      try { legacy = AR.Store.taskList() || []; } catch (e) { legacy = []; }
      var todayKey = U.dateKey(U.startOfDay(now));
      var limitKey = U.dateKey(U.addDays(U.startOfDay(now), DAYS_AHEAD));
      for (var li = 0; li < legacy.length; li++) {
        var lt = legacy[li];
        if (!lt || lt.deletedAt || lt.done) { continue; }
        var dk = String(lt.date || '');
        if (!dk || dk < todayKey || dk > limitKey) { continue; }
        var hours = DEFAULT_DUE_HOURS;
        try { var ov = AR.Store.legacyTaskLeadHours(lt.id); if (ov !== null) { hours = ov; } } catch (e) { }
        if (!hours) { continue; }
        var at4 = dueAtMs(dk, hours);
        if (!at4 || at4 <= floor) { continue; }
        out.push({
          id: 'due-' + lt.id,
          atMs: at4,
          title: (hours >= 12 ? '明天到期：' : (Math.round(hours) + ' 小时后到期：')) + (lt.text || '作业'),
          text: '截止 ' + dk + ' 23:59',
          channel: 'daily'
        });
      }
    }

    out.sort(function (a, b) { return a.atMs - b.atMs; });
    if (out.length > MAX_ENTRIES) { out = out.slice(0, MAX_ENTRIES); }
    return out;
  }

  function pushNow() {
    if (!AR.Bridge || !AR.Bridge.hasAndroid || !AR.Bridge.scheduleReminders) { return; }
    if (!anyEnabled()) {
      try { AR.Bridge.cancelReminders(); } catch (e) { }
      return;
    }
    var list = build();
    try { AR.Bridge.scheduleReminders(JSON.stringify(list)); } catch (e) { }
  }

  function sync(immediate) {
    if (timer) { clearTimeout(timer); timer = null; }
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
    sync: sync,
    enable: enable,
    cancel: cancel,
    MAX_DAILY_TIMES: MAX_DAILY_TIMES
  };
})();

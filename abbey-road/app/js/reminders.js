/* ──────────────────────────────────────────────────────────────
   Allegro · 课前提醒（真正的系统通知）

   背景：v0.4.4 之前「设置 → 课前提醒」只是一个布尔开关，Android 侧
   没有任何通知代码 —— 开关能打开、还会弹「已开启课前提醒」，但永远
   不会响。v0.5 起由原生侧（ReminderScheduler / ReminderReceiver）用
   AlarmManager 排真实的系统通知，这里负责**算出要排哪些**并整批下发。

   分工：
     · 本文件只做纯计算 + 一次下发给 AR.Bridge.scheduleReminders
     · 原生侧负责权限、渠道、闹钟、点开跳转
     · 排程范围：未来 7 天（重启后系统会清空闹钟，靠启动/回前台重发覆盖）

   注意：只有 Android 才有这套桥；Windows / 纯网页静默跳过。
   ────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  var DAYS_AHEAD = 7;          // 排未来 7 天
  var DEBOUNCE_MS = 600;       // 连续改动只排一次
  var MAX_ENTRIES = 512;       // 原生侧上限，超出会被丢弃
  var MIN_LEAD_MS = 30 * 1000; // 提醒时刻已经过去（或太近）就别排了

  var timer = null;

  /** 提醒设置（可能还不存在，全部走兜底） */
  function notifSettings() {
    try {
      var s = AR.Store.get();
      return (s && s.settings && s.settings.notifications) || {};
    } catch (e) { return {}; }
  }

  function enabled() { return notifSettings().enabled === true; }

  /** 提前量（分钟）：5–60，默认 15 */
  function leadMinutes() {
    var n = Number(notifSettings().defaultOffset);
    if (!isFinite(n) || n <= 0) { return 15; }
    return Math.max(5, Math.min(60, Math.round(n)));
  }

  /** 'HH:MM' → 当天的 epoch 毫秒；解析不出来返回 0 */
  function msOf(day, hm) {
    if (!day || !hm) { return 0; }
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hm));
    if (!m) { return 0; }
    var h = Number(m[1]), mi = Number(m[2]);
    if (!isFinite(h) || !isFinite(mi)) { return 0; }
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, mi, 0, 0).getTime();
  }

  /**
   * 算出要排的提醒（纯函数，方便测试）。
   * @returns {Array<{id:string, atMs:number, title:string, text:string}>}
   */
  function build(now) {
    var U = AR.Util;
    now = now || new Date();
    var out = [];
    if (!AR.Schedule || !AR.Schedule.dayItems) { return out; }
    var lead = leadMinutes() * 60000;
    var floor = now.getTime() + MIN_LEAD_MS;
    var sem = null;
    try { sem = AR.Store.currentSemester(); } catch (e) { }

    for (var d = 0; d < DAYS_AHEAD; d++) {
      var day = U.addDays(U.startOfDay(now), d);
      var items = [];
      try { items = AR.Schedule.dayItems(day, sem) || []; } catch (e) { items = []; }
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var startMs = msOf(day, it.start);
        if (!startMs) { continue; }                 // 没有具体时间的课不排
        var atMs = startMs - lead;
        if (atMs <= floor) { continue; }            // 已经过了就跳过，不补发
        out.push({
          id: String(it.blockId || it.courseId || 'x') + '-' + U.dateKey(day),
          atMs: atMs,
          title: (it.course && it.course.name) ? it.course.name : '上课提醒',
          text: it.start + (it.location && it.location.raw ? (' · ' + it.location.raw) : '')
        });
        if (out.length >= MAX_ENTRIES) { return out; }
      }
    }
    return out;
  }

  /** 真的下发（不判断开关） */
  function pushNow() {
    if (!AR.Bridge || !AR.Bridge.hasAndroid || !AR.Bridge.scheduleReminders) { return; }
    if (!enabled()) {
      try { AR.Bridge.cancelReminders(); } catch (e) { }
      return;
    }
    var list = build();
    try { AR.Bridge.scheduleReminders(JSON.stringify(list)); } catch (e) { }
  }

  /** 去抖后下发：课表/设置/导入/回前台之后调这个 */
  function sync(immediate) {
    if (timer) { clearTimeout(timer); timer = null; }
    if (immediate) { pushNow(); return; }
    timer = setTimeout(function () { timer = null; pushNow(); }, DEBOUNCE_MS);
  }

  /** 用户主动打开开关时用：先要权限，再排 */
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
    leadMinutes: leadMinutes,
    build: build,
    sync: sync,
    enable: enable,
    cancel: cancel
  };
})();

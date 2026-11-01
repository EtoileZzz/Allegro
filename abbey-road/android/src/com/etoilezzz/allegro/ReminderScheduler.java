package com.etoilezzz.allegro;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * 课前提醒的「排」的那一端。
 *
 * 网页把未来 N 天的提醒算好，一次性交给 scheduleReminders(json)：
 *   [{"id":"c1-block1-202610200800","atMs":1760918400000,
 *     "title":"高等数学","text":"08:00 · 信息楼 305"}]
 * 这里做三件事：
 *   ① 先取消上一轮排的全部闹钟（课表改过之后不能留下「幽灵通知」）；
 *   ② 逐条用 id 的 hashCode 当 requestCode（同一个 id 天然可覆盖）；
 *   ③ 精确闹钟拿得到就用 setExactAndAllowWhileIdle，拿不到退成 setAndAllowWhileIdle。
 *
 * 另外两条和「活过重启」有关的约定：
 *   · 每条 Intent 带上 channel（class / daily），由 ReminderReceiver 决定用哪个渠道；
 *   · 成功的 payload 原文存进 SharedPreferences（reminders.last），
 *     开机或覆盖安装后由 BootReceiver 读回来调用同一个 schedule()。
 *
 * 约束（都是为了让网页传坏数据时进程不死）：
 *   · json 超过 256KB 直接拒绝，不进 JSON 解析；
 *   · 单次最多排 512 条，超出部分跳过；
 *   · 解析/排程全部 catch，只返回 "ok" 或 "error: ..."。
 */
final class ReminderScheduler {

    private static final String TAG = "AbbeyRoadReminder";

    static final String ACTION_REMIND = "com.etoilezzz.allegro.action.REMIND";

    static final String EXTRA_ID = "reminder_id";
    static final String EXTRA_CODE = "reminder_code";
    static final String EXTRA_TITLE = "reminder_title";
    static final String EXTRA_TEXT = "reminder_text";
    static final String EXTRA_AT_MS = "reminder_at_ms";
    /** 这条提醒该进哪个通知渠道：class / daily（老 payload 没有这个字段，按 class 处理）。 */
    static final String EXTRA_CHANNEL = "reminder_channel";

    /** 和 ReminderReceiver 的渠道 id 一一对应；这里只存「逻辑名字」，不直接存渠道 id。 */
    static final String CHANNEL_CLASS = "class";
    static final String CHANNEL_DAILY = "daily";

    private static final String PREFS = "abbeyroad_reminders";
    private static final String KEY_CODES = "codes";
    /** 最后一次成功下发的 JSON：开机后 BootReceiver 靠它把闹钟补回来。 */
    private static final String KEY_LAST_JSON = "reminders.last";

    /** 网页一次性传过来的 JSON 上限（按 UTF-8 字节算） */
    private static final int MAX_JSON_BYTES = 256 * 1024;
    /** 单次最多排多少条，避免一条坏数据把系统闹钟队列打爆 */
    private static final int MAX_ITEMS = 512;
    /** 已经过去的提醒最多再补发这么久，再早的就当过期丢弃 */
    private static final long PAST_GRACE_MS = 60L * 1000L;

    private ReminderScheduler() { }

    /** 排程入口：返回 "ok" 或 "error: ..."（永远不抛）。 */
    static String schedule(Context ctx, String json) {
        if (ctx == null) { return "error: no context"; }
        if (json == null || json.trim().length() == 0) { return "error: empty json"; }

        int bytes;
        try {
            bytes = json.getBytes(StandardCharsets.UTF_8).length;
        } catch (Throwable t) {
            return "error: cannot measure json";
        }
        if (bytes > MAX_JSON_BYTES) {
            return "error: payload too large (" + bytes + " > " + MAX_JSON_BYTES + " bytes)";
        }

        JSONArray arr;
        try {
            arr = new JSONArray(json);
        } catch (Throwable t) {
            return "error: invalid json (" + t.getClass().getSimpleName() + ")";
        }

        // 能解析成数组就算「成功收到」：先留档，之后每次开机/更新都由 BootReceiver 重放。
        // 坏 JSON / 超限的 payload 在上面已经 return，不会覆盖上一份好数据。
        saveLastJson(ctx, json);

        // 先清空上一轮，保证「改了课表 → 旧的提醒不会还在」
        cancelAllInternal(ctx);

        long now = System.currentTimeMillis();
        int scheduled = 0;
        int skipped = 0;
        List<Integer> codes = new ArrayList<Integer>();

        for (int i = 0; i < arr.length(); i++) {
            if (scheduled >= MAX_ITEMS) { skipped++; continue; }
            JSONObject o = null;
            try {
                o = arr.optJSONObject(i);
            } catch (Throwable ignored) { }
            if (o == null) { skipped++; continue; }
            try {
                String id = o.optString("id", "");
                long atMs = o.optLong("atMs", 0L);
                if (atMs <= 0L) { skipped++; continue; }
                if (atMs < now - PAST_GRACE_MS) { skipped++; continue; }

                String title = o.optString("title", "上课提醒");
                if (title == null || "null".equals(title) || title.trim().length() == 0) {
                    title = "上课提醒";
                }
                String text = o.optString("text", "");
                if (text == null || "null".equals(text)) { text = ""; }
                // 老 payload 没有 channel → class；未知值也按 class（保住「课前提醒」的老行为）
                String channel = normalizeChannel(o.optString("channel", ""));
                String key = (id == null || id.trim().length() == 0) ? ("reminder-" + atMs) : id.trim();
                int code = key.hashCode();

                Intent intent = baseIntent(ctx);
                intent.putExtra(EXTRA_ID, clamp(key, 128));
                intent.putExtra(EXTRA_CODE, code);
                intent.putExtra(EXTRA_TITLE, clamp(title, 120));
                intent.putExtra(EXTRA_TEXT, clamp(text, 800));
                intent.putExtra(EXTRA_AT_MS, atMs);
                intent.putExtra(EXTRA_CHANNEL, channel);

                if (setAlarm(ctx, code, atMs, intent)) {
                    codes.add(code);
                    scheduled++;
                } else {
                    skipped++;
                }
            } catch (Throwable t) {
                skipped++;
                Log.w(TAG, "跳过一条无效提醒", t);
            }
        }

        saveCodes(ctx, codes);
        Log.i(TAG, "课前提醒已排程 " + scheduled + " 条，跳过 " + skipped + " 条");
        return "ok";
    }

    /** 取消全部提醒：返回 "ok" 或 "error: ..."（永远不抛）。 */
    static String cancelAll(Context ctx) {
        if (ctx == null) { return "error: no context"; }
        try {
            cancelAllInternal(ctx);
            // 用户主动关掉提醒：存档一起清掉，否则重启后 BootReceiver 会把它们又排回来。
            clearLastJson(ctx);
            return "ok";
        } catch (Throwable t) {
            Log.w(TAG, "取消提醒失败", t);
            return "error: " + t.getClass().getSimpleName();
        }
    }

    /**
     * 读回最后一次成功下发的 JSON（给 BootReceiver 用）。
     * 没有存档 / 存档损坏 / 读取异常都返回 null，调用方据此「什么也不做」。
     */
    static String getLastJson(Context ctx) {
        if (ctx == null) { return null; }
        try {
            String json = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .getString(KEY_LAST_JSON, null);
            if (json == null || json.trim().length() == 0) { return null; }
            return json;
        } catch (Throwable t) {
            Log.w(TAG, "读取提醒存档失败", t);
            return null;
        }
    }

    /* ── 内部实现 ─────────────────────────────────────────────── */

    /** 显式 Intent 的「身份」只由 action + 组件决定，extras 不参与 PendingIntent 匹配。 */
    private static Intent baseIntent(Context ctx) {
        Intent i = new Intent(ctx, ReminderReceiver.class);
        i.setAction(ACTION_REMIND);
        return i;
    }

    private static void cancelAllInternal(Context ctx) {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = sp.getString(KEY_CODES, "");
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (raw != null && raw.length() > 0) {
            String[] parts = raw.split(",");
            for (int i = 0; i < parts.length; i++) {
                String p = parts[i].trim();
                if (p.length() == 0) { continue; }
                try {
                    cancelCode(ctx, am, Integer.parseInt(p));
                } catch (Throwable ignored) { }
            }
        }
        sp.edit().remove(KEY_CODES).apply();
    }

    private static void cancelCode(Context ctx, AlarmManager am, int code) {
        try {
            Intent intent = baseIntent(ctx);
            int flags = PendingIntent.FLAG_NO_CREATE;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) { flags |= PendingIntent.FLAG_IMMUTABLE; }
            PendingIntent pi = PendingIntent.getBroadcast(ctx, code, intent, flags);
            if (pi == null) { return; }      // 本来就没有这个闹钟
            if (am != null) { am.cancel(pi); }
            pi.cancel();
        } catch (Throwable t) {
            Log.w(TAG, "取消单条提醒失败: " + code, t);
        }
    }

    private static boolean setAlarm(Context ctx, int code, long atMs, Intent intent) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) { return false; }

        PendingIntent pi;
        try {
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) { flags |= PendingIntent.FLAG_IMMUTABLE; }
            pi = PendingIntent.getBroadcast(ctx, code, intent, flags);
        } catch (Throwable t) {
            Log.w(TAG, "创建提醒 PendingIntent 失败", t);
            return false;
        }

        // Android 12+ 才需要「精确闹钟」权限；拿不到就退化成非精确，绝不因此不排/崩溃。
        boolean exact = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                exact = am.canScheduleExactAlarms();
            } catch (Throwable t) {
                exact = false;
            }
        }
        if (exact) {
            try {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi);
                return true;
            } catch (Throwable t) {
                // SecurityException：某些 ROM 上 canScheduleExactAlarms 说可以、实际仍拒绝
                Log.w(TAG, "精确闹钟不可用，退回非精确排程", t);
            }
        }
        try {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi);
            return true;
        } catch (Throwable t) {
            Log.w(TAG, "提醒排程失败", t);
            return false;
        }
    }

    private static void saveCodes(Context ctx, List<Integer> codes) {
        try {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < codes.size(); i++) {
                if (i > 0) { sb.append(','); }
                sb.append(codes.get(i).intValue());
            }
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit().putString(KEY_CODES, sb.toString()).apply();
        } catch (Throwable t) {
            Log.w(TAG, "保存提醒索引失败", t);
        }
    }

    /** 覆盖上次的 payload 原文（只在 schedule() 解析成功后调用）。 */
    private static void saveLastJson(Context ctx, String json) {
        try {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit().putString(KEY_LAST_JSON, json).apply();
        } catch (Throwable t) {
            Log.w(TAG, "保存提醒存档失败", t);
        }
    }

    private static void clearLastJson(Context ctx) {
        try {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit().remove(KEY_LAST_JSON).apply();
        } catch (Throwable t) {
            Log.w(TAG, "清除提醒存档失败", t);
        }
    }

    /** "daily" → daily，其余（含 null / 空 / 未知值）→ class。 */
    private static String normalizeChannel(String raw) {
        if (raw == null) { return CHANNEL_CLASS; }
        String v = raw.trim().toLowerCase(Locale.US);
        return CHANNEL_DAILY.equals(v) ? CHANNEL_DAILY : CHANNEL_CLASS;
    }

    private static String clamp(String s, int max) {
        if (s == null) { return ""; }
        return s.length() > max ? s.substring(0, max) : s;
    }
}

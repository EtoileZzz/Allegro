package com.etoilezzz.allegro;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * 提醒的「响」的那一端。
 *
 * 网页通过 ARBridge.scheduleReminders(json) 把未来的提醒交给 ReminderScheduler，
 * 后者用 AlarmManager 在到点时把一条显式 Intent 丢给这里；
 * 这里只做三件事：按 extra 选/建通知渠道 → 按 extra 组装通知 → notify。
 *
 * 两个渠道（id 一旦发布就不能改，改了等于换新渠道、用户的设置会失效）：
 *   class_reminders：「课前提醒」，IMPORTANCE_HIGH（课程提醒，要打断用户）
 *   daily_reminders：「每日提醒」，IMPORTANCE_DEFAULT（每日汇总 / 任务 / 到期）
 *
 * 因为 targetSdk 34，没有 NotificationChannel 的通知会被系统直接丢掉，
 * 所以渠道在 Activity onCreate 时也会建一次（幂等），其余按需惰性创建。
 */
public class ReminderReceiver extends BroadcastReceiver {

    private static final String TAG = "AbbeyRoadReminder";

    static final String CHANNEL_CLASS = "class_reminders";
    static final String CHANNEL_DAILY = "daily_reminders";
    /** 兼容旧引用：默认（课前）渠道。 */
    static final String CHANNEL_ID = CHANNEL_CLASS;

    /** 排障自检通知的固定 id（见 postNow）；不参与闹钟 requestCode 体系。 */
    static final int ID_SELFTEST_CLASS = 99002;
    static final int ID_SELFTEST_DAILY = 99001;

    private static final String NAME_CLASS = "课前提醒";
    private static final String DESC_CLASS = "每节课开始前的提醒";
    private static final String NAME_DAILY = "每日提醒";
    private static final String DESC_DAILY = "每日待办、任务与作业到期提醒";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) { return; }
        try {
            // 老 payload 没带 channel → class；未知值也按 class
            String kind = intent.getStringExtra(ReminderScheduler.EXTRA_CHANNEL);
            boolean daily = ReminderScheduler.CHANNEL_DAILY.equals(kind);
            String channelId = daily ? CHANNEL_DAILY : CHANNEL_CLASS;
            ensureChannel(context, kind);

            String title = clamp(intent.getStringExtra(ReminderScheduler.EXTRA_TITLE), "上课提醒", 120);
            String text = clamp(intent.getStringExtra(ReminderScheduler.EXTRA_TEXT), "", 800);
            long atMs = intent.getLongExtra(ReminderScheduler.EXTRA_AT_MS, 0L);
            int id = intent.getIntExtra(ReminderScheduler.EXTRA_CODE, 1001);
            post(context, channelId, id, title, text, atMs);
        } catch (Throwable t) {
            // 闹钟到点时进程可能刚被拉起，任何异常都不能让系统弹「应用已停止运行」
            Log.w(TAG, "显示提醒失败", t);
        }
    }

    /** 建默认（课前）渠道；保留给 Activity 启动时调用。 */
    static void ensureChannel(Context ctx) {
        ensureChannel(ctx, ReminderScheduler.CHANNEL_CLASS);
    }

    /**
     * 立即发一条通知，**不经过 AlarmManager**。
     *
     * 排障时用来把「闹钟」和「权限 + 渠道 + 通知」两段拆开看：
     *   自检通知能弹 → 排程/闹钟那段有问题；
     *   自检通知不能弹 → 先修通知权限或渠道。
     *
     * 和 onReceive 共用同一套「建渠道 + 构建通知」逻辑（ensureChannel / post），
     * 所以它验证的就是真实提醒链路的那一段。
     *
     * @param kind class / daily（也接受渠道 id；未知值按 class）
     * @return true 表示 notify() 已提交给系统；false 表示抛异常或参数不可用
     */
    public static boolean postNow(Context ctx, String kind, String title, String text) {
        if (ctx == null) { return false; }
        boolean daily = isDaily(kind);
        String channelId = daily ? CHANNEL_DAILY : CHANNEL_CLASS;
        try {
            ensureChannel(ctx, daily ? ReminderScheduler.CHANNEL_DAILY : ReminderScheduler.CHANNEL_CLASS);
            String t = clamp(title, "Allegro", 120);
            String x = clamp(text, "", 800);
            // 固定 id：反复点自检不会在通知栏堆一叠（正式提醒用 hashCode，不会撞上这两个值）
            int id = daily ? ID_SELFTEST_DAILY : ID_SELFTEST_CLASS;
            return post(ctx, channelId, id, t, x, System.currentTimeMillis());
        } catch (Throwable t) {
            Log.w(TAG, "自检通知发送失败", t);
            return false;
        }
    }

    /** "daily" / "daily_reminders" → true；其余（含 null / 空 / 未知）→ false（按课前提醒）。 */
    private static boolean isDaily(String kind) {
        if (kind == null) { return false; }
        String v = kind.trim().toLowerCase(java.util.Locale.US);
        return ReminderScheduler.CHANNEL_DAILY.equals(v) || CHANNEL_DAILY.equals(v);
    }

    /** 按 kind（class / daily）建对应渠道；已存在时是空操作，不会覆盖用户改过的重要性。 */
    static void ensureChannel(Context ctx, String kind) {
        if (ctx == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) { return; }
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) { return; }
            if (ReminderScheduler.CHANNEL_DAILY.equals(kind)) {
                NotificationChannel ch = new NotificationChannel(
                        CHANNEL_DAILY, NAME_DAILY, NotificationManager.IMPORTANCE_DEFAULT);
                ch.setDescription(DESC_DAILY);
                ch.setShowBadge(true);
                nm.createNotificationChannel(ch);
            } else {
                NotificationChannel ch = new NotificationChannel(
                        CHANNEL_CLASS, NAME_CLASS, NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription(DESC_CLASS);
                ch.enableVibration(true);
                ch.setShowBadge(true);
                ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                nm.createNotificationChannel(ch);
            }
        } catch (Throwable t) {
            Log.w(TAG, "创建通知渠道失败", t);
        }
    }

    /** 组装并投递通知。返回 false 表示系统没接（没有 NotificationManager）。 */
    private static boolean post(Context ctx, String channelId, int id, String title, String text, long atMs) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) { return false; }

        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            b = new Notification.Builder(ctx, channelId);
        } else {
            b = new Notification.Builder(ctx);
        }
        // 小图标必须是「单色」资源；这里复用现有的 drawable，不额外塞 png。
        b.setSmallIcon(R.drawable.widget_chip)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setAutoCancel(true)
                .setShowWhen(true)
                .setWhen(atMs > 0L ? atMs : System.currentTimeMillis())
                .setCategory(Notification.CATEGORY_REMINDER)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setContentIntent(contentIntent(ctx, id));

        Notification n = b.build();
        nm.notify(id, n);
        return true;
    }

    /** 点通知 → 打开 App 的「今天」 */
    private static PendingIntent contentIntent(Context ctx, int id) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        i.putExtra(MainActivity.EXTRA_VIEW, "today");
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) { flags |= PendingIntent.FLAG_IMMUTABLE; }
        return PendingIntent.getActivity(ctx, id, i, flags);
    }

    private static String clamp(String s, String fallback, int max) {
        if (s == null) { return fallback; }
        String v = s.trim();
        if (v.length() == 0) { return fallback; }
        return v.length() > max ? v.substring(0, max) : v;
    }
}

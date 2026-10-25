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
 * 课前提醒的「响」的那一端。
 *
 * 网页通过 ARBridge.scheduleReminders(json) 把未来的提醒交给 ReminderScheduler，
 * 后者用 AlarmManager 在到点时把一条显式 Intent 丢给这里；
 * 这里只做三件事：确保通知渠道存在 → 按 extra 组装通知 → notify。
 *
 * 因为 targetSdk 34，没有 NotificationChannel 的通知会被系统直接丢掉，
 * 所以渠道在 Activity onCreate 时也会建一次（幂等）。
 */
public class ReminderReceiver extends BroadcastReceiver {

    private static final String TAG = "AbbeyRoadReminder";

    /** 渠道 id 一旦发布就不能改（改了等于换一个新渠道，用户之前的设置会失效）。 */
    static final String CHANNEL_ID = "class_reminders";
    private static final String CHANNEL_NAME = "课前提醒";
    private static final String CHANNEL_DESC = "每节课开始前的提醒";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) { return; }
        try {
            ensureChannel(context);
            String title = clamp(intent.getStringExtra(ReminderScheduler.EXTRA_TITLE), "上课提醒", 120);
            String text = clamp(intent.getStringExtra(ReminderScheduler.EXTRA_TEXT), "", 800);
            long atMs = intent.getLongExtra(ReminderScheduler.EXTRA_AT_MS, 0L);
            int id = intent.getIntExtra(ReminderScheduler.EXTRA_CODE, 1001);
            post(context, id, title, text, atMs);
        } catch (Throwable t) {
            // 闹钟到点时进程可能刚被拉起，任何异常都不能让系统弹「应用已停止运行」
            Log.w(TAG, "显示课前提醒失败", t);
        }
    }

    /** 建通知渠道（已存在时是空操作，不会覆盖用户改过的重要性）。 */
    static void ensureChannel(Context ctx) {
        if (ctx == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) { return; }
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) { return; }
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription(CHANNEL_DESC);
            ch.enableVibration(true);
            ch.setShowBadge(true);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        } catch (Throwable t) {
            Log.w(TAG, "创建通知渠道失败", t);
        }
    }

    private static void post(Context ctx, int id, String title, String text, long atMs) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) { return; }

        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            b = new Notification.Builder(ctx, CHANNEL_ID);
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

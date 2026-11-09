package com.etoilezzz.allegro;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * 开机 / 应用被覆盖安装后，把提醒闹钟重新排一遍。
 *
 * AlarmManager 里的闹钟不跨重启，App 被覆盖安装时也会被系统清掉，
 * 而网页算好的提醒只活在内存里 —— 所以 ReminderScheduler 每次成功下发
 * 都会把 payload 原文存进 SharedPreferences（reminders.last），这里读回来重放。
 *
 * 两道保险：
 *   · 没有存档（用户从没开过提醒 / 主动关过）→ 直接返回，什么也不做；
 *   · 整段 catch 住：开机广播里崩一次就会变成「应用已停止运行」弹窗。
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "AbbeyRoadReminder";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null) { return; }
        try {
            String action = intent == null ? null : intent.getAction();
            if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                    && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
                return;
            }
            String json = ReminderScheduler.getLastJson(context);
            if (json == null || json.trim().length() == 0) { return; }
            // 和网页下发共用同一个静态入口：解析、取消旧闹钟、按 id 重排全部复用。
            String res = ReminderScheduler.schedule(context, json);
            Log.i(TAG, "开机重排提醒（" + action + "）：" + res);
        } catch (Throwable t) {
            Log.w(TAG, "开机重排提醒失败（忽略）", t);
        }
    }
}

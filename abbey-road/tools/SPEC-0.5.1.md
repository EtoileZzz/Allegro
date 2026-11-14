# 0.5.1 通知 / 同步改造 · 接口契约

所有改动必须遵守本文件。谁改哪个文件、对外暴露什么，以此为准。

## 1. 设置结构（`state.settings.notifications`）

```js
notifications: {
  enabled: false,          // 课前提醒总开关（已有）
  defaultOffset: 15,       // 全局提前量（已有）
  daily: {                 // 每日定时提醒（新增）
    enabled: false,
    times: ['07:30', '21:00'],  // 1–4 个，'HH:MM'
    mode: 'pending',            // 'pending' | 'always'
    skipWhenDone: true,
    includeEvents: true,
    weekdaysOnly: false
  },
  overrides: {             // 个性化覆盖（新增）
    v: 1,
    courses: {},           // courseId -> { leadMin: number }   (-1 = 关闭该课提醒)
    tasks: {},             // taskId   -> { times: string[], mute: bool, onlyWhenPending: bool }
    taskDates: {},         // legacyTaskId -> { leadHours: number } (0 = 不提醒)
    eventTypes: {}         // typeKey  -> { leadMin: number }
  },
  silent: false            // 静默同步？——不在这，属于云同步配置（见 §3）
}
```

## 2. core.js 对外新增（`AR.Store`）

| 函数 | 语义 |
|---|---|
| `notifDaily()` | 返回补全默认值后的 `notifications.daily` 对象（永不返回 null） |
| `notifOverrides()` | 返回补全后的 `notifications.overrides` |
| `courseLeadMin(courseId)` | 返回生效的提前分钟数：`overrides.courses[id].leadMin` ?? `notifications.defaultOffset`；返回 `-1` 表示该课关闭提醒 |
| `taskNotif(taskId)` | `{ times: [], mute: false, onlyWhenPending: true }` 补全后的对象 |
| `legacyTaskLeadHours(taskId)` | 数字；默认 `null`（未设置） |
| `eventTypeLeadMin(typeKey)` | 数字；默认 `null`（未设置） |
| `todoDaySum(t, dayKey)` | 当天**未删除**记录 `amount` 之和（数字） |
| `cleanOrphanOverrides()` | 清理指向已删除/不存在的记录的覆盖项；返回清理条数 |

另外：`applyMerge` 内部在合并完成时，用 `plan.maps.course` 重映射 `overrides.courses` 的 key。

## 3. sync.js 新增配置（`AR.Sync.config()` / `setConfig()`）

| 字段 | 取值 | 语义 |
|---|---|---|
| `silent` | bool，默认 false | true = 同步成功不弹提示（失败仍提示） |
| `scope` | `'all'`（默认）\| `'data'` | `'data'` = 只同步课表/任务等数据，**不上传也不合并 settings** |

`status()` 也要暴露这两个字段。

## 4. reminders.js 输出（`build(now)` 元素）

```js
{ id: string, atMs: number, title: string, text: string, channel: 'class' | 'daily' }
```

- `channel` 缺省视为 `'class'`（原生端要兼容老 payload）
- 每日提醒 id：`daily-<dateKey>-<HHMM>`
- 任务专属提醒 id：`task-<taskId>-<dateKey>-<HHMM>`
- 作业到期 id：`due-<taskId>`
- 总数 ≤ 512，按 `atMs` 升序截断

## 5. 热力图（ui.js）

- 单日数值 = `todoDaySum(t, dayKey)`（**量**，不是次数）
- 分级：有目标（`goal.target` 且 `todoRequired > 0`）→ `lv = ceil(min(1, sum/目标) * 4)` 夹到 1..4；无目标 → 用 12 周内非零日的 p25/p50/p75 阈值分四档
- 净增 ≤ 0 但有记录 → lv = 1，tooltip 标注「净增 0」
- tooltip：`<dateKey> · <N 次> · 共 <sum><unit>`

## 6. 原生契约

Android：
- payload 增加可选 `channel`；`'class'` → 渠道 `class_reminders`，`'daily'` → `daily_reminders`（IMPORTANCE_DEFAULT）
- 新增 `BootReceiver`（`BOOT_COMPLETED` + `MY_PACKAGE_REPLACED`）：从 SharedPreferences 读出上次下发的 JSON 重排闹钟
- Manifest 加 `RECEIVE_BOOT_COMPLETED`
- 新增 bridge：`openBatterySettings()`（跳电池优化白名单设置页）

Windows：
- 托盘常驻（NotifyIcon，图标 `abbeyroad.ico`），右键菜单：打开 / 立即同步 / 退出
- 关闭窗口 → 默认最小化到托盘（首次提示一次）
- 新增 bridge：`notify(title, text)` → `ShowBalloonTip`；`setAutostart(bool)` → 写/删 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\Allegro`
- 安装器增加「开机自动启动」勾选项（默认不勾），安装/卸载时同步该注册表项

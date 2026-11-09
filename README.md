# Allegro · 课表与日程

给大学生用的课表与日程管理工具。数据默认只存在本机，可选开启**端到端加密的云同步**（多设备合并，服务器只见密文）。

> 与 `Abbey Road` 的关系：**Allegro = 带云同步**的版本（独立包名 `com.etoilezzz.allegro`、独立签名）；
> `Abbey Road` 是不带云同步的旧版本。两者可以同时安装。

## 功能

- 课表：周表 / 今日 / 学期周次、单双周、调课与代课（调课后再编辑也不会丢课）
- 日程与作业：任务节奏（每天 / 每周 / 每 N 天）、打卡累计、回收站可恢复
- 课前提醒：真系统通知（Android `AlarmManager` + 通知渠道）
- 云同步：AES-256-GCM + PBKDF2-SHA256(310k) 端到端加密，记录级 LWW 合并，冲突留副本，支持历史回滚
- 跨端：Android（WebView）+ Windows（WebView2），共用同一套 Web 内核

## 目录

```
app/        Web 内核（index.html + js/ + css/），Android 与 Windows 共用
android/    Android 外壳（Java + WebView）、构建脚本、资源
windows/    Windows 外壳（C# + WebView2）与安装器
tools/      回归测试（10 个套件）、打包与发布脚本、Cloudflare 同步后端
```

## 构建

```powershell
# Android（需要 JDK 17 + Android SDK build-tools 34，见 android/build.ps1 顶部说明）
powershell -File android/build.ps1

# Windows（需要 .NET Framework 的 csc 与 WebView2 SDK，见 windows/build.ps1）
powershell -File windows/build.ps1
```

签名材料不入库（`build.local.ps1` / `*.keystore` 均在 `.gitignore` 内）。

## 测试

```powershell
node tools/test-logic.js          # 核心逻辑
node tools/verify-tasks.js        # 任务模型
node tools/verify-compat-static.js# 运行时兼容 / 静态契约
node tools/verify-sync.js         # 云同步（加解密 + CAS 冲突）
node tools/verify-shift.js        # 调课矩阵
# 其余见 tools/ver*.js
```

## 云同步后端

`tools/cloudflare/` 下是 Cloudflare Pages + D1 的同步后端（`worker.js` / `schema.sql` / 一键部署脚本），
只做「加密信封 + 版本号 CAS」的存取，不解析业务数据。

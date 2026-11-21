# Allegro · macOS Universal 构建与发布权威指南

本文档面向所有维护与自动化代理（Agents），详细记录 Allegro macOS 版本的架构原理、本地多架构编译流程、Ad-hoc 签名规范、DMG 镜像封装及 GitHub Release 资产上传规则。任何 Agent 在 macOS 环境中均可按本指南无缝复现构建与发布。

---

## 一、架构设计与技术全景

Allegro macOS 端采用极简、高效的 **Native Cocoa (Objective-C) + WKWebView** 容器架构，不引入庞大的 Electron，打包产物体积仅约 **1.1 MB**。

```
项目根目录
├── macos/
│   ├── src/
│   │   ├── AppDelegate.h / .m   # 核心窗口管理、WKWebView 容器、IPC 桥与反代
│   │   └── main.m               # 原生入口 (NSApplicationMain)
│   ├── assets/
│   │   └── AppIcon.icns         # HIG 规范 1024x1024 Retina 多尺寸 Squircle 图标
│   ├── Info.plist               # 应用元数据、DPI 感知、双显卡调度配置
│   ├── build.sh                 # 正式版多架构编译与 DMG 打包脚本
│   └── build-beta.sh            # Beta 独立版本打包脚本 (独立 Bundle ID)
└── abbey-road/app/              # 跨端共享 Web 前端资源 (HTML / CSS / JS)
```

### 关键技术点
1. **Universal 2 通用二进制**：单体 Mach-O 二进制内含 `x86_64` (Intel) 与 `arm64` (Apple Silicon M1~M4) 双切片，利用 Apple `lipo` 工具合成，原生适配所有 Mac 机型。
2. **CORS 跨域反代代理 (`__nativeFetch`)**：WKWebView 在 `file://` 协议下会发送 `Origin: null` 或被同源策略阻断，导致 Cloudflare D1 同步失败。`AppDelegate.m` 内置基于 `NSURLSession` 的原生代理，强制注入 `Origin: https://abbeyroad.local` 规避跨域拦截。
3. **WebView2 垫片与双向 IPC**：注入 `window.chrome.webview.postMessage` 模拟层，使 Windows 端已有的前端桥接逻辑（剪贴板、导出、系统通知）在 Mac 下无需修改代码直接复用。
4. **Retina 与双显卡优化**：开启图层硬件加速 (`wantsLayer = YES`)，在 `Info.plist` 中启用 `NSSupportsAutomaticGraphicsSwitching: true`，在双显卡 MacBook Pro 上按需调起高性能独显，保障 60fps 流畅动效。

---

## 二、构建环境与前置依赖

- **操作系统**：macOS (10.15 Catalina 或更高版本，推荐 macOS 13+ Ventura / Sonoma / Sequoia)。
- **开发工具链**：Apple Xcode Command Line Tools (`clang`, `lipo`, `codesign`, `hdiutil`)。
  - 检查命令：`xcode-select -p`、`clang --version`。
- **发布工具**：GitHub CLI (`gh`)，需已登录具有 repo 权限的账号 (`gh auth status`)。

---

## 三、打包流程详解 (`build.sh`)

打包脚本执行 5 个核心步骤：

### 1. 编译 Intel (`x86_64`) 二进制
```bash
clang -target x86_64-apple-macos10.15 -c macos/src/AppDelegate.m -o build_tmp/AppDelegate_x86.o
clang -target x86_64-apple-macos10.15 -c macos/src/main.m -o build_tmp/main_x86.o
clang -target x86_64-apple-macos10.15 -framework Cocoa -framework WebKit -framework QuartzCore \
    build_tmp/AppDelegate_x86.o build_tmp/main_x86.o -o build_tmp/Allegro_x86
```

### 2. 编译 Apple Silicon (`arm64`) 二进制
```bash
clang -target arm64-apple-macos11.0 -c macos/src/AppDelegate.m -o build_tmp/AppDelegate_arm64.o
clang -target arm64-apple-macos11.0 -c macos/src/main.m -o build_tmp/main_arm64.o
clang -target arm64-apple-macos11.0 -framework Cocoa -framework WebKit -framework QuartzCore \
    build_tmp/AppDelegate_arm64.o build_tmp/main_arm64.o -o build_tmp/Allegro_arm64
```

### 3. 合成通用二进制 (Universal Binary)
```bash
lipo -create -output build_tmp/Allegro_universal build_tmp/Allegro_x86 build_tmp/Allegro_arm64
```

### 4. 组装 `.app` 目录束与 Ad-hoc 签名
```bash
APP_BUNDLE="dist/Allegro.app"
mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"

cp build_tmp/Allegro_universal "$APP_BUNDLE/Contents/MacOS/Allegro"
chmod +x "$APP_BUNDLE/Contents/MacOS/Allegro"
cp -R abbey-road/app "$APP_BUNDLE/Contents/Resources/app"
cp macos/assets/AppIcon.icns "$APP_BUNDLE/Contents/Resources/AppIcon.icns"
cp macos/Info.plist "$APP_BUNDLE/Contents/Info.plist"

# Ad-hoc 签名 (满足 Apple Silicon AMFI 内核运行要求，无需 Apple ID 证书)
codesign --force --deep --sign - "$APP_BUNDLE"
codesign --verify --verbose "$APP_BUNDLE"
```

### 5. 格式化并制作 DMG 镜像
```bash
DMG_STAGING="dist/dmg_staging"
mkdir -p "$DMG_STAGING"
cp -R "$APP_BUNDLE" "$DMG_STAGING/"
ln -s /Applications "$DMG_STAGING/Applications"

# 注意：hdiutil 依赖 macOS 虚拟磁盘挂载接口，在沙盒环境运行时需开启 BypassSandbox
hdiutil create -volname "Allegro v0.5.2a" -srcfolder "$DMG_STAGING" -ov -format UDZO "dist/Allegro-v0.5.2a-mac-universal.dmg"
```

---

## 四、Release 发布规范

1. **发布资产要求**：
   - 官方 Release 资产**仅上传 Universal DMG 版本**：
     `Allegro-v<VERSION>-mac-universal.dmg`
   - 不需要上传单独的 `arm64` 或 `x64` DMG/ZIP（Universal 已经完整包含两套架构且体积仅增加 200KB）。
   - 若同步工具更新，可附带上传：`Allegro-CloudSync-Deployer.zip`。
2. **CLI 上传命令**：
   ```bash
   gh release upload "v<VERSION>" "dist/Allegro-v<VERSION>-mac-universal.dmg" --clobber
   ```
3. **沙盒与网络注意事项**：
   - 在 AI Agent 交互环境下，`hdiutil` 与 `gh release upload` 命令涉及底层磁盘挂载和外网代理通信，调用 `run_command` 时必须指定 `BypassSandbox: true`。

---

## 五、独立 Beta 版共存规范

若需为用户编译与当前正式版**共存**的测试版本，必须满足：
1. **Bundle ID 变更**：`com.etoilezzz.allegro.beta`（独立沙盒与 LocalStorage/IndexedDB，互不影响）。
2. **应用名称变更**：`Allegro Beta.app`（安装至 `/Applications` 时不覆盖正式版）。
3. **禁止上传 GitHub**：Beta 产物仅留存在本地 `dist/` 供用户直接安装调试。

package com.etoilezzz.allegro;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.AssetFileDescriptor;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.AlarmClock;
import android.provider.CalendarContract;
import android.provider.MediaStore;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Allegro · Android 外壳
 *
 * 职责很窄：用一个 WebView 承载 app/ 里的界面（两端共用同一套代码），
 * 再把「震动、剪贴板、文件读写、日历/闹钟/地图跳转、系统栏配色」这些
 * 系统能力通过 @JavascriptInterface 暴露给网页。
 *
 * 网页通过 https://abbeyroad.local/ 访问，资源全部来自 assets/web/，
 * 这样既有安全的 https 源（localStorage 可持久化），又完全离线。
 */
public class MainActivity extends Activity {

    private static final String TAG = "AbbeyRoad";
    private static final String HOST = "abbeyroad.local";
    private static final String ORIGIN = "https://" + HOST + "/";
    private static final int REQ_EXPORT = 1001;
    private static final int REQ_IMPORT = 1002;
    /** Android 13+ 通知权限（课前提醒） */
    private static final int REQ_NOTIF = 1003;

    /** 外部文件导入上限：5MB。超出就中止，绝不整读进内存。 */
    private static final long MAX_IMPORT_BYTES = 5L * 1024 * 1024;

    private static final String PREF_NOTIF_ASKED = "notif_perm_asked";
    private static final String PREF_NOTIF_ASKED_AT = "notif_perm_asked_at";

    /** 桌面卡片点进来的目标视图：today / week / import / settings */
    static final String EXTRA_VIEW = "ar_view";

    private WebView web;
    private String pendingExportContent = null;
    private String pendingExportMime = "application/json";
    private String pendingView = null;
    /** 「用 Allegro 打开」进来的文件（微信里点配置文件 → 用其他应用打开） */
    private Uri pendingOpenUri = null;
    private String pendingOpenName = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        /**
         * v0.4.0 修复（"改了没用"的元凶）：网页是从 assets 拦截出来的（https://abbeyroad.local/），
         * 以前用 LOAD_DEFAULT + 拦截响应只给 no-cache —— WebView 会把**上一版 APK 里的 JS**
         * 继续吃下去，于是新装的版本里返回逻辑 / 动画都还是旧的。
         * 现在：不读缓存 + 换版本号时再清一次，保证新资源一定生效。
         */
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setTextZoom(100);
        // 系统字号放大时不要让网页文字跟着变大（否则会撑破布局）
        try {
            s.setMinimumFontSize(1);
            s.setMinimumLogicalFontSize(1);
        } catch (Exception ignored) { }
        // 让网页拿到和系统一致的深色偏好
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            s.setForceDark(WebSettings.FORCE_DARK_OFF);
        }

        web.setBackgroundColor(Color.TRANSPARENT);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                flushPendingView();
                flushPendingOpen();
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (u != null && HOST.equals(u.getHost())) {
                    return serveAsset(u.getPath());
                }
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                // 站内导航交给 WebView，外部链接交给系统
                if (u != null && HOST.equals(u.getHost())) {
                    return false;
                }
                // A5：页面里的外链同样只放行白名单 scheme（远程 JSON 也可能被塞进 a[href]）
                String url = u == null ? "" : u.toString();
                if (!isAllowedScheme(url)) {
                    toast("不支持打开该链接");
                    return true;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url.trim())));
                } catch (Exception e) {
                    Log.w(TAG, "外部链接无法打开: " + url, e);
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                Log.i(TAG, "[web] " + m.message() + " @" + m.lineNumber());
                return true;
            }
        });

        web.addJavascriptInterface(new Bridge(), "ARBridge");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        clearWebCacheIfUpgraded();
        // 课前提醒：通知渠道必须先建好，否则（targetSdk 34）通知会被系统静静丢掉
        try {
            ReminderReceiver.ensureChannel(this);
        } catch (Throwable t) {
            Log.w(TAG, "创建通知渠道失败（忽略）", t);
        }
        registerBackGesture();
        web.loadUrl(ORIGIN + "index.html");
        pendingView = viewFromIntent(getIntent());
        captureOpenIntent(getIntent());
    }

    /**
     * 记下启动/切回前台时由系统丢过来的配置文件。
     * 微信收到的文件在自己的私有目录里，系统文件选择器看不到，
     * 所以「用其他应用打开 → Allegro」是手机上最靠谱的导入路径。
     */
    private void captureOpenIntent(Intent intent) {
        if (intent == null) { return; }
        Uri uri = null;
        String name = null;
        String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action)) {
            uri = intent.getData();
        } else if (Intent.ACTION_SEND.equals(action)) {
            Object extra = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (extra instanceof Uri) { uri = (Uri) extra; }
            name = intent.getStringExtra(Intent.EXTRA_TITLE);
        }
        if (uri == null) { return; }
        pendingOpenUri = uri;
        pendingOpenName = (name == null || name.length() == 0) ? displayNameOf(uri) : name;
    }

    /** content:// 的 lastPathSegment 往往只是一串数字，能查就查真实文件名 */
    private String displayNameOf(Uri uri) {
        try {
            android.database.Cursor c = getContentResolver().query(uri,
                    new String[]{android.provider.OpenableColumns.DISPLAY_NAME}, null, null, null);
            if (c != null) {
                try {
                    if (c.moveToFirst()) {
                        int idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                        if (idx >= 0) {
                            String n = c.getString(idx);
                            if (n != null && n.length() > 0) { return n; }
                        }
                    }
                } finally {
                    c.close();
                }
            }
        } catch (Exception ignored) { }
        return uri.getLastPathSegment();
    }

    /** 把待导入的文件读出来交给网页（读文件放到后台线程，避免卡住界面） */
    private void flushPendingOpen() {
        final Uri uri = pendingOpenUri;
        final String name = pendingOpenName;
        if (uri == null) { return; }
        pendingOpenUri = null;
        pendingOpenName = null;
        new Thread(new Runnable() {
            public void run() {
                try {
                    String text = readTextWithLimit(uri);
                    callJs("window.AR && AR.onFileText && AR.onFileText(" + q(text) + "," + q(name) + ")");
                } catch (FileTooLargeException e) {
                    toast("文件太大（>5MB），无法导入");
                } catch (Exception e) {
                    toast("读取文件失败");
                }
            }
        }).start();
    }

    /**
     * 统一的「把外部文件读成文本」入口（三处导入路径共用，不再各写一份）。
     *
     * 以前是把整份文件读进 ByteArrayOutputStream 再转 String：没有上限，
     * 大文件会抛 OutOfMemoryError —— 它不是 Exception，catch 不住，进程直接被系统杀掉。
     * 现在：先用 openAssetFileDescriptor 的长度做预检，再在循环里累加，超限立刻 abort。
     */
    private String readTextWithLimit(Uri uri) throws Exception {
        if (uri == null) { throw new IllegalArgumentException("uri is null"); }

        long declared = -1L;
        try {
            AssetFileDescriptor fd = getContentResolver().openAssetFileDescriptor(uri, "r");
            if (fd != null) {
                try {
                    declared = fd.getLength();
                } finally {
                    fd.close();
                }
            }
        } catch (Exception ignored) {
            // 很多 provider 不支持查长度（返回 UNKNOWN_LENGTH / 抛异常）——还有循环里的累加兜底
        }
        if (declared > MAX_IMPORT_BYTES) { throw new FileTooLargeException(); }

        InputStream in = null;
        try {
            in = getContentResolver().openInputStream(uri);
            if (in == null) { throw new FileNotFoundException("openInputStream returned null"); }
            int hint = declared > 0 ? (int) Math.min(declared, 65536L) : 16384;
            ByteArrayOutputStream bos = new ByteArrayOutputStream(hint);
            byte[] buf = new byte[16384];
            long total = 0L;
            int n;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > MAX_IMPORT_BYTES) { throw new FileTooLargeException(); }
                bos.write(buf, 0, n);
            }
            return new String(bos.toByteArray(), StandardCharsets.UTF_8);
        } finally {
            if (in != null) {
                try {
                    in.close();
                } catch (Exception ignored) { }
            }
        }
    }

    /** 导入文件超限（5MB）——单独一个类型，方便三处调用点给同一句提示。 */
    private static final class FileTooLargeException extends Exception {
        FileTooLargeException() { super("file larger than 5MB"); }
    }

    /** 桌面卡片可能带着「直接打开哪一屏」进来 */
    private static String viewFromIntent(Intent intent) {
        if (intent == null) { return null; }
        String v = intent.getStringExtra(EXTRA_VIEW);
        if (v == null || v.length() == 0) { return null; }
        if (!"today".equals(v) && !"week".equals(v) && !"import".equals(v) && !"settings".equals(v)) {
            return null;
        }
        return v;
    }

    /** 页面加载完成后再切视图，避免网页还没初始化 */
    private void flushPendingView() {
        final String v = pendingView;
        if (v == null) { return; }
        pendingView = null;
        callJs("window.AR && AR.onOpenView && AR.onOpenView(" + q(v) + ")");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        pendingView = viewFromIntent(intent);
        captureOpenIntent(intent);
        if (web != null) {
            flushPendingView();
            flushPendingOpen();
        }
    }

    /**
     * 换版本（versionCode / versionName 变了）就清一次 WebView 缓存：
     * 升级安装后绝不会再拿旧 APK 里的 JS / CSS。
     */
    private void clearWebCacheIfUpgraded() {
        try {
            String ver = appVersionCode() + "/" + appVersionName();
            SharedPreferences sp = getSharedPreferences("ar_prefs", Context.MODE_PRIVATE);
            if (!ver.equals(sp.getString("web_cache_ver", ""))) {
                web.clearCache(true);
                web.clearHistory();
                sp.edit().putString("web_cache_ver", ver).apply();
                Log.i(TAG, "WebView 缓存已清理：" + ver);
            }
        } catch (Exception e) {
            Log.w(TAG, "清理 WebView 缓存失败（忽略）", e);
        }
    }

    private long appVersionCode() {
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) { return pi.getLongVersionCode(); }
            return pi.versionCode;
        } catch (Exception e) {
            return 0;
        }
    }

    private String appVersionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "";
        }
    }

    /** 从 assets/web/ 读取被拦截的请求；找不到就返回真正的 404，避免整页白屏。 */
    private WebResourceResponse serveAsset(String path) {
        String rel = (path == null || path.isEmpty() || "/".equals(path)) ? "index.html" : path.substring(1);
        if (rel.endsWith("/")) {
            rel = rel + "index.html";
        }
        String mime = mimeOf(rel);
        // 同一份响应头：命中和 404 都复用（404 也别让 WebView 缓存）
        java.util.Map<String, String> headers = new java.util.HashMap<String, String>();
        headers.put("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
        headers.put("Pragma", "no-cache");
        headers.put("Expires", "0");
        /**
         * 大资源（图片 / 字体 / 媒体）走流式，不再整读进内存 —— 现在的界面只有
         * 十来个文本文件还不明显，一旦加进图片/字体，每个请求两份拷贝会拖慢首屏
         * 并抬高峰值内存。文本类仍走下面的缓冲分支（本来就要 no-store，体积也小）。
         * 注意：assets 被压缩时 openFd 会失败，这时必须回退，不能报错。
         */
        if (!isTextAsset(rel)) {
            try {
                AssetFileDescriptor fd = getAssets().openFd("web/" + rel);
                WebResourceResponse rs = new WebResourceResponse(mime, null, fd.createInputStream());
                rs.setResponseHeaders(headers);
                return rs;
            } catch (Exception ignore) {
                // 压缩存储 / 不存在 → 落到下面的缓冲读取（或 404）
            }
        }
        try {
            InputStream in = getAssets().open("web/" + rel);
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) {
                bos.write(buf, 0, n);
            }
            in.close();
            WebResourceResponse r = new WebResourceResponse(mime, "UTF-8",
                    new ByteArrayInputStream(bos.toByteArray()));
            r.setResponseHeaders(headers);
            return r;
        } catch (Exception e) {
            Log.w(TAG, "资源缺失: " + rel);
            // 3 参构造默认是 HTTP 200 + 文本 "404"：缺 JS 时会被当脚本执行（SyntaxError），
            // 缺 index.html 会直接显示「404」字样。这里用 6 参构造给出真正的 404。
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", headers,
                    new ByteArrayInputStream("404 Not Found".getBytes(StandardCharsets.UTF_8)));
        }
    }

    /** 文本类资源（走缓冲 + no-store）；其余按「大资源」流式处理 */
    private static boolean isTextAsset(String rel) {
        String p = rel.toLowerCase(Locale.US);
        return p.endsWith(".html") || p.endsWith(".htm") || p.endsWith(".css")
                || p.endsWith(".js") || p.endsWith(".json")
                || p.endsWith(".txt") || p.endsWith(".md");
    }

    private static String mimeOf(String rel) {
        String p = rel.toLowerCase(Locale.US);
        if (p.endsWith(".html") || p.endsWith(".htm")) return "text/html";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".txt") || p.endsWith(".md")) return "text/plain";
        return "application/octet-stream";
    }

    // ---------------------------------------------------------------- 桥

    /** 暴露给网页的本地能力，方法名与 windows/Bridge.cs 保持一致。 */
    private class Bridge {

        @JavascriptInterface
        public String platform() {
            return "android";
        }

        @JavascriptInterface
        public int sdkInt() {
            return Build.VERSION.SDK_INT;
        }

        @JavascriptInterface
        public String deviceName() {
            return (Build.MANUFACTURER + " " + Build.MODEL).trim();
        }

        @JavascriptInterface
        public String appVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "0.1.0";
            }
        }

        /** 重要操作震动：ms 时长，amp 振幅（1-255，0 表示用系统默认）。 */
        @JavascriptInterface
        public void vibrate(final int ms, final int amp) {
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                        if (v == null || !v.hasVibrator()) return;
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            int amplitude = amp <= 0 ? VibrationEffect.DEFAULT_AMPLITUDE : amp;
                            v.vibrate(VibrationEffect.createOneShot(ms, amplitude));
                        } else {
                            v.vibrate(ms);
                        }
                    } catch (Exception e) {
                        Log.w(TAG, "vibrate failed", e);
                    }
                }
            });
        }

        @JavascriptInterface
        public void copy(final String text) {
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                        cm.setPrimaryClip(ClipData.newPlainText("Allegro", text));
                        toast("已复制");
                    } catch (Exception e) {
                        toast("复制失败");
                    }
                }
            });
        }

        @JavascriptInterface
        public void toast(final String msg) {
            runOnUiThread(new Runnable() {
                public void run() {
                    Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void shareText(final String title, final String text) {
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        Intent i = new Intent(Intent.ACTION_SEND);
                        i.setType("text/plain");
                        i.putExtra(Intent.EXTRA_SUBJECT, title);
                        i.putExtra(Intent.EXTRA_TEXT, text);
                        startActivity(Intent.createChooser(i, "分享到"));
                    } catch (Exception e) {
                        toast("没有可用的分享目标");
                    }
                }
            });
        }

        @JavascriptInterface
        public boolean canHandle(String url) {
            try {
                Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                return i.resolveActivity(getPackageManager()) != null;
            } catch (Exception e) {
                return false;
            }
        }

        /**
         * 「导出到微信」：先把配置文件写进系统「下载 / Allegro」目录，
         * 再用 ACTION_SEND 拉起系统分享面板 —— 选微信就是发文件，选别的 App 也一样能用。
         *
         * 为什么先落盘：分享面板拿 content:// 地址才能把文件真发出去；
         * 只发文本的话，几十 KB 的配置在聊天里既难读也容易被编辑器改坏。
         * Android 10（API 29）以下没有 MediaStore.Downloads，降级成分享文本。
         */
        @JavascriptInterface
        public void shareFile(final String fileName, final String content, final String mime, final String title) {
            final String type = (mime == null || mime.length() == 0) ? "application/json" : mime;
            // A6：写盘（MediaStore insert + 全量写）以前在 runOnUiThread 里做，
            // 配置大时掉帧甚至 ANR；现在整段挪到后台线程，写完再回主线程拉分享面板。
            new Thread(new Runnable() {
                public void run() {
                    final Uri uri = writeToDownloads(fileName, content, type);
                    runOnUiThread(new Runnable() {
                        public void run() {
                            try {
                                Intent i = new Intent(Intent.ACTION_SEND);
                                i.putExtra(Intent.EXTRA_SUBJECT, title == null ? "Allegro 课表配置" : title);
                                if (uri != null) {
                                    i.setType("*/*");                          // 微信等 App 只认通用类型
                                    i.putExtra(Intent.EXTRA_STREAM, uri);
                                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                } else {
                                    i.setType("text/plain");
                                    i.putExtra(Intent.EXTRA_TEXT, content == null ? "" : content);
                                }
                                startActivity(Intent.createChooser(i, "导出到微信 / 分享"));
                            } catch (Exception e) {
                                toast("没有可用的分享目标");
                            }
                        }
                    });
                }
            }).start();
        }

        /** Android 10+：写进「下载/Allegro」，返回可分享的 content:// 地址；失败返回 null */
        private Uri writeToDownloads(String fileName, String content, String mime) {
            if (Build.VERSION.SDK_INT < 29 || content == null) { return null; }
            Uri uri = null;
            OutputStream os = null;
            boolean ok = false;
            try {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.MediaColumns.DISPLAY_NAME,
                        (fileName == null || fileName.length() == 0) ? "Allegro-backup.json" : fileName);
                cv.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Allegro");
                uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) { return null; }
                os = getContentResolver().openOutputStream(uri);
                if (os == null) { return null; }
                os.write(content.getBytes(StandardCharsets.UTF_8));
                os.flush();
                ok = true;
                return uri;
            } catch (Exception e) {
                Log.w(TAG, "写入下载目录失败", e);
                return null;
            } finally {
                if (os != null) {
                    try {
                        os.close();
                    } catch (Exception ignored) { }
                }
                // 写失败时别在用户目录里留一个 0 字节文件
                if (!ok && uri != null) {
                    try {
                        getContentResolver().delete(uri, null, null);
                    } catch (Exception ignored) { }
                }
            }
        }

        @JavascriptInterface
        public void openUrl(final String url) {
            // A5：调用方传的是远程 GitHub API JSON 里的 url（没有证书固定），
            // 不加白名单的话 MITM 就能用它拉起任意组件。
            if (!isAllowedScheme(url)) {
                toast("不支持打开该链接");
                return;
            }
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url.trim()));
                        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(i);
                    } catch (Exception e) {
                        toast("无法打开链接");
                    }
                }
            });
        }

        /* ── 课前提醒（A1）──────────────────────────────────────── */

        /**
         * 排程课前提醒：先取消上一轮全部提醒，再按 json 逐条 set。
         * 同一 id 的 hashCode 就是 requestCode，所以重复下发会自动覆盖旧闹钟。
         *
         * @param json 形如 [{"id":"c1-block1-202610200800","atMs":1760918400000,
         *                    "title":"高等数学","text":"08:00 · 信息楼 305"}]
         * @return "ok" 或 "error: ..."（不抛异常，坏 JSON 只会返回 error）
         */
        @JavascriptInterface
        public String scheduleReminders(final String json) {
            try {
                String res = ReminderScheduler.schedule(MainActivity.this, json);
                // 排程不依赖通知权限；权限只影响「弹不弹」。第一次排提醒时顺便问一次。
                ensureNotificationPermission(false);
                return res;
            } catch (Throwable t) {
                Log.w(TAG, "排程课前提醒失败", t);
                return "error: " + t.getClass().getSimpleName();
            }
        }

        /** 取消全部课前提醒（关闭提醒开关 / 清空课表时调用）。 */
        @JavascriptInterface
        public String cancelReminders() {
            try {
                return ReminderScheduler.cancelAll(MainActivity.this);
            } catch (Throwable t) {
                Log.w(TAG, "取消课前提醒失败", t);
                return "error: " + t.getClass().getSimpleName();
            }
        }

        /**
         * 用户在设置里「主动」打开课前提醒时调用：允许再弹一次通知权限框
         * （自动流程最多只问一次，被拒绝后不会自己反复骚扰）。
         */
        @JavascriptInterface
        public String requestNotificationPermission() {
            if (Build.VERSION.SDK_INT < 33) { return "ok"; }
            ensureNotificationPermission(true);
            return "ok";
        }

        /**
         * 导航：按「用户偏好 → 系统地图 → 浏览器」的意图阶梯逐级降级。
         * pref: system / amap / baidu
         */
        @JavascriptInterface
        public void openMap(final String pref, final String keyword, final String webFallback) {
            runOnUiThread(new Runnable() {
                public void run() {
                    String kw = Uri.encode(keyword);
                    List<Intent> ladder = new ArrayList<Intent>();
                    if ("amap".equals(pref)) {
                        Intent a1 = new Intent(Intent.ACTION_VIEW,
                                Uri.parse("androidamap://keywordNavi?keyword=" + kw + "&style=2"));
                        a1.setPackage("com.autonavi.minimap");
                        ladder.add(a1);
                        Intent a2 = new Intent(Intent.ACTION_VIEW,
                                Uri.parse("amapuri://route/plan/?dname=" + kw + "&dev=0&t=0"));
                        a2.setPackage("com.autonavi.minimap");
                        ladder.add(a2);
                    } else if ("baidu".equals(pref)) {
                        Intent b1 = new Intent(Intent.ACTION_VIEW,
                                Uri.parse("baidumap://map/geocoder?src=abbeyroad&address=" + kw));
                        b1.setPackage("com.baidu.BaiduMap");
                        ladder.add(b1);
                    }
                    ladder.add(new Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=" + kw)));
                    if (webFallback != null && webFallback.length() > 0) {
                        ladder.add(new Intent(Intent.ACTION_VIEW, Uri.parse(webFallback)));
                    }
                    for (Intent i : ladder) {
                        try {
                            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(i);
                            return;
                        } catch (Exception ignored) {
                        }
                    }
                    toast("没有可用的地图应用，已复制地址：" + keyword);
                }
            });
        }

        /**
         * 设置闹钟阶梯：ACTION_SET_ALARM（预填，用户确认）→ 打开时钟 → 提示。
         */
        @JavascriptInterface
        public void setAlarm(final int hour, final int minute, final String message) {
            runOnUiThread(new Runnable() {
                public void run() {
                    // ① 标准闹钟 Intent（不需要 resolveActivity 预检：Android 11+ 包可见性会返回 null）
                    try {
                        Intent i = new Intent(AlarmClock.ACTION_SET_ALARM);
                        i.putExtra(AlarmClock.EXTRA_HOUR, hour);
                        i.putExtra(AlarmClock.EXTRA_MINUTES, minute);
                        i.putExtra(AlarmClock.EXTRA_MESSAGE, message);
                        i.putExtra(AlarmClock.EXTRA_SKIP_UI, false);
                        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(i);
                        return;
                    } catch (Exception e) {
                        Log.w(TAG, "SET_ALARM 失败", e);
                    }
                    // ② 只是打开时钟
                    try {
                        Intent show = new Intent(AlarmClock.ACTION_SHOW_ALARMS);
                        show.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(show);
                        toast("已打开时钟，请手动新建闹钟");
                        return;
                    } catch (Exception e2) {
                        Log.w(TAG, "SHOW_ALARMS 失败", e2);
                    }
                    // ③ 直接拉起各家的时钟 App
                    String[] clocks = {"com.oplus.alarmclock", "com.coloros.alarmclock",
                            "com.android.deskclock", "com.google.android.deskclock"};
                    for (String pkg : clocks) {
                        if (launchPackage(pkg)) {
                            toast("已打开时钟，请手动新建闹钟 " + pad(hour) + ":" + pad(minute));
                            return;
                        }
                    }
                    // ④ 兜底：复制时间
                    copyText(pad(hour) + ":" + pad(minute) + " " + message);
                    toast("本机时钟不支持跳转，已复制时间 " + pad(hour) + ":" + pad(minute));
                }
            });
        }

        /**
         * 系统日历阶梯：ACTION_INSERT（预填，用户点保存）→ 打开日历 → 提示复制。
         * beginMs / endMs 为毫秒时间戳。
         */
        @JavascriptInterface
        public void addCalendarEvent(final String title, final String location,
                                     final String description, final long beginMs, final long endMs) {
            runOnUiThread(new Runnable() {
                public void run() {
                    // ① 标准 ACTION_INSERT（预填，用户点保存）
                    try {
                        Intent i = new Intent(Intent.ACTION_INSERT);
                        i.setData(CalendarContract.Events.CONTENT_URI);
                        i.putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, beginMs);
                        i.putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endMs);
                        i.putExtra(CalendarContract.Events.TITLE, title);
                        i.putExtra(CalendarContract.Events.EVENT_LOCATION, location);
                        i.putExtra(CalendarContract.Events.DESCRIPTION, description);
                        i.putExtra(CalendarContract.Events.EVENT_TIMEZONE, TimeZone.getDefault().getID());
                        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(i);
                        return;
                    } catch (Exception e) {
                        Log.w(TAG, "ACTION_INSERT 失败", e);
                    }
                    // ② 有的 ROM 只认 INSERT_OR_EDIT
                    try {
                        Intent i2 = new Intent(Intent.ACTION_INSERT_OR_EDIT);
                        i2.setType("vnd.android.cursor.item/event");
                        i2.putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, beginMs);
                        i2.putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endMs);
                        i2.putExtra(CalendarContract.Events.TITLE, title);
                        i2.putExtra(CalendarContract.Events.EVENT_LOCATION, location);
                        i2.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(i2);
                        return;
                    } catch (Exception e2) {
                        Log.w(TAG, "INSERT_OR_EDIT 失败", e2);
                    }
                    // ③ 跳到日历的某一天
                    try {
                        Intent view = new Intent(Intent.ACTION_VIEW,
                                Uri.parse("content://com.android.calendar/time/" + beginMs));
                        view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(view);
                        toast("日历不支持预填，已跳到当天，请手动新建");
                        return;
                    } catch (Exception e3) {
                        Log.w(TAG, "日历 VIEW 失败", e3);
                    }
                    // ④ 直接拉起各家日历 App
                    String[] cals = {"com.oplus.calendar", "com.coloros.calendar",
                            "com.android.calendar", "com.google.android.calendar"};
                    for (String pkg : cals) {
                        if (launchPackage(pkg)) {
                            toast("已打开日历，请手动新建事件");
                            return;
                        }
                    }
                    copyText(title + " " + location);
                    toast("本机日历不支持跳转，已复制事件信息");
                }
            });
        }

        /** 导出文本（JSON / Markdown）：调用系统「新建文件」选择器。 */
        @JavascriptInterface
        public void exportText(final String fileName, final String content, final String mime) {
            runOnUiThread(new Runnable() {
                public void run() {
                    String type = (mime == null || mime.length() == 0) ? "application/json" : mime;
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType(type);
                    i.putExtra(Intent.EXTRA_TITLE, fileName);
                    // 选择器不可用（个别系统会这样）时不要静默失败：直接存到「下载 / Allegro」
                    if (i.resolveActivity(getPackageManager()) == null) {
                        fallbackSave(fileName, content, type);
                        return;
                    }
                    try {
                        pendingExportContent = content;
                        pendingExportMime = type;
                        startActivityForResult(i, REQ_EXPORT);
                    } catch (Exception e) {
                        fallbackSave(fileName, content, type);
                    }
                }
            });
        }

        /** 选择器用不了时的兜底：写进「下载 / Allegro」并告诉用户文件名（写盘在后台线程） */
        private void fallbackSave(final String fileName, final String content, final String mime) {
            new Thread(new Runnable() {
                public void run() {
                    final Uri uri = writeToDownloads(fileName, content, mime);
                    runOnUiThread(new Runnable() {
                        public void run() {
                            if (uri != null) {
                                toast("已保存到「下载 / Allegro」：" + fileName);
                            } else {
                                toast("导出失败，请在「数据与备份」里再试一次");
                            }
                        }
                    });
                }
            }).start();
        }

        /** 导入文本：调用系统「打开文件」选择器，读完后回调网页。 */
        @JavascriptInterface
        public void importText() {
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                        i.addCategory(Intent.CATEGORY_OPENABLE);
                        i.setType("*/*");
                        // 只挑文件、不要目录；把 .json 可能被识别成的几种类型都列上，
                        // 否则某些系统文件管理器会把刚导出的配置文件过滤掉。
                        i.putExtra(Intent.EXTRA_MIME_TYPES,
                                new String[]{"application/json", "application/x-json", "application/octet-stream",
                                        "text/plain", "text/markdown", "text/*"});
                        startActivityForResult(i, REQ_IMPORT);
                    } catch (Exception e) {
                        toast("无法打开文件选择器");
                    }
                }
            });
        }

        /**
         * 列出 App 自己导出的配置文件（「下载 / Allegro」目录）。
         * 有些系统的文件选择器很难用（比如找不到刚导出的文件），
         * 这里给网页一份可直接导入的清单，完全绕开系统选择器。
         * 返回 JSON 数组字符串：[{name, uri, size, modified}]
         */
        @JavascriptInterface
        public String listExports() {
            if (Build.VERSION.SDK_INT < 29) { return "[]"; }
            StringBuilder sb = new StringBuilder("[");
            android.database.Cursor c = null;
            try {
                Uri collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                String[] cols = {MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME,
                        MediaStore.MediaColumns.SIZE, MediaStore.MediaColumns.DATE_MODIFIED,
                        MediaStore.MediaColumns.RELATIVE_PATH};
                /**
                 * 两个目录都匹配：新版写「下载/Allegro」，但用户从**旧版**导出的备份
                 * 在「下载/Abbey Road」里 —— 改名之后还要能列出并一键导入那些旧文件，
                 * 否则「旧版导出 → 装新版 → 导入」这条迁移路径就断了。
                 */
                String sel = "(" + MediaStore.MediaColumns.RELATIVE_PATH + " LIKE ? OR "
                        + MediaStore.MediaColumns.RELATIVE_PATH + " LIKE ?)";
                String[] args = new String[]{
                        Environment.DIRECTORY_DOWNLOADS + "/Allegro%",
                        Environment.DIRECTORY_DOWNLOADS + "/Abbey Road%"
                };
                c = getContentResolver().query(collection, cols, sel, args,
                        MediaStore.MediaColumns.DATE_MODIFIED + " DESC");
                boolean first = true;
                while (c != null && c.moveToNext()) {
                    long id = c.getLong(0);
                    String name = c.getString(1);
                    long size = c.getLong(2);
                    long modified = c.getLong(3);
                    if (name == null || name.length() == 0) { continue; }
                    if (!first) { sb.append(','); }
                    first = false;
                    sb.append("{\"name\":").append(JSONObject.quote(name))
                      .append(",\"uri\":").append(JSONObject.quote(
                              android.content.ContentUris.withAppendedId(collection, id).toString()))
                      .append(",\"size\":").append(size)
                      .append(",\"modified\":").append(modified * 1000L).append('}');
                }
            } catch (Exception e) {
                return "[]";
            } finally {
                if (c != null) { c.close(); }
            }
            return sb.append(']').toString();
        }

        /** 读取一个 content:// 文件的文本（给上面的清单用；失败返回空串） */
        @JavascriptInterface
        public String readTextUri(final String uriText) {
            if (uriText == null || uriText.length() == 0) { return ""; }
            try {
                return readTextWithLimit(Uri.parse(uriText));
            } catch (FileTooLargeException e) {
                toast("文件太大（>5MB），无法读取");
                return "";
            } catch (Exception e) {
                return "";
            }
        }

        /** 系统声音（Windows 端用真实音效，Android 端留给系统反馈，这里只做提示音兜底）。 */
        @JavascriptInterface
        public void beep() {
            // Android 端不额外发声，避免打扰；震动已经提供了触觉反馈。
        }

        /** 由网页决定何时真正退出（例如不在任何弹窗中时按返回键）。 */
        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(new Runnable() {
                public void run() {
                    finish();
                }
            });
        }

        /**
         * 桌面卡片的数据同步：网页把渲染好的课表快照交过来，
         * 这里落盘 + 立即刷新所有卡片实例。
         */
        @JavascriptInterface
        public void syncWidget(final String json) {
            if (json == null || json.length() == 0) { return; }
            try {
                getSharedPreferences(WidgetData.PREFS, Context.MODE_PRIVATE)
                        .edit().putString("payload", json).apply();
            } catch (Exception ignored) { }
            final Context ctx = MainActivity.this;
            new Thread(new Runnable() {
                public void run() {
                    try {
                        WidgetRenderer.refresh(ctx);
                    } catch (Exception e) {
                        Log.w(TAG, "桌面卡片刷新失败", e);
                    }
                }
            }).start();
        }

        /**
         * 开发用：把 5 种卡片按真实 RemoteViews 渲染成 PNG，
         * 写到 App 外部私有目录（Android/data/<pkg>/files/widget-preview/），
         * 方便在没有桌面宿主的环境里核对排版。用户正常使用不会触发。
         */
        @JavascriptInterface
        public String devWidgetPreview() {
            final Context ctx = MainActivity.this;
            try {
                return WidgetPreview.dump(ctx);
            } catch (Exception e) {
                Log.w(TAG, "卡片预览渲染失败", e);
                return "ERR: " + e;
            }
        }

        /** 让网页跟随主题调整状态栏/导航栏颜色与图标明暗。 */
        @JavascriptInterface
        public void setSystemBars(final String hexColor, final boolean lightIcons) {
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        int c = Color.parseColor(hexColor);
                        Window w = getWindow();
                        w.setStatusBarColor(c);
                        w.setNavigationBarColor(c);
                        View decor = w.getDecorView();
                        int flags = decor.getSystemUiVisibility();
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            flags = lightIcons
                                    ? (flags | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR)
                                    : (flags & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
                        }
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            flags = lightIcons
                                    ? (flags | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR)
                                    : (flags & ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
                        }
                        decor.setSystemUiVisibility(flags);
                    } catch (Exception ignored) {
                    }
                }
            });
        }
    }

    private static String pad(int v) {
        return v < 10 ? "0" + v : String.valueOf(v);
    }

    /**
     * 只放行这几种 scheme：远程 JSON 里的 url 不可信，
     * 白名单之外（intent:、file:、content:、javascript:…）一律不拉起。
     */
    private static boolean isAllowedScheme(String url) {
        if (url == null) { return false; }
        String u = url.trim();
        if (u.length() == 0) { return false; }
        for (int i = 0; i < u.length(); i++) {
            char c = u.charAt(i);
            if (c <= 0x20 || c == 0x7f) { return false; }   // 空白/控制字符：拒绝
        }
        int colon = u.indexOf(':');
        if (colon <= 0) { return false; }
        String scheme = u.substring(0, colon).toLowerCase(Locale.US);
        return "http".equals(scheme)
                || "https".equals(scheme)
                || "mailto".equals(scheme)
                || "tel".equals(scheme)
                || "geo".equals(scheme);
    }

    /** 直接按包名拉起 App（拿不到入口就返回 false，不抛异常）。 */
    private boolean launchPackage(String pkg) {
        try {
            Intent i = getPackageManager().getLaunchIntentForPackage(pkg);
            if (i == null) { return false; }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** 跳转全部失败时的兜底：把内容复制到剪贴板。 */
    private void copyText(String text) {
        try {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            cm.setPrimaryClip(ClipData.newPlainText("Allegro", text));
        } catch (Exception ignored) { }
    }

    /** 外层工具提示（内部类 Bridge 也有同名方法，供网页直接调用）。 */
    private void toast(final String msg) {
        runOnUiThread(new Runnable() {
            public void run() {
                Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show();
            }
        });
    }

    /**
     * Android 13+ 的通知权限（A1）。
     *
     * explicit = false（自动流程，例如网页下发提醒时）：只问一次，结果记进
     * SharedPreferences；用户拒绝后不再自动弹第二次。
     * explicit = true（用户在设置里主动打开「课前提醒」）：允许再问一次。
     *
     * 拒绝时什么都不做（提醒照常排程，只是到点不弹通知），绝不崩、不反复骚扰。
     */
    private void ensureNotificationPermission(final boolean explicit) {
        if (Build.VERSION.SDK_INT < 33) { return; }
        try {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED) {
                return;
            }
            SharedPreferences sp = getSharedPreferences("ar_prefs", Context.MODE_PRIVATE);
            boolean asked = sp.getBoolean(PREF_NOTIF_ASKED, false);
            long lastAt = sp.getLong(PREF_NOTIF_ASKED_AT, 0L);
            long now = System.currentTimeMillis();
            if (explicit) {
                // 连点两下开关时不要叠两个系统弹窗
                if (now - lastAt < 1500L) { return; }
            } else if (asked) {
                return;
            }
            sp.edit().putBoolean(PREF_NOTIF_ASKED, true)
                    .putLong(PREF_NOTIF_ASKED_AT, now).apply();
            // requestPermissions 必须在主线程
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
                    } catch (Throwable t) {
                        Log.w(TAG, "请求通知权限失败", t);
                        toast("通知权限未开启，请到系统设置里允许 Allegro 发送通知");
                    }
                }
            });
        } catch (Throwable t) {
            Log.w(TAG, "通知权限流程异常（忽略）", t);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQ_NOTIF) { return; }
        boolean granted = grantResults != null && grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (granted) {
            // 权限刚拿到：渠道再确认一次，随后到点的提醒才会真正弹出
            try {
                ReminderReceiver.ensureChannel(this);
            } catch (Throwable ignored) { }
            toast("已允许通知，课前提醒会准时送达");
        } else {
            toast("未允许通知：课前提醒不会弹出，可到系统设置里开启");
        }
    }

    /** 统一的「回调网页」入口：把结果作为参数传给 window.AR 上的处理函数。 */
    private void callJs(final String js) {
        runOnUiThread(new Runnable() {
            public void run() {
                if (web != null) {
                    web.evaluateJavascript(js, null);
                }
            }
        });
    }

    private static String q(String s) {
        return JSONObject.quote(s == null ? "" : s);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == REQ_EXPORT) {
            if (resultCode != RESULT_OK || data == null || data.getData() == null) {
                // 用户取消 / 选择器没给地址：清掉待写内容，别留给下一次
                pendingExportContent = null;
                pendingExportMime = "application/json";
                return;
            }
            Uri uri = data.getData();
            // 先取走内容再判空：进程被回收后重建时字段是 null，
            // 此时绝不能 openOutputStream —— 那会先创建/清空文件，留下 0 字节备份。
            String content = pendingExportContent;
            pendingExportContent = null;
            if (content == null) {
                toast("导出内容已丢失，请重新导出");
                // 选择器已经建过目标文件了，删掉它，别留空文件
                try {
                    getContentResolver().delete(uri, null, null);
                } catch (Exception ignored) { }
                return;
            }
            OutputStream os = null;
            boolean ok = false;
            try {
                os = getContentResolver().openOutputStream(uri);
                if (os == null) { throw new IOException("openOutputStream returned null"); }
                os.write(content.getBytes(StandardCharsets.UTF_8));
                os.flush();
                ok = true;
            } catch (Exception e) {
                Log.w(TAG, "导出写入失败", e);
                toast("写入文件失败");
            } finally {
                // 任何路径都要关流（以前 os.close() 只在成功路径上）
                if (os != null) {
                    try {
                        os.close();
                    } catch (Exception ignored) { }
                }
            }
            if (ok) {
                toast("已保存：" + uri.getLastPathSegment());
                callJs("window.AR && AR.onExported && AR.onExported(" + q(uri.getLastPathSegment()) + ")");
            } else {
                // 写失败：删掉刚被创建/清空的空文件
                try {
                    getContentResolver().delete(uri, null, null);
                } catch (Exception ignored) { }
            }
            return;
        }

        if (requestCode == REQ_IMPORT && resultCode == RESULT_OK && data != null && data.getData() != null) {
            final Uri uri = data.getData();
            final String name = uri.getLastPathSegment();
            // 读文件（可能几 MB）不放主线程，读完再回调网页
            new Thread(new Runnable() {
                public void run() {
                    try {
                        final String text = readTextWithLimit(uri);
                        callJs("window.AR && AR.onFileText && AR.onFileText(" + q(text) + "," + q(name) + ")");
                    } catch (FileTooLargeException e) {
                        toast("文件太大（>5MB），无法导入");
                    } catch (Exception e) {
                        toast("读取文件失败");
                    }
                }
            }).start();
        }
    }

    /**
     * Android 13+ 的「侧滑返回」：注册 OnBackInvokedCallback，
     * 和返回键 / Esc 走同一个处理函数 —— 保证侧滑也是"一层一层退"。
     * （清单里的 enableOnBackInvokedCallback 打开后，系统手势才会走这里。）
     */
    private void registerBackGesture() {
        if (Build.VERSION.SDK_INT < 33) { return; }
        try {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                new android.window.OnBackInvokedCallback() {
                    @Override
                    public void onBackInvoked() {
                        handleBack();
                    }
                });
        } catch (Throwable e) {
            Log.w(TAG, "注册返回手势失败（退回 onBackPressed）", e);
        }
    }

    /** 交给网页决定：先关弹窗 → 回上一屏（设置二级页先回设置首页）→ 都没有才退出 */
    private void handleBack() {
        callJs("window.AR && AR.onBack && AR.onBack()");
    }

    @Override
    public void onBackPressed() {
        handleBack();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        callJs("window.AR && AR.onResize && AR.onResize()");
    }

    @Override
    protected void onResume() {
        super.onResume();
        // 回到前台：网页侧据此刷新时钟，并在跨天时自动跟到新的「今天」
        callJs("window.AR && AR.onResume && AR.onResume()");
    }
}

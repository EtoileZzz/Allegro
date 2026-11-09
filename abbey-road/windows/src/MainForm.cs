using System;
using System.Drawing;
using System.IO;
using System.Text;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Allegro
{
    /// <summary>
    /// 主窗口：一个 WebView2 承载 app/ 里的界面（与 Android 完全同一套代码），
    /// 原生能力通过 WebBridge 暴露给网页。
    /// </summary>
    public class MainForm : Form
    {
        private WebView2 _web;
        private WebBridge _bridge;
        private bool _dark;
        private string _selfTestPath;
        private string _webRoot;

        // Tray support: the window lives in the tray by default, so the app keeps
        // running (and keeps its sync/reminder timers alive) after the user closes it.
        private NotifyIcon _tray;
        private Icon _trayIcon;
        private bool _trayIconOwned;     // false when the icon is a shared SystemIcons one
        private bool _reallyExit;        // set by the tray "退出" item -> close for real
        private bool _trayHintShown;     // the "minimized to tray" balloon is shown only once

        public MainForm(string[] args)
        {
            // --selftest <文件>：构建自检，加载界面 → 跑探针 → 写结果 → 退出
            if (args != null)
            {
                for (int i = 0; i < args.Length; i++)
                {
                    if (string.Equals(args[i], "--selftest", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
                    {
                        _selfTestPath = args[i + 1];
                    }
                }
            }
            Text = AppPaths.Product + " · 课表与日程";
            // 清单声明 PerMonitorV2 后，这里的像素值就是物理像素；按系统缩放折算，
            // 保持与旧版（DPI 拉伸时）完全一致的窗口大小与内部排布，只是不再发糊
            float s;
            using (System.Drawing.Graphics g = System.Drawing.Graphics.FromHwnd(IntPtr.Zero))
            {
                s = g.DpiX / 96f;
            }
            Width = (int)Math.Round(1320 * s);
            Height = (int)Math.Round(860 * s);
            MinimumSize = new Size((int)Math.Round(900 * s), (int)Math.Round(620 * s));
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.White;
            KeyPreview = true;

            try
            {
                string ico = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "abbeyroad.ico");
                if (System.IO.File.Exists(ico)) { Icon = new Icon(ico); }
            }
            catch (Exception) { }

            CreateTray();
        }

        /// <summary>
        /// Tray icon + menu: open / sync now / quit. Double click also opens the window.
        /// The icon comes from abbeyroad.ico next to the exe; SystemIcons.Application
        /// is the fallback when the ico is missing or unreadable.
        /// </summary>
        private void CreateTray()
        {
            try
            {
                ContextMenuStrip menu = new ContextMenuStrip();
                menu.Items.Add("打开", null, delegate { ShowMainWindow(); });
                menu.Items.Add("立即同步", null, delegate { RequestSync(); });
                menu.Items.Add("退出", null, delegate { ExitForReal(); });

                _trayIcon = LoadTrayIcon(out _trayIconOwned);
                _tray = new NotifyIcon();
                _tray.Icon = _trayIcon;
                _tray.Text = AppPaths.Product + " · 课表与日程";
                _tray.ContextMenuStrip = menu;
                _tray.Visible = true;
                _tray.DoubleClick += delegate { ShowMainWindow(); };
            }
            catch (Exception ex)
            {
                // A tray-less app is still usable, just not resident.
                Log.Write("托盘图标创建失败：" + ex.Message);
            }
        }

        /// <summary>abbeyroad.ico next to the exe, otherwise the generic app icon.</summary>
        private static Icon LoadTrayIcon(out bool owned)
        {
            owned = false;
            try
            {
                string ico = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "abbeyroad.ico");
                if (File.Exists(ico))
                {
                    owned = true;
                    return new Icon(ico);
                }
            }
            catch (Exception) { owned = false; }
            return SystemIcons.Application;
        }

        /// <summary>Show, restore and activate the main window (tray "打开" / double click).</summary>
        public void ShowMainWindow()
        {
            try
            {
                Show();
                if (WindowState == FormWindowState.Minimized) { WindowState = FormWindowState.Normal; }
                Activate();
                BringToFront();
            }
            catch (Exception) { }
        }

        /// <summary>Tray "立即同步": ask the page to run its own sync, no reply expected.</summary>
        private void RequestSync()
        {
            try
            {
                if (_web == null || _web.CoreWebView2 == null) { return; }
                _web.CoreWebView2.ExecuteScriptAsync("try{AR.Sync&&AR.Sync.syncNow()}catch(e){}");
            }
            catch (Exception) { }
        }

        /// <summary>Tray "退出": really terminate instead of hiding to the tray.</summary>
        private void ExitForReal()
        {
            _reallyExit = true;
            try { Close(); }
            catch (Exception) { Application.Exit(); }
        }

        /// <summary>Bridge "notify(title, text)" -> tray balloon.</summary>
        public void ShowNotification(string title, string text)
        {
            try
            {
                if (_tray == null) { return; }
                if (string.IsNullOrEmpty(title)) { title = AppPaths.Product; }
                _tray.ShowBalloonTip(8000, title, text ?? "", ToolTipIcon.Info);
            }
            catch (Exception) { }
        }

        /// <summary>
        /// Closing the window hides it to the tray instead of quitting, so sync and
        /// reminders keep running. Only a user initiated close (X / Alt+F4) is turned
        /// into that: Application.Exit (--selftest, bridge "exitapp"), Windows shutdown
        /// and the forced quit must still end the process.
        /// </summary>
        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (!_reallyExit && e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                Hide();
                if (!_trayHintShown)
                {
                    _trayHintShown = true;
                    try
                    {
                        if (_tray != null)
                        {
                            _tray.ShowBalloonTip(4000, AppPaths.Product,
                                "Allegro 已最小化到托盘，右键图标可退出", ToolTipIcon.Info);
                        }
                    }
                    catch (Exception) { }
                }
                return;
            }
            base.OnFormClosing(e);
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            try
            {
                if (_tray != null)
                {
                    ContextMenuStrip menu = _tray.ContextMenuStrip;
                    _tray.Visible = false;
                    _tray.ContextMenuStrip = null;
                    _tray.Dispose();
                    _tray = null;
                    if (menu != null) { menu.Dispose(); }
                }
                // SystemIcons.Application is a shared icon, never dispose it.
                if (_trayIcon != null && _trayIconOwned)
                {
                    _trayIcon.Dispose();
                }
                _trayIcon = null;
                _trayIconOwned = false;
            }
            catch (Exception) { }
            base.OnFormClosed(e);
        }

        public void SetDark(bool dark)
        {
            _dark = dark;
            try
            {
                Native.SetDarkTitleBar(Handle, dark);
                Native.SetCaptionColor(Handle, dark);
                BackColor = dark ? Color.FromArgb(14, 17, 22) : Color.White;
            }
            catch (Exception) { }
        }

        /// <summary>网页要求关闭毛玻璃时（设置里选了"关闭"）。</summary>
        public void SetBackdropEnabled(bool enabled)
        {
            try
            {
                if (enabled) { Native.ApplyWindowChrome(Handle); }
                else { Native.DisableBackdrop(Handle); }
            }
            catch (Exception) { }
        }

        protected override void OnLoad(EventArgs e)
        {
            base.OnLoad(e);
            Log.Write("OnLoad 开始；selftest=" + (_selfTestPath ?? "-"));
            try
            {
                Native.ApplyWindowChrome(Handle);
                _webRoot = WebAssets.EnsureExtracted();
                Log.Write("界面资源就绪：" + _webRoot);

                _web = new WebView2();
                _web.Dock = DockStyle.Fill;
                Controls.Add(_web);
                // WebView2 必须在窗口真正显示之后再初始化，否则某些环境会卡住
                Shown += OnShownInit;
            }
            catch (Exception ex)
            {
                Log.Write("启动失败：" + ex);
                ShowFatal(ex);
            }
        }

        private async void OnShownInit(object sender, EventArgs e)
        {
            try
            {
                Log.Write("窗口已显示：handle=" + Handle + " webHandle=" + _web.Handle
                    + " size=" + Width + "x" + Height);
                string extra = null;
                if (Environment.GetEnvironmentVariable("ABBEYROAD_DEBUG") == "1")
                {
                    extra = "--remote-debugging-port=9223";
                }
                string userArgs = Environment.GetEnvironmentVariable("ABBEYROAD_ARGS");
                if (!string.IsNullOrEmpty(userArgs))
                {
                    extra = string.IsNullOrEmpty(extra) ? userArgs : extra + " " + userArgs;
                }
                CoreWebView2EnvironmentOptions options =
                    new CoreWebView2EnvironmentOptions(extra, null, null, false);
                CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, AppPaths.UserDataDir, options);
                Log.Write("WebView2 环境已创建");

                System.Threading.Tasks.Task init = _web.EnsureCoreWebView2Async(env);
                System.Threading.Tasks.Task done = await System.Threading.Tasks.Task.WhenAny(
                    init, System.Threading.Tasks.Task.Delay(15000));
                if (done != init)
                {
                    // 常见于虚拟机 / 远程桌面 / 无独显环境：关掉 GPU 再试一次
                    Log.Write("WebView2 初始化超时（15s），改用 --disable-gpu 重建控件重试");
                    CoreWebView2EnvironmentOptions safeOptions = new CoreWebView2EnvironmentOptions(
                        (extra == null ? "" : extra + " ") + "--disable-gpu --disable-gpu-compositing",
                        null, null, false);
                    CoreWebView2Environment safeEnv = await CoreWebView2Environment.CreateAsync(
                        null, AppPaths.UserDataDir, safeOptions);
                    // 同一个控件不能换环境，必须先销毁重建
                    try { Controls.Remove(_web); _web.Dispose(); } catch (Exception) { }
                    _web = new WebView2();
                    _web.Dock = DockStyle.Fill;
                    Controls.Add(_web);
                    init = _web.EnsureCoreWebView2Async(safeEnv);
                    done = await System.Threading.Tasks.Task.WhenAny(init, System.Threading.Tasks.Task.Delay(15000));
                    if (done != init)
                    {
                        Log.Write("WebView2 初始化二次超时（--disable-gpu）");
                        throw new TimeoutException("WebView2 初始化超时。请确认已安装 WebView2 运行时，"
                            + "并且当前会话有可用的桌面。");
                    }
                }
                await init;
                Log.Write("CoreWebView2 已就绪，浏览器版本 " + _web.CoreWebView2.Environment.BrowserVersionString);

                CoreWebView2 core = _web.CoreWebView2;
                core.Settings.AreDefaultContextMenusEnabled = false;
                core.Settings.IsStatusBarEnabled = false;
                core.Settings.IsZoomControlEnabled = false;
                core.Settings.AreBrowserAcceleratorKeysEnabled = true;
                core.Settings.IsSwipeNavigationEnabled = false;
                core.SetVirtualHostNameToFolderMapping(AppPaths.Host, _webRoot,
                    CoreWebView2HostResourceAccessKind.Allow);

                _bridge = new WebBridge(this, core);
                core.WebMessageReceived += _bridge.OnMessage;
                core.NavigationCompleted += delegate(object s, CoreWebView2NavigationCompletedEventArgs args)
                {
                    Log.Write("NavigationCompleted success=" + args.IsSuccess + " status=" + args.WebErrorStatus
                        + " url=" + AppPaths.Url);
                    if (args.IsSuccess && _selfTestPath != null)
                    {
                        RunSelfTest();
                    }
                    else if (!args.IsSuccess && _bridge != null)
                    {
                        _bridge.NotifyError("页面加载失败：" + args.WebErrorStatus);
                    }
                };
                core.Navigate(AppPaths.Url);
                Log.Write("已发起导航：" + AppPaths.Url);
            }
            catch (Exception ex)
            {
                Log.Write("启动失败：" + ex);
                ShowFatal(ex);
            }
        }

        private void ShowFatal(Exception ex)
        {
            if (_selfTestPath != null)
            {
                try
                {
                    File.WriteAllText(_selfTestPath,
                        "RESULT=FAILED " + ex.Message + Environment.NewLine + ex.ToString(),
                        new UTF8Encoding(false));
                }
                catch (Exception) { }
                Application.Exit();
                return;
            }
            MessageBox.Show(
                "无法启动 WebView2 组件。\n\n"
                + "Allegro 依赖系统自带的 WebView2 运行时（Windows 10/11 一般已预装）。\n"
                + "如提示缺失，请安装「Microsoft Edge WebView2 Runtime」后重试。\n\n"
                + "详细信息：" + ex.Message,
                "Allegro", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            // A broken WebView2 must not leave an invisible tray-only app behind.
            _reallyExit = true;
            Close();
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            if (_bridge != null) { _bridge.NotifyResize(); }
        }

        /// <summary>
        /// 构建自检：确认界面能加载、业务逻辑可跑、原生桥双向可用。
        /// 只有命令行带 --selftest 时才会执行，普通用户不会触发。
        /// </summary>
        private async void RunSelfTest()
        {
            StringBuilder sb = new StringBuilder();
            Log.Write("自检开始");
            try
            {
                sb.AppendLine("ALLEGRO · WINDOWS SELFTEST");
                sb.AppendLine("time=" + DateTime.Now.ToString("s"));
                sb.AppendLine("webview2=" + _web.CoreWebView2.Environment.BrowserVersionString);
                sb.AppendLine("webRoot=" + AppPaths.WebDir);
                sb.AppendLine("userData=" + AppPaths.UserDataDir);

                string probe = @"
(function () {
  try {
    var S = AR.Store.get();
    S.settings.onboardingCompletedAt = new Date().toISOString();
    var e = AR.MdParse.demoEntities(S);
    AR.MdParse.applyEntities(e, S);
    AR.Panels.refreshAll();
    window.__probeAsync = 'pending';
    AR.Bridge.call('devicename').then(function (v) { window.__probeAsync = 'bridge-device=' + v; });
    var p = AR.MdParse.parse(AR.MdParse.sample, { weekCount: 20 });
    var nav = AR.Location.navQuery('XX大学 信息楼 305教室', S.settings);
    var rect = document.getElementById('zoneNext').getBoundingClientRect();
    return JSON.stringify({
      platform: AR.Bridge.platform(),
      bridge: { android: AR.Bridge.hasAndroid, webview2: AR.Bridge.hasWebView2 },
      courses: S.courses.length,
      blocks: S.blocks.length,
      merged: S.blocks.filter(function (b) { return b.isConsecutive; }).length,
      overrides: S.overrides.length,
      mdRows: p.rows.length,
      mdErrors: p.summary.errors,
      mdOverrides: p.overrides.length,
      nav: nav.trimmed,
      theme: document.body.getAttribute('data-theme'),
      glass: document.body.getAttribute('data-glass'),
      preset: AR.UI.layoutState.preset,
      layout: document.getElementById('todayLayout').clientWidth + 'x' + document.getElementById('todayLayout').clientHeight,
      nextZone: Math.round(rect.width) + 'x' + Math.round(rect.height),
      conflicts: AR.Schedule.conflicts().length
    });
  } catch (err) {
    return 'PROBE-ERROR ' + (err && err.message ? err.message : err);
  }
})()";
                string first = await _web.CoreWebView2.ExecuteScriptAsync(probe);
                sb.AppendLine("probe=" + first);

                await System.Threading.Tasks.Task.Delay(900);
                string second = await _web.CoreWebView2.ExecuteScriptAsync("window.__probeAsync || 'pending'");
                sb.AppendLine("bridge=" + second);

                string dom = await _web.CoreWebView2.ExecuteScriptAsync(
                    "JSON.stringify({navButtons: document.querySelectorAll('.nav-btn').length," +
                    " zones: document.querySelectorAll('.zone').length," +
                    " cards: document.querySelectorAll('#todayBody .card').length," +
                    " settingsPanels: (function(){ AR.UI.show('settings'); return document.querySelectorAll('.settings-grid .panel').length; })() })");
                sb.AppendLine("dom=" + dom);
                sb.AppendLine("RESULT=OK");
            }
            catch (Exception ex)
            {
                sb.AppendLine("RESULT=FAILED " + ex.Message);
            }
            try { File.WriteAllText(_selfTestPath, sb.ToString(), new UTF8Encoding(false)); }
            catch (Exception) { }
            try { Application.Exit(); } catch (Exception) { }
        }
    }
}

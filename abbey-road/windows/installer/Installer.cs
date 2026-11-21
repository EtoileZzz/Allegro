using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace AllegroSetup
{
    /// <summary>
    /// Allegro Windows 安装器（无需管理员权限）：
    ///   安装 → 解压到 %LOCALAPPDATA%\Programs\Allegro，建快捷方式，写卸载信息
    ///   卸载 → 删快捷方式、注册表项、安装目录（可选连带用户数据）
    /// 支持静默：Allegro-Setup.exe /S 安装，/U 卸载。
    /// </summary>
    internal static class Program
    {
        private const string Product = "Allegro";
        // 安装器是单独编译的（只编 installer/Installer.cs，拿不到 AppPaths），
        // 所以这里是独立的版本来源 —— 发布时与 windows/build.ps1 的 $version、
        // app/js/core.js 的 APP_VERSION、windows/src/AppPaths.cs 的 FallbackVersion 手工同步。
        internal const string Version = "0.5.6";
        private const string ExeName = "Allegro.exe";
        private const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\Allegro";
        // Same key / value name the app itself uses for bridge "setAutostart".
        private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string AutostartValueName = "Allegro";

        private static string DefaultDir
        {
            get
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "Programs", Product);
            }
        }

        [STAThread]
        private static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool silent = Has(args, "/S") || Has(args, "-s");
            bool uninstall = Has(args, "/U") || Has(args, "-u");

            if (silent)
            {
                try
                {
                    if (uninstall) { DoUninstall(DetectExistingInstallDir(), true); }
                    else { DoInstall(DetectExistingInstallDir()); }
                    Environment.Exit(0);
                }
                catch (Exception ex)
                {
                    File.AppendAllText(Path.Combine(Path.GetTempPath(), "abbeyroad-setup.log"),
                        DateTime.Now + " 静默模式失败: " + ex + Environment.NewLine);
                    Environment.Exit(1);
                }
                return;
            }

            if (uninstall)
            {
                DoUninstall(DetectExistingInstallDir(), false);
                MessageBox.Show("Allegro 已卸载。", Product, MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            Application.Run(new SetupForm());
        }

        private static bool Has(string[] args, string flag)
        {
            for (int i = 0; i < args.Length; i++)
            {
                if (string.Equals(args[i], flag, StringComparison.OrdinalIgnoreCase)) { return true; }
            }
            return false;
        }

        /* ── 安装 ─────────────────────────────────────────────── */

        public static string DetectExistingInstallDir()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(UninstallKey, false))
                {
                    if (key != null)
                    {
                        string loc = Convert.ToString(key.GetValue("InstallLocation") ?? "").Trim();
                        if (!string.IsNullOrEmpty(loc)) { return loc; }
                    }
                }
            }
            catch (Exception) { }
            return DefaultDir;
        }

        public static bool HasExistingInstall()
        {
            try
            {
                string dir = DetectExistingInstallDir();
                return File.Exists(Path.Combine(dir, ExeName));
            }
            catch (Exception) { return false; }
        }

        public static bool IsAutostartEnabled()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(RunKey, false))
                {
                    if (key == null) { return false; }
                    object v = key.GetValue(AutostartValueName);
                    return v != null && Convert.ToString(v).Trim().Length > 0;
                }
            }
            catch (Exception) { return false; }
        }

        private static void KillRunningAllegro()
        {
            try
            {
                Process[] procs = Process.GetProcessesByName("Allegro");
                for (int i = 0; i < procs.Length; i++)
                {
                    try
                    {
                        if (!procs[i].HasExited)
                        {
                            try
                            {
                                if (procs[i].CloseMainWindow()) { procs[i].WaitForExit(800); }
                            }
                            catch (Exception) { }
                            if (!procs[i].HasExited)
                            {
                                procs[i].Kill();
                                procs[i].WaitForExit(3000);
                            }
                        }
                    }
                    catch (Exception) { }
                    finally
                    {
                        try { procs[i].Dispose(); } catch (Exception) { }
                    }
                }
            }
            catch (Exception) { }
        }

        private static void CopyWithRetry(string src, string dest)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(dest));
            for (int attempt = 0; attempt < 6; attempt++)
            {
                try
                {
                    File.Copy(src, dest, true);
                    return;
                }
                catch (IOException)
                {
                    if (attempt == 5) { throw; }
                    Thread.Sleep(300);
                }
                catch (UnauthorizedAccessException)
                {
                    if (attempt == 5) { throw; }
                    Thread.Sleep(300);
                }
            }
        }

        public static string DoInstall(string targetDir)
        {
            // Silent install has no UI, so preserve existing autostart preference.
            return DoInstall(targetDir, IsAutostartEnabled());
        }

        public static string DoInstall(string targetDir, bool autostart)
        {
            KillRunningAllegro();
            Directory.CreateDirectory(targetDir);
            ExtractPayload(targetDir);
            string exe = Path.Combine(targetDir, ExeName);
            if (!File.Exists(exe)) { throw new FileNotFoundException("安装包内容不完整：" + exe); }

            string uninstallerExe = Path.Combine(targetDir, "Allegro-Uninstall.exe");
            try
            {
                string selfExe = Path.GetFullPath(Application.ExecutablePath);
                string destUninstall = Path.GetFullPath(uninstallerExe);
                if (!string.Equals(selfExe, destUninstall, StringComparison.OrdinalIgnoreCase))
                {
                    CopyWithRetry(selfExe, destUninstall);
                }
            }
            catch (Exception) { uninstallerExe = Application.ExecutablePath; }

            CreateShortcut(Path.Combine(StartMenuDir(), Product + ".lnk"), exe, targetDir);
            CreateShortcut(Path.Combine(DesktopDir(), Product + ".lnk"), exe, targetDir);
            WriteUninstallInfo(targetDir, exe, uninstallerExe);
            ApplyAutostart(exe, autostart);
            return exe;
        }

        private static void ExtractPayload(string targetDir)
        {
            Assembly asm = Assembly.GetExecutingAssembly();
            string res = null;
            string[] names = asm.GetManifestResourceNames();
            for (int i = 0; i < names.Length; i++)
            {
                if (names[i].EndsWith("app.zip", StringComparison.OrdinalIgnoreCase)) { res = names[i]; break; }
            }
            if (res == null) { throw new InvalidOperationException("安装包缺少负载（app.zip）。"); }

            string tmp = Path.Combine(Path.GetTempPath(), "abbeyroad-setup-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tmp);
            string zip = Path.Combine(tmp, "app.zip");
            using (Stream input = asm.GetManifestResourceStream(res))
            using (FileStream output = File.Create(zip))
            {
                input.CopyTo(output);
            }
            string outDir = Path.Combine(tmp, "out");
            ZipFile.ExtractToDirectory(zip, outDir);
            foreach (string file in Directory.GetFiles(outDir, "*", SearchOption.AllDirectories))
            {
                string rel = file.Substring(outDir.Length).TrimStart('\\', '/');
                string dest = Path.Combine(targetDir, rel);
                CopyWithRetry(file, dest);
            }
            try { Directory.Delete(tmp, true); } catch (Exception) { }
        }

        /* ── 卸载 ─────────────────────────────────────────────── */

        public static void DoUninstall(string targetDir, bool silent)
        {
            KillRunningAllegro();

            TryDelete(Path.Combine(StartMenuDir(), Product + ".lnk"));
            TryDelete(Path.Combine(DesktopDir(), Product + ".lnk"));
            RemoveAutostart();
            try { Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false); } catch (Exception) { }

            string selfFull = "";
            try { selfFull = Path.GetFullPath(Application.ExecutablePath); } catch (Exception) { }
            string targetFull = "";
            try { targetFull = Path.GetFullPath(targetDir).TrimEnd('\\', '/'); } catch (Exception) { }
            bool runningInsideTarget = !string.IsNullOrEmpty(selfFull) && !string.IsNullOrEmpty(targetFull) &&
                selfFull.StartsWith(targetFull + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);

            if (runningInsideTarget)
            {
                try
                {
                    if (Directory.Exists(targetDir))
                    {
                        foreach (string f in Directory.GetFiles(targetDir, "*", SearchOption.AllDirectories))
                        {
                            if (!string.Equals(Path.GetFullPath(f), selfFull, StringComparison.OrdinalIgnoreCase))
                            {
                                TryDelete(f);
                            }
                        }
                        foreach (string d in Directory.GetDirectories(targetDir))
                        {
                            try { Directory.Delete(d, true); } catch (Exception) { }
                        }
                    }
                }
                catch (Exception) { }
            }
            else
            {
                // 安装目录可能被占用，重试几次
                for (int attempt = 0; attempt < 5; attempt++)
                {
                    try
                    {
                        if (Directory.Exists(targetDir)) { Directory.Delete(targetDir, true); }
                        break;
                    }
                    catch (Exception) { Thread.Sleep(500); }
                }
            }

            if (!silent)
            {
                DialogResult keep = MessageBox.Show(
                    "是否同时删除本机保存的课表数据？\n\n" +
                    "目录：" + Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), Product) +
                    "\n\n选择「否」将保留数据，下次安装可继续使用。",
                    Product, MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                if (keep == DialogResult.Yes)
                {
                    try
                    {
                        Directory.Delete(Path.Combine(
                            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), Product), true);
                    }
                    catch (Exception) { }
                }
            }

            if (runningInsideTarget)
            {
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo("cmd.exe",
                        "/c timeout /t 2 /nobreak >nul & del /f /q \"" + selfFull + "\" & rmdir /s /q \"" + targetFull + "\"");
                    psi.CreateNoWindow = true;
                    psi.UseShellExecute = false;
                    psi.WindowStyle = ProcessWindowStyle.Hidden;
                    Process.Start(psi);
                }
                catch (Exception) { }
            }
        }

        /* ── 快捷方式 / 注册表 ─────────────────────────────────── */

        private static string StartMenuDir()
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), Product);
        }

        private static string DesktopDir()
        {
            return Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        }

        private static void CreateShortcut(string lnkPath, string targetExe, string workDir)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(lnkPath));
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType == null) { return; }
                object shell = Activator.CreateInstance(shellType);
                object lnk = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null,
                    shell, new object[] { lnkPath });
                Type lnkType = lnk.GetType();
                lnkType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, lnk, new object[] { targetExe });
                lnkType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, lnk, new object[] { workDir });
                lnkType.InvokeMember("Description", BindingFlags.SetProperty, null, lnk,
                    new object[] { "Allegro · 课表与日程" });
                string ico = Path.Combine(workDir, "abbeyroad.ico");
                if (File.Exists(ico))
                {
                    lnkType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, lnk, new object[] { ico });
                }
                lnkType.InvokeMember("Save", BindingFlags.InvokeMethod, null, lnk, null);
            }
            catch (Exception) { }
        }

        private static void WriteUninstallInfo(string dir, string exe, string uninstallerExe)
        {
            try
            {
                string u = (!string.IsNullOrEmpty(uninstallerExe) && File.Exists(uninstallerExe))
                    ? uninstallerExe
                    : Path.Combine(AppDomain.CurrentDomain.BaseDirectory, Path.GetFileName(Application.ExecutablePath));
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(UninstallKey))
                {
                    key.SetValue("DisplayName", Product + " · 课表与日程");
                    key.SetValue("DisplayVersion", Version);
                    key.SetValue("Publisher", "EtoileZzz");
                    key.SetValue("InstallLocation", dir);
                    key.SetValue("DisplayIcon", exe);
                    key.SetValue("UninstallString", "\"" + u + "\" /U");
                    key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                    key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                    key.SetValue("EstimatedSize", 60 * 1024, RegistryValueKind.DWord);
                }
            }
            catch (Exception) { }
        }

        private static void TryDelete(string path)
        {
            try { if (File.Exists(path)) { File.Delete(path); } }
            catch (Exception) { }
        }

        /// <summary>
        /// Writes or removes HKCU\...\Run\Allegro. Checked -> quoted path of the
        /// installed exe; unchecked -> make sure no stale entry is left behind.
        /// </summary>
        private static void ApplyAutostart(string exe, bool on)
        {
            if (!on) { RemoveAutostart(); return; }
            try
            {
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(RunKey))
                {
                    if (key != null)
                    {
                        key.SetValue(AutostartValueName, "\"" + exe + "\"", RegistryValueKind.String);
                    }
                }
            }
            catch (Exception) { }
        }

        private static void RemoveAutostart()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(RunKey, true))
                {
                    if (key != null) { key.DeleteValue(AutostartValueName, false); }
                }
            }
            catch (Exception) { }
        }

        public static string DefaultInstallDir { get { return DefaultDir; } }
    }

    /// <summary>安装向导窗口。</summary>
    internal class SetupForm : Form
    {
        private TextBox _path;
        private Label _status;
        private ProgressBar _bar;
        private Button _install;
        private Button _uninstall;
        private Button _close;
        private CheckBox _launch;
        private CheckBox _autostart;

        public SetupForm()
        {
            Text = "Allegro 安装程序";
            // 清单声明 PerMonitorV2 后，这里的像素值就是物理像素；按系统缩放折算，
            // 保持与旧版完全一致的对话框观感（只是不再发糊）
            float s;
            using (Graphics g = Graphics.FromHwnd(IntPtr.Zero)) { s = g.DpiX / 96f; }
            Func<int, int> B = v => (int)Math.Round(v * s);
            Width = B(560);
            Height = B(360);
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            BackColor = Color.White;

            Label title = new Label();
            title.Text = "Allegro · 课表与日程";
            title.Font = new Font("Microsoft YaHei UI", 15F, FontStyle.Bold);
            title.SetBounds(B(24), B(20), B(480), B(30));
            Controls.Add(title);

            bool isUpgrade = Program.HasExistingInstall();
            Label sub = new Label();
            sub.Text = "版本 " + Program.Version + " · 本地优先，不联网、不收集数据\n"
                + (isUpgrade
                    ? "检测到已有安装，将覆盖升级并自动保留本机数据。"
                    : "安装到当前用户目录，无需管理员权限。");
            sub.SetBounds(B(24), B(54), B(500), B(40));
            sub.ForeColor = Color.FromArgb(90, 96, 114);
            Controls.Add(sub);

            Label pathLabel = new Label();
            pathLabel.Text = "安装位置";
            pathLabel.SetBounds(B(24), B(104), B(80), B(22));
            Controls.Add(pathLabel);

            _path = new TextBox();
            _path.Text = Program.DetectExistingInstallDir();
            _path.SetBounds(B(24), B(128), B(400), B(26));
            Controls.Add(_path);

            Button browse = new Button();
            browse.Text = "浏览…";
            browse.SetBounds(B(432), B(127), B(92), B(28));
            browse.Click += delegate
            {
                using (FolderBrowserDialog dlg = new FolderBrowserDialog())
                {
                    dlg.SelectedPath = _path.Text;
                    if (dlg.ShowDialog(this) == DialogResult.OK) { _path.Text = dlg.SelectedPath; }
                }
            };
            Controls.Add(browse);

            _bar = new ProgressBar();
            _bar.SetBounds(B(24), B(170), B(500), B(8));
            _bar.Style = ProgressBarStyle.Continuous;
            _bar.Value = 0;
            Controls.Add(_bar);

            _status = new Label();
            _status.Text = "准备就绪";
            _status.SetBounds(B(24), B(184), B(500), B(22));
            _status.ForeColor = Color.FromArgb(90, 96, 114);
            Controls.Add(_status);

            _launch = new CheckBox();
            _launch.Text = "安装完成后启动 Allegro";
            _launch.Checked = true;
            _launch.SetBounds(B(24), B(212), B(300), B(24));
            Controls.Add(_launch);

            // Autostart is opt-in, but preserves existing choice on upgrade.
            _autostart = new CheckBox();
            _autostart.Text = "开机时自动启动 Allegro";
            _autostart.Checked = Program.IsAutostartEnabled();
            _autostart.SetBounds(B(24), B(240), B(340), B(24));
            Controls.Add(_autostart);

            _install = new Button();
            _install.Text = isUpgrade ? "覆盖升级" : "安装";
            _install.SetBounds(B(250), B(278), B(90), B(32));
            _install.Click += delegate { RunInstall(); };
            Controls.Add(_install);

            _uninstall = new Button();
            _uninstall.Text = "卸载";
            _uninstall.SetBounds(B(346), B(278), B(90), B(32));
            _uninstall.Click += delegate
            {
                _status.Text = "正在卸载…";
                Program.DoUninstall(_path.Text, false);
                _status.Text = "已卸载";
                _bar.Value = 0;
            };
            Controls.Add(_uninstall);

            _close = new Button();
            _close.Text = "退出";
            _close.SetBounds(B(442), B(278), B(80), B(32));
            _close.Click += delegate { Close(); };
            Controls.Add(_close);
        }

        private void RunInstall()
        {
            try
            {
                _install.Enabled = false;
                _status.Text = "正在复制文件…";
                _bar.Value = 30;
                Application.DoEvents();
                string exe = Program.DoInstall(_path.Text, _autostart.Checked);
                _bar.Value = 100;
                _status.Text = "安装完成：" + exe;
                if (_launch.Checked)
                {
                    ProcessStartInfo psi = new ProcessStartInfo(exe);
                    psi.WorkingDirectory = _path.Text;
                    Process.Start(psi);
                }
            }
            catch (Exception ex)
            {
                _status.Text = "安装失败：" + ex.Message;
                MessageBox.Show("安装失败：\n" + ex.Message, "Allegro", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                _install.Enabled = true;
            }
        }
    }
}

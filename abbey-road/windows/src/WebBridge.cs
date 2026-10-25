using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Media;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

namespace Allegro
{
    /// <summary>
    /// 网页 ↔ 原生 的桥。协议与 android/MainActivity.java 完全一致：
    ///   网页 → {id, method, args}     原生 → {replyTo, result} 或 {event, ...}
    /// </summary>
    internal class WebBridge
    {
        private readonly MainForm _form;
        private readonly CoreWebView2 _core;
        private readonly JavaScriptSerializer _json = new JavaScriptSerializer();

        /// <summary>
        /// 导入文本的大小上限。ImportText 是同步整读，用户误选 2GB 的 txt
        /// 会直接把内存吃光、界面卡死，所以先看文件大小再决定读不读。
        /// </summary>
        private const long MaxImportBytes = 8L * 1024 * 1024;

        public WebBridge(MainForm form, CoreWebView2 core)
        {
            _form = form;
            _core = core;
        }

        public void OnMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string raw = null;
            try { raw = e.TryGetWebMessageAsString(); }
            catch (Exception) { }
            if (string.IsNullOrEmpty(raw)) { return; }

            Dictionary<string, object> msg;
            try { msg = _json.Deserialize<Dictionary<string, object>>(raw); }
            catch (Exception) { return; }
            if (msg == null || !msg.ContainsKey("method")) { return; }

            string id = msg.ContainsKey("id") ? Convert.ToString(msg["id"]) : null;
            string method = Convert.ToString(msg["method"]);
            object[] args = ToArgs(msg.ContainsKey("args") ? msg["args"] : null);

            try
            {
                object result = Dispatch(method, args);
                Reply(id, result);
            }
            catch (Exception ex)
            {
                Reply(id, "error: " + ex.Message);
            }
        }

        /// <summary>
        /// JavaScriptSerializer 把 JSON 数组解出来的类型不一定是 object[]（实际是 ArrayList），
        /// 之前只认 object[]，结果所有参数都被丢掉 ——
        /// 「导出配置文件」会存成 0 字节、copy 复制空串、地图/日历也没有关键词。
        /// 这里把两种形态（object[] 与任意 IList）都收下来。
        /// </summary>
        private static object[] ToArgs(object raw)
        {
            if (raw is object[]) { return (object[])raw; }
            System.Collections.IList list = raw as System.Collections.IList;
            if (list != null)
            {
                object[] arr = new object[list.Count];
                list.CopyTo(arr, 0);
                return arr;
            }
            return new object[0];
        }

        private object Dispatch(string method, object[] a)
        {
            switch ((method ?? "").ToLowerInvariant())
            {
                case "platform": return "windows";
                case "sdkint": return 0;
                case "devicename": return Environment.MachineName;
                case "appversion": return AppPaths.Version;
                case "vibrate": return null;                       // Windows 无震动，视觉脉冲由网页负责
                case "beep": return Beep(Str(a, 0));
                case "copy": Clipboard.SetText(Str(a, 0)); return "ok";
                case "toast": return null;                          // toast 由网页自绘
                case "sharetext": Clipboard.SetText(Str(a, 1)); return "copied";
                case "canhandle": return true;
                case "openurl": Shell(Str(a, 0)); return "ok";
                case "openmap": return OpenMap(Str(a, 0), Str(a, 1), Str(a, 2));
                case "setalarm": return SetAlarm(a);
                case "addcalendarevent": return AddCalendarEvent(a);
                case "exporttext": return ExportText(Str(a, 0), Str(a, 1), Str(a, 2));
                case "importtext": return ImportText();
                case "sharefile": return ShareFile(Str(a, 0), Str(a, 1), Str(a, 3));
                case "listexports": return ListExports();
                case "readtexturi": return ReadTextUri(Str(a, 0));
                case "setsystembars": SetBars(Str(a, 0), Bool(a, 1)); return "ok";
                case "setbackdrop": _form.SetBackdropEnabled(Bool(a, 0)); return "ok";
                case "exitapp": BeginInvoke(delegate { Application.Exit(); }); return "ok";
                default: return null;
            }
        }

        /// <summary>Windows 端只有"警告音"这一种声音反馈，避免每次点击都响。</summary>
        private string Beep(string kind)
        {
            if (kind == "warn")
            {
                try { SystemSounds.Exclamation.Play(); } catch (Exception) { }
            }
            return "ok";
        }

        private string OpenMap(string pref, string keyword, string webFallback)
        {
            string url = webFallback;
            if (string.IsNullOrEmpty(url))
            {
                string q = Uri.EscapeDataString(keyword ?? "");
                if (pref == "baidu") { url = "https://map.baidu.com/search/" + q; }
                else if (pref == "google") { url = "https://maps.google.com/?q=" + q; }
                else { url = "https://uri.amap.com/search?keyword=" + q; }
            }
            Shell(url);
            return url;
        }

        /// <summary>
        /// Windows 没有可写入的系统闹钟接口：按规划文档降级为「复制时间 + 提示」，
        /// 同时给出「添加到日历」的等价路径（导出 .ics 并打开）。
        /// </summary>
        private string SetAlarm(object[] a)
        {
            int hh = Int(a, 0);
            int mm = Int(a, 1);
            string msg = Str(a, 2);
            string text = (hh < 10 ? "0" + hh : "" + hh) + ":" + (mm < 10 ? "0" + mm : "" + mm);
            if (!string.IsNullOrEmpty(msg)) { text = text + " " + msg; }
            try { Clipboard.SetText(text); } catch (Exception) { }
            return "Windows 没有系统闹钟接口，已复制「" + text + "」，可粘贴到「闹钟和时钟」应用里新建。";
        }

        private string AddCalendarEvent(object[] a)
        {
            string title = Str(a, 0);
            string location = Str(a, 1);
            string desc = Str(a, 2);
            long begin = Long(a, 3);
            long end = Long(a, 4);
            if (begin <= 0) { return "时间无效"; }
            if (end <= begin) { end = begin + 45 * 60 * 1000; }

            DateTimeOffset s = DateTimeOffset.FromUnixTimeMilliseconds(begin).ToLocalTime();
            DateTimeOffset e = DateTimeOffset.FromUnixTimeMilliseconds(end).ToLocalTime();
            StringBuilder sb = new StringBuilder();
            sb.Append("BEGIN:VCALENDAR\r\n");
            sb.Append("VERSION:2.0\r\n");
            sb.Append("PRODID:-//Allegro//Schedule//CN\r\n");
            sb.Append("CALSCALE:GREGORIAN\r\n");
            sb.Append("BEGIN:VEVENT\r\n");
            sb.Append("UID:").Append(Guid.NewGuid().ToString("N")).Append("@abbeyroad\r\n");
            sb.Append("DTSTAMP:").Append(DateTime.UtcNow.ToString("yyyyMMdd'T'HHmmss'Z'")).Append("\r\n");
            sb.Append("DTSTART:").Append(s.ToString("yyyyMMdd'T'HHmmss")).Append("\r\n");
            sb.Append("DTEND:").Append(e.ToString("yyyyMMdd'T'HHmmss")).Append("\r\n");
            sb.Append("SUMMARY:").Append(Ics(title)).Append("\r\n");
            sb.Append("LOCATION:").Append(Ics(location)).Append("\r\n");
            sb.Append("DESCRIPTION:").Append(Ics(desc)).Append("\r\n");
            sb.Append("BEGIN:VALARM\r\nTRIGGER:-PT15M\r\nACTION:DISPLAY\r\nDESCRIPTION:")
              .Append(Ics(title)).Append("\r\nEND:VALARM\r\n");
            sb.Append("END:VEVENT\r\nEND:VCALENDAR\r\n");

            string path = Path.Combine(Path.GetTempPath(),
                "Allegro-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".ics");
            File.WriteAllText(path, sb.ToString(), new UTF8Encoding(false));
            Shell(path);
            return "ics";
        }

        private string ExportText(string fileName, string content, string mime)
        {
            using (SaveFileDialog dlg = new SaveFileDialog())
            {
                dlg.Title = "导出 Allegro 数据";
                dlg.FileName = SafeFileName(fileName);
                dlg.Filter = (mime != null && mime.IndexOf("json", StringComparison.OrdinalIgnoreCase) >= 0)
                    ? "JSON 配置 (*.json)|*.json|所有文件 (*.*)|*.*"
                    : "文本文件 (*.md;*.txt)|*.md;*.txt|所有文件 (*.*)|*.*";
                if (dlg.ShowDialog(_form) != DialogResult.OK) { return "cancelled"; }
                File.WriteAllText(dlg.FileName, content, new UTF8Encoding(false));
                Dictionary<string, object> payload = new Dictionary<string, object>();
                payload["event"] = "exported";
                payload["name"] = Path.GetFileName(dlg.FileName);
                Post(payload);
                return dlg.FileName;
            }
        }

        private string ImportText()
        {
            using (OpenFileDialog dlg = new OpenFileDialog())
            {
                dlg.Title = "导入 Allegro 数据";
                dlg.Filter = "课表与配置 (*.json;*.md;*.txt)|*.json;*.md;*.txt|所有文件 (*.*)|*.*";
                if (dlg.ShowDialog(_form) != DialogResult.OK) { return "cancelled"; }
                try
                {
                    // 先预检大小再读：File.ReadAllText 会把整个文件读进内存，
                    // 用户误选一个几百 MB / 2GB 的 txt 就会 OOM 或长时间卡住界面。
                    FileInfo fi = new FileInfo(dlg.FileName);
                    if (!fi.Exists) { return "文件不存在：" + dlg.FileName; }
                    if (fi.Length > MaxImportBytes)
                    {
                        return "文件太大（" + (fi.Length / 1048576.0).ToString("0.#")
                            + " MB），最多支持 8 MB；请先精简后再导入。";
                    }
                    string text = File.ReadAllText(dlg.FileName, Encoding.UTF8);
                    Dictionary<string, object> payload = new Dictionary<string, object>();
                    payload["event"] = "fileText";
                    payload["text"] = text;
                    payload["name"] = Path.GetFileName(dlg.FileName);
                    Post(payload);
                    return dlg.FileName;
                }
                catch (Exception ex)
                {
                    // 读失败（文件被占用、权限不足等）也只回一个错误串，
                    // 不往上抛：Dispatch 的 catch 会转成 error 回包，网页侧没人接就是静默失败。
                    return "读取失败：" + ex.Message;
                }
            }
        }

        /// <summary>
        /// 「导出到微信」：Windows 没有把文件直接丢进微信的接口，
        /// 所以存一份到「下载」目录（可以直接拖进微信窗口发送），
        /// 同时把文件内容放进剪贴板（也能直接粘成一条微信消息）。
        /// </summary>
        private string ShareFile(string fileName, string content, string title)
        {
            string name = SafeFileName(fileName);
            string savedPath = null;
            try
            {
                string dir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
                Directory.CreateDirectory(dir);
                string dirFull = Path.GetFullPath(dir);
                string full = Path.GetFullPath(Path.Combine(dirFull, name));
                // 双保险：SafeFileName 已经去掉分隔符和 ..，这里再确认落点确实在「下载」之内，
                // 绝不允许 JS 传来的名字把文件写到 Downloads 之外。
                if (!full.StartsWith(dirFull + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                {
                    name = "Allegro-backup.json";
                    full = Path.Combine(dirFull, name);
                }
                savedPath = full;
                File.WriteAllText(savedPath, content, new UTF8Encoding(false));
            }
            catch (Exception)
            {
                savedPath = null;
            }
            try { Clipboard.SetText(content); } catch (Exception) { }
            if (savedPath == null)
            {
                return "已复制配置内容，粘贴到微信发送即可";
            }
            return "已存到「下载」目录并复制了内容，可拖进微信发送：" + name;
        }

        /// <summary>
        /// 把网页传来的文件名变成安全的「单段文件名」：
        ///   1) 只取最后一段（去掉 \ / 与 .. 构成的路径穿越）；
        ///   2) 去掉 Path.GetInvalidFileNameChars() 与控制字符；
        ///   3) 去掉残留的 ".." 和 Windows 不接受的结尾点 / 空格；
        ///   4) 限长 120 字符（尽量保留扩展名）；
        ///   5) 洗空了就退回备份文件名。
        /// </summary>
        private static string SafeFileName(string name)
        {
            const string fallback = "Allegro-backup.json";
            if (string.IsNullOrEmpty(name)) { return fallback; }

            // 统一分隔符后只保留最后一段："..\..\Windows\x.json" → "x.json"
            string s = name.Trim().Replace('\\', '/');
            int slash = s.LastIndexOf('/');
            if (slash >= 0) { s = s.Substring(slash + 1); }

            char[] invalid = Path.GetInvalidFileNameChars();
            StringBuilder sb = new StringBuilder(s.Length);
            for (int i = 0; i < s.Length; i++)
            {
                char c = s[i];
                if (c < ' ') { continue; }
                if (Array.IndexOf(invalid, c) >= 0) { continue; }
                sb.Append(c);
            }
            s = sb.ToString().Replace("..", "").Trim().Trim('.', ' ');

            if (s.Length > 120)
            {
                string ext = Path.GetExtension(s);
                if (ext.Length > 0 && ext.Length < 20)
                {
                    s = s.Substring(0, 120 - ext.Length).TrimEnd('.', ' ') + ext;
                }
                else
                {
                    s = s.Substring(0, 120).TrimEnd('.', ' ');
                }
            }
            return s.Length == 0 ? fallback : s;
        }

        /// <summary>
        /// 列出「下载」目录里 App 导出的配置文件（Allegro*.json），
        /// 给网页一份可以直接点的清单，省得每次都在文件对话框里翻。
        /// 返回 JSON 数组：[{name, uri(这里就是完整路径), size, modified}]
        /// </summary>
        private string ListExports()
        {
            List<Dictionary<string, object>> list = new List<Dictionary<string, object>>();
            try
            {
                string dir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
                if (Directory.Exists(dir))
                {
                    /**
                     * 两套前缀都收：新版导出的是 Allegro-backup-*.json，
                     * 但改名之前用户导出的老备份叫 AbbeyRoad-backup-*.json ——
                     * 换名字以后还得能把它们列出来一键导入，否则迁移就断了。
                     */
                    List<string> all = new List<string>();
                    all.AddRange(Directory.GetFiles(dir, "Allegro*.json"));
                    all.AddRange(Directory.GetFiles(dir, "AbbeyRoad*.json"));
                    string[] files = all.ToArray();
                    Array.Sort(files);
                    Array.Reverse(files);   // 名字里带时间戳，倒序就是最新的在前
                    for (int i = 0; i < files.Length && i < 30; i++)
                    {
                        FileInfo fi = new FileInfo(files[i]);
                        Dictionary<string, object> rec = new Dictionary<string, object>();
                        rec["name"] = fi.Name;
                        rec["uri"] = fi.FullName;
                        rec["size"] = fi.Length;
                        rec["modified"] = (long)(fi.LastWriteTimeUtc - new DateTime(1970, 1, 1)).TotalMilliseconds;
                        list.Add(rec);
                    }
                }
            }
            catch (Exception) { }
            return _json.Serialize(list);
        }

        /** 读取清单里那个文件的文本（uri 就是完整路径） */
        private string ReadTextUri(string path)
        {
            try
            {
                if (string.IsNullOrEmpty(path) || !File.Exists(path)) { return ""; }
                // 和 ImportText 同一个上限：这条是「从导出目录再导入」的路径，
                // 也是整读进内存，同样会 OOM。抽出去和 ImportText 共用一份常量。
                FileInfo fi = new FileInfo(path);
                if (fi.Length > MaxImportBytes) { return ""; }
                return File.ReadAllText(path, Encoding.UTF8);
            }
            catch (Exception) { return ""; }
        }

        private void SetBars(string hex, bool lightIcons)
        {
            _form.SetDark(!lightIcons);
        }

        public void NotifyResize()
        {
            Dictionary<string, object> payload = new Dictionary<string, object>();
            payload["event"] = "resize";
            Post(payload);
        }

        public void NotifyError(string message)
        {
            Dictionary<string, object> payload = new Dictionary<string, object>();
            payload["event"] = "error";
            payload["message"] = message;
            Post(payload);
        }

        private void Reply(string id, object result)
        {
            if (string.IsNullOrEmpty(id)) { return; }
            Dictionary<string, object> payload = new Dictionary<string, object>();
            payload["replyTo"] = id;
            payload["result"] = result;
            Post(payload);
        }

        private void Post(Dictionary<string, object> payload)
        {
            try { _core.PostWebMessageAsString(_json.Serialize(payload)); }
            catch (Exception) { }
        }

        private void BeginInvoke(Action action)
        {
            try { _form.BeginInvoke(action); } catch (Exception) { }
        }

        private static void Shell(string target)
        {
            if (string.IsNullOrEmpty(target)) { return; }
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo(target);
                psi.UseShellExecute = true;
                Process.Start(psi);
            }
            catch (Exception) { }
        }

        private static string Ics(string s)
        {
            if (string.IsNullOrEmpty(s)) { return ""; }
            return s.Replace("\\", "\\\\").Replace(";", "\\;").Replace(",", "\\,")
                    .Replace("\r\n", "\\n").Replace("\n", "\\n");
        }

        private static string Str(object[] a, int i)
        {
            if (a == null || i >= a.Length || a[i] == null) { return ""; }
            return Convert.ToString(a[i]);
        }

        private static int Int(object[] a, int i)
        {
            int v;
            return int.TryParse(Str(a, i), out v) ? v : 0;
        }

        private static long Long(object[] a, int i)
        {
            long v;
            return long.TryParse(Str(a, i), out v) ? v : 0;
        }

        private static bool Bool(object[] a, int i)
        {
            if (a == null || i >= a.Length || a[i] == null) { return false; }
            if (a[i] is bool) { return (bool)a[i]; }
            bool v;
            return bool.TryParse(Convert.ToString(a[i]), out v) && v;
        }
    }
}

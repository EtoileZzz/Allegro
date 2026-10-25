using System;
using System.IO;
using System.Reflection;

namespace Allegro
{
    /// <summary>统一的路径与版本常量。</summary>
    internal static class AppPaths
    {
        /// <summary>
        /// 版本号兜底值。版本优先取 EXE 自身的程序集版本（build.ps1 若加 /version，
        /// 或以后补 AssemblyInfo.cs，这里会自动跟上）；取不到时才用这个常量。
        /// 注意：build.ps1 目前只有一个 $version 变量，只用来给 zip / 安装器命名，
        /// **没有** 传给 csc；仓库里也没有 AssemblyInfo.cs，所以程序集版本是 0.0.0.0。
        /// 也就是说现在实际生效的就是这个常量，**发布时必须手工同步**：
        ///   windows/build.ps1 的 $version（0.4.5）、app/js/core.js 的 APP_VERSION（0.4.5）、本文件。
        /// 不同步的后果：界面资源会被解到旧版目录（v0.4.x），appversion 也返回旧版本。
        /// </summary>
        public const string FallbackVersion = "0.5.0";

        private static string _version;

        /// <summary>
        /// 形如 "0.4.6" 的版本号（不带后缀标记）。WebDir 按它分目录，appversion 也返回它。
        /// </summary>
        public static string Version
        {
            get
            {
                if (_version == null) { _version = DetectVersion(); }
                return _version;
            }
        }

        private static string DetectVersion()
        {
            try
            {
                Assembly asm = Assembly.GetExecutingAssembly();
                System.Version v = asm.GetName().Version;
                // 没设程序集版本时 csc 给的是 0.0.0.0：要当成"没读到"，
                // 否则界面资源会被解到 v0.0.0 这种目录里。
                if (v != null && (v.Major != 0 || v.Minor != 0 || v.Build > 0))
                {
                    return string.Format("{0}.{1}.{2}", v.Major, v.Minor, v.Build < 0 ? 0 : v.Build);
                }
            }
            catch (Exception) { }
            return FallbackVersion;
        }

        public const string Product = "Allegro";
        public const string Host = "abbeyroad.local";
        public const string Url = "https://abbeyroad.local/index.html";

        public static string Root
        {
            get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), Product); }
        }

        public static string WebDir
        {
            get { return Path.Combine(Root, "web", "v" + Version); }
        }

        public static string UserDataDir
        {
            get { return Path.Combine(Root, "browser"); }
        }

        public static void EnsureDirs()
        {
            Directory.CreateDirectory(Root);
            Directory.CreateDirectory(WebDir);
            Directory.CreateDirectory(UserDataDir);
        }
    }
}

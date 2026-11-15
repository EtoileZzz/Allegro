using System;
using System.Windows.Forms;

namespace Allegro
{
    /// <summary>Allegro · Windows 端入口。</summary>
    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            AppDomain.CurrentDomain.UnhandledException += delegate(object s, UnhandledExceptionEventArgs e)
            {
                MessageBox.Show("Allegro 遇到未处理的错误：\n" + e.ExceptionObject,
                    "Allegro", MessageBoxButtons.OK, MessageBoxIcon.Error);
            };
            try
            {
                Application.Run(new MainForm(args));
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "Allegro 启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}

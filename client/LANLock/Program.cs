using System;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace LANLock
{
    internal static class Program
    {
        private static Mutex? _mutex;

        /// <summary>
        /// The main entry point for the application.
        /// </summary>
        [STAThread]
        static void Main()
        {
            // Single instance check
            const string mutexName = "LANLock_SingleInstance_Mutex";
            _mutex = new Mutex(true, mutexName, out bool createdNew);

            if (!createdNew)
            {
                MessageBox.Show(
                    "LANLock is already running.",
                    "LANLock",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
                return;
            }

            try
            {
                // Load configuration
                var config = Services.ConfigService.Load();
                if (config == null)
                {
                    MessageBox.Show(
                        "Failed to load config.json. Please ensure it exists in the same directory.",
                        "Configuration Error",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                // Configure application
                Application.SetHighDpiMode(HighDpiMode.SystemAware);
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);

                // Run main form
                Application.Run(new MainForm(config));
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    $"Failed to start LANLock:\n{ex.Message}",
                    "Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
            finally
            {
                _mutex?.ReleaseMutex();
                _mutex?.Dispose();
            }
        }
    }
}

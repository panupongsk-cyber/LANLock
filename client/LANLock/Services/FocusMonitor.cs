using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace LANLock.Services
{
    /// <summary>
    /// Monitor window focus using Windows API
    /// </summary>
    public class FocusMonitor : IDisposable
    {
        // Windows API imports
        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern int GetWindowThreadProcessId(IntPtr hWnd, out int processId);

        private readonly Form _targetForm;
        private readonly System.Windows.Forms.Timer _checkTimer;
        private bool _wasFocused = true;

        public event EventHandler<bool>? FocusChanged;

        public bool IsFocused { get; private set; } = true;

        public FocusMonitor(Form targetForm)
        {
            _targetForm = targetForm;

            // Timer to check focus status
            _checkTimer = new System.Windows.Forms.Timer
            {
                Interval = 200 // Check every 200ms
            };
            _checkTimer.Tick += CheckFocus;
        }

        /// <summary>
        /// Start monitoring focus
        /// </summary>
        public void Start()
        {
            _checkTimer.Start();
        }

        /// <summary>
        /// Stop monitoring focus
        /// </summary>
        public void Stop()
        {
            _checkTimer.Stop();
        }

        /// <summary>
        /// Check if our application is the foreground window
        /// </summary>
        private void CheckFocus(object? sender, EventArgs e)
        {
            try
            {
                IntPtr foregroundWindow = GetForegroundWindow();
                GetWindowThreadProcessId(foregroundWindow, out int foregroundProcessId);

                int currentProcessId = Environment.ProcessId;
                IsFocused = foregroundProcessId == currentProcessId;

                // Notify if focus changed
                if (IsFocused != _wasFocused)
                {
                    _wasFocused = IsFocused;
                    FocusChanged?.Invoke(this, IsFocused);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Focus check error: {ex.Message}");
            }
        }

        public void Dispose()
        {
            _checkTimer.Stop();
            _checkTimer.Dispose();
        }
    }
}

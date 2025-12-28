using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using LANLock.Services;

namespace LANLock
{
    /// <summary>
    /// Main kiosk form with WebView2 browser
    /// </summary>
    public partial class MainForm : Form
    {
        private readonly AppConfig _config;
        private WebView2? _webView;
        private HeartbeatService? _heartbeatService;
        private FocusMonitor? _focusMonitor;
        private Panel? _statusPanel;
        private Label? _statusLabel;

        // Windows API to disable keyboard shortcuts
        [DllImport("user32.dll")]
        private static extern bool RegisterHotKey(IntPtr hWnd, int id, int fsModifiers, int vk);

        [DllImport("user32.dll")]
        private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        private const int MOD_ALT = 0x0001;
        private const int MOD_CONTROL = 0x0002;
        private const int VK_TAB = 0x09;
        private const int VK_ESCAPE = 0x1B;
        private const int VK_F4 = 0x73;

        public MainForm(AppConfig config)
        {
            _config = config;
            InitializeComponent();
            SetupKioskMode();
        }

        private void InitializeComponent()
        {
            this.SuspendLayout();

            // Form properties
            this.Text = "LANLock Exam";
            this.Size = new Size(1280, 720);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(15, 15, 26);
            this.Font = new Font("Segoe UI", 10F);

            // Status panel (shown while loading)
            _statusPanel = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = Color.FromArgb(15, 15, 26)
            };

            _statusLabel = new Label
            {
                Text = "Connecting to exam server...",
                ForeColor = Color.White,
                AutoSize = false,
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Fill,
                Font = new Font("Segoe UI", 14F)
            };

            _statusPanel.Controls.Add(_statusLabel);
            this.Controls.Add(_statusPanel);

            // WebView2 control
            _webView = new WebView2
            {
                Dock = DockStyle.Fill,
                Visible = false
            };

            this.Controls.Add(_webView);

            this.ResumeLayout(false);

            // Events
            this.Load += MainForm_Load;
            this.FormClosing += MainForm_FormClosing;
            this.Activated += MainForm_Activated;
            this.Deactivate += MainForm_Deactivate;
        }

        /// <summary>
        /// Configure kiosk mode settings
        /// </summary>
        private void SetupKioskMode()
        {
            // Fullscreen, borderless
            this.FormBorderStyle = FormBorderStyle.None;
            this.WindowState = FormWindowState.Maximized;

            // Always on top
            this.TopMost = true;

            // Disable close button behavior
            this.ControlBox = false;
        }

        /// <summary>
        /// Form load handler
        /// </summary>
        private async void MainForm_Load(object? sender, EventArgs e)
        {
            try
            {
                // Register keyboard shortcuts to block
                RegisterBlockedKeys();

                // Initialize WebView2
                UpdateStatus("Initializing browser...");
                await InitializeWebViewAsync();

                // Start heartbeat service
                UpdateStatus("Connecting to server...");
                _heartbeatService = new HeartbeatService(_config);
                _heartbeatService.ConnectionStatusChanged += OnConnectionStatusChanged;
                await _heartbeatService.ConnectAsync();

                // Start focus monitor
                _focusMonitor = new FocusMonitor(this);
                _focusMonitor.FocusChanged += OnFocusChanged;
                _focusMonitor.Start();

                // Navigate to exam URL
                UpdateStatus("Loading exam...");
                _webView!.Source = new Uri(_config.ExamUrl);
            }
            catch (Exception ex)
            {
                UpdateStatus($"Error: {ex.Message}");
                MessageBox.Show(
                    $"Failed to initialize exam client:\n{ex.Message}",
                    "Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        /// <summary>
        /// Initialize WebView2 with kiosk settings
        /// </summary>
        private async System.Threading.Tasks.Task InitializeWebViewAsync()
        {
            // Create environment (uses default Edge WebView2 runtime)
            var env = await CoreWebView2Environment.CreateAsync();
            await _webView!.EnsureCoreWebView2Async(env);

            // Configure WebView2 settings
            var settings = _webView.CoreWebView2.Settings;
            
            // Disable developer tools
            settings.AreDevToolsEnabled = false;
            
            // Disable context menu
            settings.AreDefaultContextMenusEnabled = false;
            
            // Disable browser features
            settings.IsStatusBarEnabled = false;
            settings.IsZoomControlEnabled = false;
            
            // Allow JavaScript
            settings.IsScriptEnabled = true;

            // Navigation events
            _webView.NavigationCompleted += WebView_NavigationCompleted;
            _webView.CoreWebView2.NewWindowRequested += WebView_NewWindowRequested;

            // Hide address bar (it's not shown anyway in hosted control)
        }

        /// <summary>
        /// Handle navigation completed
        /// </summary>
        private void WebView_NavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (e.IsSuccess)
            {
                // Show WebView, hide status panel
                _statusPanel!.Visible = false;
                _webView!.Visible = true;
            }
            else
            {
                UpdateStatus($"Failed to load exam page. Retrying...");
                
                // Retry after 3 seconds
                var timer = new System.Windows.Forms.Timer { Interval = 3000 };
                timer.Tick += (s, args) =>
                {
                    timer.Stop();
                    timer.Dispose();
                    _webView!.Source = new Uri(_config.ExamUrl);
                };
                timer.Start();
            }
        }

        /// <summary>
        /// Block new window requests (popups)
        /// </summary>
        private void WebView_NewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            // Prevent opening new windows
            e.Handled = true;
            
            // Navigate in same window if it's our domain
            if (e.Uri.StartsWith(_config.ServerUrl))
            {
                _webView!.Source = new Uri(e.Uri);
            }
        }

        /// <summary>
        /// Handle connection status changes
        /// </summary>
        private void OnConnectionStatusChanged(object? sender, bool connected)
        {
            if (this.InvokeRequired)
            {
                this.Invoke(() => OnConnectionStatusChanged(sender, connected));
                return;
            }

            // Could update a status indicator here
            Console.WriteLine($"Connection status: {(connected ? "Connected" : "Disconnected")}");
        }

        /// <summary>
        /// Handle focus changes
        /// </summary>
        private void OnFocusChanged(object? sender, bool focused)
        {
            _heartbeatService?.SetFocused(focused);
        }

        /// <summary>
        /// Form activated
        /// </summary>
        private void MainForm_Activated(object? sender, EventArgs e)
        {
            _heartbeatService?.SetFocused(true);
        }

        /// <summary>
        /// Form deactivated
        /// </summary>
        private void MainForm_Deactivate(object? sender, EventArgs e)
        {
            _heartbeatService?.SetFocused(false);
            
            // Bring back to front (aggressive kiosk)
            this.BringToFront();
            this.Activate();
        }

        /// <summary>
        /// Form closing handler
        /// </summary>
        private async void MainForm_FormClosing(object? sender, FormClosingEventArgs e)
        {
            // Prevent closing via Alt+F4 during exam
            if (e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                return;
            }

            // Cleanup
            UnregisterBlockedKeys();
            _focusMonitor?.Dispose();
            
            if (_heartbeatService != null)
            {
                await _heartbeatService.DisconnectAsync();
                _heartbeatService.Dispose();
            }

            _webView?.Dispose();
        }

        /// <summary>
        /// Update status label
        /// </summary>
        private void UpdateStatus(string message)
        {
            if (_statusLabel != null)
            {
                if (this.InvokeRequired)
                {
                    this.Invoke(() => _statusLabel.Text = message);
                }
                else
                {
                    _statusLabel.Text = message;
                }
            }
        }

        /// <summary>
        /// Register hotkeys to block
        /// </summary>
        private void RegisterBlockedKeys()
        {
            // Try to block Alt+Tab (may not work without admin)
            RegisterHotKey(this.Handle, 1, MOD_ALT, VK_TAB);
            // Block Alt+F4
            RegisterHotKey(this.Handle, 2, MOD_ALT, VK_F4);
            // Block Ctrl+Escape (Start menu)
            RegisterHotKey(this.Handle, 3, MOD_CONTROL, VK_ESCAPE);
        }

        /// <summary>
        /// Unregister blocked hotkeys
        /// </summary>
        private void UnregisterBlockedKeys()
        {
            UnregisterHotKey(this.Handle, 1);
            UnregisterHotKey(this.Handle, 2);
            UnregisterHotKey(this.Handle, 3);
        }

        /// <summary>
        /// Process Windows messages (to intercept blocked keys)
        /// </summary>
        protected override void WndProc(ref Message m)
        {
            const int WM_HOTKEY = 0x0312;
            const int WM_SYSCOMMAND = 0x0112;
            const int SC_CLOSE = 0xF060;

            switch (m.Msg)
            {
                case WM_HOTKEY:
                    // Ignore blocked hotkeys
                    return;

                case WM_SYSCOMMAND:
                    // Block close from system menu
                    if ((m.WParam.ToInt32() & 0xFFF0) == SC_CLOSE)
                    {
                        return;
                    }
                    break;
            }

            base.WndProc(ref m);
        }

        /// <summary>
        /// Override ProcessCmdKey to block keyboard shortcuts
        /// </summary>
        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            // Block various escape attempts
            switch (keyData)
            {
                case Keys.Alt | Keys.F4:          // Close window
                case Keys.Alt | Keys.Tab:         // Switch window
                case Keys.Alt | Keys.Escape:      // Cycle windows
                case Keys.Control | Keys.Escape:  // Start menu
                case Keys.LWin:                   // Windows key
                case Keys.RWin:                   // Windows key
                case Keys.F11:                    // Toggle fullscreen in browser
                    return true; // Block these keys

                default:
                    return base.ProcessCmdKey(ref msg, keyData);
            }
        }
    }
}

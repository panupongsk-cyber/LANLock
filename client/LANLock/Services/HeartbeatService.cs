using System;
using System.Threading;
using System.Threading.Tasks;
using SocketIOClient;

namespace LANLock.Services
{
    /// <summary>
    /// Service for managing WebSocket heartbeat and server communication
    /// </summary>
    public class HeartbeatService : IDisposable
    {
        private SocketIOClient.SocketIO? _socket;
        private Timer? _heartbeatTimer;
        private readonly AppConfig _config;
        private bool _isFocused = true;
        private bool _isConnected = false;

        public event EventHandler<bool>? ConnectionStatusChanged;
        public event EventHandler<string>? ExamStateChanged;

        public bool IsConnected => _isConnected;

        public HeartbeatService(AppConfig config)
        {
            _config = config;
        }

        /// <summary>
        /// Connect to the server and start heartbeat
        /// </summary>
        public async Task ConnectAsync()
        {
            try
            {
                _socket = new SocketIOClient.SocketIO(_config.ServerUrl, new SocketIOOptions
                {
                    Reconnection = true,
                    ReconnectionAttempts = int.MaxValue,
                    ReconnectionDelay = 1000,
                    Transport = SocketIOClient.Transport.TransportProtocol.WebSocket
                });

                // Connection events
                _socket.OnConnected += OnConnected;
                _socket.OnDisconnected += OnDisconnected;
                _socket.OnReconnectAttempt += (sender, attempt) =>
                {
                    Console.WriteLine($"Reconnection attempt {attempt}");
                };

                // Exam state updates
                _socket.On("exam:state", response =>
                {
                    var state = response.GetValue<dynamic>();
                    ExamStateChanged?.Invoke(this, state?.is_active?.ToString() ?? "false");
                });

                await _socket.ConnectAsync();

                // Start heartbeat timer (every 5 seconds)
                _heartbeatTimer = new Timer(SendHeartbeat, null, 0, 5000);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Connection error: {ex.Message}");
                _isConnected = false;
                ConnectionStatusChanged?.Invoke(this, false);
            }
        }

        private void OnConnected(object? sender, EventArgs e)
        {
            _isConnected = true;
            ConnectionStatusChanged?.Invoke(this, true);
            Console.WriteLine("Connected to server");

            // Register as student
            _socket?.EmitAsync("student:connect", new
            {
                student_id = _config.StudentId,
                name = _config.StudentName
            });
        }

        private void OnDisconnected(object? sender, string reason)
        {
            _isConnected = false;
            ConnectionStatusChanged?.Invoke(this, false);
            Console.WriteLine($"Disconnected: {reason}");
        }

        /// <summary>
        /// Send heartbeat to server
        /// </summary>
        private async void SendHeartbeat(object? state)
        {
            if (_socket?.Connected == true)
            {
                try
                {
                    await _socket.EmitAsync("heartbeat", new
                    {
                        student_id = _config.StudentId,
                        is_focused = _isFocused
                    });
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Heartbeat error: {ex.Message}");
                }
            }
        }

        /// <summary>
        /// Update focus state
        /// </summary>
        public void SetFocused(bool focused)
        {
            bool changed = _isFocused != focused;
            _isFocused = focused;

            if (changed && _socket?.Connected == true)
            {
                if (!focused)
                {
                    // Immediately notify focus lost
                    _socket.EmitAsync("focus:lost", new
                    {
                        student_id = _config.StudentId
                    });
                    Console.WriteLine("VIOLATION: Focus lost");
                }
                else
                {
                    _socket.EmitAsync("focus:regained", new
                    {
                        student_id = _config.StudentId
                    });
                    Console.WriteLine("Focus regained");
                }
            }
        }

        /// <summary>
        /// Disconnect from server
        /// </summary>
        public async Task DisconnectAsync()
        {
            _heartbeatTimer?.Dispose();
            _heartbeatTimer = null;

            if (_socket != null)
            {
                await _socket.DisconnectAsync();
                _socket.Dispose();
                _socket = null;
            }

            _isConnected = false;
        }

        public void Dispose()
        {
            _heartbeatTimer?.Dispose();
            _socket?.Dispose();
        }
    }
}

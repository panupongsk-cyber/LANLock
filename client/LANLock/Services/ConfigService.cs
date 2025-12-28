using System;
using System.IO;
using System.Text.Json;

namespace LANLock.Services
{
    /// <summary>
    /// Configuration model for the client application
    /// </summary>
    public class AppConfig
    {
        public string ServerIP { get; set; } = "127.0.0.1";
        public int ServerPort { get; set; } = 3000;
        public string StudentId { get; set; } = "";
        public string StudentName { get; set; } = "";
        
        /// <summary>
        /// Gets the full server URL
        /// </summary>
        public string ServerUrl => $"http://{ServerIP}:{ServerPort}";
        
        /// <summary>
        /// Gets the exam URL
        /// </summary>
        public string ExamUrl => $"{ServerUrl}/exam/";
    }

    /// <summary>
    /// Service for loading and managing application configuration
    /// </summary>
    public static class ConfigService
    {
        private const string ConfigFileName = "config.json";
        private static AppConfig? _config;

        /// <summary>
        /// Load configuration from config.json
        /// </summary>
        public static AppConfig? Load()
        {
            try
            {
                string configPath = GetConfigPath();
                
                if (!File.Exists(configPath))
                {
                    // Create default config
                    var defaultConfig = new AppConfig();
                    Save(defaultConfig);
                    return defaultConfig;
                }

                string json = File.ReadAllText(configPath);
                _config = JsonSerializer.Deserialize<AppConfig>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                return _config;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error loading config: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Save configuration to config.json
        /// </summary>
        public static void Save(AppConfig config)
        {
            try
            {
                string configPath = GetConfigPath();
                string json = JsonSerializer.Serialize(config, new JsonSerializerOptions
                {
                    WriteIndented = true
                });
                File.WriteAllText(configPath, json);
                _config = config;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error saving config: {ex.Message}");
            }
        }

        /// <summary>
        /// Get the current config (must call Load first)
        /// </summary>
        public static AppConfig? Current => _config;

        private static string GetConfigPath()
        {
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            return Path.Combine(appDir, ConfigFileName);
        }
    }
}

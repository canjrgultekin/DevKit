using System.Text.Json;

namespace DevKit.Configuration;

public sealed class ProfileManager
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly string _configPath;
    private DevKitConfig _config = new();

    public ProfileManager()
    {
        var configDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".devkit");

        _configPath = Path.Combine(configDir, "devkit.json");
    }

    public string GetConfigPath() => _configPath;

    public void EnsureInitialized()
    {
        var dir = Path.GetDirectoryName(_configPath)!;
        if (!Directory.Exists(dir))
            Directory.CreateDirectory(dir);

        if (File.Exists(_configPath))
        {
            var json = File.ReadAllText(_configPath);
            _config = JsonSerializer.Deserialize<DevKitConfig>(json, JsonOptions) ?? new DevKitConfig();
        }
        else
        {
            _config = new DevKitConfig();
            Save();
        }
    }

    public DevKitConfig GetConfig() => _config;

    public DevKitProfile? GetActiveProfile()
    {
        if (string.IsNullOrEmpty(_config.ActiveProfile))
            return null;

        _config.Profiles.TryGetValue(_config.ActiveProfile, out var profile);
        return profile;
    }

    public DevKitProfile? GetProfile(string key)
    {
        _config.Profiles.TryGetValue(key, out var profile);
        return profile;
    }

    public void SetActiveProfile(string key)
    {
        if (!_config.Profiles.ContainsKey(key))
            throw new InvalidOperationException($"Profile '{key}' not found.");

        _config.ActiveProfile = key;
        Save();
    }

    public void SaveProfile(string key, DevKitProfile profile)
    {
        _config.Profiles[key] = profile;

        if (string.IsNullOrEmpty(_config.ActiveProfile))
            _config.ActiveProfile = key;

        Save();
    }

    public void DeleteProfile(string key)
    {
        _config.Profiles.Remove(key);

        if (_config.ActiveProfile == key)
            _config.ActiveProfile = _config.Profiles.Keys.FirstOrDefault() ?? string.Empty;

        Save();
    }

    private void Save()
    {
        var json = JsonSerializer.Serialize(_config, JsonOptions);
        File.WriteAllText(_configPath, json);
    }
}

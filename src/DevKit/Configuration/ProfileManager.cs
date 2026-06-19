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

    // ═══ REMOTE SSH HOSTS ═══

    public IReadOnlyDictionary<string, RemoteHost> GetRemotes() => _config.Remotes;

    public RemoteHost? GetRemote(string name)
    {
        _config.Remotes.TryGetValue(name, out var remote);
        return remote;
    }

    public void SaveRemote(string name, RemoteHost host)
    {
        if (string.IsNullOrWhiteSpace(host.Name))
            host.Name = name;

        _config.Remotes[name] = host;
        Save();
    }

    public bool DeleteRemote(string name)
    {
        var removed = _config.Remotes.Remove(name);
        if (removed) Save();
        return removed;
    }

    // ═══ LLM PROVIDERS ═══

    public IReadOnlyDictionary<string, LlmProvider> GetLlmProviders() => _config.LlmProviders;

    public LlmProvider? GetLlmProvider(string name)
    {
        _config.LlmProviders.TryGetValue(name, out var provider);
        return provider;
    }

    public void SaveLlmProvider(string name, LlmProvider provider)
    {
        if (string.IsNullOrWhiteSpace(provider.Name))
            provider.Name = name;

        _config.LlmProviders[name] = provider;
        Save();
    }

    public bool DeleteLlmProvider(string name)
    {
        var removed = _config.LlmProviders.Remove(name);
        if (removed) Save();
        return removed;
    }

    private void Save()
    {
        var json = JsonSerializer.Serialize(_config, JsonOptions);
        File.WriteAllText(_configPath, json);
    }
}

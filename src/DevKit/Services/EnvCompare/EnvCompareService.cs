using System.Text.Json;
using System.Text.Json.Serialization;

namespace DevKit.Services.EnvCompare;

public interface IEnvCompareService
{
    CompareResult CompareFiles(List<EnvFile> files);
    List<EnvFile> ScanAppSettings(string projectPath);
}

public class EnvFile
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("path")]
    public string Path { get; set; } = string.Empty;

    [JsonPropertyName("content")]
    public string Content { get; set; } = string.Empty;
}

public class CompareResult
{
    [JsonPropertyName("environments")]
    public List<string> Environments { get; set; } = [];

    [JsonPropertyName("keys")]
    public List<KeyCompare> Keys { get; set; } = [];

    [JsonPropertyName("totalKeys")]
    public int TotalKeys { get; set; }

    [JsonPropertyName("missingCount")]
    public int MissingCount { get; set; }

    [JsonPropertyName("differentCount")]
    public int DifferentCount { get; set; }

    [JsonPropertyName("identicalCount")]
    public int IdenticalCount { get; set; }
}

public class KeyCompare
{
    [JsonPropertyName("key")]
    public string Key { get; set; } = string.Empty;

    [JsonPropertyName("values")]
    public Dictionary<string, string?> Values { get; set; } = new();

    [JsonPropertyName("status")]
    public string Status { get; set; } = "identical";

    [JsonPropertyName("isSensitive")]
    public bool IsSensitive { get; set; }
}

public class EnvCompareService : IEnvCompareService
{
    private static readonly HashSet<string> SensitiveKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "password", "secret", "key", "token", "connectionstring",
        "apikey", "api_key", "masterkey", "master_key", "credential"
    };

    public List<EnvFile> ScanAppSettings(string projectPath)
    {
        var files = new List<EnvFile>();
        var patterns = new[] { "appsettings*.json", ".env*" };

        foreach (var pattern in patterns)
        {
            var found = Directory.GetFiles(projectPath, pattern, SearchOption.AllDirectories)
                .Where(f => !f.Contains("bin") && !f.Contains("obj") && !f.Contains("node_modules"))
                .ToList();

            foreach (var filePath in found)
            {
                var fileName = System.IO.Path.GetFileName(filePath);
                var content = File.ReadAllText(filePath);
                var envName = ExtractEnvName(fileName);

                files.Add(new EnvFile
                {
                    Name = envName,
                    Path = System.IO.Path.GetRelativePath(projectPath, filePath).Replace('\\', '/'),
                    Content = content
                });
            }
        }

        return files.OrderBy(f => f.Name).ToList();
    }

    public CompareResult CompareFiles(List<EnvFile> files)
    {
        var result = new CompareResult();
        var allKeys = new Dictionary<string, Dictionary<string, string?>>();

        foreach (var file in files)
        {
            result.Environments.Add(file.Name);

            if (file.Path.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
            {
                var flat = FlattenJson(file.Content);
                foreach (var kv in flat)
                {
                    if (!allKeys.ContainsKey(kv.Key)) allKeys[kv.Key] = new Dictionary<string, string?>();
                    allKeys[kv.Key][file.Name] = kv.Value;
                }
            }
            else
            {
                var envVars = ParseEnvFile(file.Content);
                foreach (var kv in envVars)
                {
                    if (!allKeys.ContainsKey(kv.Key)) allKeys[kv.Key] = new Dictionary<string, string?>();
                    allKeys[kv.Key][file.Name] = kv.Value;
                }
            }
        }

        foreach (var kv in allKeys.OrderBy(x => x.Key))
        {
            var values = new Dictionary<string, string?>();
            foreach (var env in result.Environments)
                values[env] = kv.Value.TryGetValue(env, out var val) ? val : null;

            var nonNullValues = values.Values.Where(v => v != null).ToList();
            string status;

            if (nonNullValues.Count < result.Environments.Count)
                status = "missing";
            else if (nonNullValues.Distinct().Count() == 1)
                status = "identical";
            else
                status = "different";

            var isSensitive = SensitiveKeys.Any(sk => kv.Key.Contains(sk, StringComparison.OrdinalIgnoreCase));

            result.Keys.Add(new KeyCompare
            {
                Key = kv.Key,
                Values = values,
                Status = status,
                IsSensitive = isSensitive
            });
        }

        result.TotalKeys = result.Keys.Count;
        result.MissingCount = result.Keys.Count(k => k.Status == "missing");
        result.DifferentCount = result.Keys.Count(k => k.Status == "different");
        result.IdenticalCount = result.Keys.Count(k => k.Status == "identical");

        return result;
    }

    private static string ExtractEnvName(string fileName)
    {
        if (fileName.Equals("appsettings.json", StringComparison.OrdinalIgnoreCase)) return "Base";
        if (fileName.Contains("Development", StringComparison.OrdinalIgnoreCase)) return "Development";
        if (fileName.Contains("Staging", StringComparison.OrdinalIgnoreCase)) return "Staging";
        if (fileName.Contains("Production", StringComparison.OrdinalIgnoreCase)) return "Production";
        if (fileName.Contains("Local", StringComparison.OrdinalIgnoreCase)) return "Local";
        if (fileName.Equals(".env", StringComparison.OrdinalIgnoreCase)) return "Base";
        if (fileName.Contains(".local", StringComparison.OrdinalIgnoreCase)) return "Local";
        if (fileName.Contains(".dev", StringComparison.OrdinalIgnoreCase)) return "Development";
        if (fileName.Contains(".prod", StringComparison.OrdinalIgnoreCase)) return "Production";
        return System.IO.Path.GetFileNameWithoutExtension(fileName);
    }

    private static Dictionary<string, string> FlattenJson(string json, string prefix = "")
    {
        var result = new Dictionary<string, string>();
        try
        {
            using var doc = JsonDocument.Parse(json);
            FlattenElement(doc.RootElement, prefix, result);
        }
        catch { /* invalid JSON */ }
        return result;
    }

    private static void FlattenElement(JsonElement element, string prefix, Dictionary<string, string> result)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                foreach (var prop in element.EnumerateObject())
                {
                    var key = string.IsNullOrEmpty(prefix) ? prop.Name : $"{prefix}:{prop.Name}";
                    FlattenElement(prop.Value, key, result);
                }
                break;
            case JsonValueKind.Array:
                var i = 0;
                foreach (var item in element.EnumerateArray())
                {
                    FlattenElement(item, $"{prefix}[{i}]", result);
                    i++;
                }
                break;
            default:
                result[prefix] = element.ToString();
                break;
        }
    }

    private static Dictionary<string, string> ParseEnvFile(string content)
    {
        var result = new Dictionary<string, string>();
        foreach (var line in content.Split('\n'))
        {
            var trimmed = line.Trim();
            if (string.IsNullOrEmpty(trimmed) || trimmed.StartsWith('#')) continue;
            var eqIdx = trimmed.IndexOf('=');
            if (eqIdx <= 0) continue;
            var key = trimmed[..eqIdx].Trim();
            var value = trimmed[(eqIdx + 1)..].Trim().Trim('"', '\'');
            result[key] = value;
        }
        return result;
    }
}
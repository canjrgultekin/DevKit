using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace DevKit.Services.PackageAudit;

public interface IPackageAuditService
{
    Task<AuditResult> AuditProjectAsync(string projectPath, string framework = "dotnet");
}

// ===== MODELS =====

public class AuditResult
{
    [JsonPropertyName("framework")]
    public string Framework { get; set; } = string.Empty;

    [JsonPropertyName("projectPath")]
    public string ProjectPath { get; set; } = string.Empty;

    [JsonPropertyName("packages")]
    public List<PackageInfo> Packages { get; set; } = [];

    [JsonPropertyName("totalPackages")]
    public int TotalPackages { get; set; }

    [JsonPropertyName("outdatedCount")]
    public int OutdatedCount { get; set; }

    [JsonPropertyName("vulnerableCount")]
    public int VulnerableCount { get; set; }

    [JsonPropertyName("summary")]
    public AuditSummary Summary { get; set; } = new();
}

public class AuditSummary
{
    [JsonPropertyName("upToDate")]
    public int UpToDate { get; set; }

    [JsonPropertyName("minor")]
    public int Minor { get; set; }

    [JsonPropertyName("major")]
    public int Major { get; set; }

    [JsonPropertyName("patch")]
    public int Patch { get; set; }

    [JsonPropertyName("vulnerable")]
    public int Vulnerable { get; set; }
}

public class PackageInfo
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("currentVersion")]
    public string CurrentVersion { get; set; } = string.Empty;

    [JsonPropertyName("latestVersion")]
    public string? LatestVersion { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = "up-to-date";

    [JsonPropertyName("updateType")]
    public string? UpdateType { get; set; }

    [JsonPropertyName("isVulnerable")]
    public bool IsVulnerable { get; set; }

    [JsonPropertyName("vulnerabilities")]
    public List<VulnerabilityInfo> Vulnerabilities { get; set; } = [];

    [JsonPropertyName("projectFile")]
    public string ProjectFile { get; set; } = string.Empty;
}

public class VulnerabilityInfo
{
    [JsonPropertyName("severity")]
    public string Severity { get; set; } = string.Empty;

    [JsonPropertyName("advisoryUrl")]
    public string AdvisoryUrl { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string Description { get; set; } = string.Empty;
}

// ===== SERVICE =====

public class PackageAuditService : IPackageAuditService
{
    public async Task<AuditResult> AuditProjectAsync(string projectPath, string framework = "dotnet")
    {
        return framework.ToLower() switch
        {
            "dotnet" => await AuditDotNetAsync(projectPath),
            "nodejs" or "nextjs" => await AuditNpmAsync(projectPath),
            "python" => await AuditPythonAsync(projectPath),
            _ => throw new ArgumentException($"Unsupported framework: {framework}")
        };
    }

    // ===== .NET =====

    private async Task<AuditResult> AuditDotNetAsync(string projectPath)
    {
        var result = new AuditResult { Framework = "dotnet", ProjectPath = projectPath };

        // 1. Mevcut paketleri csproj'lardan oku
        var packages = ParseCsprojPackages(projectPath);

        // 2. dotnet list package --outdated calistir
        var outdatedOutput = await RunDotNetCommandAsync("list package --outdated --format json", projectPath);

        if (!string.IsNullOrEmpty(outdatedOutput))
        {
            try
            {
                using var doc = JsonDocument.Parse(outdatedOutput);
                if (doc.RootElement.TryGetProperty("projects", out var projects))
                {
                    foreach (var proj in projects.EnumerateArray())
                    {
                        if (!proj.TryGetProperty("frameworks", out var frameworks)) continue;
                        foreach (var fw in frameworks.EnumerateArray())
                        {
                            if (!fw.TryGetProperty("topLevelPackages", out var pkgs)) continue;
                            foreach (var pkg in pkgs.EnumerateArray())
                            {
                                var name = pkg.GetProperty("id").GetString() ?? "";
                                var resolved = pkg.TryGetProperty("resolvedVersion", out var rv) ? rv.GetString() ?? "" : "";
                                var latest = pkg.TryGetProperty("latestVersion", out var lv) ? lv.GetString() ?? "" : "";

                                var existing = packages.FirstOrDefault(p => p.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
                                if (existing != null)
                                {
                                    existing.LatestVersion = latest;
                                    existing.UpdateType = DetermineUpdateType(resolved, latest);
                                    existing.Status = existing.UpdateType != null ? "outdated" : "up-to-date";
                                }
                            }
                        }
                    }
                }
            }
            catch { /* JSON parse hatasi, devam et */ }
        }

        // 3. dotnet list package --vulnerable calistir
        var vulnerableOutput = await RunDotNetCommandAsync("list package --vulnerable --format json", projectPath);

        if (!string.IsNullOrEmpty(vulnerableOutput))
        {
            try
            {
                using var doc = JsonDocument.Parse(vulnerableOutput);
                if (doc.RootElement.TryGetProperty("projects", out var projects))
                {
                    foreach (var proj in projects.EnumerateArray())
                    {
                        if (!proj.TryGetProperty("frameworks", out var frameworks)) continue;
                        foreach (var fw in frameworks.EnumerateArray())
                        {
                            if (!fw.TryGetProperty("topLevelPackages", out var pkgs)) continue;
                            foreach (var pkg in pkgs.EnumerateArray())
                            {
                                var name = pkg.GetProperty("id").GetString() ?? "";
                                var existing = packages.FirstOrDefault(p => p.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
                                if (existing != null)
                                {
                                    existing.IsVulnerable = true;
                                    if (pkg.TryGetProperty("vulnerabilities", out var vulns))
                                    {
                                        foreach (var v in vulns.EnumerateArray())
                                        {
                                            existing.Vulnerabilities.Add(new VulnerabilityInfo
                                            {
                                                Severity = v.TryGetProperty("severity", out var s) ? s.GetString() ?? "" : "",
                                                AdvisoryUrl = v.TryGetProperty("advisoryurl", out var u) ? u.GetString() ?? "" : "",
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            catch { /* devam et */ }
        }

        result.Packages = packages;
        result.TotalPackages = packages.Count;
        result.OutdatedCount = packages.Count(p => p.Status == "outdated");
        result.VulnerableCount = packages.Count(p => p.IsVulnerable);
        result.Summary = new AuditSummary
        {
            UpToDate = packages.Count(p => p.Status == "up-to-date" && !p.IsVulnerable),
            Patch = packages.Count(p => p.UpdateType == "patch"),
            Minor = packages.Count(p => p.UpdateType == "minor"),
            Major = packages.Count(p => p.UpdateType == "major"),
            Vulnerable = result.VulnerableCount,
        };

        return result;
    }

    private static List<PackageInfo> ParseCsprojPackages(string rootPath)
    {
        var packages = new List<PackageInfo>();
        var csprojFiles = Directory.GetFiles(rootPath, "*.csproj", SearchOption.AllDirectories)
            .Where(f => !f.Contains("bin") && !f.Contains("obj"))
            .ToList();

        foreach (var csproj in csprojFiles)
        {
            var content = File.ReadAllText(csproj);
            var matches = Regex.Matches(content, @"<PackageReference\s+Include=""(.*?)""\s+Version=""(.*?)""");
            var projName = Path.GetFileNameWithoutExtension(csproj);

            foreach (Match match in matches)
            {
                packages.Add(new PackageInfo
                {
                    Name = match.Groups[1].Value,
                    CurrentVersion = match.Groups[2].Value,
                    ProjectFile = projName,
                    Status = "up-to-date"
                });
            }
        }

        return packages;
    }

    // ===== NPM =====

    private async Task<AuditResult> AuditNpmAsync(string projectPath)
    {
        var result = new AuditResult { Framework = "nodejs", ProjectPath = projectPath };
        var packages = new List<PackageInfo>();

        // package.json oku
        var pkgJsonPath = Path.Combine(projectPath, "package.json");
        if (File.Exists(pkgJsonPath))
        {
            var content = File.ReadAllText(pkgJsonPath);
            using var doc = JsonDocument.Parse(content);

            void ParseDeps(string section)
            {
                if (!doc.RootElement.TryGetProperty(section, out var deps)) return;
                foreach (var dep in deps.EnumerateObject())
                {
                    packages.Add(new PackageInfo
                    {
                        Name = dep.Name,
                        CurrentVersion = dep.Value.GetString()?.TrimStart('^', '~') ?? "",
                        ProjectFile = section,
                        Status = "up-to-date"
                    });
                }
            }

            ParseDeps("dependencies");
            ParseDeps("devDependencies");
        }

        // npm outdated --json
        var outdatedOutput = await RunNpmCommandAsync("outdated --json", projectPath);
        if (!string.IsNullOrEmpty(outdatedOutput))
        {
            try
            {
                using var doc = JsonDocument.Parse(outdatedOutput);
                foreach (var prop in doc.RootElement.EnumerateObject())
                {
                    var name = prop.Name;
                    var current = prop.Value.TryGetProperty("current", out var c) ? c.GetString() ?? "" : "";
                    var latest = prop.Value.TryGetProperty("latest", out var l) ? l.GetString() ?? "" : "";

                    var existing = packages.FirstOrDefault(p => p.Name == name);
                    if (existing != null)
                    {
                        if (!string.IsNullOrEmpty(current)) existing.CurrentVersion = current;
                        existing.LatestVersion = latest;
                        existing.UpdateType = DetermineUpdateType(current, latest);
                        existing.Status = "outdated";
                    }
                }
            }
            catch { /* devam et */ }
        }

        // npm audit --json
        var auditOutput = await RunNpmCommandAsync("audit --json", projectPath);
        if (!string.IsNullOrEmpty(auditOutput))
        {
            try
            {
                using var doc = JsonDocument.Parse(auditOutput);
                if (doc.RootElement.TryGetProperty("vulnerabilities", out var vulns))
                {
                    foreach (var vuln in vulns.EnumerateObject())
                    {
                        var existing = packages.FirstOrDefault(p => p.Name == vuln.Name);
                        if (existing != null)
                        {
                            existing.IsVulnerable = true;
                            var severity = vuln.Value.TryGetProperty("severity", out var s) ? s.GetString() ?? "" : "";
                            existing.Vulnerabilities.Add(new VulnerabilityInfo { Severity = severity });
                        }
                    }
                }
            }
            catch { /* devam et */ }
        }

        result.Packages = packages;
        result.TotalPackages = packages.Count;
        result.OutdatedCount = packages.Count(p => p.Status == "outdated");
        result.VulnerableCount = packages.Count(p => p.IsVulnerable);
        result.Summary = new AuditSummary
        {
            UpToDate = packages.Count(p => p.Status == "up-to-date" && !p.IsVulnerable),
            Patch = packages.Count(p => p.UpdateType == "patch"),
            Minor = packages.Count(p => p.UpdateType == "minor"),
            Major = packages.Count(p => p.UpdateType == "major"),
            Vulnerable = result.VulnerableCount,
        };

        return result;
    }

    // ===== PYTHON =====

    private async Task<AuditResult> AuditPythonAsync(string projectPath)
    {
        var result = new AuditResult { Framework = "python", ProjectPath = projectPath };
        var packages = new List<PackageInfo>();

        var reqPath = Path.Combine(projectPath, "requirements.txt");
        if (File.Exists(reqPath))
        {
            var lines = await File.ReadAllLinesAsync(reqPath);
            foreach (var line in lines)
            {
                var trimmed = line.Trim();
                if (string.IsNullOrEmpty(trimmed) || trimmed.StartsWith('#')) continue;

                var match = Regex.Match(trimmed, @"^([a-zA-Z0-9_\-\.]+)==(.+)$");
                if (match.Success)
                {
                    packages.Add(new PackageInfo
                    {
                        Name = match.Groups[1].Value,
                        CurrentVersion = match.Groups[2].Value,
                        ProjectFile = "requirements.txt"
                    });
                }
            }
        }

        result.Packages = packages;
        result.TotalPackages = packages.Count;
        return result;
    }

    // ===== HELPERS =====

    private static string? DetermineUpdateType(string current, string latest)
    {
        if (string.IsNullOrEmpty(current) || string.IsNullOrEmpty(latest)) return null;
        if (current == latest) return null;

        var curParts = current.Split('.').Select(s => int.TryParse(s, out var n) ? n : 0).ToArray();
        var latParts = latest.Split('.').Select(s => int.TryParse(s, out var n) ? n : 0).ToArray();

        if (curParts.Length < 3 || latParts.Length < 3) return "unknown";

        if (latParts[0] > curParts[0]) return "major";
        if (latParts[1] > curParts[1]) return "minor";
        if (latParts[2] > curParts[2]) return "patch";

        return null;
    }

    private static async Task<string> RunDotNetCommandAsync(string arguments, string workingDir)
    {
        return await RunProcessAsync("dotnet", arguments, workingDir);
    }

    private static async Task<string> RunNpmCommandAsync(string arguments, string workingDir)
    {
        var cmd = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "cmd.exe" : "npm";
        var args = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? $"/c npm {arguments}" : arguments;
        return await RunProcessAsync(cmd, args, workingDir);
    }

    private static async Task<string> RunProcessAsync(string command, string arguments, string workingDir)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = command,
                Arguments = arguments,
                WorkingDirectory = workingDir,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(psi);
            if (process == null) return "";

            var output = await process.StandardOutput.ReadToEndAsync();
            await process.WaitForExitAsync();
            return output;
        }
        catch { return ""; }
    }
}
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace DevKit.Services.ProjectManagement;

public interface IProjectManagementService
{
    // NuGet / npm paket yonetimi
    Task<CommandResult> AddPackageAsync(string projectPath, string packageName, string? version = null);
    Task<CommandResult> RemovePackageAsync(string projectPath, string packageName);
    Task<CommandResult> AddPackageToAllAsync(string solutionPath, string packageName, string? version = null);

    // Project reference yonetimi
    Task<CommandResult> AddProjectReferenceAsync(string projectPath, string referencePath);
    Task<CommandResult> RemoveProjectReferenceAsync(string projectPath, string referencePath);
    List<ProjectRefInfo> ListProjectReferences(string projectPath);

    // Git diff / revert
    Task<List<ModifiedFile>> GetModifiedFilesAsync(string workspacePath);
    Task<DiffResult> GetFileDiffAsync(string workspacePath, string filePath);
    Task<CommandResult> RevertFileAsync(string workspacePath, string filePath);
    Task<CommandResult> AcceptFileAsync(string workspacePath, string filePath);
}

// ===== MODELS =====

public class CommandResult
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("output")]
    public string Output { get; set; } = string.Empty;
}

public class ProjectRefInfo
{
    [JsonPropertyName("projectName")]
    public string ProjectName { get; set; } = string.Empty;

    [JsonPropertyName("relativePath")]
    public string RelativePath { get; set; } = string.Empty;
}

public class ModifiedFile
{
    [JsonPropertyName("filePath")]
    public string FilePath { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("fileName")]
    public string FileName { get; set; } = string.Empty;

    [JsonPropertyName("extension")]
    public string Extension { get; set; } = string.Empty;
}

public class DiffResult
{
    [JsonPropertyName("filePath")]
    public string FilePath { get; set; } = string.Empty;

    [JsonPropertyName("originalContent")]
    public string OriginalContent { get; set; } = string.Empty;

    [JsonPropertyName("modifiedContent")]
    public string ModifiedContent { get; set; } = string.Empty;

    [JsonPropertyName("diffOutput")]
    public string DiffOutput { get; set; } = string.Empty;

    [JsonPropertyName("additions")]
    public int Additions { get; set; }

    [JsonPropertyName("deletions")]
    public int Deletions { get; set; }
}

// ===== SERVICE =====

public class ProjectManagementService : IProjectManagementService
{
    // ═══════════════════════════════════════
    // NUGET PAKET YONETIMI
    // ═══════════════════════════════════════

    public async Task<CommandResult> AddPackageAsync(string projectPath, string packageName, string? version = null)
    {
        // projectPath .csproj dosyasi veya klasor olabilir
        var csproj = ResolveCsproj(projectPath);
        if (csproj == null)
            return new CommandResult { Success = false, Message = $"No .csproj found at: {projectPath}" };

        var versionArg = string.IsNullOrWhiteSpace(version) ? "" : $" --version {version}";
        var output = await RunCommandAsync("dotnet", $"add \"{csproj}\" package {packageName}{versionArg}", Path.GetDirectoryName(csproj)!);

        var success = output.Contains("PackageReference", StringComparison.OrdinalIgnoreCase) ||
                      output.Contains("Added", StringComparison.OrdinalIgnoreCase) ||
                      !output.Contains("error", StringComparison.OrdinalIgnoreCase);

        return new CommandResult
        {
            Success = success,
            Message = success ? $"{packageName}{(version != null ? $" v{version}" : " (latest)")} added to {Path.GetFileName(csproj)}" : $"Failed to add {packageName}",
            Output = output
        };
    }

    public async Task<CommandResult> RemovePackageAsync(string projectPath, string packageName)
    {
        var csproj = ResolveCsproj(projectPath);
        if (csproj == null)
            return new CommandResult { Success = false, Message = $"No .csproj found at: {projectPath}" };

        var output = await RunCommandAsync("dotnet", $"remove \"{csproj}\" package {packageName}", Path.GetDirectoryName(csproj)!);
        var success = !output.Contains("error", StringComparison.OrdinalIgnoreCase);

        return new CommandResult
        {
            Success = success,
            Message = success ? $"{packageName} removed from {Path.GetFileName(csproj)}" : $"Failed to remove {packageName}",
            Output = output
        };
    }

    public async Task<CommandResult> AddPackageToAllAsync(string solutionPath, string packageName, string? version = null)
    {
        var csprojFiles = Directory.GetFiles(solutionPath, "*.csproj", SearchOption.AllDirectories)
            .Where(f => !f.Contains("bin") && !f.Contains("obj"))
            .ToList();

        if (csprojFiles.Count == 0)
            return new CommandResult { Success = false, Message = "No .csproj files found." };

        var results = new List<string>();
        var allSuccess = true;

        foreach (var csproj in csprojFiles)
        {
            var result = await AddPackageAsync(csproj, packageName, version);
            results.Add($"{Path.GetFileName(csproj)}: {(result.Success ? "OK" : "FAILED")}");
            if (!result.Success) allSuccess = false;
        }

        return new CommandResult
        {
            Success = allSuccess,
            Message = $"Package {packageName} added to {csprojFiles.Count} projects.",
            Output = string.Join("\n", results)
        };
    }

    // ═══════════════════════════════════════
    // PROJECT REFERENCE YONETIMI
    // ═══════════════════════════════════════

    public async Task<CommandResult> AddProjectReferenceAsync(string projectPath, string referencePath)
    {
        var csproj = ResolveCsproj(projectPath);
        if (csproj == null)
            return new CommandResult { Success = false, Message = $"No .csproj found at: {projectPath}" };

        var refCsproj = ResolveCsproj(referencePath);
        if (refCsproj == null)
            return new CommandResult { Success = false, Message = $"No .csproj found at: {referencePath}" };

        var output = await RunCommandAsync("dotnet", $"add \"{csproj}\" reference \"{refCsproj}\"", Path.GetDirectoryName(csproj)!);
        var success = output.Contains("added", StringComparison.OrdinalIgnoreCase) ||
                      output.Contains("Reference", StringComparison.OrdinalIgnoreCase);

        return new CommandResult
        {
            Success = success,
            Message = success
                ? $"{Path.GetFileNameWithoutExtension(refCsproj)} referenced by {Path.GetFileNameWithoutExtension(csproj)}"
                : "Failed to add reference",
            Output = output
        };
    }

    public async Task<CommandResult> RemoveProjectReferenceAsync(string projectPath, string referencePath)
    {
        var csproj = ResolveCsproj(projectPath);
        if (csproj == null)
            return new CommandResult { Success = false, Message = $"No .csproj found at: {projectPath}" };

        var refCsproj = ResolveCsproj(referencePath);
        if (refCsproj == null)
            return new CommandResult { Success = false, Message = $"No .csproj found at: {referencePath}" };

        var output = await RunCommandAsync("dotnet", $"remove \"{csproj}\" reference \"{refCsproj}\"", Path.GetDirectoryName(csproj)!);
        var success = !output.Contains("error", StringComparison.OrdinalIgnoreCase);

        return new CommandResult
        {
            Success = success,
            Message = success ? $"Reference removed." : "Failed to remove reference",
            Output = output
        };
    }

    public List<ProjectRefInfo> ListProjectReferences(string projectPath)
    {
        var csproj = ResolveCsproj(projectPath);
        if (csproj == null) return [];

        var content = File.ReadAllText(csproj);
        var matches = Regex.Matches(content, @"<ProjectReference\s+Include=""(.*?)""");
        var refs = new List<ProjectRefInfo>();

        foreach (Match match in matches)
        {
            var relPath = match.Groups[1].Value;
            refs.Add(new ProjectRefInfo
            {
                RelativePath = relPath.Replace('\\', '/'),
                ProjectName = Path.GetFileNameWithoutExtension(relPath)
            });
        }

        return refs;
    }

    // ═══════════════════════════════════════
    // GIT DIFF / REVERT
    // ═══════════════════════════════════════

    public async Task<List<ModifiedFile>> GetModifiedFilesAsync(string workspacePath)
    {
        var output = await RunCommandAsync("git", "status --porcelain", workspacePath);
        var files = new List<ModifiedFile>();

        foreach (var line in output.Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            if (line.Length < 4) continue;
            var statusCode = line[..2].Trim();
            var filePath = line[3..].Trim().Trim('"');

            var status = statusCode switch
            {
                "M" => "modified",
                "A" => "added",
                "D" => "deleted",
                "R" => "renamed",
                "??" => "untracked",
                "MM" => "modified",
                "AM" => "added+modified",
                _ => statusCode
            };

            files.Add(new ModifiedFile
            {
                FilePath = filePath,
                Status = status,
                FileName = Path.GetFileName(filePath),
                Extension = Path.GetExtension(filePath)
            });
        }

        return files;
    }

    public async Task<DiffResult> GetFileDiffAsync(string workspacePath, string filePath)
    {
        var result = new DiffResult { FilePath = filePath };

        // Orjinal (HEAD) versiyonu
        var original = await RunCommandAsync("git", $"show HEAD:\"{filePath}\"", workspacePath);
        result.OriginalContent = original;

        // Modified versiyonu (diskteki hali)
        var fullPath = Path.Combine(workspacePath, filePath.Replace('/', Path.DirectorySeparatorChar));
        result.ModifiedContent = File.Exists(fullPath) ? await File.ReadAllTextAsync(fullPath) : "";

        // Diff ciktisi
        var diff = await RunCommandAsync("git", $"diff HEAD -- \"{filePath}\"", workspacePath);
        result.DiffOutput = diff;

        // Satir sayilari
        result.Additions = diff.Split('\n').Count(l => l.StartsWith('+') && !l.StartsWith("+++"));
        result.Deletions = diff.Split('\n').Count(l => l.StartsWith('-') && !l.StartsWith("---"));

        return result;
    }

    public async Task<CommandResult> RevertFileAsync(string workspacePath, string filePath)
    {
        var output = await RunCommandAsync("git", $"checkout HEAD -- \"{filePath}\"", workspacePath);
        return new CommandResult
        {
            Success = true,
            Message = $"{filePath} reverted to last committed version.",
            Output = output
        };
    }

    public async Task<CommandResult> AcceptFileAsync(string workspacePath, string filePath)
    {
        var output = await RunCommandAsync("git", $"add \"{filePath}\"", workspacePath);
        return new CommandResult
        {
            Success = true,
            Message = $"{filePath} staged (modified version accepted).",
            Output = output
        };
    }

    // ═══════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════

    private static string? ResolveCsproj(string path)
    {
        if (path.EndsWith(".csproj", StringComparison.OrdinalIgnoreCase) && File.Exists(path))
            return path;

        if (Directory.Exists(path))
        {
            var found = Directory.GetFiles(path, "*.csproj", SearchOption.TopDirectoryOnly);
            if (found.Length > 0) return found[0];
        }

        // Ust klasorlerde ara
        var searchPath = path;
        while (!string.IsNullOrEmpty(searchPath))
        {
            var files = Directory.GetFiles(searchPath, "*.csproj", SearchOption.TopDirectoryOnly);
            if (files.Length > 0) return files[0];
            searchPath = Path.GetDirectoryName(searchPath);
        }

        return null;
    }

    private static async Task<string> RunCommandAsync(string command, string arguments, string workingDir)
    {
        try
        {
            string fileName, args;
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                fileName = "cmd.exe";
                args = $"/c {command} {arguments}";
            }
            else
            {
                fileName = command;
                args = arguments;
            }

            var psi = new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = args,
                WorkingDirectory = workingDir,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(psi);
            if (process == null) return "";

            var stdout = await process.StandardOutput.ReadToEndAsync();
            var stderr = await process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync();

            return string.IsNullOrEmpty(stdout) ? stderr : stdout;
        }
        catch (Exception ex) { return ex.Message; }
    }
}
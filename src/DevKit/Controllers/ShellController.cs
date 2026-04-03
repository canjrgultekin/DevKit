using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace DevKit.Controllers;

[ApiController]
[Route("api")]
public class ShellController : ControllerBase
{
    // ═══════════════════════════════════════════════
    // SINGLE COMMAND EXECUTION
    // ═══════════════════════════════════════════════

    [HttpPost("shell/exec")]
    public async Task<IActionResult> Execute([FromBody] ShellExecRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Command))
            return Ok(new { success = false, error = "Command gerekli." });

        var workDir = ResolveWorkDir(request.WorkingDirectory);
        if (workDir == null)
            return Ok(new { success = false, error = "WorkingDirectory gerekli veya aktif profil yok." });
        if (!Directory.Exists(workDir))
            return Ok(new { success = false, error = $"Dizin bulunamadi: {workDir}" });

        var shell = ResolveShell(request.Shell);
        var result = await RunShellCommand(shell, request.Command, workDir, request.Environment, request.TimeoutSeconds, ct, request.Stdin);

        return Ok(new
        {
            success = result.ExitCode == 0,
            exitCode = result.ExitCode,
            shell = shell.Name,
            command = request.Command,
            workingDirectory = workDir,
            stdout = TrimOutput(result.Stdout, 10000),
            stderr = TrimOutput(result.Stderr, 5000),
            errors = ParseErrors(result.Stdout + "\n" + result.Stderr),
            warnings = ParseWarnings(result.Stdout + "\n" + result.Stderr),
            timedOut = result.TimedOut,
        });
    }

    // Backward compat: eski /api/run endpoint'i
    [HttpPost("run")]
    public async Task<IActionResult> RunCompat([FromBody] ShellExecRequest request, CancellationToken ct)
    {
        return await Execute(request, ct);
    }

    // ═══════════════════════════════════════════════
    // MULTI-STEP EXECUTION
    // ═══════════════════════════════════════════════

    [HttpPost("shell/exec-steps")]
    public async Task<IActionResult> ExecuteSteps([FromBody] ShellStepsRequest request, CancellationToken ct)
    {
        if (request.Steps == null || request.Steps.Count == 0)
            return Ok(new { success = false, error = "En az bir step gerekli." });

        var shell = ResolveShell(request.Shell);
        var defaultDir = ResolveWorkDir(request.WorkingDirectory) ?? Directory.GetCurrentDirectory();
        var results = new List<object>();
        var allSuccess = true;

        foreach (var step in request.Steps)
        {
            var workDir = step.WorkingDirectory ?? defaultDir;
            if (!Directory.Exists(workDir))
            {
                results.Add(new { step = step.Name ?? step.Command, success = false, error = $"Dizin bulunamadi: {workDir}" });
                if (request.StopOnError) { allSuccess = false; break; }
                continue;
            }

            var result = await RunShellCommand(
                step.Shell != null ? ResolveShell(step.Shell) : shell,
                step.Command, workDir,
                MergeEnv(request.Environment, step.Environment),
                step.TimeoutSeconds > 0 ? step.TimeoutSeconds : request.TimeoutSeconds,
                ct);

            var stepSuccess = result.ExitCode == 0;
            if (!stepSuccess) allSuccess = false;

            results.Add(new
            {
                step = step.Name ?? step.Command,
                success = stepSuccess,
                exitCode = result.ExitCode,
                shell = (step.Shell != null ? ResolveShell(step.Shell) : shell).Name,
                workingDirectory = workDir,
                stdout = TrimOutput(result.Stdout, 3000),
                stderr = TrimOutput(result.Stderr, 2000),
                errors = ParseErrors(result.Stdout + "\n" + result.Stderr),
                timedOut = result.TimedOut,
            });

            if (!stepSuccess && request.StopOnError) break;
        }

        return Ok(new { success = allSuccess, stepCount = results.Count, totalSteps = request.Steps.Count, results });
    }

    // ═══════════════════════════════════════════════
    // CREATE AND RUN SCRIPT
    // ═══════════════════════════════════════════════

    [HttpPost("shell/run-script")]
    public async Task<IActionResult> RunScript([FromBody] ShellScriptRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Script))
            return Ok(new { success = false, error = "Script icerigi gerekli." });

        var workDir = ResolveWorkDir(request.WorkingDirectory) ?? Directory.GetCurrentDirectory();
        if (!Directory.Exists(workDir))
            return Ok(new { success = false, error = $"Dizin bulunamadi: {workDir}" });

        var shell = ResolveShell(request.Shell);
        var ext = shell.Name switch { "powershell" or "pwsh" => ".ps1", "bash" or "sh" => ".sh", _ => ".bat" };
        var scriptPath = Path.Combine(
            request.SaveTo ?? workDir,
            request.ScriptFileName ?? $"devkit-{Guid.NewGuid():N}{ext}");

        // Dizin yoksa olustur
        var scriptDir = Path.GetDirectoryName(scriptPath);
        if (!string.IsNullOrEmpty(scriptDir) && !Directory.Exists(scriptDir))
            Directory.CreateDirectory(scriptDir);

        await System.IO.File.WriteAllTextAsync(scriptPath, request.Script, Encoding.UTF8, ct);

        string runCommand;
        if (shell.Name == "powershell" || shell.Name == "pwsh")
            runCommand = $"& '{scriptPath}'";
        else if (shell.Name == "bash" || shell.Name == "sh")
        {
            await RunShellCommand(new ShellInfo("sh", "sh", "-c"), $"chmod +x '{scriptPath}'", workDir, null, 5, ct);
            runCommand = $"'{scriptPath}'";
        }
        else
            runCommand = $"\"{scriptPath}\"";

        try
        {
            var result = await RunShellCommand(shell, runCommand, workDir, request.Environment, request.TimeoutSeconds, ct);

            return Ok(new
            {
                success = result.ExitCode == 0,
                exitCode = result.ExitCode,
                shell = shell.Name,
                scriptPath,
                workingDirectory = workDir,
                stdout = TrimOutput(result.Stdout, 10000),
                stderr = TrimOutput(result.Stderr, 5000),
                errors = ParseErrors(result.Stdout + "\n" + result.Stderr),
                timedOut = result.TimedOut,
                scriptKept = request.KeepScript,
            });
        }
        finally
        {
            if (!request.KeepScript && System.IO.File.Exists(scriptPath))
                try { System.IO.File.Delete(scriptPath); } catch { }
        }
    }

    // ═══════════════════════════════════════════════
    // RUN EXISTING SCRIPT FILE
    // ═══════════════════════════════════════════════

    [HttpPost("shell/run-file")]
    public async Task<IActionResult> RunFile([FromBody] ShellRunFileRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.FilePath))
            return Ok(new { success = false, error = "FilePath gerekli." });
        if (!System.IO.File.Exists(request.FilePath))
            return Ok(new { success = false, error = $"Script dosyasi bulunamadi: {request.FilePath}" });

        var workDir = request.WorkingDirectory ?? Path.GetDirectoryName(request.FilePath) ?? Directory.GetCurrentDirectory();
        var ext = Path.GetExtension(request.FilePath).ToLowerInvariant();

        ShellInfo shell;
        string command;
        var argStr = request.Arguments != null ? " " + string.Join(" ", request.Arguments.Select(a => a.Contains(' ') ? $"\"{a}\"" : a)) : "";

        switch (ext)
        {
            case ".ps1":
                shell = ResolveShell("powershell");
                command = $"& '{request.FilePath}'{argStr}";
                break;
            case ".sh":
                shell = ResolveShell("bash");
                command = $"'{request.FilePath}'{argStr}";
                break;
            case ".bat" or ".cmd":
                shell = ResolveShell("cmd");
                command = $"\"{request.FilePath}\"{argStr}";
                break;
            case ".py":
                shell = ResolveShell("cmd");
                command = $"python \"{request.FilePath}\"{argStr}";
                break;
            case ".js":
                shell = ResolveShell("cmd");
                command = $"node \"{request.FilePath}\"{argStr}";
                break;
            default:
                return Ok(new { success = false, error = $"Desteklenmeyen dosya tipi: {ext}. Desteklenen: .ps1, .sh, .bat, .cmd, .py, .js" });
        }

        var result = await RunShellCommand(shell, command, workDir, request.Environment, request.TimeoutSeconds, ct);

        return Ok(new
        {
            success = result.ExitCode == 0,
            exitCode = result.ExitCode,
            shell = shell.Name,
            filePath = request.FilePath,
            workingDirectory = workDir,
            stdout = TrimOutput(result.Stdout, 10000),
            stderr = TrimOutput(result.Stderr, 5000),
            errors = ParseErrors(result.Stdout + "\n" + result.Stderr),
            timedOut = result.TimedOut,
        });
    }

    // ═══════════════════════════════════════════════
    // CODE SEARCH (grep)
    // ═══════════════════════════════════════════════

    [HttpPost("shell/search")]
    [HttpPost("run/search")] // backward compat
    public IActionResult Search([FromBody] CodeSearchRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Pattern) || string.IsNullOrWhiteSpace(request.Directory))
            return Ok(new { success = false, error = "Pattern ve Directory gerekli." });
        if (!Directory.Exists(request.Directory))
            return Ok(new { success = false, error = $"Dizin bulunamadi: {request.Directory}" });

        var extensions = request.Extensions ?? new[] { ".cs", ".ts", ".tsx", ".js", ".jsx", ".json", ".yaml", ".yml", ".xml", ".csproj", ".py", ".go", ".md", ".html", ".css", ".sql", ".sh", ".ps1" };
        var excludeDirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            { "bin", "obj", "node_modules", ".git", "dist", "wwwroot", ".next", "__pycache__", ".vs", ".idea", "packages", "TestResults" };

        var results = new List<object>();
        var maxResults = request.MaxResults > 0 ? request.MaxResults : 100;

        SearchDirectory(request.Directory, request.Pattern, extensions, excludeDirs, results, maxResults, request.CaseSensitive);

        return Ok(new { success = true, pattern = request.Pattern, resultCount = results.Count, truncated = results.Count >= maxResults, results });
    }

    // ═══════════════════════════════════════════════
    // WHICH / WHERE (komut yolu bulma)
    // ═══════════════════════════════════════════════

    [HttpPost("shell/which")]
    public async Task<IActionResult> Which([FromBody] ShellWhichRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Command))
            return Ok(new { success = false, error = "Command gerekli." });

        var cmd = RuntimeInformation.IsOSPlatform(OSPlatform.Windows)
            ? $"where {request.Command}"
            : $"which {request.Command}";

        var shell = ResolveShell(RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "cmd" : "bash");
        var result = await RunShellCommand(shell, cmd, Directory.GetCurrentDirectory(), null, 5, ct);

        return Ok(new
        {
            success = result.ExitCode == 0,
            command = request.Command,
            found = result.ExitCode == 0,
            path = result.Stdout.Trim().Split('\n').FirstOrDefault()?.Trim(),
        });
    }

    // ═══════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════════

    private static string? ResolveWorkDir(string? requested)
    {
        if (!string.IsNullOrWhiteSpace(requested)) return requested;
        return null; // caller should check active profile
    }

    private static ShellInfo ResolveShell(string? requested)
    {
        var shell = requested?.ToLowerInvariant() ?? "";

        if (shell == "cmd")
            return new ShellInfo("cmd", "cmd.exe", "/c");

        if (shell == "powershell" || shell == "ps")
        {
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                return new ShellInfo("powershell", "powershell.exe", "-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command");
            return new ShellInfo("pwsh", "pwsh", "-NoProfile -NonInteractive -Command");
        }

        if (shell == "pwsh")
            return new ShellInfo("pwsh", "pwsh", "-NoProfile -NonInteractive -Command");

        if (shell == "bash" || shell == "sh")
            return new ShellInfo("bash", RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "bash.exe" : "bash", "-c");

        // Default
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            return new ShellInfo("powershell", "powershell.exe", "-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command");
        return new ShellInfo("bash", "bash", "-c");
    }

    private static async Task<ShellResult> RunShellCommand(ShellInfo shell, string command, string workDir,
        Dictionary<string, string>? env, int timeoutSeconds, CancellationToken ct, string? stdin = null)
    {
        var timeout = timeoutSeconds > 0 ? timeoutSeconds : 120;

        var psi = new ProcessStartInfo
        {
            FileName = shell.Executable,
            WorkingDirectory = workDir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            RedirectStandardInput = stdin != null,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };

        // Shell'e gore argument olustur
        if (shell.Name == "cmd")
        {
            psi.Arguments = $"/c {command}";
        }
        else if (shell.Name == "powershell" || shell.Name == "pwsh")
        {
            if (command.StartsWith("& '"))
                psi.Arguments = $"{shell.ArgumentPrefix} {command}";
            else
                psi.Arguments = $"{shell.ArgumentPrefix} \"{command.Replace("\"", "`\"")}\"";
        }
        else // bash
        {
            psi.Arguments = $"{shell.ArgumentPrefix} \"{command.Replace("\"", "\\\"")}\"";
        }

        if (env != null)
            foreach (var (key, value) in env)
                psi.Environment[key] = value;

        using var process = new Process { StartInfo = psi };
        process.Start();

        // stdin varsa yaz ve kapat
        if (stdin != null)
        {
            await process.StandardInput.WriteAsync(stdin);
            await process.StandardInput.FlushAsync();
            process.StandardInput.Close();
        }

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(timeout * 1000);

        try
        {
            var stdoutTask = process.StandardOutput.ReadToEndAsync(cts.Token);
            var stderrTask = process.StandardError.ReadToEndAsync(cts.Token);
            await process.WaitForExitAsync(cts.Token);

            return new ShellResult { ExitCode = process.ExitCode, Stdout = await stdoutTask, Stderr = await stderrTask };
        }
        catch (OperationCanceledException)
        {
            try { process.Kill(true); } catch { }
            return new ShellResult { ExitCode = -1, Stdout = "", Stderr = $"Timeout ({timeout}sn)", TimedOut = true };
        }
    }

    private static Dictionary<string, string>? MergeEnv(Dictionary<string, string>? global, Dictionary<string, string>? step)
    {
        if (global == null && step == null) return null;
        var merged = new Dictionary<string, string>(global ?? new());
        if (step != null) foreach (var (k, v) in step) merged[k] = v;
        return merged;
    }

    private static string TrimOutput(string output, int maxLength)
    {
        if (string.IsNullOrEmpty(output)) return "";
        return output.Length > maxLength ? output[^maxLength..] : output;
    }

    private static List<string> ParseErrors(string output)
    {
        return output.Split('\n')
            .Where(l => l.Contains(": error ", StringComparison.OrdinalIgnoreCase)
                     || l.Contains(": hata ", StringComparison.OrdinalIgnoreCase)
                     || l.TrimStart().StartsWith("error ", StringComparison.OrdinalIgnoreCase)
                     || l.TrimStart().StartsWith("ERROR:", StringComparison.OrdinalIgnoreCase)
                     || l.Contains("FAILED", StringComparison.OrdinalIgnoreCase)
                     || l.Contains("Exception:", StringComparison.OrdinalIgnoreCase)
                     || l.Contains("npm ERR!", StringComparison.OrdinalIgnoreCase))
            .Select(l => l.Trim()).Where(l => l.Length > 5).Distinct().Take(30).ToList();
    }

    private static List<string> ParseWarnings(string output)
    {
        return output.Split('\n')
            .Where(l => l.Contains(": warning ", StringComparison.OrdinalIgnoreCase)
                     || l.Contains(": uyarı ", StringComparison.OrdinalIgnoreCase)
                     || l.Contains("npm WARN", StringComparison.OrdinalIgnoreCase))
            .Select(l => l.Trim()).Where(l => l.Length > 5).Distinct().Take(20).ToList();
    }

    private static void SearchDirectory(string dir, string pattern, string[] extensions, HashSet<string> excludeDirs,
        List<object> results, int maxResults, bool caseSensitive)
    {
        if (results.Count >= maxResults) return;
        try
        {
            foreach (var file in Directory.GetFiles(dir))
            {
                if (results.Count >= maxResults) return;
                if (!extensions.Any(e => e.Equals(Path.GetExtension(file), StringComparison.OrdinalIgnoreCase))) continue;
                try
                {
                    var lines = System.IO.File.ReadAllLines(file);
                    for (var i = 0; i < lines.Length; i++)
                    {
                        if (results.Count >= maxResults) return;
                        var match = caseSensitive ? lines[i].Contains(pattern) : lines[i].Contains(pattern, StringComparison.OrdinalIgnoreCase);
                        if (match)
                            results.Add(new { file, line = i + 1, content = lines[i].Trim().Length > 200 ? lines[i].Trim()[..200] : lines[i].Trim() });
                    }
                }
                catch { }
            }
            foreach (var subDir in Directory.GetDirectories(dir))
            {
                if (results.Count >= maxResults) return;
                if (excludeDirs.Contains(Path.GetFileName(subDir))) continue;
                SearchDirectory(subDir, pattern, extensions, excludeDirs, results, maxResults, caseSensitive);
            }
        }
        catch { }
    }
}

// ═══ INTERNAL ═══
internal record ShellInfo(string Name, string Executable, string ArgumentPrefix);
internal class ShellResult { public int ExitCode { get; set; } public string Stdout { get; set; } = ""; public string Stderr { get; set; } = ""; public bool TimedOut { get; set; } }

// ═══════════════════════════════════════════════
// BROWSER CONTROLLER (ayni dosyada, ayri controller)
// ═══════════════════════════════════════════════

[ApiController]
[Route("api/browser")]
public class BrowserController : ControllerBase
{
    [HttpPost("open")]
    public IActionResult Open([FromBody] BrowserOpenRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Url))
            return Ok(new { success = false, error = "URL gerekli." });

        try
        {
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                Process.Start(new ProcessStartInfo(request.Url) { UseShellExecute = true });
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
                Process.Start("open", request.Url);
            else
                Process.Start("xdg-open", request.Url);

            return Ok(new { success = true, url = request.Url, message = "Tarayici acildi." });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }
}

public sealed class BrowserOpenRequest
{
    public string Url { get; set; } = string.Empty;
}

// ═══ REQUEST MODELS ═══
public sealed class ShellExecRequest
{
    public string Command { get; set; } = string.Empty;
    public string? WorkingDirectory { get; set; }
    public string? Shell { get; set; }
    public int TimeoutSeconds { get; set; }
    public Dictionary<string, string>? Environment { get; set; }
    public string? Stdin { get; set; }
}

public sealed class ShellStepsRequest
{
    public List<ShellStep> Steps { get; set; } = new();
    public string? Shell { get; set; }
    public string? WorkingDirectory { get; set; }
    public int TimeoutSeconds { get; set; }
    public bool StopOnError { get; set; } = true;
    public Dictionary<string, string>? Environment { get; set; }
}

public sealed class ShellStep
{
    public string Command { get; set; } = string.Empty;
    public string? Name { get; set; }
    public string? WorkingDirectory { get; set; }
    public string? Shell { get; set; }
    public int TimeoutSeconds { get; set; }
    public Dictionary<string, string>? Environment { get; set; }
}

public sealed class ShellScriptRequest
{
    public string Script { get; set; } = string.Empty;
    public string? WorkingDirectory { get; set; }
    public string? Shell { get; set; }
    public string? ScriptFileName { get; set; }
    public string? SaveTo { get; set; }
    public bool KeepScript { get; set; }
    public int TimeoutSeconds { get; set; }
    public Dictionary<string, string>? Environment { get; set; }
}

public sealed class ShellRunFileRequest
{
    public string FilePath { get; set; } = string.Empty;
    public string? WorkingDirectory { get; set; }
    public List<string>? Arguments { get; set; }
    public int TimeoutSeconds { get; set; }
    public Dictionary<string, string>? Environment { get; set; }
}

public sealed class CodeSearchRequest
{
    public string Pattern { get; set; } = string.Empty;
    public string Directory { get; set; } = string.Empty;
    public string[]? Extensions { get; set; }
    public int MaxResults { get; set; }
    public bool CaseSensitive { get; set; }
}

public sealed class ShellWhichRequest
{
    public string Command { get; set; } = string.Empty;
}
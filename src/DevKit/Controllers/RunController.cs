using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace DevKit.Controllers;

[ApiController]
[Route("api/[controller]")]
public class RunController : ControllerBase
{
    // ═══ RUN COMMAND ═══
    [HttpPost]
    public async Task<IActionResult> Run([FromBody] RunRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Command))
            return Ok(new { success = false, error = "Command gerekli." });

        var workDir = request.WorkingDirectory;
        if (string.IsNullOrWhiteSpace(workDir))
            return Ok(new { success = false, error = "WorkingDirectory gerekli." });
        if (!Directory.Exists(workDir))
            return Ok(new { success = false, error = $"Dizin bulunamadi: {workDir}" });

        try
        {
            string shell, args;
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                shell = "cmd.exe";
                args = $"/c {request.Command}";
            }
            else
            {
                shell = "sh";
                args = $"-c \"{request.Command.Replace("\"", "\\\"")}\"";
            }

            var psi = new ProcessStartInfo
            {
                FileName = shell,
                Arguments = args,
                WorkingDirectory = workDir,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };

            if (request.Environment != null)
            {
                foreach (var (key, value) in request.Environment)
                    psi.Environment[key] = value;
            }

            using var process = new Process { StartInfo = psi };
            process.Start();

            var timeoutMs = (request.TimeoutSeconds > 0 ? request.TimeoutSeconds : 60) * 1000;
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(timeoutMs);

            var stdoutTask = process.StandardOutput.ReadToEndAsync(cts.Token);
            var stderrTask = process.StandardError.ReadToEndAsync(cts.Token);

            try
            {
                await process.WaitForExitAsync(cts.Token);
            }
            catch (OperationCanceledException)
            {
                try { process.Kill(true); } catch { }
                return Ok(new { success = false, error = "Timeout: komut belirtilen surede tamamlanamadi.", timedOut = true });
            }

            var stdout = await stdoutTask;
            var stderr = await stderrTask;

            return Ok(new
            {
                success = process.ExitCode == 0,
                exitCode = process.ExitCode,
                command = request.Command,
                workingDirectory = workDir,
                stdout = stdout.Length > 8000 ? stdout[^8000..] : stdout,
                stderr = stderr.Length > 4000 ? stderr[^4000..] : stderr,
            });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ SEARCH (grep) ═══
    [HttpPost("search")]
    public IActionResult Search([FromBody] SearchRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Pattern) || string.IsNullOrWhiteSpace(request.Directory))
            return Ok(new { success = false, error = "Pattern ve Directory gerekli." });
        if (!Directory.Exists(request.Directory))
            return Ok(new { success = false, error = $"Dizin bulunamadi: {request.Directory}" });

        var extensions = request.Extensions ?? new[] { ".cs", ".ts", ".tsx", ".js", ".jsx", ".json", ".yaml", ".yml", ".xml", ".csproj", ".py", ".go", ".md" };
        var excludeDirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            { "bin", "obj", "node_modules", ".git", "dist", "wwwroot", ".next", "__pycache__", ".vs", ".idea", "packages" };

        var results = new List<object>();
        var maxResults = request.MaxResults > 0 ? request.MaxResults : 100;

        SearchDirectory(request.Directory, request.Pattern, extensions, excludeDirs, results, maxResults, request.CaseSensitive);

        return Ok(new { success = true, pattern = request.Pattern, resultCount = results.Count, truncated = results.Count >= maxResults, results });
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
                var ext = Path.GetExtension(file);
                if (!extensions.Any(e => e.Equals(ext, StringComparison.OrdinalIgnoreCase))) continue;

                try
                {
                    var lines = System.IO.File.ReadAllLines(file);
                    for (var i = 0; i < lines.Length; i++)
                    {
                        if (results.Count >= maxResults) return;
                        var contains = caseSensitive
                            ? lines[i].Contains(pattern)
                            : lines[i].Contains(pattern, StringComparison.OrdinalIgnoreCase);

                        if (contains)
                        {
                            results.Add(new
                            {
                                file = file,
                                line = i + 1,
                                content = lines[i].Trim().Length > 200 ? lines[i].Trim()[..200] : lines[i].Trim(),
                            });
                        }
                    }
                }
                catch { /* unreadable file */ }
            }

            foreach (var subDir in Directory.GetDirectories(dir))
            {
                if (results.Count >= maxResults) return;
                var name = Path.GetFileName(subDir);
                if (excludeDirs.Contains(name)) continue;
                SearchDirectory(subDir, pattern, extensions, excludeDirs, results, maxResults, caseSensitive);
            }
        }
        catch { /* permission denied */ }
    }

    // ═══ FILE OPERATIONS ═══
    [HttpPost("file/move")]
    public IActionResult MoveFile([FromBody] FileMoveRequest request)
    {
        try
        {
            if (!System.IO.File.Exists(request.SourcePath) && !Directory.Exists(request.SourcePath))
                return Ok(new { success = false, error = $"Kaynak bulunamadi: {request.SourcePath}" });

            var destDir = Path.GetDirectoryName(request.DestinationPath);
            if (!string.IsNullOrEmpty(destDir) && !Directory.Exists(destDir))
                Directory.CreateDirectory(destDir);

            if (System.IO.File.Exists(request.SourcePath))
                System.IO.File.Move(request.SourcePath, request.DestinationPath, request.Overwrite);
            else
                Directory.Move(request.SourcePath, request.DestinationPath);

            return Ok(new { success = true, message = $"Tasildi: {request.SourcePath} → {request.DestinationPath}" });
        }
        catch (Exception ex) { return Ok(new { success = false, error = ex.Message }); }
    }

    [HttpPost("file/delete")]
    public IActionResult DeleteFile([FromBody] FileDeleteRequest request)
    {
        try
        {
            if (System.IO.File.Exists(request.Path))
            {
                System.IO.File.Delete(request.Path);
                return Ok(new { success = true, message = $"Dosya silindi: {request.Path}" });
            }
            if (Directory.Exists(request.Path))
            {
                Directory.Delete(request.Path, request.Recursive);
                return Ok(new { success = true, message = $"Klasor silindi: {request.Path}" });
            }
            return Ok(new { success = false, error = $"Bulunamadi: {request.Path}" });
        }
        catch (Exception ex) { return Ok(new { success = false, error = ex.Message }); }
    }

    [HttpPost("file/rename")]
    public IActionResult RenameFile([FromBody] FileMoveRequest request)
    {
        return MoveFile(request);
    }
}

// ═══ REQUEST MODELS ═══

public sealed class RunRequest
{
    public string Command { get; set; } = string.Empty;
    public string? WorkingDirectory { get; set; }
    public int TimeoutSeconds { get; set; }
    public Dictionary<string, string>? Environment { get; set; }
}

public sealed class SearchRequest
{
    public string Pattern { get; set; } = string.Empty;
    public string Directory { get; set; } = string.Empty;
    public string[]? Extensions { get; set; }
    public int MaxResults { get; set; }
    public bool CaseSensitive { get; set; }
}

public sealed class FileMoveRequest
{
    public string SourcePath { get; set; } = string.Empty;
    public string DestinationPath { get; set; } = string.Empty;
    public bool Overwrite { get; set; }
}

public sealed class FileDeleteRequest
{
    public string Path { get; set; } = string.Empty;
    public bool Recursive { get; set; }
}
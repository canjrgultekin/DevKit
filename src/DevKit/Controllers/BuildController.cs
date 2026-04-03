using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace DevKit.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BuildController : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Build([FromBody] BuildRequest request, CancellationToken ct)
    {
        var projectPath = request.ProjectPath;
        if (string.IsNullOrWhiteSpace(projectPath))
            return Ok(new { success = false, error = "ProjectPath gerekli." });

        if (!Directory.Exists(projectPath))
            return Ok(new { success = false, error = $"Dizin bulunamadi: {projectPath}" });

        // Framework otomatik tespit
        var framework = request.Framework?.ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(framework))
        {
            if (Directory.GetFiles(projectPath, "*.sln", SearchOption.TopDirectoryOnly).Length > 0
                || Directory.GetFiles(projectPath, "*.csproj", SearchOption.TopDirectoryOnly).Length > 0)
                framework = "dotnet";
            else if (System.IO.File.Exists(Path.Combine(projectPath, "package.json")))
                framework = "node";
            else
                return Ok(new { success = false, error = "Framework tespit edilemedi. 'dotnet' veya 'node' belirtin." });
        }

        string command, arguments;
        if (framework == "dotnet")
        {
            command = "dotnet";
            arguments = request.Command ?? "build --no-restore";
        }
        else
        {
            command = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "cmd.exe" : "sh";
            var npmCmd = request.Command ?? "run build";
            arguments = RuntimeInformation.IsOSPlatform(OSPlatform.Windows)
                ? $"/c npm {npmCmd}"
                : $"-c \"npm {npmCmd}\"";
        }

        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = command,
                Arguments = arguments,
                WorkingDirectory = projectPath,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };

            using var process = new Process { StartInfo = psi };
            process.Start();

            var stdoutTask = process.StandardOutput.ReadToEndAsync(ct);
            var stderrTask = process.StandardError.ReadToEndAsync(ct);

            await process.WaitForExitAsync(ct);

            var stdout = await stdoutTask;
            var stderr = await stderrTask;
            var exitCode = process.ExitCode;
            var buildSuccess = exitCode == 0;

            // Hata satirlarini ayikla
            var errors = new List<string>();
            var warnings = new List<string>();

            var allOutput = stdout + "\n" + stderr;
            foreach (var line in allOutput.Split('\n'))
            {
                var trimmed = line.Trim();
                if (trimmed.Contains(": error ") || trimmed.Contains(": hata "))
                    errors.Add(trimmed);
                else if (trimmed.Contains(": warning ") || trimmed.Contains(": uyarı "))
                    warnings.Add(trimmed);
            }

            return Ok(new
            {
                success = buildSuccess,
                exitCode,
                framework,
                projectPath,
                errorCount = errors.Count,
                warningCount = warnings.Count,
                errors = errors.Take(50),
                warnings = warnings.Take(20),
                stdout = stdout.Length > 5000 ? stdout[^5000..] : stdout,
                stderr = stderr.Length > 3000 ? stderr[^3000..] : stderr,
            });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    [HttpPost("restore")]
    public async Task<IActionResult> Restore([FromBody] BuildRequest request, CancellationToken ct)
    {
        var projectPath = request.ProjectPath;
        if (string.IsNullOrWhiteSpace(projectPath) || !Directory.Exists(projectPath))
            return Ok(new { success = false, error = "Gecerli bir ProjectPath gerekli." });

        var framework = request.Framework?.ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(framework))
        {
            if (Directory.GetFiles(projectPath, "*.sln", SearchOption.TopDirectoryOnly).Length > 0
                || Directory.GetFiles(projectPath, "*.csproj", SearchOption.TopDirectoryOnly).Length > 0)
                framework = "dotnet";
            else if (System.IO.File.Exists(Path.Combine(projectPath, "package.json")))
                framework = "node";
            else
                return Ok(new { success = false, error = "Framework tespit edilemedi." });
        }

        string command, arguments;
        if (framework == "dotnet")
        {
            command = "dotnet";
            arguments = "restore";
        }
        else
        {
            command = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "cmd.exe" : "sh";
            arguments = RuntimeInformation.IsOSPlatform(OSPlatform.Windows)
                ? "/c npm install"
                : "-c \"npm install\"";
        }

        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = command,
                Arguments = arguments,
                WorkingDirectory = projectPath,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };

            using var process = new Process { StartInfo = psi };
            process.Start();
            var stdout = await process.StandardOutput.ReadToEndAsync(ct);
            var stderr = await process.StandardError.ReadToEndAsync(ct);
            await process.WaitForExitAsync(ct);

            return Ok(new
            {
                success = process.ExitCode == 0,
                exitCode = process.ExitCode,
                framework,
                output = stdout.Length > 3000 ? stdout[^3000..] : stdout,
                errors = stderr.Length > 2000 ? stderr[^2000..] : stderr,
            });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }
}

public sealed class BuildRequest
{
    public string ProjectPath { get; set; } = string.Empty;
    public string? Framework { get; set; }
    public string? Command { get; set; }
}
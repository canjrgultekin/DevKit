using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

namespace DevKit.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TestController : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> RunTests([FromBody] TestRequest request, CancellationToken ct)
    {
        var projectPath = request.ProjectPath;
        if (string.IsNullOrWhiteSpace(projectPath) || !Directory.Exists(projectPath))
            return Ok(new { success = false, error = "Gecerli bir ProjectPath gerekli." });

        var framework = request.Framework?.ToLowerInvariant() ?? "dotnet";

        string command, arguments;
        if (framework == "dotnet")
        {
            command = "dotnet";
            arguments = "test --no-build --verbosity normal";
            if (!string.IsNullOrWhiteSpace(request.Filter))
                arguments += $" --filter \"{request.Filter}\"";
            if (!string.IsNullOrWhiteSpace(request.Project))
                arguments += $" {request.Project}";
        }
        else
        {
            command = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "cmd.exe" : "sh";
            var npmCmd = request.Filter ?? "test";
            arguments = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? $"/c npm run {npmCmd}" : $"-c \"npm run {npmCmd}\"";
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

            var passed = 0; var failed = 0; var skipped = 0;
            var failedTests = new List<object>();

            if (framework == "dotnet")
            {
                // Parse dotnet test output
                var passMatch = Regex.Match(stdout, @"Passed:\s*(\d+)");
                var failMatch = Regex.Match(stdout, @"Failed:\s*(\d+)");
                var skipMatch = Regex.Match(stdout, @"Skipped:\s*(\d+)");
                if (passMatch.Success) passed = int.Parse(passMatch.Groups[1].Value);
                if (failMatch.Success) failed = int.Parse(failMatch.Groups[1].Value);
                if (skipMatch.Success) skipped = int.Parse(skipMatch.Groups[1].Value);

                // Extract failed test details
                var failPattern = new Regex(@"Failed\s+(\S+)\s*\[.*?\]\s*(.*?)(?=\s*(?:Failed|Passed|$))", RegexOptions.Singleline);
                foreach (Match m in failPattern.Matches(stdout))
                    failedTests.Add(new { test = m.Groups[1].Value, detail = m.Groups[2].Value.Trim().Length > 500 ? m.Groups[2].Value.Trim()[..500] : m.Groups[2].Value.Trim() });
            }

            return Ok(new
            {
                success = process.ExitCode == 0,
                exitCode = process.ExitCode,
                framework,
                passed,
                failed,
                skipped,
                total = passed + failed + skipped,
                failedTests = failedTests.Take(20),
                stdout = stdout.Length > 5000 ? stdout[^5000..] : stdout,
                stderr = stderr.Length > 2000 ? stderr[^2000..] : stderr,
            });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }
}

public sealed class TestRequest
{
    public string ProjectPath { get; set; } = string.Empty;
    public string? Framework { get; set; }
    public string? Filter { get; set; }
    public string? Project { get; set; }
}
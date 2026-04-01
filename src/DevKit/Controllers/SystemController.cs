using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace DevKit.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SystemController : ControllerBase
{
    [HttpPost("browse-folder")]
    public async Task<IActionResult> BrowseFolder([FromBody] BrowseFolderRequest? request)
    {
        var initialDir = request?.InitialPath ?? Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);

        try
        {
            string? selectedPath;

            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                selectedPath = await OpenWindowsFolderDialogAsync(initialDir);
            }
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
            {
                selectedPath = await OpenMacFolderDialogAsync(initialDir);
            }
            else
            {
                selectedPath = await OpenLinuxFolderDialogAsync(initialDir);
            }

            if (string.IsNullOrWhiteSpace(selectedPath))
                return Ok(new { selected = false, path = "" });

            return Ok(new { selected = true, path = selectedPath.Trim() });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = $"Failed to open folder dialog: {ex.Message}" });
        }
    }

    [HttpPost("browse-file")]
    public async Task<IActionResult> BrowseFile([FromBody] BrowseFileRequest? request)
    {
        var initialDir = request?.InitialPath ?? Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var filter = request?.Filter ?? "All files (*.*)|*.*";

        try
        {
            string? selectedPath;

            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                selectedPath = await OpenWindowsFileDialogAsync(initialDir, filter);
            }
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
            {
                selectedPath = await OpenMacFileDialogAsync(initialDir);
            }
            else
            {
                selectedPath = await OpenLinuxFileDialogAsync(initialDir);
            }

            if (string.IsNullOrWhiteSpace(selectedPath))
                return Ok(new { selected = false, path = "" });

            return Ok(new { selected = true, path = selectedPath.Trim() });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = $"Failed to open file dialog: {ex.Message}" });
        }
    }

    // Bu metodu mevcut SystemController'a EKLE (browse-folder ve browse-file metodlarinin yanina)

    [HttpGet("prompt/{fileName}")]
    public IActionResult GetPromptFile(string fileName)
    {
        // Guvenlik: sadece .md dosyalari, path traversal engelle
        if (string.IsNullOrWhiteSpace(fileName) || !fileName.EndsWith(".md") || fileName.Contains(".."))
            return BadRequest(new { error = "Invalid file name." });

        // DevKit root/prompts/ klasorunu bul
        var baseDir = AppContext.BaseDirectory;
        string[] searchPaths =
        [
            Path.Combine(baseDir, "..", "..", "..", "..", "..", "prompts"),        // Debug: bin/Debug/net9.0 -> root
            Path.Combine(baseDir, "..", "..", "..", "prompts"),                     // Published
            Path.Combine(baseDir, "prompts"),                                       // prompts beside exe
        ];

        foreach (var searchPath in searchPaths)
        {
            var fullPath = Path.GetFullPath(Path.Combine(searchPath, fileName));
            if (System.IO.File.Exists(fullPath))
            {
                var content = System.IO.File.ReadAllText(fullPath);
                return Ok(new { success = true, fileName, content });
            }
        }

        return NotFound(new { error = $"Prompt file '{fileName}' not found." });
    }


    private static async Task<string?> OpenWindowsFolderDialogAsync(string initialDir)
    {
        var script = $@"
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Select folder'
$dialog.ShowNewFolderButton = $true
if (Test-Path '{initialDir.Replace("'", "''")}') {{
    $dialog.SelectedPath = '{initialDir.Replace("'", "''")}'
}}
$topForm = New-Object System.Windows.Forms.Form
$topForm.TopMost = $true
$result = $dialog.ShowDialog($topForm)
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {{
    Write-Output $dialog.SelectedPath
}}
$topForm.Dispose()
";

        return await RunPowerShellAsync(script);
    }

    private static async Task<string?> OpenWindowsFileDialogAsync(string initialDir, string filter)
    {
        var script = $@"
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Filter = '{filter.Replace("'", "''")}'
if (Test-Path '{initialDir.Replace("'", "''")}') {{
    $dialog.InitialDirectory = '{initialDir.Replace("'", "''")}'
}}
$topForm = New-Object System.Windows.Forms.Form
$topForm.TopMost = $true
$result = $dialog.ShowDialog($topForm)
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {{
    Write-Output $dialog.FileName
}}
$topForm.Dispose()
";

        return await RunPowerShellAsync(script);
    }

    private static async Task<string?> RunPowerShellAsync(string script)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "powershell",
            Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{script.Replace("\"", "\\\"")}\"",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = Process.Start(psi);
        if (process == null) return null;

        var output = await process.StandardOutput.ReadToEndAsync();
        await process.WaitForExitAsync();

        return process.ExitCode == 0 ? output.Trim() : null;
    }

    private static async Task<string?> OpenMacFolderDialogAsync(string initialDir)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "osascript",
            Arguments = $"-e 'POSIX path of (choose folder with prompt \"Select folder\" default location POSIX file \"{initialDir}\")'",
            RedirectStandardOutput = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = Process.Start(psi);
        if (process == null) return null;

        var output = await process.StandardOutput.ReadToEndAsync();
        await process.WaitForExitAsync();

        return process.ExitCode == 0 ? output.Trim() : null;
    }

    private static async Task<string?> OpenMacFileDialogAsync(string initialDir)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "osascript",
            Arguments = $"-e 'POSIX path of (choose file with prompt \"Select file\" default location POSIX file \"{initialDir}\")'",
            RedirectStandardOutput = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = Process.Start(psi);
        if (process == null) return null;

        var output = await process.StandardOutput.ReadToEndAsync();
        await process.WaitForExitAsync();

        return process.ExitCode == 0 ? output.Trim() : null;
    }

    private static async Task<string?> OpenLinuxFolderDialogAsync(string initialDir)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "zenity",
            Arguments = $"--file-selection --directory --title=\"Select folder\"",
            RedirectStandardOutput = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = Process.Start(psi);
        if (process == null) return null;

        var output = await process.StandardOutput.ReadToEndAsync();
        await process.WaitForExitAsync();

        return process.ExitCode == 0 ? output.Trim() : null;
    }

    private static async Task<string?> OpenLinuxFileDialogAsync(string initialDir)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "zenity",
            Arguments = $"--file-selection --title=\"Select file\"",
            RedirectStandardOutput = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = Process.Start(psi);
        if (process == null) return null;

        var output = await process.StandardOutput.ReadToEndAsync();
        await process.WaitForExitAsync();

        return process.ExitCode == 0 ? output.Trim() : null;
    }
}

public sealed class BrowseFolderRequest
{
    public string? InitialPath { get; set; }
}

public sealed class BrowseFileRequest
{
    public string? InitialPath { get; set; }
    public string? Filter { get; set; }
}
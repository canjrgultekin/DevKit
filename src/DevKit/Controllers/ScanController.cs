using DevKit.Configuration;
using DevKit.Services.Scanning;
using Microsoft.AspNetCore.Mvc;

namespace DevKit.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ScanController : ControllerBase
{
    private readonly IProjectScanService _scanService;
    private readonly ProfileManager _profileManager;

    public ScanController(IProjectScanService scanService, ProfileManager profileManager)
    {
        _scanService = scanService;
        _profileManager = profileManager;
    }

    [HttpPost]
    public IActionResult ScanProject([FromBody] ScanRequest request)
    {
        var rootPath = request.RootPath;

        // rootPath bossa aktif profilin workspace'ini kullan
        if (string.IsNullOrWhiteSpace(rootPath))
        {
            var profile = _profileManager.GetActiveProfile();
            if (profile == null || string.IsNullOrWhiteSpace(profile.Workspace))
                return BadRequest(new { error = "No root path provided and no active profile workspace configured." });

            rootPath = profile.Workspace;
        }

        try
        {
            var options = new ProjectScanOptions
            {
                MaxDepth = request.MaxDepth,
                IncludeFileContents = request.IncludeFileContents,
                IncludeHidden = request.IncludeHidden,
                MaxFileSizeKb = request.MaxFileSizeKb,
            };

            var result = _scanService.ScanProject(rootPath, options);
            return Ok(new { success = true, scan = result });
        }
        catch (DirectoryNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = $"Scan failed: {ex.Message}" });
        }
    }

    [HttpPost("tree")]
    public IActionResult ScanTree([FromBody] ScanRequest request)
    {
        var rootPath = request.RootPath;

        if (string.IsNullOrWhiteSpace(rootPath))
        {
            var profile = _profileManager.GetActiveProfile();
            if (profile == null || string.IsNullOrWhiteSpace(profile.Workspace))
                return BadRequest(new { error = "No root path provided and no active profile workspace configured." });

            rootPath = profile.Workspace;
        }

        try
        {
            var options = new ProjectScanOptions
            {
                MaxDepth = request.MaxDepth,
                IncludeFileContents = false,
                IncludeHidden = request.IncludeHidden,
            };

            var result = _scanService.ScanProject(rootPath, options);
            return Ok(new
            {
                success = true,
                rootPath = result.RootPath,
                framework = result.Framework,
                tree = result.Tree,
                summary = result.Summary,
            });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("file")]
    public IActionResult ReadFile([FromBody] ReadFileRequest request)
    {
        var rootPath = request.RootPath;

        if (string.IsNullOrWhiteSpace(rootPath))
        {
            var profile = _profileManager.GetActiveProfile();
            rootPath = profile?.Workspace;
        }

        if (string.IsNullOrWhiteSpace(rootPath))
            return BadRequest(new { error = "No root path provided." });

        var fullPath = Path.Combine(rootPath, request.RelativePath.Replace('/', Path.DirectorySeparatorChar));

        if (!System.IO.File.Exists(fullPath))
            return NotFound(new { error = $"File not found: {request.RelativePath}" });

        try
        {
            var content = System.IO.File.ReadAllText(fullPath);
            var fileInfo = new FileInfo(fullPath);

            return Ok(new
            {
                success = true,
                relativePath = request.RelativePath,
                fileName = fileInfo.Name,
                sizeKb = Math.Round(fileInfo.Length / 1024.0, 1),
                content
            });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = $"Failed to read file: {ex.Message}" });
        }
    }
}

public sealed class ScanRequest
{
    public string? RootPath { get; set; }
    public int MaxDepth { get; set; } = 10;
    public bool IncludeFileContents { get; set; } = true;
    public bool IncludeHidden { get; set; } = false;
    public int MaxFileSizeKb { get; set; } = 50;
}

public sealed class ReadFileRequest
{
    public string? RootPath { get; set; }
    public string RelativePath { get; set; } = string.Empty;
}
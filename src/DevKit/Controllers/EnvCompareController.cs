using DevKit.Configuration;
using DevKit.Services.EnvCompare;
using Microsoft.AspNetCore.Mvc;

namespace DevKit.Controllers;

[ApiController]
[Route("api/[controller]")]
public class EnvCompareController : ControllerBase
{
    private readonly IEnvCompareService _envCompareService;
    private readonly ProfileManager _profileManager;

    public EnvCompareController(IEnvCompareService envCompareService, ProfileManager profileManager)
    {
        _envCompareService = envCompareService;
        _profileManager = profileManager;
    }

    [HttpPost("scan")]
    public IActionResult ScanAppSettings([FromBody] EnvScanRequest request)
    {
        var projectPath = request.ProjectPath;
        if (string.IsNullOrWhiteSpace(projectPath))
        {
            var profile = _profileManager.GetActiveProfile();
            projectPath = profile?.Workspace;
        }
        if (string.IsNullOrWhiteSpace(projectPath))
            return BadRequest(new { error = "No project path provided." });

        try
        {
            var files = _envCompareService.ScanAppSettings(projectPath);
            return Ok(new { success = true, files });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    [HttpPost("compare")]
    public IActionResult Compare([FromBody] EnvCompareRequest request)
    {
        if (request.Files == null || request.Files.Count < 2)
            return BadRequest(new { error = "At least 2 files required for comparison." });

        try
        {
            var result = _envCompareService.CompareFiles(request.Files);
            return Ok(new { success = true, compare = result });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    [HttpPost("scan-and-compare")]
    public IActionResult ScanAndCompare([FromBody] EnvScanRequest request)
    {
        var projectPath = request.ProjectPath;
        if (string.IsNullOrWhiteSpace(projectPath))
        {
            var profile = _profileManager.GetActiveProfile();
            projectPath = profile?.Workspace;
        }
        if (string.IsNullOrWhiteSpace(projectPath))
            return BadRequest(new { error = "No project path provided." });

        try
        {
            var files = _envCompareService.ScanAppSettings(projectPath);
            if (files.Count < 2)
                return Ok(new { success = true, compare = new CompareResult { Environments = files.Select(f => f.Name).ToList() }, message = "Only 1 config file found, comparison requires at least 2." });

            var result = _envCompareService.CompareFiles(files);
            return Ok(new { success = true, compare = result, files = files.Select(f => new { f.Name, f.Path }).ToList() });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }
}

public sealed class EnvScanRequest
{
    public string? ProjectPath { get; set; }
}

public sealed class EnvCompareRequest
{
    public List<EnvFile>? Files { get; set; }
}
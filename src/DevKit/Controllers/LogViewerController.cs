using DevKit.Configuration;
using DevKit.Services.LogViewer;
using Microsoft.AspNetCore.Mvc;

namespace DevKit.Controllers;

[ApiController]
[Route("api/[controller]")]
public class LogViewerController : ControllerBase
{
    private readonly ILogViewerService _logService;
    private readonly ProfileManager _profileManager;

    public LogViewerController(ILogViewerService logService, ProfileManager profileManager)
    {
        _logService = logService;
        _profileManager = profileManager;
    }

    [HttpPost("scan")]
    public IActionResult ScanLogFiles([FromBody] LogScanRequest request)
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
            var files = _logService.ScanLogFiles(projectPath);
            return Ok(new { success = true, files, projectPath });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    [HttpPost("read")]
    public async Task<IActionResult> ReadLogs([FromBody] LogReadApiRequest request)
    {
        var basePath = request.ProjectPath;
        if (string.IsNullOrWhiteSpace(basePath))
        {
            var profile = _profileManager.GetActiveProfile();
            basePath = profile?.Workspace;
        }

        var filePath = request.FilePath;
        if (!string.IsNullOrWhiteSpace(basePath) && !Path.IsPathRooted(filePath))
            filePath = Path.Combine(basePath, filePath.Replace('/', Path.DirectorySeparatorChar));

        try
        {
            var logRequest = new LogReadRequest
            {
                FilePath = filePath,
                Tail = request.Tail,
                Level = request.Level,
                Search = request.Search,
                CorrelationId = request.CorrelationId,
            };

            var result = await _logService.ReadLogsAsync(logRequest);
            return Ok(new { success = true, logs = result });
        }
        catch (FileNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }
}

public sealed class LogScanRequest
{
    public string? ProjectPath { get; set; }
}

public sealed class LogReadApiRequest
{
    public string? ProjectPath { get; set; }
    public string FilePath { get; set; } = string.Empty;
    public int Tail { get; set; } = 200;
    public string? Level { get; set; }
    public string? Search { get; set; }
    public string? CorrelationId { get; set; }
}
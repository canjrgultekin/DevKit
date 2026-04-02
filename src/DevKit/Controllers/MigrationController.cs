using DevKit.Configuration;
using DevKit.Services.Migration;
using Microsoft.AspNetCore.Mvc;

namespace DevKit.Controllers;

[ApiController]
[Route("api/[controller]")]
public class MigrationController : ControllerBase
{
    private readonly IMigrationService _migrationService;
    private readonly ProfileManager _profileManager;

    public MigrationController(IMigrationService migrationService, ProfileManager profileManager)
    {
        _migrationService = migrationService;
        _profileManager = profileManager;
    }

    private string ResolveProjectPath(string? path)
    {
        if (!string.IsNullOrWhiteSpace(path)) return path;
        return _profileManager.GetActiveProfile()?.Workspace
            ?? throw new InvalidOperationException("No project path and no active profile.");
    }

    [HttpPost("status")]
    public async Task<IActionResult> GetStatus([FromBody] MigrationStatusRequest request)
    {
        try
        {
            var projectPath = ResolveProjectPath(request.ProjectPath);
            var status = await _migrationService.GetStatusAsync(projectPath, request.ConnectionString, request.MigrationsFolder);
            return Ok(new { success = true, status });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    [HttpPost("apply")]
    public async Task<IActionResult> Apply([FromBody] MigrationRunRequest request)
    {
        try
        {
            var projectPath = ResolveProjectPath(request.ProjectPath);
            var filePath = Path.IsPathRooted(request.FilePath)
                ? request.FilePath
                : Path.Combine(projectPath, request.FilePath.Replace('/', Path.DirectorySeparatorChar));

            var result = await _migrationService.ApplyMigrationAsync(request.ConnectionString, filePath);
            return Ok(new { success = result.Success, result });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    [HttpPost("rollback")]
    public async Task<IActionResult> Rollback([FromBody] MigrationRunRequest request)
    {
        try
        {
            var projectPath = ResolveProjectPath(request.ProjectPath);
            var filePath = Path.IsPathRooted(request.FilePath)
                ? request.FilePath
                : Path.Combine(projectPath, request.FilePath.Replace('/', Path.DirectorySeparatorChar));

            var result = await _migrationService.RollbackMigrationAsync(request.ConnectionString, filePath);
            return Ok(new { success = result.Success, result });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    [HttpPost("generate")]
    public IActionResult Generate([FromBody] MigrationGenerateRequest request)
    {
        try
        {
            var projectPath = ResolveProjectPath(request.ProjectPath);
            var path = _migrationService.GenerateMigrationFile(projectPath, request.Name, request.MigrationsFolder);
            return Ok(new { success = true, path, message = $"Migration files created: {path}" });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }
}

public sealed class MigrationStatusRequest
{
    public string? ProjectPath { get; set; }
    public string ConnectionString { get; set; } = string.Empty;
    public string? MigrationsFolder { get; set; }
}

public sealed class MigrationRunRequest
{
    public string? ProjectPath { get; set; }
    public string ConnectionString { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
}

public sealed class MigrationGenerateRequest
{
    public string? ProjectPath { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? MigrationsFolder { get; set; }
}
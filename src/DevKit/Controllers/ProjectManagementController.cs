using DevKit.Configuration;
using DevKit.Services.ProjectManagement;
using Microsoft.AspNetCore.Mvc;

namespace DevKit.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProjectManagementController : ControllerBase
{
    private readonly IProjectManagementService _service;
    private readonly ProfileManager _profileManager;

    public ProjectManagementController(IProjectManagementService service, ProfileManager profileManager)
    {
        _service = service;
        _profileManager = profileManager;
    }

    private string ResolveWorkspace(string? path) =>
        !string.IsNullOrWhiteSpace(path) ? path : _profileManager.GetActiveProfile()?.Workspace
            ?? throw new InvalidOperationException("No path and no active profile.");

    // ═══ NUGET PAKET ═══

    [HttpPost("package/add")]
    public async Task<IActionResult> AddPackage([FromBody] PackageRequest request)
    {
        try
        {
            var projectPath = ResolveWorkspace(request.ProjectPath);
            var result = await _service.AddPackageAsync(projectPath, request.PackageName, request.Version);
            return Ok(new { success = result.Success, result });
        }
        catch (Exception ex) { return Ok(new { success = false, error = ex.Message }); }
    }

    [HttpPost("package/remove")]
    public async Task<IActionResult> RemovePackage([FromBody] PackageRequest request)
    {
        try
        {
            var projectPath = ResolveWorkspace(request.ProjectPath);
            var result = await _service.RemovePackageAsync(projectPath, request.PackageName);
            return Ok(new { success = result.Success, result });
        }
        catch (Exception ex) { return Ok(new { success = false, error = ex.Message }); }
    }

    [HttpPost("package/add-all")]
    public async Task<IActionResult> AddPackageToAll([FromBody] PackageRequest request)
    {
        try
        {
            var solutionPath = ResolveWorkspace(request.ProjectPath);
            var result = await _service.AddPackageToAllAsync(solutionPath, request.PackageName, request.Version);
            return Ok(new { success = result.Success, result });
        }
        catch (Exception ex) { return Ok(new { success = false, error = ex.Message }); }
    }

    // ═══ PROJECT REFERENCE ═══

    [HttpPost("reference/add")]
    public async Task<IActionResult> AddReference([FromBody] ReferenceRequest request)
    {
        try
        {
            var result = await _service.AddProjectReferenceAsync(request.ProjectPath, request.ReferencePath);
            return Ok(new { success = result.Success, result });
        }
        catch (Exception ex) { return Ok(new { success = false, error = ex.Message }); }
    }

    [HttpPost("reference/remove")]
    public async Task<IActionResult> RemoveReference([FromBody] ReferenceRequest request)
    {
        try
        {
            var result = await _service.RemoveProjectReferenceAsync(request.ProjectPath, request.ReferencePath);
            return Ok(new { success = result.Success, result });
        }
        catch (Exception ex) { return Ok(new { success = false, error = ex.Message }); }
    }

    [HttpPost("reference/list")]
    public IActionResult ListReferences([FromBody] SimplePathRequest request)
    {
        try
        {
            var projectPath = ResolveWorkspace(request.ProjectPath);
            var refs = _service.ListProjectReferences(projectPath);
            return Ok(new { success = true, references = refs });
        }
        catch (Exception ex) { return Ok(new { success = false, error = ex.Message }); }
    }

    // ═══ GIT DIFF / REVERT ═══

    [HttpPost("diff/files")]
    public async Task<IActionResult> GetModifiedFiles([FromBody] SimplePathRequest request)
    {
        try
        {
            var workspace = ResolveWorkspace(request.ProjectPath);
            var files = await _service.GetModifiedFilesAsync(workspace);
            return Ok(new { success = true, files });
        }
        catch (Exception ex) { return Ok(new { success = false, error = ex.Message }); }
    }

    [HttpPost("diff/compare")]
    public async Task<IActionResult> GetFileDiff([FromBody] DiffRequest request)
    {
        try
        {
            var workspace = ResolveWorkspace(request.ProjectPath);
            var diff = await _service.GetFileDiffAsync(workspace, request.FilePath);
            return Ok(new { success = true, diff });
        }
        catch (Exception ex) { return Ok(new { success = false, error = ex.Message }); }
    }

    [HttpPost("diff/revert")]
    public async Task<IActionResult> RevertFile([FromBody] DiffRequest request)
    {
        try
        {
            var workspace = ResolveWorkspace(request.ProjectPath);
            var result = await _service.RevertFileAsync(workspace, request.FilePath);
            return Ok(new { success = result.Success, result });
        }
        catch (Exception ex) { return Ok(new { success = false, error = ex.Message }); }
    }

    [HttpPost("diff/accept")]
    public async Task<IActionResult> AcceptFile([FromBody] DiffRequest request)
    {
        try
        {
            var workspace = ResolveWorkspace(request.ProjectPath);
            var result = await _service.AcceptFileAsync(workspace, request.FilePath);
            return Ok(new { success = result.Success, result });
        }
        catch (Exception ex) { return Ok(new { success = false, error = ex.Message }); }
    }
}

public sealed class PackageRequest
{
    public string? ProjectPath { get; set; }
    public string PackageName { get; set; } = string.Empty;
    public string? Version { get; set; }
}

public sealed class ReferenceRequest
{
    public string ProjectPath { get; set; } = string.Empty;
    public string ReferencePath { get; set; } = string.Empty;
}

public sealed class SimplePathRequest
{
    public string? ProjectPath { get; set; }
}

public sealed class DiffRequest
{
    public string? ProjectPath { get; set; }
    public string FilePath { get; set; } = string.Empty;
}
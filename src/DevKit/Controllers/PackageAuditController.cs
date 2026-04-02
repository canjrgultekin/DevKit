using DevKit.Configuration;
using DevKit.Services.PackageAudit;
using Microsoft.AspNetCore.Mvc;

namespace DevKit.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PackageAuditController : ControllerBase
{
    private readonly IPackageAuditService _auditService;
    private readonly ProfileManager _profileManager;

    public PackageAuditController(IPackageAuditService auditService, ProfileManager profileManager)
    {
        _auditService = auditService;
        _profileManager = profileManager;
    }

    [HttpPost("audit")]
    public async Task<IActionResult> Audit([FromBody] AuditRequest request)
    {
        var projectPath = request.ProjectPath;

        if (string.IsNullOrWhiteSpace(projectPath))
        {
            var profile = _profileManager.GetActiveProfile();
            if (profile == null || string.IsNullOrWhiteSpace(profile.Workspace))
                return BadRequest(new { error = "No project path provided and no active profile workspace configured." });
            projectPath = profile.Workspace;
        }

        var framework = request.Framework;
        if (string.IsNullOrWhiteSpace(framework))
        {
            var profile = _profileManager.GetActiveProfile();
            framework = profile?.Framework ?? "dotnet";
        }

        try
        {
            var result = await _auditService.AuditProjectAsync(projectPath, framework);
            return Ok(new { success = true, audit = result });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }
}

public sealed class AuditRequest
{
    public string? ProjectPath { get; set; }
    public string? Framework { get; set; }
}
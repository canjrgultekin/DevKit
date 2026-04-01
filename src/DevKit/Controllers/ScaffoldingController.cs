using DevKit.Models;
using DevKit.Services.Scaffolding;
using Microsoft.AspNetCore.Mvc;

namespace DevKit.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ScaffoldingController : ControllerBase
{
    private readonly IScaffoldingService _scaffoldingService;

    public ScaffoldingController(IScaffoldingService scaffoldingService)
    {
        _scaffoldingService = scaffoldingService;
    }

    [HttpPost]
    public IActionResult Scaffold([FromBody] ScaffoldRequest request)
    {
        if (request.Manifest == null)
            return BadRequest(new { error = "Manifest is required." });

        if (string.IsNullOrWhiteSpace(request.Manifest.OutputPath))
            return BadRequest(new { error = "OutputPath is required." });

        if (string.IsNullOrWhiteSpace(request.Manifest.Solution))
            return BadRequest(new { error = "Solution name is required." });

        var mode = request.Mode ?? "create";
        if (mode != "create" && mode != "update")
            return BadRequest(new { error = "Mode must be 'create' or 'update'." });

        var response = _scaffoldingService.Scaffold(request.Manifest, mode);
        return response.Success ? Ok(response) : BadRequest(response);
    }

    [HttpGet("frameworks")]
    public IActionResult GetFrameworks()
    {
        return Ok(new { frameworks = _scaffoldingService.GetSupportedFrameworks() });
    }

    [HttpPost("validate")]
    public IActionResult ValidateManifest([FromBody] ProjectManifest manifest)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(manifest.Solution))
            errors.Add("Solution name is required.");

        if (string.IsNullOrWhiteSpace(manifest.Framework))
            errors.Add("Framework is required.");

        if (!_scaffoldingService.GetSupportedFrameworks().Contains(manifest.Framework?.ToLowerInvariant()))
            errors.Add($"Unsupported framework: {manifest.Framework}");

        if (manifest.Projects.Count == 0)
            errors.Add("At least one project is required.");

        foreach (var project in manifest.Projects)
        {
            if (string.IsNullOrWhiteSpace(project.Name))
                errors.Add("Project name is required for all projects.");
            if (string.IsNullOrWhiteSpace(project.Path))
                errors.Add($"Project path is required for project '{project.Name}'.");
        }

        return errors.Count > 0
            ? BadRequest(new { valid = false, errors })
            : Ok(new { valid = true });
    }
}
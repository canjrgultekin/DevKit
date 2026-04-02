using DevKit.Services.Architecture;
using Microsoft.AspNetCore.Mvc;

namespace DevKit.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ArchitectureDesignerController : ControllerBase
{
    private readonly IArchitectureDesignerService _designerService;

    public ArchitectureDesignerController(IArchitectureDesignerService designerService)
    {
        _designerService = designerService;
    }

    [HttpGet("templates")]
    public IActionResult GetTemplates()
    {
        return Ok(new { success = true, categories = ComponentTemplates.Categories });
    }

    [HttpPost("create")]
    public IActionResult CreateDesign([FromBody] CreateDesignRequest request)
    {
        var design = _designerService.CreateDesign(request.Name);
        design.Description = request.Description ?? "";
        design.SolutionName = request.SolutionName ?? design.SolutionName;
        design.OutputPath = request.OutputPath ?? "";
        design.Framework = request.Framework ?? "dotnet";
        design.Architecture = request.Architecture ?? "clean";
        return Ok(new { success = true, design });
    }

    [HttpPost("save")]
    public IActionResult SaveDesign([FromBody] SaveDesignRequest request)
    {
        try
        {
            _designerService.SaveDesign(request.Design, request.FilePath);
            return Ok(new { success = true, message = $"Design saved to {request.FilePath}" });
        }
        catch (Exception ex) { return Ok(new { success = false, error = ex.Message }); }
    }

    [HttpPost("load")]
    public IActionResult LoadDesign([FromBody] LoadDesignRequest request)
    {
        try
        {
            var design = _designerService.LoadDesign(request.FilePath);
            return Ok(new { success = true, design });
        }
        catch (Exception ex) { return Ok(new { success = false, error = ex.Message }); }
    }

    [HttpPost("validate")]
    public IActionResult ValidateDesign([FromBody] DesignPayload request)
    {
        var errors = _designerService.ValidateDesign(request.Design);
        return Ok(new { success = errors.Count == 0, errors });
    }

    [HttpPost("to-manifest")]
    public IActionResult ConvertToManifest([FromBody] DesignPayload request)
    {
        try
        {
            var errors = _designerService.ValidateDesign(request.Design);
            if (errors.Count > 0) return Ok(new { success = false, errors });

            var manifest = _designerService.ConvertToManifestJson(request.Design);
            return Ok(new { success = true, manifest });
        }
        catch (Exception ex) { return Ok(new { success = false, error = ex.Message }); }
    }

    [HttpPost("to-docker")]
    public IActionResult GenerateDocker([FromBody] DesignPayload request)
    {
        try
        {
            var yaml = _designerService.GenerateDockerCompose(request.Design);
            return Ok(new { success = true, dockerCompose = yaml });
        }
        catch (Exception ex) { return Ok(new { success = false, error = ex.Message }); }
    }

    [HttpPost("add-component")]
    public IActionResult AddComponent([FromBody] AddComponentRequest request)
    {
        var component = new ArchComponent
        {
            Name = request.Name,
            Type = request.Type,
            Category = request.Category,
            Config = request.Config ?? new(),
            X = request.X,
            Y = request.Y,
        };
        request.Design.Components.Add(component);
        request.Design.UpdatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
        return Ok(new { success = true, component, design = request.Design });
    }

    [HttpPost("remove-component")]
    public IActionResult RemoveComponent([FromBody] RemoveComponentRequest request)
    {
        request.Design.Components.RemoveAll(c => c.Id == request.ComponentId);
        request.Design.Connections.RemoveAll(c => c.SourceId == request.ComponentId || c.TargetId == request.ComponentId);
        request.Design.UpdatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
        return Ok(new { success = true, design = request.Design });
    }

    [HttpPost("add-connection")]
    public IActionResult AddConnection([FromBody] AddConnectionRequest request)
    {
        var connection = new ArchConnection
        {
            SourceId = request.SourceId,
            TargetId = request.TargetId,
            Label = request.Label ?? "",
            Type = request.ConnectionType ?? "uses",
        };
        request.Design.Connections.Add(connection);
        request.Design.UpdatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
        return Ok(new { success = true, connection, design = request.Design });
    }

    [HttpPost("remove-connection")]
    public IActionResult RemoveConnection([FromBody] RemoveConnectionRequest request)
    {
        request.Design.Connections.RemoveAll(c => c.Id == request.ConnectionId);
        request.Design.UpdatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
        return Ok(new { success = true, design = request.Design });
    }
}

// ═══ REQUEST MODELS ═══

public sealed class CreateDesignRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? SolutionName { get; set; }
    public string? OutputPath { get; set; }
    public string? Framework { get; set; }
    public string? Architecture { get; set; }
}

public sealed class SaveDesignRequest
{
    public ArchitectureDesign Design { get; set; } = new();
    public string FilePath { get; set; } = string.Empty;
}

public sealed class LoadDesignRequest
{
    public string FilePath { get; set; } = string.Empty;
}

public sealed class DesignPayload
{
    public ArchitectureDesign Design { get; set; } = new();
}

public sealed class AddComponentRequest
{
    public ArchitectureDesign Design { get; set; } = new();
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public Dictionary<string, string>? Config { get; set; }
    public double X { get; set; }
    public double Y { get; set; }
}

public sealed class RemoveComponentRequest
{
    public ArchitectureDesign Design { get; set; } = new();
    public string ComponentId { get; set; } = string.Empty;
}

public sealed class AddConnectionRequest
{
    public ArchitectureDesign Design { get; set; } = new();
    public string SourceId { get; set; } = string.Empty;
    public string TargetId { get; set; } = string.Empty;
    public string? Label { get; set; }
    public string? ConnectionType { get; set; }
}

public sealed class RemoveConnectionRequest
{
    public ArchitectureDesign Design { get; set; } = new();
    public string ConnectionId { get; set; } = string.Empty;
}
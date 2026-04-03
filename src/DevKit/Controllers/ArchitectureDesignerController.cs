using DevKit.Services.Architecture;
using Microsoft.AspNetCore.Mvc;

namespace DevKit.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ArchitectureDesignerController : ControllerBase
{
    private readonly IArchitectureDesignerService _designerService;
    private static readonly Dictionary<string, ArchitectureDesign> _designStore = new();

    public ArchitectureDesignerController(IArchitectureDesignerService designerService)
    {
        _designerService = designerService;
    }

    // ═══ STORE ENDPOINTS (MCP designId bazli erisim) ═══

    [HttpGet("store/{designId}")]
    public IActionResult GetStoredDesign(string designId)
    {
        if (_designStore.TryGetValue(designId, out var design))
            return Ok(new { success = true, design });
        return NotFound(new { success = false, error = $"Design '{designId}' not found in store." });
    }

    [HttpPost("store/{designId}")]
    public IActionResult StoreDesign(string designId, [FromBody] ArchitectureDesign design)
    {
        _designStore[designId] = design;
        return Ok(new { success = true, designId });
    }

    [HttpGet("store")]
    public IActionResult ListStoredDesigns()
    {
        var list = _designStore.Select(kv => new
        {
            id = kv.Key,
            name = kv.Value.Name,
            solutionName = kv.Value.SolutionName,
            componentCount = kv.Value.Components.Count,
            connectionCount = kv.Value.Connections.Count,
        });
        return Ok(new { success = true, designs = list });
    }

    // ═══ TEMPLATES ═══

    [HttpGet("templates")]
    public IActionResult GetTemplates()
    {
        return Ok(new { success = true, categories = ComponentTemplates.Categories });
    }

    // ═══ CREATE (store'a otomatik kaydeder) ═══

    [HttpPost("create")]
    public IActionResult CreateDesign([FromBody] CreateDesignRequest request)
    {
        var design = _designerService.CreateDesign(request.Name);
        design.Description = request.Description ?? "";
        design.SolutionName = request.SolutionName ?? design.SolutionName;
        design.OutputPath = request.OutputPath ?? "";
        design.Framework = request.Framework ?? "dotnet";
        design.Architecture = request.Architecture ?? "clean";

        // Store'a otomatik kaydet (MCP designId ile erisebilsin)
        _designStore[design.Id] = design;

        return Ok(new { success = true, design, designId = design.Id });
    }

    // ═══ SAVE / LOAD ═══

    [HttpPost("save")]
    public IActionResult SaveDesign([FromBody] SaveDesignRequest request)
    {
        try
        {
            var design = ResolveDesign(request.Design, request.DesignId);
            _designerService.SaveDesign(design, request.FilePath);
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
            _designStore[design.Id] = design;
            return Ok(new { success = true, design, designId = design.Id });
        }
        catch (Exception ex) { return Ok(new { success = false, error = ex.Message }); }
    }

    // ═══ VALIDATE ═══

    [HttpPost("validate")]
    public IActionResult ValidateDesign([FromBody] DesignPayload request)
    {
        var design = ResolveDesign(request.Design, request.DesignId);
        var errors = _designerService.ValidateDesign(design);
        return Ok(new { success = errors.Count == 0, errors, designId = design.Id });
    }

    // ═══ MANIFEST ═══

    [HttpPost("to-manifest")]
    public IActionResult ConvertToManifest([FromBody] DesignPayload request)
    {
        try
        {
            var design = ResolveDesign(request.Design, request.DesignId);
            var errors = _designerService.ValidateDesign(design);
            if (errors.Count > 0) return Ok(new { success = false, errors });

            var manifest = _designerService.ConvertToManifestJson(design);
            return Ok(new { success = true, manifest, designId = design.Id });
        }
        catch (Exception ex) { return Ok(new { success = false, error = ex.Message }); }
    }

    // ═══ DOCKER ═══

    [HttpPost("to-docker")]
    public IActionResult GenerateDocker([FromBody] DesignPayload request)
    {
        try
        {
            var design = ResolveDesign(request.Design, request.DesignId);
            var yaml = _designerService.GenerateDockerCompose(design);
            return Ok(new { success = true, dockerCompose = yaml, designId = design.Id });
        }
        catch (Exception ex) { return Ok(new { success = false, error = ex.Message }); }
    }

    // ═══ ADD COMPONENT ═══

    [HttpPost("add-component")]
    public IActionResult AddComponent([FromBody] AddComponentRequest request)
    {
        var design = ResolveDesign(request.Design, request.DesignId);

        var component = new ArchComponent
        {
            Name = request.Name,
            Type = request.Type,
            Category = request.Category,
            Config = request.Config ?? new(),
            X = request.X,
            Y = request.Y,
        };
        design.Components.Add(component);
        design.UpdatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");

        _designStore[design.Id] = design;

        return Ok(new { success = true, component, design, designId = design.Id });
    }

    // ═══ REMOVE COMPONENT ═══

    [HttpPost("remove-component")]
    public IActionResult RemoveComponent([FromBody] RemoveComponentRequest request)
    {
        var design = ResolveDesign(request.Design, request.DesignId);

        design.Components.RemoveAll(c => c.Id == request.ComponentId);
        design.Connections.RemoveAll(c => c.SourceId == request.ComponentId || c.TargetId == request.ComponentId);
        design.UpdatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");

        _designStore[design.Id] = design;

        return Ok(new { success = true, design, designId = design.Id });
    }

    // ═══ ADD CONNECTION ═══

    [HttpPost("add-connection")]
    public IActionResult AddConnection([FromBody] AddConnectionRequest request)
    {
        var design = ResolveDesign(request.Design, request.DesignId);

        var connection = new ArchConnection
        {
            SourceId = request.SourceId,
            TargetId = request.TargetId,
            Label = request.Label ?? "",
            Type = request.ConnectionType ?? "uses",
        };
        design.Connections.Add(connection);
        design.UpdatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");

        _designStore[design.Id] = design;

        return Ok(new { success = true, connection, design, designId = design.Id });
    }

    // ═══ REMOVE CONNECTION ═══

    [HttpPost("remove-connection")]
    public IActionResult RemoveConnection([FromBody] RemoveConnectionRequest request)
    {
        var design = ResolveDesign(request.Design, request.DesignId);

        design.Connections.RemoveAll(c => c.Id == request.ConnectionId);
        design.UpdatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");

        _designStore[design.Id] = design;

        return Ok(new { success = true, design, designId = design.Id });
    }

    // ═══ HELPER: Design objesini designId veya direkt objeden cozumle ═══

    private ArchitectureDesign ResolveDesign(ArchitectureDesign? design, string? designId)
    {
        // 1. designId varsa store'dan al
        if (!string.IsNullOrWhiteSpace(designId) && _designStore.TryGetValue(designId, out var stored))
            return stored;

        // 2. Design objesi varsa ve gecerliyse kullan
        if (design != null && !string.IsNullOrWhiteSpace(design.Id) && design.Components.Count > 0)
        {
            _designStore[design.Id] = design;
            return design;
        }

        // 3. Design objesi varsa ama bos olabilir, yine de don
        if (design != null && !string.IsNullOrWhiteSpace(design.Id))
            return design;

        throw new InvalidOperationException("Design bulunamadi. 'designId' veya gecerli bir 'design' objesi gonderin.");
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
    public ArchitectureDesign? Design { get; set; }
    public string? DesignId { get; set; }
    public string FilePath { get; set; } = string.Empty;
}

public sealed class LoadDesignRequest
{
    public string FilePath { get; set; } = string.Empty;
}

public sealed class DesignPayload
{
    public ArchitectureDesign? Design { get; set; }
    public string? DesignId { get; set; }
}

public sealed class AddComponentRequest
{
    public ArchitectureDesign? Design { get; set; }
    public string? DesignId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public Dictionary<string, string>? Config { get; set; }
    public double X { get; set; }
    public double Y { get; set; }
}

public sealed class RemoveComponentRequest
{
    public ArchitectureDesign? Design { get; set; }
    public string? DesignId { get; set; }
    public string ComponentId { get; set; } = string.Empty;
}

public sealed class AddConnectionRequest
{
    public ArchitectureDesign? Design { get; set; }
    public string? DesignId { get; set; }
    public string SourceId { get; set; } = string.Empty;
    public string TargetId { get; set; } = string.Empty;
    public string? Label { get; set; }
    public string? ConnectionType { get; set; }
}

public sealed class RemoveConnectionRequest
{
    public ArchitectureDesign? Design { get; set; }
    public string? DesignId { get; set; }
    public string ConnectionId { get; set; } = string.Empty;
}
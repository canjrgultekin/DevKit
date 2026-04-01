using DevKit.Configuration;
using DevKit.Services.Docker;
using Microsoft.AspNetCore.Mvc;

namespace DevKit.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DockerController : ControllerBase
{
    private readonly IDockerService _dockerService;
    private readonly ProfileManager _profileManager;

    public DockerController(IDockerService dockerService, ProfileManager profileManager)
    {
        _dockerService = dockerService;
        _profileManager = profileManager;
    }

    private string ResolveWorkingDir(string? path)
    {
        if (!string.IsNullOrWhiteSpace(path)) return path;
        return _profileManager.GetActiveProfile()?.Workspace
            ?? throw new InvalidOperationException("No workspace configured.");
    }

    [HttpGet("services")]
    public IActionResult GetServices()
        => Ok(new { services = _dockerService.GetAvailableServices() });

    [HttpPost("generate")]
    public IActionResult GenerateCompose([FromBody] ComposeRequest request)
    {
        try
        {
            var yml = _dockerService.GenerateComposeYml(request);
            var connections = _dockerService.GetConnectionStrings(request.Services);
            return Ok(new { success = true, yml, connectionStrings = connections });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    [HttpPost("save")]
    public async Task<IActionResult> SaveCompose([FromBody] SaveComposeRequest request)
    {
        try
        {
            var outputPath = ResolveWorkingDir(request.OutputPath);
            var filePath = await _dockerService.SaveComposeFileAsync(outputPath, request.Content, request.FileName ?? "docker-compose.yml");

            // OTel collector config varsa onu da kaydet
            if (request.OtelConfig != null)
                await _dockerService.SaveOtelConfigAsync(outputPath, request.OtelConfig);

            return Ok(new { success = true, filePath });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    [HttpPost("inject-appsettings")]
    public async Task<IActionResult> InjectAppSettings([FromBody] InjectAppSettingsRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.AppSettingsPath))
            return BadRequest(new { error = "AppSettings path is required." });

        try
        {
            await _dockerService.InjectToAppSettingsAsync(request.AppSettingsPath, request.ConnectionStrings);
            return Ok(new { success = true, message = "AppSettings updated.", injectedKeys = request.ConnectionStrings.Keys });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ===== DOCKER COMPOSE COMMANDS =====

    [HttpPost("compose/up")]
    public async Task<IActionResult> ComposeUp([FromBody] DockerCmdRequest request)
    {
        var dir = ResolveWorkingDir(request.WorkingDir);
        return Ok(await _dockerService.ComposeUpAsync(dir, request.Detached, request.File));
    }

    [HttpPost("compose/down")]
    public async Task<IActionResult> ComposeDown([FromBody] DockerDownRequest request)
    {
        var dir = ResolveWorkingDir(request.WorkingDir);
        return Ok(await _dockerService.ComposeDownAsync(dir, request.RemoveVolumes, request.File));
    }

    [HttpPost("compose/ps")]
    public async Task<IActionResult> ComposePs([FromBody] DockerCmdRequest request)
    {
        var dir = ResolveWorkingDir(request.WorkingDir);
        return Ok(await _dockerService.ComposePsAsync(dir, request.File));
    }

    [HttpPost("compose/logs")]
    public async Task<IActionResult> ComposeLogs([FromBody] DockerLogsRequest request)
    {
        var dir = ResolveWorkingDir(request.WorkingDir);
        return Ok(await _dockerService.ComposeLogsAsync(dir, request.ServiceName, request.Tail, request.File));
    }

    [HttpPost("compose/build")]
    public async Task<IActionResult> ComposeBuild([FromBody] DockerCmdRequest request)
    {
        var dir = ResolveWorkingDir(request.WorkingDir);
        return Ok(await _dockerService.ComposeBuildAsync(dir, request.File));
    }

    [HttpPost("compose/restart")]
    public async Task<IActionResult> ComposeRestart([FromBody] DockerRestartRequest request)
    {
        var dir = ResolveWorkingDir(request.WorkingDir);
        return Ok(await _dockerService.ComposeRestartAsync(dir, request.ServiceName, request.File));
    }

    [HttpPost("compose/pull")]
    public async Task<IActionResult> ComposePull([FromBody] DockerCmdRequest request)
    {
        var dir = ResolveWorkingDir(request.WorkingDir);
        return Ok(await _dockerService.ComposePullAsync(dir, request.File));
    }

    [HttpPost("compose/command")]
    public async Task<IActionResult> CustomCommand([FromBody] DockerCustomRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Arguments))
            return BadRequest(new { error = "Arguments required." });
        var dir = ResolveWorkingDir(request.WorkingDir);
        return Ok(await _dockerService.RunDockerCommandAsync(dir, request.Arguments));
    }
}

public class DockerCmdRequest
{
    public string? WorkingDir { get; set; }
    public string? File { get; set; }
    public bool Detached { get; set; } = true;
}

public class DockerDownRequest : DockerCmdRequest
{
    public bool RemoveVolumes { get; set; }
}

public class DockerLogsRequest : DockerCmdRequest
{
    public string? ServiceName { get; set; }
    public int Tail { get; set; } = 100;
}

public class DockerRestartRequest : DockerCmdRequest
{
    public string? ServiceName { get; set; }
}

public class DockerCustomRequest
{
    public string? WorkingDir { get; set; }
    public string Arguments { get; set; } = string.Empty;
}

public class SaveComposeRequest
{
    public string? OutputPath { get; set; }
    public string Content { get; set; } = string.Empty;
    public string? FileName { get; set; }
    public OtelConfig? OtelConfig { get; set; }
}

public class InjectAppSettingsRequest
{
    public string AppSettingsPath { get; set; } = string.Empty;
    public Dictionary<string, string> ConnectionStrings { get; set; } = new();
}
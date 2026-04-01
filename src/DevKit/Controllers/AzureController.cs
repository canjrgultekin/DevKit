using DevKit.Configuration;
using DevKit.Services.Azure;
using Microsoft.AspNetCore.Mvc;

namespace DevKit.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AzureController : ControllerBase
{
    private readonly IAzureService _azureService;
    private readonly ProfileManager _profileManager;

    public AzureController(IAzureService azureService, ProfileManager profileManager)
    {
        _azureService = azureService;
        _profileManager = profileManager;
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] AzureLoginRequest? request)
    {
        var profile = ResolveProfile(request?.ProfileKey);
        if (profile?.Azure == null)
            return BadRequest(new { error = "No Azure configuration found in active profile." });

        var result = await _azureService.LoginAsync(profile.Azure);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("verify-login")]
    public async Task<IActionResult> VerifyLogin([FromBody] AzureLoginRequest? request)
    {
        var profile = ResolveProfile(request?.ProfileKey);
        if (profile?.Azure == null)
            return BadRequest(new { error = "No Azure configuration found in active profile." });

        var result = await _azureService.CheckLoginAsync(profile.Azure);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("deploy/{resourceName}")]
    public async Task<IActionResult> Deploy(string resourceName, [FromBody] AzureDeployRequest request)
    {
        var profile = ResolveProfile(request.ProfileKey);
        if (profile?.Azure == null)
            return BadRequest(new { error = "No Azure configuration found." });

        var resource = profile.Azure.Resources.FirstOrDefault(r => r.Name == resourceName);
        if (resource == null)
            return NotFound(new { error = $"Resource '{resourceName}' not found in profile." });

        AzureCommandResult result;

        if (!string.IsNullOrWhiteSpace(request.PublishPath))
        {
            // Manuel zip deploy
            result = await _azureService.DeployZipAsync(profile.Azure, resource, request.PublishPath);
        }
        else
        {
            // Otomatik build + publish + zip + deploy
            if (string.IsNullOrWhiteSpace(profile.Workspace))
                return BadRequest(new { error = "Workspace path not set in profile. Go to Profiles and set it." });

            result = await _azureService.PublishAndDeployAsync(
                profile.Workspace, profile.Framework, profile.Azure, resource);
        }

        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("env/{resourceName}")]
    public async Task<IActionResult> SetEnvironmentVariables(string resourceName, [FromBody] AzureEnvRequest request)
    {
        var profile = ResolveProfile(request.ProfileKey);
        if (profile?.Azure == null)
            return BadRequest(new { error = "No Azure configuration found." });

        var resource = profile.Azure.Resources.FirstOrDefault(r => r.Name == resourceName);
        if (resource == null)
            return NotFound(new { error = $"Resource '{resourceName}' not found in profile." });

        if (request.Variables == null || request.Variables.Count == 0)
            return BadRequest(new { error = "At least one variable is required." });

        var result = await _azureService.SetEnvironmentVariablesAsync(profile.Azure, resource, request.Variables);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet("env/{resourceName}")]
    public async Task<IActionResult> GetEnvironmentVariables(string resourceName, [FromQuery] string? profileKey)
    {
        var profile = ResolveProfile(profileKey);
        if (profile?.Azure == null)
            return BadRequest(new { error = "No Azure configuration found." });

        var resource = profile.Azure.Resources.FirstOrDefault(r => r.Name == resourceName);
        if (resource == null)
            return NotFound(new { error = $"Resource '{resourceName}' not found in profile." });

        var result = await _azureService.GetEnvironmentVariablesAsync(profile.Azure, resource);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("restart/{resourceName}")]
    public async Task<IActionResult> Restart(string resourceName, [FromQuery] string? profileKey)
    {
        var profile = ResolveProfile(profileKey);
        if (profile?.Azure == null)
            return BadRequest(new { error = "No Azure configuration found." });

        var resource = profile.Azure.Resources.FirstOrDefault(r => r.Name == resourceName);
        if (resource == null)
            return NotFound(new { error = $"Resource '{resourceName}' not found in profile." });

        var result = await _azureService.RestartAsync(profile.Azure, resource);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet("logs/{resourceName}")]
    public async Task<IActionResult> GetLogs(string resourceName, [FromQuery] string? profileKey, [FromQuery] int lines = 100)
    {
        var profile = ResolveProfile(profileKey);
        if (profile?.Azure == null)
            return BadRequest(new { error = "No Azure configuration found." });

        var resource = profile.Azure.Resources.FirstOrDefault(r => r.Name == resourceName);
        if (resource == null)
            return NotFound(new { error = $"Resource '{resourceName}' not found in profile." });

        var result = await _azureService.GetLogsAsync(profile.Azure, resource, lines);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("command")]
    public async Task<IActionResult> ExecuteCommand([FromBody] AzureCustomCommandRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Command))
            return BadRequest(new { error = "Command is required." });

        var result = await _azureService.ExecuteCommandAsync(request.Command, request.Arguments ?? string.Empty);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet("resources")]
    public IActionResult GetResources([FromQuery] string? profileKey)
    {
        var profile = ResolveProfile(profileKey);
        if (profile?.Azure == null)
            return Ok(new { resources = Array.Empty<object>() });

        return Ok(new
        {
            resourceGroup = profile.Azure.ResourceGroup,
            subscriptionId = profile.Azure.SubscriptionId,
            resources = profile.Azure.Resources.Select(r => new
            {
                r.Name,
                r.Type,
                r.Slot,
                r.ProjectPath,
                envVarCount = r.EnvironmentVariables.Count
            })
        });
    }

    private DevKitProfile? ResolveProfile(string? profileKey)
    {
        if (!string.IsNullOrEmpty(profileKey))
            return _profileManager.GetProfile(profileKey);

        return _profileManager.GetActiveProfile();
    }
}

public sealed class AzureLoginRequest
{
    public string? ProfileKey { get; set; }
}

public sealed class AzureDeployRequest
{
    public string? ProfileKey { get; set; }
    public string? PublishPath { get; set; }
}

public sealed class AzureEnvRequest
{
    public string? ProfileKey { get; set; }
    public Dictionary<string, string> Variables { get; set; } = new();
}

public sealed class AzureCustomCommandRequest
{
    public string Command { get; set; } = string.Empty;
    public string? Arguments { get; set; }
}
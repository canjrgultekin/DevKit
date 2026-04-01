using DevKit.Configuration;
using Microsoft.AspNetCore.Mvc;

namespace DevKit.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProfileController : ControllerBase
{
    private readonly ProfileManager _profileManager;

    public ProfileController(ProfileManager profileManager)
    {
        _profileManager = profileManager;
    }

    [HttpGet]
    public IActionResult GetAll()
    {
        var config = _profileManager.GetConfig();
        return Ok(new
        {
            activeProfile = config.ActiveProfile,
            profiles = config.Profiles
        });
    }

    [HttpGet("{key}")]
    public IActionResult Get(string key)
    {
        var profile = _profileManager.GetProfile(key);
        if (profile == null)
            return NotFound(new { error = $"Profile '{key}' not found." });

        return Ok(profile);
    }

    [HttpGet("active")]
    public IActionResult GetActive()
    {
        var config = _profileManager.GetConfig();
        var profile = _profileManager.GetActiveProfile();

        if (profile == null)
            return Ok(new { activeProfile = (string?)null, profile = (object?)null });

        return Ok(new { activeProfile = config.ActiveProfile, profile });
    }

    [HttpPost("{key}")]
    public IActionResult Save(string key, [FromBody] DevKitProfile profile)
    {
        _profileManager.SaveProfile(key, profile);
        return Ok(new { success = true, key });
    }

    [HttpPut("active/{key}")]
    public IActionResult SetActive(string key)
    {
        try
        {
            _profileManager.SetActiveProfile(key);
            return Ok(new { success = true, activeProfile = key });
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    [HttpDelete("{key}")]
    public IActionResult Delete(string key)
    {
        _profileManager.DeleteProfile(key);
        return Ok(new { success = true });
    }
}

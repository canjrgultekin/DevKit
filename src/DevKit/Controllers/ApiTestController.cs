using DevKit.Services.ApiTest;
using Microsoft.AspNetCore.Mvc;

namespace DevKit.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ApiTestController : ControllerBase
{
    private readonly IApiTestService _apiTestService;

    public ApiTestController(IApiTestService apiTestService)
    {
        _apiTestService = apiTestService;
    }

    [HttpPost("load-swagger")]
    public async Task<IActionResult> LoadSwagger([FromBody] LoadSwaggerRequest request)
    {
        try
        {
            SwaggerSpec spec;

            if (!string.IsNullOrWhiteSpace(request.Url))
            {
                spec = await _apiTestService.LoadSwaggerAsync(request.Url);
            }
            else if (!string.IsNullOrWhiteSpace(request.JsonContent))
            {
                spec = _apiTestService.ParseSwagger(request.JsonContent);
            }
            else if (!string.IsNullOrWhiteSpace(request.FilePath) && System.IO.File.Exists(request.FilePath))
            {
                var content = await System.IO.File.ReadAllTextAsync(request.FilePath);
                spec = _apiTestService.ParseSwagger(content);
            }
            else
            {
                return BadRequest(new { error = "Provide url, jsonContent, or filePath." });
            }

            return Ok(new { success = true, spec });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    [HttpPost("send")]
    public async Task<IActionResult> SendRequest([FromBody] ApiTestRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Url))
            return BadRequest(new { error = "URL is required." });

        try
        {
            var response = await _apiTestService.SendRequestAsync(request);
            return Ok(new { success = true, response });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }
}

public sealed class LoadSwaggerRequest
{
    public string? Url { get; set; }
    public string? JsonContent { get; set; }
    public string? FilePath { get; set; }
}
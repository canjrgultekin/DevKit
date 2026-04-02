using DevKit.Services.Schema;
using Microsoft.AspNetCore.Mvc;

namespace DevKit.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SchemaController : ControllerBase
{
    private readonly IDatabaseSchemaService _schemaService;

    public SchemaController(IDatabaseSchemaService schemaService)
    {
        _schemaService = schemaService;
    }

    [HttpPost("schemas")]
    public async Task<IActionResult> ListSchemas([FromBody] SchemaConnectionRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.ConnectionString))
            return BadRequest(new { error = "Connection string is required." });

        try
        {
            var schemas = await _schemaService.ListSchemasAsync(request.ConnectionString);
            return Ok(new { success = true, schemas });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    [HttpPost("scan")]
    public async Task<IActionResult> ScanSchema([FromBody] SchemaScanRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.ConnectionString))
            return BadRequest(new { error = "Connection string is required." });

        try
        {
            var result = await _schemaService.ScanSchemaAsync(request.ConnectionString, request.Schema);
            return Ok(new { success = true, scan = result });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    [HttpPost("table")]
    public async Task<IActionResult> GetTableDetail([FromBody] TableDetailRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.ConnectionString) || string.IsNullOrWhiteSpace(request.TableName))
            return BadRequest(new { error = "Connection string and table name are required." });

        try
        {
            var detail = await _schemaService.GetTableDetailAsync(request.ConnectionString, request.TableName, request.Schema);
            return Ok(new { success = true, table = detail });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }
}

public sealed class SchemaConnectionRequest
{
    public string ConnectionString { get; set; } = string.Empty;
}

public sealed class SchemaScanRequest
{
    public string ConnectionString { get; set; } = string.Empty;
    public string? Schema { get; set; }
}

public sealed class TableDetailRequest
{
    public string ConnectionString { get; set; } = string.Empty;
    public string TableName { get; set; } = string.Empty;
    public string? Schema { get; set; }
}
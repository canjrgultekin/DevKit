using DevKit.Services.Crypto;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace DevKit.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CryptoController : ControllerBase
{
    private readonly ICryptoService _cryptoService;

    public CryptoController(ICryptoService cryptoService)
    {
        _cryptoService = cryptoService;
    }

    [HttpPost("read-config")]
    public async Task<IActionResult> ReadConfig([FromBody] ReadConfigRequest request)
    {
        try
        {
            Dictionary<string, string> config;

            if (request.Source == "file")
            {
                if (string.IsNullOrWhiteSpace(request.FilePath))
                    return BadRequest(new { error = "File path is required." });
                config = _cryptoService.ReadConfigFromFile(request.FilePath);
            }
            else if (request.Source == "azure")
            {
                if (string.IsNullOrWhiteSpace(request.ResourceGroup) || string.IsNullOrWhiteSpace(request.AppName))
                    return BadRequest(new { error = "Resource group and app name are required." });
                config = await _cryptoService.ReadConfigFromAzureAsync(request.ResourceGroup, request.AppName, request.SubscriptionId);
            }
            else
            {
                return BadRequest(new { error = "Source must be 'file' or 'azure'." });
            }

            return Ok(new { success = true, config });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    [HttpPost("tables")]
    public async Task<IActionResult> GetTables([FromBody] DbRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.ConnectionString))
            return BadRequest(new { error = "Connection string is required." });

        try
        {
            var tables = await _cryptoService.GetTablesAsync(request.ConnectionString);
            return Ok(new { success = true, tables });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    [HttpPost("columns")]
    public async Task<IActionResult> GetColumns([FromBody] TableRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.ConnectionString) || string.IsNullOrWhiteSpace(request.TableName))
            return BadRequest(new { error = "Connection string and table name are required." });

        try
        {
            var columns = await _cryptoService.GetColumnsAsync(request.ConnectionString, request.TableName);
            return Ok(new { success = true, columns });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    [HttpPost("decrypt")]
    public async Task<IActionResult> DecryptTable([FromBody] DecryptRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.MasterKey))
            return BadRequest(new { error = "MasterKey is required." });
        if (string.IsNullOrWhiteSpace(request.ConnectionString) || string.IsNullOrWhiteSpace(request.TableName))
            return BadRequest(new { error = "Connection string and table name are required." });
        if (string.IsNullOrWhiteSpace(request.CiphertextColumn))
            return BadRequest(new { error = "Ciphertext column is required." });

        try
        {
            // Hangi kolonları çekeceğiz
            var columns = new List<string> { request.PkColumn ?? "id" };
            if (!columns.Contains(request.CiphertextColumn)) columns.Add(request.CiphertextColumn);
            if (!string.IsNullOrWhiteSpace(request.AlgorithmColumn) && !columns.Contains(request.AlgorithmColumn))
                columns.Add(request.AlgorithmColumn);
            if (!string.IsNullOrWhiteSpace(request.KeyIdColumn) && !columns.Contains(request.KeyIdColumn))
                columns.Add(request.KeyIdColumn);

            // Ek gösterim kolonları
            if (request.DisplayColumns != null)
            {
                foreach (var dc in request.DisplayColumns)
                    if (!columns.Contains(dc)) columns.Add(dc);
            }

            var rows = await _cryptoService.QueryTableAsync(request.ConnectionString, request.TableName, columns.ToArray(), request.Limit > 0 ? request.Limit : 100);

            // Decrypt
            var decryptedRows = new List<Dictionary<string, object?>>();
            var errors = new List<string>();

            foreach (var row in rows)
            {
                var newRow = new Dictionary<string, object?>(row);
                var ct = row.GetValueOrDefault(request.CiphertextColumn)?.ToString();

                if (!string.IsNullOrEmpty(ct))
                {
                    try
                    {
                        var algo = !string.IsNullOrWhiteSpace(request.AlgorithmColumn)
                            ? row.GetValueOrDefault(request.AlgorithmColumn)?.ToString() ?? "AES-256-GCM"
                            : "AES-256-GCM";
                        var decrypted = _cryptoService.Decrypt(request.MasterKey, ct, algo);
                        newRow["_decrypted"] = decrypted;
                    }
                    catch (Exception ex)
                    {
                        newRow["_decrypted"] = $"[HATA: {ex.Message}]";
                        errors.Add($"Row {row.GetValueOrDefault(request.PkColumn ?? "id")}: {ex.Message}");
                    }
                }
                else
                {
                    newRow["_decrypted"] = null;
                }

                decryptedRows.Add(newRow);
            }

            return Ok(new { success = true, rows = decryptedRows, totalRows = decryptedRows.Count, errors });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    [HttpPost("encrypt-single")]
    public IActionResult EncryptSingle([FromBody] EncryptSingleRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.MasterKey) || string.IsNullOrWhiteSpace(request.Plaintext))
            return BadRequest(new { error = "MasterKey and plaintext are required." });

        try
        {
            var ciphertext = _cryptoService.Encrypt(request.MasterKey, request.Plaintext, request.Algorithm ?? "AES-256-GCM");
            return Ok(new { success = true, ciphertext });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    [HttpPost("decrypt-single")]
    public IActionResult DecryptSingle([FromBody] DecryptSingleRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.MasterKey) || string.IsNullOrWhiteSpace(request.Ciphertext))
            return BadRequest(new { error = "MasterKey and ciphertext are required." });

        try
        {
            var plaintext = _cryptoService.Decrypt(request.MasterKey, request.Ciphertext, request.Algorithm ?? "AES-256-GCM");
            return Ok(new { success = true, plaintext });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    [HttpPost("rekey")]
    public async Task<IActionResult> ReKey([FromBody] ReKeyRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.OldMasterKey) || string.IsNullOrWhiteSpace(request.NewMasterKey))
            return BadRequest(new { error = "Old and new master keys are required." });

        try
        {
            var result = await _cryptoService.ReKeyAsync(
                request.ConnectionString, request.TableName,
                request.PkColumn ?? "id", request.CiphertextColumn,
                request.AlgorithmColumn ?? "value_algorithm",
                request.KeyIdColumn ?? "value_key_id",
                request.OldMasterKey, request.NewMasterKey,
                request.NewKeyId ?? "local-masterkey-v2");

            return Ok(new { success = result.FailedRows == 0, result });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    [HttpPost("update-config")]
    public async Task<IActionResult> UpdateConfig([FromBody] UpdateConfigRequest request)
    {
        try
        {
            if (request.Source == "file")
            {
                if (string.IsNullOrWhiteSpace(request.FilePath))
                    return BadRequest(new { error = "File path is required." });

                var json = await System.IO.File.ReadAllTextAsync(request.FilePath);
                var doc = System.Text.Json.JsonDocument.Parse(json);
                using var ms = new MemoryStream();
                using var writer = new System.Text.Json.Utf8JsonWriter(ms, new JsonWriterOptions { Indented = true });

                WriteJsonWithUpdates(doc.RootElement, writer, request.Updates);
                writer.Flush();

                var updated = System.Text.Encoding.UTF8.GetString(ms.ToArray());
                await System.IO.File.WriteAllTextAsync(request.FilePath, updated);

                return Ok(new { success = true, message = "Config file updated." });
            }
            else if (request.Source == "azure")
            {
                if (string.IsNullOrWhiteSpace(request.ResourceGroup) || string.IsNullOrWhiteSpace(request.AppName))
                    return BadRequest(new { error = "Resource group and app name are required." });

                var settings = string.Join(" ", request.Updates.Select(kv =>
                    $"\"{kv.Key.Replace(":", "__")}={kv.Value}\""));

                var subArg = !string.IsNullOrEmpty(request.SubscriptionId) ? $" --subscription {request.SubscriptionId}" : "";
                var args = $"webapp config appsettings set --resource-group {request.ResourceGroup} --name {request.AppName}{subArg} --settings {settings}";

                var psi = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = $"/c az {args}",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using var process = System.Diagnostics.Process.Start(psi)!;
                await process.WaitForExitAsync();

                return process.ExitCode == 0
                    ? Ok(new { success = true, message = "Azure config updated." })
                    : Ok(new { success = false, error = await process.StandardError.ReadToEndAsync() });
            }

            return BadRequest(new { error = "Source must be 'file' or 'azure'." });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    private static void WriteJsonWithUpdates(JsonElement element, System.Text.Json.Utf8JsonWriter writer,
        Dictionary<string, string> updates, string prefix = "")
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            writer.WriteStartObject();
            foreach (var prop in element.EnumerateObject())
            {
                var key = string.IsNullOrEmpty(prefix) ? prop.Name : $"{prefix}:{prop.Name}";
                writer.WritePropertyName(prop.Name);

                if (updates.TryGetValue(key, out var newValue) && prop.Value.ValueKind != JsonValueKind.Object)
                {
                    writer.WriteStringValue(newValue);
                }
                else
                {
                    WriteJsonWithUpdates(prop.Value, writer, updates, key);
                }
            }
            writer.WriteEndObject();
        }
        else
        {
            element.WriteTo(writer);
        }
    }
}

// Request models
public class ReadConfigRequest
{
    public string Source { get; set; } = "file"; // file, azure
    public string? FilePath { get; set; }
    public string? ResourceGroup { get; set; }
    public string? AppName { get; set; }
    public string? SubscriptionId { get; set; }
}

public class DbRequest
{
    public string ConnectionString { get; set; } = string.Empty;
}

public class TableRequest : DbRequest
{
    public string TableName { get; set; } = string.Empty;
}

public class DecryptRequest : TableRequest
{
    public string MasterKey { get; set; } = string.Empty;
    public string CiphertextColumn { get; set; } = string.Empty;
    public string? AlgorithmColumn { get; set; }
    public string? KeyIdColumn { get; set; }
    public string? PkColumn { get; set; } = "id";
    public string[]? DisplayColumns { get; set; }
    public int Limit { get; set; } = 100;
}

public class EncryptSingleRequest
{
    public string MasterKey { get; set; } = string.Empty;
    public string Plaintext { get; set; } = string.Empty;
    public string? Algorithm { get; set; } = "AES-256-GCM";
}

public class DecryptSingleRequest
{
    public string MasterKey { get; set; } = string.Empty;
    public string Ciphertext { get; set; } = string.Empty;
    public string? Algorithm { get; set; } = "AES-256-GCM";
}

public class ReKeyRequest : TableRequest
{
    public string OldMasterKey { get; set; } = string.Empty;
    public string NewMasterKey { get; set; } = string.Empty;
    public string CiphertextColumn { get; set; } = string.Empty;
    public string? AlgorithmColumn { get; set; } = "value_algorithm";
    public string? KeyIdColumn { get; set; } = "value_key_id";
    public string? PkColumn { get; set; } = "id";
    public string? NewKeyId { get; set; } = "local-masterkey-v2";
}

public class UpdateConfigRequest
{
    public string Source { get; set; } = "file";
    public string? FilePath { get; set; }
    public string? ResourceGroup { get; set; }
    public string? AppName { get; set; }
    public string? SubscriptionId { get; set; }
    public Dictionary<string, string> Updates { get; set; } = new();
}
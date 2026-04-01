using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Npgsql;

namespace DevKit.Services.Crypto;

public interface ICryptoService
{
    Dictionary<string, string> ReadConfigFromFile(string filePath);
    Task<Dictionary<string, string>> ReadConfigFromAzureAsync(string resourceGroup, string appName, string? subscriptionId = null);
    string Decrypt(string masterKeyRaw, string ciphertextBase64, string algorithm);
    string Encrypt(string masterKeyRaw, string plaintext, string algorithm);
    Task<List<string>> GetTablesAsync(string connectionString);
    Task<List<ColumnInfo>> GetColumnsAsync(string connectionString, string tableName);
    Task<List<Dictionary<string, object?>>> QueryTableAsync(string connectionString, string tableName, string[] columns, int limit = 100);
    Task<int> UpdateCellAsync(string connectionString, string tableName, string pkColumn, string pkValue, string targetColumn, string newValue);
    Task<ReKeyResult> ReKeyAsync(string connectionString, string tableName, string pkColumn, string ciphertextColumn, string algorithmColumn, string keyIdColumn, string oldMasterKey, string newMasterKey, string newKeyId);
}

public sealed class ColumnInfo
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("dataType")]
    public string DataType { get; set; } = string.Empty;

    [JsonPropertyName("isNullable")]
    public bool IsNullable { get; set; }

    [JsonPropertyName("maxLength")]
    public int? MaxLength { get; set; }
}

public sealed class ReKeyResult
{
    [JsonPropertyName("totalRows")]
    public int TotalRows { get; set; }

    [JsonPropertyName("updatedRows")]
    public int UpdatedRows { get; set; }

    [JsonPropertyName("failedRows")]
    public int FailedRows { get; set; }

    [JsonPropertyName("errors")]
    public List<string> Errors { get; set; } = [];
}

public sealed class CryptoService : ICryptoService
{
    // ===== CONFIG READING =====

    public Dictionary<string, string> ReadConfigFromFile(string filePath)
    {
        if (!System.IO.File.Exists(filePath))
            throw new FileNotFoundException($"Config file not found: {filePath}");

        var json = System.IO.File.ReadAllText(filePath);
        var doc = JsonDocument.Parse(json);
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        FlattenJson(doc.RootElement, "", result);
        return result;
    }

    private static void FlattenJson(JsonElement element, string prefix, Dictionary<string, string> result)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                foreach (var prop in element.EnumerateObject())
                {
                    var key = string.IsNullOrEmpty(prefix) ? prop.Name : $"{prefix}:{prop.Name}";
                    FlattenJson(prop.Value, key, result);
                }
                break;
            case JsonValueKind.Array:
                var i = 0;
                foreach (var item in element.EnumerateArray())
                {
                    FlattenJson(item, $"{prefix}:{i}", result);
                    i++;
                }
                break;
            default:
                result[prefix] = element.ToString() ?? "";
                break;
        }
    }

    public async Task<Dictionary<string, string>> ReadConfigFromAzureAsync(string resourceGroup, string appName, string? subscriptionId = null)
    {
        var subArg = !string.IsNullOrEmpty(subscriptionId) ? $" --subscription {subscriptionId}" : "";
        var args = $"webapp config appsettings list --resource-group {resourceGroup} --name {appName}{subArg}";

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
        var output = await process.StandardOutput.ReadToEndAsync();
        await process.WaitForExitAsync();

        if (process.ExitCode != 0)
            throw new InvalidOperationException($"az CLI failed: {await process.StandardError.ReadToEndAsync()}");

        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var items = JsonSerializer.Deserialize<JsonElement>(output);

        if (items.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in items.EnumerateArray())
            {
                var name = item.GetProperty("name").GetString() ?? "";
                var value = item.GetProperty("value").GetString() ?? "";
                // Azure uses __ as separator, normalize to :
                result[name.Replace("__", ":")] = value;
            }
        }

        // Connection strings ayrı endpoint
        var connArgs = $"webapp config connection-string list --resource-group {resourceGroup} --name {appName}{subArg}";
        var connPsi = new System.Diagnostics.ProcessStartInfo
        {
            FileName = "cmd.exe",
            Arguments = $"/c az {connArgs}",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var connProcess = System.Diagnostics.Process.Start(connPsi)!;
        var connOutput = await connProcess.StandardOutput.ReadToEndAsync();
        await connProcess.WaitForExitAsync();

        if (connProcess.ExitCode == 0)
        {
            var connItems = JsonSerializer.Deserialize<JsonElement>(connOutput);
            if (connItems.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in connItems.EnumerateArray())
                {
                    var name = item.GetProperty("name").GetString() ?? "";
                    var value = item.GetProperty("value").GetString() ?? "";
                    result[$"ConnectionStrings:{name}"] = value;
                }
            }
        }

        return result;
    }

    // ===== AES-256-GCM =====

    public string Decrypt(string masterKeyRaw, string ciphertextBase64, string algorithm)
    {
        if (string.IsNullOrWhiteSpace(ciphertextBase64)) return "";

        var derivedKey = DeriveKey(masterKeyRaw);
        var data = Convert.FromBase64String(ciphertextBase64);

        if (data.Length < 28) // 12 nonce + 16 tag minimum
            throw new CryptographicException("Ciphertext too short");

        var nonce = data.AsSpan(0, 12).ToArray();
        var tag = data.AsSpan(12, 16).ToArray();
        var ct = data.AsSpan(28).ToArray();
        var pt = new byte[ct.Length];

        using var aes = new AesGcm(derivedKey, 16);
        aes.Decrypt(nonce, ct, tag, pt);

        return Encoding.UTF8.GetString(pt);
    }

    public string Encrypt(string masterKeyRaw, string plaintext, string algorithm)
    {
        var derivedKey = DeriveKey(masterKeyRaw);
        var nonce = RandomNumberGenerator.GetBytes(12);
        var pt = Encoding.UTF8.GetBytes(plaintext);
        var ct = new byte[pt.Length];
        var tag = new byte[16];

        using var aes = new AesGcm(derivedKey, 16);
        aes.Encrypt(nonce, pt, ct, tag);

        var buf = new byte[12 + 16 + ct.Length];
        Buffer.BlockCopy(nonce, 0, buf, 0, 12);
        Buffer.BlockCopy(tag, 0, buf, 12, 16);
        Buffer.BlockCopy(ct, 0, buf, 28, ct.Length);

        return Convert.ToBase64String(buf);
    }

    private static byte[] DeriveKey(string masterKeyRaw)
    {
        return SHA256.HashData(Encoding.UTF8.GetBytes(masterKeyRaw));
    }

    // ===== POSTGRESQL =====

    public async Task<List<string>> GetTablesAsync(string connectionString)
    {
        var tables = new List<string>();
        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name", conn);
        await using var reader = await cmd.ExecuteReaderAsync();

        while (await reader.ReadAsync())
            tables.Add(reader.GetString(0));

        return tables;
    }

    public async Task<List<ColumnInfo>> GetColumnsAsync(string connectionString, string tableName)
    {
        var columns = new List<ColumnInfo>();
        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(@"
            SELECT column_name, data_type, is_nullable, character_maximum_length
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = @table
            ORDER BY ordinal_position", conn);
        cmd.Parameters.AddWithValue("table", tableName);

        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            columns.Add(new ColumnInfo
            {
                Name = reader.GetString(0),
                DataType = reader.GetString(1),
                IsNullable = reader.GetString(2) == "YES",
                MaxLength = reader.IsDBNull(3) ? null : reader.GetInt32(3)
            });
        }

        return columns;
    }

    public async Task<List<Dictionary<string, object?>>> QueryTableAsync(string connectionString, string tableName, string[] columns, int limit = 100)
    {
        var rows = new List<Dictionary<string, object?>>();
        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync();

        // Sanitize: sadece harf, rakam, underscore kabul et
        var safeCols = columns.Where(c => System.Text.RegularExpressions.Regex.IsMatch(c, @"^[a-zA-Z_][a-zA-Z0-9_]*$")).ToArray();
        var safeTable = System.Text.RegularExpressions.Regex.IsMatch(tableName, @"^[a-zA-Z_][a-zA-Z0-9_]*$") ? tableName : throw new ArgumentException("Invalid table name");

        var sql = $"SELECT {string.Join(", ", safeCols.Select(c => $"\"{c}\""))} FROM \"{safeTable}\" LIMIT {limit}";

        await using var cmd = new NpgsqlCommand(sql, conn);
        await using var reader = await cmd.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            var row = new Dictionary<string, object?>();
            for (var i = 0; i < reader.FieldCount; i++)
            {
                row[reader.GetName(i)] = reader.IsDBNull(i) ? null : reader.GetValue(i);
            }
            rows.Add(row);
        }

        return rows;
    }

    public async Task<int> UpdateCellAsync(string connectionString, string tableName, string pkColumn, string pkValue, string targetColumn, string newValue)
    {
        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync();

        var sql = $"UPDATE \"{tableName}\" SET \"{targetColumn}\" = @val WHERE \"{pkColumn}\" = @pk::uuid";
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("val", newValue);
        cmd.Parameters.AddWithValue("pk", pkValue);

        return await cmd.ExecuteNonQueryAsync();
    }

    public async Task<ReKeyResult> ReKeyAsync(string connectionString, string tableName, string pkColumn,
        string ciphertextColumn, string algorithmColumn, string keyIdColumn,
        string oldMasterKey, string newMasterKey, string newKeyId)
    {
        var result = new ReKeyResult();

        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync();

        // Tüm encrypted satırları oku
        var sql = $"SELECT \"{pkColumn}\", \"{ciphertextColumn}\", \"{algorithmColumn}\" FROM \"{tableName}\" WHERE \"{ciphertextColumn}\" IS NOT NULL";
        var rows = new List<(string pk, string ciphertext, string algo)>();

        await using (var cmd = new NpgsqlCommand(sql, conn))
        await using (var reader = await cmd.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                var pk = reader.GetValue(0)?.ToString() ?? "";
                var ct = reader.IsDBNull(1) ? "" : reader.GetString(1);
                var algo = reader.IsDBNull(2) ? "AES-256-GCM" : reader.GetString(2);
                if (!string.IsNullOrEmpty(ct))
                    rows.Add((pk, ct, algo));
            }
        }

        result.TotalRows = rows.Count;

        // Her satırı decrypt + re-encrypt + update
        foreach (var (pk, ciphertext, algo) in rows)
        {
            try
            {
                var plaintext = Decrypt(oldMasterKey, ciphertext, algo);
                var newCiphertext = Encrypt(newMasterKey, plaintext, algo);

                var updateSql = $"UPDATE \"{tableName}\" SET \"{ciphertextColumn}\" = @ct, \"{keyIdColumn}\" = @kid WHERE \"{pkColumn}\" = @pk::uuid";
                await using var updateCmd = new NpgsqlCommand(updateSql, conn);
                updateCmd.Parameters.AddWithValue("ct", newCiphertext);
                updateCmd.Parameters.AddWithValue("kid", newKeyId);
                updateCmd.Parameters.AddWithValue("pk", pk);
                await updateCmd.ExecuteNonQueryAsync();

                result.UpdatedRows++;
            }
            catch (Exception ex)
            {
                result.FailedRows++;
                result.Errors.Add($"Row {pk}: {ex.Message}");
            }
        }

        return result;
    }
}
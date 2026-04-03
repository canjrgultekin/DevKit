using Microsoft.AspNetCore.Mvc;
using Npgsql;
using System.Data.Common;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace DevKit.Controllers;

[ApiController]
[Route("api/db")]
public class DatabaseQueryController : ControllerBase
{
    private static readonly HttpClient _httpClient = new() { Timeout = TimeSpan.FromSeconds(30) };

    // ═══ QUERY (SELECT - veri doner) ═══
    [HttpPost("query")]
    public async Task<IActionResult> Query([FromBody] DbQueryRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.ConnectionString))
            return Ok(new { success = false, error = "ConnectionString gerekli." });
        if (string.IsNullOrWhiteSpace(request.Sql))
            return Ok(new { success = false, error = "SQL gerekli." });

        var provider = DetectProvider(request);

        // Couchbase ayri akis (REST API)
        if (provider == "couchbase")
            return Ok(await CouchbaseQuery(request, ct));

        try
        {
            await using var conn = CreateConnection(request, provider);
            await conn.OpenAsync(ct);

            await using var cmd = conn.CreateCommand();
            cmd.CommandText = request.Sql;
            cmd.CommandTimeout = request.TimeoutSeconds > 0 ? request.TimeoutSeconds : 30;
            AddParameters(cmd, request.Parameters, provider);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            var rows = new List<Dictionary<string, object?>>();
            var columns = new List<string>();

            for (var i = 0; i < reader.FieldCount; i++)
                columns.Add(reader.GetName(i));

            var maxRows = request.MaxRows > 0 ? request.MaxRows : 1000;
            while (await reader.ReadAsync(ct))
            {
                var row = new Dictionary<string, object?>();
                for (var i = 0; i < reader.FieldCount; i++)
                    row[columns[i]] = reader.IsDBNull(i) ? null : reader.GetValue(i);
                rows.Add(row);
                if (rows.Count >= maxRows) break;
            }

            return Ok(new { success = true, provider, rowCount = rows.Count, columns, rows, truncated = rows.Count >= maxRows });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, provider, error = ex.Message, sql = request.Sql });
        }
    }

    // ═══ EXECUTE (DDL/DML - etkilenen satir sayisi doner) ═══
    [HttpPost("execute")]
    public async Task<IActionResult> Execute([FromBody] DbQueryRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.ConnectionString))
            return Ok(new { success = false, error = "ConnectionString gerekli." });
        if (string.IsNullOrWhiteSpace(request.Sql))
            return Ok(new { success = false, error = "SQL gerekli." });

        var provider = DetectProvider(request);

        if (provider == "couchbase")
            return Ok(await CouchbaseExecute(request, ct));

        try
        {
            await using var conn = CreateConnection(request, provider);
            await conn.OpenAsync(ct);

            await using var cmd = conn.CreateCommand();
            cmd.CommandText = request.Sql;
            cmd.CommandTimeout = request.TimeoutSeconds > 0 ? request.TimeoutSeconds : 30;
            AddParameters(cmd, request.Parameters, provider);

            var affected = await cmd.ExecuteNonQueryAsync(ct);
            return Ok(new { success = true, provider, affectedRows = affected, sql = request.Sql });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, provider, error = ex.Message, sql = request.Sql });
        }
    }

    // ═══ BATCH EXECUTE ═══
    [HttpPost("batch")]
    public async Task<IActionResult> Batch([FromBody] DbBatchRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.ConnectionString))
            return Ok(new { success = false, error = "ConnectionString gerekli." });
        if (request.Statements == null || request.Statements.Count == 0)
            return Ok(new { success = false, error = "En az bir SQL statement gerekli." });

        var provider = DetectProvider(request);
        var results = new List<object>();

        // Couchbase batch
        if (provider == "couchbase")
        {
            foreach (var sql in request.Statements)
            {
                var r = await CouchbaseExecute(new DbQueryRequest { ConnectionString = request.ConnectionString, Sql = sql, Provider = "couchbase" }, ct);
                results.Add(r);
                if (request.StopOnError && !(bool)(r.GetType().GetProperty("success")?.GetValue(r) ?? false))
                    return Ok(new { success = false, results, error = "Couchbase batch hatasi." });
            }
            return Ok(new { success = true, provider, statementCount = request.Statements.Count, results });
        }

        try
        {
            await using var conn = CreateConnection(request, provider);
            await conn.OpenAsync(ct);
            await using var tx = request.UseTransaction ? await conn.BeginTransactionAsync(ct) : null;

            foreach (var sql in request.Statements)
            {
                try
                {
                    await using var cmd = conn.CreateCommand();
                    cmd.CommandText = sql;
                    cmd.CommandTimeout = 30;
                    if (tx != null) cmd.Transaction = tx;

                    var affected = await cmd.ExecuteNonQueryAsync(ct);
                    results.Add(new { success = true, sql, affectedRows = affected });
                }
                catch (Exception ex)
                {
                    results.Add(new { success = false, sql, error = ex.Message });
                    if (request.StopOnError)
                    {
                        if (tx != null) await tx.RollbackAsync(ct);
                        return Ok(new { success = false, provider, results, error = ex.Message, rolledBack = tx != null });
                    }
                }
            }

            if (tx != null) await tx.CommitAsync(ct);
            return Ok(new { success = true, provider, statementCount = request.Statements.Count, results });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, provider, error = ex.Message, results });
        }
    }

    // ═══ LIST TABLES ═══
    [HttpPost("tables")]
    public async Task<IActionResult> ListTables([FromBody] DbQueryConnectionRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.ConnectionString))
            return Ok(new { success = false, error = "ConnectionString gerekli." });

        var provider = DetectProvider(request);
        var schema = request.Schema ?? "public";

        if (provider == "couchbase")
        {
            var bucket = request.Schema ?? "default";
            var cbReq = new DbQueryRequest { ConnectionString = request.ConnectionString, Sql = $"SELECT RAW name FROM system:keyspaces WHERE `bucket` = '{bucket}'", Provider = "couchbase" };
            return Ok(await CouchbaseQuery(cbReq, ct));
        }

        try
        {
            await using var conn = CreateConnection(request, provider);
            await conn.OpenAsync(ct);

            string sql = provider == "mssql"
                ? $"SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '{schema}' ORDER BY TABLE_NAME"
                : $"SELECT schemaname, tablename, 'BASE TABLE' as table_type FROM pg_catalog.pg_tables WHERE schemaname = '{schema}' ORDER BY tablename";

            await using var cmd = conn.CreateCommand();
            cmd.CommandText = sql;
            await using var reader = await cmd.ExecuteReaderAsync(ct);

            var tables = new List<object>();
            while (await reader.ReadAsync(ct))
                tables.Add(new { schema = reader.GetString(0), name = reader.GetString(1), type = reader.GetString(2) });

            return Ok(new { success = true, provider, count = tables.Count, tables, schema });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, provider, error = ex.Message });
        }
    }

    // ═══ DESCRIBE TABLE ═══
    [HttpPost("describe")]
    public async Task<IActionResult> DescribeTable([FromBody] DbDescribeTableRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.ConnectionString) || string.IsNullOrWhiteSpace(request.TableName))
            return Ok(new { success = false, error = "ConnectionString ve TableName gerekli." });

        var provider = DetectProvider(request);
        var schema = request.Schema ?? "public";

        if (provider == "couchbase")
        {
            var cbReq = new DbQueryRequest
            {
                ConnectionString = request.ConnectionString,
                Provider = "couchbase",
                Sql = $"INFER `{request.TableName}` WITH {{\"sample_size\": 1000}}"
            };
            return Ok(await CouchbaseQuery(cbReq, ct));
        }

        try
        {
            await using var conn = CreateConnection(request, provider);
            await conn.OpenAsync(ct);

            string colSql = provider == "mssql"
                ? $@"SELECT c.COLUMN_NAME, c.DATA_TYPE, c.CHARACTER_MAXIMUM_LENGTH, c.IS_NULLABLE, c.COLUMN_DEFAULT,
                    CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 'YES' ELSE 'NO' END as IS_PK
                    FROM INFORMATION_SCHEMA.COLUMNS c
                    LEFT JOIN (SELECT ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                    JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
                    WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY') pk ON c.TABLE_SCHEMA = pk.TABLE_SCHEMA AND c.TABLE_NAME = pk.TABLE_NAME AND c.COLUMN_NAME = pk.COLUMN_NAME
                    WHERE c.TABLE_SCHEMA = '{schema}' AND c.TABLE_NAME = '{request.TableName}' ORDER BY c.ORDINAL_POSITION"
                : $@"SELECT c.column_name, c.data_type, c.character_maximum_length, c.is_nullable, c.column_default,
                    CASE WHEN pk.column_name IS NOT NULL THEN 'YES' ELSE 'NO' END as is_pk
                    FROM information_schema.columns c
                    LEFT JOIN (SELECT kcu.column_name FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                    WHERE tc.table_schema = '{schema}' AND tc.table_name = '{request.TableName}' AND tc.constraint_type = 'PRIMARY KEY') pk ON c.column_name = pk.column_name
                    WHERE c.table_schema = '{schema}' AND c.table_name = '{request.TableName}' ORDER BY c.ordinal_position";

            await using var cmd = conn.CreateCommand();
            cmd.CommandText = colSql;
            await using var reader = await cmd.ExecuteReaderAsync(ct);

            var columns = new List<object>();
            while (await reader.ReadAsync(ct))
            {
                columns.Add(new
                {
                    name = reader.GetString(0),
                    dataType = reader.GetString(1),
                    maxLength = reader.IsDBNull(2) ? (int?)null : Convert.ToInt32(reader.GetValue(2)),
                    nullable = reader.GetString(3),
                    defaultValue = reader.IsDBNull(4) ? null : reader.GetValue(4)?.ToString(),
                    primaryKey = reader.GetString(5) == "YES",
                });
            }

            await reader.CloseAsync();

            string idxSql = provider == "mssql"
                ? $@"SELECT i.name, i.type_desc, i.is_unique, STRING_AGG(c.name, ', ') as columns
                    FROM sys.indexes i JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                    JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                    WHERE i.object_id = OBJECT_ID('{schema}.{request.TableName}') GROUP BY i.name, i.type_desc, i.is_unique"
                : $@"SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = '{schema}' AND tablename = '{request.TableName}'";

            cmd.CommandText = idxSql;
            await using var idxReader = await cmd.ExecuteReaderAsync(ct);
            var indexes = new List<object>();
            while (await idxReader.ReadAsync(ct))
            {
                if (provider == "mssql")
                    indexes.Add(new { name = idxReader.GetString(0), type = idxReader.GetString(1), unique = idxReader.GetBoolean(2), columns = idxReader.GetString(3) });
                else
                    indexes.Add(new { name = idxReader.GetString(0), definition = idxReader.GetString(1) });
            }

            return Ok(new { success = true, provider, table = request.TableName, schema, columnCount = columns.Count, columns, indexes });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, provider, error = ex.Message });
        }
    }

    // ═══ COUCHBASE N1QL via REST API ═══

    private static async Task<object> CouchbaseQuery(DbQueryRequest request, CancellationToken ct)
    {
        try
        {
            var (url, username, password) = ParseCouchbaseConnection(request.ConnectionString!);
            var queryUrl = $"{url}:8093/query/service";

            var httpReq = new HttpRequestMessage(HttpMethod.Post, queryUrl);
            httpReq.Headers.Authorization = new AuthenticationHeaderValue("Basic",
                Convert.ToBase64String(Encoding.UTF8.GetBytes($"{username}:{password}")));
            httpReq.Content = new StringContent(
                JsonSerializer.Serialize(new { statement = request.Sql }),
                Encoding.UTF8, "application/json");

            var httpRes = await _httpClient.SendAsync(httpReq, ct);
            var body = await httpRes.Content.ReadAsStringAsync(ct);
            var json = JsonSerializer.Deserialize<JsonElement>(body);

            var status = json.TryGetProperty("status", out var s) ? s.GetString() : "unknown";
            var success = status == "success";

            if (json.TryGetProperty("results", out var results))
            {
                var rows = new List<Dictionary<string, object?>>();
                foreach (var row in results.EnumerateArray())
                {
                    var dict = new Dictionary<string, object?>();
                    foreach (var prop in row.EnumerateObject())
                        dict[prop.Name] = prop.Value.ValueKind == JsonValueKind.Null ? null : prop.Value.ToString();
                    rows.Add(dict);
                }
                return new { success, provider = "couchbase", status, rowCount = rows.Count, rows };
            }

            if (json.TryGetProperty("errors", out var errors))
            {
                var errList = new List<string>();
                foreach (var err in errors.EnumerateArray())
                    errList.Add(err.TryGetProperty("msg", out var msg) ? msg.GetString() ?? "" : err.ToString());
                return new { success = false, provider = "couchbase", errors = errList, sql = request.Sql };
            }

            return new { success, provider = "couchbase", status, raw = body.Length > 3000 ? body[..3000] : body };
        }
        catch (Exception ex)
        {
            return new { success = false, provider = "couchbase", error = ex.Message, sql = request.Sql };
        }
    }

    private static async Task<object> CouchbaseExecute(DbQueryRequest request, CancellationToken ct)
    {
        return await CouchbaseQuery(request, ct);
    }

    private static (string url, string username, string password) ParseCouchbaseConnection(string connectionString)
    {
        // Format: couchbase://host:port;username=admin;password=pass
        // veya: host=localhost;port=8091;username=admin;password=pass;bucket=default
        var parts = connectionString.Split(';').Select(p => p.Trim()).ToArray();
        var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        foreach (var part in parts)
        {
            var eq = part.IndexOf('=');
            if (eq > 0)
                dict[part[..eq].Trim()] = part[(eq + 1)..].Trim();
        }

        var host = dict.GetValueOrDefault("host", "localhost");
        var port = dict.GetValueOrDefault("port", "8091");
        var username = dict.GetValueOrDefault("username", "Administrator");
        var password = dict.GetValueOrDefault("password", "password");
        var url = $"http://{host}:{port}";

        // couchbase://host format desteği
        if (connectionString.StartsWith("couchbase://"))
        {
            var uri = connectionString.Split(';')[0].Replace("couchbase://", "http://");
            if (!uri.Contains(':')) uri += ":8091";
            url = uri;
        }

        return (url, username, password);
    }

    // ═══ CONNECTION HELPERS ═══

    private static DbConnection CreateConnection(DbQueryConnectionRequest request, string provider)
    {
        return provider switch
        {
            "mssql" => CreateMssqlConnection(request.ConnectionString!),
            _ => new NpgsqlConnection(request.ConnectionString),
        };
    }

    private static DbConnection CreateMssqlConnection(string connectionString)
    {
        // Microsoft.Data.SqlClient kullan
        var type = Type.GetType("Microsoft.Data.SqlClient.SqlConnection, Microsoft.Data.SqlClient");
        if (type != null)
            return (DbConnection)Activator.CreateInstance(type, connectionString)!;

        // System.Data.SqlClient fallback
        type = Type.GetType("System.Data.SqlClient.SqlConnection, System.Data.SqlClient");
        if (type != null)
            return (DbConnection)Activator.CreateInstance(type, connectionString)!;

        throw new InvalidOperationException(
            "MSSQL destegi icin 'Microsoft.Data.SqlClient' NuGet paketi gerekli. " +
            "Calistirin: dotnet add package Microsoft.Data.SqlClient");
    }

    private static string DetectProvider(DbQueryConnectionRequest request)
    {
        var provider = request.Provider?.ToLowerInvariant() ?? "";
        if (!string.IsNullOrEmpty(provider)) return provider;

        var cs = request.ConnectionString?.ToLowerInvariant() ?? "";
        if (cs.StartsWith("couchbase://") || cs.Contains("bucket="))
            return "couchbase";
        if (cs.Contains("server=") && cs.Contains("user id=") && !cs.Contains("host="))
            return "mssql";
        if (cs.Contains("data source=") || cs.Contains("initial catalog="))
            return "mssql";
        return "postgresql";
    }

    private static void AddParameters(DbCommand cmd, Dictionary<string, object?>? parameters, string provider)
    {
        if (parameters == null) return;
        foreach (var (key, value) in parameters)
        {
            var param = cmd.CreateParameter();
            param.ParameterName = key.StartsWith("@") ? key : $"@{key}";
            param.Value = value ?? DBNull.Value;
            cmd.Parameters.Add(param);
        }
    }
}

// ═══ REQUEST MODELS ═══

public class DbQueryConnectionRequest
{
    public string ConnectionString { get; set; } = string.Empty;
    public string? Provider { get; set; }
    public string? Schema { get; set; }
}

public sealed class DbQueryRequest : DbQueryConnectionRequest
{
    public string Sql { get; set; } = string.Empty;
    public Dictionary<string, object?>? Parameters { get; set; }
    public int MaxRows { get; set; }
    public int TimeoutSeconds { get; set; }
}

public sealed class DbBatchRequest : DbQueryConnectionRequest
{
    public List<string> Statements { get; set; } = new();
    public bool UseTransaction { get; set; } = true;
    public bool StopOnError { get; set; } = true;
}

public sealed class DbDescribeTableRequest : DbQueryConnectionRequest
{
    public string TableName { get; set; } = string.Empty;
}
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Formatters;
using StackExchange.Redis;
using System.Text.Json;

namespace DevKit.Controllers;

[ApiController]
[Route("api/redis")]
public class RedisController : ControllerBase
{
    // ═══ EXECUTE (generic komut) ═══
    [HttpPost("execute")]
    public async Task<IActionResult> Execute([FromBody] RedisRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.ConnectionString))
            return Ok(new { success = false, error = "ConnectionString gerekli. (orn: localhost:6379)" });
        if (string.IsNullOrWhiteSpace(request.Command))
            return Ok(new { success = false, error = "Command gerekli." });

        try
        {
            await using var mux = await ConnectionMultiplexer.ConnectAsync(BuildConfig(request));
            var db = mux.GetDatabase(request.Database);

            var parts = ParseCommand(request.Command);
            var cmd = parts[0].ToUpperInvariant();
            var args = parts.Skip(1).Select(a => (RedisValue)a).ToArray();

            var result = await db.ExecuteAsync(cmd, args.Cast<object>().ToArray());
            var parsed = ParseResult(result);

            return Ok(new { success = true, command = request.Command, result = parsed });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message, command = request.Command });
        }
    }

    // ═══ GET ═══
    [HttpPost("get")]
    public async Task<IActionResult> Get([FromBody] RedisKeyRequest request)
    {
        try
        {
            await using var mux = await ConnectionMultiplexer.ConnectAsync(BuildConfig(request));
            var db = mux.GetDatabase(request.Database);

            var type = await db.KeyTypeAsync(request.Key);
            object? value;

            switch (type)
            {
                case RedisType.String:
                    value = (string?)await db.StringGetAsync(request.Key);
                    break;
                case RedisType.Hash:
                    var hash = await db.HashGetAllAsync(request.Key);
                    value = hash.ToDictionary(h => h.Name.ToString(), h => h.Value.ToString());
                    break;
                case RedisType.List:
                    var list = await db.ListRangeAsync(request.Key, 0, 99);
                    value = list.Select(v => v.ToString()).ToArray();
                    break;
                case RedisType.Set:
                    var set = await db.SetMembersAsync(request.Key);
                    value = set.Select(v => v.ToString()).ToArray();
                    break;
                case RedisType.SortedSet:
                    var zset = await db.SortedSetRangeByRankWithScoresAsync(request.Key, 0, 99);
                    value = zset.Select(z => new { member = z.Element.ToString(), score = z.Score }).ToArray();
                    break;
                default:
                    value = null;
                    break;
            }

            var ttl = await db.KeyTimeToLiveAsync(request.Key);

            return Ok(new { success = true, key = request.Key, type = type.ToString(), value, ttl = ttl?.TotalSeconds });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ SET ═══
    [HttpPost("set")]
    public async Task<IActionResult> Set([FromBody] RedisSetRequest request)
    {
        try
        {
            await using var mux = await ConnectionMultiplexer.ConnectAsync(BuildConfig(request));
            var db = mux.GetDatabase(request.Database);

            TimeSpan? expiry = request.ExpireSeconds > 0 ? TimeSpan.FromSeconds(request.ExpireSeconds) : null;
            if (expiry.HasValue)
                await db.StringSetAsync(request.Key, request.Value, expiry.Value);
            else
                await db.StringSetAsync(request.Key, request.Value);
            return Ok(new { success = true, key = request.Key, expireSeconds = request.ExpireSeconds });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ DELETE ═══
    [HttpPost("delete")]
    public async Task<IActionResult> Delete([FromBody] RedisKeyRequest request)
    {
        try
        {
            await using var mux = await ConnectionMultiplexer.ConnectAsync(BuildConfig(request));
            var db = mux.GetDatabase(request.Database);
            var deleted = await db.KeyDeleteAsync(request.Key);

            return Ok(new { success = true, key = request.Key, deleted });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ KEYS (pattern scan) ═══
    [HttpPost("keys")]
    public async Task<IActionResult> Keys([FromBody] RedisKeysRequest request)
    {
        try
        {
            await using var mux = await ConnectionMultiplexer.ConnectAsync(BuildConfig(request));
            var server = mux.GetServers().First();
            var db = mux.GetDatabase(request.Database);
            var pattern = request.Pattern ?? "*";
            var maxCount = request.MaxCount > 0 ? request.MaxCount : 100;

            var keys = new List<object>();
            await foreach (var key in server.KeysAsync(request.Database, pattern, maxCount))
            {
                if (request.WithValues)
                {
                    var type = await db.KeyTypeAsync(key);
                    var ttl = await db.KeyTimeToLiveAsync(key);
                    string val = "";
                    if (type == RedisType.String)
                    {
                        var raw = await db.StringGetAsync(key);
                        val = raw.ToString() ?? "";
                        if (val != null && val.Length > 200) val = val[..200] + "...";
                    }
                    keys.Add(new { key = key.ToString(), type = type.ToString(), value = val, ttl = ttl?.TotalSeconds });
                }
                else
                {
                    keys.Add(key.ToString());
                }
                if (keys.Count >= maxCount) break;
            }

            return Ok(new { success = true, pattern, count = keys.Count, keys });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ HASH OPERATIONS ═══
    [HttpPost("hash")]
    public async Task<IActionResult> Hash([FromBody] RedisHashRequest request)
    {
        try
        {
            await using var mux = await ConnectionMultiplexer.ConnectAsync(BuildConfig(request));
            var db = mux.GetDatabase(request.Database);

            switch (request.Action?.ToLowerInvariant())
            {
                case "getall":
                    var all = await db.HashGetAllAsync(request.Key);
                    return Ok(new { success = true, key = request.Key, fields = all.ToDictionary(h => h.Name.ToString(), h => h.Value.ToString()) });
                case "get":
                    var val = await db.HashGetAsync(request.Key, request.Field ?? "");
                    return Ok(new { success = true, key = request.Key, field = request.Field, value = val.ToString() });
                case "set":
                    await db.HashSetAsync(request.Key, request.Field ?? "", request.Value ?? "");
                    return Ok(new { success = true, key = request.Key, field = request.Field });
                case "delete":
                    var del = await db.HashDeleteAsync(request.Key, request.Field ?? "");
                    return Ok(new { success = true, key = request.Key, field = request.Field, deleted = del });
                default:
                    return Ok(new { success = false, error = "Action gerekli: getall, get, set, delete" });
            }
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ INFO / DBSIZE / FLUSHDB ═══
    [HttpPost("admin")]
    public async Task<IActionResult> Admin([FromBody] RedisAdminRequest request)
    {
        try
        {
            await using var mux = await ConnectionMultiplexer.ConnectAsync(BuildConfig(request));
            var db = mux.GetDatabase(request.Database);
            var server = mux.GetServers().First();

            switch (request.Action?.ToLowerInvariant())
            {
                case "info":
                    var info = await server.InfoAsync();
                    var summary = info.SelectMany(g => g.Select(p => $"{g.Key}.{p.Key}={p.Value}")).Take(50);
                    return Ok(new { success = true, info = summary });
                case "dbsize":
                    var size = await server.DatabaseSizeAsync(request.Database);
                    return Ok(new { success = true, dbSize = size, database = request.Database });
                case "flushdb":
                    await server.FlushDatabaseAsync(request.Database);
                    return Ok(new { success = true, message = $"Database {request.Database} temizlendi." });
                case "ping":
                    var ping = await db.PingAsync();
                    return Ok(new { success = true, pingMs = ping.TotalMilliseconds });
                default:
                    return Ok(new { success = false, error = "Action gerekli: info, dbsize, flushdb, ping" });
            }
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ HELPERS ═══

    private static ConfigurationOptions BuildConfig(RedisConnectionBase request)
    {
        var config = ConfigurationOptions.Parse(request.ConnectionString ?? "localhost:6379");
        config.AbortOnConnectFail = false;
        config.ConnectTimeout = 5000;
        config.SyncTimeout = 5000;
        config.AllowAdmin = true;
        return config;
    }

    private static string[] ParseCommand(string command)
    {
        var parts = new List<string>();
        var current = new System.Text.StringBuilder();
        var inQuote = false;
        var quoteChar = ' ';

        foreach (var c in command)
        {
            if (inQuote)
            {
                if (c == quoteChar) { inQuote = false; }
                else current.Append(c);
            }
            else if (c == '"' || c == '\'')
            {
                inQuote = true; quoteChar = c;
            }
            else if (c == ' ')
            {
                if (current.Length > 0) { parts.Add(current.ToString()); current.Clear(); }
            }
            else { current.Append(c); }
        }
        if (current.Length > 0) parts.Add(current.ToString());
        return parts.ToArray();
    }

    private static object? ParseResult(RedisResult result)
    {
        if (result.IsNull) return null;
        if (result.Resp3Type == ResultType.Array)
        {
            var arr = (RedisResult[]?)result;
            if (arr == null) return Array.Empty<object>();
            return arr.Select(ParseResult).ToArray();
        }
        return result.ToString();
    }
}

// ═══ REQUEST MODELS ═══

public class RedisConnectionBase
{
    public string ConnectionString { get; set; } = "localhost:6379";
    public int Database { get; set; }
}

public sealed class RedisRequest : RedisConnectionBase
{
    public string Command { get; set; } = string.Empty;
}

public sealed class RedisKeyRequest : RedisConnectionBase
{
    public string Key { get; set; } = string.Empty;
}

public sealed class RedisSetRequest : RedisConnectionBase
{
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public int ExpireSeconds { get; set; }
}

public sealed class RedisKeysRequest : RedisConnectionBase
{
    public string? Pattern { get; set; }
    public int MaxCount { get; set; }
    public bool WithValues { get; set; }
}

public sealed class RedisHashRequest : RedisConnectionBase
{
    public string Key { get; set; } = string.Empty;
    public string? Action { get; set; }
    public string? Field { get; set; }
    public string? Value { get; set; }
}

public sealed class RedisAdminRequest : RedisConnectionBase
{
    public string? Action { get; set; }
}
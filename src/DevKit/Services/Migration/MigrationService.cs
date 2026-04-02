using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Npgsql;

namespace DevKit.Services.Migration;

public interface IMigrationService
{
    List<MigrationFile> ScanMigrations(string projectPath, string? migrationsFolder = null);
    Task<List<AppliedMigration>> GetAppliedMigrationsAsync(string connectionString);
    Task<MigrationStatus> GetStatusAsync(string projectPath, string connectionString, string? migrationsFolder = null);
    Task<MigrationRunResult> ApplyMigrationAsync(string connectionString, string filePath);
    Task<MigrationRunResult> RollbackMigrationAsync(string connectionString, string filePath);
    string GenerateMigrationFile(string projectPath, string name, string? migrationsFolder = null);
}

public class MigrationFile
{
    [JsonPropertyName("version")]
    public string Version { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("fileName")]
    public string FileName { get; set; } = string.Empty;

    [JsonPropertyName("relativePath")]
    public string RelativePath { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = "up";

    [JsonPropertyName("appliedAt")]
    public string? AppliedAt { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = "pending";

    [JsonPropertyName("sizeKb")]
    public double SizeKb { get; set; }
}

public class AppliedMigration
{
    [JsonPropertyName("version")]
    public string Version { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("appliedAt")]
    public DateTime AppliedAt { get; set; }
}

public class MigrationStatus
{
    [JsonPropertyName("totalFiles")]
    public int TotalFiles { get; set; }

    [JsonPropertyName("applied")]
    public int Applied { get; set; }

    [JsonPropertyName("pending")]
    public int Pending { get; set; }

    [JsonPropertyName("migrations")]
    public List<MigrationFile> Migrations { get; set; } = [];
}

public class MigrationRunResult
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("version")]
    public string Version { get; set; } = string.Empty;

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("durationMs")]
    public long DurationMs { get; set; }

    [JsonPropertyName("sql")]
    public string Sql { get; set; } = string.Empty;
}

public class MigrationService : IMigrationService
{
    private static readonly Regex VersionRegex = new(@"^V?(\d{3,14}|\d{4}_\d{2}_\d{2}_\d{4,6})[-_](.+?)(?:\.(up|down))?\.sql$", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private const string MigrationTable = "__devkit_migrations";

    public List<MigrationFile> ScanMigrations(string projectPath, string? migrationsFolder = null)
    {
        var folder = FindMigrationsFolder(projectPath, migrationsFolder);
        if (folder == null || !Directory.Exists(folder)) return [];

        var files = Directory.GetFiles(folder, "*.sql", SearchOption.TopDirectoryOnly)
            .OrderBy(f => Path.GetFileName(f))
            .ToList();

        var migrations = new List<MigrationFile>();
        foreach (var file in files)
        {
            var fileName = Path.GetFileName(file);
            var match = VersionRegex.Match(fileName);

            var migration = new MigrationFile
            {
                FileName = fileName,
                RelativePath = Path.GetRelativePath(projectPath, file).Replace('\\', '/'),
                SizeKb = Math.Round(new FileInfo(file).Length / 1024.0, 1),
            };

            if (match.Success)
            {
                migration.Version = match.Groups[1].Value;
                migration.Name = match.Groups[2].Value.Replace('_', ' ').Replace('-', ' ');
                migration.Type = match.Groups[3].Success ? match.Groups[3].Value.ToLower() : "up";
            }
            else
            {
                migration.Version = Path.GetFileNameWithoutExtension(fileName);
                migration.Name = fileName;
                migration.Type = fileName.Contains(".down.", StringComparison.OrdinalIgnoreCase) ? "down" : "up";
            }

            migrations.Add(migration);
        }

        return migrations;
    }

    public async Task<List<AppliedMigration>> GetAppliedMigrationsAsync(string connectionString)
    {
        var applied = new List<AppliedMigration>();

        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync();

        await EnsureMigrationTableAsync(conn);

        const string sql = "SELECT version, name, applied_at FROM __devkit_migrations ORDER BY applied_at";
        await using var cmd = new NpgsqlCommand(sql, conn);
        await using var reader = await cmd.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            applied.Add(new AppliedMigration
            {
                Version = reader.GetString(0),
                Name = reader.GetString(1),
                AppliedAt = reader.GetDateTime(2),
            });
        }

        return applied;
    }

    public async Task<MigrationStatus> GetStatusAsync(string projectPath, string connectionString, string? migrationsFolder = null)
    {
        var files = ScanMigrations(projectPath, migrationsFolder).Where(f => f.Type == "up").ToList();
        var applied = await GetAppliedMigrationsAsync(connectionString);
        var appliedVersions = applied.ToDictionary(a => a.Version, a => a);

        foreach (var file in files)
        {
            if (appliedVersions.TryGetValue(file.Version, out var app))
            {
                file.Status = "applied";
                file.AppliedAt = app.AppliedAt.ToString("yyyy-MM-dd HH:mm:ss");
            }
            else
            {
                file.Status = "pending";
            }
        }

        return new MigrationStatus
        {
            TotalFiles = files.Count,
            Applied = files.Count(f => f.Status == "applied"),
            Pending = files.Count(f => f.Status == "pending"),
            Migrations = files,
        };
    }

    public async Task<MigrationRunResult> ApplyMigrationAsync(string connectionString, string filePath)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var sql = await File.ReadAllTextAsync(filePath);
        var fileName = Path.GetFileName(filePath);
        var match = VersionRegex.Match(fileName);
        var version = match.Success ? match.Groups[1].Value : Path.GetFileNameWithoutExtension(fileName);
        var name = match.Success ? match.Groups[2].Value : fileName;

        try
        {
            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync();
            await EnsureMigrationTableAsync(conn);

            await using var transaction = await conn.BeginTransactionAsync();
            try
            {
                await using var cmd = new NpgsqlCommand(sql, conn, transaction);
                await cmd.ExecuteNonQueryAsync();

                await using var insertCmd = new NpgsqlCommand(
                    "INSERT INTO __devkit_migrations (version, name, applied_at) VALUES (@v, @n, NOW()) ON CONFLICT (version) DO NOTHING",
                    conn, transaction);
                insertCmd.Parameters.AddWithValue("v", version);
                insertCmd.Parameters.AddWithValue("n", name);
                await insertCmd.ExecuteNonQueryAsync();

                await transaction.CommitAsync();

                sw.Stop();
                return new MigrationRunResult { Success = true, Version = version, Message = $"Migration {version} applied.", DurationMs = sw.ElapsedMilliseconds, Sql = sql };
            }
            catch
            {
                await transaction.RollbackAsync();
                throw;
            }
        }
        catch (Exception ex)
        {
            sw.Stop();
            return new MigrationRunResult { Success = false, Version = version, Message = ex.Message, DurationMs = sw.ElapsedMilliseconds, Sql = sql };
        }
    }

    public async Task<MigrationRunResult> RollbackMigrationAsync(string connectionString, string filePath)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var sql = await File.ReadAllTextAsync(filePath);
        var fileName = Path.GetFileName(filePath);
        var match = VersionRegex.Match(fileName);
        var version = match.Success ? match.Groups[1].Value : Path.GetFileNameWithoutExtension(fileName);

        try
        {
            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync();

            await using var transaction = await conn.BeginTransactionAsync();
            try
            {
                await using var cmd = new NpgsqlCommand(sql, conn, transaction);
                await cmd.ExecuteNonQueryAsync();

                await using var deleteCmd = new NpgsqlCommand(
                    "DELETE FROM __devkit_migrations WHERE version = @v", conn, transaction);
                deleteCmd.Parameters.AddWithValue("v", version);
                await deleteCmd.ExecuteNonQueryAsync();

                await transaction.CommitAsync();

                sw.Stop();
                return new MigrationRunResult { Success = true, Version = version, Message = $"Migration {version} rolled back.", DurationMs = sw.ElapsedMilliseconds, Sql = sql };
            }
            catch
            {
                await transaction.RollbackAsync();
                throw;
            }
        }
        catch (Exception ex)
        {
            sw.Stop();
            return new MigrationRunResult { Success = false, Version = version, Message = ex.Message, DurationMs = sw.ElapsedMilliseconds, Sql = sql };
        }
    }

    public string GenerateMigrationFile(string projectPath, string name, string? migrationsFolder = null)
    {
        var folder = FindMigrationsFolder(projectPath, migrationsFolder) ?? Path.Combine(projectPath, "migrations");
        Directory.CreateDirectory(folder);

        var timestamp = DateTime.UtcNow.ToString("yyyyMMddHHmmss");
        var safeName = Regex.Replace(name.Trim(), @"[^a-zA-Z0-9_]", "_").ToLower();

        var upFile = Path.Combine(folder, $"V{timestamp}_{safeName}.up.sql");
        var downFile = Path.Combine(folder, $"V{timestamp}_{safeName}.down.sql");

        File.WriteAllText(upFile, $"-- Migration: {name}\n-- Created: {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC\n\n-- Write your UP migration SQL here\n");
        File.WriteAllText(downFile, $"-- Rollback: {name}\n-- Created: {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC\n\n-- Write your DOWN (rollback) migration SQL here\n");

        return Path.GetRelativePath(projectPath, upFile).Replace('\\', '/');
    }

    private static string? FindMigrationsFolder(string projectPath, string? migrationsFolder)
    {
        if (!string.IsNullOrWhiteSpace(migrationsFolder))
        {
            var custom = Path.IsPathRooted(migrationsFolder) ? migrationsFolder : Path.Combine(projectPath, migrationsFolder);
            if (Directory.Exists(custom)) return custom;
        }

        string[] candidates = ["migrations", "Migrations", "db/migrations", "sql/migrations", "scripts/migrations"];
        foreach (var candidate in candidates)
        {
            var path = Path.Combine(projectPath, candidate);
            if (Directory.Exists(path)) return path;
        }

        return Path.Combine(projectPath, "migrations");
    }

    private static async Task EnsureMigrationTableAsync(NpgsqlConnection conn)
    {
        const string sql = @"
            CREATE TABLE IF NOT EXISTS __devkit_migrations (
                version VARCHAR(50) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )";
        await using var cmd = new NpgsqlCommand(sql, conn);
        await cmd.ExecuteNonQueryAsync();
    }
}
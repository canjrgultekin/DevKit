using System.Text.Json.Serialization;
using Npgsql;

namespace DevKit.Services.Schema;

public interface IDatabaseSchemaService
{
    Task<SchemaResult> ScanSchemaAsync(string connectionString, string? schema = null);
    Task<TableDetail> GetTableDetailAsync(string connectionString, string tableName, string? schema = null);
    Task<List<string>> ListSchemasAsync(string connectionString);
}

// ===== MODELS =====

public sealed class SchemaResult
{
    [JsonPropertyName("tables")]
    public List<TableInfo> Tables { get; set; } = [];

    [JsonPropertyName("relationships")]
    public List<Relationship> Relationships { get; set; } = [];

    [JsonPropertyName("schema")]
    public string Schema { get; set; } = "public";

    [JsonPropertyName("tableCount")]
    public int TableCount { get; set; }

    [JsonPropertyName("totalColumns")]
    public int TotalColumns { get; set; }

    [JsonPropertyName("totalRelationships")]
    public int TotalRelationships { get; set; }
}

public class TableInfo
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("schema")]
    public string Schema { get; set; } = "public";

    [JsonPropertyName("rowEstimate")]
    public long RowEstimate { get; set; }

    [JsonPropertyName("sizeKb")]
    public long SizeKb { get; set; }

    [JsonPropertyName("columnCount")]
    public int ColumnCount { get; set; }

    [JsonPropertyName("indexCount")]
    public int IndexCount { get; set; }

    [JsonPropertyName("hasPrimaryKey")]
    public bool HasPrimaryKey { get; set; }

    [JsonPropertyName("columns")]
    public List<ColumnInfo> Columns { get; set; } = [];
}

public sealed class TableDetail : TableInfo
{
    [JsonPropertyName("indexes")]
    public List<IndexInfo> Indexes { get; set; } = [];

    [JsonPropertyName("foreignKeys")]
    public List<ForeignKeyInfo> ForeignKeys { get; set; } = [];

    [JsonPropertyName("referencedBy")]
    public List<ForeignKeyInfo> ReferencedBy { get; set; } = [];

    [JsonPropertyName("constraints")]
    public List<ConstraintInfo> Constraints { get; set; } = [];

    [JsonPropertyName("triggers")]
    public List<TriggerInfo> Triggers { get; set; } = [];

    [JsonPropertyName("createScript")]
    public string CreateScript { get; set; } = string.Empty;
}

public sealed class ColumnInfo
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("dataType")]
    public string DataType { get; set; } = string.Empty;

    [JsonPropertyName("maxLength")]
    public int? MaxLength { get; set; }

    [JsonPropertyName("isNullable")]
    public bool IsNullable { get; set; }

    [JsonPropertyName("isPrimaryKey")]
    public bool IsPrimaryKey { get; set; }

    [JsonPropertyName("isForeignKey")]
    public bool IsForeignKey { get; set; }

    [JsonPropertyName("isUnique")]
    public bool IsUnique { get; set; }

    [JsonPropertyName("defaultValue")]
    public string? DefaultValue { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("ordinalPosition")]
    public int OrdinalPosition { get; set; }
}

public sealed class IndexInfo
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("columns")]
    public List<string> Columns { get; set; } = [];

    [JsonPropertyName("isUnique")]
    public bool IsUnique { get; set; }

    [JsonPropertyName("isPrimaryKey")]
    public bool IsPrimaryKey { get; set; }

    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("sizeKb")]
    public long SizeKb { get; set; }
}

public sealed class ForeignKeyInfo
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("sourceTable")]
    public string SourceTable { get; set; } = string.Empty;

    [JsonPropertyName("sourceColumn")]
    public string SourceColumn { get; set; } = string.Empty;

    [JsonPropertyName("targetTable")]
    public string TargetTable { get; set; } = string.Empty;

    [JsonPropertyName("targetColumn")]
    public string TargetColumn { get; set; } = string.Empty;

    [JsonPropertyName("onDelete")]
    public string OnDelete { get; set; } = "NO ACTION";

    [JsonPropertyName("onUpdate")]
    public string OnUpdate { get; set; } = "NO ACTION";
}

public sealed class ConstraintInfo
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("definition")]
    public string Definition { get; set; } = string.Empty;
}

public sealed class TriggerInfo
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("event")]
    public string Event { get; set; } = string.Empty;

    [JsonPropertyName("timing")]
    public string Timing { get; set; } = string.Empty;

    [JsonPropertyName("definition")]
    public string Definition { get; set; } = string.Empty;
}

public sealed class Relationship
{
    [JsonPropertyName("sourceTable")]
    public string SourceTable { get; set; } = string.Empty;

    [JsonPropertyName("sourceColumn")]
    public string SourceColumn { get; set; } = string.Empty;

    [JsonPropertyName("targetTable")]
    public string TargetTable { get; set; } = string.Empty;

    [JsonPropertyName("targetColumn")]
    public string TargetColumn { get; set; } = string.Empty;

    [JsonPropertyName("constraintName")]
    public string ConstraintName { get; set; } = string.Empty;
}

// ===== SERVICE =====

public sealed class DatabaseSchemaService : IDatabaseSchemaService
{
    public async Task<List<string>> ListSchemasAsync(string connectionString)
    {
        var schemas = new List<string>();
        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync();

        const string sql = @"
            SELECT schema_name FROM information_schema.schemata 
            WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
            ORDER BY schema_name";

        await using var cmd = new NpgsqlCommand(sql, conn);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            schemas.Add(reader.GetString(0));

        return schemas;
    }

    public async Task<SchemaResult> ScanSchemaAsync(string connectionString, string? schema = null)
    {
        schema ??= "public";
        var result = new SchemaResult { Schema = schema };

        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync();

        // Tablolari getir
        result.Tables = await GetTablesAsync(conn, schema);
        result.Relationships = await GetRelationshipsAsync(conn, schema);
        result.TableCount = result.Tables.Count;
        result.TotalColumns = result.Tables.Sum(t => t.ColumnCount);
        result.TotalRelationships = result.Relationships.Count;

        return result;
    }

    public async Task<TableDetail> GetTableDetailAsync(string connectionString, string tableName, string? schema = null)
    {
        schema ??= "public";

        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync();

        var detail = new TableDetail { Name = tableName, Schema = schema };

        // Kolonlar
        detail.Columns = await GetColumnsAsync(conn, schema, tableName);
        detail.ColumnCount = detail.Columns.Count;

        // Primary key kontrol
        detail.HasPrimaryKey = detail.Columns.Any(c => c.IsPrimaryKey);

        // Indexler
        detail.Indexes = await GetIndexesAsync(conn, schema, tableName);
        detail.IndexCount = detail.Indexes.Count;

        // Foreign keys (bu tablodan cikan)
        detail.ForeignKeys = await GetForeignKeysAsync(conn, schema, tableName);

        // Bu tabloya referans veren FK'ler
        detail.ReferencedBy = await GetReferencedByAsync(conn, schema, tableName);

        // Constraints
        detail.Constraints = await GetConstraintsAsync(conn, schema, tableName);

        // Triggers
        detail.Triggers = await GetTriggersAsync(conn, schema, tableName);

        // Row estimate ve boyut
        var stats = await GetTableStatsAsync(conn, schema, tableName);
        detail.RowEstimate = stats.rows;
        detail.SizeKb = stats.sizeKb;

        // CREATE TABLE script
        detail.CreateScript = GenerateCreateScript(detail);

        return detail;
    }

    private static async Task<List<TableInfo>> GetTablesAsync(NpgsqlConnection conn, string schema)
    {
        var tables = new List<TableInfo>();

        const string sql = @"
            SELECT 
                t.table_name,
                COALESCE(s.n_live_tup, 0) as row_estimate,
                COALESCE(pg_total_relation_size(quote_ident(t.table_schema) || '.' || quote_ident(t.table_name)) / 1024, 0) as size_kb,
                (SELECT count(*) FROM information_schema.columns c WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name) as column_count,
                (SELECT count(*) FROM pg_indexes i WHERE i.schemaname = t.table_schema AND i.tablename = t.table_name) as index_count,
                EXISTS(
                    SELECT 1 FROM information_schema.table_constraints tc 
                    WHERE tc.table_schema = t.table_schema AND tc.table_name = t.table_name AND tc.constraint_type = 'PRIMARY KEY'
                ) as has_pk
            FROM information_schema.tables t
            LEFT JOIN pg_stat_user_tables s ON s.schemaname = t.table_schema AND s.relname = t.table_name
            WHERE t.table_schema = @schema AND t.table_type = 'BASE TABLE'
            ORDER BY t.table_name";

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("schema", schema);

        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var table = new TableInfo
            {
                Name = reader.GetString(0),
                Schema = schema,
                RowEstimate = reader.GetInt64(1),
                SizeKb = reader.GetInt64(2),
                ColumnCount = reader.GetInt32(3),
                IndexCount = reader.GetInt32(4),
                HasPrimaryKey = reader.GetBoolean(5)
            };

            tables.Add(table);
        }

        // Her tablo icin kolonlari da getir (ozet icin)
        foreach (var table in tables)
        {
            table.Columns = await GetColumnsAsync(conn, schema, table.Name);
        }

        return tables;
    }

    private static async Task<List<ColumnInfo>> GetColumnsAsync(NpgsqlConnection conn, string schema, string tableName)
    {
        var columns = new List<ColumnInfo>();

        const string sql = @"
            SELECT 
                c.column_name,
                c.data_type,
                c.character_maximum_length,
                c.is_nullable = 'YES' as is_nullable,
                c.column_default,
                c.ordinal_position,
                EXISTS(
                    SELECT 1 FROM information_schema.key_column_usage kcu
                    JOIN information_schema.table_constraints tc ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                    WHERE kcu.table_schema = c.table_schema AND kcu.table_name = c.table_name 
                    AND kcu.column_name = c.column_name AND tc.constraint_type = 'PRIMARY KEY'
                ) as is_pk,
                EXISTS(
                    SELECT 1 FROM information_schema.key_column_usage kcu
                    JOIN information_schema.table_constraints tc ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                    WHERE kcu.table_schema = c.table_schema AND kcu.table_name = c.table_name 
                    AND kcu.column_name = c.column_name AND tc.constraint_type = 'FOREIGN KEY'
                ) as is_fk,
                EXISTS(
                    SELECT 1 FROM information_schema.key_column_usage kcu
                    JOIN information_schema.table_constraints tc ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                    WHERE kcu.table_schema = c.table_schema AND kcu.table_name = c.table_name 
                    AND kcu.column_name = c.column_name AND tc.constraint_type = 'UNIQUE'
                ) as is_unique,
                pgd.description
            FROM information_schema.columns c
            LEFT JOIN pg_catalog.pg_statio_all_tables st ON st.schemaname = c.table_schema AND st.relname = c.table_name
            LEFT JOIN pg_catalog.pg_description pgd ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
            WHERE c.table_schema = @schema AND c.table_name = @table
            ORDER BY c.ordinal_position";

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("schema", schema);
        cmd.Parameters.AddWithValue("table", tableName);

        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            columns.Add(new ColumnInfo
            {
                Name = reader.GetString(0),
                DataType = reader.GetString(1),
                MaxLength = reader.IsDBNull(2) ? null : reader.GetInt32(2),
                IsNullable = reader.GetBoolean(3),
                DefaultValue = reader.IsDBNull(4) ? null : reader.GetString(4),
                OrdinalPosition = reader.GetInt32(5),
                IsPrimaryKey = reader.GetBoolean(6),
                IsForeignKey = reader.GetBoolean(7),
                IsUnique = reader.GetBoolean(8),
                Description = reader.IsDBNull(9) ? null : reader.GetString(9)
            });
        }

        return columns;
    }

    private static async Task<List<IndexInfo>> GetIndexesAsync(NpgsqlConnection conn, string schema, string tableName)
    {
        var indexes = new List<IndexInfo>();

        const string sql = @"
            SELECT 
                i.relname as index_name,
                array_to_string(array_agg(a.attname ORDER BY k.n), ', ') as columns,
                ix.indisunique as is_unique,
                ix.indisprimary as is_primary,
                am.amname as index_type,
                COALESCE(pg_relation_size(i.oid) / 1024, 0) as size_kb
            FROM pg_index ix
            JOIN pg_class t ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_am am ON am.oid = i.relam
            CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, n)
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
            WHERE n.nspname = @schema AND t.relname = @table
            GROUP BY i.relname, ix.indisunique, ix.indisprimary, am.amname, i.oid
            ORDER BY i.relname";

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("schema", schema);
        cmd.Parameters.AddWithValue("table", tableName);

        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            indexes.Add(new IndexInfo
            {
                Name = reader.GetString(0),
                Columns = reader.GetString(1).Split(", ").ToList(),
                IsUnique = reader.GetBoolean(2),
                IsPrimaryKey = reader.GetBoolean(3),
                Type = reader.GetString(4),
                SizeKb = reader.GetInt64(5)
            });
        }

        return indexes;
    }

    private static async Task<List<ForeignKeyInfo>> GetForeignKeysAsync(NpgsqlConnection conn, string schema, string tableName)
    {
        var fks = new List<ForeignKeyInfo>();

        const string sql = @"
            SELECT 
                tc.constraint_name,
                kcu.column_name as source_column,
                ccu.table_name as target_table,
                ccu.column_name as target_column,
                rc.delete_rule,
                rc.update_rule
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
            JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
            WHERE tc.table_schema = @schema AND tc.table_name = @table AND tc.constraint_type = 'FOREIGN KEY'";

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("schema", schema);
        cmd.Parameters.AddWithValue("table", tableName);

        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            fks.Add(new ForeignKeyInfo
            {
                Name = reader.GetString(0),
                SourceTable = tableName,
                SourceColumn = reader.GetString(1),
                TargetTable = reader.GetString(2),
                TargetColumn = reader.GetString(3),
                OnDelete = reader.GetString(4),
                OnUpdate = reader.GetString(5)
            });
        }

        return fks;
    }

    private static async Task<List<ForeignKeyInfo>> GetReferencedByAsync(NpgsqlConnection conn, string schema, string tableName)
    {
        var refs = new List<ForeignKeyInfo>();

        const string sql = @"
            SELECT 
                tc.constraint_name,
                tc.table_name as source_table,
                kcu.column_name as source_column,
                ccu.column_name as target_column,
                rc.delete_rule,
                rc.update_rule
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
            JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
            WHERE tc.table_schema = @schema AND ccu.table_name = @table AND tc.constraint_type = 'FOREIGN KEY'";

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("schema", schema);
        cmd.Parameters.AddWithValue("table", tableName);

        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            refs.Add(new ForeignKeyInfo
            {
                Name = reader.GetString(0),
                SourceTable = reader.GetString(1),
                SourceColumn = reader.GetString(2),
                TargetTable = tableName,
                TargetColumn = reader.GetString(3),
                OnDelete = reader.GetString(4),
                OnUpdate = reader.GetString(5)
            });
        }

        return refs;
    }

    private static async Task<List<ConstraintInfo>> GetConstraintsAsync(NpgsqlConnection conn, string schema, string tableName)
    {
        var constraints = new List<ConstraintInfo>();

        const string sql = @"
            SELECT 
                conname as name,
                CASE contype 
                    WHEN 'c' THEN 'CHECK' WHEN 'u' THEN 'UNIQUE' 
                    WHEN 'p' THEN 'PRIMARY KEY' WHEN 'f' THEN 'FOREIGN KEY'
                    WHEN 'x' THEN 'EXCLUSION' ELSE contype::text 
                END as type,
                pg_get_constraintdef(c.oid) as definition
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            JOIN pg_class t ON t.oid = c.conrelid
            WHERE n.nspname = @schema AND t.relname = @table
            ORDER BY contype, conname";

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("schema", schema);
        cmd.Parameters.AddWithValue("table", tableName);

        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            constraints.Add(new ConstraintInfo
            {
                Name = reader.GetString(0),
                Type = reader.GetString(1),
                Definition = reader.GetString(2)
            });
        }

        return constraints;
    }

    private static async Task<List<TriggerInfo>> GetTriggersAsync(NpgsqlConnection conn, string schema, string tableName)
    {
        var triggers = new List<TriggerInfo>();

        const string sql = @"
            SELECT 
                trigger_name,
                event_manipulation,
                action_timing,
                action_statement
            FROM information_schema.triggers
            WHERE trigger_schema = @schema AND event_object_table = @table
            ORDER BY trigger_name";

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("schema", schema);
        cmd.Parameters.AddWithValue("table", tableName);

        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            triggers.Add(new TriggerInfo
            {
                Name = reader.GetString(0),
                Event = reader.GetString(1),
                Timing = reader.GetString(2),
                Definition = reader.GetString(3)
            });
        }

        return triggers;
    }

    private static async Task<(long rows, long sizeKb)> GetTableStatsAsync(NpgsqlConnection conn, string schema, string tableName)
    {
        const string sql = @"
            SELECT 
                COALESCE(s.n_live_tup, 0),
                COALESCE(pg_total_relation_size(quote_ident(@schema) || '.' || quote_ident(@table)) / 1024, 0)
            FROM pg_stat_user_tables s
            WHERE s.schemaname = @schema AND s.relname = @table";

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("schema", schema);
        cmd.Parameters.AddWithValue("table", tableName);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
            return (reader.GetInt64(0), reader.GetInt64(1));

        return (0, 0);
    }

    private static async Task<List<Relationship>> GetRelationshipsAsync(NpgsqlConnection conn, string schema)
    {
        var relationships = new List<Relationship>();

        const string sql = @"
            SELECT 
                tc.constraint_name,
                tc.table_name as source_table,
                kcu.column_name as source_column,
                ccu.table_name as target_table,
                ccu.column_name as target_column
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
            WHERE tc.table_schema = @schema AND tc.constraint_type = 'FOREIGN KEY'
            ORDER BY tc.table_name";

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("schema", schema);

        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            relationships.Add(new Relationship
            {
                ConstraintName = reader.GetString(0),
                SourceTable = reader.GetString(1),
                SourceColumn = reader.GetString(2),
                TargetTable = reader.GetString(3),
                TargetColumn = reader.GetString(4)
            });
        }

        return relationships;
    }

    private static string GenerateCreateScript(TableDetail detail)
    {
        var sb = new System.Text.StringBuilder();
        sb.AppendLine($"CREATE TABLE {detail.Schema}.{detail.Name} (");

        for (var i = 0; i < detail.Columns.Count; i++)
        {
            var col = detail.Columns[i];
            var type = col.MaxLength.HasValue ? $"{col.DataType}({col.MaxLength})" : col.DataType;
            var nullable = col.IsNullable ? "" : " NOT NULL";
            var defaultVal = col.DefaultValue != null ? $" DEFAULT {col.DefaultValue}" : "";
            var comma = i < detail.Columns.Count - 1 || detail.Constraints.Count > 0 ? "," : "";
            sb.AppendLine($"    {col.Name} {type}{nullable}{defaultVal}{comma}");
        }

        // Constraints
        for (var i = 0; i < detail.Constraints.Count; i++)
        {
            var c = detail.Constraints[i];
            var comma = i < detail.Constraints.Count - 1 ? "," : "";
            sb.AppendLine($"    CONSTRAINT {c.Name} {c.Definition}{comma}");
        }

        sb.AppendLine(");");

        // Indexes (PK haric)
        foreach (var idx in detail.Indexes.Where(x => !x.IsPrimaryKey))
        {
            var unique = idx.IsUnique ? "UNIQUE " : "";
            sb.AppendLine($"CREATE {unique}INDEX {idx.Name} ON {detail.Schema}.{detail.Name} ({string.Join(", ", idx.Columns)});");
        }

        return sb.ToString();
    }
}
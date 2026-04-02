using System.Text.Json;
using System.Text.Json.Serialization;

namespace DevKit.Services.Architecture;

public interface IArchitectureDesignerService
{
    ArchitectureDesign CreateDesign(string name);
    ArchitectureDesign LoadDesign(string filePath);
    void SaveDesign(ArchitectureDesign design, string filePath);
    string ConvertToManifestJson(ArchitectureDesign design);
    string GenerateDockerCompose(ArchitectureDesign design);
    List<string> ValidateDesign(ArchitectureDesign design);
}

// ═══════════════════════════════════════
// ARCHITECTURE DESIGN MODEL
// ═══════════════════════════════════════

public class ArchitectureDesign
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string Description { get; set; } = string.Empty;

    [JsonPropertyName("solutionName")]
    public string SolutionName { get; set; } = string.Empty;

    [JsonPropertyName("outputPath")]
    public string OutputPath { get; set; } = string.Empty;

    [JsonPropertyName("framework")]
    public string Framework { get; set; } = "dotnet";

    [JsonPropertyName("architecture")]
    public string Architecture { get; set; } = "clean";

    [JsonPropertyName("components")]
    public List<ArchComponent> Components { get; set; } = [];

    [JsonPropertyName("connections")]
    public List<ArchConnection> Connections { get; set; } = [];

    [JsonPropertyName("createdAt")]
    public string CreatedAt { get; set; } = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");

    [JsonPropertyName("updatedAt")]
    public string UpdatedAt { get; set; } = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
}

public class ArchComponent
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("category")]
    public string Category { get; set; } = string.Empty;

    [JsonPropertyName("config")]
    public Dictionary<string, string> Config { get; set; } = new();

    // UI pozisyon (drag-drop icin)
    [JsonPropertyName("x")]
    public double X { get; set; }

    [JsonPropertyName("y")]
    public double Y { get; set; }
}

public class ArchConnection
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];

    [JsonPropertyName("sourceId")]
    public string SourceId { get; set; } = string.Empty;

    [JsonPropertyName("targetId")]
    public string TargetId { get; set; } = string.Empty;

    [JsonPropertyName("label")]
    public string Label { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = "uses";
}

// ═══════════════════════════════════════
// COMPONENT TEMPLATES (palette)
// ═══════════════════════════════════════

public static class ComponentTemplates
{
    public static readonly Dictionary<string, List<ComponentTemplate>> Categories = new()
    {
        ["project"] = [
            new("webapi", "Web API", "project", new() { {"sdk", "Microsoft.NET.Sdk.Web"}, {"framework", "net9.0"} }),
            new("classlib", "Class Library", "project", new() { {"sdk", "Microsoft.NET.Sdk"}, {"framework", "net9.0"} }),
            new("worker", "Worker Service", "project", new() { {"sdk", "Microsoft.NET.Sdk.Worker"}, {"framework", "net9.0"} }),
            new("console", "Console App", "project", new() { {"sdk", "Microsoft.NET.Sdk"}, {"outputType", "Exe"}, {"framework", "net9.0"} }),
            new("test", "Test Project", "project", new() { {"sdk", "Microsoft.NET.Sdk"}, {"framework", "net9.0"}, {"testFramework", "xunit"} }),
            new("nextjs", "Next.js App", "project", new() { {"framework", "nextjs"}, {"version", "15"} }),
            new("react", "React App", "project", new() { {"framework", "react"}, {"bundler", "vite"} }),
        ],
        ["database"] = [
            new("postgresql", "PostgreSQL", "infrastructure", new() { {"image", "postgres:17"}, {"port", "5432"}, {"defaultDb", "appdb"} }),
            new("mssql", "SQL Server", "infrastructure", new() { {"image", "mcr.microsoft.com/mssql/server:2022-latest"}, {"port", "1433"} }),
            new("mongodb", "MongoDB", "infrastructure", new() { {"image", "mongo:8"}, {"port", "27017"} }),
            new("redis", "Redis", "infrastructure", new() { {"image", "redis:7-alpine"}, {"port", "6379"} }),
            new("couchbase", "Couchbase", "infrastructure", new() { {"image", "couchbase:latest"}, {"port", "8091"} }),
        ],
        ["messaging"] = [
            new("kafka", "Apache Kafka", "infrastructure", new() { {"image", "confluentinc/cp-kafka:7.7.1"}, {"port", "9092"} }),
            new("rabbitmq", "RabbitMQ", "infrastructure", new() { {"image", "rabbitmq:4-management"}, {"port", "5672"}, {"mgmtPort", "15672"} }),
            new("servicebus", "Azure Service Bus", "cloud", new() { {"type", "managed"} }),
        ],
        ["observability"] = [
            new("elasticsearch", "Elasticsearch", "infrastructure", new() { {"image", "docker.elastic.co/elasticsearch/elasticsearch:8.17.0"}, {"port", "9200"} }),
            new("kibana", "Kibana", "infrastructure", new() { {"image", "docker.elastic.co/kibana/kibana:8.17.0"}, {"port", "5601"} }),
            new("logstash", "Logstash", "infrastructure", new() { {"image", "docker.elastic.co/logstash/logstash:8.17.0"}, {"port", "5044"} }),
            new("jaeger", "Jaeger", "infrastructure", new() { {"image", "jaegertracing/all-in-one:1.64"}, {"port", "16686"} }),
            new("zipkin", "Zipkin", "infrastructure", new() { {"image", "openzipkin/zipkin:3"}, {"port", "9411"} }),
            new("grafana", "Grafana", "infrastructure", new() { {"image", "grafana/grafana:11.4.0"}, {"port", "3000"} }),
            new("otelcollector", "OTel Collector", "infrastructure", new() { {"image", "otel/opentelemetry-collector-contrib:0.115.1"}, {"port", "4317"} }),
            new("prometheus", "Prometheus", "infrastructure", new() { {"image", "prom/prometheus:v2.54.0"}, {"port", "9090"} }),
        ],
        ["cicd"] = [
            new("jenkins", "Jenkins", "infrastructure", new() { {"image", "jenkins/jenkins:lts"}, {"port", "8080"} }),
            new("githubactions", "GitHub Actions", "cloud", new() { {"type", "managed"} }),
            new("azuredevops", "Azure DevOps", "cloud", new() { {"type", "managed"} }),
        ],
        ["gateway"] = [
            new("apigateway", "API Gateway", "project", new() { {"sdk", "Microsoft.NET.Sdk.Web"}, {"type", "gateway"} }),
            new("bff", "BFF (Backend for Frontend)", "project", new() { {"sdk", "Microsoft.NET.Sdk.Web"}, {"type", "bff"} }),
            new("nginx", "Nginx", "infrastructure", new() { {"image", "nginx:alpine"}, {"port", "80"} }),
        ],
    };
}

public record ComponentTemplate(string Type, string Label, string Category, Dictionary<string, string> DefaultConfig);

// ═══════════════════════════════════════
// SERVICE IMPLEMENTATION
// ═══════════════════════════════════════

public class ArchitectureDesignerService : IArchitectureDesignerService
{
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true, PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public ArchitectureDesign CreateDesign(string name)
    {
        return new ArchitectureDesign
        {
            Name = name,
            SolutionName = name.Replace(" ", "").Replace("-", ""),
        };
    }

    public ArchitectureDesign LoadDesign(string filePath)
    {
        var json = File.ReadAllText(filePath);
        return JsonSerializer.Deserialize<ArchitectureDesign>(json, JsonOpts)
            ?? throw new InvalidOperationException("Failed to parse design file.");
    }

    public void SaveDesign(ArchitectureDesign design, string filePath)
    {
        design.UpdatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
        var json = JsonSerializer.Serialize(design, JsonOpts);
        var dir = Path.GetDirectoryName(filePath);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
        File.WriteAllText(filePath, json);
    }

    public List<string> ValidateDesign(ArchitectureDesign design)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(design.SolutionName))
            errors.Add("Solution name is required.");
        if (string.IsNullOrWhiteSpace(design.OutputPath))
            errors.Add("Output path is required.");
        if (design.Components.Count == 0)
            errors.Add("At least one component is required.");

        var projectComponents = design.Components.Where(c => c.Category == "project").ToList();
        if (projectComponents.Count == 0)
            errors.Add("At least one project component is required.");

        // Duplicate isim kontrolu
        var duplicates = design.Components.GroupBy(c => c.Name).Where(g => g.Count() > 1).Select(g => g.Key).ToList();
        if (duplicates.Count > 0)
            errors.Add($"Duplicate component names: {string.Join(", ", duplicates)}");

        // Connection dogrulama
        var componentIds = design.Components.Select(c => c.Id).ToHashSet();
        foreach (var conn in design.Connections)
        {
            if (!componentIds.Contains(conn.SourceId))
                errors.Add($"Connection source '{conn.SourceId}' not found.");
            if (!componentIds.Contains(conn.TargetId))
                errors.Add($"Connection target '{conn.TargetId}' not found.");
        }

        return errors;
    }

    public string ConvertToManifestJson(ArchitectureDesign design)
    {
        var projects = design.Components.Where(c => c.Category == "project").ToList();
        var manifest = new
        {
            solution = design.SolutionName,
            outputPath = design.OutputPath,
            mode = "create",
            projects = projects.Select(p =>
            {
                var sdk = p.Config.GetValueOrDefault("sdk", "Microsoft.NET.Sdk");
                var framework = p.Config.GetValueOrDefault("framework", "net9.0");

                // Bu projenin baglandigi diger projeleri bul (project references)
                var refs = design.Connections
                    .Where(c => c.SourceId == p.Id && c.Type == "references")
                    .Select(c => design.Components.FirstOrDefault(comp => comp.Id == c.TargetId)?.Name)
                    .Where(n => n != null)
                    .ToList();

                // Bu projenin kullandigi NuGet paketleri (infrastructure baglantilarina gore)
                var nugets = new List<object>();
                var infraConnections = design.Connections.Where(c => c.SourceId == p.Id && c.Type == "uses").ToList();
                foreach (var conn in infraConnections)
                {
                    var target = design.Components.FirstOrDefault(c => c.Id == conn.TargetId);
                    if (target == null) continue;

                    nugets.AddRange(GetNugetsForInfra(target.Type));
                }

                return new
                {
                    name = p.Name,
                    path = $"src/{p.Name}",
                    sdk,
                    framework,
                    nugets = nugets.Distinct().ToList(),
                    projectReferences = refs,
                    folders = GetDefaultFolders(p.Type),
                };
            }).ToList()
        };

        return JsonSerializer.Serialize(manifest, JsonOpts);
    }

    public string GenerateDockerCompose(ArchitectureDesign design)
    {
        var infraComponents = design.Components.Where(c => c.Category == "infrastructure").ToList();
        if (infraComponents.Count == 0) return "";

        var yaml = new System.Text.StringBuilder();
        yaml.AppendLine("services:");

        foreach (var comp in infraComponents)
        {
            var image = comp.Config.GetValueOrDefault("image", "");
            var port = comp.Config.GetValueOrDefault("port", "");
            if (string.IsNullOrEmpty(image)) continue;

            var serviceName = comp.Name.ToLower().Replace(" ", "-").Replace(".", "-");
            yaml.AppendLine($"  {serviceName}:");
            yaml.AppendLine($"    image: {image}");
            yaml.AppendLine($"    container_name: {design.SolutionName.ToLower()}-{serviceName}");

            if (!string.IsNullOrEmpty(port))
                yaml.AppendLine($"    ports:\n      - \"{port}:{port}\"");

            // Environment variables
            var envVars = GetDockerEnvVars(comp.Type);
            if (envVars.Count > 0)
            {
                yaml.AppendLine("    environment:");
                foreach (var env in envVars)
                    yaml.AppendLine($"      - {env}");
            }

            // Volumes
            var volumes = GetDockerVolumes(comp.Type, serviceName);
            if (volumes.Count > 0)
            {
                yaml.AppendLine("    volumes:");
                foreach (var vol in volumes)
                    yaml.AppendLine($"      - {vol}");
            }

            // Restart
            yaml.AppendLine("    restart: unless-stopped");

            // Mgmt port (rabbitmq gibi)
            if (comp.Config.TryGetValue("mgmtPort", out var mgmtPort))
            {
                // ports'a ekle (zaten port satirinda)
                yaml.Replace($"      - \"{port}:{port}\"", $"      - \"{port}:{port}\"\n      - \"{mgmtPort}:{mgmtPort}\"");
            }

            yaml.AppendLine();
        }

        // Volumes tanimla
        yaml.AppendLine("volumes:");
        foreach (var comp in infraComponents)
        {
            var serviceName = comp.Name.ToLower().Replace(" ", "-").Replace(".", "-");
            yaml.AppendLine($"  {serviceName}-data:");
        }

        return yaml.ToString();
    }

    // ═══════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════

    private static List<object> GetNugetsForInfra(string infraType)
    {
        return infraType switch
        {
            "postgresql" => [new { name = "Npgsql.EntityFrameworkCore.PostgreSQL", version = "9.0.3" }, new { name = "Npgsql", version = "9.0.3" }],
            "mssql" => [new { name = "Microsoft.EntityFrameworkCore.SqlServer", version = "9.0.1" }],
            "mongodb" => [new { name = "MongoDB.Driver", version = "3.1.0" }],
            "redis" => [new { name = "StackExchange.Redis", version = "2.8.16" }],
            "kafka" => [new { name = "Confluent.Kafka", version = "2.6.1" }],
            "rabbitmq" => [new { name = "RabbitMQ.Client", version = "7.0.0" }],
            "elasticsearch" => [new { name = "Elastic.Clients.Elasticsearch", version = "8.17.0" }, new { name = "Serilog.Sinks.Elasticsearch", version = "10.0.0" }],
            "otelcollector" => [new { name = "OpenTelemetry.Extensions.Hosting", version = "1.10.0" }, new { name = "OpenTelemetry.Exporter.OpenTelemetryProtocol", version = "1.10.0" }],
            "jaeger" or "zipkin" => [new { name = "OpenTelemetry.Extensions.Hosting", version = "1.10.0" }],
            "grafana" or "prometheus" => [new { name = "OpenTelemetry.Exporter.Prometheus.AspNetCore", version = "1.10.0-rc.1" }],
            _ => []
        };
    }

    private static List<string> GetDefaultFolders(string projectType)
    {
        return projectType switch
        {
            "webapi" or "apigateway" or "bff" => ["Controllers", "Services", "Models", "Middleware", "Extensions"],
            "classlib" => ["Abstractions", "Models", "Extensions"],
            "worker" => ["Workers", "Services", "Models"],
            "test" => ["Unit", "Integration", "Fixtures"],
            _ => []
        };
    }

    private static List<string> GetDockerEnvVars(string type)
    {
        return type switch
        {
            "postgresql" => ["POSTGRES_USER=postgres", "POSTGRES_PASSWORD=postgres", "POSTGRES_DB=appdb"],
            "mssql" => ["ACCEPT_EULA=Y", "SA_PASSWORD=YourStr0ngP@ssword!"],
            "redis" => [],
            "mongodb" => ["MONGO_INITDB_ROOT_USERNAME=admin", "MONGO_INITDB_ROOT_PASSWORD=admin"],
            "kafka" => ["KAFKA_NODE_ID=1", "KAFKA_PROCESS_ROLES=broker,controller", "KAFKA_LISTENERS=PLAINTEXT://:9092,CONTROLLER://:9093", "KAFKA_CONTROLLER_QUORUM_VOTERS=1@kafka:9093", "KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER", "CLUSTER_ID=MkU3OEVBNTcwNTJENDM2Qk"],
            "rabbitmq" => ["RABBITMQ_DEFAULT_USER=guest", "RABBITMQ_DEFAULT_PASS=guest"],
            "elasticsearch" => ["discovery.type=single-node", "xpack.security.enabled=false", "ES_JAVA_OPTS=-Xms512m -Xmx512m"],
            "kibana" => ["ELASTICSEARCH_HOSTS=http://elasticsearch:9200"],
            "jaeger" => ["COLLECTOR_OTLP_ENABLED=true"],
            "grafana" => ["GF_SECURITY_ADMIN_PASSWORD=admin"],
            _ => []
        };
    }

    private static List<string> GetDockerVolumes(string type, string serviceName)
    {
        return type switch
        {
            "postgresql" or "mssql" or "mongodb" or "redis" or "couchbase" or "elasticsearch" => [$"{serviceName}-data:/var/lib/{type}/data"],
            _ => []
        };
    }
}
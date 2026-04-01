using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DevKit.Services.Docker;

public interface IDockerService
{
    List<DockerServiceTemplate> GetAvailableServices();
    string GenerateComposeYml(ComposeRequest request);
    Task<string> SaveComposeFileAsync(string outputPath, string content, string fileName = "docker-compose.yml");
    Task<string> SaveOtelConfigAsync(string outputPath, OtelConfig config);
    Dictionary<string, string> GetConnectionStrings(List<SelectedService> services);
    Task InjectToAppSettingsAsync(string appSettingsPath, Dictionary<string, string> connectionStrings);
    Task<DockerCommandResult> RunDockerCommandAsync(string workingDir, string arguments);
    Task<DockerCommandResult> ComposeUpAsync(string workingDir, bool detached = true, string? file = null);
    Task<DockerCommandResult> ComposeDownAsync(string workingDir, bool removeVolumes = false, string? file = null);
    Task<DockerCommandResult> ComposePsAsync(string workingDir, string? file = null);
    Task<DockerCommandResult> ComposeLogsAsync(string workingDir, string? serviceName = null, int tail = 100, string? file = null);
    Task<DockerCommandResult> ComposeBuildAsync(string workingDir, string? file = null);
    Task<DockerCommandResult> ComposeRestartAsync(string workingDir, string? serviceName = null, string? file = null);
    Task<DockerCommandResult> ComposePullAsync(string workingDir, string? file = null);
}

public sealed class DockerServiceTemplate
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("category")]
    public string Category { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string Description { get; set; } = string.Empty;

    [JsonPropertyName("image")]
    public string Image { get; set; } = string.Empty;

    [JsonPropertyName("defaultPorts")]
    public List<PortMapping> DefaultPorts { get; set; } = [];

    [JsonPropertyName("defaultEnv")]
    public Dictionary<string, string> DefaultEnv { get; set; } = new();

    [JsonPropertyName("volumes")]
    public List<string> Volumes { get; set; } = [];

    [JsonPropertyName("connectionStringKey")]
    public string ConnectionStringKey { get; set; } = string.Empty;

    [JsonPropertyName("connectionStringTemplate")]
    public string ConnectionStringTemplate { get; set; } = string.Empty;

    [JsonPropertyName("configKeys")]
    public Dictionary<string, string> ConfigKeys { get; set; } = new();

    [JsonPropertyName("dependsOn")]
    public List<string> DependsOn { get; set; } = [];

    [JsonPropertyName("healthCheck")]
    public string? HealthCheck { get; set; }

    [JsonPropertyName("networks")]
    public List<string> Networks { get; set; } = ["devkit-net"];
}

public sealed class PortMapping
{
    [JsonPropertyName("host")]
    public int Host { get; set; }

    [JsonPropertyName("container")]
    public int Container { get; set; }

    [JsonPropertyName("description")]
    public string Description { get; set; } = string.Empty;
}

public sealed class SelectedService
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("containerName")]
    public string? ContainerName { get; set; }

    [JsonPropertyName("ports")]
    public List<PortMapping>? Ports { get; set; }

    [JsonPropertyName("env")]
    public Dictionary<string, string>? Env { get; set; }

    [JsonPropertyName("volumes")]
    public List<string>? Volumes { get; set; }
}

public sealed class CustomProjectService
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("buildContext")]
    public string BuildContext { get; set; } = ".";

    [JsonPropertyName("dockerfile")]
    public string Dockerfile { get; set; } = "Dockerfile";

    [JsonPropertyName("ports")]
    public List<PortMapping> Ports { get; set; } = [];

    [JsonPropertyName("env")]
    public Dictionary<string, string> Env { get; set; } = new();

    [JsonPropertyName("dependsOn")]
    public List<string> DependsOn { get; set; } = [];
}

public sealed class ComposeRequest
{
    [JsonPropertyName("services")]
    public List<SelectedService> Services { get; set; } = [];

    [JsonPropertyName("customServices")]
    public List<CustomProjectService> CustomServices { get; set; } = [];

    [JsonPropertyName("projectName")]
    public string ProjectName { get; set; } = "devkit";

    [JsonPropertyName("networkName")]
    public string NetworkName { get; set; } = "devkit-net";
}

public sealed class OtelConfig
{
    [JsonPropertyName("enableJaeger")]
    public bool EnableJaeger { get; set; }

    [JsonPropertyName("enableZipkin")]
    public bool EnableZipkin { get; set; }

    [JsonPropertyName("enablePrometheus")]
    public bool EnablePrometheus { get; set; }

    [JsonPropertyName("enableElastic")]
    public bool EnableElastic { get; set; }

    [JsonPropertyName("elasticHost")]
    public string ElasticHost { get; set; } = "elasticsearch:9200";
}

public sealed class DockerCommandResult
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("output")]
    public string Output { get; set; } = string.Empty;

    [JsonPropertyName("error")]
    public string Error { get; set; } = string.Empty;

    [JsonPropertyName("command")]
    public string Command { get; set; } = string.Empty;
}

public sealed class DockerService : IDockerService
{
    public List<DockerServiceTemplate> GetAvailableServices()
    {
        return
        [
            // ===== MESSAGE BROKERS =====
            new DockerServiceTemplate
            {
                Id = "kafka", Name = "Apache Kafka", Category = "Message Broker",
                Description = "Distributed event streaming platform (KRaft mode, no Zookeeper)",
                Image = "bitnami/kafka:3.9",
                DefaultPorts = [new() { Host = 9092, Container = 9092, Description = "Kafka broker" }],
                DefaultEnv = new()
                {
                    ["KAFKA_CFG_NODE_ID"] = "1",
                    ["KAFKA_CFG_PROCESS_ROLES"] = "broker,controller",
                    ["KAFKA_CFG_LISTENERS"] = "PLAINTEXT://:9092,CONTROLLER://:9093",
                    ["KAFKA_CFG_ADVERTISED_LISTENERS"] = "PLAINTEXT://localhost:9092",
                    ["KAFKA_CFG_LISTENER_SECURITY_PROTOCOL_MAP"] = "CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT",
                    ["KAFKA_CFG_CONTROLLER_QUORUM_VOTERS"] = "1@kafka:9093",
                    ["KAFKA_CFG_CONTROLLER_LISTENER_NAMES"] = "CONTROLLER",
                    ["ALLOW_PLAINTEXT_LISTENER"] = "yes"
                },
                Volumes = ["kafka-data:/bitnami/kafka"],
                ConnectionStringKey = "Kafka:BootstrapServers",
                ConnectionStringTemplate = "localhost:9092",
                ConfigKeys = new() { ["Kafka:BootstrapServers"] = "localhost:9092" }
            },
            new DockerServiceTemplate
            {
                Id = "rabbitmq", Name = "RabbitMQ", Category = "Message Broker",
                Description = "Message broker with management UI",
                Image = "rabbitmq:4-management-alpine",
                DefaultPorts =
                [
                    new() { Host = 5672, Container = 5672, Description = "AMQP" },
                    new() { Host = 15672, Container = 15672, Description = "Management UI" }
                ],
                DefaultEnv = new() { ["RABBITMQ_DEFAULT_USER"] = "guest", ["RABBITMQ_DEFAULT_PASS"] = "guest" },
                Volumes = ["rabbitmq-data:/var/lib/rabbitmq"],
                ConnectionStringKey = "RabbitMQ:ConnectionString",
                ConnectionStringTemplate = "amqp://guest:guest@localhost:5672/",
                ConfigKeys = new() { ["RabbitMQ:Host"] = "localhost", ["RabbitMQ:Port"] = "5672", ["RabbitMQ:Username"] = "guest", ["RabbitMQ:Password"] = "guest" }
            },

            // ===== DATABASES =====
            new DockerServiceTemplate
            {
                Id = "postgresql", Name = "PostgreSQL", Category = "Database",
                Description = "Advanced open source relational database",
                Image = "postgres:17-alpine",
                DefaultPorts = [new() { Host = 5432, Container = 5432, Description = "PostgreSQL" }],
                DefaultEnv = new() { ["POSTGRES_DB"] = "appdb", ["POSTGRES_USER"] = "postgres", ["POSTGRES_PASSWORD"] = "postgres" },
                Volumes = ["pg-data:/var/lib/postgresql/data"],
                ConnectionStringKey = "ConnectionStrings:DefaultConnection",
                ConnectionStringTemplate = "Host=localhost;Port=5432;Database=appdb;Username=postgres;Password=postgres",
                HealthCheck = "pg_isready -U postgres"
            },
            new DockerServiceTemplate
            {
                Id = "mssql", Name = "SQL Server", Category = "Database",
                Description = "Microsoft SQL Server 2022",
                Image = "mcr.microsoft.com/mssql/server:2022-latest",
                DefaultPorts = [new() { Host = 1433, Container = 1433, Description = "SQL Server" }],
                DefaultEnv = new() { ["ACCEPT_EULA"] = "Y", ["MSSQL_SA_PASSWORD"] = "YourStrong!Passw0rd", ["MSSQL_PID"] = "Developer" },
                Volumes = ["mssql-data:/var/opt/mssql"],
                ConnectionStringKey = "ConnectionStrings:DefaultConnection",
                ConnectionStringTemplate = "Server=localhost,1433;Database=appdb;User Id=sa;Password=YourStrong!Passw0rd;TrustServerCertificate=True"
            },

            // ===== OBSERVABILITY =====
            new DockerServiceTemplate
            {
                Id = "elasticsearch", Name = "Elasticsearch", Category = "Observability",
                Description = "Search and analytics engine",
                Image = "docker.elastic.co/elasticsearch/elasticsearch:8.17.0",
                DefaultPorts =
                [
                    new() { Host = 9200, Container = 9200, Description = "HTTP API" },
                    new() { Host = 9300, Container = 9300, Description = "Transport" }
                ],
                DefaultEnv = new() { ["discovery.type"] = "single-node", ["xpack.security.enabled"] = "false", ["ES_JAVA_OPTS"] = "-Xms512m -Xmx512m" },
                Volumes = ["es-data:/usr/share/elasticsearch/data"],
                ConnectionStringKey = "Elasticsearch:Url",
                ConnectionStringTemplate = "http://localhost:9200",
                ConfigKeys = new() { ["Elasticsearch:Url"] = "http://localhost:9200" }
            },
            new DockerServiceTemplate
            {
                Id = "kibana", Name = "Kibana", Category = "Observability",
                Description = "Elasticsearch dashboard and visualization",
                Image = "docker.elastic.co/kibana/kibana:8.17.0",
                DefaultPorts = [new() { Host = 5601, Container = 5601, Description = "Kibana UI" }],
                DefaultEnv = new() { ["ELASTICSEARCH_HOSTS"] = "http://elasticsearch:9200" },
                DependsOn = ["elasticsearch"]
            },
            new DockerServiceTemplate
            {
                Id = "logstash", Name = "Logstash", Category = "Observability",
                Description = "Log pipeline and transformation",
                Image = "docker.elastic.co/logstash/logstash:8.17.0",
                DefaultPorts = [new() { Host = 5044, Container = 5044, Description = "Beats input" }, new() { Host = 9600, Container = 9600, Description = "API" }],
                DefaultEnv = new() { ["LS_JAVA_OPTS"] = "-Xms256m -Xmx256m" },
                Volumes = ["./logstash/pipeline:/usr/share/logstash/pipeline:ro"],
                DependsOn = ["elasticsearch"],
                ConfigKeys = new() { ["Logstash:Url"] = "http://localhost:5044" }
            },
            new DockerServiceTemplate
            {
                Id = "jaeger", Name = "Jaeger", Category = "Observability",
                Description = "Distributed tracing system (all-in-one)",
                Image = "jaegertracing/all-in-one:1.64",
                DefaultPorts =
                [
                    new() { Host = 16686, Container = 16686, Description = "Jaeger UI" },
                    new() { Host = 4317, Container = 4317, Description = "OTLP gRPC" },
                    new() { Host = 4318, Container = 4318, Description = "OTLP HTTP" }
                ],
                DefaultEnv = new() { ["COLLECTOR_OTLP_ENABLED"] = "true" },
                ConnectionStringKey = "OpenTelemetry:TracingEndpoint",
                ConnectionStringTemplate = "http://localhost:4317",
                ConfigKeys = new() { ["OpenTelemetry:TracingEndpoint"] = "http://localhost:4317" }
            },
            new DockerServiceTemplate
            {
                Id = "zipkin", Name = "Zipkin", Category = "Observability",
                Description = "Distributed tracing system",
                Image = "openzipkin/zipkin:3",
                DefaultPorts = [new() { Host = 9411, Container = 9411, Description = "Zipkin UI + API" }],
                ConnectionStringKey = "Zipkin:Endpoint",
                ConnectionStringTemplate = "http://localhost:9411/api/v2/spans",
                ConfigKeys = new() { ["Zipkin:Endpoint"] = "http://localhost:9411/api/v2/spans" }
            },
            new DockerServiceTemplate
            {
                Id = "grafana", Name = "Grafana", Category = "Observability",
                Description = "Monitoring dashboards and visualization",
                Image = "grafana/grafana:11.4.0",
                DefaultPorts = [new() { Host = 3000, Container = 3000, Description = "Grafana UI" }],
                DefaultEnv = new() { ["GF_SECURITY_ADMIN_USER"] = "admin", ["GF_SECURITY_ADMIN_PASSWORD"] = "admin", ["GF_AUTH_ANONYMOUS_ENABLED"] = "true" },
                Volumes = ["grafana-data:/var/lib/grafana"]
            },
            new DockerServiceTemplate
            {
                Id = "otelcollector", Name = "OpenTelemetry Collector", Category = "Observability",
                Description = "Vendor-agnostic telemetry data collector. Generates otel-collector-config.yml",
                Image = "otel/opentelemetry-collector-contrib:0.115.0",
                DefaultPorts =
                [
                    new() { Host = 4317, Container = 4317, Description = "OTLP gRPC receiver" },
                    new() { Host = 4318, Container = 4318, Description = "OTLP HTTP receiver" },
                    new() { Host = 8888, Container = 8888, Description = "Prometheus metrics" }
                ],
                Volumes = ["./otel-collector-config.yml:/etc/otelcol-contrib/config.yaml:ro"],
                ConnectionStringKey = "OpenTelemetry:Endpoint",
                ConnectionStringTemplate = "http://localhost:4317",
                ConfigKeys = new() { ["OpenTelemetry:Endpoint"] = "http://localhost:4317" }
            }
        ];
    }

    public string GenerateComposeYml(ComposeRequest request)
    {
        var templates = GetAvailableServices().ToDictionary(t => t.Id);
        var sb = new StringBuilder();
        var volumes = new HashSet<string>();
        var selectedIds = request.Services.Select(s => s.Id).ToHashSet();

        // Akilli port yonetimi: Jaeger + OTel Collector birlikte secildiyse
        // OTel Collector OTLP portlarini (4317/4318) alir, Jaeger sadece UI (16686) kalir
        var hasJaegerAndOtel = selectedIds.Contains("jaeger") && selectedIds.Contains("otelcollector");

        sb.AppendLine("services:");

        // Infrastructure services
        foreach (var svc in request.Services)
        {
            if (!templates.TryGetValue(svc.Id, out var tmpl)) continue;

            var containerName = svc.ContainerName ?? svc.Id;
            sb.AppendLine();
            sb.AppendLine($"  {containerName}:");
            sb.AppendLine($"    image: {tmpl.Image}");
            sb.AppendLine($"    container_name: {request.ProjectName}-{containerName}");

            // Environment
            var env = new Dictionary<string, string>(tmpl.DefaultEnv);
            if (svc.Env != null) foreach (var kv in svc.Env) env[kv.Key] = kv.Value;
            if (env.Count > 0)
            {
                sb.AppendLine("    environment:");
                foreach (var kv in env)
                    sb.AppendLine($"      - {kv.Key}={kv.Value}");
            }

            // Ports - akilli catisma cozumu
            var ports = svc.Ports ?? tmpl.DefaultPorts;
            if (hasJaegerAndOtel && svc.Id == "jaeger")
            {
                // Jaeger: sadece UI portu, OTLP portlarini OTel Collector'a birak
                ports = ports.Where(p => p.Container != 4317 && p.Container != 4318).ToList();
            }
            if (ports.Count > 0)
            {
                sb.AppendLine("    ports:");
                foreach (var p in ports)
                    sb.AppendLine($"      - \"{p.Host}:{p.Container}\"");
            }

            // Volumes
            var vols = svc.Volumes ?? tmpl.Volumes;
            if (vols.Count > 0)
            {
                sb.AppendLine("    volumes:");
                foreach (var v in vols)
                {
                    sb.AppendLine($"      - {v}");
                    var volName = v.Split(':')[0];
                    if (!volName.StartsWith(".") && !volName.StartsWith("/"))
                        volumes.Add(volName);
                }
            }

            // Depends on
            var deps = tmpl.DependsOn.Where(d => request.Services.Any(s => s.Id == d || s.ContainerName == d)).ToList();
            if (deps.Count > 0)
            {
                sb.AppendLine("    depends_on:");
                foreach (var d in deps)
                    sb.AppendLine($"      - {d}");
            }

            // Health check
            if (!string.IsNullOrEmpty(tmpl.HealthCheck))
            {
                sb.AppendLine("    healthcheck:");
                sb.AppendLine($"      test: [\"{tmpl.HealthCheck}\"]");
                sb.AppendLine("      interval: 10s");
                sb.AppendLine("      timeout: 5s");
                sb.AppendLine("      retries: 5");
            }

            // Network
            sb.AppendLine("    networks:");
            sb.AppendLine($"      - {request.NetworkName}");

            sb.AppendLine("    restart: unless-stopped");
        }

        // Custom project services
        foreach (var svc in request.CustomServices)
        {
            sb.AppendLine();
            sb.AppendLine($"  {svc.Name}:");
            sb.AppendLine("    build:");
            sb.AppendLine($"      context: {svc.BuildContext}");
            sb.AppendLine($"      dockerfile: {svc.Dockerfile}");
            sb.AppendLine($"    container_name: {request.ProjectName}-{svc.Name}");

            if (svc.Env.Count > 0)
            {
                sb.AppendLine("    environment:");
                foreach (var kv in svc.Env)
                    sb.AppendLine($"      - {kv.Key}={kv.Value}");
            }

            if (svc.Ports.Count > 0)
            {
                sb.AppendLine("    ports:");
                foreach (var p in svc.Ports)
                    sb.AppendLine($"      - \"{p.Host}:{p.Container}\"");
            }

            if (svc.DependsOn.Count > 0)
            {
                sb.AppendLine("    depends_on:");
                foreach (var d in svc.DependsOn)
                    sb.AppendLine($"      - {d}");
            }

            sb.AppendLine("    networks:");
            sb.AppendLine($"      - {request.NetworkName}");
            sb.AppendLine("    restart: unless-stopped");
        }

        // Networks
        sb.AppendLine();
        sb.AppendLine("networks:");
        sb.AppendLine($"  {request.NetworkName}:");
        sb.AppendLine("    driver: bridge");

        // Volumes
        if (volumes.Count > 0)
        {
            sb.AppendLine();
            sb.AppendLine("volumes:");
            foreach (var v in volumes.OrderBy(x => x))
                sb.AppendLine($"  {v}:");
        }

        return sb.ToString();
    }

    public async Task<string> SaveComposeFileAsync(string outputPath, string content, string fileName = "docker-compose.yml")
    {
        if (!Directory.Exists(outputPath))
            Directory.CreateDirectory(outputPath);

        var filePath = Path.Combine(outputPath, fileName);
        await System.IO.File.WriteAllTextAsync(filePath, content);
        return filePath;
    }

    public async Task<string> SaveOtelConfigAsync(string outputPath, OtelConfig config)
    {
        var sb = new StringBuilder();
        sb.AppendLine("receivers:");
        sb.AppendLine("  otlp:");
        sb.AppendLine("    protocols:");
        sb.AppendLine("      grpc:");
        sb.AppendLine("        endpoint: 0.0.0.0:4317");
        sb.AppendLine("      http:");
        sb.AppendLine("        endpoint: 0.0.0.0:4318");
        sb.AppendLine();
        sb.AppendLine("processors:");
        sb.AppendLine("  batch:");
        sb.AppendLine("    timeout: 5s");
        sb.AppendLine("    send_batch_size: 1024");
        sb.AppendLine();

        var exporters = new List<string>();
        sb.AppendLine("exporters:");
        sb.AppendLine("  debug:");
        sb.AppendLine("    verbosity: basic");
        exporters.Add("debug");

        if (config.EnableJaeger)
        {
            sb.AppendLine("  otlp/jaeger:");
            sb.AppendLine("    endpoint: jaeger:4317");
            sb.AppendLine("    tls:");
            sb.AppendLine("      insecure: true");
            exporters.Add("otlp/jaeger");
        }

        if (config.EnableZipkin)
        {
            sb.AppendLine("  zipkin:");
            sb.AppendLine("    endpoint: http://zipkin:9411/api/v2/spans");
            exporters.Add("zipkin");
        }

        if (config.EnableElastic)
        {
            sb.AppendLine("  elasticsearch:");
            sb.AppendLine($"    endpoints: [{config.ElasticHost}]");
            exporters.Add("elasticsearch");
        }

        if (config.EnablePrometheus)
        {
            sb.AppendLine("  prometheus:");
            sb.AppendLine("    endpoint: 0.0.0.0:8889");
            exporters.Add("prometheus");
        }

        sb.AppendLine();
        sb.AppendLine("service:");
        sb.AppendLine("  pipelines:");
        sb.AppendLine("    traces:");
        sb.AppendLine("      receivers: [otlp]");
        sb.AppendLine("      processors: [batch]");
        sb.AppendLine($"      exporters: [{string.Join(", ", exporters)}]");
        sb.AppendLine("    metrics:");
        sb.AppendLine("      receivers: [otlp]");
        sb.AppendLine("      processors: [batch]");
        sb.AppendLine($"      exporters: [{string.Join(", ", exporters.Where(e => e != "otlp/jaeger" && e != "zipkin"))}]");
        sb.AppendLine("    logs:");
        sb.AppendLine("      receivers: [otlp]");
        sb.AppendLine("      processors: [batch]");
        sb.AppendLine($"      exporters: [{string.Join(", ", exporters.Where(e => e != "otlp/jaeger" && e != "zipkin"))}]");

        var filePath = Path.Combine(outputPath, "otel-collector-config.yml");
        await System.IO.File.WriteAllTextAsync(filePath, sb.ToString());
        return filePath;
    }

    public Dictionary<string, string> GetConnectionStrings(List<SelectedService> services)
    {
        var templates = GetAvailableServices().ToDictionary(t => t.Id);
        var result = new Dictionary<string, string>();

        foreach (var svc in services)
        {
            if (!templates.TryGetValue(svc.Id, out var tmpl)) continue;

            if (!string.IsNullOrEmpty(tmpl.ConnectionStringKey))
                result[tmpl.ConnectionStringKey] = tmpl.ConnectionStringTemplate;

            foreach (var kv in tmpl.ConfigKeys)
                result[kv.Key] = kv.Value;
        }

        return result;
    }

    public async Task InjectToAppSettingsAsync(string appSettingsPath, Dictionary<string, string> connectionStrings)
    {
        if (!System.IO.File.Exists(appSettingsPath))
            throw new FileNotFoundException($"appsettings file not found: {appSettingsPath}");

        var json = await System.IO.File.ReadAllTextAsync(appSettingsPath);
        var doc = JsonDocument.Parse(json);

        using var ms = new MemoryStream();
        using var writer = new Utf8JsonWriter(ms, new JsonWriterOptions { Indented = true });

        WriteJsonWithInjection(doc.RootElement, writer, connectionStrings);
        writer.Flush();

        var updated = Encoding.UTF8.GetString(ms.ToArray());
        await System.IO.File.WriteAllTextAsync(appSettingsPath, updated);
    }

    private static void WriteJsonWithInjection(JsonElement element, Utf8JsonWriter writer,
        Dictionary<string, string> values, string prefix = "")
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            writer.WriteStartObject();

            foreach (var prop in element.EnumerateObject())
            {
                var key = string.IsNullOrEmpty(prefix) ? prop.Name : $"{prefix}:{prop.Name}";
                writer.WritePropertyName(prop.Name);

                if (values.TryGetValue(key, out var newValue) && prop.Value.ValueKind != JsonValueKind.Object)
                    writer.WriteStringValue(newValue);
                else
                    WriteJsonWithInjection(prop.Value, writer, values, key);
            }

            // Inject keys that don't exist yet
            foreach (var kv in values)
            {
                var parts = kv.Key.Split(':');
                if (parts.Length == 1 && string.IsNullOrEmpty(prefix))
                {
                    if (!element.TryGetProperty(parts[0], out _))
                    {
                        writer.WritePropertyName(parts[0]);
                        writer.WriteStringValue(kv.Value);
                    }
                }
                else if (parts.Length == 2 && parts[0] == prefix.Split(':').LastOrDefault())
                {
                    // handled by recursion
                }
                else if (parts.Length >= 2 && string.IsNullOrEmpty(prefix))
                {
                    var section = parts[0];
                    if (!element.TryGetProperty(section, out _))
                    {
                        // Create new section
                        var sectionKeys = values.Where(v => v.Key.StartsWith(section + ":")).ToList();
                        if (sectionKeys.Count > 0 && !values.Any(v => v.Key == section))
                        {
                            writer.WritePropertyName(section);
                            writer.WriteStartObject();
                            foreach (var sk in sectionKeys)
                            {
                                var subKey = sk.Key[(section.Length + 1)..];
                                if (!subKey.Contains(':'))
                                {
                                    writer.WritePropertyName(subKey);
                                    writer.WriteStringValue(sk.Value);
                                }
                            }
                            writer.WriteEndObject();
                            // Remove processed keys to avoid duplication
                            foreach (var sk in sectionKeys)
                                values.Remove(sk.Key);
                        }
                    }
                }
            }

            writer.WriteEndObject();
        }
        else
        {
            element.WriteTo(writer);
        }
    }

    // ===== DOCKER COMMANDS =====

    public async Task<DockerCommandResult> RunDockerCommandAsync(string workingDir, string arguments)
        => await RunProcessAsync("docker", arguments, workingDir);

    public async Task<DockerCommandResult> ComposeUpAsync(string workingDir, bool detached = true, string? file = null)
    {
        var args = ComposeFileArg(file) + "up" + (detached ? " -d" : "");
        return await RunProcessAsync("docker", $"compose {args}", workingDir);
    }

    public async Task<DockerCommandResult> ComposeDownAsync(string workingDir, bool removeVolumes = false, string? file = null)
    {
        var args = ComposeFileArg(file) + "down" + (removeVolumes ? " -v" : "");
        return await RunProcessAsync("docker", $"compose {args}", workingDir);
    }

    public async Task<DockerCommandResult> ComposePsAsync(string workingDir, string? file = null)
        => await RunProcessAsync("docker", $"compose {ComposeFileArg(file)}ps", workingDir);

    public async Task<DockerCommandResult> ComposeLogsAsync(string workingDir, string? serviceName = null, int tail = 100, string? file = null)
    {
        var svc = string.IsNullOrEmpty(serviceName) ? "" : $" {serviceName}";
        return await RunProcessAsync("docker", $"compose {ComposeFileArg(file)}logs --tail={tail}{svc}", workingDir);
    }

    public async Task<DockerCommandResult> ComposeBuildAsync(string workingDir, string? file = null)
        => await RunProcessAsync("docker", $"compose {ComposeFileArg(file)}build", workingDir);

    public async Task<DockerCommandResult> ComposeRestartAsync(string workingDir, string? serviceName = null, string? file = null)
    {
        var svc = string.IsNullOrEmpty(serviceName) ? "" : $" {serviceName}";
        return await RunProcessAsync("docker", $"compose {ComposeFileArg(file)}restart{svc}", workingDir);
    }

    public async Task<DockerCommandResult> ComposePullAsync(string workingDir, string? file = null)
        => await RunProcessAsync("docker", $"compose {ComposeFileArg(file)}pull", workingDir);

    private static string ComposeFileArg(string? file)
        => string.IsNullOrEmpty(file) ? "" : $"-f {file} ";

    private static async Task<DockerCommandResult> RunProcessAsync(string command, string arguments, string workingDir)
    {
        var result = new DockerCommandResult { Command = $"{command} {arguments}" };
        try
        {
            string fileName;
            string processArgs;

            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                fileName = "cmd.exe";
                processArgs = $"/c {command} {arguments}";
            }
            else
            {
                fileName = command;
                processArgs = arguments;
            }

            var psi = new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = processArgs,
                WorkingDirectory = workingDir,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(psi);
            if (process == null) { result.Error = "Failed to start process"; return result; }

            var output = await process.StandardOutput.ReadToEndAsync();
            var error = await process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync();

            result.Output = output.TrimEnd();
            result.Error = error.TrimEnd();
            result.Success = process.ExitCode == 0;
        }
        catch (Exception ex) { result.Error = $"Error: {ex.Message}"; }
        return result;
    }
}
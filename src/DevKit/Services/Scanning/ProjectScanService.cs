using System.Text;
using System.Text.Json.Serialization;

namespace DevKit.Services.Scanning;

public interface IProjectScanService
{
    ProjectScanResult ScanProject(string rootPath, ProjectScanOptions? options = null);
}

public sealed class ProjectScanOptions
{
    [JsonPropertyName("maxDepth")]
    public int MaxDepth { get; set; } = 10;

    [JsonPropertyName("includeFileContents")]
    public bool IncludeFileContents { get; set; } = true;

    [JsonPropertyName("includeHidden")]
    public bool IncludeHidden { get; set; } = false;

    [JsonPropertyName("maxFileSizeKb")]
    public int MaxFileSizeKb { get; set; } = 50;
}

public sealed class ProjectScanResult
{
    [JsonPropertyName("rootPath")]
    public string RootPath { get; set; } = string.Empty;

    [JsonPropertyName("framework")]
    public string Framework { get; set; } = "unknown";

    [JsonPropertyName("tree")]
    public string Tree { get; set; } = string.Empty;

    [JsonPropertyName("summary")]
    public ProjectSummary Summary { get; set; } = new();

    [JsonPropertyName("configFiles")]
    public List<ScannedFile> ConfigFiles { get; set; } = [];

    [JsonPropertyName("sourceFiles")]
    public List<ScannedFile> SourceFiles { get; set; } = [];
}

public sealed class ProjectSummary
{
    [JsonPropertyName("totalFiles")]
    public int TotalFiles { get; set; }

    [JsonPropertyName("totalFolders")]
    public int TotalFolders { get; set; }

    [JsonPropertyName("projects")]
    public List<ProjectInfo> Projects { get; set; } = [];

    [JsonPropertyName("namespaces")]
    public List<string> Namespaces { get; set; } = [];

    [JsonPropertyName("technologies")]
    public List<string> Technologies { get; set; } = [];
}

public sealed class ProjectInfo
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("path")]
    public string Path { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("framework")]
    public string Framework { get; set; } = string.Empty;

    [JsonPropertyName("dependencies")]
    public List<string> Dependencies { get; set; } = [];

    [JsonPropertyName("projectReferences")]
    public List<string> ProjectReferences { get; set; } = [];

    [JsonPropertyName("fileCount")]
    public int FileCount { get; set; }
}

public sealed class ScannedFile
{
    [JsonPropertyName("relativePath")]
    public string RelativePath { get; set; } = string.Empty;

    [JsonPropertyName("fileName")]
    public string FileName { get; set; } = string.Empty;

    [JsonPropertyName("extension")]
    public string Extension { get; set; } = string.Empty;

    [JsonPropertyName("sizeKb")]
    public double SizeKb { get; set; }

    [JsonPropertyName("content")]
    public string? Content { get; set; }
}

public sealed class ProjectScanService : IProjectScanService
{
    // Taranmayacak klasorler
    private static readonly HashSet<string> IgnoredDirs = new(StringComparer.OrdinalIgnoreCase)
    {
        "bin", "obj", "node_modules", ".git", ".vs", ".idea", ".vscode",
        "dist", "build", "out", "coverage", "packages", "__pycache__",
        ".next", ".nuxt", "wwwroot", "TestResults", ".terraform",
        "artifacts", "publish", "logs", "tmp", "temp"
    };

    // Config/proje dosyalari (icerigini oku)
    private static readonly HashSet<string> ConfigExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".csproj", ".sln", ".fsproj", ".vbproj",
        ".json", ".yaml", ".yml", ".toml",
        ".props", ".targets", ".editorconfig",
        ".dockerignore", ".gitignore"
    };

    private static readonly HashSet<string> ConfigFileNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "appsettings.json", "appsettings.Development.json", "appsettings.Production.json",
        "package.json", "tsconfig.json", "tailwind.config.js", "tailwind.config.ts",
        "vite.config.ts", "next.config.js", "next.config.ts", "next.config.mjs",
        "docker-compose.yml", "docker-compose.yaml", "Dockerfile",
        "Program.cs", "Startup.cs",
        ".env", ".env.example", ".env.local",
        "requirements.txt", "pyproject.toml", "setup.py", "setup.cfg",
        "global.json", "Directory.Build.props", "Directory.Packages.props",
        "nuget.config", ".npmrc", ".nvmrc"
    };

    // Kaynak kodu uzantilari (listede gorunur, icerik opsiyonel)
    private static readonly HashSet<string> SourceExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".cs", ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".java",
        ".css", ".scss", ".less", ".html", ".cshtml", ".razor",
        ".sql", ".graphql", ".proto"
    };

    public ProjectScanResult ScanProject(string rootPath, ProjectScanOptions? options = null)
    {
        options ??= new ProjectScanOptions();
        var result = new ProjectScanResult { RootPath = rootPath };

        if (!Directory.Exists(rootPath))
            throw new DirectoryNotFoundException($"Directory not found: {rootPath}");

        // 1. Framework tespit et
        result.Framework = DetectFramework(rootPath);

        // 2. Dizin agaci olustur
        var treeBuilder = new StringBuilder();
        var totalFiles = 0;
        var totalFolders = 0;
        BuildTree(rootPath, rootPath, treeBuilder, ref totalFiles, ref totalFolders, 0, options.MaxDepth, options.IncludeHidden);
        result.Tree = treeBuilder.ToString();
        result.Summary.TotalFiles = totalFiles;
        result.Summary.TotalFolders = totalFolders;

        // 3. Config dosyalarini tara
        ScanConfigFiles(rootPath, rootPath, result.ConfigFiles, options);

        // 4. Kaynak dosyalarini tara (icerik opsiyonel)
        ScanSourceFiles(rootPath, rootPath, result.SourceFiles, options);

        // 5. Proje bilgilerini cikar
        ExtractProjectInfo(rootPath, result.Summary);

        // 6. Namespace'leri cikar
        ExtractNamespaces(result.SourceFiles, result.Summary);

        // 7. Teknolojileri tespit et
        DetectTechnologies(rootPath, result.ConfigFiles, result.Summary);

        return result;
    }

    private static string DetectFramework(string rootPath)
    {
        if (Directory.GetFiles(rootPath, "*.sln", SearchOption.TopDirectoryOnly).Length > 0 ||
            Directory.GetFiles(rootPath, "*.csproj", SearchOption.AllDirectories).Length > 0)
            return "dotnet";

        var packageJson = Path.Combine(rootPath, "package.json");
        if (File.Exists(packageJson))
        {
            var content = File.ReadAllText(packageJson);
            if (content.Contains("\"next\"")) return "nextjs";
            if (content.Contains("\"express\"") || content.Contains("\"fastify\"") || content.Contains("\"koa\"")) return "nodejs";
            return "nodejs";
        }

        if (File.Exists(Path.Combine(rootPath, "requirements.txt")) ||
            File.Exists(Path.Combine(rootPath, "pyproject.toml")) ||
            File.Exists(Path.Combine(rootPath, "setup.py")))
            return "python";

        if (File.Exists(Path.Combine(rootPath, "go.mod")))
            return "go";

        return "unknown";
    }

    private static void BuildTree(string rootPath, string currentPath, StringBuilder sb,
        ref int totalFiles, ref int totalFolders, int depth, int maxDepth, bool includeHidden)
    {
        if (depth > maxDepth) return;

        var indent = new string(' ', depth * 2);
        var dirName = depth == 0 ? Path.GetFileName(currentPath) + "/" : "";

        if (depth == 0)
            sb.AppendLine(dirName);

        try
        {
            // Klasorleri sirala ve listele
            var dirs = Directory.GetDirectories(currentPath)
                .Select(d => new DirectoryInfo(d))
                .Where(d => !IgnoredDirs.Contains(d.Name))
                .Where(d => includeHidden || !d.Name.StartsWith('.'))
                .OrderBy(d => d.Name)
                .ToList();

            foreach (var dir in dirs)
            {
                totalFolders++;
                var subIndent = new string(' ', (depth + 1) * 2);
                sb.AppendLine($"{subIndent}{dir.Name}/");
                BuildTree(rootPath, dir.FullName, sb, ref totalFiles, ref totalFolders, depth + 1, maxDepth, includeHidden);
            }

            // Dosyalari listele
            var files = Directory.GetFiles(currentPath)
                .Select(f => new FileInfo(f))
                .Where(f => includeHidden || !f.Name.StartsWith('.'))
                .OrderBy(f => f.Name)
                .ToList();

            foreach (var file in files)
            {
                totalFiles++;
                var subIndent = new string(' ', (depth + 1) * 2);
                var sizeStr = file.Length > 1024 * 1024
                    ? $"({file.Length / 1024.0 / 1024.0:F1}MB)"
                    : file.Length > 1024
                        ? $"({file.Length / 1024.0:F0}KB)"
                        : $"({file.Length}B)";
                sb.AppendLine($"{subIndent}{file.Name} {sizeStr}");
            }
        }
        catch (UnauthorizedAccessException) { }
    }

    private static void ScanConfigFiles(string rootPath, string currentPath, List<ScannedFile> files, ProjectScanOptions options)
    {
        try
        {
            foreach (var filePath in Directory.GetFiles(currentPath))
            {
                var fileName = Path.GetFileName(filePath);
                var ext = Path.GetExtension(filePath);
                var relativePath = Path.GetRelativePath(rootPath, filePath).Replace('\\', '/');

                var isConfig = ConfigFileNames.Contains(fileName) ||
                               ConfigExtensions.Contains(ext) && !SourceExtensions.Contains(ext);

                // Ozel durumlar: buyuk json'lari atla (package-lock, yarn.lock vb)
                if (fileName.Contains("lock", StringComparison.OrdinalIgnoreCase)) continue;
                if (fileName.Equals("package-lock.json", StringComparison.OrdinalIgnoreCase)) continue;

                if (!isConfig) continue;

                var fileInfo = new FileInfo(filePath);
                var sizeKb = fileInfo.Length / 1024.0;

                var scanned = new ScannedFile
                {
                    RelativePath = relativePath,
                    FileName = fileName,
                    Extension = ext,
                    SizeKb = Math.Round(sizeKb, 1)
                };

                if (options.IncludeFileContents && sizeKb <= options.MaxFileSizeKb)
                {
                    try { scanned.Content = File.ReadAllText(filePath); }
                    catch { /* skip unreadable */ }
                }

                files.Add(scanned);
            }

            // Alt klasorleri tara
            foreach (var dir in Directory.GetDirectories(currentPath))
            {
                var dirName = Path.GetFileName(dir);
                if (IgnoredDirs.Contains(dirName) || dirName.StartsWith('.')) continue;
                ScanConfigFiles(rootPath, dir, files, options);
            }
        }
        catch (UnauthorizedAccessException) { }
    }

    private static void ScanSourceFiles(string rootPath, string currentPath, List<ScannedFile> files, ProjectScanOptions options)
    {
        try
        {
            foreach (var filePath in Directory.GetFiles(currentPath))
            {
                var ext = Path.GetExtension(filePath);
                if (!SourceExtensions.Contains(ext)) continue;

                var fileName = Path.GetFileName(filePath);
                var relativePath = Path.GetRelativePath(rootPath, filePath).Replace('\\', '/');
                var fileInfo = new FileInfo(filePath);
                var sizeKb = fileInfo.Length / 1024.0;

                var scanned = new ScannedFile
                {
                    RelativePath = relativePath,
                    FileName = fileName,
                    Extension = ext,
                    SizeKb = Math.Round(sizeKb, 1)
                };

                // Kaynak dosyalarin icerigini okuma (cok buyuk olabilir)
                // Sadece kucuk dosyalarin baslik kismini al (namespace, class adi)
                if (options.IncludeFileContents && sizeKb <= 10 && ext == ".cs")
                {
                    try
                    {
                        var lines = File.ReadLines(filePath).Take(20).ToList();
                        scanned.Content = string.Join("\n", lines);
                    }
                    catch { /* skip */ }
                }

                files.Add(scanned);
            }

            foreach (var dir in Directory.GetDirectories(currentPath))
            {
                var dirName = Path.GetFileName(dir);
                if (IgnoredDirs.Contains(dirName) || dirName.StartsWith('.')) continue;
                ScanSourceFiles(rootPath, dir, files, options);
            }
        }
        catch (UnauthorizedAccessException) { }
    }

    private static void ExtractProjectInfo(string rootPath, ProjectSummary summary)
    {
        // .NET projeleri
        var csprojFiles = Directory.GetFiles(rootPath, "*.csproj", SearchOption.AllDirectories)
            .Where(f => !IgnoredDirs.Any(d => f.Contains(Path.DirectorySeparatorChar + d + Path.DirectorySeparatorChar)))
            .ToList();

        foreach (var csproj in csprojFiles)
        {
            var content = File.ReadAllText(csproj);
            var projName = Path.GetFileNameWithoutExtension(csproj);
            var projPath = Path.GetRelativePath(rootPath, Path.GetDirectoryName(csproj)!).Replace('\\', '/');
            var projDir = Path.GetDirectoryName(csproj)!;

            var info = new ProjectInfo
            {
                Name = projName,
                Path = projPath,
                FileCount = Directory.GetFiles(projDir, "*.*", SearchOption.AllDirectories)
                    .Count(f => SourceExtensions.Contains(Path.GetExtension(f)))
            };

            // Type tespit
            if (content.Contains("Microsoft.NET.Sdk.Web")) info.Type = "webapi";
            else if (content.Contains("Microsoft.NET.Sdk.Worker")) info.Type = "worker";
            else if (content.Contains("Exe")) info.Type = "console";
            else if (content.Contains("Microsoft.NET.Test.Sdk") || content.Contains("xunit") || content.Contains("nunit")) info.Type = "test";
            else info.Type = "classlib";

            // Framework
            var tfmMatch = System.Text.RegularExpressions.Regex.Match(content, @"<TargetFramework>(.*?)</TargetFramework>");
            if (tfmMatch.Success) info.Framework = tfmMatch.Groups[1].Value;

            // Dependencies (PackageReference)
            var pkgMatches = System.Text.RegularExpressions.Regex.Matches(content, @"<PackageReference\s+Include=""(.*?)""");
            foreach (System.Text.RegularExpressions.Match m in pkgMatches)
                info.Dependencies.Add(m.Groups[1].Value);

            // Project references
            var refMatches = System.Text.RegularExpressions.Regex.Matches(content, @"<ProjectReference\s+Include="".*?([^\\\/]+)\.csproj""");
            foreach (System.Text.RegularExpressions.Match m in refMatches)
                info.ProjectReferences.Add(m.Groups[1].Value);

            summary.Projects.Add(info);
        }

        // package.json projeleri (root ve alt)
        var packageJsonFiles = Directory.GetFiles(rootPath, "package.json", SearchOption.AllDirectories)
            .Where(f => !f.Contains("node_modules"))
            .Where(f => !IgnoredDirs.Any(d => f.Contains(Path.DirectorySeparatorChar + d + Path.DirectorySeparatorChar)))
            .ToList();

        foreach (var pkgJson in packageJsonFiles)
        {
            try
            {
                var content = File.ReadAllText(pkgJson);
                var projPath = Path.GetRelativePath(rootPath, Path.GetDirectoryName(pkgJson)!).Replace('\\', '/');
                if (projPath == ".") projPath = "";

                var nameMatch = System.Text.RegularExpressions.Regex.Match(content, @"""name""\s*:\s*""(.*?)""");
                var name = nameMatch.Success ? nameMatch.Groups[1].Value : Path.GetFileName(Path.GetDirectoryName(pkgJson)!);

                var info = new ProjectInfo
                {
                    Name = name,
                    Path = projPath,
                    Type = content.Contains("\"next\"") ? "nextjs" : "nodejs"
                };

                var depMatches = System.Text.RegularExpressions.Regex.Matches(content, @"""(\@?[a-zA-Z][a-zA-Z0-9\-\.\/]*)""\s*:\s*""\^?~?[0-9]");
                foreach (System.Text.RegularExpressions.Match m in depMatches)
                    info.Dependencies.Add(m.Groups[1].Value);

                summary.Projects.Add(info);
            }
            catch { /* skip */ }
        }
    }

    private static void ExtractNamespaces(List<ScannedFile> sourceFiles, ProjectSummary summary)
    {
        var namespaces = new HashSet<string>();

        foreach (var file in sourceFiles.Where(f => f.Extension == ".cs" && f.Content != null))
        {
            var match = System.Text.RegularExpressions.Regex.Match(file.Content!, @"namespace\s+([\w\.]+)");
            if (match.Success)
                namespaces.Add(match.Groups[1].Value);
        }

        summary.Namespaces = namespaces.OrderBy(n => n).ToList();
    }

    private static void DetectTechnologies(string rootPath, List<ScannedFile> configFiles, ProjectSummary summary)
    {
        var techs = new HashSet<string>();

        // Dosya varligina gore
        if (File.Exists(Path.Combine(rootPath, "docker-compose.yml")) || File.Exists(Path.Combine(rootPath, "docker-compose.yaml")))
            techs.Add("Docker Compose");
        if (Directory.GetFiles(rootPath, "Dockerfile", SearchOption.AllDirectories).Any())
            techs.Add("Docker");

        // Config iceriklerine gore
        foreach (var cfg in configFiles.Where(f => f.Content != null))
        {
            var c = cfg.Content!;
            if (c.Contains("Serilog", StringComparison.OrdinalIgnoreCase)) techs.Add("Serilog");
            if (c.Contains("MediatR", StringComparison.OrdinalIgnoreCase)) techs.Add("MediatR");
            if (c.Contains("FluentValidation", StringComparison.OrdinalIgnoreCase)) techs.Add("FluentValidation");
            if (c.Contains("EntityFrameworkCore", StringComparison.OrdinalIgnoreCase) || c.Contains("Npgsql", StringComparison.OrdinalIgnoreCase)) techs.Add("Entity Framework Core");
            if (c.Contains("Npgsql", StringComparison.OrdinalIgnoreCase)) techs.Add("PostgreSQL");
            if (c.Contains("SqlServer", StringComparison.OrdinalIgnoreCase) || c.Contains("SqlClient", StringComparison.OrdinalIgnoreCase)) techs.Add("SQL Server");
            if (c.Contains("Redis", StringComparison.OrdinalIgnoreCase) || c.Contains("StackExchange.Redis", StringComparison.OrdinalIgnoreCase)) techs.Add("Redis");
            if (c.Contains("Kafka", StringComparison.OrdinalIgnoreCase) || c.Contains("Confluent", StringComparison.OrdinalIgnoreCase)) techs.Add("Kafka");
            if (c.Contains("RabbitMQ", StringComparison.OrdinalIgnoreCase) || c.Contains("MassTransit", StringComparison.OrdinalIgnoreCase)) techs.Add("RabbitMQ");
            if (c.Contains("OpenTelemetry", StringComparison.OrdinalIgnoreCase)) techs.Add("OpenTelemetry");
            if (c.Contains("Elasticsearch", StringComparison.OrdinalIgnoreCase)) techs.Add("Elasticsearch");
            if (c.Contains("SignalR", StringComparison.OrdinalIgnoreCase)) techs.Add("SignalR");
            if (c.Contains("gRPC", StringComparison.OrdinalIgnoreCase) || c.Contains("Grpc", StringComparison.OrdinalIgnoreCase)) techs.Add("gRPC");
            if (c.Contains("Swagger", StringComparison.OrdinalIgnoreCase) || c.Contains("Swashbuckle", StringComparison.OrdinalIgnoreCase)) techs.Add("Swagger/OpenAPI");
            if (c.Contains("tailwindcss", StringComparison.OrdinalIgnoreCase) || c.Contains("tailwind", StringComparison.OrdinalIgnoreCase)) techs.Add("Tailwind CSS");
            if (c.Contains("\"react\"", StringComparison.OrdinalIgnoreCase)) techs.Add("React");
            if (c.Contains("\"next\"", StringComparison.OrdinalIgnoreCase)) techs.Add("Next.js");
            if (c.Contains("\"express\"", StringComparison.OrdinalIgnoreCase)) techs.Add("Express.js");
            if (c.Contains("fastapi", StringComparison.OrdinalIgnoreCase)) techs.Add("FastAPI");
            if (c.Contains("django", StringComparison.OrdinalIgnoreCase)) techs.Add("Django");
            if (c.Contains("flask", StringComparison.OrdinalIgnoreCase)) techs.Add("Flask");
        }

        summary.Technologies = techs.OrderBy(t => t).ToList();
    }
}
using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace DevKit.Controllers;

[ApiController]
[Route("api/codegen")]
public class CodeGenController : ControllerBase
{
    // ═══ ADD PROJECT TO SOLUTION ═══
    [HttpPost("add-project")]
    public async Task<IActionResult> AddProject([FromBody] AddProjectRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.SolutionPath) || string.IsNullOrWhiteSpace(request.ProjectName))
            return Ok(new { success = false, error = "SolutionPath ve ProjectName gerekli." });

        var solutionDir = request.SolutionPath;
        if (request.SolutionPath.EndsWith(".sln"))
            solutionDir = Path.GetDirectoryName(request.SolutionPath)!;

        if (!Directory.Exists(solutionDir))
            return Ok(new { success = false, error = $"Dizin bulunamadi: {solutionDir}" });

        // sln dosyasini bul
        var slnFile = request.SolutionPath.EndsWith(".sln")
            ? request.SolutionPath
            : Directory.GetFiles(solutionDir, "*.sln", SearchOption.TopDirectoryOnly).FirstOrDefault();

        if (slnFile == null)
            return Ok(new { success = false, error = "Solution dosyasi bulunamadi." });

        var projectType = request.ProjectType?.ToLowerInvariant() ?? "classlib";
        var framework = request.Framework ?? "net9.0";
        var subDir = request.SubDirectory ?? "src";
        var projectDir = Path.Combine(solutionDir, subDir, request.ProjectName);

        var results = new List<string>();

        try
        {
            // 1. Proje olustur
            var dotnetTemplate = projectType switch
            {
                "webapi" => "webapi",
                "classlib" => "classlib",
                "worker" => "worker",
                "console" => "console",
                "test" or "xunit" => "xunit",
                "nunit" => "nunit",
                "grpc" => "grpc",
                "blazor" => "blazorserver",
                _ => "classlib",
            };

            var createResult = await RunCommand($"dotnet new {dotnetTemplate} -o \"{projectDir}\" --framework {framework}", solutionDir, ct);
            results.Add(createResult.success ? $"Proje olusturuldu: {request.ProjectName}" : $"Proje olusturulamadi: {createResult.error}");

            if (!createResult.success)
                return Ok(new { success = false, results, error = createResult.error });

            // 2. Solution'a ekle
            var addResult = await RunCommand($"dotnet sln \"{slnFile}\" add \"{projectDir}\"", solutionDir, ct);
            results.Add(addResult.success ? "Solution'a eklendi" : $"sln add hatasi: {addResult.error}");

            // 3. Referanslar ekle
            if (request.References != null)
            {
                foreach (var refName in request.References)
                {
                    var refPath = Path.Combine(solutionDir, subDir, refName);
                    if (Directory.Exists(refPath))
                    {
                        var refResult = await RunCommand($"dotnet add \"{projectDir}\" reference \"{refPath}\"", solutionDir, ct);
                        results.Add(refResult.success ? $"Referans: {refName} eklendi" : $"Referans hatasi: {refResult.error}");
                    }
                    else
                    {
                        results.Add($"Referans dizini bulunamadi: {refName}");
                    }
                }
            }

            // 4. NuGet paketleri ekle
            if (request.Packages != null)
            {
                foreach (var pkg in request.Packages)
                {
                    var pkgResult = await RunCommand($"dotnet add \"{projectDir}\" package {pkg}", solutionDir, ct);
                    results.Add(pkgResult.success ? $"Paket: {pkg} eklendi" : $"Paket hatasi: {pkgResult.error}");
                }
            }

            // 5. Klasor yapisi olustur
            if (request.Folders != null)
            {
                foreach (var folder in request.Folders)
                {
                    var folderPath = Path.Combine(projectDir, folder);
                    Directory.CreateDirectory(folderPath);
                    results.Add($"Klasor: {folder}");
                }
            }

            return Ok(new { success = true, projectName = request.ProjectName, projectPath = projectDir, projectType, results });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message, results });
        }
    }

    // ═══ ADD NEXTJS/NODE PROJECT ═══
    [HttpPost("add-frontend")]
    public async Task<IActionResult> AddFrontend([FromBody] AddFrontendRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.ParentPath) || string.IsNullOrWhiteSpace(request.ProjectName))
            return Ok(new { success = false, error = "ParentPath ve ProjectName gerekli." });

        var projectDir = Path.Combine(request.ParentPath, request.ProjectName);
        var results = new List<string>();

        try
        {
            var type = request.ProjectType?.ToLowerInvariant() ?? "nextjs";

            if (type == "nextjs")
            {
                var cmd = $"npx create-next-app@latest \"{projectDir}\" --typescript --tailwind --eslint --app --src-dir --import-alias \"@/*\" --use-npm";
                var result = await RunCommand(cmd, request.ParentPath, ct, 120);
                results.Add(result.success ? "Next.js projesi olusturuldu" : $"Hata: {result.error}");
            }
            else if (type == "react" || type == "vite")
            {
                var result = await RunCommand($"npm create vite@latest \"{request.ProjectName}\" -- --template react-ts", request.ParentPath, ct, 60);
                results.Add(result.success ? "React/Vite projesi olusturuldu" : $"Hata: {result.error}");

                if (result.success)
                {
                    var installResult = await RunCommand("npm install", projectDir, ct, 120);
                    results.Add(installResult.success ? "npm install tamamlandi" : "npm install hatasi");
                }
            }
            else if (type == "nodejs" || type == "express")
            {
                Directory.CreateDirectory(projectDir);
                var initResult = await RunCommand("npm init -y", projectDir, ct);
                results.Add(initResult.success ? "package.json olusturuldu" : "npm init hatasi");

                if (request.Packages != null)
                {
                    var pkgList = string.Join(" ", request.Packages);
                    var pkgResult = await RunCommand($"npm install {pkgList}", projectDir, ct, 120);
                    results.Add(pkgResult.success ? $"Paketler yuklendi: {pkgList}" : "Paket yukleme hatasi");
                }

                var devPkgs = "typescript @types/node ts-node nodemon";
                var devResult = await RunCommand($"npm install -D {devPkgs}", projectDir, ct, 60);
                results.Add(devResult.success ? "Dev dependencies yuklendi" : "Dev dep hatasi");

                // tsconfig olustur
                Directory.CreateDirectory(Path.Combine(projectDir, "src"));
                await System.IO.File.WriteAllTextAsync(Path.Combine(projectDir, "tsconfig.json"), """
                {
                  "compilerOptions": {
                    "target": "ES2022", "module": "commonjs", "lib": ["ES2022"],
                    "outDir": "./dist", "rootDir": "./src",
                    "strict": true, "esModuleInterop": true, "skipLibCheck": true,
                    "forceConsistentCasingInFileNames": true, "resolveJsonModule": true
                  },
                  "include": ["src/**/*"]
                }
                """, ct);
                results.Add("tsconfig.json olusturuldu");
            }

            return Ok(new { success = true, projectName = request.ProjectName, projectPath = projectDir, projectType = type, results });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message, results });
        }
    }

    // ═══ GENERATE BOILERPLATE ═══
    [HttpPost("generate")]
    public IActionResult Generate([FromBody] CodeGenRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Template) || string.IsNullOrWhiteSpace(request.Name))
            return Ok(new { success = false, error = "Template ve Name gerekli." });

        var ns = request.Namespace ?? "MyApp";
        var name = request.Name;
        var files = new List<object>();

        switch (request.Template.ToLowerInvariant())
        {
            case "entity":
                files.Add(new { path = $"Domain/Entities/{name}.cs", content = GenerateEntity(ns, name, request.Properties) });
                break;
            case "repository":
                files.Add(new { path = $"Domain/Interfaces/I{name}Repository.cs", content = GenerateRepositoryInterface(ns, name) });
                files.Add(new { path = $"Infrastructure/Repositories/{name}Repository.cs", content = GenerateRepository(ns, name) });
                break;
            case "service":
                files.Add(new { path = $"Application/Interfaces/I{name}Service.cs", content = GenerateServiceInterface(ns, name) });
                files.Add(new { path = $"Application/Services/{name}Service.cs", content = GenerateService(ns, name) });
                break;
            case "controller":
                files.Add(new { path = $"Api/Controllers/{name}Controller.cs", content = GenerateController(ns, name) });
                break;
            case "dto":
                files.Add(new { path = $"Application/DTOs/{name}Dto.cs", content = GenerateDto(ns, name, request.Properties) });
                files.Add(new { path = $"Application/DTOs/Create{name}Request.cs", content = GenerateCreateRequest(ns, name, request.Properties) });
                files.Add(new { path = $"Application/DTOs/Update{name}Request.cs", content = GenerateUpdateRequest(ns, name, request.Properties) });
                break;
            case "full":
                files.Add(new { path = $"Domain/Entities/{name}.cs", content = GenerateEntity(ns, name, request.Properties) });
                files.Add(new { path = $"Domain/Interfaces/I{name}Repository.cs", content = GenerateRepositoryInterface(ns, name) });
                files.Add(new { path = $"Infrastructure/Repositories/{name}Repository.cs", content = GenerateRepository(ns, name) });
                files.Add(new { path = $"Application/Interfaces/I{name}Service.cs", content = GenerateServiceInterface(ns, name) });
                files.Add(new { path = $"Application/Services/{name}Service.cs", content = GenerateService(ns, name) });
                files.Add(new { path = $"Application/DTOs/{name}Dto.cs", content = GenerateDto(ns, name, request.Properties) });
                files.Add(new { path = $"Application/DTOs/Create{name}Request.cs", content = GenerateCreateRequest(ns, name, request.Properties) });
                files.Add(new { path = $"Api/Controllers/{name}Controller.cs", content = GenerateController(ns, name) });
                break;
            default:
                return Ok(new { success = false, error = $"Bilinmeyen template: {request.Template}. Gecerli: entity, repository, service, controller, dto, full" });
        }

        return Ok(new { success = true, template = request.Template, fileCount = files.Count, files });
    }

    // ═══ FORMAT CODE ═══
    [HttpPost("format")]
    public async Task<IActionResult> Format([FromBody] FormatRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.ProjectPath))
            return Ok(new { success = false, error = "ProjectPath gerekli." });

        var framework = request.Framework?.ToLowerInvariant() ?? "dotnet";
        string command;

        if (framework == "dotnet")
            command = "dotnet format";
        else
            command = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "cmd.exe /c npx prettier --write \"src/**/*.{ts,tsx,js,jsx}\"" : "sh -c 'npx prettier --write \"src/**/*.{ts,tsx,js,jsx}\"'";

        var result = await RunCommand(command, request.ProjectPath, ct, 60);
        return Ok(new { success = result.success, framework, output = result.stdout, error = result.error });
    }

    // ═══ EF CORE MIGRATIONS ═══
    [HttpPost("ef-migration")]
    public async Task<IActionResult> EfMigration([FromBody] EfMigrationRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.SolutionPath))
            return Ok(new { success = false, error = "SolutionPath gerekli." });

        var action = request.Action?.ToLowerInvariant() ?? "add";
        var infraProject = request.InfrastructureProject ?? "src/Infrastructure";
        var startupProject = request.StartupProject ?? "src/Api";
        string cmd;

        switch (action)
        {
            case "add":
                if (string.IsNullOrWhiteSpace(request.MigrationName))
                    return Ok(new { success = false, error = "MigrationName gerekli." });
                cmd = $"dotnet ef migrations add {request.MigrationName} -p {infraProject} -s {startupProject}";
                break;
            case "update":
                cmd = $"dotnet ef database update -p {infraProject} -s {startupProject}";
                break;
            case "remove":
                cmd = $"dotnet ef migrations remove -p {infraProject} -s {startupProject}";
                break;
            case "list":
                cmd = $"dotnet ef migrations list -p {infraProject} -s {startupProject}";
                break;
            case "script":
                cmd = $"dotnet ef migrations script -p {infraProject} -s {startupProject} --idempotent";
                break;
            default:
                return Ok(new { success = false, error = $"Gecersiz action: {action}. Gecerli: add, update, remove, list, script" });
        }

        var result = await RunCommand(cmd, request.SolutionPath, ct, 120);
        return Ok(new { success = result.success, action, output = result.stdout, error = result.error });
    }

    // ═══ HELPERS ═══

    private static async Task<(bool success, string stdout, string error)> RunCommand(string command, string workDir, CancellationToken ct, int timeoutSec = 60)
    {
        string shell, args;
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        { shell = "cmd.exe"; args = $"/c {command}"; }
        else
        { shell = "sh"; args = $"-c \"{command.Replace("\"", "\\\"")}\""; }

        var psi = new ProcessStartInfo
        {
            FileName = shell,
            Arguments = args,
            WorkingDirectory = workDir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        using var process = new Process { StartInfo = psi };
        process.Start();
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(timeoutSec * 1000);

        try
        {
            var stdout = await process.StandardOutput.ReadToEndAsync(cts.Token);
            var stderr = await process.StandardError.ReadToEndAsync(cts.Token);
            await process.WaitForExitAsync(cts.Token);
            return (process.ExitCode == 0, stdout.Length > 5000 ? stdout[^5000..] : stdout, stderr.Length > 3000 ? stderr[^3000..] : stderr);
        }
        catch (OperationCanceledException)
        {
            try { process.Kill(true); } catch { }
            return (false, "", "Timeout");
        }
    }

    // ═══ CODE TEMPLATES ═══

    private static string GenerateEntity(string ns, string name, Dictionary<string, string>? props) =>
$@"namespace {ns}.Domain.Entities;

public class {name} : BaseEntity
{{
    {string.Join("\n    ", (props ?? new()).Select(p => $"public {p.Value} {p.Key} {{ get; set; }}"))}
}}";

    private static string GenerateRepositoryInterface(string ns, string name) =>
$@"using {ns}.Domain.Entities;

namespace {ns}.Domain.Interfaces;

public interface I{name}Repository
{{
    Task<{name}?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<IReadOnlyList<{name}>> GetAllAsync(CancellationToken ct = default);
    Task<{name}> AddAsync({name} entity, CancellationToken ct = default);
    Task UpdateAsync({name} entity, CancellationToken ct = default);
    Task DeleteAsync(Guid id, CancellationToken ct = default);
}}";

    private static string GenerateRepository(string ns, string name) =>
$@"using {ns}.Domain.Entities;
using {ns}.Domain.Interfaces;

namespace {ns}.Infrastructure.Repositories;

public class {name}Repository : I{name}Repository
{{
    public async Task<{name}?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {{
        throw new NotImplementedException();
    }}

    public async Task<IReadOnlyList<{name}>> GetAllAsync(CancellationToken ct = default)
    {{
        throw new NotImplementedException();
    }}

    public async Task<{name}> AddAsync({name} entity, CancellationToken ct = default)
    {{
        throw new NotImplementedException();
    }}

    public async Task UpdateAsync({name} entity, CancellationToken ct = default)
    {{
        throw new NotImplementedException();
    }}

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {{
        throw new NotImplementedException();
    }}
}}";

    private static string GenerateServiceInterface(string ns, string name) =>
$@"using {ns}.Application.DTOs;

namespace {ns}.Application.Interfaces;

public interface I{name}Service
{{
    Task<{name}Dto?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<IReadOnlyList<{name}Dto>> GetAllAsync(CancellationToken ct = default);
    Task<{name}Dto> CreateAsync(Create{name}Request request, CancellationToken ct = default);
    Task UpdateAsync(Guid id, Update{name}Request request, CancellationToken ct = default);
    Task DeleteAsync(Guid id, CancellationToken ct = default);
}}";

    private static string GenerateService(string ns, string name) =>
$@"using {ns}.Application.DTOs;
using {ns}.Application.Interfaces;
using {ns}.Domain.Interfaces;

namespace {ns}.Application.Services;

public class {name}Service : I{name}Service
{{
    private readonly I{name}Repository _repository;

    public {name}Service(I{name}Repository repository)
    {{
        _repository = repository;
    }}

    public async Task<{name}Dto?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {{
        var entity = await _repository.GetByIdAsync(id, ct);
        return entity == null ? null : MapToDto(entity);
    }}

    public async Task<IReadOnlyList<{name}Dto>> GetAllAsync(CancellationToken ct = default)
    {{
        var entities = await _repository.GetAllAsync(ct);
        return entities.Select(MapToDto).ToList();
    }}

    public async Task<{name}Dto> CreateAsync(Create{name}Request request, CancellationToken ct = default)
    {{
        throw new NotImplementedException();
    }}

    public async Task UpdateAsync(Guid id, Update{name}Request request, CancellationToken ct = default)
    {{
        throw new NotImplementedException();
    }}

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {{
        await _repository.DeleteAsync(id, ct);
    }}

    private static {name}Dto MapToDto(Domain.Entities.{name} entity) => throw new NotImplementedException();
}}";

    private static string GenerateController(string ns, string name) =>
$@"using {ns}.Application.DTOs;
using {ns}.Application.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace {ns}.Api.Controllers;

[ApiController]
[Route(""api/[controller]"")]
public class {name}Controller : ControllerBase
{{
    private readonly I{name}Service _service;

    public {name}Controller(I{name}Service service)
    {{
        _service = service;
    }}

    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {{
        var result = await _service.GetAllAsync(ct);
        return Ok(result);
    }}

    [HttpGet(""{{id:guid}}"")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {{
        var result = await _service.GetByIdAsync(id, ct);
        return result == null ? NotFound() : Ok(result);
    }}

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Create{name}Request request, CancellationToken ct)
    {{
        var result = await _service.CreateAsync(request, ct);
        return CreatedAtAction(nameof(GetById), new {{ id = result.Id }}, result);
    }}

    [HttpPut(""{{id:guid}}"")]
    public async Task<IActionResult> Update(Guid id, [FromBody] Update{name}Request request, CancellationToken ct)
    {{
        await _service.UpdateAsync(id, request, ct);
        return NoContent();
    }}

    [HttpDelete(""{{id:guid}}"")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {{
        await _service.DeleteAsync(id, ct);
        return NoContent();
    }}
}}";

    private static string GenerateDto(string ns, string name, Dictionary<string, string>? props) =>
$@"namespace {ns}.Application.DTOs;

public record {name}Dto
{{
    public Guid Id {{ get; init; }}
    {string.Join("\n    ", (props ?? new()).Select(p => $"public {p.Value} {p.Key} {{ get; init; }}"))}
    public DateTime CreatedAt {{ get; init; }}
    public DateTime UpdatedAt {{ get; init; }}
}}";

    private static string GenerateCreateRequest(string ns, string name, Dictionary<string, string>? props) =>
$@"namespace {ns}.Application.DTOs;

public record Create{name}Request
{{
    {string.Join("\n    ", (props ?? new()).Select(p => $"public required {p.Value} {p.Key} {{ get; init; }}"))}
}}";

    private static string GenerateUpdateRequest(string ns, string name, Dictionary<string, string>? props) =>
$@"namespace {ns}.Application.DTOs;

public record Update{name}Request
{{
    {string.Join("\n    ", (props ?? new()).Select(p => $"public {p.Value}? {p.Key} {{ get; init; }}"))}
}}";
}

// ═══ REQUEST MODELS ═══

public sealed class AddProjectRequest
{
    public string SolutionPath { get; set; } = string.Empty;
    public string ProjectName { get; set; } = string.Empty;
    public string? ProjectType { get; set; }
    public string? Framework { get; set; }
    public string? SubDirectory { get; set; }
    public List<string>? References { get; set; }
    public List<string>? Packages { get; set; }
    public List<string>? Folders { get; set; }
}

public sealed class AddFrontendRequest
{
    public string ParentPath { get; set; } = string.Empty;
    public string ProjectName { get; set; } = string.Empty;
    public string? ProjectType { get; set; }
    public List<string>? Packages { get; set; }
}

public sealed class CodeGenRequest
{
    public string Template { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Namespace { get; set; }
    public Dictionary<string, string>? Properties { get; set; }
}

public sealed class FormatRequest
{
    public string ProjectPath { get; set; } = string.Empty;
    public string? Framework { get; set; }
}

public sealed class EfMigrationRequest
{
    public string SolutionPath { get; set; } = string.Empty;
    public string? Action { get; set; }
    public string? MigrationName { get; set; }
    public string? InfrastructureProject { get; set; }
    public string? StartupProject { get; set; }
}
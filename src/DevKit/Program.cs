using DevKit.Configuration;
using DevKit.Services.ApiTest;
using DevKit.Services.Architecture;
using DevKit.Services.Azure;
using DevKit.Services.Crypto;
using DevKit.Services.Docker;
using DevKit.Services.EnvCompare;
using DevKit.Services.FileImport;
using DevKit.Services.Git;
using DevKit.Services.LogViewer;
using DevKit.Services.Migration;
using DevKit.Services.PackageAudit;
using DevKit.Services.ProjectManagement;
using DevKit.Services.Scaffolding;
using DevKit.Services.Scanning;
using DevKit.Services.Schema;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.UseUrls("http://localhost:5199");

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

builder.Services.AddSingleton<ProfileManager>();
builder.Services.AddSingleton<IScaffoldingService, ScaffoldingService>();
builder.Services.AddSingleton<IFileImportService, FileImportService>();
builder.Services.AddSingleton<IAzureService, AzureService>();
builder.Services.AddSingleton<IGitService, GitService>();
builder.Services.AddSingleton<ICryptoService, CryptoService>();
builder.Services.AddSingleton<IDockerService, DockerService>();
builder.Services.AddSingleton<IProjectScanService, ProjectScanService>();
builder.Services.AddSingleton<IDatabaseSchemaService, DatabaseSchemaService>();
builder.Services.AddSingleton<IApiTestService, ApiTestService>();
builder.Services.AddSingleton<IPackageAuditService, PackageAuditService>();
builder.Services.AddSingleton<IEnvCompareService, EnvCompareService>();
builder.Services.AddSingleton<ILogViewerService, LogViewerService>();
builder.Services.AddSingleton<IMigrationService, MigrationService>();
builder.Services.AddSingleton<IProjectManagementService, ProjectManagementService>();
builder.Services.AddSingleton<IArchitectureDesignerService, ArchitectureDesignerService>();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins("http://localhost:5173")
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

app.UseCors();

// wwwroot static files
var wwwrootPath = FindWwwroot();
if (wwwrootPath != null)
{
    Console.WriteLine($"  → wwwroot: {wwwrootPath}");
    var fileProvider = new PhysicalFileProvider(wwwrootPath);
    app.UseStaticFiles(new StaticFileOptions { FileProvider = fileProvider, RequestPath = "" });
}

app.MapControllers();

// SPA fallback: API olmayan tum route'lari index.html'e yonlendir
app.MapFallback(async context =>
{
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        context.Response.StatusCode = 404;
        return;
    }

    var indexPath = wwwrootPath != null ? Path.Combine(wwwrootPath, "index.html") : null;
    if (indexPath != null && File.Exists(indexPath))
    {
        context.Response.ContentType = "text/html; charset=utf-8";
        await context.Response.WriteAsync(await File.ReadAllTextAsync(indexPath));
    }
    else
    {
        context.Response.ContentType = "text/html; charset=utf-8";
        await context.Response.WriteAsync(GetFallbackHtml());
    }
});

var profileManager = app.Services.GetRequiredService<ProfileManager>();
profileManager.EnsureInitialized();

// ═══ MCP Server Auto-Install ═══
var markerPath = Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".devkit-mcp-installed");

if (args.Contains("--install") || !File.Exists(markerPath))
{
    await EnsureMcpServer();
}

var isToolInstall = Assembly.GetExecutingAssembly().Location.Contains(".dotnet");

Console.WriteLine();
Console.WriteLine("  ╔══════════════════════════════════════╗");
Console.WriteLine("  ║           DevKit v2.0.3              ║");
Console.WriteLine("  ║   Developer Toolkit & AI Companion   ║");
Console.WriteLine("  ╚══════════════════════════════════════╝");
Console.WriteLine();
Console.WriteLine($"  → API: http://localhost:5199");
if (!isToolInstall) Console.WriteLine($"  → UI:  http://localhost:5173");
Console.WriteLine($"  → Profile: {profileManager.GetConfigPath()}");
if (isToolInstall) Console.WriteLine($"  → Mode: Global Tool");
Console.WriteLine();
Console.WriteLine("  Press Ctrl+C to stop.");
Console.WriteLine();

if (!args.Contains("--no-browser"))
    OpenBrowser("http://localhost:5199");

app.Run();

// ═══ MCP SERVER AUTO-INSTALL ═══

async Task EnsureMcpServer()
{
    try
    {
        // npm full path bul
        var npmCmd = "npm";
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            var pathDirs = Environment.GetEnvironmentVariable("PATH")?.Split(';') ?? Array.Empty<string>();
            var npmPath = pathDirs
                .Select(d => Path.Combine(d, "npm.cmd"))
                .FirstOrDefault(File.Exists);

            npmPath ??= new[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "npm.cmd"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "nodejs", "npm.cmd"),
            }.FirstOrDefault(File.Exists);

            npmCmd = npmPath ?? "npm.cmd";
        }

        // npm var mi?
        var whichPsi = new ProcessStartInfo
        {
            FileName = npmCmd,
            Arguments = "--version",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        using var whichProc = Process.Start(whichPsi);
        if (whichProc == null) return;
        await whichProc.WaitForExitAsync();
        if (whichProc.ExitCode != 0) { Console.WriteLine("[DevKit] npm bulunamadi, MCP server atlaniyor."); return; }

        // Kurulu mu kontrol et
        var listPsi = new ProcessStartInfo
        {
            FileName = npmCmd,
            Arguments = "list -g devkit-mcp-server --depth=0",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        using var listProc = Process.Start(listPsi);
        if (listProc == null) return;
        var listOutput = await listProc.StandardOutput.ReadToEndAsync();
        await listProc.WaitForExitAsync();

        var isInstalled = listOutput.Contains("devkit-mcp-server");

        if (!isInstalled)
        {
            Console.WriteLine("[DevKit] devkit-mcp-server kuruluyor...");
            var installProc = Process.Start(new ProcessStartInfo
            {
                FileName = npmCmd,
                Arguments = "install -g devkit-mcp-server",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            });
            if (installProc != null)
            {
                await installProc.WaitForExitAsync();
                Console.WriteLine(installProc.ExitCode == 0
                    ? "[DevKit] devkit-mcp-server kuruldu."
                    : "[DevKit] devkit-mcp-server kurulum basarisiz.");
            }
        }
        else
        {
            Console.WriteLine("[DevKit] devkit-mcp-server guncelleniyor...");
            var updateProc = Process.Start(new ProcessStartInfo
            {
                FileName = npmCmd,
                Arguments = "update -g devkit-mcp-server",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            });
            if (updateProc != null)
            {
                await updateProc.WaitForExitAsync();
                Console.WriteLine("[DevKit] devkit-mcp-server guncellendi.");
            }
        }

        // Claude Desktop setup calistir (her zaman, mevcut connector'lari ezmez)
        var mcpCmd = "devkit-mcp-server";
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            var npmGlobalPrefix = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "npm");
            var mcpPath = Path.Combine(npmGlobalPrefix, "devkit-mcp-server.cmd");
            mcpCmd = File.Exists(mcpPath) ? mcpPath : "devkit-mcp-server.cmd";
        }

        var setupProc = Process.Start(new ProcessStartInfo
        {
            FileName = mcpCmd,
            Arguments = "--setup",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        });
        if (setupProc != null)
        {
            var setupOutput = await setupProc.StandardOutput.ReadToEndAsync();
            await setupProc.WaitForExitAsync();
            if (setupProc.ExitCode == 0)
            {
                Console.WriteLine("[DevKit] Claude Desktop config guncellendi.");
                Console.WriteLine(setupOutput);
            }
        }

        // Marker dosyasi yaz
        await File.WriteAllTextAsync(markerPath, DateTime.UtcNow.ToString("o"));
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[DevKit] MCP server kontrol hatasi: {ex.Message}");
    }
}

// ═══ HELPERS ═══

static string? FindWwwroot()
{
    var assemblyDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
    if (assemblyDir != null)
    {
        var asmPath = Path.Combine(assemblyDir, "wwwroot");
        if (Directory.Exists(asmPath) && File.Exists(Path.Combine(asmPath, "index.html")))
            return Path.GetFullPath(asmPath);
    }

    var current = Directory.GetCurrentDirectory();
    var path1 = Path.Combine(current, "wwwroot");
    if (Directory.Exists(path1) && File.Exists(Path.Combine(path1, "index.html")))
        return Path.GetFullPath(path1);

    var path2 = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "wwwroot");
    if (Directory.Exists(path2) && File.Exists(Path.Combine(path2, "index.html")))
        return Path.GetFullPath(path2);

    var dir = current;
    for (var i = 0; i < 5; i++)
    {
        var test = Path.Combine(dir, "wwwroot");
        if (Directory.Exists(test) && File.Exists(Path.Combine(test, "index.html")))
            return Path.GetFullPath(test);
        var testSrc = Path.Combine(dir, "src", "DevKit", "wwwroot");
        if (Directory.Exists(testSrc) && File.Exists(Path.Combine(testSrc, "index.html")))
            return Path.GetFullPath(testSrc);
        var parent = Directory.GetParent(dir);
        if (parent == null) break;
        dir = parent.FullName;
    }

    return null;
}

static string GetFallbackHtml() => """
    <!DOCTYPE html>
    <html lang="tr">
    <head><meta charset="UTF-8"><title>DevKit</title>
    <style>
    body{background:#0f1117;color:#e1e4eb;font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}
    .box{text-align:center;max-width:500px}
    h1{font-size:32px;margin-bottom:8px}
    p{color:#8b8fa3;margin:8px 0}
    a{color:#818cf8;text-decoration:none}
    a:hover{text-decoration:underline}
    .badge{display:inline-block;background:#1c1f2e;border:1px solid #2a2d3a;padding:4px 12px;border-radius:6px;margin:4px;font-size:13px}
    .ok{color:#10b981}
    </style></head>
    <body><div class="box">
    <h1>⚡ DevKit</h1>
    <p class="ok">✓ API calisiyor (localhost:5199)</p>
    <p>Developer Toolkit & AI Companion</p>
    <br>
    <p><strong>Kurulum:</strong></p>
    <div class="badge">dotnet tool update -g DevKit-Tool</div>
    <div class="badge">devkit</div>
    <br><br>
    <p>Ilk calistirmada MCP server ve Claude Desktop otomatik konfig edilir.</p>
    </div></body></html>
    """;

static void OpenBrowser(string url)
{
    try
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        else if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
            Process.Start("open", url);
        else
            Process.Start("xdg-open", url);
    }
    catch { }
}
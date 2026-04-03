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

// Root sayfasi - explicit GET /
app.MapGet("/", async context =>
{
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

Console.WriteLine();
Console.WriteLine("  ╔══════════════════════════════════════╗");
Console.WriteLine("  ║           DevKit v2.0.0              ║");
Console.WriteLine("  ║   Developer Toolkit & AI Companion   ║");
Console.WriteLine("  ╚══════════════════════════════════════╝");
Console.WriteLine();
Console.WriteLine($"  → API: http://localhost:5199");
Console.WriteLine($"  → UI:  http://localhost:5173");
Console.WriteLine($"  → Profile: {profileManager.GetConfigPath()}");
Console.WriteLine();
Console.WriteLine("  Press Ctrl+C to stop.");
Console.WriteLine();

OpenBrowser("http://localhost:5199");

app.Run();

// ═══ HELPERS ═══

static string? FindWwwroot()
{
    // 1. csproj dizini (dotnet run)
    var current = Directory.GetCurrentDirectory();
    var path1 = Path.Combine(current, "wwwroot");
    if (Directory.Exists(path1) && File.Exists(Path.Combine(path1, "index.html")))
        return Path.GetFullPath(path1);

    // 2. bin/Debug/net9.0 altindan (dotnet run bazen buradan calisir)
    var path2 = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "wwwroot");
    if (Directory.Exists(path2) && File.Exists(Path.Combine(path2, "index.html")))
        return Path.GetFullPath(path2);

    // 3. Ust dizinlerde ara
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
    <p><strong>UI'yi baslatmak icin:</strong></p>
    <div class="badge">cd src/DevKit/ClientApp && npm run dev</div>
    <p>Sonra <a href="http://localhost:5173">localhost:5173</a> adresini acin</p>
    <br>
    <p><strong>MCP Entegrasyonu:</strong></p>
    <div class="badge">npm i -g devkit-mcp-server && devkit-mcp-server --setup-all</div>
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
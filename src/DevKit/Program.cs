using DevKit.Configuration;
using DevKit.Services.Azure;
using DevKit.Services.Crypto;
using DevKit.Services.Docker;
using DevKit.Services.FileImport;
using DevKit.Services.Git;
using DevKit.Services.Scaffolding;
using DevKit.Services.Scanning;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
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
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapControllers();

app.MapFallbackToFile("index.html");

var profileManager = app.Services.GetRequiredService<ProfileManager>();
profileManager.EnsureInitialized();

Console.WriteLine();
Console.WriteLine("  ╔══════════════════════════════════════╗");
Console.WriteLine("  ║           DevKit v1.0.0              ║");
Console.WriteLine("  ║   Developer Toolkit & AI Companion   ║");
Console.WriteLine("  ╚══════════════════════════════════════╝");
Console.WriteLine();
Console.WriteLine($"  → http://localhost:5199");
Console.WriteLine($"  → Profile: {profileManager.GetConfigPath()}");
Console.WriteLine();
Console.WriteLine("  Press Ctrl+C to stop.");
Console.WriteLine();

OpenBrowser("http://localhost:5199");

app.Run();

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
    catch
    {
        // Browser açılamazsa sessizce devam et
    }
}

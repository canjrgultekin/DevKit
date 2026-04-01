# DevKit MCP - LoggingLibrary Proje Kurulum Komutları
# Claude Desktop'ta sırasıyla yazılacak komutlar
# Her bir bölüm ayrı bir mesaj olarak gönderilir

# ══════════════════════════════════════════════════════
# ADIM 1: Kuralları yükle + Proje scaffold + Profil oluştur
# ══════════════════════════════════════════════════════

DevKit kurallarını yükle ve .NET projesi için hazırlan.

Sonra şu manifest ile F:\LoggingLibrary dizininde proje oluştur, mode create:

{
  "solution": "LoggingLibrary",
  "framework": "dotnet",
  "outputPath": "F:\\LoggingLibrary",
  "projects": [
    {
      "name": "LoggingLibrary.Core",
      "path": "src/LoggingLibrary.Core",
      "type": "classlib",
      "targetFramework": "net9.0",
      "folders": ["Abstractions", "Models", "Extensions", "Enrichers"],
      "files": [],
      "dependencies": [
        { "package": "Serilog", "version": "4.2.0" },
        { "package": "Serilog.Sinks.Console", "version": "6.0.0" }
      ],
      "projectReferences": []
    },
    {
      "name": "LoggingLibrary.Elasticsearch",
      "path": "src/LoggingLibrary.Elasticsearch",
      "type": "classlib",
      "targetFramework": "net9.0",
      "folders": ["Configuration", "Sinks", "Extensions"],
      "files": [],
      "dependencies": [
        { "package": "Serilog.Sinks.Elasticsearch", "version": "10.0.0" }
      ],
      "projectReferences": ["LoggingLibrary.Core"]
    },
    {
      "name": "LoggingLibrary.OpenTelemetry",
      "path": "src/LoggingLibrary.OpenTelemetry",
      "type": "classlib",
      "targetFramework": "net9.0",
      "folders": ["Tracing", "Metrics", "Extensions"],
      "files": [],
      "dependencies": [
        { "package": "OpenTelemetry", "version": "1.11.2" },
        { "package": "OpenTelemetry.Extensions.Hosting", "version": "1.11.2" },
        { "package": "OpenTelemetry.Exporter.OpenTelemetryProtocol", "version": "1.11.2" }
      ],
      "projectReferences": ["LoggingLibrary.Core"]
    },
    {
      "name": "LoggingLibrary.Api",
      "path": "src/LoggingLibrary.Api",
      "type": "webapi",
      "targetFramework": "net9.0",
      "folders": ["Controllers", "Middleware", "Extensions"],
      "files": [],
      "dependencies": [
        { "package": "Serilog.AspNetCore", "version": "9.0.0" }
      ],
      "projectReferences": ["LoggingLibrary.Core", "LoggingLibrary.Elasticsearch", "LoggingLibrary.OpenTelemetry"]
    }
  ],
  "globalFiles": []
}

Scaffold tamamlandıktan sonra DevKit'te "logging-library" adında profil oluştur. İsmi "Logging Library", workspace "F:\LoggingLibrary\LoggingLibrary", framework dotnet. Profili aktif yap.


# ══════════════════════════════════════════════════════
# ADIM 2: GitHub repo oluştur + dev branch aç
# ══════════════════════════════════════════════════════

GitHub'da "LoggingLibrary" adında private repo oluştur, tüm dosyaları commitle ve push et. Sonra "dev" branch'i oluştur ve ona geç.


# ══════════════════════════════════════════════════════
# ADIM 3: Kodlama başlat (Claude'a geliştirme yaptır)
# ══════════════════════════════════════════════════════

Kodladığın dosyaları download olarak verme, her dosyayı DevKit import ile doğrudan "F:\LoggingLibrary\LoggingLibrary" projesine yerleştir.

Şimdi şu dosyaları kodla ve projeye import et:

1. ILoggerService interface - Core/Abstractions altına
2. LogEntry model - Core/Models altına
3. ServiceCollectionExtensions - Core/Extensions altına
4. HealthController - Api/Controllers altına


# ══════════════════════════════════════════════════════
# ADIM 4: Claude download olarak verdiyse bu komutu yaz
# ══════════════════════════════════════════════════════

Bu dosyaları download olarak verme, DevKit ile doğrudan "F:\LoggingLibrary\LoggingLibrary" projesine import et


# ══════════════════════════════════════════════════════
# ADIM 5: Dosyaları manuel import et (opsiyonel)
# Claude'un ürettiği kodları yapıştırarak import ettirme
# ══════════════════════════════════════════════════════

Şu dosyaları sırayla projeye import et, project root "F:\LoggingLibrary\LoggingLibrary":

// DEVKIT_PATH: src/LoggingLibrary.Core/Abstractions/ILoggerService.cs
namespace LoggingLibrary.Core.Abstractions;

public interface ILoggerService
{
    void LogInformation(string message, params object[] args);
    void LogWarning(string message, params object[] args);
    void LogError(Exception exception, string message, params object[] args);
    void LogCritical(Exception exception, string message, params object[] args);
}

// DEVKIT_PATH: src/LoggingLibrary.Core/Models/LogEntry.cs
namespace LoggingLibrary.Core.Models;

public sealed class LogEntry
{
    public string Level { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? ExceptionDetail { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public string? CorrelationId { get; set; }
    public Dictionary<string, object> Properties { get; set; } = new();
}

// DEVKIT_PATH: src/LoggingLibrary.Core/Extensions/ServiceCollectionExtensions.cs
using Microsoft.Extensions.DependencyInjection;
using LoggingLibrary.Core.Abstractions;

namespace LoggingLibrary.Core.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddLoggingLibrary(this IServiceCollection services)
    {
        services.AddSingleton<ILoggerService, SerilogLoggerService>();
        return services;
    }
}

// DEVKIT_PATH: src/LoggingLibrary.Api/Controllers/HealthController.cs
using Microsoft.AspNetCore.Mvc;

namespace LoggingLibrary.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(new { status = "healthy", timestamp = DateTime.UtcNow });
}


# ══════════════════════════════════════════════════════
# ADIM 6: Commit + Push
# ══════════════════════════════════════════════════════

Tüm değişiklikleri "feat: add core abstractions, models and health endpoint" mesajıyla commitle ve push et


# ══════════════════════════════════════════════════════
# ADIM 7: Azure deploy
# ══════════════════════════════════════════════════════

DevKit'te "logging-library" profilinin Azure bilgilerini güncelle: subscription ID "72b7f481-5891-4945-b676-4a9033af3566", resource group "devkit-rg", resource olarak "devkit-dev" ekle, project path "src/LoggingLibrary.Api", deploy mode appservice. Sonra Azure'a login ol, login doğrula ve devkit-dev'i deploy et.


# ══════════════════════════════════════════════════════
# ADIM 8: Deploy sonrası kontrol
# ══════════════════════════════════════════════════════

devkit-dev'in loglarını göster

devkit-dev'in environment variable'larını listele

devkit-dev'e ASPNETCORE_ENVIRONMENT=Production environment variable'ı ekle

using System.Text.Json.Serialization;

namespace DevKit.Configuration;

public sealed class DevKitConfig
{
    [JsonPropertyName("activeProfile")]
    public string ActiveProfile { get; set; } = string.Empty;

    [JsonPropertyName("profiles")]
    public Dictionary<string, DevKitProfile> Profiles { get; set; } = new();

    [JsonPropertyName("remotes")]
    public Dictionary<string, RemoteHost> Remotes { get; set; } = new();

    [JsonPropertyName("llmProviders")]
    public Dictionary<string, LlmProvider> LlmProviders { get; set; } = new();
}

public sealed class DevKitProfile
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("workspace")]
    public string Workspace { get; set; } = string.Empty;

    [JsonPropertyName("framework")]
    public string Framework { get; set; } = "dotnet";

    [JsonPropertyName("azure")]
    public AzureConfig? Azure { get; set; }
}

public sealed class AzureConfig
{
    [JsonPropertyName("tenantId")]
    public string TenantId { get; set; } = string.Empty;

    [JsonPropertyName("subscriptionId")]
    public string SubscriptionId { get; set; } = string.Empty;

    [JsonPropertyName("resourceGroup")]
    public string ResourceGroup { get; set; } = string.Empty;

    [JsonPropertyName("resources")]
    public List<AzureResource> Resources { get; set; } = new();
}

public sealed class AzureResource
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = "appservice";

    [JsonPropertyName("slot")]
    public string Slot { get; set; } = "production";

    [JsonPropertyName("projectPath")]
    public string ProjectPath { get; set; } = string.Empty;

    [JsonPropertyName("deployMode")]
    public string DeployMode { get; set; } = "appservice"; // appservice, webjob-continuous, webjob-triggered, custom-script

    [JsonPropertyName("webJobName")]
    public string WebJobName { get; set; } = string.Empty;

    [JsonPropertyName("webJobHostApp")]
    public string WebJobHostApp { get; set; } = string.Empty;

    // Custom deploy script desteği
    [JsonPropertyName("deployScript")]
    public string DeployScript { get; set; } = string.Empty; // deploy.ps1 veya deploy.sh yolu (projectPath'e göre relative)

    [JsonPropertyName("deployOutputPath")]
    public string DeployOutputPath { get; set; } = string.Empty; // Script çalıştıktan sonra zip'lenecek klasör (örn: .next/standalone)

    [JsonPropertyName("deployClean")]
    public bool DeployClean { get; set; } = false; // az webapp deploy --clean true

    [JsonPropertyName("environmentVariables")]
    public Dictionary<string, string> EnvironmentVariables { get; set; } = new();
}

// ═══════════════════════════════════════════════
// REMOTE SSH HOSTS
// Uzak sunucu baglanti profilleri (~/.devkit/devkit.json -> remotes)
// ═══════════════════════════════════════════════
public sealed class RemoteHost
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("host")]
    public string Host { get; set; } = string.Empty;

    [JsonPropertyName("port")]
    public int Port { get; set; } = 22;

    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    // "password" veya "privatekey"
    [JsonPropertyName("authMethod")]
    public string AuthMethod { get; set; } = "password";

    // NOT: Su an duz metin saklaniyor (kullanici tercihi). Sir alanlari ayri tutuldu;
    // ileride DPAPI/crypto ile sarmalamak icin sadece bu alanlara dokunmak yeterli.
    [JsonPropertyName("password")]
    public string? Password { get; set; }

    [JsonPropertyName("privateKeyPath")]
    public string? PrivateKeyPath { get; set; }

    [JsonPropertyName("passphrase")]
    public string? Passphrase { get; set; }

    // Komutlarin sarmalanacagi shell: "bash", "sh", "powershell", "pwsh", "cmd" veya null (remote default)
    [JsonPropertyName("defaultShell")]
    public string? DefaultShell { get; set; }

    [JsonPropertyName("defaultWorkingDirectory")]
    public string? DefaultWorkingDirectory { get; set; }

    [JsonPropertyName("connectTimeoutSeconds")]
    public int ConnectTimeoutSeconds { get; set; } = 15;

    [JsonPropertyName("description")]
    public string? Description { get; set; }
}

// ═══════════════════════════════════════════════
// LLM PROVIDERS
// Kullanicinin kendi LLM hesaplari (~/.devkit/devkit.json -> llmProviders)
// Su an OpenAI ve OpenAI-uyumlu endpoint'ler destekleniyor; provider-agnostik
// tasarlandi, ileride anthropic/gemini eklemek icin providerType genisletilir.
// ═══════════════════════════════════════════════
public sealed class LlmProvider
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    // "openai" veya "openai-compatible" (Groq, OpenRouter, Azure OpenAI, Ollama, ...)
    [JsonPropertyName("providerType")]
    public string ProviderType { get; set; } = "openai";

    // NOT: Su an duz metin saklaniyor (remote ile tutarli, kullanici tercihi).
    [JsonPropertyName("apiKey")]
    public string ApiKey { get; set; } = string.Empty;

    // Bos ise OpenAI default: https://api.openai.com/v1
    [JsonPropertyName("baseUrl")]
    public string? BaseUrl { get; set; }

    [JsonPropertyName("defaultModel")]
    public string? DefaultModel { get; set; }

    [JsonPropertyName("organization")]
    public string? Organization { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }
}

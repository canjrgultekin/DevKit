using System.Text.Json.Serialization;

namespace DevKit.Configuration;

public sealed class DevKitConfig
{
    [JsonPropertyName("activeProfile")]
    public string ActiveProfile { get; set; } = string.Empty;

    [JsonPropertyName("profiles")]
    public Dictionary<string, DevKitProfile> Profiles { get; set; } = new();
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
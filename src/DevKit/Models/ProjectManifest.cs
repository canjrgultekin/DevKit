using System.Text.Json.Serialization;

namespace DevKit.Models;

public sealed class ProjectManifest
{
    [JsonPropertyName("solution")]
    public string Solution { get; set; } = string.Empty;

    [JsonPropertyName("framework")]
    public string Framework { get; set; } = "dotnet";

    [JsonPropertyName("outputPath")]
    public string OutputPath { get; set; } = string.Empty;

    [JsonPropertyName("projects")]
    public List<ProjectDefinition> Projects { get; set; } = new();

    [JsonPropertyName("globalFiles")]
    public List<GlobalFileDefinition> GlobalFiles { get; set; } = new();
}

public sealed class ProjectDefinition
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("path")]
    public string Path { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = "classlib";

    [JsonPropertyName("targetFramework")]
    public string TargetFramework { get; set; } = "net9.0";

    [JsonPropertyName("folders")]
    public List<string> Folders { get; set; } = new();

    [JsonPropertyName("files")]
    public List<FileDefinition> Files { get; set; } = new();

    [JsonPropertyName("dependencies")]
    public List<DependencyDefinition> Dependencies { get; set; } = new();

    [JsonPropertyName("projectReferences")]
    public List<string> ProjectReferences { get; set; } = new();

    [JsonPropertyName("scripts")]
    public Dictionary<string, string> Scripts { get; set; } = new();

    [JsonPropertyName("npmDependencies")]
    public Dictionary<string, string> NpmDependencies { get; set; } = new();

    [JsonPropertyName("npmDevDependencies")]
    public Dictionary<string, string> NpmDevDependencies { get; set; } = new();
}

public sealed class FileDefinition
{
    [JsonPropertyName("path")]
    public string Path { get; set; } = string.Empty;

    [JsonPropertyName("content")]
    public string? Content { get; set; }
}

public sealed class DependencyDefinition
{
    [JsonPropertyName("package")]
    public string Package { get; set; } = string.Empty;

    [JsonPropertyName("version")]
    public string Version { get; set; } = string.Empty;
}

public sealed class GlobalFileDefinition
{
    [JsonPropertyName("path")]
    public string Path { get; set; } = string.Empty;

    [JsonPropertyName("content")]
    public string Content { get; set; } = string.Empty;
}

public sealed class ScaffoldRequest
{
    [JsonPropertyName("manifest")]
    public ProjectManifest Manifest { get; set; } = new();

    [JsonPropertyName("mode")]
    public string Mode { get; set; } = "create"; // create, update
}

public sealed class ScaffoldResponse
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("mode")]
    public string Mode { get; set; } = "create";

    [JsonPropertyName("outputPath")]
    public string OutputPath { get; set; } = string.Empty;

    [JsonPropertyName("createdFiles")]
    public List<string> CreatedFiles { get; set; } = new();

    [JsonPropertyName("createdFolders")]
    public List<string> CreatedFolders { get; set; } = new();

    [JsonPropertyName("skippedFiles")]
    public List<string> SkippedFiles { get; set; } = new();

    [JsonPropertyName("errors")]
    public List<string> Errors { get; set; } = new();
}
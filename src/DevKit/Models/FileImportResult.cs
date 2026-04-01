using System.Text.Json.Serialization;

namespace DevKit.Models;

public sealed class FileImportResult
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("totalFiles")]
    public int TotalFiles { get; set; }

    [JsonPropertyName("importedFiles")]
    public int ImportedFiles { get; set; }

    [JsonPropertyName("overwrittenFiles")]
    public int OverwrittenFiles { get; set; }

    [JsonPropertyName("failedFiles")]
    public int FailedFiles { get; set; }

    [JsonPropertyName("details")]
    public List<FileImportDetail> Details { get; set; } = new();
}

public sealed class FileImportDetail
{
    [JsonPropertyName("fileName")]
    public string FileName { get; set; } = string.Empty;

    [JsonPropertyName("detectedPath")]
    public string DetectedPath { get; set; } = string.Empty;

    [JsonPropertyName("targetFullPath")]
    public string TargetFullPath { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = "imported"; // imported, overwritten, failed, no_path

    [JsonPropertyName("error")]
    public string? Error { get; set; }
}

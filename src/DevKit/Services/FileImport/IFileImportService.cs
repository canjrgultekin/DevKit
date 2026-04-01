using DevKit.Models;

namespace DevKit.Services.FileImport;

public interface IFileImportService
{
    Task<FileImportResult> ImportFilesAsync(string projectRoot, IEnumerable<ImportedFile> files);
    DevKitPathInfo? ParseDevKitPath(string fileName, string content);
}

public sealed class ImportedFile
{
    public string FileName { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
}

public sealed class DevKitPathInfo
{
    public string RelativePath { get; set; } = string.Empty;
    public string CleanContent { get; set; } = string.Empty;
    public string CommentStyle { get; set; } = string.Empty; // //, #, json
}

using DevKit.Configuration;
using DevKit.Services.FileImport;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace DevKit.Controllers;

[ApiController]
[Route("api/[controller]")]
public class FileImportController : ControllerBase
{
    private readonly IFileImportService _fileImportService;
    private readonly ProfileManager _profileManager;

    public FileImportController(IFileImportService fileImportService, ProfileManager profileManager)
    {
        _fileImportService = fileImportService;
        _profileManager = profileManager;
    }

    private string? ResolveProjectRoot(string? projectRoot)
    {
        if (!string.IsNullOrWhiteSpace(projectRoot))
            return projectRoot;

        var activeProfile = _profileManager.GetActiveProfile();
        return activeProfile?.Workspace;
    }

    // ===== MULTIPART FILE UPLOAD (UI drag-drop) =====

    [HttpPost("import")]
    [RequestSizeLimit(100 * 1024 * 1024)]
    public async Task<IActionResult> ImportFiles([FromForm] string? projectRoot, IFormFileCollection files)
    {
        if (files == null || files.Count == 0)
            return BadRequest(new { error = "No files provided." });

        var root = ResolveProjectRoot(projectRoot);
        if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root))
            return BadRequest(new { error = $"Project root directory does not exist: {root}" });

        var importedFiles = new List<ImportedFile>();
        foreach (var file in files)
        {
            using var reader = new StreamReader(file.OpenReadStream());
            var content = await reader.ReadToEndAsync();
            importedFiles.Add(new ImportedFile
            {
                FileName = file.FileName,
                Content = content
            });
        }

        var result = await _fileImportService.ImportFilesAsync(root, importedFiles);
        return Ok(result);
    }

    // ===== MULTIPART PREVIEW (UI preview button) =====

    [HttpPost("preview")]
    public async Task<IActionResult> PreviewImport(IFormFileCollection files)
    {
        if (files == null || files.Count == 0)
            return BadRequest(new { error = "No files provided." });

        var previews = new List<object>();
        foreach (var file in files)
        {
            using var reader = new StreamReader(file.OpenReadStream());
            var content = await reader.ReadToEndAsync();
            var pathInfo = _fileImportService.ParseDevKitPath(file.FileName, content);
            previews.Add(new
            {
                fileName = file.FileName,
                hasMarker = pathInfo != null,
                detectedPath = pathInfo?.RelativePath ?? file.FileName,
                commentStyle = pathInfo?.CommentStyle ?? "none",
                contentPreview = content.Length > 200 ? content[..200] + "..." : content
            });
        }

        return Ok(new { files = previews });
    }

    // ===== TEXT-BASED BATCH IMPORT (UI text import) =====

    [HttpPost("import-text")]
    public async Task<IActionResult> ImportFromText([FromBody] TextImportRequest request)
    {
        if (request.Files == null || request.Files.Count == 0)
            return BadRequest(new { error = "No files provided." });

        var root = ResolveProjectRoot(request.ProjectRoot);
        if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root))
            return BadRequest(new { error = $"Project root directory does not exist: {root}" });

        var result = await _fileImportService.ImportFilesAsync(root, request.Files);
        return Ok(result);
    }

    // ===== SINGLE FILE TEXT IMPORT (MCP tool) =====

    [HttpPost("text")]
    public async Task<IActionResult> ImportSingleText([FromBody] SingleTextImportRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Content))
            return BadRequest(new { error = "Content is required." });

        var root = ResolveProjectRoot(request.ProjectRoot);
        if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root))
            return BadRequest(new { error = $"Project root directory does not exist: {root}" });

        var fileName = request.FileName ?? "unnamed.cs";
        var importedFile = new ImportedFile { FileName = fileName, Content = request.Content };
        var result = await _fileImportService.ImportFilesAsync(root, [importedFile]);
        return Ok(result);
    }

    // ===== SINGLE FILE TEXT PREVIEW (MCP tool) =====

    [HttpPost("preview-text")]
    public IActionResult PreviewSingleText([FromBody] SingleTextImportRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Content))
            return BadRequest(new { error = "Content is required." });

        var fileName = request.FileName ?? "unnamed.cs";
        var pathInfo = _fileImportService.ParseDevKitPath(fileName, request.Content);

        return Ok(new
        {
            fileName,
            hasMarker = pathInfo != null,
            detectedPath = pathInfo?.RelativePath ?? fileName,
            commentStyle = pathInfo?.CommentStyle ?? "none",
            contentPreview = request.Content.Length > 200 ? request.Content[..200] + "..." : request.Content
        });
    }
}

public sealed class TextImportRequest
{
    public string? ProjectRoot { get; set; }
    public List<ImportedFile> Files { get; set; } = new();
}

public sealed class SingleTextImportRequest
{
    public string? ProjectRoot { get; set; }
    public string? FileName { get; set; }
    public string Content { get; set; } = string.Empty;
}
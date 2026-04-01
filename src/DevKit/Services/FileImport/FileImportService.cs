using DevKit.Models;
using System.Text.RegularExpressions;

namespace DevKit.Services.FileImport;

public sealed partial class FileImportService : IFileImportService
{
    // Desteklenen DEVKIT_PATH formatları:
    // C#/Java/JS/TS:  // DEVKIT_PATH: src/Project/Folder/File.cs
    // Python/YAML:    # DEVKIT_PATH: src/services/handler.py
    // JSON:           "_devkit_path": "src/Project/appsettings.json"  (ilk key)
    // HTML/XML:       <!-- DEVKIT_PATH: src/wwwroot/index.html -->

    [GeneratedRegex(@"^//\s*DEVKIT_PATH:\s*(.+)$", RegexOptions.Compiled)]
    private static partial Regex SlashCommentPattern();

    [GeneratedRegex(@"^#\s*DEVKIT_PATH:\s*(.+)$", RegexOptions.Compiled)]
    private static partial Regex HashCommentPattern();

    [GeneratedRegex(@"^\s*""_devkit_path""\s*:\s*""(.+?)""", RegexOptions.Compiled)]
    private static partial Regex JsonPattern();

    [GeneratedRegex(@"^<!--\s*DEVKIT_PATH:\s*(.+?)\s*-->$", RegexOptions.Compiled)]
    private static partial Regex HtmlCommentPattern();

    public DevKitPathInfo? ParseDevKitPath(string fileName, string content)
    {
        if (string.IsNullOrWhiteSpace(content))
            return null;

        var lines = content.Split('\n');
        if (lines.Length == 0)
            return null;

        var firstLine = lines[0].Trim();

        // // DEVKIT_PATH: path
        var match = SlashCommentPattern().Match(firstLine);
        if (match.Success)
        {
            return new DevKitPathInfo
            {
                RelativePath = NormalizePath(match.Groups[1].Value.Trim()),
                CleanContent = RemoveFirstLine(content),
                CommentStyle = "//"
            };
        }

        // # DEVKIT_PATH: path
        match = HashCommentPattern().Match(firstLine);
        if (match.Success)
        {
            return new DevKitPathInfo
            {
                RelativePath = NormalizePath(match.Groups[1].Value.Trim()),
                CleanContent = RemoveFirstLine(content),
                CommentStyle = "#"
            };
        }

        // <!-- DEVKIT_PATH: path -->
        match = HtmlCommentPattern().Match(firstLine);
        if (match.Success)
        {
            return new DevKitPathInfo
            {
                RelativePath = NormalizePath(match.Groups[1].Value.Trim()),
                CleanContent = RemoveFirstLine(content),
                CommentStyle = "html"
            };
        }

        // JSON: "_devkit_path": "path" (ilk satır veya ikinci satır { 'den sonra)
        for (int i = 0; i < Math.Min(3, lines.Length); i++)
        {
            match = JsonPattern().Match(lines[i].Trim());
            if (match.Success)
            {
                return new DevKitPathInfo
                {
                    RelativePath = NormalizePath(match.Groups[1].Value.Trim()),
                    CleanContent = RemoveJsonDevKitPath(content),
                    CommentStyle = "json"
                };
            }
        }

        return null;
    }

    public async Task<FileImportResult> ImportFilesAsync(string projectRoot, IEnumerable<ImportedFile> files)
    {
        var result = new FileImportResult();

        foreach (var file in files)
        {
            result.TotalFiles++;
            var detail = new FileImportDetail { FileName = file.FileName };

            try
            {
                var pathInfo = ParseDevKitPath(file.FileName, file.Content);

                if (pathInfo == null)
                {
                    detail.Status = "no_path";
                    detail.Error = "DEVKIT_PATH marker not found in file. Using filename as fallback.";
                    detail.DetectedPath = file.FileName;
                    detail.TargetFullPath = Path.Combine(projectRoot, file.FileName);

                    // Marker yoksa dosyayı root'a koy (fallback)
                    var fallbackPath = Path.Combine(projectRoot, file.FileName);
                    var fallbackDir = Path.GetDirectoryName(fallbackPath)!;
                    if (!Directory.Exists(fallbackDir))
                        Directory.CreateDirectory(fallbackDir);

                    await File.WriteAllTextAsync(fallbackPath, file.Content);
                    detail.Status = "imported_no_marker";
                    result.ImportedFiles++;
                }
                else
                {
                    detail.DetectedPath = pathInfo.RelativePath;
                    var targetPath = Path.Combine(projectRoot, pathInfo.RelativePath);
                    detail.TargetFullPath = targetPath;

                    var existed = File.Exists(targetPath);

                    var dir = Path.GetDirectoryName(targetPath)!;
                    if (!Directory.Exists(dir))
                        Directory.CreateDirectory(dir);

                    // DEVKIT_PATH satırı silinmiş temiz içeriği yaz
                    await File.WriteAllTextAsync(targetPath, pathInfo.CleanContent);

                    if (existed)
                    {
                        detail.Status = "overwritten";
                        result.OverwrittenFiles++;
                    }
                    else
                    {
                        detail.Status = "imported";
                    }

                    result.ImportedFiles++;
                }
            }
            catch (Exception ex)
            {
                detail.Status = "failed";
                detail.Error = ex.Message;
                result.FailedFiles++;
            }

            result.Details.Add(detail);
        }

        result.Success = result.FailedFiles == 0;
        return result;
    }

    private static string NormalizePath(string path)
    {
        // Her iki path separator'ı da OS'e uygun hale getir
        return path.Replace('\\', Path.DirectorySeparatorChar)
                    .Replace('/', Path.DirectorySeparatorChar)
                    .TrimStart(Path.DirectorySeparatorChar);
    }

    private static string RemoveFirstLine(string content)
    {
        var idx = content.IndexOf('\n');
        if (idx < 0) return string.Empty;

        var result = content[(idx + 1)..];
        // İlk satır boşsa (marker'dan sonra boş satır varsa) onu da sil
        if (result.StartsWith("\r\n") || result.StartsWith("\n"))
            return result.TrimStart('\r', '\n');

        return result;
    }

    private static string RemoveJsonDevKitPath(string content)
    {
        // JSON dosyadan "_devkit_path" key'ini ve trailing comma'yı temizle
        var lines = content.Split('\n').ToList();

        for (int i = 0; i < lines.Count; i++)
        {
            if (JsonPattern().IsMatch(lines[i].Trim()))
            {
                lines.RemoveAt(i);
                // Eğer sonraki satır varsa ve önceki satırda trailing comma varsa düzelt
                if (i < lines.Count && i > 0)
                {
                    var prevLine = lines[i - 1].TrimEnd();
                    if (prevLine.EndsWith(','))
                    {
                        // Comma'yı bırak, sonraki satır zaten var
                    }
                }
                break;
            }
        }

        return string.Join('\n', lines);
    }
}

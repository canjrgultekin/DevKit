using Microsoft.AspNetCore.Mvc;

namespace DevKit.Controllers;

[ApiController]
[Route("api/file")]
public class FileController : ControllerBase
{
    // ═══ LIST (dizin icerigi) ═══
    [HttpPost("list")]
    public IActionResult List([FromBody] FileListRequest request)
    {
        var path = request.Path;
        if (string.IsNullOrWhiteSpace(path) || !Directory.Exists(path))
            return Ok(new { success = false, error = $"Dizin bulunamadi: {path}" });

        var excludeDirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            { "bin", "obj", "node_modules", ".git", ".vs", ".idea", "__pycache__", "dist", ".next", "packages" };

        try
        {
            var items = new List<object>();

            foreach (var dir in Directory.GetDirectories(path).OrderBy(d => d))
            {
                var name = Path.GetFileName(dir);
                if (!request.ShowHidden && (name.StartsWith('.') || excludeDirs.Contains(name))) continue;
                var info = new DirectoryInfo(dir);
                items.Add(new { name, type = "directory", path = dir, lastModified = info.LastWriteTimeUtc });
            }

            foreach (var file in Directory.GetFiles(path).OrderBy(f => f))
            {
                var name = Path.GetFileName(file);
                if (!request.ShowHidden && name.StartsWith('.')) continue;
                if (request.Extensions != null && request.Extensions.Length > 0)
                {
                    var ext = Path.GetExtension(file);
                    if (!request.Extensions.Any(e => e.Equals(ext, StringComparison.OrdinalIgnoreCase))) continue;
                }
                var info = new FileInfo(file);
                items.Add(new { name, type = "file", path = file, size = info.Length, lastModified = info.LastWriteTimeUtc, extension = info.Extension });
            }

            return Ok(new { success = true, path, itemCount = items.Count, items });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ TREE (recursive dizin agaci) ═══
    [HttpPost("tree")]
    public IActionResult Tree([FromBody] FileTreeRequest request)
    {
        var path = request.Path;
        if (string.IsNullOrWhiteSpace(path) || !Directory.Exists(path))
            return Ok(new { success = false, error = $"Dizin bulunamadi: {path}" });

        try
        {
            var tree = BuildTree(path, request.MaxDepth > 0 ? request.MaxDepth : 3, 0, request.ShowHidden);
            return Ok(new { success = true, path, tree });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ READ (dosya oku) ═══
    [HttpPost("read")]
    public IActionResult Read([FromBody] FilePathRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Path))
            return Ok(new { success = false, error = "Path gerekli." });
        if (!System.IO.File.Exists(request.Path))
            return Ok(new { success = false, error = $"Dosya bulunamadi: {request.Path}" });

        try
        {
            var info = new FileInfo(request.Path);
            if (info.Length > 5 * 1024 * 1024)
                return Ok(new { success = false, error = "Dosya 5MB'dan buyuk. Okunamaz." });

            var content = System.IO.File.ReadAllText(request.Path);
            var lineCount = content.Split('\n').Length;

            return Ok(new { success = true, path = request.Path, size = info.Length, lineCount, extension = info.Extension, lastModified = info.LastWriteTimeUtc, content });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ WRITE (dosya yaz/guncelle) ═══
    [HttpPost("write")]
    public IActionResult Write([FromBody] FileWriteRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Path) || request.Content == null)
            return Ok(new { success = false, error = "Path ve Content gerekli." });

        try
        {
            var dir = Path.GetDirectoryName(request.Path);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                Directory.CreateDirectory(dir);

            var existed = System.IO.File.Exists(request.Path);

            if (request.Append)
                System.IO.File.AppendAllText(request.Path, request.Content);
            else
                System.IO.File.WriteAllText(request.Path, request.Content);

            var info = new FileInfo(request.Path);
            return Ok(new { success = true, path = request.Path, action = existed ? (request.Append ? "appended" : "updated") : "created", size = info.Length });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ CREATE DIRECTORY ═══
    [HttpPost("mkdir")]
    public IActionResult Mkdir([FromBody] FilePathRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Path))
            return Ok(new { success = false, error = "Path gerekli." });

        try
        {
            if (Directory.Exists(request.Path))
                return Ok(new { success = true, path = request.Path, message = "Dizin zaten mevcut." });

            Directory.CreateDirectory(request.Path);
            return Ok(new { success = true, path = request.Path, message = "Dizin olusturuldu." });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ COPY ═══
    [HttpPost("copy")]
    public IActionResult Copy([FromBody] FileCopyMoveRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Source) || string.IsNullOrWhiteSpace(request.Destination))
            return Ok(new { success = false, error = "Source ve Destination gerekli." });

        try
        {
            if (System.IO.File.Exists(request.Source))
            {
                var destDir = Path.GetDirectoryName(request.Destination);
                if (!string.IsNullOrEmpty(destDir) && !Directory.Exists(destDir))
                    Directory.CreateDirectory(destDir);

                System.IO.File.Copy(request.Source, request.Destination, request.Overwrite);
                return Ok(new { success = true, type = "file", source = request.Source, destination = request.Destination });
            }

            if (Directory.Exists(request.Source))
            {
                CopyDirectory(request.Source, request.Destination, request.Overwrite);
                return Ok(new { success = true, type = "directory", source = request.Source, destination = request.Destination });
            }

            return Ok(new { success = false, error = $"Kaynak bulunamadi: {request.Source}" });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ MOVE / RENAME ═══
    [HttpPost("move")]
    public IActionResult Move([FromBody] FileCopyMoveRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Source) || string.IsNullOrWhiteSpace(request.Destination))
            return Ok(new { success = false, error = "Source ve Destination gerekli." });

        try
        {
            var destDir = Path.GetDirectoryName(request.Destination);
            if (!string.IsNullOrEmpty(destDir) && !Directory.Exists(destDir))
                Directory.CreateDirectory(destDir);

            if (System.IO.File.Exists(request.Source))
            {
                System.IO.File.Move(request.Source, request.Destination, request.Overwrite);
                return Ok(new { success = true, type = "file", source = request.Source, destination = request.Destination });
            }

            if (Directory.Exists(request.Source))
            {
                Directory.Move(request.Source, request.Destination);
                return Ok(new { success = true, type = "directory", source = request.Source, destination = request.Destination });
            }

            return Ok(new { success = false, error = $"Kaynak bulunamadi: {request.Source}" });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ DELETE ═══
    [HttpPost("delete")]
    public IActionResult Delete([FromBody] FileDeleteOpRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Path))
            return Ok(new { success = false, error = "Path gerekli." });

        try
        {
            if (System.IO.File.Exists(request.Path))
            {
                System.IO.File.Delete(request.Path);
                return Ok(new { success = true, type = "file", path = request.Path, message = "Dosya silindi." });
            }

            if (Directory.Exists(request.Path))
            {
                var fileCount = Directory.GetFiles(request.Path, "*", SearchOption.AllDirectories).Length;
                var dirCount = Directory.GetDirectories(request.Path, "*", SearchOption.AllDirectories).Length;

                if (!request.Recursive && (fileCount > 0 || dirCount > 0))
                    return Ok(new { success = false, error = $"Dizin bos degil ({fileCount} dosya, {dirCount} alt dizin). recursive=true kullanin." });

                Directory.Delete(request.Path, request.Recursive);
                return Ok(new { success = true, type = "directory", path = request.Path, message = $"Dizin silindi ({fileCount} dosya, {dirCount} alt dizin)." });
            }

            return Ok(new { success = false, error = $"Bulunamadi: {request.Path}" });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ INFO (dosya/dizin bilgisi) ═══
    [HttpPost("info")]
    public IActionResult Info([FromBody] FilePathRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Path))
            return Ok(new { success = false, error = "Path gerekli." });

        try
        {
            if (System.IO.File.Exists(request.Path))
            {
                var info = new FileInfo(request.Path);
                return Ok(new
                {
                    success = true,
                    type = "file",
                    path = request.Path,
                    name = info.Name,
                    extension = info.Extension,
                    size = info.Length,
                    sizeFormatted = FormatSize(info.Length),
                    created = info.CreationTimeUtc,
                    modified = info.LastWriteTimeUtc,
                    readOnly = info.IsReadOnly,
                });
            }

            if (Directory.Exists(request.Path))
            {
                var dirInfo = new DirectoryInfo(request.Path);
                var files = Directory.GetFiles(request.Path, "*", SearchOption.AllDirectories);
                var totalSize = files.Sum(f => new FileInfo(f).Length);

                return Ok(new
                {
                    success = true,
                    type = "directory",
                    path = request.Path,
                    name = dirInfo.Name,
                    fileCount = files.Length,
                    dirCount = Directory.GetDirectories(request.Path, "*", SearchOption.AllDirectories).Length,
                    totalSize,
                    totalSizeFormatted = FormatSize(totalSize),
                    created = dirInfo.CreationTimeUtc,
                    modified = dirInfo.LastWriteTimeUtc,
                });
            }

            return Ok(new { success = false, error = $"Bulunamadi: {request.Path}" });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ FIND (dosya ara) ═══
    [HttpPost("find")]
    public IActionResult Find([FromBody] FileFindRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Directory) || string.IsNullOrWhiteSpace(request.Pattern))
            return Ok(new { success = false, error = "Directory ve Pattern gerekli." });
        if (!Directory.Exists(request.Directory))
            return Ok(new { success = false, error = $"Dizin bulunamadi: {request.Directory}" });

        try
        {
            var excludeDirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                { "bin", "obj", "node_modules", ".git", ".vs", ".idea", "__pycache__", "dist", ".next" };

            var results = new List<object>();
            var maxResults = request.MaxResults > 0 ? request.MaxResults : 200;

            FindFiles(request.Directory, request.Pattern, excludeDirs, results, maxResults, request.SearchContent);

            return Ok(new { success = true, pattern = request.Pattern, count = results.Count, truncated = results.Count >= maxResults, results });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ BULK DELETE ═══
    [HttpPost("bulk-delete")]
    public IActionResult BulkDelete([FromBody] FileBulkRequest request)
    {
        if (request.Paths == null || request.Paths.Count == 0)
            return Ok(new { success = false, error = "Paths gerekli." });

        var results = new List<object>();
        foreach (var path in request.Paths)
        {
            try
            {
                if (System.IO.File.Exists(path))
                {
                    System.IO.File.Delete(path);
                    results.Add(new { path, deleted = true });
                }
                else if (Directory.Exists(path))
                {
                    Directory.Delete(path, true);
                    results.Add(new { path, deleted = true });
                }
                else
                {
                    results.Add(new { path, deleted = false, error = "Bulunamadi" });
                }
            }
            catch (Exception ex)
            {
                results.Add(new { path, deleted = false, error = ex.Message });
            }
        }

        var deletedCount = results.Count(r => (bool)r.GetType().GetProperty("deleted")!.GetValue(r)!);
        return Ok(new { success = true, total = request.Paths.Count, deleted = deletedCount, results });
    }

    // ═══ HELPERS ═══

    private static object BuildTree(string path, int maxDepth, int currentDepth, bool showHidden)
    {
        var excludeDirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            { "bin", "obj", "node_modules", ".git", ".vs", ".idea", "__pycache__", "dist", ".next", "packages" };

        var children = new List<object>();

        if (currentDepth < maxDepth)
        {
            try
            {
                foreach (var dir in Directory.GetDirectories(path).OrderBy(d => d))
                {
                    var name = Path.GetFileName(dir);
                    if (!showHidden && (name.StartsWith('.') || excludeDirs.Contains(name))) continue;
                    children.Add(BuildTree(dir, maxDepth, currentDepth + 1, showHidden));
                }

                foreach (var file in Directory.GetFiles(path).OrderBy(f => f))
                {
                    var name = Path.GetFileName(file);
                    if (!showHidden && name.StartsWith('.')) continue;
                    children.Add(new { name, type = "file", size = new FileInfo(file).Length });
                }
            }
            catch { /* permission */ }
        }

        return new { name = Path.GetFileName(path), type = "directory", children };
    }

    private static void CopyDirectory(string source, string destination, bool overwrite)
    {
        Directory.CreateDirectory(destination);

        foreach (var file in Directory.GetFiles(source))
        {
            var dest = Path.Combine(destination, Path.GetFileName(file));
            System.IO.File.Copy(file, dest, overwrite);
        }

        foreach (var dir in Directory.GetDirectories(source))
        {
            var dest = Path.Combine(destination, Path.GetFileName(dir));
            CopyDirectory(dir, dest, overwrite);
        }
    }

    private static void FindFiles(string dir, string pattern, HashSet<string> excludeDirs, List<object> results, int maxResults, bool searchContent)
    {
        if (results.Count >= maxResults) return;

        try
        {
            foreach (var file in Directory.GetFiles(dir, pattern))
            {
                if (results.Count >= maxResults) return;
                var info = new FileInfo(file);
                results.Add(new { path = file, name = info.Name, size = info.Length, modified = info.LastWriteTimeUtc });
            }

            foreach (var subDir in Directory.GetDirectories(dir))
            {
                if (results.Count >= maxResults) return;
                var name = Path.GetFileName(subDir);
                if (excludeDirs.Contains(name)) continue;
                FindFiles(subDir, pattern, excludeDirs, results, maxResults, searchContent);
            }
        }
        catch { /* permission */ }
    }

    private static string FormatSize(long bytes)
    {
        if (bytes < 1024) return $"{bytes} B";
        if (bytes < 1024 * 1024) return $"{bytes / 1024.0:F1} KB";
        if (bytes < 1024 * 1024 * 1024) return $"{bytes / 1024.0 / 1024.0:F1} MB";
        return $"{bytes / 1024.0 / 1024.0 / 1024.0:F2} GB";
    }
}

// ═══ REQUEST MODELS ═══

public sealed class FilePathRequest
{
    public string Path { get; set; } = string.Empty;
}

public sealed class FileListRequest
{
    public string Path { get; set; } = string.Empty;
    public bool ShowHidden { get; set; }
    public string[]? Extensions { get; set; }
}

public sealed class FileTreeRequest
{
    public string Path { get; set; } = string.Empty;
    public int MaxDepth { get; set; }
    public bool ShowHidden { get; set; }
}

public sealed class FileWriteRequest
{
    public string Path { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public bool Append { get; set; }
}

public sealed class FileCopyMoveRequest
{
    public string Source { get; set; } = string.Empty;
    public string Destination { get; set; } = string.Empty;
    public bool Overwrite { get; set; }
}

public sealed class FileDeleteOpRequest
{
    public string Path { get; set; } = string.Empty;
    public bool Recursive { get; set; }
}

public sealed class FileFindRequest
{
    public string Directory { get; set; } = string.Empty;
    public string Pattern { get; set; } = "*";
    public int MaxResults { get; set; }
    public bool SearchContent { get; set; }
}

public sealed class FileBulkRequest
{
    public List<string> Paths { get; set; } = new();
}
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace DevKit.Services.LogViewer;

public interface ILogViewerService
{
    Task<LogResult> ReadLogsAsync(LogReadRequest request);
    List<string> ScanLogFiles(string projectPath);
}

public class LogReadRequest
{
    [JsonPropertyName("filePath")]
    public string FilePath { get; set; } = string.Empty;

    [JsonPropertyName("tail")]
    public int Tail { get; set; } = 200;

    [JsonPropertyName("level")]
    public string? Level { get; set; }

    [JsonPropertyName("search")]
    public string? Search { get; set; }

    [JsonPropertyName("correlationId")]
    public string? CorrelationId { get; set; }
}

public class LogResult
{
    [JsonPropertyName("entries")]
    public List<LogEntry> Entries { get; set; } = [];

    [JsonPropertyName("totalLines")]
    public int TotalLines { get; set; }

    [JsonPropertyName("filteredCount")]
    public int FilteredCount { get; set; }

    [JsonPropertyName("filePath")]
    public string FilePath { get; set; } = string.Empty;

    [JsonPropertyName("summary")]
    public LogSummary Summary { get; set; } = new();
}

public class LogEntry
{
    [JsonPropertyName("lineNumber")]
    public int LineNumber { get; set; }

    [JsonPropertyName("timestamp")]
    public string Timestamp { get; set; } = string.Empty;

    [JsonPropertyName("level")]
    public string Level { get; set; } = "Information";

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("exception")]
    public string? Exception { get; set; }

    [JsonPropertyName("sourceContext")]
    public string? SourceContext { get; set; }

    [JsonPropertyName("correlationId")]
    public string? CorrelationId { get; set; }

    [JsonPropertyName("properties")]
    public Dictionary<string, string> Properties { get; set; } = new();

    [JsonPropertyName("raw")]
    public string Raw { get; set; } = string.Empty;
}

public class LogSummary
{
    [JsonPropertyName("verbose")]
    public int Verbose { get; set; }

    [JsonPropertyName("debug")]
    public int Debug { get; set; }

    [JsonPropertyName("information")]
    public int Information { get; set; }

    [JsonPropertyName("warning")]
    public int Warning { get; set; }

    [JsonPropertyName("error")]
    public int Error { get; set; }

    [JsonPropertyName("fatal")]
    public int Fatal { get; set; }
}

public class LogViewerService : ILogViewerService
{
    private static readonly Regex SerilogJsonRegex = new(@"^\{.*""@t"".*\}$", RegexOptions.Compiled);
    private static readonly Regex PlainLogRegex = new(
        @"^(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}[\.,]?\d{0,7}Z?)\s*\[?(VRB|DBG|INF|WRN|ERR|FTL|Verbose|Debug|Information|Warning|Error|Fatal)\]?\s*(.*)",
        RegexOptions.Compiled);

    public List<string> ScanLogFiles(string projectPath)
    {
        var logFiles = new List<string>();
        var patterns = new[] { "*.log", "*.txt" };
        var logDirs = new[] { "logs", "log", "Logs", "Log" };

        // Root'taki log dosyalari
        foreach (var pattern in patterns)
        {
            logFiles.AddRange(Directory.GetFiles(projectPath, pattern, SearchOption.TopDirectoryOnly)
                .Where(f => Path.GetFileName(f).Contains("log", StringComparison.OrdinalIgnoreCase)));
        }

        // logs/ klasoru
        foreach (var logDir in logDirs)
        {
            var dir = Path.Combine(projectPath, logDir);
            if (!Directory.Exists(dir)) continue;
            foreach (var pattern in patterns)
                logFiles.AddRange(Directory.GetFiles(dir, pattern, SearchOption.AllDirectories));
        }

        // Alt projelerdeki log klasorleri
        var subDirs = Directory.GetDirectories(projectPath, "*", SearchOption.TopDirectoryOnly)
            .Where(d => !Path.GetFileName(d).StartsWith('.') && !new[] { "bin", "obj", "node_modules", ".git" }.Contains(Path.GetFileName(d)));

        foreach (var subDir in subDirs)
        {
            foreach (var logDir in logDirs)
            {
                var dir = Path.Combine(subDir, logDir);
                if (!Directory.Exists(dir)) continue;
                foreach (var pattern in patterns)
                    logFiles.AddRange(Directory.GetFiles(dir, pattern, SearchOption.AllDirectories));
            }
        }

        return logFiles
            .Select(f => Path.GetRelativePath(projectPath, f).Replace('\\', '/'))
            .Distinct()
            .OrderByDescending(f => new FileInfo(Path.Combine(projectPath, f.Replace('/', Path.DirectorySeparatorChar))).LastWriteTimeUtc)
            .ToList();
    }

    public async Task<LogResult> ReadLogsAsync(LogReadRequest request)
    {
        var result = new LogResult { FilePath = request.FilePath };

        if (!File.Exists(request.FilePath))
            throw new FileNotFoundException($"Log file not found: {request.FilePath}");

        var allLines = await File.ReadAllLinesAsync(request.FilePath);
        result.TotalLines = allLines.Length;

        // Tail: son N satiri al
        var lines = allLines.Length > request.Tail
            ? allLines.Skip(allLines.Length - request.Tail).ToArray()
            : allLines;

        var startLineNumber = allLines.Length - lines.Length + 1;
        var entries = new List<LogEntry>();

        for (var i = 0; i < lines.Length; i++)
        {
            var line = lines[i];
            if (string.IsNullOrWhiteSpace(line)) continue;

            var entry = ParseLogLine(line, startLineNumber + i);
            if (entry != null)
                entries.Add(entry);
        }

        // Summary (filtre oncesi)
        foreach (var e in entries)
        {
            switch (e.Level.ToLower())
            {
                case "verbose" or "vrb": result.Summary.Verbose++; break;
                case "debug" or "dbg": result.Summary.Debug++; break;
                case "information" or "inf": result.Summary.Information++; break;
                case "warning" or "wrn": result.Summary.Warning++; break;
                case "error" or "err": result.Summary.Error++; break;
                case "fatal" or "ftl": result.Summary.Fatal++; break;
            }
        }

        // Filtreler
        if (!string.IsNullOrWhiteSpace(request.Level))
        {
            var lvl = request.Level.ToLower();
            entries = entries.Where(e => e.Level.ToLower().StartsWith(lvl[..Math.Min(3, lvl.Length)])).ToList();
        }

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search;
            entries = entries.Where(e =>
                e.Message.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                (e.Exception?.Contains(search, StringComparison.OrdinalIgnoreCase) ?? false) ||
                e.Raw.Contains(search, StringComparison.OrdinalIgnoreCase)
            ).ToList();
        }

        if (!string.IsNullOrWhiteSpace(request.CorrelationId))
        {
            entries = entries.Where(e =>
                e.CorrelationId?.Contains(request.CorrelationId, StringComparison.OrdinalIgnoreCase) ?? false
            ).ToList();
        }

        result.Entries = entries;
        result.FilteredCount = entries.Count;
        return result;
    }

    private static LogEntry? ParseLogLine(string line, int lineNumber)
    {
        // Serilog JSON format
        if (SerilogJsonRegex.IsMatch(line))
        {
            try
            {
                using var doc = JsonDocument.Parse(line);
                var root = doc.RootElement;
                var entry = new LogEntry
                {
                    LineNumber = lineNumber,
                    Raw = line,
                    Timestamp = root.TryGetProperty("@t", out var t) ? t.GetString() ?? "" : "",
                    Level = root.TryGetProperty("@l", out var l) ? l.GetString() ?? "Information" : "Information",
                    Message = root.TryGetProperty("@m", out var m) ? m.GetString() ?? "" :
                              root.TryGetProperty("@mt", out var mt) ? mt.GetString() ?? "" : "",
                    Exception = root.TryGetProperty("@x", out var x) ? x.GetString() : null,
                    SourceContext = root.TryGetProperty("SourceContext", out var sc) ? sc.GetString() : null,
                    CorrelationId = root.TryGetProperty("CorrelationId", out var cid) ? cid.GetString() :
                                    root.TryGetProperty("correlationId", out var cid2) ? cid2.GetString() : null,
                };

                // Diger property'ler
                foreach (var prop in root.EnumerateObject())
                {
                    if (prop.Name.StartsWith('@')) continue;
                    if (prop.Name is "SourceContext" or "CorrelationId" or "correlationId") continue;
                    entry.Properties[prop.Name] = prop.Value.ToString();
                }

                return entry;
            }
            catch { /* JSON parse hatasi, plain olarak dene */ }
        }

        // Plain text log format
        var match = PlainLogRegex.Match(line);
        if (match.Success)
        {
            return new LogEntry
            {
                LineNumber = lineNumber,
                Raw = line,
                Timestamp = match.Groups[1].Value,
                Level = NormalizeLevel(match.Groups[2].Value),
                Message = match.Groups[3].Value.Trim(),
            };
        }

        // Bilinmeyen format
        return new LogEntry
        {
            LineNumber = lineNumber,
            Raw = line,
            Message = line,
            Level = "Information"
        };
    }

    private static string NormalizeLevel(string level) => level.ToUpper() switch
    {
        "VRB" => "Verbose",
        "DBG" => "Debug",
        "INF" => "Information",
        "WRN" => "Warning",
        "ERR" => "Error",
        "FTL" => "Fatal",
        _ => level
    };
}
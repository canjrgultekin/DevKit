using Microsoft.AspNetCore.Mvc;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace DevKit.Controllers;

[ApiController]
[Route("api/process")]
public class ProcessManagerController : ControllerBase
{
    private static readonly ConcurrentDictionary<string, ManagedProcess> _processes = new();

    // ═══ START PROCESS ═══
    [HttpPost("start")]
    public IActionResult Start([FromBody] ProcessStartRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Command) || string.IsNullOrWhiteSpace(request.WorkingDirectory))
            return Ok(new { success = false, error = "Command ve WorkingDirectory gerekli." });
        if (!Directory.Exists(request.WorkingDirectory))
            return Ok(new { success = false, error = $"Dizin bulunamadi: {request.WorkingDirectory}" });

        var id = request.Id ?? Guid.NewGuid().ToString("N")[..8];

        if (_processes.ContainsKey(id))
            return Ok(new { success = false, error = $"'{id}' ID'li process zaten calisiyor. Once durdurun." });

        try
        {
            string shell, args;
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            { shell = "cmd.exe"; args = $"/c {request.Command}"; }
            else
            { shell = "sh"; args = $"-c \"{request.Command.Replace("\"", "\\\"")}\""; }

            var psi = new ProcessStartInfo
            {
                FileName = shell,
                Arguments = args,
                WorkingDirectory = request.WorkingDirectory,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                RedirectStandardInput = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };

            var process = new Process { StartInfo = psi, EnableRaisingEvents = true };
            var managed = new ManagedProcess
            {
                Id = id,
                Command = request.Command,
                WorkingDirectory = request.WorkingDirectory,
                StartedAt = DateTime.UtcNow,
                Process = process,
            };

            process.OutputDataReceived += (_, e) => { if (e.Data != null) managed.AppendOutput(e.Data); };
            process.ErrorDataReceived += (_, e) => { if (e.Data != null) managed.AppendError(e.Data); };
            process.Exited += (_, _) =>
            {
                managed.ExitCode = process.ExitCode;
                managed.StoppedAt = DateTime.UtcNow;
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            _processes[id] = managed;

            return Ok(new { success = true, processId = id, command = request.Command, pid = process.Id, message = $"Process baslatildi: {id}" });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ STOP PROCESS ═══
    [HttpPost("stop/{id}")]
    public IActionResult Stop(string id)
    {
        if (!_processes.TryGetValue(id, out var managed))
            return Ok(new { success = false, error = $"Process bulunamadi: {id}" });

        try
        {
            if (!managed.Process.HasExited)
            {
                managed.Process.Kill(true);
                managed.StoppedAt = DateTime.UtcNow;
            }
            return Ok(new { success = true, processId = id, message = "Process durduruldu.", exitCode = managed.ExitCode });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ GET PROCESS OUTPUT ═══
    [HttpGet("output/{id}")]
    public IActionResult GetOutput(string id, [FromQuery] int tail = 50)
    {
        if (!_processes.TryGetValue(id, out var managed))
            return Ok(new { success = false, error = $"Process bulunamadi: {id}" });

        var running = !managed.Process.HasExited;
        var stdout = managed.GetLastOutput(tail);
        var stderr = managed.GetLastErrors(tail);

        return Ok(new
        {
            success = true,
            processId = id,
            running,
            command = managed.Command,
            pid = managed.Process.Id,
            startedAt = managed.StartedAt,
            stoppedAt = managed.StoppedAt,
            exitCode = managed.ExitCode,
            stdout,
            stderr,
        });
    }

    // ═══ SEND INPUT (stdin) ═══
    [HttpPost("input/{id}")]
    public async Task<IActionResult> SendInput(string id, [FromBody] ProcessInputRequest request, CancellationToken ct)
    {
        if (!_processes.TryGetValue(id, out var managed))
            return Ok(new { success = false, error = $"Process bulunamadi: {id}" });

        if (managed.Process.HasExited)
            return Ok(new { success = false, error = "Process zaten sonlanmis.", exitCode = managed.ExitCode });

        try
        {
            await managed.Process.StandardInput.WriteLineAsync(request.Input);
            await managed.Process.StandardInput.FlushAsync();

            // Kisa bir bekleme, ciktinin gelmesi icin
            await Task.Delay(request.WaitMs > 0 ? request.WaitMs : 500, ct);

            return Ok(new
            {
                success = true,
                processId = id,
                inputSent = request.Input,
                running = !managed.Process.HasExited,
                stdout = managed.GetLastOutput(20),
                stderr = managed.GetLastErrors(10),
            });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ LIST PROCESSES ═══
    [HttpGet("list")]
    public IActionResult List()
    {
        var list = _processes.Values.Select(m => new
        {
            id = m.Id,
            command = m.Command,
            running = !m.Process.HasExited,
            pid = m.Process.Id,
            startedAt = m.StartedAt,
            stoppedAt = m.StoppedAt,
            exitCode = m.ExitCode,
        });
        return Ok(new { success = true, count = _processes.Count, processes = list });
    }

    // ═══ REMOVE (cleanup) ═══
    [HttpDelete("{id}")]
    public IActionResult Remove(string id)
    {
        if (!_processes.TryRemove(id, out var managed))
            return Ok(new { success = false, error = $"Process bulunamadi: {id}" });

        try { if (!managed.Process.HasExited) managed.Process.Kill(true); } catch { }
        managed.Process.Dispose();

        return Ok(new { success = true, message = $"Process kaldirildi: {id}" });
    }
}

public class ManagedProcess
{
    public string Id { get; set; } = string.Empty;
    public string Command { get; set; } = string.Empty;
    public string WorkingDirectory { get; set; } = string.Empty;
    public DateTime StartedAt { get; set; }
    public DateTime? StoppedAt { get; set; }
    public int? ExitCode { get; set; }
    public Process Process { get; set; } = null!;

    private readonly Queue<string> _outputLines = new();
    private readonly Queue<string> _errorLines = new();
    private readonly object _lock = new();
    private const int MaxLines = 500;

    public void AppendOutput(string line)
    {
        lock (_lock) { _outputLines.Enqueue(line); while (_outputLines.Count > MaxLines) _outputLines.Dequeue(); }
    }

    public void AppendError(string line)
    {
        lock (_lock) { _errorLines.Enqueue(line); while (_errorLines.Count > MaxLines) _errorLines.Dequeue(); }
    }

    public string GetLastOutput(int n)
    {
        lock (_lock) { return string.Join("\n", _outputLines.TakeLast(n)); }
    }

    public string GetLastErrors(int n)
    {
        lock (_lock) { return string.Join("\n", _errorLines.TakeLast(n)); }
    }
}

public sealed class ProcessStartRequest
{
    public string Command { get; set; } = string.Empty;
    public string WorkingDirectory { get; set; } = string.Empty;
    public string? Id { get; set; }
}

public sealed class ProcessInputRequest
{
    public string Input { get; set; } = string.Empty;
    public int WaitMs { get; set; }
}
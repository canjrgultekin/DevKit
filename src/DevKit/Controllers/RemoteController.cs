using DevKit.Configuration;
using DevKit.Services.Remote;
using Microsoft.AspNetCore.Mvc;

namespace DevKit.Controllers;

[ApiController]
[Route("api")]
public class RemoteController : ControllerBase
{
    private readonly IRemoteSshService _ssh;
    private readonly ProfileManager _profiles;

    public RemoteController(IRemoteSshService ssh, ProfileManager profiles)
    {
        _ssh = ssh;
        _profiles = profiles;
    }

    // ═══════════════════════════════════════════════
    // REMOTE COMMAND EXECUTION
    // ═══════════════════════════════════════════════

    [HttpPost("remote/exec")]
    public async Task<IActionResult> Exec([FromBody] RemoteExecRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Command))
            return Ok(new { success = false, error = "Command gerekli." });

        var (host, error) = ResolveHost(request);
        if (host == null)
            return Ok(new { success = false, error });

        var result = await _ssh.ExecuteAsync(host, request.Command, request.Shell, request.WorkingDirectory, request.TimeoutSeconds, ct);

        return Ok(new
        {
            success = result.Success,
            exitCode = result.ExitCode,
            host = $"{host.Username}@{host.Host}:{host.Port}",
            command = request.Command,
            stdout = result.Stdout,
            stderr = result.Stderr,
            timedOut = result.TimedOut,
            error = result.Error,
        });
    }

    // ═══════════════════════════════════════════════
    // CONNECTION TEST
    // ═══════════════════════════════════════════════

    [HttpPost("remote/host/test")]
    public async Task<IActionResult> Test([FromBody] RemoteExecRequest request, CancellationToken ct)
    {
        var (host, error) = ResolveHost(request);
        if (host == null)
            return Ok(new { success = false, error });

        var result = await _ssh.TestConnectionAsync(host, ct);
        return Ok(new
        {
            success = result.Success,
            host = $"{host.Username}@{host.Host}:{host.Port}",
            serverInfo = result.ServerInfo,
            error = result.Error,
        });
    }

    // ═══════════════════════════════════════════════
    // HOST REGISTRY (named remote profiles)
    // ═══════════════════════════════════════════════

    [HttpPost("remote/host/save")]
    public IActionResult SaveHost([FromBody] RemoteHostSaveRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return Ok(new { success = false, error = "Name gerekli." });
        if (string.IsNullOrWhiteSpace(request.Host) || string.IsNullOrWhiteSpace(request.Username))
            return Ok(new { success = false, error = "Host ve Username gerekli." });

        var authMethod = string.IsNullOrWhiteSpace(request.AuthMethod) ? "password" : request.AuthMethod.ToLowerInvariant();
        if (authMethod is not ("password" or "privatekey"))
            return Ok(new { success = false, error = "AuthMethod 'password' veya 'privatekey' olmali." });

        if (authMethod == "password" && string.IsNullOrEmpty(request.Password))
            return Ok(new { success = false, error = "Password auth icin 'password' gerekli." });
        if (authMethod == "privatekey" && string.IsNullOrWhiteSpace(request.PrivateKeyPath))
            return Ok(new { success = false, error = "Privatekey auth icin 'privateKeyPath' gerekli." });

        var remote = new RemoteHost
        {
            Name = request.Name,
            Host = request.Host,
            Port = request.Port > 0 ? request.Port : 22,
            Username = request.Username,
            AuthMethod = authMethod,
            Password = request.Password,
            PrivateKeyPath = request.PrivateKeyPath,
            Passphrase = request.Passphrase,
            DefaultShell = request.DefaultShell,
            DefaultWorkingDirectory = request.DefaultWorkingDirectory,
            ConnectTimeoutSeconds = request.ConnectTimeoutSeconds > 0 ? request.ConnectTimeoutSeconds : 15,
            Description = request.Description,
        };

        _profiles.SaveRemote(request.Name, remote);
        return Ok(new { success = true, name = request.Name, message = $"Remote host '{request.Name}' kaydedildi." });
    }

    [HttpGet("remote/host/list")]
    public IActionResult ListHosts()
    {
        var hosts = _profiles.GetRemotes().Select(kv => new
        {
            key = kv.Key,
            name = kv.Value.Name,
            host = kv.Value.Host,
            port = kv.Value.Port,
            username = kv.Value.Username,
            authMethod = kv.Value.AuthMethod,
            hasPassword = !string.IsNullOrEmpty(kv.Value.Password),
            privateKeyPath = kv.Value.PrivateKeyPath,
            defaultShell = kv.Value.DefaultShell,
            defaultWorkingDirectory = kv.Value.DefaultWorkingDirectory,
            description = kv.Value.Description,
        }).ToList();

        return Ok(new { success = true, count = hosts.Count, hosts });
    }

    [HttpPost("remote/host/remove")]
    public IActionResult RemoveHost([FromBody] RemoteHostRemoveRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return Ok(new { success = false, error = "Name gerekli." });

        var removed = _profiles.DeleteRemote(request.Name);
        return Ok(new
        {
            success = removed,
            error = removed ? null : $"Remote host '{request.Name}' bulunamadi.",
        });
    }

    // ═══════════════════════════════════════════════
    // INTERNAL
    // ═══════════════════════════════════════════════

    // Kayitli host adi (HostName) verildiyse onu kullan; yoksa inline baglanti bilgisinden host olustur.
    private (RemoteHost? host, string? error) ResolveHost(RemoteExecRequest request)
    {
        if (!string.IsNullOrWhiteSpace(request.HostName))
        {
            var saved = _profiles.GetRemote(request.HostName);
            return saved == null
                ? (null, $"Kayitli remote host bulunamadi: {request.HostName}")
                : (saved, null);
        }

        if (string.IsNullOrWhiteSpace(request.Host) || string.IsNullOrWhiteSpace(request.Username))
            return (null, "Ya 'hostName' (kayitli host) ya da 'host' + 'username' (inline baglanti) gerekli.");

        var authMethod = string.IsNullOrWhiteSpace(request.AuthMethod) ? "password" : request.AuthMethod.ToLowerInvariant();

        var inline = new RemoteHost
        {
            Name = "(inline)",
            Host = request.Host,
            Port = request.Port > 0 ? request.Port : 22,
            Username = request.Username,
            AuthMethod = authMethod,
            Password = request.Password,
            PrivateKeyPath = request.PrivateKeyPath,
            Passphrase = request.Passphrase,
            DefaultShell = request.Shell,
            DefaultWorkingDirectory = request.WorkingDirectory,
            ConnectTimeoutSeconds = request.ConnectTimeoutSeconds > 0 ? request.ConnectTimeoutSeconds : 15,
        };
        return (inline, null);
    }
}

// ═══ REQUEST MODELS ═══

public sealed class RemoteExecRequest
{
    // Kayitli host adi (verilirse inline alanlar yok sayilir)
    public string? HostName { get; set; }

    public string Command { get; set; } = string.Empty;
    public string? Shell { get; set; }
    public string? WorkingDirectory { get; set; }
    public int TimeoutSeconds { get; set; }

    // Inline baglanti (HostName yoksa)
    public string? Host { get; set; }
    public int Port { get; set; }
    public string? Username { get; set; }
    public string? AuthMethod { get; set; }
    public string? Password { get; set; }
    public string? PrivateKeyPath { get; set; }
    public string? Passphrase { get; set; }
    public int ConnectTimeoutSeconds { get; set; }
}

public sealed class RemoteHostSaveRequest
{
    public string Name { get; set; } = string.Empty;
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; } = 22;
    public string Username { get; set; } = string.Empty;
    public string? AuthMethod { get; set; } = "password";
    public string? Password { get; set; }
    public string? PrivateKeyPath { get; set; }
    public string? Passphrase { get; set; }
    public string? DefaultShell { get; set; }
    public string? DefaultWorkingDirectory { get; set; }
    public int ConnectTimeoutSeconds { get; set; } = 15;
    public string? Description { get; set; }
}

public sealed class RemoteHostRemoveRequest
{
    public string Name { get; set; } = string.Empty;
}

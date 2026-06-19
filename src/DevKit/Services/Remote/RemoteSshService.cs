using DevKit.Configuration;
using Renci.SshNet;

namespace DevKit.Services.Remote;

public interface IRemoteSshService
{
    Task<RemoteExecResult> ExecuteAsync(RemoteHost host, string command, string? shell,
        string? workingDirectory, int commandTimeoutSeconds, CancellationToken ct);

    Task<RemoteTestResult> TestConnectionAsync(RemoteHost host, CancellationToken ct);
}

public sealed class RemoteExecResult
{
    public bool Success { get; set; }
    public int ExitCode { get; set; }
    public string Stdout { get; set; } = "";
    public string Stderr { get; set; } = "";
    public bool TimedOut { get; set; }
    public string? Error { get; set; }
}

public sealed class RemoteTestResult
{
    public bool Success { get; set; }
    public string? ServerInfo { get; set; }
    public string? Error { get; set; }
}

public sealed class RemoteSshService : IRemoteSshService
{
    public async Task<RemoteExecResult> ExecuteAsync(RemoteHost host, string command, string? shell,
        string? workingDirectory, int commandTimeoutSeconds, CancellationToken ct)
    {
        try
        {
            var connInfo = BuildConnectionInfo(host);
            var fullCommand = WrapCommand(command, shell ?? host.DefaultShell, workingDirectory ?? host.DefaultWorkingDirectory);
            var timeout = commandTimeoutSeconds > 0 ? commandTimeoutSeconds : 120;

            return await Task.Run(() =>
            {
                using var client = new SshClient(connInfo);
                client.Connect();
                try
                {
                    using var cmd = client.CreateCommand(fullCommand);
                    cmd.CommandTimeout = TimeSpan.FromSeconds(timeout);

                    var stdout = cmd.Execute();

                    // SSH.NET surumleri arasinda ExitStatus int / int? olabiliyor; tipten bagimsiz oku.
                    var exitObj = (object?)cmd.ExitStatus;
                    var exitCode = exitObj is null ? 0 : Convert.ToInt32(exitObj);

                    return new RemoteExecResult
                    {
                        Success = exitCode == 0,
                        ExitCode = exitCode,
                        Stdout = Trim(stdout, 12000),
                        Stderr = Trim(cmd.Error, 6000),
                        TimedOut = false,
                    };
                }
                finally
                {
                    if (client.IsConnected) client.Disconnect();
                }
            }, ct);
        }
        catch (OperationCanceledException)
        {
            return new RemoteExecResult { Success = false, ExitCode = -1, TimedOut = true, Error = "Komut iptal edildi veya timeout asildi." };
        }
        catch (Exception ex)
        {
            return new RemoteExecResult { Success = false, ExitCode = -1, Error = ex.Message };
        }
    }

    public async Task<RemoteTestResult> TestConnectionAsync(RemoteHost host, CancellationToken ct)
    {
        try
        {
            var connInfo = BuildConnectionInfo(host);

            return await Task.Run(() =>
            {
                using var client = new SshClient(connInfo);
                client.Connect();
                try
                {
                    using var cmd = client.CreateCommand("echo devkit-remote-ok && (uname -a 2>/dev/null || ver)");
                    cmd.CommandTimeout = TimeSpan.FromSeconds(10);
                    var output = cmd.Execute();
                    return new RemoteTestResult { Success = client.IsConnected, ServerInfo = Trim(output, 1000).Trim() };
                }
                finally
                {
                    if (client.IsConnected) client.Disconnect();
                }
            }, ct);
        }
        catch (Exception ex)
        {
            return new RemoteTestResult { Success = false, Error = ex.Message };
        }
    }

    // ═══ INTERNAL ═══

    private static ConnectionInfo BuildConnectionInfo(RemoteHost host)
    {
        if (string.IsNullOrWhiteSpace(host.Host)) throw new ArgumentException("Host gerekli.");
        if (string.IsNullOrWhiteSpace(host.Username)) throw new ArgumentException("Username gerekli.");

        var port = host.Port > 0 ? host.Port : 22;
        AuthenticationMethod auth;

        if (string.Equals(host.AuthMethod, "privatekey", StringComparison.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(host.PrivateKeyPath) || !File.Exists(host.PrivateKeyPath))
                throw new ArgumentException($"Private key bulunamadi: {host.PrivateKeyPath}");

            var keyFile = string.IsNullOrEmpty(host.Passphrase)
                ? new PrivateKeyFile(host.PrivateKeyPath)
                : new PrivateKeyFile(host.PrivateKeyPath, host.Passphrase);

            auth = new PrivateKeyAuthenticationMethod(host.Username, keyFile);
        }
        else
        {
            if (string.IsNullOrEmpty(host.Password))
                throw new ArgumentException("Password auth icin parola gerekli.");

            auth = new PasswordAuthenticationMethod(host.Username, host.Password);
        }

        return new ConnectionInfo(host.Host, port, host.Username, auth)
        {
            Timeout = TimeSpan.FromSeconds(host.ConnectTimeoutSeconds > 0 ? host.ConnectTimeoutSeconds : 15),
        };
    }

    private static string WrapCommand(string command, string? shell, string? workingDirectory)
    {
        var s = shell?.ToLowerInvariant();
        var withCd = command;

        if (!string.IsNullOrWhiteSpace(workingDirectory))
        {
            if (s is "powershell" or "pwsh")
                withCd = $"Set-Location -LiteralPath '{workingDirectory}'; {command}";
            else if (s == "cmd")
                withCd = $"cd /d \"{workingDirectory}\" && {command}";
            else // bash/sh/default (POSIX)
                withCd = $"cd '{workingDirectory}' && {command}";
        }

        return s switch
        {
            "bash" => $"bash -lc {DoubleQuote(withCd)}",
            "sh" => $"sh -c {DoubleQuote(withCd)}",
            "powershell" => $"powershell -NoProfile -NonInteractive -Command {DoubleQuote(withCd)}",
            "pwsh" => $"pwsh -NoProfile -NonInteractive -Command {DoubleQuote(withCd)}",
            "cmd" => $"cmd /c {DoubleQuote(withCd)}",
            _ => withCd, // remote'un kendi default shell'ine dogrudan gonder
        };
    }

    private static string DoubleQuote(string s) =>
        "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";

    private static string Trim(string? output, int max)
    {
        if (string.IsNullOrEmpty(output)) return "";
        return output.Length > max ? output[^max..] : output;
    }
}

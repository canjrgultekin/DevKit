using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json.Serialization;

namespace DevKit.Services.Git;

public interface IGitService
{
    Task<GitResult> GetStatusAsync(string workingDir);
    Task<GitResult> GetBranchesAsync(string workingDir);
    Task<GitResult> GetCurrentBranchAsync(string workingDir);
    Task<GitResult> GetLogAsync(string workingDir, int count = 20);
    Task<GitResult> CheckoutAsync(string workingDir, string branch);
    Task<GitResult> CreateBranchAsync(string workingDir, string branchName, bool checkout = true);
    Task<GitResult> DeleteBranchAsync(string workingDir, string branchName, bool force = false);
    Task<GitResult> StageAsync(string workingDir, string path = ".");
    Task<GitResult> CommitAsync(string workingDir, string message);
    Task<GitResult> PushAsync(string workingDir, string? remote = null, string? branch = null, bool setUpstream = false);
    Task<GitResult> PullAsync(string workingDir, string? remote = null, string? branch = null);
    Task<GitResult> FetchAsync(string workingDir, string? remote = null);
    Task<GitResult> MergeAsync(string workingDir, string branch, bool noFf = false);
    Task<GitResult> StashAsync(string workingDir, string? message = null);
    Task<GitResult> StashPopAsync(string workingDir);
    Task<GitResult> DiffAsync(string workingDir, bool staged = false);
    Task<GitResult> ResetAsync(string workingDir, string? path = null);
    Task<GitResult> RunCommandAsync(string workingDir, string arguments);
    Task<GitResult> RunRawCommandAsync(string command, string arguments, string workingDir);
}

public sealed class GitResult
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("output")]
    public string Output { get; set; } = string.Empty;

    [JsonPropertyName("error")]
    public string Error { get; set; } = string.Empty;

    [JsonPropertyName("command")]
    public string Command { get; set; } = string.Empty;
}

public sealed class GitService : IGitService
{
    public async Task<GitResult> GetStatusAsync(string workingDir)
        => await RunGitAsync("status --porcelain --branch", workingDir);

    public async Task<GitResult> GetBranchesAsync(string workingDir)
        => await RunGitAsync("branch -a --no-color", workingDir);

    public async Task<GitResult> GetCurrentBranchAsync(string workingDir)
        => await RunGitAsync("branch --show-current", workingDir);

    public async Task<GitResult> GetLogAsync(string workingDir, int count = 20)
        => await RunGitAsync($"log --oneline --graph --decorate --no-color -n {count}", workingDir);

    public async Task<GitResult> CheckoutAsync(string workingDir, string branch)
        => await RunGitAsync($"checkout {branch}", workingDir);

    public async Task<GitResult> CreateBranchAsync(string workingDir, string branchName, bool checkout = true)
    {
        if (checkout)
            return await RunGitAsync($"checkout -b {branchName}", workingDir);
        return await RunGitAsync($"branch {branchName}", workingDir);
    }

    public async Task<GitResult> DeleteBranchAsync(string workingDir, string branchName, bool force = false)
    {
        var flag = force ? "-D" : "-d";
        return await RunGitAsync($"branch {flag} {branchName}", workingDir);
    }

    public async Task<GitResult> StageAsync(string workingDir, string path = ".")
        => await RunGitAsync($"add {path}", workingDir);

    public async Task<GitResult> CommitAsync(string workingDir, string message)
    {
        var escapedMessage = message.Replace("\"", "\\\"");
        return await RunGitAsync($"commit -m \"{escapedMessage}\"", workingDir);
    }

    public async Task<GitResult> PushAsync(string workingDir, string? remote = null, string? branch = null, bool setUpstream = false)
    {
        var args = "push";
        if (setUpstream) args += " -u";
        if (!string.IsNullOrEmpty(remote)) args += $" {remote}";
        if (!string.IsNullOrEmpty(branch)) args += $" {branch}";
        return await RunGitAsync(args, workingDir);
    }

    public async Task<GitResult> PullAsync(string workingDir, string? remote = null, string? branch = null)
    {
        var args = "pull";
        if (!string.IsNullOrEmpty(remote)) args += $" {remote}";
        if (!string.IsNullOrEmpty(branch)) args += $" {branch}";
        return await RunGitAsync(args, workingDir);
    }

    public async Task<GitResult> FetchAsync(string workingDir, string? remote = null)
    {
        var args = "fetch";
        if (!string.IsNullOrEmpty(remote)) args += $" {remote}";
        else args += " --all";
        return await RunGitAsync(args, workingDir);
    }

    public async Task<GitResult> MergeAsync(string workingDir, string branch, bool noFf = false)
    {
        var args = $"merge {branch}";
        if (noFf) args += " --no-ff";
        return await RunGitAsync(args, workingDir);
    }

    public async Task<GitResult> StashAsync(string workingDir, string? message = null)
    {
        var args = "stash";
        if (!string.IsNullOrEmpty(message))
            args += $" push -m \"{message.Replace("\"", "\\\"")}\"";
        return await RunGitAsync(args, workingDir);
    }

    public async Task<GitResult> StashPopAsync(string workingDir)
        => await RunGitAsync("stash pop", workingDir);

    public async Task<GitResult> DiffAsync(string workingDir, bool staged = false)
    {
        var args = staged ? "diff --cached --stat" : "diff --stat";
        return await RunGitAsync(args, workingDir);
    }

    public async Task<GitResult> ResetAsync(string workingDir, string? path = null)
    {
        var args = string.IsNullOrEmpty(path) ? "reset HEAD" : $"reset HEAD -- {path}";
        return await RunGitAsync(args, workingDir);
    }

    public async Task<GitResult> RunCommandAsync(string workingDir, string arguments)
        => await RunGitAsync(arguments, workingDir);

    public async Task<GitResult> RunRawCommandAsync(string command, string arguments, string workingDir)
    {
        var result = new GitResult { Command = $"{Path.GetFileName(command)} {arguments}" };

        try
        {
            string fileName;
            string processArgs;

            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                fileName = "cmd.exe";
                // Tırnak ile sarmalıyoruz: "C:\Program Files\GitHub CLI\gh.exe"
                processArgs = $"/c \"\"{command}\" {arguments}\"";
            }
            else
            {
                fileName = command;
                processArgs = arguments;
            }

            var psi = new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = processArgs,
                WorkingDirectory = workingDir,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(psi);
            if (process == null)
            {
                result.Error = "Failed to start process";
                return result;
            }

            var outputTask = process.StandardOutput.ReadToEndAsync();
            var errorTask = process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync();

            result.Output = (await outputTask).TrimEnd();
            result.Error = (await errorTask).TrimEnd();
            result.Success = process.ExitCode == 0;
        }
        catch (Exception ex)
        {
            result.Error = $"Error: {ex.Message}";
        }

        return result;
    }

    private static async Task<GitResult> RunGitAsync(string arguments, string workingDir)
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            return await RunProcessAsync("cmd.exe", $"/c git {arguments}", workingDir);

        return await RunProcessAsync("git", arguments, workingDir);
    }

    private static async Task<GitResult> RunProcessAsync(string command, string arguments, string workingDir)
    {
        var result = new GitResult { Command = $"{command} {arguments}" };

        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = command,
                Arguments = arguments,
                WorkingDirectory = workingDir,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(psi);
            if (process == null)
            {
                result.Error = "Failed to start process";
                return result;
            }

            var outputTask = process.StandardOutput.ReadToEndAsync();
            var errorTask = process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync();

            result.Output = (await outputTask).TrimEnd();
            result.Error = (await errorTask).TrimEnd();
            result.Success = process.ExitCode == 0;
        }
        catch (Exception ex)
        {
            result.Error = $"Error: {ex.Message}";
        }

        return result;
    }
}
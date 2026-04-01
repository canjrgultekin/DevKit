using DevKit.Configuration;
using System.Diagnostics;
using System.IO.Compression;
using System.Runtime.InteropServices;
using System.Text.Json.Serialization;

namespace DevKit.Services.Azure;

public interface IAzureService
{
    Task<AzureCommandResult> LoginAsync(AzureConfig config);
    Task<AzureCommandResult> CheckLoginAsync(AzureConfig config);
    Task<AzureCommandResult> PublishAndDeployAsync(string workspace, string framework, AzureConfig config, AzureResource resource);
    Task<AzureCommandResult> DeployZipAsync(AzureConfig config, AzureResource resource, string zipPath);
    Task<AzureCommandResult> SetEnvironmentVariablesAsync(AzureConfig config, AzureResource resource, Dictionary<string, string> variables);
    Task<AzureCommandResult> GetEnvironmentVariablesAsync(AzureConfig config, AzureResource resource);
    Task<AzureCommandResult> RestartAsync(AzureConfig config, AzureResource resource);
    Task<AzureCommandResult> GetLogsAsync(AzureConfig config, AzureResource resource, int lines = 100);
    Task<AzureCommandResult> ExecuteCommandAsync(string command, string arguments);
}

public sealed class AzureCommandResult
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("output")]
    public string Output { get; set; } = string.Empty;

    [JsonPropertyName("error")]
    public string Error { get; set; } = string.Empty;

    [JsonPropertyName("exitCode")]
    public int ExitCode { get; set; }

    [JsonPropertyName("command")]
    public string Command { get; set; } = string.Empty;

    [JsonPropertyName("steps")]
    public List<DeployStep> Steps { get; set; } = new();
}

public sealed class DeployStep
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("output")]
    public string Output { get; set; } = string.Empty;

    [JsonPropertyName("duration")]
    public string Duration { get; set; } = string.Empty;
}

public sealed class AzureService : IAzureService
{
    public async Task<AzureCommandResult> LoginAsync(AzureConfig config)
    {
        var check = await RunAzCliAsync("account show --output json");
        if (check.Success)
        {
            if (!string.IsNullOrEmpty(config.SubscriptionId))
                await RunAzCliAsync($"account set --subscription {config.SubscriptionId}");

            return new AzureCommandResult
            {
                Success = true,
                Output = $"Already logged in. Subscription set to {config.SubscriptionId}",
                Command = "az account show"
            };
        }

        var loginArgs = "login";
        if (!string.IsNullOrEmpty(config.TenantId))
            loginArgs += $" --tenant {config.TenantId}";

        try
        {
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = $"/c az {loginArgs} & pause",
                    UseShellExecute = true,
                    CreateNoWindow = false
                });
            }
            else
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "az",
                    Arguments = loginArgs,
                    UseShellExecute = true
                });
            }

            return new AzureCommandResult
            {
                Success = true,
                Output = "Login window opened. Complete login, then click 'Verify Login'.",
                Command = $"az {loginArgs}"
            };
        }
        catch (Exception ex)
        {
            return new AzureCommandResult
            {
                Success = false,
                Error = $"Failed to open login window: {ex.Message}",
                Command = $"az {loginArgs}"
            };
        }
    }

    public async Task<AzureCommandResult> CheckLoginAsync(AzureConfig config)
    {
        var check = await RunAzCliAsync("account show --output json");
        if (!check.Success)
        {
            check.Error = "Not logged in. Click 'Azure Login' first.";
            return check;
        }

        if (!string.IsNullOrEmpty(config.SubscriptionId))
            await RunAzCliAsync($"account set --subscription {config.SubscriptionId}");

        check.Output = "Login verified!\n" + check.Output;
        return check;
    }

    public async Task<AzureCommandResult> PublishAndDeployAsync(
        string workspace, string framework, AzureConfig config, AzureResource resource)
    {
        var result = new AzureCommandResult { Command = $"publish+deploy {resource.Name}" };
        var normalizedProjectPath = resource.ProjectPath.Replace('/', Path.DirectorySeparatorChar);
        var projectDir = Path.Combine(workspace, normalizedProjectPath);

        if (!Directory.Exists(projectDir))
        {
            result.Error = $"Project directory not found: {projectDir}";
            return result;
        }

        var deployMode = (resource.DeployMode ?? "appservice").ToLowerInvariant();
        var zipPath = Path.Combine(projectDir, ".devkit-deploy.zip");

        try
        {
            // Step 1: Clean
            var cleanStep = new DeployStep { Name = "Clean previous artifacts" };
            var sw = Stopwatch.StartNew();
            if (File.Exists(zipPath)) File.Delete(zipPath);
            // Custom script modunda .devkit-publish temizleme (script kendi output'unu yönetir)
            if (deployMode != "custom-script")
            {
                CleanDirectory(Path.Combine(projectDir, ".devkit-publish"));
                CleanDirectory(Path.Combine(projectDir, ".devkit-webjob-staging"));
            }
            sw.Stop();
            cleanStep.Success = true;
            cleanStep.Output = "Cleaned";
            cleanStep.Duration = $"{sw.ElapsedMilliseconds}ms";
            result.Steps.Add(cleanStep);

            // Step 2: Build
            string publishOutputDir;

            if (deployMode == "custom-script" && !string.IsNullOrWhiteSpace(resource.DeployScript))
            {
                // Custom script modu: kullanıcının deploy script'ini çalıştır
                publishOutputDir = await RunCustomScript(projectDir, resource, result);
                if (publishOutputDir == null) return result; // Hata oldu, step'ler zaten eklendi
            }
            else
            {
                // Standart build
                publishOutputDir = await RunStandardBuild(projectDir, framework, resource, result);
                if (publishOutputDir == null) return result;
            }

            // Step 3: WebJob restructure (gerekiyorsa)
            var isWebJob = deployMode is "webjob-continuous" or "webjob-triggered";
            string zipSourceDir;

            if (isWebJob)
            {
                var jobType = deployMode == "webjob-continuous" ? "continuous" : "triggered";
                var jobName = string.IsNullOrWhiteSpace(resource.WebJobName) ? resource.Name : resource.WebJobName;
                var stagingDir = Path.Combine(projectDir, ".devkit-webjob-staging");

                var wjStep = new DeployStep { Name = $"Structure as WebJob ({jobType}/{jobName})" };
                sw.Restart();

                var jobDir = Path.Combine(stagingDir, "App_Data", "jobs", jobType, jobName);
                Directory.CreateDirectory(jobDir);
                CopyDirectory(publishOutputDir, jobDir);

                sw.Stop();
                wjStep.Success = true;
                wjStep.Output = $"App_Data/jobs/{jobType}/{jobName}/";
                wjStep.Duration = $"{sw.ElapsedMilliseconds}ms";
                result.Steps.Add(wjStep);

                zipSourceDir = stagingDir;
            }
            else
            {
                zipSourceDir = publishOutputDir;
            }

            // Step 4: Zip
            var zipStep = new DeployStep { Name = "Create deployment zip" };
            sw.Restart();

            ZipFile.CreateFromDirectory(zipSourceDir, zipPath);
            var zipSize = new FileInfo(zipPath).Length;

            sw.Stop();
            zipStep.Success = true;
            zipStep.Output = $"{zipSize / 1024.0 / 1024.0:F1} MB";
            zipStep.Duration = $"{sw.ElapsedMilliseconds}ms";
            result.Steps.Add(zipStep);

            // Step 5: Deploy
            var targetAppName = isWebJob && !string.IsNullOrWhiteSpace(resource.WebJobHostApp)
                ? resource.WebJobHostApp
                : resource.Name;

            var deployStep = new DeployStep { Name = $"Deploy to {targetAppName}" };
            sw.Restart();

            var cleanFlag = resource.DeployClean ? " --clean true" : "";
            var deployArgs = $"webapp deploy --resource-group {config.ResourceGroup} --name {targetAppName} --src-path \"{zipPath}\" --type zip{cleanFlag}";
            var deployResult = await RunAzCliAsync(deployArgs);

            sw.Stop();
            deployStep.Duration = $"{sw.Elapsed.TotalSeconds:F1}s";

            if (!deployResult.Success)
            {
                deployStep.Success = false;
                deployStep.Output = deployResult.Error;
                result.Steps.Add(deployStep);
                result.Error = $"Deploy failed:\n{deployResult.Error}";
                return result;
            }

            deployStep.Success = true;
            deployStep.Output = $"Deployed to {targetAppName}";
            result.Steps.Add(deployStep);

            // Step 6: Auto restart (custom script modunda)
            if (deployMode == "custom-script" || resource.DeployClean)
            {
                var restartStep = new DeployStep { Name = $"Restart {targetAppName}" };
                sw.Restart();
                var restartResult = await RunAzCliAsync($"webapp restart --resource-group {config.ResourceGroup} --name {targetAppName}");
                sw.Stop();
                restartStep.Success = restartResult.Success;
                restartStep.Output = restartResult.Success ? "Restarted" : restartResult.Error;
                restartStep.Duration = $"{sw.Elapsed.TotalSeconds:F1}s";
                result.Steps.Add(restartStep);
            }

            // Cleanup
            try
            {
                if (File.Exists(zipPath)) File.Delete(zipPath);
                CleanDirectory(Path.Combine(projectDir, ".devkit-publish"));
                CleanDirectory(Path.Combine(projectDir, ".devkit-webjob-staging"));
            }
            catch { }

            result.Success = true;
            result.Output = $"Successfully deployed {targetAppName}!";
        }
        catch (Exception ex)
        {
            result.Error = $"Unexpected error: {ex.Message}";
        }

        return result;
    }

    private async Task<string?> RunCustomScript(string projectDir, AzureResource resource, AzureCommandResult result)
    {
        var sw = Stopwatch.StartNew();
        var scriptPath = Path.Combine(projectDir, resource.DeployScript.Replace('/', Path.DirectorySeparatorChar));

        var scriptStep = new DeployStep { Name = $"Run {resource.DeployScript}" };

        if (!File.Exists(scriptPath))
        {
            scriptStep.Success = false;
            scriptStep.Output = $"Script not found: {scriptPath}";
            result.Steps.Add(scriptStep);
            result.Error = scriptStep.Output;
            return null;
        }

        AzureCommandResult scriptResult;

        if (scriptPath.EndsWith(".ps1", StringComparison.OrdinalIgnoreCase))
        {
            scriptResult = await RunProcessAsync("powershell", $"-ExecutionPolicy Bypass -File \"{scriptPath}\"", projectDir);
        }
        else if (scriptPath.EndsWith(".sh", StringComparison.OrdinalIgnoreCase))
        {
            scriptResult = await RunProcessAsync("bash", $"\"{scriptPath}\"", projectDir);
        }
        else if (scriptPath.EndsWith(".cmd", StringComparison.OrdinalIgnoreCase) || scriptPath.EndsWith(".bat", StringComparison.OrdinalIgnoreCase))
        {
            scriptResult = await RunProcessAsync("cmd.exe", $"/c \"{scriptPath}\"", projectDir);
        }
        else
        {
            scriptStep.Success = false;
            scriptStep.Output = "Unsupported script type. Use .ps1, .sh, .cmd, or .bat";
            result.Steps.Add(scriptStep);
            result.Error = scriptStep.Output;
            return null;
        }

        sw.Stop();
        scriptStep.Duration = $"{sw.Elapsed.TotalSeconds:F1}s";

        if (!scriptResult.Success)
        {
            scriptStep.Success = false;
            scriptStep.Output = $"{scriptResult.Error}\n{scriptResult.Output}";
            result.Steps.Add(scriptStep);
            result.Error = $"Script failed:\n{scriptResult.Error}\n{scriptResult.Output}";
            return null;
        }

        scriptStep.Success = true;
        scriptStep.Output = "Script completed";
        result.Steps.Add(scriptStep);

        // deployOutputPath kontrolü
        var outputPath = string.IsNullOrWhiteSpace(resource.DeployOutputPath)
            ? projectDir
            : Path.Combine(projectDir, resource.DeployOutputPath.Replace('/', Path.DirectorySeparatorChar));

        if (!Directory.Exists(outputPath))
        {
            var outStep = new DeployStep
            {
                Name = "Verify output",
                Success = false,
                Output = $"Deploy output directory not found: {outputPath}"
            };
            result.Steps.Add(outStep);
            result.Error = outStep.Output;
            return null;
        }

        return outputPath;
    }

    private async Task<string?> RunStandardBuild(string projectDir, string framework, AzureResource resource, AzureCommandResult result)
    {
        var sw = Stopwatch.StartNew();
        var publishDir = Path.Combine(projectDir, ".devkit-publish");
        var buildStep = new DeployStep { Name = $"Build & publish ({framework})" };

        AzureCommandResult buildResult;
        switch (framework.ToLowerInvariant())
        {
            case "dotnet":
                buildResult = await RunProcessAsync("dotnet", $"publish -c Release -o \"{publishDir}\"", projectDir);
                break;
            case "nextjs":
                buildResult = await RunNpmAsync("run build", projectDir);
                if (buildResult.Success)
                {
                    var standalonePath = Path.Combine(projectDir, ".next", "standalone");
                    if (Directory.Exists(standalonePath))
                        CopyDirectory(standalonePath, publishDir);
                    else
                        CopyDirectory(Path.Combine(projectDir, ".next"), publishDir);
                }
                break;
            case "nodejs":
                buildResult = await RunNpmAsync("run build", projectDir);
                if (buildResult.Success)
                {
                    var distDir = Path.Combine(projectDir, "dist");
                    if (Directory.Exists(distDir))
                        CopyDirectory(distDir, publishDir);
                    else
                        CopyDirectory(projectDir, publishDir, excludeDirs: ["node_modules", ".git", ".next"]);
                }
                break;
            case "python":
                // Python: pip install --target ile tüm bağımlılıkları publish dizinine kur
                // Sonra src/ klasörünü de kopyala
                Directory.CreateDirectory(publishDir);

                // requirements.txt varsa pip install
                var requirementsPath = Path.Combine(projectDir, "requirements.txt");
                if (File.Exists(requirementsPath))
                {
                    buildResult = await RunPipAsync($"install -r \"{requirementsPath}\" --target \"{publishDir}\"", projectDir);
                    if (!buildResult.Success) break;
                }

                // src/ klasörünü kopyala
                var srcDir = Path.Combine(projectDir, "src");
                if (Directory.Exists(srcDir))
                {
                    CopyDirectory(srcDir, publishDir);
                }
                else
                {
                    // src/ yoksa tüm .py dosyalarını kopyala
                    CopyDirectory(projectDir, publishDir, excludeDirs: [".venv", "venv", "__pycache__", ".git", ".mypy_cache", ".ruff_cache", ".pytest_cache", "tests", ".devkit-publish"]);
                }

                // .env dosyasını dahil etme ama startup dosyalarını kopyala
                var startupFiles = new[] { "startup.sh", "startup.txt", "web.config" };
                foreach (var sf in startupFiles)
                {
                    var sfPath = Path.Combine(projectDir, sf);
                    if (File.Exists(sfPath))
                        File.Copy(sfPath, Path.Combine(publishDir, sf), true);
                }

                buildResult = new AzureCommandResult { Success = true, Output = "Python package completed" };
                break;
            default:
                buildResult = new AzureCommandResult { Success = false, Error = $"Unsupported framework: {framework}" };
                break;
        }

        sw.Stop();
        buildStep.Duration = $"{sw.Elapsed.TotalSeconds:F1}s";

        if (!buildResult.Success)
        {
            buildStep.Success = false;
            buildStep.Output = buildResult.Error;
            result.Steps.Add(buildStep);
            result.Error = $"Build failed:\n{buildResult.Error}\n{buildResult.Output}";
            return null;
        }

        buildStep.Success = true;
        buildStep.Output = "Build completed";
        result.Steps.Add(buildStep);
        return publishDir;
    }

    public async Task<AzureCommandResult> DeployZipAsync(AzureConfig config, AzureResource resource, string zipPath)
    {
        if (!File.Exists(zipPath))
            return new AzureCommandResult { Success = false, Error = $"File not found: {zipPath}" };

        var cleanFlag = resource.DeployClean ? " --clean true" : "";
        var args = $"webapp deploy --resource-group {config.ResourceGroup} --name {resource.Name} --src-path \"{zipPath}\" --type zip{cleanFlag}";
        return await RunAzCliAsync(args);
    }

    public async Task<AzureCommandResult> SetEnvironmentVariablesAsync(AzureConfig config, AzureResource resource, Dictionary<string, string> variables)
    {
        var settings = string.Join(" ", variables.Select(kvp => $"{kvp.Key}=\"{kvp.Value}\""));
        var targetApp = !string.IsNullOrWhiteSpace(resource.WebJobHostApp) ? resource.WebJobHostApp : resource.Name;
        var args = $"webapp config appsettings set --resource-group {config.ResourceGroup} --name {targetApp} --settings {settings}";
        return await RunAzCliAsync(args);
    }

    public async Task<AzureCommandResult> GetEnvironmentVariablesAsync(AzureConfig config, AzureResource resource)
    {
        var targetApp = !string.IsNullOrWhiteSpace(resource.WebJobHostApp) ? resource.WebJobHostApp : resource.Name;
        var args = $"webapp config appsettings list --resource-group {config.ResourceGroup} --name {targetApp} --output json";
        return await RunAzCliAsync(args);
    }

    public async Task<AzureCommandResult> RestartAsync(AzureConfig config, AzureResource resource)
    {
        var targetApp = !string.IsNullOrWhiteSpace(resource.WebJobHostApp) ? resource.WebJobHostApp : resource.Name;
        var args = $"webapp restart --resource-group {config.ResourceGroup} --name {targetApp}";
        return await RunAzCliAsync(args);
    }

    public async Task<AzureCommandResult> GetLogsAsync(AzureConfig config, AzureResource resource, int lines = 100)
    {
        var targetApp = !string.IsNullOrWhiteSpace(resource.WebJobHostApp) ? resource.WebJobHostApp : resource.Name;

        var tempDir = Path.Combine(Path.GetTempPath(), $"devkit-logs-{Guid.NewGuid():N}");
        var zipPath = Path.Combine(tempDir, "logs.zip");

        try
        {
            Directory.CreateDirectory(tempDir);

            var downloadResult = await RunAzCliAsync(
                $"webapp log download --resource-group {config.ResourceGroup} --name {targetApp} --log-file \"{zipPath}\"");

            if (!downloadResult.Success)
                return downloadResult;

            var extractDir = Path.Combine(tempDir, "extracted");
            ZipFile.ExtractToDirectory(zipPath, extractDir);

            var logLines = new List<string>();
            var logFiles = Directory.GetFiles(extractDir, "*.txt", SearchOption.AllDirectories)
                .Concat(Directory.GetFiles(extractDir, "*.log", SearchOption.AllDirectories))
                .OrderByDescending(f => new FileInfo(f).LastWriteTimeUtc)
                .Take(5)
                .ToList();

            foreach (var logFile in logFiles)
            {
                var fileLines = await File.ReadAllLinesAsync(logFile);
                var fileName = Path.GetRelativePath(extractDir, logFile);
                logLines.Add($"--- {fileName} ---");
                logLines.AddRange(fileLines.TakeLast(lines / Math.Max(logFiles.Count, 1)));
                logLines.Add("");
            }

            return new AzureCommandResult
            {
                Success = true,
                Output = logLines.Count > 0
                    ? string.Join("\n", logLines.TakeLast(lines))
                    : $"No log files found. Enable logging:\naz webapp log config --resource-group {config.ResourceGroup} --name {targetApp} --application-logging filesystem --level information",
                Command = $"logs {targetApp}"
            };
        }
        catch (Exception ex)
        {
            return new AzureCommandResult
            {
                Success = false,
                Error = $"Failed to read logs: {ex.Message}",
                Command = $"logs {targetApp}"
            };
        }
        finally
        {
            try { if (Directory.Exists(tempDir)) Directory.Delete(tempDir, true); } catch { }
        }
    }

    public async Task<AzureCommandResult> ExecuteCommandAsync(string command, string arguments)
    {
        if (command.Equals("az", StringComparison.OrdinalIgnoreCase))
            return await RunAzCliAsync(arguments);

        return await RunProcessAsync(command, arguments);
    }

    // --- Private helpers ---

    private static async Task<AzureCommandResult> RunAzCliAsync(string arguments)
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            return await RunProcessAsync("cmd.exe", $"/c az {arguments}");

        return await RunProcessAsync("az", arguments);
    }

    private static async Task<AzureCommandResult> RunNpmAsync(string arguments, string workingDir)
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            return await RunProcessAsync("cmd.exe", $"/c npm {arguments}", workingDir);

        return await RunProcessAsync("npm", arguments, workingDir);
    }

    private static async Task<AzureCommandResult> RunProcessAsync(string command, string arguments, string? workingDir = null)
    {
        var result = new AzureCommandResult { Command = $"{command} {arguments}" };

        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = command,
                Arguments = arguments,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            if (!string.IsNullOrEmpty(workingDir))
                psi.WorkingDirectory = workingDir;

            using var process = Process.Start(psi);
            if (process == null)
            {
                result.Error = $"Failed to start: {command}";
                return result;
            }

            var outputTask = process.StandardOutput.ReadToEndAsync();
            var errorTask = process.StandardError.ReadToEndAsync();

            await process.WaitForExitAsync();

            result.Output = await outputTask;
            result.Error = await errorTask;
            result.ExitCode = process.ExitCode;
            result.Success = process.ExitCode == 0;
        }
        catch (Exception ex)
        {
            result.Error = $"Process failed: {ex.Message}";
        }

        return result;
    }

    private static void CleanDirectory(string path)
    {
        if (Directory.Exists(path))
            Directory.Delete(path, true);
    }

    private static void CopyDirectory(string source, string destination, string[]? excludeDirs = null)
    {
        if (!Directory.Exists(destination))
            Directory.CreateDirectory(destination);

        foreach (var file in Directory.GetFiles(source))
            File.Copy(file, Path.Combine(destination, Path.GetFileName(file)), true);

        foreach (var dir in Directory.GetDirectories(source))
        {
            var dirName = Path.GetFileName(dir);
            if (excludeDirs != null && excludeDirs.Contains(dirName, StringComparer.OrdinalIgnoreCase))
                continue;

            CopyDirectory(dir, Path.Combine(destination, dirName), excludeDirs);
        }
    }
    private static async Task<AzureCommandResult> RunPipAsync(string arguments, string workingDir)
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            return await RunProcessAsync("cmd.exe", $"/c pip {arguments}", workingDir);

        return await RunProcessAsync("pip3", arguments, workingDir);
    }
}
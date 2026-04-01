using DevKit.Models;

namespace DevKit.Services.Scaffolding;

public sealed class ScaffoldingService : IScaffoldingService
{
    private static readonly string[] Frameworks = ["dotnet", "nextjs", "nodejs", "python"];

    public string[] GetSupportedFrameworks() => Frameworks;

    public ScaffoldResponse Scaffold(ProjectManifest manifest, string mode = "create")
    {
        var response = new ScaffoldResponse { OutputPath = manifest.OutputPath, Mode = mode };

        try
        {
            if (string.IsNullOrWhiteSpace(manifest.OutputPath))
            {
                response.Errors.Add("OutputPath is required.");
                return response;
            }

            if (string.IsNullOrWhiteSpace(manifest.Solution))
            {
                response.Errors.Add("Solution name is required.");
                return response;
            }

            var rootPath = Path.Combine(manifest.OutputPath, manifest.Solution);
            response.OutputPath = rootPath;

            if (!Directory.Exists(rootPath))
            {
                Directory.CreateDirectory(rootPath);
                response.CreatedFolders.Add(rootPath);
            }

            var isUpdate = mode.Equals("update", StringComparison.OrdinalIgnoreCase);

            // Global dosyalar
            foreach (var globalFile in manifest.GlobalFiles)
            {
                var filePath = Path.Combine(rootPath, globalFile.Path);
                var dir = Path.GetDirectoryName(filePath)!;
                if (!Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                    response.CreatedFolders.Add(dir);
                }

                if (isUpdate && File.Exists(filePath))
                {
                    response.SkippedFiles.Add(filePath);
                }
                else
                {
                    File.WriteAllText(filePath, globalFile.Content);
                    response.CreatedFiles.Add(filePath);
                }
            }

            switch (manifest.Framework.ToLowerInvariant())
            {
                case "dotnet":
                    DotNetScaffolder.Scaffold(manifest, rootPath, response, isUpdate);
                    break;
                case "nextjs":
                    NextJsScaffolder.Scaffold(manifest, rootPath, response, isUpdate);
                    break;
                case "nodejs":
                    NodeJsScaffolder.Scaffold(manifest, rootPath, response, isUpdate);
                    break;
                case "python":
                    PythonScaffolder.Scaffold(manifest, rootPath, response, isUpdate);
                    break;
                default:
                    response.Errors.Add($"Unsupported framework: {manifest.Framework}. Supported: {string.Join(", ", Frameworks)}");
                    return response;
            }

            response.Success = response.Errors.Count == 0;
        }
        catch (Exception ex)
        {
            response.Errors.Add($"Unexpected error: {ex.Message}");
        }

        return response;
    }
}
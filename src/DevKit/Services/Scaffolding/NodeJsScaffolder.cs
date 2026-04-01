using DevKit.Models;
using System.Text.Json;

namespace DevKit.Services.Scaffolding;

public static class NodeJsScaffolder
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public static void Scaffold(ProjectManifest manifest, string rootPath, ScaffoldResponse response, bool isUpdate)
    {
        foreach (var project in manifest.Projects)
        {
            var projectDir = Path.Combine(rootPath, project.Path);
            if (!Directory.Exists(projectDir))
            {
                Directory.CreateDirectory(projectDir);
                response.CreatedFolders.Add(projectDir);
            }

            WriteIfNew(Path.Combine(projectDir, "package.json"), () => GeneratePackageJson(project), isUpdate, response);
            WriteIfNew(Path.Combine(projectDir, "tsconfig.json"), GenerateTsConfig, isUpdate, response);

            // Klasörleri oluştur
            foreach (var folder in project.Folders)
            {
                var folderPath = Path.Combine(projectDir, folder);
                if (!Directory.Exists(folderPath))
                {
                    Directory.CreateDirectory(folderPath);
                    response.CreatedFolders.Add(folderPath);
                }
            }

            // Standart klasörler
            foreach (var folder in new[] { "src", "src/routes", "src/services", "src/middleware", "src/types", "src/config" })
            {
                var folderPath = Path.Combine(projectDir, folder);
                if (!Directory.Exists(folderPath))
                {
                    Directory.CreateDirectory(folderPath);
                    response.CreatedFolders.Add(folderPath);
                }
            }

            WriteIfNew(Path.Combine(projectDir, "src", "index.ts"), () => GenerateIndexTs(project.Name), isUpdate, response);

            // Manifest'teki dosyalar
            foreach (var file in project.Files)
            {
                var filePath = Path.Combine(projectDir, file.Path);
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
                    var content = file.Content ?? $"// {Path.GetFileNameWithoutExtension(file.Path)}\n\nexport {{}}\n";
                    File.WriteAllText(filePath, content);
                    response.CreatedFiles.Add(filePath);
                }
            }

            WriteIfNew(Path.Combine(projectDir, ".gitignore"), GenerateNodeGitignore, isUpdate, response);
        }
    }

    private static void WriteIfNew(string path, Func<string> contentFn, bool isUpdate, ScaffoldResponse response)
    {
        var dir = Path.GetDirectoryName(path)!;
        if (!Directory.Exists(dir))
            Directory.CreateDirectory(dir);

        if (isUpdate && File.Exists(path))
        {
            response.SkippedFiles.Add(path);
            return;
        }

        File.WriteAllText(path, contentFn());
        response.CreatedFiles.Add(path);
    }

    private static string GeneratePackageJson(ProjectDefinition project)
    {
        var pkg = new Dictionary<string, object>
        {
            ["name"] = project.Name.ToLowerInvariant(),
            ["version"] = "1.0.0",
            ["private"] = true,
            ["scripts"] = project.Scripts.Count > 0
                ? project.Scripts
                : new Dictionary<string, string>
                {
                    ["dev"] = "tsx watch src/index.ts",
                    ["build"] = "tsc",
                    ["start"] = "node dist/index.js",
                    ["lint"] = "eslint src/"
                },
            ["dependencies"] = project.NpmDependencies.Count > 0
                ? project.NpmDependencies
                : new Dictionary<string, string>(),
            ["devDependencies"] = project.NpmDevDependencies.Count > 0
                ? project.NpmDevDependencies
                : new Dictionary<string, string>
                {
                    ["typescript"] = "^5.8.3",
                    ["@types/node"] = "^22.15.3",
                    ["tsx"] = "^4.19.3",
                    ["eslint"] = "^9.25.1"
                }
        };

        return JsonSerializer.Serialize(pkg, JsonOptions);
    }

    private static string GenerateTsConfig() => """
        {
          "compilerOptions": {
            "target": "ES2022",
            "module": "NodeNext",
            "moduleResolution": "NodeNext",
            "lib": ["ES2022"],
            "outDir": "./dist",
            "rootDir": "./src",
            "strict": true,
            "esModuleInterop": true,
            "skipLibCheck": true,
            "forceConsistentCasingInFileNames": true,
            "resolveJsonModule": true,
            "declaration": true,
            "sourceMap": true,
            "paths": { "@/*": ["./src/*"] }
          },
          "include": ["src/**/*"],
          "exclude": ["node_modules", "dist"]
        }
        """;

    private static string GenerateIndexTs(string name) => $"console.log(\"{name} started\");\n\n// Scaffolded by DevKit\n";

    private static string GenerateNodeGitignore() => "node_modules/\ndist/\n.env\n.env.local\n.DS_Store\n*.tsbuildinfo\ncoverage/\n";
}
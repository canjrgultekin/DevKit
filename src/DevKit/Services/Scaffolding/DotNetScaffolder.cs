using DevKit.Models;
using System.Text;
using System.Text.RegularExpressions;

namespace DevKit.Services.Scaffolding;

public static partial class DotNetScaffolder
{
    [GeneratedRegex(@"Project\(""\{FAE04EC0.*?""\)\s*=\s*""(.+?)""", RegexOptions.Compiled)]
    private static partial Regex SlnProjectNamePattern();

    public static void Scaffold(ProjectManifest manifest, string rootPath, ScaffoldResponse response, bool isUpdate)
    {
        var slnPath = Path.Combine(rootPath, $"{manifest.Solution}.sln");

        if (isUpdate && File.Exists(slnPath))
        {
            // Mevcut sln var: sadece yeni projeleri ekle
            var existingContent = File.ReadAllText(slnPath);
            var existingProjects = ParseExistingProjectNames(existingContent);

            var newProjects = manifest.Projects
                .Where(p => !existingProjects.Contains(p.Name, StringComparer.OrdinalIgnoreCase))
                .ToList();

            if (newProjects.Count > 0)
            {
                var updatedContent = AppendProjectsToSln(existingContent, newProjects, manifest);
                File.WriteAllText(slnPath, updatedContent);
                response.CreatedFiles.Add($"{slnPath} (updated: +{newProjects.Count} projects)");
            }
            else
            {
                response.SkippedFiles.Add(slnPath);
            }
        }
        else
        {
            // Yeni sln oluştur
            var slnContent = GenerateSolutionFile(manifest);
            File.WriteAllText(slnPath, slnContent);
            response.CreatedFiles.Add(slnPath);
        }

        // Her proje için csproj, klasörler ve dosyalar
        foreach (var project in manifest.Projects)
        {
            var projectDir = Path.Combine(rootPath, project.Path);
            if (!Directory.Exists(projectDir))
            {
                Directory.CreateDirectory(projectDir);
                response.CreatedFolders.Add(projectDir);
            }

            // .csproj dosyası
            var csprojPath = Path.Combine(projectDir, $"{project.Name}.csproj");
            if (isUpdate && File.Exists(csprojPath))
            {
                response.SkippedFiles.Add(csprojPath);
            }
            else
            {
                var csprojContent = GenerateCsprojFile(project);
                File.WriteAllText(csprojPath, csprojContent);
                response.CreatedFiles.Add(csprojPath);
            }

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

            // Dosyaları oluştur
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
                    var content = file.Content ?? GenerateDefaultCSharpContent(project.Name, file.Path);
                    File.WriteAllText(filePath, content);
                    response.CreatedFiles.Add(filePath);
                }
            }
        }

        // .gitignore
        var gitignorePath = Path.Combine(rootPath, ".gitignore");
        if (!File.Exists(gitignorePath))
        {
            File.WriteAllText(gitignorePath, GenerateDotNetGitignore());
            response.CreatedFiles.Add(gitignorePath);
        }
        else if (isUpdate)
        {
            response.SkippedFiles.Add(gitignorePath);
        }
    }

    private static HashSet<string> ParseExistingProjectNames(string slnContent)
    {
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (Match match in SlnProjectNamePattern().Matches(slnContent))
        {
            names.Add(match.Groups[1].Value);
        }
        return names;
    }

    private static string AppendProjectsToSln(string existingContent, List<ProjectDefinition> newProjects, ProjectManifest manifest)
    {
        var sb = new StringBuilder();
        var projectEntries = new StringBuilder();
        var configEntries = new StringBuilder();

        foreach (var project in newProjects)
        {
            var guid = Guid.NewGuid().ToString("D").ToUpper();
            var csprojRelPath = Path.Combine(project.Path, $"{project.Name}.csproj").Replace("/", "\\");

            projectEntries.AppendLine($"Project(\"{{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}}\") = \"{project.Name}\", \"{csprojRelPath}\", \"{{{guid}}}\"");
            projectEntries.AppendLine("EndProject");

            configEntries.AppendLine($"\t\t{{{guid}}}.Debug|Any CPU.ActiveCfg = Debug|Any CPU");
            configEntries.AppendLine($"\t\t{{{guid}}}.Debug|Any CPU.Build.0 = Debug|Any CPU");
            configEntries.AppendLine($"\t\t{{{guid}}}.Release|Any CPU.ActiveCfg = Release|Any CPU");
            configEntries.AppendLine($"\t\t{{{guid}}}.Release|Any CPU.Build.0 = Release|Any CPU");
        }

        // "Global" satırından hemen önce yeni projeleri ekle
        var globalIndex = existingContent.IndexOf("Global", StringComparison.Ordinal);
        if (globalIndex > 0)
        {
            sb.Append(existingContent[..globalIndex]);
            sb.Append(projectEntries);
            var remaining = existingContent[globalIndex..];

            // ProjectConfigurationPlatforms bölümünün sonuna yeni config'leri ekle
            var configEndMarker = "\tEndGlobalSection";
            var postSolutionIndex = remaining.IndexOf("postSolution", StringComparison.Ordinal);
            if (postSolutionIndex > 0)
            {
                var endSectionIndex = remaining.IndexOf(configEndMarker, postSolutionIndex, StringComparison.Ordinal);
                if (endSectionIndex > 0)
                {
                    sb.Append(remaining[..endSectionIndex]);
                    sb.Append(configEntries);
                    sb.Append(remaining[endSectionIndex..]);
                }
                else
                {
                    sb.Append(remaining);
                }
            }
            else
            {
                sb.Append(remaining);
            }
        }
        else
        {
            // Global bulunamadı, sona ekle
            sb.Append(existingContent);
            sb.Append(projectEntries);
        }

        return sb.ToString();
    }

    private static string GenerateSolutionFile(ProjectManifest manifest)
    {
        var sb = new StringBuilder();
        sb.AppendLine();
        sb.AppendLine("Microsoft Visual Studio Solution File, Format Version 12.00");
        sb.AppendLine("# Visual Studio Version 17");
        sb.AppendLine("VisualStudioVersion = 17.0.31903.59");
        sb.AppendLine("MinimumVisualStudioVersion = 10.0.40219.1");

        var projectGuids = new Dictionary<string, string>();

        foreach (var project in manifest.Projects)
        {
            var guid = Guid.NewGuid().ToString("D").ToUpper();
            projectGuids[project.Name] = guid;

            var csprojRelPath = Path.Combine(project.Path, $"{project.Name}.csproj").Replace("/", "\\");
            sb.AppendLine($"Project(\"{{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}}\") = \"{project.Name}\", \"{csprojRelPath}\", \"{{{guid}}}\"");
            sb.AppendLine("EndProject");
        }

        sb.AppendLine("Global");
        sb.AppendLine("\tGlobalSection(SolutionConfigurationPlatforms) = preSolution");
        sb.AppendLine("\t\tDebug|Any CPU = Debug|Any CPU");
        sb.AppendLine("\t\tRelease|Any CPU = Release|Any CPU");
        sb.AppendLine("\tEndGlobalSection");
        sb.AppendLine("\tGlobalSection(ProjectConfigurationPlatforms) = postSolution");

        foreach (var kvp in projectGuids)
        {
            sb.AppendLine($"\t\t{{{kvp.Value}}}.Debug|Any CPU.ActiveCfg = Debug|Any CPU");
            sb.AppendLine($"\t\t{{{kvp.Value}}}.Debug|Any CPU.Build.0 = Debug|Any CPU");
            sb.AppendLine($"\t\t{{{kvp.Value}}}.Release|Any CPU.ActiveCfg = Release|Any CPU");
            sb.AppendLine($"\t\t{{{kvp.Value}}}.Release|Any CPU.Build.0 = Release|Any CPU");
        }

        sb.AppendLine("\tEndGlobalSection");
        sb.AppendLine("EndGlobal");

        return sb.ToString();
    }

    private static string GenerateCsprojFile(ProjectDefinition project)
    {
        var sdk = project.Type switch
        {
            "webapi" => "Microsoft.NET.Sdk.Web",
            _ => "Microsoft.NET.Sdk"
        };

        var sb = new StringBuilder();
        sb.AppendLine($"<Project Sdk=\"{sdk}\">");
        sb.AppendLine();
        sb.AppendLine("  <PropertyGroup>");
        sb.AppendLine($"    <TargetFramework>{project.TargetFramework}</TargetFramework>");
        sb.AppendLine("    <ImplicitUsings>enable</ImplicitUsings>");
        sb.AppendLine("    <Nullable>enable</Nullable>");

        if (project.Type is "console" or "worker")
            sb.AppendLine("    <OutputType>Exe</OutputType>");

        sb.AppendLine("  </PropertyGroup>");

        if (project.Dependencies.Count > 0)
        {
            sb.AppendLine();
            sb.AppendLine("  <ItemGroup>");
            foreach (var dep in project.Dependencies)
                sb.AppendLine($"    <PackageReference Include=\"{dep.Package}\" Version=\"{dep.Version}\" />");
            sb.AppendLine("  </ItemGroup>");
        }

        if (project.ProjectReferences.Count > 0)
        {
            sb.AppendLine();
            sb.AppendLine("  <ItemGroup>");
            foreach (var projRef in project.ProjectReferences)
                sb.AppendLine($"    <ProjectReference Include=\"..\\{projRef}\\{projRef}.csproj\" />");
            sb.AppendLine("  </ItemGroup>");
        }

        sb.AppendLine();
        sb.AppendLine("</Project>");

        return sb.ToString();
    }

    private static string GenerateDefaultCSharpContent(string projectName, string filePath)
    {
        var dir = Path.GetDirectoryName(filePath)?.Replace('/', '.').Replace('\\', '.') ?? string.Empty;
        var ns = string.IsNullOrEmpty(dir) ? projectName : $"{projectName}.{dir}";
        var fileName = Path.GetFileNameWithoutExtension(filePath);

        var sb = new StringBuilder();
        sb.AppendLine($"namespace {ns};");
        sb.AppendLine();

        if (fileName.StartsWith("I") && char.IsUpper(fileName.ElementAtOrDefault(1)))
        {
            sb.AppendLine($"public interface {fileName}");
            sb.AppendLine("{");
            sb.AppendLine("}");
        }
        else
        {
            sb.AppendLine($"public class {fileName}");
            sb.AppendLine("{");
            sb.AppendLine("}");
        }

        return sb.ToString();
    }

    private static string GenerateDotNetGitignore()
    {
        return """
               ## .NET
               bin/
               obj/
               *.user
               *.suo
               *.vs/
               .vs/
               *.DotSettings.user
               
               ## Build
               [Dd]ebug/
               [Rr]elease/
               x64/
               x86/
               build/
               
               ## NuGet
               *.nupkg
               **/packages/*
               
               ## Local settings
               appsettings.Local.json
               launchSettings.json
               
               ## OS
               .DS_Store
               Thumbs.db
               """;
    }
}
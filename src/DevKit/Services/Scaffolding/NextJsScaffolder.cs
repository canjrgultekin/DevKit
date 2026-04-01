using DevKit.Models;
using System.Text;
using System.Text.Json;

namespace DevKit.Services.Scaffolding;

public static class NextJsScaffolder
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

            // package.json
            WriteIfNew(Path.Combine(projectDir, "package.json"), () => GeneratePackageJson(project), isUpdate, response);

            // tsconfig.json
            WriteIfNew(Path.Combine(projectDir, "tsconfig.json"), GenerateTsConfig, isUpdate, response);

            // next.config.ts
            WriteIfNew(Path.Combine(projectDir, "next.config.ts"), GenerateNextConfig, isUpdate, response);

            // tailwind.config.ts
            WriteIfNew(Path.Combine(projectDir, "tailwind.config.ts"), GenerateTailwindConfig, isUpdate, response);

            // postcss.config.mjs
            WriteIfNew(Path.Combine(projectDir, "postcss.config.mjs"), GeneratePostcssConfig, isUpdate, response);

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

            // Standart Next.js klasörleri
            foreach (var folder in new[] { "src/app", "src/components", "src/lib", "src/types", "public" })
            {
                var folderPath = Path.Combine(projectDir, folder);
                if (!Directory.Exists(folderPath))
                {
                    Directory.CreateDirectory(folderPath);
                    response.CreatedFolders.Add(folderPath);
                }
            }

            // globals.css, layout.tsx, page.tsx
            WriteIfNew(Path.Combine(projectDir, "src", "app", "globals.css"), GenerateGlobalsCss, isUpdate, response);
            WriteIfNew(Path.Combine(projectDir, "src", "app", "layout.tsx"), () => GenerateLayout(project.Name), isUpdate, response);
            WriteIfNew(Path.Combine(projectDir, "src", "app", "page.tsx"), () => GenerateHomePage(project.Name), isUpdate, response);

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
                    var content = file.Content ?? GenerateDefaultTsContent(file.Path);
                    File.WriteAllText(filePath, content);
                    response.CreatedFiles.Add(filePath);
                }
            }

            // .gitignore
            WriteIfNew(Path.Combine(projectDir, ".gitignore"), GenerateNextGitignore, isUpdate, response);
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
            ["version"] = "0.1.0",
            ["private"] = true,
            ["scripts"] = project.Scripts.Count > 0
                ? project.Scripts
                : new Dictionary<string, string>
                {
                    ["dev"] = "next dev --turbopack",
                    ["build"] = "next build",
                    ["start"] = "next start",
                    ["lint"] = "next lint"
                },
            ["dependencies"] = project.NpmDependencies.Count > 0
                ? project.NpmDependencies
                : new Dictionary<string, string>
                {
                    ["next"] = "15.3.2",
                    ["react"] = "^19.1.0",
                    ["react-dom"] = "^19.1.0"
                },
            ["devDependencies"] = project.NpmDevDependencies.Count > 0
                ? project.NpmDevDependencies
                : new Dictionary<string, string>
                {
                    ["typescript"] = "^5.8.3",
                    ["@types/node"] = "^22.15.3",
                    ["@types/react"] = "^19.1.2",
                    ["@types/react-dom"] = "^19.1.2",
                    ["tailwindcss"] = "^4.1.4",
                    ["@tailwindcss/postcss"] = "^4.1.4",
                    ["eslint"] = "^9.25.1",
                    ["eslint-config-next"] = "15.3.2"
                }
        };

        return JsonSerializer.Serialize(pkg, JsonOptions);
    }

    private static string GenerateTsConfig() => """
        {
          "compilerOptions": {
            "target": "ES2017",
            "lib": ["dom", "dom.iterable", "esnext"],
            "allowJs": true,
            "skipLibCheck": true,
            "strict": true,
            "noEmit": true,
            "esModuleInterop": true,
            "module": "esnext",
            "moduleResolution": "bundler",
            "resolveJsonModule": true,
            "isolatedModules": true,
            "jsx": "preserve",
            "incremental": true,
            "plugins": [{ "name": "next" }],
            "paths": { "@/*": ["./src/*"] }
          },
          "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
          "exclude": ["node_modules"]
        }
        """;

    private static string GenerateNextConfig() => """
        import type { NextConfig } from "next";
        const nextConfig: NextConfig = { reactStrictMode: true };
        export default nextConfig;
        """;

    private static string GenerateTailwindConfig() => """
        import type { Config } from "tailwindcss";
        const config: Config = {
          content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
          theme: { extend: {} },
          plugins: [],
        };
        export default config;
        """;

    private static string GeneratePostcssConfig() => """
        const config = { plugins: { "@tailwindcss/postcss": {} } };
        export default config;
        """;

    private static string GenerateGlobalsCss() => "@import \"tailwindcss\";\n";

    private static string GenerateLayout(string name) => $$"""
        import type { Metadata } from "next";
        import "./globals.css";
        export const metadata: Metadata = { title: "{{name}}", description: "{{name}} application" };
        export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
          return (<html lang="en"><body>{children}</body></html>);
        }
        """;

    private static string GenerateHomePage(string name) => $$"""
        export default function Home() {
          return (
            <main className="flex min-h-screen flex-col items-center justify-center p-24">
              <h1 className="text-4xl font-bold">{{name}}</h1>
              <p className="mt-4 text-lg text-gray-600">Scaffolded by DevKit</p>
            </main>
          );
        }
        """;

    private static string GenerateDefaultTsContent(string filePath)
    {
        var ext = Path.GetExtension(filePath);
        var fileName = Path.GetFileNameWithoutExtension(filePath);

        if (ext is ".tsx" && filePath.Contains("page"))
            return $$"""
                export default function {{char.ToUpper(fileName[0]) + fileName[1..]}}Page() {
                  return (<div><h1>{{fileName}}</h1></div>);
                }
                """;

        if (ext is ".tsx" or ".jsx")
            return $"export default function {fileName}() {{\n  return (<div>{fileName}</div>);\n}}\n";

        return $"// {fileName}\n\nexport {{}}\n";
    }

    private static string GenerateNextGitignore() => "node_modules/\n.next/\nout/\n.env*.local\n.DS_Store\n*.tsbuildinfo\nnext-env.d.ts\n";
}
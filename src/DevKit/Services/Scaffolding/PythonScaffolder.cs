using DevKit.Models;
using System.Text;
using System.Text.Json;

namespace DevKit.Services.Scaffolding;

public static class PythonScaffolder
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

            var projectType = (project.Type ?? "fastapi").ToLowerInvariant();

            // pyproject.toml
            WriteIfNew(
                Path.Combine(projectDir, "pyproject.toml"),
                () => GeneratePyProjectToml(project, projectType),
                isUpdate, response);

            // requirements.txt
            WriteIfNew(
                Path.Combine(projectDir, "requirements.txt"),
                () => GenerateRequirementsTxt(project, projectType),
                isUpdate, response);

            // .env.example
            WriteIfNew(
                Path.Combine(projectDir, ".env.example"),
                () => GenerateEnvExample(projectType),
                isUpdate, response);

            // Standart Python klasörleri
            var packageName = project.Name.ToLowerInvariant().Replace("-", "_").Replace(".", "_");

            var standardFolders = projectType switch
            {
                "django" => new[]
                {
                    $"src/{packageName}",
                    $"src/{packageName}/apps",
                    $"src/{packageName}/settings",
                    "src/templates",
                    "src/static",
                    "tests"
                },
                "flask" => new[]
                {
                    $"src/{packageName}",
                    $"src/{packageName}/routes",
                    $"src/{packageName}/models",
                    $"src/{packageName}/services",
                    "src/templates",
                    "src/static",
                    "tests"
                },
                _ => new[] // fastapi, generic
                {
                    $"src/{packageName}",
                    $"src/{packageName}/api",
                    $"src/{packageName}/api/routes",
                    $"src/{packageName}/core",
                    $"src/{packageName}/models",
                    $"src/{packageName}/schemas",
                    $"src/{packageName}/services",
                    $"src/{packageName}/repositories",
                    "tests",
                    "alembic"
                }
            };

            foreach (var folder in standardFolders)
            {
                var folderPath = Path.Combine(projectDir, folder);
                if (!Directory.Exists(folderPath))
                {
                    Directory.CreateDirectory(folderPath);
                    response.CreatedFolders.Add(folderPath);
                }

                // __init__.py oluştur (src altındaki her Python package'a)
                if (folder.StartsWith("src/") && !folder.Contains("templates") && !folder.Contains("static"))
                {
                    var initPath = Path.Combine(projectDir, folder, "__init__.py");
                    WriteIfNew(initPath, () => "", isUpdate, response);
                }
            }

            // tests/__init__.py
            WriteIfNew(Path.Combine(projectDir, "tests", "__init__.py"), () => "", isUpdate, response);

            // Manifest'teki ek klasörler
            foreach (var folder in project.Folders)
            {
                var folderPath = Path.Combine(projectDir, folder);
                if (!Directory.Exists(folderPath))
                {
                    Directory.CreateDirectory(folderPath);
                    response.CreatedFolders.Add(folderPath);
                }

                // src altındaysa __init__.py ekle
                if (folder.StartsWith("src/") && !folder.Contains("templates") && !folder.Contains("static"))
                {
                    var initPath = Path.Combine(projectDir, folder, "__init__.py");
                    WriteIfNew(initPath, () => "", isUpdate, response);
                }
            }

            // Entry point dosyaları
            switch (projectType)
            {
                case "fastapi":
                    WriteIfNew(
                        Path.Combine(projectDir, $"src/{packageName}/main.py"),
                        () => GenerateFastApiMain(packageName),
                        isUpdate, response);
                    WriteIfNew(
                        Path.Combine(projectDir, $"src/{packageName}/core/config.py"),
                        () => GenerateFastApiConfig(packageName),
                        isUpdate, response);
                    break;
                case "flask":
                    WriteIfNew(
                        Path.Combine(projectDir, $"src/{packageName}/app.py"),
                        () => GenerateFlaskApp(packageName),
                        isUpdate, response);
                    break;
                case "django":
                    WriteIfNew(
                        Path.Combine(projectDir, "src/manage.py"),
                        () => GenerateDjangoManage(packageName),
                        isUpdate, response);
                    WriteIfNew(
                        Path.Combine(projectDir, $"src/{packageName}/settings/__init__.py"),
                        () => GenerateDjangoSettings(packageName),
                        isUpdate, response);
                    WriteIfNew(
                        Path.Combine(projectDir, $"src/{packageName}/urls.py"),
                        () => GenerateDjangoUrls(packageName),
                        isUpdate, response);
                    WriteIfNew(
                        Path.Combine(projectDir, $"src/{packageName}/wsgi.py"),
                        () => GenerateDjangoWsgi(packageName),
                        isUpdate, response);
                    break;
                default: // generic/script
                    WriteIfNew(
                        Path.Combine(projectDir, $"src/{packageName}/main.py"),
                        () => $"# {packageName}\n\ndef main():\n    print(\"{project.Name} started\")\n\nif __name__ == \"__main__\":\n    main()\n",
                        isUpdate, response);
                    break;
            }

            // Dockerfile
            WriteIfNew(
                Path.Combine(projectDir, "Dockerfile"),
                () => GenerateDockerfile(packageName, projectType),
                isUpdate, response);

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
                    var content = file.Content ?? GenerateDefaultPythonContent(file.Path, packageName);
                    File.WriteAllText(filePath, content);
                    response.CreatedFiles.Add(filePath);
                }
            }

            // .gitignore
            WriteIfNew(Path.Combine(projectDir, ".gitignore"), GeneratePythonGitignore, isUpdate, response);
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

    private static string GeneratePyProjectToml(ProjectDefinition project, string projectType)
    {
        var packageName = project.Name.ToLowerInvariant().Replace("-", "_").Replace(".", "_");
        var pythonVersion = !string.IsNullOrEmpty(project.TargetFramework) ? project.TargetFramework : "3.12";

        var sb = new StringBuilder();
        sb.AppendLine("[build-system]");
        sb.AppendLine("requires = [\"setuptools>=68.0\", \"wheel\"]");
        sb.AppendLine("build-backend = \"setuptools.backends._legacy:_Backend\"");
        sb.AppendLine();
        sb.AppendLine("[project]");
        sb.AppendLine($"name = \"{project.Name}\"");
        sb.AppendLine("version = \"0.1.0\"");
        sb.AppendLine($"description = \"{project.Name}\"");
        sb.AppendLine($"requires-python = \">={pythonVersion}\"");
        sb.AppendLine();

        // Dependencies
        var deps = new List<string>();
        if (project.Dependencies.Count > 0)
        {
            foreach (var dep in project.Dependencies)
            {
                deps.Add(string.IsNullOrEmpty(dep.Version) || dep.Version == "*"
                    ? $"\"{dep.Package}\""
                    : $"\"{dep.Package}>={dep.Version}\"");
            }
        }
        else
        {
            deps = projectType switch
            {
                "fastapi" => ["\"fastapi>=0.115.0\"", "\"uvicorn[standard]>=0.34.0\"", "\"pydantic>=2.10.0\"", "\"pydantic-settings>=2.7.0\"", "\"sqlalchemy>=2.0.0\"", "\"alembic>=1.14.0\"", "\"python-dotenv>=1.0.0\""],
                "flask" => ["\"flask>=3.1.0\"", "\"python-dotenv>=1.0.0\"", "\"sqlalchemy>=2.0.0\""],
                "django" => ["\"django>=5.1.0\"", "\"djangorestframework>=3.15.0\"", "\"python-dotenv>=1.0.0\"", "\"psycopg2-binary>=2.9.0\""],
                _ => ["\"python-dotenv>=1.0.0\""]
            };
        }

        sb.AppendLine("dependencies = [");
        foreach (var dep in deps)
            sb.AppendLine($"    {dep},");
        sb.AppendLine("]");
        sb.AppendLine();

        sb.AppendLine("[project.optional-dependencies]");
        sb.AppendLine("dev = [");
        sb.AppendLine("    \"pytest>=8.3.0\",");
        sb.AppendLine("    \"pytest-asyncio>=0.24.0\",");
        sb.AppendLine("    \"ruff>=0.8.0\",");
        sb.AppendLine("    \"mypy>=1.13.0\",");
        sb.AppendLine("]");
        sb.AppendLine();

        sb.AppendLine("[tool.ruff]");
        sb.AppendLine("line-length = 120");
        sb.AppendLine("target-version = \"py312\"");
        sb.AppendLine();
        sb.AppendLine("[tool.ruff.lint]");
        sb.AppendLine("select = [\"E\", \"F\", \"I\", \"N\", \"W\"]");
        sb.AppendLine();
        sb.AppendLine("[tool.mypy]");
        sb.AppendLine("python_version = \"3.12\"");
        sb.AppendLine("strict = true");
        sb.AppendLine();
        sb.AppendLine("[tool.pytest.ini_options]");
        sb.AppendLine("testpaths = [\"tests\"]");
        sb.AppendLine("asyncio_mode = \"auto\"");

        return sb.ToString();
    }

    private static string GenerateRequirementsTxt(ProjectDefinition project, string projectType)
    {
        if (project.Dependencies.Count > 0)
        {
            var sb = new StringBuilder();
            foreach (var dep in project.Dependencies)
            {
                sb.AppendLine(string.IsNullOrEmpty(dep.Version) || dep.Version == "*"
                    ? dep.Package
                    : $"{dep.Package}>={dep.Version}");
            }
            return sb.ToString();
        }

        return projectType switch
        {
            "fastapi" => "fastapi>=0.115.0\nuvicorn[standard]>=0.34.0\npydantic>=2.10.0\npydantic-settings>=2.7.0\nsqlalchemy>=2.0.0\nalembic>=1.14.0\npython-dotenv>=1.0.0\n",
            "flask" => "flask>=3.1.0\npython-dotenv>=1.0.0\nsqlalchemy>=2.0.0\n",
            "django" => "django>=5.1.0\ndjangorestframework>=3.15.0\npython-dotenv>=1.0.0\npsycopg2-binary>=2.9.0\n",
            _ => "python-dotenv>=1.0.0\n"
        };
    }

    private static string GenerateEnvExample(string projectType)
    {
        var sb = new StringBuilder();
        sb.AppendLine("# Application");
        sb.AppendLine("APP_ENV=development");
        sb.AppendLine("DEBUG=true");
        sb.AppendLine();
        sb.AppendLine("# Database");
        sb.AppendLine("DATABASE_URL=postgresql://postgres:postgres@localhost:5432/myapp");
        sb.AppendLine();

        if (projectType == "fastapi")
        {
            sb.AppendLine("# FastAPI");
            sb.AppendLine("HOST=0.0.0.0");
            sb.AppendLine("PORT=8000");
        }
        else if (projectType == "django")
        {
            sb.AppendLine("# Django");
            sb.AppendLine("SECRET_KEY=change-me-in-production");
            sb.AppendLine("ALLOWED_HOSTS=localhost,127.0.0.1");
        }
        else if (projectType == "flask")
        {
            sb.AppendLine("# Flask");
            sb.AppendLine("FLASK_APP=src.app:create_app");
            sb.AppendLine("FLASK_RUN_PORT=5000");
        }

        return sb.ToString();
    }

    private static string GenerateFastApiMain(string packageName)
    {
        return $$"""
                 from fastapi import FastAPI
                 from {{packageName}}.core.config import settings
                 
                 app = FastAPI(
                     title=settings.app_name,
                     version="0.1.0",
                     debug=settings.debug,
                 )
                 
                 
                 @app.get("/health")
                 async def health_check():
                     return {"status": "healthy"}
                 
                 
                 if __name__ == "__main__":
                     import uvicorn
                     uvicorn.run("{{packageName}}.main:app", host=settings.host, port=settings.port, reload=True)
                 """;
    }

    private static string GenerateFastApiConfig(string packageName)
    {
        return """
               from pydantic_settings import BaseSettings
               
               
               class Settings(BaseSettings):
                   app_name: str = "MyApp"
                   debug: bool = False
                   host: str = "0.0.0.0"
                   port: int = 8000
                   database_url: str = "postgresql://postgres:postgres@localhost:5432/myapp"
               
                   class Config:
                       env_file = ".env"
               
               
               settings = Settings()
               """;
    }

    private static string GenerateFlaskApp(string packageName)
    {
        return $$"""
                 from flask import Flask
                 
                 
                 def create_app():
                     app = Flask(__name__)
                 
                     @app.route("/health")
                     def health_check():
                         return {"status": "healthy"}
                 
                     return app
                 
                 
                 if __name__ == "__main__":
                     app = create_app()
                     app.run(debug=True, port=5000)
                 """;
    }

    private static string GenerateDjangoManage(string packageName)
    {
        return $$"""
                 #!/usr/bin/env python
                 import os
                 import sys
                 
                 
                 def main():
                     os.environ.setdefault("DJANGO_SETTINGS_MODULE", "{{packageName}}.settings")
                     from django.core.management import execute_from_command_line
                     execute_from_command_line(sys.argv)
                 
                 
                 if __name__ == "__main__":
                     main()
                 """;
    }

    private static string GenerateDjangoSettings(string packageName)
    {
        return $$"""
                 import os
                 from pathlib import Path
                 from dotenv import load_dotenv
                 
                 load_dotenv()
                 
                 BASE_DIR = Path(__file__).resolve().parent.parent.parent
                 
                 SECRET_KEY = os.getenv("SECRET_KEY", "change-me")
                 DEBUG = os.getenv("DEBUG", "True").lower() == "true"
                 ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
                 
                 INSTALLED_APPS = [
                     "django.contrib.admin",
                     "django.contrib.auth",
                     "django.contrib.contenttypes",
                     "django.contrib.sessions",
                     "django.contrib.messages",
                     "django.contrib.staticfiles",
                     "rest_framework",
                 ]
                 
                 ROOT_URLCONF = "{{packageName}}.urls"
                 WSGI_APPLICATION = "{{packageName}}.wsgi.application"
                 
                 DATABASES = {
                     "default": {
                         "ENGINE": "django.db.backends.postgresql",
                         "NAME": os.getenv("DB_NAME", "myapp"),
                         "USER": os.getenv("DB_USER", "postgres"),
                         "PASSWORD": os.getenv("DB_PASSWORD", "postgres"),
                         "HOST": os.getenv("DB_HOST", "localhost"),
                         "PORT": os.getenv("DB_PORT", "5432"),
                     }
                 }
                 
                 STATIC_URL = "static/"
                 DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
                 """;
    }

    private static string GenerateDjangoUrls(string packageName)
    {
        return """
               from django.contrib import admin
               from django.urls import path
               
               urlpatterns = [
                   path("admin/", admin.site.urls),
               ]
               """;
    }

    private static string GenerateDjangoWsgi(string packageName)
    {
        return $$"""
                 import os
                 from django.core.wsgi import get_wsgi_application
                 
                 os.environ.setdefault("DJANGO_SETTINGS_MODULE", "{{packageName}}.settings")
                 application = get_wsgi_application()
                 """;
    }

    private static string GenerateDockerfile(string packageName, string projectType)
    {
        var cmd = projectType switch
        {
            "fastapi" => $"CMD [\"uvicorn\", \"{packageName}.main:app\", \"--host\", \"0.0.0.0\", \"--port\", \"8000\"]",
            "flask" => $"CMD [\"flask\", \"run\", \"--host\", \"0.0.0.0\", \"--port\", \"5000\"]",
            "django" => "CMD [\"gunicorn\", \"--bind\", \"0.0.0.0:8000\", \"--workers\", \"4\", \"wsgi:application\"]",
            _ => $"CMD [\"python\", \"-m\", \"{packageName}.main\"]"
        };

        return $$"""
                 FROM python:3.12-slim
                 
                 WORKDIR /app
                 
                 COPY requirements.txt .
                 RUN pip install --no-cache-dir -r requirements.txt
                 
                 COPY src/ ./src/
                 
                 ENV PYTHONPATH=/app/src
                 
                 EXPOSE 8000
                 
                 {{cmd}}
                 """;
    }

    private static string GenerateDefaultPythonContent(string filePath, string packageName)
    {
        var fileName = Path.GetFileNameWithoutExtension(filePath);

        if (fileName == "__init__")
            return "";

        if (fileName.StartsWith("test_"))
            return $"# {fileName}\n\n\ndef {fileName}():\n    assert True\n";

        return $"# {fileName}\n";
    }

    private static string GeneratePythonGitignore()
    {
        return """
               __pycache__/
               *.py[cod]
               *$py.class
               *.so
               
               .env
               .env.local
               .venv/
               venv/
               env/
               
               dist/
               build/
               *.egg-info/
               *.egg
               
               .mypy_cache/
               .ruff_cache/
               .pytest_cache/
               htmlcov/
               .coverage
               
               .DS_Store
               Thumbs.db
               .idea/
               .vscode/
               """;
    }
}
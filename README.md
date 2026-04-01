# DevKit

Developer toolkit that bridges AI code generation with real project workflows. Build, scaffold, import, and deploy — all from a single local web interface.

DevKit solves the biggest pain point of AI-assisted development: you get code from Claude (or any AI), then spend 20 minutes creating folders, copying files one by one, and manually deploying. DevKit automates all of that.

## What it does

**Project Scaffolding** — Paste a JSON manifest and DevKit creates the entire project structure on disk: solution files, project files, folders, classes with correct namespaces, package references, everything. Supports .NET, Next.js, and Node.js.

**AI File Import** — Drag and drop files from Claude into DevKit. Each file has a `DEVKIT_PATH` marker in the first line that tells DevKit exactly where it belongs in the project. DevKit reads the marker, places the file in the correct location, and removes the marker line. No more copy-paste.

**Azure Management** — Login, deploy, set environment variables, restart services, view logs, and run custom `az` commands. All from the UI, no terminal switching.

**Profile System** — Manage multiple projects with different frameworks, workspaces, and Azure configurations. Switch between them with one click.

## How it works

```
You describe a project to Claude
        │
        ▼
Claude sends a JSON manifest (project structure)
        │
        ▼
You paste the JSON into DevKit → Scaffold
        │
        ▼
DevKit creates the entire project on disk
        │
        ▼
Claude starts coding, each file has a DEVKIT_PATH marker
        │
        ▼
You download files, drag-drop into DevKit → File Import
        │
        ▼
DevKit places each file at the correct path automatically
        │
        ▼
Click Deploy → DevKit builds, zips, and deploys to Azure
```

## Quick start

### Prerequisites

- [.NET 9 SDK](https://dotnet.microsoft.com/download/dotnet/9.0)
- [Node.js 20+](https://nodejs.org/) (for building the frontend)
- [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli) (optional, for Azure features)

### Installation

```bash
git clone https://github.com/canjrgultekin/devkit.git
cd devkit/src/DevKit/ClientApp
npm install
npm run build
cd ..
dotnet run
```

DevKit opens at `http://localhost:5199`. The React frontend is built into `wwwroot` and served by the .NET backend — no separate frontend server needed in production.

### Development mode

For hot reload during frontend development, run two terminals:

```bash
# Terminal 1: Backend
cd src/DevKit
dotnet run

# Terminal 2: Frontend (hot reload)
cd src/DevKit/ClientApp
npm run dev
```

Frontend dev server runs at `http://localhost:5173` with proxy to the backend.

## Setting up a profile

Go to **Profiles** → **New Profile** and fill in:

| Field | Example | Description |
|-------|---------|-------------|
| Profile Key | `myapp-backend` | Unique short identifier |
| Name | `MyApp Backend` | Display name |
| Workspace Path | `E:\source\myapp\backend` | Root directory of your project on disk |
| Framework | `.NET` | dotnet, nextjs, or nodejs |

For Azure deployment, expand **Azure Configuration**:

| Field | Example |
|-------|---------|
| Subscription ID | `72b7f481-5891-...` |
| Resource Group | `rg-myapp` |

Then **Add Resource** for each Azure resource:

| Field | Example | Description |
|-------|---------|-------------|
| Name | `app-myapp-api` | Azure resource name (as in Azure Portal) |
| Type | `App Service` | appservice, functionapp, containerapp, staticwebapp |
| Project Path | `src/MyApp.Api` | Relative to workspace, which project to publish |
| Deploy Mode | `App Service (auto build)` | See deploy modes below |

### Deploy modes

- **App Service (auto build)** — DevKit runs `dotnet publish` or `npm run build`, zips the output, and deploys via `az webapp deploy`.
- **Custom Script** — DevKit runs your `.ps1` or `.sh` script, zips the output directory you specify, and deploys. Use this when you have a custom build pipeline (e.g., Next.js standalone with static assets and web.config).
- **WebJob (continuous/triggered)** — DevKit publishes, wraps the output in `App_Data/jobs/{type}/{name}/` structure, and deploys to a host App Service.

## Scaffolding a project

### The manifest format

DevKit uses a JSON manifest to describe project structure. Paste it into the **Scaffold** page, set the output path, and click **Scaffold Project**.

```json
{
  "solution": "MyApp",
  "framework": "dotnet",
  "outputPath": "",
  "projects": [
    {
      "name": "MyApp.Domain",
      "path": "src/MyApp.Domain",
      "type": "classlib",
      "targetFramework": "net9.0",
      "folders": ["Entities", "Interfaces"],
      "files": [
        { "path": "Entities/User.cs" },
        { "path": "Interfaces/IUserRepository.cs" }
      ],
      "dependencies": [],
      "projectReferences": [],
      "scripts": {},
      "npmDependencies": {},
      "npmDevDependencies": {}
    }
  ],
  "globalFiles": []
}
```

**Framework options:** `dotnet`, `nextjs`, `nodejs`

**Project types (.NET):** `classlib`, `webapi`, `console`, `worker`, `test`

**What gets created:**
- `.sln` file with all project references
- `.csproj` / `package.json` / `tsconfig.json` per project
- NuGet/npm dependencies pre-configured
- All folders and empty class/interface files with correct namespaces
- `.gitignore` and other global files

## Importing AI-generated files

### The DEVKIT_PATH convention

Every file that Claude (or any AI) generates should have a path marker as the **first line**:

```csharp
// DEVKIT_PATH: src/MyApp.Domain/Entities/User.cs

namespace MyApp.Domain.Entities;

public class User
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
}
```

Supported marker formats:

| File type | Format |
|-----------|--------|
| C#, JS, TS, Java | `// DEVKIT_PATH: path/to/file.cs` |
| Python, YAML | `# DEVKIT_PATH: path/to/file.py` |
| HTML, XML, Razor | `<!-- DEVKIT_PATH: path/to/file.html -->` |
| CSS, SCSS | `/* DEVKIT_PATH: path/to/file.css */` |
| JSON | `"_devkit_path": "path/to/file.json"` (first key) |

### Import workflow

1. Download files from Claude
2. Go to **File Import** page
3. Set the **Project Root** (or it uses the active profile's workspace)
4. Drag and drop files (single or batch)
5. Click **Preview** to verify detected paths
6. Click **Import** — DevKit places each file at the correct location and removes the marker line

If a file already exists at the target path, the imported file overwrites it (last write wins).

## Claude prompt

To make Claude follow the manifest, DEVKIT_PATH, and downloadable file conventions, paste this prompt at the start of your conversation:

```
I use a development tool called DevKit. The following three rules apply throughout
this entire conversation, no exceptions.

===== RULE 1: PROJECT STRUCTURE (MANIFEST JSON) =====

When communicating the project structure, use this exact JSON format:

{
  "solution": "SolutionName",
  "framework": "dotnet",
  "outputPath": "",
  "projects": [
    {
      "name": "SolutionName.Domain",
      "path": "src/SolutionName.Domain",
      "type": "classlib",
      "targetFramework": "net9.0",
      "folders": ["Entities", "Interfaces"],
      "files": [
        { "path": "Entities/Customer.cs" }
      ],
      "dependencies": [],
      "projectReferences": [],
      "scripts": {},
      "npmDependencies": {},
      "npmDevDependencies": {}
    }
  ],
  "globalFiles": []
}

Deliver as a single JSON code block with no surrounding explanation.

===== RULE 2: FILE DELIVERY (DEVKIT_PATH) =====

Add a path marker as the FIRST LINE of every file you code:

C#/JS/TS:  // DEVKIT_PATH: src/Project/Folder/File.cs
Python:    # DEVKIT_PATH: src/services/file.py
HTML:      <!-- DEVKIT_PATH: src/views/index.html -->
CSS:       /* DEVKIT_PATH: src/styles/main.css */
JSON:      "_devkit_path": "src/config/app.json" (first key)

Path must be relative to project root. Use forward slashes.
Leave one blank line after the marker before actual code.
Never deliver a file without the marker.

===== RULE 3: DELIVER FILES AS DOWNLOADABLE =====

Do NOT write code as plain text in the chat. Every file you develop MUST be
delivered as a DOWNLOADABLE FILE. I will download these files and drag-drop
them into DevKit.

File delivery rules:
- Create each file as a separate downloadable file with a download link
- The filename must match the last segment of the DEVKIT_PATH marker
- Do NOT paste code in a code block and say "copy this" — deliver it as a file
- If there are multiple files, deliver each one as a separate downloadable file
- This rule does NOT apply to the manifest JSON — deliver the manifest as a code block

===== WORKFLOW =====

1. I describe the project
2. You deliver the structure as RULE 1 manifest JSON
3. I scaffold it in DevKit
4. You start coding with RULE 2 markers on every file
5. You deliver every file as a downloadable file per RULE 3
6. I download files and drag-drop them into DevKit
```

## Azure deployment

### First time setup

1. Configure Azure settings in your profile (subscription, resource group, resources)
2. Go to **Azure** page → click **Azure Login** (opens a login window)
3. Complete login → click **Verify Login**
4. Select a resource from the dropdown → click **Deploy**

DevKit handles the entire pipeline: build → publish → zip → deploy → cleanup.

### SCM access (if you get 403 on deploy)

If your App Service has SCM IP restrictions, whitelist your IP:

```bash
az webapp config access-restriction add \
  --resource-group rg-myapp \
  --name app-myapp-api \
  --rule-name DevKitDeploy \
  --action Allow \
  --ip-address YOUR_IP/32 \
  --priority 50 \
  --scm-site true
```

### Custom deploy scripts

For projects that need custom build steps (e.g., Next.js with standalone output, static asset copying, web.config injection), set the resource's Deploy Mode to **Custom Script** and provide:

- **Deploy Script**: path to your `.ps1` or `.sh` file (relative to project path)
- **Output Path**: the directory to zip after the script runs (e.g., `.next/standalone`)
- **Clean deploy**: check this to pass `--clean true` to `az webapp deploy`

## Project structure

```
DevKit/
├── DevKit.sln
└── src/DevKit/
    ├── DevKit.csproj
    ├── Program.cs
    ├── Configuration/
    │   ├── DevKitProfile.cs          # Profile, Azure config models
    │   └── ProfileManager.cs         # ~/.devkit/devkit.json management
    ├── Models/
    │   ├── ProjectManifest.cs        # Scaffold manifest models
    │   └── FileImportResult.cs       # Import result models
    ├── Services/
    │   ├── Scaffolding/
    │   │   ├── ScaffoldingService.cs  # Framework routing
    │   │   ├── DotNetScaffolder.cs   # .sln, .csproj, .cs generation
    │   │   ├── NextJsScaffolder.cs   # package.json, app router
    │   │   └── NodeJsScaffolder.cs   # package.json, src structure
    │   ├── FileImport/
    │   │   └── FileImportService.cs  # DEVKIT_PATH parser, 5 format support
    │   └── Azure/
    │       └── AzureService.cs       # az CLI wrapper, all deploy modes
    ├── Controllers/
    │   ├── ProfileController.cs
    │   ├── ScaffoldingController.cs
    │   ├── FileImportController.cs
    │   └── AzureController.cs
    └── ClientApp/                    # React + Vite + Tailwind
        └── src/
            ├── App.tsx
            ├── api.ts
            ├── types.ts
            └── pages/
                ├── DashboardPage.tsx
                ├── ScaffoldPage.tsx
                ├── FileImportPage.tsx
                ├── AzurePage.tsx
                └── ProfilePage.tsx
```

## Configuration

DevKit stores its configuration at `~/.devkit/devkit.json`. This file is managed through the Profiles UI — you don't need to edit it manually.

The config supports multiple profiles, each with its own workspace, framework, and Azure settings. Switch between profiles from the UI and the entire context (file import paths, deploy targets, resource list) switches with it.

## Tech stack

- **Backend:** .NET 9, ASP.NET Core, Kestrel
- **Frontend:** React 19, Vite, Tailwind CSS, React Router, Lucide Icons
- **CLI integration:** Azure CLI (`az`), `dotnet`, `npm`, PowerShell/Bash
- **No database** — config is a JSON file, no external dependencies

## License

MIT

## Author

[Can Gultekin](https://github.com/canjrgultekin)

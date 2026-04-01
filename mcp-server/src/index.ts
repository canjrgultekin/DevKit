#!/usr/bin/env node
/**
 * DevKit MCP Server
 *
 * Bridges AI code generation with real project workflows.
 * Provides tools for project scaffolding, file import, git management,
 * Docker Compose management, Azure deployment, and crypto/credential management.
 * Also serves DevKit prompts for manifest format, DEVKIT_PATH rules, and structure templates.
 *
 * Requires DevKit running at http://localhost:5199
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, existsSync, readdirSync, statSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { devkitApi, formatResult } from "./client.js";

const server = new McpServer({
  name: "devkit-mcp-server",
  version: "1.0.0",
});

// ═══════════════════════════════════════════════
// PROMPTS - DevKit kurallarini ve sablonlarini sunar
// ═══════════════════════════════════════════════

// Dinamik path: dist/index.js calisiyorsa ../../prompts, src/index.ts calisiyorsa ../prompts
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Prompt dosyalarini bul: env var > repo root > npm paket icindeki bundled prompts
function resolvePromptsDir(): string {
  if (process.env.DEVKIT_PROMPTS_DIR && existsSync(process.env.DEVKIT_PROMPTS_DIR)) {
    return process.env.DEVKIT_PROMPTS_DIR;
  }
  // Repo icinden calisiyorsa: mcp-server/dist -> ../../prompts
  const repoPrompts = resolve(__dirname, "..", "..", "prompts");
  if (existsSync(repoPrompts)) return repoPrompts;
  // npm global paket olarak kuruluysa: dist -> ../prompts (bundled)
  const bundledPrompts = resolve(__dirname, "..", "prompts");
  if (existsSync(bundledPrompts)) return bundledPrompts;
  // Fallback
  return repoPrompts;
}

const PROMPTS_DIR = resolvePromptsDir();

// Senkron: local dosyadan oku (registerPrompt icin)
function loadPromptFile(filename: string): string {
  const filePath = join(PROMPTS_DIR, filename);
  if (!existsSync(filePath)) {
    return `[BILGI: ${filename} local'de bulunamadi. DevKit load tool'larini kullanin.]`;
  }
  return readFileSync(filePath, "utf-8");
}

// Asenkron: once local dene, yoksa DevKit API'den cek (npm global install icin)
async function loadPromptFileAsync(filename: string): Promise<string> {
  // 1. Local dosya var mi?
  const filePath = join(PROMPTS_DIR, filename);
  if (existsSync(filePath)) {
    return readFileSync(filePath, "utf-8");
  }

  // 2. DevKit API'den cek (npm global install durumu)
  try {
    const response = await devkitApi<{ success: boolean; content: string; error?: string }>(
      `system/prompt/${filename}`, "GET"
    );
    if (response.success && response.content) {
      return response.content;
    }
  } catch {
    // API de basarisiz
  }

  return `[HATA: ${filename} bulunamadi. DevKit backend calistiginden emin olun.]`;
}

server.registerPrompt(
  "devkit_rules",
  {
    title: "DevKit Kurallari",
    description:
      "DevKit'in 3 temel kuralini yukler: Manifest JSON formati, DEVKIT_PATH marker kurallari ve dosya iletim kurallari. Her yeni proje baslatirken bu prompt'u cagir.",
  },
  () => {
    const content = loadPromptFile("devkit-claude-prompt.md");
    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Asagidaki DevKit kurallarini bu konusma boyunca uygula. Her dosyada DEVKIT_PATH marker'i kullan, proje yapisini manifest JSON formatinda ilet, dosyalari indirilebilir olarak ilet.\n\n${content}`,
          },
        },
      ],
    };
  }
);

server.registerPrompt(
  "devkit_dotnet_structure",
  {
    title: ".NET Proje Yapisi Sablonu",
    description:
      "Clean Architecture .NET projesi icin manifest JSON sablonu. Yeni bir .NET projesi baslatirken kullan.",
  },
  () => {
    const content = loadPromptFile("dotnet-structure-prompt.md");
    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Asagidaki .NET proje yapisi sablonunu referans al. Yeni .NET projesi olustururken bu yapiyi kullan.\n\n${content}`,
          },
        },
      ],
    };
  }
);

server.registerPrompt(
  "devkit_nextjs_structure",
  {
    title: "Next.js Proje Yapisi Sablonu",
    description:
      "Next.js projesi icin manifest JSON sablonu. Yeni bir Next.js projesi baslatirken kullan.",
  },
  () => {
    const content = loadPromptFile("nextjs-structure-prompt.md");
    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Asagidaki Next.js proje yapisi sablonunu referans al. Yeni Next.js projesi olustururken bu yapiyi kullan.\n\n${content}`,
          },
        },
      ],
    };
  }
);

server.registerPrompt(
  "devkit_nodejs_structure",
  {
    title: "Node.js Proje Yapisi Sablonu",
    description:
      "Node.js/TypeScript projesi icin manifest JSON sablonu. Yeni bir Node.js projesi baslatirken kullan.",
  },
  () => {
    const content = loadPromptFile("nodejs-structure-prompt.md");
    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Asagidaki Node.js proje yapisi sablonunu referans al. Yeni Node.js projesi olustururken bu yapiyi kullan.\n\n${content}`,
          },
        },
      ],
    };
  }
);

server.registerPrompt(
  "devkit_python_structure",
  {
    title: "Python Proje Yapisi Sablonu",
    description:
      "FastAPI/Flask/Django projesi icin manifest JSON sablonu. Yeni bir Python projesi baslatirken kullan.",
  },
  () => {
    const content = loadPromptFile("python-structure-prompt.md");
    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Asagidaki Python proje yapisi sablonunu referans al. Yeni Python projesi olustururken bu yapiyi kullan.\n\n${content}`,
          },
        },
      ],
    };
  }
);

server.registerPrompt(
  "devkit_full_setup",
  {
    title: "DevKit Tam Kurulum (Tum Kurallar + Secilen Framework)",
    description:
      "DevKit kurallarini VE secilen framework sablonunu tek seferde yukler. Yeni bir projeye baslarken bunu kullan.",
    argsSchema: {
      framework: z
        .enum(["dotnet", "nextjs", "nodejs", "python"])
        .describe("Hedef framework: dotnet, nextjs, nodejs veya python"),
    },
  },
  ({ framework }) => {
    const rules = loadPromptFile("devkit-claude-prompt.md");

    const structureFile: Record<string, string> = {
      dotnet: "dotnet-structure-prompt.md",
      nextjs: "nextjs-structure-prompt.md",
      nodejs: "nodejs-structure-prompt.md",
      python: "python-structure-prompt.md",
    };

    const structure = loadPromptFile(structureFile[framework]);

    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Bu konusma boyunca asagidaki DevKit kurallarini uygula ve ${framework} proje sablonunu referans al.\n\n===== DEVKIT KURALLARI =====\n\n${rules}\n\n===== ${framework.toUpperCase()} PROJE SABLONU =====\n\n${structure}`,
          },
        },
      ],
    };
  }
);

// ═══════════════════════════════════════════════
// PROMPT LOADER TOOLS - Kullanici "kurallari yukle" dediginde calisir
// ═══════════════════════════════════════════════

server.registerTool(
  "devkit_load_rules",
  {
    title: "DevKit Kurallarini Yukle",
    description: `DevKit'in temel kurallarini yukler: Manifest JSON formati, DEVKIT_PATH marker kurallari ve dosya iletim kurallari.
Kullanici "DevKit kurallarini yukle", "kurallari yukle", "DevKit rules" gibi bir sey soylediginde BU TOOL'U CAGIR.
Bu tool prompt dosyasinin icerigini doner, sonrasinda bu kurallari konusma boyunca uygula.`,
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    const content = await loadPromptFileAsync("devkit-claude-prompt.md");
    return {
      content: [
        {
          type: "text",
          text: `DEVKIT KURALLARI YUKLENDI. Asagidaki kurallari bu konusma boyunca uygula:\n\n${content}`,
        },
      ],
    };
  }
);

server.registerTool(
  "devkit_load_full_setup",
  {
    title: "DevKit Tam Kurulum Yukle",
    description: `DevKit kurallarini VE secilen framework sablonunu tek seferde yukler.
Kullanici "DevKit kurallari + .NET sablonu yukle", "dotnet projesi icin hazirlan", "Python projesi baslat" gibi bir sey dediginde BU TOOL'U CAGIR.
Framework parametresini kullanicinin isteginden cikar.`,
    inputSchema: {
      framework: z
        .enum(["dotnet", "nextjs", "nodejs", "python"])
        .describe("Hedef framework: dotnet, nextjs, nodejs veya python"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ framework }) => {
    const rules = await loadPromptFileAsync("devkit-claude-prompt.md");
    const structureFile: Record<string, string> = {
      dotnet: "dotnet-structure-prompt.md",
      nextjs: "nextjs-structure-prompt.md",
      nodejs: "nodejs-structure-prompt.md",
      python: "python-structure-prompt.md",
    };
    const structure = await loadPromptFileAsync(structureFile[framework]);

    return {
      content: [
        {
          type: "text",
          text: `DEVKIT KURALLARI + ${framework.toUpperCase()} SABLONU YUKLENDI.\nBu konusma boyunca asagidaki kurallari uygula ve ${framework} proje sablonunu referans al.\n\n===== DEVKIT KURALLARI =====\n\n${rules}\n\n===== ${framework.toUpperCase()} PROJE SABLONU =====\n\n${structure}`,
        },
      ],
    };
  }
);

server.registerTool(
  "devkit_load_structure",
  {
    title: "Framework Sablonu Yukle",
    description: `Belirli bir framework icin proje yapisi sablonunu yukler (manifest JSON ornegi).
Kullanici "dotnet sablonunu goster", "Python proje yapisi", "Next.js template" gibi dediginde cagir.`,
    inputSchema: {
      framework: z
        .enum(["dotnet", "nextjs", "nodejs", "python"])
        .describe("Framework: dotnet, nextjs, nodejs veya python"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ framework }) => {
    const structureFile: Record<string, string> = {
      dotnet: "dotnet-structure-prompt.md",
      nextjs: "nextjs-structure-prompt.md",
      nodejs: "nodejs-structure-prompt.md",
      python: "python-structure-prompt.md",
    };
    const content = await loadPromptFileAsync(structureFile[framework]);
    return {
      content: [
        {
          type: "text",
          text: `${framework.toUpperCase()} PROJE SABLONU YUKLENDI:\n\n${content}`,
        },
      ],
    };
  }
);

// ═══════════════════════════════════════════════
// PROFILE TOOLS
// ═══════════════════════════════════════════════

server.registerTool(
  "devkit_list_profiles",
  {
    title: "List DevKit Profiles",
    description:
      "Lists all configured DevKit profiles with their workspace paths, frameworks, and Azure configurations.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    const data = await devkitApi("profile", "GET");
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_get_active_profile",
  {
    title: "Get Active DevKit Profile",
    description: "Returns the currently active DevKit profile including workspace path, framework, and Azure config.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    const data = await devkitApi("profile/active", "GET");
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_set_active_profile",
  {
    title: "Set Active DevKit Profile",
    description: "Switches the active DevKit profile. All subsequent operations will use this profile's workspace.",
    inputSchema: {
      key: z.string().describe("Profile key to activate (e.g., 'my-backend')"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ key }) => {
    const data = await devkitApi(`profile/active/${key}`, "PUT");
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_create_profile",
  {
    title: "Create or Update DevKit Profile",
    description: `Creates a new DevKit profile or updates an existing one.
Includes workspace path, framework, Azure subscription/resource group, and Azure resources (App Service, WebJob etc).
Use when the user says "profil olustur", "Azure bilgilerini ekle", "yeni proje konfigurasyonu yap".`,
    inputSchema: {
      key: z.string().describe("Unique profile key (e.g., 'ecommerce-backend')"),
      name: z.string().describe("Display name (e.g., 'E-Commerce Backend')"),
      workspace: z.string().describe("Workspace root directory (e.g., 'C:\\source\\ecommerce\\backend')"),
      framework: z.enum(["dotnet", "nextjs", "nodejs", "python"]).default("dotnet").describe("Project framework"),
      tenantId: z.string().optional().describe("Azure Tenant ID (optional)"),
      subscriptionId: z.string().optional().describe("Azure Subscription ID"),
      resourceGroup: z.string().optional().describe("Azure Resource Group name"),
      resources: z.array(z.object({
        name: z.string().describe("Azure resource name (e.g., 'app-ecommerce-api')"),
        projectPath: z.string().default("").describe("Relative project path (e.g., 'src/ECommerce.Api')"),
        deployMode: z.enum(["appservice", "custom-script", "webjob-continuous", "webjob-triggered"]).default("appservice"),
      })).optional().describe("Azure resources to deploy"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ key, name, workspace, framework, tenantId, subscriptionId, resourceGroup, resources }) => {
    const profile = {
      name,
      workspace,
      framework,
      azure: {
        tenantId: tenantId || "",
        subscriptionId: subscriptionId || "",
        resourceGroup: resourceGroup || "",
        resources: (resources || []).map(r => ({
          ...r,
          type: "appservice",
          slot: "production",
        })),
      },
    };
    const data = await devkitApi(`profile/${key}`, "POST", profile);
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_delete_profile",
  {
    title: "Delete DevKit Profile",
    description: "Deletes a DevKit profile by its key.",
    inputSchema: {
      key: z.string().describe("Profile key to delete"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  async ({ key }) => {
    const data = await devkitApi(`profile/${key}`, "DELETE");
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

// ═══════════════════════════════════════════════
// SCAFFOLDING TOOLS
// ═══════════════════════════════════════════════

server.registerTool(
  "devkit_scaffold_project",
  {
    title: "Scaffold Project",
    description: `Creates or updates a project structure on disk from a manifest JSON. 
Supports dotnet, nextjs, nodejs, and python frameworks.
Mode 'create' builds everything from scratch. Mode 'update' adds new items without overwriting existing files.`,
    inputSchema: {
      manifest: z.object({
        solution: z.string().describe("Solution/project name"),
        framework: z.enum(["dotnet", "nextjs", "nodejs", "python"]).describe("Target framework"),
        outputPath: z.string().describe("Root directory where project will be created"),
        projects: z.array(
          z.object({
            name: z.string(),
            path: z.string(),
            type: z.string().default("classlib"),
            targetFramework: z.string().default("net9.0"),
            folders: z.array(z.string()).default([]),
            files: z
              .array(z.object({ path: z.string(), content: z.string().optional() }))
              .default([]),
            dependencies: z
              .array(z.object({ package: z.string(), version: z.string() }))
              .default([]),
            projectReferences: z.array(z.string()).default([]),
          })
        ),
        globalFiles: z.array(z.object({ path: z.string(), content: z.string() })).default([]),
      }),
      mode: z
        .enum(["create", "update"])
        .default("create")
        .describe("'create' builds from scratch, 'update' adds new items only"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ manifest, mode }) => {
    const data = await devkitApi("scaffolding", "POST", { manifest, mode });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

// ═══════════════════════════════════════════════
// FILE IMPORT TOOLS
// ═══════════════════════════════════════════════

server.registerTool(
  "devkit_import_file",
  {
    title: "Import File to Project",
    description: `Imports a file into the project by writing it to the correct location based on the DEVKIT_PATH marker.
The file content must have a DEVKIT_PATH marker as the first line.
The projectRoot is the base directory; the file will be placed at projectRoot + DEVKIT_PATH.`,
    inputSchema: {
      projectRoot: z.string().describe("Project root directory"),
      fileName: z.string().describe("File name (e.g., 'User.cs')"),
      content: z.string().describe("Full file content including DEVKIT_PATH marker as first line"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ projectRoot, fileName, content }) => {
    const data = await devkitApi("fileimport/text", "POST", { projectRoot, fileName, content });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_preview_file",
  {
    title: "Preview File Import",
    description: "Shows where a file would be placed based on its DEVKIT_PATH marker without actually writing it.",
    inputSchema: {
      fileName: z.string().describe("File name"),
      content: z.string().describe("File content with DEVKIT_PATH marker"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ fileName, content }) => {
    const data = await devkitApi("fileimport/preview-text", "POST", { fileName, content });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

// ═══════════════════════════════════════════════
// GIT TOOLS
// ═══════════════════════════════════════════════

server.registerTool(
  "devkit_git_status",
  {
    title: "Git Status",
    description: "Shows current git status including modified, staged, and untracked files.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    const data = await devkitApi("git/status", "POST", {});
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_git_current_branch",
  {
    title: "Git Current Branch",
    description: "Returns the name of the currently checked out branch.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    const data = await devkitApi("git/current-branch", "POST", {});
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_git_branches",
  {
    title: "List Git Branches",
    description: "Lists all local and remote branches.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    const data = await devkitApi("git/branches", "POST", {});
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_git_log",
  {
    title: "Git Log",
    description: "Shows recent commit history.",
    inputSchema: {
      count: z.number().int().min(1).max(50).default(15).describe("Number of commits to show"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ count }) => {
    const data = await devkitApi("git/log", "POST", { count });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_git_commit",
  {
    title: "Git Commit",
    description: "Stages all changes and creates a commit with the given message.",
    inputSchema: {
      message: z.string().min(1).describe("Commit message"),
      stageAll: z.boolean().default(true).describe("Stage all changes before committing"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ message, stageAll }) => {
    const data = await devkitApi("git/commit", "POST", { message, stageAll });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_git_push",
  {
    title: "Git Push",
    description: "Pushes commits to the remote repository.",
    inputSchema: {
      remote: z.string().default("origin").describe("Remote name"),
      branch: z.string().optional().describe("Branch name (defaults to current)"),
      setUpstream: z.boolean().default(true).describe("Set upstream tracking (-u)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ remote, branch, setUpstream }) => {
    const data = await devkitApi("git/push", "POST", { remote, branch, setUpstream });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_git_pull",
  {
    title: "Git Pull",
    description: "Pulls changes from the remote repository.",
    inputSchema: {
      remote: z.string().default("origin").describe("Remote name"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ remote }) => {
    const data = await devkitApi("git/pull", "POST", { remote });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_git_fetch",
  {
    title: "Git Fetch",
    description: "Fetches all remote changes without merging.",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    const data = await devkitApi("git/fetch", "POST", {});
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_git_create_branch",
  {
    title: "Create Git Branch",
    description: "Creates a new branch and optionally switches to it.",
    inputSchema: {
      branch: z.string().min(1).describe("New branch name"),
      checkout: z.boolean().default(true).describe("Switch to the new branch"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ branch, checkout }) => {
    const data = await devkitApi("git/create-branch", "POST", { branch, checkout });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_git_checkout",
  {
    title: "Git Checkout",
    description: "Switches to an existing branch.",
    inputSchema: {
      branch: z.string().min(1).describe("Branch name to switch to"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ branch }) => {
    const data = await devkitApi("git/checkout", "POST", { branch });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_git_merge",
  {
    title: "Git Merge",
    description: "Merges the specified branch into the current branch.",
    inputSchema: {
      branch: z.string().min(1).describe("Branch to merge"),
      noFastForward: z.boolean().default(false).describe("Force merge commit (--no-ff)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ branch, noFastForward }) => {
    const data = await devkitApi("git/merge", "POST", { branch, noFastForward });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_git_delete_branch",
  {
    title: "Delete Git Branch",
    description: "Deletes a local branch. Use force=true for unmerged branches.",
    inputSchema: {
      branch: z.string().min(1).describe("Branch name to delete"),
      force: z.boolean().default(false).describe("Force delete even if not merged (-D)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  async ({ branch, force }) => {
    const data = await devkitApi("git/delete-branch", "POST", { branch, force });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_git_stash",
  {
    title: "Git Stash",
    description: "Temporarily saves uncommitted changes to the stash.",
    inputSchema: {
      message: z.string().optional().describe("Optional stash message"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ message }) => {
    const data = await devkitApi("git/stash", "POST", { message });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_git_stash_pop",
  {
    title: "Git Stash Pop",
    description: "Restores the most recent stash and removes it from the stash list.",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async () => {
    const data = await devkitApi("git/stash-pop", "POST", {});
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_git_tag",
  {
    title: "Create Git Tag",
    description: "Creates an annotated or lightweight tag at the current commit.",
    inputSchema: {
      tagName: z.string().min(1).describe("Tag name (e.g., 'v1.0.0')"),
      message: z.string().optional().describe("Tag message (creates annotated tag)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ tagName, message }) => {
    const data = await devkitApi("git/create-tag", "POST", { tagName, message });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_git_push_tags",
  {
    title: "Push All Git Tags",
    description: "Pushes all local tags to the remote repository.",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    const data = await devkitApi("git/push-tags", "POST", {});
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_git_remote_add",
  {
    title: "Add Git Remote",
    description: "Adds a new remote repository URL.",
    inputSchema: {
      name: z.string().default("origin").describe("Remote name"),
      url: z.string().min(1).describe("Remote URL (e.g., 'https://github.com/user/repo.git')"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ name, url }) => {
    const data = await devkitApi("git/remote-add", "POST", { name, url });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_git_remote_remove",
  {
    title: "Remove Git Remote",
    description: "Removes a remote repository by name.",
    inputSchema: {
      name: z.string().min(1).describe("Remote name to remove"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  async ({ name }) => {
    const data = await devkitApi("git/remote-remove", "POST", { name });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_github_create_repo",
  {
    title: "Create GitHub Repository",
    description:
      "Creates a new GitHub repo, initializes git, commits, and pushes. Requires GitHub CLI (gh).",
    inputSchema: {
      repoName: z.string().min(1).describe("Repository name"),
      description: z.string().optional().describe("Repository description"),
      isPrivate: z.boolean().default(true).describe("Private repo"),
      initialCommit: z.boolean().default(true).describe("Stage all and commit"),
      pushAfterCreate: z.boolean().default(true).describe("Push after creating"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ repoName, description, isPrivate, initialCommit, pushAfterCreate }) => {
    const data = await devkitApi("git/github-create", "POST", {
      repoName,
      description,
      private: isPrivate,
      initialCommit,
      pushAfterCreate,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

// ═══════════════════════════════════════════════
// PROJECT SCAN TOOLS
// ═══════════════════════════════════════════════

server.registerTool(
  "devkit_scan_project",
  {
    title: "Scan Existing Project",
    description: `Mevcut bir projenin yapisini tarar ve detayli rapor doner.
Klasor agaci, projeler, dependency'ler, namespace'ler, teknolojiler, config dosyalari ve kaynak dosyalari listelenir.
MEVCUT PROJELERDE CALISMAYA BASLAMADAN ONCE BU TOOL'U CAGIR.
Claude bu bilgiyle dogru DEVKIT_PATH marker'lari uretebilir ve proje yapisini anlayabilir.
rootPath bossa aktif profilin workspace'i kullanilir.`,
    inputSchema: {
      rootPath: z.string().optional().describe("Proje root dizini (bossa aktif profil workspace kullanilir)"),
      maxDepth: z.number().int().min(1).max(20).default(10).describe("Maksimum klasor derinligi"),
      includeFileContents: z.boolean().default(true).describe("Config ve kucuk kaynak dosyalarin icerigini dahil et"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ rootPath, maxDepth, includeFileContents }) => {
    const data = await devkitApi("scan", "POST", {
      rootPath: rootPath || "",
      maxDepth,
      includeFileContents,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_scan_tree",
  {
    title: "Scan Project Tree",
    description: `Projenin klasor ve dosya agacini doner. Hafif versiyon, dosya icerigi yok.
Hizli bir bakis icin kullan, detayli tarama icin devkit_scan_project kullan.`,
    inputSchema: {
      rootPath: z.string().optional().describe("Proje root dizini (bossa aktif profil workspace kullanilir)"),
      maxDepth: z.number().int().min(1).max(20).default(10),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ rootPath, maxDepth }) => {
    const data = await devkitApi("scan/tree", "POST", {
      rootPath: rootPath || "",
      maxDepth,
      includeFileContents: false,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_read_file",
  {
    title: "Read Project File",
    description: `Projedeki bir dosyanin icerigini okur. Relative path kullanilir.
Mevcut kodu incelemek, anlamak veya degistirmek icin kullan.`,
    inputSchema: {
      relativePath: z.string().min(1).describe("Root'a gore relative dosya yolu (orn: 'src/MyApp.Domain/Entities/Customer.cs')"),
      rootPath: z.string().optional().describe("Proje root dizini (bossa aktif profil workspace kullanilir)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ relativePath, rootPath }) => {
    const data = await devkitApi("scan/file", "POST", {
      rootPath: rootPath || "",
      relativePath,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

// ═══════════════════════════════════════════════
// DOCKER TOOLS
// ═══════════════════════════════════════════════

server.registerTool(
  "devkit_docker_services",
  {
    title: "List Available Docker Services",
    description:
      "Lists all available Docker service templates that can be added to docker-compose.yml. Includes Kafka, RabbitMQ, PostgreSQL, MSSQL, Elasticsearch, Kibana, Logstash, Jaeger, Zipkin, Grafana, OTel Collector.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    const data = await devkitApi("docker/services", "GET");
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_docker_generate",
  {
    title: "Generate Docker Compose",
    description: `Generates docker-compose.yml content from selected services and returns connection strings.
Service IDs: kafka, rabbitmq, postgresql, mssql, elasticsearch, kibana, logstash, jaeger, zipkin, grafana, otelcollector.
Smart port management: when Jaeger + OTel Collector are both selected, OTLP ports (4317/4318) are assigned to OTel Collector and removed from Jaeger.`,
    inputSchema: {
      serviceIds: z.array(z.string()).describe("Service IDs to include (e.g., ['postgresql', 'kafka', 'jaeger'])"),
      projectName: z.string().default("myapp").describe("Docker project name (used for container naming and network)"),
      customServices: z.array(z.object({
        name: z.string().describe("Service name"),
        buildContext: z.string().default(".").describe("Docker build context path"),
        dockerfile: z.string().default("Dockerfile").describe("Dockerfile path"),
        ports: z.array(z.object({
          host: z.number().describe("Host port"),
          container: z.number().describe("Container port"),
        })).default([]).describe("Port mappings"),
      })).optional().describe("Custom project services with Dockerfiles"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ serviceIds, projectName, customServices }) => {
    const data = await devkitApi("docker/generate", "POST", {
      services: serviceIds.map(id => ({ id })),
      customServices: customServices || [],
      projectName,
      networkName: `${projectName}-net`,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_docker_save",
  {
    title: "Save Docker Compose to Disk",
    description:
      "Saves docker-compose.yml content to the specified directory. Optionally generates otel-collector-config.yml if OTel Collector is used.",
    inputSchema: {
      outputPath: z.string().describe("Directory where docker-compose.yml will be saved"),
      content: z.string().describe("YAML content to write"),
      generateOtelConfig: z.boolean().default(false).describe("Also generate otel-collector-config.yml"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ outputPath, content, generateOtelConfig }) => {
    const body: Record<string, unknown> = { outputPath, content };
    if (generateOtelConfig) {
      body.otelConfig = {
        enableJaeger: true,
        enableZipkin: true,
        enablePrometheus: true,
        enableElastic: true,
      };
    }
    const data = await devkitApi("docker/save", "POST", body);
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_docker_inject_appsettings",
  {
    title: "Inject Connection Strings to AppSettings",
    description:
      "Injects Docker service connection strings into an appsettings.json file. Adds missing keys, updates existing ones.",
    inputSchema: {
      appSettingsPath: z.string().describe("Full path to appsettings.json file"),
      connectionStrings: z.record(z.string()).describe("Key-value pairs to inject (e.g., {'ConnectionStrings:DefaultConnection': 'Host=localhost...'})"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ appSettingsPath, connectionStrings }) => {
    const data = await devkitApi("docker/inject-appsettings", "POST", {
      appSettingsPath,
      connectionStrings,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_docker_up",
  {
    title: "Docker Compose Up",
    description: "Starts all services defined in docker-compose.yml in detached mode.",
    inputSchema: {
      workingDir: z.string().optional().describe("Directory containing docker-compose.yml (defaults to active profile workspace)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ workingDir }) => {
    const data = await devkitApi("docker/compose/up", "POST", { workingDir, detached: true });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_docker_down",
  {
    title: "Docker Compose Down",
    description: "Stops and removes all containers. Use removeVolumes=true to also delete data volumes.",
    inputSchema: {
      workingDir: z.string().optional().describe("Directory containing docker-compose.yml"),
      removeVolumes: z.boolean().default(false).describe("Also remove data volumes (-v)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  },
  async ({ workingDir, removeVolumes }) => {
    const data = await devkitApi("docker/compose/down", "POST", { workingDir, removeVolumes });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_docker_ps",
  {
    title: "Docker Compose Status",
    description: "Shows running containers and their status.",
    inputSchema: {
      workingDir: z.string().optional().describe("Directory containing docker-compose.yml"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ workingDir }) => {
    const data = await devkitApi("docker/compose/ps", "POST", { workingDir });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_docker_logs",
  {
    title: "Docker Compose Logs",
    description: "Shows container logs. Optionally filter by service name.",
    inputSchema: {
      workingDir: z.string().optional().describe("Directory containing docker-compose.yml"),
      serviceName: z.string().optional().describe("Specific service name to get logs for"),
      tail: z.number().default(100).describe("Number of lines to show"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ workingDir, serviceName, tail }) => {
    const data = await devkitApi("docker/compose/logs", "POST", { workingDir, serviceName, tail });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

// ═══════════════════════════════════════════════
// AZURE TOOLS
// ═══════════════════════════════════════════════

server.registerTool(
  "devkit_azure_login",
  {
    title: "Azure Login",
    description: "Opens Azure login dialog. On Windows opens a separate command window to avoid blocking.",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async () => {
    const data = await devkitApi("azure/login", "POST", {});
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_azure_verify_login",
  {
    title: "Verify Azure Login",
    description: "Checks if Azure CLI is logged in and the correct subscription is selected.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async () => {
    const data = await devkitApi("azure/verify-login", "POST", {});
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_azure_deploy",
  {
    title: "Deploy to Azure",
    description: "Builds and deploys to Azure App Service. Supports appservice, custom-script, webjob-continuous, and webjob-triggered modes.",
    inputSchema: {
      resourceName: z.string().describe("Azure resource name from profile"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ resourceName }) => {
    const data = await devkitApi(`azure/deploy/${resourceName}`, "POST", {});
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_azure_restart",
  {
    title: "Restart Azure App",
    description: "Restarts an Azure App Service.",
    inputSchema: { resourceName: z.string().describe("Azure resource name") },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ resourceName }) => {
    const data = await devkitApi(`azure/restart/${resourceName}`, "POST", {});
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_azure_logs",
  {
    title: "Get Azure App Logs",
    description: "Retrieves recent logs from an Azure App Service.",
    inputSchema: { resourceName: z.string().describe("Azure resource name") },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ resourceName }) => {
    const data = await devkitApi(`azure/logs/${resourceName}`, "GET");
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_azure_env_get",
  {
    title: "Get Azure Environment Variables",
    description: "Lists all environment variables (app settings) for an Azure App Service.",
    inputSchema: { resourceName: z.string().describe("Azure resource name") },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ resourceName }) => {
    const data = await devkitApi(`azure/env/${resourceName}`, "GET");
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_azure_env_set",
  {
    title: "Set Azure Environment Variable",
    description: "Sets or updates an environment variable on an Azure App Service.",
    inputSchema: {
      resourceName: z.string().describe("Azure resource name"),
      key: z.string().describe("Environment variable name"),
      value: z.string().describe("Environment variable value"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ resourceName, key, value }) => {
    const data = await devkitApi(`azure/env/${resourceName}`, "POST", {
      variables: { [key]: value },
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

// ═══════════════════════════════════════════════
// CRYPTO TOOLS
// ═══════════════════════════════════════════════

server.registerTool(
  "devkit_crypto_decrypt",
  {
    title: "Decrypt Value",
    description: "Decrypts a single AES-256-GCM encrypted value.",
    inputSchema: {
      masterKey: z.string().min(1).describe("Master key"),
      ciphertext: z.string().min(1).describe("Base64-encoded ciphertext"),
      algorithm: z.string().default("AES-256-GCM"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ masterKey, ciphertext, algorithm }) => {
    const data = await devkitApi("crypto/decrypt-single", "POST", { masterKey, ciphertext, algorithm });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "devkit_crypto_encrypt",
  {
    title: "Encrypt Value",
    description: "Encrypts a plaintext value using AES-256-GCM.",
    inputSchema: {
      masterKey: z.string().min(1).describe("Master key"),
      plaintext: z.string().min(1).describe("Plaintext to encrypt"),
      algorithm: z.string().default("AES-256-GCM"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ masterKey, plaintext, algorithm }) => {
    const data = await devkitApi("crypto/encrypt-single", "POST", { masterKey, plaintext, algorithm });
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

// ═══════════════════════════════════════════════
// CLI COMMANDS: --setup, --cleanup
// ═══════════════════════════════════════════════

function findClaudeConfigPath(): string | null {
  const platform = process.platform;
  const home = process.env.HOME || process.env.USERPROFILE || "";

  if (platform === "win32") {
    const paths = [
      // Microsoft Store kurulum
      ...(() => {
        try {
          const packagesDir = join(home, "AppData", "Local", "Packages");
          const entries = readdirSync(packagesDir) as string[];
          return entries
            .filter((e: string) => e.startsWith("Claude_"))
            .map((e: string) => join(packagesDir, e, "LocalCache", "Roaming", "Claude", "claude_desktop_config.json"));
        } catch { return []; }
      })(),
      // Normal kurulum
      join(process.env.APPDATA || join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json"),
    ];

    for (const p of paths) {
      // Config dosyasi varsa veya dizini varsa (yeni olusturulacak)
      const dir = dirname(p);
      if (existsSync(dir)) return p;
    }
    return paths[paths.length - 1]; // fallback: normal kurulum yolu
  }

  if (platform === "darwin") {
    return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }

  // Linux
  return join(home, ".config", "Claude", "claude_desktop_config.json");
}

function runSetup(): void {
  console.log("DevKit MCP Server - Claude Desktop Setup");
  console.log("=========================================\n");

  const configPath = findClaudeConfigPath();
  if (!configPath) {
    console.error("Claude Desktop config dizini bulunamadi.");
    process.exit(1);
  }

  console.log(`Config dosyasi: ${configPath}\n`);

  // Mevcut config'i oku veya bos olustur
  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, "utf-8");
      config = JSON.parse(raw);
      console.log("Mevcut config bulundu, guncelleniyor...");
    } catch {
      console.log("Mevcut config okunamadi, yeni olusturuluyor...");
    }
  } else {
    // Dizin yoksa olustur
    const dir = dirname(configPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    console.log("Yeni config olusturuluyor...");
  }

  // mcpServers blogu ekle/guncelle
  if (!config.mcpServers || typeof config.mcpServers !== "object") {
    config.mcpServers = {};
  }

  (config.mcpServers as Record<string, unknown>)["devkit"] = {
    command: "devkit-mcp-server",
    env: {
      DEVKIT_URL: "http://localhost:5199",
    },
  };

  // Kaydet
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

  console.log("\nDevKit MCP server basariyla eklendi!");
  console.log(`\nConfig: ${configPath}`);
  console.log("\nSimdi Claude Desktop'i yeniden baslatin.");
}

function runCleanup(): void {
  console.log("DevKit MCP Server - Claude Desktop Cleanup");
  console.log("==========================================\n");

  const configPath = findClaudeConfigPath();
  if (!configPath) { console.log("Config bulunamadi."); return; }

  // vm_bundles temizligi
  const claudeDir = dirname(configPath);
  const vmBundlesDir = join(claudeDir, "vm_bundles");

  if (existsSync(vmBundlesDir)) {
    const entries = readdirSync(vmBundlesDir) as string[];
    let totalSize = 0;
    for (const entry of entries) {
      const entryPath = join(vmBundlesDir, entry);
      try {
        const stats = statSync(entryPath);
        totalSize += stats.size;
      } catch { /* skip */ }
    }
    const sizeGB = (totalSize / (1024 * 1024 * 1024)).toFixed(2);
    console.log(`vm_bundles: ${sizeGB} GB`);

    if (entries.length > 0) {
      rmSync(vmBundlesDir, { recursive: true, force: true });
      mkdirSync(vmBundlesDir, { recursive: true });
      console.log("vm_bundles temizlendi!");
    }
  }

  // Cache temizligi
  const cacheDir = join(claudeDir, "Cache");
  if (existsSync(cacheDir)) {
    rmSync(cacheDir, { recursive: true, force: true });
    mkdirSync(cacheDir, { recursive: true });
    console.log("Cache temizlendi!");
  }

  console.log("\nTemizlik tamamlandi. Claude Desktop'i yeniden baslatin.");
}

function runSetupCode(): void {
  console.log("DevKit MCP Server - Claude Code Setup");
  console.log("=====================================\n");

  // Claude Code kurulu mu kontrol et
  try {
    execSync("claude --version", { stdio: "pipe" });
  } catch {
    console.error("Claude Code bulunamadi. Once Claude Code'u kurun:");
    console.error("  npm install -g @anthropic-ai/claude-code");
    process.exit(1);
  }

  // Mevcut MCP listesini kontrol et, varsa kaldir
  try {
    const list = execSync("claude mcp list", { encoding: "utf-8", stdio: "pipe" });
    if (list.includes("devkit")) {
      console.log("DevKit zaten Claude Code'a ekli. Guncelleniyor...");
      try { execSync("claude mcp remove devkit", { stdio: "pipe" }); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  // DevKit MCP server'i ekle (user scope = tum projelerde)
  const devkitUrl = process.env.DEVKIT_URL || "http://localhost:5199";
  try {
    execSync(
      `claude mcp add --scope user devkit -e DEVKIT_URL=${devkitUrl} -- devkit-mcp-server`,
      { stdio: "inherit" }
    );
    console.log("\nDevKit MCP server Claude Code'a eklendi!");
    console.log("Scope: user (tum projelerde kullanilabilir)");
    console.log(`DevKit URL: ${devkitUrl}`);
    console.log("\nDogrulama: claude mcp list");
  } catch {
    console.error("\nOtomatik ekleme basarisiz. Manuel ekleyin:");
    console.error(`  claude mcp add --scope user devkit -e DEVKIT_URL=${devkitUrl} -- devkit-mcp-server`);
  }
}

// ═══════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════

const args = process.argv.slice(2);

if (args.includes("--setup")) {
  runSetup();
  process.exit(0);
}

if (args.includes("--setup-code")) {
  runSetupCode();
  process.exit(0);
}

if (args.includes("--setup-all")) {
  runSetup();
  runSetupCode();
  process.exit(0);
}

if (args.includes("--cleanup")) {
  runCleanup();
  process.exit(0);
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`DevKit MCP Server v1.2.1

Usage:
  devkit-mcp-server               Start MCP server (stdio mode)
  devkit-mcp-server --setup       Auto-configure Claude Desktop
  devkit-mcp-server --setup-code  Auto-configure Claude Code
  devkit-mcp-server --setup-all   Configure both Claude Desktop and Claude Code
  devkit-mcp-server --cleanup     Clean vm_bundles and cache
  devkit-mcp-server --help        Show this help

Environment:
  DEVKIT_URL      DevKit backend URL (default: http://localhost:5199)
  TRANSPORT       stdio or http (default: stdio)
  PORT            HTTP port when TRANSPORT=http (default: 3100)
`);
  process.exit(0);
}

// ═══════════════════════════════════════════════
// TRANSPORT SETUP
// ═══════════════════════════════════════════════

async function runStdio() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("DevKit MCP server running via stdio");
  console.error(`Prompts directory: ${PROMPTS_DIR}`);
}

async function runHTTP() {
  // Lazy import: express ve StreamableHTTPServerTransport sadece HTTP modunda yuklenir
  // Bu sayede stdio modunda @hono/node-server crash'i onlenir
  const [{ default: express }, { StreamableHTTPServerTransport }] = await Promise.all([
    import("express"),
    import("@modelcontextprotocol/sdk/server/streamableHttp.js"),
  ]);

  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req: any, res: any) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/health", (_req: any, res: any) => {
    res.json({ status: "ok", server: "devkit-mcp-server" });
  });

  const port = parseInt(process.env.PORT || "3100");
  app.listen(port, () => {
    console.error(`DevKit MCP server running on http://localhost:${port}/mcp`);
    console.error(`Prompts directory: ${PROMPTS_DIR}`);
  });
}

const transportMode = process.env.TRANSPORT || "stdio";
if (transportMode === "http") {
  runHTTP().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
} else {
  runStdio().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}
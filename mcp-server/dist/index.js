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
function resolvePromptsDir() {
    if (process.env.DEVKIT_PROMPTS_DIR && existsSync(process.env.DEVKIT_PROMPTS_DIR)) {
        return process.env.DEVKIT_PROMPTS_DIR;
    }
    // Repo icinden calisiyorsa: mcp-server/dist -> ../../prompts
    const repoPrompts = resolve(__dirname, "..", "..", "prompts");
    if (existsSync(repoPrompts))
        return repoPrompts;
    // npm global paket olarak kuruluysa: dist -> ../prompts (bundled)
    const bundledPrompts = resolve(__dirname, "..", "prompts");
    if (existsSync(bundledPrompts))
        return bundledPrompts;
    // Fallback
    return repoPrompts;
}
const PROMPTS_DIR = resolvePromptsDir();
// Senkron: local dosyadan oku (registerPrompt icin)
function loadPromptFile(filename) {
    const filePath = join(PROMPTS_DIR, filename);
    if (!existsSync(filePath)) {
        return `[BILGI: ${filename} local'de bulunamadi. DevKit load tool'larini kullanin.]`;
    }
    return readFileSync(filePath, "utf-8");
}
// Asenkron: once local dene, yoksa DevKit API'den cek (npm global install icin)
async function loadPromptFileAsync(filename) {
    // 1. Local dosya var mi?
    const filePath = join(PROMPTS_DIR, filename);
    if (existsSync(filePath)) {
        return readFileSync(filePath, "utf-8");
    }
    // 2. DevKit API'den cek (npm global install durumu)
    try {
        const response = await devkitApi(`system/prompt/${filename}`, "GET");
        if (response.success && response.content) {
            return response.content;
        }
    }
    catch {
        // API de basarisiz
    }
    return `[HATA: ${filename} bulunamadi. DevKit backend calistiginden emin olun.]`;
}
server.registerPrompt("devkit_rules", {
    title: "DevKit Kurallari",
    description: "DevKit'in 3 temel kuralini yukler: Manifest JSON formati, DEVKIT_PATH marker kurallari ve dosya iletim kurallari. Her yeni proje baslatirken bu prompt'u cagir.",
}, () => {
    const content = loadPromptFile("devkit-claude-prompt.md");
    return {
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: `Asagidaki DevKit kurallarini bu konusma boyunca uygula. Her dosyada DEVKIT_PATH marker'i kullan, proje yapisini manifest JSON formatinda ilet, dosyalari indirilebilir olarak ilet.\n\n${content}`,
                },
            },
        ],
    };
});
server.registerPrompt("devkit_dotnet_structure", {
    title: ".NET Proje Yapisi Sablonu",
    description: "Clean Architecture .NET projesi icin manifest JSON sablonu. Yeni bir .NET projesi baslatirken kullan.",
}, () => {
    const content = loadPromptFile("dotnet-structure-prompt.md");
    return {
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: `Asagidaki .NET proje yapisi sablonunu referans al. Yeni .NET projesi olustururken bu yapiyi kullan.\n\n${content}`,
                },
            },
        ],
    };
});
server.registerPrompt("devkit_nextjs_structure", {
    title: "Next.js Proje Yapisi Sablonu",
    description: "Next.js projesi icin manifest JSON sablonu. Yeni bir Next.js projesi baslatirken kullan.",
}, () => {
    const content = loadPromptFile("nextjs-structure-prompt.md");
    return {
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: `Asagidaki Next.js proje yapisi sablonunu referans al. Yeni Next.js projesi olustururken bu yapiyi kullan.\n\n${content}`,
                },
            },
        ],
    };
});
server.registerPrompt("devkit_nodejs_structure", {
    title: "Node.js Proje Yapisi Sablonu",
    description: "Node.js/TypeScript projesi icin manifest JSON sablonu. Yeni bir Node.js projesi baslatirken kullan.",
}, () => {
    const content = loadPromptFile("nodejs-structure-prompt.md");
    return {
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: `Asagidaki Node.js proje yapisi sablonunu referans al. Yeni Node.js projesi olustururken bu yapiyi kullan.\n\n${content}`,
                },
            },
        ],
    };
});
server.registerPrompt("devkit_python_structure", {
    title: "Python Proje Yapisi Sablonu",
    description: "FastAPI/Flask/Django projesi icin manifest JSON sablonu. Yeni bir Python projesi baslatirken kullan.",
}, () => {
    const content = loadPromptFile("python-structure-prompt.md");
    return {
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: `Asagidaki Python proje yapisi sablonunu referans al. Yeni Python projesi olustururken bu yapiyi kullan.\n\n${content}`,
                },
            },
        ],
    };
});
server.registerPrompt("devkit_full_setup", {
    title: "DevKit Tam Kurulum (Tum Kurallar + Secilen Framework)",
    description: "DevKit kurallarini VE secilen framework sablonunu tek seferde yukler. Yeni bir projeye baslarken bunu kullan.",
    argsSchema: {
        framework: z
            .enum(["dotnet", "nextjs", "nodejs", "python"])
            .describe("Hedef framework: dotnet, nextjs, nodejs veya python"),
    },
}, ({ framework }) => {
    const rules = loadPromptFile("devkit-claude-prompt.md");
    const structureFile = {
        dotnet: "dotnet-structure-prompt.md",
        nextjs: "nextjs-structure-prompt.md",
        nodejs: "nodejs-structure-prompt.md",
        python: "python-structure-prompt.md",
    };
    const structure = loadPromptFile(structureFile[framework]);
    return {
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: `Bu konusma boyunca asagidaki DevKit kurallarini uygula ve ${framework} proje sablonunu referans al.\n\n===== DEVKIT KURALLARI =====\n\n${rules}\n\n===== ${framework.toUpperCase()} PROJE SABLONU =====\n\n${structure}`,
                },
            },
        ],
    };
});
// ═══════════════════════════════════════════════
// PROMPT LOADER TOOLS - Kullanici "kurallari yukle" dediginde calisir
// ═══════════════════════════════════════════════
server.registerTool("devkit_load_rules", {
    title: "DevKit Kurallarini Yukle",
    description: `DevKit'in temel kurallarini yukler: Manifest JSON formati, DEVKIT_PATH marker kurallari ve dosya iletim kurallari.
Kullanici "DevKit kurallarini yukle", "kurallari yukle", "DevKit rules" gibi bir sey soylediginde BU TOOL'U CAGIR.
Bu tool prompt dosyasinin icerigini doner, sonrasinda bu kurallari konusma boyunca uygula.`,
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async () => {
    const content = await loadPromptFileAsync("devkit-claude-prompt.md");
    return {
        content: [
            {
                type: "text",
                text: `DEVKIT KURALLARI YUKLENDI. Asagidaki kurallari bu konusma boyunca uygula:\n\n${content}`,
            },
        ],
    };
});
server.registerTool("devkit_load_full_setup", {
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
}, async ({ framework }) => {
    const rules = await loadPromptFileAsync("devkit-claude-prompt.md");
    const structureFile = {
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
});
server.registerTool("devkit_load_structure", {
    title: "Framework Sablonu Yukle",
    description: `Belirli bir framework icin proje yapisi sablonunu yukler (manifest JSON ornegi).
Kullanici "dotnet sablonunu goster", "Python proje yapisi", "Next.js template" gibi dediginde cagir.`,
    inputSchema: {
        framework: z
            .enum(["dotnet", "nextjs", "nodejs", "python"])
            .describe("Framework: dotnet, nextjs, nodejs veya python"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ framework }) => {
    const structureFile = {
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
});
// ═══════════════════════════════════════════════
// PROFILE TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_list_profiles", {
    title: "List DevKit Profiles",
    description: "Lists all configured DevKit profiles with their workspace paths, frameworks, and Azure configurations.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async () => {
    const data = await devkitApi("profile", "GET");
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_get_active_profile", {
    title: "Get Active DevKit Profile",
    description: "Returns the currently active DevKit profile including workspace path, framework, and Azure config.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async () => {
    const data = await devkitApi("profile/active", "GET");
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_set_active_profile", {
    title: "Set Active DevKit Profile",
    description: "Switches the active DevKit profile. All subsequent operations will use this profile's workspace.",
    inputSchema: {
        key: z.string().describe("Profile key to activate (e.g., 'my-backend')"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ key }) => {
    const data = await devkitApi(`profile/active/${key}`, "PUT");
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_create_profile", {
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
}, async ({ key, name, workspace, framework, tenantId, subscriptionId, resourceGroup, resources }) => {
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
});
server.registerTool("devkit_delete_profile", {
    title: "Delete DevKit Profile",
    description: "Deletes a DevKit profile by its key.",
    inputSchema: {
        key: z.string().describe("Profile key to delete"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
}, async ({ key }) => {
    const data = await devkitApi(`profile/${key}`, "DELETE");
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// SCAFFOLDING TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_scaffold_project", {
    title: "Scaffold Project",
    description: `Creates or updates a project structure on disk from a manifest JSON. 
Supports dotnet, nextjs, nodejs, and python frameworks.
Mode 'create' builds everything from scratch. Mode 'update' adds new items without overwriting existing files.`,
    inputSchema: {
        manifest: z.object({
            solution: z.string().describe("Solution/project name"),
            framework: z.enum(["dotnet", "nextjs", "nodejs", "python"]).describe("Target framework"),
            outputPath: z.string().describe("Root directory where project will be created"),
            projects: z.array(z.object({
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
            })),
            globalFiles: z.array(z.object({ path: z.string(), content: z.string() })).default([]),
        }),
        mode: z
            .enum(["create", "update"])
            .default("create")
            .describe("'create' builds from scratch, 'update' adds new items only"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ manifest, mode }) => {
    const data = await devkitApi("scaffolding", "POST", { manifest, mode });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// FILE IMPORT TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_import_file", {
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
}, async ({ projectRoot, fileName, content }) => {
    const data = await devkitApi("fileimport/text", "POST", { projectRoot, fileName, content });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_preview_file", {
    title: "Preview File Import",
    description: "Shows where a file would be placed based on its DEVKIT_PATH marker without actually writing it.",
    inputSchema: {
        fileName: z.string().describe("File name"),
        content: z.string().describe("File content with DEVKIT_PATH marker"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ fileName, content }) => {
    const data = await devkitApi("fileimport/preview-text", "POST", { fileName, content });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// GIT TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_git_status", {
    title: "Git Status",
    description: "Shows current git status including modified, staged, and untracked files.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async () => {
    const data = await devkitApi("git/status", "POST", {});
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_current_branch", {
    title: "Git Current Branch",
    description: "Returns the name of the currently checked out branch.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async () => {
    const data = await devkitApi("git/current-branch", "POST", {});
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_branches", {
    title: "List Git Branches",
    description: "Lists all local and remote branches.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async () => {
    const data = await devkitApi("git/branches", "POST", {});
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_log", {
    title: "Git Log",
    description: "Shows recent commit history.",
    inputSchema: {
        count: z.number().int().min(1).max(50).default(15).describe("Number of commits to show"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ count }) => {
    const data = await devkitApi("git/log", "POST", { count });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_commit", {
    title: "Git Commit",
    description: "Stages all changes and creates a commit with the given message.",
    inputSchema: {
        message: z.string().min(1).describe("Commit message"),
        stageAll: z.boolean().default(true).describe("Stage all changes before committing"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ message, stageAll }) => {
    const data = await devkitApi("git/commit", "POST", { message, stageAll });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_push", {
    title: "Git Push",
    description: "Pushes commits to the remote repository.",
    inputSchema: {
        remote: z.string().default("origin").describe("Remote name"),
        branch: z.string().optional().describe("Branch name (defaults to current)"),
        setUpstream: z.boolean().default(true).describe("Set upstream tracking (-u)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ remote, branch, setUpstream }) => {
    const data = await devkitApi("git/push", "POST", { remote, branch, setUpstream });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_pull", {
    title: "Git Pull",
    description: "Pulls changes from the remote repository.",
    inputSchema: {
        remote: z.string().default("origin").describe("Remote name"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ remote }) => {
    const data = await devkitApi("git/pull", "POST", { remote });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_fetch", {
    title: "Git Fetch",
    description: "Fetches all remote changes without merging.",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async () => {
    const data = await devkitApi("git/fetch", "POST", {});
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_create_branch", {
    title: "Create Git Branch",
    description: "Creates a new branch and optionally switches to it.",
    inputSchema: {
        branch: z.string().min(1).describe("New branch name"),
        checkout: z.boolean().default(true).describe("Switch to the new branch"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ branch, checkout }) => {
    const data = await devkitApi("git/create-branch", "POST", { branch, checkout });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_checkout", {
    title: "Git Checkout",
    description: "Switches to an existing branch.",
    inputSchema: {
        branch: z.string().min(1).describe("Branch name to switch to"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ branch }) => {
    const data = await devkitApi("git/checkout", "POST", { branch });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_merge", {
    title: "Git Merge",
    description: "Merges the specified branch into the current branch.",
    inputSchema: {
        branch: z.string().min(1).describe("Branch to merge"),
        noFastForward: z.boolean().default(false).describe("Force merge commit (--no-ff)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ branch, noFastForward }) => {
    const data = await devkitApi("git/merge", "POST", { branch, noFastForward });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_delete_branch", {
    title: "Delete Git Branch",
    description: "Deletes a local branch. Use force=true for unmerged branches.",
    inputSchema: {
        branch: z.string().min(1).describe("Branch name to delete"),
        force: z.boolean().default(false).describe("Force delete even if not merged (-D)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
}, async ({ branch, force }) => {
    const data = await devkitApi("git/delete-branch", "POST", { branch, force });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_stash", {
    title: "Git Stash",
    description: "Temporarily saves uncommitted changes to the stash.",
    inputSchema: {
        message: z.string().optional().describe("Optional stash message"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ message }) => {
    const data = await devkitApi("git/stash", "POST", { message });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_stash_pop", {
    title: "Git Stash Pop",
    description: "Restores the most recent stash and removes it from the stash list.",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async () => {
    const data = await devkitApi("git/stash-pop", "POST", {});
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_tag", {
    title: "Create Git Tag",
    description: "Creates an annotated or lightweight tag at the current commit.",
    inputSchema: {
        tagName: z.string().min(1).describe("Tag name (e.g., 'v1.0.0')"),
        message: z.string().optional().describe("Tag message (creates annotated tag)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ tagName, message }) => {
    const data = await devkitApi("git/create-tag", "POST", { tagName, message });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_push_tags", {
    title: "Push All Git Tags",
    description: "Pushes all local tags to the remote repository.",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async () => {
    const data = await devkitApi("git/push-tags", "POST", {});
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_remote_add", {
    title: "Add Git Remote",
    description: "Adds a new remote repository URL.",
    inputSchema: {
        name: z.string().default("origin").describe("Remote name"),
        url: z.string().min(1).describe("Remote URL (e.g., 'https://github.com/user/repo.git')"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ name, url }) => {
    const data = await devkitApi("git/remote-add", "POST", { name, url });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_remote_remove", {
    title: "Remove Git Remote",
    description: "Removes a remote repository by name.",
    inputSchema: {
        name: z.string().min(1).describe("Remote name to remove"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
}, async ({ name }) => {
    const data = await devkitApi("git/remote-remove", "POST", { name });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_github_create_repo", {
    title: "Create GitHub Repository",
    description: "Creates a new GitHub repo, initializes git, commits, and pushes. Requires GitHub CLI (gh).",
    inputSchema: {
        repoName: z.string().min(1).describe("Repository name"),
        description: z.string().optional().describe("Repository description"),
        isPrivate: z.boolean().default(true).describe("Private repo"),
        initialCommit: z.boolean().default(true).describe("Stage all and commit"),
        pushAfterCreate: z.boolean().default(true).describe("Push after creating"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
}, async ({ repoName, description, isPrivate, initialCommit, pushAfterCreate }) => {
    const data = await devkitApi("git/github-create", "POST", {
        repoName,
        description,
        private: isPrivate,
        initialCommit,
        pushAfterCreate,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// PROJECT SCAN TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_scan_project", {
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
}, async ({ rootPath, maxDepth, includeFileContents }) => {
    const data = await devkitApi("scan", "POST", {
        rootPath: rootPath || "",
        maxDepth,
        includeFileContents,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_scan_tree", {
    title: "Scan Project Tree",
    description: `Projenin klasor ve dosya agacini doner. Hafif versiyon, dosya icerigi yok.
Hizli bir bakis icin kullan, detayli tarama icin devkit_scan_project kullan.`,
    inputSchema: {
        rootPath: z.string().optional().describe("Proje root dizini (bossa aktif profil workspace kullanilir)"),
        maxDepth: z.number().int().min(1).max(20).default(10),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ rootPath, maxDepth }) => {
    const data = await devkitApi("scan/tree", "POST", {
        rootPath: rootPath || "",
        maxDepth,
        includeFileContents: false,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_read_file", {
    title: "Read Project File",
    description: `Projedeki bir dosyanin icerigini okur. Relative path kullanilir.
Mevcut kodu incelemek, anlamak veya degistirmek icin kullan.`,
    inputSchema: {
        relativePath: z.string().min(1).describe("Root'a gore relative dosya yolu (orn: 'src/MyApp.Domain/Entities/Customer.cs')"),
        rootPath: z.string().optional().describe("Proje root dizini (bossa aktif profil workspace kullanilir)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ relativePath, rootPath }) => {
    const data = await devkitApi("scan/file", "POST", {
        rootPath: rootPath || "",
        relativePath,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// DOCKER TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_docker_services", {
    title: "List Available Docker Services",
    description: "Lists all available Docker service templates that can be added to docker-compose.yml. Includes Kafka, RabbitMQ, PostgreSQL, MSSQL, Elasticsearch, Kibana, Logstash, Jaeger, Zipkin, Grafana, OTel Collector.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async () => {
    const data = await devkitApi("docker/services", "GET");
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_docker_generate", {
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
}, async ({ serviceIds, projectName, customServices }) => {
    const data = await devkitApi("docker/generate", "POST", {
        services: serviceIds.map(id => ({ id })),
        customServices: customServices || [],
        projectName,
        networkName: `${projectName}-net`,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_docker_save", {
    title: "Save Docker Compose to Disk",
    description: "Saves docker-compose.yml content to the specified directory. Optionally generates otel-collector-config.yml if OTel Collector is used.",
    inputSchema: {
        outputPath: z.string().describe("Directory where docker-compose.yml will be saved"),
        content: z.string().describe("YAML content to write"),
        generateOtelConfig: z.boolean().default(false).describe("Also generate otel-collector-config.yml"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ outputPath, content, generateOtelConfig }) => {
    const body = { outputPath, content };
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
});
server.registerTool("devkit_docker_inject_appsettings", {
    title: "Inject Connection Strings to AppSettings",
    description: "Injects Docker service connection strings into an appsettings.json file. Adds missing keys, updates existing ones.",
    inputSchema: {
        appSettingsPath: z.string().describe("Full path to appsettings.json file"),
        connectionStrings: z.record(z.string()).describe("Key-value pairs to inject (e.g., {'ConnectionStrings:DefaultConnection': 'Host=localhost...'})"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ appSettingsPath, connectionStrings }) => {
    const data = await devkitApi("docker/inject-appsettings", "POST", {
        appSettingsPath,
        connectionStrings,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_docker_up", {
    title: "Docker Compose Up",
    description: "Starts all services defined in docker-compose.yml in detached mode.",
    inputSchema: {
        workingDir: z.string().optional().describe("Directory containing docker-compose.yml (defaults to active profile workspace)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
}, async ({ workingDir }) => {
    const data = await devkitApi("docker/compose/up", "POST", { workingDir, detached: true });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_docker_down", {
    title: "Docker Compose Down",
    description: "Stops and removes all containers. Use removeVolumes=true to also delete data volumes.",
    inputSchema: {
        workingDir: z.string().optional().describe("Directory containing docker-compose.yml"),
        removeVolumes: z.boolean().default(false).describe("Also remove data volumes (-v)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
}, async ({ workingDir, removeVolumes }) => {
    const data = await devkitApi("docker/compose/down", "POST", { workingDir, removeVolumes });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_docker_ps", {
    title: "Docker Compose Status",
    description: "Shows running containers and their status.",
    inputSchema: {
        workingDir: z.string().optional().describe("Directory containing docker-compose.yml"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ workingDir }) => {
    const data = await devkitApi("docker/compose/ps", "POST", { workingDir });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_docker_logs", {
    title: "Docker Compose Logs",
    description: "Shows container logs. Optionally filter by service name.",
    inputSchema: {
        workingDir: z.string().optional().describe("Directory containing docker-compose.yml"),
        serviceName: z.string().optional().describe("Specific service name to get logs for"),
        tail: z.number().default(100).describe("Number of lines to show"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ workingDir, serviceName, tail }) => {
    const data = await devkitApi("docker/compose/logs", "POST", { workingDir, serviceName, tail });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// AZURE TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_azure_login", {
    title: "Azure Login",
    description: "Opens Azure login dialog. On Windows opens a separate command window to avoid blocking.",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async () => {
    const data = await devkitApi("azure/login", "POST", {});
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_azure_verify_login", {
    title: "Verify Azure Login",
    description: "Checks if Azure CLI is logged in and the correct subscription is selected.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async () => {
    const data = await devkitApi("azure/verify-login", "POST", {});
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_azure_deploy", {
    title: "Deploy to Azure",
    description: "Builds and deploys to Azure App Service. Supports appservice, custom-script, webjob-continuous, and webjob-triggered modes.",
    inputSchema: {
        resourceName: z.string().describe("Azure resource name from profile"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
}, async ({ resourceName }) => {
    const data = await devkitApi(`azure/deploy/${resourceName}`, "POST", {});
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_azure_restart", {
    title: "Restart Azure App",
    description: "Restarts an Azure App Service.",
    inputSchema: { resourceName: z.string().describe("Azure resource name") },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ resourceName }) => {
    const data = await devkitApi(`azure/restart/${resourceName}`, "POST", {});
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_azure_logs", {
    title: "Get Azure App Logs",
    description: "Retrieves recent logs from an Azure App Service.",
    inputSchema: { resourceName: z.string().describe("Azure resource name") },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ resourceName }) => {
    const data = await devkitApi(`azure/logs/${resourceName}`, "GET");
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_azure_env_get", {
    title: "Get Azure Environment Variables",
    description: "Lists all environment variables (app settings) for an Azure App Service.",
    inputSchema: { resourceName: z.string().describe("Azure resource name") },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ resourceName }) => {
    const data = await devkitApi(`azure/env/${resourceName}`, "GET");
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_azure_env_set", {
    title: "Set Azure Environment Variable",
    description: "Sets or updates an environment variable on an Azure App Service.",
    inputSchema: {
        resourceName: z.string().describe("Azure resource name"),
        key: z.string().describe("Environment variable name"),
        value: z.string().describe("Environment variable value"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ resourceName, key, value }) => {
    const data = await devkitApi(`azure/env/${resourceName}`, "POST", {
        variables: { [key]: value },
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// ARCHITECTURE DESIGNER TOOLS (v3 - designId based)
// ═══════════════════════════════════════════════
server.registerTool("devkit_arch_create", {
    title: "Create Architecture Design",
    description: `Yeni mimari tasarim olusturur ve designId doner.
Sonraki tum islemler bu designId ile yapilir. designId'yi hatirla ve kullan.
"yeni mimari tasarla", "clean architecture proje", "microservice mimarisi" dediginde CAGIR.`,
    inputSchema: {
        name: z.string().min(1).describe("Tasarim adi (Design Name)"),
        solutionName: z.string().min(1).describe("Solution adi (orn: ECommerce)"),
        outputPath: z.string().min(1).describe("Proje dizini (orn: C:\\source\\ecommerce)"),
        framework: z.enum(["dotnet", "nextjs", "nodejs", "python"]).default("dotnet"),
        architecture: z.enum(["clean", "hexagonal", "ddd", "modular-monolith", "microservices", "simple"]).default("clean"),
        description: z.string().optional(),
    },
}, async ({ name, solutionName, outputPath, framework, architecture, description }) => {
    const data = await devkitApi("architecturedesigner/create", "POST", { name, solutionName, outputPath, framework, architecture, description });
    return { content: [{ type: "text", text: formatResult(data) + "\n\nONEMLI: Bu designId'yi sonraki tum architecture islemlerinde kullan." }] };
});
server.registerTool("devkit_arch_add_component", {
    title: "Add Component to Design",
    description: `Tasarima component ekler. Smart default config'ler otomatik eklenir.
Proje tipleri: webapi, classlib, worker, console, test, nextjs, react, apigateway, bff
Infra tipleri: postgresql, mssql, mongodb, redis, couchbase, kafka, rabbitmq, servicebus, elasticsearch, kibana, logstash, jaeger, zipkin, grafana, otelcollector, prometheus, jenkins, nginx
"Api ekle", "PostgreSQL ekle", "Kafka ekle", "Next.js ekle" dediginde CAGIR.`,
    inputSchema: {
        designId: z.string().min(1).describe("Design ID (devkit_arch_create'den donen)"),
        name: z.string().min(1).describe("Component adi"),
        type: z.string().min(1).describe("Component tipi"),
        category: z.enum(["project", "infrastructure", "cloud"]),
        config: z.record(z.string()).optional().describe("Ek config (smart defaults otomatik eklenir)"),
        hosting: z.enum(["docker", "existing"]).optional().describe("Infra icin: docker veya mevcut servis"),
    },
}, async ({ designId, name, type, category, config, hosting }) => {
    const finalConfig = config || {};
    if (hosting === "existing") {
        finalConfig.hosting = "existing";
        delete finalConfig.image;
    }
    const data = await devkitApi("architecturedesigner/add-component", "POST", { designId, name, type, category, config: finalConfig, x: 50 + Math.random() * 400, y: 50 + Math.random() * 300 });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_arch_remove_component", {
    title: "Remove Component",
    description: `Tasarimdan component ve baglantilerini kaldirir.`,
    inputSchema: {
        designId: z.string().min(1).describe("Design ID"),
        componentId: z.string().min(1).describe("Kaldirilacak component ID"),
    },
}, async ({ designId, componentId }) => {
    const data = await devkitApi("architecturedesigner/remove-component", "POST", { designId, componentId });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_arch_add_connection", {
    title: "Add Connection",
    description: `Component'ler arasi baglanti kurar. Dil uyumlulugu otomatik kontrol edilir.
references: ayni dildeki projeler arasi (dotnet-dotnet veya js-js, CAPRAZ OLMAZ)
uses: proje → infra/cloud (DB, cache, observability)
publishes-to: proje → messaging (kafka, rabbitmq, servicebus)
consumes-from: proje → messaging
depends-on: genel bagimlili (docker baslama sirasi)
"Api'yi Domain'e bagla", "Api PostgreSQL kullansin", "Worker Kafka'dan consume etsin" dediginde CAGIR.`,
    inputSchema: {
        designId: z.string().min(1).describe("Design ID"),
        sourceId: z.string().min(1).describe("Kaynak component ID"),
        targetId: z.string().min(1).describe("Hedef component ID"),
        connectionType: z.enum(["references", "uses", "publishes-to", "consumes-from", "depends-on"]).default("uses"),
        label: z.string().optional(),
    },
}, async ({ designId, sourceId, targetId, connectionType, label }) => {
    const data = await devkitApi("architecturedesigner/add-connection", "POST", { designId, sourceId, targetId, connectionType, label });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_arch_remove_connection", {
    title: "Remove Connection",
    description: `Baglanti kaldirir.`,
    inputSchema: {
        designId: z.string().min(1).describe("Design ID"),
        connectionId: z.string().min(1).describe("Kaldirilacak connection ID"),
    },
}, async ({ designId, connectionId }) => {
    const data = await devkitApi("architecturedesigner/remove-connection", "POST", { designId, connectionId });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_arch_validate", {
    title: "Validate Design",
    description: `Tasarimi dogrular: eksik alanlar, duplicate isim, port cakismasi, hatali baglantilar.
"tasarimi dogrula", "kontrol et" dediginde CAGIR.`,
    inputSchema: {
        designId: z.string().min(1).describe("Design ID"),
    },
}, async ({ designId }) => {
    const data = await devkitApi("architecturedesigner/validate", "POST", { designId });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_arch_to_manifest", {
    title: "Convert to Manifest",
    description: `Tasarimi scaffold manifest JSON'a cevirir. .NET projeleri "projects", Next.js/React "frontends" olarak ayrilir.
"manifest olustur", "scaffold icin hazirla" dediginde CAGIR.`,
    inputSchema: {
        designId: z.string().min(1).describe("Design ID"),
    },
}, async ({ designId }) => {
    const data = await devkitApi("architecturedesigner/to-manifest", "POST", { designId });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_arch_scaffold", {
    title: "Scaffold from Design",
    description: `Manifest'ten projeleri olusturur. Karma mimarilerde (dotnet+nextjs) her framework ayri scaffold edilir. Otomatik profil olusturulur.
"projeleri olustur", "scaffold et" dediginde CAGIR.`,
    inputSchema: {
        designId: z.string().min(1).describe("Design ID"),
    },
}, async ({ designId }) => {
    // Once design'i store'dan al
    const storeRes = await devkitApi(`architecturedesigner/store/${designId}`, "GET");
    if (!storeRes.success)
        return { content: [{ type: "text", text: "Design bulunamadi. Once devkit_arch_create ile tasarim olusturun." }] };
    const design = storeRes.design;
    // Manifest olustur
    const manifestRes = await devkitApi("architecturedesigner/to-manifest", "POST", { designId });
    if (!manifestRes.success)
        return { content: [{ type: "text", text: `Manifest olusturulamadi: ${formatResult(manifestRes)}` }] };
    const parsed = JSON.parse(manifestRes.manifest);
    const allProjects = [...(parsed.projects || []), ...(parsed.frontends || [])];
    const dotnetProjects = allProjects.filter((p) => !["nextjs", "react", "nodejs"].includes(p.type));
    const nextjsProjects = allProjects.filter((p) => p.type === "nextjs" || p.type === "react");
    const nodeProjects = allProjects.filter((p) => p.type === "nodejs");
    const results = [];
    const doScaffold = async (projects, framework) => {
        if (!projects || projects.length === 0)
            return;
        const res = await devkitApi("scaffolding", "POST", {
            manifest: { ...parsed, framework, projects, frontends: undefined }, mode: "create",
        });
        results.push(`${framework}: ${res.success ? "OK" : res.error || "Hata"}`);
    };
    if (dotnetProjects.length > 0)
        await doScaffold(dotnetProjects, "dotnet");
    if (nextjsProjects.length > 0)
        await doScaffold(nextjsProjects, "nextjs");
    if (nodeProjects.length > 0)
        await doScaffold(nodeProjects, "nodejs");
    // Profil olustur
    try {
        const profileKey = design.name || design.solutionName || "MyProject";
        const workspace = design.outputPath.endsWith(design.solutionName)
            ? design.outputPath : `${design.outputPath}\\${design.solutionName}`;
        await devkitApi(`profile/${encodeURIComponent(profileKey)}`, "POST", { name: design.solutionName, workspace });
        await devkitApi(`profile/active/${encodeURIComponent(profileKey)}`, "PUT");
        results.push("Profil aktif edildi");
    }
    catch {
        results.push("Profil olusturulamadi");
    }
    return { content: [{ type: "text", text: results.join(" | ") }] };
});
server.registerTool("devkit_arch_to_docker", {
    title: "Generate Docker Compose",
    description: `Infrastructure componentlerden docker-compose.yml olusturur. hosting=existing olanlar dahil edilmez.
"docker compose olustur" dediginde CAGIR.`,
    inputSchema: {
        designId: z.string().min(1).describe("Design ID"),
    },
}, async ({ designId }) => {
    const data = await devkitApi("architecturedesigner/to-docker", "POST", { designId });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_arch_save_docker", {
    title: "Save Docker Compose to Disk",
    description: `Docker compose YAML'i diske kaydeder.
"docker yaml kaydet", "compose dosyasini yaz" dediginde CAGIR.`,
    inputSchema: {
        designId: z.string().min(1).describe("Design ID"),
        content: z.string().optional().describe("Ozel YAML icerigi (bossa otomatik olusturulur)"),
    },
}, async ({ designId, content }) => {
    let yamlContent = content;
    if (!yamlContent) {
        const dockerRes = await devkitApi("architecturedesigner/to-docker", "POST", { designId });
        if (!dockerRes.success)
            return { content: [{ type: "text", text: "Docker compose olusturulamadi." }] };
        yamlContent = dockerRes.dockerCompose;
    }
    const storeRes = await devkitApi(`architecturedesigner/store/${designId}`, "GET");
    if (!storeRes.success)
        return { content: [{ type: "text", text: "Design bulunamadi." }] };
    const design = storeRes.design;
    const outputPath = design.outputPath.endsWith(design.solutionName)
        ? design.outputPath : `${design.outputPath}\\${design.solutionName}`;
    const data = await devkitApi("docker/save", "POST", { outputPath, content: yamlContent });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_arch_save", {
    title: "Save Architecture Design",
    description: `Tasarimi JSON dosyasi olarak kaydeder.
"tasarimi kaydet" dediginde CAGIR.`,
    inputSchema: {
        designId: z.string().min(1).describe("Design ID"),
        filePath: z.string().optional().describe("Dosya yolu (bossa outputPath + solutionName.design.json)"),
    },
}, async ({ designId, filePath }) => {
    const storeRes = await devkitApi(`architecturedesigner/store/${designId}`, "GET");
    if (!storeRes.success)
        return { content: [{ type: "text", text: "Design bulunamadi." }] };
    const design = storeRes.design;
    const fp = filePath || `${design.outputPath}\\${design.solutionName || "architecture"}.design.json`;
    const data = await devkitApi("architecturedesigner/save", "POST", { designId, filePath: fp });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_arch_load", {
    title: "Load Architecture Design",
    description: `Kaydedilmis tasarimi dosyadan yukler.
"tasarimi yukle" dediginde CAGIR.`,
    inputSchema: {
        filePath: z.string().min(1).describe("Tasarim dosya yolu"),
    },
}, async ({ filePath }) => {
    const data = await devkitApi("architecturedesigner/load", "POST", { filePath });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_arch_templates", {
    title: "List Component Templates",
    description: `Kullanilabilir component template'lerini listeler.
"hangi componentler var", "template listesi" dediginde CAGIR.`,
    inputSchema: {},
}, async () => {
    const data = await devkitApi("architecturedesigner/templates", "GET");
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_arch_get_design", {
    title: "Get Current Design",
    description: `Mevcut tasarimin durumunu gosterir: componentler, baglantilar, config.
"tasarimi goster", "design durumu" dediginde CAGIR.`,
    inputSchema: {
        designId: z.string().min(1).describe("Design ID"),
    },
}, async ({ designId }) => {
    const data = await devkitApi(`architecturedesigner/store/${designId}`, "GET");
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_arch_list_designs", {
    title: "List All Designs",
    description: `Hafizada kayitli tum tasarimlari listeler. "tasarimlari listele" dediginde CAGIR.`,
    inputSchema: {},
}, async () => {
    const data = await devkitApi("architecturedesigner/store", "GET");
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_arch_rename_solution", {
    title: "Rename Solution",
    description: `Solution adini degistirir ve tum proje component isimlerini gunceller. Output path sifirlanir.
"solution adini degistir", "projeyi yeniden adlandir" dediginde CAGIR.`,
    inputSchema: {
        designId: z.string().min(1).describe("Design ID"),
        newSolutionName: z.string().min(1).describe("Yeni solution adi"),
    },
}, async ({ designId, newSolutionName }) => {
    // Store'dan design'i al
    const storeRes = await devkitApi(`architecturedesigner/store/${designId}`, "GET");
    if (!storeRes.success)
        return { content: [{ type: "text", text: "Design bulunamadi." }] };
    const design = storeRes.design;
    const updated = {
        ...design,
        solutionName: newSolutionName,
        outputPath: "",
        components: design.components.map((c) => {
            if (c.category !== "project")
                return c;
            const parts = c.name.split(".");
            if (parts.length >= 2) {
                parts[0] = newSolutionName;
                return { ...c, name: parts.join(".") };
            }
            return c;
        }),
    };
    // Guncellenmis design'i store'a kaydet
    await devkitApi(`architecturedesigner/store/${designId}`, "POST", updated);
    return { content: [{ type: "text", text: `Solution "${newSolutionName}" olarak guncellendi. ${updated.components.length} component yeniden adlandirildi. Output path yeniden girilmeli.\n\n${formatResult(updated)}` }] };
});
server.registerTool("devkit_arch_update_component", {
    title: "Update Component",
    description: `Component adini, config degerlerini, hosting modunu gunceller.
"portu degistir", "hosting'i existing yap", "config ekle", "component adini degistir" dediginde CAGIR.`,
    inputSchema: {
        designId: z.string().min(1).describe("Design ID"),
        componentId: z.string().min(1).describe("Guncellenecek component ID"),
        name: z.string().optional().describe("Yeni component adi"),
        setConfig: z.record(z.string()).optional().describe("Eklenecek/guncellenecek config key-value'lar"),
        removeConfig: z.array(z.string()).optional().describe("Silinecek config key'ler"),
        hosting: z.enum(["docker", "existing"]).optional().describe("Hosting modu (infra icin)"),
    },
}, async ({ designId, componentId, name, setConfig, removeConfig, hosting }) => {
    const storeRes = await devkitApi(`architecturedesigner/store/${designId}`, "GET");
    if (!storeRes.success)
        return { content: [{ type: "text", text: "Design bulunamadi." }] };
    const design = storeRes.design;
    const comp = design.components.find((c) => c.id === componentId);
    if (!comp)
        return { content: [{ type: "text", text: `Component '${componentId}' bulunamadi.` }] };
    // Ad guncelle
    if (name)
        comp.name = name;
    // Hosting modu
    if (hosting) {
        comp.config.hosting = hosting;
        if (hosting === "existing") {
            delete comp.config.image;
            if (!comp.config.host)
                comp.config.host = "localhost";
        }
    }
    // Config ekle/guncelle
    if (setConfig) {
        Object.entries(setConfig).forEach(([k, v]) => { comp.config[k] = v; });
    }
    // Config sil
    if (removeConfig) {
        removeConfig.forEach(k => { delete comp.config[k]; });
    }
    // Store'a kaydet
    await devkitApi(`architecturedesigner/store/${designId}`, "POST", design);
    const changes = [];
    if (name)
        changes.push(`ad: ${name}`);
    if (hosting)
        changes.push(`hosting: ${hosting}`);
    if (setConfig)
        changes.push(`config eklendi: ${Object.keys(setConfig).join(", ")}`);
    if (removeConfig && removeConfig.length > 0)
        changes.push(`config silindi: ${removeConfig.join(", ")}`);
    return { content: [{ type: "text", text: `Component guncellendi: ${changes.join(" | ")}\n\n${formatResult(comp)}` }] };
});
server.registerTool("devkit_arch_update_metadata", {
    title: "Update Design Metadata",
    description: `Tasarimin meta bilgilerini gunceller: ad, aciklama, framework, architecture, outputPath.
"framework'u nextjs yap", "output path degistir", "architecture'i microservices yap" dediginde CAGIR.`,
    inputSchema: {
        designId: z.string().min(1).describe("Design ID"),
        name: z.string().optional().describe("Yeni design adi"),
        description: z.string().optional().describe("Yeni aciklama"),
        framework: z.enum(["dotnet", "nextjs", "nodejs", "python"]).optional(),
        architecture: z.enum(["clean", "hexagonal", "ddd", "modular-monolith", "microservices", "simple"]).optional(),
        outputPath: z.string().optional().describe("Yeni output dizini"),
    },
}, async ({ designId, name, description, framework, architecture, outputPath }) => {
    const storeRes = await devkitApi(`architecturedesigner/store/${designId}`, "GET");
    if (!storeRes.success)
        return { content: [{ type: "text", text: "Design bulunamadi." }] };
    const design = storeRes.design;
    const changes = [];
    if (name !== undefined) {
        design.name = name;
        changes.push(`name: ${name}`);
    }
    if (description !== undefined) {
        design.description = description;
        changes.push("description guncellendi");
    }
    if (framework !== undefined) {
        design.framework = framework;
        changes.push(`framework: ${framework}`);
    }
    if (architecture !== undefined) {
        design.architecture = architecture;
        changes.push(`architecture: ${architecture}`);
    }
    if (outputPath !== undefined) {
        design.outputPath = outputPath;
        changes.push(`outputPath: ${outputPath}`);
    }
    await devkitApi(`architecturedesigner/store/${designId}`, "POST", design);
    return { content: [{ type: "text", text: `Metadata guncellendi: ${changes.join(" | ")}` }] };
});
// ═══════════════════════════════════════════════
// DATABASE QUERY TOOLS (v2 - PostgreSQL + MSSQL + Couchbase)
// Mevcut index.ts'teki DATABASE QUERY TOOLS blogunu KOMPLE bununla degistir
// ═══════════════════════════════════════════════
server.registerTool("devkit_db_query", {
    title: "Database Query (SELECT)",
    description: `Veritabaninda SELECT sorgusu calistirir ve sonuclari doner.
PostgreSQL, MSSQL ve Couchbase (N1QL) destekler.
"tablodaki verileri goster", "son 10 kaydi getir", "kayit var mi kontrol et" dediginde CAGIR.
Couchbase icin N1QL kullanin: SELECT * FROM bucket WHERE type = 'user' LIMIT 10`,
    inputSchema: {
        connectionString: z.string().min(1).describe("Connection string. PostgreSQL: Host=...;Database=... | MSSQL: Server=...;Database=... | Couchbase: host=localhost;port=8091;username=admin;password=pass;bucket=default"),
        sql: z.string().min(1).describe("SQL sorgusu (Couchbase icin N1QL)"),
        provider: z.enum(["postgresql", "mssql", "couchbase"]).optional().describe("DB provider (otomatik tespit edilir)"),
        maxRows: z.number().optional().describe("Maksimum satir sayisi (varsayilan 100)"),
    },
}, async ({ connectionString, sql, provider, maxRows }) => {
    const data = await devkitApi("db/query", "POST", { connectionString, sql, provider, maxRows: maxRows || 100 });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_db_execute", {
    title: "Database Execute (DDL/DML)",
    description: `SQL DDL veya DML calistirir. PostgreSQL, MSSQL ve Couchbase destekler.
CREATE TABLE, ALTER TABLE, INSERT, UPDATE, DELETE, DROP, TRUNCATE, CREATE INDEX,
CREATE FUNCTION, CREATE PROCEDURE, CREATE TRIGGER, GRANT, REVOKE.
Couchbase: CREATE INDEX, CREATE PRIMARY INDEX, INSERT INTO, UPDATE, DELETE FROM, UPSERT.
"tablo olustur", "kayit ekle", "index olustur", "stored procedure yaz", "kayit sil" dediginde CAGIR.`,
    inputSchema: {
        connectionString: z.string().min(1).describe("Connection string"),
        sql: z.string().min(1).describe("DDL/DML SQL ifadesi"),
        provider: z.enum(["postgresql", "mssql", "couchbase"]).optional(),
    },
}, async ({ connectionString, sql, provider }) => {
    const data = await devkitApi("db/execute", "POST", { connectionString, sql, provider });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_db_batch", {
    title: "Database Batch Execute",
    description: `Birden fazla SQL ifadesini sirayla calistirir. Transaction destegi (PostgreSQL/MSSQL).
"tum tablolari olustur", "migration calistir", "seed data yukle", "schema olustur" dediginde CAGIR.`,
    inputSchema: {
        connectionString: z.string().min(1).describe("Connection string"),
        statements: z.array(z.string()).min(1).describe("Sirayla calistirilacak SQL ifadeleri"),
        provider: z.enum(["postgresql", "mssql", "couchbase"]).optional(),
        useTransaction: z.boolean().optional().describe("Transaction kullan (varsayilan true, Couchbase'de yok)"),
        stopOnError: z.boolean().optional().describe("Hatada dur (varsayilan true)"),
    },
}, async ({ connectionString, statements, provider, useTransaction, stopOnError }) => {
    const data = await devkitApi("db/batch", "POST", { connectionString, statements, provider, useTransaction: useTransaction ?? true, stopOnError: stopOnError ?? true });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_db_tables", {
    title: "List Database Tables",
    description: `Tablolari/collection'lari listeler. PostgreSQL/MSSQL icin schema bazli, Couchbase icin bucket bazli.
"tablolari listele", "hangi tablolar var", "collection'lari goster" dediginde CAGIR.`,
    inputSchema: {
        connectionString: z.string().min(1).describe("Connection string"),
        provider: z.enum(["postgresql", "mssql", "couchbase"]).optional(),
        schema: z.string().optional().describe("Schema adi (PostgreSQL: public, MSSQL: dbo, Couchbase: bucket adi)"),
    },
}, async ({ connectionString, provider, schema }) => {
    const data = await devkitApi("db/tables", "POST", { connectionString, provider, schema });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_db_describe", {
    title: "Describe Table/Collection",
    description: `Tablo yapisini detayli gosterir: kolonlar, tipler, indexler, PK, nullable, default.
Couchbase icin INFER komutu ile document yapisini cikarir.
"tablo yapisini goster", "kolonlari listele", "indexleri goster", "document yapisini incele" dediginde CAGIR.`,
    inputSchema: {
        connectionString: z.string().min(1).describe("Connection string"),
        tableName: z.string().min(1).describe("Tablo/collection adi"),
        provider: z.enum(["postgresql", "mssql", "couchbase"]).optional(),
        schema: z.string().optional().describe("Schema adi"),
    },
}, async ({ connectionString, tableName, provider, schema }) => {
    const data = await devkitApi("db/describe", "POST", { connectionString, tableName, provider, schema });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// SHELL / TERMINAL TOOLS
// Mevcut devkit_run ve devkit_search tool'larini SIL, bunlarla degistir
// ═══════════════════════════════════════════════
server.registerTool("devkit_shell_exec", {
    title: "Execute Shell Command",
    description: `cmd, PowerShell veya bash ile herhangi bir komutu calistirir.
Shell: powershell (Windows varsayilan), bash (Mac varsayilan), cmd, pwsh.
dotnet build/run/publish/test, npm run/install/build, az webapp deploy, git push,
pg_dump, redis-cli, docker, kubectl, curl, ssh VE bunlar gibi TUM CLI komutlari calistirilabilir.
"komutu calistir", "dotnet publish yap", "az webapp deploy", "npm run build" dediginde CAGIR.`,
    inputSchema: {
        command: z.string().min(1).describe("Calistirilacak komut"),
        workingDirectory: z.string().optional().describe("Calisma dizini (bossa aktif profil)"),
        shell: z.enum(["powershell", "ps", "pwsh", "bash", "sh", "cmd"]).optional().describe("Shell tipi"),
        timeoutSeconds: z.number().optional().describe("Timeout saniye (varsayilan 120)"),
        environment: z.record(z.string()).optional().describe("Ortam degiskenleri ({PGPASSWORD: '...', NODE_ENV: 'production'})"),
        stdin: z.string().optional().describe("Komuta gonderilecek stdin icerigi (orn: yes/no cevabi, username, password). Birden fazla satir icin \\n kullanin."),
    },
}, async ({ command, workingDirectory, shell, timeoutSeconds, environment, stdin }) => {
    let dir = workingDirectory;
    if (!dir) {
        const profileRes = await devkitApi("profile/active", "GET");
        dir = profileRes?.profile?.workspace;
    }
    const data = await devkitApi("shell/exec", "POST", {
        command, workingDirectory: dir, shell, timeoutSeconds: timeoutSeconds || 120, environment, stdin,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_shell_steps", {
    title: "Execute Multi-Step Commands",
    description: `Birden fazla komutu sirayla calistirir. Her adim farkli dizinde ve farkli shell'de calisabilir.
Deploy pipeline, build+publish+deploy, migration+seed, test+build+publish gibi cok adimli isler icin.
Her adim icin ayri workingDirectory ve shell belirtilebilir.
"once build, sonra publish, sonra deploy yap", "su adimlari sirayla calistir" dediginde CAGIR.`,
    inputSchema: {
        steps: z.array(z.object({
            command: z.string().min(1).describe("Komut"),
            name: z.string().optional().describe("Adim adi (orn: 'Build API')"),
            workingDirectory: z.string().optional().describe("Bu adim icin dizin"),
            shell: z.enum(["powershell", "ps", "pwsh", "bash", "sh", "cmd"]).optional().describe("Bu adim icin shell"),
            timeoutSeconds: z.number().optional().describe("Bu adim icin timeout"),
            environment: z.record(z.string()).optional(),
        })).min(1),
        shell: z.enum(["powershell", "ps", "pwsh", "bash", "sh", "cmd"]).optional().describe("Varsayilan shell"),
        workingDirectory: z.string().optional().describe("Varsayilan dizin (bossa aktif profil)"),
        stopOnError: z.boolean().optional().describe("Hatada dur (varsayilan true)"),
        timeoutSeconds: z.number().optional().describe("Varsayilan timeout (120sn)"),
        environment: z.record(z.string()).optional(),
    },
}, async ({ steps, shell, workingDirectory, stopOnError, timeoutSeconds, environment }) => {
    let dir = workingDirectory;
    if (!dir) {
        const profileRes = await devkitApi("profile/active", "GET");
        dir = profileRes?.profile?.workspace;
    }
    const data = await devkitApi("shell/exec-steps", "POST", {
        steps, shell, workingDirectory: dir, stopOnError: stopOnError ?? true,
        timeoutSeconds: timeoutSeconds || 120, environment,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_shell_script", {
    title: "Create and Run Script",
    description: `Cok satirli script icerigi alir, dosya olusturur (.ps1/.sh/.bat) ve calistirir.
Deploy scriptleri, migration scriptleri, build pipeline'lari, setup scriptleri icin ideal.
Script varsayilan olarak silinir, keepScript=true ile saklanir, saveTo ile belirli dizine kaydedilir.
"deploy script'i yaz ve calistir", "bu PowerShell scriptini calistir", "build pipeline olustur" dediginde CAGIR.`,
    inputSchema: {
        script: z.string().min(1).describe("Script icerigi (cok satirli)"),
        workingDirectory: z.string().optional().describe("Calisma dizini"),
        shell: z.enum(["powershell", "ps", "pwsh", "bash", "sh", "cmd"]).optional(),
        scriptFileName: z.string().optional().describe("Dosya adi (orn: 'deploy.ps1', 'build.sh')"),
        saveTo: z.string().optional().describe("Script'in kaydedilecegi dizin"),
        keepScript: z.boolean().optional().describe("Script dosyasini sakla (varsayilan false)"),
        timeoutSeconds: z.number().optional(),
        environment: z.record(z.string()).optional(),
    },
}, async ({ script, workingDirectory, shell, scriptFileName, saveTo, keepScript, timeoutSeconds, environment }) => {
    let dir = workingDirectory;
    if (!dir) {
        const profileRes = await devkitApi("profile/active", "GET");
        dir = profileRes?.profile?.workspace;
    }
    const data = await devkitApi("shell/run-script", "POST", {
        script, workingDirectory: dir, shell, scriptFileName, saveTo,
        keepScript: keepScript || false, timeoutSeconds: timeoutSeconds || 120, environment,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_shell_run_file", {
    title: "Run Existing Script File",
    description: `Mevcut script dosyasini calistirir: .ps1, .sh, .bat, .cmd, .py, .js.
Dosya uzantisina gore otomatik dogru shell secer. Arguman gonderilebilir.
"deploy.ps1 calistir", "build.sh calistir", "setup.bat calistir", "script.py calistir" dediginde CAGIR.`,
    inputSchema: {
        filePath: z.string().min(1).describe("Script dosya yolu"),
        workingDirectory: z.string().optional().describe("Calisma dizini (bossa script'in dizini)"),
        arguments: z.array(z.string()).optional().describe("Script argumanlari"),
        timeoutSeconds: z.number().optional(),
        environment: z.record(z.string()).optional(),
    },
}, async ({ filePath, workingDirectory, arguments: args, timeoutSeconds, environment }) => {
    const data = await devkitApi("shell/run-file", "POST", {
        filePath, workingDirectory, arguments: args, timeoutSeconds: timeoutSeconds || 120, environment,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_search", {
    title: "Search in Code (grep)",
    description: `Proje dosyalarinda metin arar. Dosya adi, satir numarasi ve icerigi doner.
.cs, .ts, .tsx, .js, .json, .xml, .csproj, .py, .go, .md, .sql, .sh, .ps1 dosyalarinda arar.
"Customer kelimesini ara", "connection string nerede", "TODO bul", "using Npgsql ara" dediginde CAGIR.`,
    inputSchema: {
        pattern: z.string().min(1).describe("Aranacak metin"),
        directory: z.string().optional().describe("Arama dizini (bossa aktif profil)"),
        extensions: z.array(z.string()).optional().describe("Dosya uzantilari (orn: ['.cs', '.ts'])"),
        maxResults: z.number().optional().describe("Maks sonuc (varsayilan 50)"),
        caseSensitive: z.boolean().optional(),
    },
}, async ({ pattern, directory, extensions, maxResults, caseSensitive }) => {
    let dir = directory;
    if (!dir) {
        const profileRes = await devkitApi("profile/active", "GET");
        dir = profileRes?.profile?.workspace;
    }
    if (!dir)
        return { content: [{ type: "text", text: "Arama dizini belirtilmedi." }] };
    const data = await devkitApi("shell/search", "POST", {
        pattern, directory: dir, extensions, maxResults: maxResults || 50, caseSensitive: caseSensitive || false,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_which", {
    title: "Find Command Path",
    description: `Komutun sistemde kurulu olup olmadigini ve yolunu bulur (where/which).
"dotnet kurulu mu", "az cli var mi", "node nerede" dediginde CAGIR.`,
    inputSchema: {
        command: z.string().min(1).describe("Aranacak komut (orn: dotnet, node, az, git, docker)"),
    },
}, async ({ command }) => {
    const data = await devkitApi("shell/which", "POST", { command });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// FILE MANAGEMENT TOOLS (v2 - dedicated controller)
// Mevcut devkit_file_move ve devkit_file_delete tool'larini SIL, bunlarla degistir
// ═══════════════════════════════════════════════
server.registerTool("devkit_file_list", {
    title: "List Directory Contents",
    description: `Dizin icerigini listeler: dosyalar ve alt dizinler, boyut, tarih bilgileri ile.
"klasor icerigini goster", "dizindeki dosyalari listele" dediginde CAGIR.`,
    inputSchema: {
        path: z.string().optional().describe("Dizin yolu (bossa aktif profil workspace)"),
        showHidden: z.boolean().optional().describe("Gizli dosyalari goster"),
        extensions: z.array(z.string()).optional().describe("Dosya uzantisi filtresi (orn: ['.cs', '.json'])"),
    },
}, async ({ path, showHidden, extensions }) => {
    let dir = path;
    if (!dir) {
        const profileRes = await devkitApi("profile/active", "GET");
        dir = profileRes?.profile?.workspace;
    }
    if (!dir)
        return { content: [{ type: "text", text: "Dizin belirtilmedi." }] };
    const data = await devkitApi("file/list", "POST", { path: dir, showHidden: showHidden || false, extensions });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_file_tree", {
    title: "Directory Tree",
    description: `Dizin agacini recursive gosterir.
"dizin yapısını goster", "klasor agaci", "proje yapisi" dediginde CAGIR.`,
    inputSchema: {
        path: z.string().optional().describe("Dizin yolu (bossa aktif profil)"),
        maxDepth: z.number().optional().describe("Maksimum derinlik (varsayilan 3)"),
    },
}, async ({ path, maxDepth }) => {
    let dir = path;
    if (!dir) {
        const profileRes = await devkitApi("profile/active", "GET");
        dir = profileRes?.profile?.workspace;
    }
    if (!dir)
        return { content: [{ type: "text", text: "Dizin belirtilmedi." }] };
    const data = await devkitApi("file/tree", "POST", { path: dir, maxDepth: maxDepth || 3 });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_file_read", {
    title: "Read File Content",
    description: `Dosya icerigini okur.
"dosyayi oku", "icerigi goster", "kodu goster" dediginde CAGIR.`,
    inputSchema: {
        path: z.string().min(1).describe("Dosya yolu"),
    },
}, async ({ path }) => {
    const data = await devkitApi("file/read", "POST", { path });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_file_write", {
    title: "Write/Update File",
    description: `Dosya yazar veya gunceller. Dizin yoksa otomatik olusturur. Append modu destekler.
"dosya olustur", "dosyaya yaz", "dosyayi guncelle", "icerigi degistir" dediginde CAGIR.`,
    inputSchema: {
        path: z.string().min(1).describe("Dosya yolu"),
        content: z.string().describe("Dosya icerigi"),
        append: z.boolean().optional().describe("Sonuna ekle (varsayilan false = ustune yaz)"),
    },
}, async ({ path, content, append }) => {
    const data = await devkitApi("file/write", "POST", { path, content, append: append || false });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_file_mkdir", {
    title: "Create Directory",
    description: `Dizin olusturur (ic ice dizinler dahil).
"klasor olustur", "dizin yarat" dediginde CAGIR.`,
    inputSchema: {
        path: z.string().min(1).describe("Olusturulacak dizin yolu"),
    },
}, async ({ path }) => {
    const data = await devkitApi("file/mkdir", "POST", { path });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_file_copy", {
    title: "Copy File/Directory",
    description: `Dosya veya dizini kopyalar (recursive).
"dosyayi kopyala", "klasoru kopyala" dediginde CAGIR.`,
    inputSchema: {
        source: z.string().min(1).describe("Kaynak yolu"),
        destination: z.string().min(1).describe("Hedef yolu"),
        overwrite: z.boolean().optional().describe("Ustune yaz"),
    },
}, async ({ source, destination, overwrite }) => {
    const data = await devkitApi("file/copy", "POST", { source, destination, overwrite: overwrite || false });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_file_move", {
    title: "Move/Rename File or Directory",
    description: `Dosya veya dizini tasir veya yeniden adlandirir.
"dosyayi tasi", "klasoru tasi", "dosya adini degistir", "rename" dediginde CAGIR.`,
    inputSchema: {
        source: z.string().min(1).describe("Kaynak yolu"),
        destination: z.string().min(1).describe("Hedef yolu"),
        overwrite: z.boolean().optional().describe("Ustune yaz"),
    },
}, async ({ source, destination, overwrite }) => {
    const data = await devkitApi("file/move", "POST", { source, destination, overwrite: overwrite || false });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_file_delete", {
    title: "Delete File or Directory",
    description: `Dosya veya dizini siler. Dizinler icin recursive opsiyonu var.
"dosyayi sil", "klasoru sil", "kaldir" dediginde CAGIR.`,
    inputSchema: {
        path: z.string().min(1).describe("Silinecek dosya/dizin yolu"),
        recursive: z.boolean().optional().describe("Alt dizinleri de sil (dizinler icin gerekli)"),
    },
}, async ({ path, recursive }) => {
    const data = await devkitApi("file/delete", "POST", { path, recursive: recursive || false });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_file_info", {
    title: "File/Directory Info",
    description: `Dosya veya dizin hakkinda detayli bilgi: boyut, tarih, dosya sayisi.
"dosya bilgisi", "boyutu ne", "ne zaman degisti" dediginde CAGIR.`,
    inputSchema: {
        path: z.string().min(1).describe("Dosya veya dizin yolu"),
    },
}, async ({ path }) => {
    const data = await devkitApi("file/info", "POST", { path });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_file_find", {
    title: "Find Files",
    description: `Dizin icinde dosya arar (pattern ile). Glob pattern destekler.
"cs dosyalarini bul", "json dosyalarini ara", "Controller dosyalarini bul" dediginde CAGIR.`,
    inputSchema: {
        directory: z.string().optional().describe("Arama dizini (bossa aktif profil)"),
        pattern: z.string().min(1).describe("Dosya pattern (orn: '*.cs', '*Controller*', '*.json')"),
        maxResults: z.number().optional().describe("Maksimum sonuc (varsayilan 200)"),
    },
}, async ({ directory, pattern, maxResults }) => {
    let dir = directory;
    if (!dir) {
        const profileRes = await devkitApi("profile/active", "GET");
        dir = profileRes?.profile?.workspace;
    }
    if (!dir)
        return { content: [{ type: "text", text: "Dizin belirtilmedi." }] };
    const data = await devkitApi("file/find", "POST", { directory: dir, pattern, maxResults: maxResults || 200 });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_file_bulk_delete", {
    title: "Bulk Delete Files",
    description: `Birden fazla dosya/dizini toplu siler.
"bu dosyalari sil", "toplu silme" dediginde CAGIR.`,
    inputSchema: {
        paths: z.array(z.string()).min(1).describe("Silinecek dosya/dizin yollari"),
    },
}, async ({ paths }) => {
    const data = await devkitApi("file/bulk-delete", "POST", { paths });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// BUILD TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_build", {
    title: "Build Project",
    description: `Projeyi build eder (dotnet build veya npm run build). Hatalari ve uyarilari ayiklar.
"projeyi build et", "derle", "compile et", "hata var mi kontrol et", "build hatalarini goster" dediginde CAGIR.`,
    inputSchema: {
        projectPath: z.string().optional().describe("Proje dizini (bossa aktif profilin workspace'i)"),
        framework: z.enum(["dotnet", "node"]).optional().describe("Framework (bossa otomatik tespit)"),
        command: z.string().optional().describe("Ozel build komutu (orn: 'build --configuration Release')"),
    },
}, async ({ projectPath, framework, command }) => {
    let path = projectPath;
    if (!path) {
        const profileRes = await devkitApi("profile/active", "GET");
        path = profileRes?.profile?.workspace;
    }
    if (!path)
        return { content: [{ type: "text", text: "Proje dizini belirtilmedi ve aktif profil yok. projectPath girin veya profil aktif edin." }] };
    const data = await devkitApi("build", "POST", { projectPath: path, framework, command });
    if (!data.success && data.error)
        return { content: [{ type: "text", text: `Build baslatilamadi: ${data.error}` }] };
    const parts = [];
    parts.push(data.success ? "BUILD BASARILI" : "BUILD BASARISIZ");
    parts.push(`Exit code: ${data.exitCode}`);
    if (data.errorCount && data.errorCount > 0) {
        parts.push(`\n${data.errorCount} HATA:`);
        data.errors?.forEach(e => parts.push(`  ${e}`));
    }
    if (data.warningCount && data.warningCount > 0) {
        parts.push(`\n${data.warningCount} UYARI:`);
        data.warnings?.forEach(w => parts.push(`  ${w}`));
    }
    if (!data.success && data.errors && data.errors.length > 0) {
        parts.push("\nHatalari analiz edip duzeltmemi ister misiniz?");
    }
    return { content: [{ type: "text", text: parts.join("\n") }] };
});
server.registerTool("devkit_restore", {
    title: "Restore Dependencies",
    description: `Paket bagimliklarini yukler (dotnet restore veya npm install).
"restore yap", "paketleri yukle", "npm install", "dotnet restore" dediginde CAGIR.`,
    inputSchema: {
        projectPath: z.string().optional().describe("Proje dizini (bossa aktif profilin workspace'i)"),
        framework: z.enum(["dotnet", "node"]).optional().describe("Framework (bossa otomatik tespit)"),
    },
}, async ({ projectPath, framework }) => {
    let path = projectPath;
    if (!path) {
        const profileRes = await devkitApi("profile/active", "GET");
        path = profileRes?.profile?.workspace;
    }
    if (!path)
        return { content: [{ type: "text", text: "Proje dizini belirtilmedi ve aktif profil yok." }] };
    const data = await devkitApi("build/restore", "POST", { projectPath: path, framework });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// TEST TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_test", {
    title: "Run Tests",
    description: `Testleri calistirir ve sonuclari parse eder (dotnet test / npm test).
Passed, failed, skipped sayilari ve basarisiz test detaylari doner.
"testleri calistir", "dotnet test", "unit testleri calistir" dediginde CAGIR.`,
    inputSchema: {
        projectPath: z.string().optional().describe("Proje dizini (bossa aktif profil)"),
        framework: z.enum(["dotnet", "node"]).optional(),
        filter: z.string().optional().describe("Test filtresi (dotnet: --filter, node: test script adi)"),
        project: z.string().optional().describe("Belirli test projesi (orn: tests/MyApp.Tests)"),
    },
}, async ({ projectPath, framework, filter, project }) => {
    let path = projectPath;
    if (!path) {
        const profileRes = await devkitApi("profile/active", "GET");
        path = profileRes?.profile?.workspace;
    }
    if (!path)
        return { content: [{ type: "text", text: "Proje dizini belirtilmedi." }] };
    const data = await devkitApi("test", "POST", { projectPath: path, framework, filter, project });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// PROJECT EXTEND TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_add_dotnet_project", {
    title: "Add .NET Project to Solution",
    description: `Mevcut solution'a yeni .NET projesi ekler: classlib, webapi, worker, console, test, grpc, blazor.
Otomatik olarak solution'a ekler, referanslari kurar, NuGet paketlerini yukler.
"yeni classlib ekle", "worker service ekle", "test projesi ekle", "yeni API projesi ekle" dediginde CAGIR.`,
    inputSchema: {
        solutionPath: z.string().min(1).describe("Solution dizini veya .sln dosya yolu"),
        projectName: z.string().min(1).describe("Proje adi (orn: MyApp.NewLayer)"),
        projectType: z.enum(["classlib", "webapi", "worker", "console", "test", "xunit", "nunit", "grpc", "blazor"]).default("classlib"),
        framework: z.string().optional().describe("Framework (varsayilan net9.0)"),
        subDirectory: z.string().optional().describe("Alt dizin (varsayilan src)"),
        references: z.array(z.string()).optional().describe("Referans eklenecek proje adlari (orn: ['MyApp.Domain', 'MyApp.Application'])"),
        packages: z.array(z.string()).optional().describe("NuGet paketleri (orn: ['MediatR', 'Serilog'])"),
        folders: z.array(z.string()).optional().describe("Olusturulacak klasorler (orn: ['Services', 'Models', 'Interfaces'])"),
    },
}, async ({ solutionPath, projectName, projectType, framework, subDirectory, references, packages, folders }) => {
    const data = await devkitApi("codegen/add-project", "POST", { solutionPath, projectName, projectType, framework, subDirectory, references, packages, folders });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_add_frontend_project", {
    title: "Add Frontend Project",
    description: `Mevcut projeye Next.js, React/Vite veya Node.js projesi ekler.
"Next.js frontend ekle", "React projesi olustur", "Node.js API ekle" dediginde CAGIR.`,
    inputSchema: {
        parentPath: z.string().min(1).describe("Ust dizin (projenin root'u)"),
        projectName: z.string().min(1).describe("Proje adi"),
        projectType: z.enum(["nextjs", "react", "vite", "nodejs", "express"]).default("nextjs"),
        packages: z.array(z.string()).optional().describe("Ek npm paketleri"),
    },
}, async ({ parentPath, projectName, projectType, packages }) => {
    const data = await devkitApi("codegen/add-frontend", "POST", { parentPath, projectName, projectType, packages });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// CODE GENERATION TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_codegen", {
    title: "Generate Boilerplate Code",
    description: `Entity, Repository, Service, Controller, DTO boilerplate kodu uretir.
Template tipleri: entity, repository, service, controller, dto, full (hepsini olusturur).
"Customer entity olustur", "Order icin full CRUD kodlari uret", "DTO'lari olustur" dediginde CAGIR.`,
    inputSchema: {
        template: z.enum(["entity", "repository", "service", "controller", "dto", "full"]).describe("Kod sablonu"),
        name: z.string().min(1).describe("Entity/model adi (orn: Customer, Order, Product)"),
        namespace: z.string().optional().describe("Namespace (orn: MyApp)"),
        properties: z.record(z.string()).optional().describe("Propertyler: { 'Name': 'string', 'Email': 'string', 'Age': 'int' }"),
    },
}, async ({ template, name, namespace: ns, properties }) => {
    const data = await devkitApi("codegen/generate", "POST", { template, name, namespace: ns, properties });
    if (data.success && data.files) {
        const summary = data.files.map((f) => `  ${f.path}`).join("\n");
        return { content: [{ type: "text", text: `${data.files.length} dosya uretildi:\n${summary}\n\nDosyalari projeye yazmak icin devkit_import_file kullanin.` }] };
    }
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_codegen_write", {
    title: "Generate and Write Boilerplate",
    description: `Boilerplate kod uretir VE dosyalari direkt projeye yazar. devkit_codegen + devkit_import_file birlesimidir.
"Customer icin full CRUD yaz ve import et" dediginde CAGIR.`,
    inputSchema: {
        template: z.enum(["entity", "repository", "service", "controller", "dto", "full"]),
        name: z.string().min(1).describe("Entity adi"),
        namespace: z.string().optional(),
        properties: z.record(z.string()).optional(),
        basePath: z.string().optional().describe("Proje root dizini (bossa aktif profil)"),
    },
}, async ({ template, name, namespace: ns, properties, basePath }) => {
    let path = basePath;
    if (!path) {
        const profileRes = await devkitApi("profile/active", "GET");
        path = profileRes?.profile?.workspace;
    }
    if (!path)
        return { content: [{ type: "text", text: "Proje dizini belirtilmedi." }] };
    const genRes = await devkitApi("codegen/generate", "POST", { template, name, namespace: ns, properties });
    if (!genRes.success || !genRes.files)
        return { content: [{ type: "text", text: formatResult(genRes) }] };
    const results = [];
    for (const file of genRes.files) {
        const fullPath = `${path}\\${file.path.replace(/\//g, "\\")}`;
        const importRes = await devkitApi("fileimport", "POST", { filePath: fullPath, content: file.content });
        results.push(`${importRes.success ? "OK" : "HATA"}: ${file.path}`);
    }
    return { content: [{ type: "text", text: `${genRes.files.length} dosya yazildi:\n${results.join("\n")}` }] };
});
// ═══════════════════════════════════════════════
// EF CORE MIGRATION TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_ef_migration", {
    title: "EF Core Migration",
    description: `Entity Framework Core migration islemleri: add, update, remove, list, script.
"migration ekle", "database guncelle", "migration listele", "migration scripti olustur" dediginde CAGIR.`,
    inputSchema: {
        solutionPath: z.string().optional().describe("Solution dizini (bossa aktif profil)"),
        action: z.enum(["add", "update", "remove", "list", "script"]),
        migrationName: z.string().optional().describe("Migration adi (add icin gerekli)"),
        infrastructureProject: z.string().optional().describe("DbContext projesi (varsayilan src/Infrastructure)"),
        startupProject: z.string().optional().describe("Startup projesi (varsayilan src/Api)"),
    },
}, async ({ solutionPath, action, migrationName, infrastructureProject, startupProject }) => {
    let path = solutionPath;
    if (!path) {
        const profileRes = await devkitApi("profile/active", "GET");
        path = profileRes?.profile?.workspace;
    }
    if (!path)
        return { content: [{ type: "text", text: "Solution dizini belirtilmedi." }] };
    const data = await devkitApi("codegen/ef-migration", "POST", { solutionPath: path, action, migrationName, infrastructureProject, startupProject });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// CODE FORMAT TOOL
// ═══════════════════════════════════════════════
server.registerTool("devkit_format", {
    title: "Format Code",
    description: `Kodu formatlar (dotnet format / prettier).
"kodu formatla", "prettier calistir", "dotnet format" dediginde CAGIR.`,
    inputSchema: {
        projectPath: z.string().optional().describe("Proje dizini (bossa aktif profil)"),
        framework: z.enum(["dotnet", "node"]).optional(),
    },
}, async ({ projectPath, framework }) => {
    let path = projectPath;
    if (!path) {
        const profileRes = await devkitApi("profile/active", "GET");
        path = profileRes?.profile?.workspace;
    }
    if (!path)
        return { content: [{ type: "text", text: "Proje dizini belirtilmedi." }] };
    const data = await devkitApi("codegen/format", "POST", { projectPath: path, framework });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// GITHUB CLI TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_github_repo", {
    title: "GitHub Repository Operations",
    description: `GitHub repo olusturur veya bilgi alir (gh CLI gerekir).
"GitHub repo olustur", "repo bilgilerini goster" dediginde CAGIR.`,
    inputSchema: {
        action: z.enum(["create", "view", "list"]),
        name: z.string().optional().describe("Repo adi (create icin)"),
        visibility: z.enum(["public", "private"]).optional().default("private"),
        workingDirectory: z.string().optional(),
    },
}, async ({ action, name, visibility, workingDirectory }) => {
    let dir = workingDirectory;
    if (!dir) {
        const profileRes = await devkitApi("profile/active", "GET");
        dir = profileRes?.profile?.workspace;
    }
    if (!dir)
        return { content: [{ type: "text", text: "Dizin belirtilmedi." }] };
    let command;
    switch (action) {
        case "create":
            command = `gh repo create ${name || "my-repo"} --${visibility || "private"} --source . --push`;
            break;
        case "view":
            command = "gh repo view";
            break;
        case "list":
            command = "gh repo list --limit 20";
            break;
        default: return { content: [{ type: "text", text: "Gecersiz action." }] };
    }
    const data = await devkitApi("run", "POST", { command, workingDirectory: dir, timeoutSeconds: 30 });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_github_pr", {
    title: "GitHub PR Operations",
    description: `Pull Request olusturur, listeler veya goruntulur.
"PR olustur", "PR listele", "PR goruntule" dediginde CAGIR.`,
    inputSchema: {
        action: z.enum(["create", "list", "view", "merge"]),
        title: z.string().optional().describe("PR basligi (create icin)"),
        body: z.string().optional().describe("PR aciklamasi"),
        base: z.string().optional().describe("Hedef branch (varsayilan main)"),
        prNumber: z.number().optional().describe("PR numarasi (view/merge icin)"),
        workingDirectory: z.string().optional(),
    },
}, async ({ action, title, body, base, prNumber, workingDirectory }) => {
    let dir = workingDirectory;
    if (!dir) {
        const profileRes = await devkitApi("profile/active", "GET");
        dir = profileRes?.profile?.workspace;
    }
    if (!dir)
        return { content: [{ type: "text", text: "Dizin belirtilmedi." }] };
    let command;
    switch (action) {
        case "create":
            command = `gh pr create --title "${title || "New PR"}" --body "${body || ""}" --base ${base || "main"}`;
            break;
        case "list":
            command = "gh pr list";
            break;
        case "view":
            command = `gh pr view ${prNumber || ""}`;
            break;
        case "merge":
            command = `gh pr merge ${prNumber || ""} --merge`;
            break;
        default: return { content: [{ type: "text", text: "Gecersiz action." }] };
    }
    const data = await devkitApi("run", "POST", { command, workingDirectory: dir, timeoutSeconds: 30 });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// HEALTH CHECK (shell uzerinden)
// Mevcut devkit_health_check'i bununla degistir
// ═══════════════════════════════════════════════
server.registerTool("devkit_health_check", {
    title: "HTTP Health Check",
    description: `HTTP endpoint'e istek gonderir ve durumunu kontrol eder.
"API ayakta mi", "health check", "endpoint test et", "servisi kontrol et" dediginde CAGIR.`,
    inputSchema: {
        url: z.string().min(1).describe("URL (orn: http://localhost:5001/health)"),
        method: z.enum(["GET", "POST", "HEAD"]).optional().default("GET"),
        timeoutSeconds: z.number().optional().default(10),
    },
}, async ({ url, method, timeoutSeconds }) => {
    const curlCmd = `curl -s -o /dev/null -w "%{http_code} %{time_total}s" -X ${method || "GET"} "${url}" --max-time ${timeoutSeconds || 10}`;
    const data = await devkitApi("shell/exec", "POST", { command: curlCmd, shell: "cmd", timeoutSeconds: (timeoutSeconds || 10) + 5 });
    if (data.success && data.stdout) {
        const parts = data.stdout.trim().split(" ");
        const statusCode = parseInt(parts[0]) || 0;
        const responseTime = parts[1] || "?";
        const healthy = statusCode >= 200 && statusCode < 400;
        return { content: [{ type: "text", text: `${healthy ? "HEALTHY" : "UNHEALTHY"} | Status: ${statusCode} | Response: ${responseTime} | URL: ${url}` }] };
    }
    return { content: [{ type: "text", text: `UNREACHABLE | URL: ${url} | Error: ${data.error || data.stderr || "Baglanti kurulamadi"}` }] };
});
// ═══════════════════════════════════════════════
// PACKAGE SEARCH (shell uzerinden)
// Mevcut devkit_package_search'i bununla degistir
// ═══════════════════════════════════════════════
server.registerTool("devkit_package_search", {
    title: "Search NuGet/npm Packages",
    description: `NuGet veya npm paket arar.
"MediatR paketini ara", "npm'de tailwind ara", "Serilog NuGet'te var mi" dediginde CAGIR.`,
    inputSchema: {
        query: z.string().min(1).describe("Paket adi"),
        source: z.enum(["nuget", "npm"]).default("nuget"),
        take: z.number().optional().describe("Sonuc sayisi (varsayilan 10)"),
    },
}, async ({ query, source, take }) => {
    const command = source === "nuget"
        ? `dotnet package search "${query}" --take ${take || 10}`
        : `npm search "${query}" --long --limit=${take || 10}`;
    const data = await devkitApi("shell/exec", "POST", { command, shell: "cmd", timeoutSeconds: 30 });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// BROWSER OPEN
// ═══════════════════════════════════════════════
server.registerTool("devkit_browser_open", {
    title: "Open URL in Browser",
    description: `Kullanicinin varsayilan tarayicisinda URL acar.
az login sonrasi donen URL, OAuth callback, web uygulamasi test vb. icin kullanilir.
"bu linki ac", "tarayicida ac", "URL'yi browser'da goster" dediginde CAGIR.`,
    inputSchema: {
        url: z.string().min(1).describe("Acilacak URL"),
    },
}, async ({ url }) => {
    const data = await devkitApi("browser/open", "POST", { url });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// PROCESS INTERACTIVE INPUT
// ═══════════════════════════════════════════════
server.registerTool("devkit_process_input", {
    title: "Send Input to Running Process",
    description: `Arka planda calisan bir process'e stdin uzerinden input gonderir.
Interaktif komutlar icin: username/password prompt, yes/no cevabi, az login kodu vb.
Once devkit_process_start ile process baslatin, sonra bu tool ile input gonderin.
"process'e yes yaz", "username gonder", "sifre gir" dediginde CAGIR.`,
    inputSchema: {
        processId: z.string().min(1).describe("Process ID"),
        input: z.string().min(1).describe("Gonderilecek input (orn: 'yes', username, password)"),
        waitMs: z.number().optional().describe("Input sonrasi bekleme ms (varsayilan 500)"),
    },
}, async ({ processId, input, waitMs }) => {
    const data = await devkitApi(`process/input/${processId}`, "POST", { input, waitMs: waitMs || 500 });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// REDIS TOOLS (v2 - dedicated controller)
// Mevcut index.ts'teki devkit_redis ve devkit_redis_scan'i SIL, bunlarla degistir
// ═══════════════════════════════════════════════
server.registerTool("devkit_redis", {
    title: "Redis Execute Command",
    description: `Redis'e herhangi bir komut gonderir: GET, SET, DEL, HGETALL, LPUSH, LRANGE, TTL, EXPIRE, FLUSHDB, INFO vb.
"Redis'te SET yap", "cache'e yaz", "Redis komutu calistir" dediginde CAGIR.`,
    inputSchema: {
        connectionString: z.string().optional().describe("Redis connection (varsayilan localhost:6379). Ornek: 'localhost:6379,password=mypass'"),
        command: z.string().min(1).describe("Redis komutu (orn: 'SET mykey myvalue EX 3600', 'GET mykey', 'KEYS user:*')"),
        database: z.number().optional().describe("Redis DB numarasi (varsayilan 0)"),
    },
}, async ({ connectionString, command, database }) => {
    const data = await devkitApi("redis/execute", "POST", { connectionString: connectionString || "localhost:6379", command, database: database || 0 });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_redis_get", {
    title: "Redis Get Value",
    description: `Redis key'in degerini, tipini ve TTL'ini gosterir. String, Hash, List, Set, SortedSet tiplerini otomatik algilar.
"Redis'ten oku", "cache degerini getir", "key'in degerini goster" dediginde CAGIR.`,
    inputSchema: {
        connectionString: z.string().optional(),
        key: z.string().min(1).describe("Redis key"),
        database: z.number().optional(),
    },
}, async ({ connectionString, key, database }) => {
    const data = await devkitApi("redis/get", "POST", { connectionString: connectionString || "localhost:6379", key, database: database || 0 });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_redis_set", {
    title: "Redis Set Value",
    description: `Redis'e key-value yazar, opsiyonel TTL ile.
"Redis'e yaz", "cache'e kaydet", "key olustur" dediginde CAGIR.`,
    inputSchema: {
        connectionString: z.string().optional(),
        key: z.string().min(1).describe("Redis key"),
        value: z.string().min(1).describe("Deger"),
        expireSeconds: z.number().optional().describe("TTL saniye (0 = surezi)"),
        database: z.number().optional(),
    },
}, async ({ connectionString, key, value, expireSeconds, database }) => {
    const data = await devkitApi("redis/set", "POST", { connectionString: connectionString || "localhost:6379", key, value, expireSeconds: expireSeconds || 0, database: database || 0 });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_redis_delete", {
    title: "Redis Delete Key",
    description: `Redis key'i siler. "key'i sil", "cache temizle" dediginde CAGIR.`,
    inputSchema: {
        connectionString: z.string().optional(),
        key: z.string().min(1).describe("Silinecek key"),
        database: z.number().optional(),
    },
}, async ({ connectionString, key, database }) => {
    const data = await devkitApi("redis/delete", "POST", { connectionString: connectionString || "localhost:6379", key, database: database || 0 });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_redis_keys", {
    title: "Redis Key Scan",
    description: `Redis'teki key'leri pattern ile arar. Opsiyonel olarak degerleriyle birlikte getirir.
"Redis key'leri listele", "user:* key'lerini bul", "cache'te neler var" dediginde CAGIR.`,
    inputSchema: {
        connectionString: z.string().optional(),
        pattern: z.string().optional().describe("Key pattern (varsayilan '*', orn: 'user:*', 'session:*')"),
        maxCount: z.number().optional().describe("Maksimum sonuc (varsayilan 100)"),
        withValues: z.boolean().optional().describe("Degerleri de getir"),
        database: z.number().optional(),
    },
}, async ({ connectionString, pattern, maxCount, withValues, database }) => {
    const data = await devkitApi("redis/keys", "POST", { connectionString: connectionString || "localhost:6379", pattern: pattern || "*", maxCount: maxCount || 100, withValues: withValues || false, database: database || 0 });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_redis_hash", {
    title: "Redis Hash Operations",
    description: `Redis Hash islemleri: getall, get, set, delete.
"hash'in tum field'larini getir", "hash field ekle" dediginde CAGIR.`,
    inputSchema: {
        connectionString: z.string().optional(),
        key: z.string().min(1).describe("Hash key"),
        action: z.enum(["getall", "get", "set", "delete"]).describe("Islem"),
        field: z.string().optional().describe("Hash field adi (get/set/delete icin)"),
        value: z.string().optional().describe("Deger (set icin)"),
        database: z.number().optional(),
    },
}, async ({ connectionString, key, action, field, value, database }) => {
    const data = await devkitApi("redis/hash", "POST", { connectionString: connectionString || "localhost:6379", key, action, field, value, database: database || 0 });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_redis_admin", {
    title: "Redis Admin",
    description: `Redis admin islemleri: info, dbsize, flushdb, ping.
"Redis durumu", "kac key var", "cache bosalt", "Redis ping" dediginde CAGIR.`,
    inputSchema: {
        connectionString: z.string().optional(),
        action: z.enum(["info", "dbsize", "flushdb", "ping"]),
        database: z.number().optional(),
    },
}, async ({ connectionString, action, database }) => {
    const data = await devkitApi("redis/admin", "POST", { connectionString: connectionString || "localhost:6379", action, database: database || 0 });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// KAFKA TOOLS (v2 - dedicated controller)
// Mevcut index.ts'teki devkit_kafka_* tool'lari SIL, bunlarla degistir
// ═══════════════════════════════════════════════
server.registerTool("devkit_kafka_topics", {
    title: "Kafka Topic Operations",
    description: `Kafka topic islemleri: listele, olustur, sil, detay goster.
"Kafka topic'leri listele", "yeni topic olustur", "topic sil", "topic detayini goster" dediginde CAGIR.`,
    inputSchema: {
        action: z.enum(["list", "create", "delete", "describe"]),
        topicName: z.string().optional().describe("Topic adi (create/delete/describe icin)"),
        partitions: z.number().optional().describe("Partition sayisi (create icin, varsayilan 3)"),
        replicationFactor: z.number().optional().describe("Replication factor (create icin, varsayilan 1)"),
        bootstrapServers: z.string().optional().describe("Kafka broker (varsayilan localhost:9092)"),
    },
}, async ({ action, topicName, partitions, replicationFactor, bootstrapServers }) => {
    const broker = bootstrapServers || "localhost:9092";
    let endpoint;
    const body = { bootstrapServers: broker, topicName, partitions, replicationFactor };
    switch (action) {
        case "list":
            endpoint = "kafka/topics";
            break;
        case "create":
            endpoint = "kafka/topics/create";
            break;
        case "delete":
            endpoint = "kafka/topics/delete";
            break;
        case "describe":
            endpoint = "kafka/topics/describe";
            break;
        default: return { content: [{ type: "text", text: "Gecersiz action." }] };
    }
    const data = await devkitApi(endpoint, "POST", body);
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_kafka_produce", {
    title: "Kafka Produce Message",
    description: `Kafka topic'e mesaj gonderir (JSON veya text).
"Kafka'ya mesaj gonder", "event publish et", "topic'e yaz" dediginde CAGIR.`,
    inputSchema: {
        topicName: z.string().min(1).describe("Topic adi"),
        message: z.string().min(1).describe("Mesaj icerigi (JSON veya text)"),
        key: z.string().optional().describe("Message key (partitioning icin)"),
        bootstrapServers: z.string().optional().describe("Kafka broker (varsayilan localhost:9092)"),
    },
}, async ({ topicName, message, key, bootstrapServers }) => {
    const data = await devkitApi("kafka/produce", "POST", { bootstrapServers: bootstrapServers || "localhost:9092", topicName, message, key });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_kafka_produce_batch", {
    title: "Kafka Produce Batch Messages",
    description: `Kafka topic'e birden fazla mesaj gonderir.
"toplu mesaj gonder", "batch event yayinla" dediginde CAGIR.`,
    inputSchema: {
        topicName: z.string().min(1).describe("Topic adi"),
        messages: z.array(z.object({ key: z.string().optional(), value: z.string() })).min(1).describe("Mesaj listesi [{key?, value}]"),
        bootstrapServers: z.string().optional(),
    },
}, async ({ topicName, messages, bootstrapServers }) => {
    const data = await devkitApi("kafka/produce/batch", "POST", { bootstrapServers: bootstrapServers || "localhost:9092", topicName, messages });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_kafka_consume", {
    title: "Kafka Consume Messages",
    description: `Kafka topic'ten mesajlari okur (son N mesaj).
"Kafka'daki mesajlari oku", "topic'teki eventleri goster", "consume et" dediginde CAGIR.`,
    inputSchema: {
        topicName: z.string().min(1).describe("Topic adi"),
        maxMessages: z.number().optional().describe("Maksimum mesaj sayisi (varsayilan 10)"),
        fromBeginning: z.boolean().optional().describe("Bastan oku (varsayilan true)"),
        timeoutMs: z.number().optional().describe("Timeout ms (varsayilan 5000)"),
        bootstrapServers: z.string().optional(),
    },
}, async ({ topicName, maxMessages, fromBeginning, timeoutMs, bootstrapServers }) => {
    const data = await devkitApi("kafka/consume", "POST", {
        bootstrapServers: bootstrapServers || "localhost:9092", topicName,
        maxMessages: maxMessages || 10, fromBeginning: fromBeginning ?? true, timeoutMs: timeoutMs || 5000,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_kafka_groups", {
    title: "Kafka Consumer Groups",
    description: `Kafka consumer group'lari listeler.
"consumer group'lari goster" dediginde CAGIR.`,
    inputSchema: {
        bootstrapServers: z.string().optional().describe("Kafka broker (varsayilan localhost:9092)"),
    },
}, async ({ bootstrapServers }) => {
    const data = await devkitApi("kafka/groups", "POST", { bootstrapServers: bootstrapServers || "localhost:9092" });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// PROCESS MANAGER TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_process_start", {
    title: "Start Background Process",
    description: `Arka planda process baslatir (dotnet watch run, npm run dev, docker compose up -d vb.) ve takip eder.
"projeyi arka planda calistir", "dotnet watch baslat", "npm run dev baslat" dediginde CAGIR.`,
    inputSchema: {
        command: z.string().min(1).describe("Komut (orn: 'dotnet watch run', 'npm run dev')"),
        workingDirectory: z.string().optional().describe("Calisma dizini (bossa aktif profil)"),
        id: z.string().optional().describe("Process ID (orn: 'api', 'frontend', 'worker')"),
    },
}, async ({ command, workingDirectory, id }) => {
    let dir = workingDirectory;
    if (!dir) {
        const profileRes = await devkitApi("profile/active", "GET");
        dir = profileRes?.profile?.workspace;
    }
    if (!dir)
        return { content: [{ type: "text", text: "Calisma dizini belirtilmedi." }] };
    const data = await devkitApi("process/start", "POST", { command, workingDirectory: dir, id });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_process_stop", {
    title: "Stop Background Process",
    description: `Arka plandaki process'i durdurur.
"process'i durdur", "API'yi kapat", "worker'i durdur" dediginde CAGIR.`,
    inputSchema: {
        processId: z.string().min(1).describe("Process ID"),
    },
}, async ({ processId }) => {
    const data = await devkitApi(`process/stop/${processId}`, "POST");
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_process_output", {
    title: "Get Process Output",
    description: `Arka plandaki process'in ciktisini (log) gosterir.
"process loglarini goster", "API ciktisini goster" dediginde CAGIR.`,
    inputSchema: {
        processId: z.string().min(1).describe("Process ID"),
        tail: z.number().optional().describe("Son N satir (varsayilan 50)"),
    },
}, async ({ processId, tail }) => {
    const data = await devkitApi(`process/output/${processId}?tail=${tail || 50}`, "GET");
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_process_list", {
    title: "List Running Processes",
    description: `Arka planda calisan tum process'leri listeler.
"calisan process'leri goster", "neler calisiyor" dediginde CAGIR.`,
    inputSchema: {},
}, async () => {
    const data = await devkitApi("process/list", "GET");
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// PROJECT MANAGEMENT TOOLS (Package + Reference + Diff)
// Bu blogu index.ts'te MIGRATION TOOLS'un ustune ekle
// ═══════════════════════════════════════════════
// --- NUGET PAKET YONETIMI ---
server.registerTool("devkit_package_add", {
    title: "Add NuGet Package",
    description: `Projeye NuGet paketi ekler. Version belirtilmezse en son surum kurulur.
"Serilog paketini kur", "MediatR 12.4.1 versiyonunu ekle", "FluentValidation kur" dediginde CAGIR.`,
    inputSchema: {
        projectPath: z.string().min(1).describe("Proje veya csproj yolu"),
        packageName: z.string().min(1).describe("NuGet paket adi (orn: Serilog, MediatR)"),
        version: z.string().optional().describe("Spesifik versiyon (bos birakilirsa en son surum)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
}, async ({ projectPath, packageName, version }) => {
    const data = await devkitApi("projectmanagement/package/add", "POST", { projectPath, packageName, version });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_package_remove", {
    title: "Remove NuGet Package",
    description: `Projeden NuGet paketini kaldirir. "Serilog paketini kaldir" dediginde CAGIR.`,
    inputSchema: {
        projectPath: z.string().min(1).describe("Proje veya csproj yolu"),
        packageName: z.string().min(1).describe("Kaldirilacak NuGet paket adi"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
}, async ({ projectPath, packageName }) => {
    const data = await devkitApi("projectmanagement/package/remove", "POST", { projectPath, packageName });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_package_add_all", {
    title: "Add Package to All Projects",
    description: `Solution altindaki tum projelere ayni NuGet paketini ekler.
"tum projelere Serilog kur" dediginde CAGIR.`,
    inputSchema: {
        projectPath: z.string().optional().describe("Solution root dizini (bossa aktif profil workspace)"),
        packageName: z.string().min(1).describe("NuGet paket adi"),
        version: z.string().optional().describe("Spesifik versiyon"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
}, async ({ projectPath, packageName, version }) => {
    const data = await devkitApi("projectmanagement/package/add-all", "POST", {
        projectPath: projectPath || "", packageName, version,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// --- PROJECT REFERENCE YONETIMI ---
server.registerTool("devkit_reference_add", {
    title: "Add Project Reference",
    description: `Bir projeye baska bir projeyi referans olarak ekler.
"Api projesine Domain projesini referans ekle" dediginde CAGIR.`,
    inputSchema: {
        projectPath: z.string().min(1).describe("Referans eklenecek proje yolu (orn: src/MyApp.Api)"),
        referencePath: z.string().min(1).describe("Referans verilecek proje yolu (orn: src/MyApp.Domain)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ projectPath, referencePath }) => {
    const data = await devkitApi("projectmanagement/reference/add", "POST", { projectPath, referencePath });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_reference_remove", {
    title: "Remove Project Reference",
    description: `Projeden bir project reference'i kaldirir.`,
    inputSchema: {
        projectPath: z.string().min(1).describe("Referans kaldirilacak proje yolu"),
        referencePath: z.string().min(1).describe("Kaldirilacak referans proje yolu"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
}, async ({ projectPath, referencePath }) => {
    const data = await devkitApi("projectmanagement/reference/remove", "POST", { projectPath, referencePath });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_reference_list", {
    title: "List Project References",
    description: `Projenin mevcut project reference'larini listeler.
"referanslari goster", "bu proje hangi projelere bagli" dediginde CAGIR.`,
    inputSchema: {
        projectPath: z.string().optional().describe("Proje yolu (bossa aktif profil workspace)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ projectPath }) => {
    const data = await devkitApi("projectmanagement/reference/list", "POST", { projectPath: projectPath || "" });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// --- GIT DIFF / REVERT ---
server.registerTool("devkit_diff_files", {
    title: "List Modified Files",
    description: `Git'te degismis dosyalari listeler (modified, added, deleted, untracked).
"degisen dosyalari goster", "neyi degistirdim" dediginde CAGIR.`,
    inputSchema: {
        projectPath: z.string().optional().describe("Workspace yolu (bossa aktif profil)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ projectPath }) => {
    const data = await devkitApi("projectmanagement/diff/files", "POST", { projectPath: projectPath || "" });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_diff_compare", {
    title: "Compare File Versions",
    description: `Bir dosyanin commit'li (orijinal) hali ile degistirilmis halini karsilastirir.
Eklenen/silinen satirlari, diff ciktisini ve her iki versiyonun tam icerigini doner.
"Customer.cs degisikliklerini goster", "dosya farkini karsilastir" dediginde CAGIR.`,
    inputSchema: {
        filePath: z.string().min(1).describe("Dosya yolu (relative, orn: src/MyApp/Customer.cs)"),
        projectPath: z.string().optional().describe("Workspace yolu"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ filePath, projectPath }) => {
    const data = await devkitApi("projectmanagement/diff/compare", "POST", {
        projectPath: projectPath || "", filePath,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_diff_revert", {
    title: "Revert File to Original",
    description: `Dosyayi son commit'teki haline geri dondurur (degisiklikleri siler).
"Customer.cs eski haline dondur", "dosyayi revert et" dediginde CAGIR.
DIKKAT: Degisiklikler kaybolur!`,
    inputSchema: {
        filePath: z.string().min(1).describe("Geri dondurolecek dosya yolu"),
        projectPath: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
}, async ({ filePath, projectPath }) => {
    const data = await devkitApi("projectmanagement/diff/revert", "POST", {
        projectPath: projectPath || "", filePath,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_diff_accept", {
    title: "Accept Modified Version",
    description: `Dosyanin degistirilmis halini kabul eder (git add). "degisikligi kabul et", "stage et" dediginde CAGIR.`,
    inputSchema: {
        filePath: z.string().min(1).describe("Stage edilecek dosya yolu"),
        projectPath: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ filePath, projectPath }) => {
    const data = await devkitApi("projectmanagement/diff/accept", "POST", {
        projectPath: projectPath || "", filePath,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// MIGRATION TOOLS
// Bu blogu index.ts'te LOG VIEWER TOOLS'un ustune ekle
// ═══════════════════════════════════════════════
server.registerTool("devkit_migration_status", {
    title: "Get Migration Status",
    description: `Migration dosyalarinin durumunu gosterir: hangileri uygulanmis, hangileri bekliyor.
"migration durumu", "hangi migration'lar uygulanmis" dediginde CAGIR.`,
    inputSchema: {
        connectionString: z.string().min(1).describe("PostgreSQL connection string"),
        projectPath: z.string().optional().describe("Proje root dizini"),
        migrationsFolder: z.string().optional().describe("Migrations klasor adi (default: migrations)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ connectionString, projectPath, migrationsFolder }) => {
    const data = await devkitApi("migration/status", "POST", {
        connectionString, projectPath: projectPath || "", migrationsFolder,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_migration_apply", {
    title: "Apply Migration",
    description: `Belirtilen migration dosyasini veritabanina uygular.
"migration uygula", "V001 migration'i calistir" dediginde CAGIR.`,
    inputSchema: {
        connectionString: z.string().min(1).describe("PostgreSQL connection string"),
        filePath: z.string().min(1).describe("Migration dosya yolu (relative veya absolute)"),
        projectPath: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ connectionString, filePath, projectPath }) => {
    const data = await devkitApi("migration/apply", "POST", {
        connectionString, filePath, projectPath: projectPath || "",
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_migration_rollback", {
    title: "Rollback Migration",
    description: `Belirtilen migration'in down dosyasini calistirarak rollback yapar.
"migration geri al", "V001 rollback" dediginde CAGIR.`,
    inputSchema: {
        connectionString: z.string().min(1).describe("PostgreSQL connection string"),
        filePath: z.string().min(1).describe("Down migration dosya yolu"),
        projectPath: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
}, async ({ connectionString, filePath, projectPath }) => {
    const data = await devkitApi("migration/rollback", "POST", {
        connectionString, filePath, projectPath: projectPath || "",
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_migration_generate", {
    title: "Generate Migration Files",
    description: `Yeni migration dosyalari olusturur: V{timestamp}_{name}.up.sql ve .down.sql
"yeni migration olustur", "add_customer_table migration'i yarat" dediginde CAGIR.`,
    inputSchema: {
        name: z.string().min(1).describe("Migration adi (orn: add_customer_email_column)"),
        projectPath: z.string().optional(),
        migrationsFolder: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ name, projectPath, migrationsFolder }) => {
    const data = await devkitApi("migration/generate", "POST", {
        name, projectPath: projectPath || "", migrationsFolder,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// LOG VIEWER TOOLS
// Bu blogu index.ts'te ENV COMPARE TOOLS'un ustune ekle
// ═══════════════════════════════════════════════
server.registerTool("devkit_log_scan_files", {
    title: "Scan Log Files",
    description: `Projedeki log dosyalarini tarar ve listeler. logs/ klasoru ve alt projelerdeki log dosyalarini bulur.
"log dosyalarini bul", "hangi loglar var" dediginde CAGIR.`,
    inputSchema: {
        projectPath: z.string().optional().describe("Proje root dizini (bossa aktif profil workspace)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ projectPath }) => {
    const data = await devkitApi("logviewer/scan", "POST", { projectPath: projectPath || "" });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_log_read", {
    title: "Read Log File",
    description: `Log dosyasini okur, parse eder ve filtrelenebilir sekilde doner.
Level, search text ve correlation ID ile filtrelenebilir.
"loglari oku", "error loglari goster", "son 500 satir log" dediginde CAGIR.`,
    inputSchema: {
        filePath: z.string().min(1).describe("Log dosya yolu (relative veya absolute)"),
        projectPath: z.string().optional().describe("Proje root dizini"),
        tail: z.number().default(200).describe("Son kac satir okunacak"),
        level: z.string().optional().describe("Level filtresi: verbose, debug, information, warning, error, fatal"),
        search: z.string().optional().describe("Mesaj icinde aranacak text"),
        correlationId: z.string().optional().describe("Correlation ID filtresi"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ filePath, projectPath, tail, level, search, correlationId }) => {
    const data = await devkitApi("logviewer/read", "POST", {
        filePath, projectPath: projectPath || "",
        tail, level, search, correlationId,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// ENV COMPARE TOOLS
// Bu blogu index.ts'te PACKAGE AUDIT TOOLS'un ustune ekle
// ═══════════════════════════════════════════════
server.registerTool("devkit_env_compare", {
    title: "Compare Environment Configs",
    description: `Projedeki appsettings.json ve .env dosyalarini tarar ve environment'lar arasi karsilastirir.
Hangi key eksik, hangi deger farkli, hangi config ayni oldugunu gosterir.
"config'leri karsilastir", "appsettings farklarini goster", "environment diff" dediginde CAGIR.
projectPath bossa aktif profilin workspace'i kullanilir.`,
    inputSchema: {
        projectPath: z.string().optional().describe("Proje root dizini (bossa aktif profil workspace)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ projectPath }) => {
    const data = await devkitApi("envcompare/scan-and-compare", "POST", {
        projectPath: projectPath || "",
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// PACKAGE AUDIT TOOLS
// Bu blogu index.ts'te API TEST TOOLS'un ustune ekle
// ═══════════════════════════════════════════════
server.registerTool("devkit_audit_packages", {
    title: "Audit Project Packages",
    description: `Projedeki NuGet/npm/pip dependency'leri tarar: outdated, vulnerable, versiyon bilgileri.
"paketleri tara", "outdated dependency'leri goster", "guvenlik acigi var mi" dediginde CAGIR.
projectPath bossa aktif profilin workspace'i kullanilir.`,
    inputSchema: {
        projectPath: z.string().optional().describe("Proje root dizini (bossa aktif profil workspace)"),
        framework: z.enum(["dotnet", "nodejs", "python"]).default("dotnet").describe("Framework: dotnet, nodejs, python"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ projectPath, framework }) => {
    const data = await devkitApi("packageaudit/audit", "POST", {
        projectPath: projectPath || "",
        framework,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// API TEST TOOLS
// Bu blogu index.ts'te DATABASE SCHEMA TOOLS'un ustune ekle
// ═══════════════════════════════════════════════
server.registerTool("devkit_api_load_swagger", {
    title: "Load Swagger/OpenAPI",
    description: `Swagger veya OpenAPI JSON dosyasini yukler ve endpoint listesini doner.
URL veya dosya yolu verilebilir. "swagger yukle", "API endpointlerini listele" dediginde CAGIR.`,
    inputSchema: {
        url: z.string().min(1).describe("Swagger JSON URL (orn: https://localhost:5001/swagger/v1/swagger.json)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ url }) => {
    const data = await devkitApi("apitest/load-swagger", "POST", { url });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_api_send_request", {
    title: "Send HTTP Request",
    description: `Belirtilen URL'e HTTP request gonderir ve response'u doner.
Method, headers, query params ve body desteklenir. "API'ye request at", "endpoint'i test et" dediginde CAGIR.`,
    inputSchema: {
        url: z.string().min(1).describe("Full request URL"),
        method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).default("GET"),
        headers: z.record(z.string()).optional().describe("Request headers"),
        queryParams: z.record(z.string()).optional().describe("Query parameters"),
        body: z.string().optional().describe("Request body (JSON string)"),
        contentType: z.string().default("application/json"),
        timeoutSeconds: z.number().default(30),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ url, method, headers, queryParams, body, contentType, timeoutSeconds }) => {
    const data = await devkitApi("apitest/send", "POST", {
        url, method,
        headers: headers || {},
        queryParams: queryParams || {},
        body, contentType, timeoutSeconds,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// DATABASE SCHEMA TOOLS
// Bu blogu index.ts'te CRYPTO TOOLS'un ustune ekle
// ═══════════════════════════════════════════════
server.registerTool("devkit_schema_list_schemas", {
    title: "List Database Schemas",
    description: "PostgreSQL veritabanindaki tum schemalari listeler.",
    inputSchema: {
        connectionString: z.string().min(1).describe("PostgreSQL connection string"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ connectionString }) => {
    const data = await devkitApi("schema/schemas", "POST", { connectionString });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_schema_scan", {
    title: "Scan Database Schema",
    description: `Veritabanini tarar: tum tablolar, kolonlar, iliskiler (foreign key), row sayilari, boyutlar.
Mevcut bir projenin veritabani yapisini anlamak icin kullan. "veritabanini tara", "tablolari goster", "schema yapisi" dediginde CAGIR.`,
    inputSchema: {
        connectionString: z.string().min(1).describe("PostgreSQL connection string"),
        schema: z.string().default("public").describe("Schema adi (default: public)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ connectionString, schema }) => {
    const data = await devkitApi("schema/scan", "POST", { connectionString, schema });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_schema_table_detail", {
    title: "Get Table Detail",
    description: `Bir tablonun detayli bilgisini doner: kolonlar, tipler, PK/FK, indexler, constraint'ler, trigger'lar, CREATE script.
"customers tablosunun yapisini goster", "orders tablosundaki indexler" dediginde CAGIR.`,
    inputSchema: {
        connectionString: z.string().min(1).describe("PostgreSQL connection string"),
        tableName: z.string().min(1).describe("Tablo adi"),
        schema: z.string().default("public").describe("Schema adi"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ connectionString, tableName, schema }) => {
    const data = await devkitApi("schema/table", "POST", { connectionString, tableName, schema });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// CRYPTO TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_crypto_decrypt", {
    title: "Decrypt Value",
    description: "Decrypts a single AES-256-GCM encrypted value.",
    inputSchema: {
        masterKey: z.string().min(1).describe("Master key"),
        ciphertext: z.string().min(1).describe("Base64-encoded ciphertext"),
        algorithm: z.string().default("AES-256-GCM"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ masterKey, ciphertext, algorithm }) => {
    const data = await devkitApi("crypto/decrypt-single", "POST", { masterKey, ciphertext, algorithm });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_crypto_encrypt", {
    title: "Encrypt Value",
    description: "Encrypts a plaintext value using AES-256-GCM.",
    inputSchema: {
        masterKey: z.string().min(1).describe("Master key"),
        plaintext: z.string().min(1).describe("Plaintext to encrypt"),
        algorithm: z.string().default("AES-256-GCM"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ masterKey, plaintext, algorithm }) => {
    const data = await devkitApi("crypto/encrypt-single", "POST", { masterKey, plaintext, algorithm });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// CONTEXT BRIDGE TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_load_last_context", {
    title: "Load Last Context from DevKit UI",
    description: `DevKit UI'dan gonderilen son context'i yukler.
Kullanici DevKit arayuzunde "Claude'da Ac" butonuna bastiginda context backend'e kaydedilir.
Bu tool o context'i yukler. Icerik mimari tasarim, proje tarama sonucu veya baska bir veri olabilir.
Kullanici "DevKit context'ini yukle", "son context'i al", "DevKit'ten gelen veriyi goster" dediginde cagir.`,
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async () => {
    const data = await devkitApi("system/context", "GET");
    if (!data.hasContext) {
        return { content: [{ type: "text", text: "DevKit'te kayitli context yok. Once DevKit UI'dan 'Claude'da Ac' butonuna basin." }] };
    }
    return {
        content: [
            {
                type: "text",
                text: `DEVKIT CONTEXT YUKLENDI (Tip: ${data.type}, Boyut: ${data.sizeKb}KB)\n\n${data.content}`,
            },
        ],
    };
});
// ═══════════════════════════════════════════════
// GIT - MISSING TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_git_init", {
    title: "Git Init",
    description: "Yeni bir git repository baslatir (git init).",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async () => {
    const data = await devkitApi("git/init", "POST", {});
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_init_connect", {
    title: "Git Init & Connect Remote",
    description: "Git init yapar, remote ekler, opsiyonel olarak ilk commit ve push yapar. Yeni projeyi remote repo'ya baglamak icin ideal.",
    inputSchema: {
        remoteUrl: z.string().min(1).describe("Remote repository URL (ornegin: https://github.com/user/repo.git)"),
        defaultBranch: z.string().default("main").describe("Default branch adi"),
        initialCommit: z.boolean().default(true).describe("Ilk commit yapilsin mi"),
        commitMessage: z.string().default("initial commit").describe("Ilk commit mesaji"),
        pushAfterConnect: z.boolean().default(true).describe("Connect sonrasi push yapilsin mi"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ remoteUrl, defaultBranch, initialCommit, commitMessage, pushAfterConnect }) => {
    const data = await devkitApi("git/init-connect", "POST", {
        remoteUrl,
        defaultBranch: defaultBranch || "main",
        initialCommit: initialCommit ?? true,
        commitMessage: commitMessage || "initial commit",
        pushAfterConnect: pushAfterConnect ?? true,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_remotes", {
    title: "Git Remotes",
    description: "Tanimli remote'lari listeler (git remote -v).",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async () => {
    const data = await devkitApi("git/remotes", "POST", {});
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_rename_branch", {
    title: "Git Rename Branch",
    description: "Bir branch'in adini degistirir (git branch -m).",
    inputSchema: {
        oldName: z.string().min(1).describe("Mevcut branch adi"),
        newName: z.string().min(1).describe("Yeni branch adi"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ oldName, newName }) => {
    const data = await devkitApi("git/rename-branch", "POST", { oldName, newName });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_stage", {
    title: "Git Stage",
    description: "Dosyalari staging area'ya ekler (git add). Path belirtilmezse tum degisiklikleri stage eder.",
    inputSchema: {
        path: z.string().optional().describe("Stage edilecek dosya/klasor yolu (default: '.' yani tumu)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ path }) => {
    const data = await devkitApi("git/stage", "POST", { path: path || "." });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_stash_list", {
    title: "Git Stash List",
    description: "Stash listesini gosterir (git stash list).",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async () => {
    const data = await devkitApi("git/stash-list", "POST", {});
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_diff", {
    title: "Git Diff",
    description: "Degisiklikleri gosterir (git diff). staged=true ile staged degisiklikleri gosterir.",
    inputSchema: {
        staged: z.boolean().default(false).describe("Staged degisiklikleri goster"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ staged }) => {
    const data = await devkitApi("git/diff", "POST", { staged: staged || false });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_reset", {
    title: "Git Reset (Unstage)",
    description: "Staging area'dan dosya cikarir (git reset). Dosya belirtilmezse tum staged degisiklikleri unstage eder.",
    inputSchema: {
        path: z.string().optional().describe("Unstage edilecek dosya yolu (bos birakilirsa tumu)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ path }) => {
    const data = await devkitApi("git/reset", "POST", { path });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_merge_abort", {
    title: "Git Merge Abort",
    description: "Devam eden merge islemini iptal eder (git merge --abort).",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
}, async () => {
    const data = await devkitApi("git/merge-abort", "POST", {});
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_git_command", {
    title: "Git Custom Command",
    description: "Herhangi bir git komutunu calistirir. git'ten sonraki argumanlari girin (ornegin: 'log --oneline -5', 'cherry-pick abc123').",
    inputSchema: {
        arguments: z.string().min(1).describe("Git argumanlari (ornegin: 'log --oneline -5')"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ arguments: args }) => {
    const data = await devkitApi("git/command", "POST", { arguments: args });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// DOCKER - MISSING TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_docker_build", {
    title: "Docker Compose Build",
    description: "Docker compose ile servisleri build eder (docker compose build).",
    inputSchema: {
        workingDir: z.string().optional().describe("docker-compose.yml dosyasinin bulundugu klasor"),
        file: z.string().optional().describe("Compose dosya adi (default: docker-compose.yml)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ workingDir, file }) => {
    const data = await devkitApi("docker/compose/build", "POST", { workingDir, file });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_docker_restart", {
    title: "Docker Compose Restart",
    description: "Docker compose servislerini yeniden baslatir. Belirli bir servis adi verilebilir.",
    inputSchema: {
        workingDir: z.string().optional().describe("docker-compose.yml dosyasinin bulundugu klasor"),
        serviceName: z.string().optional().describe("Yeniden baslatilacak servis adi (bos ise tumu)"),
        file: z.string().optional().describe("Compose dosya adi (default: docker-compose.yml)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ workingDir, serviceName, file }) => {
    const data = await devkitApi("docker/compose/restart", "POST", { workingDir, serviceName, file });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_docker_pull", {
    title: "Docker Compose Pull",
    description: "Docker compose servislerinin image'larini ceker (docker compose pull).",
    inputSchema: {
        workingDir: z.string().optional().describe("docker-compose.yml dosyasinin bulundugu klasor"),
        file: z.string().optional().describe("Compose dosya adi (default: docker-compose.yml)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ workingDir, file }) => {
    const data = await devkitApi("docker/compose/pull", "POST", { workingDir, file });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_docker_command", {
    title: "Docker Custom Command",
    description: "Herhangi bir docker/docker-compose komutunu calistirir.",
    inputSchema: {
        workingDir: z.string().optional().describe("Calisma dizini"),
        arguments: z.string().min(1).describe("Docker argumanlari (ornegin: 'compose exec postgres psql -U postgres')"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ workingDir, arguments: args }) => {
    const data = await devkitApi("docker/compose/command", "POST", { workingDir, arguments: args });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// KAFKA - MISSING TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_kafka_topic_create", {
    title: "Kafka Topic Create",
    description: "Yeni bir Kafka topic olusturur.",
    inputSchema: {
        bootstrapServers: z.string().optional().describe("Kafka broker adresi (default: localhost:9092)"),
        topicName: z.string().min(1).describe("Olusturulacak topic adi"),
        partitions: z.number().int().optional().describe("Partition sayisi (default: 3)"),
        replicationFactor: z.number().int().optional().describe("Replication factor (default: 1)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ bootstrapServers, topicName, partitions, replicationFactor }) => {
    const data = await devkitApi("kafka/topics/create", "POST", {
        bootstrapServers: bootstrapServers || "localhost:9092",
        topicName,
        partitions: partitions || 3,
        replicationFactor: replicationFactor || 1,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_kafka_topic_delete", {
    title: "Kafka Topic Delete",
    description: "Bir Kafka topic'i siler.",
    inputSchema: {
        bootstrapServers: z.string().optional().describe("Kafka broker adresi (default: localhost:9092)"),
        topicName: z.string().min(1).describe("Silinecek topic adi"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
}, async ({ bootstrapServers, topicName }) => {
    const data = await devkitApi("kafka/topics/delete", "POST", {
        bootstrapServers: bootstrapServers || "localhost:9092",
        topicName,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_kafka_topic_describe", {
    title: "Kafka Topic Describe",
    description: "Bir Kafka topic'inin detaylarini (partition, replica, leader bilgileri) gosterir.",
    inputSchema: {
        bootstrapServers: z.string().optional().describe("Kafka broker adresi (default: localhost:9092)"),
        topicName: z.string().min(1).describe("Detay goruntulenecek topic adi"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ bootstrapServers, topicName }) => {
    const data = await devkitApi("kafka/topics/describe", "POST", {
        bootstrapServers: bootstrapServers || "localhost:9092",
        topicName,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// AZURE - MISSING TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_azure_command", {
    title: "Azure CLI Command",
    description: "Herhangi bir Azure CLI komutunu calistirir (az ...). Ornegin: 'webapp list', 'group list', 'account show'.",
    inputSchema: {
        command: z.string().min(1).describe("Azure CLI komutu (az'den sonraki kisim, ornegin: 'webapp list')"),
        arguments: z.string().optional().describe("Ek argumanlar (ornegin: '--resource-group myRg --output table')"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ command, arguments: args }) => {
    const data = await devkitApi("azure/command", "POST", { command, arguments: args || "" });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_azure_resources", {
    title: "Azure List Resources",
    description: "Aktif profildeki Azure resource'larini listeler (resource group, subscription, app services ve slotlar).",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async () => {
    const data = await devkitApi("azure/resources", "GET");
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// CRYPTO - MISSING TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_crypto_read_config", {
    title: "Crypto Read Config",
    description: "Konfigurasyonu okur (appsettings.json dosyasindan veya Azure App Service'den). MasterKey, connection string gibi degerleri gosterir.",
    inputSchema: {
        source: z.enum(["file", "azure"]).describe("Kaynak tipi: file veya azure"),
        filePath: z.string().optional().describe("source=file ise dosya yolu (ornegin: appsettings.json)"),
        resourceGroup: z.string().optional().describe("source=azure ise resource group adi"),
        appName: z.string().optional().describe("source=azure ise app service adi"),
        subscriptionId: z.string().optional().describe("source=azure ise subscription ID"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ source, filePath, resourceGroup, appName, subscriptionId }) => {
    const data = await devkitApi("crypto/read-config", "POST", { source, filePath, resourceGroup, appName, subscriptionId });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_crypto_tables", {
    title: "Crypto List Tables",
    description: "Veritabanindaki tablolari listeler (crypto islemleri icin tablo secimi yapmak uzere).",
    inputSchema: {
        connectionString: z.string().min(1).describe("Veritabani connection string"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ connectionString }) => {
    const data = await devkitApi("crypto/tables", "POST", { connectionString });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_crypto_columns", {
    title: "Crypto List Columns",
    description: "Belirtilen tablonun kolonlarini listeler (hangi kolonun encrypted oldugunu tespit etmek icin).",
    inputSchema: {
        connectionString: z.string().min(1).describe("Veritabani connection string"),
        tableName: z.string().min(1).describe("Tablo adi"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ connectionString, tableName }) => {
    const data = await devkitApi("crypto/columns", "POST", { connectionString, tableName });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_crypto_decrypt_table", {
    title: "Crypto Decrypt Table",
    description: "Tablodaki encrypted verileri toplu olarak decrypt eder. MasterKey ile ciphertext kolonundaki degerleri cozer.",
    inputSchema: {
        connectionString: z.string().min(1).describe("Veritabani connection string"),
        tableName: z.string().min(1).describe("Tablo adi"),
        masterKey: z.string().min(1).describe("Master encryption key"),
        ciphertextColumn: z.string().min(1).describe("Encrypted veri iceren kolon adi"),
        algorithmColumn: z.string().optional().describe("Algoritma bilgisi iceren kolon adi"),
        keyIdColumn: z.string().optional().describe("Key ID bilgisi iceren kolon adi"),
        pkColumn: z.string().default("id").describe("Primary key kolon adi"),
        displayColumns: z.array(z.string()).optional().describe("Ek gosterilecek kolon adlari"),
        limit: z.number().int().optional().describe("Maksimum satir sayisi (default: 100)"),
    },
}, async ({ connectionString, tableName, masterKey, ciphertextColumn, algorithmColumn, keyIdColumn, pkColumn, displayColumns, limit }) => {
    const data = await devkitApi("crypto/decrypt", "POST", {
        connectionString, tableName, masterKey, ciphertextColumn,
        algorithmColumn, keyIdColumn, pkColumn: pkColumn || "id",
        displayColumns, limit: limit || 100,
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_crypto_rekey", {
    title: "Crypto Re-Key",
    description: "Tablodaki encrypted verileri eski key ile decrypt edip yeni key ile tekrar encrypt eder. Key rotation islemi.",
    inputSchema: {
        connectionString: z.string().min(1).describe("Veritabani connection string"),
        tableName: z.string().min(1).describe("Tablo adi"),
        oldMasterKey: z.string().min(1).describe("Eski master key"),
        newMasterKey: z.string().min(1).describe("Yeni master key"),
        ciphertextColumn: z.string().min(1).describe("Encrypted veri iceren kolon adi"),
        algorithmColumn: z.string().default("value_algorithm").describe("Algoritma kolon adi"),
        keyIdColumn: z.string().default("value_key_id").describe("Key ID kolon adi"),
        pkColumn: z.string().default("id").describe("Primary key kolon adi"),
        newKeyId: z.string().default("local-masterkey-v2").describe("Yeni key ID"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
}, async ({ connectionString, tableName, oldMasterKey, newMasterKey, ciphertextColumn, algorithmColumn, keyIdColumn, pkColumn, newKeyId }) => {
    const data = await devkitApi("crypto/rekey", "POST", {
        connectionString, tableName, oldMasterKey, newMasterKey, ciphertextColumn,
        algorithmColumn: algorithmColumn || "value_algorithm",
        keyIdColumn: keyIdColumn || "value_key_id",
        pkColumn: pkColumn || "id",
        newKeyId: newKeyId || "local-masterkey-v2",
    });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_crypto_update_config", {
    title: "Crypto Update Config",
    description: "Konfigurasyon degerlerini gunceller (appsettings.json dosyasinda veya Azure App Service'de). Key rotation sonrasi yeni key'i yazmak icin kullanilir.",
    inputSchema: {
        source: z.enum(["file", "azure"]).describe("Kaynak tipi: file veya azure"),
        filePath: z.string().optional().describe("source=file ise dosya yolu"),
        resourceGroup: z.string().optional().describe("source=azure ise resource group adi"),
        appName: z.string().optional().describe("source=azure ise app service adi"),
        subscriptionId: z.string().optional().describe("source=azure ise subscription ID"),
        updates: z.record(z.string()).describe("Guncellenecek key-value cifti (ornegin: { 'Encryption:MasterKey': 'yeni-key' })"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
}, async ({ source, filePath, resourceGroup, appName, subscriptionId, updates }) => {
    const data = await devkitApi("crypto/update-config", "POST", { source, filePath, resourceGroup, appName, subscriptionId, updates });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// PROCESS - MISSING TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_process_delete", {
    title: "Process Delete/Cleanup",
    description: "Yonetilen bir process'i listeden kaldirir. Calisiyor ise once durdurur sonra temizler.",
    inputSchema: {
        processId: z.string().min(1).describe("Kaldirilacak process ID"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
}, async ({ processId }) => {
    const data = await devkitApi(`process/${processId}`, "DELETE");
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// FILE OPERATIONS - MISSING TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_file_rename", {
    title: "File Rename",
    description: "Dosya veya klasoru yeniden adlandirir.",
    inputSchema: {
        sourcePath: z.string().min(1).describe("Mevcut dosya/klasor yolu"),
        destinationPath: z.string().min(1).describe("Yeni dosya/klasor yolu"),
        overwrite: z.boolean().default(false).describe("Hedef varsa uzerine yaz"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ sourcePath, destinationPath, overwrite }) => {
    const data = await devkitApi("run/file/rename", "POST", { sourcePath, destinationPath, overwrite: overwrite || false });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// SYSTEM - MISSING TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_browse_folder", {
    title: "Browse Folder Dialog",
    description: "Isletim sistemi klasor secim dialogunu acar. Kullanici bir klasor secer ve yolu doner. Workspace secimi icin kullanilabilir.",
    inputSchema: {
        initialPath: z.string().optional().describe("Dialogun acilacagi baslangic klasoru"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ initialPath }) => {
    const data = await devkitApi("system/browse-folder", "POST", { initialPath });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_browse_file", {
    title: "Browse File Dialog",
    description: "Isletim sistemi dosya secim dialogunu acar. Kullanici bir dosya secer ve yolu doner.",
    inputSchema: {
        initialPath: z.string().optional().describe("Dialogun acilacagi baslangic klasoru"),
        filter: z.string().optional().describe("Dosya filtresi (ornegin: 'JSON files (*.json)|*.json')"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async ({ initialPath, filter }) => {
    const data = await devkitApi("system/browse-file", "POST", { initialPath, filter });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_save_context", {
    title: "Save Context to DevKit",
    description: "DevKit backend'e context kaydeder. Claude'dan DevKit UI'a veri gondermek icin kullanilir.",
    inputSchema: {
        content: z.string().min(1).describe("Kaydedilecek icerik"),
        type: z.string().optional().describe("Context tipi (ornegin: 'architecture', 'scan', 'general')"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ content, type }) => {
    const data = await devkitApi("system/context", "POST", { content, type: type || "general" });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_clear_context", {
    title: "Clear DevKit Context",
    description: "DevKit backend'deki kayitli context'i temizler.",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
}, async () => {
    const data = await devkitApi("system/context", "DELETE");
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// ENV COMPARE - MISSING TOOLS
// ═══════════════════════════════════════════════
server.registerTool("devkit_env_scan", {
    title: "Env Config Scan",
    description: "Projedeki appsettings dosyalarini tarar ve listeler (appsettings.json, appsettings.Development.json, appsettings.Local.json vb.).",
    inputSchema: {
        projectPath: z.string().optional().describe("Proje dizini (bos ise aktif profil workspace'i kullanilir)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ projectPath }) => {
    const data = await devkitApi("envcompare/scan", "POST", { projectPath: projectPath || "" });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
// ═══════════════════════════════════════════════
// CLI COMMANDS: --setup, --cleanup
// ═══════════════════════════════════════════════
function findClaudeConfigPath() {
    const platform = process.platform;
    const home = process.env.HOME || process.env.USERPROFILE || "";
    if (platform === "win32") {
        const paths = [
            // Microsoft Store kurulum
            ...(() => {
                try {
                    const packagesDir = join(home, "AppData", "Local", "Packages");
                    const entries = readdirSync(packagesDir);
                    return entries
                        .filter((e) => e.startsWith("Claude_"))
                        .map((e) => join(packagesDir, e, "LocalCache", "Roaming", "Claude", "claude_desktop_config.json"));
                }
                catch {
                    return [];
                }
            })(),
            // Normal kurulum
            join(process.env.APPDATA || join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json"),
        ];
        for (const p of paths) {
            // Config dosyasi varsa veya dizini varsa (yeni olusturulacak)
            const dir = dirname(p);
            if (existsSync(dir))
                return p;
        }
        return paths[paths.length - 1]; // fallback: normal kurulum yolu
    }
    if (platform === "darwin") {
        return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
    }
    // Linux
    return join(home, ".config", "Claude", "claude_desktop_config.json");
}
function runSetup() {
    console.log("DevKit MCP Server - Claude Desktop Setup");
    console.log("=========================================\n");
    const configPath = findClaudeConfigPath();
    if (!configPath) {
        console.error("Claude Desktop config dizini bulunamadi.");
        process.exit(1);
    }
    console.log(`Config dosyasi: ${configPath}\n`);
    // Mevcut config'i oku veya bos olustur
    let config = {};
    if (existsSync(configPath)) {
        try {
            const raw = readFileSync(configPath, "utf-8");
            config = JSON.parse(raw);
            console.log("Mevcut config bulundu, guncelleniyor...");
        }
        catch {
            console.log("Mevcut config okunamadi, yeni olusturuluyor...");
        }
    }
    else {
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
    config.mcpServers["devkit"] = {
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
function runCleanup() {
    console.log("DevKit MCP Server - Claude Desktop Cleanup");
    console.log("==========================================\n");
    const configPath = findClaudeConfigPath();
    if (!configPath) {
        console.log("Config bulunamadi.");
        return;
    }
    // vm_bundles temizligi
    const claudeDir = dirname(configPath);
    const vmBundlesDir = join(claudeDir, "vm_bundles");
    if (existsSync(vmBundlesDir)) {
        const entries = readdirSync(vmBundlesDir);
        let totalSize = 0;
        for (const entry of entries) {
            const entryPath = join(vmBundlesDir, entry);
            try {
                const stats = statSync(entryPath);
                totalSize += stats.size;
            }
            catch { /* skip */ }
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
function runSetupCode() {
    console.log("DevKit MCP Server - Claude Code Setup");
    console.log("=====================================\n");
    // Claude Code kurulu mu kontrol et
    try {
        execSync("claude --version", { stdio: "pipe" });
    }
    catch {
        console.error("Claude Code bulunamadi. Once Claude Code'u kurun:");
        console.error("  npm install -g @anthropic-ai/claude-code");
        process.exit(1);
    }
    // Mevcut MCP listesini kontrol et, varsa kaldir
    try {
        const list = execSync("claude mcp list", { encoding: "utf-8", stdio: "pipe" });
        if (list.includes("devkit")) {
            console.log("DevKit zaten Claude Code'a ekli. Guncelleniyor...");
            try {
                execSync("claude mcp remove devkit", { stdio: "pipe" });
            }
            catch { /* ignore */ }
        }
    }
    catch { /* ignore */ }
    // DevKit MCP server'i ekle (user scope = tum projelerde)
    const devkitUrl = process.env.DEVKIT_URL || "http://localhost:5199";
    try {
        execSync(`claude mcp add --scope user devkit -e DEVKIT_URL=${devkitUrl} -- devkit-mcp-server`, { stdio: "inherit" });
        console.log("\nDevKit MCP server Claude Code'a eklendi!");
        console.log("Scope: user (tum projelerde kullanilabilir)");
        console.log(`DevKit URL: ${devkitUrl}`);
        console.log("\nDogrulama: claude mcp list");
    }
    catch {
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
    app.post("/mcp", async (req, res) => {
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
        });
        res.on("close", () => transport.close());
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    });
    app.get("/health", (_req, res) => {
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
}
else {
    runStdio().catch((error) => {
        console.error("Server error:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map
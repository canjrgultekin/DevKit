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
// ARCHITECTURE DESIGNER TOOLS
// Bu blogu index.ts'te PROJECT MANAGEMENT TOOLS'un ustune ekle
// ═══════════════════════════════════════════════
// ═══════════════════════════════════════════════
// ARCHITECTURE DESIGNER TOOLS (v2 - full featured)
// ═══════════════════════════════════════════════
server.registerTool("devkit_arch_create", {
    title: "Create Architecture Design",
    description: `Yeni mimari tasarim olusturur.
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
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_arch_add_component", {
    title: "Add Component to Design",
    description: `Tasarima component ekler. Smart default config'ler otomatik eklenir.
Proje tipleri: webapi, classlib, worker, console, test, nextjs, react, apigateway, bff
Infra tipleri: postgresql, mssql, mongodb, redis, couchbase, kafka, rabbitmq, servicebus, elasticsearch, kibana, logstash, jaeger, zipkin, grafana, otelcollector, prometheus, jenkins, nginx
"Api ekle", "PostgreSQL ekle", "Kafka ekle", "Next.js ekle" dediginde CAGIR.`,
    inputSchema: {
        design: z.any().describe("Mevcut ArchitectureDesign objesi"),
        name: z.string().min(1).describe("Component adi"),
        type: z.string().min(1).describe("Component tipi"),
        category: z.enum(["project", "infrastructure", "cloud"]),
        config: z.record(z.string()).optional().describe("Ek config (smart defaults otomatik eklenir)"),
        hosting: z.enum(["docker", "existing"]).optional().describe("Infra icin: docker veya mevcut servis"),
    },
}, async ({ design, name, type, category, config, hosting }) => {
    const finalConfig = config || {};
    if (hosting === "existing") {
        finalConfig.hosting = "existing";
        delete finalConfig.image;
    }
    const data = await devkitApi("architecturedesigner/add-component", "POST", { design, name, type, category, config: finalConfig, x: 0, y: 0 });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_arch_remove_component", {
    title: "Remove Component",
    description: `Tasarimdan component ve baglantilerini kaldirir.`,
    inputSchema: {
        design: z.any().describe("ArchitectureDesign objesi"),
        componentId: z.string().min(1).describe("Kaldirilacak component ID"),
    },
}, async ({ design, componentId }) => {
    const data = await devkitApi("architecturedesigner/remove-component", "POST", { design, componentId });
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
        design: z.any().describe("ArchitectureDesign objesi"),
        sourceId: z.string().min(1).describe("Kaynak component ID"),
        targetId: z.string().min(1).describe("Hedef component ID"),
        connectionType: z.enum(["references", "uses", "publishes-to", "consumes-from", "depends-on"]).default("uses"),
        label: z.string().optional(),
    },
}, async ({ design, sourceId, targetId, connectionType, label }) => {
    const data = await devkitApi("architecturedesigner/add-connection", "POST", { design, sourceId, targetId, connectionType, label });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_arch_remove_connection", {
    title: "Remove Connection",
    description: `Baglanti kaldirir.`,
    inputSchema: {
        design: z.any().describe("ArchitectureDesign objesi"),
        connectionId: z.string().min(1),
    },
}, async ({ design, connectionId }) => {
    const data = await devkitApi("architecturedesigner/remove-connection", "POST", { design, connectionId });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_arch_validate", {
    title: "Validate Design",
    description: `Tasarimi dogrular: eksik alanlar, duplicate isim, port cakismasi, hatali baglantilar.
"tasarimi dogrula", "kontrol et" dediginde CAGIR.`,
    inputSchema: {
        design: z.any().describe("ArchitectureDesign objesi"),
    },
}, async ({ design }) => {
    const data = await devkitApi("architecturedesigner/validate", "POST", { design });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_arch_to_manifest", {
    title: "Convert to Manifest",
    description: `Tasarimi scaffold manifest JSON'a cevirir. .NET projeleri "projects", Next.js/React "frontends" olarak ayrilir.
"manifest olustur", "scaffold icin hazirla" dediginde CAGIR.`,
    inputSchema: {
        design: z.any().describe("ArchitectureDesign objesi"),
    },
}, async ({ design }) => {
    const data = await devkitApi("architecturedesigner/to-manifest", "POST", { design });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_arch_scaffold", {
    title: "Scaffold from Design",
    description: `Manifest'ten projeleri olusturur. Karma mimarilerde (dotnet+nextjs) her framework ayri scaffold edilir. Otomatik profil olusturulur.
"projeleri olustur", "scaffold et" dediginde CAGIR.`,
    inputSchema: {
        design: z.any().describe("ArchitectureDesign objesi"),
    },
}, async ({ design }) => {
    // Manifest olustur
    const manifestRes = await devkitApi("architecturedesigner/to-manifest", "POST", { design });
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
        design: z.any().describe("ArchitectureDesign objesi"),
    },
}, async ({ design }) => {
    const data = await devkitApi("architecturedesigner/to-docker", "POST", { design });
    return { content: [{ type: "text", text: formatResult(data) }] };
});
server.registerTool("devkit_arch_save_docker", {
    title: "Save Docker Compose to Disk",
    description: `Docker compose YAML'i diske kaydeder.
"docker yaml kaydet", "compose dosyasini yaz" dediginde CAGIR.`,
    inputSchema: {
        design: z.any().describe("ArchitectureDesign objesi"),
        content: z.string().optional().describe("Ozel YAML icerigi (bossa otomatik olusturulur)"),
    },
}, async ({ design, content }) => {
    let yamlContent = content;
    if (!yamlContent) {
        const dockerRes = await devkitApi("architecturedesigner/to-docker", "POST", { design });
        if (!dockerRes.success)
            return { content: [{ type: "text", text: "Docker compose olusturulamadi." }] };
        yamlContent = dockerRes.dockerCompose;
    }
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
        design: z.any().describe("ArchitectureDesign objesi"),
        filePath: z.string().optional().describe("Dosya yolu (bossa outputPath + solutionName.design.json)"),
    },
}, async ({ design, filePath }) => {
    const fp = filePath || `${design.outputPath}\\${design.solutionName || "architecture"}.design.json`;
    const data = await devkitApi("architecturedesigner/save", "POST", { design, filePath: fp });
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
server.registerTool("devkit_arch_rename_solution", {
    title: "Rename Solution",
    description: `Solution adini degistirir ve tum proje component isimlerini gunceller. Output path sifirlanir.
"solution adini degistir", "projeyi yeniden adlandir" dediginde CAGIR.`,
    inputSchema: {
        design: z.any().describe("ArchitectureDesign objesi"),
        newSolutionName: z.string().min(1).describe("Yeni solution adi"),
    },
}, async ({ design, newSolutionName }) => {
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
    return { content: [{ type: "text", text: `Solution "${newSolutionName}" olarak guncellendi. ${updated.components.length} component yeniden adlandirildi. Output path yeniden girilmeli.\n\n${formatResult(updated)}` }] };
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
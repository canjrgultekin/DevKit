# devkit-mcp-server

Claude Desktop MCP integration for [DevKit](https://github.com/canjrgultekin/DevKit) - Developer Toolkit & AI Code Integration Platform.

## What is this?

This MCP server connects Claude Desktop to your local DevKit instance, enabling you to manage your entire development workflow through natural language commands in Claude Desktop chat.

**47 tools** covering: Project Scaffolding, File Import, Git Management, Docker Compose, Azure Deployment, Crypto/Credential Management, and Profile Management.

## Prerequisites

- [DevKit](https://github.com/canjrgultekin/DevKit) running locally at `http://localhost:5199`
- [Claude Desktop](https://claude.ai/download) installed
- Node.js 18+

## Installation

```bash
npm install -g devkit-mcp-server
```

## Setup

Add to your Claude Desktop config:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "devkit": {
      "command": "devkit-mcp-server",
      "env": {
        "DEVKIT_URL": "http://localhost:5199"
      }
    }
  }
}
```

Restart Claude Desktop.

## Usage

Open Claude Desktop and type natural language commands:

```
DevKit kurallarını yükle ve .NET projesi için hazırlan
```

```
DevKit'te "my-backend" profilini oluştur. Workspace "C:\source\myproject", framework dotnet.
```

```
GitHub'da "my-project" adında private repo oluştur, commitle ve push et.
```

```
Docker compose oluştur: postgresql, kafka, elasticsearch, jaeger.
```

```
Bu dosyayı projeye import et: [DEVKIT_PATH marker'lı dosya içeriği]
```

```
Azure'a deploy et: app-myproject-api
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEVKIT_URL` | `http://localhost:5199` | DevKit backend URL |
| `DEVKIT_PROMPTS_DIR` | (auto-detected) | Custom prompts directory path |
| `TRANSPORT` | `stdio` | Transport mode: `stdio` or `http` |
| `PORT` | `3100` | HTTP port (when TRANSPORT=http) |

## Tool List

### Prompt Loaders (3)
`devkit_load_rules`, `devkit_load_full_setup`, `devkit_load_structure`

### Profile Management (5)
`devkit_list_profiles`, `devkit_get_active_profile`, `devkit_set_active_profile`, `devkit_create_profile`, `devkit_delete_profile`

### Project Scaffolding (1)
`devkit_scaffold_project`

### File Import (2)
`devkit_import_file`, `devkit_preview_file`

### Git Management (19)
`devkit_git_status`, `devkit_git_current_branch`, `devkit_git_branches`, `devkit_git_log`, `devkit_git_commit`, `devkit_git_push`, `devkit_git_pull`, `devkit_git_fetch`, `devkit_git_create_branch`, `devkit_git_checkout`, `devkit_git_merge`, `devkit_git_delete_branch`, `devkit_git_stash`, `devkit_git_stash_pop`, `devkit_git_tag`, `devkit_git_push_tags`, `devkit_git_remote_add`, `devkit_git_remote_remove`, `devkit_github_create_repo`

### Docker Compose (8)
`devkit_docker_services`, `devkit_docker_generate`, `devkit_docker_save`, `devkit_docker_inject_appsettings`, `devkit_docker_up`, `devkit_docker_down`, `devkit_docker_ps`, `devkit_docker_logs`

### Azure Management (7)
`devkit_azure_login`, `devkit_azure_verify_login`, `devkit_azure_deploy`, `devkit_azure_restart`, `devkit_azure_logs`, `devkit_azure_env_get`, `devkit_azure_env_set`

### Crypto (2)
`devkit_crypto_decrypt`, `devkit_crypto_encrypt`

## License

MIT

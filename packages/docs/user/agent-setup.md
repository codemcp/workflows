# Agent Setup Guide

This guide explains how to set up AI coding agents to work with the workflows server.

## Core Concepts

Every AI coding agent needs two things to work with the workflows server:

### 1. System Prompt

Instructions that tell the agent how to use the MCP tools. The system prompt teaches the agent to:

- Call `whats_next()` after each user interaction
- Follow the workflow phases (explore, plan, code, commit, etc.)
- Update the plan file to maintain project memory
- Request phase transitions when appropriate

### 2. MCP Server Connection

A connection to the workflows server that provides the actual tools:

```json
{
  "mcpServers": {
    "workflows": {
      "command": "npx",
      "args": ["-y", "@codemcp/workflows-server"]
    }
  }
}
```

## Setup via CLI

The CLI generates both the system prompt and MCP configuration for your agent:

```bash
npx @codemcp/workflows setup <target> [--mode config|skill]
```

### Modes

| Mode     | Description                                                                                 |
| -------- | ------------------------------------------------------------------------------------------- |
| `config` | Embeds system prompt in agent configuration files (traditional approach)                    |
| `skill`  | Creates [agentskills.io](https://agentskills.io) compatible skill files (on-demand loading) |

**Config mode** is best when you always want the workflow guidance active.

**Skill mode** is best when you want the agent to load workflow instructions only when needed.

### Targets

| Target     | Aliases                                      | Description     |
| ---------- | -------------------------------------------- | --------------- |
| `kiro`     | `kiro-cli`.                                  | Kiro / Kiro CLI |
| `claude`   | `claude-code`, `claude-desktop`              | Claude Code     |
| `gemini`   | `gemini-cli`                                 | Gemini CLI      |
| `opencode` | -                                            | OpenCode CLI    |
| `copilot`  | `copilot-vscode`, `vscode`, `github-copilot` | GitHub Copilot  |

### Examples

```bash
# Config mode - embeds system prompt (default)
npx @codemcp/workflows setup claude
npx @codemcp/workflows setup kiro

# Skill mode - on-demand loading
npx @codemcp/workflows setup copilot --mode skill
npx @codemcp/workflows setup gemini --mode skill

# List all available targets
npx @codemcp/workflows setup list
```

## Manual Setup

For unsupported agents or custom configurations:

1. **Get the system prompt** from any generated config file (e.g., `CLAUDE.md`, `GEMINI.md`)

2. **Configure MCP server** in your agent's settings:

   ```json
   {
     "mcpServers": {
       "workflows": {
         "command": "npx",
         "args": ["-y", "@codemcp/workflows-server"]
       }
     }
   }
   ```

3. **Grant tool permissions** for these essential tools:
   - `whats_next`
   - `start_development`
   - `proceed_to_phase`
   - `conduct_review`
   - `list_workflows`
   - `get_tool_info`

## Verification

After setup, verify the integration works:

1. Start a conversation with your agent
2. Ask: "Help me implement a new feature"
3. The agent should call `start_development()` or `whats_next()`
4. Check for `.vibe/development-plan-*.md` files being created

## Troubleshooting

**Agent doesn't call MCP tools:**

- Verify system prompt is configured correctly
- Check MCP server connection in agent settings
- Restart your agent/IDE

**"Tool not found" errors:**

- Run `npx @codemcp/workflows` directly to test the server
- Check server configuration path and permissions

**Project path issues:**

- Set `PROJECT_PATH` environment variable in MCP config if needed
- Ensure the path exists and is writable

## Next Steps

- **[How It Works](./how-it-works.md)** – Understand the development flow
- **[Tutorial](./tutorial.md)** – Hands-on walkthrough
- **[Workflows](../workflows.md)** – Explore available methodologies

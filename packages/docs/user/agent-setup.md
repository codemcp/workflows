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

### Targets

| Target     | Aliases                                      | Description     |
| ---------- | -------------------------------------------- | --------------- |
| `kiro`     | `kiro-cli`                                   | Kiro / Kiro CLI |
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
```

## Next Steps

- **[How It Works](./how-it-works.md)** – Understand the development flow
- **[Tutorial](./tutorial.md)** – Hands-on walkthrough
- **[Workflows](../workflows.md)** – Explore available methodologies

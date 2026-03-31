# @codemcp/workflows-opencode

An [OpenCode](https://github.com/opencode-ai/opencode) plugin that enforces structured development workflows for AI coding agents.

## Why?

Small and mid-sized LLMs tend to skip process steps, edit code during exploration phases, and lose track of decisions after context compaction. This plugin addresses these problems:

| Problem                | Solution                                                            |
| ---------------------- | ------------------------------------------------------------------- |
| **Phase discipline**   | Hard-blocks file edits that violate current phase restrictions      |
| **Lost context**       | Automatically injects phase instructions on every turn              |
| **Context compaction** | Guides summary to preserve decisions and include phase continuation |

## How it works

The plugin hooks into OpenCode's message pipeline:

- **`chat.message`** — Injects phase instructions after each user message
- **`tool.execute.before`** — Blocks disallowed file edits with a clear error (hard enforcement)
- **`experimental.session.compacting`** — Guides compaction to preserve key info and end with phase continuation

This replaces the need for the agent to call `whats_next()` — guidance is injected automatically.

## Architecture: Synthetic Message Injection

Unlike the MCP server approach where agents must explicitly call `whats_next()`, this plugin uses **synthetic message injection**:

```
User Message (as seen by LLM)
├── Part 1: User's actual text
│   └── id: "prt_abc123..."
│
└── Part 2: Workflow guidance (INJECTED)
    └── id: "prt_workflows_{timestamp}"
```

The plugin intercepts each user message, fetches phase-specific instructions from the workflow engine, and appends them as an additional message part. The LLM sees both parts as coming from the user.

### Principles

1. **Zero tool overhead** — No LLM reasoning tokens spent on "should I call whats_next?"
2. **Guaranteed execution** — Every user message triggers guidance injection
3. **Invisible to the agent** — Instructions appear naturally in the conversation
4. **Consistent task management** — `bd` CLI commands with `--parent` flags are always included

### Efficiency Comparison

Measured from real sessions building a todo app:

| Metric                   | Plugin (synthetic) | MCP (tool calls) |
| ------------------------ | ------------------ | ---------------- |
| `whats_next` tool calls  | 0                  | 7                |
| Synthetic parts injected | 2                  | 3                |
| Total tool calls         | 82                 | 106              |
| Files created            | 36                 | 0 (incomplete)   |
| Task completion          | ✅ Full app        | ❌ Interrupted   |

The plugin approach reduces tool call overhead by ~23% while maintaining full workflow compliance. Agents correctly use hierarchical task management (`bd create --parent <phase-id>`) without explicit tool invocations.

## Installation

```json
// opencode.json
{
  "plugin": ["@codemcp/workflows-opencode"]
}
```

Or for local development:

```json
{
  "plugin": ["/path/to/responsible-vibe/packages/opencode-plugin"]
}
```

## Status

Integrated with `@codemcp/workflows-core` for real state management and phase-based file restrictions.

## Related

- [`@codemcp/workflows-core`](../core) — The workflow engine (shared with MCP server)
- [`@codemcp/workflows-server`](../mcp-server) — MCP server for non-OpenCode hosts (Claude Code, Cline, etc.)

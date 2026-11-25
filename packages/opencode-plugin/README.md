# @codemcp/workflows-opencode

An [OpenCode](https://github.com/opencode-ai/opencode) plugin that enforces structured development workflows for AI coding agents.

## Why?

Small and mid-sized LLMs tend to skip process steps, edit code during exploration phases, and lose track of decisions after context compaction. This plugin addresses these problems:

| Problem                | Solution                                                            |
| ---------------------- | ------------------------------------------------------------------- |
| **Phase discipline**   | Hard-blocks file edits that violate current phase restrictions      |
| **Lost context**       | Delivers phase instructions on phase change and after compaction    |
| **Context compaction** | Guides summary to preserve decisions and include phase continuation |

## Compatibility

One package, one default export, both plugin APIs. No feature differences between the two.

| OpenCode | Entry used         | Notes                                                              |
| -------- | ------------------ | ------------------------------------------------------------------ |
| 2.x      | `setup(ctx)`       | Tested against OpenCode 2.1.2 in a container (see _Testing_ below) |
| 1.x      | `server()` (hooks) | Object entrypoints need OpenCode >= 1.18.29                        |

The workflow logic lives in a host-neutral runtime (`src/runtime`); `src/v1` and `src/v2` only translate the host hooks.

## How it works

The plugin hooks into OpenCode's message pipeline:

| Behavior                                              | OpenCode 1.x                           | OpenCode 2.x                                                |
| ----------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------- |
| Notice when no workflow is active / agent not enabled | `chat.message` (hidden synthetic part) | `session.hook("context")` (system prompt of the model call) |
| Block disallowed file edits (hard enforcement)        | `tool.execute.before`                  | `tool.hook("execute.before")`                               |
| Guide compaction (preserve decisions, phase context)  | `experimental.session.compacting`      | `session.hook("compaction")`                                |
| Compact after `proceed_to_phase`                      | `client.session.summarize`             | `session.compact({ delivery: "queue" })`                    |
| Phase-aware continue after compaction                 | `session.compacted` + `session.idle`   | `session.compaction.ended` + queued `session.prompt`        |
| Workflow tools + permission prompt                    | `tool` map + `ctx.ask`                 | `tool.transform` (`codemode: false`) + `permission.assert`  |
| Logging                                               | `client.app.log`                       | file sink, see `WORKFLOW_LOG_FILE`                          |

## Architecture: Instructions on Demand

Unlike the MCP server approach where agents must explicitly call `whats_next()`, this plugin delivers the phase instructions at the moments they change, without a tool call from the agent:

1. **Phase change**: `start_development` and `proceed_to_phase` return the instructions of the new phase as their tool result.
2. **After compaction**: `proceed_to_phase` triggers a compaction (unless `WORKFLOW_AUTO_COMPACT=false`). When it ends, the plugin sends the instructions of the current phase once as the continue message.
3. **Per message**: nothing is added to user messages. Current models keep the instructions of the active phase in context. Only two short notices are added, and only when relevant: "no active workflow" (suggests `start_development`) and "workflow tools are not enabled for this agent". On 1.x they are a hidden synthetic part of the user message, on 2.x they go into the system prompt of the model call (a 2.x `prompt` hook edit would be stored as visible user text).

File edits that violate the phase restrictions are always blocked by the plugin, independent of what the model remembers.

### Principles

1. **Zero tool overhead**: no reasoning tokens spent on "should I call whats_next?"
2. **Quiet transcript**: instructions appear once per phase change, not under every message
3. **Hard enforcement**: edit restrictions do not depend on the model's memory
4. **Consistent task management**: `bd` CLI commands with `--parent` flags are part of the phase instructions

## Installation

OpenCode 2.x (`opencode.json`, key `plugins`):

```json
{
  "plugins": ["@codemcp/workflows-opencode"]
}
```

OpenCode 1.x (`opencode.json`, key `plugin`):

```json
{
  "plugin": ["@codemcp/workflows-opencode"]
}
```

For local development in OpenCode 2.x, put (or symlink) the built package into `.opencode/plugins/workflows/` of your project and add an `index.js` containing `export { default } from './dist/index.js'`. OpenCode 2.1.2 only loads a plugin directory (auto-discovered or listed in `plugins`) that has an `index.js`/`index.ts` at its root. For 1.x use `{"plugin": ["/path/to/workflows/packages/opencode-plugin"]}`.

The sidebar widget is a separate package, see [`@codemcp/workflows-opencode-tui`](../opencode-tui-plugin).

## Configuration

### Agent Filtering

By default, the plugin is active for all agents. Set `WORKFLOW_AGENTS` to a comma-separated list of agent names to restrict it to specific agents only:

```bash
# Only activate for the "coder" and "architect" agents
WORKFLOW_AGENTS=coder,architect npx opencode
```

When the env var is set, workflow hooks are skipped and tools throw a clear error for any agent not in the list. This prevents subagents (Tasks) from being interrupted by workflow instructions when they are not expected to follow the workflow.

**When unset**, workflows are active for all agents (default behavior).

### Auto-Compaction

When transitioning to a new phase via `proceed_to_phase`, the plugin automatically triggers a session compaction (summarize) to clear prior-phase context from the LLM window. This is enabled by default.

Set `WORKFLOW_AUTO_COMPACT=false` to disable this behavior:

```bash
WORKFLOW_AUTO_COMPACT=false npx opencode
```

**When unset or any value other than `false`**, compaction runs on every successful phase transition (default behavior).

### Logging (OpenCode 2.x)

OpenCode 2 has no plugin log API and writing to stderr would corrupt the TUI. Set `WORKFLOW_LOG_FILE=/path/to/file.log` to get the plugin's log output; without it nothing is logged. OpenCode 1.x keeps using `client.app.log`.

### Per-Agent Behavior

- **Agent in filter**: tools, edit blocking and the instructions after phase changes work normally
- **Agent not in filter**: tools throw "not enabled for this agent" and the model gets a short notice instead

This design makes agent switching automatic—no session state needed. When the user switches agents, the TUI widget visibility and hook behavior adapt immediately based on the new agent.

## Testing

- `pnpm test` runs the unit and e2e tests. The OpenCode 1.x adapter is exercised through the V1 hooks, the 2.x adapter through a mock plugin context (`test/unit/v2-plugin.test.ts`).
- The OpenCode 2.x adapter was additionally verified against the real OpenCode `2.1.2` image (`ghcr.io/anomalyco/opencode:2.1.2`) with a scripted mock LLM: plugin loading, tool offering, notices in the system prompt, edit blocking, `permission.assert` and compaction.

Container E2E (`pnpm test:e2e:container`, opt-in, needs Apple `container` or `docker`, not part of `pnpm test` or CI): a contract test against the real OpenCode 2 image. Run it when the V2 adapter changes or a new OpenCode 2 release comes out. It asserts what the model receives and which files appear, using a scripted mock LLM. It does not cover how things look in the TUI (sidebar, permission dialog) or the queued message after a compaction; check those interactively.

## Status

Integrated with `@codemcp/workflows-core` for real state management and phase-based file restrictions.

## Related

- [`@codemcp/workflows-core`](../core) — The workflow engine (shared with MCP server)
- [`@codemcp/workflows-server`](../mcp-server) — MCP server for non-OpenCode hosts (Claude Code, Cline, etc.)

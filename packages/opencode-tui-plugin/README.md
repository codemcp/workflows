# @codemcp/workflows-opencode-tui

OpenCode TUI sidebar plugin that displays the current [@codemcp/workflows](https://codemcp.github.io/workflows/) workflow phase and name.

## Installation

Add the plugin to your OpenCode TUI config. Create or edit `~/.config/opencode/tui.json`:

OpenCode 1.x:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["@codemcp/workflows-opencode-tui"]
}
```

OpenCode 2.x (CLI plugin, `cli.json`, key `plugins`):

```json
{
  "plugins": ["@codemcp/workflows-opencode-tui"]
}
```

The package has one default export for both hosts: 1.x reads `tui`, 2.x reads `setup`. OpenCode installs the package automatically on next startup — no manual `npm install` needed.

## What it shows

When a workflow is active, the sidebar displays:

```
Workflow
epcc: code
```

The plugin reads state from `.vibe/conversations/*/state.json` in your project directory and updates whenever any responsible-vibe tool is invoked.

### Agent-based visibility

The plugin respects the `WORKFLOW_AGENTS` environment variable:

- **When `WORKFLOW_AGENTS` is set**: Widget only appears for agents in the whitelist
- **When `WORKFLOW_AGENTS` is unset**: Widget appears for all agents (default behavior)

Widget visibility updates automatically when you switch agents—no manual refresh needed.

## Supported tool modes

The plugin works with both integration modes:

| Mode                         | Tool names                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **opencode-plugin** (direct) | `start_development`, `proceed_to_phase`, `conduct_review`, `reset_development`, `setup_project_docs`                                                   |
| **MCP server**               | `workflows_start_development`, `workflows_proceed_to_phase`, `workflows_conduct_review`, `workflows_reset_development`, `workflows_setup_project_docs` |

## Local development

To test the plugin locally before publishing, point `tui.json` at the absolute path to this package:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["/path/to/workflows/packages/opencode-tui-plugin"]
}
```

## Compatibility notes

- The 2.x entry is written against the `@opencode/plugin@2.1.2` typings (`context.ui.slot`, `context.data`, `context.theme`). It is covered by type checking and the state-reader unit tests, but could not be verified in a real terminal session yet.
- Workflow state is read from `.vibe/conversations/<id>/state.json`, the same files for both hosts.

## License

MIT

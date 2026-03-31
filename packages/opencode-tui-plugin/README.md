# @codemcp/workflows-opencode-tui

OpenCode TUI sidebar plugin that displays the current [responsible-vibe](https://mrsimpson.github.io/responsible-vibe-mcp/) workflow phase and name.

## Installation

Add the plugin to your OpenCode TUI config. Create or edit `~/.config/opencode/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["@codemcp/workflows-opencode-tui"]
}
```

OpenCode will install the package automatically via Bun on next startup — no manual `npm install` needed.

## What it shows

When a workflow is active, the sidebar displays:

```
Workflow
epcc: code
```

The plugin reads state from `.vibe/conversations/*/state.json` in your project directory and updates whenever any responsible-vibe tool is invoked.

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
  "plugin": ["/path/to/responsible-vibe-mcp/packages/opencode-tui-plugin"]
}
```

## License

MIT

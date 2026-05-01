# Development Plan: workflows (fix/opencode-plugin-permissions branch)

*Generated on 2026-05-01 by Vibe Feature MCP*
*Workflow: [epcc](https://codemcp.github.io/workflows/workflows/epcc)*

## Goal

Fix the opencode-plugin so that when opencode on the web asks for permissions, it shows meaningful parameter information instead of just `*`. For example, when `proceed_to_phase` is called, the user should see the target phase and reason, not just `*`.

## Key Decisions

### KD-1: Fix location is wrap() in plugin.ts, not individual tool handlers

The `wrap()` function in `plugin.ts` (lines 644-667) is the ONLY `ask()` call that actually presents a dialog to the user. The individual tool handler `ask()` calls are **dead code** — they are auto-allowed because `wrap()` already granted `always: ['*']`.

Therefore, the fix must be in `wrap()`, passing the `args` object through to build meaningful `patterns`.

### KD-2: Individual tool handler ask() calls will be removed

Since the handler `ask()` calls are never shown (auto-allowed by wrap's `always: ['*']`), they are misleading dead code. They will be removed to keep the code clean and avoid future confusion.

### KD-3: patterns array format — human-readable key:value strings

The web UI (`session-permission-dock.tsx`) only shows `props.request.patterns`. We will build a `patterns` array of human-readable strings like:
- `"workflow: epcc"` for `start_development`
- `"target_phase: code"`, `"reason: ..."` for `proceed_to_phase`
- `"target_phase: code"` for `conduct_review`
- `"delete_plan: true"`, `"reason: ..."` for `reset_development`
- `"architecture: arc42"`, `"requirements: ears"`, `"design: comprehensive"` for `setup_project_docs`

Undefined/null/missing values are omitted. If no args produce meaningful patterns, fall back to `['*']`.

### KD-4: metadata populated with args

The `metadata` field in the `wrap()` `ask()` call is changed from `{}` to the actual `args` object so future consumers also get tool-specific info.

### KD-5: buildPermissionPatterns helper colocated in plugin.ts

The helper function is small and tightly coupled to `wrap()`, so it lives in `plugin.ts` rather than a separate utility file.

## Notes

### Architecture: Two-layer ask() (discovered in Explore phase)

1. `wrap()` in `plugin.ts`: The FIRST and only effectively-shown `ask()`. Currently uses `patterns: ['*']` and `metadata: {}`.
2. Individual tool handlers: Each also calls `ask()` with tool-specific metadata, but since `always: ['*']` was already granted by `wrap()`, these second calls are auto-allowed and **never shown to the user**.

### Web UI vs TUI difference

- **Web UI** (`session-permission-dock.tsx`): Shows `props.request.patterns` only — we must put meaningful strings in `patterns`.
- **TUI** (`permission.tsx`): Reads `part.state.input` (raw tool call args) — already shows rich details, no change needed.

### Patterns format per tool

| Tool | Patterns |
|---|---|
| `start_development` | `workflow: <value>` |
| `proceed_to_phase` | `target_phase: <value>`, `reason: <value>` (if present) |
| `conduct_review` | `target_phase: <value>` |
| `reset_development` | `delete_plan: <value>` (if true), `reason: <value>` (if present) |
| `setup_project_docs` | `architecture: <value>`, `requirements: <value>`, `design: <value>` |

### Relevant files

- `packages/opencode-plugin/src/plugin.ts` — **Primary change**: `wrap()` and new `buildPermissionPatterns()` helper
- `packages/opencode-plugin/src/tool-handlers/proceed-to-phase.ts` — Remove redundant `ask()`
- `packages/opencode-plugin/src/tool-handlers/start-development.ts` — Remove redundant `ask()`
- `packages/opencode-plugin/src/tool-handlers/conduct-review.ts` — Remove redundant `ask()`
- `packages/opencode-plugin/src/tool-handlers/reset-development.ts` — Remove redundant `ask()`
- `packages/opencode-plugin/src/tool-handlers/setup-project-docs.ts` — Remove redundant `ask()`

## Explore
<!-- beads-phase-id: responsible-vibe-34.1 -->
### Tasks
<!-- beads-synced: 2026-05-01 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*

- [x] `responsible-vibe-34.1.1` Explore how opencode web UI displays permission patterns
- [x] `responsible-vibe-34.1.2` Fix patterns in all tool ask() calls to show meaningful info
- [x] `responsible-vibe-34.1.3` Fix top-level wrap() ask() call in plugin.ts

## Plan
<!-- beads-phase-id: responsible-vibe-34.2 -->
### Tasks
<!-- beads-synced: 2026-05-01 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*

- [x] `responsible-vibe-34.2.1` Design buildPermissionPatterns helper function
- [x] `responsible-vibe-34.2.2` Plan removal of redundant ask() calls in tool handlers
- [x] `responsible-vibe-34.2.3` Define patterns format per tool

## Code
<!-- beads-phase-id: responsible-vibe-34.3 -->
### Tasks
<!-- beads-synced: 2026-05-01 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*

- [x] `responsible-vibe-34.3.1` Add buildPermissionPatterns() helper to plugin.ts and update wrap()
- [x] `responsible-vibe-34.3.2` Remove redundant ask() calls from all 5 tool handlers
- [x] `responsible-vibe-34.3.3` Build and type-check the plugin

## Commit
<!-- beads-phase-id: responsible-vibe-34.4 -->
### Tasks
<!-- beads-synced: 2026-05-01 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*


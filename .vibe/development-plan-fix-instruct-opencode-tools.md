# Development Plan: responsible-vibe (fix/instruct-opencode-tools branch)

*Generated on 2026-04-03 by Vibe Feature MCP*
*Workflow: [minor](https://mrsimpson.github.io/responsible-vibe-mcp/workflows/minor)*

## Goal

When `WORKFLOW_AGENTS` is set, workflow tools are visible to all agents but throw errors when called. Agents keep calling them anyway because the tool definitions appear in the system prompt with no instruction to avoid them. We need to instruct non-enabled agents to ignore the workflow tools via a system prompt injection.

## Key Decisions

### Decision: Use `chat.message` synthetic part for suppression, NOT `experimental.chat.system.transform` (2026-04-03, revised)
- **Rationale:** `chat.message` already fires reliably for all agents (confirmed by live testing), already has `hookInput.agent` directly available, and already injects synthetic parts into the conversation. Using it for suppression eliminates the need for `lastKnownAgent` state and any ordering dependency between hooks. `experimental.chat.system.transform` was initially implemented but has a fundamental flaw: it has no guaranteed firing order relative to `chat.message` and may fire for intermediate LLM calls (tool use loops) without `chat.message` having fired first — making `lastKnownAgent` potentially stale and the suppression unreliable.
- **Alternatives considered:**
  - `experimental.chat.system.transform` — initially implemented, then reverted. Requires capturing agent from `chat.message` into `lastKnownAgent` state, creating a fragile ordering dependency.
  - Modifying tool descriptions (`tool.definition` hook) — less effective; descriptions still appear and the LLM needs an explicit instruction not to call them.

### Decision: Only inject suppression when `WORKFLOW_AGENTS` filter is active (2026-04-03)
- **Rationale:** When `WORKFLOW_AGENTS` is not set (null filter = all agents active), no suppression should occur. The hook should be a no-op in the default case.
- **Alternatives considered:** Always injecting tool capability info — rejected as noise for users who don't restrict agents.

## Notes

### Hook API reference

`chat.message`:
```typescript
input: { sessionID?: string; messageID?: string; agent?: string; model?: Model }
output: { message: UserMessage; parts: Part[] }  // push synthetic parts
```

### Flow

1. `chat.message` fires with `hookInput.agent`
2. If `agentFilter` is set and agent is NOT enabled → push suppression synthetic part onto `output.parts`
3. If agent IS enabled → push phase instructions as usual (existing behaviour)
4. No state needed — agent is available directly in the hook input

### Tool names to suppress

`start_development`, `proceed_to_phase`, `conduct_review`, `reset_development`, `setup_project_docs`

### Scope of change

- `packages/opencode-plugin/src/plugin.ts` — remove `lastKnownAgent` + `experimental.chat.system.transform` hook; add suppression synthetic part injection in `chat.message` for non-enabled agents; remove the early `return` so suppression part is injected instead
- `packages/opencode-plugin/test/e2e/plugin.test.ts` — update tests: suppression tests check `output.parts` instead of `output.system`; remove `experimental.chat.system.transform` test calls

## Explore
<!-- beads-phase-id: responsible-vibe-32.1 -->
### Tasks
<!-- beads-synced: 2026-04-03 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*

- [x] `responsible-vibe-32.1.1` Understand the system prompt hook API in opencode
- [x] `responsible-vibe-32.1.2` Implement experimental.chat.system.transform hook for disabled agents
- [x] `responsible-vibe-32.1.3` Ensure system prompt is restored when switching back to enabled agent
- [x] `responsible-vibe-32.1.4` Add/update tests for the new behavior

## Implement
<!-- beads-phase-id: responsible-vibe-32.2 -->
### Tasks
<!-- beads-synced: 2026-04-03 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*


## Finalize
<!-- beads-phase-id: responsible-vibe-32.3 -->
### Tasks
<!-- beads-synced: 2026-04-03 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*


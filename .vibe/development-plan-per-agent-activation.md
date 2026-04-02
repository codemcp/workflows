# Development Plan: responsible-vibe (per-agent-activation branch)

*Generated on 2026-04-02 by Vibe Feature MCP*
*Workflow: [epcc](https://mrsimpson.github.io/responsible-vibe-mcp/workflows/epcc)*

## Goal
Simplify PR #257's per-agent workflow activation by eliminating redundant session-level state caches. Replace session-based `/workflow on|off` toggling with pure per-agent filtering using tool-execution validation.

## Key Decisions
1. **Remove session state tracking entirely** — No `sessionEnabled` map, no `sessionOverrideMap`, no `/workflow on|off` command ✓
2. **Agent filtering happens per-message** — On every `chat.message` hook, check if current agent is in `WORKFLOW_AGENTS` filter ✓
3. **NO system prompt injection** — Only use agent filter in hooks and tool wrappers (simpler, cleaner)
4. **NO `/workflow on|off` command** — YAGNI. Workflows available = agent in filter. That's it.
5. **Agent not in filter** → Hooks skip, tools throw error (clear, simple)
6. **Rename env var** — `WORKFLOW_ACTIVE_AGENTS` → `WORKFLOW_AGENTS` (clearer intent) ✓
7. **Agent switching works automatically** — As agent changes, hooks re-evaluate without session state

## Notes
- Simplified dramatically: only 3 components need changes (plugin init, chat.message hook, tool wrappers)
- TUI updates: parse `WORKFLOW_AGENTS` env var, derive agent from messages, compute `isActive` memo
- No command hook needed - eliminated YAGNI feature entirely
- Build succeeds without errors ✓

## Explore
<!-- beads-phase-id: responsible-vibe-30.1 -->
### Tasks
<!-- beads-synced: 2026-04-02 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*


## Plan
<!-- beads-phase-id: responsible-vibe-30.2 -->
### Tasks
<!-- beads-synced: 2026-04-02 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*

- [x] `responsible-vibe-30.2.1` Simplify opencode-plugin: remove sessionEnabled + sessionAgents maps
- [ ] `responsible-vibe-30.2.2` System prompt injection: evaluate agent filter on every chat.message, inject suppression if needed
- [x] `responsible-vibe-30.2.3` Update tool wrappers: throw error if agent not in WORKFLOW_AGENTS filter
- [ ] `responsible-vibe-30.2.4` TUI plugin: simplify to agent filter only, remove sessionOverrideMap
- [ ] `responsible-vibe-30.2.5` Rename WORKFLOW_ACTIVE_AGENTS to WORKFLOW_AGENTS throughout codebase
- [ ] `responsible-vibe-30.2.6` Update tests: remove sessionEnabled tests, add agent filter validation tests
- [ ] `responsible-vibe-30.2.7` Update docs: clarify WORKFLOW_AGENTS behavior, agent switching, system prompt injection

## Code
<!-- beads-phase-id: responsible-vibe-30.3 -->
### Tasks
<!-- beads-synced: 2026-04-02 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*


## Commit
<!-- beads-phase-id: responsible-vibe-30.4 -->
### Tasks
<!-- beads-synced: 2026-04-02 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*


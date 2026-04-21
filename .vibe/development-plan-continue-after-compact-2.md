# Development Plan: responsible-vibe (continue-after-compact-2 branch)

*Generated on 2026-04-21 by Vibe Feature MCP*
*Workflow: [minor](https://mrsimpson.github.io/responsible-vibe-mcp/workflows/minor)*

## Goal
After OpenCode context compaction, the AI should automatically continue with full workflow phase context. Two scenarios:
1. **Auto compaction** (`auto: true`): OpenCode creates a synthetic "Continue if you have next steps..." message, but it bypasses `chat.message` hook → phase instructions not injected.
2. **Manual compaction** (`auto: false`, triggered via UI): No synthetic continue message is created at all. Our plugin fires `client.session.prompt()` but the loop exits immediately without making an LLM call.

## Key Decisions

### Root cause findings (2026-04-21 deep dive)

**Manual compaction (`auto: false`):**
- The compaction task part in the DB has `auto=0` — all observed compactions were triggered via the OpenCode TUI with `auto: false`
- Since `auto: false`, the synthetic "Continue if you have next steps..." message is NEVER created
- `session.compacted` is still published (it fires regardless of auto)
- Our plugin calls `client.session.prompt()` → POST `/session/{id}/message` → returns with `duration=0`
- The loop exits IMMEDIATELY without calling the LLM — confirmed by absence of `session.prompt step=0 loop` logs and no LLM activity in the ~1m46s window before user's manual message
- The exact cause of immediate loop exit is unclear but likely related to race conditions between the runner state machine and our prompt call timing

**Auto compaction (`auto: true`):**
- Synthetic "Continue..." message IS created (with `synthetic: true` on the text part)
- The `chat.message` hook is NOT triggered for synthetic messages — this is the original stated problem
- AI responds but without phase context

**Session.idle timing issue:**
- `session.idle` fires SIMULTANEOUSLY with `session.compacted` (same millisecond in logs)
- This is because after auto compaction, `session.idle` fires at the compaction step boundary
- For manual compaction: the loop at step=2 exits in 2ms after the compaction summary is created, then `session.idle` fires

### Proposed fix approach

**Two-pronged strategy:**

1. **Enhance `experimental.session.compacting` hook** to inject FULL phase instructions into the compaction context/prompt. This makes the summary self-sufficient — it embeds the phase context so the AI knows what to continue even without `chat.message` firing.

2. **Fix the post-compaction prompt injection:**
   - Switch from `client.session.prompt()` (synchronous, blocks) to `client.session.promptAsync()` (fires-and-forgets, non-blocking)  
   - Add a small delay (e.g., 500ms) before calling to avoid race conditions with runner state transitions
   - Use `client.session.promptAsync()` to inject "Continue with the current phase." so the loop runs properly without our code blocking on the HTTP response

### Why `experimental.compaction.autocontinue` is not the solution
Setting `enabled: false` would prevent the synthetic message entirely and force reliance on our prompt — but this doesn't solve the immediate loop exit issue.

## Notes
- All 3 compaction tasks in the DB have `auto=0` — this project uses manual compaction (via TUI)
- Session ID `ses_2516d00b9ffesNfmx4bVKPm4Hh` is a long-running session with messages from multiple days
- The `duration=0` for the HTTP `/session/{id}/message` response is NORMAL for streaming endpoints (measures time to first byte, not full response)
- The `chat.message` hook DOES fire for our `client.session.prompt()` messages — confirmed by synthetic phase instructions appearing in DB parts
- After the loop exits at step=2 (2ms), there's 1m46s of silence before user's manual message — our `promptAsync` call must have had no effect

## Explore
<!-- beads-phase-id: responsible-vibe-32.1 -->
### Tasks
<!-- beads-synced: 2026-04-21 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*

- [x] `responsible-vibe-32.1.1` Research: confirm promptAsync vs prompt behavior
- [x] `responsible-vibe-32.1.2` Design: inject full phase instructions into compacting hook

## Implement
<!-- beads-phase-id: responsible-vibe-32.2 -->
### Tasks
<!-- beads-synced: 2026-04-21 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*


## Finalize
<!-- beads-phase-id: responsible-vibe-32.3 -->
### Tasks
<!-- beads-synced: 2026-04-21 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*


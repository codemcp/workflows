# Development Plan: responsible-vibe (remove-internal-plugin-state branch)

*Generated on 2026-03-31 by Vibe Feature MCP*
*Workflow: [epcc](https://mrsimpson.github.io/responsible-vibe-mcp/workflows/epcc)*

## Goal
Remove redundant `CachedWorkflowState` from the opencode plugin. The plugin maintains internal state (`cachedState`) that duplicates what `ConversationManager` already persists to disk. This state gets out of sync on session resume. Replace all reads from `cachedState` with reads from `ConversationManager` via `getServerContext()`.

## Key Decisions
1. **`ProceedToPhaseHandler` already persists to disk** (line 125-127 of mcp-server proceed-to-phase.ts calls `conversationManager.updateConversationState`), so the next `WhatsNextHandler` call in `chat.message` will read correct state. The "race condition" from commit 8985941 does not actually exist — the tool writes to disk before returning.
2. **Three consumers of `cachedState`**: `chat.message` (instructions), `tool.execute.before` (file patterns), `experimental.session.compacting` (phase info). All can read from `ConversationManager` instead.
3. **`updateCachedState` callback passed to tool handlers** can be removed — tools no longer need to update plugin state.
4. **`loadStateDirectly()` creates its own `FileStorage`/`ConversationManager`** — wasteful. Use the shared `ServerContext` instead.
5. **Replace 7-field CachedWorkflowState with minimal instruction buffer**: `lastPhaseInstructions: { phase: string, instructions: string, allowedFilePatterns: string[] } | null`. Set by proceed_to_phase/start_development, consumed+cleared by chat.message. Falls back to WhatsNextHandler if null.
6. **tool.execute.before and compacting**: Read from ConversationManager via shared ServerContext. No more `loadStateDirectly` with throwaway instances.
7. **Tool handlers**: Replace `updateCachedState` callback with simpler `setLastInstructions` callback.

## Notes
- `cachedState` is used in 4 places: `chat.message`, `tool.execute.before`, `experimental.session.compacting`, and initial load at plugin startup
- Tool handlers `start_development` and `proceed_to_phase` accept `updateCachedState` callback — needs removal from signature
- The `ServerContext` is already cached and reused (`cachedServerContext`), so reading from it is cheap
- `ConversationManager.getConversationContext()` reads from `FileStorage` (disk) every call — no in-memory cache to go stale
- `FileStorage.initialize()` only creates directories — the shared ServerContext's FileStorage works because the directory already exists from previous operations
- Minor pre-existing issue: `initializeServerContext` creates a throwaway `FileStorage` — out of scope

## Follow-up: Session-Resume Phase Reset Bug

On session resume (e.g. `opencode -c`), `WhatsNextHandler` auto-resets the phase to `explore` every time. Root cause:
1. The plugin's `createServerContext` does NOT set `interactionLogger` on `ServerContext`
2. So `logInteraction` in `WhatsNextHandler`/`ProceedToPhaseHandler` is a no-op
3. `hasInteractions(conversationId)` always returns `false`
4. `isFirstCallFromInitialState()` returns `true` on every new plugin load
5. `analyzePhaseTransition` auto-transitions to first development phase, overwriting the phase set by `proceed_to_phase`

**Fix**: Add `InteractionLogger` to the plugin's `ServerContext` in `server-context.ts` (same as `server-config.ts` does in the MCP server). This is a separate task.

## Explore
<!-- beads-phase-id: responsible-vibe-23.1 -->
### Tasks

*Tasks managed via `bd` CLI*

## Plan
<!-- beads-phase-id: responsible-vibe-23.2 -->
### Tasks

*Tasks managed via `bd` CLI*

## Code
<!-- beads-phase-id: responsible-vibe-23.3 -->
### Tasks

*Tasks managed via `bd` CLI*

## Commit
<!-- beads-phase-id: responsible-vibe-23.4 -->
### Tasks

*Tasks managed via `bd` CLI*



---
*This plan is maintained by the LLM and uses beads CLI for task management. Tool responses provide guidance on which bd commands to use for task management.*

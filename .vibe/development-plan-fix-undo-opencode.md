# Development Plan: responsible-vibe (fix-undo-opencode branch)

*Generated on 2026-04-01 by Vibe Feature MCP*
*Workflow: [bugfix](https://mrsimpson.github.io/responsible-vibe-mcp/workflows/bugfix)*

## Goal
Fix the opencode plugin so that synthetic instruction parts it injects into user messages are properly marked with `synthetic: true`. Without this flag, the undo flow in opencode restores the plugin's instruction text (which is longer than the user's actual message) into the prompt input instead of the user's original text.

## Key Decisions
- **Root cause identified**: In `packages/opencode-plugin/src/plugin.ts`, the `chat.message` hook pushes parts to `output.parts` without `synthetic: true`. OpenCode's `extractPromptFromParts` function (used during undo) picks the longest non-synthetic text part as the restored prompt. Since plugin instructions are much longer than the user's message, the instruction text gets restored instead of the user's actual input.
- **Fix**: Add `synthetic: true` to all `output.parts.push(...)` calls in the plugin's `chat.message` hook.

## Notes
- `extractPromptFromParts` in `/packages/app/src/utils/prompt.ts` filters out parts where `synthetic === true` or `ignored === true` (line 44).
- All other synthetic parts in OpenCode core (e.g., in `prompt.ts` `insertReminders`) correctly set `synthetic: true`.
- The fix is minimal: add `synthetic: true` to the two `output.parts.push()` calls in the `chat.message` hook handler.

## Reproduce
<!-- beads-phase-id: responsible-vibe-29.1 -->
### Tasks

*Tasks managed via `bd` CLI*

## Analyze
<!-- beads-phase-id: responsible-vibe-29.2 -->
### Tasks

*Tasks managed via `bd` CLI*

## Fix
<!-- beads-phase-id: responsible-vibe-29.3 -->
### Tasks

*Tasks managed via `bd` CLI*

## Verify
<!-- beads-phase-id: responsible-vibe-29.4 -->
### Tasks

*Tasks managed via `bd` CLI*

## Finalize
<!-- beads-phase-id: responsible-vibe-29.5 -->
### Tasks

*Tasks managed via `bd` CLI*



---
*This plan is maintained by the LLM and uses beads CLI for task management. Tool responses provide guidance on which bd commands to use for task management.*

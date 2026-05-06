# Development Plan: repo (proud-garlics-sleep branch)

*Generated on 2026-05-06 by Vibe Feature MCP*
*Workflow: [minor](https://codemcp.github.io/workflows/workflows/minor)*

## Goal
Improve the opencode plugin by instructing the model in the first message of a session (when no workflow is active) to create a branch with a meaningful name using conventional-commit-prefix (e.g., `feat/add-new-provider`).

## Key Decisions
- **Where the first message instruction lives**: In `packages/opencode-plugin/src/plugin.ts`, the `chat.message` hook handles injecting instructions. When no workflow is active, it shows a generic "No Active Workflow Detected. You MUST initiate a new development workflow..." message.
- **Current branch suggestion logic**: Located in `packages/mcp-server/src/tool-handlers/start-development.ts` (lines 113-133). When user is on main/master, it generates a branch name like `feature/development-YYYYMMDD`.
- **Proposed change**: Modify the "no active workflow" instruction in the chat.message hook to also instruct the model to create a branch with a conventional-commit-prefix before calling start_development.
- **Branch naming**: Use conventional commit prefixes like `feat/`, `fix/`, `refactor/`, `docs/`, etc., combined with a brief description of the task.

## Notes
- The "no active workflow" message is injected in two places in plugin.ts:
  1. Lines 374-383: When handlerResult is not successful
  2. Lines 392-402: When error includes 'CONVERSATION_NOT_FOUND'
- Need to enhance both to include branch creation guidance with conventional commit prefix

## Explore
### Tasks
- [x] Understand the plugin architecture and where instructions are injected
- [x] Find the "no active workflow" message location
- [x] Analyze existing branch suggestion logic in start-development handler
- [x] Determine how to enhance the instruction message

### Completed
- Analyzed plugin.ts chat.message hook (lines 284-437) - this is where instructions are injected
- Found "no active workflow" messages at lines 374-383 and 392-402 in plugin.ts
- Reviewed start-development.ts generateBranchSuggestion() at lines 581-584
- The current branch suggestion generates `feature/development-YYYYMMDD` which lacks conventional-commit-prefix

## Implement
### Tasks
- [x] Modify "no active workflow" message in plugin.ts (lines 381 and 400) to include branch creation guidance with conventional commit prefix

### Completed
- Enhanced both "no active workflow" messages in plugin.ts to include guidance:
  - "First, create a new branch with a meaningful name using a conventional commit prefix (e.g., `feat/add-new-feature`, `fix/bug-description`, `refactor/improve-logic`). Then call the `start_development` tool to begin."
- This change ensures that when a user starts a new session without an active workflow, they'll be instructed to create a properly named branch before initiating a development workflow

## Finalize
### Tasks
- [x] Code cleanup - verified no debug output, TODO/FIXME, or debugging code blocks exist
- [x] Documentation review - no updates needed (change doesn't affect documented behavior)
- [x] Final validation - changes verified via git diff, implementation is complete

### Completed
- Verified no debug output (console.log, debugger, etc.) in plugin source code
- Verified no TODO/FIXME comments in modified files
- Reviewed documentation (.vibe/docs/requirements.md, design.md, plugin README) - no updates needed
- Change is a simple text modification to two string literals in plugin.ts
- Implementation complete and ready for commit/PR



---
*This plan is maintained by the LLM. Tool responses provide guidance on which section to focus on and what tasks to work on.*

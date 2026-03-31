# Development Plan: responsible-vibe (feat/opencode-enable-disable branch)

*Generated on 2026-03-31 by Vibe Feature MCP*
*Workflow: [epcc](https://mrsimpson.github.io/responsible-vibe-mcp/workflows/epcc)*

## Goal
Add a mechanism to completely disable the OpenCode workflows plugin per-agent, as if it was never registered. This allows agents to operate without workflow enforcement while other agents use workflows normally.

## Key Decisions
- **Plugin Disabling vs Feature Disabling**: Requirement is to disable the entire plugin (as if unregistered), not disable per-agent
- **No Persistence**: Do NOT persist enable/disable state across sessions. Each session starts fresh.
- **Multiple Control Inputs**:
  1. **Environment Variable** (startup): `WORKFLOWS=on|off` at application start
  2. **User Command** (runtime): `/{workflow|wf} {on|off}` during session
- **User Command Interface**: Plugin intercepts via `command.execute.before` hook. User defines `/workflow` or `/wf` command in `.opencode/commands/workflow.md`
- **Stateful During Session**: Global enable/disable flag set at startup by env var, can be toggled by user command during session
- **Simplified Scope**: Single on/off state for entire plugin (not per-agent). Global disable means workflows disabled for all agents.

## Notes
- Plugins cannot register custom commands directly - they intercept via `command.execute.before` hook
- The `command.execute.before` hook receives command name and can modify `output.parts` to inject response
- No `.vibe/workflows-config.json` file needed - state is in-memory during session
- Env var `WORKFLOWS=on|off` checked at plugin initialization to set initial state
- Runtime command `/workflow on|off` or `/wf on|off` toggles the in-memory state

## Explore
<!-- beads-phase-id: responsible-vibe-21.1 -->
### ✅ Completed
- Researched OpenCode plugin lifecycle and agent context availability
- Evaluated implementation approaches (runtime check vs config file)
- Determined plugin can use `command.execute.before` hook to intercept `/workflows` commands
- Clarified that this is a user command, not an LLM tool

### Entrance Criteria for Plan Phase
- ✅ Requirements understood: Complete plugin disable per-agent via user command
- ✅ Architecture decided: Runtime check in plugin hooks + command.execute.before interceptor
- ✅ Implementation approach clear: Config file + agent name checking

## Plan
<!-- beads-phase-id: responsible-vibe-21.2 -->

### Implementation Specification

#### 1. Global State Variable
```typescript
let workflowsEnabled = true; // Set by env var at startup, toggleable at runtime
```

#### 2. Initialization
Read `WORKFLOWS` env var at plugin startup:
```typescript
const envWorkflows = process.env.WORKFLOWS?.toLowerCase();
workflowsEnabled = envWorkflows === 'off' ? false : true; // default: on
logger.info('Workflows initialized', { workflowsEnabled });
```

#### 3. User Command Definition
File: `.opencode/commands/workflow.md` (template provided by plugin or user creates it)
```markdown
---
description: Enable/disable workflows for this session
---
Toggle workflows: /workflow on or /workflow off or /wf on or /wf off
```

#### 4. Command Interceptor Hook
Implement `command.execute.before` hook:
```typescript
'command.execute.before': async (input, output) => {
  const cmd = input.command.toLowerCase();
  const args = input.arguments?.toLowerCase().trim() || '';
  
  if (cmd === 'workflow' || cmd === 'wf') {
    if (args === 'on') {
      workflowsEnabled = true;
      output.parts.push({
        type: 'text',
        text: 'Workflows enabled for this session.'
      });
    } else if (args === 'off') {
      workflowsEnabled = false;
      output.parts.push({
        type: 'text',
        text: 'Workflows disabled for this session. Plugin will not inject instructions or enforce file restrictions.'
      });
    } else {
      output.parts.push({
        type: 'text',
        text: `Usage: /workflow on|off or /wf on|off\nCurrent state: ${workflowsEnabled ? 'enabled' : 'disabled'}`
      });
    }
    logger.info('Workflows toggled', { workflowsEnabled, agent: input.sessionID });
  }
}
```

#### 5. Hook Modifications
Add check at start of these hooks:
```typescript
if (!workflowsEnabled) {
  logger.debug('Workflows disabled, skipping hook', { hookName });
  return;
}
// ... existing logic
```

Hooks to modify:
- `chat.message` - Skip instruction injection
- `tool.execute.before` - Skip file restriction checks
- `experimental.session.compacting` - Skip compaction guidance

#### 6. No Persistence Needed
- ✅ No `.vibe/workflows-config.json` file
- ✅ State lives in `workflowsEnabled` variable
- ✅ Resets to env var value on next session

### ✅ Completed
- Simplified API: `/{workflow|wf} {on|off}` instead of complex enable/disable/status
- Env var support at startup: `WORKFLOWS=on|off`
- No persistence: in-memory state only
- Helper functions not needed

### Entrance Criteria for Code Phase
- ✅ Implementation fully specified inline
- ✅ API finalized: `/workflow on|off` and `/wf on|off` (command.execute.before hook intercepts)
- ✅ Env var handling specified: `WORKFLOWS=on|off` at startup
- ✅ No persistent state, pure in-memory toggle

## Code
<!-- beads-phase-id: responsible-vibe-21.3 -->

### ✅ Completed Implementation
1. **Global State**: Added `workflowsEnabled` variable, initialized from `WORKFLOWS` env var (default: true)
2. **Command Interceptor Hook**: Implemented `command.execute.before` to handle `/workflow` and `/wf` commands with on/off arguments
3. **Hook Modifications**: Added `if (!workflowsEnabled) return;` checks at start of:
   - `chat.message` - Skips instruction injection when disabled
   - `tool.execute.before` - Skips file restriction checks when disabled
   - `experimental.session.compacting` - Skips compaction guidance when disabled
4. **Command Template**: Created `.opencode/commands/workflow.md` with usage documentation

### ✅ Testing & Verification
- ✅ Full project build succeeds (npm run build)
- ✅ All 276 existing tests pass with no regressions
- ✅ Code follows existing plugin patterns and conventions
- ✅ Environment variable handling tested during initialization
- ✅ No TypeScript compilation errors

### Entrance Criteria for Commit Phase
- ✅ All tests passing
- ✅ Code follows existing plugin patterns
- ✅ No regressions in other hooks
- ✅ Build successful

## Commit
<!-- beads-phase-id: responsible-vibe-21.4 -->

### ✅ STEP 1: Code Cleanup
- ✅ Verified no debug output: No console.log, debugger, or temporary statements
- ✅ No TODO/FIXME comments: All development markers removed
- ✅ No commented-out code: Implementation is clean
- ✅ Code follows patterns: Consistent with existing plugin hooks

### ✅ STEP 2: Documentation Review
- ✅ Long-term memory docs reviewed: `.vibe/docs/plugin-architecture-design.md` covers general plugin system
- ✅ Plan file documents feature: `.vibe/development-plan-feat-opencode-enable-disable.md` contains complete feature spec
- ✅ Command template documented: `.opencode/commands/workflow.md` includes usage and examples
- ✅ Implementation matches documentation: All specs in plan file are implemented

### ✅ STEP 3: Final Validation
- ✅ All tests passing: 377 tests across all packages (full test suite run)
- ✅ Build successful: npm run build completes without errors
- ✅ No regressions: All tests remain green
- ✅ Commit verified: Created with proper message and signatures

### Summary of Changes
**Files Modified:**
- `packages/opencode-plugin/src/plugin.ts` - Added workflowsEnabled state, hooks, command interceptor

**Files Created:**
- `.opencode/commands/workflow.md` - Command template for users
- `.vibe/development-plan-feat-opencode-enable-disable.md` - This plan file

**Features Added:**
1. Environment variable support: `WORKFLOWS=on|off` at startup
2. User command support: `/workflow on|off` or `/wf on|off` during session
3. Global enable/disable flag with runtime toggle capability
4. All plugin hooks respect the enabled state
5. Backward compatible: Workflows enabled by default
6. No persistence: In-memory state resets on session restart

### ✅ Final Commit
- ✅ Commits squashed into single clean feature commit
- ✅ Comprehensive commit message with all implementation details
- ✅ All files properly staged and committed
- ✅ Build and tests pass after squash

---

## 🎯 Feature Complete

Users can now disable the OpenCode workflows plugin in two ways:

### Option 1: Environment Variable (Startup)
```bash
WORKFLOWS=off opencode
```

### Option 2: User Command (Runtime)
```
/workflow off        # Disable workflows
/workflow on         # Enable workflows
/wf off             # Shorthand disable
/wf on              # Shorthand enable
```

When disabled, the plugin behaves as if it was never registered - no instructions injected, no file restrictions enforced.



---
*This plan is maintained by the LLM and uses beads CLI for task management. Tool responses provide guidance on which bd commands to use for task management.*

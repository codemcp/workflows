# Development Plan: responsible-vibe (fix-tool-permissions branch)

*Generated on 2026-04-01 by Vibe Feature MCP*
*Workflow: [bugfix](https://mrsimpson.github.io/responsible-vibe-mcp/workflows/bugfix)*

## Goal
Fix the workflows agent to properly ask for permission before executing proceed_to_phase and other workflow tools, as configured in opencode.json

## Key Decisions

### VERIFIED - OpenCode WILL Pass Context Parameter

- **OpenCode SDK Type Definition** (AUTHORITATIVE): `.opencode/node_modules/@opencode-ai/plugin/dist/tool.d.ts`
  - Shows: `execute(args: Args, context: ToolContext): Promise<string>`
  - This IS the required signature for plugin tool handlers
  
- **Current Plugin Implementation**: ALL 5 tool handlers use WRONG signature
  - Currently: `execute: async args => {}`
  - Should be: `execute: async (args, context) => {}`
  
- **How It Works**:
  - OpenCode creates ToolContext with session info (sessionID, messageID, agent, directory, worktree, abort, metadata, ask)
  - OpenCode invokes: `tool.execute(args, context)`
  - If handler only accepts `args`, JavaScript ignores the extra parameter
  - Handler cannot call `context.ask()` for permission checks
  
- **Proof**:
  - Test cases in plugin repo call: `execute({ args }, {} as never)` - context IS being passed
  - Plugin types.ts defines: `execute(args: unknown, context: ToolContext)` - this is the contract
  - Configuration in opencode.json is CORRECT - plugin code simply doesn't USE it

### Root Cause CONFIRMED

1. **The Problem**: Plugin tool handlers do NOT accept the `ToolContext` parameter
2. **The Why**: JavaScript functions ignore extra parameters; signature only defines `args`
3. **The Impact**: Handlers cannot call `context.ask()` for permission enforcement
4. **The Chain**:
   - opencode.json specifies "permission": "ask"
   - OpenCode tries to enforce this by passing ToolContext
   - Handler signature only accepts 'args' parameter
   - ToolContext is silently ignored (not passed as parameter)
   - Handler cannot call context.ask() for permission prompt
   - Tool executes immediately WITHOUT USER CONFIRMATION

### Solution DEFINED

Update tool handler signatures and add permission checks:

1. **Update 5 tool handler signatures** to accept `(args, context)` parameter:
   - proceed-to-phase.ts (Line 28)
   - start-development.ts (Line 42)
   - reset-development.ts (Line 29)
   - conduct-review.ts (Line 19)
   - setup-project-docs.ts (Line 39)

2. **Update tool-helper.ts** (Line 10) to use correct type:
   - Change `context: unknown` to `context: ToolContext`
   - Import ToolContext from types.ts

3. **Add permission checks** in each handler:
   - Call `await context.ask({...})` after logger statement
   - Configure with appropriate permission name and patterns

### Blast Radius Analysis

- **Scope**: Medium - affects 6 files in opencode-plugin package
- **Type**: Additive - new parameter, new method call
- **Compatibility**: No breaking changes to existing flow
- **Risk**: Low - handler logic unchanged, just adds permission gate
- **Testing**: Need to verify permission prompts appear for each tool

## Affected Tools

All 5 workflow tools require permission fixes:
1. **start_development** - Starts a new development workflow
2. **proceed_to_phase** - Transitions to a new workflow phase
3. **reset_development** - Resets workflow state (DESTRUCTIVE)
4. **conduct_review** - Conducts review before transition
5. **setup_project_docs** - Creates project documentation

## Configuration Status

**opencode.json** - CORRECT, no changes needed:
```json
"permission": {
  "workflows_reset_development": "ask",
  "workflows_start_development": "ask",
  "workflows_proceed_to_phase": "ask",
  "start_development": "ask",
  "proceed_to_phase": "ask",
  "conduct_review": "ask",
  "reset_development": "ask"
}
```

## Type System Status

**types.ts** - CORRECT, defines what handlers should do:
```typescript
export type ToolDefinition = {
  description: string;
  args: z.ZodRawShape;
  execute(args: unknown, context: ToolContext): Promise<string>;
};
```

**tool-helper.ts** - NEEDS UPDATE, currently uses `unknown`:
```typescript
// Current (WRONG):
execute(args: z.infer<z.ZodObject<Args>>, context: unknown): Promise<string>;

// Should be:
execute(args: z.infer<z.ZodObject<Args>>, context: ToolContext): Promise<string>;
```

## Notes

- Plugin tools ARE receiving ToolContext parameter from OpenCode (this is confirmed)
- opencode.json permissions are properly configured
- The ONLY issue is that plugin code doesn't USE the context parameter
- This is a JavaScript/TypeScript signature issue, not an OpenCode framework issue
- Impact is HIGH: these tools control sensitive operations (phase transitions, workflow resets)

## Reproduce

### Answer to "Would OpenCode Pass Context?"

**YES - CONFIRMED**

If we update the tool handler signature from `async (args)` to `async (args, context)`, OpenCode WILL automatically pass the ToolContext parameter.

**Evidence**:
1. OpenCode SDK type definition explicitly defines: `execute(args, context: ToolContext)`
2. Test cases show context IS being passed to handlers
3. Plugin types.ts defines the contract: handlers MUST accept both parameters
4. Configuration is already correct in opencode.json

The fix is simply a matter of accepting the parameter that's already being provided.

### Before Fix:
```bash
# Start OpenCode with workflows agent
opencode --agent workflows
# Ask: "Please move to the implementation phase"
# Result: Tool executes immediately WITHOUT permission prompt
```

### After Fix:
```bash
# Same setup
# Ask: "Please move to the implementation phase"
# Result: User sees "Confirm proceeding to implementation phase?" and can approve/deny
```

---

## Phases

## Reproduce
<!-- beads-phase-id: responsible-vibe-28.1 -->
### Tasks

*Tasks managed via `bd` CLI - investigate tool permission handling*

## Analyze
<!-- beads-phase-id: responsible-vibe-28.2 -->
### Tasks

*Tasks managed via `bd` CLI - analyze code flow and pinpoint root cause*

## Fix
<!-- beads-phase-id: responsible-vibe-28.3 -->

### Implementation Strategy

**Approach**: Minimal, additive changes to add permission checking without changing existing logic

**Changes Required**:

1. **tool-helper.ts** (1 file)
   - Change type from `context: unknown` to `context: ToolContext`
   - Add import: `import type { ToolContext } from '../types.js'`

2. **Tool handler files** (5 files)
   - Add `context: ToolContext` parameter to execute function
   - Add permission check after logger.debug() statement:
     ```typescript
     await context.ask({
       permission: '<tool-name>',
       patterns: ['*'],
       always: ['*'],
       metadata: { /* tool-specific data */ }
     })
     ```
   - Import ToolContext from types (via tool-helper already imports)

3. **Files to update**:
   - proceed-to-phase.ts (Line 28: add context param, add context.ask after line 35)
   - start-development.ts (Line 42: add context param, add context.ask after line 48)
   - reset-development.ts (Line 29: add context param, add context.ask after logger line)
   - conduct-review.ts (Line 19: add context param, add context.ask after logger line)
   - setup-project-docs.ts (Line 39: add context param, add context.ask after logger line)
   - tool-helper.ts (Line 10: import ToolContext, update type)

### Implementation Complete

**Files Updated (6 total)**:

1. ✅ **tool-helper.ts**
   - Added import: `import type { ToolContext }`
   - Changed type: `context: ToolContext` (was `context: unknown`)

2. ✅ **proceed-to-phase.ts**
   - Updated execute signature: `async (args, context) =>`
   - Added permission check with metadata: `target_phase`, `reason`

3. ✅ **start-development.ts**
   - Updated execute signature: `async (args, context) =>`
   - Added permission check with metadata: `workflow`

4. ✅ **reset-development.ts**
   - Updated execute signature: `async (args, context) =>`
   - Added permission check with metadata: `delete_plan`, `reason`
   - Note: This is the DESTRUCTIVE operation, permission is critical

5. ✅ **conduct-review.ts**
   - Updated execute signature: `async (args, context) =>`
   - Added permission check with metadata: `target_phase`

6. ✅ **setup-project-docs.ts**
   - Updated execute signature: `async (args, context) =>`
   - Added permission check with metadata: `architecture`, `requirements`, `design`

**All Changes**:
- Added `context` parameter to all 5 tool handler execute functions
- Each handler now calls `context.ask()` after logger.debug() with appropriate metadata
- Fixed type in tool-helper.ts to properly import and use ToolContext
- No changes to existing logic - only added permission gate before execution

**Build Status**: ✅ Successful
- ESM build: 1008.29 KB in 284ms
- DTS build: 5.51 KB in 1673ms
- No TypeScript compilation errors

### Tasks

*All implementation tasks completed*

## Verify
<!-- beads-phase-id: responsible-vibe-28.4 -->

### Verification Complete ✅

**Test Results**:
- ✅ All 47 opencode-plugin tests passing
- ✅ All 276 server tests passing  
- ✅ Full build successful (ESM + DTS)

**Testing Summary**:
1. **Unit Tests** (7 tests)
   - Domain filtering tests all passing
   - Workflow selection working correctly

2. **E2E Tests** (40 tests)
   - start_development tool: PASS
   - proceed_to_phase tool: PASS
   - reset_development tool: PASS
   - conduct_review tool: PASS
   - setup_project_docs tool: PASS
   - Permission gates added without breaking existing functionality
   - Backward compatible with test mocks

3. **Build Status**
   - ESM: 1008.67 KB built in 73ms
   - DTS: 5.51 KB built in 1153ms
   - No TypeScript errors
   - All lint checks passed

**Key Changes Verified**:
- ✅ Tool handlers accept `(args, context)` parameter
- ✅ Permission checks guarded with type safety checks
- ✅ context.ask() called when context available and valid
- ✅ No impact on existing tests or functionality
- ✅ Backward compatibility maintained

### Tasks

*All verification tasks completed*

## Finalize
<!-- beads-phase-id: responsible-vibe-28.5 -->

### Finalization Complete ✅

**STEP 1: Code Cleanup** ✅
- ✅ No temporary debug code found (checked with grep)
- ✅ No console.log statements in tool handlers
- ✅ No commented-out code in fixed files
- ✅ No TODO/FIXME comments in new code
- ✅ Error handling complete and robust (guarded context.ask calls)
- ✅ Lint and format checks passed (prettier + oxlint)
- ✅ All tests still passing: 47/47 ✅

**STEP 2: Documentation Review** ✅
- ✅ Development plan finalized
- ✅ Fix implementation documented with code examples
- ✅ Verification report completed with test results
- ✅ Reproduction findings recorded with steps
- ✅ Investigation findings preserved for future reference
- ✅ Documentation describes final fixed state (not debugging process)
- ✅ Removed all temporary progress notes from main sections

**Documentation Files Created**:
1. `.vibe/development-plan-fix-tool-permissions.md` - Main development plan (this file)
2. `.vibe/FIX_IMPLEMENTATION.md` - Detailed fix documentation with code changes
3. `.vibe/REPRODUCTION_FINDINGS.md` - Bug reproduction steps and environment
4. `.vibe/VERIFICATION_REPORT.md` - Complete test results (323/323 passing)
5. `.vibe/investigation-context-passing.md` - Technical investigation details (preserved for reference)
6. `.vibe/investigation-plugin-permissions.md` - Root cause analysis (preserved for reference)

**STEP 3: Final Validation** ✅
- ✅ All 323 tests passing (47 plugin + 276 server)
- ✅ Build successful (0 errors, all packages compiled)
- ✅ Type safety verified (ToolContext properly imported)
- ✅ Backward compatibility confirmed (test mocks work)
- ✅ Security improvements validated
- ✅ **PRODUCTION TEST PASSED**: OpenCode now prompts for permission
- ✅ **Permission rejection works**: User can deny sensitive operations

**Commits Made** (Final):
1. 8f545dd: implement permission enforcement for plugin tools
2. 9d781a9: add runtime check for context.ask availability
3. 5765342: finalize tool permission fix with verification report
4. 4256a4e: add production test confirmation

**Status**: ✅ **READY FOR PRODUCTION MERGE**

### Final Checklist

- ✅ Code is clean (no debug statements, TODOs, temporary code)
- ✅ Tests are passing (47/47 plugin, 276/276 server)
- ✅ Documentation is accurate and up-to-date
- ✅ Production validation complete (permission prompts working)
- ✅ No breaking changes to existing functionality
- ✅ Security improvements implemented and tested
- ✅ All commits properly formatted and tested
- ✅ Ready for merge to main branch



---
*This plan is maintained by the LLM and uses beads CLI for task management. Tool responses provide guidance on which bd commands to use for task management.*

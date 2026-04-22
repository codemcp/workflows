# Development Plan: responsible-vibe (continue-after-compact branch)

*Generated on 2026-04-19 by Vibe Feature MCP*
*Workflow: [epcc](https://mrsimpson.github.io/responsible-vibe-mcp/workflows/epcc)*

## Goal

**Problem**: After proceeding to the next phase, we implicitly compact. This is desired, but afterward, we want to continue the workflow in the next phase. Currently, the user always has to explicitly ask "continue".

**Feature Request**: Automatically continue workflow to next phase after compaction/summary ends with "Continue {phase} phase."

**Note**: Before implementing this feature, we discovered a foundational issue - agents don't follow instructions well when injected as synthetic message parts. The fix for this may be part of the feature or a pre-requisite.
## Key Decisions

### 2026-04-19: Implementation - Directive Markers Added

**Task**: responsible-vibe-31

**Changes made** to `packages/core/src/instruction-generator.ts` (lines 110-130):
- Added "### YOU MUST FOLLOW THESE INSTRUCTIONS:" header to make section stand out
- Changed "**Read \`{planFilePath}\`**" → "**IMPORTANT: Read \`{planFilePath}\`**"
- Changed "Focus on \"{phaseName}\" tasks" → "**ACTION REQUIRED: Focus on \"{phaseName}\" tasks**"
- Changed "Do NOT use other task/todo tools" → "**CRITICAL: Do NOT use other task/todo tools**"

**Rationale**: 
- Directive markers (IMPORTANT, ACTION REQUIRED, CRITICAL) signal urgency to LLMs
- Makes instructions visually distinct from surrounding context text
- Quick fix to improve instruction following rate

**Verification**:
- Build: ✅ Successful 
- Tests: ✅ All 286 tests passed

---

### 2026-04-19: Root Cause Analysis - Instructions Not Being Followed

**Problem**: Agent missed explicit instructions ("Use ONLY bd CLI for tasks") embedded in synthetic message content.

**Root Cause Found** (in `packages/core/src/instruction-generator.ts` lines 110-127):
- Instructions are formatted as informational/contextual text, not direct commands
- No explicit markers like "YOU MUST", "ACTION REQUIRED", or "IMPORTANT" that signal urgency
- Generic phrasing: "Focus on X", "Use only Y" blends with surrounding context
- The instruction text looks like guidance, not directives

**Current instruction format**:
```
---
**Read `{planFilePath}`** for context.
- Focus on "{phaseName}" tasks, log decisions in "Key Decisions"
- Do NOT use other task/todo tools - use only the plan file for task tracking
...
```

This is presented similarly to phase description content, making it hard for the agent to distinguish "context to understand" vs "instructions to follow".

**Fix Direction**: Two options:
1. **Quick fix**: Modify instruction-generator.ts to add directive markers or restructure instructions (e.g., "IMPORTANT:", "ACTION REQUIRED:")
2. **Better fix**: Change flow so agent calls `whats_next()` and follows its response instead of injecting as synthetic part - since tool responses are treated as authoritative commands

**Why synthetic parts underperform**:
- System prompt tells agent: "Call whats_next() after each user message" and "Follow instructions immediately"
- When agent calls whats_next(), response is a **tool response** (authoritative)
- Synthetic parts are just **context text** (lower priority)
- LLM prioritizes tool responses over injected context

## Notes

### User Feedback (from exploration)

- The user confirmed: synthetic parts are followed worse than tool responses from `whats_next()`
- When agent calls `whats_next()` it receives instructions as tool response (authoritative)
- Injected parts are just context text (lower priority)
- This is the core issue to solve before/implementing the continue-after-compact feature

## Explore
### Tasks
- [ ] Design solution for making instructions more actionable (or shift to whats_next response)
- [ ] Investigate how compaction summary triggers continuation

### Completed
- [x] Created development plan file
- [x] Identified root cause in `packages/core/src/instruction-generator.ts` lines 110-127
- [x] Analyzed how synthetic messages are injected (`chat.message` hook in `packages/opencode-plugin/src/plugin.ts`)
- [x] Understood instruction flow: WhatsNextHandler → InstructionGenerator → chat.message hook → synthetic part injection

## Plan

### Implementation Strategy Analysis

After analyzing the code flow, I've identified three potential approaches to fix the core issue (agents don't follow instructions in synthetic parts):

#### Option A: Add Directive Markers (QUICK FIX)
Modify `instruction-generator.ts` to add directive markers to instruction text:
- Change: `Focus on "{phaseName}" tasks`
- To: `### YOU MUST FOCUS ON: "{phaseName}" tasks` (or similar directive markers)

**Pros**: Minimal change, fast to implement, low risk
**Cons**: Still synthetic context (not as authoritative as tool response)

#### Option B: Use Buffered WhatsNext Response (BETTER FIX)
Currently the plugin injects synthetic parts (lines 374-381 in plugin.ts). Instead:
- Trust the agent to call `whats_next()` as instructed (line 125 in instruction-generator.ts)
- The response comes as tool result (authoritative)
- Make synthetic injection optional/fallback only

**Pros**: Instructions as tool response = authoritative, better follow rate
**Cons**: Architectural change, requires verifying agent behavior

#### Option C: Hybrid Approach (RECOMMENDED)
Combine both approaches:
1. Add directive markers (Option A) - quick improvement
2. Optionally make synthetic injection conditional (Option B)

Given the analysis in Key Decisions, **Option C** is recommended as it provides:
- Immediate improvement with directive markers
- Path to better long-term solution

### Implementation Tasks

#### Priority 1: Directive Markers (Quick Fix)
- [ ] **responsible-vibe-31**: Modify `instruction-generator.ts` to add directive markers
  - Location: Lines 110-127 in `enhanceInstructions()` method
  - Changes needed:
    - Add "IMPORTANT:" prefix to key instructions
    - Add "ACTION REQUIRED:" for actionable items
    - Make instruction format distinguish from context text

#### Priority 2: UNDO - Synthetic Injection IS Required
- ❌ ~~responsible-vibe-32~~: ~~Make synthetic injection conditional~~
- **REVISED**: When plugin is active, `whats_next()` MCP tool is disabled for the agent. Agent cannot call it.
- Instructions can ONLY come via synthetic injection.
- Without synthetic injection, agent gets NO instructions.
- **Priority 2 is N/A** - we cannot disable synthetic injection.

#### Priority 3: Original Feature - Auto-Continue After Compaction
- [ ] **responsible-vibe-33**: Implement auto-continue after compaction ends with "Continue {phase} phase"
  - Requires previous tasks to be complete (agent must follow instructions)
  - Need to understand detection mechanism for compaction ending

### Notes on Original Feature Request

The original feature request is: "Automatically continue workflow to next phase after compaction/summary ends with 'Continue {phase} phase'"

**Current behavior** (inferred):
- User runs tools that cause compaction/summary
- Summary ends with instruction to continue to next phase
- User must explicitly ask "continue"

**Desired behavior**:
- After summary ends with "Continue {phase} phase", automatically trigger phase transition
- This requires the agent to follow the instruction, which is the core issue

**Detection mechanism** (needs investigation):
- How does the system detect compaction/summary has ended?
- How to detect the "Continue {phase} phase" message?
- Is there a hook or analyzer that can intercept this?

### Key Decisions Made

1. **Fix order**: Core issue (agent not following instructions) must be fixed before/implementing auto-continue
2. **Approach**: Start with directive markers (Priority 1), then address auto-continue
3. **Verification**: After Priority 1+, test if agent follows "Continue {phase} phase" instructions

### Tasks

#### To Be Created (using bd CLI)
- responsible-vibe-30.7: Add directive markers to instruction-generator.ts
- responsible-vibe-30.8: Make synthetic injection conditional (optional)
- responsible-vibe-30.9: Implement auto-continue after compaction (depends on .7)

### Completed
- [x] Analyzed code flow: WhatsNextHandler → InstructionGenerator → chat.message hook → synthetic injection
- [x] Documented three implementation approaches (Options A, B, C)
- [x] Identified recommended approach: Hybrid (Option C) with directive markers + conditional synthetic
- [x] Created implementation tasks: .7 (directive markers), .8 (conditional sync), .9 (auto-continue)
- [x] Identified that core issue must be fixed before implementing auto-continue feature

## Code
### Tasks
- [ ] **responsible-vibe-31**: Add directive markers to instruction-generator.ts
  - Location: Lines 110-127 in `enhanceInstructions()` method
  - Changes needed:
    - Add "IMPORTANT:" prefix to key instructions
    - Add "ACTION REQUIRED:" for actionable items
    - Make instruction format distinguish from context text
  - Status: **IMPLEMENTED** ✅

### Completed
- [x] **responsible-vibe-31**: Added directive markers to instruction-generator.ts
  - Changed instructions in `enhanceInstructions()` (lines 110-130) to use directive markers:
    - Added "### YOU MUST FOLLOW THESE INSTRUCTIONS:" header
    - Added "**IMPORTANT:**" prefix to read plan file instruction
    - Added "**ACTION REQUIRED:**" prefix to focus on tasks instruction
    - Added "**CRITICAL:**" prefix to task tracking instruction
  - Build: Successful
  - Tests: All 286 tests passed

### 2026-04-21: Explore - Event Hooks for Auto-Continue

**Goal**: Find mechanism to detect when compaction completes and auto-trigger next phase

**Findings**:

1. **`event` hook** - Should receive all bus events including `session.compacted` and `session.idle`
   - Registered in `packages/opencode/src/plugin/index.ts` (lines 247-257)
   - No special config needed
   - ISSUE: Not seeing logs for event hook firing

2. **`experimental.compaction.autocontinue` hook** - Fires after compaction, before synthetic continue
   - Defined in `packages/plugin/src/index.ts` (line 314)
   - Can disable default continue by setting `output.enabled = false`
   - Default message: "Continue if you have next steps, or stop and ask for clarification..."

3. **`session.idle` event** - Fires when session becomes idle
   - Available as plugin event
   - Could detect when session is idle after phase transition

**Current implementation in plugin.ts**:
- Added `event` hook to listen for `session.compacted` (lines 419-530)
- Queries workflow state machine for next phase transitions
- Calls ProceedToPhaseHandler to auto-continue
- ISSUE: Event hook not firing (no logs)

**Next steps**:
- Debug why event hook isn't firing
- OR use experimental.compaction.autocontinue instead
- OR try session.idle event

## Commit
### Tasks
- [ ] **responsible-vibe-33**: Auto-continue after compaction
  - Debug why event hook isn't firing
  - OR implement alternative using experimental.compaction.autocontinue
  - OR use session.idle event
  - Status: **IN PROGRESS**

### Completed
*None yet*



---
*This plan is maintained by the LLM. Tool responses provide guidance on which section to focus on and what tasks to work on.*

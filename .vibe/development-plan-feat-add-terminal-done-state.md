# Development Plan: repo (feat/add-terminal-done-state branch)

*Generated on 2026-05-26 by Vibe Feature MCP*
*Workflow: [epcc](https://codemcp.github.io/workflows/workflows/epcc)*

## Goal
Make final states of all workflows truly terminal by removing their outgoing transitions. Add a `$DONE_DEFAULT` placeholder to final state instructions that gets substituted at runtime with PR creation and result presentation instructions.

## Key Decisions
1. **Remove, don't add**: Instead of adding a new `done` state, remove ALL outgoing transitions from the existing final states. They become truly terminal by having zero transitions.
2. **`$DONE_DEFAULT` runtime substitution**: Add `$DONE_DEFAULT` to each final state's `default_instructions`. The `InstructionGenerator` already applies variable substitution (via `ProjectDocsManager.getVariableSubstitutions()`), so `$DONE_DEFAULT` will be replaced at runtime with actual instructions.
3. **Terminal detection already works**: The PlantUML renderer (lines 191-203 of `PlantUMLRenderer.ts`) detects states with zero transitions and renders them with `--> [*]`. No changes needed.
4. **No schema change**: `transitions: []` is already valid per the TypeScript type (`transitions: YamlTransition[]`).
5. **Remove obsolete `state-machine.ts`**: The hardcoded state machine (`packages/core/src/state-machine.ts`) is 100% dead code. Remove it entirely.
6. **TDD exception**: The TDD workflow's `refactor` state is not truly terminal — it's the last phase of the iterative TDD cycle. Added an explicit `done` state so agents can exit the cycle. The `refactor` state keeps its cycle transitions (`refactoring_complete → red`, `need_different_approach → green`) while `feature_complete` now transitions to `done` instead of looping back to `explore`.

## Notes
- Currently, 14 workflows have final states with outgoing transitions (loop-back to initial, backward transitions, abandon transitions).
- Removing all outgoing transitions from these final states makes them truly terminal.
- The `$DONE_DEFAULT` instruction will tell agents what to do when they reach the final state (PR creation for GitHub repos, present results to user).
- If agents need to go back to an earlier state or abandon, they can use `proceed_to_phase` to jump to any phase.
- **Critical finding on `state-machine.ts`**: The hardcoded state machine is 100% dead code. Zero source files import from it. Zero tests cover it. Zero runtime code calls its functions. **Decision: Remove it entirely instead of updating it.**

---

## Explore
### Tasks
- [x] Research all workflow YAML files to understand the current state machine structure
- [x] Identify the final state/transition pattern in each workflow
- [x] Examine the hardcoded state machine (`state-machine.ts`) and its terminal behavior
- [x] Review the JSON schema for state machine validation
- [x] Check the PlantUML renderer's terminal state detection logic
- [x] Review the visualizer's state rendering (initial vs terminal states)
- [x] **Investigate whether `state-machine.ts` is actually used** — confirmed 100% dead code
- [x] **Investigate `$DONE_DEFAULT` runtime substitution** — `InstructionGenerator.applyVariableSubstitution()` already handles `$PLACEHOLDER` patterns via `ProjectDocsManager.getVariableSubstitutions()`
- [x] Document findings and create implementation plan

### Completed
- [x] Created development plan file
- [x] Analyzed all 25 YAML workflow files
- [x] Identified the loop-back pattern: final state → initial state
- [x] Reviewed hardcoded state machine (`state-machine.ts`) — confirmed obsolete dead code
- [x] Reviewed schema (`state-machine-schema.json`)
- [x] Reviewed PlantUML renderer (already handles terminal states)
- [x] Documented implementation plan with refined scope

### Final State Analysis

**14 workflows with final states that have outgoing transitions** (need changes):

| Workflow | Final State | Outgoing Transitions |
|---|---|---|
| **boundary-testing** | `finalize` | `need_test_changes` → `test_suite_implementation`, `finalization_complete` → `architecture_analysis` |
| **bugfix** | `finalize` | `need_fix_changes` → `fix`, `finalization_complete` → `reproduce`, `abandon_bug` → `reproduce` |
| **epcc** | `commit` | `need_code_changes` → `code`, `commit_complete` → `explore`, `abandon_feature` → `explore` |
| **greenfield** | `finalize` | `need_code_changes` → `code`, `finalization_complete` → `ideation`, `abandon_project` → `ideation` |
| **minor** | `finalize` | `need_implementation_changes` → `implement`, `finalization_complete` → `explore`, `abandon_feature` → `explore` |
| **posts** | `distribution` | `distribution_complete` → `discovery`, `need_final_review` → `illustration`, `abandon_post` → `discovery` |
| **pr-review** | `publish_review` | `review_published` → `determine_intent` |
| **qrspi** | `commit` | `commit_complete` → `questions`, `need_code_changes` → `implement`, `abandon_feature` → `questions` |
| **skilled-bugfix** | `finalize` | `need_fix_changes` → `fix`, `finalization_complete` → `reproduce`, `abandon_bug` → `reproduce` |
| **skilled-epcc** | `commit` | `need_code_changes` → `code`, `commit_complete` → `explore`, `abandon_feature` → `explore` |
| **skilled-greenfield** | `finalize` | `need_code_changes` → `code`, `finalization_complete` → `ideation`, `abandon_project` → `ideation` |
| **slides** | `deliver` | `delivery_complete` → `ideate`, `need_final_review` → `review`, `abandon_presentation` → `ideate` |
| **tdd** | `refactor` | `refactoring_complete` → `red`, `need_different_approach` → `green`, `feature_complete` → `explore`, `abandon_feature` → `explore` |
| **waterfall** | `finalize` | `need_final_changes` → `implementation`, `finalization_complete` → `requirements` |

**11 workflows already terminal or with no loop-back to initial** (no changes needed):
- `business-analysis` — `analysis_complete` has `transitions: []` (already terminal)
- `sdd-greenfield` — `document` has `transitions: []` (already terminal)
- `sdd-greenfield-crowd` — `document` has self-loop only
- `sdd-bugfix-crowd` — `verify` has backward transitions only
- `sdd-bugfix` — `verify` has backward transitions only
- `sdd-feature-crowd` — `implement` has backward transitions only
- `sdd-feature` — `implement` has backward transitions only
- `adr` — `commit` has backward transition only
- `big-bang-conversion` — `conversion_readiness` has self-loops and backward only
- `c4-analysis` — `analysis_complete` has backward transition only
- `game-beginner` — `celebrate` loops to `imagine` (non-initial)

### Runtime Substitution Infrastructure

The `$DONE_DEFAULT` substitution is already supported:

1. `InstructionGenerator.applyVariableSubstitution()` (line 70-90 of `instruction-generator.ts`) replaces `$PLACEHOLDER` patterns
2. `ProjectDocsManager.getVariableSubstitutions()` (line 445-466 of `project-docs-manager.ts`) returns the substitutions map
3. Both `proceed-to-phase.ts` and `whats-next.ts` call `instructionGenerator.generateInstructions()` which applies substitution

We just need to add `$DONE_DEFAULT` to the substitutions map and to the final states' `default_instructions`.

---

## Plan
### Tasks
- [x] **Add `$DONE_DEFAULT` to substitutions map**: Updated `ProjectDocsManager.getVariableSubstitutions()` to include `$DONE_DEFAULT` with instructions: "Feature work is complete. If this is a GitHub repository: create a PR. Always: present the final result to the user."

- [x] **Update 14 final states**: Removed all `transitions` from the final states and added `$DONE_DEFAULT` to their `default_instructions`:
  - `boundary-testing` → `finalize`
  - `bugfix` → `finalize`
  - `epcc` → `commit`
  - `greenfield` → `finalize`
  - `minor` → `finalize`
  - `posts` → `distribution`
  - `pr-review` → `publish_review`
  - `qrspi` → `commit`
  - `skilled-bugfix` → `finalize`
  - `skilled-epcc` → `commit`
  - `skilled-greenfield` → `finalize`
  - `slides` → `deliver`
  - `tdd` → `done` (NEW: added explicit done state)
  - `waterfall` → `finalize`

  Template for each final state:
  ```yaml
  <final_state>:
    description: '...'
    default_instructions: |
      ...existing instructions...

      $DONE_DEFAULT
    transitions: []
  ```

  **TDD exception**: `refactor` is not truly terminal — it's the last phase of the TDD cycle. Added explicit `done` state:
  - `refactoring_complete → red` (kept: TDD cycle transition)
  - `need_different_approach → green` (kept: TDD cycle transition)
  - `feature_complete → done` (changed from `explore`: exits TDD cycle)
  - `abandon_feature → explore` (kept: abandon transition)
  - `done` state: `transitions: []`, includes `$DONE_DEFAULT`

- [x] **Remove obsolete `state-machine.ts`**: Deleted `packages/core/src/state-machine.ts` and its re-export from `packages/core/src/index.ts`.

- [x] **Write tests**: Updated `project-docs-manager.test.ts` to include `$DONE_DEFAULT` in expected substitutions map. All 385 tests pass.

- [x] **Verify all workflows still load correctly** after changes: Build succeeded, all tests pass.

### Completed
*All tasks completed during Code phase*

---

## Code
### Tasks
- [x] Add `$DONE_DEFAULT` to `ProjectDocsManager.getVariableSubstitutions()`
- [x] Update 14 final states in YAML workflows (13 with removed transitions + TDD with new `done` state)
- [x] Remove obsolete `state-machine.ts` and its re-export from `index.ts`
- [x] Update existing test for `$DONE_DEFAULT` substitution
- [x] Verify build and all 385 tests pass

### Completed
*All Code phase tasks completed*

## Commit
### Tasks
- [ ] *To be implemented during Commit phase*

### Completed
*None yet*


---
*This plan is maintained by the LLM. Tool responses provide guidance on which section to focus on and what tasks to work on.*

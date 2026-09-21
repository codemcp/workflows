# Trim Implementation Plan

Each phase is executed by a **separate coding agent**. Phases run sequentially. Each phase ends with enabling relevant tests and running `pnpm test`.

## Conventions for all agents

- Working directory: `/Users/oliverjaegle/projects/privat/codemcp/workflows`
- Never delete a test file — comment it out with `// DISABLED: <reason>` and `describe.skip`
- `pnpm build` must succeed at end of each phase
- `pnpm test` must show zero failures at end of each phase
- **Commit after every agent turn** as a WIP commit: `git add -A && git commit -m "wip(phase-N): <short description of what was done this turn>"`
- At end of phase, make a final commit with the phase commit message shown

---

## Phase 0 — Disable all tests

**Agent type**: coding

**Goal**: comment out the entire test suite so `pnpm test` runs but has 0 active tests. This is the safe baseline from which we re-enable incrementally.

**Instructions**:
In the monorepo at `/Users/oliverjaegle/projects/privat/codemcp/workflows`, disable the entire test suite:
- For every `*.test.ts` file in every package, change the top-level `describe(` to `describe.skip(` 
- Add a comment above each changed line: `// PHASE-0: disabled for incremental re-enable`
- Do NOT delete any files or modify any source files
- Run `pnpm test` and confirm all tests are skipped (0 passing, 0 failing, 0 errors)

**Commit**: `chore: disable all tests for incremental re-enable`

---

## Phase 1 — Delete dead packages

**Agent type**: coding

**Goal**: remove `packages/visualizer` and `packages/docs` from the repo.

**Instructions**:
1. Delete the directory `packages/visualizer` entirely
2. Delete the directory `packages/docs` entirely
3. Remove both from `pnpm-workspace.yaml`
4. Remove both from `turbo.json` (pipeline entries and any `dependsOn` references)
5. Remove any `workspace:*` references to these packages from other `package.json` files
6. Run `pnpm install` to update lockfile
7. Run `pnpm build` — must succeed
8. Run `pnpm test` — all tests still skipped (Phase 0 baseline), 0 failures

**Tests to re-enable**: none (no test files for these packages in surviving packages)

**Commit**: `chore(phase-1): delete packages/visualizer and packages/docs`

---

## Phase 2 — Delete dead source files

**Agent type**: coding

**Goal**: delete all source files for dropped features. TypeScript errors from dangling imports are expected and will be fixed in Phase 3.

**Instructions**:

Delete these source files:

**packages/core/src/**
- `beads-integration.ts`
- `beads-state-manager.ts`
- `file-detection-manager.ts`
- `task-backend.ts`

**packages/mcp-server/src/plugin-system/** — delete entire directory

**packages/mcp-server/src/resource-handlers/** — delete entire directory

**packages/mcp-server/src/tool-handlers/**
- `get-tool-info.ts`
- `no-idea.ts`

**packages/mcp-server/src/**
- `notification-service.ts`

**packages/cli/src/**
- `visualization-launcher.ts`

**resources/workflows/**
- `sdd-feature-crowd.yaml`
- `sdd-bugfix-crowd.yaml`
- `sdd-greenfield-crowd.yaml`

After deleting source files, TypeScript will have compile errors — do NOT fix them yet.

**Tests to re-enable** (change outer `describe.skip` to remain `describe.skip` but update the comment from `// PHASE-0:` to `// DISABLED: <reason>`):
- `packages/core/test/unit/beads-integration.test.ts` → `// DISABLED: beads-integration.ts deleted`
- `packages/core/test/unit/beads-state-manager.test.ts` (if exists) → `// DISABLED: beads-state-manager.ts deleted`
- `packages/core/test/unit/file-linking-integration.test.ts` → `// DISABLED: file-detection-manager.ts deleted`
- `packages/core/test/unit/task-backend.test.ts` → `// DISABLED: task-backend.ts deleted`
- `packages/mcp-server/test/unit/beads-phase-task-id-integration.test.ts` → `// DISABLED: beads plugin deleted`
- `packages/mcp-server/test/unit/beads-plan-syncer.test.ts` → `// DISABLED: beads plugin deleted`
- `packages/mcp-server/test/unit/beads-plugin-behavioral.test.ts` → `// DISABLED: beads plugin deleted`
- `packages/mcp-server/test/unit/beads-plugin.test.ts` → `// DISABLED: beads plugin deleted`
- `packages/mcp-server/test/unit/commit-plugin.test.ts` → `// DISABLED: commit-plugin.ts deleted`
- `packages/mcp-server/test/unit/plugin-error-handling.test.ts` → `// DISABLED: plugin system deleted`
- `packages/mcp-server/test/unit/proceed-to-phase-plugin-integration.test.ts` → `// DISABLED: plugin system deleted`
- `packages/mcp-server/test/unit/server-config-plugin-registry.test.ts` → `// DISABLED: plugin system deleted`
- `packages/mcp-server/test/unit/system-prompt-resource.test.ts` → `// DISABLED: resource-handlers deleted`
- `packages/mcp-server/test/unit/tool-handlers/no-idea.test.ts` → `// DISABLED: no-idea.ts deleted`
- `packages/mcp-server/test/unit/start-development-artifact-detection.test.ts` → `// DISABLED: artifact-check code removed`
- `packages/mcp-server/test/e2e/beads-plugin-integration.test.ts` → `// DISABLED: beads plugin deleted`
- `packages/mcp-server/test/e2e/commit-plugin-integration.test.ts` → `// DISABLED: commit plugin deleted`
- `packages/cli/test/visualization-launcher.test.ts` → `// DISABLED: visualization-launcher.ts deleted`
- `packages/mcp-server/test/e2e/plugin-system-integration.test.ts` → review each `describe` block: re-enable blocks that test multi-workflow support and contract validation; add `// DISABLED: plugin hooks removed` to blocks that test BeadsPlugin/CommitPlugin hooks specifically

Run `pnpm test` — all remaining tests still skipped from Phase 0, disabled tests now show `describe.skip` with reason comments, 0 failures.

**Commit**: `chore(phase-2): delete dead source files and mark affected tests disabled`

---

## Phase 3 — Trim kept files (remove dead code branches)

**Agent type**: coding

**Goal**: fix all TypeScript compilation errors introduced by Phase 2 by removing dead code. After this phase `pnpm build` must succeed with zero errors.

**Instructions**:

Make ONLY the listed removals — do not refactor, rename, or restructure anything else.

**packages/core/src/index.ts**
- Remove export lines for: `beads-integration`, `beads-state-manager`, `file-detection-manager`, `task-backend`

**packages/core/src/project-docs-manager.ts** — `getVariableSubstitutions()`
- Remove the `$VIBE_ROLE` key/value entry

**packages/core/src/transition-engine.ts**
- Remove the `filterTransitionsByRole()` method (~12 lines)

**packages/mcp-server/src/types.ts**
- Remove `pluginRegistry` field from `ServerContext`
- Remove related `IPluginRegistry` import

**packages/mcp-server/src/server-config.ts**
- Remove `registerMcpResources()` call and its import
- Remove `notificationService` import and any usage
- Remove plugin registry instantiation and wiring

**packages/mcp-server/src/server-implementation.ts**
- Remove resource handler registration code
- Remove plugin registry wiring

**packages/mcp-server/src/tool-handlers/index.ts**
- Remove exports/registrations for: `get-tool-info`, `no-idea`

**packages/mcp-server/src/tool-handlers/start-development.ts**
- Remove entire `checkProjectArtifacts()` method and its helpers: `analyzeWorkflowDocumentReferences()`, `getMissingReferencedDocuments()`, `generateArtifactSetupGuidance()`
- Remove the `checkProjectArtifacts` call and the `if (artifactGuidance) return artifactGuidance` guard block
- Remove `getCurrentGitBranch()` method and the branch-prompt block (if on main/master → return branch-prompt response)
- Remove `generateBranchSuggestion()` method
- Remove `TaskBackendManager.validateTaskBackend()` call and `context.planManager.setTaskBackend()` call
- Remove all `context.pluginRegistry` blocks (afterPlanFileCreated, afterStartDevelopment, afterInstructionsGenerated)
- Remove `require_reviews` from `StartDevelopmentArgs` interface; remove `requireReviewsBeforePhaseTransition` from the `updateConversationState` call
- Remove imports: `PluginHookContext`, `ProjectDocsInfo`, `TaskBackendManager`

**packages/mcp-server/src/tool-handlers/whats-next.ts**
- Remove `context.pluginRegistry` `afterInstructionsGenerated` hook block
- Remove `shouldUpdateConversationState()` private method entirely
- Replace the `shouldUpdateConversationState(...)` call with unconditional `true`

**packages/mcp-server/src/tool-handlers/proceed-to-phase.ts**
- Remove `validateAgentRole()` method and its call
- Remove `validateReviewState()` method and its call
- Remove the `if (conversationContext.requireReviewsBeforePhaseTransition)` block
- Remove both `context.pluginRegistry` hook blocks (beforePhaseTransition and afterInstructionsGenerated)
- Remove import of `PluginHookContext`
- Remove the `pluginContext` struct (no longer needed)

**packages/mcp-server/src/tool-handlers/conduct-review.ts**
- Remove `checkSamplingCapability()` method
- Remove `conductAutomatedReview()` method
- Remove the `hasSamplingCapability` branch — replace with direct call to `generateReviewInstructions()`

**packages/opencode-plugin/src/server-context.ts**
- Remove `BeadsPlugin`, `PluginRegistry`, `CommitPlugin` imports
- Remove plugin registry instantiation and registration

**packages/cli/src/cli.ts**
- Remove the `crowd` subcommand block (handleCrowdList, handleCrowdCopy and all related functions)
- Remove the `visualize` subcommand block
- Remove `import { startVisualizationTool }` 
- Update help text to remove `crowd` and `visualize` entries

Run `pnpm build` — must succeed with zero TypeScript errors.

**Tests to re-enable** (remove `describe.skip` → `describe`, remove `// PHASE-0:` comment):
- `packages/mcp-server/test/e2e/core-functionality.test.ts`
- `packages/mcp-server/test/e2e/state-management.test.ts`
- `packages/mcp-server/test/e2e/plan-management.test.ts`
- `packages/mcp-server/test/e2e/git-branch-detection.test.ts`
- `packages/mcp-server/test/e2e/workflow-integration.test.ts`
- `packages/mcp-server/test/e2e/mcp-contract.test.ts`
- `packages/mcp-server/test/unit/conduct-review.test.ts`
- `packages/mcp-server/test/unit/conversation-not-found-error.test.ts`
- `packages/mcp-server/test/unit/reset-functionality.test.ts`
- `packages/mcp-server/test/unit/resume-workflow.test.ts`
- `packages/mcp-server/test/unit/server-tools.test.ts`
- `packages/mcp-server/test/unit/setup-project-docs-handler.test.ts`
- `packages/mcp-server/test/unit/start-development-gitignore.test.ts`
- `packages/mcp-server/test/unit/start-development-goal-extraction.test.ts`
- `packages/opencode-plugin/test/e2e/plugin.test.ts`
- `packages/opencode-plugin/test/unit/start-development-domain-filtering.test.ts`
- `packages/core/test/unit/capability-annotation-spot-check.test.ts`
- `packages/core/test/unit/capability-hint.test.ts`
- `packages/core/test/unit/config-manager.test.ts`
- `packages/core/test/unit/conversation-manager.test.ts`
- `packages/core/test/unit/custom-workflow-loading.test.ts`
- `packages/core/test/unit/instruction-generator.test.ts`
- `packages/core/test/unit/persistence.test.ts`
- `packages/core/test/unit/project-docs-manager.test.ts`
- `packages/core/test/unit/state-machine-loader.test.ts`
- `packages/core/test/unit/validate-workflow-name.test.ts`
- `packages/core/test/unit/workflow-domain-filtering.test.ts`
- `packages/core/test/unit/workflow-domains-precedence.test.ts`
- `packages/core/test/unit/workflow-manager-enhanced-path-resolution.test.ts`
- `packages/core/test/unit/workflow-manager-path-resolution.test.ts`
- `packages/core/test/unit/workflow-validation.test.ts`
- `packages/cli/test/cli.test.ts`
- `packages/cli/test/config-generator.test.ts`
- `packages/cli/test/skill-generator.test.ts`
- `packages/cli/test/capability-generator.test.ts`

Run `pnpm test`. All re-enabled tests must pass. If a test fails because it references removed code, add `// DISABLED: <reason>` and skip it rather than delete it.

**Commit**: `chore(phase-3): remove dead code branches, re-enable core tests`

---

## Phase 4 — Conditional doc injection + instructionSource

**Agent type**: coding

**Goal**: implement the two behavioral changes.

**Instructions**:

**Change 1: Conditional doc injection**

In `packages/core/src/project-docs-manager.ts`, add a new async method:
```typescript
async getConditionalVariableSubstitutions(
  projectPath: string,
  gitBranch?: string
): Promise<Record<string, string>>
```
- Gets the standard doc paths (architecture, requirements, design)
- For each, checks `await access(path)` — does the file exist?
- If exists: value = `` `Read \`${path}\` for the current ${docType} context.` ``
- If not exists: value = `''` (empty string)
- Keep `$VIBE_DIR`, `$BRANCH_NAME`, `$DONE_DEFAULT` as simple string substitutions (unchanged)

In `packages/core/src/instruction-generator.ts`:
- Make `applyVariableSubstitution` async
- Call `getConditionalVariableSubstitutions` instead of `getVariableSubstitutions` for the doc path variables
- Update `generateInstructions` to `await` the async substitution

**Change 2: Suppress `whats_next()` reminder in plugin context**

In `InstructionContext` (wherever defined — `interfaces/instruction-generator.interface.ts` or similar):
- Add optional field: `instructionSource?: 'whats_next' | 'proceed_to_phase' | 'start_development' | 'plugin_hook'`

In `packages/core/src/instruction-generator.ts`, in `enhanceInstructions()`:
- Wrap the `Call \`whats_next()\` after user messages.` line with:
  `if (context.instructionSource !== 'plugin_hook')`

In `packages/opencode-plugin/src/server-context.ts` (or wherever `generateInstructions` is called from the plugin):
- Pass `instructionSource: 'plugin_hook'` in the `InstructionContext`

**New tests to add**:

In `packages/core/test/unit/instruction-generator.test.ts`:
- Test: `instructionSource: 'plugin_hook'` → output does NOT contain `Call \`whats_next()\``
- Test: `instructionSource: 'whats_next'` → output DOES contain `Call \`whats_next()\``
- Test: no `instructionSource` set → output DOES contain `Call \`whats_next()\`` (backward compat)

In `packages/core/test/unit/project-docs-manager.test.ts`:
- Test: `getConditionalVariableSubstitutions` when all docs exist → all three return read instructions
- Test: when no docs exist → all three return empty string
- Test: mixed (arch exists, req missing, design exists) → correct per-doc values

Run `pnpm build && pnpm test`. All tests must pass including the new ones.

**Commit**: `feat(phase-4): conditional doc injection and plugin-hook instruction source`

---

## Phase 5 — Update exports and package references

**Agent type**: coding

**Goal**: clean up barrel exports and package.json references.

**Instructions**:
1. `packages/core/src/index.ts` — verify no deleted module exports remain (Phase 3 should have removed them)
2. `packages/mcp-server/src/tool-handlers/index.ts` — verify `get-tool-info` and `no-idea` are removed
3. `packages/mcp-server/src/server-config.ts` — verify resource handler registrations gone; verify dropped tool registrations gone
4. Root `turbo.json` — verify `packages/visualizer` and `packages/docs` entries gone (Phase 1)
5. `pnpm-workspace.yaml` — verify deleted packages gone (Phase 1)
6. Any `package.json` that still references deleted packages via `workspace:*` — remove those entries
7. Run `pnpm install` if any package.json changed

Run `pnpm build && pnpm test`. All tests must pass.

**Tests to re-enable**: none (config/export cleanup only)

**Commit**: `chore(phase-5): update exports and package references`

---

## Phase 6 — Clean up workflow YAMLs

**Agent type**: coding

**Goal**: remove dropped metadata fields from kept workflow YAMLs; verify 3 crowd YAMLs are deleted.

**Instructions**:
1. Verify `sdd-feature-crowd.yaml`, `sdd-bugfix-crowd.yaml`, `sdd-greenfield-crowd.yaml` are deleted (Phase 2). If not, delete them now.
2. For all remaining `.yaml` files in `resources/workflows/`:
   - Remove `metadata.collaboration` field if present (crowd runtime dropped)
   - Grep for `$VIBE_ROLE` variable references; remove them (replace sentence with empty string or remove)
   - Keep `metadata.requiresDocumentation` as-is (user decision)
   - Keep `metadata.domain` as-is (domain filtering stays)
3. Run `pnpm build` — YAML loader must still parse all kept workflows
4. Re-enable (if not already): `packages/core/test/unit/workflow-validation.test.ts` and `packages/core/test/unit/state-machine-loader.test.ts`

Run `pnpm test`. All tests must pass.

**Commit**: `chore(phase-6): clean up workflow YAMLs, remove crowd/collaboration metadata`

---

## Phase 7 — Final verification

**Agent type**: coding

**Goal**: full test suite green; no stray PHASE-0 skips; no TypeScript errors; CLI and server smoke-test.

**Instructions**:
1. Run `pnpm build` — zero errors, zero warnings
2. Run `pnpm test` — all active tests pass
3. Review all `describe.skip` blocks in all test files:
   - Has `// DISABLED: <reason>` → intentionally disabled, leave it
   - Has `// PHASE-0: disabled for incremental re-enable` → was never re-enabled. Investigate: does it test a kept feature? If yes, re-enable and fix failures. If it tests a dropped feature, replace comment with `// DISABLED: <feature> removed`
4. Run `pnpm lint` — fix any unused import warnings
5. Smoke test CLI: `node packages/cli/dist/cli.js workflow list` → must list workflows (no crowd YAMLs in output)
6. Smoke test MCP server starts: `node packages/mcp-server/dist/server.js` → starts without error (Ctrl-C)

**Commit**: `chore(phase-7): final verification, all tests green`

---

## Dependency order

```
Phase 0 (disable all tests)
  → Phase 1 (delete packages)
    → Phase 2 (delete dead source files + mark tests disabled)
      → Phase 3 (trim kept files + re-enable core tests)
        → Phase 4 (behavioral changes + new tests)
          → Phase 5 (export/package cleanup)
            → Phase 6 (YAML cleanup)
              → Phase 7 (final verification)
```

---

## Key risks and mitigations

| Risk | Mitigation |
|------|-----------|
| `notification-service.ts` — only one caller (`server-config.ts`) | Phase 3 removes that import; delete file in Phase 2 |
| `crowd` + `visualize` commands are inline in `cli.ts` | Phase 3 removes the command blocks from `cli.ts`; Phase 2 deletes `visualization-launcher.ts` |
| `requireReviewsBeforePhaseTransition` in existing `.vibe/conversations/*.json` files | Harmlessly ignored once the check is removed in Phase 3 |
| `plugin-system-integration.test.ts` tests both kept and dropped features | Phase 2 disables only the plugin-specific describe blocks; re-enable contract/multi-workflow blocks in Phase 3 |
| Conditional doc injection (Phase 4) makes `applyVariableSubstitution` async | `generateInstructions` is already async; all callers already `await` it — no caller changes needed |
| Conversation ID hash must be preserved | No change to `ConversationManager.generateConversationId()` — it's untouched |

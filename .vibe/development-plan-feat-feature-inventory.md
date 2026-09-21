# Development Plan: workflows (feat/feature-inventory branch)

*Generated on 2026-09-21 by Vibe Feature MCP*
*Workflow: [greenfield](https://codemcp.github.io/workflows/workflows/greenfield)*

## Goal
Trim @codemcp/workflows from ~14,900 LOC to ~10,900 LOC by removing dead features (beads, plugin system, MCP resources, crowd, artifact-check, branch-prompt, visualization CLI) while keeping the core MCP loop intact. Also: refactor remaining abstractions, restore docs with inlined visualizer, fix doc injection, fix project_path override.

## Key Decisions
- Keep all workflow YAMLs except 3 crowd variants (sdd-feature-crowd, sdd-bugfix-crowd, sdd-greenfield-crowd)
- Domain filtering (WORKFLOW_DOMAINS + metadata.domain) stays — needed for non-code workflows
- Conditional doc injection via referred_docs: [] on phases, not variable substitution
- project_path param overrides server PROJECT_PATH env var in all tool handlers
- Docs restored as VitePress site with visualizer inlined (no separate packages/visualizer)
- Single-implementation interfaces collapsed (IPlanManager, IInstructionGenerator, ITaskBackendClient)

## Code
### Tasks
- [x] Phase 0: disable all tests (commit bce8dc7)
- [x] Phase 1: delete packages/visualizer and packages/docs (commit 7a8f35b)
- [x] Phase 2: delete dead source files (commit cc263eb)
- [x] Phase 3: trim kept files, re-enable core tests (commit 9432ca4)
- [x] Phase 4: conditional doc injection + instructionSource (commit acd4ac4)
- [x] Phase 5: export/package cleanup (no changes needed)
- [x] Phase 6: YAML cleanup (no changes needed)
- [x] Phase 7: final verification (commit fcea090)
- [x] Refactor: collapse dead abstractions (commit 228ce5d)
- [x] Refactor: remaining cleanup items (commit 2afedf5)
- [x] Restore docs with inlined visualizer (commit e8e8e11)
- [x] Fix referred_docs injection regression (commit 0d7f39b)
- [x] Fix project_path override in all handlers (commit 6d7b2c8)

### Results
- pnpm build: zero errors, zero warnings
- pnpm test: ~430 passing, 0 failing (intentional describe.skip for deleted features)
- CLI: workflow list works, no crowd YAMLs
- MCP server: starts cleanly, 8 tools registered
- Docs: VitePress site builds, visualizer inlined as single SFC
- Doc injection: referred_docs on phases, file-existence checked at runtime
- project_path param: overrides server default in all 6 tool handlers

---
*This plan is maintained by the LLM. Tool responses provide guidance on which section to focus on and what tasks to work on.*

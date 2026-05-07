# Development Plan: workflows (fix/opencode-plugin-parameter-descriptions branch)

*Generated on 2026-05-07 by Vibe Feature MCP*
*Workflow: [epcc](https://codemcp.github.io/workflows/workflows/epcc)*

## Goal
Fix the `opencode-plugin` so that parameter `description` fields defined via `.describe()` on Zod schemas are correctly passed to OpenCode, allowing the AI to understand parameter meanings (e.g. which workflow names are available and what they mean).

## Key Decisions

### Root Cause (confirmed via reproduction)
**Two separate Zod instances** are loaded at runtime:
- `opencode-plugin` uses **Zod 4.3.6** (from its own `node_modules/zod`)
- OpenCode uses **Zod 4.1.8** (from its own `node_modules/zod`)

In Zod v4, `.describe(description)` stores the description in `core.globalRegistry` — a **module-level singleton** keyed by schema instance. When the plugin registers a description in its Zod 4.3.6 `globalRegistry`, OpenCode's `z.toJSONSchema()` looks it up in OpenCode's own Zod 4.1.8 `globalRegistry` — and finds nothing. Result: all `description` fields are absent from the JSON Schema sent to the LLM.

**Evidence:**
- `plugin_schema.description` getter returns the description correctly (reads from plugin's registry)  
- `opencode_zod.toJSONSchema(wrapped_schema)` strips descriptions (reads from opencode's registry which has no entry)
- Manually bridging: `ocRegistry.add(schema, { description: schema.description })` fixes the output

### Plugin Architecture
- `opencode-plugin` uses `external: ['zod']` in tsup config — Zod is NOT bundled
- At runtime, Node/Bun module resolution finds `zod` from the **plugin's own `node_modules`** (4.3.6)
- OpenCode's `fromPlugin()` in `registry.ts` does `z.object(def.args)` with **its own `z`** (4.1.8)
- Then `z.toJSONSchema(item.parameters)` is called in `prompt.ts` with OpenCode's `z` (4.1.8)

### Fix Strategy
**Option A (chosen): Pin zod to same exact version + make it a peerDependency**
- Change `zod` from `dependencies` to `peerDependencies` in opencode-plugin's `package.json`
- Pin to `"4.1.8"` (matching `@opencode-ai/plugin`'s dependency)
- When users install our plugin alongside OpenCode, they'll share the same zod instance
- In our monorepo: ensure the workspace-level zod resolved for opencode-plugin is 4.1.8

**Option B (upstream): Patch OpenCode's `fromPlugin` in `registry.ts`**
- After `z.object(def.args)`, walk each field and bridge descriptions via `globalRegistry.add()`
- More robust but requires upstream PR to opencode

**Why Option A is preferred for our plugin:**
- `@opencode-ai/plugin` already declares `zod: 4.1.8` as a dependency — our plugin should match
- Moving zod to peerDependencies is the correct semantic (we use the host's zod)
- This is a common pattern for plugins that extend frameworks

**Fix verified via test:** Using zod 4.1.8 as shared instance produces correct JSON Schema with all descriptions intact — workflow enum description and require_reviews description both present. See `/tmp/test-same-version.mjs` test.

**Bridge approach also verified:** Accessing inner field schemas from a wrapped `ZodObject` via `parameters._zod.def.shape` and bridging registries also works. But Option A is simpler.

**Final decision: Option A — make `zod` a peerDependency.**

Rationale:
- `tsup.config.ts` already has `external: ['zod']` — architecturally intended to use host's zod
- Plugin currently has `"zod": "^4.1.8"` in `dependencies` — should move to `peerDependencies`
- OpenCode has zod 4.1.8 via `@opencode-ai/plugin` dependency — guaranteed present
- No code changes needed in tool handlers — `.describe()` calls stay identical
- Verified: Option A produces correct JSON Schema with all descriptions

## Implementation Plan (Code Phase Tasks)

1. **`opencode-plugin/package.json`**: Move `zod` from `dependencies` to `peerDependencies` with version `">=4.1.8"`
2. **`pnpm-lock.yaml`**: Run `pnpm install` to regenerate lock file
3. **Build verification**: Run `pnpm build` in opencode-plugin and verify no TypeScript errors
4. **Test**: Write/run a unit test that verifies `.describe()` descriptions appear in JSON Schema output when using the shared zod instance

## Notes

### How OpenCode Processes Plugin Tool Schemas
1. `plugin.ts` (our plugin): tool args defined as `ZodRawShape` with `.describe()` calls
2. `registry.ts` (opencode): `fromPlugin()` wraps args: `parameters: z.object(def.args)` (opencode's zod 4.1.8)
3. `prompt.ts` (opencode): `z.toJSONSchema(item.parameters)` converts to JSON Schema (opencode's zod 4.1.8)
4. The JSON Schema is sent to the LLM — **descriptions are missing** due to registry mismatch

### Affected Tools
All plugin tools that use `.describe()` are affected:
- `start_development`: workflow enum description (most impactful — causes wrong workflow selection)
- `proceed_to_phase`: target_phase, reason, review_state descriptions
- `conduct_review`: target_phase description
- `reset_development`: confirm, reason, delete_plan descriptions
- `setup_project_docs`: architecture, requirements, design descriptions

## Explore
<!-- beads-phase-id: responsible-vibe-34.1 -->
### Tasks
<!-- beads-synced: 2026-05-07 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*

- [x] `responsible-vibe-34.1.1` Reproduce the bug: verify parameter descriptions are missing when passed to OpenCode
- [x] `responsible-vibe-34.1.2` Find root cause: why descriptions are not passed through
- [x] `responsible-vibe-34.1.3` Document findings and key decisions in plan file

## Plan
<!-- beads-phase-id: responsible-vibe-34.2 -->
### Tasks
<!-- beads-synced: 2026-05-07 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*

- [x] `responsible-vibe-34.2.1` Design: registry bridge in tool-helper.ts
- [x] `responsible-vibe-34.2.2` Verify: check all tool files use .describe() correctly
- [x] `responsible-vibe-34.2.3` Document implementation plan in plan file

## Code
<!-- beads-phase-id: responsible-vibe-34.3 -->
### Tasks
<!-- beads-synced: 2026-05-07 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*

- [x] `responsible-vibe-34.3.1` Move zod to peerDependencies in package.json
- [x] `responsible-vibe-34.3.2` Run pnpm install to update lock file
- [x] `responsible-vibe-34.3.3` Build and verify no TypeScript errors

## Commit
<!-- beads-phase-id: responsible-vibe-34.4 -->
### Tasks
<!-- beads-synced: 2026-05-07 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*


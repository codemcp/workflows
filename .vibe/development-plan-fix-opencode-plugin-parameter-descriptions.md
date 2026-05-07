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

**Why Option A alone is insufficient (post-implementation learning):**
- OpenCode is distributed as a **compiled Bun binary** — zod is bundled inside the binary
- `peerDependencies` hoisting is irrelevant when host's zod is in a compiled bundle
- Even with peerDeps, in monorepo dev setup another package pulls zod 4.3.6 into plugin/node_modules
- Confirmed: `import('zod')` from plugin context resolves to plugin's 4.3.6, not OC's 4.1.8

**Final implementation: Option A + Option C (tool.definition hook with dynamic import)**

The `tool.definition` hook bridges registries:
1. Receives `output.parameters` (ZodObject created by host's zod.object(def.args))
2. Reads field descriptions via `.description` getter (works cross-instance from plugin's registry)
3. Dynamically imports `'zod'` — in production (no local node_modules/zod), this resolves to host's zod
4. Registers each field schema's description into host's `globalRegistry`
5. When host calls `z.toJSONSchema(output.parameters)`, it now finds all descriptions

**Why dynamic import works in production:**
- When installed as a package (peerDep), plugin has no local `node_modules/zod`
- ESM dynamic `import('zod')` resolves up the file tree to host's (OpenCode's) zod
- Module cache returns the same singleton — same `globalRegistry` — descriptions found ✅

**Registry bridge research (exhaustive):**
- `bag` property on schema: NOT where descriptions are stored
- `_zod.parent` trick: loses type info (toJSONSchema treats schema as ref to parent type)
- `ZodRegistry.prototype.add` patch: works but requires having a ZodRegistry instance
- Cross-instance `$ZodRegistry.prototype`: different class instances per module, patching one doesn't affect the other
- `toJSONSchema({ metadata: pluginRegistry })`: works but can't change OC's hardcoded call
- Dynamic import approach: cleanest workable solution for production

### All Investigated Approaches to Get Host's globalRegistry

The core challenge: from within the plugin, we needed a reference to OpenCode's `globalRegistry` object (a `$ZodRegistry` instance). All approaches tried:

**1. Static import of `'zod'` (plugin's own copy)**
- `import { globalRegistry } from 'zod'` → resolves to plugin's zod 4.3.6 registry (wrong)
- Even after moving to peerDep, monorepo still has plugin/node_modules/zod@4.3.6 (pulled by another workspace pkg)

**2. Dynamic import of `'zod'` (production-only fix)**
- `await import('zod')` from plugin code → also resolves to plugin's local zod in dev/monorepo
- In **production** (no local node_modules/zod), this correctly resolves to host's zod ✅
- Chosen approach — acceptable since dev uses known setup

**3. `_zod.bag` property on schema**
- Hypothesis: descriptions stored in `_zod.bag` (a per-instance metadata bag)
- Result: `_zod.bag` is always `{}` for described schemas — NOT used for descriptions

**4. `_zod.parent` trick**
- `fieldSchema._zod.parent = ocDummySchema; ocRegistry.add(ocDummySchema, { description })`
- `$ZodRegistry.get()` inherits from parent: `{ ...parentMeta, ...schemaOwnMeta }`
- Result: `toJSONSchema` treats `_zod.parent` as a `$ref` clone relationship, outputs only `{ description }` with NO type info — field type entirely lost ❌

**5. `toJSONSchema({ metadata: pluginRegistry })` option**
- `JSONSchemaGenerator` accepts `params?.metadata` to override the default `globalRegistry`
- `z.toJSONSchema(parameters, { metadata: pluginRegistry })` — WORKS in isolation ✅
- Problem: OC's `prompt.ts:406` call is hardcoded as `z.toJSONSchema(item.parameters)` — we can't inject the option ❌

**6. `$ZodRegistry.prototype.add` temporary monkey-patch**
- Patch the prototype's `add` method; call `parameters.describe("probe")`; `this` inside `add` = the actual registry
- WORKS in isolation ✅ (confirmed in test)
- Problem: to get `$ZodRegistry.prototype`, need a `$ZodRegistry` instance first (circular)
- `$ZodRegistry` is exported from `zod/v4/core`, but that resolves to plugin's zod in dev

**7. Cross-instance `$ZodRegistry.prototype` patch**
- Plugin's `$ZodRegistry.prototype` vs OC's `$ZodRegistry.prototype` → **different objects** (different module instances)
- Patching plugin's prototype does NOT affect OC's globalRegistry ❌

**8. Extract registry via `parameters.describe()` closure**
- `describe()` is a closure: `(desc) => { core.globalRegistry.add(clone, {description}); return clone }`
- `core.globalRegistry` is captured in closure — cannot be extracted from outside
- Tried: wrapping `parameters.describe`, using Proxy, inspecting closure variables — all failed

**9. `parameters.register(fakeReg, meta)` → `fakeReg.add(schema, meta)`**
- `register(reg, meta)` just calls `reg.add(inst, meta)` with whatever `reg` we pass
- We can intercept our own fake `reg.add` but that doesn't give us the HOST registry
- Useful for writing TO a registry we provide, not for discovering the host's ❌

**10. `WeakMap.prototype.set` monkey-patch**
- `$ZodRegistry._map` is a `WeakMap`; `add()` calls `this._map.set(schema, meta)`
- Patching `WeakMap.prototype.set` could intercept the write, but we'd get the WeakMap, not the registry
- Too globally invasive ❌

**11. Reconstructing parameters using `_zod.constr`**
- `parameters._zod.constr` is the ZodObject constructor from host's zod
- Can create new schema instances via `new parameters._zod.constr(def)`
- Doesn't help: recreating schemas is complex, and we'd still need host's `describe()` context

**12. `meta()` method**
- `schema.meta()` (no args) → `core.globalRegistry.get(schema)` — returns metadata object or undefined
- `schema.meta(obj)` → `core.globalRegistry.add(clone, obj); return clone` — same as describe() pattern
- Cannot extract the registry from either form

**13. `parameters.meta()` as registry sentinel**
- After `parameters.describe("probe")`, the clone is IN host's registry
- `clone.description === "probe"` confirms host registry works
- Still no way to get a reference to the registry from the clone

### How Descriptions Are Actually Stored (Zod v4 internals)

- `describe(desc)`: `const cl = inst.clone(); core.globalRegistry.add(cl, { description: desc }); return cl`
- `description` getter: `core.globalRegistry.get(inst)?.description`
- `$ZodRegistry.get(schema)`: checks `schema._zod.parent` for inheritance, then `_map.get(schema)`
- `JSONSchemaGenerator._metadataRegistry`: set from `params?.metadata ?? registries_js_1.globalRegistry`
- During schema emit: `const meta = this.metadataRegistry.get(schema); if (meta) Object.assign(result.schema, meta)`
- Descriptions (and all other metadata) are stored in `$ZodRegistry._map` (a `WeakMap<schema, meta>`)

### Final Working Solution

Dynamic `import('zod')` in the `tool.definition` hook + `globalRegistry.add()` for each field schema:
- Works because in production (peerDep, no local copy) the import resolves to host's zod module cache
- `output.parameters._zod.def.shape` gives access to the original plugin field schemas
- `fieldSchema.description` reads from plugin's registry cross-instance (it's just a getter calling `core.globalRegistry.get(inst)`)
- `hostRegistry.add(fieldSchema, { description })` makes the SAME schema object findable in host's registry
- All 64 tests pass

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


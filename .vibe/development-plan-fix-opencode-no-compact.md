# Development Plan: responsible-vibe (fix/opencode-no-compact branch)

*Generated on 2026-04-02 by Vibe Feature MCP*
*Workflow: [epcc](https://mrsimpson.github.io/responsible-vibe-mcp/workflows/epcc)*

## Goal

Fix the opencode plugin so that `proceed_to_phase` **proactively triggers a session compaction** when transitioning to a new phase. Currently, no implicit compaction is fired on phase transition — only the passive `experimental.session.compacting` hook exists, which merely injects context guidance *when* opencode decides to compact on its own.

## Key Decisions

- **Use `client.session.summarize()`**: The opencode SDK `client` (passed as `input.client` to the plugin) exposes `client.session.summarize({ path: { id: sessionID } })`. This triggers compaction from within the plugin. The `sessionID` is available in the `ToolContext` passed to each tool's `execute()`.
- **Extend local `OpenCodeClient` interface in `opencode-logger.ts`**: This is our own private interface (lines 24–35) that we already maintain in the plugin to type-cast `input.client` (which arrives as `unknown`). We just add `session.summarize` to it. No opencode source changes whatsoever.
- **Pass `client` to `createProceedToPhaseTool()`**: The tool factory needs the client for triggering compaction. Pass it as a new parameter — same pattern as `getServerContext` and `setBufferedInstructions`.
- **Fire-and-forget compaction**: Call `summarize` without awaiting, so a failed compaction doesn't block or error out the phase transition itself.
- **Update mock in tests**: The existing `createMockPluginInput` only mocks `client.app.log`. Add a `client.session.summarize` mock so the test doesn't throw on the new call.

## Notes

### Architecture of the plugin

The plugin lives at `packages/opencode-plugin/src/plugin.ts`. It exports a `WorkflowsPlugin` factory that returns a `Hooks` object. The hooks are:

1. **`chat.message`** — Fires after each user message; injects synthetic phase instructions as a part.
2. **`tool.execute.before`** — Fires before each tool call; blocks file edits that violate phase restrictions.
3. **`experimental.session.compacting`** — Fires when opencode decides to compact; injects context/guidance into the compaction prompt.
4. **Custom tools** — `start_development`, `proceed_to_phase`, `conduct_review`, `reset_development`, `setup_project_docs`.

### How `proceed_to_phase` is wired

- `plugin.ts` calls `createProceedToPhaseTool(getServerContext, setBufferedInstructions)` from `tool-handlers/proceed-to-phase.ts`.
- The tool handler calls `ProceedToPhaseHandler` from `@codemcp/workflows-server`, which updates the workflow state on disk.
- After success, it calls `setBufferedInstructions(...)` so the next `chat.message` hook uses the fresh instructions instead of re-reading from disk.
- It does **not** call anything to trigger compaction.

### The compaction gap

When transitioning to a new phase, the LLM's context still contains all prior conversation from the old phase (exploration findings, planning discussions, etc.). This is suboptimal because:
- The context is polluted with irrelevant prior-phase content.
- The `experimental.session.compacting` hook fires only when opencode decides to compact (auto or manual), not proactively on phase change.

The recorded session (`/tmp/oc-web.json`) confirms this: three `proceed_to_phase` calls (Explore→Plan, Plan→Code) with no compaction events in between, then one final manual compaction at the end.

### SDK API for compaction

The opencode SDK's `OpencodeClient` (from `packages/sdk/js/src/gen/sdk.gen.ts`) has:

```ts
client.session.summarize({
  path: { id: sessionID },
  // body is optional: { providerID, modelID }
})
```

This maps to `POST /session/{id}/summarize`.

The `client` is available in the plugin closure as `input.client`. It is currently typed as `unknown` in `types.ts` / `opencode-logger.ts`, where an `OpenCodeClient` interface is manually maintained with just `app.log`.

### Files involved

| File | Role |
|------|------|
| `packages/opencode-plugin/src/plugin.ts` | Plugin entry point; creates tools; has `input.client` in closure |
| `packages/opencode-plugin/src/tool-handlers/proceed-to-phase.ts` | Tool handler for `proceed_to_phase`; needs client to trigger compaction |
| `packages/opencode-plugin/src/opencode-logger.ts` | Contains our **local** `OpenCodeClient` private interface (a narrow cast of the `unknown` client); add `session.summarize` here — no opencode source changes |
| `packages/opencode-plugin/src/types.ts` | `ToolContext` type — has `sessionID` available to tools |
| `packages/opencode-plugin/test/e2e/plugin.test.ts` | Tests; `createMockPluginInput` only mocks `app.log` |

## Explore
<!-- beads-phase-id: responsible-vibe-31.1 -->
### Tasks
<!-- beads-synced: 2026-04-03 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*

- [x] `responsible-vibe-31.1.1` Understand the compaction triggering mechanism in the opencode plugin
- [x] `responsible-vibe-31.1.2` Trace how proceed_to_phase tool is wired in plugin.ts
- [x] `responsible-vibe-31.1.3` Understand what SDK APIs are available for triggering compaction
- [x] `responsible-vibe-31.1.4` Document findings in plan file

## Plan
<!-- beads-phase-id: responsible-vibe-31.2 -->

### Implementation Strategy

Four targeted changes across three files. No new files, no new dependencies, no opencode source changes.

#### Step 1 — `opencode-logger.ts`: extend the local `OpenCodeClient` interface

Add a `session` property alongside the existing `app` property:

```ts
interface OpenCodeClient {
  app: {
    log: (params: { body: { service: string; level: ...; message: string; extra?: ... } }) => Promise<void>;
  };
  session: {
    summarize: (params: { path: { id: string } }) => Promise<unknown>;
  };
}
```

This interface is only used locally for the type-cast — it describes the shape of `input.client` that we need. We don't need to match the full SDK type, just the subset we use.

#### Step 2 — `plugin.ts`: pass `client` into the tool factory

Change the call from:
```ts
proceed_to_phase: wrap(createProceedToPhaseTool(getServerContext, setBufferedInstructions))
```
to:
```ts
proceed_to_phase: wrap(createProceedToPhaseTool(getServerContext, setBufferedInstructions, input.client))
```

#### Step 3 — `proceed-to-phase.ts`: trigger compaction after successful transition

Change the function signature to accept `client: unknown`, cast it locally, and after calling `setBufferedInstructions`, fire compaction:

```ts
export function createProceedToPhaseTool(
  getServerContext: () => Promise<ServerContext>,
  setBufferedInstructions: (result: WhatsNextResult) => void,
  client: unknown,   // ← new param
): ToolDefinition {
```

Inside `execute`, after `setBufferedInstructions(...)`:
```ts
// Fire-and-forget: trigger compaction to clear prior-phase context
const opencodeClient = client as { session: { summarize: (p: { path: { id: string } }) => Promise<unknown> } };
opencodeClient.session.summarize({ path: { id: context.sessionID } }).catch(() => {});
```

Fire-and-forget with `.catch(() => {})` so a failed compaction (e.g. in tests or if the session is not active) never breaks the phase transition.

#### Step 4 — `plugin.test.ts`: update mock + add assertion

In `createMockPluginInput`, add `session.summarize` to the client mock:
```ts
client: {
  app: { log: vi.fn().mockResolvedValue(undefined) },
  session: { summarize: vi.fn().mockResolvedValue(undefined) },
}
```

Add a test case to the `proceed_to_phase` describe block asserting that `session.summarize` is called with the correct `sessionID` on a successful transition.

### Edge Cases & Risks

| Scenario | Handling |
|----------|----------|
| `session.summarize` throws or rejects | `.catch(() => {})` swallows it — transition still succeeds |
| `context.sessionID` is empty string | Summarize call fires with empty string — opencode will likely 404, which is swallowed |
| Tests don't provide real client | Mock returns resolved promise — no actual HTTP call |
| `start_development` also transitions phase | Not changed in this fix — can be a follow-up if needed |

### Tasks
<!-- beads-synced: 2026-04-03 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*

- [x] `responsible-vibe-31.2.1` Add session.summarize to local OpenCodeClient interface in opencode-logger.ts
- [x] `responsible-vibe-31.2.2` Pass client to createProceedToPhaseTool in plugin.ts
- [x] `responsible-vibe-31.2.3` Trigger compaction after successful phase transition in proceed-to-phase.ts
- [x] `responsible-vibe-31.2.4` Update test mock to include session.summarize and verify it is called

## Code
<!-- beads-phase-id: responsible-vibe-31.3 -->
### Tasks
<!-- beads-synced: 2026-04-03 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*

- [x] `responsible-vibe-31.3.1` Extend local OpenCodeClient interface with session.summarize
- [x] `responsible-vibe-31.3.2` Pass client to createProceedToPhaseTool in plugin.ts
- [x] `responsible-vibe-31.3.3` Trigger compaction in proceed-to-phase.ts after successful transition
- [x] `responsible-vibe-31.3.4` Update test mock and add assertion for session.summarize call
- [x] `responsible-vibe-31.3.5` Build and run tests

## Commit
<!-- beads-phase-id: responsible-vibe-31.4 -->
### Tasks
<!-- beads-synced: 2026-04-03 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*

- [x] `responsible-vibe-31.4.1` Code cleanup: check for debug/temp artifacts
- [x] `responsible-vibe-31.4.2` Final test run
- [x] `responsible-vibe-31.4.3` Commit changes

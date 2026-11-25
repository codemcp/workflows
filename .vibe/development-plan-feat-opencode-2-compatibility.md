# Development Plan: workflows (feat/opencode-2-compatibility branch)

*Generated on 2026-10-21 by Vibe Feature MCP*
*Workflow: [epcc](https://codemcp.github.io/workflows/workflows/epcc)*

## Goal
Make `@codemcp/workflows-opencode` (and the TUI plugin) work with the OpenCode 2.0 plugin API, ideally while staying compatible with OpenCode 1.x.
## Key Decisions
- Dual V1/V2 support from one default export (`{ ...Plugin.define({id, setup}), server() }`) as in the V2 migration guide. No feature degradation allowed in either path.
- TUI plugin (`packages/opencode-tui-plugin`) is in scope.
- If a V2 capability turns out to be unavailable or broken further down the road (e.g. `permission.assert`, `session.compact` missing at runtime, TUI slot API mismatch), create a GitHub issue for it instead of dropping the feature silently.
- SUPERSEDED: the earlier plan to hand-write local V2 types. The real V2 package is `@opencode/plugin@2.1.2` (stable, dist-tag `latest`; the docs are right, I had been looking at `@opencode-ai/plugin` betas). Its typings include `session.compact`, `permission.assert`, `session.prompt/synthetic/switchAgent`, `event.subscribe`. Decision: depend on `@opencode/plugin@2.1.2` as an optional peer + devDependency (types only at build time, `import type`), keep V1 types from `@opencode-ai/plugin` 1.x. Runtime code must not import `@opencode/plugin` at module load (V1 hosts do not have it); `Plugin.define` is replaced by a local identity function `{id, setup}`.
- Pi harness (https://github.com/earendil-works/pi) evaluated: feasible via a third adapter over the shared runtime, but out of scope for this branch; see `## Pi harness evaluation`. Agent filter has no pi equivalent.
- Share workflow logic (phase state, buffered instructions, agent filter, file-pattern matching, instruction text) in a host-neutral module; V1 and V2 become thin adapters.
- Tool definitions stay authored once with zod; V2 JSON Schema comes from `z.toJSONSchema()` (zod >= 4.1.8 is already required). V2 result is wrapped as `{ content: ... }`.
- Introduce a small `HostPort` seam (log, compact, sendPrompt, askPermission) so `proceed-to-phase.ts` and the runtime no longer touch the V1 SDK client directly. This also removes the `lastKnownModel` cache from the V2 path (V1 keeps it inside its adapter).
- Use `ctx.session.hook("prompt")` (not `"context"`) for phase-instruction injection in V2, because V1 injects once per user message and persists a synthetic part; `"context"` would re-inject on every tool-loop model call. Revisit if the post-compaction auto-continue message does not pass through `prompt` at runtime.
- Verification: V2 is verified by (a) mock-context unit tests and (b) a containerized real OpenCode 2.1.2 end-to-end test (see `## Containerized E2E`). Remaining runtime-only uncertainties (`session.idle`/compaction event names, `prompt` hook on auto-continue, TUI theme tokens) become GitHub issues if they fail in the container.
- Container runtime is auto-detected: `container` (Apple, macOS; v1.0.0 present, verified it pulls and runs the image) or `docker` (Linux/CI). Same OCI image on both: `ghcr.io/anomalyco/opencode:2.1.2` (alpine, entrypoint `opencode`, arm64+amd64). Pin the version tag, never `latest`.
- The container E2E is opt-in (`pnpm test:e2e:container`), not part of default `vitest --run`, so contributors without a container runtime are unaffected. A CI job on Linux/docker is added but may be allowed-to-fail initially.
- No real LLM or API key in the E2E: a scripted mock OpenAI-compatible server drives the agent deterministically.

## Design
### Layering
```
src/
  index.ts              default export: { ...Plugin.define({id,setup}), server }  (dual)
  runtime/
    workflow-runtime.ts host-neutral logic (state below), no SDK imports
    host-port.ts        interface HostPort { log, compact(sessionID), sendPrompt(sessionID,text,agent?), askPermission(tool,patterns,metadata,ctx) }
    file-patterns.ts    matchGlobPattern / isFileAllowed (moved from plugin.ts)
    permission-patterns.ts  buildPermissionPatterns (moved from plugin.ts)
    tool-specs.ts       tool descriptions + zod arg shapes + execute(args, toolCtx) -> string
  v1/plugin.ts          WorkflowsPlugin: maps V1 hooks/tools -> runtime (keeps runAsk, parts output, client.app.log, summarize/promptAsync, lastKnownModel)
  v2/plugin.ts          setup(ctx): maps ctx.session/tool/event/permission -> runtime; types via `import type` from `@opencode/plugin@2.1.2` (no runtime import)
```
### Boundary to the MCP server (clarification)
`workflow-runtime` does NOT wrap or start the MCP server. Like the V1 plugin today, it calls `@codemcp/workflows-server` handlers (`WhatsNextHandler`, `ProceedToPhaseHandler`, ...) in-process via `createServerContext()`; no MCP transport is involved. The MCP server binary is a separate consumer of the same handlers. Both persist to `.vibe/conversations/*/state.json`, which is why the TUI sidebar supports both tool-name styles. The runtime only owns host-side concerns (session tracking, ServerContext cache, buffered instructions, agent filter, edit blocking, post-compaction flow, text selection); all workflow logic stays in the handlers. Consequence: the V2 work needs no change in `workflows-server` or the MCP server.

### Runtime responsibilities (moved verbatim from V1 closure)
Session id tracking + ServerContext cache; `bufferedInstructions`; post-compaction flags (`postCompactionSession`, `postCompactionAutoResume`, `postCompactionMessagePending`); `lastKnownAgent`; agent filter; `getWorkflowState`. Exposed methods:
- `beforeUserMessage({sessionID, agent}) -> Promise<string | null>` (instruction/suppression/no-workflow text or null)
- `beforeEdit({tool, args}) -> Promise<void>` (throws BLOCKED error)
- `compactionContext(sessionID) -> Promise<string[]>`
- `onSessionCompacted(sessionID)` / `onSessionIdle(sessionID)` (idle sends the phase-aware continue via `host.sendPrompt` after 500 ms)
- `tools` map (name -> spec) wrapped with agent check + `host.askPermission`
### V2 mapping
| Runtime method | V2 wiring |
|---|---|
| beforeUserMessage | `ctx.session.hook("prompt", e => append text to e.prompt.text)`; agent from event |
| beforeEdit | `ctx.tool.hook("execute.before", e => runtime.beforeEdit({tool:e.tool,args:e.input}))` |
| compactionContext | `ctx.session.hook("compaction", e => e.system.push(...))` |
| onSessionCompacted / continue after compaction (send immediately with `delivery:'queue'`, no idle wait) | `ctx.event.subscribe({signal})` for `session.compaction.ended` and `session.execution.succeeded` (`session.compacted`/`session.idle` are not emitted by V2, spike-verified) |
| host.compact | `ctx.session.compact({sessionID})` |
| host.sendPrompt | `ctx.session.prompt({sessionID,text,delivery:'queue'})` then `switchAgent` if agent known |
| host.askPermission | `ctx.permission.assert({sessionID, agent, action, resources, save, metadata, source:{type:'tool',messageID,id}})` |
| host.log | stderr/`console` via core `LogSink` (no `app.log` in V2) |
| tools | `ctx.tool.transform(ed => ed.add({name, description, input: z.toJSONSchema(...), options:{codemode:false}, execute}))` (codemode:false is REQUIRED, otherwise the tool is hidden behind the generic `execute` tool) |
### TUI mapping
Dual default export in `workflows-phase.tsx`: keep `tui` (V1) and add `setup(context)` (V2) built on shared helpers extracted to `state-reader.ts` (`readStateBySessionId`, `getWorkflowPhases`, `parsePhasesFromYaml`, agent filter). V2 wiring: `context.ui.slot({append:'sidebar.content', render:({sessionID}) => <Sidebar/>})`, `context.data.listen` for tool completion, `context.data.session.message.list(sessionID)` for agent, theme mapped from `context.theme.*` with fallbacks.
### Config / docs
`opencode.json` / `tui.json` examples updated in both READMEs: V1 `plugin`, V2 `plugins` (`cli.json` for TUI). Package `peerDependencies` stay `*`; add `engines` note: V1 needs >= 1.18.29 for object entrypoints.

## Spike scope (Code task 0)
Runs entirely in a throwaway dir under the OS temp dir (`/var/folders/bz/9cf16q2d65x53yd7xltj78900000gn/T/opencode/spike-v2`), never inside the repo; only findings are written back to this plan, then the dir is deleted. The `prompt` vs `context` hook choice is decided by the spike result. Files planned (not yet written; the plan phase blocked non-doc writes): `mock-llm.mjs` (scripted OpenAI-compatible SSE server, logs requests to JSONL, replies with a tool call then text), `project/.opencode/plugins/spike/index.ts` (one tool `spike_echo` + `session.hook` prompt/context/compaction + `tool.hook` execute.before + `event.subscribe`, logging to a file), `project/opencode.json` (custom provider `mock`, `@opencode/ai/providers/openai-compatible`, `baseURL` http://192.168.64.1:8765/v1 = Apple `container` default-network gateway, to be confirmed), and a run script using `container run ghcr.io/anomalyco/opencode:2.1.2`. Questions the spike answers: does a local plugin dir load; how is `@opencode/plugin` resolved inside the image (docs say OpenCode resolves it at runtime); can the container reach the host mock; which hooks fire for a normal turn and after `compact`; do events include `session.idle`/`session.compacted`; what do event and tool-context objects look like (keys); is the `delivery` option accepted by `session.prompt`.

## Spike results (Code task 0, done)
Ran against `ghcr.io/anomalyco/opencode:2.1.2` on Apple `container`, `run --standalone [--auto]`, project mounted at `/work`, scripted mock LLM on the host. Spike files stay in `.../T/opencode/spike-v2` (reusable as a base for `test/e2e-container/mock-llm.mjs`; delete in the Commit phase).
- Harness: works. Container reaches the host mock at `http://192.168.64.1:8765/v1`. Provider config shape `providers.mock = {name, package:"@opencode/ai/providers/openai-compatible", settings:{baseURL}, models:{mock:{name}}}` + `"model":"mock/mock"` works. `.opencode/plugins/<name>/index.ts` auto-loads (log line `loading plugin ... entrypoint=file:///work/.opencode/plugins/spike/index.ts`). The plugin was a plain `export default {id, setup}`; it never imported `@opencode/plugin`, so the local identity `define` plan is confirmed. Config `plugins: ["/path"]` for a built package dir is still to be exercised in task 12a.
- Mock LLM must also answer OpenCode's title-generation request (a first request with `tools=[]`); the main agent request has 12-13 tools. Compaction request = the same agent request with the summarize prompt ("You MUST summarize ...") as last user message; the mock must reply with a template-like text, else OpenCode retries with a second prompt.
- ctx keys: `app, location, options, agent, aisdk, command, credential, event, experimental, generate, model, provider, integration, mcp, permission, plugin, reference, rpc, skill, storage, tool, vcs, websearch, worktree, session, shell`. NO `client` and no log API -> logger sink must be stderr/file (confirmed decision). `ctx.location.directory` is available (use it instead of `ctx.directory`).
- IMPORTANT tool registration finding: tools added via `ctx.tool.transform(ed => ed.add({...}))` are by default "codemode" tools: they are NOT in the model's tool list (only a generic `execute` tool is) . Adding `options: { codemode: false }` makes the tool appear directly (verified: `spike_echo` offered, called, result `echo:hi` returned). All workflow tools must set `options: { codemode: false }` (consider `pinned` only if codemode stays true, not needed). JSON Schema `input` and a result of `{content:[{type:'text',text}]}` work. Tool `execute(input, ctx)` context keys: `sessionID, agent, messageID, id, progress, signal`.
- Hooks:
  - `session.hook("prompt")`: event keys `sessionID, messageID, prompt{text,files}, metadata, delivery`; mutating `prompt.text` works and the mutated text is persisted into the user message (and is sent in every later request), i.e. equivalent to V1's synthetic part, injected once. It ALSO fires for prompts sent via `ctx.session.prompt(...)` (the post-compaction continue prompt got the injection), so the open question is answered: phase instructions reach the post-compaction auto-continue through `prompt`. Note: the event has NO `agent` field, so the agent filter in `prompt` must use `lastKnownAgent` from `context`/`execute.before`/events, or `ctx.session.get`. Decide in task 6: prefer `context` hook to remember `agent` per session (it fires before every model call with `agent`) and use that value in `prompt`; for the very first message fall back to the default agent (`ctx.agent`?, to check) or inject and let the agent check in tool/edit hooks.
  - `session.hook("context")`: fires before each model call (msgLen 1, then 3 after a tool call), has `agent`, `system[]`, `messages[]`, `tools`. Confirms it would re-inject per tool-loop call; keep `prompt` for injection.
  - `session.hook("compaction")`: fires for the compaction request; pushing to `e.system` is honored (guidance text reached the model request).
  - `tool.hook("execute.before")`: keys `tool, sessionID, agent, messageID, id, input`; `throw new Error("BLOCKED: ...")` blocks the tool and the model receives `{"error":{"type":"unknown","message":"BLOCKED: ..."}}`. `execute.after` has `status`.
- `ctx.permission.assert` input is `{sessionID, agent?, action, resources[], save?, metadata?, source?: {type:"tool", messageID, id}}` (NOT `permission/patterns`); my first guess failed with "Missing key action". Map V1 `ctx.ask({permission, patterns, always, metadata})` -> `{action: permission, resources: patterns, save: always, metadata, source}`. With the default config the call resolved immediately without a prompt (no `--auto`, `action:"spike_echo"`), so E2E scenario 4 must configure an explicit `permission` rule with `ask` for the action to observe a pending request; to be checked in task 12a.
- `ctx.session.compact({sessionID, delivery?:'steer'|'queue'})` returns the inbox item (`type:"compaction"`). Calling it from inside a tool execute works; the compaction runs after the current step/turn ends (both delivery modes). Event order: `session.inbox.enqueued` -> compaction hook -> `session.compaction.started{reason:"manual"}` -> `session.compaction.delta` -> `session.compaction.ended{reason,text,...}` -> `session.execution.succeeded`.
- Events: `session.compacted` and `session.idle` are NOT emitted by the V2 runtime (they exist only in the legacy event manifest). Use `session.compaction.ended` (has `reason`: `manual` for ours; automatic overflow compaction presumably another value, to verify -> used for `postCompactionAutoResume`) and `session.execution.succeeded` as the idle signal. Event shape: `{id, created, type, data:{sessionID,...}, location?}`.
- Post-compaction continue: `ctx.session.prompt({sessionID, text, delivery:'queue'})` called from the `session.compaction.ended` handler is accepted and delivered after the compaction execution finished; the model got a normal user turn (`CONTINUE-SPIKE`). So the 500 ms idle workaround from V1 is not needed in V2: send on `compaction.ended` with `delivery:'queue'`. Still to verify with real flag semantics (auto vs manual) in E2E.
- Decisions from the spike: (1) `prompt` hook for instruction injection (confirmed); (2) `codemode:false` on all tools; (3) use `session.compaction.ended`/`session.execution.succeeded` instead of `session.compacted`/`session.idle` in the V2 adapter; (4) `permission.assert` mapping above; (5) agent for `prompt` hook from a per-session cache filled by `context`/`execute.before`.

## Pi harness evaluation (earendil-works/pi)
Source: research agent report, then spot-verified by me against a shallow clone (`packages/coding-agent/src/core/extensions/types.ts`, `docs/*.md`, HEAD 16f5f0a, last commit by Mario Zechner, 2026-10-21). Items marked (v) verified by me, (a) agent claim not independently verified.
- (v) TypeScript/ESM monorepo, MIT-style npm workspaces; extensions are TS modules (factory receiving `ExtensionAPI`), run in-process; packages doc exists (`docs/packages.md`).
- Feature mapping:
  1. Custom tools + permission: native (v: `registerTool`, `tool_call` event returning `{block, reason}`; confirm via `ctx.ui` (a)). Schema is TypeBox (a), so a third schema bridge from zod is needed (`z.toJSONSchema` -> JSON-schema-compatible TypeBox via `Type.Unsafe`, to verify).
  2. Per-message phase instructions: native (v: `context`/`context_with_system` events, `before_agent_start` can change system prompt (`systemPrompt?` at types.ts:1499), `sendMessage`/`sendUserMessage`).
  3. Edit blocking: native (v: `tool_call` + `block`/`reason`; `terminate` hint).
  4. Compaction: native (v: `session_before_compact` event, `ctx.compact(options)` at types.ts:362 to trigger, `agent_settled` event + `ctx.isIdle()`/`waitForIdle()` for the post-compaction continue, `sendUserMessage(..., {deliverAs})`). Caveat: `agent_settled` fires only when no compaction or queued continuation will run, which suits the post-compaction continue.
  5. Agent filter (`WORKFLOW_AGENTS`): NOT native. No named-agent concept found in `types.ts` (the report's `ctx.agent` claim is wrong). Likely a no-op in pi (all sessions active); `WORKFLOW=off` env kept. Document as a known difference.
  6. Phase widget: native (v: `ctx.ui.setWidget`), TUI is `pi-tui` (not OpenTUI/solid), so the sidebar must be a separate small component; state reader (`state-reader.ts`) is reusable.
  7. Shared logic: reusable, same Node/TS runtime.
- MCP: first-class (v: `docs/mcp.md`, `pi mcp add`, `.pi/mcp.json`, `pi.registerMcpServer`). The existing workflows MCP server would work in pi with no plugin, but would lose features 2-4 and 6; extension adapter is the full-feature path.
- Headless/container (v): `pi --print`, `pi --mode json` (JSONL events), RPC mode docs, `docs/containerization.md` (plain Docker pattern), `registerProvider` with `api: "openai-completions"` + `baseUrl` supports a mock LLM. So the same mock-LLM container E2E approach applies (Node image + `npm i -g` pi).
- Verdict: feasibility HIGH. A third adapter (`pi/extension.ts`) over the shared `workflow-runtime`/`HostPort`; likely smaller than the V2 adapter apart from the TypeBox bridge and the TUI widget. No change to `workflows-server`.
- Risks / unverified: pi extension API stability (pin version); TypeBox bridge; exact `ctx.ui.confirm` behavior in `--print`/JSON modes; whether `context` injection persists across turns (injection semantics differ from OpenCode's synthetic part); agent filter gap; the research agent's other claims (star count, `pi-chord` use, telemetry/logger API) were not verified and should not be relied upon.
- Decision: OUT OF SCOPE for this branch (OpenCode 1/2 + TUI). The `HostPort` seam is already host-neutral, so no extra work now. Follow-up: create a GitHub issue "Add pi harness adapter" with the findings above (after this branch, or now if the user wants).

## Containerized E2E
### Goal
Run the built plugin inside real OpenCode V2 (and, as a regression run, OpenCode 1.x image if one is published) and assert real behavior, replacing "mock ctx only" confidence.
### Setup
- Image: `ghcr.io/anomalyco/opencode:2.1.2`. `opencode run` / `--standalone` runs a private server inside the container (no shared background service); `--auto` auto-approves permission asks so `permission.assert` does not block (a second scenario without `--auto` checks that the ask is raised).
- Mounts: built plugin package dir (read-only, `dist/` + `resources/`), a throwaway project dir (git-initialised, writable), and a config dir with `opencode.json` using `plugins` pointing at the mounted plugin and a custom provider `mock` (`@opencode/ai/providers/openai-compatible`, `baseURL` -> mock server, as in the provider docs).
- Mock LLM: small Node script (`test/e2e-container/mock-llm.mjs`) implementing `POST /v1/chat/completions` (streaming SSE), driven by a scenario file that returns scripted tool calls, and logging every request body to a JSONL file for assertions. Reachability options (decide in spike): (1) run the mock inside the same container if a JS runtime is available (opencode image is bun-based alpine; check `bun`/`node` presence), (2) run on the host and reach it via host gateway (`container`: host IP from default network gateway; docker: `--add-host host.docker.internal:host-gateway`), (3) second container on a shared network.
- Orchestration: `scripts/e2e-opencode-v2.sh` (detects `container`/`docker`, pulls pinned image, creates temp dirs, runs scenarios, always cleans up). A thin vitest wrapper `test/e2e-container/*.test.ts` (own vitest project, excluded from default include) calls it per scenario and asserts on artifacts.
### Scenarios (each asserts on artifacts, not on model text)
1. Load: plugin loads without error, tools `start_development`, `proceed_to_phase`, `conduct_review`, `reset_development`, `setup_project_docs`, `load_workflows` are offered to the model (tool list in the mock's first request body).
2. Injection: first user message request contains the "No Active Workflow Detected" text; after scripted `start_development`, next request contains the phase instructions; `.vibe/conversations/*/state.json` exists with `sessionMetadata.referenceId` = session id.
3. Edit blocking: in a phase that disallows `*.ts`, scripted `write src/x.ts` is rejected (tool result contains `BLOCKED`) and file not created; `*.md` write succeeds.
4. Permission: without `--auto`, an ask for `proceed_to_phase` is raised (permission list/endpoint or run exits waiting); with `--auto` it proceeds.
5. Compaction: `proceed_to_phase` triggers `session.compact`; mock sees a compaction request whose system/context contains the workflow guidance; afterwards a phase-aware continue prompt arrives (idle/compacted flow). `WORKFLOW_AUTO_COMPACT=false` -> no compaction request.
6. Agent filter: `WORKFLOW_AGENTS=other` -> suppression text injected and tool call errors.
7. TUI (best effort): TUI needs a pty; verify only that the V2 CLI plugin package loads (`opencode` plugin list via `opencode api`/`client.plugin.list`), otherwise manual check + issue.
### Spike first (Code task 0)
Before refactoring: build a minimal V2 `{id, setup}` plugin that registers one tool and one `session.hook("prompt")`, run it in the container with the mock LLM, and confirm mounting, plugin config shape (`plugins` entry for a local path vs package), mock reachability and artifact extraction work on macOS `container`. This de-risks the whole plan and can start from the existing V1 code unchanged.

## Notes
### Findings (Explore)
- Current plugin: V1 style. Exports `WorkflowsPlugin` (async fn returning hooks) + default `{ id, server }`. Uses hooks `chat.message`, `tool.execute.before`, `experimental.session.compacting`, `event`, and a `tool` map (zod args, `ctx.ask`). Also calls `client.session.summarize` / `client.session.promptAsync` / `client.app.log` (V1 SDK client).
- OpenCode V2 (docs at opencode.ai/v2/docs/build/plugins): `plugins` (not `plugin`) in opencode.json; default export `Plugin.define({ id, async setup(ctx) })`; hooks registered via `ctx.<domain>.hook(...)`; tools via `ctx.tool.transform(editor => editor.add({name, input: JSONSchema, execute}))` returning `{content}`; permissions via `ctx.permission.assert`; events via `ctx.event.subscribe()`.
- V1 -> V2 hook mapping (from migration guide):
  - `chat.message` -> `ctx.session.hook("prompt")` (runs at admission; edit `event.prompt.text`/files) or `"context"` (edit `event.system`, runs before each agent model call)
  - `tool.execute.before` -> `ctx.tool.hook("execute.before")` (`event.tool`, `event.input`)
  - `experimental.session.compacting` -> `ctx.session.hook("compaction")` (has `event.messages`, can set `event.result`)
  - `event` -> `ctx.event.subscribe({signal})`, cleanup via function returned from `setup`
  - `tool` map -> `ctx.tool.transform`; `ctx.ask` -> `ctx.permission.assert` (docs) 
- Migration guide explicitly supports dual V1+V2 default export: `{ ...Plugin.define({id, setup}), async server() {...} }`. V1 object entrypoints need OpenCode >= 1.18.29.
- Package naming (RESOLVED): V2 package is `@opencode/plugin@2.1.2` (exports `.`, `./effect`, `./host`, `./runtime`, `./tui`); `@opencode-ai/plugin` is the V1 line (1.x) and its `beta`/`next` tags are older V2 previews. The doc import name is correct.
- (Superseded) Old beta preview typings lacked `compact`/`assert`; stable `@opencode/plugin@2.1.2` has both (`SessionDomain` picks `compact`, `PermissionDomain.assert`). There is no `promptAsync` in V2; use `session.prompt`/`synthetic`.
- CORRECTION (full docs read): no feature loss is required. V2 has equivalents for every current behavior:
  - Post-compaction continue: `ctx.event.subscribe()` emits `session.compacted`, `session.compaction.ended` and `session.idle`; `ctx.session.prompt({sessionID, text, delivery:"queue"})` (or `synthetic`) replaces `promptAsync`; `ctx.session.switchAgent` replaces the `agent` body field.
  - `proceed_to_phase` compaction: `ctx.session.compact({sessionID})` (documented, returns the admitted inbox item; `delivery:"queue"` preserves order) replaces `client.session.summarize`, and no providerID/modelID needs to be passed, so the `lastKnownModel` cache can go.
  - Compaction context injection: `ctx.session.hook("compaction", ...)` exposes `event.system`/`event.messages`, so phase instructions can be pushed into `event.system` (or `event.result` set).
  - Phase instruction injection (`chat.message`): `ctx.session.hook("prompt")` mutates `event.prompt.text/files` once at admission, or `"context"` pushes into `event.system` before each model call. Per-message injection is closest to `"prompt"`; `"context"` additionally covers tool-loop turns.
  - Agent filter (`WORKFLOW_AGENTS`): `"context"` hook has `event.agent`; `ctx.tool.hook("execute.before")` has `event.agent`; tool `execute` context has `agent`.
  - Edit blocking: `ctx.tool.hook("execute.before")` with `event.tool` + `event.input` (throw to block).
  - Tool permission prompt (`ctx.ask`): `ctx.permission.assert` per docs (missing from beta typings, needs verifying).
- Logging: V2 context has no `app.log` equivalent (`ctx.app` only has name/version/channel). Logger needs a different sink (stderr/file via core LogSink) in V2; V1 keeps `client.app.log`.
- RESOLVED: `@opencode/plugin@2.1.2` typings DO include `compact` and `assert`. Remaining open risk: context object has no `client.app.log` (logger needs a new sink: stderr/file; check in the spike whether `ctx.client` exposes a log endpoint).
- TUI findings: V1 TUI plugin is `{ id, tui }` (`TuiPluginModule`) using `api.slots.register({slots:{sidebar_content}})`, `api.event.on('message.part.updated')`, `api.state.session.messages()`, `api.theme.current`, `api.state.path.directory`. V2 TUI (called "CLI plugin"): `Plugin.define({id, setup(context)})` from the `/tui` entry; `context.ui.slot({append:'sidebar.content', render:({sessionID}) => JSX})`; `context.data.on('session.execution.succeeded' | ...)`/`context.data.listen`; `context.data.session.message.list(sessionID)` for agent detection; theme tokens are `context.theme.text.base` (not `theme.text`/`warning`/`success`/`textMuted` - exact token names still to verify in `@opencode/theme`); `context.location?.directory`. Config: `cli.json` `plugins`; package exports `./tui`. Same dual-export idea: V1 `tui` + V2 `setup` on one default export. The current package exports `./tui` already; it also reads `.vibe/conversations/*/state.json` via `require('node:fs')`, which should be re-checked under V2 runtime.
- Repo state: `@opencode-ai/plugin` 1.3.12 installed locally (peer `*`); `@opencode/plugin@2.1.2` is not installed yet (task 6 adds it as devDependency + optional peer). TUI plugin at `packages/opencode-tui-plugin` uses `./tui` export; V2 has separate CLI plugin config (`cli.json`, `plugins`).
- Plugin config in repo `opencode.json`/`tui.json` uses V1 `plugin` key.

## Explore
### Tasks
*None open*

### Completed
- [x] Created development plan file
- [x] Mapped V1 hooks/tools/client usage in opencode-plugin
- [x] Read V2 plugin docs, migration guide, beta typings (plugin, schema)
- [x] Verified V2 equivalents for every V1 behavior (no feature loss)
- [x] Analyzed TUI plugin and V2 CLI plugin API
- [x] Agreed scope with user: dual V1/V2 + TUI

## Plan
### Tasks

### Completed
- [x] Plan reviewed for up-to-dateness (stale V2-types/beta-package notes corrected, spike scope and file list recorded, E2E vitest-exclude and commit-phase cleanup tasks added)
- [x] Read V1 plugin, tool handlers and TUI plugin in full
- [x] Wrote layering, runtime responsibilities and V1/V2/TUI mapping in `## Design`
- [x] Wrote code task list below
- [x] Presented design + containerized E2E plan; user approved, asked for the spike (task 0) first, in a throwaway environment

## Code
### Tasks
- [x] 0. Spike (DONE, see `## Spike results`): containerized V2 harness (image `ghcr.io/anomalyco/opencode:2.1.2`, mock OpenAI-compatible LLM, minimal V2 plugin with one tool + prompt hook) on macOS `container`; record findings (config shape, mock reachability, artifact extraction) in Notes. If blocked, create a GitHub issue and fall back to mock-ctx tests
- [x] 1. Characterization: run existing unit/e2e tests in `packages/opencode-plugin` and record baseline (all green before refactor)
- [x] 2. Extract `file-patterns.ts` and `permission-patterns.ts` from `plugin.ts` (pure moves, keep tests green)
- [x] 3. Add `HostPort` and `workflow-runtime.ts`; move session tracking, buffered instructions, post-compaction flags, agent filter, `getWorkflowState` and the instruction/suppression/no-workflow logic into it
- [x] 4. Change `createProceedToPhaseTool` (and any other handler touching the client) to use `HostPort.compact` instead of `client.session.summarize` + `getModel`
- [x] 5. Rewrite `v1/plugin.ts` as thin adapter (runAsk, parts output, client.app.log, summarize/promptAsync, lastKnownModel); existing tests must pass unchanged
- [x] 6. Add `@opencode/plugin@2.1.2` as pinned devDependency + optional peer (types only, `import type`); add `v2/plugin.ts` exporting a plain `{id, setup}` (local identity `define`, no runtime import of `@opencode/plugin`); verify the V1 build/test still works without the package installed at runtime
- [x] 7. Tool schema bridge: `z.toJSONSchema` for V2, `{content}` result wrapper, agent check + `askPermission`
- [x] 8. V2 logger sink (stderr/file) implementing `Logger`/`loggerFactory`
- [x] 9. Dual default export in `index.ts`; keep named `WorkflowsPlugin` export; build with tsup and verify `dist` shape
- [x] 10. Unit tests for runtime and V2 adapter using a mock V2 context (hooks registered, injection text, edit block, compaction context, compact/prompt calls, event flow)
- [x] 11. TUI: extract `state-reader.ts`, add V2 `setup` alongside V1 `tui`, update `tsconfig`/package exports if needed; unit tests for state reader
- [x] 12. Update READMEs (both packages), `opencode.json`/`tui.json` samples and docs for V1 vs V2 config
- [x] 12a. Containerized E2E: `scripts/e2e-opencode-v2.sh` (auto-detect `container`/`docker`, pinned image), `test/e2e-container/` mock LLM + scenarios 1-7, `pnpm test:e2e:container` script (and exclude `test/e2e-container/**` from the default `vitest.config.ts` include), docs in plugin README, optional Linux/docker CI job
- [x] 13. (code part done; issues deferred to Commit phase) Run lint, typecheck, full test suite and build; create GitHub issues for any V2 runtime unknowns that could not be verified (`permission.assert`, `session.compact`, `session.idle`, tool result shape, TUI theme tokens)

### Completed
- Baseline (task 1): 64 tests green, lint clean, tsup build OK. `tsc --noEmit` has pre-existing errors (rootDir, `require_reviews` not in `StartDevelopmentArgs`, logger casts); not caused by this branch.
- Tasks 2-5 done: `runtime/{file-patterns,permission-patterns,tool-spec,host-port,workflow-runtime}.ts`, `v1/plugin.ts`; `plugin.ts` re-exports. Tool handlers now return host-neutral `ToolSpec` and `proceed_to_phase` takes `compact(sessionID)`. All 64 existing tests pass UNCHANGED (summarize/promptAsync/lastKnownModel behavior preserved in the V1 adapter).
- Tasks 6-9 done (first cut): `v2/plugin.ts`, `v2/logger.ts`, dual default export `{id, setup, server}` in `index.ts`; dist has no runtime reference to `@opencode/plugin`. V2 logger: file sink via `WORKFLOW_LOG_FILE` (opt-in), nothing on stderr (would corrupt the TUI).
- First real-container smoke of the BUILT plugin (OpenCode 2.1.2, staged into `<project>/.opencode/plugins/workflows/` with `dist/`, `resources/`, `node_modules/zod`, plus an `index.js` re-export): plugin loads, 6 workflow tools offered directly, "No Active Workflow" text injected via `prompt` hook, scripted `start_development epcc` creates `.vibe/conversations/*/state.json` with `sessionMetadata.referenceId` = the OpenCode session id, phase instructions come back as tool result. Findings:
  - RESOLVED: a `plugins` directory entry (`"./ext/wf"`) DOES load, but only when the directory has an `index.js`/`index.ts` at its root (log line `loading plugin id=/work/ext/wf entrypoint=file:///work/ext/wf/index.js`). A dir with only `package.json` `main`/`exports` -> `dist/index.js` (our published layout) was silently skipped, no error. Published-package resolution by name (`"@codemcp/workflows-opencode"` from npm) is NOT yet verified; needs a registry or a `node_modules` install inside the container (E2E scenario 1b). README must say: for a local checkout, add a one-line `index.js` re-export or install the package. `.opencode/plugins/<name>/index.js` auto-load works. Need to find what the `plugins` config entry requires (probably a package resolved through node resolution or a dir with `index.*`); to settle in 12a and document in the README. Do not claim `plugins: ["./path"]` support in docs until verified.
  - `resources/` is resolved relative to the plugin dir (23 workflows found), so the package layout `dist/ + resources/` works unchanged.
  - `zod` must be resolvable from the plugin dir (peer dependency, external in tsup).
- Task 10 done: `test/unit/v2-plugin.test.ts` (17 tests, mock V2 context: dual export, tools+codemode:false+JSON schema, prompt injection (no-workflow, active phase, suppression), edit block, compaction guidance, `permission.assert` shape, `{content}` result, subagent/agent-filter rejection, compact on proceed + opt-out, queued continue after `session.compaction.ended`, no duplicate injection, cleanup). Totals: 81 tests green, lint + prettier clean, build OK.
- Task 11 done: `packages/opencode-tui-plugin/state-reader.ts` (WORKFLOW_TOOLS, parsePhasesFromYaml, getWorkflowPhases, readStateBySessionId, createAgentFilter, isWorkflowDisabled) + shared `Sidebar` component in `workflows-phase.tsx`; default export now `{id, tui, setup}`. V2 wiring typed against `@opencode/plugin@2.1.2/tui`: `context.ui.slot({append:'sidebar.content', render:({sessionID})})`, theme tokens `context.theme.text.{base,muted,feedback.warning.base,feedback.success.base}` (V1 `text/textMuted/warning/success` mapped), agent from `context.data.session.message.list` (`Assistant.agent`), directory from `context.location.directory`. V2 refresh: `context.data.on('session.tool.input.started')` records call-id -> tool name, `session.tool.success` (event has call `id`, no tool name) triggers the refresh. 9 unit tests for state-reader (vitest added to the package). typecheck, lint, prettier clean. NOT runtime-verified in a PTY (no V2 TUI test possible headless): tracked as a GitHub issue candidate in the Commit phase.
- Note: the TUI package needs `@opentui/solid`>=0.6.6 for V2 (pnpm warns: found 0.1.94 locally); peer ranges unchanged (`*`), V2 users get the right one from OpenCode.
- Task 12a done: `test/e2e-container/{mock-llm.ts,harness.ts,opencode-v2.spec.ts}`, `vitest.e2e.config.ts`, script `pnpm test:e2e:container` (builds, auto-detects `container`/`docker`, `E2E_KEEP=1` keeps the project dir + `wf.log`, env overrides `E2E_OPENCODE_IMAGE`, `E2E_CONTAINER_RUNTIME`, `E2E_HOST_ADDR`). 8 scenarios against real OpenCode 2.1.2 all pass (~35 s): load/tool offering, no-workflow injection + start + state linked to session id, edit block + allowed `.md`, tool run under `--auto`, compaction with guidance + phase-aware continue, `WORKFLOW_AUTO_COMPACT=false`, agent filter suppression + tool rejection, filter containing the default agent. Skipped automatically when no container runtime exists; not part of default `vitest --run`.
- Fixes found only by the real container (not by mock-ctx tests):
  1. `prompt` hook has no agent and no agent is recorded yet on the first message -> runtime default agent = first visible non-subagent from `ctx.agent.list()` (`build`); `session.agent.selected` events and `context`/`execute.before` keep it exact afterwards. `ctx.session.get` has NO agent field.
  2. The continue prompt must be queued before the run is considered finished: awaiting `getServerContext()`/handler inside the `compaction.ended` handler lost the race and `opencode run` exited first. Fix: phase instructions are prepared in the `compaction` hook (`preparedContinueText`) and `sendContinue` queues immediately; the `switchAgent` round trip was dropped (session agent survives compaction).
- Scenario 4 (permission ask WITHOUT `--auto`) is not covered: with default permissions `permission.assert` resolved without a prompt for our action name, so asserting a pending ask would need an explicit `permission` rule in `opencode.json`. Tracked as follow-up issue candidate, not claimed as verified.
- Final checks (task 13): oxlint clean in all 6 packages, prettier clean on sources (only generated `dist/` is flagged), plugin 82 tests green, TUI 9 tests + typecheck green, build OK, container E2E 8/8.
- Manual V2 validation setup (outside the repo, throwaway): `~/.cache/workflows-opencode-v2-try/` (moved there because the OS temp dir of the agent session is not visible from the user's shell) with an isolated `@opencode/cli@2.1.2` install (own XDG dirs), `plugin-stage/` (server part re-exports the repo `dist`, `tui.tsx` + `state-reader.ts` are copies synced by `run.sh`), `project/opencode.json` with agent `vibe` (default, `ask` rules for start_development/proceed_to_phase/reset_development) and `run.sh [--build]`. Headless check passed (plugin loads). To be validated by the user in a real terminal: permission dialog (assumption: rule action name == tool name), sidebar, compaction + continue. The `ask` rule/action-name assumption comes from the V2 docs, not yet observed. Move the setup into the repo (e.g. `scripts/try-opencode-v2.sh`) if the user wants it kept.
- Key Decision (user feedback from interactive V2 try-out): phase instructions are NO LONGER sent with every user message (V1 and V2). They come with the `start_development`/`proceed_to_phase` tool results and ONCE as a message after the compaction a phase change triggers (`sendContinue`). Per message only the short notices remain: "no active workflow" and the WORKFLOW_AGENTS suppression text; V1 as hidden synthetic part, V2 in the system prompt of the model call (a V2 `prompt` edit would be stored as visible user text, which is what irritated the user). Removed: buffered instructions, `postCompactionMessagePending`, `beforeUserMessage` instruction text. User confirmed the new behavior works interactively in OpenCode 2.1.2.
- Lesson: the container E2E had asserted the old (wrong) behavior (notice inside the user message), so it passed while the transcript showed the injected text. Assertions now check that user text stays untouched.
- RESOLVED: container scenario 5 (message with phase instructions after compaction) failed reproducibly under `opencode run` (plugin log says the prompt was sent, the mock never receives it); suspected cause: the run exits before the queued message is executed. Works interactively. Decision: scenario removed (the harness cannot observe a queued message; covered by unit tests and verified interactively by the user). README explains what the opt-in container E2E covers and what not. Container E2E stays opt-in, NOT in CI. Final state: 86 unit/e2e tests, 7 container scenarios, lint clean.

## Commit
### Tasks
- [x] (dropped by decision) Linux CI job for the container E2E
- [x] Clean up temp dirs (baseline removed, others already gone) and verify `git status` shows only intended files; debug leftovers removed (only the opt-in `E2E_KEEP`/`E2E_DEBUG` switches remain in the container harness)
- [ ] Organize commits with the write-commit skill format (Intent, Key decisions, Side effects)
- [ ] Ask user, then create GitHub issue "Add pi harness adapter" (findings in `## Pi harness evaluation`) and issues for any V2 runtime unknowns found in the container E2E
- [x] Final run of lint, typecheck, tests, build before commit (plugin: 86 tests, TUI: 9 tests, prettier/lint clean, build OK, container E2E 7/7); plugin README rewritten to the instructions-on-demand behavior (old 'Efficiency Comparison' table dropped because it measured per-message injection)

### Completed
*None yet*



---
*This plan is maintained by the LLM. Tool responses provide guidance on which section to focus on and what tasks to work on.*

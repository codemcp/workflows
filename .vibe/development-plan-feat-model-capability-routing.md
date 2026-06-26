# Development Plan: workflows (feat/model-capability-routing branch)

*Generated on 2026-06-26 by Vibe Feature MCP*
*Workflow: [qrspi](https://codemcp.github.io/workflows/workflows/qrspi)*

## Goal

Enable workflow phases to declare a required **capability type** (e.g., `thinking`, `research`, `coding`), so that when subagents are launched for autonomous tasks, the workflow instructions guide the agent to select the appropriate model/agent for that capability. Users can optionally configure a capability→model mapping in `.vibe/` config; the system is entirely opt-in with no magic defaults.

---

## Key Decisions

### KD-1: Routing mechanism — instruction-based, not harness-API-based
The user selects the model in the harness UI. Only when **launching subagents for autonomous tasks** does the agent decide which subagent/model to use. Since codemcp workflows cannot directly set model parameters (that is harness-specific), the mechanism must be **instruction-based**: the workflow prompt tells the agent *what capability is needed* and the agent interprets this to select the right model/agent (e.g., a model it knows is good at reasoning, or a fast/cheap one for research).

### KD-2: Capability vocabulary (initial set)
- `thinking` — deep reasoning, complex planning (e.g., Opus, o3)
- `research` — fast/cheap browsing and searching (e.g., Haiku, Flash)
- `coding` — code generation and editing (e.g., Sonnet, DeepSeek)
- `default` — fallback when no capability is specified

### KD-3: Config location
- Capability→model mapping lives in **`.vibe/`** config (project-level)
- In OpenCode specifically, this will be exposed via an **OpenCode plugin**
- The CLI may be enhanced later to generate this config

### KD-4: Phase-level capability annotation
- `required_capability` is an **optional** property on a workflow phase (`YamlState`)
- If absent, no special routing is applied (use the current/default model)
- Example:
  ```yaml
  phases:
    - name: Explore
      required_capability: research
    - name: Plan
      required_capability: thinking
    - name: Code
      required_capability: coding
  ```

### KD-5: Completely optional / no magic defaults
- The feature is fully opt-in
- If no capability config is provided, workflows behave exactly as today
- The CLI may later offer a wizard to generate the mapping

### KD-6: Reference — oh-my-openagent (OmO)
Researched https://github.com/code-yeongyu/oh-my-openagent (63.7k stars). OmO is agent-centric (11 named agents), uses category-based delegation, and has hardcoded provider fallback chains. Our approach is **phase-centric** and **instruction-based** rather than programmatic API routing — fundamentally different because codemcp workflows run inside the LLM's own context rather than as an external orchestrator.

### KD-7: Design approach — Approach B: Typed `required_capability` field on `YamlState`
- Add `required_capability?: string` as a first-class optional field on `YamlState`
- Update `state-machine-schema.json` for IDE auto-complete support
- Surface via `WhatsNextResult.required_capability?: string`
- Inject capability hint text in `InstructionGenerator.enhanceInstructions()` — covers both MCP server path and OpenCode plugin path automatically
- Follows the same established pattern as `allowed_file_patterns`

### KD-8: Capability→model mapping in `.vibe/config.yaml`
- New top-level key `capability_models: Record<string, string>` in `.vibe/config.yaml`
- Extends existing `ProjectConfig` interface in `packages/core/src/config-manager.ts`
- Pure opt-in: if `capability_models` is absent, no model name is shown in hints

### KD-9: Instruction text format — capability label always, model name if mapped
Generated text examples:
- Known capability + model mapped: `"Capability hint: This phase requires thinking capability (deep reasoning, complex planning). When launching subagents, prefer model: anthropic/claude-opus-4-7."`
- Self-evident/custom capability + model mapped: `"Capability hint: This phase requires coding capability. When launching subagents, prefer model: anthropic/claude-sonnet-4-5."`
- Known capability + no model mapped: `"Capability hint: This phase requires thinking capability (deep reasoning, complex planning)."`
- Self-evident/custom + no model mapped: `"Capability hint: This phase requires coding capability."`

### KD-10: Capability descriptions — hard-coded defaults, description optional
- Standard vocabulary (`thinking`, `research`, `coding`) ships with built-in descriptions
- Any custom capability string also works — if no description is registered, just the term is shown
- Description is omitted for self-evident terms (e.g. `coding` needs no explanation)
- Built-in descriptions:
  - `thinking` → "deep reasoning, complex planning"
  - `research` → "fast information gathering and browsing"
  - (others TBD during Structure/Plan phase)
- Users can use any string for `required_capability` — the system will echo unknown terms without a description

### KD-11: OpenCode agent-pinning — user-defined capability-agents in `.opencode/opencode.json`
Research finding: OpenCode supports custom agents in `.opencode/opencode.json` with a `model` field that pins a specific model. When the LLM calls the `task` tool with `subagent_type: "<agent-name>"`, OpenCode automatically uses the pinned model — no per-message model switching needed.

The plugin **cannot** register agents programmatically (no `agent` hook in the plugin API). Agents must be defined by the user in their `.opencode/opencode.json`. This is fully opt-in.

Example user setup:
```json
{
  "agent": {
    "general_thinking": {
      "mode": "subagent",
      "description": "General-purpose agent optimized for deep reasoning",
      "model": "anthropic/claude-opus-4-7"
    },
    "fast_explorer": {
      "mode": "subagent",
      "description": "Fast agent for information gathering",
      "model": "anthropic/claude-haiku-4-5"
    }
  }
}
```

### KD-12: Config shape — three-field capability entry in `.vibe/config.yaml`
Each capability entry in `capability_models` is a structured object with three optional fields:
- `model` — model ID string for instruction hint (e.g. `anthropic/claude-opus-4-7`)
- `agent` — OpenCode agent name to use when spawning subagents (user-defined, optional)
- (description comes from hard-coded defaults, not config)

Final `.vibe/config.yaml` shape:
```yaml
capability_models:
  thinking:
    model: anthropic/claude-opus-4-7     # shown in hint: "prefer model X"
    agent: general_thinking              # shown in hint: "use agent general_thinking"
  research:
    model: anthropic/claude-haiku-4-5
    agent: fast_explorer
  coding:
    model: anthropic/claude-sonnet-4-5
    agent: coder
```

All three fields are optional. Any combination works:
- Only `model`: shows model hint, no agent hint
- Only `agent`: shows agent hint, no model hint  
- Both: shows both
- Neither (or capability not in config): shows capability label only

### KD-13: Generated instruction text — full format with agent name
When `agent` is configured, the instruction hint tells the LLM the exact agent name to use with the `task` tool:

Examples:
- `thinking` + both configured: `"Capability hint: This phase requires thinking capability (deep reasoning, complex planning). When launching subagents, use agent: general_thinking (model: anthropic/claude-opus-4-7)."`
- `coding` + model only: `"Capability hint: This phase requires coding capability. When launching subagents, prefer model: anthropic/claude-sonnet-4-5."`
- `research` + agent only: `"Capability hint: This phase requires research capability (fast information gathering and browsing). When launching subagents, use agent: fast_explorer."`
- `coding` + nothing configured: `"Capability hint: This phase requires coding capability."`

### KD-15: Agreed capability annotations for existing built-in workflows

Annotation bar: **very strong, unambiguous need only**. Phases without a clear single capability winner are left unannotated.

#### qrspi.yaml
| Phase | Capability | Rationale |
|---|---|---|
| `research` | `research` | Pure fact-gathering, codebase exploration |
| `design` | `thinking` | Trade-off reasoning, approach proposals |
| `structure` | `thinking` | Decompose into vertical slices — non-trivial reasoning |
| `plan` | `thinking` | Detailed task breakdown, dependency reasoning |
| `implement` | `coding` | Explicitly delegates slices to fresh agent sessions |

#### epcc.yaml
| Phase | Capability | Rationale |
|---|---|---|
| `explore` | `research` | Codebase exploration and fact gathering |
| `plan` | `thinking` | Architecture decisions, design trade-offs |
| `code` | `coding` | Implementation — all files allowed |

#### greenfield.yaml
| Phase | Capability | Rationale |
|---|---|---|
| `ideation` | `thinking` | Deep requirements reasoning, problem space analysis |
| `architecture` | `thinking` | Tech stack trade-offs, architectural decisions |
| `code` | `coding` | Implementation |

#### waterfall.yaml
| Phase | Capability | Rationale |
|---|---|---|
| `requirements` | `research` | Stakeholder analysis, gathering facts |
| `design` | `thinking` | Architecture + technical design decisions |
| `implementation` | `coding` | Build phase |

#### bugfix.yaml
| Phase | Capability | Rationale |
|---|---|---|
| `reproduce` | `research` | Information gathering, log analysis |
| `analyze` | `thinking` | Root cause analysis — complex system reasoning |
| `fix` | `coding` | Implementation |
| `verify` | `thinking` | Test result reasoning, regression detection, edge cases |

#### tdd.yaml
| Phase | Capability | Rationale |
|---|---|---|
| `explore` | `research` | Understanding the problem space |
| `red` | `thinking` | Reasoning about what to test and how to specify expected behaviour |
| `green` | `coding` | Write implementation code |

#### pr-review.yaml
| Phase | Capability | Rationale |
|---|---|---|
| `review_architecture` | `thinking` | Structural reasoning, pattern evaluation |
| `review_correctness` | `thinking` | Logic and edge case analysis |

#### Deliberately not annotated
- `qrspi`: `questions`, `commit` — conversation/cleanup, no strong single capability
- `epcc`: `commit` — cleanup
- `greenfield`: `plan`, `finalize` — planning docs / cleanup
- `waterfall`: `qa`, `testing`, `finalize` — mixed or cleanup
- `tdd`: `refactor`, `done` — mixed editing / completion
- `pr-review`: `determine_intent`, `orient`, `review_quality`, `summarize`, `publish_review`
- `minor`: all — explicitly trivial, no strong differentiation
- `bugfix`: `finalize` — cleanup

### KD-14: OpenCode agent system — key findings
- Built-in agents: `build` (primary/default), `plan`, `general`, `explore`, `compaction`/`title`/`summary` (hidden internal)
- Agent config supports: `model`, `variant`, `temperature`, `top_p`, `prompt`, `description`, `mode`, `hidden`, `color`, `steps`, `permission`, `options`
- LLM spawns subagents via the `task` tool with `subagent_type` parameter (string agent name)
- Task tool has NO `model` parameter — model comes from the agent's config
- Agents inherit parent session model if no `model` is set in their config
- Agent definitions: `.opencode/opencode.json` `agent` key, or `.opencode/agents/*.md` markdown frontmatter

---

## Notes

- OmO's "category-based delegation" is the closest analogy: agents name a task type, the harness resolves the model. We adopt the same *concept* but implement it through workflow instructions rather than harness APIs.
- OmO distinguishes prompt families per model family (Claude = mechanics, GPT = principles). We should consider whether capability instructions should also include guidance on prompt style.
- Some harnesses (not OpenCode) may expose a model parameter for subagent launch — the instruction-based approach degrades gracefully: if the harness supports it, the agent can also pass the model name; if not, the instruction alone guides selection.
- The `.vibe/` config approach aligns with how other codemcp workflow configuration already works.

---

## Questions
### Tasks
- [x] Clarify routing mechanism (instruction-based vs. harness API)
- [x] Agree on capability vocabulary
- [x] Decide config location
- [x] Decide how capability is declared per phase
- [x] Decide on default/fallback behavior
- [x] Research oh-my-openagent for prior art

### Completed
- [x] Created development plan file
- [x] Researched oh-my-openagent architecture
- [x] Gathered user answers to all clarifying questions
- [x] Documented all key decisions

---

## Research
### Tasks
- [x] Understand existing workflow YAML format and `YamlState`/`YamlStateMachine` types
- [x] Understand how phase instructions reach the LLM (InstructionGenerator + plugin hooks)
- [x] Understand existing config system (ConfigManager + `.vibe/config.yaml`)
- [x] Understand plugin system (PluginHooks: `afterInstructionsGenerated`)
- [x] Identify all touch points for adding `required_capability` to a phase
- [x] Understand the schema (`state-machine-schema.json`) and how it validates YAMLs
- [x] Check existing use of `metadata` on state machine and `YamlState`

### Findings

#### F-1: `YamlState` is the per-phase type (packages/core/src/state-machine-types.ts)
Current fields: `description`, `default_instructions`, `transitions`, `allowed_file_patterns?`.
**`required_capability` would be a new optional field here.**

#### F-2: `YamlStateMachine.metadata` is workflow-level, not phase-level
Metadata on the top-level state machine (`requiresDocumentation`, `domain`, `complexity`, etc.) is workflow-scoped. Capability is phase-scoped, so it belongs on `YamlState`, not `YamlStateMachine.metadata`.

#### F-3: `state-machine-schema.json` is the JSON Schema for YAML validation
New field would need to be added to the `state` definition there for IDE auto-complete support.

#### F-4: `ConfigManager` already reads `.vibe/config.yaml` (packages/core/src/config-manager.ts)
Currently only `enabled_workflows` is supported. The capability→model mapping could be added as a new top-level key (e.g., `capability_models`) in the same file, or a separate `.vibe/capabilities.yaml`. The `ProjectConfig` interface would need extension.

#### F-5: Instruction delivery path
Instructions flow: `WhatsNextHandler` → `TransitionEngine.analyzePhaseTransition` → `InstructionGenerator.generateInstructions` → OpenCode plugin `chat.message` hook injects as synthetic part. The `InstructionGenerator.enhanceInstructions` method appends workflow guidance text at the end of every response. **This is the natural injection point for capability hints.**

#### F-6: Plugin system provides `afterInstructionsGenerated` hook (packages/mcp-server/src/plugin-system/plugin-interfaces.ts)
A new plugin (or extension of existing ones) can intercept `afterInstructionsGenerated` to append capability routing text to instructions. This is already used for the commit plugin and beads plugin. The hook receives `PluginHookContext` with `currentPhase` and `workflow`, which is enough to look up the phase's `required_capability`.

#### F-7: `InstructionGenerator.enhanceInstructions` already appends structured guidance (packages/core/src/instruction-generator.ts)
The `workflowSection` string is assembled there. The capability hint could be inserted here directly (in core), avoiding the plugin system. This keeps it in the core package alongside other phase metadata like `allowedFilePatterns`.

#### F-8: `allowedFilePatterns` is the closest existing parallel
`allowed_file_patterns` on `YamlState` → passed through `WhatsNextResult.allowed_file_patterns` → used in plugin to block file edits. `required_capability` would follow the same pattern: stored on state, surfaced in `WhatsNextResult`, used in plugin to inject instruction text.

#### F-9: `WhatsNextResult` is the boundary between core and plugin (packages/mcp-server/src/tool-handlers/whats-next.ts)
Currently: `{ phase, instructions, plan_file_path, allowed_file_patterns }`. Adding `required_capability?: string` here would propagate it to the plugin layer cleanly.

#### F-10: Capability config lookup requires knowing the phase's capability + the user's mapping
The lookup: `phaseCapability = state.required_capability` → look up `capabilityModelMapping[phaseCapability]` from `.vibe/config.yaml` → format instruction text. If either is missing, no instruction is added (opt-in).

#### F-11: Instruction text must be actionable for the LLM
Because the mechanism is instruction-based, the generated text must tell the LLM *what to do*: e.g., "This phase requires **thinking** capability. When launching subagents, prefer a model optimized for deep reasoning (e.g., `anthropic/claude-opus-4-7`). If no subagent is launched, continue with the current model." The exact wording matters — it must be unambiguous.

#### F-12: OpenCode plugin is the right place for config read + instruction injection (for OpenCode harness)
The plugin reads `.vibe/config.yaml` for other config (indirectly via ConfigManager). It could read capability config and inject text via `afterInstructionsGenerated` hook OR in the `chat.message` hook when building the synthetic part. The MCP server path also needs to handle this for non-OpenCode harnesses.

#### F-13: Two delivery paths exist — MCP server and OpenCode plugin
- **MCP server path** (`whats_next` tool): used by harnesses that call MCP tools directly (e.g., Claude Desktop, Amazon Q). Instructions returned in `WhatsNextResult.instructions`.
- **OpenCode plugin path**: uses hooks + synthetic `chat.message` parts. The `afterInstructionsGenerated` plugin hook is the cleanest injection point here.
Both paths ultimately call `InstructionGenerator.generateInstructions`, so injecting in `InstructionGenerator` covers both paths at once.

#### F-14: Existing `ProjectConfig` and `ConfigManager` are in `packages/core`
The capability→model mapping config would also live in core (alongside `enabled_workflows`), making it accessible from both the MCP server and opencode-plugin without circular deps.

#### F-15: No existing mechanism for subagent model selection in workflow instructions
Currently, the `implement` phase of `qrspi.yaml` says "Delegate each slice to a fresh agent session with focused context" — but there's no instruction about *which* model to use for that agent. The capability routing feature would fill this gap by appending model-selection guidance to phase instructions when a capability is configured.

#### F-16: `resources/agents/` folder exists but contains crowd-workflow agent definitions
Files: `architect.yaml`, `business-analyst.yaml`, `developer.yaml`. These are role-based agents for collaborative workflows (crowd), not model-capability routing. Not directly relevant but confirms the pattern of declarative agent/role config in YAML.

---

## Design
### Tasks
- [x] Read existing design.md and architecture.md for context
- [x] Propose 2–3 high-level design approaches with trade-offs
- [x] Get user consensus on approach (B: typed `required_capability` field)
- [x] Clarify instruction source (hard-coded defaults, any custom string echoed)
- [x] Clarify instruction style (capability label always; model name if mapped; description omitted for self-evident terms)
- [x] Clarify opt-in model (pure opt-in; no defaults shipped)
- [x] Research OpenCode plugin API — can plugin switch models?
- [x] Research OpenCode agent system — can agents pin models?
- [x] Decide on OpenCode-specific delivery (user-defined capability-agents in `.opencode/opencode.json`)
- [x] Decide on config shape (three-field: model + agent + implicit description)
- [x] Decide on instruction text format including agent name
- [x] Analyse all existing workflows for phase capability annotations
- [x] Get user confirmation on borderline phases (tdd:red→thinking, bugfix:verify→thinking, qrspi:plan→thinking)
- [x] Document all decisions in plan file (KD-7 through KD-15)

### Completed
- [x] Agreed design direction: Approach B — typed field, InstructionGenerator injection, `.vibe/config.yaml` mapping
- [x] Agreed OpenCode delivery: instruction hint names the user-defined capability-agent; user defines agents in `.opencode/opencode.json` with pinned model
- [x] Agreed capability annotations for all existing workflows (see KD-15)
- [x] Full design complete — ready for Structure phase

## Structure
### Tasks
- [x] Review architecture.md and key source files (YamlState, ConfigManager, InstructionGenerator, WhatsNextHandler, JSON schema)
- [x] Define vertical slices — each independently deliverable with clear test criteria
- [x] Confirm slice order and dependencies
- [x] Document slices in plan file

### Vertical Slices

#### Slice 1 — Schema & type foundation
**Delivers**: `required_capability` is a recognized, auto-completable field in workflow YAML files. Authors get no schema error when using it.

**Components touched**:
- `packages/core/src/state-machine-types.ts` — add `required_capability?: string` to `YamlState`
- `resources/state-machine-schema.json` — add `required_capability` to the `state` definition

**Does NOT include**: any runtime use of the field; no instruction changes; no config reading.

**How to verify**: Write `required_capability: thinking` in any workflow phase. IDE schema validation passes; TypeScript compiles; existing tests pass (no regressions).

---

#### Slice 2 — Capability hint in instructions (no config)
**Delivers**: When a phase has `required_capability`, the generated instruction text includes a capability hint: label + built-in description (for `thinking`/`research`). Model and agent fields are absent (no config lookup yet).

**Components touched**:
- `packages/core/src/interfaces/instruction-generator.interface.ts` — add `requiredCapability?: string` to `InstructionContext`
- `packages/mcp-server/src/tool-handlers/whats-next.ts` — read `phaseState.required_capability`, pass it into `InstructionContext`
- `packages/core/src/instruction-generator.ts` — in `enhanceInstructions()`, append capability hint text when `requiredCapability` is set

**Does NOT include**: config file reading; model/agent fields in the hint.

**How to verify**: Add `required_capability: thinking` to a test workflow phase. Call `whats_next` for that phase. The returned `instructions` string contains `"Capability hint: This phase requires thinking capability (deep reasoning, complex planning)."`.

---

#### Slice 3 — Config-driven model & agent hint
**Delivers**: When the user adds `capability_models` to `.vibe/config.yaml`, the capability hint is enriched with the configured model and/or agent name.

**Components touched**:
- `packages/core/src/config-manager.ts` — extend `ProjectConfig` with `capability_models?: Record<string, { model?: string; agent?: string }>`, extend `validateConfig` for the new field
- `packages/core/src/interfaces/instruction-generator.interface.ts` — add `capabilityConfig?: { model?: string; agent?: string }` to `InstructionContext`
- `packages/mcp-server/src/tool-handlers/whats-next.ts` — load `ProjectConfig`, look up `capability_models[required_capability]`, pass result into `InstructionContext`
- `packages/core/src/instruction-generator.ts` — use `capabilityConfig` to append model/agent fields to the hint

**Does NOT include**: annotating built-in workflows.

**How to verify**: Add `capability_models: { thinking: { model: anthropic/claude-opus-4-7, agent: my_thinker } }` to `.vibe/config.yaml`. Call `whats_next` for a phase with `required_capability: thinking`. Returned instructions contain `"use agent: my_thinker (model: anthropic/claude-opus-4-7)"`.

---

#### Slice 4 — Annotate existing built-in workflows
**Delivers**: All phases listed in KD-15 across the 7 built-in workflows (`qrspi`, `epcc`, `greenfield`, `waterfall`, `bugfix`, `tdd`, `pr-review`) have `required_capability` set. Users of these workflows get capability hints out-of-the-box without any configuration.

**Components touched**:
- `resources/workflows/qrspi.yaml` — 5 phases annotated
- `resources/workflows/epcc.yaml` — 3 phases annotated
- `resources/workflows/greenfield.yaml` — 3 phases annotated
- `resources/workflows/waterfall.yaml` — 3 phases annotated
- `resources/workflows/bugfix.yaml` — 4 phases annotated
- `resources/workflows/tdd.yaml` — 3 phases annotated
- `resources/workflows/pr-review.yaml` — 2 phases annotated

**Depends on**: Slice 1 (valid YAML), Slice 2 (hints appear in instructions).

**How to verify**: Start any annotated workflow (e.g., `epcc`) and call `whats_next` at `explore` phase. Instructions contain `"Capability hint: This phase requires research capability..."`. No user config needed.

---

#### Slice dependencies & order
```
Slice 1 (types + schema)
    ↓
Slice 2 (instruction hint, no config)
    ↓               ↓
Slice 3 (config)  Slice 4 (workflow annotations)
```
Slices 3 and 4 are independent of each other; both depend on 1 and 2.
Recommended implementation order: 1 → 2 → 3 → 4.

### Completed
- [x] All 4 vertical slices defined with components, user-visible value, and verification criteria

## Plan
### Plan-level decisions (KD-16 through KD-18)

### KD-16: Capability-hint formatter is core-internal; only `InstructionGenerator` uses it
**Decision**: Introduce a small pure helper in `packages/core` used **only** by the core `InstructionGenerator.enhanceInstructions()`:
```ts
// packages/core/src/capability-hint.ts (new file)
export interface CapabilityConfig { model?: string; agent?: string }
const CAPABILITY_DESCRIPTIONS: Record<string, string> = {
  thinking: 'deep reasoning, complex planning',
  research: 'fast information gathering and browsing',
  // coding: intentionally omitted (self-evident, per KD-10)
};
export function formatCapabilityHint(
  capability: string | undefined,
  config?: CapabilityConfig
): string { /* returns "" when capability absent */ }
```
The helper exists for unit-testability of the formatting logic; it is not a shared cross-generator contract.

### KD-17: `start_development` does not need a capability hint
**User direction**: at development start, no special (capability) instruction is needed.

**Finding**: `start-development.ts` does NOT use `InstructionGenerator`. It builds instructions via `context.planManager.getInitialPlanGuidance()` (line ~271) and only the `afterInstructionsGenerated` hook enriches them. The initial workflow phase guidance therefore never flows through `enhanceInstructions()`.

**Decision**: Capability hints are scoped to the `InstructionGenerator` path only (i.e., `whats_next` + `proceed_to_phase` + OpenCode plugin's `WhatsNextHandler` fallback + buffered instructions from those tools). The very first `start_development` response will NOT contain a capability hint; the immediately-following `whats_next` will. No `start_development` change is required or planned.

### KD-18: Other instruction generators (beads) do NOT inject capability hints
**User direction**: the other instruction generators should only add their own instructions — they must not get access to the capability-hint helper.

**Decision**: `BeadsInstructionGenerator` (`packages/mcp-server/src/components/beads/beads-instruction-generator.ts`) continues to add **only** its beads-specific instructions. It does **not** call `formatCapabilityHint()`. Consequence: beads-configured projects will not receive capability hints — this is intentional per user direction.

The `InstructionContext` interface still gains `requiredCapability?` and `capabilityConfig?` (Slices 2 & 3) since it is the shared contract, but the beads generator simply ignores these fields. No interface plumbing differs between the two generators; only the core generator consumes the new fields.

---

## CLI capability generator (follow-up scope — Slice 5)

User feedback during Implement: the `.vibe/config.yaml` mapping is opt-in but hard to author by hand. Add a one-command CLI wizard that generates both the user-side OpenCode agent files and the matching `capability_models` entries.

### KD-19: New `setup capabilities` subcommand (PLURAL; required target)
**Decision**: Add `setup capabilities <target>` (plural) as a new subcommand under the existing `setup` umbrella. Matches the established `setup <target> --mode config|skill` pattern (target is required positional). Signature:

```
setup capabilities <target> [--model-thinking <model>] [--model-coding <model>] [--model-research <model>] [--force]
```

- `<target>` is **required** (positional, e.g. `opencode`, `kiro`, `claude`, `gemini`, `vscode`).
- Each `--model-<capability>` flag is **optional**; the user provides only the ones they want to wire up. At least one is required.
- `--force` overwrites existing per-target agent files. Default: refuse to overwrite (warn + skip).
- Validation: target required; at least one `--model-*` flag required; unknown flags ⇒ clear error; non-empty string values required.
- Discoverability: `setup capabilities --help` prints the full usage (target list, model flags, examples). No `setup capabilities list` subcommand — the help text is the source of truth.
- Update `showHelp()` to document the new subcommand (one line per subcommand; details in `--help`).

### KD-23: Multi-target capability generator architecture (mirrors `ConfigGenerator` pattern)
**Decision**: Refactor `capability-generator.ts` to follow the same per-target registry pattern used by `ConfigGenerator` and `SkillGenerator`:
- `CapabilityGenerator` abstract base class (target-specific: knows its template path, output path, file extension, and per-capability rendering rules; provides a shared helper for writing the target-agnostic `.vibe/config.yaml` `capability_models` block).
- `CapabilityGeneratorRegistry` static registry (mirrors `GeneratorRegistry`): `register(metadata)`, `createGenerator(name)`, `getHelpText()`, `exists(name)`.
- `OpencodeCapabilityGenerator extends CapabilityGenerator`: the only fully-implemented generator today. Owns the `resources/templates/opencode-agents/<capability>.md.tmpl` resolution, `.opencode/agents/<capability>.md` output path, `.md` file format, `mode: subagent` frontmatter.
- Other targets (`kiro`, `claude`, `gemini`, `vscode`, `github-copilot`) are **registered but not implemented** — they throw a clear `"capability generation for <target> is not yet supported"` error when invoked. This signals extensibility (visible in `setup capabilities --help`) without requiring implementation work today.
- Public API: `generateCapabilities(target, opts)` top-level function dispatches via the registry. Same call signature as before, plus a `target` parameter.
- File layout:
  - `packages/cli/src/capability-generator.ts` — base class + registry + top-level dispatch + `OpencodeCapabilityGenerator` (single file, mirrors how `config-generator.ts` keeps all target classes + registry together).

**Why this is in scope now**: the user observed that the Slice 5 generator was too OpenCode-specific. Following the existing per-target pattern keeps the codebase consistent and makes adding a new target a single-class addition. Per KD-3 and KD-5, the CLI is the natural home for this generator; the per-target structure is the natural shape.

### KD-24: `setup capabilities --help` discoverability
- The help text lists: (1) every registered target with its status (✅ supported / ⏳ not yet supported), (2) the model flags, (3) the `--force` flag, (4) one concrete usage example.
- A target listed as "not yet supported" still appears in the help so users know the wizard could grow; trying to use it produces a clear error pointing at `--help`.
- The base `showHelp()` (top-level) shows a one-line summary of `setup capabilities <target>`; details are in `setup capabilities --help`.

### KD-20: Generated files and config wiring
For each provided `--model-<capability>`:
1. **Generate `.opencode/agents/<capability>.md`** (plural directory per OpenCode docs; `<capability>` matches the `required_capability` value, so `thinking.md`/`coding.md`/`research.md`).
2. **Merge `capability_models[<capability>]` into `.vibe/config.yaml`** with `{ model: <chosen>, agent: <capability> }`. Preserve all other keys (`enabled_workflows`, other `capability_models` entries, anything else).
3. **Print a per-file/per-config summary** at the end (files written, files skipped, config keys added/merged).

### KD-21: All generated agents are `mode: subagent`
- The LLM delegates capability-routed work to these agents via the `task` tool. `subagent` is the right mode for all three.
- For `coding` (derived from OpenCode's `build` agent which is `mode: primary`): we intentionally use `subagent` because the LLM should invoke it as a worker, not as the primary session.
- The agent **prompt body** for each capability is shipped as a template under `packages/cli/resources/templates/opencode-agents/<capability>.md.tmpl` (a YAML-frontmatter skeleton + a reasonable capability-themed system prompt). The template variables are `${capability}` and `${model}`. Rationale: OpenCode's built-in agent prompts ship with the OpenCode binary, not as resources accessible from this CLI; the templates give users a known-good starting point they can edit post-generation.

### KD-22: Config + file merge semantics
- `.vibe/config.yaml` merge: read existing via `ConfigManager.loadProjectConfig(projectPath)`; if `null`, create the file with just the new `capability_models` block; if present, deep-merge `capability_models` per-key (new entries added, existing entries overwritten with the user's CLI choice, other keys untouched). Round-trip through `js-yaml` to keep the file valid.
- `.opencode/agents/*.md` overwrite: if file exists and `--force` is not passed, skip with a warning. (Re-running the wizard should be safe and idempotent when `--force` is omitted.)
- Directory creation: `mkdir -p` `.opencode/agents` and `.vibe` (the latter may not exist if user has no `enabled_workflows` yet).
- Errors: any I/O failure throws and exits with non-zero status; print a single clear error line.

---

## Plan tasks

### Slice 1 — Schema & type foundation
- [x] **1.1** In `packages/core/src/state-machine-types.ts`, add `required_capability?: string` to `YamlState` with a JSDoc comment mirroring the `allowed_file_patterns?` style (explaining: optional capability hint for this phase; absent = no routing; free-form string, conventional values `thinking`/`research`/`coding`).
- [x] **1.2** In `resources/state-machine-schema.json`, add a `required_capability` property (type `string`) to `definitions/state.properties` with a description. Do NOT add it to `required`.
- [x] **1.3** Verified: `pnpm build` green (6/6 turbo tasks); core tests 385 passed, mcp-server 286 passed, opencode 64 passed; `pnpm lint` clean. Exactly 2 files in `git diff --stat` (12 insertions).

**Dependencies**: none. **Risks**: none beyond typos.

---

### Slice 2 — Capability hint in instructions (no config)
- [x] **2.1** Created `packages/core/src/capability-hint.ts` with `CapabilityConfig`, `CAPABILITY_DESCRIPTIONS` (`thinking`+`research` only), and `formatCapabilityHint()` implementing the full KD-9/KD-13 format (label sentence + model/agent clause branches). Returns `''` when `!capability`.
- [x] **2.2** Exported `formatCapabilityHint` and `CapabilityConfig` via `packages/core/src/index.ts` (added `export * from './capability-hint.js'`).
- [x] **2.3** Extended `InstructionContext` with `requiredCapability?: string` and `capabilityConfig?: CapabilityConfig` (imported via `../capability-hint.js`).
- [x] **2.4** In `InstructionGenerator.enhanceInstructions()`, appended the hint right after the file-restriction block, before the `Call whats_next()` line. Empty hint → not appended (opt-in).
- [x] **2.5** (removed per KD-18 — beads generator untouched.)
- [x] **2.6** Wired `requiredCapability: phaseState?.required_capability` into `whats-next.ts` and `proceed-to-phase.ts` InstructionContext construction. No `capabilityConfig` passed yet (Slice 3).
- [x] **2.7** Plugin path verified: `plugin.ts` forwards/buffers only `instructions` (setBufferedInstructions ~L233–240, chat.message ~L421–433, deletions/forwarding ~L487/589/669). Hint flows through automatically — no plugin code change needed.
- [x] **2.8** Added `capability hint integration` block to `instruction-generator.test.ts` (thinking embeds; coding embeds without parens + `not.toContain('capability (')`; absent → regression guard `not.toContain('Capability hint')`).
- [x] **2.9** Created `packages/core/test/unit/capability-hint.test.ts` (13 tests covering undefined/empty, thinking, research, coding, custom, unknown, undefined/empty config, agent-only, model-only, both, both-undefined, coding+clause).

**Dependencies**: Slice 1 (so `phaseState.required_capability` is typed). **Risks resolved**:
- *R-1* resolved: confirmed opencode plugin forwards `instructions` only (no structured `required_capability` consumer) → NOT adding a `required_capability` field to `WhatsNextResult`. Hint lives inside `instructions`. Smaller API surface.

**Verified**: `pnpm build` 6/6; core tests 401 passed (includes 13 new `capability-hint` + 12 instruction-generator); server 286 passed; opencode 64 passed; `pnpm lint` clean. `git diff --stat` shows only the expected Slice 1 + Slice 2 files; no `start-development.ts`, no beads files.

---

### Slice 3 — Config-driven model & agent hint
- [x] **3.1** Extended `ProjectConfig` with `capability_models?: Record<string, { model?: string; agent?: string }>`.
- [x] **3.2** Extended `validateConfig`: rejects non-object record, non-object entry, array entry, numeric/null/empty-string `model`/`agent`; allows empty entry `{}` and empty record `{}`. Error messages use `Invalid config file ${configPath}: ...` style.
- [x] **3.3** `formatCapabilityHint` model/agent rendering already complete from Slice 2 — re-verified KD-13 branches; no change.
- [x] **3.4** Wired config lookup in `whats-next.ts` + `proceed-to-phase.ts`: `ConfigManager.loadProjectConfig(conversationContext.projectPath)` (static, imported from `@codemcp/workflows-core`), `capabilityConfig = requiredCapability ? projectConfig?.capability_models?.[requiredCapability] : undefined`. Null config handled gracefully.
- [x] **3.5** Added `packages/core/test/unit/config-manager.test.ts` (~16 cases incl. empty-entry `{}`, empty record, absent, non-object record, array, null, string entry, numeric/empty/null model+agent, agent-only valid). Added instruction-generator test: `requiredCapability='thinking'` + `capabilityConfig={ agent:'general_thinking', model:'anthropic/claude-opus-4-7' }` → contains `"use agent: general_thinking (model: anthropic/claude-opus-4-7)"`. `capability-hint.test.ts` clause cases already covered from Slice 2.
- [x] **3.6** Integration test skipped — unit coverage (formatter + config + instruction-generator) deemed sufficient; no lightweight e2e harness directly exercised `whats_next` instructions with fixtures without cost.

**Dependencies**: Slice 2 (formatter + InstructionContext field). **Risks resolved**:
- *R-2* (perf): per-call `loadProjectConfig` accepted; caching is a possible follow-up, not implemented now.
- *R-3* (debug logging): done — `loadProjectConfig` log line now includes `capabilityModels: <count>` (0 when absent).

**Verified**: `pnpm build` 6/6; core tests 418 passed (34 files, incl. new `config-manager.test.ts` + instruction-generator additions); server + opencode tests green; `pnpm lint` clean. `git diff --stat` shows only the expected files; `capability-hint.ts` unchanged, no `start-development.ts`, no beads files, no workflow YAMLs.

---

### Slice 4 — Annotate existing built-in workflows
- [x] **4.1** Annotated all 23 phases across 7 workflows per KD-15. Placed `required_capability` after `description:`, before `allowed_file_patterns:` (or before `default_instructions:` in pr-review which has no `allowed_file_patterns`). Counts: qrspi 5, epcc 3, greenfield 3, waterfall 3, bugfix 4, tdd 3, pr-review 2 = 23 insertions.
- [x] **4.2** No "DO NOT annotate" phases touched; `resources/workflows/minor.yaml` untouched.
- [x] **4.3** Schema validation passes — all workflow-loading tests green after `pnpm build` (which runs `copy-workflows` to refresh the build-generated `packages/core/resources/workflows/` copy used at test time). Source of truth remains root `resources/workflows/`.
- [x] **4.4** Spot-check via new `packages/core/test/unit/capability-annotation-spot-check.test.ts`: loads real built-in YAMLs via `WorkflowManager` (no mocks); asserts every annotated phase has the expected `required_capability`, every "DO NOT annotate" phase has `undefined`, and feeding the loaded capability through `formatCapabilityHint(capability, undefined)` yields the exact label-only hint (e.g. epcc `explore` → `"Capability hint: This phase requires research capability (fast information gathering and browsing)."`; also qrspi `implement` coding, pr-review `review_architecture` thinking). 49 assertions pass.

**Dependencies**: Slices 1 + 2. **Risks resolved**:
- *R-4* resolved: every KD-15 semantic phase name matched the actual YAML state key 1:1 — no remapping needed.

**Verified**: `pnpm build` 6/6; core tests 467 passed (35 files, incl. 49 new spot-check assertions); server 286 passed; opencode 64 passed; `pnpm lint` clean. `git diff --stat` shows only the 7 workflow YAMLs + the new spot-check test file (plus pre-existing Slice 1–3 source changes already committed-to-tree).

---

### Slice 5 — CLI capability generator (`setup capabilities`)
**Delivers**: A single CLI command that, for each `--model-<capability>` provided, writes a user-side per-target agent file (e.g. `.opencode/agents/<capability>.md` for OpenCode) and merges the matching entry into `.vibe/config.yaml` `capability_models`. This is the wizard KD-3/KD-5 promised — "one command, full capability-routing setup". The generator is target-aware (KD-23), with OpenCode as the only currently-implemented target.

**Components touched**:
- `resources/templates/opencode-agents/{thinking,coding,research}.md.tmpl` — NEW templates (3 files, YAML frontmatter + system prompt body; `${capability}` and `${model}` placeholders). Located at the canonical root `resources/templates/` (not in `packages/cli/resources/` which is a build artifact).
- `packages/cli/src/capability-generator.ts` — NEW module: `CapabilityGenerator` abstract base class, `CapabilityGeneratorRegistry` (mirrors `GeneratorRegistry`), `OpencodeCapabilityGenerator` concrete impl, top-level `generateCapabilities(target, opts)` dispatch.
- `packages/cli/src/cli.ts` — wire `setup capabilities <target>` subcommand into `parseCliArgs`; handle `--help`; update `showHelp()`; add a `handleSetupCapabilities` helper.
- `packages/cli/test/capability-generator.test.ts` — NEW unit tests.

**Depends on**: Slices 1–3 (so the schema, hint formatter, and `ProjectConfig.capability_models` exist). Slice 4 NOT required.

**How to verify**: Run `pnpm build && node packages/cli/dist/index.js setup capabilities opencode --model-thinking anthropic/claude-opus-4-7 --model-coding anthropic/claude-sonnet-4-5 --model-research anthropic/claude-haiku-4-5` in a temp dir; assert `.opencode/agents/{thinking,coding,research}.md` exist with the chosen `model:` field and `mode: subagent`; assert `.vibe/config.yaml` contains the matching `capability_models` entries. Re-run without `--force` ⇒ all files skipped, no overwrite. Re-run with `--force` ⇒ files rewritten. Run the new CLI unit tests; ensure `pnpm build` + `pnpm lint` green. `node packages/cli/dist/index.js setup capabilities --help` lists the supported targets + flags.

**Out of scope**: implementing non-OpenCode targets (kiro, claude, gemini, vscode, github-copilot) — the architecture supports them but they throw "not yet supported" today; adding new built-in capability vocabulary (we reuse `thinking`/`coding`/`research`); an interactive prompt-based wizard (CLI flags only for v1).

---

### Updated slice dependency graph (with Slice 5b)
```
Slice 1 (types + schema)
    ↓
Slice 2 (instruction hint, no config)
    ↓               ↓
Slice 3 (config)  Slice 4 (workflow annotations)
    ↓
Slice 5 (CLI generator v1 — target-blind, OpenCode-only)
    ↓
Slice 5b (multi-target refactor — adds registry + required target arg)
```
Slices 3, 4 are independent of each other. Slice 5 depends on Slices 1+3. Slice 5b depends on Slice 5. Recommended implementation order: 1 → 2 → 3 → 4 → 5 → 5b.

### Slice 5 — Plan tasks

- [x] **5.1** Created `resources/templates/opencode-agents/{thinking,coding,research}.md.tmpl` (canonical root location, mirrored from `resources/templates/skills/`). Each has YAML frontmatter (`description`, `mode: subagent`, `model: ${model}`) + capability-themed prompt body. Placeholders: `${capability}`, `${model}`.
- [x] **5.2** Created `packages/cli/src/capability-generator.ts` with `CapabilityGeneratorOptions`, `CapabilityGeneratorResult`, `generateCapabilities(opts)` (note: initial v1 implementation is OpenCode-only and not target-aware — see Slice 5b for the refactor).
- [x] **5.3** Wired `setup capability` (v1, no target argument) into `cli.ts`; updated `showHelp()`; added `handleSetupCapability`.
- [x] **5.4** Added `packages/cli/test/capability-generator.test.ts` with 8 tests (happy path, empty, partial, overwrite protection, --force, config preservation, per-key merge, idempotency).
- [x] **5.5** Build + tests + lint green. E2E smoke-tested the wired command (artifacts cleaned up).
- [x] **5.6** Help text added in `showHelp()` showing `setup capability` + flags.

**Dependencies**: Slices 1 + 3. **Risks resolved**:
- *R-5* mitigated: `yaml.dump` with `noRefs: true, sortKeys: false`.
- *R-6* noted (not a correctness concern).
- *R-7* verified: `${...}` placeholders do not conflict with OpenCode YAML frontmatter.

**Slice 5 follow-up (per user feedback)**: the v1 implementation is too OpenCode-specific. Refactor to follow the per-target registry pattern used by `ConfigGenerator` and `SkillGenerator` so future targets (kiro, claude, gemini, vscode, github-copilot) can be added without restructuring. See Slice 5b below.

---

### Slice 5b — Multi-target capability generator (refactor)
**Delivers**: `capability-generator.ts` is restructured to follow the per-target registry pattern. The `setup capabilities` command takes a required `<target>` positional arg (plural command name per user direction; `setup capabilities opencode` etc.). Only OpenCode is fully implemented; other targets (kiro, claude, gemini, vscode, github-copilot) are registered but throw a clear "not yet supported" error when invoked, signaling extensibility via `setup capabilities --help`.

**Components touched**:
- `packages/cli/src/capability-generator.ts` — refactor to add `CapabilityGenerator` abstract base class, `CapabilityGeneratorRegistry` (mirrors `GeneratorRegistry`), `OpencodeCapabilityGenerator` concrete impl. Top-level `generateCapabilities(target, opts)` dispatches via the registry. `KiroCapabilityGenerator`, `ClaudeCapabilityGenerator`, `GeminiCapabilityGenerator`, `VSCodeCapabilityGenerator`, `GithubCopilotCapabilityGenerator` stub classes that throw "not yet supported".
- `packages/cli/src/cli.ts` — rename `setup capability` to `setup capabilities <target>`; target is required positional; handle `--help`; update `showHelp()`; update error messages.
- `packages/cli/test/capability-generator.test.ts` — update tests to pass `target` parameter; add tests for the registry (resolve `opencode` ⇒ real generator; other targets throw "not yet supported" with clear message); add a test for the help-text / discoverability contract.

**Depends on**: Slice 5 (the v1 implementation to be refactored).

**How to verify**:
- `pnpm build` green.
- `pnpm --filter @codemcp/workflows-cli test` green (existing 8 tests updated to pass `target` + ~3 new registry/discoverability tests).
- `pnpm lint` clean.
- `node packages/cli/dist/index.js setup capabilities --help` lists all registered targets with status indicators (✅ supported / ⏳ not yet supported), the model flags, `--force`, and a usage example.
- `node packages/cli/dist/index.js setup capabilities opencode --model-thinking X` still works end-to-end (writes `.opencode/agents/thinking.md` and merges `capability_models` into `.vibe/config.yaml`).
- `node packages/cli/dist/index.js setup capabilities kiro` exits non-zero with a clear "not yet supported — see `setup capabilities --help`" error.
- `git diff --stat` shows changes ONLY in `packages/cli/src/capability-generator.ts`, `packages/cli/src/cli.ts`, `packages/cli/test/capability-generator.test.ts`. The 3 template files in `resources/templates/opencode-agents/` and the `package.json` (js-yaml) are unchanged.

**Out of scope**: implementing kiro/claude/gemini/vscode/github-copilot generators (the architecture supports them, but they throw today); modifying the templates; changing the `capability_models` config format.

### Slice 5b — Plan tasks

- [ ] **5b.1** Refactor `packages/cli/src/capability-generator.ts`:
  - Define `CapabilityGenerator` abstract base class with:
    - `readonly name: string` and `readonly description: string` (set in subclass)
    - `abstract getOutputPath(capability: SupportedCapability, projectPath: string): string`
    - `abstract renderCapabilityFile(capability: SupportedCapability, model: string): string` (returns file content; subclass owns template loading + substitution)
    - `generate(opts: CapabilityGeneratorOptions): CapabilityGeneratorResult` (concrete in base): for each provided capability, calls `getOutputPath` + `renderCapabilityFile` + handles overwrite protection + merges `capability_models` into `.vibe/config.yaml` (target-agnostic, lives in the base). Returns the unified result.
  - Define `OpencodeCapabilityGenerator extends CapabilityGenerator`:
    - `name: 'opencode'`, `description: 'Generate .opencode/agents/<capability>.md files'`
    - `getOutputPath(capability, projectPath)`: `path.join(projectPath, '.opencode', 'agents', \`${capability}.md\`)`
    - `renderCapabilityFile(capability, model)`: load `resources/templates/opencode-agents/<capability>.md.tmpl` (use the same multi-path resolution as v1), substitute `${capability}` and `${model}`, return rendered content.
  - Define stub generators for `kiro`, `claude`, `gemini`, `vscode`, `github-copilot`: each sets `name` + `description` and throws a clear `Error("Capability generation for <target> is not yet supported — see \`setup capabilities --help\`")` from `getOutputPath` (or any abstract method that gets called first). Mark in JSDoc as "stub: implementation pending".
  - Define `CapabilityGeneratorRegistry` (static, mirrors `GeneratorRegistry`):
    - `register(metadata: { name; description; generatorClass; supported: boolean })`
    - `createGenerator(name): CapabilityGenerator` (throws if unknown OR if `supported === false` with the "not yet supported" message)
    - `getAllGenerators(): Array<{...}>`
    - `getHelpText(): string` (formats all generators with their status indicator)
    - `exists(name): boolean`
  - Register all 6 generators in module-init code. `opencode` has `supported: true`; the other 5 have `supported: false`.
  - Top-level `export function generateCapabilities(target: string, opts: CapabilityGeneratorOptions): CapabilityGeneratorResult` dispatches via `CapabilityGeneratorRegistry.createGenerator(target)`.
  - Keep exporting `CapabilityGeneratorOptions`, `CapabilityGeneratorResult`, `SupportedCapability`, `SUPPORTED_CAPABILITIES` for callers and tests.
- [ ] **5b.2** Update `packages/cli/src/cli.ts`:
  - Rename `handleSetupCapability` → `handleSetupCapabilities`.
  - The new signature: `handleSetupCapabilities(args: string[])`. The first arg is the target (positional). Remaining args are flags.
  - Parse target (required). If missing, print usage + non-zero exit.
  - Handle `setup capabilities --help` (when target is `--help` or `-h`): print help text via `CapabilityGeneratorRegistry.getHelpText()` + flag summary.
  - If target is unknown: error + list available targets (only the supported ones in the error message; mention `--help` for full list).
  - Dispatch to `generateCapabilities(target, opts)` and print summary (same format as v1).
  - Update `showHelp()`:
    - Top-level help: replace the v1 `setup capability ...` block with a single line: `setup capabilities <target>  Wire up capability-routed agents (try --help)`.
    - `setup capabilities --help` (printed by `handleSetupCapabilities` when `--help` is passed) lists: all registered targets with status, the model flags, `--force`, and a usage example. Use the registry's `getHelpText()` plus a small static block for the flags.
- [ ] **5b.3** Update `packages/cli/test/capability-generator.test.ts`:
  - Every existing test now passes a `target` argument: `generateCapabilities('opencode', opts)`.
  - Add a new `describe('registry')` block with:
    - `CapabilityGeneratorRegistry.exists('opencode') === true`; `exists('kiro') === true`; `exists('unknown') === false`.
    - `createGenerator('opencode')` returns a usable `OpencodeCapabilityGenerator`.
    - `createGenerator('kiro')` (or any of the 5 stubs) throws with the message matching `/not yet supported/i`.
    - `createGenerator('unknown')` throws with a clear "unknown target" error that lists the supported target(s).
    - `getHelpText()` includes `opencode`, `kiro`, `claude`, `gemini`, `vscode`, `github-copilot` and a status indicator.
  - All v1 tests still pass after the `target` argument is added.
- [ ] **5b.4** Verify:
  - `pnpm build` exit 0.
  - `pnpm --filter @codemcp/workflows-cli test` exit 0 (existing tests + new registry tests).
  - `pnpm --filter @codemcp/workflows-core test` exit 0 (no regression).
  - `pnpm --filter @codemcp/workflows-server test` exit 0 (no regression).
  - `pnpm --filter @codemcp/workflows-opencode test` exit 0 (no regression).
  - `pnpm lint` clean.
  - `git diff --stat` shows ONLY changes in `packages/cli/src/capability-generator.ts`, `packages/cli/src/cli.ts`, `packages/cli/test/capability-generator.test.ts`. Nothing in `packages/cli/package.json`, `resources/templates/`, `packages/core/`, `packages/mcp-server/`, or `packages/opencode-plugin/`.
- [ ] **5b.5** E2E smoke: from the repo root, `node packages/cli/dist/index.js setup capabilities --help` lists all 6 targets with status; `setup capabilities opencode --model-thinking X` (in a temp dir) still works end-to-end. `setup capabilities kiro` exits non-zero with the "not yet supported" error.

**Risks**:
- *R-8*: stub generators could be accidentally called from somewhere that doesn't validate. Mitigation: throw in the `getOutputPath` abstract method (called first in `generate`), so the error surfaces before any I/O.
- *R-9*: the help text rendering needs to stay readable as targets grow. Mitigation: `getHelpText()` produces a stable, padded format; add a 6th and 7th target in the future and the format still works.
- *R-10*: backward-compatibility of the v1 `setup capability` command — it is now `setup capabilities` (plural + required target). This is a breaking change to the v1 interface. Acceptable because v1 was added in the same branch and not yet committed/released. Note in commit message.

---

## Plan-level risk register
- **R-1** (`WhatsNextResult` field): minor — lean toward NOT adding a dedicated field; hint lives inside `instructions`. Revisit if a consumer needs structured access.
- **R-2** (per-call config read perf): negligible for tiny config; cache later if needed.
- **R-3** (debug logging): trivial.
- **R-4** (workflow phase-key name drift): verify each file before editing in Slice 4.

## No contradictions with existing design
The Plan introduces KD-16/KD-17/KD-18 — these are implementation refinements that honour the agreed design direction (InstructionGenerator-layer injection, `.vibe/config.yaml` mapping, opt-in). Per user direction: capability hints are injected **only** by the core `InstructionGenerator` (KD-16); `start_development` needs no capability hint (KD-17); other generators (beads) are left untouched (KD-18). No `need_design_changes` triggered.

### Completed
- [x] Researched all instruction-generation call sites (whats_next, proceed_to_phase, start_development, opencode plugin, beads generator)
- [x] Identified the start_development gap → KD-17 (out of scope, per user direction)
- [x] Per user direction: capability hint stays core-only (KD-16); beads generator left untouched (KD-18)
- [x] Defined concrete tasks per slice (Slices 1-4) with file paths, line anchors, dependencies, risks, and test plan
- [x] Risk register R-1..R-4 documented

## Implement
### Tasks
- [x] Slice 1 — Schema & type foundation (1.1–1.3): `YamlState.required_capability?` + schema property. Build + core/server/opencode tests green; lint clean.
- [x] Slice 2 — Capability hint, no config (2.1–2.9): `capability-hint.ts` formatter, `InstructionContext` extension, `InstructionGenerator` injection, MCP call-site wiring, 13 formatter tests + 3 instruction-generator integration tests. R-1 resolved (no `WhatsNextResult` field). Plugin path verified untouched.
- [x] Slice 3 — Config-driven model & agent (3.1–3.6): `ProjectConfig.capability_models?`, `validateConfig` extension, MCP call-site config lookup, ~16 config-manager validation tests + instruction-generator config combo test. R-2 (perf) accepted / R-3 (logging) done.
- [x] Slice 4 — Annotate built-in workflows (4.1–4.4): 23 phases across 7 YAMLs annotated per KD-15; no R-4 drift; 49-assertion spot-check test added proving out-of-the-box label-only hints.
- [x] Slice 5 — CLI capability generator v1 (5.1–5.6): KD-19/20/21/22 logged. 3 templates at `resources/templates/opencode-agents/*.md.tmpl`; `packages/cli/src/capability-generator.ts` (OpenCode-only v1, ~282 lines) with multi-path template resolution mirroring `skill-generator.ts`; `setup capability` wired into `cli.ts`; 8 new unit tests; js-yaml added as CLI dependency. E2E smoke test verified. R-5/6/7 resolved.
- [x] Slice 5b — Multi-target capability generator refactor (5b.1–5b.5): per user feedback, Slice 5 v1 was too OpenCode-specific. KD-19 updated (plural `setup capabilities <target>`, target required); KD-23 (per-target registry) + KD-24 (`--help` discoverability) added. Refactor: `CapabilityGenerator` abstract base + `CapabilityGeneratorRegistry` (mirrors `GeneratorRegistry`) + `OpencodeCapabilityGenerator` concrete impl + 5 stub generators (kiro/claude/gemini/vscode/github-copilot) that throw "not yet supported". Tests: 8 existing updated to use `(target, opts)` signature + 10 new registry tests. E2E smoke verified all 5 invocations from spec §5b.5. R-8 (stub safety), R-9 (help scaling), R-10 (breaking rename to plural, accepted) all resolved.

### Completed
- All 6 vertical slices (Slices 1–5 + 5b) implemented end-to-end and verified green: `pnpm build` 6/6; full test suite **936 tests** across 4 packages — core 467, server 286, opencode 64, cli 119 (+18 new in total); `pnpm lint` 0 warnings/0 errors.
- Instruction-based capability routing is opt-in: absent `required_capability` ⇒ no behavioral change; absent `capability_models` config ⇒ annotated phases still emit label-only hints out-of-the-box.
- `setup capabilities <target> [--model-*] [--force]` (plural, target required). Only `opencode` is currently implemented; other targets throw a clear "not yet supported" error. `setup capabilities --help` lists all 6 targets with status indicators (✅ / ⏳), the model flags, `--force`, and a usage example. Top-level `cli --help` shows a concise one-line summary.
- Architecture follows the existing per-target registry pattern (`ConfigGenerator` / `SkillGenerator`); adding a new target in the future is a single-class addition (stub → real impl).
- KD-16/17/18/19/20/21/22/23/24 all honored.
- R-1..R-10 all resolved; no `need_design_changes` triggered.
- Note (pre-existing, not a regression): `@codemcp/workflows-cli` had 1–3 flaky 5000ms-timeout failures in `config-generator`/`skill-generator` tests; verified pre-existing via a clean-tree re-run and unrelated to this feature — all 119 CLI tests pass clean.

### Files touched
**Source (10 + 1 dep manifest):** `packages/core/src/state-machine-types.ts`, `resources/state-machine-schema.json`, `packages/core/src/capability-hint.ts` (new), `packages/core/src/index.ts`, `packages/core/src/interfaces/instruction-generator.interface.ts`, `packages/core/src/instruction-generator.ts`, `packages/mcp-server/src/tool-handlers/whats-next.ts`, `packages/mcp-server/src/tool-handlers/proceed-to-phase.ts`, `packages/core/src/config-manager.ts`, `packages/cli/src/capability-generator.ts` (new, refactored in Slice 5b), `packages/cli/src/cli.ts`, `packages/cli/package.json` (added `js-yaml` dep).
**Tests (4 new + 1 modified):** `packages/core/test/unit/capability-hint.test.ts`, `packages/core/test/unit/config-manager.test.ts`, `packages/core/test/unit/capability-annotation-spot-check.test.ts`, `packages/cli/test/capability-generator.test.ts` (refactored +10 registry tests in Slice 5b), `packages/core/test/unit/instruction-generator.test.ts`.
**Templates (3 new):** `resources/templates/opencode-agents/{thinking,coding,research}.md.tmpl`.
**Workflows (7 YAMLs, 23 phase annotations):** bugfix, epcc, greenfield, pr-review, qrspi, tdd, waterfall.

## Commit
### Tasks
- [x] **C.1** Cleanup audit: no debug `console.*`, FIXME/TODO/XXX/HACK markers, or temporary code in any of the 7 new files. Pre-existing `packages/core/src/logger.ts` matches are the `LogLevel.DEBUG` enum (not debug leftovers).
- [x] **C.2** Removed process-style comments from new code (per user feedback: "comments should describe the WHY, not the process"). Stripped all `Slice N` / `KD-N` / `R-N` references from JSDoc, test descriptions, and inline comments in `capability-hint.ts`, `instruction-generator.ts`, `instruction-generator.interface.ts`, `capability-hint.test.ts`, `config-manager.test.ts`, `capability-annotation-spot-check.test.ts`, `instruction-generator.test.ts`, `whats-next.ts`, `proceed-to-phase.ts`. Renamed the test constant `KD15` → `ANNOTATED_PHASES`. Renamed `describe('Slice 4: ...')` → `describe('built-in workflow capability annotations')`. Kept every comment that documents WHY (the "self-evident" reasoning, the "before any I/O" stub-safety reasoning, the "project root vs .vibe/ dir" reasoning, the "no user config → label-only hint" reasoning, the "no real change ⇒ no write" reasoning, the "opt-in: empty hint ⇒ skip" reasoning, the "Opt-in / backward compatibility" notes).
- [x] **C.3** Did NOT modify `.vibe/docs/requirements.md` (existing REQ-1..REQ-4 cover the pre-existing `requiresDocumentation` feature; the capability routing feature is a follow-up and not re-baked into REQs without explicit user direction).
- [x] **C.4** Initially updated `packages/docs/dev/ARCHITECTURE.md` and `packages/docs/dev/DEVELOPMENT.md`, then reverted both (per user feedback: "the information about the capabilities should go into the user documentation, nowhere else"). Capability routing is a user-facing feature; the right home is the VitePress user guide at `packages/docs/user/`, not internal dev docs.
- [x] **C.5** Added new user doc page `packages/docs/user/capability-routing.md` covering: what you get (hint format with and without config), declaring `required_capability` in a workflow YAML, configuring `capability_models` in `.vibe/config.yaml`, the `setup capabilities` CLI command (flags, targets, examples), and which built-in workflows ship with annotations. Linked from the VitePress sidebar under "User Guide" in `packages/docs/.vitepress/config.ts`.
- [x] **C.6** Final validation pass: `pnpm build` 6/6, full test suite 936 tests across 4 packages (core 467, server 286, opencode 64, cli 119), `pnpm lint` 0 warnings/0 errors. No regressions introduced.
- [x] **C.7** Repository state: 31 files in the commit (12 source, 7 workflow YAMLs, 3 templates, 5 test files, 1 new user doc, 1 vitepress config, 1 plan file, 1 pnpm-lock). Working tree is clean. No stray `.opencode/` or `.vibe/config.yaml` modifications in the workflow repo from E2E smoke tests.

### Completed
- Codebase is left cleaner than it was found: no debug output, no FIXMEs, no temp code, no completed-TODOs, no process-style comments. Net cleanup of process comments in code: −25 lines across 9 files.
- All capability-routing documentation lives in **one** place: the user-facing VitePress page `packages/docs/user/capability-routing.md`. Dev docs (architecture, design) are untouched. Requirements doc is untouched. The plan file is the design source of truth (KDs, Rs, slices) but is not a user doc.
- Plan file is the source of truth for the design history (KD-1..KD-24, R-1..R-10, Slices 1–5 + 5b). It is intentionally process-flavored — that's its job.
- Terminal state: no `proceed_to_phase` call. Feature work is complete. Final result presented to the user.

### Final commit
- Single commit on `feat/model-capability-routing`: `feat: model capability routing for workflow phases`.
- Commit message is intent-focused: what the feature does, why each design choice exists, the public API, the user-facing example. No slice/KD/R references, no process deltas, no "BREAKING CHANGE" footer (would trigger a major version bump; not appropriate for an opt-in feature added in this branch).
- PR creation requires `gh auth login -h github.com` in the user's environment; the pre-filled PR URL is `https://github.com/codemcp/workflows/pull/new/feat/model-capability-routing`.



---
*This plan is maintained by the LLM. Tool responses provide guidance on which section to focus on and what tasks to work on.*

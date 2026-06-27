# Capability Routing

Workflow phases can declare a `required_capability` to guide the LLM in choosing an appropriate subagent and/or model for that phase. You wire up the capability→model/agent mapping in `.vibe/config.yaml` — either by hand, or in one command via the `setup capabilities` CLI wizard.

The feature is fully opt-in. Phases that don't declare `required_capability` behave exactly as before, and a project with no `capability_models` config still gets label-only hints for any annotated phase.

## What you get

When a phase declares `required_capability: thinking` and you have mapped it to a model in `.vibe/config.yaml`, the LLM sees an instruction like:

> Capability hint: This phase requires thinking capability (deep reasoning, complex planning). When launching subagents, use agent: thinking (model: anthropic/claude-opus-4-7).

With no `capability_models` config, the hint reduces to:

> Capability hint: This phase requires thinking capability (deep reasoning, complex planning).

Built-in descriptions ship for `thinking` and `research`. `coding` is self-evident (no description); any other term is echoed verbatim.

## Declaring capabilities in a workflow

Add `required_capability` to a phase in your workflow YAML:

```yaml
phases:
  - name: Architecture
    required_capability: thinking
  - name: Code
    required_capability: coding
```

Conventional values are `thinking`, `research`, `coding`, and `default`. Any other term works too.

## Configuring capabilities

Add a `capability_models` map to `.vibe/config.yaml`:

```yaml
capability_models:
  thinking:
    model: anthropic/claude-opus-4-7
    agent: thinking
  coding:
    model: anthropic/claude-sonnet-4-5
  research:
    model: anthropic/claude-haiku-4-5
```

Each entry has two optional fields:

- `model` — model identifier used in the hint.
- `agent` — subagent name the LLM should use when launching subagents.

Either, neither, or both may be set per capability. Capabilities with no entry are not mentioned in the hint beyond the label.

## Setting up automatically

`npx @codemcp/workflows setup capabilities <target>` generates both the per-target agent files and the matching `capability_models` entries in `.vibe/config.yaml` in a single command.

```bash
npx @codemcp/workflows setup capabilities opencode \
  --model-thinking anthropic/claude-opus-4-7 \
  --model-coding anthropic/claude-sonnet-4-5 \
  --model-research anthropic/claude-haiku-4-5
```

For OpenCode, the command writes `.opencode/agents/<capability>.md` for each provided capability (with `mode: subagent` and the chosen `model:`) and merges the matching entries into `.vibe/config.yaml`.

### Flags

- `--model-thinking <model>` — set the model for the thinking agent
- `--model-coding <model>` — set the model for the coding agent
- `--model-research <model>` — set the model for the research agent
- `--force` — overwrite existing per-target agent files (default: skip if they exist)
- `--help`, `-h` — show help, including the full target list

### Targets

Only `opencode` is currently implemented. The wizard also knows about `kiro`, `claude`, `gemini`, `vscode`, and `github-copilot`; they are listed in `setup capabilities --help` with a ⏳ status and throw a clear "not yet supported" error if you invoke them. Adding a new target is a single class — see the [CLI source](https://github.com/codemcp/workflows/tree/main/packages/cli/src/capability-generator.ts) for the registry.

## Annotations in built-in workflows

The seven built-in workflows ship with phase annotations out of the box:

- `qrspi`, `epcc`, `greenfield`, `waterfall`, `bugfix`, `tdd`, `pr-review` — 23 annotated phases total

You don't need to do anything to get the label-only hints; just run any built-in workflow and the annotations are picked up automatically.

## See also

- [Agent Setup](./agent-setup) — get the workflow system running in your IDE/CLI
- [Custom Workflows](./custom-workflows) — write your own workflow YAMLs
- [Tutorial](./tutorial) — hands-on walkthrough

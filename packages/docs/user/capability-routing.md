# Capability Routing

Workflow phases can declare a `required_capability` to guide the LLM in choosing an appropriate subagent and/or model for that phase. You wire up the capability→model/agent mapping in `.vibe/config.yaml` — either by hand, or in one command via the `setup capabilities` CLI wizard.

The feature is fully opt-in. Phases that don't declare `required_capability` behave exactly as before.

## What you get

When a phase declares `required_capability: thinking` and you have mapped it to a model in `.vibe/config.yaml`, the LLM sees an instruction like:

> Capability hint: This phase requires thinking capability (deep reasoning, complex planning). When launching subagents, use agent: thinking (model: anthropic/claude-opus-4-7).

## Declaring capabilities in a workflow

Add `required_capability` to a phase in your workflow YAML:

```yaml
phases:
  - name: Architecture
    required_capability: thinking
  - name: Code
    required_capability: coding
```

Conventional values are `thinking`, `research`, `coding`, and `default`.

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

## Setting up automatically

```bash
npx @codemcp/workflows setup capabilities opencode \
  --model-thinking anthropic/claude-opus-4-7 \
  --model-coding anthropic/claude-sonnet-4-5 \
  --model-research anthropic/claude-haiku-4-5
```

## See also

- [Agent Setup](./agent-setup) – get the workflow system running in your IDE/CLI
- [Custom Workflows](./custom-workflows) – write your own workflow YAMLs
- [Tutorial](./tutorial) – hands-on walkthrough

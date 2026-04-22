# Agentic Workflows

fka. "Responsible Vibe MCP"

[![Tests](https://github.com/mrsimpson/vibe-feature-mcp/actions/workflows/pr.yml/badge.svg)](https://github.com/mrsimpson/vibe-feature-mcp/actions/workflows/pr.yml)
[![Release](https://github.com/mrsimpson/vibe-feature-mcp/actions/workflows/release.yml/badge.svg)](https://github.com/mrsimpson/vibe-feature-mcp/actions/workflows/release.yml)
[![npm version](https://badge.fury.io/js/@codemcp%2Fworkflows.svg)](https://badge.fury.io/js/@codemcp%2Fworkflows)

Transform any AI coding agent into a structured development partner with battle-tested engineering workflows.

## ⚡ Quick Start

```bash
# Setup your coding agent (config mode is the default)
npx @codemcp/workflows setup kiro  # or claude, gemini, opencode, copilot

# Or use skills (agentskills.io format) for on-demand loading
npx @codemcp/workflows setup claude --mode skill  # or gemini, opencode, copilot, kiro
```

Head over to a new empty dir and ask your agent: _"Build a UNO-like card game"_ – and instantly experience how your agent doesn't just shoot, but starts engineering – with YOU in the driver seat!

## 🎬 See It In Action

<div style="position: relative; display: inline-block; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
  <a href="https://agentic-rpl.netlify.app/conversation?url=https://github.com/codemcp/workflows/tree/demo-todo-greenfield/examples/greenfield-todo" target="_blank">
    <img src="packages/docs/images/placeholder-demo-greenfield.png" alt="Interactive demo showing Responsible Vibe MCP in action" style="width: 100%; max-width: 600px; height: auto; display: block;">
    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.7); border-radius: 50%; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center;">
      <div style="width: 0; height: 0; border-left: 25px solid white; border-top: 15px solid transparent; border-bottom: 15px solid transparent; margin-left: 5px;"></div>
    </div>
  </a>
</div>

## What You Get

✅ **Multiple battle-tested workflows** (classical [V-model "waterfall"](https://en.wikipedia.org/wiki/V-model), [Anthropic's EPCC](https://www.anthropic.com/engineering/claude-code-best-practices), [Test-Driven-Development](https://en.wikipedia.org/wiki/Test-driven_development), Reproduction-based bugfix, and many more)

✅ **Context-aware process guidance**: Your agent will take notes and plan tasks which survive context compression and even sessions.

✅ **Project memory across conversations** and branches

✅ **Automatic documentation** and decision tracking

✅ **Multi-agent collaboration** with specialized roles (business-analyst, architect, developer)

## Universal MCP Support

Works in any agent that supports the Model-Context-Protocol. Whenever a new IDE or Terminal UI rises: You don't need to change the way you work.

## How It's Different

There are zillions of "game changer next gen IDEs" out there, each claiming they will revolutionalize how software is going to be created.

In the end, they all just manipulate context of a transformer based LLM – it's all [just noodle soup](https://mrsimpson.github.io/slides-context-is-all-you-need/22). And they are fast at changing what's going to be part of the context, and it's even getting accelerated by parallel agents.

The problem: **The faster agents become, the harder it is to engineer**. I strongly believe that software engineering is a **creative process** which majorly happens inside the engineers brain.

Responsible-Vibe-MCP helps to **fill the conversation context with contents from YOUR brain** – instead of relying the agent will have understood what you should have thought about.

And since may developers tend to through structured processing off the cliff once they think they start coding, the workflows server will maintain **proactive process guidance** - your AI knows what to do next in each development phase, follow proven engineering methodologies, and maintain long-term project context.

## How It Works

Check the 📖 **[Complete Documentation →](https://codemcp.github.io/workflows/user/how-it-works.html)**

There is also a recorded session on ["how to tame your stubborn software agent"](https://www.youtube.com/watch?v=qKTdqmlnXMg) as part of the video podcast [Software-Architektur.tv](https://software-architektur.tv/) (German, auto-translated subtitles are okay-ish) which gives a more detailed insight into the basic ideas and how it's supposed to work.

## ⚠️ Experimental: Multi-Agent Collaboration (Crowd Workflows)

Enable teams of specialized AI agents to collaborate on development tasks with [crowd-mcp](https://github.com/mrsimpson/crowd-mcp):

- 👥 **Team-based development**: Business-analyst, architect, and developer agents work together
- 🔄 **Structured handoffs**: Clear responsibility transfers between agents
- 💬 **Built-in collaboration**: Agents consult each other via messaging
- 📋 **Specialized workflows**: sdd-feature-crowd, sdd-bugfix-crowd, sdd-greenfield-crowd

**Quick Start:**

```bash
# Copy pre-configured agent definitions
npx @codemcp/workflows@latest agents copy

# List available agent configurations
npx @codemcp/workflows@latest agents list
```

See **[Crowd MCP Integration Guide →](packages/docs/user/crowd-mcp-integration.md)** for setup and usage.

---

**[Open Source](LICENSE.md)** | **[Issues](https://github.com/mrsimpson/vibe-feature-mcp/issues)**

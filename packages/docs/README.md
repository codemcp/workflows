# Responsible Vibe MCP

Transform any AI coding agent into a structured development partner with battle-tested engineering workflows.

## The Problem with AI Coding Tools

Most AI coding tools are glorified autocomplete on steroids. They research you code base, may even check guide on the internet – end then they spit out a full blown solution. But here's the thing: **software engineering isn't just about writing code**. It's about thinking through problems, making architectural decisions, and following proven methodologies that prevent you from painting yourself into corners.

The faster these tools get, the easier it becomes to skip the thinking part. Before you know it, you're three hours deep in a refactor that could have been avoided with 10 minutes of upfront design.

## How Responsible Vibe Changes the Game

Instead of just responding to your requests, Responsible Vibe **proactively guides your AI agent** through proven engineering workflows. Your agent doesn't just write code – it engineers solutions.

Think of it as having a senior engineer sitting next to your AI, constantly asking: _"Did you think about the how it integrates with the existing architecture? What about edge cases? We're doing TDD – let's create a red test case first"_

## 🎬 See It In Action

<div class="demo-container" style="position: relative; display: inline-block; cursor: pointer; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" @click="openDemo">
  <img src="./images/placeholder-demo-greenfield.png" alt="Interactive demo showing Responsible Vibe MCP in action" style="width: 100%; max-width: 600px; height: auto; display: block;">
  <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.7); border-radius: 50%; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; transition: all 0.3s ease;">
    <div style="width: 0; height: 0; border-left: 25px solid white; border-top: 15px solid transparent; border-bottom: 15px solid transparent; margin-left: 5px;"></div>
  </div>
</div>

<div v-show="showModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 1000; padding: 20px; box-sizing: border-box;" @click="closeDemo">
  <div style="position: relative; width: 95%; height: 100%; margin: 0 auto;">
    <button @click="closeDemo" style="position: absolute; top: -10px; right: -10px; background: white; border: none; border-radius: 50%; width: 40px; height: 40px; font-size: 24px; cursor: pointer; z-index: 1001; display: flex; align-items: center; justify-content: center;" aria-label="Close demo">×</button>
    <iframe :src="iframeSrc" style="width: 100%; height: 100%; border: none; border-radius: 8px;" title="Responsible Vibe MCP Interactive Demo"></iframe>
  </div>
</div>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const showModal = ref(false)
const iframeSrc = ref('')

const openDemo = () => {
  iframeSrc.value = 'https://agentic-rpl.netlify.app/conversation?url=https://github.com/codemcp/workflows/tree/demo-todo-greenfield/examples/greenfield-todo'
  showModal.value = true
  document.body.style.overflow = 'hidden'
}

const closeDemo = () => {
  showModal.value = false
  iframeSrc.value = ''
  document.body.style.overflow = 'auto'
}

const handleKeydown = (e) => {
  if (e.key === 'Escape') closeDemo()
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

## What You Actually Get

**Multiple Battle-Tested Workflows**: Not just one-size-fits-all. Building a new project? Use the traditional V-model or the more ideation-focused greenfield. Adding a feature? EPCC works great. Fixing a bug? There's a workflow for that too.

**Your AI Remembers Everything**: Conversations, decisions, architectural choices – all persisted across sessions and even git branches.

**Process Guidance That Actually Works**: Your AI knows what phase it's in and what to focus on next. No more random code generation – structured, methodical development.

## Universal MCP Support

Works with any agent that supports the Model Context Protocol. Amazon Q CLI, Claude Code, Gemini CLI – doesn't matter. When the next "revolutionary" coding IDE launches next month, you won't need to change how you work.

## Quick Start

```bash
# Setup your coding agent (works with any MCP-compatible agent)
npx @codemcp/workflows setup config kiro  # or claude, gemini, opencode, copilot
```

Head to an empty directory and try: _"Build a simple todo app with a terminal interface"_

Watch your agent start with architecture decisions instead of jumping straight into code. That's engineering.

## Next Steps

- **[How It Works](./user/how-it-works.md)** – The technical details and what makes it different
- **[Quick Setup](./user/agent-setup.md)** – Get your agent configured in 2 minutes
- **[Hands-On Tutorial](./user/tutorial.md)** – Learn by building (todo app → enhancement → bugfix)
- **[Interactive Workflows](./workflows)** – Explore all available methodologies
- **[Crowd MCP Integration](./user/crowd-mcp-integration.md)** – Multi-agent collaboration with specialized roles

---

_Because software engineering is a creative process that happens in your brain – not in the LLM's context window._

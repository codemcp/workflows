# How It Works

Most AI coding tools are like having a really fast intern – they'll do exactly what you ask, but they won't question whether you're asking for the right thing.

Responsible Vibe flips this around. Instead of your AI waiting for instructions, it actively guides the development process using proven engineering methodologies.

Want to know more? There is also a recorded session on ["how to tame your stubborn software agent"](https://www.youtube.com/watch?v=qKTdqmlnXMg) as part of the video podcast [Software-Architektur.tv](https://software-architektur.tv/) (German, auto-translated subtitles are okay-ish) which gives a more detailed insight into the basic ideas and how it's supposed to work.

Next, we'll look into the components that make up Responsible Vibe and how they work together.

## The MCP Architecture

Here's the actual mechanics: Your AI agent calls **MCP tools** that return **phase-specific instructions**. It's prompt engineering, but contextual and systematic.

## The Core MCP Tools

### `whats_next()` - The Permanent Nudger

Called after every user interaction. Returns detailed instructions for what the AI should do next based on:

- Current development phase (requirements, design, implementation, etc.)
- Project context and conversation history
- Workflow methodology (waterfall, EPCC, TDD, bugfix)

### `start_development()` - The Kickoff

Initializes a new development workflow. The AI picks the right methodology based on your request:

- "Build a new app" → Greenfield workflow
- "Add a feature" → EPCC workflow
- "Fix this bug" → Bugfix workflow
- "I want to use TDD" → TDD workflow

### `proceed_to_phase()` - The Transitions

Moves between development phases when current phase tasks are complete. The AI checks entrance criteria before transitioning.

### `setup_project_docs()` - The Memory

Creates persistent project documentation (architecture.md, requirements.md, design.md) that survives across conversations and branches.

## Universal MCP Compatibility

Because it's built on the Model Context Protocol, it works with any compatible agent. Today that's Amazon Q CLI, Claude Code, Gemini CLI, and OpenCode CLI.

You're not locked into a specific IDE or platform. The methodology travels with you.

---

**Next**: [Quick Setup](./agent-setup.md) – Get your agent configured in 2 minutes

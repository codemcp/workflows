# Automatic Workflow Selection

Your AI agent automatically picks the right development methodology based on what you're trying to do. No configuration needed – it just works.

## How It Works

When you ask your AI to help with development, it analyzes your request and selects the appropriate workflow:

**"Build a todo app"** → **Greenfield workflow**
_Full planning cycle for new projects_

**"Add user authentication"** → **EPCC workflow**
_Iterative approach for feature additions_

**"The login is broken"** → **Bugfix workflow**
_Systematic debugging process_

**"I want to use TDD"** → **TDD workflow**
_Test-driven development cycle_

## Manual Override

Want to use a specific workflow? Just ask:

**"Build a todo app using TDD"** → TDD workflow
**"Add authentication with the waterfall approach"** → Waterfall workflow
**"Use EPCC to implement search"** → EPCC workflow

## Explore All Workflows

Want to see what's available? Check out the **[Interactive Workflow Visualizer](../workflows)** – it shows all methodologies with their phases, transitions, and use cases.

You can explore:

- **Waterfall**: Classical V-model for large, design-heavy projects
- **EPCC**: Anthropic's approach for iterative development
- **TDD**: Test-driven development with red-green-refactor
- **Bugfix**: Systematic reproduce-analyze-fix-verify cycle
- **Greenfield**: Comprehensive planning for new projects
- **Minor**: Streamlined approach for small changes

## Why This Matters

Most development tools force you into one approach. Responsible Vibe recognizes that **different problems need different methodologies**.

Building something from scratch? You need comprehensive planning.
Adding a feature? Iterative development works better.
Fixing a bug? Systematic debugging is key.

Your AI knows the difference and adapts accordingly.

---

**Next**: [Advanced Engineering](./advanced-engineering.md) – Project docs, variables, and branch management

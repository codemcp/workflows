# Hands-On Tutorial

The best way to understand Responsible Vibe is to experience it. We'll build something simple, enhance it, then fix a bug. Three different workflows, three different approaches.

## Prerequisites

Make sure you've got Responsible Vibe configured with your AI agent. If not, check the [Quick Setup](./agent-setup.md) first.

## Part 1: Greenfield Development

Let's build something from scratch. This triggers the **Greenfield workflow** – the full engineering process for new projects.

### The Challenge

```
Ask your AI: "Build a simple dice game. Two players take turns rolling dice, highest total wins."
```

_Hint: In order to not get just another Next.js app, you may instruct it to build for the terminal in a future stage_

### What You'll Experience

Your AI won't immediately start coding. Instead, it'll:

1. **Ask clarifying questions**: "How many dice per roll? Best of how many rounds? Should we track scores across games?"
2. **Design the architecture**: "I'm thinking a Game class, Player class, and a simple CLI interface. Does that sound right?"
3. **Plan the implementation**: "Let me break this into phases: core game logic, player management, CLI interface, then testing."
4. **Build systematically**: Following the plan it just created, not jumping around randomly.

## Part 2: Feature Enhancement

Now let's add something that wasn't in the original scope. This triggers the **EPCC workflow** (Explore → Plan → Code → Commit).

### The Challenge

```
Ask your AI: "Add a high-score tracking system.
Players should see their win/loss record across games."
```

### What You'll Experience

1. **Explore**: "Let me understand the current code structure and see how to integrate scoring..."
2. **Plan**: "I'll need to modify the Player class, add persistent storage, and update the CLI to show stats."
3. **Code**: Focused implementation of just the scoring feature
4. **Commit**: Clean up and finalize the enhancement

## Part 3: Bug Fixing

Time to break something and fix it. This triggers the **Bugfix workflow**.

### The Challenge

```
Ask your AI: "There's a bug in the dice game.
Players are complaining the dice rolls seem unfair."
```

### What You'll Experience

1. **Reproduce**: "Let me run the game and see if I can reproduce the issue..."
2. **Analyze**: "I found the problem – the dice rolling logic is hardcoded to return 1."
3. **Fix**: Targeted fix for just the bug, not a rewrite
4. **Verify**: "Let me test this fix to make sure it works correctly..."

## Next Steps

- **[Automatic Workflow Selection](./workflow-selection.md)** – How the AI picks the right methodology
- **[Advanced Engineering](./advanced-engineering.md)** – Project docs, variables, and branch management
- **[Interactive Workflows](../workflows)** – Explore all available methodologies

---

_Try this tutorial with your own project ideas. The workflows adapt to any domain – web apps, CLI tools, games, whatever you're building._

# Advanced Engineering

Beyond basic workflows, Responsible Vibe provides sophisticated engineering practices for serious software development.

## Project Documentation System

### `setup_project_docs` Tool

Create structured project documentation that persists across conversations:

```bash
# Your AI can call this automatically or you can request it
"Set up project documentation using the arc42 template"
```

**What it creates:**

- `architecture.md` – System design and technical decisions
- `requirements.md` – What you're building and why
- `design.md` – Detailed implementation approach

## Workflow Variables

Your workflows can reference project documentation dynamically:

```
"Review the system architecture documented in $ARCHITECTURE_DOC
and ensure your design addresses all requirements in $REQUIREMENTS_DOC."
```

**Available Variables:**

- `$ARCHITECTURE_DOC` → `.vibe/docs/architecture.md`
- `$REQUIREMENTS_DOC` → `.vibe/docs/requirements.md`
- `$DESIGN_DOC` → `.vibe/docs/design.md`

## Trunk-Based Development

### Branch-Specific Development Plans

Each git branch gets its own development plan file:

**Main branch:** `development-plan.md`
**Feature branch:** `development-plan-feature-auth.md`
**Bugfix branch:** `development-plan-fix-login.md`

### Branch-Specific Conversation Contexts

Each branch maintains separate conversation context with different conversation IDs based on `project-path + git-branch`.

## Rule Files Integration

**Responsible Vibe** provides **HOW of the process** (what phase, what to focus on)
**Rule files** provide **HOW of the deliverables** (coding standards, conventions)

Together, they give your AI both process guidance and coding standards.

---

**Next**: [Tutorial](./tutorial.md) – Hands-on walkthrough

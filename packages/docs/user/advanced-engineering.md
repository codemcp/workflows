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

**Template Options:**

- **arc42**: Industry-standard architecture documentation
- **comprehensive**: Detailed templates for all aspects
- **freestyle**: Minimal structure, maximum flexibility
- **none**: Placeholder that references plan file instead

**File Linking:**
Instead of creating new docs, you can link existing ones:

```bash
"Link the existing README.md as architecture documentation"
# Creates symlink: .vibe/docs/architecture.md → README.md
```

## Workflow Variables

Your workflows can reference project documentation dynamically:

**In Workflow Instructions:**

```
"Review the system architecture documented in $ARCHITECTURE_DOC
and ensure your design addresses all requirements in $REQUIREMENTS_DOC."
```

**At Runtime:**

```
"Review the system architecture documented in /project/.vibe/docs/architecture.md
and ensure your design addresses all requirements in /project/.vibe/docs/requirements.md."
```

**Available Variables:**

- `$ARCHITECTURE_DOC` → `.vibe/docs/architecture.md`
- `$REQUIREMENTS_DOC` → `.vibe/docs/requirements.md`
- `$DESIGN_DOC` → `.vibe/docs/design.md`

This makes workflows portable across projects while maintaining consistent structure.

## Trunk-Based Development

### Branch-Specific Development Plans

Each git branch gets its own development plan file:

**Main branch:** `development-plan.md`  
**Feature branch:** `development-plan-feature-auth.md`  
**Bugfix branch:** `development-plan-fix-login.md`

### Branch-Specific Conversation Contexts

Each branch maintains separate conversation context:

- Different conversation IDs based on `project-path + git-branch`
- Independent development phases and progress tracking
- Separate plan files for each branch's development process

**Switch branches, get separate context:**

```bash
git checkout feature-auth
# AI loads separate conversation context for this branch
# Gets development-plan-feature-auth.md as process memory
# Can reference .vibe/docs/ for long-term memory when needed
```

### Explicit Reference Documentation

Development plans serve as **process memory** (actively maintained by AI) but can also be **explicitly referenced**:

**Through Commits:**

```bash
git commit -m "implement user authentication

See development-plan-feature-auth.md for architectural decisions
and requirements analysis from the planning phase."
```

When your AI reads this commit, it can reference the plan file to understand the context and decisions made.

**Through Direct Reference:**

```bash
"Check @.vibe/development-plan-auth.md to see what we thought about back then"
```

## Rule Files Integration

### Process vs Deliverable Guidance

**Responsible Vibe** provides **HOW of the process** (what phase, what to focus on)  
**Rule files** provide **HOW of the deliverables** (coding standards, conventions)

**Example Rule File** (`.kiro/rules/comments.md`):

```markdown
**Use** comments to explain the purpose of a variable/method/function/class.
**Use** meaningful variable/method/function/class names.

**Avoid** comments that describe what the code is doing.
**Avoid** comments that describe what's been changed in a development session.
```

### How They Work Together

1. **Responsible Vibe**: "You're in the implementation phase. Write clean, testable code."
2. **Rule Files**: "Use meaningful names. Avoid describing what code does in comments."
3. **Result**: AI follows structured process AND coding standards

## Long-Term Memory

### The `.vibe/docs/` Structure

```
.vibe/
├── docs/
│   ├── architecture.md    # System design decisions
│   ├── requirements.md    # What you're building
│   └── design.md         # Implementation approach
├── development-plan-main.md
├── development-plan-feature-auth.md
└── conversation-state.sqlite
```

### Explicit Reference System

**Development plans are documentation, not automatic memory:**

- **Project decisions** are documented in plan files for explicit reference
- **Architectural choices** are captured in `.vibe/docs/` for workflow variable substitution
- **Development progress** is tracked in plan files that can be referenced in commits
- **Branch context** provides separate conversation spaces, not automatic plan loading

**How to use it:**

```bash
# Reference past decisions
"Look at @.vibe/development-plan-feature-auth.md to see our authentication approach"

# Commit with context
git commit -m "add JWT validation

Based on security analysis in development-plan-feature-auth.md,
implemented token-based auth with 24h expiry."

# AI can then read the commit and reference the plan file for full context
```

## Real-World Example

```bash
# Start new feature
git checkout -b feature-payment

# AI automatically:
# 1. Creates development-plan-feature-payment.md for this branch's context
# 2. Can reference existing .vibe/docs/architecture.md via workflow variables
# 3. Follows your .kiro/rules/ coding standards
# 4. Maintains separate conversation context for this branch

# Document decisions in plan file during development
# Plan file captures: requirements analysis, architectural decisions, implementation notes

# Later, commit with reference:
git commit -m "implement payment processing

See development-plan-feature-payment.md for security considerations
and integration approach with existing user system."

# Weeks later, you or your AI can explicitly reference the plan:
"Check @.vibe/development-plan-feature-payment.md to understand the payment flow"
```

## Why This Matters

Most AI tools treat each conversation as isolated. Responsible Vibe provides **structured documentation and explicit reference systems** for ongoing engineering:

- **Explicit reference context** through plan files and commits
- **Structured documentation** that grows with your project (`.vibe/docs/`)
- **Branch-aware development** with separate conversation contexts
- **Consistent standards** through rule files integration

The key difference: **You control when and how context is referenced**, rather than relying on automatic memory that may or may not work.

This is software engineering, not just code generation.

---

**Next**: [Long-Term Memory](./long-term-memory.md) – Deep dive into persistence and context management

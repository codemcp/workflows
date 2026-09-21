# Custom Workflows

Responsible Vibe supports custom workflow definitions that you can create, install, and share. The system uses a directory-based approach with domain filtering for better organization.

## How Custom Workflows Work

### The `.vibe/workflows/` Directory

Custom workflows are stored in your project's `.vibe/workflows/` directory:

```
.vibe/
├── workflows/
│   ├── my-custom-workflow.yaml
│   ├── team-review-process.yaml
│   └── client-specific-flow.yaml
└── development-plan-main.md
```

### Workflow Domains

Workflows are organized by domains to keep things manageable:

- **`code`**: Software development workflows (default)
- **`architecture`**: System design and architecture workflows
- **`office`**: Business process and documentation workflows

## Creating Custom Workflows

### Basic Workflow Structure

Create a YAML file in `.vibe/workflows/`:

```yaml
name: 'my-custom-workflow'
description: 'Custom workflow for my specific needs'
initial_state: 'start'

metadata:
  domain: 'code'
  complexity: 'medium'
  bestFor: ['Custom processes', 'Team workflows']

states:
  start:
    description: 'Initial phase'
    default_instructions: |
      Start your custom process here.

    transitions:
      - trigger: 'ready_for_next'
        to: 'next_phase'
        transition_reason: 'Ready to move forward'

  next_phase:
    description: 'Next phase'
    default_instructions: |
      Continue with the next step of your process.

    transitions:
      - trigger: 'workflow_complete'
        to: 'start'
        transition_reason: 'Workflow complete, ready for new task'
```

## Installing Workflows

### Using CLI

```bash
# List all available workflows
npx @codemcp/workflows workflow list

# Copy a built-in workflow to customize it
npx @codemcp/workflows workflow copy waterfall my-custom-waterfall
```

## Why This System Works

**Directory-based**: Easy to see and manage all your custom workflows
**Domain filtering**: Only load workflows relevant to your work
**Project-specific**: Each project can have its own custom workflows
**Shareable**: Workflows can be installed from URLs or shared between projects

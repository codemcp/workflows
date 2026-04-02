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

**Control which domains are loaded:**

```bash
export WORKFLOW_DOMAINS="code,architecture"
# Only loads workflows from code and architecture domains
```

## Creating Custom Workflows

### 1. Basic Workflow Structure

Create a YAML file in `.vibe/workflows/`:

```yaml
name: 'my-custom-workflow'
description: 'Custom workflow for my specific needs'
initial_state: 'start'

metadata:
  domain: 'code'
  complexity: 'medium'
  bestFor: ['Custom processes', 'Team workflows']
  useCases: ['Specific project needs']
  examples: ['Custom review process']

states:
  start:
    description: 'Initial phase'
    instructions: |
      Start your custom process here.
      Define what the AI should focus on in this phase.

    transitions:
      - trigger: 'ready_for_next'
        to: 'next_phase'
        transition_reason: 'Ready to move forward'

  next_phase:
    description: 'Next phase'
    instructions: |
      Continue with the next step of your process.

    transitions:
      - trigger: 'workflow_complete'
        to: 'start'
        transition_reason: 'Workflow complete, ready for new task'
```

### 2. Advanced Features

**Phase-specific instructions:**

```yaml
states:
  design:
    instructions: |
      You are in the design phase. Focus on:
      - System architecture decisions
      - Component interfaces
      - Data flow design

      Reference existing architecture: $ARCHITECTURE_DOC
      Document your design in: $DESIGN_DOC
```

**Conditional transitions:**

```yaml
transitions:
  - trigger: 'design_approved'
    to: 'implementation'
    additional_instructions: 'Call setup_project_docs to create implementation templates before starting'
  - trigger: 'need_more_design'
    to: 'requirements'
    additional_instructions: 'Review and update requirements.md based on design feedback'
```

## Installing Workflows

### Using CLI

The CLI provides convenient commands to list and copy workflows:

```bash
# List all available workflows
npx @codemcp/workflows workflow list

# Copy a built-in workflow to customize it
npx @codemcp/workflows workflow copy waterfall my-custom-waterfall

# Copy any available workflow
npx @codemcp/workflows workflow copy epcc my-team-process
```

This copies the workflow to `.vibe/workflows/my-custom-waterfall.yaml` where you can customize it for your needs.

The copied workflow will have:

- Updated `name` field to match your custom name
- All original states and transitions
- Metadata you can modify (description, complexity, etc.)

### From URLs or Files

```bash
# Install from URL
"Install workflow from https://example.com/my-workflow.yaml"

# Install with custom name
"Install the waterfall workflow as 'detailed-waterfall'"
```

## Workflow Discovery

### List Available Workflows

```bash
# See all workflows available to your project
"List available workflows"

# See all workflows regardless of domain filtering
"List all workflows including unloaded ones"
```

### Domain Filtering in Action

```bash
# Default: only 'code' domain workflows
WORKFLOW_DOMAINS="code"

# Multiple domains
WORKFLOW_DOMAINS="code,architecture,office"

# All domains
WORKFLOW_DOMAINS="code,architecture,office"
```

## Project-Specific Configuration

### `.vibe/config.yaml`

Control which workflows are available for your project:

```yaml
enabled_workflows:
  - 'waterfall'
  - 'my-custom-workflow'
  - 'team-review-process'
```

This filters the available workflows to only those specified, regardless of domain settings.

## Workflow Metadata

### Enhanced Discoverability

```yaml
metadata:
  domain: 'code' # Which domain this belongs to
  complexity: 'high' # low, medium, high
  bestFor: # What this workflow is good for
    - 'Large features'
    - 'Design-heavy projects'
  useCases: # Specific use cases
    - 'Building new systems'
    - 'Complex integrations'
  examples: # Example scenarios
    - 'Create authentication system'
    - 'Build reporting dashboard'
```

This metadata helps your AI automatically select the right workflow for different scenarios.

## Real-World Example

```yaml
name: 'api-development'
description: 'Workflow for developing REST APIs with proper testing'
initial_state: 'api_design'

metadata:
  domain: 'code'
  complexity: 'medium'
  bestFor: ['API development', 'Backend services']
  useCases: ['REST API creation', 'Microservice development']

states:
  api_design:
    description: 'Design API endpoints and contracts'
    instructions: |
      Design your API:
      - Define endpoints and HTTP methods
      - Specify request/response schemas
      - Document authentication requirements
      - Plan error handling approach

      Document in $DESIGN_DOC

    transitions:
      - trigger: 'api_design_complete'
        to: 'implementation'
        additional_instructions: 'Create API implementation templates and set up testing framework'

  implementation:
    description: 'Implement API endpoints'
    instructions: |
      Implement the API following your design:
      - Create route handlers
      - Implement business logic
      - Add input validation
      - Include proper error handling

    transitions:
      - trigger: 'implementation_complete'
        to: 'testing'
        additional_instructions: 'Set up test environment and create test data fixtures'

  testing:
    description: 'Test API endpoints'
    instructions: |
      Test your API thoroughly:
      - Unit tests for business logic
      - Integration tests for endpoints
      - Test error scenarios
      - Validate against API design

    transitions:
      - trigger: 'testing_complete'
        to: 'api_design'
        additional_instructions: 'Document API completion and prepare for next API development cycle'
        transition_reason: 'API complete, ready for next API'
```

## Why This System Works

**Directory-based**: Easy to see and manage all your custom workflows  
**Domain filtering**: Only load workflows relevant to your work  
**Project-specific**: Each project can have its own custom workflows  
**Shareable**: Workflows can be installed from URLs or shared between projects  
**Discoverable**: Rich metadata helps AI select appropriate workflows

Your custom workflows integrate seamlessly with the built-in ones, giving you complete control over your development process.

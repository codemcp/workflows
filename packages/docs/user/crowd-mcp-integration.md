# Crowd Workflows - Multi-Agent Collaboration Guide

## Overview

Responsible-Vibe-MCP supports **collaborative workflows** that enable teams of specialized AI agents to work together on software development tasks. Each agent has a specific role (business-analyst, architect, developer) and follows the same workflow with role-appropriate instructions.

## Quick Setup

### 1. Copy Agent Configurations

Use the CLI to copy pre-configured agent definitions to your project:

```bash
npx @codemcp/workflows@latest agents copy
```

This creates three agent configurations in `.crowd/agents/`:

- `business-analyst.yaml` - Requirements and specification expert
- `architect.yaml` - System design and planning expert
- `developer.yaml` - Implementation expert

Each agent is pre-configured with:

- `VIBE_ROLE` environment variable (business-analyst, architect, or developer)
- `WORKFLOW_DOMAINS=sdd-crowd` to access collaborative workflows
- System prompts explaining team collaboration
- MCP server connection to workflows server

### 2. Give This Prompt to Your Orchestrator

Copy this prompt and give it to your orchestrating agent (the one with access to crowd-mcp tools):

```
You are orchestrating a team of AI agents using crowd-mcp and the workflows server.

## Agent Discovery

The project has three pre-configured agents:
- business-analyst
- architect
- developer

## Your Orchestration Process

When I ask you to start a collaborative development task:

1. **Spawn the team** using spawn_agent() with the agent type matching the filename
   - spawn_agent(task="[task] - analysis", agentType="business-analyst")
   - spawn_agent(task="[task] - architecture", agentType="architect")
   - spawn_agent(task="[task] - implementation", agentType="developer")

2. **Choose workflow** based on task type:
   - Feature development → sdd-feature-crowd (starts with business-analyst)
   - Bug fixing → sdd-bugfix-crowd (starts with developer)
   - New project → sdd-greenfield-crowd (starts with architect)

3. **Kick off** by sending message to the starting agent:
   - send_message(to: [agent-id], content: "Start [workflow-name] for [task description]")

4. **Monitor** using get_messages() to see progress updates from agents.
IMPORTANT: The agents will work for long intervals. You may check as often as you like, but don't bother them with repeated questions or status updates

5. **Relay** when agents send_message_to_operator() with questions you cannot answer as they need more information on the context of the development.

## Rules

- Spawn all three agents at start (they work as a persistent team)
- Agents will message each other directly - you monitor and intervene when needed
- When agents ask you questions, ask me and relay my answer

## Example

When I say: "Build user authentication"

You should:
1. spawn_agent(task="Build user authentication - analysis", agentType="business-analyst")
2. spawn_agent(task="Build user authentication - architecture", agentType="architect")
3. spawn_agent(task="Build user authentication - implementation", agentType="developer")
4. send_message(to: business-analyst, content: "Start sdd-feature-crowd for user authentication system")
5. Monitor messages and keep me updated
```

### 3. Start Collaborating

Tell your orchestrator to start a development task:

```
Build a search feature for the product catalog
```

The orchestrator will:

- Spawn the three agents
- Start the business-analyst with sdd-feature-crowd workflow
- Monitor progress and report back to you

## Available Workflows

**sdd-crowd Domain** - Collaborative specification-driven development workflows:

#### sdd-feature-crowd

Collaborative feature development with full team participation.

**Phases**: analyze → specify → clarify → plan → tasks → implement

**Role Flow**:

- **Business-analyst** drives: analyze, specify, clarify
- **Architect** drives: plan, tasks
- **Developer** drives: implement

**Use when**: Building new features or enhancing existing ones with a team

#### sdd-bugfix-crowd

Collaborative bug fixing with systematic approach.

**Phases**: reproduce → specify → test → plan → fix → verify

**Role Flow**:

- **Developer** drives: reproduce, test, fix, verify
- **Business-analyst** drives: specify
- **Architect** drives: plan

**Use when**: Fixing complex bugs that benefit from team expertise

#### sdd-greenfield-crowd

Collaborative new project development from scratch.

**Phases**: constitution → specify → plan → tasks → implement → document

**Role Flow**:

- **Architect** drives: constitution, plan, tasks
- **Business-analyst** drives: specify
- **Developer** drives: implement
- **All contribute** to: document

**Use when**: Starting new projects with comprehensive team planning

## How Collaboration Works

### The RCI Model

Each phase assigns agents one of three roles:

- **Responsible (R)**: Primary driver
  - Edits the plan file
  - Calls `proceed_to_phase()` to advance
  - Drives the work forward
- **Consulted (C)**: Available for questions
  - Monitors messages
  - Provides expert input when asked
  - Cannot edit plan or proceed
- **Informed (I)**: Passive monitoring
  - Stays aware of progress
  - No active participation required

**Note**: The human operator is always implicitly informed.

### Role Assignment Examples

**sdd-feature-crowd specify phase**:

- Business-analyst: **RESPONSIBLE** (drives specification)
- Architect: **CONSULTED** (answers technical feasibility questions)
- Developer: **CONSULTED** (provides complexity estimates)

**sdd-feature-crowd implement phase**:

- Developer: **RESPONSIBLE** (drives implementation)
- Architect: **CONSULTED** (answers design questions)
- Business-analyst: **CONSULTED** (clarifies requirements)

### Collaboration Protocol

**1. Handoff Pattern**:

```
Business-analyst (RESPONSIBLE in specify phase):
  1. Completes specification work
  2. Sends: send_message(architect-id, "Please take lead for plan phase")
  3. Reports: send_message_to_operator("Spec complete, handing to architect")
  4. Calls: proceed_to_phase(target_phase: "plan")
  5. Becomes: CONSULTED in plan phase

Architect (CONSULTED → RESPONSIBLE):
  1. Receives handoff message
  2. Becomes RESPONSIBLE in plan phase
  3. Drives planning work
```

**2. Consultation Pattern**:

```
Architect (RESPONSIBLE in plan phase):
  1. Has question about requirements
  2. Sends: send_message(business-analyst-id, "What does requirement X mean?")

Business-analyst (CONSULTED in plan phase):
  1. Receives: get_my_messages()
  2. Responds: send_message(architect-id, "Requirement X means...")

Architect:
  3. Continues planning with clarified information
```

## Agent Configuration

### System Prompts

All agent system prompts follow the same pattern:

- Explain team structure and roles
- Describe available tools (whats_next, send_message, etc.)
- Emphasize important rules (only responsible edits plan, always call whats_next)
- Keep role responsibilities generic (workflow provides specific tasks)

### Example Configuration

```yaml
name: business-analyst
displayName: Business Analyst
systemPrompt: |
  You are working as a business-analyst in a collaborative team.

  Your team: business-analyst (you), architect, developer

  ## How Collaboration Works
  You follow structured workflows. In each phase, you may be:
  - RESPONSIBLE (driving), CONSULTED (answering questions), or INFORMED (monitoring)

  ## Available Tools
  - whats_next(): Get phase guidance (call after every message)
  - proceed_to_phase(): Move forward (only when responsible)
  - send_message(to, content): Collaborate with team
  - send_message_to_operator(content): Report to human
  - get_my_messages(): Check for questions

mcpServers:
  responsible-vibe:
    type: stdio
    command: npx
    args: [@codemcp/workflows-server@latest]
    env:
      VIBE_ROLE: business-analyst
      WORKFLOW_DOMAINS: sdd-crowd
```

## Workflow Features

### $VIBE_ROLE Variable

Workflows use `$VIBE_ROLE` for dynamic agent identification:

```yaml
default_instructions: |
  You are $VIBE_ROLE working in a collaborative team.
  Current phase: SPECIFY
```

Substituted at runtime:

- Business-analyst sees: "You are business-analyst working..."
- Architect sees: "You are architect working..."

### Role-Specific Instructions

Each transition provides role-appropriate guidance:

```yaml
transitions:
  - trigger: spec_complete
    to: plan
    role: business-analyst
    additional_instructions: |
      You are RESPONSIBLE. Create spec, then hand off.

  - trigger: spec_complete
    to: plan
    role: architect
    additional_instructions: |
      You are CONSULTED. Answer questions when asked.
```

### Transition Filtering

Each agent only sees transitions for their role:

- Business-analyst sees only `role: business-analyst` transitions
- Architect sees only `role: architect` transitions
- Developer sees only `role: developer` transitions
- Transitions with no `role` shown to everyone

### Validation

**Tool Validation** (`proceed_to_phase`):

- Verifies agent has valid transition to target phase
- Prevents agents from proceeding when not responsible
- Clear error messages when validation fails

**Plan File Editing**:

- Enforced via instructions (cannot validate at tool level)
- RESPONSIBLE: "Only you can edit the plan file"
- CONSULTED: "Do NOT edit the plan file"

## Usage Examples

### Starting a Feature with Team

```bash
# Human operator (via Claude Desktop + crowd-mcp):
"Spawn business-analyst, architect, and developer agents to build user authentication"

# Agents spawn and start sdd-feature-crowd workflow
# Each agent calls whats_next() and gets role-specific instructions

# Business-analyst (RESPONSIBLE in analyze):
- Analyzes requirements
- Messages architect: "What authentication patterns do we use?"
- Messages developer: "How complex is OAuth integration?"
- Completes analysis
- Hands off to specify phase

# Business-analyst (RESPONSIBLE in specify):
- Creates specification
- Messages team for review
- Hands off to architect

# Architect (RESPONSIBLE in plan):
- Creates technical plan
- Messages developer for feedback
- Creates task breakdown
- Hands off to developer

# Developer (RESPONSIBLE in implement):
- Implements features
- Messages architect with design questions
- Messages business-analyst for requirement clarifications
- Completes implementation
```

### Agent Perspectives

**What business-analyst sees in specify phase**:

```
You are RESPONSIBLE for the specify phase.

You have exclusive control:
- Only you can edit the plan file
- Only you can proceed to next phase

Tasks:
- Create specification...
- Use send_message to ask architect about technical feasibility
- Use send_message to ask developer about implementation complexity

Before proceeding:
- Send handoff message to architect
- Report to operator
- Call proceed_to_phase
```

**What architect sees in specify phase**:

```
You are CONSULTED during the specify phase.

Business-analyst is driving this work.

Your responsibilities:
- Monitor messages for questions
- Provide technical feasibility input
- Review specification when asked

Constraints:
- Do NOT edit plan file
- Do NOT proceed to next phase
```

## Best Practices

### 1. Always Call whats_next()

Every agent should call `whats_next()` after each user message to get current phase guidance.

### 2. Use Messaging Proactively

Agents should actively collaborate:

- Ask questions when uncertain
- Request reviews before proceeding
- Share information proactively
- Keep operator informed of progress

### 3. Respect Role Boundaries

- Only RESPONSIBLE agent edits plan file
- Only RESPONSIBLE agent calls proceed_to_phase
- CONSULTED agents wait for questions
- Clear communication about role transitions

### 4. Explicit Handoffs

When transitioning phases:

1. Complete your work
2. Send handoff message to next responsible agent
3. Notify other team members
4. Report to operator
5. Call proceed_to_phase

## Troubleshooting

### "Agent with role 'X' cannot proceed"

**Cause**: Agent trying to proceed when not responsible for target phase

**Solution**: Only the responsible agent can call `proceed_to_phase`. Check workflow to see who should be driving the target phase.

### Agent Not Seeing Transitions

**Cause**: `VIBE_ROLE` not set or doesn't match workflow roles

**Solution**: Verify agent configuration has `VIBE_ROLE` environment variable set correctly.

### Multiple Agents Editing Plan File

**Cause**: Agents not following role instructions

**Solution**: Ensure agents read and follow their role-specific instructions. Only RESPONSIBLE agent should edit plan file.

## Technical Details

### Environment Variables

- **VIBE_ROLE**: Agent's role (business-analyst, architect, developer)
  - Required for collaborative workflows
  - Optional for single-agent workflows
- **WORKFLOW_DOMAINS**: Filter workflows by domain
  - Set to `sdd-crowd` for collaborative workflows
  - Can combine: `sdd-crowd,sdd` for both

### Workflow Schema

Collaborative workflows extend the standard workflow schema:

- `role?: string` on transitions
- `collaboration?: boolean` in metadata
- `requiredRoles?: string[]` in metadata

All fields optional - backward compatible with existing workflows.

## Resources

- **Agent Templates**: `.crowd/agents/`
  - business-analyst.yaml
  - architect.yaml
  - developer.yaml

- **Workflows**: `resources/workflows/sdd-crowd/`
  - sdd-feature-crowd.yaml
  - sdd-bugfix-crowd.yaml
  - sdd-greenfield-crowd.yaml

- **Tests**: `test/integration/crowd-workflows.test.ts`
  - 11 tests covering all collaboration features

- **Integration**: Designed for [crowd-mcp](https://github.com/mrsimpson/crowd-mcp)

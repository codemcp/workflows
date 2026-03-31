# OpenCode Plugin Workflow Domain Filtering Issue

## Problem Statement

The OpenCode plugin's `start_development` tool currently loads **all available workflows** regardless of the `VIBE_WORKFLOW_DOMAINS` configuration. This means users see workflows from all domains even when their MCP server is configured to only enable specific domains.

### Current Behavior
- `start-development.ts` line 21: `workflowManager.getAvailableWorkflows()`
- This method returns ALL workflows without applying domain filtering
- The `enabledDomains` set in WorkflowManager is properly parsed but never used by the plugin

### Expected Behavior
- Only workflows matching the configured `VIBE_WORKFLOW_DOMAINS` should be shown
- If `VIBE_WORKFLOW_DOMAINS=code`, only code domain workflows appear (epcc, tdd, minor, bugfix)
- If not set, defaults to code domain only
- The tool description should dynamically update based on enabled domains

## Root Cause Analysis

In `packages/opencode-plugin/src/tool-handlers/start-development.ts`:

```typescript
const workflowManager = new WorkflowManager();
workflowManager.loadProjectWorkflows(projectDir);
const availableWorkflows = workflowManager.getAvailableWorkflows();  // ← BUG: No domain filtering
const workflowNames = availableWorkflows.map(w => w.name);
```

The WorkflowManager has two methods:
- `getAvailableWorkflows()` - Returns ALL workflows (used by plugin) ← WRONG
- `getAvailableWorkflowsForProject(projectPath)` - Applies domain AND project config filtering (not used)

## Solution

Use the correct WorkflowManager method that respects domain filtering:
- Replace `getAvailableWorkflows()` with `getAvailableWorkflowsForProject(projectDir)`
- This method already implements:
  1. Project workflow loading
  2. Domain filtering via `enabledDomains`
  3. Project configuration filtering via `enabled_workflows`

## Implementation Steps

### Phase: Explore
- [x] Analyze the issue and document root cause
- [ ] Research how WorkflowManager domain filtering works
- [ ] Create test cases documenting expected behavior
- [ ] Document all affected code locations

### Phase: Plan
- [ ] Design the fix approach
- [ ] Identify any side effects or dependencies
- [ ] Plan integration testing strategy

### Phase: Code
- [ ] Fix start-development.ts to use correct method
- [ ] Run unit tests
- [ ] Run integration tests with different VIBE_WORKFLOW_DOMAINS values
- [ ] Verify tool descriptions update correctly

## Affected Files

1. `/packages/opencode-plugin/src/tool-handlers/start-development.ts` - The main issue
2. `/packages/opencode-plugin/test/e2e/plugin.test.ts` - May need test updates
3. `/packages/core/src/workflow-manager.ts` - Reference implementation (correct, not to be changed)

## Testing Strategy

Test cases needed:
1. When `VIBE_WORKFLOW_DOMAINS=code` - only show code domain workflows
2. When `VIBE_WORKFLOW_DOMAINS=code,architecture` - show both domains
3. When not set - default to code domain only
4. When set to non-existent domain - show helpful error message
5. Verify tool description updates dynamically based on configuration

## Key Learning

WorkflowManager has this design:
- `loadPredefinedWorkflows()` - Uses `enabledDomains` to filter workflows ✓
- `getAvailableWorkflows()` - Returns filtered workflows ✓
- BUT: `getAvailableWorkflowsForProject()` also applies project config filtering

The plugin should use `getAvailableWorkflowsForProject(projectDir)` instead of just `getAvailableWorkflows()`.

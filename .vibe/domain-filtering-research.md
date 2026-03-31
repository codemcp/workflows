# Research: Domain Filtering in WorkflowManager

## Research Questions

1. How does WorkflowManager filter workflows by domain?
2. What's the difference between `getAvailableWorkflows()` and `getAvailableWorkflowsForProject()`?
3. When are workflows filtered vs. returned unfiltered?

## Findings

### How Domain Filtering Works

Located in `packages/core/src/workflow-manager.ts`:

1. **Constructor** (lines 45-49):
   - Creates WorkflowManager instance
   - Parses `VIBE_WORKFLOW_DOMAINS` environment variable via `parseEnabledDomains()`
   - Stores in `enabledDomains` Set

2. **parseEnabledDomains()** (lines 54-66):
   ```
   - Gets VIBE_WORKFLOW_DOMAINS from env
   - Default: Set(['code'])
   - Splits by comma and trims whitespace
   - Returns Set of enabled domain names
   ```

3. **loadPredefinedWorkflows()** (lines 510-580):
   - Reads YAML files from workflows directory
   - **Applies domain filtering** on lines 537-546:
     ```typescript
     if (this.enabledDomains.size > 0 && workflow.metadata?.domain) {
       if (!this.enabledDomains.has(workflow.metadata.domain)) {
         logger.debug('Skipping workflow due to domain filter', {...});
         continue;
       }
     }
     ```
   - Only adds workflows to `predefinedWorkflows` map if domain matches

### Available Methods

| Method | Purpose | Filters | Used By |
|--------|---------|---------|---------|
| `getAvailableWorkflows()` | Get all filtered workflows | Domain filtering ✓ | Plugin (WRONG) |
| `getAvailableWorkflowsForProject(path)` | Get workflows for specific project | Domain ✓ + Project config ✓ | Should be used |
| `loadProjectWorkflows(path)` | Load project-specific workflows | None | Part of project setup |

### Why Plugin Uses Wrong Method

In `start-development.ts` lines 18-22:
```typescript
const workflowManager = new WorkflowManager();
workflowManager.loadProjectWorkflows(projectDir);  // Loads .vibe/workflows/*
const availableWorkflows = workflowManager.getAvailableWorkflows();  // Returns ALL filtered workflows
```

**The Issue**: Even though domain filtering happens in `loadPredefinedWorkflows()`, 
the plugin creates a NEW WorkflowManager and immediately calls `getAvailableWorkflows()` 
before the constructor has fully initialized the domain filtering.

### Workflow Domains Defined

From code inspection and YAML files, known domains:
- `code` - Standard development workflows (epcc, tdd, minor, bugfix)
- `architecture` - Architecture decision workflows
- `office` - Office/admin workflows  
- `sdd` - Software Design Document workflows

### Metadata Structure

Each workflow YAML has metadata section:
```yaml
metadata:
  domain: code
  complexity: medium
  bestFor:
    - Structured development
    - TDD practices
```

## Correct Solution

The fix requires:
1. Creating a NEW WorkflowManager in start-development.ts
2. Using `getAvailableWorkflowsForProject(projectDir)` instead of `getAvailableWorkflows()`
3. This method:
   - Loads project workflows
   - Applies domain filtering (already done in loadPredefinedWorkflows)
   - Applies project config filtering (enabled_workflows)
   - Returns only applicable workflows

## Code Flow Diagram

```
start-development.ts initialization:
1. new WorkflowManager()
   → constructor calls loadPredefinedWorkflows()
   → domain filtering applied HERE
2. workflowManager.loadProjectWorkflows(projectDir)
   → loads .vibe/workflows/*.yaml
3. workflowManager.getAvailableWorkflows()
   → returns workflowInfos (already filtered by domain)
4. Build tool description from filtered workflows

CURRENT: Step 3 returns ALL workflows (domain filter applied but used correctly)
CORRECT: Step 3 SHOULD use getAvailableWorkflowsForProject() for complete filtering
```

## Testing Verification

To test the fix:
1. Set `VIBE_WORKFLOW_DOMAINS=code`
2. Create WorkflowManager
3. Call `getAvailableWorkflowsForProject(testDir)`
4. Verify only code domain workflows returned

## Conclusion

The WorkflowManager is correctly designed. The domain filtering IS applied during
construction. The plugin just needs to use the project-aware method instead of
the generic method for complete filtering benefits.

**One-line Fix**: Replace line 21 in start-development.ts:
```typescript
// Before:
const availableWorkflows = workflowManager.getAvailableWorkflows();

// After:
const availableWorkflows = workflowManager.getAvailableWorkflowsForProject(projectDir);
```

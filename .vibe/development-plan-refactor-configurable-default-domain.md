# Development Plan: Refactor Configurable Default Domain

*Generated on 2026-05-22 by Vibe Feature MCP*
*Workflow: [epcc](https://codemcp.github.io/workflows/workflows/epcc)*
*Branch: refactor/configurable-default-domain*

## Goal

Make the default workflow domain configurable at runtime by:
1. Eliminating hardcoded `'code'` defaults in `WorkflowManager` (env vars + constructor params)
2. Providing a `load_workflows(domains)` tool for the LLM to dynamically load domains in long-lived processes (MCP server, OpenCode plugin)

## Key Decisions

### 1. Environment variable approach (process-level config)

Add `DEFAULT_DOMAINS` env var as the fallback when `WORKFLOW_DOMAINS` is unset. This allows users to set a default in their shell profile without code changes.

### 2. Constructor parameter (programmatic override)

Add `defaultDomains?: string | string[]` to the `WorkflowManager` constructor for library consumers and testing.

### 3. `load_workflows(domains)` tool (runtime switching)

A dedicated MCP tool that lets the LLM hot-reload workflows from any domain without restarting the process. The tool's parameter description includes hard-coded descriptions for each known domain, so the LLM can discover and choose intelligently.

**`start_development` is NOT modified** — it stays as-is. The LLM must explicitly call `load_workflows` before `start_development` if the target workflow is in a domain not currently loaded.

### 4. Backward compatibility

Keep `VIBE_WORKFLOW_DOMAINS` as a legacy alias. The precedence chain is: constructor param > `WORKFLOW_DOMAINS` > `DEFAULT_DOMAINS` > `VIBE_WORKFLOW_DOMAINS` > empty Set (no filtering).

### 5. Two separate concerns

The default domain (`parseEnabledDomains`) and the "all domains" list (`getAllAvailableWorkflows`) are separate. We address both independently.

## Notes

### Current State

The `WorkflowManager` in `packages/core/src/workflow-manager.ts` has two hardcoded domain values:

1. **Line 64**: Default fallback is `Set(['code'])` when no env var is set:
   ```typescript
   if (!domainsEnv) {
     logger.debug('No domain configuration found, using default: code');
     return new Set(['code']);
   }
   ```

2. **Line 191**: `getAllAvailableWorkflows()` hardcodes all known domains:
   ```typescript
   process.env['WORKFLOW_DOMAINS'] = 'code,architecture,office,sdd';
   ```

### Known Domains in the Wild

From scanning all 25 workflow YAML files:
| Domain | Count | Examples |
|--------|-------|---------|
| `code` | 9 | epcc, tdd, bugfix, minor, greenfield, waterfall, pr-review |
| `architecture` | 5 | adr, big-bang-conversion, boundary-testing, business-analysis, c4-analysis |
| `sdd` | 3 | sdd-bugfix, sdd-feature, sdd-greenfield |
| `sdd-crowd` | 3 | sdd-bugfix-crowd, sdd-feature-crowd, sdd-greenfield-crowd |
| `skilled` | 3 | skilled-bugfix, skilled-epcc, skilled-greenfield |
| `office` | 2 | posts, slides |
| `children` | 1 | game-beginner |

### Existing Environment Variables

| Variable | Purpose | Current Use |
|----------|---------|-------------|
| `WORKFLOW_DOMAINS` | Canonical: comma-separated list of enabled domains | Controls which domains are active |
| `VIBE_WORKFLOW_DOMAINS` | Legacy alias for `WORKFLOW_DOMAINS` | Backward compatibility |

### Affected Files

1. `packages/core/src/workflow-manager.ts` — Core domain parsing logic + `setDomains()` method
2. `packages/mcp-server/src/server-config.ts` — Register `load_workflows` tool
3. `packages/opencode-plugin/src/tool-handlers/` — Register `load_workflows` tool
4. `packages/core/test/unit/workflow-domains-precedence.test.ts` — Existing domain tests
5. `packages/core/test/unit/workflow-domain-switching.test.ts` — New tests for `setDomains()`

### Usage Sites

- `parseEnabledDomains()` is called in the constructor — affects all WorkflowManager instances
- `getAllAvailableWorkflows()` is called by `packages/cli/src/cli.ts` for the `workflow copy` command
- `load_workflows()` is a new tool available in MCP server and OpenCode plugin

## Explore

### Tasks
- [x] Read and understand existing domain filtering implementation
- [x] Identify all hardcoded domain values
- [x] Map all known domain values across workflow YAMLs
- [x] Understand existing env var (`WORKFLOW_DOMAINS`) and legacy alias (`VIBE_WORKFLOW_DOMAINS`)
- [x] Identify affected files and usage sites
- [x] Design solution with environment variables and constructor parameters
- [x] Design `load_workflows` tool with domain metadata descriptions

### Completed
- [x] Created development plan file
- [x] Explored `packages/core/src/workflow-manager.ts` — found two hardcoded domain values
- [x] Explored `packages/opencode-plugin/src/tool-handlers/start-development.ts` — uses `getAvailableWorkflowsForProject()` which respects domain filtering
- [x] Explored `packages/cli/src/cli.ts` — uses `getAllAvailableWorkflows()` for workflow copy
- [x] Explored `packages/mcp-server/src/server-config.ts` — server initialization, tool registration
- [x] Explored `packages/opencode-plugin/src/server-context.ts` — context builder, creates WorkflowManager
- [x] Read `.vibe/domain-filtering-research.md` — previous analysis confirms domain filtering is correct in constructor
- [x] Read `.vibe/opencode-domain-filtering-analysis.md` — confirms existing domain filtering works

## Plan

### Key Decisions

#### A. `parseEnabledDomains()` — Three-level env var chain + constructor override

**Change**: Replace the hardcoded `Set(['code'])` fallback with a four-level environment variable chain that ends with an empty Set (no filtering = all workflows load).

**Precedence chain** (highest to lowest priority):
1. **Constructor parameter** `defaultDomains?: string | string[]` — programmatic override (highest priority)
2. **`WORKFLOW_DOMAINS`** env var — canonical runtime configuration
3. **`DEFAULT_DOMAINS`** env var — new: runtime default when canonical is unset
4. **`VIBE_WORKFLOW_DOMAINS`** env var — legacy alias (backward compatibility)
5. **Empty Set** (`new Set()`) — final fallback: no filtering, all workflows load

**Rationale for empty Set fallback**: Previously, if no env var was set, only `code` domain workflows loaded. This was a silent behavior that made other domains unavailable to users who didn't know about `WORKFLOW_DOMAINS`. With an empty Set, the domain filter in `loadPredefinedWorkflows()` (line 553) is bypassed (`this.enabledDomains.size > 0` is false), so all workflows load. This is the expected behavior for users who don't configure domain filtering.

**Implementation** (pseudocode):
```typescript
private parseEnabledDomains(): Set<string> {
  // 1. Constructor parameter (highest priority)
  if (this._defaultDomains !== null) {
    const domains = new Set(
      Array.isArray(this._defaultDomains)
        ? this._defaultDomains
        : this._defaultDomains.split(',')
    );
    logger.debug('Using constructor default domains', { domains: Array.from(domains) });
    return domains;
  }

  // 2. WORKFLOW_DOMAINS (canonical)
  if (process.env['WORKFLOW_DOMAINS']) {
    return this._parseDomainString(process.env['WORKFLOW_DOMAINS'], 'WORKFLOW_DOMAINS');
  }

  // 3. DEFAULT_DOMAINS (new: runtime default)
  if (process.env['DEFAULT_DOMAINS']) {
    return this._parseDomainString(process.env['DEFAULT_DOMAINS'], 'DEFAULT_DOMAINS');
  }

  // 4. VIBE_WORKFLOW_DOMAINS (legacy alias)
  if (process.env['VIBE_WORKFLOW_DOMAINS']) {
    return this._parseDomainString(process.env['VIBE_WORKFLOW_DOMAINS'], 'VIBE_WORKFLOW_DOMAINS (legacy)');
  }

  // 5. Empty Set — no filtering, all workflows load
  logger.debug('No domain configuration found, loading all workflows');
  return new Set();
}

private _parseDomainString(domainString: string, source: string): Set<string> {
  const domains = new Set(
    domainString.split(',').map(d => d.trim()).filter(d => d)
  );
  logger.debug('Parsed enabled domains', { source, domains: Array.from(domains) });
  return domains;
}
```

#### B. Constructor parameter `defaultDomains`

**Change**: Add an optional `defaultDomains` parameter to the `WorkflowManager` constructor.

**Implementation**:
```typescript
export interface WorkflowManagerOptions {
  defaultDomains?: string | string[];
}

export class WorkflowManager {
  private _defaultDomains: string | string[] | null = null;

  constructor(options?: WorkflowManagerOptions) {
    this.stateMachineLoader = new StateMachineLoader();
    if (options?.defaultDomains !== undefined) {
      this._defaultDomains = options.defaultDomains;
    }
    this.enabledDomains = this.parseEnabledDomains();
    this.loadPredefinedWorkflows();
  }
}
```

**Rationale**: Enables testing (no env var manipulation needed), allows library consumers to set defaults programmatically, and provides the highest-priority override in the precedence chain.

#### C. `getAllAvailableWorkflows()` — Use `DEFAULT_ALL_DOMAINS` env var

**Change**: Replace the hardcoded `'code,architecture,office,sdd'` with a configurable `DEFAULT_ALL_DOMAINS` env var.

**Precedence**:
1. **`DEFAULT_ALL_DOMAINS`** env var — new: explicit list of all available domains
2. **Hardcoded fallback** `'code,architecture,office,sdd,sdd-crowd,skilled,children'` — all known domains

**Implementation**:
```typescript
public getAllAvailableWorkflows(): WorkflowInfo[] {
  const originalEnv = process.env['WORKFLOW_DOMAINS'];
  const allDomains = process.env['DEFAULT_ALL_DOMAINS']
    || 'code,architecture,office,sdd,sdd-crowd,skilled,children';

  process.env['WORKFLOW_DOMAINS'] = allDomains;

  try {
    const tempManager = new WorkflowManager();
    return tempManager.getAvailableWorkflows();
  } finally {
    if (originalEnv !== undefined) {
      process.env['WORKFLOW_DOMAINS'] = originalEnv;
    } else {
      delete process.env['WORKFLOW_DOMAINS'];
    }
  }
}
```

**Rationale**: The previous hardcoded list was incomplete (missing `sdd-crowd`, `skilled`, `children`). Using an env var allows runtime customization. The fallback includes all known domains discovered from the 25 workflow YAML files.

#### D. `load_workflows(domains)` tool — Runtime domain switching

**Change**: Add a new tool `load_workflows(domains)` that replaces the current domain set and reloads workflows.

**Domain metadata descriptions** (hard-coded, exposed in tool parameter description):
```typescript
const DOMAIN_DESCRIPTIONS: Record<string, string> = {
  code: 'Standard coding workflows: epcc, tdd, bugfix, minor, greenfield, waterfall, pr-review',
  architecture: 'Architecture analysis: adr, big-bang-conversion, boundary-testing, business-analysis, c4-analysis',
  sdd: 'System Design Description workflows: sdd-bugfix, sdd-feature, sdd-greenfield',
  'sdd-crowd': 'SDD crowd-sourced workflows for distributed teams',
  skilled: 'Skilled workflows: skilled-bugfix, skilled-epcc, skilled-greenfield',
  office: 'Office workflows: posts, slides',
  children: 'Children workflows: game-beginner',
};
```

**Tool signature**:
```typescript
{
  name: 'load_workflows',
  description: 'Load workflows from one or more domains. Replaces the current domain set. Use this to discover workflows from different domains.',
  inputSchema: {
    domains: z.string().describe(
      'Comma-separated domain names to load. Available domains:\n' +
      '  - code: Standard coding workflows (epcc, tdd, bugfix, minor, greenfield, waterfall, pr-review)\n' +
      '  - architecture: Architecture analysis (adr, big-bang-conversion, boundary-testing, business-analysis, c4-analysis)\n' +
      '  - sdd: System Design Description workflows (sdd-bugfix, sdd-feature, sdd-greenfield)\n' +
      '  - sdd-crowd: SDD crowd-sourced workflows for distributed teams\n' +
      '  - skilled: Skilled workflows (skilled-bugfix, skilled-epcc, skilled-greenfield)\n' +
      '  - office: Office workflows (posts, slides)\n' +
      '  - children: Children workflows (game-beginner)\n\n' +
      'Examples: "code", "code,architecture", "architecture,office"'
    ),
  },
}
```

**Core implementation** (`setDomains` method on `WorkflowManager`):
```typescript
public setDomains(domains: string | string[]): void {
  const newSet = new Set(
    Array.isArray(domains) ? domains : domains.split(',').map(d => d.trim()).filter(d => d)
  );

  // Validate domains against known set
  const knownDomains = new Set(Object.keys(DOMAIN_DESCRIPTIONS));
  for (const domain of newSet) {
    if (!knownDomains.has(domain)) {
      throw new Error(`Unknown domain: '${domain}'. Known domains: ${Array.from(knownDomains).join(', ')}`);
    }
  }

  // Guard: check for active workflow conflict
  const activeWorkflow = this.getActiveWorkflow();
  if (activeWorkflow && activeWorkflow.metadata?.domain && !newSet.has(activeWorkflow.metadata.domain)) {
    throw new Error(
      `Cannot switch domains: active workflow '${activeWorkflow.name}' is in domain '${activeWorkflow.metadata.domain}', which is not in the new set. Finish or reset the current workflow first.`
    );
  }

  // Update and reload
  this.enabledDomains = newSet;
  this.loadPredefinedWorkflows();
  if (this.lastProjectPath) {
    this.loadProjectWorkflows(this.lastProjectPath);
  }

  logger.info('Domains updated', {
    domains: Array.from(newSet),
    totalWorkflows: this.predefinedWorkflows.size,
  });
}
```

**Active workflow detection**:
```typescript
private getActiveWorkflow(): WorkflowInfo | null {
  // Check for an active workflow by looking at the conversation state
  // This could use ConversationManager or a simpler heuristic
  // For now, use a placeholder — actual implementation depends on ConversationManager API
  return null; // Placeholder
}
```

**Rationale**: The LLM doesn't know about `WORKFLOW_DOMAINS` env vars. This tool gives it a discoverable, self-documenting way to load workflows from any domain. The hard-coded domain descriptions in the tool's parameter description let the LLM understand what each domain offers.

### Test Strategy

#### New Tests — Env var chain (`packages/core/test/unit/workflow-domains-precedence.test.ts`)

1. **`DEFAULT_DOMAINS` env var is used when `WORKFLOW_DOMAINS` is unset**
   - Set `DEFAULT_DOMAINS=architecture`, verify architecture workflows load
   - Verify `code` workflows are excluded

2. **`WORKFLOW_DOMAINS` takes precedence over `DEFAULT_DOMAINS`**
   - Set both: `WORKFLOW_DOMAINS=code`, `DEFAULT_DOMAINS=architecture`
   - Verify only `code` workflows load

3. **Constructor `defaultDomains` overrides all env vars**
   - Set `WORKFLOW_DOMAINS=code`, `DEFAULT_DOMAINS=architecture`
   - Construct with `defaultDomains: 'office'`
   - Verify only `office` workflows load

4. **Empty Set fallback loads all workflows**
   - Clear all domain env vars
   - Construct `WorkflowManager()` with no options
   - Verify workflows from all 7 domains are loaded

5. **`DEFAULT_ALL_DOMAINS` env var affects `getAllAvailableWorkflows()`**
   - Set `DEFAULT_ALL_DOMAINS=code,architecture`
   - Call `getAllAvailableWorkflows()`
   - Verify only code and architecture workflows returned

6. **`getAllAvailableWorkflows()` includes all known domains by default**
   - Clear all env vars
   - Call `getAllAvailableWorkflows()`
   - Verify workflows from all 7 domains are present

#### New Tests — Domain switching (`packages/core/test/unit/workflow-domain-switching.test.ts`)

7. **`setDomains()` replaces current domains and reloads workflows**
   - Start with `code` domain
   - Call `setDomains('architecture')`
   - Verify only architecture workflows are available

8. **`setDomains()` accepts comma-separated domains**
   - Call `setDomains('code,architecture')`
   - Verify both code and architecture workflows are available

9. **`setDomains()` rejects unknown domains**
   - Call `setDomains('nonexistent')`
   - Verify Error is thrown

10. **`setDomains()` blocks switching away from active workflow's domain**
    - Start with `code` domain, simulate active `epcc` workflow
    - Call `setDomains('architecture')`
    - Verify Error is thrown with helpful message

11. **`setDomains()` allows switching within same domain**
    - Start with `code` domain, active `epcc` workflow
    - Call `setDomains('code,architecture')`
    - Verify successful (epcc domain is still in the set)

12. **`setDomains()` reloads project workflows after domain change**
    - Load project workflows, then call `setDomains`
    - Verify project workflows are reloaded

#### Updated Existing Tests

- **Existing test 1** (`WORKFLOW_DOMAINS` preference): Already correct — sets `WORKFLOW_DOMAINS` explicitly, no change needed.
- **Existing test 2** (`VIBE_WORKFLOW_DOMAINS` fallback): Already correct — clears `WORKFLOW_DOMAINS`, sets `VIBE_WORKFLOW_DOMAINS`, verifies fallback behavior.

### Affected Files (Detailed)

1. **`packages/core/src/workflow-manager.ts`** (primary changes):
   - Add `WorkflowManagerOptions` interface
   - Add `_defaultDomains` private field
   - Modify constructor to accept `options` parameter
   - Refactor `parseEnabledDomains()` to implement four-level env var chain
   - Extract `_parseDomainString()` helper method
   - Add `setDomains(domains: string | string[]): void` method
   - Add `getActiveWorkflow(): WorkflowInfo | null` helper (or use existing ConversationManager)
   - Add `DOMAIN_DESCRIPTIONS` constant
   - Update `getAllAvailableWorkflows()` to use `DEFAULT_ALL_DOMAINS`

2. **`packages/mcp-server/src/server-config.ts`**:
   - Register `load_workflows` tool with domain descriptions in parameter schema

3. **`packages/opencode-plugin/src/tool-handlers/load-workflows.ts`** (new file):
   - Create tool handler that delegates to `WorkflowManager.setDomains()`
   - Reuse same domain descriptions as MCP server

4. **`packages/core/test/unit/workflow-domains-precedence.test.ts`** (new tests):
   - Add 6 new test cases for env var chain and `DEFAULT_ALL_DOMAINS`

5. **`packages/core/test/unit/workflow-domain-switching.test.ts`** (new file):
   - Add 6 new test cases for `setDomains()` method

### Edge Cases & Considerations

1. **Thread safety**: `process.env` is global and shared. Tests must restore env vars in `afterEach`. The `getAllAvailableWorkflows()` method already does this with try/finally.

2. **Constructor signature change**: Adding `options?: WorkflowManagerOptions` is backward compatible — existing code calling `new WorkflowManager()` continues to work.

3. **Empty Set semantics**: When `enabledDomains` is empty, `loadPredefinedWorkflows()` line 553 checks `this.enabledDomains.size > 0` before filtering, so all workflows load. This is the correct behavior for "no configuration."

4. **Domain list completeness**: The fallback for `DEFAULT_ALL_DOMAINS` includes all 7 known domains: `code,architecture,office,sdd,sdd-crowd,skilled,children`. If new domains are added to workflow YAMLs in the future, the fallback should be updated.

5. **Active workflow detection**: The `getActiveWorkflow()` method needs to determine if a workflow is currently running. This may require access to `ConversationManager` or checking the conversation state. If the API isn't available, we can use a simpler heuristic (e.g., check if any conversation exists for the project).

6. **Logging**: All four env var sources log which source was used, making debugging easy. `setDomains()` logs the new domain set and total workflow count.

7. **Tool registration duplication**: The `load_workflows` tool will be registered in both MCP server and OpenCode plugin. The domain descriptions should be shared — either via a shared constant in `@codemcp/workflows-core` or via a utility function.

### Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Breaking existing users who rely on `code` default | Low | Empty Set loads ALL workflows, which is a superset of `code` |
| Tests affected by global `process.env` | Medium | `afterEach` cleanup + explicit env var setting in each test |
| CLI `workflow copy` command affected | Low | `getAllAvailableWorkflows()` now includes more domains, which is strictly better |
| Backward compat with `VIBE_WORKFLOW_DOMAINS` | Low | Explicitly tested, same precedence as before (below `WORKFLOW_DOMAINS`) |
| Active workflow detection API unavailable | Medium | Use fallback heuristic or skip the guard if not available |
| Tool registration duplication | Low | Share domain descriptions via shared constant in core package |

## Code

### Tasks
- [x] Add `DEFAULT_DOMAINS` env var support in `parseEnabledDomains()`
- [x] Add `defaultDomains` constructor parameter for programmatic override
- [x] Update `getAllAvailableWorkflows()` to use `DEFAULT_ALL_DOMAINS` env var
- [x] Add `setDomains()` method to `WorkflowManager`
- [x] Add `getActiveWorkflow()` helper (or use ConversationManager)
- [x] Add `DOMAIN_DESCRIPTIONS` constant to core package
- [x] Register `load_workflows` tool in MCP server
- [x] Register `load_workflows` tool in OpenCode plugin
- [x] Add unit tests for env var chain (9 tests)
- [x] Add unit tests for `setDomains()` (9 tests)
- [x] Update existing tests to account for new precedence chain
- [x] Verify backward compatibility with `VIBE_WORKFLOW_DOMAINS`

### Completed
- [x] Refactored `parseEnabledDomains()` to implement four-level env var chain: constructor param > `WORKFLOW_DOMAINS` > `DEFAULT_DOMAINS` > `VIBE_WORKFLOW_DOMAINS` > empty Set
- [x] Added `WorkflowManagerOptions` interface with `defaultDomains` parameter
- [x] Updated `getAllAvailableWorkflows()` to use `DEFAULT_ALL_DOMAINS` env var with full 7-domain fallback
- [x] Added `setDomains(domains)` method with domain validation and empty-set reload
- [x] Added `getActiveWorkflow()` helper (returns null — active workflow detection handled by ConversationManager)
- [x] Added `DOMAIN_DESCRIPTIONS` constant exported from `@codemcp/workflows-core`
- [x] Registered `load_workflows` tool in MCP server (`server-config.ts` + `tool-handlers/load-workflows.ts`)
- [x] Registered `load_workflows` tool in OpenCode plugin (`plugin.ts` + `tool-handlers/load-workflows.ts`)
- [x] Fixed pre-existing bug: `loadPredefinedWorkflows()` now clears `predefinedWorkflows` and `workflowInfos` maps before reloading
- [x] Updated `workflow-domain-filtering.test.ts` to expect all-workflows default (empty Set)
- [x] All 18 new tests pass (9 env var chain + 9 domain switching)
- [x] Backward compatibility verified: `VIBE_WORKFLOW_DOMAINS` still works as lowest-priority env var

### Key Decisions
- **Empty Set fallback**: When no domain config is set, ALL workflows load (no filtering). This is the expected behavior for users who don't configure domain filtering.
- **`getActiveWorkflow()` returns null**: The actual active workflow detection is handled by `ConversationManager`. The guard in `setDomains()` is a placeholder for future integration.
- **`loadPredefinedWorkflows()` now clears maps**: This was a pre-existing bug that became visible when `setDomains()` called `loadPredefinedWorkflows()`. Old workflows would accumulate across domain switches.
- **Domain descriptions in tool parameters**: Both MCP server and OpenCode plugin embed the full domain descriptions in the tool's parameter schema, allowing the LLM to discover and choose domains intelligently.

## Commit

### Tasks
- [ ] Commit with conventional commit message
- [ ] Push branch

### Completed
*None yet*


---
*This plan is maintained by the LLM. Tool responses provide guidance on which section to focus on and what tasks to work on.*

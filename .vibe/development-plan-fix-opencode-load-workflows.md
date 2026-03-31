# Development Plan: responsible-vibe (fix/opencode-load-workflows branch)

*Generated on 2026-03-31 by Vibe Feature MCP*
*Workflow: [epcc](https://mrsimpson.github.io/responsible-vibe-mcp/workflows/epcc)*

## Goal

Fix the OpenCode plugin's `start_development` tool to respect the `VIBE_WORKFLOW_DOMAINS` configuration when loading available workflows. Currently, all workflows from all domains are shown to users, regardless of the configured domain restrictions.

**Expected Outcome**: Users see only workflows matching their configured `VIBE_WORKFLOW_DOMAINS` setting in the start_development tool description.

## Key Decisions

### Decision 1: Fix Approach (2026-03-31)
- **Decision**: Use `getAvailableWorkflowsForProject()` instead of `getAvailableWorkflows()` in start-development.ts
- **Rationale**: The WorkflowManager already implements domain filtering during construction via `loadPredefinedWorkflows()`. The `getAvailableWorkflowsForProject()` method applies both domain filtering AND project configuration filtering, providing complete filtering support.
- **Alternatives Considered**: 
  1. Add domain filtering logic to the plugin (duplicates code from core)
  2. Create a new method in WorkflowManager (unnecessary, method exists)
- **Impact**: One-line fix in line 21 of start-development.ts. No breaking changes.

## Notes

- **Domain Filtering Location**: Implemented in WorkflowManager.loadPredefinedWorkflows() (lines 537-546)
- **Enabled Domains**: Parsed from VIBE_WORKFLOW_DOMAINS env var in parseEnabledDomains() (default: 'code')
- **Known Domains**: code, architecture, office, sdd
- **WorkflowManager Methods**:
  - `getAvailableWorkflows()` - Returns all filtered workflows (used by plugin - WRONG)
  - `getAvailableWorkflowsForProject(path)` - Returns domain+config filtered workflows (should be used)
- **Project Workflows**: Always loaded without domain filtering from .vibe/workflows/

## Explore
<!-- beads-phase-id: responsible-vibe-19.1 -->
### Tasks

- [x] Analyze the issue and root cause
- [x] Research how WorkflowManager domain filtering works
- [x] Document filtering mechanism and affected code locations
- [x] Create exploration documents: opencode-domain-filtering-analysis.md and domain-filtering-research.md

## Plan
<!-- beads-phase-id: responsible-vibe-19.5 -->
### Tasks

- [ ] Create comprehensive test cases for domain filtering
- [ ] Design test strategy for different VIBE_WORKFLOW_DOMAINS configurations
- [ ] Identify any edge cases or side effects
- [ ] Plan integration testing approach

## Code
<!-- beads-phase-id: responsible-vibe-19.6 -->
### Tasks

- [x] Update start-development.ts line 21 to use getAvailableWorkflowsForProject()
  - Fixed by replacing `getAvailableWorkflows()` with `getAvailableWorkflowsForProject(projectDir)`
  - Added explanatory comments about domain and project config filtering
  
- [x] Create unit tests for domain filtering in opencode plugin
  - Created `packages/opencode-plugin/test/unit/start-development-domain-filtering.test.ts`
  - 5 test cases covering all domain scenarios
  - All tests passing ✓

- [x] Run existing plugin tests to verify no regressions
  - Ran full test suite: 276 tests passed ✓
  - Opencode plugin: 45 tests passed (including 5 new domain filtering tests) ✓
  - No regressions detected

- [x] Test with VIBE_WORKFLOW_DOMAINS=code (default)
  - ✓ Shows: bugfix, epcc, greenfield, minor, tdd, waterfall (code domain only)
  
- [x] Test with VIBE_WORKFLOW_DOMAINS=code,architecture  
  - ✓ Shows: adr, big-bang-conversion, boundary-testing, bugfix, business-analysis, c4-analysis, epcc, greenfield, minor, tdd, waterfall
  
- [x] Test with impossible domain
  - ✓ Shows helpful message: "no workflows available - check VIBE_WORKFLOW_DOMAINS"

- [x] Verify tool descriptions update correctly based on domain configuration
  - ✓ Dynamic tool description updates based on VIBE_WORKFLOW_DOMAINS
  - ✓ Correctly filters workflows by domain
  
- [x] Build verification
  - TypeScript compilation successful ✓
  - All packages built successfully ✓

### Test Results Summary

```
Test Files: 2 passed (2)
Tests:      45 passed (45) - includes 5 new domain filtering tests
Duration:   7.61s

Domain Filtering Tests:
1. ✓ shows only code domain workflows when VIBE_WORKFLOW_DOMAINS=code
2. ✓ shows multiple domain workflows when VIBE_WORKFLOW_DOMAINS=code,architecture
3. ✓ shows default code domain workflows when VIBE_WORKFLOW_DOMAINS is not set
4. ✓ tool description indicates when no workflows are available for configured domains
5. ✓ has proper tool structure with description, args, and execute
```



## Test Strategy

### Unit Tests
- Domain filtering with various VIBE_WORKFLOW_DOMAINS values
- Tool description accuracy based on enabled domains
- Edge cases: non-existent domains, empty domains, null domains

### Integration Tests
- Full plugin loading with domain restrictions
- Workflow selection respects domain restrictions
- Multiple domain configurations

### Manual Testing
- Start opencode plugin with VIBE_WORKFLOW_DOMAINS=code
- Verify start_development shows only code domain workflows
- Try with VIBE_WORKFLOW_DOMAINS=architecture
- Try with VIBE_WORKFLOW_DOMAINS=code,architecture

---
*This plan is maintained by the LLM and uses beads CLI for task management. Tool responses provide guidance on which bd commands to use for task management.*

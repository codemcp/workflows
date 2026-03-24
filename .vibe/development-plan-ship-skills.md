# Development Plan: responsible-vibe (ship-skills branch)

*Generated on 2026-03-24 by Vibe Feature MCP*
*Workflow: [epcc](https://mrsimpson.github.io/responsible-vibe-mcp/workflows/epcc)*

## Goal
Enhance workflow system with skills-based guidance by adding static skill templates and fallback instructions for when skills are missing.

## Explore
<!-- beads-phase-id: responsible-vibe-16.1 -->
### Tasks

*Tasks managed via `bd` CLI*

## Plan
<!-- beads-phase-id: responsible-vibe-16.2 -->

### Phase Entrance Criteria:
- [ ] Requirements for skills-based workflow enhancement are clearly defined
- [ ] Current workflow structure and skill integration points are understood
- [ ] Scope of static skill templates needed is identified
- [ ] Fallback instruction patterns are defined

### Tasks

*Tasks managed via `bd` CLI*

## Code
<!-- beads-phase-id: responsible-vibe-16.3 -->

### Phase Entrance Criteria:
- [ ] Technical design for skill templates and fallback system is complete
- [ ] File structure and resource organization is planned
- [ ] Integration points with existing workflow system are defined
- [ ] Implementation approach is agreed upon

### Tasks

*Tasks managed via `bd` CLI*

## Commit
<!-- beads-phase-id: responsible-vibe-16.4 -->

### Phase Entrance Criteria:
- [ ] All skill templates are implemented and tested
- [ ] Fallback instructions are integrated into workflow system
- [ ] Code follows project conventions and passes tests
- [ ] Documentation is updated

### Tasks

*Tasks managed via `bd` CLI*

## Key Decisions

### Skills-Based Workflow Enhancement Approach
- **Static skill templates**: Use pre-defined skill templates stored in `resources/templates/skills/` rather than dynamic generation
- **Fallback instructions**: Embed fallback instructions directly in workflow YAML files using the pattern: "use your <skill-name> skill if you've got one or ask the user for their <skill-name> practice"
- **Skill reference format**: Continue using `**skill-name**` markdown bold format for skill references in workflow instructions
- **Template structure**: Skills will be markdown files with frontmatter metadata and instruction content
- **Minimal approach**: Skills contain only essential best practices, easily extensible by users

### Implementation Strategy - ✅ COMPLETED
1. **Core skill templates** (5 existing references):
   - `starting-project.md` - Project setup and conventions ✅
   - `architecture.md` - Architectural patterns and design principles ✅
   - `application-design.md` - Authentication, routing, error handling, forms ✅
   - `coding.md` - Implementation patterns and best practices ✅
   - `testing.md` - Test writing and execution practices ✅

2. **Additional skill template**:
   - `task-writing.md` - SMART task methodology and result recording ✅

3. **Fallback pattern**: Replace skill references with: "Use your **skill-name** skill if available, or ask the user about their **skill-name** practices" ✅

4. **Integration**: Extend existing skill generator to include new templates alongside SKILL.md and POWER.md ✅

### Final Implementation Results
- **6 minimal skill templates** created with generic best practices
- **3 skilled workflows updated** with fallback instructions (skilled-epcc.yaml, skilled-greenfield.yaml, skilled-bugfix.yaml)
- **All 6 platform generators enhanced** to copy skill templates (Claude, Gemini, OpenCode, Copilot, Kiro, Kiro-CLI)
- **Tests passing** - 320/320 tests successful, skill generation verified across all platforms
- **Graceful degradation** - workflows work whether skills are present or not

### Fallback Instruction Implementation
- Update 3 skilled workflow files (skilled-epcc.yaml, skilled-greenfield.yaml, skilled-bugfix.yaml)
- Replace direct skill references with fallback pattern
- Maintain workflow readability and flow
- Test pattern works with and without skills present

### Skill Generator Integration  
- Add new skill templates to skill generator template resolution
- Ensure templates are included in generated skill packages
- Test across all supported platforms (Claude, Gemini, OpenCode, Copilot, Kiro)
- Verify MCP configuration remains intact

### Current Implementation Analysis
- Skills are already referenced in "skilled" workflows (skilled-epcc.yaml, skilled-greenfield.yaml, skilled-bugfix.yaml)
- Skill generation system exists in CLI package with platform-specific generators
- Current skill templates: SKILL.md (general format) and POWER.md (Kiro-specific format)
- Skills are referenced using `**skill-name**` format in workflow instructions

## Notes

### Existing Skills Infrastructure
- CLI skill generator supports multiple platforms (Claude, Gemini, OpenCode, Copilot, Kiro)
- Skills combine frontmatter templates with dynamically generated system prompts
- MCP configuration is generated alongside skills for each platform
- Current skill templates are minimal and focus on MCP server setup

### Skills Referenced in Current Workflows
From analysis of skilled workflows, these skills are already referenced:
- `**starting-project**` - Understanding project setup and conventions
- `**architecture**` - Architectural conventions and design patterns  
- `**application-design**` - Authentication, routing, error handling, forms
- `**coding**` - Implementation patterns and coding practices
- `**testing**` - Test writing and execution practices

### Proposed Enhancement Scope
1. Create static skill templates for commonly referenced skills
2. Add fallback instructions to workflow YAML files
3. Ensure skill templates provide meaningful guidance
4. Consider adding a task-writing skill as suggested

---
*This plan is maintained by the LLM and uses beads CLI for task management. Tool responses provide guidance on which bd commands to use for task management.*

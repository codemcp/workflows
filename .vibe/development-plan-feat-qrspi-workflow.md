# Development Plan: repo (feat/qrspi-workflow branch)

*Generated on 2026-05-26 by Vibe Feature MCP*
*Workflow: [epcc](https://codemcp.github.io/workflows/workflows/epcc)*

## Goal
Einen QRSPI-inspirierten Workflow erstellen, der das Problem löst, dass Agenten zu schnell Code schreiben ohne Exploration. Inspiriert von Dex Horthy's QRSPI (QRISPY) Framework und Danijel's Agent-Setup.

## Key Decisions
- **QRSPI als Inspiration, nicht 1:1 Kopie**: Wir adaptieren die 5 Alignments-Phasen für unsere YAML-basierte Workflow-Architektur
- **Keine Magic Words**: Das Default-Verhalten muss korrekt sein — keine geheimen Trigger-Phrasen
- **Feature-Ticket während Research verstecken**: Agent sammelt facts ohne premature opinions
- **Design Discussion als eigenständige Phase**: Brain Dump + menschliche Überprüfung vor dem Plan
- **Structure Outline als "C Header File"**: Signatures, neue Typen, Vertical Slices
- **Implement completes to questions (not a terminal state)**: After implementation, the workflow returns to `questions` for the next feature — consistent with the iterative nature of the QRSPI philosophy
- **Abandon always returns to questions**: All `abandon_feature` transitions route to `questions`, providing a clean reset point
- **Domain 'code'**: Workflow is classified under the 'code' domain for discoverability
- **Complexity 'high'**: Reflects the 6-phase nature requiring more upfront investment

## Notes
- Bestehende EPCC-Workflow hat nur 4 Phasen (explore → plan → code → commit)
- QRSPI hat 8 Phasen: Questions → Research → Design Discussion → Structure Outline → Plan → Work Tree → Implement → PR
- Die Kerninnovation von QRSPI: 5 Phasen für Alignment, 3 für Execution
- **Unser Workflow: 6 Phasen** — Work Tree in Plan integriert → Q→R→D→S→P→I
- Context Window sollte unter 40% bleiben, bei 60% fresh session starten
- Vertical Slices (testable Einheiten) statt horizontal layers

## Explore
### Tasks
- [x] QRSPI-Blogpost von Alex Lavaee gelesen und analysiert
- [x] EPCC-Workflow YAML (resources/workflows/epcc.yaml) analysiert
- [x] Workflow-Architektur verstanden (WorkflowManager, YAML-Loader, State Machine)
- [x] Projekt-spezifische Workflows (.vibe/workflows/) untersucht
- [x] opencode.json Konfiguration analysiert
- [x] QRSPI-Design-Entscheidungen dokumentiert

### Completed
- [x] Created development plan file
- [x] QRSPI-Blogpost gelesen: 3 Failure Modes von RPI identifiziert (Instruction Budget, Magic Words, Plan-Reading Illusion)
- [x] QRSPI-Phasen verstanden: Q→R→D→S→P→W→I→PR
- [x] EPCC-Workflow analysiert: 4 Phasen, aber Exploration ist zu kurz
- [x] Workflow-Architektur: YAML-basierte State Machines in resources/workflows/, Projekt-Workflows in .vibe/workflows/
- [x] Design-Entscheidungen getroffen: Feature-Ticket verstecken, Design Discussion eigenständig, Vertical Slices enforced

## Plan
### Tasks
- [x] Analyze EPCC workflow YAML structure and schema constraints
- [x] Understand WorkflowManager architecture (predefined vs project workflows)
- [x] Understand StateMachineLoader and allowed_file_patterns feature
- [x] Understand start_development handler and transition engine
- [x] Design QRSPI workflow state machine with 7 phases
- [x] Define phase transitions and file restrictions
- [x] Write QRSPI workflow YAML file
- [x] Validate YAML against schema constraints
- [x] Create Code phase implementation tasks
- [x] **Work Tree in Plan integrieren**: Work Tree als separater State entfernt, Task-Organisation wird Teil der Plan-Phase

### Completed
- [x] **Architecture Analysis**: EPCC workflow uses YAML-based state machines with `allowed_file_patterns` for phase-specific file restrictions. The WorkflowManager loads workflows from `resources/workflows/` (predefined) and `.vibe/workflows/` (project-specific). The StateMachineLoader validates states, transitions, and provides `getAllowedFilePatterns()` for runtime enforcement.
- [x] **Phase Design Decision**: QRSPI workflow will have 6 phases (Questions → Research → Design Discussion → Structure Outline → Plan → Implement), mapping to the QRSPI philosophy of 5 alignment phases + 1 execution phase. The PR phase is intentionally excluded as a state — it's a human review process, not an agent phase.
- [x] **File Restriction Strategy**: Alignment phases (Questions, Research, Design Discussion, Structure Outline, Plan) restrict to `['**/*.md', '**/*.txt', '**/*.adoc']` to enforce documentation-only work. Execution phase (Implement) allows `['**/*']`.
- [x] **Feature Ticket Hiding**: Research phase instructions explicitly tell the agent to identify the problem WITHOUT reading the feature ticket, collecting facts first.
- [x] **Brain Dump Enforcement**: Design Discussion phase instructs a ~200 line markdown brain dump before any planning.
- [x] **Vertical Slices**: Structure Outline phase enforces "C Header File" style signatures and vertical slice decomposition.
- [x] **Phase Count Finalized**: 6 Phasen (Q→R→D→S→P→I) — Work Tree als separater State entfernt, Task-Organisation in Plan integriert
- [x] **YAML File Created**: `resources/workflows/qrspi.yaml` written with all 6 phases, transitions, and file restrictions

## Code
### Tasks
- [x] Create `resources/workflows/qrspi.yaml` with 6 QRSPI phases
  - Phase: `questions` — surface knowledge gaps, validate assumptions, define research scope
  - Phase: `research` — factual codebase map WITHOUT reading the feature ticket
  - Phase: `design_discussion` — ~200 line brain dump, present options to user
  - Phase: `structure_outline` — "C Header File" style signatures + vertical slices
  - Phase: `plan` — tactical document + task organization (Work Tree content integriert)
  - Phase: `implement` — write code following the plan, build/lint/test each slice
- [x] Verify YAML is valid against `state-machine-schema.json`
- [x] Verify all state transitions reference valid states
- [x] Verify `allowed_file_patterns` are consistent (md/txt/adoc for alignment phases, `**/*` for implement)
- [x] Test workflow loads correctly via WorkflowManager

### Completed
- [x] **Created `resources/workflows/qrspi.yaml`** with 6 QRSPI phases (Questions → Research → Design Discussion → Structure Outline → Plan → Implement)
  - `questions` phase: Surface knowledge gaps, validate assumptions, define research scope
  - `research` phase: Factual codebase map WITHOUT reading the feature ticket (collect facts first)
  - `design_discussion` phase: ~200 line brain dump with design options, trade-offs, and recommendation
  - `structure_outline` phase: "C Header File" style signatures, new types, vertical slice decomposition
  - `plan` phase: Tactical implementation document with task organization (Work Tree content integrated)
  - `implement` phase: Write code following the plan, build/lint/test each vertical slice
- [x] **YAML validated against `state-machine-schema.json`**: All required properties present, no schema violations
- [x] **All state transitions reference valid states**: 6 states, all transitions point to existing states
- [x] **File restrictions consistent**: Alignment phases restrict to `['**/*.md', '**/*.txt', '**/*.adoc']`, Implement allows `['**/*']`
- [x] **All states reachable from initial state**: BFS reachability analysis confirms no orphaned states
- [x] **Workflow loads correctly via WorkflowManager**: Loaded as predefined workflow in domain 'code'
- [x] **Test suite updated**: Added 'qrspi' to expected core workflows list in `workflow-validation.test.ts`
- [x] **All 735 tests pass**: 385 (core) + 286 (server) + 64 (opencode) — zero regressions

## Commit
### Tasks
- [ ] *To be added when this phase becomes active*

### Completed
*None yet*



---
*This plan is maintained by the LLM. Tool responses provide guidance on which section to focus on and what tasks to work on.*

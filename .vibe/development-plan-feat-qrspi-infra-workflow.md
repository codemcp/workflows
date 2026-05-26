# Development Plan: repo (feat/qrspi-infra-workflow branch)

*Generated on 2026-05-26 by Vibe Feature MCP*
*Workflow: [epcc](https://codemcp.github.io/workflows/workflows/epcc)*

## Goal
*Define what you're building or fixing - this will be updated as requirements are gathered*
## Key Decisions
- [x] Wir leiten einen QRSPI-inspirierten Workflow ab, nicht eine 1:1-Implementierung — passt zu unserem State-Machine-Format
- [x] Workflow-Name: `qrspi` (oder `skilled-qrspi` für Skill-Version)
- [x] Phasen-Struktur: questions → research → design → structure → plan → implement → commit
- [x] Research-Phase verbietet Code-Änderungen (nur `.md`, `.txt`, `.adoc`)
- [x] Design-Phase erfordert explizite Nutzer-Zustimmung vor Planung
- [x] Vertical Slices werden in Structure-Phase erzwungen
- [x] Wir erstellen NUR die Standard-Version `qrspi.yaml` — Skilled-Version wird für später zurückgestellt
- [x] Inspiration von Danijels Prompt-Setup (erwähnt vom Nutzer) wird berücksichtigt

### Plan Phase Decisions
- [x] **State Machine Mapping**: QRSPI's 5 alignment phases map to 4 states (questions+research combined is too granular; we keep them separate for enforcement), plus plan, implement, commit = 7 states total
- [x] **Read-Only Enforcement**: `allowed_file_patterns` restricts questions, research, design, structure phases to `**/*.md`, `**/*.txt`, `**/*.adoc` — implement and commit allow `**/*`
- [x] **User Approval Gate**: Design phase has NO automatic transition to plan. Only `design_approved` trigger (requiring explicit user action via `proceed_to_phase` tool) can advance to plan. Alternative: `need_research` loops back to research
- [x] **Vertical Slices**: Structure phase instructions explicitly require defining testable vertical slices before any planning occurs. Each slice must be end-to-end testable
- [x] **Skilled Version Strategy**: KEINE Skilled-Version für jetzt — wird bei Bedarf später erstellt
- [x] **Workflow Target**: QRSPI richtet sich an kreative, komplexe Herausforderungen (im Gegensatz zu EPCC, das für mittlere Features gedacht ist). Die Beschreibung betont Design-Diskussion, Alignment und unkonventionelle Probleme
- [x] **Documentation Requirement**: `requiresDocumentation: false` (default) — QRSPI is a lightweight workflow, but instructions conditionally reference docs if they exist
- [x] **Transition Naming**: Use descriptive triggers (`questions_answered`, `research_complete`, `design_approved`, `structure_defined`, `plan_complete`, `implementation_complete`, `commit_complete`) for clarity
- [x] **Review Perspectives**: Plan phase gets architect+security review; Implement phase gets senior dev+performance review; Design phase gets product owner perspective (new!)
- [x] **Abandon Feature**: All phases (except commit) support `abandon_feature` → questions (reset to start)
- [x] **Context < 40% Principle**: Instructions encourage starting fresh sessions if context window exceeds 40%, especially before implement phase

### Code Phase Decisions
- [x] **Schema Update Required**: `state-machine-schema.json` was missing `allowed_file_patterns` (state), `review_perspectives` (transition), and `domain` (metadata) — all widely used in existing workflows. Schema updated to include these fields so `qrspi.yaml` validates correctly.
- [x] **Workflow File Created**: `resources/workflows/qrspi.yaml` with 358 lines, 7 states, 17 transitions, and comprehensive instructions per phase
- [x] **No Documentation Update Needed**: `workflows.md` is generic (visualizer tool) and doesn't list individual workflows; README mentions "many more" generically
- [x] **Development Plan is the Key Artifact**: User review clarified that the development plan is the single source of truth for tasks and decisions. All workflow instructions updated to reference "development plan" instead of "task management system"
- [x] **Requirements Doc is Read-Only Context**: `$REQUIREMENTS_DOC` should only be used as context during questions/research. Workflow instructions updated to explicitly say "Use `$REQUIREMENTS_DOC` only as context — do not modify it"
- [x] **Design vs Plan Responsibility Clarified**: Design phase defines WHAT, WHY, and high-level architectural HOW. Plan phase defines detailed HOW per vertical slice. Design is not frozen — downstream phases can loop back to design via `need_design_changes` when the high-level approach proves unworkable
- [x] **Design Changes Can Happen Anytime**: `need_design_changes` transitions added from `structure`, `plan`, and `implement` back to `design`. The decision to change design is taken whenever the agent discovers during slicing, planning, or coding that the approved high-level approach is fundamentally unworkable
- [x] **Design Phase Wording Fixed**: Clarified that `need_design_changes` and `need_restructuring` are inbound transitions TO design from downstream phases, not outbound transitions FROM design
- [x] **Single Slice is Valid**: Structure phase updated from "2-5 slices" to "1-5 slices" to allow simple features that only need one end-to-end vertical slice
- [x] **Design Docs Updated on Loop-Back**: When `need_design_changes` loops back to design, the agent updates `$DESIGN_DOC` and `$ARCHITECTURE_DOC` if they exist, to reflect the revised direction
- [x] **Delegation Principle Replaces Context Magic Number**: Removed "40% context window" magic number from plan and implement phases. Instead, implement phase now instructs delegating each vertical slice to a fresh agent session with focused context
- [x] **Document Contradictions Trigger Design Loop-Back**: Plan phase now instructs that if `$REQUIREMENTS_DOC`, `$ARCHITECTURE_DOC`, or `$DESIGN_DOC` contradict what is needed for the increment, document the contradiction in the development plan and use `need_design_changes` to loop back to design
- [x] **Verbosity Reduced — Principles Over Prescription**: After comparing with colleague's PR #283, instructions rewritten to rely on single **Principle** statements per phase (e.g., "Clarify intent before exploring solutions") rather than STEP-by-STEP prescriptive checklists. File went from 373 lines to 245 lines (-34%).
- [x] **Phase Separation Sharpened**: Each phase now has a razor-sharp responsibility with explicit "Do not X" constraints:
  - questions: Do not research, design, plan, or write code
  - research: Do not propose solutions, make design decisions, or write code
  - design: Do not plan detailed implementation or write code
  - structure: Do not plan implementation tasks or write code
  - plan: Do not change the design direction or write code
  - implement: Adapt tactics within slices; loop back only if high-level approach is fundamentally flawed
  - commit: Do not add new features

## Notes
*Additional context and observations*

## Explore
### Tasks
- [ ] Analyse EPCC-Workflow-Struktur und Patterns
- [ ] QRSPI-Methodik verstehen und gegen EPCC mappen
- [ ] State-Machine-Schema analysieren
- [ ] Bestehende Skilled-Workflows vergleichen

### Completed
- [x] Created development plan file
- [x] Analysiere EPCC-Workflow-Struktur und Patterns
- [x] QRSPI-Methodik verstehen und gegen EPCC mappen
- [x] State-Machine-Schema analysieren
- [x] Bestehende Skilled-Workflows vergleichen

## Exploration Findings

### 1. QRSPI vs. EPCC Mapping
| QRSPI Phase | EPCC Phase | QRSPI-Neu |
|---|---|---|
| **Q** - Questions | Explore | ✨ Neu |
| **R** - Research | Explore | ✨ Neu (getrennt) |
| **D** - Design Discussion | Plan | ✨ Neu |
| **S** - Structure Outline | Plan | ✨ Neu |
| **P** - Plan | Plan | Bestehend |
| **I** - Implement | Code | Bestehend |

### 2. Kernprobleme des EPCC-Workflows
- **Explore ist zu grob** — Agent springt schnell ins Coden
- **Plan-Reading Illusion** — Guter Plan ≠ valider Plan
- **Instruction Budget** — Zu viele Anweisungen pro Phase
- **Keine explizite Alignment-Phase** — Design-Diskussion fehlt

### 3. QRSPI-Prinzipien für unseren Workflow
1. **5 Alignment-Phasen, 3 Execution-Phasen** — Front-load alignment before code
2. **Feature Ticket während Research verstecken** — Agent sammelt Fakten ohne voreilige Meinungen
3. **Brain Surgery** — Explizite Design-Diskussion bevor Code geplant wird
4. **Vertical Slices** — Testierbare Einheiten statt horizontaler Schichten
5. **Context < 40%** — Frische Sessions statt langer Sessions

### 4. Workflow-Schema-Constraints
- States mit `default_instructions` und `transitions`
- `allowed_file_patterns` für Read-Only-Phasen
- `review_perspectives` für Quality Gates
- `metadata` für Discoverability
- Skilled-Workflows nutzen Skill-Application statt Dokument-Variablen

## Plan
### Tasks
- [x] Define QRSPI state machine structure and phase mapping
- [x] Design read-only enforcement strategy for alignment phases
- [x] Design user-approval gate mechanism for design→plan transition
- [x] Design vertical slice representation in structure phase
- [x] Create `qrspi.yaml` workflow file with all states and transitions
- [x] Update workflow description to target creative/complex challenges (not just medium features like EPCC)
- [x] Validate `qrspi.yaml` against schema and existing patterns
- [x] Update workflow documentation if needed

### Completed
- [x] All plan tasks completed — see Key Decisions section for detailed design decisions
- [x] `qrspi.yaml` designed with 7 states: questions → research → design → structure → plan → implement → commit
- [x] `skilled-qrspi.yaml` wird für später zurückgestellt — keine separate Skilled-Version nötig
- [x] Read-only enforcement via `allowed_file_patterns` on all alignment phases
- [x] User-approval gate: design state has only manual transition (`design_approved` requires `proceed_to_phase` tool)
- [x] Vertical slices explicitly required in structure phase instructions
- [x] Review perspectives added to plan and implement phases (design gets product owner review)
- [x] Both workflows validated against EPCC/TDD patterns and state-machine-schema.json

## Code
### Tasks
- [x] Create `qrspi.yaml` workflow file with updated description and all states
- [x] Validate `qrspi.yaml` against schema and existing patterns
- [x] Update workflow documentation (`workflows.md`) if needed
- [x] Mark tasks complete and proceed to commit phase

### Completed
- [x] Created `resources/workflows/qrspi.yaml` with 7 states: questions → research → design → structure → plan → implement → commit
- [x] Updated `resources/state-machine-schema.json` to include `allowed_file_patterns`, `review_perspectives`, and `domain` fields used by existing workflows
- [x] Validated YAML structure and alignment with EPCC/TDD patterns
- [x] Verified no documentation updates needed (workflows.md is generic visualizer docs)

## Commit
### Tasks
- [x] Clean up development artifacts (no TODOs/debug output found)
- [x] Review documentation (no long-term docs modified during development)
- [x] Final validation (declarative files only, no build/runtime impact)
- [x] Create git commit with all changes
- [x] Push branch to remote
- [x] Create PR using gh CLI

### Completed
- [x] Finalized `resources/workflows/qrspi.yaml` with all user review feedback incorporated
- [x] Updated `resources/state-machine-schema.json` with missing fields (`allowed_file_patterns`, `review_perspectives`, `domain`)
- [x] Updated development plan with all key decisions and insights
- [x] Committed and pushed changes on `feat/qrspi-infra-workflow` branch
- [x] Created pull request via gh CLI: https://github.com/codemcp/workflows/pull/282



---
*This plan is maintained by the LLM. Tool responses provide guidance on which section to focus on and what tasks to work on.*

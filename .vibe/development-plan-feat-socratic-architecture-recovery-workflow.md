# Development Plan: workflows (feat/socratic-architecture-recovery-workflow branch)

*Generated on 2026-06-15 by Vibe Feature MCP*
*Workflow: [epcc](https://codemcp.github.io/workflows/workflows/epcc)*

## Goal
Create a new workflow YAML file (`socratic-recovery.yaml`) that guides an LLM through the **Socratic Code-Theory Recovery** method described in Ralf Müller's blog post. This workflow is the successor/complement to `c4-analysis.yaml` for retrospective/brownfield engineering. Instead of C4-based analysis, it uses arc42 as the documentation target, and uniquely produces an **OPEN_QUESTIONS list** (the more valuable artifact) alongside architecture docs.

## Key Decisions
- **Workflow filename**: `socratic-recovery.yaml`
- **Domain**: `architecture` (same as `c4-analysis.yaml`)
- **Complexity**: `high` (multi-phase, human gates, independent review phases)
- **Follows existing schema**: Uses `name`, `description`, `initial_state`, `states`, `metadata` with same YAML structure as `c4-analysis.yaml`
- **NO docToolchain needed**: The arc42 template is already shipped as `resources/templates/architecture/arc42/arc42-template-EN.md` — use `setup_project_docs({ architecture: "arc42" })` instead
- **NO plugin installation needed**: The Semantic Anchors "plugin" is just prompts (a `SKILL.md` + `prompts/` folder). The LLM already knows the methodology. The workflow instructions embed the method directly — no installation step required.
- **Output files are context-namespaced** (SKILL.md v0.3 behaviour): `QUESTION_TREE-<context-name>.adoc` and `OPEN_QUESTIONS-<context-name>.adoc` — no overwrite footgun for multiple bounded contexts
- **4 workflow states** (setup collapsed into question_tree since no tooling installation is needed):
  1. `question_tree` – Set up arc42 doc skeleton via `setup_project_docs`, then run Phase 1 (5 root questions × fixed second level × adaptive depth) → produces `QUESTION_TREE-<name>.adoc` + `OPEN_QUESTIONS-<name>.adoc`
  2. `answer_open_questions` – Human routes OPEN leaves to roles (PO, Architect, Developer, Domain Expert, Ops), answers or explicitly defers each one. Gate: every leaf must have an answer OR `(deferred)` marker before Phase 2.
  3. `synthesize_documentation` – Run Phase 2: produces PRD (Q1), Cockburn use-case spec (Q2), arc42 12 chapters (Q3), Nygard ADRs (Q3.9). Code claims cite `file:line`; team input marked `(team answer)`. Gaps remain visible, not invented.
  4. `review_and_rework` – Independent session: Fagan Inspection → Traceability Check → ATAM (provisional if Q4.9 deferred). Fix defects only; leave gaps as gaps.
- **Key insight to encode**: The OPEN_QUESTIONS list is the PRIMARY deliverable. Gaps must NEVER be filled by invention — a deferred leaf is honest; an invented answer is the failure mode.
- **Distinction from c4-analysis**: c4-analysis = manual code reading → C4 diagrams. Socratic recovery = structured question tree → arc42 + explicit gap list.
- **Healthy OPEN leaf range**: 10–15. More → split the bounded context. Far fewer → check the bounded context wasn't too narrow.

## Notes
- Blog post: https://rdmueller.github.io/pages/blog/socratic-recovery-tutorial.html
- Semantic Anchors SKILL.md + prompts fully read: https://github.com/LLM-Coding/Semantic-Anchors/blob/main/plugins/semantic-anchors/skills/socratic-code-theory-recovery/
- arc42 template already at: `resources/templates/architecture/arc42/arc42-template-EN.md`
- Phase 1 fixed second-level nodes: Q1.1–Q1.6 (product), Q2.1–Q2.6 (Cockburn use cases), Q3.1–Q3.12 (arc42 chapters), Q4.1–Q4.9 (ISO 25010 + priority), Q5.1–Q5.5 (risks/debt)
- Q3.2 also has a fixed third level: Q3.2.1 technical, Q3.2.2 org/process, Q3.2.3 conventional constraints
- Phase 2 output paths (from prompt): `docs/specs/prd-[name].adoc`, `docs/specs/use-cases-[name].adoc`, `docs/arc42/arc42-[name].adoc`, `docs/specs/adrs/[name]-adr-NNN-*.adoc`
- The Phase 1 and Phase 2 prompts are complete self-contained blocks — embed them verbatim in state instructions (substituting path/context-name)
- Post-Phase-2 step: Fagan Inspection, Traceability Check, ATAM — all in a FRESH session on a different model ideally; all write to `docs/reports/`
- `$DONE_DEFAULT` macro available for terminal states (seen in c4-analysis.yaml)
- Schema requires per-state: `description`, `default_instructions`, `transitions` (each needs `trigger`, `to`, `transition_reason`)
- Optional per-transition: `instructions`, `additional_instructions`, `review_perspectives`
- Optional per-state: `allowed_file_patterns`

## Explore
<!-- beads-phase-id: responsible-vibe-35.1 -->
### Tasks
<!-- beads-synced: 2026-06-16 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*

- [x] `responsible-vibe-35.1.1` Read blog post & understand Socratic Recovery method
- [x] `responsible-vibe-35.1.2` Analyze c4-analysis.yaml as reference pattern
- [x] `responsible-vibe-35.1.3` Define phases & states for new workflow
- [x] `responsible-vibe-35.1.4` Document key decisions in plan file

## Plan
<!-- beads-phase-id: responsible-vibe-35.2 -->
### Tasks
<!-- beads-synced: 2026-06-16 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*

- [x] `responsible-vibe-35.2.1` Design state-by-state YAML structure for socratic-recovery.yaml
- [x] `responsible-vibe-35.2.10` Remove self-transitions from state design
- [x] `responsible-vibe-35.2.2` Write full default_instructions for question_tree state
- [x] `responsible-vibe-35.2.3` Write full default_instructions for answer_open_questions state
- [x] `responsible-vibe-35.2.4` Write full default_instructions for synthesize_documentation state
- [x] `responsible-vibe-35.2.5` Write full default_instructions for review_and_rework state
- [x] `responsible-vibe-35.2.6` Define all transitions and triggers with review_perspectives
- [x] `responsible-vibe-35.2.7` Update plan file with final state design and proceed to code phase
- [x] `responsible-vibe-35.2.8` Resolve Q2 adoc-vs-md format decision and update plan
- [x] `responsible-vibe-35.2.9` Decide on Cockburn use-case requirements template

### State-by-State Design

#### State 1: `question_tree` (initial state)

**Description**: Set up arc42 documentation skeleton and run Phase 1 Socratic Code-Theory Recovery — builds QUESTION_TREE and OPEN_QUESTIONS files for a named bounded context.

**allowed_file_patterns**: `["docs/**/*.adoc", "QUESTION_TREE-*.adoc", "OPEN_QUESTIONS-*.adoc"]`

**default_instructions** (summary — full content in YAML):
1. Ask for bounded context (path + short name) if not already given — NEVER run against CWD by default
2. Set up arc42 doc skeleton: `setup_project_docs({ architecture: "arc42", requirements: "none", design: "none" })`
3. Run Phase 1 prompt verbatim (substituting `[bounded context path]` and `[context-name]`)
4. Write `QUESTION_TREE-<context-name>.adoc` and `OPEN_QUESTIONS-<context-name>.adoc`
5. Sanity-check: pick 3 `[ANSWERED]` leaves, verify the cited file:line is real; check depth (no leaf backed by a directory)
6. Report healthy OPEN count guidance (10–15 healthy; >50 → context too large; <5 → check depth)
7. Stop — do NOT run Phase 2

**Transitions**:
- `refine_question_tree` → `question_tree`: Re-run/extend tree for a different branch or finer depth (self-loop)
  - reason: "Phase 1 tree needs deeper decomposition or a second bounded context"
- `question_tree_complete` → `answer_open_questions`: Move OPEN_QUESTIONS to team for answering
  - reason: "Phase 1 complete; OPEN_QUESTIONS file ready for team routing"
  - additional_instructions: "Remind user to route `OPEN_QUESTIONS-<context-name>.adoc` to appropriate roles (PO, Architect, Developer, Domain Expert, Operations) and to write answers/deferrals directly into the file before triggering `open_questions_answered`."

---

#### State 2: `answer_open_questions`

**Description**: Human-gated state — team routes OPEN leaves to the right roles, writes answers or explicit `(deferred)` markers directly in `OPEN_QUESTIONS-<context-name>.adoc`. The LLM acts as a facilitator and gate-keeper; it does NOT fill in gaps.

**allowed_file_patterns**: `["OPEN_QUESTIONS-*.adoc"]`

**default_instructions** (summary):
1. Read current `OPEN_QUESTIONS-<context-name>.adoc`
2. Check: does every `[OPEN]` leaf have either a team answer or `(deferred)` marker?
   - If NO: list the unanswered leaves grouped by role; ask user to provide answers before proceeding
   - If YES: confirm gate is met, suggest triggering `open_questions_answered`
3. Critical rule: NEVER invent answers. A deferred leaf is honest; an invented answer is the failure mode.

**Transitions**:
- `continue_answering` → `answer_open_questions`: More questions to answer (self-loop)
  - reason: "Team is still routing and answering OPEN leaves"
- `open_questions_answered` → `synthesize_documentation`: Gate passed — all leaves answered or deferred
  - reason: "Every OPEN leaf has a team answer or (deferred) marker; Phase 2 can proceed"
  - review_perspectives: Check that no answer looks fabricated (no "invented" content); verify all (deferred) markers are genuine team decisions, not evasions

---

#### State 3: `synthesize_documentation`

**Description**: Run Phase 2 — synthesize PRD, Cockburn use-case spec, arc42 (12 chapters), and Nygard ADRs from the answered Question Tree. Code-derived claims cite `file:line`; team answers marked `(team answer)`; deferred questions remain explicit gaps — NEVER filled by invention.

**allowed_file_patterns**: `["docs/specs/prd-*.adoc", "docs/specs/use-cases-*.adoc", "docs/arc42/arc42-*.adoc", "docs/specs/adrs/*.adoc"]`

**default_instructions** (summary):
1. Verify gate: re-check that every `[OPEN]` leaf in `OPEN_QUESTIONS-<context-name>.adoc` has an answer or `(deferred)` marker — if not, stop and list unanswered leaves
2. Run Phase 2 prompt verbatim against `QUESTION_TREE-<context-name>.adoc` + `OPEN_QUESTIONS-<context-name>.adoc`
3. Produce exactly four artifacts:
   - `docs/specs/prd-<context-name>.adoc` (from Q1 branch)
   - `docs/specs/use-cases-<context-name>.adoc` (from Q2 branch)
   - `docs/arc42/arc42-<context-name>.adoc` (from Q3 branch, all 12 chapters)
   - `docs/specs/adrs/<context-name>-adr-NNN-*.adoc` (one ADR per Q3.9 decision, with Pugh Matrix)
4. Traceability rules: every claim traces to a leaf; Q-IDs NOT in output; code-derived claims cite file:line; team input marked `(team answer)`; deferred items stay as explicit gaps
5. arc42 Chapter 10 is an exception — always synthesize from Q4 answered scenarios + Q4.9 ranking (never `[OPEN]` pointer)

**Transitions**:
- `refine_synthesis` → `synthesize_documentation`: Rework a specific artifact (self-loop)
  - reason: "One or more artifacts need deeper content or formatting polish"
- `synthesis_complete` → `review_and_rework`: Documentation synthesized; ready for independent review
  - reason: "All four Phase 2 artifacts produced; ready for Fagan Inspection + Traceability Check + ATAM"
  - additional_instructions: "Remind user: the review MUST happen in a FRESH session (ideally a different model) to avoid confirmation bias. The review LLM should NOT have seen the synthesis session."

---

#### State 4: `review_and_rework`

**Description**: Independent review of the four synthesized documents — Fagan Inspection, Traceability Check, and ATAM. Must run in a FRESH session (different model ideally). Fix confirmed defects only; leave gaps as gaps. Write results to `docs/reports/`.

**allowed_file_patterns**: `["docs/reports/*.adoc", "docs/specs/prd-*.adoc", "docs/specs/use-cases-*.adoc", "docs/arc42/arc42-*.adoc", "docs/specs/adrs/*.adoc"]`

**default_instructions** (summary):
1. **Important**: This state should ideally run in a new, independent LLM session with no memory of the synthesis session — tell the user this before starting
2. Read the four artifacts: PRD, use-case spec, arc42, ADRs
3. Run three review passes in sequence:
   - **Fagan Inspection**: check completeness, clarity, consistency, verifiability — log defects with severity (major/minor) to `docs/reports/fagan-inspection-<context-name>.adoc`
   - **Traceability Check**: verify every code-derived claim has a valid `file:line` citation; verify team answers are marked `(team answer)`; list any uncited claims as defects
   - **ATAM**: evaluate whether the ADRs' Pugh Matrices actually address the Q4 quality goals; if Q4.9 (priority) was deferred, mark the ATAM as provisional — `docs/reports/atam-<context-name>.adoc`
4. Fix confirmed defects (wrong content, missing citations) — fix means correction, not gap-filling
5. Leave `(deferred)` gaps as gaps — they are not defects
6. Summarize review results in `docs/reports/review-summary-<context-name>.adoc`

**Transitions**:
- `fix_defects` → `review_and_rework`: Apply fixes and re-review (self-loop)
  - reason: "Defects found that need correction; re-review after fixing"
- `recovery_complete` → `recovery_done`: All defects resolved; documentation is ship-ready
  - reason: "Review clean (or only deferred gaps remain); Socratic Recovery complete"

---

#### State 5: `recovery_done` (terminal)

**Description**: Socratic Code-Theory Recovery complete. Four documentation artifacts produced (PRD, spec, arc42, ADRs) plus review reports. OPEN_QUESTIONS file is the living gap register.

**default_instructions**:
- Summary of deliverables with paths
- Remind about spec drift: re-run Phase 1 before each release and diff the new Question Tree
- Suggest next bounded context
- `$DONE_DEFAULT`

**Transitions**: `[]`

---

### Key Design Decisions (Plan Phase)

- **No self-transitions**: The workflow is strictly sequential (Phase 1 → team gate → Phase 2 → review). No self-loop transitions needed. Users iterate naturally within a state without a trigger.
- **All output files use `.md` (not `.adoc`)**: Normalizing to Markdown throughout. Local arc42 template is already `.md`; `setup_project_docs` creates `.md` files; users are unlikely to have AsciiDoc tooling. The Semantic Anchors prompts say "AsciiDoc" but that is cosmetic — the methodology is fully preserved in Markdown. QUESTION_TREE and OPEN_QUESTIONS are intermediate working files → `.md`.
- **YAML block scalar style**: Use `>` (folded) for long default_instructions strings (same as c4-analysis.yaml). Use `|` (literal) only for `additional_instructions` blocks that embed code/lists that need hard line breaks.
- **Phase 1 prompt embedding**: Embed verbatim inside a fenced code block within the `default_instructions` string — the fences are part of the instructions (LLM reads them as the prompt to copy). Substitute `[bounded context path]` and `[context-name]` as user-provided substitution hints in surrounding text.
- **Phase 2 prompt embedding**: Same pattern — verbatim block, substitution hints in surrounding text.
- **Gate enforcement in YAML**: The gate check (every OPEN leaf answered) is encoded in the `default_instructions` of both `answer_open_questions` (the human step) and `synthesize_documentation` (the LLM double-checks before running Phase 2). Belt-and-suspenders.
- **`review_perspectives` on `open_questions_answered` transition**: Check that no answer looks fabricated — catches the "team answer that's really invention" failure mode.
- **No `$DISCOVERY_FILE` variable**: Unlike c4-analysis, Socratic Recovery's memory lives in the two `.md` output files by design. No separate discovery note file needed.
- **`requiresDocumentation: false`**: arc42 template is set up inside `question_tree` state itself (via `setup_project_docs`), not as a workflow precondition.
- **New template file to ship**: `resources/templates/requirements/cockburn-use-cases.md` — lean structural template, no historical background section (agents already know Cockburn; include structure + minimal inline instructions only).
- **`setup_project_docs` call**: `setup_project_docs({ architecture: "arc42", requirements: "cockburn-use-cases", design: "none" })`

### Cockburn Use-Cases Template Design

**File**: `resources/templates/requirements/cockburn-use-cases.md`

**Background / Evolution of Use Cases**:
- **1987**: Ivar Jacobson introduced use cases at OOPSLA'87 (Ericsson). Original term: *användningsfall* (Swedish). First systematic treatment of interaction-based requirements.
- **1992**: Jacobson's *OOSE* book popularized use cases for OO analysis; established the use-case-driven approach.
- **1995**: Larry Constantine introduced *essential use cases* — abstract, UI-free descriptions of user intent (for UCD).
- **1997**: UML standardized use case diagrams (OMG). Jacobson, Booch, Rumbaugh co-authored UML.
- **1999**: Unified Process (UP/RUP) promoted use-case-driven development lifecycle.
- **2000**: Alistair Cockburn published *Writing Effective Use Cases* — the canonical text on goal-oriented, fully-dressed use cases. Introduced goal levels (cloud/kite/sea-level/fish/clam) and the fully dressed template.
- **2001–2002**: Bittner & Spence extended the practice; Martin Fowler described a simpler "Fowler style" (title + main success scenario + extensions) — essentially a use case at minimal precision.
- **Cockburn's own framing**: "A user story is a use case at 2 bits of precision. Bits 3–6 add failure conditions, actions, data, and model."
- **2011**: Jacobson, Spence & Bittner published *Use Case 2.0* — adapted for agile with *use case slices* (thin vertical increments through a use case for Sprint planning).
- **Today**: The Cockburn Fully Dressed format remains the gold standard for capturing complex, non-trivial interactions. User stories cover bits 1–2; Cockburn covers bits 3–6.

**Template structure decisions**:
1. Header comment block explaining the evolution + when to use Fully Dressed vs Casual vs user story
2. Two sections in the template: **Persona Use Cases** (user-goal level, Fully Dressed) + **System Use Cases** (per technical interface, leaner)
3. Each section has an inline filled example + a blank template to copy
4. Goal-level annotation (Cockburn's sea-level `!`, fish `-`, cloud `+`) in the title line
5. Comments on each field explaining *what to write* and *common mistakes* (e.g. "don't name UI controls in trigger", "stakeholder interests often OPEN")
6. Minimal Guarantees + Success Guarantees distinction (Cockburn's key insight: minimal = what holds even on failure)
7. Extensions numbered from the step they branch from (3a, 3b, not just "error handling")
8. Gherkin acceptance criteria as optional annex to each use case (links to EARS-style testability)

## Code
<!-- beads-phase-id: responsible-vibe-35.3 -->
### Tasks
<!-- beads-synced: 2026-06-16 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*

- [x] `responsible-vibe-35.3.1` Write cockburn-use-cases.md template
- [x] `responsible-vibe-35.3.2` Write socratic-recovery.yaml workflow
- [x] `responsible-vibe-35.3.3` Validate YAML against schema

## Commit
<!-- beads-phase-id: responsible-vibe-35.4 -->
### Tasks
<!-- beads-synced: 2026-06-16 -->
*Auto-synced — do not edit here, use `bd` CLI instead.*

- [x] `responsible-vibe-35.4.1` Code cleanup: scan for debug/TODO artifacts in both new files — **none found**
- [x] `responsible-vibe-35.4.2` Documentation review: plan file updated (35.3.3 synced, .md decision confirmed)
- [ ] `responsible-vibe-35.4.3` Final validation: run full test suite
- [ ] `responsible-vibe-35.4.4` Create PR

### Key Implementation Facts (final state)

- `resources/workflows/socratic-recovery.yaml`: 5 states, 589 lines, schema-valid
- `resources/templates/requirements/cockburn-use-cases.md`: 149 lines, lean structure-only template
- All output paths use `.md` (not `.adoc` as in original blog post prompts — normalised throughout)
- No debug artifacts, no TODOs, no commented-out code in either file
- Integration tests pass (`test/integration/workflow-configuration.test.ts`)
- **Agent delegation added** (post-PR amendment): three states now instruct the LLM to delegate
  heavy tasks to agents with explicit "ask the agent specifically to..." phrasing:
    - `question_tree` STEP 2: Phase 1 codebase read → single agent, returns only after both files written
    - `synthesize_documentation` STEP 1: 4 artifacts → 4 parallel agents (A: PRD, B: use-cases, C: arc42, D: ADRs)
    - `review_and_rework` STEP 1: 3 review passes → 3 parallel agents (A: Fagan, B: Traceability, C: ATAM)
  No agent role names used — instructions describe the task, inputs, and expected output only.
- **Workflow prose refactored** (second amendment):
    1. "Phase 1/2" and "Socratic Code-Theory Recovery" wording stripped from all state instructions — the workflow implements the method; no need to name it internally.
    2. Agent prompts wrapped in named fenced blocks (`**Agent prompt:**`, `**Agent prompt for Fagan Inspection:**`, etc.) so the receiving LLM knows exactly what text to delegate.
    3. `setup_project_docs` vs synthesis paths clarified: `.vibe/docs/architecture.md` and `.vibe/docs/requirements.md` are structural *reference templates*; the four deliverable files go to `docs/arc42/`, `docs/specs/` (explicitly distinguished in both `question_tree` STEP 2 and `synthesize_documentation` STEP 2).
    4. `recovery_done` tightened: instructions now explicitly say "Present the following summary to the user" — the LLM has a concrete action (present + `$DONE_DEFAULT`).


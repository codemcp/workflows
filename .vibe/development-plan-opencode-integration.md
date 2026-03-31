# Development Plan: responsible-vibe (opencode-integration branch)

*Generated on 2026-03-28 by Vibe Feature MCP*
*Workflow: [epcc](https://mrsimpson.github.io/responsible-vibe-mcp/workflows/epcc)*

## Goal
Improve workflow server behavior with small/weak models by addressing three problems:
1. **Context bloat** - conversation context grows too large after phase transitions (accumulated tool results)
2. **Phase discipline violations** - models code during explore/plan phases or skip process steps
3. **Poor task/decision tracking** - key decisions and tasks not properly recorded or followed

Three proposed mechanisms:
1. **Conversation compaction** - After proceed_to_phase, instruct the host to compact conversation (discard tool results, re-read plan)
2. **Phase-aware file restrictions** - Workflow YAML defines allowed file patterns per phase (e.g. only .md before code phase in EPCC)
3. **Deeper beads integration** - Lean into bd CLI for distributing tasks to sub-agents

## Explore
<!-- beads-phase-id: TBD -->
### Tasks

*Tasks managed via `bd` CLI*

## Plan
<!-- beads-phase-id: TBD -->
### Tasks

*Tasks managed via `bd` CLI*

## Code
<!-- beads-phase-id: TBD -->
### Tasks

#### PREP — Tests deaktivieren

- [ ] **PREP-1: Alle E2E-Tests in `plugin.test.ts` skippen**
  - Datei: `packages/opencode-plugin/test/e2e/plugin.test.ts`
  - Aktion: Den äußersten `describe`-Block (Z. 166: `describe('OpenCode Workflows Plugin E2E', ...)`) und den zweiten Top-Level-Block (Z. 784: `describe('File Pattern Restrictions', ...)`) auf `describe.skip(...)` umstellen.
  - Ziel: Tests kompilieren weiterhin (keine Löschung), sind aber deaktiviert bis zur Re-Aktivierung am Ende.
  - Validierung: `npm test` im Paket `opencode-plugin` läuft durch ohne Failures (0 tests executed, 0 failed).

#### PHASE 1 — SRP: Concerns extrahieren (nur verschieben, keine Logikänderungen)

Die folgenden Tasks splitten `plugin.ts` (1593 Zeilen) in eigenständige Dateien auf.
**Regel:** Keine inhaltlichen Änderungen — nur Cut & Paste + Import-Anpassungen.
Jeder Task kann unabhängig von den anderen durchgeführt werden, solange PREP-1 abgeschlossen ist.

- [ ] **SRP-1: Utility-Funktionen in `utils.ts` extrahieren**
  - Neue Datei: `packages/opencode-plugin/src/utils.ts`
  - Zu verschieben aus `plugin.ts`:
    - `formatDate()` (Z. 36–38)
    - `extractKeyDecisions()` (Z. 44–75)
    - `extractActiveTasks()` (Z. 81–98)
    - `formatFileRestrictions()` (Z. 103–114)
    - `getBlockedPatternsDescription()` (Z. 119–143)
    - `formatTransitions()` (Z. 148–154)
    - `getCurrentGitBranch()` (Z. 223–243) — **ACHTUNG:** benutzt `require('node:child_process')`, das als ESM-Import umschreiben: `import { execSync } from 'node:child_process'`
  - `plugin.ts`: Importiert alle Funktionen aus `./utils.js`; eigene Deklarationen entfernen.
  - Validierung: `npm run build` in `opencode-plugin` ohne TypeScript-Fehler.

- [ ] **SRP-2: Compaction-Logik in `compaction-context.ts` extrahieren**
  - Neue Datei: `packages/opencode-plugin/src/compaction-context.ts`
  - Zu verschieben aus `plugin.ts`:
    - `buildCompactionContext()` (Z. 159–208) — inkl. Abhängigkeiten auf `formatFileRestrictions`, `formatTransitions`, `extractKeyDecisions`, `extractActiveTasks` (alle werden dann aus `./utils.js` importiert)
  - `plugin.ts`: `buildCompactionContext` aus `./compaction-context.js` importieren; eigene Deklaration entfernen.
  - `WorkflowState`-Typ wird aus `./state.js` importiert (bereits der Fall in `plugin.ts`).
  - Validierung: `npm run build` ohne Fehler.

- [ ] **SRP-3: `ProcessGuidanceEnricher` in `enrichers/process-guidance.ts` extrahieren**
  - Neue Datei: `packages/opencode-plugin/src/enrichers/process-guidance.ts`
  - Zu verschieben aus `plugin.ts`:
    - `ProcessGuidanceEnricher`-Klasse (Z. 249–266)
  - Imports in der neuen Datei: `InstructionEnricher`, `InstructionContext`, `GeneratedInstructions` aus `@codemcp/workflows-core`
  - `plugin.ts`: `ProcessGuidanceEnricher` aus `./enrichers/process-guidance.js` importieren; eigene Deklaration entfernen.
  - Validierung: `npm run build` ohne Fehler.

- [ ] **SRP-4: OpenCode-Logger in `opencode-logger.ts` extrahieren**
  - Neue Datei: `packages/opencode-plugin/src/opencode-logger.ts`
  - Zu verschieben aus `plugin.ts`:
    - Interface `Logger` (Z. 271–276)
    - Interface `OpenCodeClient` (Z. 281–292)
    - Funktion `createLogger(client)` (Z. 298–340) — **umbenennen** zu `createOpenCodeLogger` um Namenskonflikt mit `createLogger` aus `@codemcp/workflows-core` zu vermeiden
  - `plugin.ts`: `createOpenCodeLogger` aus `./opencode-logger.js` importieren; lokale Deklarationen entfernen.
  - Validierung: `npm run build` ohne Fehler.

- [ ] **SRP-5: Tool-Handler `workflow_status` in `tool-handlers/workflow-status.ts` extrahieren**
  - Neue Datei: `packages/opencode-plugin/src/tool-handlers/workflow-status.ts`
  - Exportiert eine Factory-Funktion `createWorkflowStatusTool(stateManager: WorkflowStateManager): ToolDefinition`
  - Zu verschieben: Gesamte `workflow_status`-Logik (Z. 712–797 in `plugin.ts`)
  - Benötigte Imports: `WorkflowStateManager` aus `../state.js`, `ToolDefinition` aus `../types.js`, lokale `tool()`-Hilfsfunktion
  - **HINWEIS zur `tool()`-Hilfsfunktion (Z. 345–351):** Diese ebenfalls in die neue Datei mitnehmen ODER in eine gemeinsame Datei `tool-helper.ts` extrahieren (als Vorarbeit für die anderen Tool-Handler-Tasks).
  - `plugin.ts`: `createWorkflowStatusTool` importieren und aufrufen statt Inline-Definition.
  - Validierung: `npm run build` ohne Fehler.

- [ ] **SRP-6: Tool-Handler `transition_phase` in `tool-handlers/transition-phase.ts` extrahieren**
  - Neue Datei: `packages/opencode-plugin/src/tool-handlers/transition-phase.ts`
  - Exportiert: `createTransitionPhaseTool(stateManager: WorkflowStateManager, logger: Logger): ToolDefinition`
  - Zu verschieben: Gesamte `transition_phase`-Logik (Z. 804–1038)
  - Benötigte Imports: `z` aus `zod`, `WorkflowStateManager` aus `../state.js`, `Logger`-Interface aus `../opencode-logger.js`, `TransitionResult` aus `@codemcp/workflows-core`
  - `plugin.ts`: `createTransitionPhaseTool` importieren.
  - Validierung: `npm run build` ohne Fehler.

- [ ] **SRP-7: Tool-Handler `record_decision` in `tool-handlers/record-decision.ts` extrahieren**
  - Neue Datei: `packages/opencode-plugin/src/tool-handlers/record-decision.ts`
  - Exportiert: `createRecordDecisionTool(stateManager: WorkflowStateManager, planManager: PlanManager, logger: Logger): ToolDefinition`
  - Zu verschieben: Gesamte `record_decision`-Logik (Z. 1044–1139)
  - Benötigte Imports: `z` aus `zod`, `PlanManager` aus `@codemcp/workflows-core`, `WorkflowStateManager` aus `../state.js`, `Logger` aus `../opencode-logger.js`, `formatDate` aus `../utils.js`
  - `plugin.ts`: `createRecordDecisionTool` importieren.
  - Validierung: `npm run build` ohne Fehler.

- [ ] **SRP-8: Tool-Handler `record_note` in `tool-handlers/record-note.ts` extrahieren**
  - Neue Datei: `packages/opencode-plugin/src/tool-handlers/record-note.ts`
  - Exportiert: `createRecordNoteTool(stateManager: WorkflowStateManager, planManager: PlanManager, logger: Logger): ToolDefinition`
  - Zu verschieben: Gesamte `record_note`-Logik (Z. 1145–1260)
  - Benötigte Imports: analog zu SRP-7
  - `plugin.ts`: `createRecordNoteTool` importieren.
  - Validierung: `npm run build` ohne Fehler.

- [ ] **SRP-9: Tool-Handler `reset_development` in `tool-handlers/reset-development.ts` extrahieren**
  - Neue Datei: `packages/opencode-plugin/src/tool-handlers/reset-development.ts`
  - Exportiert: `createResetDevelopmentTool(stateManager: WorkflowStateManager, projectDir: string, logger: Logger): ToolDefinition`
  - Zu verschieben: Gesamte `reset_development`-Logik (Z. 1266–1421)
  - Benötigte Imports: `z` aus `zod`, `FileStorage` aus `@codemcp/workflows-core`, `WorkflowStateManager` aus `../state.js`, `Logger` aus `../opencode-logger.js`, `fs`, `path`
  - `plugin.ts`: `createResetDevelopmentTool` importieren.
  - Validierung: `npm run build` ohne Fehler.

- [ ] **SRP-10: Tool-Handler `start_workflow` in `tool-handlers/start-workflow.ts` extrahieren**
  - Neue Datei: `packages/opencode-plugin/src/tool-handlers/start-workflow.ts`
  - Exportiert: `createStartWorkflowTool(stateManager: WorkflowStateManager, projectDir: string, instructionGenerator: InstructionGenerator, enrichers: InstructionEnricher[], logger: Logger): ToolDefinition`
  - Zu verschieben: Gesamte `start_workflow`-Logik (Z. 1427–1584) inkl. `SUPPORTED_WORKFLOWS`-Konstante (Z. 211–218)
  - Benötigte Imports: `z`, `WorkflowManager`, `FileStorage`, `ConversationManager`, `PlanManager`, `InstructionGenerator`, `InstructionEnricher`, `InstructionContext` aus `@codemcp/workflows-core`, `WorkflowStateManager` aus `../state.js`, `Logger` aus `../opencode-logger.js`, `getCurrentGitBranch` aus `../utils.js`
  - `plugin.ts`: `createStartWorkflowTool` importieren; `SUPPORTED_WORKFLOWS` entfernen.
  - Validierung: `npm run build` ohne Fehler.

#### PHASE 2 — Core-Reuse: Schlechte Implementierungen ersetzen

Diese Tasks setzen PHASE 1 voraus (die Dateien existieren nun einzeln).
Jeder Task ist unabhängig durchführbar.

- [ ] **REUSE-1: `getCurrentGitBranch` durch `GitManager` aus Core ersetzen**
  - Datei: `packages/opencode-plugin/src/utils.ts` (nach SRP-1 dort)
  - `GitManager` ist in `@codemcp/workflows-core` exportiert (siehe `packages/core/src/git-manager.ts`)
  - Ersetze die manuelle `execSync`-Implementierung durch: `new GitManager().getCurrentBranch(projectPath)` o.ä.
  - Prüfe zuerst die `GitManager`-API in `packages/core/src/git-manager.ts`
  - Falls `GitManager` keinen sync-Zugriff bietet: Methode in `utils.ts` async machen und alle Aufrufer anpassen (betrifft `chat.message`-Hook und `start-workflow.ts`)
  - Validierung: `npm run build` ohne Fehler; `npm test` in `opencode-plugin` (Tests sind noch geskippt, Build muss sauber sein).

- [ ] **REUSE-2: `createOpenCodeLogger` durch `createLogger` aus Core ersetzen (wo möglich)**
  - Hintergrund: `createLogger` aus `@codemcp/workflows-core` schreibt in die Core-Log-Pipeline. Das OpenCode-SDK hat aber eine eigene `client.app.log()`-API.
  - Analyse: Prüfe ob `createLogger` aus Core einen externen `LogSink` unterstützt (`packages/core/src/logger.ts`, `registerLogSink()`). Falls ja: Registriere einen `LogSink`, der auf `client.app.log()` delegiert, statt den gesamten Logger selbst zu bauen.
  - Wenn `registerLogSink` verfügbar: Registriere in `WorkflowsPlugin()` einen Sink für `client.app.log()`; ersetze `createOpenCodeLogger` durch den Core-Logger in allen Tool-Handlern.
  - `opencode-logger.ts` bleibt als dünner Adapter zum Registrieren des Sinks.
  - Validierung: `npm run build`; Log-Ausgaben erscheinen weiterhin in OpenCode.

- [ ] **REUSE-3: `SUPPORTED_WORKFLOWS`-Konstante durch dynamische `WorkflowManager`-Abfrage ersetzen**
  - Datei: `packages/opencode-plugin/src/tool-handlers/start-workflow.ts` (nach SRP-10 dort)
  - Problem: Hardcodierte Liste `['epcc', 'waterfall', 'bugfix', 'tdd', 'minor', 'greenfield']` muss bei neuen Workflows manuell gepflegt werden.
  - Lösung: `WorkflowManager` hat `getWorkflowNames(): string[]` — verwende diese Liste für die Zod-Enum-Validierung.
  - **ACHTUNG:** Zod `z.enum()` braucht ein statisches Tupel zur Compile-Zeit. Workaround: `z.string()` mit runtime-Validierung über `workflowManager.validateWorkflowName()` (wird im Tool ohnehin schon aufgerufen, Z. 1469–1475).
  - Ersetze `z.enum(SUPPORTED_WORKFLOWS)` durch `z.string()` + runtime-Validierung; `SUPPORTED_WORKFLOWS` entfernen.
  - Validierung: `npm run build` ohne Fehler.

- [ ] **REUSE-4: `reset_development` auf `ConversationManager.resetConversation()` umstellen**
  - Datei: `packages/opencode-plugin/src/tool-handlers/reset-development.ts` (nach SRP-9 dort)
  - Problem: Manuelle `FileStorage`-Manipulation (Z. 1330–1354 in `plugin.ts`) dupliziert Logik aus `reset-development.ts` im MCP-Server.
  - Prüfe zuerst: Hat `ConversationManager` eine `resetConversation(confirm, reason)`-Methode? (Siehe `packages/core/src/conversation-manager.ts`)
  - Falls ja: Ersetze die manuelle FileStorage-Schleife durch den Aufruf dieser Methode via dem `stateManager`-internen `conversationManager` (der ist `private` — entweder Methode in `WorkflowStateManager` hinzufügen oder `ConversationManager` direkt instanziieren).
  - Das `delete_plan`-Feature (Z. 1357–1372) ist Plugin-spezifisch und bleibt erhalten.
  - Validierung: `npm run build`; manueller Test: Reset löscht tatsächlich den Conversation-State.

- [ ] **REUSE-5: Inline Review-Validierung in `transition_phase` durch YAML-basierte Logik ersetzen**
  - Datei: `packages/opencode-plugin/src/tool-handlers/transition-phase.ts` (nach SRP-6 dort)
  - Problem: Z. 846–871 in `plugin.ts` prüft nur `stateBefore.requireReviews` (ein globales Flag). Die MCP-Implementierung in `proceed-to-phase.ts` prüft zusätzlich `review_perspectives` im YAML — d.h. Reviews können pro Transition konfiguriert sein.
  - Lösung: Prüfe ob `TransitionEngine` oder `ConversationManager` eine `validateReviewState()`-Methode hat. Falls ja: Delegiere dorthin.
  - Falls nicht in Core: Logik aus `proceed-to-phase.ts` (Z. 61–100) in `WorkflowStateManager.transitionTo()` integrieren, sodass die Review-Validierung dort zentralisiert ist und das Plugin es nur noch aufruft.
  - Validierung: `npm run build`; Reviews werden korrekt erzwungen wenn YAML `review_perspectives` hat.

#### PHASE 3 — Tests reaktivieren und neu schreiben

- [ ] **TEST-1: `describe.skip` rückgängig machen und Tests an neue Struktur anpassen**
  - Datei: `packages/opencode-plugin/test/e2e/plugin.test.ts`
  - Entferne `.skip` von beiden `describe`-Blöcken.
  - Passe Imports und Mock-Setup an die neue Dateistruktur an (Tool-Handler kommen jetzt aus separaten Dateien, aber `WorkflowsPlugin` als Einstiegspunkt bleibt identisch).
  - Neue Test-Assertions für `start_workflow` sollen `entrance criteria` prüfen (nicht mehr `Workflow Started`).
  - Validierung: `npm test` in `opencode-plugin` — alle Tests grün.

- [ ] **TEST-2: Unit-Tests für neue Tool-Handler-Dateien**
  - Neue Dateien unter `packages/opencode-plugin/test/unit/`
  - Mindestens Tests für:
    - `transition-phase.ts`: Review-Validierung (requireReviews + YAML-Perspectives)
    - `reset-development.ts`: Korrekte Delegation an ConversationManager
    - `start-workflow.ts`: Dynamische Workflow-Validierung statt Hardcoded-Enum
  - Validierung: `npm test` — alle Tests grün.

## Commit
<!-- beads-phase-id: TBD -->
### Tasks

*Tasks managed via `bd` CLI*

## Key Decisions

### Decision: Move from MCP server to opencode plugin as primary integration
- The MCP server approach has fundamental limitations: it can't intercept tool calls, can't trigger compaction, can't restrict file edits, can't control the conversation flow
- OpenCode plugin model gives native access to: `tool.execute.before` (hard enforcement), `experimental.session.compacting` (compaction control), custom tools (native tool registration), `chat.message` hook
- `workflows-core` package remains the engine; the plugin wraps it
- MCP server continues to exist for non-opencode hosts (Claude Code, Cline, etc.)
- New package: `packages/opencode-plugin/` published as `opencode-workflows` on npm

### Decision: Hook strategy for context injection
- **`chat.message`** — primary injection point. Fires once per user message, before save, before LLM. Adds synthetic parts with full phase instructions, plan context, open tasks. Persisted, summarized on compaction.
- **`experimental.chat.system.transform`** — lightweight guardrail. Fires every LLM turn (including tool-call loops). Ephemeral. Just a short phase reminder ("You are in explore. Do not edit source files.")
- **`tool.execute.before`** — hard enforcement. Blocks file edits that violate phase restrictions. Throws with clear explanation.
- **`experimental.session.compacting`** — compaction survival. Injects current phase, plan content, open tasks into compaction prompt so state survives.
- This replaces the `whats_next()` call entirely — the agent never needs to call a tool to get phase instructions.

### Decision: File restrictions — hard block, not "ask"
- `tool.execute.before` throws to block disallowed edits with a clear error message
- No "ask" mode — small models need a hard stop, not a prompt they might auto-approve

### Decision: Beads — defer, plan-file-first
- Start with plan-file based task management via custom tools (create_task, close_task)
- Optionally detect `bd` CLI and delegate. Build lightweight JS task backend later if needed.

### Decision: State persistence via .vibe/
- Plugin loads workflow state from `.vibe/` directory on session start
- Plan file + beads state files provide full continuity across sessions
- Already solved by existing infrastructure

### Decision: Core package decoupled from MCP (implemented)
- Removed `@modelcontextprotocol/sdk` import from `workflows-core/logger.ts`
- Created `LogSink` interface in core — generic sink for log notifications
- `registerLogSink()` / `clearLogSink()` functions to register external sinks
- Created `mcp-log-sink.ts` in mcp-server that implements `LogSink` for MCP notifications
- Core now has zero MCP dependencies — can be used standalone in opencode plugin

### Decision: OpenCode plugin scaffold + PoC created (implemented & verified)
- New package: `packages/opencode-plugin/` with package.json, tsconfig, types
- PoC plugin (`plugin.ts`) exercises all 4 critical hooks with hardcoded state:
  - `chat.message` → injects phase instructions as synthetic part
  - `experimental.chat.system.transform` → injects lightweight guardrail
  - `tool.execute.before` → blocks disallowed file edits (throws error)
  - `experimental.session.compacting` → injects workflow state into compaction
- Includes dummy `workflow_poc_status` tool to validate tool registration
- **All 4 hooks verified working in OpenCode (2026-03-28)**

### Discovery: OpenCode plugin implementation details (from PoC)
- **Part structure for `chat.message`**: Synthetic parts MUST include:
  - `id`: string starting with `prt_` (e.g., `prt_workflows_${Date.now()}`)
  - `sessionID`: from `hookInput.sessionID`
  - `messageID`: from `hookInput.messageID || output.message.id`
  - Without these, OpenCode's Zod validation rejects the part
- **Logging strategy**: Plugin logs to `.vibe/workflows-plugin.log`, NOT stderr — stderr output breaks the TUI
- **Edit tools to intercept**: `edit`, `write`, `patch`, `multiedit`
- **File path argument names**: Args may be named `filePath` OR `path` depending on the tool — must check both
- **Tool registration**: Export as `{ server: PluginFunction }` with tools in the `tool` property of returned hooks

### Decision: Prior art - micode plugin
- micode (295 stars) follows a very similar Brainstorm→Plan→Implement pattern
- Key differences from our approach: micode has no YAML-configurable workflows, no beads integration, no formal state machine, no review gates
- Their compaction hook + auto-compaction at threshold proves the approach works
- Their `tool.execute.before` for file ops tracking proves interception works

## Notes

### OpenCode Extension Points (Research 2026-03-28)

OpenCode provides a rich plugin/extension ecosystem that maps directly to our three improvement areas:

#### 1. Compaction - `experimental.session.compacting` hook
- OpenCode plugins can hook into `experimental.session.compacting` to inject/replace the compaction prompt
- `output.context.push(...)` adds additional context to the compaction summary
- `output.prompt = ...` replaces the entire compaction prompt
- Compaction config: `compaction.auto: true`, `compaction.prune: true`, `compaction.reserved: 10000`
- **Session events**: `session.compacted`, `session.idle`, `session.status`
- **Key insight**: We could write an opencode plugin that hooks into compaction and injects workflow state (current phase, plan file content, open tasks) so it survives compaction

#### 2. File Restrictions - Agents + Permissions system
- **Agents** can have per-agent `permissions` that control tool access:
  - `edit`: `"allow"` | `"ask"` | `"deny"` (covers edit, write, patch, multiedit)
  - `bash`: granular per-command patterns (`"git *": "allow"`, `"rm *": "deny"`)
  - Pattern-based: `edit: { "*.md": "allow", "*": "deny" }`
- **Custom tools** can override built-in tools (e.g. a custom `bash` that blocks certain commands)
- `tool.execute.before` plugin event can intercept and block tool calls based on file patterns
- **Key insight**: An opencode plugin using `tool.execute.before` could check current workflow phase and deny file edits that don't match allowed patterns. This gives HARD enforcement.

#### 3. Sub-agent delegation via Beads
- **Subagents** (mode: `subagent`) are specialized agents invoked by primary agents via the Task tool
- Built-in: `general` (full tools, parallel work), `explore` (read-only, fast)
- Custom subagents can have restricted permissions, specific models, custom prompts
- **Task permissions**: `permission.task` controls which subagents an agent can invoke (glob patterns)
- **Agent `steps`** option limits max agentic iterations (cost control)
- **Key insight**: We could define workflow-phase-specific subagents (e.g. "explore-agent" with read-only, "code-agent" with full edit) and instruct the primary agent to delegate via Task tool

#### OpenCode Plugin System Summary
- **Location**: `.opencode/plugins/` (project) or `~/.config/opencode/plugins/` (global)
- **Language**: TypeScript/JavaScript
- **Context**: `{ project, client, $, directory, worktree }`
- **Key events**: `tool.execute.before`, `tool.execute.after`, `file.edited`, `session.compacted`, `session.idle`, `experimental.session.compacting`
- **Custom tools**: `.opencode/tools/` - can override built-in tools
- **Skills**: `.opencode/skills/<name>/SKILL.md` - on-demand instruction loading
- **Rules**: `AGENTS.md` / `opencode.json.instructions[]` - system prompt injection

### OpenCode Message Pipeline Hooks (Source Code Research 2026-03-28)

Complete message processing pipeline with ALL plugin hooks:

```
User message submitted
  → createUserMessage()
    → *** "chat.message" hook *** → can MUTATE message parts before save
    → message saved to DB → fires "message.updated" (notification only)
  → if noReply: return
  → loop():
    → read all messages from DB
    → insertReminders()
    → *** "experimental.chat.messages.transform" *** → can MUTATE all messages (ephemeral)
    → build system prompt (AGENTS.md, env, skills)
    → LLM.stream():
      → *** "experimental.chat.system.transform" *** → can MUTATE system prompt
      → *** "chat.params" *** → can mutate temperature, topP, etc.
      → actual LLM call
    → tool calls:
      → *** "tool.execute.before" *** → can block/mutate
      → execute
      → *** "tool.execute.after" ***
    → *** "experimental.text.complete" *** → can rewrite assistant text
```

**Critical hooks for workflows plugin:**

| Hook | When | Persisted? | Best for |
|------|------|-----------|----------|
| `chat.message` | Before save, before LLM | Yes (in DB) | Adding synthetic parts to user messages |
| `experimental.chat.system.transform` | Every LLM turn | No (ephemeral) | **Phase instructions injection** — replaces `whats_next()` |
| `experimental.chat.messages.transform` | Every LLM turn | No (ephemeral) | Rewriting conversation history |
| `tool.execute.before` | Before each tool | N/A | **Phase enforcement** — blocking disallowed edits |
| `experimental.session.compacting` | On compaction | N/A | **State survival** — injecting plan/tasks |

**Key insight**: `experimental.chat.system.transform` fires on EVERY LLM turn, is ephemeral (no token accumulation), and directly replaces the need for `whats_next()`. The plugin reads current phase from state and injects fresh instructions each turn.

---
*This plan is maintained by the LLM and uses beads CLI for task management. Tool responses provide guidance on which bd commands to use for task management.*

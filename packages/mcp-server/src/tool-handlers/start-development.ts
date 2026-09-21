/**
 * StartDevelopment Tool Handler
 *
 * Handles initialization of development workflow and transition to the initial
 * development phase. Allows users to choose from predefined workflows or use a custom workflow.
 */

import { BaseToolHandler } from './base-tool-handler.js';
import {
  validateRequiredArgs,
  stripVibePathSuffix,
} from '../server-helpers.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import {
  ProjectDocsManager,
  type ProjectDocsInfo,
  type YamlStateMachine,
} from '@codemcp/workflows-core';
import { ServerContext } from '../types.js';

/**
 * Arguments for the start_development tool
 */
export interface StartDevelopmentArgs {
  workflow: string;
  project_path?: string;
}

/**
 * Response from the start_development tool
 */
export interface StartDevelopmentResult {
  phase: string;
  instructions: string;
  plan_file_path: string;
  workflowDocumentationUrl?: string;
  /**
   * Glob patterns for files allowed to be edited in this phase.
   * Defaults to ['**\/*'] (all files) if not restricted.
   */
  allowed_file_patterns: string[];
}

/**
 * StartDevelopment tool handler implementation
 */
export class StartDevelopmentHandler extends BaseToolHandler<
  StartDevelopmentArgs,
  StartDevelopmentResult
> {
  private projectDocsManager: ProjectDocsManager | null = null;

  private getProjectDocsManager(): ProjectDocsManager {
    if (!this.projectDocsManager) {
      this.projectDocsManager = new ProjectDocsManager(this.logger);
    }
    return this.projectDocsManager;
  }

  protected async executeHandler(
    args: StartDevelopmentArgs,
    context: ServerContext
  ): Promise<StartDevelopmentResult> {
    // Validate required arguments
    validateRequiredArgs(args, ['workflow']);

    const selectedWorkflow = args.workflow;

    // Normalize project path - strip /.vibe suffix if present
    const projectPath = stripVibePathSuffix(
      args.project_path,
      context.projectPath
    );

    this.logger.debug('Processing start_development request', {
      selectedWorkflow,
      projectPath: projectPath,
    });

    // Validate workflow selection (ensure project workflows are loaded first)
    context.workflowManager.loadProjectWorkflows(projectPath);
    if (
      !context.workflowManager.validateWorkflowName(
        selectedWorkflow,
        projectPath
      )
    ) {
      const availableWorkflows = context.workflowManager.getWorkflowNames();
      throw new Error(
        `Invalid workflow: ${selectedWorkflow}. Available workflows: ${availableWorkflows.join(', ')}`
      );
    }

    // Check for project documentation artifacts and guide setup if needed
    const artifactGuidance = await this.checkProjectArtifacts(
      projectPath,
      selectedWorkflow,
      context
    );
    if (artifactGuidance) {
      return artifactGuidance;
    }

    // Create or get conversation context with the selected workflow
    const conversationContext =
      await context.conversationManager.createConversationContext(
        selectedWorkflow,
        args.project_path ? projectPath : undefined
      );
    const currentPhase = conversationContext.currentPhase;

    // Load the selected workflow
    const stateMachine = context.workflowManager.loadWorkflowForProject(
      conversationContext.projectPath,
      selectedWorkflow
    );
    const initialState = stateMachine.initial_state;

    // Check if development is already started
    if (currentPhase !== initialState) {
      throw new Error(
        `Development already started. Current phase is '${currentPhase}', not initial state '${initialState}'. Use whats_next() to continue development.`
      );
    }

    // The initial state IS the first development phase - it's explicitly modeled
    const targetPhase = initialState;

    // Transition to the initial development phase
    const transitionResult =
      await context.transitionEngine.handleExplicitTransition(
        currentPhase,
        targetPhase,
        projectPath,
        'Development initialization',
        selectedWorkflow
      );

    // Update conversation state with workflow and phase
    await context.conversationManager.updateConversationState(
      conversationContext.conversationId,
      {
        currentPhase: transitionResult.newPhase,
        workflowName: selectedWorkflow,
      }
    );

    // Set state machine on plan manager before creating plan file
    context.planManager.setStateMachine(stateMachine);

    // Ensure plan file exists
    await context.planManager.ensurePlanFile(
      conversationContext.planFilePath,
      projectPath,
      conversationContext.gitBranch
    );

    // Ensure .vibe/.gitignore exists to exclude SQLite files for git repositories
    this.ensureGitignoreEntry(projectPath);

    // Generate workflow documentation URL via PlanManager (single source of truth)
    const workflowDocumentationUrl =
      context.planManager.generateWorkflowDocumentationUrl(selectedWorkflow);

    // Generate instructions via PlanManager — single source of truth for initial plan guidance
    const finalInstructions = context.planManager.getInitialPlanGuidance(
      conversationContext.planFilePath,
      workflowDocumentationUrl
    );

    // Get allowed file patterns for the initial phase
    const phaseState = stateMachine.states[transitionResult.newPhase];
    const allowedFilePatterns = phaseState?.allowed_file_patterns ?? ['**/*'];

    const response: StartDevelopmentResult = {
      phase: transitionResult.newPhase,
      instructions: finalInstructions,
      plan_file_path: conversationContext.planFilePath,
      workflowDocumentationUrl,
      allowed_file_patterns: allowedFilePatterns,
    };

    // Log interaction
    await this.logInteraction(
      context,
      conversationContext.conversationId,
      'start_development',
      args,
      response,
      transitionResult.newPhase
    );

    return response;
  }

  /**
   * Check if project documentation artifacts exist and provide setup guidance if needed.
   * Dynamically analyzes the selected workflow to determine which documents are referenced.
   * Blocks workflow start if the workflow requires documentation.
   */
  private async checkProjectArtifacts(
    projectPath: string,
    workflowName: string,
    context: ServerContext
  ): Promise<StartDevelopmentResult | null> {
    try {
      const stateMachine = context.workflowManager.loadWorkflowForProject(
        projectPath,
        workflowName
      );

      const requiresDocumentation =
        stateMachine.metadata?.requiresDocumentation ?? false;

      if (!requiresDocumentation) {
        this.logger.debug(
          'Workflow does not require documentation, skipping artifact check',
          { workflowName, requiresDocumentation }
        );
        return null;
      }

      const referencedVariables = this.analyzeWorkflowDocumentReferences(
        stateMachine,
        projectPath
      );

      if (referencedVariables.length === 0) {
        this.logger.debug(
          'No document variables found in workflow, skipping artifact check',
          { workflowName }
        );
        return null;
      }

      const docsInfo =
        await this.getProjectDocsManager().getProjectDocsInfo(projectPath);
      const missingDocs = this.getMissingReferencedDocuments(
        referencedVariables,
        docsInfo,
        projectPath
      );

      if (missingDocs.length === 0) {
        this.logger.debug(
          'All referenced project artifacts exist, continuing with development',
          { workflowName, referencedVariables }
        );
        return null;
      }

      const setupGuidance = await this.generateArtifactSetupGuidance(
        missingDocs,
        workflowName
      );

      this.logger.info(
        'Missing required project artifacts detected for workflow that requires documentation',
        { workflowName, referencedVariables, missingDocs, projectPath }
      );

      const initialPhase = stateMachine.initial_state;
      const initialPhaseState = stateMachine.states[initialPhase];
      const allowedFilePatterns = initialPhaseState?.allowed_file_patterns ?? [
        '**/*',
      ];

      return {
        phase: 'artifact-setup',
        instructions: setupGuidance,
        plan_file_path: '',
        allowed_file_patterns: allowedFilePatterns,
      };
    } catch (error) {
      this.logger.warn(
        'Failed to analyze workflow for document references, proceeding without artifact check',
        {
          workflowName,
          error: error instanceof Error ? error.message : String(error),
        }
      );
      return null;
    }
  }

  /**
   * Analyze workflow YAML content to find which $DOC variables are referenced.
   */
  private analyzeWorkflowDocumentReferences(
    stateMachine: YamlStateMachine,
    projectPath: string
  ): string[] {
    const variableSubstitutions =
      this.getProjectDocsManager().getVariableSubstitutions(projectPath);
    const documentVariables = Object.keys(variableSubstitutions);
    const referencedVariables: Set<string> = new Set();

    const workflowContent = JSON.stringify(stateMachine);
    for (const variable of documentVariables) {
      if (workflowContent.includes(variable)) {
        referencedVariables.add(variable);
      }
    }

    return Array.from(referencedVariables);
  }

  /**
   * Return the subset of referencedVariables whose backing files are missing.
   */
  private getMissingReferencedDocuments(
    referencedVariables: string[],
    docsInfo: ProjectDocsInfo,
    projectPath: string
  ): string[] {
    const variableSubstitutions =
      this.getProjectDocsManager().getVariableSubstitutions(projectPath);

    const variableToDocMap: Record<string, string> = {};
    for (const [variable, path] of Object.entries(variableSubstitutions)) {
      const filename = basename(path);
      variableToDocMap[variable] = filename.replace('.md', '');
    }

    const missingDocs: string[] = [];
    for (const variable of referencedVariables) {
      const docType = variableToDocMap[variable];
      if (docType && docType in docsInfo) {
        const docInfo = docsInfo[docType as keyof ProjectDocsInfo];
        if (docInfo && !docInfo.exists) {
          missingDocs.push(`${docType}.md`);
        }
      }
    }
    return missingDocs;
  }

  /**
   * Generate human-readable guidance for the missing docs.
   */
  private async generateArtifactSetupGuidance(
    missingDocs: string[],
    workflowName: string
  ): Promise<string> {
    const availableTemplates =
      await this.getProjectDocsManager().templateManager.getAvailableTemplates();

    return `Missing docs for **${workflowName}**: ${missingDocs.join(', ')}

Run \`setup_project_docs()\` with templates: ${Object.entries(
      availableTemplates
    )
      .map(([type, templates]) => `${type}: ${templates.join('/')}`)
      .join('; ')}

Then retry \`start_development\`.`;
  }

  /**
   * Ensure .gitignore exists in .vibe folder to exclude SQLite files
   * This function is idempotent and self-contained within the .vibe directory
   */
  private ensureGitignoreEntry(projectPath: string): void {
    try {
      // Check if this is a git repository
      if (!existsSync(`${projectPath}/.git`)) {
        this.logger.debug(
          'Not a git repository, skipping .gitignore management',
          { projectPath }
        );
        return;
      }

      const vibeDir = resolve(projectPath, '.vibe');
      const gitignorePath = resolve(vibeDir, '.gitignore');

      // Ensure .vibe directory exists
      if (!existsSync(vibeDir)) {
        mkdirSync(vibeDir, { recursive: true });
      }

      // Content for .vibe/.gitignore
      const gitignoreContent = `# Exclude conversation state files
conversations/
# Legacy SQLite files (for migration compatibility)
*.sqlite
*.sqlite-*
`;

      // Check if .gitignore already exists and has the right content
      if (existsSync(gitignorePath)) {
        try {
          const existingContent = readFileSync(gitignorePath, 'utf-8');
          if (existingContent.includes('conversations/')) {
            this.logger.debug(
              '.vibe/.gitignore already exists with conversation exclusions',
              { gitignorePath }
            );
            return;
          }
        } catch (error) {
          this.logger.warn(
            'Failed to read existing .vibe/.gitignore, will recreate',
            {
              gitignorePath,
              error: error instanceof Error ? error.message : String(error),
            }
          );
        }
      }

      // Write the .gitignore file
      writeFileSync(gitignorePath, gitignoreContent, 'utf-8');

      this.logger.info(
        'Created .vibe/.gitignore to exclude conversation files',
        {
          projectPath,
          gitignorePath,
        }
      );
    } catch (error) {
      // Log warning but don't fail development start
      this.logger.warn(
        'Failed to create .vibe/.gitignore, continuing with development start',
        {
          projectPath,
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }
}

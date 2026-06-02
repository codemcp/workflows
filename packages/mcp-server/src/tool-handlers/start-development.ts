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
import { basename } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { YamlStateMachine } from '@codemcp/workflows-core';
import { ProjectDocsManager, ProjectDocsInfo } from '@codemcp/workflows-core';
import { TaskBackendManager } from '@codemcp/workflows-core';
import { ServerContext } from '../types.js';
import type { PluginHookContext } from '../plugin-system/plugin-interfaces.js';

/**
 * Arguments for the start_development tool
 */
export interface StartDevelopmentArgs {
  workflow: string;
  require_reviews?: boolean;
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

    // Validate task backend configuration (pass logger to avoid stderr output)
    const taskBackendConfig = TaskBackendManager.validateTaskBackend(
      this.logger
    );

    const selectedWorkflow = args.workflow;
    const requireReviews = args.require_reviews ?? false;

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

    // Check if user is on main/master branch and prompt for branch creation
    const currentBranch = this.getCurrentGitBranch(projectPath);
    if (currentBranch === 'main' || currentBranch === 'master') {
      const suggestedBranchName = this.generateBranchSuggestion();
      const branchPromptResponse: StartDevelopmentResult = {
        phase: 'branch-prompt',
        instructions: `On ${currentBranch}. Create feature branch: \`git checkout -b ${suggestedBranchName}\`, then retry \`start_development\`.`,
        plan_file_path: '',
        allowed_file_patterns: ['**/*'], // Allow all files during branch prompt
      };

      this.logger.debug(
        'User on main/master branch, prompting for branch creation',
        {
          currentBranch,
          suggestedBranchName,
        }
      );

      return branchPromptResponse;
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
        requireReviewsBeforePhaseTransition: requireReviews,
      }
    );

    // Set state machine on plan manager before creating plan file
    context.planManager.setStateMachine(stateMachine);

    // Set task backend configuration if supported (for backwards compatibility)
    if (typeof context.planManager.setTaskBackend === 'function') {
      context.planManager.setTaskBackend(taskBackendConfig);
    }

    // Ensure plan file exists
    await context.planManager.ensurePlanFile(
      conversationContext.planFilePath,
      projectPath,
      conversationContext.gitBranch
    );

    // Prepare plugin context for hooks
    const pluginContext: PluginHookContext = {
      conversationId: conversationContext.conversationId,
      planFilePath: conversationContext.planFilePath,
      currentPhase: conversationContext.currentPhase,
      workflow: selectedWorkflow,
      projectPath,
      gitBranch: conversationContext.gitBranch,
      planFileExists: true, // we just created/ensured the plan file exists
      stateMachine: {
        name: stateMachine.name,
        description: stateMachine.description,
        initial_state: stateMachine.initial_state,
        states: stateMachine.states,
      },
    };

    // Execute afterPlanFileCreated hook to allow plugins to modify the plan file
    if (context.pluginRegistry) {
      try {
        const originalContent = await readFile(
          conversationContext.planFilePath,
          'utf-8'
        );
        const modifiedContent = await context.pluginRegistry.executeHook(
          'afterPlanFileCreated',
          pluginContext,
          conversationContext.planFilePath,
          originalContent
        );

        // Write the modified content back to the file if it changed
        if (modifiedContent && modifiedContent !== originalContent) {
          await writeFile(
            conversationContext.planFilePath,
            modifiedContent as string,
            'utf-8'
          );
        }
      } catch (error) {
        // Gracefully handle cases where plan file doesn't exist (e.g., in tests)
        // This is not a critical error - plugins can still function without modifying the plan file
        this.logger.debug('Could not execute afterPlanFileCreated hook', {
          error: error instanceof Error ? error.message : String(error),
          planFilePath: conversationContext.planFilePath,
        });
      }
    }

    // Execute afterStartDevelopment hook
    if (context.pluginRegistry) {
      await context.pluginRegistry.executeHook(
        'afterStartDevelopment',
        pluginContext,
        {
          workflow: selectedWorkflow,
          require_reviews: args.require_reviews,
          project_path: projectPath,
        },
        {
          conversationId: conversationContext.conversationId,
          planFilePath: conversationContext.planFilePath,
          phase: conversationContext.currentPhase,
          workflow: selectedWorkflow,
        }
      );
    }

    // Ensure .vibe/.gitignore exists to exclude SQLite files for git repositories
    this.ensureGitignoreEntry(projectPath);

    // Generate workflow documentation URL
    const workflowDocumentationUrl =
      this.generateWorkflowDocumentationUrl(selectedWorkflow);

    // Generate instructions via PlanManager — single source of truth for initial plan guidance
    let finalInstructions = context.planManager.getInitialPlanGuidance(
      conversationContext.planFilePath,
      workflowDocumentationUrl
    );

    // Get allowed file patterns for the initial phase (reuse already loaded stateMachine)
    const phaseState = stateMachine.states[transitionResult.newPhase];
    const allowedFilePatterns = phaseState?.allowed_file_patterns ?? ['**/*'];

    // Execute afterInstructionsGenerated hook for plugin enrichment (e.g., beads CLI guidance)
    if (context.pluginRegistry?.hasHook('afterInstructionsGenerated')) {
      const enriched = await context.pluginRegistry.executeHook(
        'afterInstructionsGenerated',
        pluginContext,
        {
          instructions: finalInstructions,
          planFilePath: conversationContext.planFilePath,
          phase: transitionResult.newPhase,
          instructionSource: 'start_development',
        }
      );
      if (
        enriched &&
        typeof enriched === 'object' &&
        'instructions' in enriched
      ) {
        finalInstructions = (enriched as { instructions: string }).instructions;
      }
    }

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
   * Check if project documentation artifacts exist and provide setup guidance if needed
   * Dynamically analyzes the selected workflow to determine which documents are referenced
   * Blocks workflow start if the workflow requires documentation
   */
  private async checkProjectArtifacts(
    projectPath: string,
    workflowName: string,
    context: ServerContext
  ): Promise<StartDevelopmentResult | null> {
    try {
      // Load the workflow to analyze its content
      const stateMachine = context.workflowManager.loadWorkflowForProject(
        projectPath,
        workflowName
      );

      // Check if this workflow requires documentation (defaults to false)
      const requiresDocumentation =
        stateMachine.metadata?.requiresDocumentation ?? false;

      // If workflow doesn't require documentation, skip artifact check entirely
      if (!requiresDocumentation) {
        this.logger.debug(
          'Workflow does not require documentation, skipping artifact check',
          { workflowName, requiresDocumentation }
        );
        return null;
      }

      // Analyze workflow content to detect referenced document variables
      const referencedVariables = this.analyzeWorkflowDocumentReferences(
        stateMachine,
        projectPath
      );

      // If no document variables are referenced, skip artifact check
      if (referencedVariables.length === 0) {
        this.logger.debug(
          'No document variables found in workflow, skipping artifact check',
          { workflowName }
        );
        return null;
      }

      // Check which referenced documents are missing
      const docsInfo =
        await this.getProjectDocsManager().getProjectDocsInfo(projectPath);
      const missingDocs = this.getMissingReferencedDocuments(
        referencedVariables,
        docsInfo,
        projectPath
      );

      // If all referenced documents exist, continue with normal flow
      if (missingDocs.length === 0) {
        this.logger.debug(
          'All referenced project artifacts exist, continuing with development',
          {
            workflowName,
            referencedVariables,
          }
        );
        return null;
      }

      // Generate guidance for setting up missing artifacts
      const setupGuidance = await this.generateArtifactSetupGuidance(
        missingDocs,
        workflowName
      );

      this.logger.info(
        'Missing required project artifacts detected for workflow that requires documentation',
        {
          workflowName,
          requiresDocumentation,
          referencedVariables,
          missingDocs,
          projectPath,
        }
      );

      // Get the initial phase's allowed file patterns from the workflow
      const initialPhase = stateMachine.initial_state;
      const initialPhaseState = stateMachine.states[initialPhase];
      const allowedFilePatterns = initialPhaseState?.allowed_file_patterns ?? [
        '**/*',
      ];

      return {
        phase: 'artifact-setup',
        instructions: setupGuidance,
        plan_file_path: '',
        // Use the initial phase's file restrictions during artifact setup
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
   * Analyze workflow content to detect document variable references
   */
  private analyzeWorkflowDocumentReferences(
    stateMachine: YamlStateMachine,
    projectPath: string
  ): string[] {
    // Get available document variables from ProjectDocsManager
    const variableSubstitutions =
      this.getProjectDocsManager().getVariableSubstitutions(projectPath);
    const documentVariables = Object.keys(variableSubstitutions);
    const referencedVariables: Set<string> = new Set();

    // Convert the entire state machine to a string for analysis
    const workflowContent = JSON.stringify(stateMachine);

    // Check for each document variable
    for (const variable of documentVariables) {
      if (workflowContent.includes(variable)) {
        referencedVariables.add(variable);
      }
    }

    this.logger.debug('Analyzed workflow for document references', {
      workflowContent: workflowContent.length + ' characters',
      availableVariables: documentVariables,
      referencedVariables: Array.from(referencedVariables),
    });

    return Array.from(referencedVariables);
  }

  /**
   * Determine which referenced documents are missing
   */
  private getMissingReferencedDocuments(
    referencedVariables: string[],
    docsInfo: ProjectDocsInfo,
    projectPath: string
  ): string[] {
    const missingDocs: string[] = [];

    // Get variable substitutions to derive the mapping
    const variableSubstitutions =
      this.getProjectDocsManager().getVariableSubstitutions(
        projectPath,
        undefined
      );

    // Create reverse mapping from variable to document type
    const variableToDocMap: { [key: string]: string } = {};
    for (const [variable, path] of Object.entries(variableSubstitutions)) {
      // Extract document type from path (e.g., 'architecture' from 'architecture.md')
      const filename = basename(path);
      const docType = filename.replace('.md', '');
      variableToDocMap[variable] = docType;
    }

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
   * Generate guidance for setting up missing project artifacts
   */
  private async generateArtifactSetupGuidance(
    missingDocs: string[],
    workflowName: string
  ): Promise<string> {
    // Get available templates dynamically
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
   * Generate workflow documentation URL for predefined workflows
   * Returns undefined for custom workflows
   */
  private generateWorkflowDocumentationUrl(
    workflowName: string
  ): string | undefined {
    // Don't generate URL for custom workflows
    if (workflowName === 'custom') {
      return undefined;
    }

    // Generate URL for predefined workflows
    return `https://codemcp.github.io/workflows/workflows/${workflowName}`;
  }

  /**
   * Get the current git branch for a project
   * Uses the same logic as ConversationManager but locally accessible
   */
  private getCurrentGitBranch(projectPath: string): string {
    try {
      const { execSync } = require('node:child_process');
      const { existsSync } = require('node:fs');

      // Check if this is a git repository
      if (!existsSync(`${projectPath}/.git`)) {
        this.logger.debug(
          'Not a git repository, using "default" as branch name',
          { projectPath }
        );
        return 'default';
      }

      // Get current branch name
      // Use symbolic-ref which works even without commits (unlike rev-parse --abbrev-ref HEAD)
      const branch = execSync('git symbolic-ref --short HEAD', {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'], // Suppress stderr
      }).trim();

      this.logger.debug('Detected git branch', { projectPath, branch });

      return branch;
    } catch (_error) {
      this.logger.debug(
        'Failed to get git branch, using "default" as branch name',
        { projectPath }
      );
      return 'default';
    }
  }

  /**
   * Generate a suggested branch name for feature development
   */
  private generateBranchSuggestion(): string {
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `feature/development-${timestamp}`;
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

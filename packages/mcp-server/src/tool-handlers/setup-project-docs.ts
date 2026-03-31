/**
 * Setup Project Docs Handler
 *
 * Creates project documentation artifacts (architecture.md, requirements.md, design.md)
 * using configurable templates OR by linking existing files via symlinks.
 * Supports different template formats for each document type and file path linking.
 */

import { BaseToolHandler } from './base-tool-handler.js';
import { stripVibePathSuffix } from '../server-helpers.js';
import { ProjectDocsManager } from '@codemcp/workflows-core';
import { TemplateOptions } from '@codemcp/workflows-core';
import { PathValidationUtils } from '@codemcp/workflows-core';
import { ServerContext } from '../types.js';

export interface SetupProjectDocsArgs {
  architecture: string; // Template name OR file path
  requirements: string; // Template name OR file path
  design: string; // Template name OR file path
  project_path?: string; // Optional project path override
}

export interface SetupProjectDocsResult {
  success: boolean;
  created: string[];
  linked: string[];
  skipped: string[];
  paths: {
    architecture: string;
    requirements: string;
    design: string;
  };
  message: string;
}

export class SetupProjectDocsHandler extends BaseToolHandler<
  SetupProjectDocsArgs,
  SetupProjectDocsResult
> {
  private projectDocsManager: ProjectDocsManager | null = null;

  private getProjectDocsManager(): ProjectDocsManager {
    if (!this.projectDocsManager) {
      this.projectDocsManager = new ProjectDocsManager(this.logger);
    }
    return this.projectDocsManager;
  }

  protected async executeHandler(
    args: SetupProjectDocsArgs,
    context: ServerContext
  ): Promise<SetupProjectDocsResult> {
    // Normalize project path - strip /.vibe suffix if present
    const projectPath = stripVibePathSuffix(
      args.project_path,
      context.projectPath || process.cwd()
    );

    const projectDocsManager = this.getProjectDocsManager();

    this.logger.info(
      'Setting up project docs with enhanced file linking support',
      { args, projectPath }
    );

    try {
      // Get available templates for validation
      const availableTemplates =
        await projectDocsManager.templateManager.getAvailableTemplates();

      // Validate and process each parameter
      const processedArgs = await this.validateAndProcessArgs(
        args,
        availableTemplates,
        projectPath
      );

      if (!processedArgs.success) {
        return {
          success: false,
          created: [],
          linked: [],
          skipped: [],
          paths: projectDocsManager.getDocumentPaths(projectPath),
          message: processedArgs.error || 'Unknown error during validation',
        };
      }

      // Create/link project documents
      if (!processedArgs.templateOptions || !processedArgs.filePaths) {
        throw new Error(
          'Invalid processed args: missing templateOptions or filePaths'
        );
      }

      const result = await projectDocsManager.createOrLinkProjectDocs(
        projectPath,
        processedArgs.templateOptions,
        processedArgs.filePaths
      );

      // Get document paths for response
      const paths = projectDocsManager.getDocumentPaths(projectPath);

      // Create success message
      let message = 'Project documentation setup completed.';
      if (result.created.length > 0) {
        message += ` Created: ${result.created.join(', ')}.`;
      }
      if (result.linked.length > 0) {
        message += ` Linked: ${result.linked.join(', ')}.`;
      }
      if (result.skipped.length > 0) {
        message += ` Skipped existing: ${result.skipped.join(', ')}.`;
      }

      this.logger.info('Project docs setup completed', {
        created: result.created,
        linked: result.linked,
        skipped: result.skipped,
        paths,
      });

      return {
        success: true,
        created: result.created,
        linked: result.linked,
        skipped: result.skipped,
        paths,
        message,
      };
    } catch (error) {
      this.logger.error('Failed to setup project docs', error as Error, {
        args,
        projectPath,
      });

      return {
        success: false,
        created: [],
        linked: [],
        skipped: [],
        paths: projectDocsManager.getDocumentPaths(projectPath),
        message: `Failed to setup project docs: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Validate and process arguments to determine templates vs file paths
   */
  private async validateAndProcessArgs(
    args: SetupProjectDocsArgs,
    availableTemplates: {
      architecture: string[];
      requirements: string[];
      design: string[];
    },
    projectPath: string
  ): Promise<{
    success: boolean;
    error?: string;
    templateOptions?: Partial<TemplateOptions>;
    filePaths?: Partial<{
      architecture: string;
      requirements: string;
      design: string;
    }>;
  }> {
    const templateOptions: Partial<TemplateOptions> = {};
    const filePaths: Partial<{
      architecture: string;
      requirements: string;
      design: string;
    }> = {};
    const errors: string[] = [];

    // Validate architecture parameter
    const archValidation = await PathValidationUtils.validateParameter(
      args.architecture,
      availableTemplates.architecture,
      projectPath
    );

    if (archValidation.isTemplate) {
      templateOptions.architecture = args.architecture;
    } else if (archValidation.isFilePath && archValidation.resolvedPath) {
      filePaths.architecture = archValidation.resolvedPath;
    } else {
      errors.push(`Architecture: ${archValidation.error}`);
    }

    // Validate requirements parameter
    const reqValidation = await PathValidationUtils.validateParameter(
      args.requirements,
      availableTemplates.requirements,
      projectPath
    );

    if (reqValidation.isTemplate) {
      templateOptions.requirements = args.requirements;
    } else if (reqValidation.isFilePath && reqValidation.resolvedPath) {
      filePaths.requirements = reqValidation.resolvedPath;
    } else {
      errors.push(`Requirements: ${reqValidation.error}`);
    }

    // Validate design parameter
    const designValidation = await PathValidationUtils.validateParameter(
      args.design,
      availableTemplates.design,
      projectPath
    );

    if (designValidation.isTemplate) {
      templateOptions.design = args.design;
    } else if (designValidation.isFilePath && designValidation.resolvedPath) {
      filePaths.design = designValidation.resolvedPath;
    } else {
      errors.push(`Design: ${designValidation.error}`);
    }

    if (errors.length > 0) {
      return {
        success: false,
        error: `Parameter validation failed:\n${errors.join('\n')}`,
      };
    }

    return {
      success: true,
      templateOptions,
      filePaths,
    };
  }
}

/**
 * Workflow Resource Handler
 *
 * Handles MCP resources for individual workflows, returning the raw YAML content
 * from workflow definition files.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger, type ILogger } from '@codemcp/workflows-core';
import {
  ResourceHandler,
  ServerContext,
  HandlerResult,
  ResourceContent,
} from '../types.js';
import { safeExecute } from '../server-helpers.js';

// Default logger for standalone use (MCP server mode)
const defaultLogger = createLogger('WorkflowResourceHandler');

/**
 * Resource handler for workflow:// URIs
 * Returns raw YAML content from workflow definition files
 */
export class WorkflowResourceHandler implements ResourceHandler {
  private logger: ILogger;

  constructor(logger?: ILogger) {
    this.logger = logger ?? defaultLogger;
  }

  async handle(
    uri: URL,
    context: ServerContext
  ): Promise<HandlerResult<ResourceContent>> {
    // Use context's loggerFactory if available
    if (context.loggerFactory) {
      this.logger = context.loggerFactory('WorkflowResourceHandler');
    }

    this.logger.debug('Processing workflow resource request', {
      uri: uri.href,
    });

    return safeExecute(async () => {
      // Extract workflow name from URI (workflow://workflow-name)
      const workflowName = uri.hostname;

      if (!workflowName) {
        throw new Error(
          'Invalid workflow URI: missing workflow name. Expected: workflow://workflow-name'
        );
      }

      this.logger.info('Loading workflow resource', {
        workflowName,
        uri: uri.href,
      });

      let yamlContent: string;
      let filePath: string;

      // Try to get workflow from workflow manager
      const workflow = context.workflowManager.getWorkflow(workflowName);
      if (!workflow) {
        throw new Error(`Workflow '${workflowName}' not found`);
      }

      // Handle predefined workflows
      // Get the workflows directory path - more reliable approach
      const currentFileUrl = import.meta.url;
      const currentFilePath = fileURLToPath(currentFileUrl);

      // Navigate from the compiled location to the package root
      // tsup bundles everything into dist/index.js, so we only need to go up 1 level from dist/
      let packageRoot: string;
      if (currentFilePath.includes('/dist/')) {
        // Running from compiled/bundled code - dist/index.js -> package root is 1 level up from dist/
        const distDir = path.dirname(currentFilePath);
        packageRoot = path.resolve(distDir, '..');
      } else {
        // Running from source (development) - src/resource-handlers/ -> package root is 2 levels up
        packageRoot = path.resolve(path.dirname(currentFilePath), '../../');
      }

      const workflowFile = path.join(
        packageRoot,
        'resources',
        'workflows',
        `${workflowName}.yaml`
      );

      if (!fs.existsSync(workflowFile)) {
        // Try .yml extension
        const workflowFileYml = path.join(
          packageRoot,
          'resources',
          'workflows',
          `${workflowName}.yml`
        );
        if (!fs.existsSync(workflowFileYml)) {
          // Log debug info to help troubleshoot
          this.logger.error(
            'Workflow file not found',
            new Error(`Workflow '${workflowName}' not found`),
            {
              workflowName,
              currentFilePath,
              packageRoot,
              workflowFile,
              workflowFileYml,
              workflowsDir: path.join(packageRoot, 'resources', 'workflows'),
              workflowsDirExists: fs.existsSync(
                path.join(packageRoot, 'resources', 'workflows')
              ),
            }
          );
          throw new Error(
            `Workflow '${workflowName}' not found in resources/workflows/`
          );
        }
        filePath = workflowFileYml;
      } else {
        filePath = workflowFile;
      }

      yamlContent = fs.readFileSync(filePath, 'utf-8');

      this.logger.info('Successfully loaded workflow resource', {
        workflowName,
        filePath,
        contentLength: yamlContent.length,
      });

      return {
        uri: uri.href,
        text: yamlContent,
        mimeType: 'application/x-yaml',
      };
    }, `Failed to load workflow resource: ${uri.href}`);
  }
}

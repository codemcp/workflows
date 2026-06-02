import { z } from 'zod';
import {
  SetupProjectDocsHandler,
  type ServerContext,
} from '@codemcp/workflows-server';
import type { ToolDefinition } from '../types.js';
import { tool } from './tool-helper.js';
import { handleMcpError, unwrapResult } from '../server-context.js';
import { createLogger, TemplateManager } from '@codemcp/workflows-core';

export async function createSetupProjectDocsTool(
  projectDir: string,
  getServerContext: () => Promise<ServerContext>
): Promise<ToolDefinition> {
  // Get available templates for description
  const templateManager = new TemplateManager();
  const availableTemplates = await templateManager.getAvailableTemplates();

  const archOptions = availableTemplates.architecture.join(', ');
  const reqOptions = availableTemplates.requirements.join(', ');
  const designOptions = availableTemplates.design.join(', ');

  return tool({
    description: `Create project docs with templates or link existing files. Options - architecture: ${archOptions}, none, or file path; requirements: ${reqOptions}, none, or file path; design: ${designOptions}, none, or file path`,
    args: {
      architecture: z
        .string()
        .default('freestyle')
        .describe('Template name, "none", or file path'),
      requirements: z
        .string()
        .default('none')
        .describe('Template name, "none", or file path'),
      design: z
        .string()
        .default('freestyle')
        .describe('Template name, "none", or file path'),
    },
    execute: async (args, _context) => {
      const serverContext = await getServerContext();
      const logger = serverContext.loggerFactory
        ? serverContext.loggerFactory('setup_project_docs')
        : createLogger('setup_project_docs');

      logger.debug('setup_project_docs called', args);

      try {
        // Delegate to SetupProjectDocsHandler
        const handler = new SetupProjectDocsHandler();
        const result = await handler.handle(
          {
            architecture: args.architecture,
            requirements: args.requirements,
            design: args.design,
            project_path: projectDir,
          },
          serverContext
        );

        // Handle errors gracefully
        const errorMsg = handleMcpError(result);
        if (errorMsg) {
          return errorMsg;
        }

        const data = unwrapResult(result);

        logger.info('setup_project_docs: Completed', {
          created: data.created,
          linked: data.linked,
          skipped: data.skipped,
        });

        // Build response
        const lines: string[] = [];
        lines.push(data.message);

        if (data.paths) {
          lines.push('');
          lines.push('Document paths:');
          lines.push(`  Architecture: ${data.paths.architecture}`);
          lines.push(`  Requirements: ${data.paths.requirements}`);
          lines.push(`  Design: ${data.paths.design}`);
        }

        return lines.join('\n');
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return `Error: ${errorMessage}`;
      }
    },
  });
}

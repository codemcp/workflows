#!/usr/bin/env node

/**
 * Vibe Feature MCP Server Entry Point
 *
 * Starts the MCP server with stdio transport for process-based usage.
 * The core server logic is in server.ts for better testability.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createResponsibleVibeMCPServer } from './server.js';

// Re-export for external use
export {
  ResponsibleVibeMCPServer,
  createResponsibleVibeMCPServer,
} from './server.js';

// Re-export tool handlers for external use (e.g., OpenCode plugin)
export * from './tool-handlers/index.js';

// Re-export types needed by external consumers
export type { ServerContext, HandlerResult } from './types.js';

// Re-export plugin system for external use (e.g., OpenCode plugin)
export { PluginRegistry } from './plugin-system/index.js';
export { BeadsPlugin } from './plugin-system/beads-plugin.js';
import { createLogger } from '@codemcp/workflows-core';

const logger = createLogger('Main');

/**
 * Parse command line arguments and handle special flags
 */
function parseCliArgs(): { shouldStartServer: boolean } {
  // Since routing is handled at root level, always start server when this module is loaded
  return { shouldStartServer: true };
}

/**
 * Main entry point for the MCP server process
 */
async function main() {
  // Parse CLI arguments first
  const { shouldStartServer } = parseCliArgs();

  // If special flags were handled, exit gracefully
  if (!shouldStartServer) {
    return;
  }

  // Normal MCP server startup
  try {
    const projectPath = process.env.PROJECT_PATH;

    // Create server instance with project path configuration
    const server = await createResponsibleVibeMCPServer({
      projectPath: projectPath,
    });

    // Initialize server
    await server.initialize();

    // Create stdio transport
    const transport = new StdioServerTransport();

    // Connect server to transport
    await server.getMcpServer().connect(transport);

    // Note: No logging here to ensure compatibility with Amazon Q CLI
    // Amazon Q CLI expects no logging notifications before MCP initialization completes

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down Vibe Feature MCP Server...');
      await server.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Shutting down Vibe Feature MCP Server...');
      await server.cleanup();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start server', error as Error);
    process.exit(1);
  }
}

// Export for explicit invocation by the CLI wrapper
export { main as startMcpServer };

// Start the server if this file is run directly
// More robust check that works with npx and direct execution
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('ade-workflows-server') ||
  process.argv[1]?.endsWith('index.js');

if (isMainModule) {
  await main().catch(error => {
    logger.error('Unhandled error in main', error);
    process.exit(1);
  });
}

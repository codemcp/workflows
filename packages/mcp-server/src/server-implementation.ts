/**
 * Refactored Vibe Feature MCP Server
 *
 * Main server orchestrator that brings together all the modular components.
 * This replaces the monolithic server.ts with a clean, modular architecture.
 */

import { registerLogSink, createLogger } from '@codemcp/workflows-core';
import { ServerConfig } from './types.js';
import {
  initializeServerComponents,
  registerMcpTools,
  ServerComponents,
} from './server-config.js';
import { createToolRegistry } from './tool-handlers/index.js';
import { createResponseRenderer } from './response-renderer.js';
import { createMcpLogSink } from './mcp-log-sink.js';
import type {
  ProceedToPhaseArgs,
  ProceedToPhaseResult,
  StartDevelopmentArgs,
  StartDevelopmentResult,
  ResumeWorkflowArgs,
  ResumeWorkflowResult,
  ResetDevelopmentArgs,
  ResetDevelopmentResult,
} from './tool-handlers/index.js';

const logger = createLogger('ResponsibleVibeMCPServer');

/**
 * Factory function to create a server with real components
 */
export async function createResponsibleVibeMCPServer(
  config: ServerConfig = {}
): Promise<ResponsibleVibeMCPServer> {
  const components = await initializeServerComponents(config);
  return new ResponsibleVibeMCPServer(config, components);
}

/**
 * Main server class that orchestrates all components
 * Can be used both as a standalone process and in-process for testing
 */
export class ResponsibleVibeMCPServer {
  private components: ServerComponents | null = null;

  constructor(
    private config: ServerConfig,
    private serverComponents: ServerComponents
  ) {
    logger.debug('ResponsibleVibeMCPServer created', {
      config: JSON.stringify(this.config),
    });
  }

  /**
   * Initialize the server and all its components
   */
  async initialize(): Promise<void> {
    logger.debug('Initializing ResponsibleVibeMCPServer');

    try {
      // Use injected components
      this.components = this.serverComponents;

      // Create registries and renderer
      const toolRegistry = createToolRegistry();
      const responseRenderer = createResponseRenderer();

      // Update components with registries and renderer
      this.components.toolRegistry = toolRegistry;
      this.components.responseRenderer = responseRenderer;

      // Register MCP log sink for log notifications
      registerLogSink(createMcpLogSink(this.components.mcpServer));

      // Register tools and resources with MCP server
      await registerMcpTools(
        this.components.mcpServer,
        toolRegistry,
        responseRenderer,
        this.components.context
      );
    } catch (error) {
      logger.error(
        'Failed to initialize ResponsibleVibeMCPServer',
        error as Error
      );
      throw error;
    }
  }

  /**
   * Get the underlying MCP server instance
   * This allows for both transport-based and direct testing
   */
  public getMcpServer() {
    if (!this.components) {
      throw new Error('Server not initialized. Call initialize() first.');
    }
    return this.components.mcpServer;
  }

  /**
   * Get project path
   */
  public getProjectPath(): string {
    if (!this.components) {
      throw new Error('Server not initialized. Call initialize() first.');
    }
    return this.components.context.projectPath;
  }

  /**
   * Get conversation manager (for testing)
   */
  public getConversationManager() {
    if (!this.components) {
      throw new Error('Server not initialized. Call initialize() first.');
    }
    return this.components.context.conversationManager;
  }

  /**
   * Get plan manager (for testing)
   */
  public getPlanManager() {
    if (!this.components) {
      throw new Error('Server not initialized. Call initialize() first.');
    }
    return this.components.context.planManager;
  }

  /**
   * Generic tool handler for test access — parameterised on tool name and return type
   */
  public async handleTool<T>(toolName: string, args: unknown): Promise<T> {
    if (!this.components) {
      throw new Error('Server not initialized. Call initialize() first.');
    }

    const handler = this.components.toolRegistry?.get(toolName);
    if (!handler) {
      throw new Error(`${toolName} handler not found`);
    }

    const result = await handler.handle(args, this.components.context);
    if (!result.success) {
      throw new Error(result.error || 'Handler execution failed');
    }

    return result.data as T;
  }

  /**
   * Direct access to tool handlers for testing
   */
  public async handleWhatsNext(args: unknown): Promise<unknown> {
    return this.handleTool<unknown>('whats_next', args);
  }

  /**
   * Direct access to tool handlers for testing
   */
  public async handleProceedToPhase(
    args: ProceedToPhaseArgs
  ): Promise<ProceedToPhaseResult> {
    return this.handleTool<ProceedToPhaseResult>('proceed_to_phase', args);
  }

  /**
   * Direct access to tool handlers for testing
   */
  public async handleStartDevelopment(
    args: StartDevelopmentArgs
  ): Promise<StartDevelopmentResult> {
    return this.handleTool<StartDevelopmentResult>('start_development', args);
  }

  /**
   * Direct access to tool handlers for testing
   */
  public async handleResumeWorkflow(
    args: ResumeWorkflowArgs
  ): Promise<ResumeWorkflowResult> {
    return this.handleTool<ResumeWorkflowResult>('resume_workflow', args);
  }

  /**
   * Direct access to tool handlers for testing
   */
  public async handleResetDevelopment(
    args: ResetDevelopmentArgs
  ): Promise<ResetDevelopmentResult> {
    return this.handleTool<ResetDevelopmentResult>('reset_development', args);
  }

  /**
   * Cleanup server resources
   */
  public async cleanup(): Promise<void> {
    logger.debug('Cleaning up server resources');

    if (this.components?.database) {
      await this.components.database.close();
    }

    logger.info('Server cleanup completed');
  }
}

// Export all types and utilities for external use
export * from './types.js';
export * from './server-helpers.js';
export * from './response-renderer.js';
export * from './tool-handlers/index.js';

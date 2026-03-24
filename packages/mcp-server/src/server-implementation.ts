/**
 * Refactored Vibe Feature MCP Server
 *
 * Main server orchestrator that brings together all the modular components.
 * This replaces the monolithic server.ts with a clean, modular architecture.
 */

import { setMcpServerForLogging, createLogger } from '@codemcp/workflows-core';
import { ServerConfig } from './types.js';
import {
  initializeServerComponents,
  registerMcpTools,
  registerMcpResources,
  ServerComponents,
} from './server-config.js';
import { createToolRegistry } from './tool-handlers/index.js';
import { createResourceRegistry } from './resource-handlers/index.js';
import { createResponseRenderer } from './response-renderer.js';
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
      const resourceRegistry = createResourceRegistry();
      const responseRenderer = createResponseRenderer();

      // Update components with registries and renderer
      this.components.toolRegistry = toolRegistry;
      this.components.resourceRegistry = resourceRegistry;
      this.components.responseRenderer = responseRenderer;

      // Register MCP server for logging notifications
      setMcpServerForLogging(this.components.mcpServer);

      // Register tools and resources with MCP server
      await registerMcpTools(
        this.components.mcpServer,
        toolRegistry,
        responseRenderer,
        this.components.context,
        this.config
      );

      registerMcpResources(
        this.components.mcpServer,
        resourceRegistry,
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
   * Direct access to tool handlers for testing
   */
  public async handleWhatsNext(args: unknown): Promise<unknown> {
    if (!this.components) {
      throw new Error('Server not initialized. Call initialize() first.');
    }

    const handler = this.components.toolRegistry.get('whats_next');
    if (!handler) {
      throw new Error('whats_next handler not found');
    }

    const result = await handler.handle(args, this.components.context);
    if (!result.success) {
      throw new Error(result.error || 'Handler execution failed');
    }

    return result.data;
  }

  /**
   * Direct access to tool handlers for testing
   */
  public async handleProceedToPhase(
    args: ProceedToPhaseArgs
  ): Promise<ProceedToPhaseResult> {
    if (!this.components) {
      throw new Error('Server not initialized. Call initialize() first.');
    }

    const handler = this.components.toolRegistry.get('proceed_to_phase');
    if (!handler) {
      throw new Error('proceed_to_phase handler not found');
    }

    const result = await handler.handle(args, this.components.context);
    if (!result.success) {
      throw new Error(result.error || 'Handler execution failed');
    }

    return result.data as ProceedToPhaseResult;
  }

  /**
   * Direct access to tool handlers for testing
   */
  public async handleStartDevelopment(
    args: StartDevelopmentArgs
  ): Promise<StartDevelopmentResult> {
    if (!this.components) {
      throw new Error('Server not initialized. Call initialize() first.');
    }

    const handler = this.components.toolRegistry.get('start_development');
    if (!handler) {
      throw new Error('start_development handler not found');
    }

    const result = await handler.handle(args, this.components.context);
    if (!result.success) {
      throw new Error(result.error || 'Handler execution failed');
    }

    return result.data as StartDevelopmentResult;
  }

  /**
   * Direct access to tool handlers for testing
   */
  public async handleResumeWorkflow(
    args: ResumeWorkflowArgs
  ): Promise<ResumeWorkflowResult> {
    if (!this.components) {
      throw new Error('Server not initialized. Call initialize() first.');
    }

    const handler = this.components.toolRegistry.get('resume_workflow');
    if (!handler) {
      throw new Error('resume_workflow handler not found');
    }

    const result = await handler.handle(args, this.components.context);
    if (!result.success) {
      throw new Error(result.error || 'Handler execution failed');
    }

    return result.data as ResumeWorkflowResult;
  }

  /**
   * Direct access to tool handlers for testing
   */
  public async handleResetDevelopment(
    args: ResetDevelopmentArgs
  ): Promise<ResetDevelopmentResult> {
    if (!this.components) {
      throw new Error('Server not initialized. Call initialize() first.');
    }

    const handler = this.components.toolRegistry.get('reset_development');
    if (!handler) {
      throw new Error('reset_development handler not found');
    }

    const result = await handler.handle(args, this.components.context);
    if (!result.success) {
      throw new Error(result.error || 'Handler execution failed');
    }

    return result.data as ResetDevelopmentResult;
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
export * from './resource-handlers/index.js';

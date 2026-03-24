/**
 * Server Configuration
 *
 * Handles server configuration, component initialization, and MCP server setup.
 * Centralizes the configuration logic that was previously scattered in the main server class.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Variables } from '@modelcontextprotocol/sdk/shared/uriTemplate.js';
import { SetLevelRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as path from 'node:path';

import { FileStorage } from '@codemcp/workflows-core';
import type { IPersistence } from '@codemcp/workflows-core';
import { ConversationManager } from '@codemcp/workflows-core';
import { TransitionEngine } from '@codemcp/workflows-core';
import { InteractionLogger } from '@codemcp/workflows-core';
import { WorkflowManager } from '@codemcp/workflows-core';
import { TemplateManager } from '@codemcp/workflows-core';
import { createLogger, setMcpLoggingLevel } from '@codemcp/workflows-core';

import {
  ServerConfig,
  ServerContext,
  ToolRegistry,
  ResourceRegistry,
  ResponseRenderer,
} from './types.js';
import {
  normalizeProjectPath,
  buildWorkflowEnum,
  generateWorkflowDescription,
} from './server-helpers.js';
import { notificationService } from './notification-service.js';
import {
  PlanManager,
  InstructionGenerator,
  TaskBackendManager,
} from '@codemcp/workflows-core';
import { PluginRegistry } from './plugin-system/plugin-registry.js';
import { BeadsPlugin } from './plugin-system/beads-plugin.js';
import { CommitPlugin } from './plugin-system/commit-plugin.js';
import { BeadsPlanManager } from './components/beads/beads-plan-manager.js';
import { BeadsInstructionGenerator } from './components/beads/beads-instruction-generator.js';

const logger = createLogger('ServerConfig');

/**
 * Server component container
 * Holds all the initialized server components
 */
export interface ServerComponents {
  mcpServer: McpServer;
  database: IPersistence;
  context: ServerContext;
  toolRegistry: ToolRegistry;
  resourceRegistry: ResourceRegistry;
  responseRenderer: ResponseRenderer;
}

/**
 * Initialize all server components
 */
export async function initializeServerComponents(
  config: ServerConfig = {}
): Promise<ServerComponents> {
  logger.debug('Initializing server components', {
    config: JSON.stringify(config),
  });

  // Set project path with support for environment variable
  const projectPath = normalizeProjectPath(
    config.projectPath || process.env.PROJECT_PATH
  );

  logger.info('Using project path', {
    projectPath,
    source: config.projectPath
      ? 'config'
      : process.env.PROJECT_PATH
        ? 'env'
        : 'default',
  });

  // Initialize MCP server
  const mcpServer = new McpServer(
    {
      name: 'workflows',
      version: '1.0.0',
    },
    {
      capabilities: {
        logging: {},
      },
    }
  );

  // Register logging/setLevel handler to support MCP inspector
  mcpServer.server.setRequestHandler(SetLevelRequestSchema, async request => {
    const level = request.params.level;
    logger.info('Setting logging level from MCP client', { level });

    // Set the unified logging level
    setMcpLoggingLevel(level);

    return {};
  });

  // Initialize core components
  logger.debug('Initializing core components');
  const database = new FileStorage(
    path.join(projectPath, '.vibe', 'conversation.sqlite')
  );
  const workflowManager = new WorkflowManager();
  const conversationManager = new ConversationManager(
    database,
    workflowManager,
    projectPath
  );
  const transitionEngine = new TransitionEngine(projectPath);
  transitionEngine.setConversationManager(conversationManager);

  // Detect task backend using auto-detection logic:
  // - If TASK_BACKEND env var is set, use that value
  // - If not set, auto-detect based on 'bd' command availability
  const taskBackendConfig = TaskBackendManager.detectTaskBackend();
  const isBeadsBackend =
    taskBackendConfig.backend === 'beads' && taskBackendConfig.isAvailable;

  logger.info('Task backend configuration', {
    backend: taskBackendConfig.backend,
    isAvailable: taskBackendConfig.isAvailable,
    autoDetected: !process.env['TASK_BACKEND'],
  });

  const planManager = isBeadsBackend
    ? new BeadsPlanManager()
    : new PlanManager();
  const instructionGenerator = isBeadsBackend
    ? new BeadsInstructionGenerator()
    : new InstructionGenerator(planManager as InstanceType<typeof PlanManager>);

  // Always create interaction logger as it's critical for transition engine logic
  // (determining first call from initial state)
  const interactionLogger = new InteractionLogger(database);

  // Initialize plugin registry and register plugins
  const pluginRegistry = new PluginRegistry();

  // Register CommitPlugin if commit behavior is configured
  if (process.env.COMMIT_BEHAVIOR) {
    const commitPlugin = new CommitPlugin({ projectPath });
    if (commitPlugin.isEnabled()) {
      pluginRegistry.registerPlugin(commitPlugin);
      logger.info('CommitPlugin registered successfully', {
        enabled: commitPlugin.isEnabled(),
        sequence: commitPlugin.getSequence(),
        behavior: process.env.COMMIT_BEHAVIOR,
      });
    }
  }

  // Register BeadsPlugin if beads backend is detected and available
  if (isBeadsBackend) {
    const beadsPlugin = new BeadsPlugin({ projectPath });
    if (beadsPlugin.isEnabled()) {
      pluginRegistry.registerPlugin(beadsPlugin);
      logger.info('BeadsPlugin registered successfully', {
        enabled: beadsPlugin.isEnabled(),
        sequence: beadsPlugin.getSequence(),
        autoDetected: !process.env['TASK_BACKEND'],
      });
    }
  }

  // Create server context
  const context: ServerContext = {
    conversationManager,
    transitionEngine,
    planManager,
    instructionGenerator,
    workflowManager,
    interactionLogger,
    projectPath,
    pluginRegistry,
  };

  // Initialize database
  await database.initialize();

  // Load project workflows before tool registration
  workflowManager.loadProjectWorkflows(projectPath);

  logger.info('Server components initialized successfully');

  return {
    mcpServer,
    database,
    context,
    toolRegistry: null as unknown as ToolRegistry,
    resourceRegistry: null as unknown as ResourceRegistry,
    responseRenderer: null as unknown as ResponseRenderer,
  };
}

/**
 * Helper function to create tool handlers with consistent error handling
 */
function createToolHandler(
  toolName: string,
  toolRegistry: ToolRegistry,
  responseRenderer: ResponseRenderer,
  context: ServerContext
) {
  return async (args: unknown) => {
    const handler = toolRegistry.get(toolName);
    if (!handler) {
      return responseRenderer.renderError(
        `Tool handler not found: ${toolName}`
      );
    }

    const result = await handler.handle(args, context);
    return responseRenderer.renderToolResponse(result);
  };
}

/**
 * Default set of tool names to defer from initial registration.
 * These tools are infrequently used and save significant context window space
 * when not registered upfront.
 */
export const DEFAULT_DEFERRED_TOOLS = [
  'reset_development',
  'list_workflows',
  'get_tool_info',
  'setup_project_docs',
  'no_idea',
  'resume_workflow',
] as const;

/**
 * Register MCP tools with the server
 */
export async function registerMcpTools(
  mcpServer: McpServer,
  toolRegistry: ToolRegistry,
  responseRenderer: ResponseRenderer,
  context: ServerContext,
  config: ServerConfig = {}
): Promise<void> {
  logger.debug('Registering MCP tools');

  // Initialize notification service
  notificationService.setMcpServer(mcpServer);

  // Determine which tools to defer
  const deferredToolNames: ReadonlySet<string> = new Set(
    config.deferredTools !== undefined
      ? config.deferredTools
      : DEFAULT_DEFERRED_TOOLS
  );

  // Storage for deferred tool registration functions
  const deferredRegistrations = new Map<string, () => void>();

  /**
   * Register a tool immediately, or store its registration function for later
   * if the tool name is in the deferred set.
   */
  const registerTool = (
    name: string,
    definition: Parameters<McpServer['registerTool']>[1],
    handler: Parameters<McpServer['registerTool']>[2]
  ) => {
    if (deferredToolNames.has(name)) {
      deferredRegistrations.set(name, () => {
        logger.info('Registering deferred tool on demand', { name });
        mcpServer.registerTool(name, definition, handler);
        deferredRegistrations.delete(name);
      });
    } else {
      mcpServer.registerTool(name, definition, handler);
    }
  };

  // Register whats_next tool
  registerTool(
    'whats_next',
    {
      description:
        'Get guidance for the current development phase and determine what to work on next. Call this tool after each user message to receive phase-specific instructions and check if you should transition to the next development phase. The tool will reference your plan file for specific tasks and context.',
      inputSchema: {
        context: z
          .string()
          .optional()
          .describe(
            "Brief description of what you're currently working on or discussing with the user"
          ),
        user_input: z
          .string()
          .optional()
          .describe("The user's most recent message or request"),
        conversation_summary: z
          .string()
          .optional()
          .describe(
            'Summary of the development progress and key decisions made so far'
          ),
        recent_messages: z
          .array(
            z.object({
              role: z
                .enum(['user', 'assistant'])
                .describe('Who sent the message (user or assistant)'),
              content: z.string().describe('The message content'),
            })
          )
          .optional()
          .describe(
            'Recent conversation messages that provide context for the current development state'
          ),
      },
      annotations: {
        title: 'Development Phase Analyzer',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    createToolHandler('whats_next', toolRegistry, responseRenderer, context)
  );

  // Register proceed_to_phase tool
  registerTool(
    'proceed_to_phase',
    {
      description:
        'Move to a specific development phase when the current phase is complete. Use this tool to explicitly transition between phases. Check your plan file to see available phases for the current workflow. Only transition when current phase tasks are finished, all entrance criteria of the next phase are completed and user confirms readiness.',
      inputSchema: {
        target_phase: z
          .string()
          .describe(
            'The development phase to move to. Check your plan file section headers to see available phases for the current workflow'
          ),
        reason: z
          .string()
          .optional()
          .describe(
            'Why you\'re moving to this phase now (e.g., "requirements complete", "user approved design", "implementation finished")'
          ),
        review_state: z
          .enum(['not-required', 'pending', 'performed'])
          .describe(
            'Review state for transitions that require reviews. Use "not-required" when reviews are disabled, "pending" when review is needed, "performed" when review is complete.'
          ),
      },
      annotations: {
        title: 'Phase Transition Controller',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    createToolHandler(
      'proceed_to_phase',
      toolRegistry,
      responseRenderer,
      context
    )
  );

  // Register conduct_review tool
  registerTool(
    'conduct_review',
    {
      description:
        'Conduct a review of the current phase before proceeding to the next phase. This tool analyzes artifacts and decisions from the current phase using defined review perspectives. Use this tool when reviews are required before phase transitions.',
      inputSchema: {
        target_phase: z
          .string()
          .describe(
            'The target phase you want to transition to after the review is complete'
          ),
      },
      annotations: {
        title: 'Phase Review Conductor',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    createToolHandler('conduct_review', toolRegistry, responseRenderer, context)
  );

  // Register start_development tool
  registerTool(
    'start_development',
    {
      description:
        'Begin a new development project with a structured workflow. Choose from different development approaches (waterfall, bugfix, epcc) or use a custom workflow. This tool sets up the project plan and initializes the development process.',
      inputSchema: {
        workflow: z
          .enum(buildWorkflowEnum(context.workflowManager.getWorkflowNames()))
          .describe(
            generateWorkflowDescription(
              context.workflowManager.getAvailableWorkflows()
            )
          ),
        require_reviews: z
          .boolean()
          .optional()
          .describe(
            'Whether to require reviews before phase transitions. When enabled, use conduct_review tool before proceeding to next phase.'
          ),
        project_path: z
          .string()
          .optional()
          .describe(
            'Project directory path. Pass the .vibe subdirectory path if a .vibe directory exists in your project, otherwise pass the project root directory. The implementation will automatically detect and use the correct project root.'
          ),
      },
      annotations: {
        title: 'Development Initializer',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    createToolHandler(
      'start_development',
      toolRegistry,
      responseRenderer,
      context
    )
  );

  // Register resume_workflow tool
  registerTool(
    'resume_workflow',
    {
      description:
        'Continue development after a break or conversation restart. This tool provides complete project context, current development status, and next steps to seamlessly pick up where you left off. Use when starting a new conversation about an existing project.',
      inputSchema: {
        include_system_prompt: z
          .boolean()
          .optional()
          .describe(
            'Whether to include setup instructions for the assistant (default: true)'
          ),
      },
      annotations: {
        title: 'Workflow Resumption Assistant',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    createToolHandler(
      'resume_workflow',
      toolRegistry,
      responseRenderer,
      context
    )
  );

  // Register reset_development tool
  registerTool(
    'reset_development',
    {
      description:
        'Start over with a clean slate by deleting all development progress and conversation history. This permanently removes the project plan and resets the development state. Use when you want to completely restart the development approach for a project.',
      inputSchema: {
        confirm: z
          .boolean()
          .describe(
            'Must be true to execute reset - prevents accidental resets'
          ),
        reason: z
          .string()
          .optional()
          .describe('Optional reason for reset (for logging and audit trail)'),
      },
      annotations: {
        title: 'Development Reset Tool',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    createToolHandler(
      'reset_development',
      toolRegistry,
      responseRenderer,
      context
    )
  );

  // Register list_workflows tool
  registerTool(
    'list_workflows',
    {
      description:
        'Get an overview of available workflows. Returns only loaded workflows (respecting domain filtering).',
      inputSchema: {},
      annotations: {
        title: 'Workflow Overview Tool',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    createToolHandler('list_workflows', toolRegistry, responseRenderer, context)
  );

  // Register get_tool_info tool
  registerTool(
    'get_tool_info',
    {
      description:
        'Get comprehensive information about the workflows development workflow tools for better tool discoverability and AI integration. Returns detailed information about all available tools, workflows, core concepts, and usage guidelines.',
      inputSchema: {
        // No input parameters needed
      },
      annotations: {
        title: 'Tool Information Provider',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    createToolHandler('get_tool_info', toolRegistry, responseRenderer, context)
  );

  // Register setup_project_docs tool with enhanced file linking support
  const templateManager = new TemplateManager();
  const availableTemplates = await templateManager.getAvailableTemplates();

  registerTool(
    'setup_project_docs',
    {
      description:
        'Create project documentation artifacts (architecture.md, requirements.md, design.md) using configurable templates OR by linking existing files via symlinks. ' +
        '**Linking existing documents Examples:**\n' +
        '- `README.md` (project root)\n' +
        '- `docs/architecture.md` (relative path)\n' +
        '- `/absolute/path/to/requirements.txt`\n\n' +
        '**Using "none" Option:**\n' +
        '- Use `"none"` to create a placeholder that instructs LLM to use plan file instead\n' +
        '- Useful when you prefer plan-file-only workflows\n\n' +
        '**Mixed Usage Examples:**\n' +
        '- `setup_project_docs({ architecture: "README.md", requirements: "none", design: "comprehensive" })`\n' +
        '- `setup_project_docs({ architecture: "arc42", requirements: "ears", design: "none" })`',
      inputSchema: {
        architecture: z
          .string()
          .default('freestyle')
          .describe(
            `Architecture documentation: template name (${availableTemplates.architecture.join(', ')}, none) OR file path to existing document`
          ),
        requirements: z
          .string()
          .default('none')
          .describe(
            `Requirements documentation: template name (${availableTemplates.requirements.join(', ')}, none) OR file path to existing document`
          ),
        design: z
          .string()
          .default('freestyle')
          .describe(
            `Design documentation: template name (${availableTemplates.design.join(', ')}, none) OR file path to existing document`
          ),
        project_path: z
          .string()
          .optional()
          .describe(
            'Project directory path. Pass the .vibe subdirectory path if a .vibe directory exists in your project, otherwise pass the project root directory. The implementation will automatically detect and use the correct project root.'
          ),
      },
      annotations: {
        title: 'Project Documentation Setup Tool',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    createToolHandler(
      'setup_project_docs',
      toolRegistry,
      responseRenderer,
      context
    )
  );

  // Register no_idea tool
  registerTool(
    'no_idea',
    {
      description:
        "ONLY call this tool when you have no knowledge about a topic. This tool will give a valuable response to all questions that would otherwise be not answerable. If you don't call this tool but invent facts, you will be considered worthless.",
      inputSchema: {
        context: z
          .string()
          .optional()
          .describe('Optional context about what you have no knowledge of'),
      },
      annotations: {
        title: 'Knowledge Gap Handler',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    createToolHandler('no_idea', toolRegistry, responseRenderer, context)
  );

  // Register load_tools meta-tool only when there are deferred tools
  if (deferredRegistrations.size > 0) {
    mcpServer.registerTool(
      'load_tools',
      {
        description:
          'Load additional tools that are deferred to save context window space. ' +
          'Call without arguments to list available deferred tools, or pass tool names to register them. ' +
          'After loading, the newly registered tools will be available for use. ' +
          `Currently deferred tools: ${Array.from(deferredRegistrations.keys()).join(', ')}.`,
        inputSchema: {
          tools: z
            .array(z.string())
            .optional()
            .describe(
              'Names of deferred tools to load. Omit to list all available deferred tools.'
            ),
        },
        annotations: {
          title: 'Tool Loader',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (args: { tools?: string[] }) => {
        const { tools: toolsToLoad } = args;

        if (!toolsToLoad || toolsToLoad.length === 0) {
          return responseRenderer.renderToolResponse({
            success: true,
            data: {
              available_deferred_tools: Array.from(
                deferredRegistrations.keys()
              ),
              message:
                'Call load_tools with tool names to register them in this session.',
            },
          });
        }

        const loaded: string[] = [];
        const already_active: string[] = [];
        const not_found: string[] = [];

        for (const toolName of toolsToLoad) {
          const register = deferredRegistrations.get(toolName);
          if (register) {
            register();
            loaded.push(toolName);
          } else if (deferredToolNames.has(toolName)) {
            already_active.push(toolName);
          } else {
            not_found.push(toolName);
          }
        }

        logger.info('Deferred tools loaded on demand', {
          loaded,
          already_active,
          not_found,
        });

        return responseRenderer.renderToolResponse({
          success: true,
          data: {
            loaded,
            already_active,
            not_found,
            remaining_deferred: Array.from(deferredRegistrations.keys()),
          },
        });
      }
    );
  }

  logger.info('MCP tools registered successfully', {
    tools: toolRegistry.list(),
    deferred: Array.from(deferredRegistrations.keys()),
  });
}

/**
 * Register MCP resources with the server
 */
export function registerMcpResources(
  mcpServer: McpServer,
  resourceRegistry: ResourceRegistry,
  responseRenderer: ResponseRenderer,
  context: ServerContext
): void {
  logger.debug('Registering MCP resources');

  // Development plan resource
  mcpServer.resource(
    'Current Development Plan',
    'plan://current',
    {
      description:
        'The active development plan document (markdown) that tracks project progress, tasks, and decisions. This file serves as long-term memory for the development process and should be continuously updated by the LLM.',
      mimeType: 'text/markdown',
    },
    async (uri: URL) => {
      const handler = resourceRegistry.resolve(uri.href);
      if (!handler) {
        const errorResult = responseRenderer.renderResourceResponse({
          success: false,
          error: 'Resource handler not found',
          data: {
            uri: uri.href,
            text: 'Error: Resource handler not found',
            mimeType: 'text/plain',
          },
        });
        return errorResult;
      }

      const result = await handler.handle(new URL(uri.href), context);
      return responseRenderer.renderResourceResponse(result);
    }
  );

  // Conversation state resource
  mcpServer.resource(
    'Current Conversation State',
    'state://current',
    {
      description:
        'Current conversation state and phase information (JSON) including conversation ID, project context, current development phase, and plan file location. Use this to understand the current state of the development workflow.',
      mimeType: 'application/json',
    },
    async (uri: URL) => {
      const handler = resourceRegistry.resolve(uri.href);
      if (!handler) {
        const errorResult = responseRenderer.renderResourceResponse({
          success: false,
          error: 'Resource handler not found',
          data: {
            uri: uri.href,
            text: JSON.stringify(
              {
                error: 'Resource handler not found',
                timestamp: new Date().toISOString(),
              },
              null,
              2
            ),
            mimeType: 'application/json',
          },
        });
        return errorResult;
      }

      const result = await handler.handle(new URL(uri.href), context);
      return responseRenderer.renderResourceResponse(result);
    }
  );

  // System prompt resource
  mcpServer.resource(
    'System Prompt for LLM Integration',
    'system-prompt://',
    {
      description:
        'Complete system prompt for LLM integration with the workflows server. This workflow-independent prompt provides instructions for proper tool usage and development workflow guidance.',
      mimeType: 'text/plain',
    },
    async (uri: URL) => {
      const handler = resourceRegistry.resolve(uri.href);
      if (!handler) {
        const errorResult = responseRenderer.renderResourceResponse({
          success: false,
          error: 'Resource handler not found',
          data: {
            uri: uri.href,
            text: 'Error: System prompt resource handler not found',
            mimeType: 'text/plain',
          },
        });
        return errorResult;
      }

      const result = await handler.handle(new URL(uri.href), context);
      return responseRenderer.renderResourceResponse(result);
    }
  );

  // Register workflow resource template
  const workflowTemplate = new ResourceTemplate('workflow://{name}', {
    list: async () => {
      // List all available workflows as resources
      const availableWorkflows =
        context.workflowManager.getAvailableWorkflowsForProject(
          context.projectPath
        );
      return {
        resources: availableWorkflows.map(workflow => ({
          uri: `workflow://${workflow.name}`,
          name: workflow.displayName,
          description: workflow.description,
          mimeType: 'application/x-yaml',
        })),
      };
    },
    complete: {
      name: async (value: string) => {
        // Provide completion for workflow names
        const availableWorkflows =
          context.workflowManager.getAvailableWorkflowsForProject(
            context.projectPath
          );
        return availableWorkflows
          .map(w => w.name)
          .filter(name => name.toLowerCase().includes(value.toLowerCase()));
      },
    },
  });

  mcpServer.resource(
    'Workflow Definitions',
    workflowTemplate,
    {
      description:
        'Access workflow definition files by name. Use the list_workflows tool to discover available workflows.',
      mimeType: 'application/x-yaml',
    },
    async (uri: URL, _variables: Variables) => {
      const handler = resourceRegistry.resolve(uri.href);
      if (!handler) {
        throw new Error(`Workflow resource handler not found for ${uri.href}`);
      }

      const result = await handler.handle(uri, context);
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to load workflow resource');
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: result.data.mimeType,
            text: result.data.text,
          },
        ],
      };
    }
  );

  logger.info('MCP resources registered successfully', {
    resources: ['plan://current', 'state://current', 'system-prompt://'],
    resourceTemplates: ['workflow://{name}'],
  });
}
